"""Derive a council-mode lane file from a directed one, so the same questions can be
answered by several independent models plus a manager.

Usage: python scripts/ship/_mk_council.py docs/waves/core.json docs/waves/core-council.json
"""
import json
import sys


def main():
    src, dst = sys.argv[1], sys.argv[2]
    with open(src, "r", encoding="utf-8") as fh:
        spec = json.load(fh)
    spec["name"] = spec["name"] + "-council"
    spec["mode"] = "council"
    only = sys.argv[3] if len(sys.argv) > 3 else None
    if only:
        spec["lanes"] = [l for l in spec["lanes"] if l["id"] == only]
        spec["name"] = spec["name"] + "-" + only
        if not spec["lanes"]:
            print(f"no lane with id {only!r}")
            return 1
    for lane in spec["lanes"]:
        lane.pop("model", None)
        lane["mode"] = "council"
    with open(dst, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(spec, fh, indent=2)
        fh.write("\n")
    print(f"wrote {dst}: {len(spec['lanes'])} council lanes from {src}")


if __name__ == "__main__":
    main()
