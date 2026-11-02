"""Record the pack-visibility bug + fix in HANDOFF-2026-11-02.md (jcode, 11/02 23:30)."""
import io, sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

PATH = r"docs\wholesale\HANDOFF-2026-11-02.md"

A_OLD = "screen needs to be reachable (Simple Mode, a first-login prompt, or the group auto-opened)."

A_NEW = A_OLD + """

### Bug found + fixed while Charles tried it (jcode, 11/02 23:30)

Charles enabled **Door to Door** and reported "nothing changed". Facts:

- **The write landed.** `organizations.settings -> 'packs'` reads back as `["door_to_door"]` (`jsonb_typeof = array`)
  on the live org, so `set_org_packs` works end to end. The pack was on; the screen just did not know.
- **The UI never updated - that was the bug.** `useEnabledPacks` kept its result in per-component `useState`, so
  `PackSettings`'s `await refresh()` refreshed only its own instance. `DashboardSidebar` holds a **separate** instance
  (`DashboardSidebar.tsx:236`), so the new group appeared only after a full page reload.
- **Fixed (commit `044e10d9`).** `useEnabledPacks` is now one module-level store read through `useSyncExternalStore`,
  so the sidebar and the Packs screen share one value and update the instant a pack is toggled. `getPackNavigation`
  now emits pack groups with `defaultOpen: true`, so enabling a pack opens its group instead of adding a collapsed one
  at the bottom (this also softens reason 2 in the list above). The toast names the pack and says its group was added.
  `npm run typecheck` + `npm run build` green; new chunks `useEnabledPacks-DxchT5A6.js`, `PackSettings-DTv4wjH4.js`.
- **Still true:** behind `Door to Door > Knock list` there is only `PackComingSoon`. Packs are the packaging; the
  screens are phase 3, and the wholesale pack also still needs its 5 tables (`20261028210000_wholesale_core.sql`,
  drafted, NOT applied)."""

B_OLD = ("- Leave the other untracked files alone (.deployed-*.ts, _pn_*.json, _retell_*.json, the mcp-server backup, "
         "the test harness). They predate this session.")
B_NEW = ("- 11/02 23:20-23:30 (jcode), after the Publish: `509cab19` + `c35a8f1f` (the publish-verification doc "
         "updates plus `scripts/ship/verify_publish.py`), `044e10d9` (the pack-visibility fix: shared pack store, "
         "pack groups open by default, clearer toast).\n" + B_OLD)

raw = io.open(PATH, "rb").read()
crlf, lf = raw.count(b"\r\n"), raw.count(b"\n")
if crlf and lf - crlf:
    raise SystemExit("REFUSE: mixed endings")
text = raw.decode("utf-8")
norm = text.replace("\r\n", "\n")
for old in (A_OLD, B_OLD):
    if norm.count(old) != 1:
        raise SystemExit("REFUSE: anchor matched %d times: %r" % (norm.count(old), old[:60]))
norm = norm.replace(A_OLD, A_NEW).replace(B_OLD, B_NEW)
out = norm.replace("\n", "\r\n") if crlf else norm
io.open(PATH, "wb").write(out.encode("utf-8"))
print("handoff: %d -> %d bytes (crlf=%d)" % (len(raw), len(out.encode("utf-8")), out.count("\r\n")))
