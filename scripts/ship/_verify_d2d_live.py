"""Prove the native Door to Door port is actually LIVE on the published site (jcode, 11/02).

`verify_publish.py` proves the site serves the right commit and that the Packs feature chunks are in
the precache. It says nothing about Door to Door. This script proves the port itself shipped:

  1. the commit sha the site serves (optionally must equal --expect),
  2. a `DoorToDoorApp-<hash>.js` chunk exists in the PWA precache manifest,
  3. that chunk really contains the VENDORED app - `__D2D_HOST` (the host global), `view-map` and
     `pfBoard` (ids from the byte-for-byte markup.html) - so it is the port, not a placeholder,
  4. a CSS chunk carries `.d2d-root`, i.e. DoorBoss's own stylesheet shipped,
  5. the Dashboard/Index chunk references the DoorToDoorApp chunk, i.e. the tab is reachable,
  6. the vendored pitch deck is served from our own origin (`/d2d/deck/en/01.jpg` -> 200 image).

Read-only: it only GETs the public site. Nothing is written anywhere.

  python scripts/ship/_verify_d2d_live.py
  python scripts/ship/_verify_d2d_live.py --expect 4d79018c
"""
import re
import sys
import urllib.request

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOSTS = ["https://aicallboss.app", "https://aidialboss1.lovable.app"]
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/126.0.0.0 Safari/537.36")

# ids/text that only exist inside the vendored markup.html + scripts.js + DoorToDoorApp.tsx
APP_MARKERS = ["__D2D_HOST", "view-map", "pfBoard", "d2d-root"]
# the pack's own stylesheet, scoped by _extract_css.py
CSS_MARKER = ".d2d-root"
DECK_PATH = "/d2d/deck/en/01.jpg"


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read().decode("utf-8", "replace"), dict(r.headers)


def head(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"}, method="GET")
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.status, dict(r.headers), r.read(4)


def main():
    expect = None
    if "--expect" in sys.argv:
        expect = sys.argv[sys.argv.index("--expect") + 1].lower()
    bad = 0
    for host in HOSTS:
        print("\n===== " + host)
        try:
            html, _ = get(host + "/")
        except Exception as e:
            print("  UNREACHABLE:", e)
            bad += 1
            continue

        sha = re.findall(r'data-commit-sha="([0-9a-f]+)"', html)
        sha = sha[0] if sha else None
        print("  commit-sha :", sha or "NONE")
        if expect:
            ok = bool(sha) and sha.startswith(expect)
            print("  expect %s: %s" % (expect, "MATCH" if ok else "MISMATCH"))
            if not ok:
                bad += 1

        try:
            sw, _ = get(host + "/sw.js")
        except Exception as e:
            print("  sw.js UNREACHABLE:", e)
            bad += 1
            continue

        # (2) the port's chunk is in the precache manifest
        chunks = sorted(set(re.findall(r"assets/DoorToDoorApp-[A-Za-z0-9_\-]+\.js", sw)))
        print("  DoorToDoorApp chunk:", chunks or "MISSING")
        if not chunks:
            print("    the port is NOT in the deployed build")
            bad += 1
        else:
            body, _ = get(host + "/" + chunks[0])
            # (3) the chunk really carries the vendored app
            hits = {m: body.count(m) for m in APP_MARKERS}
            print("    vendored-app markers:", hits)
            missing = [m for m, n in hits.items() if not n]
            if missing:
                print("    chunk is missing markers:", missing)
                bad += 1

        # (4) DoorBoss's own stylesheet shipped
        css_files = sorted(set(re.findall(r"assets/[A-Za-z0-9_\-]+\.css", sw)))
        css_hit = None
        for c in css_files:
            try:
                text, _ = get(host + "/" + c)
            except Exception:
                continue
            if CSS_MARKER in text:
                css_hit = (c, text.count(CSS_MARKER))
                break
        print("  stylesheet carrying %s: %s" % (CSS_MARKER, css_hit or "MISSING"))
        if not css_hit:
            bad += 1

        # (5) the tab is reachable: the Dashboard/Index chunk points at the port's chunk
        cands = sorted(set(re.findall(r"assets/(?:Dashboard|Index)-[A-Za-z0-9_\-]+\.js", sw)))
        wired = False
        for c in cands:
            try:
                text, _ = get(host + "/" + c)
            except Exception:
                continue
            if "DoorToDoorApp-" in text:
                print("  tab wired in:", c)
                wired = True
                break
        if not wired:
            print("    no Dashboard/Index chunk references the port chunk")
            bad += 1

        # (6) the vendored deck is served from our own origin
        try:
            status, headers, magic = head(host + DECK_PATH)
            ctype = headers.get("Content-Type", "")
            is_jpeg = magic[:3] == b"\xff\xd8\xff"
            print("  deck %s: %s %s jpeg=%s" % (DECK_PATH, status, ctype, is_jpeg))
            if status != 200 or not is_jpeg:
                bad += 1
        except Exception as e:
            print("  deck %s UNREACHABLE: %s" % (DECK_PATH, e))
            bad += 1

    print("\nRESULT:", "ALL GOOD" if bad == 0 else "%d problem(s)" % bad)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
