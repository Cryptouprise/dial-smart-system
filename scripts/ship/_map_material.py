"""Inventory the app's real entry points so the review lanes get an accurate map."""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "src")
SKIP = {"node_modules", ".git", "dist"}


def loc(path):
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            return fh.read().count("\n") + 1
    except Exception:
        return 0


def listing(rel, pattern=(".ts", ".tsx")):
    base = os.path.join(SRC, rel)
    if not os.path.isdir(base):
        return
    rows = []
    for fn in sorted(os.listdir(base)):
        p = os.path.join(base, fn)
        if os.path.isfile(p) and fn.endswith(pattern):
            rows.append((loc(p), fn))
    rows.sort(reverse=True)
    print("\n--- src/%s (%d files) ---" % (rel, len(rows)))
    for l, fn in rows:
        print("  %6d  %s" % (l, fn))


for d in ("integrations", "pages", "contexts", "services", "data", "lib", "types"):
    listing(d)

print("\n--- top 45 components by LOC ---")
base = os.path.join(SRC, "components")
rows = []
for dirpath, dirnames, filenames in os.walk(base):
    dirnames[:] = [x for x in dirnames if x not in SKIP]
    for fn in filenames:
        if fn.endswith((".ts", ".tsx")):
            p = os.path.join(dirpath, fn)
            rows.append((loc(p), os.path.relpath(p, SRC).replace("\\", "/")))
rows.sort(reverse=True)
for l, fn in rows[:45]:
    print("  %6d  %s" % (l, fn))

print("\n--- top 30 hooks by LOC ---")
base = os.path.join(SRC, "hooks")
rows = []
for dirpath, dirnames, filenames in os.walk(base):
    dirnames[:] = [x for x in dirnames if x not in SKIP]
    for fn in filenames:
        if fn.endswith((".ts", ".tsx")):
            p = os.path.join(dirpath, fn)
            rows.append((loc(p), os.path.relpath(p, SRC).replace("\\", "/")))
rows.sort(reverse=True)
for l, fn in rows[:30]:
    print("  %6d  %s" % (l, fn))

print("\n--- ALL edge functions by LOC ---")
fn_dir = os.path.join(ROOT, "supabase", "functions")
rows = []
for d in sorted(os.listdir(fn_dir)):
    idx = os.path.join(fn_dir, d, "index.ts")
    if os.path.isfile(idx):
        rows.append((loc(idx), d))
rows.sort(reverse=True)
for l, d in rows:
    print("  %6d  %s" % (l, d))

print("\n--- largest migrations ---")
mig = os.path.join(ROOT, "supabase", "migrations")
rows = []
for m in os.listdir(mig):
    if m.endswith(".sql"):
        rows.append((loc(os.path.join(mig, m)), m))
rows.sort(reverse=True)
for l, m in rows[:20]:
    print("  %6d  %s" % (l, m))

print("\n--- integrations/ contents (all file types) ---")
ib = os.path.join(SRC, "integrations")
if os.path.isdir(ib):
    for fn in sorted(os.listdir(ib)):
        p = os.path.join(ib, fn)
        if os.path.isfile(p):
            print("  %6d  %s" % (loc(p), fn))
