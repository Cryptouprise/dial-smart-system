"""Report the OpenRouter credit balance WITHOUT ever printing the key.

Reads the key from the orcarouter skill credentials, calls GET /api/v1/credits,
and prints only the numbers. The key is never echoed, logged or written anywhere.
"""
import json
import os
import re
import urllib.request

CRED = r"C:\Users\charl\.claude\skills\orcarouter\credentials.md"
CERT = r"C:\Users\charl\.certs\cacert.pem"

key = os.environ.get("OPENROUTER_API_KEY")
source = "env OPENROUTER_API_KEY"
if not key:
    try:
        with open(CRED, "r", encoding="utf-8", errors="replace") as fh:
            text = fh.read()
        m = re.search(r"(sk-or-[A-Za-z0-9\-_]{20,})", text)
        if m:
            key = m.group(1)
            source = CRED
    except Exception as exc:
        print("could not read credentials: %s" % exc)

if not key:
    print("NO KEY FOUND (env OPENROUTER_API_KEY empty, no sk-or- token in %s)" % CRED)
    raise SystemExit(1)

# never print the key; only say which file it came from and its length
print("key source: %s (len=%d, prefix=%s...)" % (source, len(key), key[:8]))

ctx = None
if os.path.isfile(CERT):
    import ssl
    ctx = ssl.create_default_context(cafile=CERT)

req = urllib.request.Request(
    "https://openrouter.ai/api/v1/credits",
    headers={"Authorization": "Bearer " + key},
)
try:
    with urllib.request.urlopen(req, timeout=45, context=ctx) as r:
        body = json.loads(r.read().decode("utf-8"))
    d = body.get("data", body)
    total = d.get("total_credits")
    used = d.get("total_usage")
    print("total_credits: %s" % total)
    print("total_usage  : %s" % used)
    if total is not None and used is not None:
        print("REMAINING    : $%.2f" % (float(total) - float(used)))
except Exception as exc:
    print("credits call failed: %s" % exc)
