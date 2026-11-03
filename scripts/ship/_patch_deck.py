"""Seam the DoorBoss deck slides onto this app's own assets (v61).

Content-based, count-asserted, re-runnable, line-ending agnostic.

  scripts.js  - a DECK_BASE() helper, 29 slide URLs, the renderer whitelist, one stale doc line
  host.ts     - the assets.base the helper reads

Usage:  python scripts\\ship\\_patch_deck.py
"""

import io
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'src' / 'packs' / 'door_to_door'


def load(rel):
    p = SRC / rel
    text = io.open(p, 'r', encoding='utf-8', newline='').read()
    eol = '\r\n' if '\r\n' in text else '\n'
    return p, text, eol


def apply(label, text, eol, old, new, expect, done_when_new=None):
    """Replace `old` with `new`. Idempotent: if the result is already there, skip."""
    if done_when_new is not None and text.count(done_when_new) == expect:
        print('  skip   %s (already applied)' % label)
        return text
    n = text.count(old)
    if n != expect:
        raise SystemExit('  FAIL   %s: expected %d occurrence(s), found %d' % (label, expect, n))
    text = text.replace(old, new)
    print('  seam   %s (%d)' % (label, n))
    return text


# ---------------------------------------------------------------- scripts.js

p, text, eol = load('app/scripts.js')
print('scripts.js  (%s, %d lines)' % ('CRLF' if eol == '\r\n' else 'LF', text.count(eol) + 1))
orig = text

MARKER = "try { Object.assign(CONFIG, (window.__D2D_HOST && window.__D2D_HOST.config) || {}); } catch (e) {}"
HELPER = ("/* Deck slides come from this app's own assets, not the DoorBoss service (v61). */" + eol +
          "function DECK_BASE(){ try { return String((window.__D2D_HOST && window.__D2D_HOST.assets && window.__D2D_HOST.assets.base) || ''); } catch (e) { return ''; } }")

text = apply('deck base helper', text, eol, MARKER, MARKER + eol + HELPER, 1,
             done_when_new='function DECK_BASE()')

text = apply('slide urls', text, eol,
             "src: 'https://doorboss-ai.178-156-248-248.sslip.io/deck/",
             "src: DECK_BASE() + '/deck/", 29,
             done_when_new="src: DECK_BASE() + '/deck/")

text = apply('renderer whitelist', text, eol,
             r'/^https:\/\/doorboss-ai\.178-156-248-248\.sslip\.io\/deck\/(en|es)\/\d{2}\.jpg$/',
             r'/\/deck\/(en|es)\/\d{2}\.jpg$/', 1,
             done_when_new=r'/\/deck\/(en|es)\/\d{2}\.jpg$/')

text = apply('stale ask doc line', text, eol,
             "The question goes to the Hermes doorboss-ai service (POST /ask) with the rep's own DoorBoss sign-in token;",
             "The question goes to this app's own host (POST /ask through window.__D2D_HOST.api);", 1,
             done_when_new="The question goes to this app's own host")

if text != orig:
    bak = ROOT / 'scripts' / 'ship' / '_scripts.js.bak-v62'
    if not bak.exists():
        io.open(bak, 'w', encoding='utf-8', newline='').write(orig)
        print('  backup %s' % bak.name)
    io.open(p, 'w', encoding='utf-8', newline='').write(text)
    print('  wrote  scripts.js')
else:
    print('  clean  scripts.js (no change needed)')

left = text.count('doorboss-ai')
print('  left   %d "doorboss-ai" reference(s)' % left)
assert left == 0, 'a DoorBoss service reference survived'

# ------------------------------------------------------------------- host.ts

p, text, eol = load('host.ts')
print('host.ts     (%s, %d lines)' % ('CRLF' if eol == '\r\n' else 'LF', text.count(eol) + 1))
orig = text

CONFIG_BLOCK = ("    config: {" + eol +
                "      noServiceWorker: true," + eol +
                "      intakeStart: false," + eol +
                "      afterCall: false," + eol +
                "      ...options.config," + eol +
                "    },")

ASSETS_BLOCK = CONFIG_BLOCK + eol + eol + (
    "    /**" + eol +
    "     * Where this app serves its own static assets. The vendored app builds its deck slide URLs" + eol +
    "     * from this, so the pitch deck is served by Dial Smart instead of the DoorBoss service." + eol +
    "     */" + eol +
    "    assets: {" + eol +
    "      base: '/d2d'," + eol +
    "    },")

text = apply('assets base', text, eol, CONFIG_BLOCK, ASSETS_BLOCK, 1,
             done_when_new="    assets: {")

if text != orig:
    bak = ROOT / 'scripts' / 'ship' / '_host.ts.bak-v62'
    if not bak.exists():
        io.open(bak, 'w', encoding='utf-8', newline='').write(orig)
        print('  backup %s' % bak.name)
    io.open(p, 'w', encoding='utf-8', newline='').write(text)
    print('  wrote  host.ts')
else:
    print('  clean  host.ts (no change needed)')

print('OK')
