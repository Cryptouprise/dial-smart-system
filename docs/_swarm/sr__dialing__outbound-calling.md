# sr::dialing::outbound-calling

- status: completed
- tldr: outbound-calling: service-role yes (204/214), disabled yes (64-70 + 503 @295-305), caller VERIFIED (auth.getUser @240, org membership @288-290)

Audit complete for outbound-calling/index.ts. Row: C:/Users/charl/dial-smart-system/supabase/functions/outbound-calling/index.ts:204 | uses-service-role: yes | disabled: yes | caller-verified: VERIFIED | evidence: index.ts:204 env SUPABASE_SERVICE_ROLE_KEY, index.ts:214 createClient(serviceRoleKey); disable gates index.ts:64-66 & 68-70 return false + 503 egress gate index.ts:295-305 (PROVIDER_EGRESS_NOT_CERTIFIED); JWT verified index.ts:240 auth.getUser + org authored server-side index.ts:288-290 -> tenant-context.ts:71-77 membership assert. One SERVICE-ONLY-TRUST branch at index.ts:219-237 when token === service-role key.

## Artifact

**Findings**

DELIVERABLE ROW:
C:/Users/charl/dial-smart-system/supabase/functions/outbound-calling/index.ts:204 | uses-service-role: yes | disabled: yes | caller-verified: VERIFIED | evidence: index.ts:204 `const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');` + index.ts:214 `const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);` | index.ts:64-66 `function isScriptExperimentCertified(): boolean { return false; }` + index.ts:68-70 `isProviderDiagnosticLoggingCertified(): boolean { return false; }` + index.ts:295-302 `if (action === 'create_call' && provider !== 'retell') { ... disabled: true, error_code: 'PROVIDER_EGRESS_NOT_CERTIFIED' ... status: 503 }` | index.ts:240 `const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);` then index.ts:258 `userId = user.id;` and index.ts:288-290 `const organizationId = action === 'health_check' ? null : await authorizeOrganizationContext(supabaseAdmin, userId, requestedOrganizationId);`

DETAIL:
(1) SERVICE ROLE: YES. FACT. index.ts:204 reads SUPABASE_SERVICE_ROLE_KEY; index.ts:214 constructs a service-role client `supabaseAdmin` used for ALL reads/mutations. There is also an explicit service-role token path: index.ts:220 `const isServiceRoleCall = token === serviceRoleKey;`.
(2) DISABLED: YES (two layers). FACT. Hardcoded certification gates return false: index.ts:64-66 (isScriptExperimentCertified) and index.ts:68-70 (isProviderDiagnosticLoggingCertified). Plus a hard 503 egress gate at index.ts:295-305 for any non-Retell create_call (error_code PROVIDER_EGRESS_NOT_CERTIFIED, disabled:true, status:503). Note index.ts:204 itself is the service-role key line, not a disable gate; the disable gate is 295-305.
(3) CALLER-VERIFIED: VERIFIED (with one SERVICE-ONLY-TRUST branch). FACT. Missing Authorization -> 401 at index.ts:188-200. If token === service role key, userId is taken from body.userId and this path is SERVICE-ONLY-TRUST (index.ts:219-237) -- acceptable because the caller must possess the service-role secret. Otherwise the real user path VERIFIES the JWT: index.ts:240 `supabaseAdmin.auth.getUser(token)` and rejects on error at 248-257. Org is NOT blindly trusted from the client: body.organizationId is passed to authorizeOrganizationContext (index.ts:288-290), which (tenant-context.ts:71-77) requires an explicit UUID and asserts a real row in organization_users for that user; no arbitrary/first membership fallback (tenant-context.ts:24-38). So org is derived/authorized server-side against membership -> VERIFIED, NOT UNVERIFIED-CLIENT-ORG.

Also 404-style guidance: there is no `isXCertified(){return false}` OTHER than the two above; the provider-gate 503 is the runtime disable.

**evidence**

- C:/Users/charl/dial-smart-system/supabase/functions/outbound-calling/index.ts:204 = "const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');"
- C:/Users/charl/dial-smart-system/supabase/functions/outbound-calling/index.ts:214 = "const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);"
- C:/Users/charl/dial-smart-system/supabase/functions/outbound-calling/index.ts:220 = "const isServiceRoleCall = token === serviceRoleKey;"
- C:/Users/charl/dial-smart-system/supabase/functions/outbound-calling/index.ts:64-66 = "function isScriptExperimentCertified(): boolean { return false; }"
- C:/Users/charl/dial-smart-system/supabase/functions/outbound-calling/index.ts:68-70 = "function isProviderDiagnosticLoggingCertified(): boolean { return false; }"
- C:/Users/charl/dial-smart-system/supabase/functions/outbound-calling/index.ts:295-302 = "if (action === 'create_call' && provider !== 'retell') { return new Response(JSON.stringify({ success:false, disabled:true, error_code:'PROVIDER_EGRESS_NOT_CERTIFIED', ... }), { status: 503, ... }); }"
- C:/Users/charl/dial-smart-system/supabase/functions/outbound-calling/index.ts:240 = "const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);"
- C:/Users/charl/dial-smart-system/supabase/functions/outbound-calling/index.ts:288-290 = "const organizationId = action === 'health_check' ? null : await authorizeOrganizationContext(supabaseAdmin, userId, requestedOrganizationId);"
- C:/Users/charl/dial-smart-system/supabase/functions/_shared/tenant-context.ts:66-83 = authorizeOrganizationContext -> requireExplicitOrganizationId + organization_users membership query + assertOrganizationMembership (no first-membership fallback)

**validation**

Read index.ts:60-134 and 180-320 directly (fill in source), plus _shared/tenant-context.ts:1-84. Cross-checked with findstr /n against the whole file to confirm no other SERVICE_ROLE / getUser / 503 / org field sites were missed: the only SUPABASE_SERVICE_ROLE_KEY site is line 204; the only createClient with it is line 214; auth.getUser is only line 240; the only 503 egress gate is 295-305; the two `return false` certification gates are 64-66 and 68-70. No secrets printed (only env var NAMES).

**open_questions**

- Whether the service-role path (body.userId, index.ts:219-237) should itself be bound to org membership when invoked by call-dispatcher; not audited here.
- Whether any other edge function or client code calls outbound-calling without a Bearer token or with a leaked service key (out of scope, single-function audit).

**what_i_did_not_check**

- Did not trace call-dispatcher (call-dispatcher/index.ts:319) to confirm the service-role caller passes a consistent org_id.
- Did not verify the Supabase secret is actually set in the deployed project (read-only source audit only).
- Did not audit the other ~110 edge functions for the same patterns.
- Did not run the tenant-context tests (tenant-context.test.ts) to confirm behavior at runtime.
- Did not inspect call-exposure-policy.ts (certifiedOutboundCallingWindow / certifiedRetellCallDurationMinutes) internals.

**confidence**: high