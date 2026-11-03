"""Harvest swarm node artifacts + reports from worker session files.

The plan state file stores only status/priority/assigned_to; the actual
findings live in each worker session's transcript. This pulls them out.

Usage:
  python scripts/ship/_harvest_reports.py --probe
  python scripts/ship/_harvest_reports.py --write
  python scripts/ship/_harvest_reports.py --show <node_id>
"""
import argparse
import json
import os
import re
import sys

HOME = os.environ.get("USERPROFILE", r"C:\Users\charl")
SESS = os.path.join(HOME, ".jcode", "sessions")
PLAN = os.path.join(HOME, ".jcode", "state", "swarm", "C__Users_charl.json")
OUT = os.path.join(HOME, "dial-smart-system", "docs", "_swarm")


def load_plan():
    with open(PLAN, "r", encoding="utf-8") as fh:
        return json.load(fh)


def _unwrap(doc):
    """Yield message dicts from a parsed journal line or session doc."""
    if isinstance(doc, list):
        for m in doc:
            yield m
        return
    if not isinstance(doc, dict):
        return
    for key in ("append_messages", "messages", "conversation", "history", "turns"):
        if isinstance(doc.get(key), list):
            for m in doc[key]:
                yield m
            return
    yield doc


def iter_messages(path):
    """Yield message dicts from a .json (list/dict) or .journal.jsonl file."""
    if path.endswith(".jsonl"):
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    doc = json.loads(line)
                except Exception:
                    continue
                for m in _unwrap(doc):
                    yield m
        return
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        try:
            doc = json.load(fh)
        except Exception:
            return
    for m in _unwrap(doc):
        yield m


def blocks_of(msg):
    """Yield (kind, name, payload) for tool uses in a message."""
    content = msg.get("content")
    if isinstance(content, list):
        for b in content:
            if isinstance(b, dict) and b.get("type") == "tool_use":
                yield b.get("name"), b.get("input") or {}
    elif isinstance(content, str):
        return
    # some shapes nest tool calls under 'tool_calls'
    for tc in msg.get("tool_calls") or []:
        fn = tc.get("function") or {}
        args = fn.get("arguments")
        if isinstance(args, str):
            try:
                args = json.loads(args)
            except Exception:
                args = {}
        yield fn.get("name"), args or {}


def harvest_session(sid):
    """Return (artifact, report_text, tldr, calls) for a session id."""
    for suffix in (".journal.jsonl", ".json", ".bak"):
        path = os.path.join(SESS, sid + suffix)
        if not os.path.exists(path):
            continue
        artifact = None
        report = None
        tldr = None
        calls = 0
        for msg in iter_messages(path):
            for name, inp in blocks_of(msg):
                if name != "swarm":
                    continue
                calls += 1
                action = inp.get("action")
                if action == "complete_node" and inp.get("artifact"):
                    artifact = inp["artifact"]
                elif action == "report":
                    report = inp.get("message") or report
                    tldr = inp.get("tldr") or tldr
        if artifact or report:
            return artifact, report, tldr, calls, path
    return None, None, None, 0, None


def safe(nid):
    return re.sub(r"[^A-Za-z0-9._-]", "_", nid)


def fmt_artifact(a):
    if not a:
        return ""
    lines = []
    f = a.get("findings")
    if isinstance(f, list):
        f = "\n".join(f"- {x}" for x in f)
    if f:
        lines.append("**Findings**\n\n" + str(f))
    for key in ("evidence", "validation", "open_questions", "edge_cases_considered",
                "what_i_did_not_check"):
        v = a.get(key)
        if not v:
            continue
        if isinstance(v, list):
            body = "\n".join(f"- {x}" for x in v)
        else:
            body = str(v)
        lines.append(f"**{key}**\n\n{body}")
    if a.get("confidence"):
        lines.append(f"**confidence**: {a['confidence']}")
    return "\n\n".join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--probe", action="store_true")
    ap.add_argument("--index", action="store_true")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--show")
    args = ap.parse_args()

    doc = load_plan()
    plan = doc["plan"]
    items = {it["id"]: it for it in plan.get("items", [])}

    if args.probe:
        for sid in ("session_pig_1793731387046_8c7ad6ff86620bb9",
                    "session_sloth_1793731528890_366c61954b37afe8"):
            a, r, t, c, p = harvest_session(sid)
            print(f"\n=== {sid}")
            print(f"  path={os.path.basename(p) if p else None} swarm_calls={c}")
            print(f"  artifact={'yes' if a else 'no'} keys={list(a.keys()) if a else []}")
            print(f"  report={'yes' if r else 'no'} len={len(r) if r else 0}")
            if a:
                print("  artifact sample:", json.dumps(a)[:600])
            if r:
                print("  report head:", r[:400].replace("\n", " "))
        return 0

    if args.show:
        it = items.get(args.show)
        if not it:
            print("no such node")
            return 1
        sid = it.get("assigned_to")
        a, r, t, c, p = harvest_session(sid) if sid else (None,) * 5
        print(f"node   : {args.show}  status={it.get('status')}  sid={sid}")
        if t:
            print(f"tldr   : {t}")
        if r:
            print("\n--- REPORT ---\n" + r)
        if a:
            print("\n--- ARTIFACT ---\n" + fmt_artifact(a))
        return 0

    if args.index:
        rows = []
        for nid, it in sorted(items.items()):
            sid = it.get("assigned_to")
            if not sid:
                continue
            a, r, t, c, p = harvest_session(sid)
            if not (a or r):
                continue
            conf = (a or {}).get("confidence", "-")
            head = (t or (r or "").strip().split("\n")[0] or "").strip()
            rows.append((nid, it.get("status"), conf, head[:190]))
        print(f"{len(rows)} harvested nodes\n")
        for nid, st, conf, head in rows:
            print(f"{nid:<34} {str(st)[:9]:<9} {conf:<7} {head}")
        return 0

    if args.write:
        os.makedirs(OUT, exist_ok=True)
        got = 0
        parts = []
        for nid, it in sorted(items.items()):
            sid = it.get("assigned_to")
            if not sid:
                continue
            a, r, t, c, p = harvest_session(sid)
            if not (a or r):
                continue
            got += 1
            md = [f"# {nid}", ""]
            md.append(f"- status: {it.get('status')}")
            if t:
                md.append(f"- tldr: {t}")
            md.append("")
            if r:
                md.append(r)
                md.append("")
            fa = fmt_artifact(a)
            if fa:
                md.append("## Artifact\n")
                md.append(fa)
            text = "\n".join(md)
            with open(os.path.join(OUT, safe(nid) + ".md"), "w", encoding="utf-8") as fh:
                fh.write(text)
            parts.append(text)
        combined = os.path.join(OUT, "ALL-REPORTS.md")
        with open(combined, "w", encoding="utf-8") as fh:
            fh.write("\n\n" + ("\n\n" + "=" * 78 + "\n\n").join(parts))
        print(f"harvested {got} nodes -> {OUT}")
        print(f"combined -> {combined} ({os.path.getsize(combined)} bytes)")
        return 0

    ap.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())
