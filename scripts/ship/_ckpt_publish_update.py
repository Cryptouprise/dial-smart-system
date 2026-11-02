"""Prepend this session's checkpoint + close the 'click Publish' item (jcode, 11/02 23:20).

CHECKPOINT_latest.md is LF-only (180 LF, 0 CRLF) - match and write with LF.
"""
import io, sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

PATH = r"C:\Users\charl\Infinite-AI\jarvis-ops\session-ledger\CHECKPOINT_latest.md"

HEAD_OLD = ("# CHECKPOINT 2026-11-02 23:10 UTC (jcode) - P1731 Dial Smart: BUG 5 CLOSED + the 4 voice "
            "functions redeployed; the last hygiene item is done")

PUB_OLD = ("- **Charles: click Publish in Lovable** (project `df06441e-ebac-46f8-8957-994bea19f4de`) "
           "- no tool exists for it.")
PUB_NEW = ("- **[DONE 23:20 - verified, see the checkpoint above] Publish in Lovable** (project "
           "`df06441e-ebac-46f8-8957-994bea19f4de`). Both live hosts serve `cef3ad37` with the pack chunks in the "
           "precache manifest. The packs UI then looked empty because `settings -> 'packs'` is NULL on the live org "
           "- enable a pack in Full Mode > System & Settings > Packs.")

NEW = """# CHECKPOINT 2026-11-02 23:20 UTC (jcode) - P1731: PUBLISH VERIFIED (nothing stale) + the real reason the packs UI looked empty

## Done this session (jcode) - READ-ONLY probes + docs only; no live writes
- **Charles's question answered with facts: "everything's published but I don't see any of it in the app."**
  Both live hosts serve the CURRENT build: `https://aicallboss.app/` and `https://aidialboss1.lovable.app/` return
  `data-commit-sha=cef3ad379e2b56c47468493788c0cd7e2f9ec076` (current main) with entry `/assets/index-DHzku0tw.js`,
  and each host's `/sw.js` precache manifest lists `PackSettings-5W02wQva.js`, `PackLocked-Dq8ni493.js`,
  `PackComingSoon-Cn8w9ubT.js`, `packs-DH-kXtE4.js`, `useEnabledPacks-Ctr0jpab.js`. The lazily-loaded sidebar chunk
  `Index-_oVi5y1_.js` carries the `System & Settings` group (1 occurrence), `adminOnly` (2), `simpleMode` (10). The
  Publish click worked; the deploy is not stale and the domain is not the problem.
- **Why it is invisible - four separate reasons (all verified in source and against the live DB):**
  1. `organizations.settings -> 'packs'` is **NULL** for the live org `11824e05-...`, so `normalizePacks(null)` is `[]`,
     `getPackNavigation([])` returns no groups, and the pack tabs (`se-workspace`, `wh-properties`, `d2d-knock-list`)
     are not in the sidebar. Gated by design (`src/lib/packs.ts:5-8`).
  2. The one always-on entry, `Packs`, lives in the `System & Settings` group: `defaultOpen: false`
     (`DashboardSidebar.tsx:157-166`) and no `simpleMode: true` flag, so it is hidden entirely in Simple Mode
     (`DashboardSidebar.tsx:181-188`). Path to see it: Full Mode -> expand System & Settings -> Packs.
  3. All three pack screens are placeholders: `renderContent` maps them to `PackComingSoon` (`Dashboard.tsx:511-515`),
     which renders "Coming soon - This screen is part of the <pack> pack and is not built yet." Real screens = phase 3.
  4. `BrowserPhone` (`src/lib/voice/BrowserPhone.ts`) and `CoachPanel` (`src/components/call/CoachPanel.tsx`) have
     **zero importers**; `CallWorkspace.tsx` is not written (`phases/CALL-SCREEN-PORT.md:38`). No UI exists for the
     call screen or the live coach yet.
  Also: the billing lock is wired (`ProtectedRoute.tsx:57` -> `BillingPaused`) but inert (`billing_enabled = false`).
  Toggling a pack DOES work - Packs -> switch -> `set_org_packs(p_org_id, p_packs)` (RPC live, `prosecdef = true`).
- **New reusable tool:** `scripts/ship/verify_publish.py` (read-only) proves published == main and that each feature
  chunk is really in the precache manifest: `python scripts/ship/verify_publish.py --expect cef3ad37` -> ALL GOOD
  (both hosts, commit sha, entry bundle, 5 pack chunks, sidebar markers). Run it after every Publish.
- **Docs updated (commit `509cab19`, pushed):** `docs/wholesale/HANDOFF-2026-11-02.md` gained the section
  "Post-publish verification + where each piece actually lives"; `docs/wholesale/SHIP-RUNBOOK.md` - the "Publish is
  DONE / verified" corrections in section 0 and in the Frontend row. Investigation scratch probes deleted;
  `_probe_terms.py` (repo-wide reference counter) kept. Kanban P1731 noted.
- **Product gap flagged to Charles:** the whole industry-packs proposition is currently invisible to a new customer -
  one entry, buried in a collapsed group, Full Mode only, leading to three "Coming soon" cards. If packs are the
  product, the Packs screen needs to be reachable (Simple Mode, a first-login prompt, or the group auto-opened).

## Next 3 actions (P1731)
1. **Charles: make it visible** - Full Mode -> System & Settings -> Packs -> enable a pack (or jcode flips
   `set_org_packs` on his go). Until then the pack UI stays empty by design.
2. The Charles-present phase tests: p4a T1/T2/T4-T8, p5 7.2/7.4/7.5, p4b T3/T7, api-gateway T1/T6/T7 (a real call or
   text, target +12145291531).
3. Then the runbook's remaining Charles items: `WEBHOOK_SECRET_TELNYX` (Telnyx webhook signing public key), rotate the
   leaked Telnyx API key, the Stripe secrets (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `APP_URL`), and the
   `oscar1` promo decision.

---

"""

raw = io.open(PATH, "rb").read()
crlf, lf = raw.count(b"\r\n"), raw.count(b"\n")
if crlf or lf - crlf != 180:
    raise SystemExit("REFUSE: unexpected endings (crlf=%d lf=%d)" % (crlf, lf))
text = raw.decode("utf-8")
for old in (HEAD_OLD, PUB_OLD):
    if text.count(old) != 1:
        raise SystemExit("REFUSE: anchor matched %d times: %r" % (text.count(old), old[:70]))
text = text.replace(HEAD_OLD, NEW + HEAD_OLD).replace(PUB_OLD, PUB_NEW)
io.open(PATH, "wb").write(text.encode("utf-8"))
out = io.open(PATH, "rb").read()
print("checkpoint: %d -> %d bytes; crlf=%d lone_lf=%d" % (len(raw), len(out), out.count(b"\r\n"), out.count(b"\n") - out.count(b"\r\n")))
