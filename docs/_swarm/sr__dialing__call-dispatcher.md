# sr::dialing::call-dispatcher

- status: completed
- tldr: call-dispatcher: service-role yes, disabled yes, caller-verified VERIFIED (JWT + server-side org authorize)

Audited call-dispatcher/index.ts (research-only, cited file:line). Row: index.ts:270 | uses-service-role: yes | disabled: yes | caller-verified: VERIFIED. (1) FACT — :261 reads SUPABASE_SERVICE_ROLE_KEY, :270 createClient with it (sole client, no anon). (2) FACT — hardcoded gates at :15/:19/:23 return false; force_dispatch 503 FORCE_DISPATCH_NOT_CERTIFIED (:413-423), callback automation launch-disabled (:636, body gated :640), Telnyx :1647, Assistable :1758. (3) FACT — Authorization required (:272), JWT verified via auth.getUser(token) (:304, 401 at :306), org derived server-side via authorizeOrganizationContext(supabase, user.id, requestBody.organizationId) (:319); server-to-server isInternalCall matches token===supabaseKey (:296). Did not check tenant-context.ts helper internals.

## Artifact

**Findings**

call-dispatcher/index.ts: (1) uses-service-role = YES: line 261 Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), line 270 createClient(supabaseUrl, supabaseKey) is the only client (no anon key). (2) disabled = YES: hardcoded gates isForceDispatchCertified()/isCallbackAutomationCertified()/isAutomaticRetellNumberSyncCertified() all return false at lines 16/20/24; force_dispatch returns 503 FORCE_DISPATCH_NOT_CERTIFIED (lines 413-423); callback automation unreachable (comment+log 632-636, body gated at 640); Telnyx TELNYX_EGRESS_NOT_CERTIFIED (1647/1666); Assistable PROVIDER_NOT_CERTIFIED (1758/1777). (3) caller-verified = VERIFIED: Authorization header required (272-278), JWT verified via supabase.auth.getUser(token) (304) with 401 (306-311), org derived server-side via authorizeOrganizationContext(supabase, user.id, requestBody.organizationId) (319). Server-to-server isInternalCall path matches token===supabaseKey (296), legitimate not a client bypass.

**evidence**

- index.ts:261 const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
- index.ts:270 const supabase = createClient(supabaseUrl, supabaseKey);
- index.ts:19 function isCallbackAutomationCertified(): boolean {
- index.ts:20 return false;
- index.ts:413 if (!isForceDispatchCertified()) {
- index.ts:420 status: 503,
- index.ts:636 console.log('[Dispatcher] Callback automation is launch-disabled');
- index.ts:640 if (isCallbackAutomationCertified()) {
- index.ts:272 const authHeader = req.headers.get('Authorization');
- index.ts:304 const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
- index.ts:319 ? null : await authorizeOrganizationContext(supabase, user.id, requestBody.organizationId);
- index.ts:296 const isInternalCall = requestBody.internal === true && internalUserId && token === supabaseKey;

**validation**

Read file directly (read) + findstr /n over the whole 2168-line file for all key terms. Confirmed each cited line by reading the surrounding block (255-429, 628-667). No secrets printed.

**open_questions**

- Does ../_shared/tenant-context.ts authorizeOrganizationContext actually reject a requestBody.organizationId the authenticated user does not own, or does it merely echo it? (helper internals not opened)
- Is SUPABASE_SERVICE_ROLE_KEY actually set in the deployed function env?

**what_i_did_not_check**

- ../_shared/tenant-context.ts internals (authorizeOrganizationContext / assertTenantResourceOwnership)
- ../_shared/alerting.ts and provider-router.ts
- Whether other edge functions or the scheduler call this function with the service-role key and whether that widens org scope
- Deployed env values / whether the service role key is populated at runtime
- Lines 430-628, 668-2168 body logic beyond the grepped gate/auth sites

**confidence**: high