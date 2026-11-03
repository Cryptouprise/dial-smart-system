"""Find test files whose contents mention a phrase. Usage: python scripts\\ship\\_find_tests.py <phrase>"""
import os
import sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
NEEDLE = (sys.argv[1] if len(sys.argv) > 1 else "").lower()
if not NEEDLE:
    print("usage: _find_tests.py <phrase>")
    raise SystemExit(2)

SKIP = {"node_modules", "dist", ".git", "coverage", ".vite"}
hits = []
for base, dirs, files in os.walk(ROOT):
    dirs[:] = [d for d in dirs if d not in SKIP]
    for f in files:
        if not f.endswith((".test.ts", ".test.tsx", ".test.mjs", ".test.js")):
            continue
        path = os.path.join(base, f)
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as fh:
                text = fh.read()
        except OSError:
            continue
        if NEEDLE in text.lower():
            hits.append(os.path.relpath(path, ROOT).replace("\\", "/"))

print(f"{len(hits)} test file(s) mentioning '{NEEDLE}':")
for h in hits:
    print("  " + h)
