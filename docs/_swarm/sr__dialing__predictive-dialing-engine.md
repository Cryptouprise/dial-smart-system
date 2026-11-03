# sr::dialing::predictive-dialing-engine

- status: completed
- tldr: pred-dialing-engine: service-role YES, disabled YES (503), caller-verified VERIFIED via JWT + user_id scoping.

predictive-dialing-engine/index.ts:328 | uses-service-role: YES (l.33 env SUPABASE_SERVICE_ROLE_KEY, l.42 createClient) | disabled: YES (l.15-17 isPredictiveDialingTenantCertified(){return false}, l.24 gate, l.26 503 PREDICTIVE_DIALING_NOT_TENANT_CERTIFIED) | caller-verified: VERIFIED (l.44-52 Bearer + auth.getUser(token); body schema l.10-13 accepts only campaignId+action, no org_id; ownership derived server-side via l.118-123 .eq('user_id', user.id)).

## Artifact

**Findings**

predictive-dialing-engine/index.ts:328 | uses-service-role: YES | disabled: YES (hardcoded 503 gate) | caller-verified: VERIFIED (JWT auth.getUser + server-side user_id scoping). (1) SERVICE ROLE: line 33 reads Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'); line 42 createClient(supabaseUrl, supabaseKey) constructs a service-role client (bypasses RLS). (2) DISABLE GATE: lines 15-17 isPredictiveDialingTenantCertified() returns false unconditionally; line 24 gates on it; line 26 returns HTTP 503 with error_code PREDICTIVE_DIALING_NOT_TENANT_CERTIFIED. Function is inert in production. (3) CALLER VERIFICATION: lines 44-50 require Authorization header; line 52 supabase.auth.getUser(token) validates the JWT; lines 54-59 reject on authError/no user. Body schema (lines 10-13) accepts only campaignId (uuid) + action enum, NOT org_id/organization_id. Ownership derived server-side: line 118-123 selects campaign with .eq('id', campaignId).eq('user_id', user.id); 404 if not owned. Same ownership pattern for queue listing (lines 88-94), start/stop/status all operate only on the verified user's campaign. NOT SERVICE-ONLY-TRUST: org is derived from the authenticated user, not trusted from client body.

**evidence**

- predictive-dialing-engine/index.ts:33 const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
- predictive-dialing-engine/index.ts:42 const supabase = createClient(supabaseUrl, supabaseKey);
- predictive-dialing-engine/index.ts:15-17 function isPredictiveDialingTenantCertified(): boolean { return false; }
- predictive-dialing-engine/index.ts:24-28 if (!isPredictiveDialingTenantCertified()) { ... status: 503 ... error_code: 'PREDICTIVE_DIALING_NOT_TENANT_CERTIFIED'
- predictive-dialing-engine/index.ts:44-52 authHeader check + const token = authHeader.replace('Bearer ', ''); const { data: { user }, error: authError } = await supabase.auth.getUser(token);
- predictive-dialing-engine/index.ts:10-13 DialingRequestSchema = z.object({ campaignId: z.string().uuid(), action: z.enum(['start','stop','status']) }) -(no org_id field)
- predictive-dialing-engine/index.ts:118-123 .from('campaigns').select('*').eq('id', campaignId).eq('user_id', user.id).maybeSingle(); 404 'Campaign not found or unauthorized'

**validation**

Read full 328-line file top to bottom; confirmed all three claims by direct line inspection. No secrets printed (env var name only, never its value). All conclusions are FACT from cited lines. No live calls made (RESEARCH ONLY).

**open_questions**

- Is the createClient service-role usage a deliberate RLS-bypass or does the project also enforce RLS? Service-role client here bypasses RLS, so authorization rests entirely on the user_id .eq() filters.
- The auth.getUser(token) is validated against the service-role client auth API; correct pattern but worth noting it uses the admin client for token validation.

**what_i_did_not_check**

- Whether RLS policies exist on campaigns/dialing_queues/campaign_leads in the DB (if they do, service-role bypass is moot but defense-in-depth is reduced).
- Other Edge Functions in the same repo for the same disable-gate / service-role pattern (out of this node's scope).
- Whether SUPABASE_SERVICE_ROLE_KEY is actually configured in the deployed environment (only the code path was audited).

**confidence**: high