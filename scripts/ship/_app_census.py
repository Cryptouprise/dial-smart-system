"""Census the app: files and lines by area, so review lanes can be named against real things.
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "src")

def walk(base):
    files = 0
    loc = 0
    for dirpath, dirnames, filenames in os.walk(base):
        dirnames[:] = [d for d in dirnames if d not in ("node_modules", ".git", "dist")]
        for fn in filenames:
            if fn.endswith((".ts", ".tsx", ".js", ".jsx", ".css", ".sql")):
                files += 1
                try:
                    with open(os.path.join(dirpath, fn), "r", encoding="utf-8", errors="replace") as fh:
                        loc += fh.read().count("\n") + 1
                except Exception:
                    pass
    return files, loc

print("=== src/ by top-level area ===")
rows = []
for name in sorted(os.listdir(SRC)):
    p = os.path.join(SRC, name)
    if os.path.isdir(p):
        f, l = walk(p)
        rows.append((l, f, name + "/"))
    elif name.endswith((".ts", ".tsx")):
        with open(p, "r", encoding="utf-8", errors="replace") as fh:
            rows.append((fh.read().count("\n") + 1, 1, name))
rows.sort(reverse=True)
for l, f, n in rows:
    print("  %7d LOC  %4d files  %s" % (l, f, n))
total_files, total_loc = walk(SRC)
print("  %7d LOC  %4d files  TOTAL src/" % (total_loc, total_files))

print("\n=== flat counts ===")
for label, pat in (("components", os.path.join(SRC, "components")),
                   ("pages", os.path.join(SRC, "pages")),
                   ("hooks", os.path.join(SRC, "hooks")),
                   ("lib", os.path.join(SRC, "lib"))):
    if os.path.isdir(pat):
        n = len([x for x in os.listdir(pat) if x.endswith((".ts", ".tsx"))])
        print("  %4d  %s" % (n, label))

for label, pat in (("packs", os.path.join(SRC, "packs")),):
    if os.path.isdir(pat):
        for d in sorted(os.listdir(pat)):
            if os.path.isdir(os.path.join(pat, d)):
                f, l = walk(os.path.join(pat, d))
                print("  pack %-22s %5d LOC  %3d files" % (d, l, f))

fn_dir = os.path.join(ROOT, "supabase", "functions")
if os.path.isdir(fn_dir):
    fns = [d for d in sorted(os.listdir(fn_dir)) if os.path.isdir(os.path.join(fn_dir, d))]
    print("\n  %d supabase edge functions" % len(fns))
    big = []
    for d in fns:
        idx = os.path.join(fn_dir, d, "index.ts")
        if os.path.isfile(idx):
            with open(idx, "r", encoding="utf-8", errors="replace") as fh:
                big.append((fh.read().count("\n") + 1, d))
    big.sort(reverse=True)
    for l, d in big[:15]:
        print("    %6d LOC  %s" % (l, d))

mig = os.path.join(ROOT, "supabase", "migrations")
if os.path.isdir(mig):
    ms = [m for m in os.listdir(mig) if m.endswith(".sql")]
    print("\n  %d migrations" % len(ms))
