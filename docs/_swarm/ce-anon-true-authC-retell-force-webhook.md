# ce-anon-true-authC-retell-force-webhook

- status: completed
- tldr: retell-force-webhook: CORS *@L5, getUser auth@L48, 401 on failure@L49, but hardcoded-false 503 gate@L20 blocks all anon access to Retell mutation.

ce-anon-true-authC-retell-force-webhook done. retell-force-webhook | cors_wildcard=yes@L5 | in_func_auth=yes@L33-53 | auth_kind=getUser@L48 | auth_rejects_on_failure=yes@L49-52 (status:401) | anon_reachable=no@L20-29 | priv_side_effect=retell_agent_mutation(PATCH update-agent)@L96-105 + test_call@L134-150, DISABLED by 503 gate | note=guard L20 'if (!isRetellMaintenanceRouteTenantCertified()) { return ... RETELL_MAINTENANCE_ROUTE_NOT_TENANT_CERTIFIED ... status:503 }'; auth guard L49 'if (authError || !user) { return ... Invalid or expired session ... status:401 }'. Key point: the hardcoded-false cert gate (L9-11) returns 503 for all non-OPTIONS requests, so despite wildcard CORS and a real getUser auth path, no anonymous caller can reach the privileged Retell mutation.

## Artifact

**Findings**

retell-force-webhook/index.ts is a Retell maintenance edge function. (1) CORS allows any origin: 'Access-Control-Allow-Origin': '*' (L5). (2) It HAS in-function auth: reads Authorization header (L33), strips Bearer (L41), rejects absent/service-role (L36-46), then resolves the user via supabase.auth.getUser(token) (L48). (3) auth_kind = getUser. (4) It DOES return 401 when getUser errors: if (authError || !user) -> status 401 'Invalid or expired session' (L49-53). Ownership is additionally enforced by a retell_agents lookup scoped to user.id, returning 403 (L70-81). (5) anon_reachable = no: a hardcoded-false tenant-certification gate (L9-11) makes every non-OPTIONS request return 503 before any auth or side effect (L20-29). (6) priv_side_effect = Retell account-level config mutation: update_webhook PATCHes https://api.retellai.com/update-agent/{agent_id} (L96-105) and make_test_call places a physical call via outbound-calling (L134-150); both are DISABLED by the 503 gate. SINGLE ROW: retell-force-webhook | cors_wildcard=yes@L5 | in_func_auth=yes@L33-53 | auth_kind=getUser@L48 | auth_rejects_on_failure=yes@L49-52 | anon_reachable=no@L20-29 | priv_side_effect=retell_agent_mutation@L96-105 + test_call@L134-150, DISABLED by 503 gate | note=guard L20 'if (!isRetellMaintenanceRouteTenantCertified()) { return new Response(JSON.stringify({ error_code: RETELL_MAINTENANCE_ROUTE_NOT_TENANT_CERTIFIED }), { status: 503, ... }) }'; auth guard L49 'if (authError || !user) { return new Response(JSON.stringify({ success: false, error: Invalid or expired session }), { status: 401 }) }'

**evidence**

- C:/Users/charl/dial-smart-system/supabase/functions/retell-force-webhook/index.ts:5 - 'Access-Control-Allow-Origin': '*'
- index.ts:14-16 - OPTIONS preflight returns corsHeaders (anon-served, no auth)
- index.ts:9-11 - isRetellMaintenanceRouteTenantCertified() returns false (hardcoded)
- index.ts:20-29 - containment gate returns status 503 before any auth/side effect
- index.ts:33-46 - Authorization header read; 401 when absent; 401 when token equals serviceRoleKey
- index.ts:48 - const { data: { user }, error: authError } = await supabase.auth.getUser(token)
- index.ts:49-53 - if (authError || !user) { return ... status: 401, error 'Invalid or expired session' }
- index.ts:70-81 - retell_agents lookup .eq('user_id', user.id); 403 'Agent is not owned by the authenticated user'
- index.ts:96-105 - fetch PATCH https://api.retellai.com/update-agent/{agent_id} (privileged Retell mutation)
- index.ts:134-150 - fetch POST {supabaseUrl}/functions/v1/outbound-calling (physical test call)

**validation**

Read the full 197-line file top to bottom; located the getUser call at L48 via the hint and read the ~50 surrounding lines to capture the 401 return (L49-53). Every claim is tied to an exact line number taken from the file read output. No writes, commands, or API calls were made (research-only).

**open_questions**

- Does the deployed version match this source (git state / last deploy)?
- Is verify_jwt set for this function in supabase/config.toml, and does platform-level JWT enforcement run before the in-function gate?
- Is isRetellMaintenanceRouteTenantCertified ever overridden (env flag / feature toggle) outside this file?

**edge_cases_considered**

- OPTIONS request is served anonymously with wildcard CORS but performs no side effect (L14-16).
- Service-role token is explicitly rejected at L42-46, so a service-role bearer cannot masquerade as a user.
- Ownership defense-in-depth: even with a valid user JWT, an agent not owned by that user is 403 (L77-81).
- make_test_call also requires organizationId + idempotency_key >= 8 chars (L125-129).

**what_i_did_not_check**

- Other edge functions in dial-smart-system (only this single file was in scope).
- supabase/config.toml verify_jwt setting and any gateway-level auth in front of the function.
- Whether the deployed artifact matches this working-tree source.
- Git history / last-deploy provenance for this file.
- Any callers that invoke retell-force-webhook (client or server).

**confidence**: high