"""Flip the BEFORE entry's `- Result: pending` to SUCCESS, scoped to my own block only.

The file contains `- Result: pending` hundreds of times, so the assert is done inside the
slice that starts at my heading. Line endings are untouched (only line text is replaced).
"""
import io
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = r"C:\Users\charl\Infinite-AI\jarvis-ops\session-ledger\ACTIVE.md"
HEAD = "## 2026-11-02 17:07 MDT (jcode) - P1731 T4 BEFORE: redeploy the 4 voice functions"
OLD = "- Result: pending"
NEW = "- Result: SUCCESS (deployed 2026-11-02 23:08Z; all 4 now version=2, ACTIVE, flags preserved)"

s = io.open(P, encoding="utf-8", errors="replace", newline="").read()
before_bytes = len(s.encode("utf-8"))
i = s.rindex(HEAD)
block = s[i:]
n = block.count(OLD)
assert n == 1, "expected exactly 1 pending inside my block, found %d" % n
j = block.index(OLD)
s2 = s[:i] + block[:j] + NEW + block[j + len(OLD):]
assert s2.count(OLD) == s.count(OLD) - 1, "flip changed the wrong number of pendings"
io.open(P, "w", encoding="utf-8", newline="").write(s2)
print("flipped 1 pending -> SUCCESS; bytes %d -> %d" % (before_bytes, len(s2.encode("utf-8"))))
