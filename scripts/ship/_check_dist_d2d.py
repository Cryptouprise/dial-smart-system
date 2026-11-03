"""Pre-publish check: does the LOCAL build artifact carry the Door to Door port?

Lovable rebuilds from `main` on its own infrastructure, so this is NOT proof of the deploy.
It is proof that the thing being deployed - the build of this source - really contains the
port, including the chunk the live verifier looks for. If this passes and the live verifier
still fails, the only remaining variable is the deploy itself.

Read-only. Exits 0 on ALL GOOD, 1 with a problem list otherwise.
"""

import glob
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DIST = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "dist")
if not os.path.isabs(DIST):
    DIST = os.path.join(ROOT, DIST)
ASSETS = os.path.join(DIST, "assets")

MARKERS = ("__D2D_HOST", "view-map", "pfBoard", "d2d-root")
problems = []


def check(ok, msg):
    print(("  OK   " if ok else "  FAIL ") + msg)
    if not ok:
        problems.append(msg)


print("dist = " + DIST)
if not os.path.isdir(ASSETS):
    print("  FAIL dist/assets does not exist - run `npm run build` first")
    sys.exit(1)


def read(path):
    with open(path, "r", encoding="utf-8", errors="replace") as handle:
        return handle.read()


# 1. Which JS chunk carries the vendored app? (search all, so a rename cannot fool us.)
js_chunks = sorted(glob.glob(os.path.join(ASSETS, "*.js")))
carriers = []
for chunk in js_chunks:
    text = read(chunk)
    if "__D2D_HOST" in text:
        carriers.append((os.path.basename(chunk), text))

named = [name for name, _ in carriers if name.startswith("DoorToDoorApp-")]
check(bool(named), "a DoorToDoorApp-*.js chunk is emitted: " + (", ".join(named) or "NONE"))
check(
    bool(carriers),
    "the vendored app is in some chunk: " + (", ".join(n for n, _ in carriers) or "NONE"),
)
for name, text in carriers:
    for marker in MARKERS:
        check(marker in text, "  marker %r present in %s" % (marker, name))

# 2. The app chunk must be reachable: another chunk has to reference its filename.
if named:
    target = named[0]
    referrers = []
    for chunk in js_chunks:
        base = os.path.basename(chunk)
        if base == target:
            continue
        if target in read(chunk):
            referrers.append(base)
    check(bool(referrers), "another chunk imports %s: %s" % (target, ", ".join(referrers) or "NONE"))

# 3. DoorBoss's own scoped stylesheet must ship, scoped under .d2d-root.
css_hits = [os.path.basename(c) for c in sorted(glob.glob(os.path.join(ASSETS, "*.css"))) if ".d2d-root" in read(c)]
check(bool(css_hits), "a CSS chunk carries .d2d-root: " + (", ".join(css_hits) or "NONE"))

# 4. The vendored pitch deck must be copied out of public/.
deck = os.path.join(DIST, "d2d", "deck", "en", "01.jpg")
if os.path.isfile(deck):
    with open(deck, "rb") as handle:
        head = handle.read(3)
    check(head == b"\xff\xd8\xff", "deck d2d/deck/en/01.jpg is a JPEG (%d bytes)" % os.path.getsize(deck))
else:
    check(False, "deck d2d/deck/en/01.jpg MISSING from dist")

print()
if problems:
    print("PROBLEMS: %d" % len(problems))
    sys.exit(1)
print("ALL GOOD - the local build artifact carries the Door to Door port")
