# ce-anon-true-authC-retell-llm-management

- status: completed
- tldr: retell-llm-management: wildcard CORS @L5, getUser auth @L41 is DEAD code (unconditional 503 @L22-30), anon_reachable=yes, no priv side effect.

Node ce-anon-true-authC-retell-llm-management DONE. Single row: FUNC retell-llm-management | cors_wildcard=yes@L5 | in_func_auth=yes-but-dead@L33-47 (unreachable; handler returns at L22) | auth_kind=getUser@L41 (+service-role-bearer fallback @L44) | auth_rejects_on_failure=yes@L45 (dead, never reached due to L22 early return) | anon_reachable=yes (anon caller, no token, gets 503 disabled body @L22-30; auth @L32+ never executes) | priv_side_effect=none (unconditional 503 @L22-30 precedes all Retell fetches @L83/93/105/123/137 and RETELL_AI_API_KEY read @L51) | note=<L28 status:503 disabled:true error_code:'PROVIDER_ADMIN_NOT_CERTIFIED'; L45 401 return is unreachable>. KEY: the function is a kill-switched stub; its CORS wildcard and getUser auth code exist but the whole try block is dead code.

## Artifact

**Findings**

edgfn retell-llm-management sets wildcard CORS 'Access-Control-Allow-Origin': '*' (L5). The serve handler unconditionally returns HTTP 503 {success:false,disabled:true,error_code:'PROVIDER_ADMIN_NOT_CERTIFIED'} at L22-30 BEFORE the auth block, so the entire try{} body L32-166 is DEAD/unreachable. An auth block EXISTS (L33-47: 401 Missing authorization L35; supabaseAdmin.auth.getUser(token) L41; 401 'Unauthorized' L45 gated by service-role-bearer fallback token!==supabaseServiceKey L44) but is never reached. auth_kind=getUser (L41) with a service-role-bearer acceptance path (L44). auth_rejects_on_failure: code WOULD return 401 on getUser error (L45) but never executes due to L22 early return, so no 401/403 is emitted at runtime. anon_reachable=yes: any anonymous caller with no Authorization header receives the 503 disabled body (L22-30); auth at L32+ never runs. priv_side_effect=none: the unconditional 503 return precedes RETELL_AI_API_KEY read (L51) and every Retell fetch (create L83, list L93, get L105, update L123, delete L137); no privileged operation is reachable.

**evidence**

- index.ts:5 wildcard CORS
- index.ts:18-20 OPTIONS short-circuit
- index.ts:22-30 unconditional 503 disabled return (status:503 at L28)
- index.ts:32-47 auth block (dead code)
- index.ts:35 401 Missing authorization
- index.ts:41 getUser(token)
- index.ts:44 token !== supabaseServiceKey
- index.ts:45 401 Unauthorized return
- index.ts:51 RETELL_AI_API_KEY read
- index.ts:83,93,105,123,137 Retell API fetches (all unreachable)

**validation**

Read full file (L1-167). Control flow verified: OPTIONS early return L18; then an unconditional Response L22-30 in the serve callback means no statement after L30 executes; no try/catch wraps L22. All privileged code (Retell fetches, service-role key read) confirmed after the early return.

**open_questions**

- Is Supabase platform-level verify_jwt/JWT enforcement enabled for this function (could reject anon before code runs)?
- Is the L22-30 503 stub an intentional kill-switch or a regression masking a previously exploitable path (git history not inspected)?

**edge_cases_considered**

- OPTIONS/preflight path returns 200 with corsHeaders (L18-20) but no protected action
- No Authorization header -> would hit 401 L35 if reachable (it is not)
- Service-role bearer caller -> would pass L44 if reachable (it is not)
- All 5 actions (create/list/get/update/delete) unreachable

**what_i_did_not_check**

- Whether Supabase platform-level verify_jwt is enabled (would change anon_reachable at the network layer)
- Git history to confirm the 503 stub is intentional vs regression
- Other edge functions in the repo for the same pattern (scope was this one file)
- Timing-safety of the L44 !== service-role comparison (moot while unreachable)

**confidence**: high