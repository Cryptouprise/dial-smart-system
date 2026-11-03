"""v61 port patch: seam the video block onto the host and drop every DoorBoss service URL.

Line-indexed (not text-matched) so CRLF and long lines cannot bite. Applies bottom-up.
Usage: python scripts\\ship\\_patch_video.py
"""
import io
import os
import shutil

APP = 'src/packs/door_to_door/app/scripts.js'
HOST = 'src/packs/door_to_door/host.ts'

VIDEO_CASE = [
    "      /* The call panel ------------------------------------------------------------------------ */",
    "      /* The video call window is not in this pack (the app opens it only when the host exposes",
    "         `video`), but the panel around it still asks four things, so they are answered here rather",
    "         than left to reach the DoorBoss service. */",
    "      case 'video': {",
    "        const sub = parts[1] ?? '';",
    "        if (sub === 'recordings') return { recordings: [] };",
    "        if (sub === 'room') return { ok: true };",
    "        if (sub === 'recording') fail(verb, path, 400, 'recordings are not wired into this app yet');",
    "        if (sub === 'complete') fail(verb, path, 400, 'the intake record is not wired into this app yet');",
    "        fail(verb, path, 404, `Door to Door has no route for ${route}`);",
    "        break;",
    "      }",
    "",
]

CONFIG_COMMENT = [
    "     * Merged over the app's own CONFIG by the extractor's seam. The service worker is switched off",
    "     * because this runs inside Dial Smart's own bundle (a worker registered here would cache the whole",
    "     * app), the intake button is off because that route is not in this pack, and the after-call writer",
    "     * is off for the same reason - it posts the case file to that intake route.",
]

APP_EDITS = [
    # ---- the two service constants become host-derived -------------------------------
    (2659, 2660, [
        "    /* v61 (port): this pack runs inside Dial Smart, so nothing here calls the DoorBoss service. The call",
        "       panel only opens when the host exposes __D2D_HOST.video, and every URL and request below goes",
        "       through that host. Dial Smart has no video service yet, so the buttons say so instead. */",
        "    const VIDEO_BASE = () => String((window.__D2D_HOST && window.__D2D_HOST.video && window.__D2D_HOST.video.base) || '').replace(/\\/$/, '');",
        "    const VIDEO_ORIGIN = () => { try { return new URL(VIDEO_BASE()).origin; } catch (e) { return location.origin; } };",
    ], "const AI_BASE = String(window.DOORBOSS_AI_BASE"),
    # ---- postMessage target ----------------------------------------------------------
    (2668, 2668, [
        "    const post = m => { try { if (V.win && !V.win.closed) V.win.postMessage(m, VIDEO_ORIGIN()); } catch (e) {} };",
    ], "const post = m =>"),
    # ---- the recordings list ---------------------------------------------------------
    (2689, 2690, [
        "        const j = await window.__D2D_HOST.api('POST', '/video/recordings', { property_id: pid });",
        "        if (V.recsFor === pid) { V.recs = Array.isArray(j && j.recordings) ? j.recordings : []; paint(); }",
    ], "const r = await fetch(AI_BASE + '/recordings/list'"),
    # ---- opening one recording -------------------------------------------------------
    (2696, 2698, [
        "        const j = await window.__D2D_HOST.api('POST', '/video/recording', { id: rid });",
        "        if (j && j.url) { if (w) w.location = j.url; else window.open(j.url, '_blank'); } else { if (w) w.close(); try { toast((j && j.error) || 'Could not open the recording'); } catch (e) {} }",
    ], "const r = await fetch(AI_BASE + '/recordings/link'"),
    # ---- the docked panel's src ------------------------------------------------------
    (2708, 2708, [
        "      fr.src = VIDEO_BASE() + '/call?o=' + encodeURIComponent(location.origin) + '&embed=1'; document.body.appendChild(fr); document.documentElement.classList.add('vc-docked'); V.frame = fr; return fr.contentWindow;",
    ], "fr.src = AI_BASE + '/call?o='"),
    # ---- the pop-out fallback --------------------------------------------------------
    (2719, 2719, [
        "      if (!w) { try { w = window.open(VIDEO_BASE() + '/call?o=' + encodeURIComponent(location.origin), 'doorboss_video', 'width=1180,height=820'); } catch (e) {} }   /* fallback: the old pop-out */",
    ], "if (!w) { try { w = window.open(AI_BASE + '/call?o='"),
    # ---- the after-call write-back ---------------------------------------------------
    (2744, 2750, [
        "    async function sendBack(body) {",
        "      return await window.__D2D_HOST.api('POST', '/video/complete', body);",
        "    }",
    ], "async function sendBack(body) {"),
    # ---- do not register a writer whose route this pack does not have ------------------
    (2769, 2769, [
        "    /* v61 (port): the after-call writer posts the case file to the intake route. This pack has no",
        "       intake table, so the writer is not registered at all - a request that could only fail is worse",
        "       than none. A host that wires an intake sets config.afterCall and this registers again. */",
        "    if (!(typeof CONFIG !== 'undefined' && CONFIG.afterCall === false) && Array.isArray(CW.hooks.onFinish)) CW.hooks.onFinish.push(writeBack);",
    ], "CW.hooks.onFinish.push(writeBack)"),
    # ---- the call window's own origin ------------------------------------------------
    (2774, 2774, [
        "      if (!V.win || e.source !== V.win || e.origin !== VIDEO_ORIGIN()) return; const m = e.data || {};",
    ], "e.origin !== AI_ORIGIN"),
    # ---- ending a room we can no longer reach ----------------------------------------
    (2807, 2807, [
        "      if (r && r.room) { try { window.__D2D_HOST.api('POST', '/video/room/end', { room_name: r.room }).catch(() => {}); } catch (x) {} } }",
    ], "if (r && r.room) { try { fetch(AI_BASE + '/room/end'"),
    # ---- the module's own export ------------------------------------------------------
    (2886, 2886, [
        "    CW.video = { state: V, start, endCall, VIDEO_ORIGIN, retryQueue };",
    ], "CW.video = { state: V, start, endCall, AI_ORIGIN, retryQueue };"),
    # ---- four dead declarations (their blocks call the host already) -------------------
    (2897, 2897, [], "const AI_BASE = String(window.DOORBOSS_AI_BASE"),
    (3006, 3006, [], "const AI_BASE = String(window.DOORBOSS_AI_BASE"),
    (3066, 3066, [], "const AI_BASE = String(window.DOORBOSS_AI_BASE"),
    (3201, 3201, [], "const AI_BASE = String(window.DOORBOSS_AI_BASE"),
]

HOST_EDITS = [
    # ---- answer the call panel's four routes -----------------------------------------
    (1935, 1935, VIDEO_CASE + [
        "      /* Side doors ---------------------------------------------------------------------------- */",
    ], "Side doors"),
    # ---- the config flag that keeps the after-call writer off --------------------------
    (1969, 1971, CONFIG_COMMENT, "Merged over the app's own CONFIG"),
    (1975, 1975, [
        "      intakeStart: false,",
        "      afterCall: false,",
    ], "intakeStart: false,"),
]


def read(path):
    return io.open(path, 'r', encoding='utf-8', newline='').read()


def eol(text):
    """The file's own line ending, so a patch never rewrites every line's ending."""
    return '\r\n' if '\r\n' in text else '\n'


def locate(lines, edits):
    """Find each edit's real line by its marker. Line numbers are a hint, not a contract.

    The extractor's output shifts whenever a seam is added or removed, so the recorded
    line numbers drift and the patch would abort on a file that is otherwise fine. Each
    edit is located by scanning forward for its marker from the previous edit's position;
    order is what makes the repeated markers unambiguous (four dead `const AI_BASE` lines
    share one marker). Every marker must be unique within its own span.
    """
    found = []
    cursor = 0
    for start, end, new, marker in sorted(edits, key=lambda e: e[0]):
        i = cursor
        while i < len(lines) and marker not in lines[i]:
            i += 1
        if i >= len(lines):
            raise SystemExit('ABORT: no line at or after %d holds %r' % (cursor + 1, marker))
        if start != i + 1:
            print('  move   line %d -> %d  (%s)' % (start, i + 1, marker[:60]))
        found.append((i, end - start + 1, new, marker))
        cursor = i + 1
    return found


def apply(path, edits):
    text = read(path)
    nl = eol(text)
    lines = text.split(nl)
    for i, span, new, marker in sorted(locate(lines, edits), key=lambda e: -e[0]):
        lines[i:i + span] = new
    io.open(path, 'w', encoding='utf-8', newline='').write(nl.join(lines))


PLAN = (
    (APP, APP_EDITS, lambda text: 'AI_BASE' in text),
    (HOST, HOST_EDITS, lambda text: "case 'video'" not in text),
)

for target, edits, needs in PLAN:
    if not needs(read(target)):
        print('skip   %s (already patched)' % target)
        continue
    bak = target + '.bak-v61'
    if not os.path.exists(bak):   # never overwrite a backup with a patched file
        shutil.copyfile(target, bak)
    apply(target, edits)

# --- prove nothing still points at the DoorBoss service --------------------------------
for target in (APP, HOST):
    text = read(target)
    for bad in ('AI_BASE', 'AI_ORIGIN', 'DOORBOSS_AI_BASE'):
        if bad in text:
            raise SystemExit('LEFTOVER %s in %s' % (bad, target))
    print('clean  %s  (no service seam left)' % target)

app = read(APP)
for want in ("'/video/recordings'", "'/video/recording'", "'/video/complete'", "'/video/room/end'", 'VIDEO_BASE()'):
    if want not in app:
        raise SystemExit('MISSING %s in the app' % want)
print('seams  %d video calls routed through the host' % sum(app.count(w) for w in (
    "'/video/recordings'", "'/video/recording'", "'/video/complete'", "'/video/room/end'")))
print('OK')
