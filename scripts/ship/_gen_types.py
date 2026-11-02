"""Regenerate src/integrations/supabase/types.ts from the LIVE schema via the Management API.

Reads the Supabase PAT from ~/.mcp.json at runtime and never prints it.
Prints only: HTTP status, byte count, and whether key symbols are present.
"""

import json
import pathlib
import re
import sys
import urllib.error
import urllib.request

REF = "emonjusymdripmkvtttc"
DEST = pathlib.Path(r"C:\Users\charl\dial-smart-system\src\integrations\supabase\types.ts")
PAT_RE = re.compile(r"(sbp_[A-Za-z0-9]+)")

MUST_CONTAIN = ["set_org_packs", "org_has_pack", "merge_custom_fields"]


def main() -> int:
    text = (pathlib.Path.home() / ".mcp.json").read_text(encoding="utf-8", errors="ignore")
    m = PAT_RE.search(text)
    if not m:
        print("no Supabase PAT found in ~/.mcp.json")
        return 1
    pat = m.group(1)
    print(f"PAT loaded (len={len(pat)}, value never printed)")

    url = f"https://api.supabase.com/v1/projects/{REF}/types/typescript"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {pat}", "Accept": "text/plain"})
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            status, body = resp.status, resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        print(f"HTTP {exc.code}: {exc.read().decode('utf-8', 'replace')[:300]}")
        return 1

    print(f"HTTP {status}, {len(body)} bytes")
    if status != 200:
        print(f"unexpected status; NOT writing. {body[:300]}")
        return 1

    # The Management API wraps the payload as {"types": "<escaped TypeScript>"}.
    try:
        payload = json.loads(body)
        ts = payload["types"] if isinstance(payload, dict) else None
    except (ValueError, KeyError):
        ts = None
    if not ts or "export type" not in ts:
        print("response does not contain generated TypeScript; NOT writing")
        print(body[:300])
        return 1

    if DEST.exists():
        backup = DEST.with_suffix(".ts.bak")
        if backup.exists():
            print(f"backup {backup.name} already exists; leaving it untouched")
        else:
            backup.write_text(DEST.read_text(encoding="utf-8", errors="ignore"), encoding="utf-8")
            print(f"backed up existing types -> {backup.name}")

    DEST.write_text(ts, encoding="utf-8")
    print(f"wrote {DEST} ({len(ts)} bytes of TypeScript)")
    for sym in MUST_CONTAIN:
        print(f"  contains {sym}: {sym in ts}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
