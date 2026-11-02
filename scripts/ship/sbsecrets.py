"""Edge-function secrets for the live project (names only ever printed).
  python sbsecrets.py list                 # names of all current secrets
  python sbsecrets.py match-twilio         # which ~/.mcp.json Twilio account equals live TWILIO_ACCOUNT_SID
  python sbsecrets.py set-lithos           # LITHOS_API_KEY from the lithos credentials file
  python sbsecrets.py set NAME=literal ... # only for NON-secret values (e.g. APP_URL, ids)
"""
import sys

import shiplib as L

cmd = sys.argv[1] if len(sys.argv) > 1 else "list"

if cmd == "list":
    print(sorted(L.sb_secrets().keys()))

elif cmd == "match-twilio":
    live = L.sb_secrets().get("TWILIO_ACCOUNT_SID", "")
    accts = L.twilio_accounts()
    hit = [k for k, v in accts.items() if v["sid"] == live]
    print("live TWILIO_ACCOUNT_SID set:", bool(live), "| matches mcp.json account:", hit or "NONE", "| known labels:", sorted(accts))

elif cmd == "set-lithos":
    st, b = L.sb_secrets_set({"LITHOS_API_KEY": L.lithos_key()})
    print("LITHOS_API_KEY ->", st, b if st >= 300 else "ok")

elif cmd == "set":
    d = dict(a.split("=", 1) for a in sys.argv[2:])
    st, b = L.sb_secrets_set(d)
    print(sorted(d), "->", st, b if st >= 300 else "ok")

else:
    raise SystemExit(__doc__)
