"""Verify the 4 voice redeploys: version bump, JWT flags, bundle changed, bug-4 marker gone, live probe.

  python scripts/ship/_verify_voice.py
Read-only except for downloading the new bodies into %TEMP%/voice-bodies-after/.
"""
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.request

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
REF = "emonjusymdripmkvtttc"
BASE = "https://%s.supabase.co/functions/v1" % REF
SLUGS = ["voice-call", "voice-call-action", "voice-call-events", "voice-token"]
WANT_JWT = {"voice-call": True, "voice-call-action": True, "voice-call-events": False, "voice-token": True}
BEFORE = os.path.join(os.environ["TEMP"], "voice-bodies-before")
AFTER = os.path.join(os.environ["TEMP"], "voice-bodies-after")
TOK = re.search(r"(sbp_[A-Za-z0-9]+)", open(os.path.expanduser("~/.mcp.json"), encoding="utf-8").read()).group(1)
H = {"Authorization": "Bearer " + TOK}


def api(method, path):
    req = urllib.request.Request("https://api.supabase.com/v1/projects/%s%s" % (REF, path), method=method, headers=H)
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


st, raw = api("GET", "/functions")
fns = {f["slug"]: f for f in json.loads(raw.decode())}
print("== live function state after the redeploy")
for slug in SLUGS:
    f = fns[slug]
    ok = "OK" if f.get("verify_jwt") == WANT_JWT[slug] else "JWT MISMATCH"
    print("   %-18s version=%-3s verify_jwt=%-5s status=%-7s %s" % (
        slug, f.get("version"), f.get("verify_jwt"), f.get("status"), ok))

os.makedirs(AFTER, exist_ok=True)
print()
print("== bundle changed? (sha256 of the deployed ESZIP) and the bug-4 marker")
for slug in SLUGS:
    st, new = api("GET", "/functions/%s/body" % slug)
    if st != 200:
        print("   %-18s body GET HTTP %s" % (slug, st))
        continue
    open(os.path.join(AFTER, slug + ".eszip"), "wb").write(new)
    old = open(os.path.join(BEFORE, slug + ".eszip"), "rb").read()
    ho, hn = hashlib.sha256(old).hexdigest()[:16], hashlib.sha256(new).hexdigest()[:16]
    marker = b"twilioProvider"
    print("   %-18s before=%s after=%s %s | twilioProvider before=%s after=%s" % (
        slug, ho, hn, "CHANGED" if ho != hn else "IDENTICAL",
        old.count(marker), new.count(marker)))

print()
print("== live probe after (OPTIONS = module load; POST unauthenticated)")
for slug in SLUGS:
    for method in ("OPTIONS", "POST"):
        req = urllib.request.Request("%s/%s" % (BASE, slug), method=method,
                                     data=(b"{}" if method == "POST" else None),
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                st, txt = r.status, r.read(300).decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            st, txt = e.code, e.read(300).decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            st, txt = "ERR", str(e)[:160]
        print("   %-18s %-7s %-5s %s" % (slug, method, st, txt.replace("\n", " ")[:110]))
