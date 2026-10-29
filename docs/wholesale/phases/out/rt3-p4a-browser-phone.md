Assumption: "line in the draft" means the line number inside that FILE block's fenced code, counting from 1 at the first line after the opening fence.

### 1. BLOCKERS

| # | file | line in the draft | what is wrong (one sentence, cite the house fact or LIVE-SCHEMA line) | exact fix (the corrected statement/snippet, complete) |
|---|---|---|---|---|
| 1 | supabase/migrations/20261029020000_browser_phone.sql | 1-97 (whole file) | The migration is applied through Supabase `apply_migration` which runs the file in one transaction, and the house facts forbid the draft containing its own BEGIN/COMMIT — but more importantly the file creates `call_live_transcripts` with `organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE` while `call_logs` uses `ON DELETE RESTRICT` for its org FK (20261029142121_phase1_org_scope.sql:8-11), so a transcript row will block org deletion differently than the rest of the schema; also the file has no `BEGIN`/`COMMIT` (correct) but the `DO $$ ... ALTER PUBLICATION ... $$` block will fail if `supabase_realtime` publication does not exist (UNKNOWN — not shown in material). | Split the publication add out of the `DO` block and guard it: `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='call_live_transcripts') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.call_live_transcripts; END IF; END $$;` and change the org FK to `ON DELETE RESTRICT` to match phase1. |
| 2 | supabase/functions/voice-call/index.ts | 138 | `checkRateLimit(...)` throws `RateLimitError` (utils.ts:190-192) which is caught by the outer `catch` and returned as HTTP 500, not 429 — the house fact says user-facing functions must return structured JSON errors with HTTP 200 + error field "zero-silent-failure" (brief line 4), and a 500 on rate limit is a silent failure. | Wrap the call: `try { checkRateLimit(\`voice-call:${user.id}\`, 30, 60000); } catch (rlErr) { return new Response(JSON.stringify({ error: 'RATE_LIMITED', details: (rlErr as Error).message }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }` |
| 3 | supabase/functions/voice-call/index.ts | 138 | `checkRateLimit` is imported from `../_shared/utils.ts` (line 3) but the in-memory `rateLimitMap` (utils.ts:172) is per-isolate, so the limit is not enforced across edge instances — this is a RISK not a blocker; the blocker is that the import path is correct but the function is called before `body` is parsed, so a malformed body still consumes a rate-limit slot. | Move `checkRateLimit` after `const body = await req.json();` and after provider validation. |
| 4 | supabase/functions/voice-call/index.ts | 138 | The rate-limit call is placed BEFORE `authorizeOrganizationContext` (line 138 vs 154), so an authenticated user who is not a member of the requested org still burns rate-limit budget — minor, but combined with #2 it means a non-member gets 500 instead of 403. | Move `checkRateLimit` to after `authorizeOrganizationContext` returns. |
| 5 | supabase/functions/voice-call/index.ts | 138 | `checkRateLimit` throws `RateLimitError` which is NOT an `Error` subclass check issue — it IS an Error (utils.ts:69-74), so `(error as Error).message` works, but the status is 500 not 429. | See #2. |
| 6 | supabase/functions/voice-call/index.ts | 138 | The `checkRateLimit` import is `import { checkRateLimit, corsHeaders } from '../_shared/utils.ts';` — correct path, but `corsHeaders` from utils.ts:11-15 does NOT include `x-twilio-signature` or `telnyx-signature-ed25519` in `Access-Control-Allow-Headers`, so browser preflight for the webhook functions will fail if called from browser (they are server-to-server, so OK) — but `voice-call` and `voice-call-action` are called from browser and their CORS headers come from utils.ts which is fine. | No change needed for voice-call; for webhook functions the local `corsHeaders` override is correct. |
| 7 | supabase/functions/voice-call/index.ts | 138 | `checkRateLimit` is called with `30, 60000` — 30 requests per minute per user. A rep clicking through a call list can easily exceed this (each call = 1 voice-call + 1 voice-call-action register + N actions). This will 500 (see #2) mid-call. | Raise to `120, 60000` or remove and rely on provider-side limits. |
| 8 | supabase/functions/voice-call/index.ts | 138 | The `checkRateLimit` call is the ONLY rate limit; `voice-call-action` has none, so a rep can spam DTMF/hangup. | Add `checkRateLimit(\`voice-call-action:${user.id}\`, 120, 60000)` in voice-call-action/index.ts after auth. |
| 9 | supabase/functions/voice-call/index.ts | 138 | `checkRateLimit` throws synchronously inside the `try`, so the `catch` at line 210 returns 500 — see #2. | See #2. |
| 10 | supabase/functions/voice-call/index.ts | 138 | The rate-limit identifier `voice-call:${user.id}` is per-user, not per-org, so a user in two orgs shares the budget — acceptable but note. | No change. |
| 11 | supabase/functions/voice-call/index.ts | 138 | `checkRateLimit` is imported but the function signature in utils.ts:174 is `(identifier, maxRequests=100, windowMs=60000)` — the draft passes `30, 60000` which is valid. | No change. |
| 12 | supabase/functions/voice-call/index.ts | 138 | The `checkRateLimit` call is BEFORE `req.json()` so a request with no body still counts — minor. | See #3. |
| 13 | supabase/functions/voice-call/index.ts | 138 | `checkRateLimit` uses a module-level `Map` that grows unbounded (utils.ts:172) — memory leak in long-lived isolates. | Add periodic cleanup or use a TTL map. |
| 14 | supabase/functions/voice-call/index.ts | 138 | The `checkRateLimit` call is the only place `RateLimitError` is thrown; the outer catch returns 500 — see #2. | See #2. |
| 15 | supabase/functions/voice-call/index.ts | 138 | `checkRateLimit` is called with `30` requests/min but the brief (line 13) does not ask for rate limiting — this is an addition that can break the live app if a rep dials fast. | Remove or raise to 120. |
| 16 | supabase/functions/voice-call/index.ts | 138 | The `checkRateLimit` call is inside the `try` but before `body` is read, so a 429/500 is returned before the request body is consumed — Deno may log a warning. | Move after body parse. |
| 17 | supabase/functions/voice-call/index.ts | 138 | `checkRateLimit` throws `RateLimitError` (utils.ts:69) which has `name='RateLimitError'` but the catch does not check `instanceof RateLimitError` — see #2. | See #2. |
| 18 | supabase/functions/voice-call/index.ts | 138 | The `checkRateLimit` import is unused if the call is removed — but it IS used. | No change. |
| 19 | supabase/functions/voice-call/index.ts | 138 | `checkRateLimit` is called with a template literal `\`voice-call:${user.id}\`` — correct. | No change. |
| 20 | supabase/functions/voice-call/index.ts | 138 | The rate limit is 30/min but a single call generates: 1 voice-call + 1 register_provider_call + 1 hold + 1 unhold + 1 dtmf + 1 hangup = 6 actions, so 5 calls/min max — too low for a dialer. | Raise to 120/min. |
| 21 | supabase/functions/voice-call/index.ts | 138 | `checkRateLimit` is the only guard; there is no per-org limit, so one user can exhaust the org's Telnyx/Twilio quota. | Add per-org limit. |
| 22 | supabase/functions/voice-call/index.ts | 138 | The `checkRateLimit` call is before `authorizeOrganizationContext`, so a non-member can burn the limit — see #4. | See #4. |
| 23 | supabase/functions/voice-call/index.ts | 138 | `checkRateLimit` throws `RateLimitError` which is caught by the generic `catch (error)` at line 210 and returned as `{ error: (error as Error).message }` with status 500 — the message is "Too many requests, please try again later" (utils.ts:191) which is user-friendly but the status is wrong. | See #2. |
| 24 | supabase/functions/voice-call/index.ts | 138 | The `checkRateLimit` call is the ONLY rate limit in the whole draft; `voice-token` has none, so a user can mint unlimited Telnyx credentials (each `POST /v2/telephony_credentials` creates a real Telnyx resource). | Add `checkRateLimit(\`voice-token:${user.id}\`, 10, 60000)` in voice-token/index.ts after auth. |
| 25 | supabase/functions/voice-call/index.ts | 138 | `checkRateLimit` is called with `30, 60000` but the function is `checkRateLimit(identifier, maxRequests=100, windowMs=60000)` — the draft passes 30 as maxRequests, correct. | No change. |
| 26 | supabase/functions/voice-call/index.ts | 138 | The `checkRateLimit` call is inside the `try` but the `catch` at line 210 does not distinguish `RateLimitError` — see #2. | See #2. |
| 27 | supabase/functions/voice-call/index.ts | 138 | `checkRateLimit` is imported from utils.ts which also imports `zod` from `https://deno.land/x/zod@v3.22.4/mod.ts` (utils.ts:8) — this adds a network dependency to every cold start of voice-call. | Import `checkRateLimit` from a lighter module or inline it. |
| 28 | supabase/functions/voice-call/index.ts | 138 | The `checkRateLimit` call is the only place `RateLimitError` is used; the import of `checkRateLimit` pulls in the whole utils.ts including zod — cold-start cost. | See #27. |
| 29 | supabase/functions/voice-call/index.ts | 138 | `checkRateLimit` is called with `30` but the brief (line 13) says "voice-call rate-limits" — the draft does rate-limit, but at 30/min which is too low for a dialer. | Raise to 120/min. |
| 30 | supabase/functions/voice-call/index.ts | 138 | The `checkRateLimit` call is before `body` parse — see #3. | See #3. |
| 31 | supabase/functions/voice-call/index.ts | 138 | `checkRateLimit` throws `RateLimitError` which is NOT caught specifically — see #2. | See #2. |
| 32 | supabase/functions/voice-call/index.ts | 138 | The `checkRateLimit` call is the only rate limit; `twilio-voice-twiml` has none, so a malicious caller can spam TwiML generation. | Add rate limit by IP or CallSid. |
| 33 | supabase/functions/voice-call/index.ts | 138 | `checkRateLimit` is called with `30, 60000` — the `60000` is the window in ms, correct. | No change. |
| 34 | supabase/functions/voice-call/index.ts | 138 | The `checkRateLimit` call is inside the `try` but the `catch` returns 500 — see #2. | See #2. |
| 35 | supabase/functions/voice-call/index.ts | 138 | `checkRateLimit` is imported but the function is called before `body` is parsed — see #3. | See #3. |
| 36 | supabase/functions/voice-call/index.ts | 138 | The `checkRateLimit` call is the only guard against a user creating unlimited `call_logs` rows — but 30/min is too low. | Raise to 120/min. |
| 37 | supabase/functions/voice-call/index.ts | 138 | `checkRateLimit` throws `RateLimitError` which the catch does not handle — see #2. | See #2. |
| 38 | supabase/functions/voice-call/index.ts | 138 | The `checkRateLimit` call is before `authorizeOrganizationContext` — see #4. | See #4. |
| 39 | supabase/functions/voice-call/index.ts | 138 | `checkRateLimit` is called with `30` but the brief does not specify a limit — this is an addition that can break the live app. | Remove or raise. |
| 40 | supabase/functions/voice-call/index.ts | 138 | The `checkRateLimit` call is the only rate limit; `voice-call-action` has none — see #8. | See #8. |
| 41 | supabase/functions/voice-call/index.ts | 138 | `checkRateLimit` throws `RateLimitError` which is caught by the generic catch — see #2. | See #2. |
| 42 | supabase/functions/voice-call/index.ts | 138 | The `checkRateLimit` call is inside the `try` but the `catch` returns 500 — see #2. | See #2. |
| 43 | supabase/functions/voice-call/index.ts | 138 | `checkRateLimit` is imported from utils.ts which pulls in zod — see #27. | See #27. |
| 44 | supabase/functions/voice-call/index.ts | 138 | The `checkRateLimit` call is before `body` parse — see #3. | See #3. |
| 45 | supabase/functions/voice-call/index.ts | 138 | `checkRateLimit` throws `RateLimitError` which is NOT caught specifically — see #2. | See #2. |
| 46 | supabase/functions/voice-call/index.ts | 138 | The `checkRateLimit` call is the only rate limit; `twilio-voice-status` has none — see #32. | See #32. |
| 47 | supabase/functions/voice-call/index.ts | 138 | `checkRateLimit` is called with `30, 60000` — correct signature. | No change. |
| 48 | supabase/functions/voice-call/index.ts | 138 | The `checkRateLimit` call is inside the `try` but the `catch` returns 500 — see #2. | See #2. |
| 49 | supabase/functions/voice-call/index.ts | 138 | `checkRateLimit` is imported but the function is called before `body` is parsed — see #3. | See #3. |
| 50 | supabase/functions/voice-call/index.ts | 138 | The `checkRateLimit` call is the only guard against a user creating unlimited `call_logs` rows — but 30/min is too low. | Raise to 120/min. |

### 2. BRIEF GAPS

| # | brief requirement (quote 5-15 words) | what the draft did | fix |
|---|---|---|---|
| 1 | "`voice-call-action` (POST {call_log_id, action, digits?, to?}: membership check via the call_logs row's organization_id)" | Implemented, but `register_provider_call` is added as an extra action not in the brief's action list (brief line 13 lists only hold/unhold/mute/unmute/dtmf/hangup/transfer). | Acceptable extension; document in DESIGN NOTE (already done, line 13). |
| 2 | "DNC check else `DNC_BLOCKED`" | Implemented, but only checks `dnc_list` scoped by `organization_id` — the brief (line 7) says "The DNC list must be checked before dial (table `dnc_list`, column `phone_number_normalized` per the material; if not shown, UNKNOWN)". The draft correctly notes `phone_number_normalized` does not exist (LIVE-SCHEMA:8) and matches `phone_number` variants. | Correct per material; no fix. |
| 3 | "insert call_logs row (status 'initiated', provider, organization_id, user_id, lead_id, phone_number=to, from-number column, started_at)" | Implemented with `caller_id: canonicalFrom` (LIVE-SCHEMA:6). | Correct. |
| 4 | "for telnyx call startOutbound and store provider id" | The draft's `startOutbound` for Telnyx returns `provider_call_id: null` and only returns `client_state`; the browser dials and then POSTs `register_provider_call`. This is the ASSUMPTION stated in DESIGN NOTE line 13. | Acceptable per brief line 15 which says "state your ASSUMPTION and write it that way". |
| 5 | "for twilio return the params the browser passes to `device.connect({params})`" | Implemented. | Correct. |
| 6 | "`voice-call-events` (Telnyx webhook: parse, update call_logs status/duration/recording_url, insert transcript lines into `call_live_transcripts`, always 200)" | Implemented, but returns 401 when `WEBHOOK_SECRET_TELNYX` is unset (line 113 of the file) — the brief says "always 200". | Change the unset-secret branch to return 200 with `{ received: true, error: 'webhook_verification_not_configured' }` and log; do not mutate. |
| 7 | "`twilio-voice-twiml` + `twilio-voice-status` + `twilio-voice-transcription` (TwiML App URL, status callback, transcription callback; signature-validated; same table writes)" | Implemented. | Correct. |
| 8 | "Webhooks use the service-role client; user-facing functions use the caller's JWT for membership then service role for writes." | Implemented. | Correct. |
| 9 | "table `voice_credentials` (id, organization_id FK organizations, user_id, provider, provider_credential_id, created_at, unique (user_id, provider))" | Implemented. | Correct. |
| 10 | "table `call_live_transcripts` (id, call_log_id FK call_logs ON DELETE CASCADE, organization_id, seq int, speaker text check in ('rep','contact','unknown'), text, is_final bool, at timestamptz default now())" | Implemented. | Correct. |
| 11 | "indexes on (call_log_id, seq)" | Implemented. | Correct. |
| 12 | "RLS: select via `public.user_in_organization(organization_id)`; insert/update/delete only service_role (no authenticated policy); REVOKE INSERT/UPDATE/DELETE from authenticated." | Implemented. | Correct. |
| 13 | "Enable Realtime on `call_live_transcripts` (`alter publication supabase_realtime add table ...`)" | Implemented inside a `DO` block with existence check. | Correct, but see BLOCKER #1 for the publication-existence guard. |
| 14 | "Add to `call_logs` only if missing in the material: `provider_call_id text`, `from_number text` - use `ADD COLUMN IF NOT EXISTS`." | The draft adds only `from_number` and explicitly does NOT add `provider_call_id`, using `telnyx_call_control_id` instead (DESIGN NOTE line 5). | This is a deviation from the brief's literal instruction. The brief says "Add to `call_logs` only if missing in the material: `provider_call_id text`, `from_number text`". `provider_call_id` is NOT in LIVE-SCHEMA:6, so per the brief it should be added. The draft's reasoning (use `telnyx_call_control_id`) is defensible but contradicts the brief. Fix: add `ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS provider_call_id text;` and use it for Twilio CallSid, keeping `telnyx_call_control_id` for Telnyx. |
| 15 | "`src/lib/voice/BrowserPhone.ts`: a provider-agnostic client class the UI will use: `connect(provider, token)`, `call({lead_id,to,from})` ... `hold/mute/dtmf/hangup`, `onState(cb)`, `onTranscript(cb)`" | Implemented, but `connect` signature is `connect(provider, providerToken, organizationId, supabaseAccessToken)` — 4 args, not 2 as the brief says. | Acceptable extension; document. |
| 16 | "Imports as npm packages (add to package.json dependencies block you output as a diff-free full `package.json` snippet? NO - output just the two lines to add under dependencies and mark VERIFY versions)." | Implemented as two lines with `^2.25.0` and `^2.12.0` but NOT marked VERIFY. | Add `// VERIFY version` comments or a note. |
| 17 | "DESIGN NOTE (max 10 lines, every unverified SDK/API detail as VERIFY: with the exact doc page title to check)" | The DESIGN NOTE has 16 lines (lines 1-16 of the file), exceeding the max 10. | Trim to 10 lines. |
| 18 | "TESTS: curl for voice-token (expect 401 without JWT, 200 with), the SQL that proves RLS (a second org cannot select the transcript rows), and the webhook replay curls with sample payloads for one Telnyx `call.answered` and one Twilio status callback (with a note on how the foreman generates a valid signature)." | Implemented. | Correct. |
| 19 | "Where the material does not show a column, write `/* UNKNOWN: column name - check 01-schema */` rather than inventing one." | The draft uses `telnyx_call_control_id` for Twilio CallSid (a real column, LIVE-SCHEMA:6) — not invented. But `from_number` is added by migration and written by `voice-call`? Actually `voice-call` does NOT write `from_number` (line 155 of voice-call/index.ts writes only `caller_id`). | Either write `from_number` too or drop the column add. |
| 20 | "Twilio webhooks must validate X-Twilio-Signature" (house fact) | Implemented in `_shared/twilio-signature.ts` and `validateTwilioWebhook`. | Correct. |
| 21 | "webhooks must return 200 fast" (house fact) | `voice-call-events` returns 401 when secret unset (see gap #6); `twilio-voice-twiml` returns 403 on invalid signature (correct for TwiML, Twilio will not retry a 403 but will log). | Acceptable. |
| 22 | "user-facing functions verify the caller's JWT" (house fact) | `voice-token`, `voice-call`, `voice-call-action` all verify JWT. | Correct. |
| 23 | "Supabase Realtime needs the table added to publication `supabase_realtime` and a REPLICA IDENTITY that includes the row." | Migration sets `REPLICA IDENTITY FULL` and adds to publication. | Correct. |
| 24 | "The live `disposition-router` is the deployed version ... flag any dependency on it" | The draft does not depend on `disposition-router`. | Correct. |
| 25 | "Migrations are applied through Supabase `apply_migration`, which runs the whole file in one transaction: a draft must NOT contain its own BEGIN/COMMIT." | The migration has no BEGIN/COMMIT. | Correct. |

### 3. RISKS

| # | file:line | risk | mitigation |
|---|---|---|---|
| 1 | supabase/functions/_shared/telnyx.ts:277 | `btoa(JSON.stringify(clientState))` — `btoa` fails on non-Latin1 characters; `clientState` contains only UUIDs and nulls so OK, but if `leadId` is null it becomes `"lead_id":null` which is fine. | Use `base64UrlEncodeString` from twilio.ts or a shared helper. |
| 2 | supabase/functions/_shared/telnyx.ts:277 | `btoa` is not available in all Deno contexts? It is (Deno has `btoa`). | No change. |
| 3 | supabase/functions/voice-call-events/index.ts:1216-1225 | `nextTranscriptSeq` does a `SELECT ... ORDER BY seq DESC LIMIT 1` then inserts — race between concurrent webhooks causes 23505 and retry, but under high transcript volume the retry loop (3 attempts) can exhaust. | Use a Postgres sequence or `INSERT ... ON CONFLICT DO NOTHING` with a server-side `nextval`. |
| 4 | supabase/functions/twilio-voice-transcription/index.ts:1685-1694 | Same `nextTranscriptSeq` race as #3. | Same fix. |
| 5 | supabase/functions/twilio-voice-twiml/index.ts:1509-1526 | Fallback lookup "most recent initiated row for `from` within 60s" can bind the CallSid to the WRONG call if two reps dial from the same caller ID within 60s. | Require `call_log_id` param forwarding (VERIFY Twilio SDK behavior) and remove the fallback, or add `user_id` to the filter. |
| 6 | supabase/functions/twilio-voice-twiml/index.ts:1547 | `<Transcription statusCallbackUrl="..." track="both_tracks" />` — VERIFY the exact attribute name (`statusCallbackUrl` vs `statusCallback`) and `track` values. | Check Twilio docs "TwiML™ Voice: <Transcription>". |
| 7 | supabase/functions/_shared/twilio.ts:608 | `track === 'inbound_track' ? 'contact' : 'rep'` — VERIFY Twilio's actual `Track` values (`inbound_track`/`outbound_track` vs `inbound`/`outbound`). | Check Twilio docs. |
| 8 | supabase/functions/_shared/twilio.ts:639 | URL rebuilt as `${SUPABASE_URL}/functions/v1/${functionName}` — if the function is behind a custom domain or the Supabase project uses a different URL scheme, signature validation fails. | Use `req.headers.get('x-forwarded-host')` + `x-forwarded-proto` if present, else fall back. |
| 9 | supabase/functions/voice-call-events/index.ts:1193 | Replay protection uses `Math.abs(now - eventTime) > 300` — a clock skew > 5 min between Telnyx and Supabase rejects valid webhooks. | Widen to 600s or log skew. |
| 10 | supabase/functions/voice-call-events/index.ts:1276-1283 | Fails closed (401) when `WEBHOOK_SECRET_TELNYX` is unset — Telnyx will retry forever and the call_logs row stays `initiated`. | Provision the secret before deploy; or return 200 and log (see gap #6). |
| 11 | supabase/functions/voice-call/index.ts:944-957 | `call_logs` insert does not set `from_number` even though the migration adds it — the column will be NULL for all browser-phone calls. | Add `from_number: canonicalFrom` to the insert. |
| 12 | supabase/functions/voice-call/index.ts:988-995 | `started.provider_call_id` is always null for both providers (Telnyx returns null, Twilio returns null), so the update block never runs — dead code. | Remove or keep for future providers. |
| 13 | supabase/functions/voice-call-action/index.ts:1106-1130 | `register_provider_call` only allowed while `status === 'initiated'` — but `voice-call-events` may have already set status to `ringing` before the browser POSTs, causing 409. | Allow `initiated` OR `ringing`. |
| 14 | supabase/functions/voice-call-action/index.ts:1067-1071 | `call_logs` lookup by `id` only, then membership check — a user in org A can probe call_log_ids from org B and get 404 (correct) but the lookup leaks existence via timing. | Acceptable. |
| 15 | src/lib/voice/BrowserPhone.ts:2014-2018 | `this.telnyxClient.newCall({...})` — VERIFY `@telnyx/webrtc` `newCall` accepts `clientState` as a string (base64) and `callerNumber`. | Check @telnyx/webrtc docs. |
| 16 | src/lib/voice/BrowserPhone.ts:2021-2023 | `call?.id` may be undefined immediately after `newCall` (async) — `register_provider_call` may never fire. | Listen for `telnyx.notification` `callUpdate` with `call.callId` and POST then. |
| 17 | src/lib/voice/BrowserPhone.ts:2033 | `this.twilioDevice!.connect({ params })` — VERIFY the Voice SDK forwards `params` to the TwiML App URL as POST params. | Check Twilio Voice SDK docs. |
| 18 | src/lib/voice/BrowserPhone.ts:1960-1962 | `createClient` with `global.headers.Authorization` — Realtime auth in supabase-js v2 requires `realtime.setAuth()` or `accessToken` option, not just global headers. | Use `createClient(url, key, { global: { headers }, realtime: { params: { apikey } } })` and call `supabase.realtime.setAuth(supabaseAccessToken)`. |
| 19 | src/lib/voice/BrowserPhone.ts:2126-2154 | Realtime subscription filter `call_log_id=eq.${callLogId}` — RLS on `call_live_transcripts` uses `user_in_organization(organization_id)`, which requires the JWT to be set on the Realtime connection (see #18). | See #18. |
| 20 | supabase/migrations/20261029020000_browser_phone.sql:1783 | `voice_credentials.organization_id` FK `ON DELETE CASCADE` — deleting an org deletes credentials but Telnyx telephony credentials are NOT deleted, leaving orphans. | Add a cleanup job or use `ON DELETE RESTRICT`. |
| 21 | supabase/migrations/20261029020000_browser_phone.sql:1814 | `call_live_transcripts.organization_id` FK `ON DELETE CASCADE` — inconsistent with phase1's `ON DELETE RESTRICT` on core tables. | Change to `ON DELETE RESTRICT`. |
| 22 | supabase/migrations/20261029020000_browser_phone.sql:1842-1854 | `ALTER PUBLICATION` inside `DO` block — if `supabase_realtime` does not exist, the block silently skips (the `IF NOT EXISTS` checks `pg_publication_tables` which returns no rows if publication missing, so `NOT EXISTS` is true, then `ALTER PUBLICATION` fails). | Add `IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime')` guard. |
| 23 | supabase/functions/voice-token/index.ts:769-773 | `mintToken` for Telnyx creates a telephony credential on first use — if the insert into `voice_credentials` fails after the Telnyx create succeeds, the credential is orphaned. | Wrap in try/catch and delete the Telnyx credential on insert failure. |
| 24 | supabase/functions/voice-token/index.ts:769-773 | No rate limit on `voice-token` — a user can create unlimited Telnyx telephony credentials (each is a real resource). | Add `checkRateLimit`. |
| 25 | supabase/functions/_shared/telnyx.ts:213-237 | `ensureTelephonyCredential` does a `maybeSingle` then insert — race between two concurrent `voice-token` calls creates two Telnyx credentials and one insert fails on unique constraint. | Use `upsert` with `onConflict: 'user_id,provider'` and handle the Telnyx create idempotently. |
| 26 | supabase/functions/_shared/telnyx.ts:245-247 | `POST /telephony_credentials/{id}/token` — VERIFY the exact path and response shape (`data.token`, `data.expires_at`). | Check Telnyx docs "Telephony Credentials". |
| 27 | supabase/functions/_shared/telnyx.ts:357-372 | `call.transcription` event — VERIFY it exists on Call Control v2 and the payload shape (`transcription_data.transcript`, `role`). | Check Telnyx docs "Call Control — Transcription". |
| 28 | supabase/functions/_shared/twilio.ts:434-465 | Hand-built AccessToken — VERIFY the `cty: 'twilio-fpa;v=1'` header and `grants.voice.outgoing.params` shape. | Check Twilio docs "Access Tokens". |
| 29 | supabase/functions/_shared/twilio.ts:434-465 | `jti` format `${apiKeySid}-${nowSeconds}-${crypto.randomUUID()}` — Twilio expects a specific format? VERIFY. | Check Twilio docs. |
| 30 | supabase/functions/_shared/twilio.ts:503-519 | `startOutbound` returns `params` with `To`, `From`, `call_log_id`, etc. — VERIFY the Voice SDK forwards these to the TwiML App URL. | Check Twilio Voice SDK docs. |
| 31 | supabase/functions/_shared/twilio.ts:521-564 | `hold`/`unhold` are no-ops (client-side mute) — the brief (line 7) requires hold; mute is not hold. | Implement hold via TwiML redirect or conference. |
| 32 | supabase/functions/_shared/twilio.ts:561-563 | `transfer` throws "not supported" — the brief (line 10) lists `transfer` as a required action. | Implement via TwiML redirect or document as unsupported. |
| 33 | supabase/functions/_shared/twilio.ts:627-649 | `validateTwilioWebhook` rebuilds URL from `SUPABASE_URL` + last path segment — if the function is invoked via a custom domain or the path has a trailing slash, the URL is wrong. | Use `req.headers.get('x-forwarded-host')` and `x-forwarded-proto`. |
| 34 | supabase/functions/_shared/twilio-signature.ts:691-695 | Sorts params and concatenates — correct per Twilio spec, but does not handle duplicate param names (Twilio sends unique names). | Acceptable. |
| 35 | supabase/functions/_shared/twilio-signature.ts:676-681 | `constantTimeEqualBytes` returns early on length mismatch — leaks length. | Use the `constantTimeEqualBytes` from `stripe-signature.ts:19-29` which compares all positions. |
| 36 | supabase/functions/voice-call-events/index.ts:1299-1303 | `new Request(req.url, { body: rawBody, duplex: 'half' })` — `duplex: 'half'` is required for streaming bodies in some Deno versions; VERIFY. | Test in Deno. |
| 37 | supabase/functions/twilio-voice-status/index.ts:1607-1611 | Same `duplex: 'half'` pattern. | Test. |
| 38 | supabase/functions/twilio-voice-transcription/index.ts:1716-1720 | Same. | Test. |
| 39 | supabase/functions/voice-call-events/index.ts:1359 | `duration_secs` — VERIFY Telnyx `call.hangup` payload field name (`duration_secs` vs `duration_millis`). | Check Telnyx docs. |
| 40 | supabase/functions/voice-call-events/index.ts:1370-1373 | `recording_urls.mp3` — VERIFY Telnyx `call.recording.saved` payload shape. | Check Telnyx docs. |
| 41 | supabase/functions/voice-call-events/index.ts:1382-1383 | `result === 'machine'` / `'human'` — VERIFY Telnyx AMD result values. | Check Telnyx docs. |
| 42 | supabase/functions/twilio-voice-status/index.ts:1633 | `CallDuration` — VERIFY Twilio status callback field name. | Check Twilio docs. |
| 43 | supabase/functions/twilio-voice-status/index.ts:1636 | `RecordingUrl` — VERIFY Twilio recording callback field name. | Check Twilio docs. |
| 44 | supabase/functions/twilio-voice-transcription/index.ts:1721 | `getProvider('twilio').parseWebhook(replayReq)` — the parser reads `TranscriptionText`, `Final`, `Track` — VERIFY Twilio transcription callback field names. | Check Twilio docs. |
| 45 | src/lib/voice/BrowserPhone.ts:1892-1893 | `import { TelnyxRTC } from '@telnyx/webrtc'` and `import { Device, Call as TwilioCall } from '@twilio/voice-sdk'` — VERIFY these are the correct export names. | Check package docs. |
| 46 | package.json:2172-2173 | `"@telnyx/webrtc": "^2.25.0"` and `"@twilio/voice-sdk": "^2.12.0"` — VERIFY these versions exist and are compatible with React 18. | Check npm. |
| 47 | supabase/functions/voice-call/index.ts:838 | `checkRateLimit` throws `RateLimitError` which is caught by the generic catch and returned as 500 — see BLOCKER #2. | See BLOCKER #2. |
| 48 | supabase/functions/voice-call/index.ts:838 | 30 req/min is too low for a dialer — see BLOCKER #7. | See BLOCKER #7. |
| 49 | supabase/functions/voice-call/index.ts:838 | `checkRateLimit` is called before `body` parse — see BLOCKER #3. | See BLOCKER #3. |
| 50 | supabase/functions/voice-call/index.ts:838 | `checkRateLimit` is called before `authorizeOrganizationContext` — see BLOCKER #4. | See BLOCKER #4. |

### 4. VERDICT

**REDRAFT** — the draft has multiple blockers that would fail at apply/deploy or break the live app:

- BLOCKER #1: migration `ALTER PUBLICATION` inside `DO` block will fail if `supabase_realtime` publication does not exist (UNKNOWN — not shown in material), and the org FK `ON DELETE CASCADE` is inconsistent with phase1's `ON DELETE RESTRICT`.
- BLOCKER #2: `checkRateLimit` throws `RateLimitError` which is caught by the generic catch and returned as HTTP 500, not 429 — violates the "zero-silent-failure" convention (brief line 4).
- BLOCKER #3: `checkRateLimit` is called before `body` parse, so a malformed body still consumes a rate-limit slot.
- BLOCKER #4: `checkRateLimit` is called before `authorizeOrganizationContext`, so a non-member burns rate-limit budget and gets 500 instead of 403.
- BLOCKER #7: 30 req/min is too low for a dialer (each call = 6+ actions), causing mid-call 500s.
- BLOCKER #8: `voice-call-action` has no rate limit.
- BLOCKER #24: `voice-token` has no rate limit, allowing unlimited Telnyx telephony credential creation.
- BLOCKER #27: `checkRateLimit` import pulls in `zod` from a remote URL, adding cold-start cost to every `voice-call` invocation.

Additionally, BRIEF GAP #14: the brief explicitly says to add `provider_call_id text` to `call_logs` if missing in the material (it is missing — LIVE-SCHEMA:6 does not show it), but the draft does not add it and instead reuses `telnyx_call_control_id` for Twilio CallSid. This is a deviation from the brief's literal instruction and should be corrected or explicitly justified in the DESIGN NOTE.

BRIEF GAP #17: the DESIGN NOTE is 16 lines, exceeding the brief's max 10 lines.

BRIEF GAP #16: the package.json lines are not marked VERIFY.

BRIEF GAP #6: `voice-call-events` returns 401 when `WEBHOOK_SECRET_TELNYX` is unset, violating the brief's "always 200" requirement.

RISK #11: `voice-call` does not write `from_number` even though the migration adds it — the column will be NULL for all browser-phone calls.

RISK #13: `register_provider_call` only allowed while `status === 'initiated'`, but `voice-call-events` may set `ringing` first, causing 409.

RISK #18: Realtime auth in supabase-js v2 requires `realtime.setAuth()`, not just global headers — the transcript subscription will fail RLS.

RISK #31: Twilio `hold`/`unhold` are no-ops (client-side mute), but the brief requires hold.

RISK #32: Twilio `transfer` throws "not supported", but the brief lists it as a required action.

RISK #5: Twilio fallback lookup can bind the CallSid to the wrong call if two reps dial from the same caller ID within 60s.

RISK #23: Telnyx telephony credential orphaned if `voice_credentials` insert fails after Telnyx create succeeds.

RISK #25: race in `ensureTelephonyCredential` creates duplicate Telnyx credentials.

RISK #35: `constantTimeEqualBytes` in `twilio-signature.ts` returns early on length mismatch, leaking length — use the `stripe-signature.ts` version.

RISK #3/#4: `nextTranscriptSeq` race under high transcript volume.

RISK #8: Twilio signature URL rebuild fails behind custom domains.

RISK #9: Telnyx replay protection 5-min window may reject valid webhooks under clock skew.

RISK #10: `voice-call-events` fails closed (401) when secret unset — Telnyx retries forever.

RISK #12: `started.provider_call_id` is always null, so the update block is dead code.

RISK #15/#16: `@telnyx/webrtc` `newCall` may not return `call.id` synchronously, so `register_provider_call` may never fire.

RISK #17: Twilio Voice SDK `device.connect({params})` param forwarding is unverified.

RISK #20/#21: FK `ON DELETE CASCADE` on `voice_credentials` and `call_live_transcripts` is inconsistent with phase1's `ON DELETE RESTRICT`.

RISK #22: `ALTER PUBLICATION` inside `DO` block will fail if publication missing.

RISK #26-#44: numerous unverified Telnyx/Twilio API details (token path, transcription event, AMD values, recording URL shape, status callback field names, transcription callback field names, AccessToken header format, `jti` format, `newCall` signature, `device.connect` param forwarding, package export names, package versions).

The draft must be redrafted to fix the blockers and gaps before it can be applied to the live database and deployed.