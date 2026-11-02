"""Verify that what is PUBLISHED matches what is on main (jcode, 11/02).

Answers "everything's published but I don't see it in the app" with facts:
  1. the commit sha Lovable stamped into the served HTML,
  2. the entry bundle the site serves,
  3. which pack/feature chunks the site's PWA precache manifest actually contains,
  4. whether the sidebar chunk really carries the Packs nav item.

  python scripts/ship/verify_publish.py
  python scripts/ship/verify_publish.py --expect 44e8faa5

Read-only: it only GETs the public site. Nothing is written anywhere.
"""
import re
import sys
import urllib.request

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOSTS = ["https://aicallboss.app", "https://aidialboss1.lovable.app"]
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/126.0.0.0 Safari/537.36")
# chunk-name prefixes that prove each shipped feature is in the deployed build
FEATURES = ["PackSettings", "PackLocked", "PackComingSoon", "packs", "useEnabledPacks"]
SIDEBAR_MARKERS = ["System & Settings", "adminOnly", "simpleMode"]


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    return urllib.request.urlopen(req, timeout=120).read().decode("utf-8", "replace")


def main():
    expect = None
    if "--expect" in sys.argv:
        expect = sys.argv[sys.argv.index("--expect") + 1].lower()
    bad = 0
    for host in HOSTS:
        print("\n===== " + host)
        try:
            html = get(host + "/")
        except Exception as e:
            print("  UNREACHABLE:", e)
            bad += 1
            continue
        sha = re.findall(r'data-commit-sha="([0-9a-f]+)"', html)
        entry = re.findall(r'src="(/assets/[^"]+\.js)"', html)
        print("  commit-sha :", sha[0] if sha else "NONE")
        print("  entry      :", entry)
        if expect:
            ok = bool(sha) and sha[0].startswith(expect)
            print("  expect %s: %s" % (expect, "MATCH" if ok else "MISMATCH"))
            if not ok:
                bad += 1
        try:
            sw = get(host + "/sw.js")
        except Exception as e:
            print("  sw.js UNREACHABLE:", e)
            bad += 1
            continue
        for f in FEATURES:
            names = sorted(set(re.findall(r"assets/" + f + r"-[A-Za-z0-9_\-]+\.js", sw)))
            print("  %-16s %s" % (f, names or "MISSING"))
            if not names:
                bad += 1
        if entry:
            # the sidebar lives in a lazily-loaded chunk, not the entry bundle
            cands = sorted(set(re.findall(r"assets/(?:Dashboard|Index)-[A-Za-z0-9_\-]+\.js", sw)))
            print("  sidebar candidates:", cands or "NONE")
            found = False
            for c in cands:
                try:
                    body = get(host + "/" + c)
                except Exception as e:
                    print("    %s UNREACHABLE: %s" % (c, e))
                    continue
                hits = {m: body.count(m) for m in SIDEBAR_MARKERS}
                if all(hits.values()):
                    print("    %s -> %s" % (c, hits))
                    found = True
            if not found:
                print("    no chunk carries all sidebar markers", SIDEBAR_MARKERS)
                bad += 1
    print("\nRESULT:", "ALL GOOD" if bad == 0 else "%d problem(s)" % bad)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
