"""Bounded review wave runner - a better mechanism than the swarm graph.

WHY THIS EXISTS (evidenced 2026-11-03/04):
  * The swarm graph grew 83 -> 460 nodes and had no finish line, so cost was unpredictable.
  * Its driver lives inside the jcode server; a server reload orphaned it FOUR times and
    ~19 hours of wall time was silently lost.
  * 32-wide fan-out crashed the server; 4-wide was slow.
  * Every node re-read a 149KB digest, inflating cost per node.

HOW THIS FIXES IT:
  * A fixed lane list. The runner never invents new work, so cost is bounded and known.
  * It talks to OpenRouter directly, so it does NOT depend on the jcode server and cannot
    be orphaned by a reload.
  * It packs only the files and greps a lane declares, so prompts stay small.
  * Hard --budget-usd cap, checked from real token usage before each lane.
  * Idempotent: a lane whose output file exists is skipped, so a re-run resumes for free.

USAGE
  python scripts/ship/wave_runner.py docs/waves/<name>.json [--budget-usd 3] [--concurrency 6]
                                                          [--model M] [--dry-run] [--force]

LANE FILE FORMAT (JSON)
  {
    "name": "pipelines",
    "model": "deepseek/deepseek-v4.1-flash",
    "system": "optional shared instruction",
    "lanes": [
      {"id": "pipeline-engine",
       "title": "How does a lead move through a pipeline?",
       "question": "...the actual ask, be specific...",
       "files": ["src/lib/packs.ts", "supabase/functions/pipeline-management/index.ts"],
       "greps": [{"pattern": "lead_pipeline_positions", "path": "supabase/migrations", "ext": ".sql"}]}
    ]
  }
"""
import argparse
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
API = "https://openrouter.ai/api/v1/chat/completions"
MODELS_API = "https://openrouter.ai/api/v1/models"

DEFAULT_MODEL = "deepseek/deepseek-v4.1-flash"
MAX_FILE_BYTES = 45_000        # per file
MAX_TOTAL_BYTES = 260_000      # per lane prompt
MAX_GREP_HITS = 120

RULES = (
    "RULES: You are a read-only reviewer. You have been given file excerpts and search hits; "
    "you cannot run commands. Every claim must be FACT (cite file:line) or THEORY (say so). "
    "Never claim something is missing unless the supplied evidence shows it. "
    "State explicitly what you did NOT check. End with a confidence line: low, medium or high. "
    "Be concise and specific. Do not pad, do not restate the question, do not use filler."
)

_lock = threading.Lock()
_state = {"cost": 0.0, "done": 0, "failed": 0}


def load_key():
    k = os.environ.get("OPENROUTER_API_KEY")
    if k:
        return k
    # fall back to the MCP config the repo already uses
    p = os.path.join(os.path.expanduser("~"), ".mcp.json")
    if os.path.isfile(p):
        try:
            with open(p, "r", encoding="utf-8") as fh:
                data = json.load(fh)
        except Exception:
            return None
        found = []

        def walk(o):
            if isinstance(o, dict):
                for k2, v in o.items():
                    if isinstance(v, str) and v.startswith("sk-or-v1-"):
                        found.append(v)
                    else:
                        walk(v)
            elif isinstance(o, list):
                for v in o:
                    walk(v)

        walk(data)
        if found:
            return found[0]
    return None


def balance(key):
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/credits",
        headers={"Authorization": "Bearer " + key},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.loads(r.read().decode())
    return float(d["data"]["total_credits"]) - float(d["data"]["total_usage"])


def price_table(key):
    try:
        req = urllib.request.Request(MODELS_API, headers={"Authorization": "Bearer " + key})
        with urllib.request.urlopen(req, timeout=30) as r:
            d = json.loads(r.read().decode())
    except Exception:
        return {}
    out = {}
    for m in d.get("data", []):
        p = m.get("pricing") or {}
        try:
            out[m["id"]] = (float(p.get("prompt", 0)), float(p.get("completion", 0)))
        except Exception:
            pass
    return out


def pack_files(paths):
    chunks = []
    total = 0
    for rel in paths or []:
        p = rel if os.path.isabs(rel) else os.path.join(ROOT, rel)
        if not os.path.isfile(p):
            chunks.append(f"### {rel}\n(not found)")
            continue
        try:
            with open(p, "r", encoding="utf-8", errors="replace") as fh:
                text = fh.read(MAX_FILE_BYTES)
        except Exception as e:
            chunks.append(f"### {rel}\n(unreadable: {e})")
            continue
        if total + len(text) > MAX_TOTAL_BYTES:
            text = text[: max(0, MAX_TOTAL_BYTES - total)]
        total += len(text)
        lines = text.split("\n")
        numbered = "\n".join(f"{i+1}| {ln}" for i, ln in enumerate(lines))
        chunks.append(f"### {rel}  ({len(lines)} lines shown)\n{numbered}")
    return "\n\n".join(chunks)


def run_greps(specs):
    out = []
    for g in specs or []:
        pat = g.get("pattern")
        if not pat:
            continue
        base = g.get("path") or "."
        ext = g.get("ext") or ""
        rx = re.compile(re.escape(pat))
        hits = []
        for dirpath, dirs, names in os.walk(os.path.join(ROOT, base)):
            dirs[:] = [d for d in dirs if d not in (".git", "node_modules", "dist", "build")]
            for n in names:
                if ext and not n.endswith(ext):
                    continue
                fp = os.path.join(dirpath, n)
                try:
                    with open(fp, "r", encoding="utf-8", errors="replace") as fh:
                        for i, ln in enumerate(fh, 1):
                            if rx.search(ln):
                                rel = os.path.relpath(fp, ROOT).replace("\\", "/")
                                hits.append(f"{rel}:{i}: {ln.strip()[:200]}")
                                if len(hits) >= MAX_GREP_HITS:
                                    break
                except Exception:
                    continue
                if len(hits) >= MAX_GREP_HITS:
                    break
            if len(hits) >= MAX_GREP_HITS:
                break
        out.append(f"### grep {pat!r} in {base} {ext or '(all)'}\n" + ("\n".join(hits) if hits else "(no hits)"))
    return "\n\n".join(out)


def call_model(key, model, prompt, system, prices, max_tokens=16000):
    body = {
        "model": model,
        "messages": ([{"role": "system", "content": system}] if system else [])
        + [{"role": "user", "content": prompt}],
        "max_tokens": max_tokens,
        "temperature": 0.2,
        "usage": {"include": True},
    }
    last = None
    for attempt in range(3):
        if attempt == 1:
            # some models are reasoning-first and return empty content when the token
            # budget is spent on reasoning; ask for the answer only on the retry.
            body["reasoning"] = {"exclude": True}
        if attempt == 2:
            body.pop("reasoning", None)
            body["max_tokens"] = max(max_tokens, 32000)
        data = json.dumps(body).encode()
        req = urllib.request.Request(
            API, data=data,
            headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=600) as r:
                d = json.loads(r.read().decode())
            msg = d["choices"][0]["message"]
            text = msg.get("content") or ""
            usage = d.get("usage") or {}
            cost = usage.get("cost")
            if cost is None:
                pin, pout = prices.get(model, (0.0, 0.0))
                cost = usage.get("prompt_tokens", 0) * pin + usage.get("completion_tokens", 0) * pout
            if not text.strip():
                last = f"empty content (finish_reason={d['choices'][0].get('finish_reason')})"
                time.sleep(2)
                continue
            return text, float(cost or 0.0), usage
        except urllib.error.HTTPError as e:
            last = f"HTTP {e.code}: {e.read().decode()[:300]}"
        except Exception as e:
            last = str(e)
        time.sleep(3 * (attempt + 1))
    raise RuntimeError(last)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("lanefile")
    ap.add_argument("--budget-usd", type=float, default=3.0)
    ap.add_argument("--concurrency", type=int, default=6)
    ap.add_argument("--model", default=None)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--min-balance", type=float, default=2.0)
    args = ap.parse_args()

    with open(args.lanefile, "r", encoding="utf-8") as fh:
        spec = json.load(fh)
    name = spec.get("name") or os.path.splitext(os.path.basename(args.lanefile))[0]
    model = args.model or spec.get("model") or DEFAULT_MODEL
    system = spec.get("system") or ""
    lanes = spec["lanes"]
    outdir = os.path.join(ROOT, "docs", "_waves", name)
    os.makedirs(outdir, exist_ok=True)

    key = load_key()
    if not key:
        print("ERROR: no OpenRouter key found (env OPENROUTER_API_KEY or ~/.mcp.json)")
        return 2
    bal = balance(key)
    prices = price_table(key)
    print(f"wave={name} model={model} lanes={len(lanes)} concurrency={args.concurrency}")
    print(f"balance=${bal:.2f} budget=${args.budget_usd:.2f} min_balance=${args.min_balance:.2f}")
    print(f"JCODE_PROGRESS {json.dumps({'percent': 0, 'current': 0, 'total': len(lanes), 'unit': 'lanes', 'message': 'starting'})}")

    todo = []
    for lane in lanes:
        path = os.path.join(outdir, lane["id"] + ".md")
        if os.path.isfile(path) and os.path.getsize(path) > 0 and not args.force:
            print(f"  skip (done): {lane['id']}")
            continue
        todo.append(lane)

    if args.dry_run:
        for lane in todo:
            files = pack_files(lane.get("files"))
            greps = run_greps(lane.get("greps"))
            print(f"  {lane['id']:<40} files={len(files):>7}B greps={len(greps):>7}B")
        print(f"dry run: {len(todo)} lane(s) would run")
        return 0

    sem = threading.Semaphore(args.concurrency)
    threads = []

    def worker(lane):
        with sem:
            with _lock:
                if _state["cost"] >= args.budget_usd:
                    print(f"  ABORT budget: {lane['id']}")
                    return
            files = pack_files(lane.get("files"))
            greps = run_greps(lane.get("greps"))
            prompt = (
                f"QUESTION: {lane.get('question') or lane.get('title')}\n\n"
                f"REPO: {ROOT} (Dial Smart / DoorBoss)\n\n"
                f"SUPPLIED EVIDENCE\n\n{files}\n\n{greps}\n\n{RULES}\n"
            )
            try:
                text, cost, usage = call_model(key, model, prompt, system, prices)
            except Exception as e:
                with _lock:
                    _state["failed"] += 1
                print(f"  FAIL {lane['id']}: {e}")
                return
            with _lock:
                _state["cost"] += cost
                _state["done"] += 1
                c, d = _state["cost"], _state["done"]
            header = (
                f"# {lane.get('title') or lane['id']}\n\n"
                f"lane: {lane['id']}  model: {model}  cost: ${cost:.4f}\n"
                f"tokens: {usage.get('prompt_tokens', 0)} in / {usage.get('completion_tokens', 0)} out\n"
                f"files: {', '.join(lane.get('files') or []) or '(none)'}\n\n---\n\n"
            )
            with open(os.path.join(outdir, lane["id"] + ".md"), "w", encoding="utf-8", newline="\n") as fh:
                fh.write(header + (text or "(empty response)") + "\n")
            print(f"JCODE_PROGRESS {json.dumps({'current': d, 'total': len(lanes), 'unit': 'lanes', 'message': f'cost ${c:.2f}'})}")

    for lane in todo:
        t = threading.Thread(target=worker, args=(lane,))
        t.start()
        threads.append(t)
    for t in threads:
        t.join()

    print(f"done={_state['done']} failed={_state['failed']} spent=${_state['cost']:.4f}")
    try:
        print(f"balance now ${balance(key):.2f}")
    except Exception:
        pass
    print(f"reports in {outdir}")
    return 0 if _state["failed"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
