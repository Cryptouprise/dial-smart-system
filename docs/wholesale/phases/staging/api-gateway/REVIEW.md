# api-gateway: ownership guards on /v1/calls and /v1/sms — REVIEW (staging/api-gateway, built on LIVE v35)

Closes FINDINGS.md line 38 ("/v1/calls and /v1/sms accept caller-supplied from_number / campaign_id / agent_id / lead_id without
ownership checks") and the "api-gateway from_number spoofing" item in SHIP-RUNBOOK §3.

> **STATUS 2026-11-02: SHIPPED.** Deployed live as **v39** (was v35), `verify_jwt=false`, ACTIVE. D1-D7 kept as written.
> One addition beyond D1-D7: the **membership gate** — a new `async callerOrgId(rc)` checks `organization_users` for the key's user+org,
> and a SYNCHRONOUS `applyScope(builder, rc, orgId)` replaces `scopeToCaller`; both `organization_credits` reads use it. That closes the
> live gap where a user removed from a company could still reach the company's numbers, campaigns, leads and credit balance with an old key.
> Curl tests T0-T6b pass, row counts unchanged, the 400s land in `api_key_audit_log`. T1/T6/T7 (the positive path, a real call/text) not run.
> Rollback: Dashboard > api-gateway > version history > v35.
> **Gotcha:** the scope helper must stay synchronous. Awaiting the PostgrestFilterBuilder executes it and returns `{data,error}`, so `.eq`
> stops existing — that cost one deploy (v39's first build returned 500 on every owned-row request; fixed in commit `21b7621d`).

Base rule honoured: every byte comes from the **live** snapshot `supabase/functions-live/api-gateway/functions/`
(`api-gateway/index.ts` 1267 lines, `_shared/api-auth.ts` 130, `_shared/utils.ts` 431; live v35, verify_jwt=false, last deployed
2026-07-01) plus only the changes in §2. Nothing from main's gated copy survives (it carried the 503 gates
`API_SMS_TENANT_SCHEMA_NOT_CERTIFIED` / `EXTERNAL_API_NOT_CERTIFIED` and imported `../sms-messaging/sms-boundary.ts` and
`../_shared/tenant-context.ts`, none of which exist live). No deploy, no migration, no DB read or write, no secret touched. The only network
use was `deno check` downloading the same remote modules live already imports.

## 0. Decisions you may want to veto (each is a small flip)

| # | Decision | Why | How to flip |
|---|---|---|---|
| D1 | The two live `_shared` files are bundled **function-locally**: `supabase/functions/api-gateway/_shared/{api-auth.ts,utils.ts}` are the live bytes, and the two import lines changed from `../_shared/` to `./_shared/`. | Main's `supabase/functions/_shared/api-auth.ts` (210 lines vs live 130) adds two 401s live does not have: "API key is not bound to an organization" (main line 110) and "API key organization membership is no longer active" (line 127). Main's `utils.ts` is 568 lines vs live 431. Deploying with `../_shared/` imports would bundle those and could lock out any key without an `organization_id`. The brief said to keep using exactly the live `_shared` files; this is the only way to guarantee it. | Inline the two files into `index.ts`; or (not recommended) revert `index.ts:38-39` to `../_shared/` and accept main's auth behaviour. |
| D2 | An explicit `from_number` that passes the guard is forwarded as the **stored** `phone_numbers.number` (canonical E.164), not the caller's raw string. | That is exactly what the picker path already forwards, and live outbound-calling looks the caller ID up in Retell by that string (`get-phone-number/<callerId>`). A caller who sends `(475) 234-4348` for an owned `+14752344348` now works instead of failing in Retell. | `assertOwnedFromNumber`: `return String(raw);` instead of `return String(match.number);`. |
| D3 | `from_number` guard requires `status = 'active'` only. `is_spam = false` and `rotation_enabled = true` remain picker-only, as live. | The brief specified `status='active'`. An operator passing an explicit number is choosing it on purpose. | Add `.eq("is_spam", false)` to the query in `assertOwnedFromNumber`. |
| D4 | `telnyx_assistant_id` is validated by **user_id only** (no organization acceptance). | Live outbound-calling v600 (`functions-live/outbound-calling/index.ts:466-471`) re-checks `telnyx_assistants` with `.eq('user_id', userId)` itself. An org-only match would pass this gate and then fail downstream after a failed `call_logs` row has already been inserted. | Wrap the query in `scopeToCaller(...)` like the other three guards. |
| D5 | Retell `agent_id` is forwarded **unchanged**. | No owner table exists live. `agent_pricing` (`organization_id`, `retell_agent_id`, `is_active`) is an optional pricing table: a missing row means default pricing, so it is not a registry of owned agents. Live outbound-calling passes `agentId` straight to Retell (`update-phone-number` → `outbound_agent_id`, `get-agent/<id>`). The brief forbids inventing a table. Logged as V4. | None in this patch. See V4 for the two follow-up designs. |
| D6 | placeCall's existing `lead_id` lookup (live line 445: user_id-scoped `maybeSingle`, 404 `Lead <id> not found`) is left **exactly as live**. | It already is an ownership check that leaks nothing. Changing it to 400 `LEAD_NOT_OWNED` or org scope would alter an existing response shape. sendSms had no lead check at all and now gets `LEAD_NOT_OWNED`. | Replace live lines 445-447 with `await assertOwnedLead(rc, body.lead_id)` plus a scoped select. |
| D7 | Snapshot boundary repair. The ESZIP extraction shifted every module boundary by exactly 28 bytes: `index.ts` began ` REST surface for Dial Smart.` and ended with `// Copyright 2018-2022 the D` (head of the next bundled module, hidden from `wc -l` because it has no newline); `api-auth.ts` began `n for external / MCP / AI-agent access.` and ended with `/**\n * Shared utilities for `; `utils.ts` began `Supabase Edge Functions` and ended with `export * from "./index.ts";\n`. Restored each file's first 28 bytes (`/**\n * api-gateway: external`, `/**\n * API Key authenticatio`, `/**\n * Shared utilities for `; the resulting header text matches main's headers word for word) and dropped each file's last 28 bytes. `cmp` confirms the three files are otherwise byte-identical to the snapshot. | The stray `export * from "./index.ts";` would not resolve; the clipped `/**` would not parse. Same artifact P5 found (its D5) on the other ESZIP pulls. | n/a |

## 1. Files written

| File | Lines | Base |
|---|---|---|
| `supabase/functions/api-gateway/index.ts` | 1372 | live v35 `functions/api-gateway/index.ts` (1267 lines). Overwritten in place: git shows `M`, history intact (last main commit a8393da5). |
| `supabase/functions/api-gateway/_shared/api-auth.ts` | 130 | live v35 `functions/_shared/api-auth.ts`, byte-identical after D7 repair (new file). |
| `supabase/functions/api-gateway/_shared/utils.ts` | 431 | live v35 `functions/_shared/utils.ts`, byte-identical after D7 repair (new file). |
| `docs/wholesale/phases/staging/api-gateway/REVIEW.md` | this file | |

Not touched: `supabase/functions/_shared/*` on main, `supabase/config.toml`, anything under `supabase/functions-live/`, the MCP server.

## 2. Changes versus LIVE (line numbers are in the NEW `index.ts`)

| # | Lines | Change |
|---|---|---|
| 1 | 38-39 | Import paths `../_shared/api-auth.ts` → `./_shared/api-auth.ts`, `../_shared/utils.ts` → `./_shared/utils.ts` (D1). Same named imports. |
| 2 | 453-457 | `placeCall`: after `provider` is derived and before caller-ID resolution: `if (body.campaign_id) await assertOwnedCampaign(rc, body.campaign_id);` and `if (body.telnyx_assistant_id) await assertOwnedTelnyxAssistant(rc, body.telnyx_assistant_id);` |
| 3 | 465-469 | `placeCall`: `if (callerId) { callerId = await assertOwnedFromNumber(rc, callerId); }` inserted between `let callerId = body.from_number ?? ""` and the untouched picker branch (`if (!callerId) { ... .eq("rotation_enabled", true) ... }`). |
| 4 | 542-544 | `sendSms`: after the two required-field checks: `if (body.lead_id) await assertOwnedLead(rc, body.lead_id);` |
| 5 | 548-552 | `sendSms`: `if (fromNumber) { fromNumber = await assertOwnedFromNumber(rc, fromNumber); }` before the untouched picker branch. |
| 6 | 1288-1372 | New section "Ownership guards (added 2026-11-01)": `UUID_RE`, `ownershipError`, `normalizeE164`, `scopeToCaller`, `assertOwnedFromNumber`, `assertOwnedCampaign`, `assertOwnedLead`, `assertOwnedTelnyxAssistant`. Appended after `safeJson`. |

Unified diff against the header-repaired live file: 5 hunks, +106 / −2 (the 2 removed lines are the import lines). Everything else is
byte-identical: routes, response shapes, scopes, rate limiting, `slog` / `logApiRequest`, the `rotation_enabled=true` picker, the
`outbound-calling` / `sms-messaging` payloads.

Error wire shape: reuses live `ValidationError` → `errorResponse` → **HTTP 400** (live `utils.ts` has no 403 class; adding one would mean
editing a live file). One shape for all four codes, identical whether the row belongs to another tenant, is malformed (non-UUID), or does
not exist, so existence never leaks:

```json
{ "success": false,
  "error": "from_number is not an active phone number on this account",
  "details": [{ "field": "from_number", "code": "FROM_NUMBER_NOT_OWNED", "message": "from_number is not an active phone number on this account" }],
  "timestamp": "2026-11-01T00:00:00.000Z" }
```

Codes: `FROM_NUMBER_NOT_OWNED` (both routes), `CAMPAIGN_NOT_OWNED` (/v1/calls), `LEAD_NOT_OWNED` (/v1/sms; /v1/calls keeps its live 404, D6),
`AGENT_NOT_OWNED` (/v1/calls `telnyx_assistant_id`). `details[].code` is additive to the live `{field, message}` shape.

Scope rule (`scopeToCaller`): `user_id = key.user_id` OR, when the key row has one, `organization_id = key.organization_id`. Both ids come
from the `api_keys` row (never from the request) and are UUID-shape-checked before interpolation into `.or()`; a key without
`organization_id` falls back to `.eq("user_id", ...)` exactly like every live read route. `leads`, `campaigns`, `phone_numbers` all have
`organization_id NOT NULL` live (LIVE-SCHEMA.md, 10/29 update).

Number matching (`normalizeE164`): digits only; 10 digits → `+1…`; 11 digits starting with 1 → `+…`; otherwise `+digits` (7-15). The
caller's active rows are pulled (`select id,number ... status='active'`, 40 rows live in total) and compared normalized in JS, so stored
format variance cannot cause a false reject. The MCP client already canonicalizes `from_number` to E.164
(`mcp-server/src/tools/contact-egress-contract.ts:154`), so the happy path is unchanged for it.

## 3. `deno check`

Command (repo root, branch `wholesale`): `npx -y deno@2.4.2 check supabase/functions/api-gateway/index.ts` → **4 errors, 0 in new code**.
The identical 4 appear on the unpatched live baseline (header-repaired copy, checked from the same cwd), so they predate this patch:

| Location | Error | Live code |
|---|---|---|
| `_shared/utils.ts:300` | TS2554 `log()` given 2 of 3 args | `withCircuitBreaker` |
| `_shared/utils.ts:398` | TS2554 `ensurePipelineBoard()` given 3 of 4 args | `moveLeadToPipelineStage` |
| `index.ts:127` | TS2554 `errorResponse(err)` given 1 of 2 args (signature `utils.ts:77`) | request catch block |
| `index.ts:281` | TS2339 `insert.organization_id` not on the inferred literal type | `createLead` |

Checked from a directory without the repo's `package.json`, the baseline additionally reports 3× TS2304 `Cannot find name 'Deno'`; that is
config discovery, not code, and is the same before and after. The live source is type-stripped JS inside `.ts` (ESZIP stores the
transpiled module), Deno strips types at runtime and Supabase's bundler does not type-check, so none of the 4 affect the deployed
function. New helpers carry explicit parameter types so no new diagnostics can hide among the old ones.

## 4. curl test plan

```bash
BASE=https://emonjusymdripmkvtttc.supabase.co/functions/v1/api-gateway/v1
A="Authorization: Bearer $KEY_A"      # owner key: scopes calls:write, sms:write, system:read (or admin). Never echo the key.
J="Content-Type: application/json"
# KEY_B / foreign ids: a second api_keys row on a different user or organization, or any random UUID for "belongs to nobody".
```

| T | Request | Expect |
|---|---|---|
| T0 reads unchanged | `GET $BASE/health` (no auth); `GET $BASE/me`, `GET $BASE/system/stats`, `GET $BASE/phone-numbers`, `GET $BASE/leads?limit=1` with `-H "$A"` | 200s, bodies identical in shape to a pre-deploy capture (`version` still `0.2.0`). From `/phone-numbers` pick an owned `status=active` number `N_OWN`; from `/leads` an owned lead `L_OWN`; from `/campaigns` an owned campaign `C_OWN`. |
| T1 happy call | `POST $BASE/calls -H "$A" -H "$J" -d '{"lead_id":"L_OWN","from_number":"N_OWN"}'` | 200 `{"success":true,"data":{"queued":true,...}}`. **Places a real call**: Charles present, test lead = his number per runbook. Variant: send `N_OWN` as `(XXX) XXX-XXXX`; still 200 and `call_logs.caller_id` is the stored `+1…` (D2). |
| T1b happy with campaign | same + `"campaign_id":"C_OWN"` | 200. |
| T2 from_number not owned | `"from_number":"+15555550123"`; then a number that belongs to KEY_B; then an owned number with `status != 'active'` | 400 each, `details[0].code == "FROM_NUMBER_NOT_OWNED"`, byte-identical bodies except `timestamp` (no leak). No `call_logs` row written. |
| T3 foreign campaign | `{"lead_id":"L_OWN","campaign_id":"<KEY_B campaign or random UUID>"}`; then `"campaign_id":"abc"` | 400 `CAMPAIGN_NOT_OWNED` both. |
| T4 foreign lead (SMS) | `POST $BASE/sms -d '{"to_number":"+1...","body":"test","lead_id":"<random UUID>"}'` | 400 `LEAD_NOT_OWNED`. (On `/calls` a foreign `lead_id` stays 404 `Lead … not found`, live behaviour, D6.) |
| T5 foreign assistant | `{"lead_id":"L_OWN","telnyx_assistant_id":"<random UUID>"}` | 400 `AGENT_NOT_OWNED`, no `call_logs` row. |
| T6 SMS happy / spoof | `POST $BASE/sms -d '{"to_number":"<Charles>","body":"api-gateway guard test","from_number":"N_OWN"}'` → 200 (**real text**, needs Charles's go). Then `"from_number":"+15555550123"` → 400 `FROM_NUMBER_NOT_OWNED`. Omit `from_number` → picker path, same result as before deploy. |
| T7 omitted fields | `POST $BASE/calls -d '{"lead_id":"L_OWN"}'` | Picker path untouched: 200, or the live 400 `No available phone numbers for caller ID…` if no `rotation_enabled` number exists. |
| T8 rate limit | > `rate_limit_per_minute` calls to `/me` within 60 s | 429, as live. |
| Logs | Supabase logs `grep '"component":"api-gateway"'`; `select * from api_key_audit_log order by created_at desc limit 20` | One `request`/`request_failed` line per call; 400s logged with `error` = the message above. |

## 5. Deploy note

- `verify_jwt` must stay **false**: live v35 is deployed with verify_jwt=false (`functions-live/README.md` row), `supabase/config.toml:441-444`
  says `verify_jwt = false`, and the function authenticates every route itself with the `dsk_live_` key (only `/v1/health` is open).
  `npx supabase functions deploy api-gateway --project-ref emonjusymdripmkvtttc --no-verify-jwt` from the repo root on branch `wholesale`;
  the CLI bundles `index.ts` plus `./_shared/*` from the function directory. Via MCP `deploy_edge_function`: files `index.ts`,
  `_shared/api-auth.ts`, `_shared/utils.ts`, entrypoint `index.ts`, verify_jwt false.
- Tier 4: ledger `Result: pending` before, `success|failed` after. Afterwards re-snapshot into `supabase/functions-live/api-gateway/` (the
  new bundle layout has `_shared` under the function, so the snapshot paths will change).
- No migration, no new secret, no new env var: still only `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`.
- Independent of the P4/P5/P6 ship order. Deployed before P5's `sms-messaging`, api-gateway is the only sender-ownership gate for API SMS
  (live `sms-messaging` v525 has none); after P5 it is defence in depth. Live `outbound-calling` v600 has no caller-ID or campaign ownership
  check at all (FINDINGS line 31), so this gateway check is currently the only one on the API path.

## 6. Rollback

Redeploy live v35: Dashboard → Edge Functions → api-gateway → version history → v35, or redeploy from
`supabase/functions-live/api-gateway/functions/` (entrypoint `functions/api-gateway/index.ts` + `functions/_shared/*`; if deploying from
these files, apply the D7 28-byte boundary repair first or the stray `export * from "./index.ts"` will fail to resolve). Main's gated copy
remains at `git show a8393da5:supabase/functions/api-gateway/index.ts` for reference only; it must never be deployed (503 gates).

## 7. VERIFY (could not be settled from the repo alone)

- **V1** `telnyx_assistants` exists live with `user_id`. LIVE-SCHEMA.md does not list the table, but live outbound-calling v600 queries it
  with `.eq('user_id', userId)`, and the repo migration defines `user_id uuid NOT NULL`, `organization_id uuid`.
  `select column_name from information_schema.columns where table_name='telnyx_assistants' and column_name in ('id','user_id','organization_id');`
- **V2** All 40 `phone_numbers.number` values are `+1XXXXXXXXXX`: `select count(*) filter (where number !~ '^\+1\d{10}$') from phone_numbers;`
  `normalizeE164` tolerates other formats, but a non-NANP number (7-15 digits without a leading 1) would need the caller to send it the same way.
- **V3** The MCP server's `api_keys` row: does it carry `organization_id`? Without it the guards are user-scoped only (same as every live read
  route), so numbers owned by another member of the same company are rejected through that key.
- **V4** Retell `agent_id` cross-tenant exposure remains (one `RETELL_AI_API_KEY` serves every tenant, so any tenant can target any Retell
  agent id). Two non-inventive follow-ups: accept only agent ids present in the caller's own `campaigns.agent_id` set, or add a
  `retell_agents` registry table. Add to FINDINGS.md.
- **V5** `provider` on `/v1/calls` is caller-supplied and unvalidated (live); out of scope here.
- **V6** The 4 pre-existing `deno check` errors (§3) have been in production since v35 and are harmless at runtime; fixing them means editing
  live `utils.ts`, which this patch deliberately does not do.
