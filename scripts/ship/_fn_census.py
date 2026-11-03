"""Read-only: list deployed edge functions (name, version, status) via the Management API.

Prints a compact census so we know whether coach-suggest / coach-decide / the voice
functions are live. Never prints the token.
"""
import json
import sys

sys.path.insert(0, "scripts/ship")
import shiplib  # noqa: E402

status, body = shiplib.sb("GET", "/functions")
if status != 200:
    print("FAIL status=%s" % status)
    print(body[:400])
    sys.exit(1)
rows = json.loads(body)
if isinstance(rows, dict):
    rows = rows.get("functions", rows)
print("deployed functions: %d" % len(rows))
for r in sorted(rows, key=lambda x: str(x.get("slug"))):
    print("%-34s v%-6s %-9s jwt=%s" % (
        r.get("slug"),
        r.get("version"),
        r.get("status"),
        r.get("verify_jwt"),
    ))
