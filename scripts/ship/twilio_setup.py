"""Twilio side of the browser phone: TwiML App + API Key, then the three Supabase secrets.
  python twilio_setup.py            # uses the dialer's own Twilio account = live secrets TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN
  python twilio_setup.py <LABEL>    # or a ~/.mcp.json account label (PRIMARY, SUNNERDS, ...)
Idempotent for the TwiML App (found by friendly name, URLs refreshed). Creates a NEW API key each run
(Twilio returns the secret once); the key secret is set as a Supabase secret and never printed.
"""
import json
import sys

import shiplib as L

APP_NAME = "Dial Smart Browser Phone"
label = sys.argv[1] if len(sys.argv) > 1 else "LIVE"
if label == "LIVE":
    s = L.sb_secrets()
    acct = {"sid": s["TWILIO_ACCOUNT_SID"], "token": s["TWILIO_AUTH_TOKEN"]}
    print("using the dialer's live Twilio account (sid ends", acct["sid"][-4:] + ")")
else:
    acct = L.twilio_accounts()[label]
voice_url = L.FUNCTIONS_BASE + "/twilio-voice-twiml"
status_url = L.FUNCTIONS_BASE + "/twilio-voice-status"

# 1. TwiML App
st, b = L.twilio("GET", acct, "/Applications.json?FriendlyName=" + APP_NAME.replace(" ", "%20"))
apps = json.loads(b).get("applications", []) if st == 200 else []
params = {"FriendlyName": APP_NAME, "VoiceUrl": voice_url, "VoiceMethod": "POST",
          "StatusCallback": status_url, "StatusCallbackMethod": "POST"}
if apps:
    app_sid = apps[0]["sid"]
    st, b = L.twilio("POST", acct, f"/Applications/{app_sid}.json", params)
    print("TwiML App reused + updated:", app_sid, "HTTP", st)
else:
    st, b = L.twilio("POST", acct, "/Applications.json", params)
    if st not in (200, 201):
        raise SystemExit(f"TwiML App create failed HTTP {st}: {b[:300]}")
    app_sid = json.loads(b)["sid"]
    print("TwiML App created:", app_sid)

# 2. API Key (standard)
st, b = L.twilio("POST", acct, "/Keys.json", {"FriendlyName": "dial-smart-browser-phone"})
if st not in (200, 201):
    raise SystemExit(f"API Key create failed HTTP {st}: {b[:300]}")
key = json.loads(b)
print("API Key created:", key["sid"])

# 3. Supabase secrets
st, b = L.sb_secrets_set({"TWILIO_API_KEY_SID": key["sid"], "TWILIO_API_KEY_SECRET": key["secret"],
                          "TWILIO_TWIML_APP_SID": app_sid})
print("secrets TWILIO_API_KEY_SID / TWILIO_API_KEY_SECRET / TWILIO_TWIML_APP_SID ->", st, "" if st < 300 else b)
