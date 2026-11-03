# sr::dialing::voice-call

- status: completed
- tldr: voice-call: service-role YES, no disable gate, caller org VERIFIED server-side

voice-call/index.ts audit complete. Row: supabase/functions/voice-call/index.ts:53 | uses-service-role: YES | disabled: NO | caller-verified: VERIFIED. Evidence: :53 SUPABASE_SERVICE_ROLE_KEY, :56 createClient(url, serviceRoleKey); :58 auth.getUser(token) 401 on fail; :83 authorizeOrganizationContext verifies org_user membership server-side (tenant-context.ts:66-83), 403 on non-member; client organization_id is validated, not trusted. grep isXCertified = 0 matches (no 503 gate).

## Artifact

**Findings**

voice-call/index.ts:53 reads SUPABASE_SERVICE_ROLE_KEY; :56 createClient(url, serviceRoleKey) = service role. NO hardcoded disable gate (grep isXCertified = 0 matches; no 503). Caller IS verified (:58 supabaseAdmin.auth.getUser(token)) and org is derived+authorized SERVER-SIDE (:83 authorizeOrganizationContext(supabaseAdmin, user.id, body?.organization_id)), which checks organization_users membership (tenant-context.ts:66-83) and rejects non-members with ORG_FORBIDDEN 403 (:85). Client-supplied organization_id is validated against server membership, never trusted.

**evidence**

- C:/Users/charl/dial-smart-system/supabase/functions/voice-call/index.ts:53 `const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');`
- voice-call/index.ts:56 `const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);`
- voice-call/index.ts:57-58 token from Authorization Bearer; `await supabaseAdmin.auth.getUser(token)` -> 401 if invalid (:59-66)
- voice-call/index.ts:83 `organizationId = await authorizeOrganizationContext(supabaseAdmin, user.id, body?.organization_id);` -> 403 ORG_FORBIDDEN on failure (:84-86)
- voice-call/index.ts:104-115 caller ID scoped `.eq('organization_id', organizationId)`
- voice-call/index.ts:120-129 lead scoped `.eq('organization_id', organizationId)`
- _shared/tenant-context.ts:66-83 authorizeOrganizationContext queries organization_users by user_id+organization_id and assertOrganizationMembership
- grep isXCertified in supabase/functions = 0 matches (no disable gate)

**validation**

File fully read (212 lines). Helper tenant-context.ts read in full. grep isXCertified across supabase/functions returned 0 matches. Every org-scoped query confirmed `.eq('organization_id', organizationId)` with organizationId derived from the server-side helper.

**open_questions**

- Does any OTHER dialing entrypoint (twilio-twiml, register_provider_call, dialsmart pack funcs) carry an isXCertified/503 gate or trust a client campaign_id/organization_id without membership check?

**what_i_did_not_check**

- Sibling dialing edge functions (twiml, register-provider-call) for the same trust pattern
- RLS policies backing organization_users / organization_id scoping
- Whether getUser(token) with a service-role client behaves identically to an anon-key client for token validation

**confidence**: high