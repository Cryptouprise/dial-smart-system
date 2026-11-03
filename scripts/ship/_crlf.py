"""Normalize files to CRLF (the repo convention). Read-then-write, byte safe.

Usage: python scripts/ship/_crlf.py <path> [<path> ...]

Prints the lone-LF count before and after each file so a no-op is visible.
"""
import io
import os
import sys


def main(argv):
    sys.stdout.reconfigure(errors="replace")
    paths = [p for p in argv[1:] if not p.startswith("--")]
    if not paths:
        print(__doc__)
        return 2
    for path in paths:
        if not os.path.exists(path):
            print("%-70s MISSING" % path)
            continue
        raw = io.open(path, "rb").read()
        crlf = raw.count(b"\r\n")
        lf = raw.count(b"\n")
        lone = lf - crlf
        if lone == 0:
            print("%-70s already CRLF (%d lines)" % (path, crlf))
            continue
        fixed = raw.replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")
        with io.open(path, "wb") as fh:
            fh.write(fixed)
        after = io.open(path, "rb").read()
        print(
            "%-70s lone_lf %d -> %d, bytes %d -> %d"
            % (path, lone, after.count(b"\n") - after.count(b"\r\n"), len(raw), len(after))
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
