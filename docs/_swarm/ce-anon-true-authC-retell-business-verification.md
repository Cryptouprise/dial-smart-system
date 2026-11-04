# ce-anon-true-authC-retell-business-verification

- status: completed
- tldr: retell-business-verification: wildcard CORS@5, getUser auth returns 401@73-79, but dead 503 gate@43-48 makes anon_reachable=no

Audited C:/Users/charl/dial-smart-system/supabase/functions/retell-business-verification/index.ts (204 lines, read in full). Emitted row:

FUNC=retell-business-verification | cors_wildcard=yes@index.ts:5 | in_func_auth=yes@index.ts:52-58,71 | auth_kind=getUser | auth_rejects_on_failure=yes@index.ts:73-79 (401) | anon_reachable=no | priv_side_effect=service-role client index.ts:67 writes retell_business_profiles/retell_verified_numbers/retell_branded_calls (index.ts:91-187) but dead because index.ts:43-48 always 503 (index.ts:34-36 returns false); latent unscoped update index.ts:136-139 | note=index.ts:73 `if (authError || !user) { return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, ... }) }`

Key points: wildcard CORS on every response; getUser-based JWT auth that does return 401 on failure; but the handler is functionally disabled by a hard-coded false certification gate (index.ts:34-36) firing at index.ts:43-48 before auth, so no privileged write is reachable today. Latent finding: index.ts:136-139 updates business profile status by id only (no user_id), a cross-tenant write if the gate is ever enabled.

## Artifact

**Findings**

1) CORS Access-Control-Allow-Origin is a literal wildcard '*' at index.ts:5, spread into every Response (OPTIONS :40, 503 :46, 401 :56, 401 :77, 200 :194, 500 :201). 2) In-function auth present: missing Authorization header -> 401 at index.ts:52-58; JWT verified via getUser at index.ts:71 (auth_kind=getUser, not service-role-bearer). 3) auth_rejects_on_failure=yes at index.ts:73-79 (status 401). 4) anon_reachable=no for the data path: every non-OPTIONS request short-circuits at index.ts:43-48 because isRetellBusinessVerificationCertified() is hard-coded false at index.ts:34-36, so it always returns 503 before auth. 5) priv_side_effect is latent/dead: service-role client at index.ts:67 bypasses RLS and writes retell_business_profiles / retell_verified_numbers / retell_branded_calls (index.ts:91-187). 6) Latent cross-tenant bug: the profile status update at index.ts:136-139 filters by .eq('id', verificationData.business_profile_id) only, no user_id, so flipping the gate true would let an authenticated user mark another tenant's profile submitted.

**evidence**

- index.ts:5 'Access-Control-Allow-Origin': '*'
- index.ts:34-36 isRetellBusinessVerificationCertified() { return false; }
- index.ts:39-41 OPTIONS returns 200 with corsHeaders
- index.ts:43-48 503 disabled guard runs before auth
- index.ts:52-58 401 Missing authorization header
- index.ts:67 createClient(supabaseUrl, supabaseServiceKey) service role
- index.ts:71 await supabaseClient.auth.getUser(token)
- index.ts:73-79 if (authError || !user) return 401
- index.ts:136-139 update status submitted, .eq('id', verificationData.business_profile_id), no user_id scope

**validation**

Read the entire 204-line function in one pass. Each claim tied to a quoted line number. Verified all six Response constructions spread corsHeaders, that both 401 paths sit after the index.ts:43 503 gate, and that user_id scoping exists on the select/insert calls but not on the index.ts:136-139 update.

**open_questions**

- Is isRetellBusinessVerificationCertified() intended to be enabled later, which would activate the unscoped index.ts:136-139 update and the wildcard-CORS 200 data path?
- Does any caller depend on this function's open CORS?

**what_i_did_not_check**

- Did not diff against sibling supabase/functions/*/index.ts to confirm the wildcard-CORS + dead-gate pattern is repo-wide.
- Did not inspect migrations/RLS policies for the three retell tables.
- Did not search for repo callers of retell-business-verification.

**confidence**: high