# Dial Smart industry-packs build: SHIP RUNBOOK (canonical, locked 2026-11-01)

Owner: Charles. Foreman: Fable (holds every key, runs every deploy and DB change). Crew: DeepSeek V4.1 on LithosAI (drafts only; done).
Kanban: P1731. Branch: `wholesale` (off GitHub main d370432f). Supabase project: `emonjusymdripmkvtttc`. Lovable deploys the UI from GitHub `main` only.
Companion skill: `~/.claude/skills/dialsmart-packs/SKILL.md`. Plan and history: `PLAN.md`, `audit/phase1/FINDINGS.md`, `phases/staging/*/REVIEW.md`.

## 0. Where things stand (updated 2026-11-02, AFTER the ship ran)

The ship ran on 2026-11-02 (jcode). Migrations, secrets, all 14 functions and api-gateway are LIVE. What remains: `WEBHOOK_SECRET_TELNYX`
(bug 3), the Stripe dashboard secrets (Charles), the frontend push to `main` is DONE (`wholesale` merged and pushed 11/02, origin/main `44e8faa5`; Charles only needs to click **Publish** in Lovable), and the phase tests.
Three of the new functions were dead on arrival — 500 `WORKER_ERROR` on every request — and were root-caused, fixed and redeployed the same day; see **bug 4** in the table below.

| Piece | State |
|---|---|
| Phase 1 org scope + guard fix + packs storage | APPLIED LIVE 10/29 (3 migrations: `20261029142121_phase1_org_scope`, `20261029150000_phase1_scope_guard_fix`, `20261029010000_industry_packs`). Verified: 0 NULL org ids, 32 "Company ..." policies, tenant guard proven fail-closed. |
| Migration `20261029170000_browser_phone` | APPLIED 11/02 (recorded in `schema_migrations` as `20261102214238_browser_phone`). |
| Migration `20261029180000_live_coach` | APPLIED 11/02. Verified: `coach_proposals`, `coach_recent_corrections`, `coach_move_stage` exist. |
| Migration `20261029190000_sms_per_organization` | APPLIED 11/02. Verified: 4 `sms_*` `organization_id` columns, backfill `null_org = 0` on all four tables, 16 "Company ..." policies. |
| Migration `20261029200000_billing_lock` | APPLIED 11/02. Verified: 4 "Billing lock" policies, `org_in_good_standing`, `org_access_allowed`, `stripe_events` table, `organizations.billing_grace_until`. Inert while the live org has `billing_enabled = false`. |
| Secrets `LITHOS_API_KEY`, `TWILIO_API_KEY_SID/SECRET/TWIML_APP_SID`, `TELNYX_SIP_CONNECTION_ID` | SET 11/02 (HTTP 201 each). Twilio = the **SUNNERDS** account (bug 1); TwiML App `AP78cb…`, API key `SK27dd…`; Telnyx credential connection `3084586816309822637` on outbound profile "Infinite AI Outbound" `2901290113608713910`. |
| `WEBHOOK_SECRET_TELNYX` | **STILL MISSING (bug 3).** `voice-call-events` returns 503 without it. The pre-11/02 version of step 2 wrongly listed it as already live. Get it from the Telnyx portal: Account Settings > Keys & Credentials > Public Key. It is the Ed25519 **public** key, so the Telnyx API key does NOT satisfy it, and no API endpoint returns it (11/02: `/v2/public_keys`, `/v2/webhook_public_key`, `/v2/accounts/public_key`, `/v2/key_pairs` all 404) - portal only. |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `APP_URL` | MISSING. Charles's Stripe dashboard steps (p6 REVIEW.md section 5). The billing lock stays inert until these exist. |
| 14 edge functions | DEPLOYED 11/02, all ACTIVE with the correct `verify_jwt` flags (see step 3). New functions at v1; replaced: `sms-messaging` v529, `twilio-sms-webhook` v536, `ai-sms-processor` v528, `stripe-webhook` v123. |
| **Bug 4 — Twilio voice webhooks 500 on every request** | **FIXED + REDEPLOYED 11/02 (jcode).** `twilio-voice-status`, `twilio-voice-transcription` and `twilio-voice-twiml` returned 500 `WORKER_ERROR` on *every* request including `OPTIONS`, from the moment they were first deployed. Cause: `_shared/voice-provider.ts` built a module-scope `const REGISTRY = { twilio: twilioProvider }` while `_shared/twilio.ts` imported `publicFunctionsBaseUrl` back from `voice-provider.ts`. That is an import cycle; any entry importing `twilio.ts` before `voice-provider.ts` evaluated `voice-provider.ts` while `twilio.ts` was still initialising, so the `REGISTRY` read hit the temporal dead zone (`ReferenceError: Cannot access 'twilioProvider' before initialization`) at module load. Fixed in commit `da242c46`: `publicFunctionsBaseUrl` moved to the new leaf module `_shared/public-url.ts` (re-exported from `voice-provider.ts` for compatibility) and the provider map built lazily inside `providerRegistry()`. Live re-probe 11/02: `OPTIONS` 200, `GET` and unsigned `POST` 403. |
| Bug 4 follow-up | `voice-call`, `voice-call-action`, `voice-call-events` and `voice-token` also import `_shared/voice-provider.ts` and still run the pre-fix bundle. They import `voice-provider.ts` *before* `twilio.ts`, so they never entered the dead zone and are working. Redeploy them with the next ship so source and live match. |
| api-gateway ownership guards + membership gate | DEPLOYED 11/02, live **v39** (was v35), `verify_jwt=false`. Curl tests T0-T6b passed (see step 6). T1/T6/T7 (the positive path, i.e. a real call/text) not run — they need Charles present. |
| Frontend (packs UI, BrowserPhone, CoachPanel, BillingPaused) | **MERGED + PUSHED to `main` 11/02 (jcode)**, merge commit `44e8faa5` (origin/main was `03dadf9f`). Gates green before and after: `npm run typecheck`, `npm run build`. Only step left: click **Publish** in Lovable. |
| Re-snapshot `supabase/functions-live/` for the 5 replaced functions | **DONE 11/02 (jcode), commit `1dbedaeb`.** All 8 files are byte-identical to both the live bundle and `supabase/functions/<slug>/` on `wholesale`. Method, the new `api-gateway` `_shared` layout and one cosmetic stray-comment defect are recorded in `functions-live/README.md` (bottom section). |
| Wholesale pack tables (`20261028210000_wholesale_core.sql`, wh_* tables) | Drafted + red-teamed, NOT applied (Charles stopped it 10/28). Ships on the phase-3 "pack enable seeds rows" mechanism, which is not built yet. |

History: the ship stalled 10/29-10/30 on rejected permission prompts (typing while a prompt is open cancels it); nothing was half-applied.
On 11/02 the prompts went through and steps 1-3 below ran. Bugs found that day are in `HANDOFF-2026-11-02.md` ("Bugs found 11/02").
11/02 merge note (jcode): `src/integrations/supabase/types.ts` predated the `industry_packs` migration, so `PackSettings.tsx` failed `typecheck` on
`supabase.rpc('set_org_packs')`. Regenerated from the live schema (commit `bdc95152`, tool `scripts/ship/_gen_types.py`). Lovable had independently
regenerated the same file on `main`, so the merge conflicted; resolved to our copy because ours is a strict superset (217 vs 208 schema keys, verified
with `scripts/ship/_compare_types.py`).

## 1. Hard rules (do not relax)

1. **Live, not main, is the source for any EXISTING edge function.** GitHub main is a containment branch: 74 of 99 functions carry
   `*_NOT_CERTIFIED` 503 gates (commit a8393da5, 2026-07-13) that live does NOT have (all live functions last deployed 2026-07-01).
   Deploying an existing function from main switches off texting/API. Patch only from `supabase/functions-live/<slug>/` (12 byte-exact
   snapshots, pulled via Management API `GET /v1/projects/{ref}/functions/{slug}/body`, ESZIP parsed). NEW functions may use main's
   `_shared/utils.ts`, `tenant-context.ts`, `stripe-signature.ts` (no gates in those). Re-snapshot after every deploy (`functions-live/README.md`). The 5 functions replaced on 11/02 were re-snapshotted with `npx supabase functions download` instead of ESZIP parsing, so those files are byte-exact and directly redeployable.
2. **Every migration: dry run first** (`BEGIN; <file>; <verification SELECT>; ROLLBACK;` via `execute_sql`), then apply ONE at a time.
   `apply_migration` wraps the file in a transaction: no BEGIN/COMMIT inside migration files.
3. **SECURITY DEFINER gotcha:** inside a definer function `current_user` is the owner (postgres); a `current_user IN ('authenticated','anon')`
   test is always false and the guard fails open. Guards are SECURITY INVOKER (fixed live 10/29). RLS test harness: `set_config('request.jwt.claims', ...)`
   AND `request.jwt.claim.sub` BEFORE `SET LOCAL ROLE authenticated`.
4. **Tier-4 ledger** (`Infinite-AI/jarvis-ops/session-ledger/ACTIVE.md`): `Result: pending` before each live step, `success|failed` after.
5. **Never print keys.** Values live at: Lithos `~/.claude/skills/lithos/credentials.md`; Telnyx API key in the `telnyx-voice-ai` skill doc;
   Twilio account SID/token + Supabase PAT (`sbp_...`) in `~/.mcp.json`; Stripe: nothing on disk (Charles's dashboard). Read at runtime only.
6. **No calls, texts, GHL changes or client PII to Lithos without Charles's explicit go.** Code-only audits to DeepSeek are fine.
7. **Zero popup terminals:** every command through the hidden Bash tool or `pythonw` / `start /B`.
8. **DeepSeek on Lithos is the ONE cheap model allowed to write code** (Charles 10/28). It never deploys, never holds keys. Other cheap models: research only.
9. Reply to Charles in words before tools, on every message; never idle on a gate while local work remains; a declined prompt = one line, keep going.

## 2. The ship sequence (about 1 hour of wall time once prompts are approved)

Base URL for webhooks: `https://emonjusymdripmkvtttc.supabase.co/functions/v1`.

### Step 1: migrations (about 5 min). One at a time, dry run then apply, in this order.

| # | File | Status | What it does |
|---|---|---|---|
| 1 | `supabase/migrations/20261029170000_browser_phone.sql` | APPLIED 11/02 | `call_logs.provider_call_id`; tables `voice_credentials`, `call_live_transcripts` (REPLICA IDENTITY FULL, in `supabase_realtime`); RPC `append_call_live_transcript` (service_role only) |
| 2 | `20261029180000_live_coach.sql` | APPLIED 11/02 | `coach_proposals`, decide guard (INVOKER), `coach_recent_corrections`, `coach_move_stage`; precondition block RAISEs if #1 is missing |
| 3 | `20261029190000_sms_per_organization.sql` | APPLIED 11/02 | `organization_id` on sms tables + backfill from the owning number, RLS rewritten to company membership, per-company AI-reply switch |
| 4 | `20261029200000_billing_lock.sql` | APPLIED 11/02 | RESTRICTIVE "Billing lock" policy on leads/campaigns/phone_numbers/call_logs (`org_in_good_standing OR is_platform_operator`), guarded `organizations.billing_grace_until`, `stripe_events`. Locks nothing until an org has `billing_enabled = true`. |

Tools: MCP `mcp__supabase__apply_migration` (name = file stem after the timestamp) OR `python scripts/ship/run_migration.py <file> --dry` then `--apply`
(Management API; records the `schema_migrations` row; token read from `~/.mcp.json`, never printed). Verify each with the SQL in its REVIEW.md.

### Step 2: secrets + carrier setup (about 15 min). Names only.

Already live (pre-11/02): `TELNYX_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `LOVABLE_API_KEY`.
**Correction (bug 3): `WEBHOOK_SECRET_TELNYX` is NOT live.** The pre-11/02 version of this line listed it; it is missing, and `voice-call-events` returns 503 without it.
**Note (bug 1):** the Supabase secrets API returns SHA-256 **digests**, not values. The live `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN` are digests of the **SUNNERDS** account (confirmed by hashing the candidate accounts in `~/.mcp.json` and by matching the dialer's Twilio numbers). Do not read them as raw SIDs.
Set (Dashboard > Edge Functions > Secrets, or `npx supabase secrets set` with `--project-ref emonjusymdripmkvtttc`):

**Status 11/02: the first four bullets below are SET** (`LITHOS_API_KEY`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_TWIML_APP_SID`, `TELNYX_SIP_CONNECTION_ID`). `PUBLIC_FUNCTIONS_BASE_URL` not needed. The three Stripe ones are still MISSING (Charles's dashboard).

- `LITHOS_API_KEY` (value from the lithos credentials file; optional `LITHOS_BASE_URL`, default `https://api.lithosai.cloud/v1`).
- `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`: create a Twilio API Key via REST using the account creds in `~/.mcp.json`.
- `TWILIO_TWIML_APP_SID`: create a TwiML App with Voice Request URL (POST) `<base>/twilio-voice-twiml` and Status Callback `<base>/twilio-voice-status`.
- `TELNYX_SIP_CONNECTION_ID`: create a Telnyx credential (WebRTC) connection with `webhook_event_url` = `<base>/voice-call-events`, an outbound voice
  profile attached, and the public key matching `WEBHOOK_SECRET_TELNYX`. `voice-token` mints per-user WebRTC JWTs from telephony credentials on it.
  Company Telnyx numbers in `phone_numbers` need `provider='telnyx'`, `status='active'`.
- `PUBLIC_FUNCTIONS_BASE_URL` only if functions move to a custom domain.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `APP_URL`: CHARLES in the Stripe dashboard (p6 REVIEW.md section 5: products/prices, `UPDATE plans`,
  webhook endpoint `<base>/stripe-webhook` with the 7 events listed there, reveal signing secret). Can ship after everything else; the lock stays inert.

### Step 3: deploy the 14 functions, this order, with these JWT flags — DONE 11/02

**DEPLOYED 11/02** with `python scripts/ship/deploy_fn.py <slug> [--no-verify-jwt]` (a silent wrapper around the CLI line below). All 14 verified ACTIVE with the flags in the table.

`npx supabase functions deploy <slug> --project-ref emonjusymdripmkvtttc [--no-verify-jwt]` with `SUPABASE_ACCESS_TOKEN` read from `~/.mcp.json`
(or MCP `deploy_edge_function`). Source dir is always `supabase/functions/<slug>/` on branch `wholesale`.

| Order | Function | verify_jwt | Source basis |
|---|---|---|---|
| 1-3 | `voice-call-events` (Telnyx webhook), `twilio-voice-status`, `twilio-voice-transcription` | false (signature is the auth) | new |
| 4 | `twilio-voice-twiml` | false | new |
| 5-7 | `voice-token`, `voice-call`, `voice-call-action` | true | new |
| 8-9 | `coach-suggest`, `coach-decide` | true | new (routes via LIVE `disposition-router` contract; do not touch the router) |
| 10 | `sms-messaging` | false (live setting; function enforces auth on every action) | live v525 + P5 |
| 11 | `twilio-sms-webhook` | false (Twilio signature, fail-closed; needs `TWILIO_AUTH_TOKEN`) | live v532 + P5 |
| 12 | `ai-sms-processor` | true | live v524 + P5 |
| 13 | `stripe-webhook` | false (Stripe signature) | live + P6 |
| 14 | `billing-portal` | true (admin-only inside) | new |

After deploys: re-snapshot the 5 replaced functions into `supabase/functions-live/`. **NOT done yet** — the ESZIP pulls need the same 28-byte file-boundary repair described in `phases/staging/api-gateway/REVIEW.md` section 6.

**Bug 4 (11/02):** `twilio-voice-status`, `twilio-voice-transcription` and `twilio-voice-twiml` deployed cleanly but 500'd on every request. A `WORKER_ERROR` on `OPTIONS` too means the failure is at module load, not in the handler — probe `OPTIONS` first when a function misbehaves, because it is answered before any handler logic. The cause was an import cycle (`twilio.ts` <-> `voice-provider.ts`) plus a module-scope read of `twilioProvider`; fixed in `da242c46` and the three were redeployed the same day. Static guard: no runtime import cycle may be reachable from any entry (`import type` does not count).
Rollback per function: Dashboard version history (previous live versions: twilio-sms-webhook v532, sms-messaging v525, ai-sms-processor v524,
stripe-webhook live) or redeploy the `functions-live` snapshot.

### Step 4: frontend (about 5 min) — NOT done

`git push origin wholesale` (backup, no deploy) then merge/push `wholesale` -> `main`; Lovable redeploys. Includes packs UI (`src/lib/packs.ts`,
`useEnabledPacks`, `PackSettings`, sidebar/dashboard tabs `packs`, `se-workspace`, `wh-properties`, `d2d-knock-list`), `BrowserPhone.ts`,
`CoachPanel.tsx`, `useOrgStanding.ts` (fails open), `BillingPaused.tsx`, `ProtectedRoute.tsx`. Core dialer tabs are never pack-gated.
Deps already in package.json: `@telnyx/webrtc ^2.25.0`, `@twilio/voice-sdk ^2.12.0`.

### Step 5: tests (about 20 min; a live test call needs Charles present and his go) — NOT done

- P4a `phases/staging/p4a/REVIEW.md` section 6: T1 token auth (401/200/403/400/429), T2 call guards (CALLER_ID_NOT_OWNED, DNC_BLOCKED, LEAD_NOT_OWNED),
  T3 RLS, T4 Telnyx replay, T5 Twilio status replay, T6 Twilio transcription replay, T7-T8 client. Live call target: Charles +12145291531.
- P4b `p4b/REVIEW.md` section 7: T1-T14 (objects exist, fake transcript lines, coach-suggest 200/cached/429/403/404, decide accept -> router 200,
  correct/409, side effects, stage move, field fill, callback, second-org negative test, member column guard, expiry).
- P5 `p5/REVIEW.md` section 7: 7.1 two members one thread / company B none, 7.2 unknown-number inbound stores nothing + 403 without signature,
  7.3 `get_available_numbers` now 401 without login (live leaked 42 numbers), 7.4 send guards, 7.5 AI-reply switch, 7.6 NULL count.
- P6 `p6/REVIEW.md` section 7: tests 1-8 (policies exist, lock SQL rolled back, Stripe CLI subscription state, portal, frontend paused screen, fail-open).
- Then: kanban P1731 notes, ledger results, CHECKPOINT, re-snapshot `functions-live`.

### Step 6: api-gateway ownership guards + membership gate — DONE 11/02

Deployed live **v39** (was v35), `verify_jwt=false`. Source: `supabase/functions/api-gateway/{index.ts,_shared/api-auth.ts,_shared/utils.ts}`
(the two `_shared` files are the LIVE bytes, bundled function-locally — `phases/staging/api-gateway/REVIEW.md` D1). Base = live v35; nothing from main's gated copy.

- **Pre-deploy VERIFY (settled 11/02):** V1 `telnyx_assistants` has `user_id` + `organization_id`; V2 0 of 40 `phone_numbers.number` are non-`+1XXXXXXXXXX`;
  V3 all 3 `api_keys` rows carry an `organization_id`, and the MCP key's user IS a member of that org (`organization_users`), so the org branch is live.
- **Membership gate (the gap the 11/02 security review flagged):** new `async callerOrgId(rc)` checks `organization_users` for
  (key.user_id, key.organization_id); the old `scopeToCaller` was replaced by a SYNCHRONOUS `applyScope(builder, rc, orgId)`. Both `organization_credits`
  reads (`creditsBalance`, `validateCampaign`) now use the same gate. A user removed from a company can no longer reach that company's numbers,
  campaigns, leads or credit balance with an old key.
- **Gotcha that cost one deploy:** making the scope helper `async` made `await` execute the PostgrestFilterBuilder, so every owned-row request returned
  500 `q.eq is not a function`. The builder must stay un-awaited. Caught by T2/T3/T4; fixed in commit `21b7621d`.
- **Tests (curl, 11/02):** T0 reads 200 (`/me`, `/system/stats`, `/phone-numbers`, `/leads`, `/campaigns`, `/health`); T2a/T2b 400 `FROM_NUMBER_NOT_OWNED`;
  T3a/T3b 400 `CAMPAIGN_NOT_OWNED`; T5 400 `AGENT_NOT_OWNED`; T4 400 `LEAD_NOT_OWNED`; T6b 400 `FROM_NUMBER_NOT_OWNED`; T4b negative control 404
  (`Lead … not found`, live behaviour preserved). Row counts unchanged before/after (call_logs 5635, dialing_queues 511, sms_messages 1528); the 400s appear
  in `api_key_audit_log`. **T1/T6/T7 (the positive path, i.e. a real call/text) were NOT run — they need Charles present.**
- **Rollback:** Dashboard → api-gateway → version history → v35.

## 3. Follow-ups (logged, not blocking)

Billing lock on `sms_*` / coach tables; Stripe checkout amount verification (`resolvePaidCheckoutSession` dropped from the live-based webhook);
dispatcher / outbound-calling skip for paused orgs (they run as service_role); Telnyx caller-ID enforcement via outbound profile; regenerate
`src/integrations/supabase/types.ts`; promo code `oscar1` live with 100 redemptions (Charles decision, redacted from repo); CallWorkspace UI shell
per `phases/CALL-SCREEN-PORT.md` (DoorBoss workspace brought over whole: consent gate, rules coach, field-fill, Ask AI, two-tap end, in-person mode);
phase 3 pack seeding (dispositions / pipeline_boards / agent_scripts per pack) + wh_* tables; live security holes in FINDINGS.md fixed as each
function is redeployed from its live snapshot (disposition-router / outbound-calling / call-dispatcher / workflow-executor IDOR, unsigned retell webhook,
telnyx webhook fail-open, api-gateway from_number spoofing, pipeline-management IDOR, org self-owner insert).

## 4. Reference map

| Need | File |
|---|---|
| Product plan + phases | `docs/wholesale/PLAN.md` |
| Live schema facts (post phase 1 UPDATE section) | `docs/wholesale/audit/phase1/LIVE-SCHEMA.md` |
| Main vs live gates | `docs/wholesale/audit/phase1/LIVE-VS-MAIN-GATES.md`, `FINDINGS.md` |
| Live function snapshots | `supabase/functions-live/` (+ README) |
| Per-phase final review, deploy order, tests, rollback | `docs/wholesale/phases/staging/{p4a,p4b,p5,p6}/REVIEW.md` |
| Call screen port map | `docs/wholesale/phases/CALL-SCREEN-PORT.md`, source `docs/wholesale/doorboss-call/` |
| Dialer feature parity research | `docs/wholesale/research/DIALER-FEATURES.md` |
| Migration runner | `scripts/ship/run_migration.py` |
| Runtime import-cycle guard (bug 4) | `scripts/ship/check_cycles.py` — run before deploying functions; exits 1 if any entry reaches a runtime import cycle. `import type` is ignored. |
| DeepSeek worker | `~/.claude/skills/lithos/lithos_worker.py` (`SSL_CERT_FILE=C:/Users/charl/.certs/cacert.pem`; lanes `deepseek-ai/DeepSeek-V4.1-Flash{,-fast,-ultra,-ultra-chat}`) |
| Live tenancy helpers | `user_in_organization(uuid)` (ONE arg), `is_org_admin(uuid)`, `is_platform_operator()`, `merge_custom_fields(uuid,jsonb)`, `org_has_pack(uuid,text)`, `set_org_packs(uuid,text[])`, `default_organization_for_user(uuid)` (service_role only) |
| Live org / user | org `11824e05-24e3-4dc3-b684-5d0bc7c436d6` ("Default Organization"), user `5969774f-5340-4e4f-8517-bcc89fa6b1eb`; 3,303 leads, 5,635 call_logs, 40 numbers, 8 campaigns (10/29) |
