# P5 - Texting per company: REVIEW (staging/p5, built on LIVE snapshots)

Base rule honoured: every function file here is the **live** snapshot (`supabase/functions-live/<slug>/...`, v532 / v525 / v524) plus the changes listed below. Nothing was taken from `supabase/functions/<slug>/` on main (no 503 certification gates, no imports of `_shared/tenant-context.ts`, `sms-boundary.ts`, or RPCs that do not exist live). No deploy, no migration applied, no DB touched, no `npm install`.

## 0. Decisions you may want to veto (each is a one-line flip)

| # | Decision | Why | How to flip |
|---|---|---|---|
| D1 | `send_sms` **accepts** `organization_id` and enforces it when present, but when it is **absent** it derives the company from the `from` number's own `phone_numbers.organization_id` (then still checks membership + ownership). | The brief says "requires an explicit organization_id". Five live callers never send it: frontend `useSmsMessaging.ts:68`, `useAiSmsMessaging.ts:172`, `useAutonomousAgent.ts:405`, live `api-gateway/index.ts:541`, live `disposition-router/index.ts:544`, live `workflow-executor/index.ts:879`. Strict mode would 400 every one of them on deploy. Deriving from the owned caller ID is not a guess: a number belongs to exactly one company, and the caller must be a member of it. Security outcome is identical to explicit mode. | `sms-messaging/index.ts:65-83` `resolveSendOrganization`: replace the `const scopeOrgIds = explicitOrgId ? [...] : memberOrgIds;` branch with `if (!explicitOrgId) throw new HttpError(400, 'ORGANIZATION_REQUIRED', 'organization_id is required');`. |
| D2 | The **webhook** also honours `organizations.settings->'sms_ai_reply'`, not only `ai-sms-processor`. | The live auto-reply path is inside `twilio-sms-webhook` (v532 lines 722-1579 generate and send the AI reply itself; it never calls `ai-sms-processor`). A switch read only by `ai-sms-processor` would not stop a single live reply. | Delete `twilio-sms-webhook/index.ts:773-777`. |
| D3 | Lead / call-log lookups inside the three functions are scoped by `organization_id` instead of `user_id` (leads.organization_id and call_logs.organization_id are NOT NULL live). `ai_sms_settings`, `calendar_availability`, `calendar_appointments` stay per-user (they are per-user config). | "Two members of org A see one thread" also needs the lead a teammate created to be found when a text arrives on the number another teammate owns. | Revert the `.eq('organization_id', organizationId)` lines listed per file below to `.eq('user_id', userId)`. |
| D4 | Fixed a live bug in the webhook's lead lookup: v532:547 selects `leads.name`, a column that does not exist (LIVE-SCHEMA.md:4 has `first_name, last_name`). PostgREST returns 400, so `lead` was always `null` live and SMS dispositions / nudge tracking never fired. | Without it the per-company lead lookup would still be dead code. | Keep it; there is no reason to flip. |
| D5 | Snapshot header repairs: the ESZIP extraction clipped the leading `/**` of each file (`twilio` line 1 was a lone space, `sms-messaging` line 1 was `nction`, `ai-sms-processor` line 1 was ` Function`) and left a truncated `// Copyright 2018-2022 the D` as `sms-messaging` line 471. Restored `/**` + title lines, dropped the dangling comment. | Files would not parse otherwise. | n/a |

## 1. Files written

| File (under `docs/wholesale/phases/staging/p5/`) | Lines | Base |
|---|---|---|
| `supabase/migrations/20261029060000_sms_per_organization.sql` | 205 | new |
| `supabase/functions/twilio-sms-webhook/index.ts` | 1705 | live v532 (1598 lines) |
| `supabase/functions/sms-messaging/index.ts` | 629 | live v525 (470 lines) |
| `supabase/functions/ai-sms-processor/index.ts` | 1207 | live v524 (980 lines) |
| `REVIEW.md` | this file | |

Syntax: `deno` is **not installed** on this machine (`deno --version` -> command not found), so `deno check` was not run. All three functions pass `node --check` (ES module parse). Type-level note: the live files are transpiled, untyped JS inside `.ts` files (implicit `any` everywhere), so a strict `deno check` would report the same implicit-any diagnostics on the untouched live code as on these; Supabase's deploy bundler does not type-check. VERIFY-1 below.

## 2. Changes versus the LIVE files

### 2.1 Migration `20261029060000_sms_per_organization.sql` (new)
1. `ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT` on `sms_conversations`, `sms_messages`, `sms_context_history`, `ai_sms_settings`; indexes `idx_<table>_organization_id` plus `idx_sms_conversations_org_contact (organization_id, contact_phone)` and `idx_sms_messages_org_created (organization_id, created_at DESC)` for the two hot lookups.
2. Backfill, each step only on rows still NULL, each with `-- expect`: 2a messages <- leads via `lead_id`; 2b messages <- `phone_numbers` on our side (`from_number` when outbound, `to_number` when inbound), last-10-digits match, only digit strings owned by exactly one company; 2c same, either side; 2d conversations <- their messages (single distinct company); 2e conversations <- `last_from_number`; 2f conversations <- `default_organization_for_user(user_id)`; 2g messages <- conversation; 2h messages <- user default; 2i context_history <- conversation, else user default; 2j ai_sms_settings <- user default; 2k report query (`-- expect null_org = 0` on all four rows).
3. DO-loop: `set_organization_from_user` BEFORE INSERT and `tenant_scope_guard` BEFORE INSERT OR UPDATE on the four tables, same function bodies as phase 1 (not redefined).
4. DO-loop: `"Company members can view" / "Company members can insert" / "Company members can update" / "Company admins can delete"` with the exact phase-1 predicates, **beside** the live per-user policies (none dropped).
5. `COMMENT ON COLUMN public.organizations.settings` documenting `sms_ai_reply` (and restating `packs`). No existing comment on that column (grep of `supabase/migrations`), nothing clobbered.
Not done on purpose: no `SET NOT NULL` (the brief did not ask; do it in a follow-up once 2k reports 0), no unique index on `(organization_id, contact_phone)` (live data may hold duplicate threads per user).

### 2.2 `twilio-sms-webhook/index.ts` (live v532 -> staged)
| Live lines | Change | Staged lines |
|---|---|---|
| 1 | header repair (D5) | 1 |
| after 348 | NEW helpers: `EMPTY_TWIML`/`twimlResponse`, `phoneNumberCandidates` (same raw / digits / `+digits` normalization the live "alt format" lookup at v532:429-430 used), `timingSafeEqualStrings`, `computeTwilioSignature` (HMAC-SHA1 via `crypto.subtle`, base64, over URL + sorted `key+value`), `candidateSignedUrls` (raw `req.url` + rebuilt from `x-forwarded-proto` / `x-forwarded-host` / `host`), `verifyTwilioSignature` (fail closed when `TWILIO_AUTH_TOKEN` unset: warn + reject), `isOrgAiReplyEnabled` | 349-448 |
| after 382 (body parsed, before `validateTwilioPayload`) | NEW signature gate: bad/missing signature or missing token => **403** `text/plain`, before any DB access | 483-497 |
| **419-474 DELETED** (Method 1-5 owner resolution incl. **Method 5 "most recently active ai_sms_settings user" fallback at 454-464**, Method 3 "previous outbound" 436-444, Method 4 "any conversation with this contact" 445-453) | REPLACED by one `phone_numbers` lookup: `select id, number, user_id, organization_id ... in('number', candidates) ... not organization_id is null ... limit 2`. No row => log + 200 empty TwiML, **no writes**. Two companies claiming the number => log + 200, no writes. `userId` = number owner, `organizationId` = number's company | 534-560 |
| 477-485 | conversation lookup by `contact_phone` + (`organization_id = org` OR legacy `organization_id IS NULL AND user_id = owner`), newest first; update stamps `organization_id` | 561-577 |
| 488-493 | conversation insert carries `organization_id` | 578-584 |
| 515-531 | inbound `sms_messages` insert carries `organization_id` | 605-622 |
| 547 | lead lookup by `organization_id` (D3) and `first_name, last_name` instead of non-existent `name` (D4); `lead.name` synthesized for the unchanged `agent_decisions` insert at v532:612 | 638-644 |
| 561-575 | disposition-router payload gains `organizationId` (additive; live router ignores unknown keys) | 661 |
| 662 | `lead_workflow_progress` lookup drops `.eq('user_id', userId)` (teammate's workflow applies to the company's lead) | 759 |
| 674-675 | `shouldAutoRespond` becomes `let`; NEW: if `organizations.settings->>'sms_ai_reply' = false` for the company, force `false` (inbound stored, no reply, no 1.5 s batching wait) (D2) | 771-777 |
| 788 | lead context lookup by `organization_id` | 890-892 |
| 806 | call history lookup by `organization_id` | 910 |
| 1204-1208 | new-lead insert (book_appointment) carries `organization_id` | 1308-1313 |
| 1519-1529 | AI reply `sms_messages` insert carries `organization_id` | 1624-1635 |
| 1542-1551 | internal `send_sms` call to sms-messaging passes `organization_id` | 1649-1659 |
Everything else (keyword tables, disposition logic, nudge tracking, calendar tools, sending) is byte-identical to live.

### 2.3 `sms-messaging/index.ts` (live v525 -> staged)
| Live lines | Change | Staged lines |
|---|---|---|
| 1, 470 | header repair, dangling comment dropped (D5) | 1-2 |
| after 12 | NEW helpers: `HttpError(status, code)`, `phoneNumberCandidates`, `lastTenDigits`, `loadMemberOrgIds` (organization_users where user_id = caller), `findOwnedNumbers` (phone_numbers in given companies), `resolveSendOrganization` (D1) | 14-84 |
| **31-75 REPLACED**: `publicActions` list (`get_available_numbers`, `check_webhook_status` with **no auth**) deleted | every action: `Authorization` required (401), then either service-role key + `request.user_id` (internal, kept for the webhook/api-gateway) or `supabase.auth.getUser(bearer)` (401 on failure); then `memberOrgIds` loaded once | 100-123 |
| 119-122 | provider no longer guessed with `ilike %last10%` across all companies; `resolveSendOrganization` returns the owned row (403 `CALLER_ID_NOT_OWNED`, 403 `NOT_A_MEMBER`, 400 `ORGANIZATION_REQUIRED` when the number sits in two of the caller's companies and none was named) | 170-174 |
| 131-134 | `skip_db_insert` path verifies the pre-stored row belongs to the same company (403 `MESSAGE_NOT_IN_ORGANIZATION`) | 183-191 |
| 135-146 | outbound insert carries `organization_id` | 192-205 |
| 190-194, 256-260 | conversation touch scoped `.eq('organization_id', org)`, also sets `last_from_number` | 252-256, 322-326 |
| 195-199, 261-265 | **response shape**: live `{success, message_id, provider_message_id}` kept, plus `sent: true`, `provider: 'twilio'|'telnyx'`, `organization_id`. The frontend's `src/lib/smsAcceptance.ts:14-35` requires `sent === true` and `provider` - live v525 never returned them, so UI sends already fail acceptance against live; this makes them pass | 257-264, 327-334 |
| 273-287 `get_messages` | `.in('organization_id', memberOrgIds)` (optional `organization_id` narrows, member-checked) instead of `.eq('user_id', userId)`; shape `{messages}` unchanged | 341-370 |
| 288-368 `get_available_numbers` | auth now required; loads `phone_numbers` of the caller's companies first (empty => `{numbers: []}` without calling Twilio); Twilio list filtered to numbers owned by those companies; item shape unchanged plus `organization_id` | 372-492 |
| 369-399 `check_webhook_status` | 403 `CALLER_ID_NOT_OWNED` unless the number is in the caller's companies | 499-502 |
| 400-447 `configure_webhook` | same ownership check before re-pointing a Twilio number | 534-537 |
| 457-469 catch | `HttpError` keeps 401/403/400 (body gains `code`); everything else 500 `{error}` as live | 585-600 |
`health_check`, the Twilio/Telnyx send code and the A2P scan are unchanged. No certification gate exists in live v525 and none was added.

### 2.4 `ai-sms-processor/index.ts` (live v524 -> staged)
| Live lines | Change | Staged lines |
|---|---|---|
| 1 | header repair (D5) | 1-2 |
| after 14 | NEW helpers: `HttpError`, `phoneNumberCandidates`, `loadMemberOrgIds`, `findOwnedNumber`, `resolveOrganizationId` (explicit body `organization_id` [member-checked for browser callers] -> company owning OUR number -> `rpc default_organization_for_user` -> 400 `ORGANIZATION_REQUIRED`), `isOrgAiReplyEnabled`, `findConversation` (company + contact, legacy-NULL fallback) | 16-106 |
| 49-70 | `isInternalCall` flag; `memberOrgIds` loaded after auth | 149-166 |
| 76 `process_webhook` DNC | company resolved from `message.To`; DNC check `.eq('organization_id', org)` (dnc_list.organization_id backfilled in phase 1) | 169-180 |
| 91-105 | conversation via `findConversation`; insert carries `organization_id`; legacy row stamped | 195-215 |
| 114-128 | inbound insert carries `organization_id` | 225-242 |
| 134-136 | lead lookup by `organization_id` (D3) | 247-251 |
| after 180 | NEW: `sms_ai_reply = false` => return `Processed without response - AI replies disabled for this company` before any reply work | 294-307 |
| 218 | `generateAIResponse(..., organizationId, ...)` | 332 |
| 241-257 `generate_response` | conversation loaded first (404 if missing); its company must be one of the caller's (403 `NOT_A_MEMBER`); switch NOT applied (user-initiated) | 368-396 |
| 259-261 `generate_and_send` | `targetUserId = request.userId || userId` (live crashed on NOT NULL user_id when `userId` was absent) | 400-403 |
| after 267 | NEW: company resolution (explicit -> owner of `fromNumber` -> user default); `lead.organization_id` must match (403 `LEAD_NOT_IN_ORGANIZATION`); `fromNumber` must be a `phone_numbers` row of that company (403 `CALLER_ID_NOT_OWNED`); `sms_ai_reply = false` => 200 `{success:true, skipped:true}` | 409-439 |
| 282-293 | conversation via `findConversation`; insert carries `organization_id` | 455-473 |
| 341-343 | provider from the owned row (no cross-company `ilike`) | 519-520 |
| 397-410 | outbound insert carries `organization_id` | 574-589 |
| 507-518 catch | `HttpError` status/code preserved | 686-700 |
| 721 `generateAIResponse` | new `organizationId` parameter; its three lead lookups (live 830, 888, 942) by `organization_id` | 904, 1013, 1073, 1129 |
`convert_voice_to_sms`, reaction detection, image analysis, double-texting check and prompt building are unchanged.

### 2.5 Security-review additions (team-lead, applied on top of 2.3 / 2.4; staged line numbers below supersede the ones above where they moved)

**ai-sms-processor** (`index.ts`)
| Where | Change | Staged lines |
|---|---|---|
| helpers | NEW `UUID_RE` / `PHONE_RE`, `assertUuid(value, field)` (400 `INVALID_ID`), `assertPhone(value, field)` (400 `INVALID_PHONE`, only digits with optional leading `+`, 7-15 digits). Every value that is interpolated into a PostgREST `.or()` / `.in()` filter now passes through one of them first: `findOwnedNumber` (phone + org id), `resolveOrganizationId` (explicit org id), `findConversation` (org id, user id, contact phone) | 26-41, 67-68, 86, 121-123 |
| `process_webhook` | `message` must be an object; `message.From` / `message.To` validated as phones before any query | 193-196 |
| `generate_response` | `conversationId` UUID-checked before the lookup | 397 |
| `generate_and_send` | `leadId` UUID-checked, `fromNumber` phone-checked; **browser (JWT) callers**: `targetUserId` is forced to the JWT user (`request.userId` ignored), the lead is loaded with `.in('organization_id', memberOrgIds)` so only leads of the caller's companies resolve (404 `LEAD_NOT_FOUND` otherwise, 403 `NOT_A_MEMBER` when the caller has no company); service-role callers keep the explicit `userId` and unscoped lead load. After the company is resolved: `lead.organization_id` must equal it (403 `LEAD_NOT_IN_ORGANIZATION`), the found conversation's `organization_id` must equal it (403 `CONVERSATION_NOT_IN_ORGANIZATION`), `fromNumber` must be a `phone_numbers` row of it (403 `CALLER_ID_NOT_OWNED`); final conversation UPDATE scoped `.eq('organization_id', org)` | 429-443, 490-494, 603-609 |

**sms-messaging** (`index.ts`)
| Where | Change | Staged lines |
|---|---|---|
| helpers | same `assertUuid` / `assertPhone` | 25-40 |
| `send_sms` | `to` / `from` validated as phones after cleaning; `organization_id`, `conversation_id`, `lead_id` UUID-checked when present | 183-189 |
| `send_sms` | `skip_db_insert` / `existing_message_id` honoured **only when `isInternalCall`** (service-role key + `user_id`, i.e. the webhook). A browser caller sending them gets a warning log and a normal insert. On the internal path the pre-stored row must match **both** `organization_id` and `user_id` (403 `MESSAGE_NOT_IN_ORGANIZATION`) | 204-217 |
| `send_sms` | all four `sms_messages` status UPDATEs (failed/sent, Telnyx and Twilio) scoped `.eq('id').eq('organization_id', org).eq('user_id', userId)`; the two `sms_conversations` UPDATEs scoped `.eq('id').eq('organization_id', org)` (not by `user_id`: a teammate must be able to bump `last_message_at` on a shared company thread, which is the point of P5) | 240-278, 320-340 |
| `get_messages`, `get_available_numbers` | `organization_id` UUID-checked before the membership test | 372, 406 |
| `check_webhook_status`, `configure_webhook` | `phoneNumber` validated as a phone after cleaning | 526, 561 |

**twilio-sms-webhook**: no change needed. Its only `.or()` filter (staged 563) interpolates `organizationId` / `userId` that come from the `phone_numbers` row (DB UUIDs) and `From`, which `validateTwilioPayload` (live 278-290) already restricts to `^\+?[1-9]\d{1,14}$`.

## 3. VERIFY items
- **VERIFY-1 deno check**: run `deno check supabase/functions/<slug>/index.ts` on a machine with Deno before deploy (not available here). Expect only implicit-any noise identical to live code; any error naming a P5 helper is mine.
- **VERIFY-2 Twilio signed URL behind Supabase's proxy**: the function accepts a match against raw `req.url` **or** `${x-forwarded-proto}://${x-forwarded-host|host}${path}${query}` **or** `https://${host}${path}${query}`. Confirm with one real inbound text after deploy (log line `X-Twilio-Signature did not match any candidate URL` means the public URL Twilio signed differs; print `req.url` + headers once and add that form to `candidateSignedUrls`, staged 400-416). Also confirm the Twilio console URL has **no query string** or that it is passed through unchanged.
- **VERIFY-3 TWILIO_AUTH_TOKEN present in the twilio-sms-webhook secrets** - otherwise every inbound text is rejected with 403 by design (fail closed). The same token the function already uses for sending (v525:80) so it should already exist; confirm before deploying the webhook.
- **VERIFY-4 Backfill ambiguity**: 2b/2c/2e skip digit strings owned by two companies. Live has 1 company, so none expected; the 2k report proves it.
- **VERIFY-5 `default_organization_for_user` callable by service_role**: phase 1 granted EXECUTE to `authenticated, service_role`, then the fix migration revoked `authenticated` only. `ai-sms-processor` calls it via `rpc` with the service-role client (last-resort path only).
- **VERIFY-6 Callers of `send_sms` without `user_id` under the service-role key**: live `workflow-executor:879` and `disposition-router:544` invoke `send_sms` with the service key and **no** `user_id`; live v525 already 401s them (`getUser(serviceRoleKey)` fails). Unchanged behaviour, but worth knowing it is not a regression from P5.
- **VERIFY-7 Frontend**: `AiSmsConversations.tsx:449`, `CampaignManager.tsx:407`, `useCampaignReadiness.ts:174`, `useSmsMessaging.ts:136` call `get_available_numbers` through `supabase.functions.invoke`, which attaches the user's JWT, so they keep working and now see only their companies' numbers. Optional follow-up: pass `organization_id: currentOrganization.id` (from `src/contexts/OrganizationContext.tsx`) on `send_sms` / `get_available_numbers` to narrow to the selected company.
- **VERIFY-9 Number owner must be a member of the number's company**: the webhook's internal `send_sms` runs as `phone_numbers.user_id` with `organization_id = phone_numbers.organization_id`; sms-messaging checks that user's `organization_users` membership. Live (1 user, 1 membership) passes; a number whose `user_id` left the company would get 403 `NOT_A_MEMBER` on the auto-reply send (inbound is still stored). Query to pre-check: `select p.number from phone_numbers p left join organization_users ou on ou.user_id = p.user_id and ou.organization_id = p.organization_id where ou.id is null;` -- expect 0 rows.
- **VERIFY-8 `sms_conversations.ai_paused*` columns** referenced by live v524:197-202 do not exist in LIVE-SCHEMA.md:13; untouched (pre-existing), the update just errors silently.

## 4. Secrets (names only, all already used by the live functions)
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` (now also required by the webhook for signature validation), `LOVABLE_API_KEY`, `TELNYX_API_KEY` (optional), `RETELL_AI_API_KEY` (optional).

## 5. Deploy order
1. Apply `20261029060000_sms_per_organization.sql` (Tier 4: log BEFORE/AFTER in `session-ledger/ACTIVE.md`). Read the 2k report: all four `null_org` must be 0.
2. Deploy `sms-messaging` from `staging/p5/supabase/functions/sms-messaging/index.ts`. `verify_jwt`: keep **false** for this deploy (the function enforces auth itself for every action and the webhook calls it with the service-role key); flipping to `true` is safe later (service-role key is a valid JWT) but changes two things at once.
3. Deploy `twilio-sms-webhook` with **`verify_jwt=false`** (Twilio sends no JWT; the signature check is the auth). Send one real inbound text; expect a stored row with `organization_id` and no 403 in logs (VERIFY-2/3).
4. Deploy `ai-sms-processor` with **`verify_jwt=true`** (as live).
5. Copy the three staged files to `supabase/functions/<slug>/index.ts` and re-snapshot `supabase/functions-live/` after the deploys (README rule).

## 6. Rollback
- Functions: redeploy previous versions **twilio-sms-webhook v532, sms-messaging v525, ai-sms-processor v524** (Supabase dashboard > Edge Functions > version history, or redeploy the `functions-live` snapshots).
- Migration is additive; the rolled-back functions ignore the new column. If a full undo is wanted:
  `DROP POLICY` the four "Company ..." policies and `DROP TRIGGER set_organization_from_user / tenant_scope_guard` on the four tables (same DO-loop with DROP only), `DROP INDEX` the six indexes, `ALTER TABLE ... DROP COLUMN organization_id` x4, `COMMENT ON COLUMN public.organizations.settings IS NULL`.

## 7. Test plan

### 7.1 SQL - two members of company A see one thread, company B sees none (throwaway data, rolled back)
```sql
BEGIN;
-- throwaway users (auth.users accepts id+email inserts on Supabase; VERIFY if your instance needs more columns)
INSERT INTO auth.users (id, email) VALUES
  ('a1000000-0000-4000-8000-000000000001','p5-a1@test.local'),
  ('a2000000-0000-4000-8000-000000000002','p5-a2@test.local'),
  ('b1000000-0000-4000-8000-000000000003','p5-b1@test.local');
INSERT INTO public.organizations (id, name, slug) VALUES
  ('0a000000-0000-4000-8000-00000000000a','P5 Org A','p5-org-a'),
  ('0b000000-0000-4000-8000-00000000000b','P5 Org B','p5-org-b');
INSERT INTO public.organization_users (organization_id, user_id, role) VALUES
  ('0a000000-0000-4000-8000-00000000000a','a1000000-0000-4000-8000-000000000001','owner'),
  ('0a000000-0000-4000-8000-00000000000a','a2000000-0000-4000-8000-000000000002','member'),
  ('0b000000-0000-4000-8000-00000000000b','b1000000-0000-4000-8000-000000000003','owner');
INSERT INTO public.sms_conversations (id, user_id, organization_id, contact_phone, last_message_at) VALUES
  ('c0000000-0000-4000-8000-0000000000c1','a1000000-0000-4000-8000-000000000001','0a000000-0000-4000-8000-00000000000a','+15550001111', now());
INSERT INTO public.sms_messages (user_id, organization_id, conversation_id, direction, from_number, to_number, body, status) VALUES
  ('a1000000-0000-4000-8000-000000000001','0a000000-0000-4000-8000-00000000000a','c0000000-0000-4000-8000-0000000000c1','inbound','+15550001111','+15559998888','hi','received');

SET LOCAL ROLE authenticated;
-- member A1 (owner of the rows)
SELECT set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SELECT count(*) AS a1_threads  FROM public.sms_conversations WHERE id = 'c0000000-0000-4000-8000-0000000000c1';  -- expect 1
SELECT count(*) AS a1_messages FROM public.sms_messages WHERE conversation_id = 'c0000000-0000-4000-8000-0000000000c1'; -- expect 1
-- member A2 (teammate, never touched the rows) - only visible through "Company members can view"
SELECT set_config('request.jwt.claims', '{"sub":"a2000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
SELECT count(*) AS a2_threads  FROM public.sms_conversations WHERE id = 'c0000000-0000-4000-8000-0000000000c1';  -- expect 1
SELECT count(*) AS a2_messages FROM public.sms_messages WHERE conversation_id = 'c0000000-0000-4000-8000-0000000000c1'; -- expect 1
-- member B1 (other company)
SELECT set_config('request.jwt.claims', '{"sub":"b1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
SELECT count(*) AS b1_threads  FROM public.sms_conversations WHERE id = 'c0000000-0000-4000-8000-0000000000c1';  -- expect 0
SELECT count(*) AS b1_messages FROM public.sms_messages WHERE conversation_id = 'c0000000-0000-4000-8000-0000000000c1'; -- expect 0
-- B1 may not write into company A (tenant_scope_guard, 42501)
INSERT INTO public.sms_messages (user_id, organization_id, conversation_id, direction, from_number, to_number, body, status)
VALUES ('b1000000-0000-4000-8000-000000000003','0a000000-0000-4000-8000-00000000000a','c0000000-0000-4000-8000-0000000000c1','outbound','+15559998888','+15550001111','x','pending');
-- expect: ERROR organization_id must be a company you belong to
RESET ROLE;
ROLLBACK;
```

### 7.2 Inbound SMS to a number no company owns writes nothing
```bash
URL="https://emonjusymdripmkvtttc.supabase.co/functions/v1/twilio-sms-webhook"
SID="SM00000000000000000000000000000p5"      # any unused MessageSid
# payload Twilio signs = URL + params sorted by key, key immediately followed by raw value
SIG=$(printf '%s' "${URL}Bodyhello p5From+15550001111MessageSid${SID}To+15550009999" \
      | openssl dgst -sha1 -hmac "$TWILIO_AUTH_TOKEN" -binary | base64)
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$URL" \
  -H "X-Twilio-Signature: $SIG" -H 'Content-Type: application/x-www-form-urlencoded' \
  --data "From=%2B15550001111&To=%2B15550009999&Body=hello%20p5&MessageSid=$SID"
# expect 200 (log: "No company owns number +15550009999 - nothing stored")
# same request WITHOUT the X-Twilio-Signature header:   expect 403
```
```sql
SELECT count(*) FROM public.sms_messages      WHERE provider_message_id = 'SM00000000000000000000000000000p5'; -- expect 0
SELECT count(*) FROM public.sms_conversations WHERE contact_phone = '+15550001111' AND created_at > now() - interval '10 minutes'; -- expect 0
```
Then repeat 7.2 with `To=` one of the company's real numbers (`select number from phone_numbers limit 1`): expect 200 and one `sms_messages` row whose `organization_id` equals that number's `phone_numbers.organization_id`.

### 7.3 `get_available_numbers` without a login is now 401 (live leaked 42 numbers)
```bash
curl -s -w '\n%{http_code}\n' -X POST "https://emonjusymdripmkvtttc.supabase.co/functions/v1/sms-messaging" \
  -H 'Content-Type: application/json' -d '{"action":"get_available_numbers"}'
# expect: {"error":"Unauthorized - Please log in to perform this action","code":"UNAUTHORIZED"} 401
# with -H "Authorization: Bearer <user JWT>": expect 200 {"numbers":[...]} containing only phone_numbers of that user's companies
```

### 7.4 `send_sms` guards (user JWT of a company-A member)
- `from` = a company-A number, no `organization_id` -> 200 `{success:true, sent:true, provider:..., organization_id:<A>, message_id, provider_message_id}` and the `sms_messages` row has `organization_id = A`.
- `from` = a number of another company (or not in `phone_numbers`) -> 403 `CALLER_ID_NOT_OWNED`.
- `organization_id` = B while the caller is only in A -> 403 `NOT_A_MEMBER`.

### 7.4b Security-review guards (user JWT of a company-A member)
- `send_sms` with `skip_db_insert: true, existing_message_id: <company-B message id>` -> 200 with a **new** row inserted for company A (the hint is ignored; log `Ignoring skip_db_insert/existing_message_id from non-service caller`); the company-B row is untouched.
- `send_sms` with `to: "+1555'); drop--"` -> 400 `INVALID_PHONE`; `conversation_id: "x"` -> 400 `INVALID_ID`.
- `ai-sms-processor generate_and_send` with `leadId` of a company-B lead and `userId` of the B owner -> 404 `LEAD_NOT_FOUND` (JWT caller cannot act as another user or reach B's lead); with a company-A lead but `fromNumber` of company B -> 403 `CALLER_ID_NOT_OWNED`.

### 7.5 Company AI-reply switch
```sql
UPDATE public.organizations SET settings = coalesce(settings,'{}') || '{"sms_ai_reply": false}' WHERE id = '<org>';
```
Text one of that company's numbers: the inbound row is stored, log shows `sms_ai_reply is false for organization ... - inbound stored, no AI reply`, no outbound row. Remove the key (`settings - 'sms_ai_reply'`) and the reply resumes.

### 7.6 NULL count (re-run any time)
```sql
SELECT 'sms_conversations' t, count(*) FILTER (WHERE organization_id IS NULL) null_org, count(*) total FROM public.sms_conversations
UNION ALL SELECT 'sms_messages',        count(*) FILTER (WHERE organization_id IS NULL), count(*) FROM public.sms_messages
UNION ALL SELECT 'sms_context_history', count(*) FILTER (WHERE organization_id IS NULL), count(*) FROM public.sms_context_history
UNION ALL SELECT 'ai_sms_settings',     count(*) FILTER (WHERE organization_id IS NULL), count(*) FROM public.ai_sms_settings;
-- expect null_org = 0 on all four rows
```

## 8. Live verification, 2026-11-02 (jcode)

Ran read-only / rolled back via `scripts/ship/sbquery.py` (Management API). Nothing persisted.

| Test | Result | Evidence |
|---|---|---|
| 7.1 tenant isolation (SQL) | PASS | `a1_threads=1, a1_messages=1, a2_threads=1, a2_messages=1, b1_threads=0, b1_messages=0` |
| 7.1 cross-tenant write | PASS | `42501 organization_id must be a company you belong to` (enforce_organization_scope, line 10) |
| 7.3 `get_available_numbers` without a login | PASS | `{"error":"Unauthorized - Please log in to perform this action","code":"UNAUTHORIZED"}` HTTP 401 |
| 7.6 NULL organization_id count | PASS | sms_conversations 0/49, sms_messages 0/1528, sms_context_history 0/0, ai_sms_settings 0/1 |

Not run (need a real login or a real number): 7.2 (inbound to a number no company owns), 7.4 / 7.4b
(`send_sms` and `ai-sms-processor` guards with a user JWT), 7.5 (company AI-reply switch).

