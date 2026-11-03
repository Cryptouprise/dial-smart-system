"""List a directory with real byte sizes: _dir.py <path> [substring-filter]
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

if len(sys.argv) < 2:
    print("usage: _dir.py <path> [filter]")
    sys.exit(2)

target = sys.argv[1]
if not os.path.isabs(target):
    target = os.path.join(ROOT, target)

needle = sys.argv[2].lower() if len(sys.argv) > 2 else None

rows = []
for name in sorted(os.listdir(target)):
    p = os.path.join(target, name)
    if os.path.isfile(p):
        rows.append((os.path.getsize(p), name))

if needle:
    rows = [(s, n) for s, n in rows if needle in n.lower()]

total = sum(s for s, _ in rows)
print("%s" % target)
for s, n in rows:
    print("  %10d  %8.1f KB  %s" % (s, s / 1024.0, n))
print("  %10d  %8.2f MB  TOTAL (%d files)" % (total, total / 1048576.0, len(rows)))
