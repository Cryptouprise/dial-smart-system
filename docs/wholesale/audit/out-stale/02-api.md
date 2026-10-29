Assumption: the brief asks only about routes served by `supabase/functions/api-gateway/index.ts`; auth internals (`_shared/api-auth.ts`) and downstream functions (`outbound-calling`, `sms-messaging`, `call-dispatcher`) are not in the material, so their internals are UNKNOWN.

### A. Auth and scopes

FACT:
- API keys are `dsk_live_...` issued from the `api_keys` table (supabase/functions/api-gateway/index.ts:4).
- Auth is delegated to `authenticateApiKey(req, supabase)` from `_shared/api-auth.ts`; the gateway itself does not read a header, hash a key, or query `api_keys` (index.ts:41, index.ts:138).
- The resulting `ApiKeyContext` exposes `apiKeyId`, `userId`, `organizationId`, `keyName`, `scopes`, `rateLimitPerMinute` (index.ts:198-203).
- Scopes referenced by `requireScope` calls in this file: `leads:read`, `leads:write`, `campaigns:read`, `campaigns:write`, `calls:read`, `calls:write`, `sms:read`, `sms:write`, `system:read` (index.ts:277, 317, 427, 462, 521, 558, 639, 661, 710, 732, 772, 821, 953, 1023, 1061, 1116, 1164, 1202, 1261, 1311, 1355, 1391).
- Rate limit: per-key, in-memory, per-instance, window 60,000 ms, limit = `ctx.rateLimitPerMinute`; throws → 429 (index.ts:140-143).
- Key→user mapping: every data query is filtered by `.eq("user_id", rc.ctx.userId)` (e.g. index.ts:286, 434, 531, 648, 718, 745).
- Key→organization mapping: `organizationId` is used only for `leads.organization_id` on create (index.ts:347-348), `creditsBalance` (index.ts:773-779), and `preLaunchAudit` credits check (index.ts:1226-1231). No other route filters by organization.
- `/v1/health` is public, no auth (index.ts:128-131).
- Every authenticated request is logged via `logApiRequest` (index.ts:158-161, 177-183).

UNKNOWN: header name, key prefix validation, hashing algorithm, `api_keys` columns, full scope list, default `rateLimitPerMinute` value — would be answered by `supabase/functions/_shared/api-auth.ts`.

### B. Route table

| method | path | scope | input | reads/writes | returns | scoped to | source |
|---|---|---|---|---|---|---|---|
| GET | /v1/health | none (public) | — | — | `{ok, version, ts}` | n/a | index.ts:129-131 |
| GET | /v1/me | none checked | — | — | api_key_id, user_id, organization_id, key_name, scopes, rate_limit_per_minute | key | index.ts:196-205 |
| GET | /v1/leads | leads:read | query: status, search, do_not_call, limit, offset | reads `leads` | `{leads, total, limit, offset}` | user_id | index.ts:276-301 |
| GET | /v1/leads/:id | leads:read | path id (uuid regex) | reads `leads` (+custom_fields,address,zip_code) | lead row | user_id | index.ts:303-314 |
| POST | /v1/leads | leads:write | body: phone_number*, first_name, last_name, email, company, lead_source, status, priority, tags, notes, timezone, city, state, custom_fields | writes `leads` (sets user_id, organization_id if present) | lead row, 201 | user_id | index.ts:316-357 |
| PATCH | /v1/leads/:id | leads:write | body: whitelist of 16 fields | writes `leads` | lead row | user_id | index.ts:359-397 |
| POST | /v1/leads/:id/dnc | leads:write | path id | writes `leads` (do_not_call=true, status="dnc"); best-effort insert `dnc_list` | `{id,phone_number,do_not_call,status}` | user_id | index.ts:399-422 |
| POST | /v1/leads/search | leads:read | body: limit, status, statuses, lead_source, do_not_call, tags, last_contacted_before/after/is_null, next_callback_before/after, created_after, phone_like, text | reads `leads` | `{leads, total, limit}` | user_id | index.ts:1354-1386 |
| GET | /v1/campaigns | campaigns:read | query: status, limit, offset | reads `campaigns` | `{campaigns, total, limit, offset}` | user_id | index.ts:426-442 |
| GET | /v1/campaigns/:id | campaigns:read | path id | reads `campaigns` (+script, sms_template, sms_from_number, sms_on_no_answer) | campaign row | user_id | index.ts:444-455 |
| POST | /v1/campaigns | campaigns:write | body: name*, provider (retell/telnyx/twilio), agent_id, telnyx_assistant_id, script, calls_per_minute, max_attempts, max_calls_per_day, retry_delay_minutes, calling_hours_start/end, timezone, sms_on_no_answer, sms_template, sms_from_number, workflow_id, description, status | writes `campaigns` | campaign row, 201 | user_id | index.ts:475-515 |
| POST | /v1/campaigns/:id/launch | campaigns:write | path id | writes `campaigns.status="active"` | campaign row | user_id | index.ts:236, 457-473 |
| POST | /v1/campaigns/:id/pause | campaigns:write | path id | writes `campaigns.status="paused"` | campaign row | user_id | index.ts:237, 457-473 |
| GET | /v1/campaigns/:id/validate | campaigns:read | path id | reads `campaigns`, `dialing_queues`, `phone_numbers` | `{campaign_id, campaign_name, status, ready, has_warnings, checks}` | user_id | index.ts:238, 799-811, 817-950 |
| GET | /v1/campaigns/:id/live-stats | campaigns:read | path id | reads `campaigns`, `dialing_queues`, `call_logs` | queue counts, last_1h, last_call | user_id | index.ts:239, 952-1020 |
| GET | /v1/campaigns/:id/disposition-breakdown | campaigns:read | query: hours (1–168, default 1) | reads `call_logs` | by_status/outcome/disposition/amd counts | user_id | index.ts:240, 1022-1058 |
| POST | /v1/campaigns/:id/retry-failed | campaigns:write | body: within_minutes (1–1440, default 60), max (1–2000, default 500) | reads `campaigns`, `dialing_queues`; writes `dialing_queues` (status=pending, scheduled_at=now) | `{requeued, eligible, scanned, window_minutes}` | user_id (via campaign) | index.ts:241, 1060-1113 |
| POST | /v1/campaigns/:id/force-dispatch | campaigns:write | path id | writes `dialing_queues.scheduled_at=now` for pending; POSTs to `call-dispatcher` | `{dispatched, campaign_id, upstream}` | user_id | index.ts:242, 1115-1161 |
| POST | /v1/campaigns/:id/dry-run | campaigns:read | path id | reads `campaigns`, `dialing_queues` | simulated dispatch counts | user_id | index.ts:243, 1163-1199 |
| GET | /v1/campaigns/:id/pre-launch-audit | campaigns:read | path id | reads `campaigns`, `dialing_queues`, `phone_numbers`, `organization_credits` | checks summary | user_id + organization_id | index.ts:244, 1201-1256 |
| GET | /v1/calls | calls:read | query: lead_id, campaign_id, status, since, limit, offset | reads `call_logs` | `{calls, total, limit, offset}` | user_id | index.ts:520-542 |
| GET | /v1/calls/:id | calls:read | path id | reads `call_logs` (full incl. transcript, call_summary, ai_analysis, notes) | call row | user_id | index.ts:544-555 |
| POST | /v1/calls | calls:write | body: lead_id*, agent_id, telnyx_assistant_id, provider, from_number, campaign_id | reads `leads`, `phone_numbers`; POSTs to `outbound-calling` | `{queued:true, lead_id, upstream}` | user_id | index.ts:557-634 |
| GET | /v1/calls/stuck | calls:read | query: minutes (1–60, default 5) | reads `campaigns`, `dialing_queues`, `call_logs` | `{cutoff_minutes, stuck_in_queue, stuck_in_call_logs, total_stuck}` | user_id (queue via owned campaigns) | index.ts:252, 1310-1350 |
| GET | /v1/sms | sms:read | query: lead_id, direction, since, limit, offset | reads `sms_messages` | `{messages, total, limit, offset}` | user_id | index.ts:638-658 |
| POST | /v1/sms | sms:write | body: to_number*, body*, lead_id, from_number | reads `phone_numbers`; POSTs to `sms-messaging` | upstream result | user_id | index.ts:660-705 |
| GET | /v1/phone-numbers | system:read | query: provider, status, limit, offset | reads `phone_numbers` | `{phone_numbers, total, limit, offset}` | user_id | index.ts:709-727 |
| GET | /v1/phone-numbers/health | system:read | — | reads `phone_numbers` | health summary + per-number flags | user_id | index.ts:264, 1260-1306 |
| GET | /v1/system/stats | system:read | — | reads `leads`, `campaigns`, `call_logs`, `sms_messages`, `phone_numbers` (counts) | dashboard snapshot | user_id | index.ts:731-769 |
| GET | /v1/system/health-check | system:read | — | reads `leads`, `campaigns`, `call_logs`, `sms_messages`, `phone_numbers`, `dialing_queues`; writes `api_key_audit_log` | `{ok, version, probes, ...}` | user_id | index.ts:268, 1390-1468 |
| GET | /v1/credits/balance | system:read | — | reads `organization_credits` | balance row or `{billing_enabled:false}` | organization_id | index.ts:771-783 |

Note (FACT): the header comment lists only a subset of these routes; the router serves more than the comment documents (index.ts:7-33 vs index.ts:190-272).

### C. Calling path

FACT:
- `POST /v1/calls` requires `calls:write` (index.ts:558).
- Requires `lead_id`; loads the lead scoped to `user_id`; 404 if not found; rejects if `do_not_call` (index.ts:560-573).
- Provider: `body.provider ?? (body.telnyx_assistant_id ? "telnyx" : "retell")` (index.ts:575).
- From-number: `body.from_number` if given; otherwise first `phone_numbers` row with `user_id`, `status="active"`, `is_spam=false`, `rotation_enabled=true`, `limit(1)`; for telnyx also `provider="telnyx"`, otherwise `retell_phone_id IS NOT NULL` (index.ts:583-600). No `from_number` and no match → ValidationError (index.ts:601-605).
- Delegates to `outbound-calling` edge function with service-role key, body `{action:"create_call", leadId, userId, phoneNumber, callerId, agentId, telnyxAssistantId, campaignId, provider}` (index.ts:609-626).
- Returns `{queued:true, lead_id, upstream}` on 2xx; throws on non-2xx (index.ts:627-633).
- No write to `leads` or `call_logs` occurs in this function after placing the call (index.ts:557-634).

INFERENCE: "what happens to the lead afterwards" (status change, last_contacted_at, call_logs insert) is done inside `outbound-calling`, not here.

### D. SMS path

FACT:
- `POST /v1/sms` requires `sms:write`; requires `to_number` and `body` (index.ts:661-664).
- From-number: `body.from_number` if given; otherwise first `phone_numbers` row with `user_id` and `status="active"`, `limit(1)` — no `is_spam`, `rotation_enabled`, or provider filter (index.ts:668-677). None → ValidationError (index.ts:678-682).
- Delegates to `sms-messaging` with `{action:"send_sms", user_id, to, from, body, lead_id}` (index.ts:684-699).
- Returns the upstream JSON body directly (index.ts:704).
- No opt-out / DNC check is performed in this function before sending (index.ts:660-705).

INFERENCE: opt-out checks and message persistence in `sms_messages` happen inside `sms-messaging`, not here.

### E. Unfinished / suspicious

- `markLeadDnc` "best-effort" insert into `dnc_list` swallows all errors via `.then(() => {})`; a failed DNC insert silently succeeds (index.ts:411-419).
- `forceDispatch` ignores the result of the `dialing_queues` update (no error check) before calling the dispatcher (index.ts:1133-1137).
- `forceDispatch` comment admits the dispatcher "may process all campaigns", not just the target (index.ts:1139-1142).
- `placeCall` returns `{queued:true}` based only on upstream HTTP 2xx; no verification a call was actually created (index.ts:627-633).
- `sendSms` returns the raw upstream body with no normalization or confirmation of delivery (index.ts:700-704).
- `sendSms` from-number selection lacks `is_spam`/`rotation_enabled` filters that `placeCall` has — inconsistent sender selection (index.ts:668-677 vs index.ts:585-597).
- `sendSms` performs no DNC/opt-out check in this function (index.ts:660-705).
- `deepHealthCheck` writes a row to `api_key_audit_log` on every call (side effect on a GET) (index.ts:1444-1455).
- `deepHealthCheck` `dialing_queues_read` probe returns success when the user has no campaigns (index.ts:1437).
- `retryFailedCalls` filters `dialing_queues` by `campaign_id` only, not by user; relies on prior campaign ownership check (index.ts:1067-1086).
- `dispositionBreakdown` does not verify campaign ownership before querying `call_logs` (only filters by `user_id` + `campaign_id`) (index.ts:1022-1033).
- `runCampaignValidation` `dialing_queues` count is filtered by `campaign_id` only, not user (index.ts:895-898).
- `campaignLiveStats` queue counts filtered by `campaign_id` only (index.ts:978-981).
- `listLeads` `search` interpolates raw user input into a PostgREST `.or()` filter string (index.ts:292-296); same pattern in `searchLeads` `text` (index.ts:1378-1381).
- `createLead` stores `phone_number` as the raw trimmed string, not the validated digits-only form (index.ts:322-332).
- `createLead` does not set `organization_id` unless the key has one; no org filter on any read (index.ts:347-348).
- `creditsBalance` returns `{balance_cents:0, billing_enabled:false}` when no org, and also when the org has no credits row (index.ts:773-782).
- `preLaunchAudit` credit check is skipped entirely when the key has no `organizationId` (index.ts:1226-1241).
- `placeCall` accepts `body.campaign_id` and forwards it but never validates the campaign belongs to the user (index.ts:623).
- `placeCall` accepts `body.provider` with no validation against an allowed list (unlike `createCampaign`) (index.ts:575).
- `getLead` selects `custom_fields,address,zip_code` but `LEAD_FIELDS` already includes neither `address` nor `zip_code`; `createLead`/`updateLead` accept `custom_fields` but `LEAD_FIELDS` return does not include it (index.ts:90-91, 307, 345, 353).
- `updateLead` whitelist includes `preferred_contact_time` which is not in `LEAD_FIELDS` (index.ts:378 vs index.ts:90-91).
- `listLeads` `do_not_call` param only applies when present; `dnc === "true"` means any other value is treated as false (index.ts:291).
- `paginate` caps limit at 200 but `searchLeads` caps at 500 — inconsistent (index.ts:1473 vs index.ts:1357).
- `dispatch` route regex for leads requires a 36-char uuid; non-uuid ids fall through to 404 (index.ts:212).
- `POST /v1/leads/search` is declared after the `/v1/leads/:id` regex, but the regex requires a uuid so `search` does not collide (index.ts:212-222).
- `systemStats` `answer_rate` returns `null` when zero calls (index.ts:760-763).
- `phoneNumberHealth` marks `rotation_disabled` as a flag but not as unhealthy (index.ts:1282).
- `VERSION = "0.2.0"` while the header comment documents a smaller route set than is served (index.ts:59 vs index.ts:7-33).

### F. UNKNOWN list

- Header name, key prefix validation, hashing, and `api_keys` table schema — `supabase/functions/_shared/api-auth.ts`.
- Full scope list and whether scopes are enforced beyond `requireScope` — `_shared/api-auth.ts`.
- Default `rateLimitPerMinute` per key — `_shared/api-auth.ts` / `api_keys` table.
- `logApiRequest` target table and columns — `_shared/api-auth.ts`.
- `checkRateLimit`, `errorResponse`, `successResponse`, `corsHeaders` behavior — `_shared/utils.ts`.
- What `outbound-calling` does with the lead (status, `call_logs` insert, provider API call) — `supabase/functions/outbound-calling/index.ts`.
- What `sms-messaging` does (opt-out check, provider, `sms_messages` insert) — `supabase/functions/sms-messaging/index.ts`.
- What `call-dispatcher` does with `internal:true` — `supabase/functions/call-dispatcher/index.ts`.
- Whether `dnc_list`, `organization_credits`, `api_key_audit_log`, `dialing_queues` tables exist with the columns used — schema/migrations.
- Whether `leads.organization_id` column exists — schema/migrations.