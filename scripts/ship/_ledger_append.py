"""Append an entry to a markdown ledger, matching the file's existing line endings.

Usage: python _ledger_append.py <entry.md> [target.md]

Used for the "Never Lose Work Protocol" Tier-4 ledger lines. The entry file holds
the text; this script only handles the append so the entry itself stays reviewable.
"""

import io
import sys
from pathlib import Path

DEFAULT_TARGET = Path(r"C:\Users\charl\Infinite-AI\jarvis-ops\session-ledger\ACTIVE.md")


def detect_newline(path: Path) -> str:
    head = io.open(path, encoding="utf-8", errors="replace").read(8192)
    return "\r\n" if "\r\n" in head else "\n"


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: _ledger_append.py <entry.md> [target.md]")
        return 2
    entry = Path(sys.argv[1]).read_text(encoding="utf-8")
    target = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_TARGET
    if not target.exists():
        print(f"target not found: {target}")
        return 1
    nl = detect_newline(target)
    before = target.stat().st_size
    with io.open(target, "a", encoding="utf-8", newline="") as fh:
        fh.write(nl + nl + entry.strip() + nl)
    after = target.stat().st_size
    print(f"appended {after - before} bytes to {target.name} (newline={nl!r})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
