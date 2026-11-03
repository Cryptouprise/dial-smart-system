"""Who imports a module? Reliable, small, no globs. Usage: python scripts\\ship\\_imp.py <name-fragment>"""
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
SRC = os.path.normpath(os.path.join(ROOT, "src"))
FRAGS = [a.lower() for a in sys.argv[1:]]
if not FRAGS:
    print("usage: _imp.py <name-fragment> [...]")
    raise SystemExit(2)

SKIP = {"node_modules", "dist", ".git", "coverage", ".vite", "tmp", "temp"}
FILES = []
for base, dirs, files in os.walk(ROOT):
    dirs[:] = [d for d in dirs if d not in SKIP]
    for f in files:
        if f.endswith((".ts", ".tsx", ".js", ".jsx", ".mjs")):
            FILES.append(os.path.join(base, f))

pat = re.compile(r"""(?:from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"])""")
for FRAG in FRAGS:
    hits = []
    for path in FILES:
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as fh:
                text = fh.read()
        except OSError:
            continue
        rel = os.path.relpath(path, ROOT).replace("\\", "/")
        for i, line in enumerate(text.splitlines(), 1):
            for m in pat.finditer(line):
                spec = m.group(1) or m.group(2) or ""
                if FRAG in spec.lower():
                    hits.append((rel, i, line.strip()[:150]))

    print(f"importers of '{FRAG}': {len(hits)}")
    for rel, i, line in hits:
        print(f"  {rel}:{i}  {line}")
    print()
