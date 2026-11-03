"""Gate DoorBoss's GoHighLevel promises on CONFIG.ghl in the vendored app.

DoorBoss was written against GoHighLevel: it stamps every appointment "syncing to the GHL
calendar", warns that a rep has "no GHL user", asks for a GHL user id, and shows a "GHL sync"
card. Dial Smart does not need GoHighLevel - the dialer, the pipelines and the sequences are
ours - and this app has to run completely without it. GHL stays available for a client who
really is on GHL: set `ghl: true` in the host config (src/packs/door_to_door/host.ts).

The replacements live in _ghl_subs.json so the exact DoorBoss wording never has to survive a
round trip through Python quoting. Each one asserts exactly one occurrence, so a DoorBoss
release that changes this wording fails loudly instead of shipping the old promise.

Idempotent: a second run finds the needles gone and says so.

Usage: python scripts/ship/_patch_ghl_app.py
"""
import io
import json
import os
import shutil

APP = os.path.join("src", "packs", "door_to_door", "app", "scripts.js")
HOST = os.path.join("src", "packs", "door_to_door", "host.ts")
SUBS = os.path.join("scripts", "ship", "_ghl_subs.json")

subs = json.load(io.open(SUBS, "r", encoding="utf-8"))

text = io.open(APP, "r", encoding="utf-8", newline="").read()
orig = text
applied = 0
for old, new in subs:
    if new in text:
        print("  skip   already gated: %s" % old[:56].replace("\n", " "))
        continue
    n = text.count(old)
    if n != 1:
        raise SystemExit("ABORT: need exactly 1 occurrence of %r, found %d" % (old[:70], n))
    text = text.replace(old, new)
    applied += 1
    print("  gate   %s" % old[:56].replace("\n", " "))

if text != orig:
    bak = os.path.join("scripts", "ship", "_scripts.js.bak-ghl")
    if not os.path.exists(bak):
        shutil.copyfile(APP, bak)
        print("  backup %s" % os.path.basename(bak))
    io.open(APP, "w", encoding="utf-8", newline="").write(text)
    print("  wrote  scripts.js  (%d site(s) gated on CONFIG.ghl)" % applied)
else:
    print("  clean  scripts.js (no change needed)")

# --- host.ts: make the switch explicit, so the default is off in our own config too ----
host = io.open(HOST, "r", encoding="utf-8", newline="").read()
NEEDLE = "      afterCall: false,"
if "ghl: false," in host:
    print("  skip   host.ts (already explicit)")
else:
    if host.count(NEEDLE) != 1:
        raise SystemExit("ABORT: host config anchor not found exactly once")
    host = host.replace(NEEDLE, NEEDLE + "\n      ghl: false,   // GoHighLevel is optional: true only for a client who runs on GHL")
    hbak = os.path.join("scripts", "ship", "_host.ts.bak-ghl")
    if not os.path.exists(hbak):
        shutil.copyfile(HOST, hbak)
        print("  backup %s" % os.path.basename(hbak))
    io.open(HOST, "w", encoding="utf-8", newline="").write(host)
    print("  wrote  host.ts")

print("OK")
