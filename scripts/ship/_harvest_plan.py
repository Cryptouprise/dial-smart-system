"""Harvest swarm plan node artifacts from the jcode swarm state file.

Usage:
  python scripts/ship/_harvest_plan.py --keys
  python scripts/ship/_harvest_plan.py --list
  python scripts/ship/_harvest_plan.py --dump docs/_swarm/artifacts.json
  python scripts/ship/_harvest_plan.py --show <node_id>
"""
import argparse
import json
import os
import sys

PLAN = os.path.join(os.environ.get("USERPROFILE", r"C:\Users\charl"),
                    ".jcode", "state", "swarm", "C__Users_charl.json")


def load():
    with open(PLAN, "r", encoding="utf-8") as fh:
        return json.load(fh)


def find_nodes(doc):
    """Return {id: node} for every dict that looks like a plan node."""
    out = {}

    def walk(obj):
        if isinstance(obj, dict):
            nid = obj.get("id")
            if isinstance(nid, str) and ("status" in obj or "artifact" in obj or "content" in obj):
                out.setdefault(nid, obj)
            for v in obj.values():
                walk(v)
        elif isinstance(obj, list):
            for v in obj:
                walk(v)

    walk(doc)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--keys", action="store_true")
    ap.add_argument("--inspect", action="store_true")
    ap.add_argument("--fails", action="store_true")
    ap.add_argument("--running", action="store_true")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--dump")
    ap.add_argument("--show")
    args = ap.parse_args()

    doc = load()

    if args.inspect:
        plan = doc.get("plan", {})
        items = plan.get("items", [])
        meta = plan.get("node_meta", {})
        print("mode       :", plan.get("mode"), "version:", plan.get("version"))
        print("items      :", len(items))
        print("node_meta  :", type(meta).__name__, len(meta) if hasattr(meta, "__len__") else "")
        if items:
            print("\n--- items[0] keys:", list(items[0].keys()))
            print(json.dumps(items[0], indent=2)[:2500])
        if isinstance(meta, dict):
            for k in list(meta.keys())[:2]:
                print(f"\n--- node_meta[{k}] ---")
                print(json.dumps(meta[k], indent=2)[:2500])
        print("\n--- task_progress ---")
        print(json.dumps(plan.get("task_progress"), indent=2)[:2500])
        return 0

    if args.running:
        plan = doc.get("plan", {})
        live = [it for it in plan.get("items", []) if it.get("status") == "running"]
        print(f"running: {len(live)}")
        for it in live:
            print(f"  {it['id']:<34} {it.get('assigned_to')}")
        return 0

    if args.fails:
        plan = doc.get("plan", {})
        items = {it["id"]: it for it in plan.get("items", [])}
        meta = plan.get("node_meta", {})
        prog = plan.get("task_progress", {})

        origins = {}
        for nid, m in meta.items():
            origins.setdefault(m.get("origin", "?"), []).append(nid)
        print("origins:")
        for o, ids in sorted(origins.items(), key=lambda kv: -len(kv[1])):
            print(f"  {o:<10} {len(ids)}")

        print("\nseeds (origin=seed):")
        for nid in sorted(origins.get("seed", [])):
            print(f"  {nid:<30} {items.get(nid, {}).get('status')}")

        print("\nfailed nodes:")
        for nid, it in sorted(items.items()):
            if it.get("status") != "failed":
                continue
            cs = prog.get(nid, {}).get("checkpoint_summary", "")
            print(f"\n  {nid}\n    {str(cs)[:400]}")
        return 0

    if args.keys:
        print("top-level type:", type(doc).__name__)
        if isinstance(doc, dict):
            for k, v in doc.items():
                print(f"  {k}: {type(v).__name__}", end="")
                if isinstance(v, list):
                    print(f" len={len(v)}")
                elif isinstance(v, dict):
                    print(f" keys={list(v.keys())[:8]}")
                else:
                    print(f" = {str(v)[:80]}")
        return 0

    nodes = find_nodes(doc)
    print(f"plan file : {PLAN}")
    print(f"size      : {os.path.getsize(PLAN)} bytes")
    print(f"nodes     : {len(nodes)}")

    if args.show:
        n = nodes.get(args.show)
        if not n:
            print("node not found")
            return 1
        print(json.dumps(n, indent=2)[:12000])
        return 0

    by_status = {}
    for n in nodes.values():
        by_status.setdefault(str(n.get("status")), []).append(n)

    print("\nby status:")
    for s, lst in sorted(by_status.items(), key=lambda kv: -len(kv[1])):
        print(f"  {s:<12} {len(lst)}")

    arts = [n for n in nodes.values() if n.get("artifact")]
    print(f"\nnodes with artifact: {len(arts)}")

    if args.list:
        for nid, n in sorted(nodes.items()):
            a = n.get("artifact") or {}
            conf = a.get("confidence", "-")
            mark = "A" if a else " "
            print(f"  [{mark}] {str(n.get('status')):<10} {conf:<7} {nid}")
        return 0

    if args.dump:
        out = {}
        for nid, n in nodes.items():
            a = n.get("artifact")
            if not a:
                continue
            out[nid] = {
                "status": n.get("status"),
                "kind": n.get("kind"),
                "content": n.get("content"),
                "artifact": a,
            }
        os.makedirs(os.path.dirname(args.dump) or ".", exist_ok=True)
        with open(args.dump, "w", encoding="utf-8") as fh:
            json.dump(out, fh, indent=2, ensure_ascii=False)
        print(f"\nwrote {len(out)} artifacts -> {args.dump}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
