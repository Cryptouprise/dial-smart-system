"""Compare the object keys of two generated Supabase types.ts files.

Answers one question: does file A contain every schema object that file B does?
Used to pick the authoritative version when both sides regenerated the file.

Usage: python _compare_types.py <a.ts> <b.ts>
"""

import re
import sys
from pathlib import Path

# Lines like:  "      set_org_packs: {"  or  "        Row: {" (nested), so we keep
# only the names and rely on set comparison of the whole file.
KEY_RE = re.compile(r"^\s{4,8}([A-Za-z_][A-Za-z0-9_]*):\s*\{", re.M)


def keys(path: Path) -> set[str]:
    return set(KEY_RE.findall(path.read_text(encoding="utf-8", errors="replace")))


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: _compare_types.py <a.ts> <b.ts>")
        return 2
    a_path, b_path = Path(sys.argv[1]), Path(sys.argv[2])
    a, b = keys(a_path), keys(b_path)
    print(f"A {a_path.name}: {len(a)} keys")
    print(f"B {b_path.name}: {len(b)} keys")
    only_b = sorted(b - a)
    only_a = sorted(a - b)
    print(f"in B but NOT in A ({len(only_b)}): {only_b[:40]}")
    print(f"in A but NOT in B ({len(only_a)}): {only_a[:40]}")
    print(f"-> A is a superset of B: {not only_b}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
