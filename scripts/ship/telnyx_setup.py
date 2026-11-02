"""Telnyx side of the browser phone: a credential (WebRTC) connection pointed at voice-call-events,
with an outbound voice profile attached; then the TELNYX_SIP_CONNECTION_ID secret.
  python telnyx_setup.py            # reuse connection named below if it exists, else create
  python telnyx_setup.py --profiles # just list outbound voice profiles (id, name)
Username/password for the connection are random and never printed (per-user telephony credentials are minted by voice-token).
"""
import json
import secrets as pysecrets
import sys

import shiplib as L

CONN_NAME = "Dial Smart Browser Phone"
webhook = L.FUNCTIONS_BASE + "/voice-call-events"

st, b = L.telnyx("GET", "/outbound_voice_profiles?page[size]=50")
profiles = json.loads(b).get("data", []) if st == 200 else []
print("outbound voice profiles:", [(p["id"], p.get("name")) for p in profiles])
if "--profiles" in sys.argv:
    raise SystemExit(0)
if not profiles:
    raise SystemExit("no outbound voice profile on the account; create one in the Telnyx portal first")
preferred = [p for p in profiles if p.get("name") == "Infinite AI Outbound"]
profile_id = (preferred or profiles)[0]["id"]
print("using outbound voice profile:", (preferred or profiles)[0].get("name"), profile_id)

st, b = L.telnyx("GET", "/credential_connections?page[size]=100")
conns = json.loads(b).get("data", []) if st == 200 else []
mine = [c for c in conns if c.get("connection_name") == CONN_NAME]
body = {"connection_name": CONN_NAME, "active": True,
        "webhook_event_url": webhook, "webhook_api_version": "2",
        "outbound": {"outbound_voice_profile_id": profile_id}}
if mine:
    cid = mine[0]["id"]
    st, b = L.telnyx("PATCH", f"/credential_connections/{cid}", body)
    print("credential connection reused + updated:", cid, "HTTP", st, "" if st < 300 else b[:300])
else:
    body["user_name"] = "dsbp" + pysecrets.token_hex(6)  # Telnyx: letters+digits only
    body["password"] = pysecrets.token_urlsafe(24)
    st, b = L.telnyx("POST", "/credential_connections", body)
    if st not in (200, 201):
        raise SystemExit(f"credential connection create failed HTTP {st}: {b[:400]}")
    cid = json.loads(b)["data"]["id"]
    print("credential connection created:", cid)

st, b = L.sb_secrets_set({"TELNYX_SIP_CONNECTION_ID": cid})
print("secret TELNYX_SIP_CONNECTION_ID ->", st, "" if st < 300 else b)
