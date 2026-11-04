# ce-egress-retell-inbound-webhook

- status: completed
- tldr: retell-inbound-webhook: no egress, inline 503 quarantine, anon-reachable, no bypass

retell-inbound-webhook (index.ts, 438 lines): EGRESS = NONE (no fetch, no provider URLs, no shared-helper imports; only std serve + supabase-js). verify_jwt = false at config.toml:289 ([functions.retell-inbound-webhook] at :288) CONFIRMED. LAUNCH-QUARANTINED 503 = YES, inline unconditional early return at index.ts:43-51 (status:503 at :49, error_code INBOUND_DYNAMIC_VARS_NOT_CERTIFIED), no named helper, placed before all logic. ANON-BROWSER REACHABLE = YES (CORS '*' at index.ts:9 + verify_jwt=false + zero identity checks; only response is the 503). BYPASSES LAUNCH LOCK = NO (no egress exists; all egress/DB-write code at 53-437 is unreachable dead code after the return; only OPTIONS at 39-41 precedes it with no side effects). Only DB write: leads INSERT index.ts:207-219 (dead code).

Row: | retell-inbound-webhook | no egress | false (config.toml:289) | yes - inline 503 index.ts:43-51 | yes (CORS '*' :9, no identity check) | no | index.ts:1-2,9,39-51,55,207-219; config.toml:288-289 |

Validation: static read of full file + 2 greps; config.toml read directly. No files modified, no live calls.

## Artifact

**Findings**

EGRESS: NONE. No fetch()/HTTP client, no provider URL strings, no shared-helper imports. Only imports are deno std serve (index.ts:1) and supabase-js createClient (index.ts:2). grep for fetch/http/api.retell/api.telnyx/api.twilio/elevenlabs/openrouter/create-phone-call/create-web-call/update-call/create-batch-call/register-phone-call/messages.create/calls.create/chat-completions returned no matches. File is DB reads + one DB insert + building a dynamic_variables object returned to Retell's webhook caller. DB-WRITE (not egress): leads INSERT at index.ts:207-219, inside dead code after the 503 gate. DB reads: phone_numbers (89-94), leads caller fallback (109-114), retell_transfer_context (143-151), leads enrich (165-170), leads caller lookup (185-191). verify_jwt: false (config.toml:288-289 CONFIRMED). LAUNCH-QUARANTINED 503 GATE: YES, inline (no named per-file helper). Definition+call site = unconditional early return at index.ts:43-51 with status:503 at index.ts:49 and error_code 'INBOUND_DYNAMIC_VARS_NOT_CERTIFIED'. It is the first statement block after the OPTIONS check (39-41), unconditionally before all logic, so it precedes every DB op and every (nonexistent) egress path. Since there is no egress at all, 'gate before first egress line' is vacuously satisfied. ANON-BROWSER REACHABLE: YES (anyone can call it and get the 503). CORS '*' at index.ts:9; verify_jwt=false (config.toml:289); no real identity check: no JWT validation, no Retell signature verify, no Authorization/cron token (grep for Authorization/signature/cron = no matches). Only secret use is SUPABASE_SERVICE_ROLE_KEY (index.ts:55) to build a server-side DB client (index.ts:64) = outbound credential, NOT inbound identity check. Reachable=YES but the only body an anon caller can elicit is the 503 quarantine response (or OPTIONS null). BYPASSES LAUNCH LOCK: NO. No egress path exists, so nothing skips the gate. Only pre-gate code is the OPTIONS branch (39-41) returning 200/null with no side effects. All egress-capable/DB-writing code (53-437) is unreachable dead code after the unconditional 503 return.

**evidence**

- read C:/Users/charl/dial-smart-system/supabase/functions/retell-inbound-webhook/index.ts (438 lines) - full file read
- grep index.ts for fetch/http/api.retell/api.telnyx/api.twilio/elevenlabs/openrouter/create-phone-call/create-web-call/update-call/create-batch-call/register-phone-call/messages.create/calls.create/chat/completions/import -> only index.ts:1, index.ts:2 imports (no egress matches)
- grep index.ts for 503/verify_jwt/Access-Control-Allow-Origin/Authorization/signature/SUPABASE_SERVICE_ROLE_KEY/cron -> index.ts:9 CORS '*', index.ts:49 status:503, index.ts:55 SERVICE_ROLE_KEY
- Get-Content config.toml lines 281-300: 288 '[functions.retell-inbound-webhook]' / 289 'verify_jwt = false'
- index.ts:43-51 unconditional 503 return
- index.ts:207-219 leads insert (only DB write)

**validation**

Static read + two targeted greps. No files modified, no network calls, no live systems touched. verify_jwt independently confirmed by reading config.toml:288-289.

**open_questions**

- Whether config.toml is the deployed source of truth for this function (a separately-managed deployed verify_jwt could differ) - not checked, would require supabase CLI/API.
- Whether the 503 'disabled' quarantine is intentional and current (error_code INBOUND_DYNAMIC_VARS_NOT_CERTIFIED suggests an intentional launch hold).

**what_i_did_not_check**

- Deployed function settings vs config.toml (no CLI/API call made - research only).
- The ../_shared/* helpers named in the task (api-auth.ts, utils.ts, control-plane/, retell-provider-contract.ts) - this function imports NONE of them (index.ts:1-2), so they are irrelevant to this file's behavior; not opened.
- Other functions in the repo that share the same gate helper (out of scope for this node).

**confidence**: high