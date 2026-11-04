# ce-egress-call-dispatcher

- status: completed
- tldr: call-dispatcher: egress via outbound-calling→Retell create-phone-call; verify_jwt=false; 503 only on non-egress force_dispatch

call-dispatcher (2168 lines) analyzed. EGRESS=YES indirect: only reachable egress is supabase.functions.invoke('outbound-calling') at :1955 with action:'create_call' (:1940); target reaches Retell create-phone-call (outbound-calling:1811). Telnyx/Twilio/OpenRouter not in chain (outbound-calling 503-blocks provider!='retell' at :295-305). verify_jwt=false confirmed (config.toml:126-127). 503 gates: only isForceDispatchCertified (:15-17 def, :413 call, :420 503) which guards the NON-egress force_dispatch action; isCallbackAutomationCertified (:19-21,:640) and isAutomaticRetellNumberSyncCertified (:23-25,:1266) are inert booleans with NO 503. Main Retell egress has no 503 gate. CORS='*' (:11) but real auth exists (Authorization required :272-278; token===supabaseKey :296; auth.getUser :304) => not anon-reachable. No egress path bypasses a 503 gate (only 503 gate is on non-egress force_dispatch; OPTIONS early-returns :255-257). Node ce-egress-call-dispatcher completed.

## Artifact

**Findings**

call-dispatcher/index.ts has NO direct provider fetch. Its single reachable egress is supabase.functions.invoke('outbound-calling') at index.ts:1955 with body action:'create_call' (:1940), reached in the main dispatch loop (:1608). The target outbound-calling/index.ts reaches the real provider create endpoint: fetchWithTimeout(`${baseUrl}/create-phone-call`) at outbound-calling:1811 (baseUrl=RETELL_V2_API_BASE :319). So EGRESS=YES (indirect, Retell create-phone-call). Telnyx/Twilio/OpenRouter are NOT in this chain (outbound-calling hard-blocks provider!='retell' at :295-305 with 503 PROVIDER_EGRESS_NOT_CERTIFIED). verify_jwt=false confirmed (config.toml:126-127). Launch gates: isForceDispatchCertified def :15-17 call :413 503 at :420 (guards force_dispatch, which is NON-egress and returns at :536); isCallbackAutomationCertified def :19-21 call :640 (boolean, NO 503); isAutomaticRetellNumberSyncCertified def :23-25 call :1266 (boolean, NO 503). The main Retell egress (:1955) has NO 503 gate. Inline hard-blocks: Telnyx :1646-1671 (TELNYX_EGRESS_NOT_CERTIFIED), Assistable :1753-1782 (PROVIDER_NOT_CERTIFIED) - continue, no provider call. CORS is '*' (:11) BUT a real identity check exists: Authorization header required (:272-278), service-role compare token===supabaseKey (:296), JWT supabase.auth.getUser(token) (:304) => NOT anonymous-browser reachable. No egress path bypasses a 503 gate: the only 503 gate is on the non-egress force_dispatch action; OPTIONS returns early (:255-257); bypassCallingHours forced false (:350); manualDispatchNow=false (:1429).

**evidence**

- call-dispatcher/index.ts:1955-1961  supabase.functions.invoke('outbound-calling', { body: callBody, headers: { Authorization: `Bearer ${supabaseKey}`, apikey: supabaseKey } })
- call-dispatcher/index.ts:1940  action: 'create_call',
- outbound-calling/index.ts:1811  const res = await fetchWithTimeout(`${baseUrl}/create-phone-call`, {
- outbound-calling/index.ts:319  const baseUrl = RETELL_V2_API_BASE;
- outbound-calling/index.ts:295-305  if (action === 'create_call' && provider !== 'retell') { ... error_code: 'PROVIDER_EGRESS_NOT_CERTIFIED' ... status: 503
- supabase/config.toml:126-127  [functions.call-dispatcher] / verify_jwt = false  # Internal service function - called by automation-scheduler
- call-dispatcher/index.ts:15-17  function isForceDispatchCertified(): boolean { return false; }
- call-dispatcher/index.ts:413  if (!isForceDispatchCertified()) {
- call-dispatcher/index.ts:420  status: 503,
- call-dispatcher/index.ts:19-21  function isCallbackAutomationCertified(): boolean { return false; }
- call-dispatcher/index.ts:640  if (isCallbackAutomationCertified()) {
- call-dispatcher/index.ts:23-25  function isAutomaticRetellNumberSyncCertified(): boolean { return false; }
- call-dispatcher/index.ts:1266  isAutomaticRetellNumberSyncCertified() &&
- call-dispatcher/index.ts:11  'Access-Control-Allow-Origin': '*',
- call-dispatcher/index.ts:272-278  const authHeader = req.headers.get('Authorization'); if (!authHeader) { ... status: 401 }
- call-dispatcher/index.ts:296  const isInternalCall = requestBody.internal === true && internalUserId && token === supabaseKey;
- call-dispatcher/index.ts:304-311  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token); ... status: 401
- call-dispatcher/index.ts:1646-1671  Telnyx block, error_code: 'TELNYX_EGRESS_NOT_CERTIFIED' (continue)
- call-dispatcher/index.ts:1753-1782  Assistable block, error_code: 'PROVIDER_NOT_CERTIFIED' (continue)
- call-dispatcher/index.ts:255-257  if (req.method === 'OPTIONS') { return new Response(null, { headers: corsHeaders }); }
- call-dispatcher/index.ts:350  const bypassCallingHours: boolean = false;
- call-dispatcher/index.ts:1429  const manualDispatchNow = false;
- call-dispatcher/index.ts:780  invoke('workflow-executor') inside isCallbackAutomationCertified()==false block (unreachable)
- call-dispatcher/index.ts:1145  invoke('workflow-executor') guarded by workflowEnrolled>0 which is unreachable because activeCampaigns filter .is('workflow_id', null) at :882
- call-dispatcher/index.ts:1285  invoke('retell-phone-management') guarded by isAutomaticRetellNumberSyncCertified()==false (unreachable)

**validation**

Read call-dispatcher/index.ts in full (2168 lines). Grepped outbound-calling/index.ts for provider endpoints (create-phone-call, api.telnyx, twilio, openrouter, chat/completions) and read its create_call switch + auth branch + Retell egress. Read config.toml block. Cross-checked every supabase.functions.invoke site for reachability.

**open_questions**

- Does outbound-calling itself have any bypass of its own Retell-vs-Telnyx 503 gate for a service-role call? (its gate at :295 applies to all callers regardless of auth) - out of scope for this node.
- Is there any OTHER caller of call-dispatcher that could supply a service-role token, and does automation-scheduler run it on a cron? Not checked (different file).

**edge_cases_considered**

- Internal service-role branch (:300-302) sets user without JWT verification but does not reach a provider create without going through the same main egress (:1955); it bypasses JWT, not a launch lock (none exists on the main path).
- force_dispatch (:409) is the only action with a 503 gate, but it only inserts/updates dialing_queues rows and returns (:536) - it does NOT reach egress.
- callback path (isCallbackAutomationCertified false) and retell-sync path (isAutomaticRetellNumberSyncCertified false) are inert booleans, not 503 gates.
- workflow-executor invoke at :1145 is dead because active campaigns are filtered to workflow_id IS NULL (:882), so workflowEnrolled stays 0.

**what_i_did_not_check**

- Full read of outbound-calling/index.ts (only create_call path, auth branch, and Retell egress read) - its internal safety gates beyond :295-305 not enumerated.
- The helper files named in the task (api-auth.ts, utils.ts, retell-provider-contract.ts, telnyx.ts, twilio.ts, voice-provider.ts, openrouter.ts, control-plane/authorization.ts) - call-dispatcher does NOT import them (imports at :1-8 are alerting.ts, provider-router.ts, tenant-context.ts), so they were not consulted.
- The body of tenant-context.ts (authorizeOrganizationContext / assertTenantResourceOwnership) and provider-router.ts (resolveRouting) beyond call-site behavior.
- Whether automation-scheduler (the caller) has its own gates, and whether call-dispatcher's DB-only early returns can be abused.

**confidence**: high