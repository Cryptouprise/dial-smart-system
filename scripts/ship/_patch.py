"""Byte-exact text patcher for CRLF files.

Usage: python _patch.py <spec.json>

spec.json:
{
  "file": "src/components/Dashboard.tsx",
  "edits": [
    {"old": "text that appears exactly once", "new": "replacement", "count": 1}
  ]
}

Why this exists: the editor tools write LF for inserted lines, which corrupts the
CRLF-only files in this repo (and every replacement is anchored on exact bytes, so
a whitespace mismatch fails loudly instead of silently doing the wrong thing).
Every edit asserts its match count before writing; the file is normalised back to
CRLF afterwards, and the result is re-read and verified.
"""
import io
import json
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

spec = json.load(io.open(sys.argv[1], encoding="utf-8"))
path = spec["file"]
raw = io.open(path, "rb").read()
crlf_before = raw.count(b"\r\n")
lone_before = raw.count(b"\n") - crlf_before
text = raw.replace(b"\r\n", b"\n").decode("utf-8")
print("file       %s" % path)
print("before     %d bytes, %d lines, lone_lf=%d" % (len(raw), crlf_before, lone_before))

for i, e in enumerate(spec["edits"], 1):
    want = e.get("count", 1)
    got = text.count(e["old"])
    print("edit %d     occurrences=%d (expected %d)" % (i, got, want))
    if got != want:
        print("ABORT: no file written")
        sys.exit(1)
    text = text.replace(e["old"], e["new"])

out = text.replace("\r\n", "\n").replace("\n", "\r\n").encode("utf-8")
io.open(path, "wb").write(out)
after = io.open(path, "rb").read()
print("after      %d bytes, %d lines, lone_lf=%d" % (len(after), after.count(b"\r\n"), after.count(b"\n") - after.count(b"\r\n")))
for e in spec["edits"]:
    marker = e["new"].split("\n")[0][:60].encode("utf-8")
    print("verify     %-60s present=%s" % (marker.decode("utf-8", "replace"), after.count(marker)))
