# ce-egress-outbound-calling

- status: completed
- tldr: outbound-calling: live Retell egress at :1811, no launch-quarantine gate, verify_jwt=false, not anon-reachable (real auth).

outbound-calling/index.ts: EGRESS=YES (Retell POST https://api.retellai.com/v2/create-phone-call at line 1811 is the live provider create; Telnyx POST creates at 1271/1308 are unreachable for create_call due to the 503 provider guard at 295-305). verify_jwt=false (config.toml:123-124). NO launch-quarantine 503 gate exists on the Retell path; only 503 is line 302 PROVIDER_EGRESS_NOT_CERTIFIED (provider-type gate, skipped for provider=retell). In-file Certified helpers isScriptExperimentCertified(64) and isProviderDiagnosticLoggingCertified(68) both return false and are non-blocking (call sites 1721, 1750); isForceDispatchCertified/isCallbackAutomationCertified live in call-dispatcher/index.ts:15/19, not here. Anonymous-browser reachable=NO: CORS '*' (28) but real auth (401 on missing header 188-200; service-role bearer compare 220; supabase.auth.getUser 240 with 401 at 248-257). Bypasses launch lock: N/A (no launch lock); service-role branch 227 reaches 1811 unguarded. No SMS/OpenRouter egress; no internal function fetch.

## Artifact

**Findings**

outbound-calling/index.ts is LIVE provider egress and has NO launch-quarantine 503 gate on its Retell path. (1) EGRESS = YES: real provider CREATE at line 1811 POST https://api.retellai.com/v2/create-phone-call (create_call, provider=retell, default); plus Telnyx POST creates at 1271 and 1308 which are UNREACHABLE for create_call because of the 503 provider-type guard at 295-305. Read-only Retell egress at 885 (get-agent), 909 (get-retell-llm), 1422 (get-phone-number), 2070 (get-call), 2137 (DELETE call). No SMS, no OpenRouter, no internal function fetch. (2) verify_jwt = false (config.toml:123-124). (3) No launch-quarantine helper exists in this file: only isScriptExperimentCertified (def 64-66, returns false, called 1721, non-blocking) and isProviderDiagnosticLoggingCertified (def 68-70, returns false, called 1750, non-blocking). isForceDispatchCertified/isCallbackAutomationCertified are in call-dispatcher/index.ts:15/19, not here. The ONLY 503 is line 302 PROVIDER_EGRESS_NOT_CERTIFIED, a provider-type gate, not a launch gate; it is skipped when provider==='retell'. No 503 in any imported _shared helper. (4) Anonymous-browser reachable = NO: CORS is '*' (line 28) but there is a real identity check (401 if no Authorization 188-200; service-role bearer compare 220; supabase.auth.getUser(token) 240 with 401 at 248-257). api-auth.ts is NOT imported. (5) Bypasses launch lock = N/A because no launch lock exists on the Retell path; the service-role/call-dispatcher branch (227) reaches create-phone-call at 1811 with no 503 gate; OPTIONS preflight (170-172) returns before any egress.

**evidence**

- supabase/functions/outbound-calling/index.ts:28 - 'Access-Control-Allow-Origin': '*',
- supabase/functions/outbound-calling/index.ts:188-200 - if (!authHeader) { ... status: 401 ... }
- supabase/functions/outbound-calling/index.ts:220 - const isServiceRoleCall = token === serviceRoleKey;
- supabase/functions/outbound-calling/index.ts:240 - const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
- supabase/functions/outbound-calling/index.ts:248-257 - if (authError || !user) { ... status: 401 ... }
- supabase/functions/outbound-calling/index.ts:295-305 - if (action === 'create_call' && provider !== 'retell') { ... status: 503, ... error_code: 'PROVIDER_EGRESS_NOT_CERTIFIED' }
- supabase/functions/outbound-calling/index.ts:64-66 - function isScriptExperimentCertified(): boolean { return false; }
- supabase/functions/outbound-calling/index.ts:68-70 - function isProviderDiagnosticLoggingCertified(): boolean { return false; }
- supabase/functions/outbound-calling/index.ts:1721 - if (isScriptExperimentCertified()) {
- supabase/functions/outbound-calling/index.ts:1750 - if (isProviderDiagnosticLoggingCertified()) try {
- supabase/functions/outbound-calling/index.ts:1811 - const res = await fetchWithTimeout(`${baseUrl}/create-phone-call`, { method: 'POST',
- supabase/functions/outbound-calling/index.ts:1271 - const directRes = await fetch(`https://api.telnyx.com/v2/ai/assistants/${telnyxAssistant.telnyx_assistant_id}/calls`, { method: 'POST',
- supabase/functions/outbound-calling/index.ts:1308 - const telnyxRes = await fetch(`https://api.telnyx.com/v2/texml/ai_calls/${telnyxAssistant.telnyx_texml_app_id}`, { method: 'POST',
- supabase/functions/outbound-calling/index.ts:1422 - const getPhoneResponse = await fetchWithTimeout(`https://api.retellai.com/get-phone-number/${encodeURIComponent(canonicalCallerId)}`, { method: 'GET',
- supabase/functions/outbound-calling/index.ts:885 - const liveAgentResponse = await fetchWithTimeout(retellGetAgentUrl(agentId!), { method: 'GET',
- supabase/functions/outbound-calling/index.ts:909 - const liveLlmResponse = await fetchWithTimeout(retellGetLlmUrl(liveLlmId, liveLlmVersion), { method: 'GET',
- supabase/functions/outbound-calling/index.ts:2070 - response = await fetchWithTimeout(`${baseUrl}/get-call/${retellCallId}`, { method: 'GET',
- supabase/functions/outbound-calling/index.ts:2137 - response = await fetchWithTimeout(`${baseUrl}/call/${retellCallId}`, { method: 'DELETE',
- supabase/functions/outbound-calling/index.ts:319 - const baseUrl = RETELL_V2_API_BASE;
- supabase/functions/_shared/retell-provider-contract.ts:1-2 - export const RETELL_API_ROOT = 'https://api.retellai.com'; export const RETELL_V2_API_BASE = `${RETELL_API_ROOT}/v2`;
- supabase/config.toml:123-124 - [functions.outbound-calling] / verify_jwt = false  # Handles auth internally - supports both JWT and service-role calls from dispatcher
- supabase/functions/call-dispatcher/index.ts:15-22 - function isForceDispatchCertified(): boolean { / function isCallbackAutomationCertified(): boolean {
- supabase/functions/_shared/tenant-context.ts:66-83 - authorizeOrganizationContext throws (no 503)

**validation**

Read all 2245 lines of supabase/functions/outbound-calling/index.ts in 4 chunks plus final lines. Grepped file for '503' (2 hits: 87 comment-string, 302 response), 'Certified(' (3 hits: defs 64,68 + calls 1721,1750), 'fetch(' / 'fetchWithTimeout(' (all 11 sites enumerated), 'https://' (imports 2-3, 1271, 1308, 1422). Grepped repo-wide for isForceDispatchCertified/isCallbackAutomationCertified/isOutboundCertified (found only in call-dispatcher, not here). Grepped imported _shared helpers (tenant-context, campaign-contact-release, retell-provider-contract, call-exposure-policy, contact-safety) for '503' -> none. Read config.toml lines 116-136 for the exact [functions.outbound-calling] block. Read tenant-context.ts fully to confirm authorizeOrganizationContext throws rather than returning 503. Confirmed import list has no api-auth.ts and no internal function fetch.

**open_questions**

- Does call-dispatcher's isForceDispatchCertified gate (call-dispatcher/index.ts:413) block the service-role path that would reach outbound-calling create_call at line 1811? That is a different function, out of this node's single-file scope, but it determines whether the dispatcher force_dispatch path can reach the physical Retell create.
- Is supabase/config.toml the deployed/authoritative config, or could the deployed function have verify_jwt=true? Not verifiable without live access (research-only).

**what_i_did_not_check**

- Runtime behavior of the deployed function (no live calls permitted).
- call-dispatcher/index.ts force_dispatch gating and whether it blocks the service-role egress path into outbound-calling (different file).
- The other ~28 files returned by the repo-wide 'Certified(' grep (out of scope: EXACTLY ONE file requested).
- RLS/RPC semantics of claim_provider_dispatch, reserve_credits, finalize_provider_dispatch.
- Whether providerCallId-returning read-only Retell GETs (885/909/1422/2070) count as egress under any stricter definition (they are reads, not creates).

**confidence**: high