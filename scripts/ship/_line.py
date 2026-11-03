"""Print exact (untruncated) source lines: _line.py <path> <n> [n2 n3 ...]

Path may be repo-relative or absolute. Lines are 1-based. Used to verify what a long
minified-ish line actually contains when a grep excerpt is truncated.
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

if len(sys.argv) < 3:
    print("usage: _line.py <path> <n> [n2 ...]")
    sys.exit(2)

target = sys.argv[1]
if not os.path.isabs(target):
    target = os.path.join(ROOT, target)

with open(target, "r", encoding="utf-8", errors="replace") as fh:
    lines = fh.read().split("\n")

print("%s (%d lines)" % (target, len(lines)))
for arg in sys.argv[2:]:
    n = int(arg)
    if 1 <= n <= len(lines):
        print("\n--- line %d (%d chars) ---" % (n, len(lines[n - 1])))
        print(lines[n - 1])
    else:
        print("\n--- line %d OUT OF RANGE ---" % n)
