"""List role=/aria- attributes in the vendored Door to Door app, with real line numbers.

Case-sensitive on purpose: we want the actual attribute spellings.
Argument (optional): substring to filter on, e.g. "role=" or "aria-label".
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
APP = os.path.join(ROOT, "src", "packs", "door_to_door", "app")

needle = sys.argv[1] if len(sys.argv) > 1 else None
KEYS = ("role=", "aria-", "tabindex")

for name in sorted(os.listdir(APP)):
    if not name.endswith((".html", ".js")):
        continue
    path = os.path.join(APP, name)
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        lines = fh.read().split("\n")
    hits = 0
    for i, line in enumerate(lines, 1):
        if any(k in line for k in KEYS):
            if needle and needle not in line:
                continue
            hits += 1
            print("%s:%d: %s" % (name, i, line.strip()[:150]))
    if hits:
        print("--- %s: %d hits" % (name, hits))
