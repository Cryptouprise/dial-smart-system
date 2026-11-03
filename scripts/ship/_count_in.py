"""Count occurrences of a literal in every file under a directory (recursive).

Usage: python scripts/ship/_count_in.py <dir> <needle> [ext]
"""
import os
import sys


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    root, needle = sys.argv[1], sys.argv[2]
    ext = sys.argv[3] if len(sys.argv) > 3 else ".ts"
    files = 0
    hits = 0
    hitfiles = []
    for dirpath, _dirs, names in os.walk(root):
        for n in names:
            if ext and not n.endswith(ext):
                continue
            p = os.path.join(dirpath, n)
            files += 1
            try:
                with open(p, "r", encoding="utf-8", errors="replace") as fh:
                    text = fh.read()
            except Exception:
                continue
            c = text.count(needle)
            if c:
                hits += c
                hitfiles.append((os.path.relpath(p, root), c))
    print(f"dir={root} needle={needle!r} ext={ext}")
    print(f"files scanned: {files}")
    print(f"total occurrences: {hits}")
    for f, c in sorted(hitfiles)[:40]:
        print(f"  {c:>4}  {f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
