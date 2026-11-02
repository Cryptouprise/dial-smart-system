"""Prepend the 11/02 23:35 checkpoint block (jcode) and mark the older NULL claim stale."""
import io, sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

P = r"C:\Users\charl\Infinite-AI\jarvis-ops\session-ledger\CHECKPOINT_latest.md"

HEAD = """# CHECKPOINT 2026-11-02 23:35 UTC (jcode) - P1731: the packs bug is FIXED (stale sidebar store); Publish #2 needed

## Done this session (jcode) - source fix + docs; no live writes, no Publish
- **Charles enabled the Door to Door pack and reported "nothing changed". Both halves explained with facts:**
  - **The write landed.** Live org `11824e05-...` now reads `settings -> 'packs' = ["door_to_door"]`
    (`jsonb_typeof = array`), `subscription_status = active`, `billing_enabled = false`. `set_org_packs` works end to
    end. The pack was genuinely ON.
  - **The UI was the bug.** `useEnabledPacks` stored its result in per-component `useState`, so `PackSettings`'s
    `await refresh()` refreshed only its own instance while `DashboardSidebar` held a **separate, stale** one
    (`DashboardSidebar.tsx:236`). The group therefore appeared only after a full page reload - that is the "nothing
    changed".
- **FIXED, commit `044e10d9` (pushed; `origin/main = ca1de5ea`):**
  - `src/hooks/useEnabledPacks.ts` rewritten as ONE module-level store read via `useSyncExternalStore`, shared by every
    consumer, so the sidebar and the Packs screen update the instant a pack is toggled. `loading` stays true until
    *this* org's packs resolve, so a pack tab never flashes `PackLocked` on first paint.
  - `DashboardSidebar.tsx:211-217` - pack groups are emitted `defaultOpen: true`, so enabling a pack visibly opens its
    group instead of adding a collapsed one at the bottom.
  - `PackSettings.tsx` - card copy now says an enabled pack adds its own sidebar group; the toast names the pack and
    says its group was added/removed.
  - Gates: `npm run typecheck` clean, `npm run build` green (new chunks `useEnabledPacks-DxchT5A6.js`,
    `PackSettings-DTv4wjH4.js`, `Index-wKifhNAN.js`; `packs-DH-kXtE4.js` unchanged).
  - Docs: `docs/wholesale/HANDOFF-2026-11-02.md` gained "Bug found + fixed while Charles tried it" (commit `ca1de5ea`).
- **What packs ARE, plainly:** optional industry modules. Core screens (leads, campaigns, calls, texting, numbers, DNC,
  settings, billing) are never pack-gated. Each pack adds exactly ONE sidebar group with ONE item (`src/lib/packs.ts`):
  Solar Exit -> "Solar Exit workspace" (`se-workspace`); Wholesale RE -> "Properties" (`wh-properties`); Door to Door ->
  "Knock list" (`d2d-knock-list`). All three items still render `PackComingSoon` (`Dashboard.tsx:511-515`).
  **Packs are the packaging; the screens are phase 3.**
- **Charles must click Publish again** to get the fix - the live build `cef3ad37` predates `044e10d9`.

## Still open on P1731 (unchanged by this session)
- Phase 3: real pack screens. Door to Door "Knock list" is the one Charles enabled. Wholesale also still needs its 5
  tables (`20261028210000_wholesale_core.sql`, drafted, NOT applied).
- `BrowserPhone` (`src/lib/voice/BrowserPhone.ts`) and `CoachPanel` (`src/components/call/CoachPanel.tsx`) still have
  **zero importers**; `CallWorkspace.tsx` not written (`phases/CALL-SCREEN-PORT.md:38`).
- Tests still owed (Charles present): p4a T1/T2/T4-T8, p5 7.2/7.4/7.5, p4b T3/T7, api-gateway T1/T6/T7
  (live target +12145291531).
- Open decision for Charles: build the real pack screens, or hide pack groups until they exist.

"""

A_OLD = "  1. `organizations.settings -> 'packs'` is **NULL** for the live org"
A_NEW = ("  1. **[STALE 23:35 - Charles enabled it, so it now reads `[\"door_to_door\"]`]** "
         "`organizations.settings -> 'packs'` WAS **NULL** for the live org")

raw = io.open(P, "rb").read()
if raw.count(b"\r\n"):
    raise SystemExit("REFUSE: checkpoint is no longer LF-only")
s = raw.decode("utf-8")

old_title = s.split("\n")[0]
if not old_title.startswith("# CHECKPOINT 2026-11-02 23:20"):
    raise SystemExit("REFUSE: unexpected head line: %r" % old_title)
if s.count(old_title) != 1:
    raise SystemExit("REFUSE: head title not unique")
new_title = ("## Previous session 2026-11-02 23:20 UTC (jcode) - P1731: publish verified; "
             "the four reasons the packs UI looked empty")
s = s.replace(old_title, new_title, 1)

if s.count(A_OLD) != 1:
    raise SystemExit("REFUSE: NULL-claim anchor matched %d" % s.count(A_OLD))
s = s.replace(A_OLD, A_NEW)

out = (HEAD + s).encode("utf-8")
io.open(P, "wb").write(out)
print("checkpoint %d -> %d bytes; crlf=%d lone_lf=%d" % (len(raw), len(out), out.count(b"\r\n"),
                                                          out.count(b"\n") - out.count(b"\r\n")))
