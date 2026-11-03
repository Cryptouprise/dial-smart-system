"""Vendor the DoorBoss app into Dial Smart as native code.

DoorBoss ships as ONE HTML file holding a small body markup, a stylesheet, a
Leaflet CDN tag, and **fourteen** inline <script> blocks. The blocks are not a
bundle: block 1 is a phone-frame guard, block 2 is the core app (a classic
top-level script whose functions are globals), and blocks 3..14 are add-ons
(call workspace, decks, presentation, video, assistant, area loader,
performance, export guard, deep link, field). Each add-on is an IIFE that talks
to the core through globals, so they MUST run as classic scripts, in order, in
one shared global scope. Wrapping them in a module or a function would break
them.

An earlier version of this file tried to make one `createDoorBossApp()` module
out of everything and, because it searched from the first bare <script> to the
LAST </script> in the document, it swallowed every block AND all the HTML in
between. The result could never parse. This version segments properly.

What this produces, under src/packs/door_to_door/app/:
  markup.html   the body markup, verbatim  (also owned here; unchanged)
  scripts.js    the 14 inline blocks, verbatim and in document order, with
                exactly two one-line seams in the core block (below)

doorboss.css is NOT written here: it is owned by scripts/ship/_extract_css.py,
which keeps the CSS verbatim but scopes every selector under .d2d-root so
DoorBoss's generic class names cannot collide with Dial Smart's.

Leaflet comes from the npm package (the host puts it on window.L) instead of
the CDN <script> tag, which is dropped.

Seams in the core block, both so the host owns something DoorBoss hard-coded:
  1. api()'s body becomes a call to window.__D2D_HOST.api, so every REST path
     is served by Dial Smart's own Supabase. Queue, retry, IndexedDB cache and
     idempotency above it stay byte-for-byte DoorBoss.
  2. one line after the CONFIG literal, Object.assign(CONFIG, host.config), so
     Dial Smart controls the runtime knobs (no service worker inside our SPA,
     no demo data, tiles) while every DoorBoss default stays underneath.

This is NOT an iframe and NOT an embed: the code is served from Dial Smart's
own bundle and mounted in a .d2d-root container, on our own data.

Run from the repo root:
    python scripts/ship/_extract_app.py
"""
import hashlib
import io
import json
import os
import re
import sys

SRC = os.path.join("docs", "wholesale", "doorboss-app", "index.prod.html")
OUT_DIR = os.path.join("src", "packs", "door_to_door", "app")
OUT_MARKUP = os.path.join(OUT_DIR, "markup.html")
OUT_JS = os.path.join(OUT_DIR, "scripts.js")
STALE_JS = os.path.join(OUT_DIR, "app.js")

API_OPEN = "async function api(method, path, body, ms){"
API_LAST = "return r.status===204 ? null : r.json();"
API_REPLACEMENT = (
    "async function api(method, path, body, ms){"
    " return window.__D2D_HOST.api(method, path, body, ms); }"
)
CONFIG_OPEN = "const CONFIG = {"
CONFIG_PATCH = (
    "try { Object.assign(CONFIG, (window.__D2D_HOST && window.__D2D_HOST.config) || {}); }"
    " catch (e) {}"
)

# The add-on blocks each carry their own copy of the transport that used to talk to the
# DoorBoss AI service (doorboss-ai.*) with a doorboss.token JWT. Inside Dial Smart there is
# no such token and no such service, so every one of those transports is rewired onto the
# same host seam the core uses: one function, one auth model, our own Supabase.
#
#   call(path, body)  the shared POST helper in the performance, area-loader and export
#                     blocks: its whole body becomes one host call
#   /ask              the assistant posts inline instead of through call(), so its token
#                     guard and its fetch are seamed line for line
CALL_OPEN = "async function call(path, body) {"
HOST_CALL = "return window.__D2D_HOST.api('POST', path, body || {});"

ASK_GUARD = "      const tok = token(); if (!tok) { line('ask-a err', 'Sign out and sign back in to DoorBoss once, then ask again.'); return; }"
ASK_FETCH = (
    "        const r = await fetch(AI_BASE + '/ask', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok }, body: JSON.stringify(body), signal: AbortSignal.timeout ? AbortSignal.timeout(60000) : undefined });",
    "        let j = {}; try { j = await r.json(); } catch (e) {}",
    "        if (!r.ok) throw new Error(j.error || ('error ' + r.status));",
)
ASK_REPLACEMENT = "        const j = await window.__D2D_HOST.api('POST', '/ask', body);"

# The video block's call panel is an <iframe> pointed at the old DoorBoss AI host
# (AI_BASE + '/call'). Serving that here would be exactly the embed this port exists to
# avoid, and the host behind it is a Daily.co room service we have not rebuilt. So start()
# is gated on the host offering video at all: until Dial Smart wires its own call
# workspace, the button says so instead of loading a foreign page.
VIDEO_OPEN = "    function start(rejoinRoom, mode) {"
VIDEO_GUARD = (
    "      if (!(window.__D2D_HOST && window.__D2D_HOST.video)) { try {"
    " toast('Video calls are not enabled in this app yet.'); } catch (e) {} return; }"
)

BLOCK_RE = re.compile(r"(?is)<(script|style)\b([^>]*)>(.*?)</\1\s*>")
BODY_RE = re.compile(r"(?is)<body\b[^>]*>")


def seam_core(body: str) -> tuple[str, str]:
    """Apply the two host seams to the core block. Returns (code, notes)."""
    lines = body.split("\n")
    notes = []

    api_i = next((i for i, l in enumerate(lines) if API_OPEN in l), None)
    if api_i is None:
        raise SystemExit("core: api() not found")
    last_i = next((j for j in range(api_i, api_i + 40) if API_LAST in lines[j]), None)
    if last_i is None:
        raise SystemExit("core: api() body end not found")
    if lines[last_i + 1].strip() != "}":
        raise SystemExit("core: unexpected line after api() body: %r" % lines[last_i + 1])
    if "fetch(BASE" not in "\n".join(lines[api_i:last_i]):
        raise SystemExit("core: api() does not look like the network function")

    cfg_i = next((i for i, l in enumerate(lines) if l.startswith(CONFIG_OPEN)), None)
    if cfg_i is None:
        raise SystemExit("core: CONFIG not found")
    if cfg_i > api_i:
        raise SystemExit("core: CONFIG is declared after api(); splice order is wrong")
    depth, cfg_end = 0, None
    for i in range(cfg_i, len(lines)):
        depth += lines[i].count("{") - lines[i].count("}")
        if depth == 0 and i > cfg_i:
            cfg_end = i
            break
    if cfg_end is None or lines[cfg_end].strip() != "};":
        raise SystemExit("core: CONFIG literal end not found")

    out = (
        lines[: cfg_end + 1]
        + [CONFIG_PATCH]
        + lines[cfg_end + 1 : api_i]
        + ["  " + API_REPLACEMENT]
        + lines[last_i + 2 :]
    )
    notes.append("config seam after line %d" % (cfg_end + 1))
    notes.append("api() seam lines %d..%d" % (api_i + 1, last_i + 2))
    return "\n".join(out), "; ".join(notes)


def seam_addons(body: str) -> tuple[str, str]:
    """Rewire an add-on block's own transport onto the host. Returns (code, notes).

    Line-exact on purpose: each seam asserts the text it is replacing still looks like the
    AI transport, so a future DoorBoss release that changes it fails loudly here instead of
    silently shipping a block that talks to a service we do not run.
    """
    lines = body.split("\n")
    notes = []
    out = []
    i = 0
    while i < len(lines):
        line = lines[i]

        if line.strip() == CALL_OPEN:
            indent = line[: len(line) - len(line.lstrip())]
            close = indent + "}"
            j = i + 1
            while j < len(lines) and lines[j] != close:
                j += 1
            if j >= len(lines):
                raise SystemExit("add-on: call() has no closing brace")
            region = "\n".join(lines[i : j + 1])
            if "fetch(AI_BASE" not in region:
                raise SystemExit(
                    "add-on: call() is not the AI transport, refusing to seam: %r" % region[:240]
                )
            out.extend([line, indent + "  " + HOST_CALL, close])
            notes.append("call() seam, %d body line(s) replaced" % (j - i - 1))
            i = j + 1
            continue

        if line == ASK_GUARD:
            notes.append("ask token guard removed")
            i += 1
            continue

        if line == VIDEO_OPEN:
            out.extend([line, VIDEO_GUARD])
            notes.append("video start() gated on host.video (no foreign iframe)")
            i += 1
            continue

        if line == ASK_FETCH[0]:
            if tuple(lines[i : i + 3]) != ASK_FETCH:
                raise SystemExit("add-on: /ask fetch block does not match, refusing to seam")
            out.append(ASK_REPLACEMENT)
            notes.append("ask fetch seam")
            i += 3
            continue

        out.append(line)
        i += 1
    body, n = apply_ghl("\n".join(out), 'addon', False)
    if n:
        notes.append("GoHighLevel optional (%d site(s) gated on CONFIG.ghl)" % n)
    return body, "; ".join(notes)


def ghl_subs(scope=None):
    '''The GoHighLevel substitutions, optionally just the ones in one DoorBoss block.

    The core block and the add-on blocks are seamed separately, so the table in _ghl_subs.json
    tags each entry with the block it lives in. _mk_ghl_json.py builds that table from the
    pristine HTML; see it for what each substitution is for.
    '''
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_ghl_subs.json')
    with io.open(path, 'r', encoding='utf-8') as fh:
        subs = json.load(fh)
    return [(s['scope'], s['old'], s['new']) for s in subs if scope is None or s['scope'] == scope]


def apply_ghl(body: str, scope: str, required: bool) -> tuple[str, int]:
    '''Gate every GoHighLevel promise this block carries on CONFIG.ghl.

    The core block carries all of its gates, so required=True there: a needle that stops
    matching stops the extraction instead of shipping a promise the product cannot keep.
    An add-on gate is only in the one add-on that owns it, so required=False leaves the
    other add-ons alone; check_addon_ghl() then proves the gate landed somewhere.
    '''
    applied = 0
    for _, old, new in ghl_subs(scope):
        n = body.count(old)
        if n == 0 and not required:
            continue
        if n != 1:
            raise SystemExit('ghl[%s]: expected exactly 1 occurrence of %r, found %d' % (scope, old[:70], n))
        body = body.replace(old, new)
        applied += 1
    return body, applied


def check_addon_ghl(js: str) -> int:
    '''Prove every add-on gate landed exactly once, and that no old wording survived.'''
    n = 0
    for _, old, new in ghl_subs('addon'):
        if js.count(old):
            raise SystemExit('ghl[addon]: %r survived the extraction' % old[:70])
        got = js.count(new)
        if got != 1:
            raise SystemExit('ghl[addon]: %r applied %d times, expected 1' % (old[:70], got))
        n += 1
    return n


def seam_ghl(body: str) -> tuple[str, str]:
    '''Make GoHighLevel optional instead of assumed. Returns (code, notes).

    DoorBoss assumes GoHighLevel everywhere it touches an appointment or a rep record.
    Dial Smart does not need it, so every one of those sites is gated on CONFIG.ghl,
    which the host sets (false by default, true for a client who really runs on GHL).
    '''
    body, n = apply_ghl(body, 'core', True)
    return body, 'GoHighLevel optional (%d sites gated on CONFIG.ghl)' % n


def main() -> int:
    with io.open(SRC, "r", encoding="utf-8", errors="replace", newline="") as fh:
        text = fh.read()

    def lineno(off):
        return text.count("\n", 0, off) + 1

    blocks = []
    for m in BLOCK_RE.finditer(text):
        blocks.append({
            "start": m.start(),
            "kind": m.group(1).lower(),
            "attrs": m.group(2).strip(),
            "body": m.group(3),
        })
    blocks.sort(key=lambda b: b["start"])

    # --- markup: body content up to the first block that follows <body> ---
    body_open = BODY_RE.search(text)
    if not body_open:
        raise SystemExit("no <body> in source")
    after = [b for b in blocks if b["start"] > body_open.end()]
    markup = text[body_open.end():after[0]["start"]].strip("\n")
    if '<div id="app">' not in markup:
        raise SystemExit("markup does not start with #app")
    if "<script" in markup:
        raise SystemExit("markup still contains a script tag")

    inline = [b for b in blocks if b["kind"] == "script" and not b["attrs"].startswith("src=")]
    external = [b for b in blocks if b["kind"] == "script" and b["attrs"].startswith("src=")]
    styles = [b for b in blocks if b["kind"] == "style"]

    core = [b for b in inline if CONFIG_OPEN in b["body"] and API_OPEN in b["body"]]
    if len(core) != 1:
        raise SystemExit("expected exactly one core block, found %d" % len(core))
    core = core[0]

    parts = []
    seams = 0
    for b in inline:
        body = b["body"].strip("\n")
        note = ""
        if b is core:
            body, note = seam_core(body)
            body, ghl = seam_ghl(body)
            note = (note + "; " + ghl) if ghl else note
        else:
            body, note = seam_addons(body)
            if note:
                seams += 1
        parts.append(
            "/* ---- DoorBoss block, index.prod.html line %d%s ---- */\n%s\n"
            % (lineno(b["start"]), " (core; " + note + ")" if note else "", body)
        )
    js = "\n".join(parts)
    addon_ghl = check_addon_ghl(js)

    # --- guards: this must stay a classic script ---
    if "</script" in js:
        raise SystemExit("scripts.js would break the injected tag")
    if re.search(r"(?m)^\s*(import|export)\s", js):
        raise SystemExit("scripts.js has a top-level import/export; it is not a classic script")
    if "createDoorBossApp" in js:
        raise SystemExit("scripts.js still carries the old module wrapper")

    os.makedirs(OUT_DIR, exist_ok=True)
    with io.open(OUT_MARKUP, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(markup + "\n")
    with io.open(OUT_JS, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(js)

    print("source        : %s" % SRC)
    print("                %d bytes, sha256 %s" % (
        len(text.encode("utf-8")), hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]))
    print("blocks        : %d style, %d inline script, %d external script (dropped)"
          % (len(styles), len(inline), len(external)))
    for b in external:
        print("   dropped    : %s" % b["attrs"][:110])
    print("core block    : source line %d, %d bytes" % (lineno(core["start"]), len(core["body"])))
    print("markup        : %d bytes -> %s" % (len(markup.encode("utf-8")), OUT_MARKUP))
    print("scripts.js    : %d bytes, %d lines -> %s" % (
        len(js.encode("utf-8")), js.count("\n") + 1, OUT_JS))
    left = [i + 1 for i, l in enumerate(js.split("\n")) if "fetch(AI_BASE" in l]
    print("host seams    : %d add-on block(s) rewired onto window.__D2D_HOST.api" % seams)
    print("ghl add-on    : %d site(s) gated on CONFIG.ghl outside the core block" % addon_ghl)
    print("left to seam  : %d fetch(AI_BASE ...) line(s) %s" % (len(left), left[:12]))
    if os.path.isfile(STALE_JS):
        print("STALE         : %s still exists (delete it; it contains raw HTML)" % STALE_JS)
    return 0


if __name__ == "__main__":
    sys.exit(main())
