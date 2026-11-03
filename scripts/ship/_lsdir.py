"""List directory entries matching a substring. Args: <dir> [fragment] [limit]"""
import os
import sys

d = sys.argv[1]
frag = sys.argv[2] if len(sys.argv) > 2 else ""
limit = int(sys.argv[3]) if len(sys.argv) > 3 else 200
hits = [n for n in sorted(os.listdir(d)) if frag in n]
print(f"dir={d} entries={len(os.listdir(d))} matching={len(hits)}")
for n in hits[:limit]:
    p = os.path.join(d, n)
    try:
        sz = os.path.getsize(p)
    except OSError:
        sz = -1
    print(f"  {sz:>10}  {n}")
