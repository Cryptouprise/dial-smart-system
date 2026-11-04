# risks-e1-knownopen-runtime

- status: completed
- tldr: Section 6 runtime items: 503 gate TRUE; Stripe-missing TRUE; dist stale TRUE; "Telnyx key leaked" only PARTIALLY - no committed secret, real basis is a Hermes process-list exposure.

Verified section-6 runtime/infra items against the code in C:/Users/charl/dial-smart-system. Verdicts: (1) voice-call-events 503 when WEBHOOK_SECRET_TELNYX unset = TRUE (index.ts:212,217-219; FACT, MEDIUM). (2) Telnyx key "leaked" = PARTIALLY: NO committed/hardcoded secret in the repo (0 matches for KEY/regex, all TELNYX_API_KEY= are placeholders; local .env gitignored, only public Supabase keys); real origin is a Hermes process-list exposure (projects.json:20201; ACTIVE.md:9230, remediated :9234) with rotation still open (checkpoints). Severity HIGH if value still live. (3) Stripe secrets missing = TRUE: code requires STRIPE_SECRET_KEY+APP_URL (billing-portal:91-97) and STRIPE_WEBHOOK_SECRET (stripe-webhook:298,311-314 -> 500); docs say MISSING live (SHIP-RUNBOOK.md:32, HANDOFF:119). (4) local dist/ stale = TRUE (dist newest 11/02 17:58 vs src 11/03 10:22); "published build fine" is contradicted as of 11/03 (checkpoint :10).

## Artifact

**Findings**

VERDICT TABLE - section 6 runtime/infra items, repo C:/Users/charl/dial-smart-system. (1) voice-call-events returns 503 when WEBHOOK_SECRET_TELNYX is unset = TRUE, FACT. supabase/functions/voice-call-events/index.ts:212 reads Deno.env.get('WEBHOOK_SECRET_TELNYX'); :217-219 if(!publicKey){...return json({error:'Telnyx webhook signature verification is not configured'},503)}. Severity MEDIUM: Telnyx browser-phone call events rejected while unset, call_logs stays initiated/ringing, transcripts never append. Note sibling telnyx-webhook does the OPPOSITE - warns and SKIPS verification (fail-open) at supabase/functions/telnyx-webhook/index.ts:131. (2) 'A Telnyx key is believed leaked and needs rotating' = PARTIALLY / BASIS NOT IN THIS REPO. FACT repo state: NO hardcoded/committed Telnyx or Stripe secret exists in the working tree (regex KEY[0-9a-zA-Z_]{20,}->0; no real whsec_/sk_live_/sk_test_ values; every TELNYX_API_KEY= line is a placeholder: CLAUDE.md:1126, PROVIDER_INTEGRATION.md:79, TELNYX_VOICE_PLATFORM.md:2205, TELNYX_PHONE_NUMBERS_API.md:1232 'KEY_YOUR_KEY_HERE'). Local .env is gitignored (.gitignore:16) and holds only public Supabase keys. FACT origin: the exposure was a PROCESS-LIST leak on the Hermes server, not a repo commit - projects-kanban/projects.json:20201 (2026-09-30) 'Flag: Telnyx key visible in Hermes process list'; ACTIVE.md:9230 set scope 'move Telnyx key out of process args into env'; ACTIVE.md:9234 (2026-10-01) records it done (key moved to .env, config.yaml chmod 600, '0 processes expose the key'). The value WAS exposed so rotation is warranted; still listed open at scripts/ship/_checkpoint_d2d_port.md:69 and _checkpoint_new.md:78. Severity HIGH if the exposed value is still live. THEORY (unproven): it is the shared account key so Dial Smart's TELNYX_API_KEY likely needs the same rotation. (3) 'Stripe secrets missing in live env' = TRUE (code requires; docs assert live-missing). FACT code: billing-portal/index.ts:91-97 requireEnvVars('STRIPE_SECRET_KEY','APP_URL',...) plus :151/:197; stripe-webhook/index.ts:298 reads STRIPE_WEBHOOK_SECRET and :311-314 returns 500 'Webhook not configured' when unset; credit-management/index.ts:598-608 reads STRIPE_SECRET_KEY. FACT docs: SHIP-RUNBOOK.md:32 and HANDOFF-2026-11-02.md:119 list STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET/APP_URL MISSING, billing lock inert. Severity MEDIUM. Live presence not verifiable from repo. (4) 'Local dist/ stale relative to source (local only; published build fine)' = TRUE locally, PARTIALLY on the parenthetical. FACT: newest dist file 2026-11-02 17:58 (workbox-e4022e15.js, sw.js, index.html) vs newest src file 2026-11-03 10:22 (src/packs/door_to_door/app/scripts.js, doorboss.css, app/markup.html) -> src ~16h newer, dist does not reflect source. Severity LOW. THEORY/contradiction on 'published build is fine': _checkpoint_d2d_port.md:10 records live served 61ce6d40 while main was 4d79018c on 2026-11-03 02:40, so the published build was also behind then; needs a live check. Overall: 3 of 4 fully TRUE; item (2) is an inherited open action from a Hermes process-list exposure, with no committed secret in the repo.

**evidence**

- supabase/functions/voice-call-events/index.ts:212,217-219 (503 gate)
- supabase/functions/telnyx-webhook/index.ts:131 (sibling fails OPEN, skips verification)
- grep KEY[0-9a-zA-Z_]{20,} across repo -> 0 matches
- grep whsec_/sk_live_/sk_test_ real values -> 0 (only generated 'dsk_live_' tokens in migrations)
- CLAUDE.md:1126; PROVIDER_INTEGRATION.md:79; TELNYX_VOICE_PLATFORM.md:2205; TELNYX_PHONE_NUMBERS_API.md:1232 (all placeholders)
- C:/Users/charl/dial-smart-system/.gitignore:16 (.env ignored)
- .env key names only: SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, VITE_SUPABASE_* (no vendor secrets)
- C:/Users/charl/projects-kanban/projects.json:20201 (Telnyx key visible in Hermes process list)
- C:/Users/charl/Infinite-AI/jarvis-ops/session-ledger/ACTIVE.md:9230 (scope: move Telnyx key out of process args)
- C:/Users/charl/Infinite-AI/jarvis-ops/session-ledger/ACTIVE.md:9234 (remediated: moved to env, chmod 600, 0 processes expose key)
- scripts/ship/_checkpoint_d2d_port.md:69 and scripts/ship/_checkpoint_new.md:78 (rotation still open)
- supabase/functions/billing-portal/index.ts:91-97,151,197
- supabase/functions/stripe-webhook/index.ts:298,311-314
- supabase/functions/credit-management/index.ts:598-608
- docs/wholesale/SHIP-RUNBOOK.md:32; docs/wholesale/HANDOFF-2026-11-02.md:119 (Stripe MISSING)
- dist/ newest mtime 2026-11-02 17:58 vs src/ newest 2026-11-03 10:22 (PowerShell Get-ChildItem LastWriteTime)
- scripts/ship/_checkpoint_d2d_port.md:10 (live served 61ce6d40, main 4d79018c)

**validation**

No live/vendor calls; read-only. Opened the source files (voice-call-events, stripe-webhook, billing-portal, credit-management) and read exact lines. Secret scan via literal + regex greps over the working tree (hardcoded-key patterns and placeholder assignment patterns). dist/src freshness via PowerShell LastWriteTime over both trees. Leak origin traced in the shared brain (projects.json, ACTIVE.md). No secret VALUES printed at any point - only key NAMES and file:line refs.

**open_questions**

- Is WEBHOOK_SECRET_TELNYX still unset in the live Supabase project today (11/03)? Repo cannot tell; docs say missing as of 11/02.
- Has the Hermes-exposed Telnyx key actually been ROTATED, or only moved out of process args? The 10/01 entry proves containment, not rotation.
- Is the Hermes/agent-os Telnyx key the SAME value as Dial Smart's TELNYX_API_KEY (shared account)? If yes, Dial Smart must rotate too.
- Are STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET / APP_URL still missing live, or set since 11/02?
- Is the published (Lovable) build still behind main, or did a Publish catch it up after 11/03 02:40?

**what_i_did_not_check**

- Git history / packed objects for a historically committed secret - git commands timed out on this large repo, so only the working tree was scanned.
- Live Supabase project env (which secrets actually exist/are unset in the deployed emonjusymdripmkvtttc project) - needs live access.
- Whether the Hermes-exposed Telnyx key and Dial Smart's TELNYX_API_KEY are the same value.
- functions-live/ snapshot drift beyond what HANDOFF already documents.
- The other section-6 items (doorstep callback certification, geocoding, consent Record switch, coach-suggest confidence, lint debt) - other lanes.
- Telnyx key format validation beyond prefix regexes.

**confidence**: medium