"""standalone audit: does anything in the door_to_door pack (or its typed
client) reach the network for GoHighLevel at runtime, with GHL off?

Walks src/packs/door_to_door + src/lib/d2dApi.ts and reports any line
containing a GHL network marker. Exit code = number of hits.
"""
import io
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
TARGETS = [os.path.join(ROOT, 'src', 'packs', 'door_to_door'),
           os.path.join(ROOT, 'src', 'lib', 'd2dApi.ts')]

MARKERS = [
    'leadconnector',
    'highlevel',
    'high-level',
    'gohighlevel',
    'rest.gohighlevel',
    'ghl_api',
    'ghlApi',
    'ghlFetch',
    'api/ghl',
    '/ghl/',
    'ghl_token',
    'ghlToken',
    'PIT_',
    'locationId',
]
EXT = {'.ts', '.tsx', '.js', '.jsx', '.mjs', '.html', '.css', '.json', '.md'}
SKIP_DIR = {'node_modules', 'dist', '.git', 'coverage', '.vite', '__pycache__'}


def walk(target):
    if os.path.isfile(target):
        yield target
        return
    for base, dirs, files in os.walk(target):
        dirs[:] = [d for d in dirs if d not in SKIP_DIR]
        for f in files:
            if os.path.splitext(f)[1].lower() in EXT:
                yield os.path.join(base, f)


hits = 0
scanned = 0
for t in TARGETS:
    for path in walk(t):
        scanned += 1
        try:
            text = io.open(path, 'r', encoding='utf-8', errors='replace').read()
        except OSError:
            continue
        for i, line in enumerate(text.split('\n'), 1):
            low = line.lower()
            for m in MARKERS:
                if m.lower() in low:
                    hits += 1
                    rel = os.path.relpath(path, ROOT)
                    print('%s:%d  [%s]  %s' % (rel, i, m, line.strip()[:160]))
                    break

print('')
print('scanned %d file(s), %d GHL network marker line(s)' % (scanned, hits))
sys.exit(1 if hits else 0)
