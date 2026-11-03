"""Fetch real byte sizes of live assets: _url_size.py <url> [url2 ...]

Uses a ranged GET so we get a real Content-Length without pulling the whole file.
"""
import sys
import urllib.request

for url in sys.argv[1:]:
    req = urllib.request.Request(url, headers={"User-Agent": "jcode-audit/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read()
            ctype = r.headers.get("Content-Type", "?")
            clen = r.headers.get("Content-Length")
        print("%9d  %8.1f KB  %-24s  %s" % (len(body), len(body) / 1024.0, ctype, url))
        if clen is not None:
            print("           (header Content-Length: %s)" % clen)
    except Exception as exc:
        print("  ERROR  %s  -> %s" % (url, exc))
