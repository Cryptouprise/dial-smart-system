# Dial Smart industry-packs build: SHIP RUNBOOK (canonical, locked 2026-11-01)

Owner: Charles. Foreman: Fable (holds every key, runs every deploy and DB change). Crew: DeepSeek V4.1 on LithosAI (drafts only; done).
Kanban: P1731. Branch: `wholesale` (off GitHub main d370432f). Supabase project: `emonjusymdripmkvtttc`. Lovable deploys the UI from GitHub `main` only.
Companion skill: `~/.claude/skills/dialsmart-packs/SKILL.md`. Plan and history: `PLAN.md`, `audit/phase1/FINDINGS.md`, `phases/staging/*/REVIEW.md`.

## 0. Where things stand (2026-11-01)

| Piece | State |
|---|---|
| Phase 1 org scope + guard fix + packs storage | APPLIED LIVE 10/29 (3 migrations: `20261029142121_phase1_org_scope`, `20261029150000_phase1_scope_guard_fix`, `20261029010000_industry_packs`). Verified: 0 NULL org ids, 32 "Company ..." policies, tenant guard proven fail-closed. |
| Browser phone (P4a), live coach (P4b), texting per company (P5), billing lock (P6) | CODE COMPLETE on branch `wholesale` (commit 804d823a + this runbook). tsc 0 errors, vite build ok, `deno check` clean on all 14 edge functions. NOT applied, NOT deployed, NOT pushed to main. |
| 4 migrations `20261029170000_browser_phone`, `180000_live_coach`, `190000_sms_per_organization`, `200000_billing_lock` | Staged. browser_phone dry run passed (HTTP 201). None applied. |
| 14 edge functions | Built; none deployed. |
| Secrets | None of the new ones set. |
| Frontend | Packs UI + CoachPanel + BillingPaused built; not on main, so not on Lovable. |
| Wholesale pack tables (`20261028210000_wholesale_core.sql`, wh_* tables) | Drafted + red-teamed, NOT applied (Charles stopped it 10/28). Ships on the phase-3 "pack enable seeds rows" mechanism, which is not built yet. |

Why the ship stalled 10/29-10/30: every live step needs one approved permission prompt; four prompts in a row came back rejected
(typing in the terminal while a prompt is open cancels it). Nothing was half-applied. Resume from step 1 below.

## 1. Hard rules (do not relax)

1. **Live, not main, is the source for any EXISTING edge function.** GitHub main is a containment branch: 74 of 99 functions carry
   `*_NOT_CERTIFIED` 503 gates (commit a8393da5, 2026-07-13) that live does NOT have (all live functions last deployed 2026-07-01).
   Deploying an existing function from main switches off texting/API. Patch only from `supabase/functions-live/<slug>/` (12 byte-exact
   snapshots, pulled via Management API `GET /v1/projects/{ref}/functions/{slug}/body`, ESZIP parsed). NEW functions may use main's
   `_shared/utils.ts`, `tenant-context.ts`, `stripe-signature.ts` (no gates in those). Re-snapshot after every deploy (`functions-live/README.md`).
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

| # | File | Dry run | What it does |
|---|---|---|---|
| 1 | `supabase/migrations/20261029170000_browser_phone.sql` | passed 10/29 (HTTP 201) | `call_logs.provider_call_id`; tables `voice_credentials`, `call_live_transcripts` (REPLICA IDENTITY FULL, in `supabase_realtime`); RPC `append_call_live_transcript` (service_role only) |
| 2 | `20261029180000_live_coach.sql` | not yet | `coach_proposals`, decide guard (INVOKER), `coach_recent_corrections`, `coach_move_stage`; precondition block RAISEs if #1 is missing |
| 3 | `20261029190000_sms_per_organization.sql` | not yet | `organization_id` on sms tables + backfill from the owning number, RLS rewritten to company membership, per-company AI-reply switch |
| 4 | `20261029200000_billing_lock.sql` | not yet | RESTRICTIVE "Billing lock" policy on leads/campaigns/phone_numbers/call_logs (`org_in_good_standing OR is_platform_operator`), guarded `organizations.billing_grace_until`, `stripe_events`. Locks nothing until an org has `billing_enabled = true`. |

Tools: MCP `mcp__supabase__apply_migration` (name = file stem after the timestamp) OR `python scripts/ship/run_migration.py <file> --dry` then `--apply`
(Management API; records the `schema_migrations` row; token read from `~/.mcp.json`, never printed). Verify each with the SQL in its REVIEW.md.

### Step 2: secrets + carrier setup (about 15 min). Names only.

Already live: `TELNYX_API_KEY`, `WEBHOOK_SECRET_TELNYX` (Telnyx Ed25519 public key, base64), `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `LOVABLE_API_KEY`.
Set (Dashboard > Edge Functions > Secrets, or `npx supabase secrets set` with `--project-ref emonjusymdripmkvtttc`):

- `LITHOS_API_KEY` (value from the lithos credentials file; optional `LITHOS_BASE_URL`, default `https://api.lithosai.cloud/v1`).
- `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`: create a Twilio API Key via REST using the account creds in `~/.mcp.json`.
- `TWILIO_TWIML_APP_SID`: create a TwiML App with Voice Request URL (POST) `<base>/twilio-voice-twiml` and Status Callback `<base>/twilio-voice-status`.
- `TELNYX_SIP_CONNECTION_ID`: create a Telnyx credential (WebRTC) connection with `webhook_event_url` = `<base>/voice-call-events`, an outbound voice
  profile attached, and the public key matching `WEBHOOK_SECRET_TELNYX`. `voice-token` mints per-user WebRTC JWTs from telephony credentials on it.
  Company Telnyx numbers in `phone_numbers` need `provider='telnyx'`, `status='active'`.
- `PUBLIC_FUNCTIONS_BASE_URL` only if functions move to a custom domain.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `APP_URL`: CHARLES in the Stripe dashboard (p6 REVIEW.md section 5: products/prices, `UPDATE plans`,
  webhook endpoint `<base>/stripe-webhook` with the 7 events listed there, reveal signing secret). Can ship after everything else; the lock stays inert.

### Step 3: deploy the 14 functions (about 15 min), this order, with these JWT flags

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

After deploys: re-snapshot the 5 replaced functions into `supabase/functions-live/`.
Rollback per function: Dashboard version history (previous live versions: twilio-sms-webhook v532, sms-messaging v525, ai-sms-processor v524,
stripe-webhook live) or redeploy the `functions-live` snapshot.

### Step 4: frontend (about 5 min)

`git push origin wholesale` (backup, no deploy) then merge/push `wholesale` -> `main`; Lovable redeploys. Includes packs UI (`src/lib/packs.ts`,
`useEnabledPacks`, `PackSettings`, sidebar/dashboard tabs `packs`, `se-workspace`, `wh-properties`, `d2d-knock-list`), `BrowserPhone.ts`,
`CoachPanel.tsx`, `useOrgStanding.ts` (fails open), `BillingPaused.tsx`, `ProtectedRoute.tsx`. Core dialer tabs are never pack-gated.
Deps already in package.json: `@telnyx/webrtc ^2.25.0`, `@twilio/voice-sdk ^2.12.0`.

### Step 5: tests (about 20 min; a live test call needs Charles present and his go)

- P4a `phases/staging/p4a/REVIEW.md` section 6: T1 token auth (401/200/403/400/429), T2 call guards (CALLER_ID_NOT_OWNED, DNC_BLOCKED, LEAD_NOT_OWNED),
  T3 RLS, T4 Telnyx replay, T5 Twilio status replay, T6 Twilio transcription replay, T7-T8 client. Live call target: Charles +12145291531.
- P4b `p4b/REVIEW.md` section 7: T1-T14 (objects exist, fake transcript lines, coach-suggest 200/cached/429/403/404, decide accept -> router 200,
  correct/409, side effects, stage move, field fill, callback, second-org negative test, member column guard, expiry).
- P5 `p5/REVIEW.md` section 7: 7.1 two members one thread / company B none, 7.2 unknown-number inbound stores nothing + 403 without signature,
  7.3 `get_available_numbers` now 401 without login (live leaked 42 numbers), 7.4 send guards, 7.5 AI-reply switch, 7.6 NULL count.
- P6 `p6/REVIEW.md` section 7: tests 1-8 (policies exist, lock SQL rolled back, Stripe CLI subscription state, portal, frontend paused screen, fail-open).
- Then: kanban P1731 notes, ledger results, CHECKPOINT, re-snapshot `functions-live`.

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
| DeepSeek worker | `~/.claude/skills/lithos/lithos_worker.py` (`SSL_CERT_FILE=C:/Users/charl/.certs/cacert.pem`; lanes `deepseek-ai/DeepSeek-V4.1-Flash{,-fast,-ultra,-ultra-chat}`) |
| Live tenancy helpers | `user_in_organization(uuid)` (ONE arg), `is_org_admin(uuid)`, `is_platform_operator()`, `merge_custom_fields(uuid,jsonb)`, `org_has_pack(uuid,text)`, `set_org_packs(uuid,text[])`, `default_organization_for_user(uuid)` (service_role only) |
| Live org / user | org `11824e05-24e3-4dc3-b684-5d0bc7c436d6` ("Default Organization"), user `5969774f-5340-4e4f-8517-bcc89fa6b1eb`; 3,303 leads, 5,635 call_logs, 40 numbers, 8 campaigns (10/29) |
