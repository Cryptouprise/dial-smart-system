"""Save (and, if needed, restore) the live bodies of the 4 voice functions.

  python save_voice_bodies.py --save      -> %TEMP%/voice-bodies-before/<slug>.eszip  (rollback material)
  python save_voice_bodies.py --probe     -> OPTIONS + unauthenticated POST status for each live URL
  python save_voice_bodies.py --restore   -> POST the saved ESZIPs back (only if a deploy breaks something)

Rollback path documented for the ledger: the Management API deploy endpoint takes the raw ESZIP
that `GET /functions/{slug}/body` returns, so the saved files are directly redeployable.
"""
import hashlib
import os
import re
import sys
import urllib.error
import urllib.request

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
REF = "emonjusymdripmkvtttc"
BASE = "https://%s.supabase.co/functions/v1" % REF
SLUGS = ["voice-call", "voice-call-action", "voice-call-events", "voice-token"]
VERIFY_JWT = {"voice-call": True, "voice-call-action": True, "voice-call-events": False, "voice-token": True}
OUT = os.path.join(os.environ.get("TEMP", "."), "voice-bodies-before")
TOK = re.search(r"(sbp_[A-Za-z0-9]+)", open(os.path.expanduser("~/.mcp.json"), encoding="utf-8").read()).group(1)


def api(method, path, data=None, ctype=None, timeout=300):
    h = {"Authorization": "Bearer " + TOK}
    if ctype:
        h["Content-Type"] = ctype
    req = urllib.request.Request("https://api.supabase.com/v1/projects/%s%s" % (REF, path),
                                 method=method, data=data, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def probe():
    print("== live probe (OPTIONS = module-load probe; no JWT check on preflight)")
    for slug in SLUGS:
        for method in ("OPTIONS", "POST"):
            body = b'{}' if method == "POST" else None
            req = urllib.request.Request("%s/%s" % (BASE, slug), method=method, data=body,
                                         headers={"Content-Type": "application/json"})
            try:
                with urllib.request.urlopen(req, timeout=90) as r:
                    st, txt = r.status, r.read(300).decode("utf-8", "replace")
            except urllib.error.HTTPError as e:
                st, txt = e.code, e.read(300).decode("utf-8", "replace")
            except Exception as e:  # noqa: BLE001
                st, txt = "ERR", str(e)[:160]
            print("   %-18s %-7s %-5s %s" % (slug, method, st, txt.replace("\n", " ")[:110]))


def save():
    os.makedirs(OUT, exist_ok=True)
    print("== saving live bodies to %s" % OUT)
    for slug in SLUGS:
        st, data = api("GET", "/functions/%s/body" % slug)
        if st != 200:
            print("   %-18s FAIL HTTP %s %s" % (slug, st, data[:160]))
            continue
        p = os.path.join(OUT, slug + ".eszip")
        open(p, "wb").write(data)
        print("   %-18s %7d bytes  sha256=%s" % (slug, len(data), hashlib.sha256(data).hexdigest()[:16]))


def restore():
    print("== restoring saved ESZIPs")
    for slug in SLUGS:
        p = os.path.join(OUT, slug + ".eszip")
        if not os.path.isfile(p):
            print("   %-18s no saved body" % slug)
            continue
        data = open(p, "rb").read()
        meta = ('{"verify_jwt": %s}' % ("true" if VERIFY_JWT[slug] else "false")).encode()
        b = (b"--X\r\nContent-Disposition: form-data; name=\"metadata\"\r\n\r\n" + meta + b"\r\n"
             b"--X\r\nContent-Disposition: form-data; name=\"file\"; filename=\"%s.eszip\"\r\n"
             b"Content-Type: application/octet-stream\r\n\r\n" % slug.encode() + data + b"\r\n--X--\r\n")
        st, out = api("POST", "/functions/deploy?slug=%s" % slug, b, "multipart/form-data; boundary=X")
        print("   %-18s HTTP %s %s" % (slug, st, out[:200].decode("utf-8", "replace")))


if __name__ == "__main__":
    a = sys.argv[1] if len(sys.argv) > 1 else "--save"
    if a == "--save":
        save()
    elif a == "--probe":
        probe()
    elif a == "--restore":
        restore()
    else:
        raise SystemExit("usage: --save | --probe | --restore")
