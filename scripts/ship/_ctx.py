"""show line context for each needle in a file.

usage: python scripts/ship/_ctx.py <file> <needle> [needle ...]
prints every line containing a needle, with 2 lines of context.
"""
import io
import os
import sys

if len(sys.argv) < 3:
    print(__doc__)
    sys.exit(2)

path = sys.argv[1]
needles = sys.argv[2:]
if not os.path.isabs(path):
    path = os.path.join(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')), path)

lines = io.open(path, 'r', encoding='utf-8', errors='replace').read().split('\n')

for needle in needles:
    print('=' * 70)
    print('NEEDLE %r in %s' % (needle, os.path.basename(path)))
    print('=' * 70)
    shown = set()
    for i, line in enumerate(lines):
        if needle in line:
            lo = max(0, i - 2)
            hi = min(len(lines), i + 3)
            for j in range(lo, hi):
                if j in shown:
                    continue
                shown.add(j)
                mark = '>>' if j == i else '  '
                print('%s %5d| %s' % (mark, j + 1, lines[j][:200]))
            print('  ---')
    if not shown:
        print('  (no hit)')
    print('')
