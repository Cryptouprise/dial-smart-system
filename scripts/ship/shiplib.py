"""Shared helpers for the ship scripts. Every credential is read from its designated file AT RUNTIME and never printed.
  Supabase PAT      ~/.mcp.json            (sbp_... token)
  Lithos API key    ~/.claude/skills/lithos/credentials.md  (table row **API Key**)
  Telnyx API key    ~/.claude/skills/telnyx-voice-ai/SKILL.md (KEY..._... literal)
  Twilio accounts   ~/.mcp.json            (TWILIO_<LABEL>_ACCOUNT_SID / _AUTH_TOKEN)
"""
import base64
import json
import pathlib
import re
import urllib.error
import urllib.parse
import urllib.request

REF = "emonjusymdripmkvtttc"
HOME = pathlib.Path.home()
FUNCTIONS_BASE = f"https://{REF}.supabase.co/functions/v1"


def _read(p):
    return pathlib.Path(p).expanduser().read_text(encoding="utf-8", errors="ignore")


def http(method, url, body=None, headers=None, form=False, basic=None, timeout=120):
    data = None
    h = dict(headers or {})
    if body is not None:
        if form:
            data = urllib.parse.urlencode(body).encode()
            h["Content-Type"] = "application/x-www-form-urlencoded"
        else:
            data = json.dumps(body).encode()
            h["Content-Type"] = "application/json"
    if basic:
        h["Authorization"] = "Basic " + base64.b64encode(f"{basic[0]}:{basic[1]}".encode()).decode()
    req = urllib.request.Request(url, method=method, data=data, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


# ---------- Supabase Management API ----------
def sb_token():
    m = re.search(r"(sbp_[A-Za-z0-9]+)", _read(HOME / ".mcp.json"))
    if not m:
        raise SystemExit("no Supabase PAT found in ~/.mcp.json")
    return m.group(1)


def sb(method, path, body=None):
    return http(method, f"https://api.supabase.com/v1/projects/{REF}{path}", body,
                {"Authorization": "Bearer " + sb_token()})


def sb_secrets():
    """-> dict name -> value (values stay in memory; callers print names only)."""
    st, b = sb("GET", "/secrets")
    if st != 200:
        raise SystemExit(f"secrets GET HTTP {st}: {b[:200]}")
    return {s["name"]: s.get("value", "") for s in json.loads(b)}


def sb_secrets_set(d):
    st, b = sb("POST", "/secrets", [{"name": k, "value": v} for k, v in d.items()])
    return st, b[:300]


# ---------- credential readers ----------
def lithos_key():
    m = re.search(r"\*\*API Key\*\*\s*\|\s*`([^`]+)`", _read(HOME / ".claude/skills/lithos/credentials.md"))
    if not m:
        raise SystemExit("Lithos key row not found")
    return m.group(1).strip()


def telnyx_key():
    m = re.search(r"(KEY[0-9A-F]{32}_[A-Za-z0-9]+)", _read(HOME / ".claude/skills/telnyx-voice-ai/SKILL.md"))
    if not m:
        raise SystemExit("Telnyx key not found")
    return m.group(1)


def twilio_accounts():
    """-> {LABEL: {'sid':..., 'token':...}} from ~/.mcp.json env blocks."""
    out = {}

    def walk(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if isinstance(v, str):
                    m = re.match(r"TWILIO_([A-Z]+)_ACCOUNT_SID$", k)
                    if m:
                        out.setdefault(m.group(1), {})["sid"] = v
                    m = re.match(r"TWILIO_([A-Z]+)_AUTH_TOKEN$", k)
                    if m:
                        out.setdefault(m.group(1), {})["token"] = v
                else:
                    walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    walk(json.loads(_read(HOME / ".mcp.json")))
    return {k: v for k, v in out.items() if "sid" in v and "token" in v}


def twilio(method, account, path, body=None):
    sid, tok = account["sid"], account["token"]
    return http(method, f"https://api.twilio.com/2010-04-01/Accounts/{sid}{path}", body, form=True, basic=(sid, tok))


def telnyx(method, path, body=None):
    return http(method, f"https://api.telnyx.com/v2{path}", body, {"Authorization": "Bearer " + telnyx_key()})
