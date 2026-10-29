Assumption: the brief asks for routes as implemented in `dispatch()` (lines 237–322), not only those listed in the header comment (lines 7–35); where the two disagree I report the code and flag the discrepancy.

### A. Auth and scopes

FACT:
- API keys are `dsk_live_...` keys issued from the `api_keys` table (index.ts:4).
- Auth is delegated to `authenticateApiKey(req, supabase)` from `../_shared/api-auth.ts` (index.ts:40-45, 180). The header name, key prefix check, hashing, and table lookup are NOT in this file — only the import and call are visible.
- After auth, `authorizeOrganizationContext(supabase, ctx.userId, ctx.organizationId)` resolves/validates the organization and its return value overwrites `ctx.organizationId` (index.ts:181-185).
- The key context exposes: `apiKeyId`, `userId`, `organizationId`, `keyName`, `scopes`, `rateLimitPerMinute` (index.ts:244-251).
- Scopes referenced in this file: `leads:read` (327, 355, 1790), `leads:write` (369, 421, 604, 734, 775), `campaigns:read` (810, 829, 1244, 1378, 1449, 1594, 1633), `campaigns:write` (503, 847, 862, 1488, 1544), `calls:read` (908, 933, 1744), `calls:write` (605, 947), `sms:read` (1043), `sms:write` (1069), `system:read` (1133, 1156, 1693, 1827). Enforcement is via `requireScope(rc.ctx, "<scope>")` (imported index.ts:43).
- Rate limit: per-key, in-memory, per-instance, window 60_000 ms, limit = `ctx.rateLimitPerMinute` (index.ts:187-190). Comment states it is not distributed and is a runaway-loop safety net (index.ts:187-189).
- Key→user mapping: `ctx.userId`; key→org: `ctx.organizationId` (possibly null before `authorizeOrganizationContext`; `creditsBalance` explicitly handles a null org, index.ts:1196-1198).
- Request logging: `logApiRequest(supabase, ctx, req, {...})` on success and failure (index.ts:205-208, 224-230); structured `slog` JSON lines (index.ts:93-107, 196-204, 214-223).

INFERENCE: `authenticateApiKey` likely reads an `Authorization` header, but the header name is not shown in this file, so it cannot be confirmed here.

### B. Route table

| method | path | scope | input | reads/writes | returns | scoped to | source path:line |
|---|---|---|---|---|---|---|---|
| OPTIONS | any | none | — | — | empty 204-style response with CORS headers | n/a | index.ts:139-141 |
| GET | /v1/health | none (public, before auth) | — | — | `{ok, version, ts}` | n/a | index.ts:171-173 |
| GET | /v1/me | none checked | — | — | api_key_id, user_id, organization_id, key_name, scopes, rate_limit_per_minute | key | index.ts:243-252 |
| GET | /v1/leads | leads:read | query: status, search, do_not_call, limit, offset | reads `leads` | `{leads, total, limit, offset}` | user_id + organization_id | index.ts:255-256, 326-352 |
| POST | /v1/leads | leads:write | body: phone_number* (7–15 digits), first_name, last_name, email, company, lead_source, status, priority, tags, notes, timezone, city, state, custom_fields | writes `leads` | created lead (201) | user_id + organization_id set from key | index.ts:257, 368-407 |
| GET | /v1/leads/:id | leads:read | path id (uuid regex) | reads `leads` (+custom_fields,address,zip_code) | lead or 404 | user_id + organization_id | index.ts:259-264, 354-366 |
| PATCH | /v1/leads/:id | leads:write | body: allowlist of first_name,last_name,email,company,lead_source,status,priority,tags,notes,timezone,city,state,do_not_call,next_callback_at,preferred_contact_time,custom_fields | writes `leads` | updated lead or 404 | user_id + organization_id | index.ts:265, 733-772 |
| POST | /v1/leads/:id/dnc | leads:write | path id | writes `leads` (do_not_call=true, status="dnc"); upserts `dnc_list` | `{id,phone_number,do_not_call,status}` | user_id + organization_id | index.ts:263, 774-805 |
| POST | /v1/leads/search | leads:read | body: limit (1–500), status, statuses[], lead_source, do_not_call, tags[], last_contacted_before/after, last_contacted_is_null, next_callback_before/after, created_after, phone_like, text | reads `leads` | `{leads, total, limit}` | user_id + organization_id | index.ts:269, 1789-1822 |
| POST | /v1/leads/bulk | leads:write | body: leads[] (max 500) | reads `leads` (dedup), writes `leads` | `{created, skipped_existing, rejected, lead_ids}` (201) | user_id + organization_id | index.ts:270, 420-494 |
| POST | /v1/leads/intake | leads:write AND calls:write | body: phone_number*, campaign_id*, first_name, last_name, email, company, lead_source, city, state, custom_fields, dispatch_now | reads `campaigns`, `leads`; writes `leads`, `campaign_leads`, `dialing_queues`; calls `call-dispatcher` | `{lead_id, campaign_id, queued, dispatch_triggered}` (201) | user_id + organization_id | index.ts:271, 601-731 |
| GET | /v1/campaigns | campaigns:read | query: status, limit, offset | reads `campaigns` | `{campaigns, total, limit, offset}` | user_id + organization_id | index.ts:274-275, 809-826 |
| POST | /v1/campaigns | campaigns:write | body: name*, provider (retell/telnyx/twilio, default retell), description, status, agent_id, telnyx_assistant_id, script, calls_per_minute, max_attempts, max_calls_per_day, retry_delay_minutes, calling_hours_start, calling_hours_end, timezone, sms_on_no_answer, sms_template, sms_from_number, workflow_id | writes `campaigns` | created campaign (201) | user_id + organization_id | index.ts:276, 861-902 |
| GET | /v1/campaigns/:id | campaigns:read | path id | reads `campaigns` (+script,sms_template,sms_from_number,sms_on_no_answer) | campaign or 404 | user_id + organization_id | index.ts:284, 828-840 |
| POST | /v1/campaigns/:id/leads | campaigns:write | body: lead_ids[] (max 2000) OR status, priority | reads `campaigns`, `leads`; writes `campaign_leads`, `dialing_queues` | `{assigned, queued, skipped_dnc_or_invalid, campaign}` | user_id + organization_id | index.ts:285, 502-591 |
| POST | /v1/campaigns/:id/launch | campaigns:write | path id | writes `campaigns` (status="active") | campaign | user_id + organization_id | index.ts:286, 842-859 |
| POST | /v1/campaigns/:id/pause | campaigns:write | path id | writes `campaigns` (status="paused") | campaign | user_id + organization_id | index.ts:287, 842-859 |
| GET | /v1/campaigns/:id/validate | campaigns:read | path id | reads `campaigns`, `dialing_queues`, `phone_numbers` | `{campaign_id, campaign_name, status, ready, has_warnings, checks}` | user_id + organization_id | index.ts:288, 1222-1234, 1240-1375 |
| GET | /v1/campaigns/:id/live-stats | campaigns:read | path id | reads `campaigns`, `dialing_queues`, `call_logs` | queue counts, last_1h, last_call, pace | user_id + organization_id | index.ts:289, 1377-1446 |
| GET | /v1/campaigns/:id/disposition-breakdown | campaigns:read | query: hours (1–168, default 1) | reads `call_logs` | by_status/outcome/disposition/amd counts | user_id + organization_id | index.ts:290, 1448-1485 |
| POST | /v1/campaigns/:id/retry-failed | campaigns:write | body: within_minutes (1–1440), max (1–2000) | reads `campaigns`, `dialing_queues`; writes `dialing_queues` (status="pending") | `{requeued, eligible, scanned, window_minutes}` | user_id + organization_id (campaign ownership) | index.ts:291, 1487-1541 |
| POST | /v1/campaigns/:id/force-dispatch | campaigns:write | path id | reads `campaigns`; writes `dialing_queues` (scheduled_at=now); calls `call-dispatcher` | `{dispatched, campaign_id, upstream}` | user_id + organization_id | index.ts:292, 1543-1591 |
| POST | /v1/campaigns/:id/dry-run | campaigns:read | path id | reads `campaigns`, `dialing_queues` | simulated dispatch counts | user_id + organization_id | index.ts:293, 1593-1630 |
| GET | /v1/campaigns/:id/pre-launch-audit | campaigns:read | path id | reads `campaigns`, `dialing_queues`, `phone_numbers`, `organization_credits` | checks summary | user_id + organization_id | index.ts:294, 1632-1688 |
| GET | /v1/calls | calls:read | query: lead_id, campaign_id, status, since, limit, offset | reads `call_logs` | `{calls, total, limit, offset}` | user_id + organization_id | index.ts:298-299, 907-930 |
| POST | /v1/calls | calls:write | body: lead_id*, campaign_id*, idempotency_key* (or Idempotency-Key header), agent_id, telnyx_assistant_id, provider, from_number | reads `leads`, `phone_numbers`; calls `outbound-calling` | `{queued:true, lead_id, upstream}` | user_id + organization_id | index.ts:300, 946-1038 |
| GET | /v1/calls/stuck | calls:read | query: minutes (1–60, default 5) | reads `campaigns`, `dialing_queues`, `call_logs` | `{cutoff_minutes, stuck_in_queue, stuck_in_call_logs, total_stuck}` | user_id + organization_id (queue via campaign ownership) | index.ts:302, 1743-1785 |
| GET | /v1/calls/:id | calls:read | path id | reads `call_logs` (full incl. transcript) | call or 404 | user_id + organization_id | index.ts:303-304, 932-944 |
| GET | /v1/sms | sms:read | query: lead_id, direction, since, limit, offset | would read `sms_messages` — but returns 503 before query | 503 `API_SMS_TENANT_SCHEMA_NOT_CERTIFIED` | user_id only (comment) | index.ts:307-308, 1042-1066 |
| POST | /v1/sms | sms:write | body: to_number*, body*, lead_id, from_number, idempotency_key* | returns 503 before any lookup | 503 `API_SMS_TENANT_SCHEMA_NOT_CERTIFIED` | n/a | index.ts:309, 1068-1128 |
| GET | /v1/phone-numbers | system:read | query: provider, status, limit, offset | reads `phone_numbers` | `{phone_numbers, total, limit, offset}` | user_id + organization_id | index.ts:313, 1132-1151 |
| GET | /v1/phone-numbers/health | system:read | — | reads `phone_numbers` | health summary + per-number flags | user_id + organization_id | index.ts:314, 1692-1739 |
| GET | /v1/system/stats | system:read | — | reads `leads`, `campaigns`, `call_logs`, `phone_numbers` (counts) | dashboard snapshot | user_id + organization_id | index.ts:317, 1155-1192 |
| GET | /v1/system/health-check | system:read | — | reads `leads`, `campaigns`, `call_logs`, `phone_numbers`, `campaigns`+`dialing_queues`; writes `api_key_audit_log` | probes array | user_id + organization_id | index.ts:318, 1826-1914 |
| GET | /v1/credits/balance | system:read | — | reads `organization_credits` | balance fields or `{balance_cents:0, billing_enabled:false}` | organization_id | index.ts:319, 1194-1206 |
| any | unmatched | — | — | — | 404 `Unknown route` | — | index.ts:321 |

FACT: the header comment (index.ts:7-35) lists a smaller route set than `dispatch()` implements; the extra routes (`/v1/leads/search`, `/v1/leads/bulk`, `/v1/leads/intake`, `/v1/campaigns/:id/leads`, `validate`, `live-stats`, `disposition-breakdown`, `retry-failed`, `force-dispatch`, `dry-run`, `pre-launch-audit`, `/v1/calls/stuck`, `/v1/phone-numbers/health`, `/v1/system/health-check`) are only visible in the router code (index.ts:268-319).

### C. Calling path

FACT:
- `POST /v1/calls` requires `calls:write` (index.ts:947) and requires `lead_id` and `campaign_id` (index.ts:949-950). The header comment (index.ts:25) does not list `campaign_id` as required.
- Idempotency key is required, taken from `body.idempotency_key` or the `Idempotency-Key` header, validated by `requireSmsIdempotencyKey` (index.ts:951-960).
- Lead is loaded scoped to `user_id` + `organization_id`; 404 if missing; rejected if `do_not_call` (index.ts:963-974).
- Provider: `body.provider ?? (body.telnyx_assistant_id ? "telnyx" : "retell")` (index.ts:976).
- From-number: `body.from_number` if given; otherwise first `phone_numbers` row with `user_id`, `organization_id`, `status="active"`, `is_spam=false`, `rotation_enabled=true`, `limit(1)`; for telnyx additionally `provider="telnyx"`, otherwise `retell_phone_id IS NOT NULL` (index.ts:984-1002). If none, ValidationError (index.ts:1003-1007).
- The call is placed by POSTing to `${SUPABASE_URL}/functions/v1/outbound-calling` with service-role auth and body `{action:"create_call", organizationId, idempotencyKey, leadId, userId, phoneNumber, callerId, agentId, telnyxAssistantId, campaignId, provider}` (index.ts:1011-1030).
- Response: `{queued:true, lead_id, upstream: result}` (index.ts:1037). Non-OK upstream throws (index.ts:1032-1036).
- What happens to the lead afterwards: this file does not update the lead; it only forwards to `outbound-calling` (index.ts:1011-1037). Any lead mutation would occur inside `outbound-calling`, which is not in the material.

INFERENCE: the endpoint is asynchronous — it returns `queued:true` and the actual dialing is done by `outbound-calling`/dispatcher, not by this function.

### D. SMS path

FACT:
- `GET /v1/sms` requires `sms:read` (index.ts:1043) then immediately returns 503 `API_SMS_TENANT_SCHEMA_NOT_CERTIFIED` because `isApiSmsTenantCertified()` returns false (index.ts:68-70, 1047). The query on `sms_messages` (index.ts:1053-1065) is unreachable.
- `POST /v1/sms` requires `sms:write` (index.ts:1069) then returns the same 503 before any lookup (index.ts:1072).
- The disabled reason given: `sms_messages` is keyed by `user_id` and only carries `organization_id` in optional JSON metadata, so a user-only service-role query could expose sibling-company messages (index.ts:1044-1046, 76-78).
- The (unreachable) send path would: require `to_number`, `body`, idempotency key (index.ts:1074-1083); pick `from_number` or first active `phone_numbers` row for user+org (index.ts:1087-1097); POST to `sms-messaging` with `{action:"send_sms", user_id, organization_id, to, from, body, lead_id, idempotency_key}` (index.ts:1104-1121); call `assertAcceptedSmsEnvelope(result)` (index.ts:1126).
- Opt-out checks: none visible in this file for SMS. The only DNC check in the file is in `placeCall` (index.ts:972-974) and `leadIntake` (index.ts:636-638).
- Where the message is stored: not in this file; it would be inside `sms-messaging` (index.ts:1104-1121). `systemStats` reports `sms: null, sms_certified: false` (index.ts:1186-1187).

### E. Unfinished / suspicious

- The entire external API is hard-disabled: `isExternalApiGatewayCertified()` returns `false` (index.ts:64-66) and every non-OPTIONS, non-health request returns 503 `EXTERNAL_API_NOT_CERTIFIED` before auth (index.ts:145-156). So no route in section B actually executes in this build.
- SMS is double-disabled: `isApiSmsTenantCertified()` returns `false` (index.ts:68-70) and both SMS handlers return 503 (index.ts:1047, 1072).
- `GET /v1/health` is served before auth and before the certification gate (index.ts:171-173), so it is the only live route.
- `POST /v1/calls` requires `campaign_id` (index.ts:950) but the header comment omits it (index.ts:25) — doc/code drift.
- `placeCall` accepts `body.provider` (index.ts:976) but the header comment does not list it (index.ts:25).
- `assignLeadsToCampaign` swallows `campaign_leads` insert errors: `.then(() => {})` with comment "tolerate duplicates" (index.ts:676-679) — non-duplicate failures are silently ignored.
- `assignLeadsToCampaign` has a fallback that tolerates any error whose message contains "no unique" or "duplicate" (index.ts:556-563) — other constraint errors would surface, but the string-matching is fragile.
- `forceDispatch` does not check the result of the `dialing_queues` update (index.ts:1562-1566) — update errors are ignored.
- `leadIntake`'s dispatcher trigger failure is only logged; the response still says `queued: true` with `dispatch_triggered: false` (index.ts:702-720, 722-730).
- `leadIntake` dedup uses `.like("phone_number", `%${digits}`)` with `.limit(1).maybeSingle()` (index.ts:625-632) — a suffix match, not normalized; could match a different number ending in the same digits.
- `markLeadDnc` upserts `dnc_list` with `onConflict: "organization_id,phone_number_normalized"` but supplies `phone_number`, not `phone_number_normalized` (index.ts:789-799) — the conflict target column is not in the payload.
- `listSms`/`sendSms` are unreachable but still contain a full implementation (index.ts:1042-1128) — dead code.
- `deepHealthCheck` writes a row to `api_key_audit_log` on every call (index.ts:1890-1901) — a GET with a write side effect.
- `systemStats` returns `sms: null` and `sms_certified: false` hardcoded (index.ts:1186-1187).
- `creditsBalance` returns `{balance_cents: 0, billing_enabled: false}` when no org (index.ts:1196-1198) and `data ?? {balance_cents:0, billing_enabled:false}` when no row (index.ts:1205) — a missing billing record looks like a zero balance.
- `preLaunchAudit` and `validateCampaign` both call `runCampaignValidation`, which itself calls `requireScope(rc.ctx, "campaigns:read")` (index.ts:1244) — the outer handlers also require `campaigns:read` (index.ts:1633, 1222-1234), so the scope is checked twice; harmless but redundant.
- `retryFailedCalls` filters `dialing_queues` by `campaign_id` only, not by user/org (index.ts:1507-1513) — relies on the prior campaign ownership check (index.ts:1494-1502).
- `findStuckCalls` and `runCampaignValidation` query `dialing_queues` by `campaign_id` only (index.ts:1319-1322, 1758-1764) — same reliance on prior campaign ownership.
- `placeCall`'s from-number query uses `.limit(1)` with no ordering (index.ts:986-1001) — non-deterministic pick; the comment at index.ts:980-983 acknowledges this was a past bug fixed by adding `rotation_enabled=true`.
- `placeCall` does not pass `from_number` through any validation and does not verify the number belongs to the user/org when supplied by the caller (index.ts:984).
- `sendSms` (unreachable) picks from-number with `.limit(1)` and no `is_spam`/`rotation_enabled` filter (index.ts:1089-1095) — inconsistent with `placeCall`'s filters.
- `listLeads` search interpolates `search` directly into a PostgREST `.or()` string (index.ts:343-347) — no escaping of `,` or `%`.
- `searchLeads` `text` does the same (index.ts:1814-1817).
- `createLead` validates 7–15 digits but stores the raw `String(body.phone_number)` (index.ts:374-385) — no normalization.
- `bulkCreateLeads` dedup fetches all of the user's leads with no limit (index.ts:464-468) — unbounded read.
- `VERSION = "0.2.0"` (index.ts:61) but the header comment describes a smaller surface than the code (index.ts:7-35 vs 237-322).

### F. UNKNOWN list

- Header name, key prefix check, hashing algorithm, and `api_keys` table columns used by `authenticateApiKey` — would be answered by `supabase/functions/_shared/api-auth.ts`.
- Full scope list and scope semantics (wildcards, admin scope) — `_shared/api-auth.ts` and wherever scopes are defined.
- How `authorizeOrganizationContext` resolves/validates org membership — `supabase/functions/_shared/tenant-context.ts`.
- `checkRateLimit` implementation and `RateLimitError` shape — `supabase/functions/_shared/utils.ts`.
- `requireSmsIdempotencyKey` and `assertAcceptedSmsEnvelope` behavior — `supabase/functions/sms-messaging/sms-boundary.ts`.
- What `outbound-calling` does with `create_call` (provider dispatch, lead status update, call_logs insert) — `supabase/functions/outbound-calling/index.ts`.
- What `call-dispatcher` does with `{action:"dispatch", internal:true, userId, organizationId, campaignId}` — `supabase/functions/call-dispatcher/index.ts`.
- What `sms-messaging` does with `send_sms` (opt-out checks, storage, provider) — `supabase/functions/sms-messaging/index.ts`.
- Whether `sms_messages` has an `organization_id` column today — the schema/migration files.
- Whether `dnc_list` has a `phone_number_normalized` column and how it is populated — the schema/migration files.
- Whether `campaign_leads` has a composite unique on `(campaign_id, lead_id)` — the schema/migration files.
- Whether `dialing_queues` has a unique on `(campaign_id, lead_id)` — the schema/migration files.
- Whether `phone_numbers` has `retell_phone_id`, `quarantine_until`, `external_spam_score`, `allowed_uses` columns — the schema/migration files.
- Whether `organization_credits` exists and its columns — the schema/migration files.
- Whether `api_key_audit_log` exists and its columns — the schema/migration files.
- Whether `leads` has `preferred_contact_time`, `custom_fields`, `address`, `zip_code` columns — the schema/migration files.
- Whether `call_logs` has `auto_disposition`, `amd_result`, `ai_analysis`, `call_summary` columns — the schema/migration files.
- The actual value of `ctx.rateLimitPerMinute` per key — `api_keys` table / `_shared/api-auth.ts`.