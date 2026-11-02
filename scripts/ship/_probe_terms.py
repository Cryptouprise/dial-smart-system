import io, os, sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
TERMS = ["BrowserPhone", "CoachPanel", "BillingPaused", "PackSettings", "useEnabledPacks",
         "useOrgStanding", "call-workspace", "CallWorkspace"]
SKIP = {".git", "node_modules", "dist", "build", ".vite", "coverage"}
hits = {}
for root, dirs, files in os.walk("."):
    dirs[:] = [d for d in dirs if d not in SKIP]
    for f in files:
        if not f.endswith((".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".sql")):
            continue
        p = os.path.join(root, f)
        try:
            s = io.open(p, encoding="utf-8", errors="replace").read()
        except Exception:
            continue
        for t in TERMS:
            n = s.count(t)
            if n:
                hits.setdefault(t, []).append((p.replace("\\", "/"), n))
for t in TERMS:
    rows = sorted(hits.get(t, []), key=lambda r: -r[1])
    print("\n== %s : %d files" % (t, len(rows)))
    for p, n in rows:
        print("   %4d  %s" % (n, p))
