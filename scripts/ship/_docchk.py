"""Integrity check for the illustrated explainer and the images it depends on.

Confirms three things that would silently break the page:
  - the HTML is still LF-only (the repo's docs are mixed, and this file must stay LF)
  - it is pure ASCII (so it renders identically regardless of codepage)
  - every image it references actually exists on disk, with its real byte size
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HTML = os.path.join(ROOT, "docs", "doorboss-port-value.html")
IMGDIR = os.path.join(ROOT, "docs", "img")

raw = open(HTML, "rb").read()
text = raw.decode("utf-8")

crlf = raw.count(b"\r\n")
lf = raw.count(b"\n") - crlf
nonascii = sorted({c for c in text if ord(c) > 127})

print("HTML  %s" % HTML)
print("  bytes      %d" % len(raw))
print("  lines      %d" % text.count("\n"))
print("  LF / CRLF  %d / %d %s" % (lf, crlf, "OK (LF only)" if crlf == 0 else "PROBLEM: has CRLF"))
print("  non-ascii  %s" % (nonascii if nonascii else "none - OK"))

refs = []
for i, line in enumerate(text.split("\n"), 1):
    if "<img " in line and "src=" in line:
        src = line.split('src="', 1)[1].split('"', 1)[0]
        refs.append((i, src))

print("\nIMAGES referenced by the page (%d):" % len(refs))
missing = 0
total = 0
for line_no, src in refs:
    p = os.path.join(os.path.dirname(HTML), src.replace("/", os.sep))
    if os.path.exists(p):
        n = os.path.getsize(p)
        total += n
        print("  line %-4d %-26s %9d bytes  OK" % (line_no, src, n))
    else:
        missing += 1
        print("  line %-4d %-26s  MISSING" % (line_no, src))
print("  total payload %.2f MB" % (total / 1048576.0))

print("\nSTANDALONE SECTION SHOTS:")
for name in ("doorboss-pics.png", "doorboss-fits.png", "doorboss-port-value.png"):
    p = os.path.join(ROOT, "docs", name)
    if os.path.exists(p):
        print("  %-30s %9d bytes  OK" % (name, os.path.getsize(p)))
    else:
        print("  %-30s  not written" % name)

print("\nRESULT: %s" % ("PASS" if not missing and crlf == 0 and not nonascii else "FAIL"))
sys.exit(0 if not missing and crlf == 0 and not nonascii else 1)
