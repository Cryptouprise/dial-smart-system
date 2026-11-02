"""Patch the two wholesale docs with the post-publish verification (jcode, 11/02).

Byte-safe: reads bytes, refuses mixed line endings, matches on the LF-normalised
string, asserts a unique match, writes back with the file's own ending.
"""
import io, os, sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

RUNBOOK = r"docs\wholesale\SHIP-RUNBOOK.md"
HANDOFF = r"docs\wholesale\HANDOFF-2026-11-02.md"

RUNBOOK_A_OLD = "; Charles only needs to click **Publish** in Lovable),"
RUNBOOK_A_NEW = (
    "; **Publish is DONE** - the live site serves this code, verified by jcode 11/02 23:20; "
    "see the Frontend row below),"
)

RUNBOOK_B_OLD = "Only step left: click **Publish** in Lovable. |"
RUNBOOK_B_NEW = (
    "**Publish DONE 11/02, verified by jcode 11/02 23:20.** The live site serves this build: "
    "`https://aicallboss.app/` and `https://aidialboss1.lovable.app/` both serve "
    "`/assets/index-DHzku0tw.js` with `data-commit-sha=cef3ad379e2b56c47468493788c0cd7e2f9ec076`, "
    "and their `/sw.js` precache manifest lists `PackSettings-5W02wQva.js`, `PackLocked-Dq8ni493.js`, "
    "`PackComingSoon-Cn8w9ubT.js`, `packs-DH-kXtE4.js`, `useEnabledPacks-Ctr0jpab.js`. The live sidebar "
    "chunk defines the Packs nav item (`title` Packs, `value` packs) in the `System & Settings` group. "
    "The UI is reachable but invisible until a pack is enabled - see HANDOFF-2026-11-02.md, "
    "\"Post-publish verification\". |"
)

HANDOFF_OLD = (
    "**Charles only needs to click Publish in Lovable.** No Lovable MCP tool is connected to this "
    "session, so `deploy_project` cannot be fired from here."
)

HANDOFF_NEW = HANDOFF_OLD + """

### Post-publish verification + where each piece actually lives (jcode, 11/02 23:20)

**FACT: the published app IS the merged code.** `https://aicallboss.app/` and `https://aidialboss1.lovable.app/` both
serve `/assets/index-DHzku0tw.js` with `data-commit-sha=cef3ad379e2b56c47468493788c0cd7e2f9ec076` (current `main`), and
their `/sw.js` precache manifest lists `PackSettings-5W02wQva.js`, `PackLocked-Dq8ni493.js`,
`PackComingSoon-Cn8w9ubT.js`, `packs-DH-kXtE4.js`, `useEnabledPacks-Ctr0jpab.js`. The live sidebar chunk contains
the `Packs` nav item (`title` Packs, `value` packs) in the `System & Settings` group and a `case` for the `packs` tab
in the render switch. So the Publish click worked and nothing is stale at the origin.

**Then why is it invisible? Four separate reasons, all facts:**

1. **Pack tabs are gated on `organizations.settings -> 'packs'`, which is `null` for the live org.**
   `select settings -> 'packs' from organizations where id = '11824e05-...'` returned `null`, so `normalizePacks(null)`
   is `[]`, `getPackNavigation([])` returns no groups, and the pack tabs (`se-workspace`, `wh-properties`,
   `d2d-knock-list`) are simply not in the sidebar. That is by design (`src/lib/packs.ts:5-8`).
2. **The one always-on new surface, `Packs`, sits in the `System & Settings` group, which is `defaultOpen: false`**
   (`src/components/DashboardSidebar.tsx:157-166`) and carries no `simpleMode: true` flag, so it is **hidden entirely
   in Simple Mode** (`DashboardSidebar.tsx:181-188`). Path: be in Full Mode, expand System & Settings, click Packs.
3. **Every pack screen is a placeholder.** `renderContent` maps all three pack tabs to `PackComingSoon`
   (`src/components/Dashboard.tsx:511-515`), which renders "Coming soon - This screen is part of the <pack> pack and is
   not built yet." The real pack screens are phase 3.
4. **BrowserPhone and CoachPanel have no host screen at all.** `CallWorkspace.tsx` is not written
   (`phases/CALL-SCREEN-PORT.md:38`, build-order step 1). Repo-wide, `src/lib/voice/BrowserPhone.ts` and
   `src/components/call/CoachPanel.tsx` have **zero importers** (only their own files, the edge functions and the docs
   mention them), so there is no UI to see for the call screen or the live coach yet.

**Billing lock** is wired (`src/components/ProtectedRoute.tsx:57` -> `BillingPaused`) but inert: the live org has
`billing_enabled = false`. **Toggling a pack does work**: Packs -> switch -> `set_org_packs(p_org_id, p_packs)`; the RPC
is live (`set_org_packs(uuid, text[])`, `prosecdef = true`), and enabling a pack adds its sidebar group immediately.

**Product gap worth fixing:** today the entire industry-packs proposition is invisible to a new customer - one entry,
buried in a collapsed group, Full Mode only, leading to three "Coming soon" cards. If packs are the product, the Packs
screen needs to be reachable (Simple Mode, a first-login prompt, or the group auto-opened)."""


def patch(path, pairs):
    raw = io.open(path, "rb").read()
    crlf = raw.count(b"\r\n")
    lf = raw.count(b"\n")
    lone = lf - crlf
    if crlf and lone:
        raise SystemExit("REFUSE: %s has mixed endings (crlf=%d lone_lf=%d)" % (path, crlf, lone))
    text = raw.decode("utf-8")
    norm = text.replace("\r\n", "\n")
    for old, new in pairs:
        n = norm.count(old)
        if n != 1:
            raise SystemExit("REFUSE: anchor matched %d times in %s: %r" % (n, path, old[:80]))
        norm = norm.replace(old, new)
    out = norm.replace("\n", "\r\n") if crlf else norm
    io.open(path, "wb").write(out.encode("utf-8"))
    print("patched %s: %d -> %d bytes (crlf=%d lone_lf=%d)"
          % (path, len(raw), len(out.encode("utf-8")), out.count("\r\n"), out.count("\n") - out.count("\r\n")))


patch(RUNBOOK, [(RUNBOOK_A_OLD, RUNBOOK_A_NEW), (RUNBOOK_B_OLD, RUNBOOK_B_NEW)])
patch(HANDOFF, [(HANDOFF_OLD, HANDOFF_NEW)])
print("OK")
