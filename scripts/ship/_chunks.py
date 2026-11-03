"""Report the real built cost of a pack: its own chunks, and the biggest chunks overall.

Argument is a substring to match against asset names (default: DoorToDoor).
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ASSETS = os.path.join(ROOT, "dist", "assets")

if not os.path.isdir(ASSETS):
    print("no build present at %s" % ASSETS)
    sys.exit(1)

needle = (sys.argv[1] if len(sys.argv) > 1 else "DoorToDoor").lower()

rows = []
for name in os.listdir(ASSETS):
    p = os.path.join(ASSETS, name)
    if os.path.isfile(p):
        rows.append((os.path.getsize(p), name))

rows.sort(reverse=True)
total = sum(s for s, _ in rows)
print("dist/assets: %d files, %.2f MB total" % (len(rows), total / 1048576.0))

hits = [(s, n) for s, n in rows if needle in n.lower()]
print("\nmatching %r (%d files, %.2f MB):" % (needle, len(hits), sum(s for s, _ in hits) / 1048576.0))
for s, n in hits:
    print("  %9d  %6.1f KB  %s" % (s, s / 1024.0, n))

print("\nlargest 12 chunks overall:")
for s, n in rows[:12]:
    print("  %9d  %6.1f KB  %s" % (s, s / 1024.0, n))
