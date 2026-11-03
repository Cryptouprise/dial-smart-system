"""Which DoorBoss block holds each GoHighLevel substitution, and does seam_core keep it?

Run from the repo root:  python scripts/ship/_diag_ghl.py
"""
import importlib.util
import io
import json
import os

spec = importlib.util.spec_from_file_location("ex", os.path.join("scripts", "ship", "_extract_app.py"))
ex = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ex)

with io.open(os.path.join("scripts", "ship", "_ghl_subs.json"), encoding="utf-8") as fh:
    subs = json.load(fh)

text = io.open(ex.SRC, encoding="utf-8", newline="").read()

blocks = []
for m in ex.BLOCK_RE.finditer(text):
    blocks.append({"start": m.start(), "kind": m.group(1).lower(), "body": m.group(3)})
blocks.sort(key=lambda b: b["start"])
inline = [b for b in blocks if b["kind"] == "script" and "src=" not in b["body"][:0] and b["body"].strip()]

print("blocks in source: %d script/style, %d non-empty inline script" % (len(blocks), len(inline)))
core = [b for b in inline if ex.CONFIG_OPEN in b["body"] and ex.API_OPEN in b["body"]]
print("core candidates : %d" % len(core))

for i, b in enumerate(inline):
    hits = [(s["scope"], s["old"][:40]) for s in subs if s["old"] in b["body"]]
    if hits:
        print("block %2d (%6d bytes, src line %d): %d hit(s)"
              % (i, len(b["body"]), text.count("\n", 0, b["start"]) + 1, len(hits)))
        for scope, old in hits:
            print("        [%s] %s" % (scope, old))

if core:
    cb = core[0]["body"].strip("\n")
    seamed, note = ex.seam_core(cb)
    print("\nseam_core note  : %s" % note)
    for s in subs:
        before = cb.count(s["old"])
        after = seamed.count(s["old"])
        if s["scope"] == "addon" or (before != after):
            print("  [%s] in-core before=%d after=%d  %s" % (s["scope"], before, after, s["old"][:60]))
