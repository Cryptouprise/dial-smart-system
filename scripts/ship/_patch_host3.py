"""A competition that starts at the exact second it was created ignores everything the team did that
day. Starting at the beginning of today is what a manager means by "this week's comp".
"""
from pathlib import Path

HOST = Path(r"C:\Users\charl\dial-smart-system\src\packs\door_to_door\host.ts")

raw = HOST.read_bytes()
text = raw.decode("utf-8")
CRLF = "\r\n" in text
flat = text.replace("\r\n", "\n")

old = """      start: nowIso(),
      end: new Date(Date.now() + days * DAY_MS).toISOString(),
"""
new = """      // A competition a manager starts at 6pm still means "from the start of today", so the doors
      // knocked this morning count. An exact-second start would silently ignore the day so far.
      start: new Date(startOfDay(Date.now())).toISOString(),
      end: new Date(startOfDay(Date.now()) + days * DAY_MS).toISOString(),
"""

found = flat.count(old)
if found != 1:
    raise SystemExit(f"anchor matched {found} time(s), expected 1")

flat = flat.replace(old, new, 1)
out = flat.replace("\n", "\r\n") if CRLF else flat
HOST.write_bytes(out.encode("utf-8"))
print("perfCompete window fixed")
