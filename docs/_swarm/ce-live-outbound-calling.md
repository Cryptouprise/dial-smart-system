# ce-live-outbound-calling

- status: completed
- tldr: LIVE outbound-calling: verify_jwt=false (config.toml:124), NO cert gate, anon=401 but any user JWT can dial Telnyx(:672)/Retell(:1159).

ce-live-outbound-calling DONE. (a) verify_jwt=false at supabase/config.toml:124 (block starts :123). (b) NO certification gate in LIVE bytes: findstr CERTIF over supabase/functions-live/outbound-calling/index.ts (1373 lines) = 0 matches; SOURCE/main has PROVIDER_EGRESS_NOT_CERTIFIED at supabase/functions/outbound-calling/index.ts:295-305. (c) LIVE handler auth: :134 reads Authorization, :138-150 401 if absent, :170 service-role short-circuit (token===SUPABASE_SERVICE_ROLE_KEY -> userId from body, no verification, :177-187), else auth.getUser(token) :188-210. No org authz, no role check, no DNC. Anon/no-header caller = 401 (NO real dial). But any authenticated user JWT can call create_call and place a REAL call: Telnyx dial fetch :672 (+TeXML fallback :690), Retell dial fetch :1159, provider mutate update-phone-number :780; DB writes to call_logs/leads/call_variant_assignments/edge_function_errors. Actions: create_call/get_call_status/end_call/health_check. Confidence high (medium on the anon-key->401 sub-claim, code-derived not probed).

## Artifact

**Findings**

(a) verify_jwt FALSE. supabase/config.toml:123 `[functions.outbound-calling]`, :124 `verify_jwt = false  # Handles auth internally - supports both JWT and service-role calls from dispatcher` (exact line).
(b) NO certification gate in the LIVE bytes. `findstr /I CERTIF` over supabase/functions-live/outbound-calling/index.ts (1373 lines) returns 0 matches (exit 1); `quarantine` also 0. SOURCE/main has it at supabase/functions/outbound-calling/index.ts:295-305 (`PROVIDER_EGRESS_NOT_CERTIFIED`, 503) plus RETELL_AGENT/RETELL_CALL_DURATION_NOT_CERTIFIED throws (:890-914) and gated helpers, and imports certifiedOutboundCallingWindow (main:5) and certifiedRetellCallDurationMinutes (main:13) from ../_shared/call-exposure-policy.ts - none of which exist in LIVE. Matches docs/wholesale/audit/phase1/LIVE-VS-MAIN-GATES.md:28,57 and functions-live/README.md:26,79.
(c) Anon reachability: the handler does its own auth. LIVE index.ts:134 reads Authorization; :138-150 returns 401 if the header is absent; :167 token = authHeader.replace('Bearer ',''); :170 `isServiceRoleCall = token === serviceRoleKey` (SUPABASE_SERVICE_ROLE_KEY env); :177-187 if true, userId is taken from body.userId with NO further verification; otherwise :188-210 `supabaseAdmin.auth.getUser(token)` and 401 when no user. There is NO org/role authorization in LIVE (grep: 0 hits for authorizeOrganizationContext / requestedOrganizationId / enforceOrganizationMembership), NO DNC enforcement (skipDncCheck destructured at :124,:224 and never used; only isTestCall bypasses at :316-318), and no scope check that callerId belongs to the caller on the Retell path. The whole action switch (:253) sits AFTER the auth block, so every action requires passing auth.
Reachable actions (must pass auth first): create_call (:254), get_call_status (:1272), end_call (:1321), health_check (:1339); unknown action throws (:1354).
Side effects of create_call: DB writes via service-role client - call_logs INSERT (:285-296) and UPDATEs (:340,:408,:440,:479,:487,:710,:723,:1202,:1236,:1257,:1288), leads SELECT (:503,:513) and UPDATE (:818,:831), call_variant_assignments INSERT (:1092), edge_function_errors INSERT (logError :75). Real provider egress: Telnyx direct dial `POST https://api.telnyx.com/v2/ai/assistants/{id}/calls` (:672) with TeXML fallback `POST .../v2/texml/ai_calls/{app_id}` (:690); Retell dial `POST {baseUrl}/create-phone-call` where baseUrl=https://api.retellai.com/v2 (:244,:1159), plus provider mutations `update-phone-number` (:780, sets the callerId's outbound agent) and reads get-phone-number (:753), get-agent (:1105), get-retell-llm (:1116).
Can an unauthenticated caller trigger a real dial? NO. A caller with no Authorization header gets 401 (:138-150); a caller bearing only the public anon key fails `auth.getUser(anonKey)` because the anon JWT has no `sub`, so the function returns 401 (:198-207). Only a valid user JWT or the secret service-role key passes. HOWEVER, exposure is real for any AUTHENTICATED user: any valid Supabase user JWT can call create_call and place a real Telnyx/Retell call to an arbitrary phoneNumber (LIVE has no admin/role/org gate and no DNC check), and on the Retell path any Retell-registered callerId can be used as it is not ownership-checked.

**evidence**

- supabase/config.toml:123-124
- supabase/functions-live/outbound-calling/index.ts:134-150
- supabase/functions-live/outbound-calling/index.ts:167-210
- supabase/functions-live/outbound-calling/index.ts:253-254
- supabase/functions-live/outbound-calling/index.ts:285-296
- supabase/functions-live/outbound-calling/index.ts:672
- supabase/functions-live/outbound-calling/index.ts:690
- supabase/functions-live/outbound-calling/index.ts:1159
- supabase/functions-live/outbound-calling/index.ts:780
- supabase/functions-live/outbound-calling/index.ts:1321-1352
- supabase/functions/outbound-calling/index.ts:295-305
- docs/wholesale/audit/phase1/LIVE-VS-MAIN-GATES.md:28,42,57
- supabase/functions-live/README.md:26,79

**validation**

Read LIVE index.ts (1373 lines) end-to-end in four reads; ran separated findstr greps: CERTIF -> 0 matches in LIVE (exit 1) vs matches up to SOURCE:1819; verify_jwt -> config.toml:124; action switch cases enumerated; provider fetch sites and DB write sites enumerated by line. Cross-checked against LIVE-VS-MAIN-GATES.md and functions-live/README.md. No live HTTP probe was run and no call was placed (RESEARCH ONLY).

**open_questions**

- Is the DEPLOYED verify_jwt for outbound-calling actually false? config.toml is repo/CLI config; functions-live/README.md does not record verify_jwt for outbound-calling and no HTTP probe was run to confirm the platform setting.
- Was outbound-calling redeployed after the 2026-07-01 18:15 UTC v600 bulk deploy? Snapshot is assumed v600/1373 lines; README 11/02 re-snapshot lists only 5 other functions.
- Does GoTrue in this project reject the anon key at auth.getUser (asserted THEORY, not probed here)?
- Do Retell-path callers have any ownership enforcement on callerId/leadId elsewhere (DB policy or dispatcher)?

**edge_cases_considered**

- service-role short-circuit (token===serviceRoleKey) trusts body.userId - not an anon path but an authz design note
- OPTIONS preflight returns before auth (:129-131) - CORS only, no side effect
- get_call_status/end_call/health_check all sit after auth; health_check still requires a JWT despite being read-only
- isTestCall bypasses calling-hours/credit/DNC guards (:316) but still requires auth
- Telnyx assistant lookup is user-scoped (.eq('user_id', userId) :471) but Retell callerId is only checked for existence in Retell (:753), not ownership

**what_i_did_not_check**

- No live unauthenticated / anon-key HTTP probe of the deployed function was executed, so the anon-key->401 conclusion is derived from code plus the corroborating ai-sms-processor probe in LIVE-VS-MAIN-GATES.md:54, not measured on this function.
- The deployed verify_jwt setting on project emonjusymdripmkvtttc was not read from Supabase (only repo config.toml).
- Retell-path callerId/leadId ownership enforcement outside this function (RLS policies, call-dispatcher) was not examined.
- DB write list is from grep of .from(...) sites; stored-procedure/RPC side effects (reserve_credits, check_credit_balance - LIVE :374,:421) were cited but their internals were not read.
- Whether the LIVE snapshot is byte-identical to the currently deployed v600 body was not re-verified (no re-download).

**confidence**: high