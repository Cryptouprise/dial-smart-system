# sr::dialing::voice-token

- status: completed
- tldr: voice-token: service role YES :41, disable gate NO (0 isXCertified hits), caller VERIFIED via getUser + server-side org membership; client org_id is validated, not trusted.

FACT row -> .../voice-token/index.ts:41 | uses-service-role: YES | disabled: NO | caller-verified: VERIFIED. serviceRoleKey read :38, createClient(supabaseUrl, serviceRoleKey) :41, JWT validated :43 via supabaseAdmin.auth.getUser; auth header required :32-35 (401); org derived server-side :70 -> authorizeOrganizationContext (tenant-context.ts:66-82) queries organization_users (user_id,organization_id) membership, else 403 :71-73. body.organization_id is a membership-checked request, not trusted. (2) DISABLE GATE: 'isXCertified' grep = 0 matches across supabase/functions, no 503 path. Not disabled. Validation: read full file; printed tenant-context.ts; findstr + agentgrep (0 hits). Blockers: none. Not checked: voice-provider.ts mintToken; other functions for global gate; deployed revision vs working copy.

## Artifact

**Findings**

INDEX | uses-service-role | disabled | caller-verified: VERIFIED | evidence. (1) SERVICE ROLE: YES. voice-token/index.ts:38 reads SUPABASE_SERVICE_ROLE_KEY; :41 createClient(supabaseUrl, serviceRoleKey) = service-role client (supabaseAdmin); :43 supabaseAdmin.auth.getUser(token) validates the JWT. (2) DISABLE GATE: NONE. 'isXCertified' grep = 0 matches across C:/Users/charl/dial-smart-system/supabase/functions (agentgrep); no 503 return in index.ts (only 200/401/403/400/405/429/500). Function is NOT disabled. (3) CALLER VERIFICATION: VERIFIED. Auth header required (index.ts:32-35, 401 if missing); token extracted :42 and validated via supabaseAdmin.auth.getUser :43-51 (401 on failure); org NOT trusted from body — body.organization_id (:70) is passed to authorizeOrganizationContext, which server-side requires a valid UUID and queries organization_users for (user_id, organization_id) membership (tenant-context.ts:66-82), throwing -> 403 ORG_FORBIDDEN (index.ts:71-73). So client-supplied organization_id is an explicit *request* that must match server-verified membership, not a trusted value.

**evidence**

- C:/Users/charl/dial-smart-system/supabase/functions/voice-token/index.ts:38 : const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
- C:/Users/charl/dial-smart-system/supabase/functions/voice-token/index.ts:41 : const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
- C:/Users/charl/dial-smart-system/supabase/functions/voice-token/index.ts:43 : const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
- C:/Users/charl/dial-smart-system/supabase/functions/voice-token/index.ts:32-35 : authHeader required else 401 UNAUTHENTICATED
- C:/Users/charl/dial-smart-system/supabase/functions/voice-token/index.ts:70-73 : authorizeOrganizationContext(supabaseAdmin, user.id, body?.organization_id) -> 403 ORG_FORBIDDEN
- C:/Users/charl/dial-smart-system/supabase/functions/_shared/tenant-context.ts:66-82 : authorizeOrganizationContext queries organization_users .eq('user_id',userId).eq('organization_id',organizationId).maybeSingle() then assertOrganizationMembership
- agentgrep isXCertified across supabase/functions = 0 matches

**validation**

Read full 94-line index.ts (read tool). Printed _shared/tenant-context.ts and ran findstr for isXCertified/503/authorizeOrganizationContext. Ran agentgrep for isXCertified over the functions tree (0 hits) to confirm no disable gate exists.

**open_questions**

- Whether any SIBLING function (call-dispatcher, api-gateway, etc.) carries an isXCertified/503 disable gate, and whether that gate is supposed to guard voice-token too.
- Whether provider.mintToken (voice-provider.ts) performs additional org checks or issues tokens scoped to organizationId — not read here.

**what_i_did_not_check**

- voice-provider.ts getProvider/mintToken body (twilio.ts/telnyx mint paths).
- Whether 'isVoiceProvider' correctly rejects all non-allowlisted providers.
- Other supabase/functions/* for a global 503 disable gate.
- Git history/current deployed revision vs this working copy.

**confidence**: high