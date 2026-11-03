"""Read a session's final answer (works for plan nodes and plain spawned agents).

Usage:
  python scripts/ship/_read_session.py <session_id_or_prefix>            # final assistant message
  python scripts/ship/_read_session.py <session_id_or_prefix> --all      # every assistant message
  python scripts/ship/_read_session.py <session_id_or_prefix> --roles    # role/len summary
"""
import json
import os
import sys

HOME = os.path.expanduser("~")
SESS = os.path.join(HOME, ".jcode", "sessions")


def resolve(key):
    if not os.path.isdir(SESS):
        return None
    files = [f for f in os.listdir(SESS) if key in f and (f.endswith(".journal.jsonl") or f.endswith(".json"))]
    if not files:
        return None
    journals = [f for f in files if f.endswith(".journal.jsonl")]
    pool = journals or files
    for f in pool:
        stem = f[: -len(".journal.jsonl")] if f.endswith(".journal.jsonl") else f[: -len(".json")]
        if stem == key:
            return f
    return sorted(pool, key=len)[0]


def load_messages(fname):
    path = os.path.join(SESS, fname)
    msgs = []
    if fname.endswith(".json"):
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            rec = json.load(fh)
        for m in rec.get("messages") or []:
            c = m.get("content")
            if isinstance(c, list):
                parts = []
                for seg in c:
                    if isinstance(seg, dict):
                        parts.append(str(seg.get("text") or seg.get("content") or ""))
                    else:
                        parts.append(str(seg))
                c = "".join(parts)
            role = m.get("role") or m.get("display_role")
            msgs.append({"role": role, "content": c or "", "ts": m.get("timestamp")})
        return path, msgs
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        for ln in fh:
            ln = ln.strip()
            if not ln:
                continue
            try:
                rec = json.loads(ln)
            except Exception:
                continue
            for m in rec.get("append_messages") or []:
                c = m.get("content")
                if isinstance(c, list):
                    parts = []
                    for seg in c:
                        if isinstance(seg, dict):
                            parts.append(str(seg.get("text") or seg.get("content") or ""))
                        else:
                            parts.append(str(seg))
                    c = "".join(parts)
                msgs.append({"role": m.get("role"), "content": c or "", "ts": m.get("timestamp")})
    return path, msgs


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    key = sys.argv[1]
    fname = resolve(key)
    if not fname:
        print(f"no journal matching {key!r}")
        return 1
    path, msgs = load_messages(fname)
    sid = fname[: -len(".journal.jsonl")] if fname.endswith(".journal.jsonl") else fname[: -len(".json")]
    print(f"session: {sid}")
    print(f"journal: {path}")
    print(f"messages: {len(msgs)}")
    if "--roles" in sys.argv:
        for i, m in enumerate(msgs):
            print(f"  {i:>3} {m['role']:<10} len={len(m['content'])}")
        return 0
    assistants = [m for m in msgs if m["role"] == "assistant" and m["content"].strip()]
    if "--all" in sys.argv:
        for m in assistants:
            print("\n" + "=" * 70)
            print(m["content"])
        return 0
    if "--idx" in sys.argv:
        i = int(sys.argv[sys.argv.index("--idx") + 1])
        print(f"(assistant messages: {len(assistants)})")
        if i < 0:
            i += len(assistants)
        print("=" * 70)
        print(assistants[i]["content"])
        return 0
    if not assistants:
        print("(no assistant messages)")
        return 1
    print("=" * 70)
    print(assistants[-1]["content"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
