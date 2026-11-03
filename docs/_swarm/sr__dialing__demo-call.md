# sr::dialing::demo-call

- status: completed
- tldr: demo-call: service role YES, no isXCertified gate, caller UNVERIFIED-CLIENT-ORG

Audit of demo-call/index.ts complete. (1) YES service-role: :229 reads SUPABASE_SERVICE_ROLE_KEY, :234 createClient(url, serviceKey). (2) NO hardcoded isXCertified(){return false} gate; disable paths are config-driven 503s (:231 env-missing, :302-306 DEMO_AGENT_CONFIG_INVALID, :313 bad phone). (3) UNVERIFIED-CLIENT-ORG: no auth.getUser, no Bearer/apikey check, no org_id derivation; trusts client-supplied sessionId (:262-266) and campaignType (:209, allowlist-validated :276-280). Row: index.ts:229-234 | uses-service-role: YES | disabled: NO | caller-verified: UNVERIFIED-CLIENT-ORG.

## Artifact

**Findings**

demo-call/index.ts reads SUPABASE_SERVICE_ROLE_KEY and builds a service-role client (no auth/postgrest RLS). There is NO isXCertified(){return false} disable gate in this file; the disable/refuse paths are config-driven 503s (missing env, unsafe demo_agent_config, bad demo phone). The function performs NO caller verification: no auth.getUser, no Authorization/Bearer check, no apikey check, no org_id/organization_id read or derivation. It trusts client-supplied identifiers: sessionId (sole DB lookup key, line 262-266) and campaignType (client body, allowlist-validated at line 276-280). No org concept exists. Net: any anonymous caller can trigger an outbound call + SMS via a service-role backend, keyed only by a client-supplied sessionId.

**evidence**

- index.ts:229 const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
- index.ts:234 const supabase = createClient(supabaseUrl, supabaseServiceKey);
- index.ts:231 503 'Demo calling is not configured.' (env-missing gate, not isXCertified)
- index.ts:302-306 503 error_code 'DEMO_AGENT_CONFIG_INVALID' (config gate)
- index.ts:209 campaignType destructured from client body
- index.ts:276-280 effectiveCampaignType = ALLOWED_CAMPAIGNS.has(campaignType) ? campaignType : ...
- index.ts:262-266 .from('demo_sessions').select('*').eq('id', sessionId).single()  (client-supplied sessionId is the only lookup key)
- index.ts:350-371 fetch to retellai create-phone-call with override_agent_id (outbound call placed)
- index.ts:410-421 SMS sent using service key
- grep isXCertified|getUser|organization_id|org_id => 0 matches

**validation**

Read full 438-line file; regex grep for isXCertified|getUser|organization_id|org_id returned 0 matches. Deliverable row: C:/Users/charl/dial-smart-system/supabase/functions/demo-call/index.ts:229-234 | uses-service-role: YES | disabled: NO (no isXCertified gate; config-driven 503s at :231/:306) | caller-verified: UNVERIFIED-CLIENT-ORG (trusts client sessionId + campaignType; no auth.getUser, no Bearer, no server-side org).

**open_questions**

- Does the deployment set verify_jwt=true for functions, making this require a valid Supabase JWT before entry?
- Is sessionId cryptographically unguessable/one-time bound to the requester?

**what_i_did_not_check**

- Whether the front-end generates sessionId in a way that binds it to the caller (no proof of ownership check server-side)
- Whether Supabase gateway/JWT verification is enforced before the function executes (Deno.serve has no verify_jwt config visible in this file)
- Rate-limit bypass via spoofed x-forwarded-for / cf-connecting-ip headers (line 235-237)
- Whether demo_call_logs/demo_sessions RLS restricts anything (service role bypasses RLS anyway)

**confidence**: high