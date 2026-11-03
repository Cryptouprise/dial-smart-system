"""Print a line range of a file (1-based, inclusive). Read-only.

Usage: python scripts/ship/_peek.py <file> <start> <end> [--numbers]
"""
import io
import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def main(argv):
    if len(argv) < 4:
        print(__doc__)
        return 2
    path = argv[1]
    start = int(argv[2])
    end = int(argv[3])
    numbers = "--numbers" in argv
    text = io.open(path, encoding="utf-8", errors="replace").read()
    lines = text.split("\n")
    total = len(lines)
    lo = max(1, start)
    hi = min(total, end)
    for i in range(lo, hi + 1):
        if numbers:
            print("%5d| %s" % (i, lines[i - 1]))
        else:
            print(lines[i - 1])
    print("-- %d..%d of %d line(s)" % (lo, hi, total))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
