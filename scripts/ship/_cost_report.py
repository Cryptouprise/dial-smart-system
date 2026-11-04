"""Cost and model map for the review waves - where the money actually goes.

Parses the report headers written by wave_runner.py (which record the real token counts
and real cost OpenRouter charged), then joins them to live per-model prices.

Usage: python scripts/ship/_cost_report.py
"""
import json
import os
import re
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WAVES = os.path.join(ROOT, "docs", "_waves")

ROLE_MODELS = {
    "directed reviewer (1 per lane)": "deepseek/deepseek-v4.1-flash",
    "council reviewer A": "deepseek/deepseek-v4.1-flash",
    "council reviewer B": "qwen/qwen3.8-flash",
    "council reviewer C": "google/gemini-3.8-flash",
    "manager (default now)": "deepseek/deepseek-v4.1-flash",
    "manager (premium opt-in)": "z-ai/glm-5.3-prime",
    "old swarm worker": "mixed, 32-wide",
}


def key():
    k = os.environ.get("OPENROUTER_API_KEY")
    if k:
        return k
    p = os.path.join(os.path.expanduser("~"), ".mcp.json")
    if os.path.isfile(p):
        with open(p, "r", encoding="utf-8") as fh:
            txt = fh.read()
        m = re.search(r"sk-or-v1-[A-Za-z0-9]+", txt)
        if m:
            return m.group(0)
    return None


def prices(k):
    out = {}
    try:
        req = urllib.request.Request("https://openrouter.ai/api/v1/models",
                                     headers={"Authorization": "Bearer " + k})
        with urllib.request.urlopen(req, timeout=40) as r:
            d = json.loads(r.read().decode())
        for m in d.get("data", []):
            p = m.get("pricing") or {}
            try:
                out[m["id"]] = (float(p.get("prompt", 0)) * 1e6, float(p.get("completion", 0)) * 1e6)
            except Exception:
                pass
    except Exception as e:
        print(f"(price fetch failed: {e})")
    return out


HDR_COST = re.compile(r"cost: \$([0-9.]+)")
HDR_SPLIT = re.compile(r"\(reviewers \$([0-9.]+) \+ manager \$([0-9.]+)\)")
HDR_TOK = re.compile(r"^tokens: (\d+) in / (\d+) out")
HDR_REV = re.compile(r"^reviewers: (.+)$")
HDR_MODEL = re.compile(r"^lane: \S+\s+model: (\S+)")
HDR_MODE = re.compile(r"mode: (\w+)")


def parse(path):
    cost = tok_in = tok_out = None
    models = None
    mode = None
    split = None
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        for _ in range(14):
            ln = fh.readline()
            if not ln:
                break
            ln = ln.rstrip("\n")
            if cost is None and HDR_COST.search(ln):
                cost = float(HDR_COST.search(ln).group(1))
            if split is None and HDR_SPLIT.search(ln):
                g = HDR_SPLIT.search(ln).groups()
                split = (float(g[0]), float(g[1]))
            if tok_in is None and HDR_TOK.match(ln):
                g = HDR_TOK.match(ln).groups()
                tok_in, tok_out = int(g[0]), int(g[1])
            if models is None and HDR_REV.match(ln):
                models = HDR_REV.match(ln).group(1)
            if models is None and HDR_MODEL.match(ln):
                models = HDR_MODEL.match(ln).group(1)
            if mode is None and HDR_MODE.search(ln):
                mode = HDR_MODE.search(ln).group(1)
    return {"cost": cost, "in": tok_in, "out": tok_out, "models": models,
            "mode": mode, "split": split}


def main():
    k = key()
    pr = prices(k) if k else {}
    print("=" * 78)
    print("MODEL PRICES (USD per 1M tokens, live from OpenRouter)")
    print("=" * 78)
    seen = []
    for role, m in ROLE_MODELS.items():
        if m in seen or m not in pr:
            continue
        seen.append(m)
        pin, pout = pr[m]
        print(f"  {m:<34} in ${pin:>7.3f}   out ${pout:>8.3f}   {role}")
    for m in seen:
        pass
    print()
    print("=" * 78)
    print("WHAT EACH ROLE ACTUALLY COST (from the run headers, real charged amounts)")
    print("=" * 78)
    grand = 0.0
    for wave in sorted(os.listdir(WAVES)):
        d = os.path.join(WAVES, wave)
        if not os.path.isdir(d):
            continue
        print(f"\n  WAVE {wave}")
        wtotal = 0.0
        wmgr = 0.0
        wrev = 0.0
        for f in sorted(os.listdir(d)):
            if not f.endswith(".md"):
                continue
            info = parse(os.path.join(d, f))
            if info["cost"] is None:
                continue
            is_primary = "." not in f[: -len(".md")]
            wtotal += info["cost"]
            grand += info["cost"]
            if info["split"]:
                wrev += info["split"][0]
                wmgr += info["split"][1]
            elif not is_primary:
                wrev += info["cost"]
            tag = "reconciled" if is_primary else "reviewer"
            print(f"    {tag:<11} {f[:-3]:<46} ${info['cost']:>7.4f}"
                  f"  {info['in'] or 0:>7} in / {info['out'] or 0:>6} out  {info['models'] or ''}")
        print(f"    {'':<11} {'WAVE TOTAL':<46} ${wtotal:>7.4f}")
        if wmgr or wrev:
            pct = (100.0 * wmgr / wtotal) if wtotal else 0.0
            print(f"    {'':<11} {'  of which MANAGERS':<46} ${wmgr:>7.4f}   ({pct:.0f}% of the wave)")
            print(f"    {'':<11} {'  of which REVIEWERS':<46} ${wrev:>7.4f}   ({100 - pct:.0f}%)")
    print()
    print(f"  GRAND TOTAL across all waves: ${grand:.4f}")
    print()
    print("=" * 78)
    print("REFERENCE: the mechanism this replaced")
    print("=" * 78)
    print("  swarm task graph: 83 -> 460 nodes, about $7.00 per 25-minute burst,")
    print("  orphaned 4x by server reloads, about 19 hours of wall time lost.")
    print("  Per node it re-read a 149KB digest.")


if __name__ == "__main__":
    main()
