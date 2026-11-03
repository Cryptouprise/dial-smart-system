"""seam audit: the vendored DoorBoss app must reach the outside world only
through the host seam, and every route it asks for must be answered.

The app talks to the outside world through exactly four things:

    window.__D2D_HOST.config
    window.__D2D_HOST.assets.base
    window.__D2D_HOST.api(method, path, body, ms)
    window.__D2D_HOST.video

Two checks:

  1. ROUTES - every quoted '/route' literal in app/scripts.js, reduced to its
     first segment, must appear in host.ts's `case '<segment>':` dispatch
     table. Anything else is a feature the app asks for that the port cannot
     answer.

  2. BYPASS - any `fetch(` left in the app is a hole in the seam. The only
     ones allowed are the two portal helpers, which are user- or query-param
     gated, try/catch wrapped, and degrade to a friendly message.

Exit code 1 if either check fails.
"""
import io
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
APP = os.path.join(ROOT, 'src', 'packs', 'door_to_door', 'app', 'scripts.js')
HOST = os.path.join(ROOT, 'src', 'packs', 'door_to_door', 'host.ts')

app = io.open(APP, 'r', encoding='utf-8', errors='replace').read()
host = io.open(HOST, 'r', encoding='utf-8', errors='replace').read()

# Quoted '/route' literals that are NOT api-seam routes, with the reason.
# Keep this list short and justified; it is the only escape hatch.
NOT_ROUTES = {
    'mo': 'text suffix: told them "$x/mo"',
    'api': "the app's own CONFIG.apiBase default, dead since the api() seam took over",
    'login': 'auth-wall redirect target (browser navigation, not the data seam)',
    'intake': 'intake deep link, unreachable: host sets intakeStart false',
}

# fetch() targets the app is allowed to keep.
ALLOWED_FETCH = ['/api/portal/intakes/', '/api/portal/my-card']

fails = []

# ---------- 1. routes ----------
route_lits = set(re.findall(r"""['"](/[A-Za-z][A-Za-z0-9_\-/]*)['"]""", app))
route_lits = {r for r in route_lits if not r.startswith(('/assets', '/img', '/css', '/js'))}

first_seg = {}
for r in sorted(route_lits):
    first_seg.setdefault(r.strip('/').split('/')[0], []).append(r)

host_segs = set(re.findall(r"""case\s+'([A-Za-z0-9_\-]+)'\s*:""", host))
asked = set(first_seg)

print('=== ROUTES: app asks for %d family(ies), host answers %d ===' % (len(asked), len(host_segs)))
for seg in sorted(asked):
    ok = seg in host_segs
    note = ''
    if not ok and seg in NOT_ROUTES:
        ok, note = True, '  (known non-route: %s)' % NOT_ROUTES[seg]
    print('  %s  /%-14s  %s%s' % ('OK  ' if ok else 'MISS', seg,
                                  ', '.join(sorted(first_seg[seg]))[:110], note))
    if not ok:
        fails.append('app asks for /%s, host.ts has no case for it' % seg)

unused = sorted(host_segs - asked)
if unused:
    print('  host routes the app never asks for (dead seam): %s' % ', '.join('/' + u for u in unused))
else:
    print('  every host route is asked for by the app')

# ---------- 2. bypass ----------
print('')
print('=== BYPASS: raw fetch() left in the app ===')
fetches = [ln.strip() for ln in app.split('\n') if 'fetch(' in ln]
for ln in fetches:
    target = re.search(r"""fetch\(\s*['"]([^'"]+)""", ln)
    tgt = target.group(1) if target else '(computed)'
    ok = tgt in ALLOWED_FETCH
    print('  %s  %s' % ('OK  ' if ok else 'LEAK', tgt))
    if not ok:
        fails.append('raw fetch to %s bypasses the host seam' % tgt)

# ---------- verdict ----------
print('')
if fails:
    for f in fails:
        print('FAIL: %s' % f)
    sys.exit(1)
print('SEAM COMPLETE: every route answered, no unguarded fetch')
