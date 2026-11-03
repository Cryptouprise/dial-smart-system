"""Tiny recursive text search that prints path:line: text.

Usage: python scripts/ship/_grep.py <pattern> <dir-or-file> [<dir-or-file> ...]

Case-insensitive substring by default; pass --regex to treat the pattern as a
regex. Skips node_modules, .git, dist, build, .next and binary-looking files.
Always exits 0 with a count so it is safe to chain.
"""
import os
import re
import sys

SKIP_DIRS = {"node_modules", ".git", "dist", "build", ".next", ".vercel", "coverage"}
MAX_BYTES = 4 * 1024 * 1024


def iter_files(root):
    if os.path.isfile(root):
        yield root
        return
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            yield os.path.join(dirpath, name)


def main():
    args = sys.argv[1:]
    # Windows console default is cp1252; source files contain emoji and box-drawing
    # characters that would otherwise crash the print and truncate the results.
    try:
        sys.stdout.reconfigure(errors="replace")
    except (AttributeError, ValueError):
        pass
    use_regex = "--regex" in args
    files_only = "--files" in args
    args = [a for a in args if a not in ("--regex", "--files")]
    if len(args) < 2:
        print("usage: _grep.py [--regex] [--files] <pattern> <path> [<path> ...]")
        return 2
    pattern, roots = args[0], args[1:]
    if use_regex:
        rx = re.compile(pattern)
        match = lambda line: rx.search(line) is not None
    else:
        needle = pattern.lower()
        match = lambda line: needle in line.lower()

    hits = 0
    files_scanned = 0
    for root in roots:
        for path in iter_files(root):
            try:
                if os.path.getsize(path) > MAX_BYTES:
                    continue
                with open(path, "rb") as fh:
                    raw = fh.read()
                if b"\x00" in raw:
                    continue
                text = raw.decode("utf-8", "replace")
            except OSError:
                continue
            files_scanned += 1
            for lineno, line in enumerate(text.splitlines(), 1):
                if match(line):
                    hits += 1
                    if files_only:
                        print(path.replace("\\", "/"))
                        break
                    print("%s:%d: %s" % (path.replace("\\", "/"), lineno, line.strip()[:240]))
    print("-- %d hit(s) in %d file(s) scanned" % (hits, files_scanned))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
