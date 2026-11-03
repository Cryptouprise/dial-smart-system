"""Line-of-code census for the whole repo, grouped by top-level area.

Usage: python scripts/ship/_loc.py
Excludes .git, node_modules, dist, build, coverage, and binary/minified files.
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SKIP_DIRS = {".git", "node_modules", "dist", "build", "coverage", ".vite", ".turbo", ".next"}
CODE_EXT = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".sql", ".css", ".html",
            ".json", ".md", ".py", ".sh", ".toml", ".yml", ".yaml"}
BIG_MIN = 400_000  # bytes; skip minified/generated blobs


def area_of(rel):
    parts = rel.replace("\\", "/").split("/")
    if len(parts) == 1:
        return "(root)"
    if parts[0] == "supabase" and len(parts) > 1:
        return "supabase/" + parts[1]
    if parts[0] == "src" and len(parts) > 1 and parts[1] in ("packs", "components", "pages", "hooks"):
        return "src/" + parts[1]
    return parts[0]


def main():
    areas = {}
    ext_tot = {}
    total_lines = 0
    total_files = 0
    for dirpath, dirs, names in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for n in names:
            ext = os.path.splitext(n)[1].lower()
            if ext not in CODE_EXT:
                continue
            p = os.path.join(dirpath, n)
            try:
                if os.path.getsize(p) > BIG_MIN:
                    continue
                with open(p, "r", encoding="utf-8", errors="replace") as fh:
                    c = fh.read().count("\n") + 1
            except Exception:
                continue
            rel = os.path.relpath(p, ROOT)
            a = area_of(rel)
            d = areas.setdefault(a, {"lines": 0, "files": 0})
            d["lines"] += c
            d["files"] += 1
            ext_tot[ext] = ext_tot.get(ext, 0) + c
            total_lines += c
            total_files += 1

    print(f"ROOT {ROOT}")
    print(f"TOTAL: {total_lines:,} lines across {total_files:,} files\n")
    for a, d in sorted(areas.items(), key=lambda kv: -kv[1]["lines"]):
        print(f"  {d['lines']:>9,}  {d['files']:>5}  {a}")
    print("\nby extension:")
    for e, c in sorted(ext_tot.items(), key=lambda kv: -kv[1]):
        print(f"  {c:>9,}  {e}")


if __name__ == "__main__":
    main()
