"""Dump structure of a session journal: files, sizes, record keys, long fields.

Usage: python scripts/ship/_jinfo.py <session_id_prefix> [--last N]
"""
import json
import os
import sys

HOME = os.path.expanduser("~")
SESS = os.path.join(HOME, ".jcode", "sessions")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    key = sys.argv[1]
    lastn = 3
    if "--last" in sys.argv:
        lastn = int(sys.argv[sys.argv.index("--last") + 1])
    files = sorted(f for f in os.listdir(SESS) if key in f)
    for f in files:
        p = os.path.join(SESS, f)
        size = os.path.getsize(p)
        with open(p, "r", encoding="utf-8", errors="replace") as fh:
            lines = fh.readlines()
        print(f"\n=== {f}  ({size} bytes, {len(lines)} lines)")
        for ln in lines[-lastn:]:
            try:
                rec = json.loads(ln)
            except Exception as e:
                print(f"  (unparsed: {e}) {ln[:200]}")
                continue
            print(f"  keys: {sorted(rec.keys())}")
            for k, v in rec.items():
                if isinstance(v, str) and len(v) > 120:
                    print(f"    [{k}] str len={len(v)} :: {v[:300]}")
                elif isinstance(v, list) and v:
                    print(f"    [{k}] list len={len(v)}")
                    for item in v[-2:]:
                        if isinstance(item, dict):
                            print(f"       item keys: {sorted(item.keys())}")
                            for ik, iv in item.items():
                                if isinstance(iv, str) and len(iv) > 120:
                                    print(f"         [{ik}] len={len(iv)} :: {iv[:300]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
