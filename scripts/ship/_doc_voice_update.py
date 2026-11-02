"""Surgical runbook updates after (a) bug 5 applied and (b) the 4 voice functions redeployed.

Every replacement is anchored on text that must appear exactly once; the script asserts that
and writes the file back byte-for-byte apart from the replacements (CRLF preserved).
"""
import io
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = r"C:\Users\charl\dial-smart-system\docs\wholesale\SHIP-RUNBOOK.md"

PAIRS = [
    # A. "What remains" - drop the two items that are now done, keep the hash accurate.
    ("""`d1063f75` after the verification docs and the three ship helper scripts, merge commit `44e8faa5`; Charles only needs to click **Publish** in Lovable), **bug 5** (the
`subscription_status` CHECK migration is written but NOT applied - without it the billing lock fail-opens on dunning; p6 REVIEW section 9.1),
the redeploy of the 4 pre-bug-4 voice functions, and the phase tests.""",
     """`7997552e` plus this session's voice-redeploy helper scripts, merge commit `44e8faa5`; Charles only needs to click **Publish** in Lovable),
and the phase tests. **Bug 5 is CLOSED and the 4 pre-bug-4 voice functions are redeployed** - both on 11/02 (jcode), see the rows below."""),

    # B1/B2. Bug-5 row: it is applied now, with the record and the verification.
    ("""so every dunning write raises `23514` and the
lock fail-opens. Fix written, **NOT APPLIED**: `""",
     """so every dunning write raised `23514` and the
lock fail-opened. **FIXED - APPLIED 11/02 23:05Z** (T4): `"""),
    ("""--apply` - do NOT use `supabase db push` here, see p6 REVIEW 9.4.""",
     """--apply` (recorded as `20261102230000 subscription_status_vocabulary`; `schema_migrations` 167 -> 168 rows; the one live org
is untouched at `subscription_status = active`, `billing_enabled = false`) - do NOT use `supabase db push` here, see p6 REVIEW 9.4."""),

    # C. The bug-4 follow-up row is done.
    ("""| Bug 4 follow-up | `voice-call`, `voice-call-action`, `voice-call-events` and `voice-token` also import `_shared/voice-provider.ts` and still run the pre-fix bundle. They import `voice-provider.ts` *before* `twilio.ts`, so they never entered the dead zone and are working. Redeploy them with the next ship so source and live match. |""",
     """| Bug 4 follow-up | **DONE 11/02 (jcode).** `voice-call`, `voice-call-action`, `voice-call-events` and `voice-token` also import `_shared/voice-provider.ts` and still ran the pre-fix bundle. They import `voice-provider.ts` *before* `twilio.ts`, so they never entered the dead zone and were working. All four were redeployed 11/02 so source and live match: now `version=2`, `ACTIVE`, `verify_jwt` unchanged. Runner, proof and rollback: `scripts/ship/_deploy_voice.py`, `_marker_voice.py`, `save_voice_bodies.py --save|--probe|--restore`. |"""),

    # D. Function versions in the same table.
    ("""| 14 edge functions | DEPLOYED 11/02, all ACTIVE with the correct `verify_jwt` flags (see step 3). New functions at v1; replaced:""",
     """| 14 edge functions | DEPLOYED 11/02, all ACTIVE with the correct `verify_jwt` flags (see step 3). New functions at v1, except the 4 voice functions, re-deployed to **v2** the same day as bug-4 hygiene; replaced:"""),

    # E. The step-3 re-snapshot tail is stale - it is done.
    ("""After deploys: re-snapshot the 5 replaced functions into `supabase/functions-live/`. **NOT done yet** \u2014 the ESZIP pulls need the same 28-byte file-boundary repair described in `phases/staging/api-gateway/REVIEW.md` section 6.""",
     """After deploys: re-snapshot the 5 replaced functions into `supabase/functions-live/`. **DONE 11/02 (jcode), commit `1dbedaeb`** - byte-identical snapshots; the 28-byte ESZIP boundary repair is superseded for those 5 because `npx supabase functions download` was used instead (see `functions-live/README.md`)."""),

    # F. New paragraph recording the voice redeploy, right after the bug-4 paragraph.
    ("""Rollback per function: Dashboard version history (previous live versions: twilio-sms-webhook v532,""",
     """**Bug 4 follow-up (jcode, 11/02):** the four voice functions that were *not* in that redeploy - `voice-call`, `voice-call-action`,
`voice-call-events`, `voice-token` - were still running the pre-bug-4 bundle. They worked (their import order avoided the dead zone), but
they were redeployed the same day so live matches source: all four are now `version=2`, `ACTIVE`, with `verify_jwt` unchanged (`false` for
`voice-call-events`, `true` for the other three), and the deployed bundles contain the post-fix code (zero `const REGISTRY`, 6x
`providerRegistry`, `public-url.ts` present - asserted by `scripts/ship/_marker_voice.py` against the strings `da242c46` added/removed).
`scripts/ship/save_voice_bodies.py --save` stores the previous ESZIPs first (the rollback material), `--probe` is the OPTIONS/POST health
check, `--restore` puts them back. Behaviour was unchanged: OPTIONS 200 on all four, unauthenticated POST 401 (the three JWT ones) and
503 on `voice-call-events` (the missing `WEBHOOK_SECRET_TELNYX`, bug 3) before and after.
Rollback per function: Dashboard version history (previous live versions: twilio-sms-webhook v532,"""),
]

raw = io.open(P, "rb").read()
assert raw.count(b"\n") == raw.count(b"\r\n"), "runbook has lone LF; refusing to normalize"
s = raw.decode("utf-8").replace("\r\n", "\n")  # match on LF, restore CRLF on write
n0 = len(s)
for i, (old, new) in enumerate(PAIRS, 1):
    c = s.count(old)
    assert c == 1, "pair %d matched %d times, expected 1" % (i, c)
    s = s.replace(old, new)
out = s.replace("\n", "\r\n").encode("utf-8")
io.open(P, "wb").write(out)
print("runbook %d -> %d bytes; crlf=%d lone_lf=%d" % (len(raw), len(out), out.count(b"\r\n"), out.count(b"\n") - out.count(b"\r\n")))
