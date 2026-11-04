# ce-anon-true-authC-telnyx-outbound-ai

- status: completed
- tldr: telnyx-outbound-ai: wildcard CORS yes@25, in-func auth yes@94-122, getUser+service-role, 401 on failure@116-119, anon unreachable, make_call disabled 503

telnyx-outbound-ai | cors_wildcard=yes@25 | in_func_auth=yes@94-122 | auth_kind=getUser+service-role-bearer@103-122 | auth_rejects_on_failure=yes@116-119 ("if (authError || !user) { return new Response(JSON.stringify({ error: 'Authentication failed' }), { status: 401, headers: {...corsHeaders} }); }") | anon_reachable=no (no/missing bearer -> 401@97; anon-key -> getUser fails -> 401@117; only OPTIONS@85-87 is unauthenticated) | priv_side_effect=none-for-anon; auth'd only: get_call reads own-org call_logs@361-389, end_call Telnyx hangup on owned call@394-417, health_check@422-431; make_call dial+credit path DISABLED 503@133-143 | note=guard: "if (!authHeader) return 401 'Missing authorization' (:96-100); if (authError || !user) return 401 'Authentication failed' (:116-119)"

## Artifact

**Findings**

telnyx-outbound-ai edge function has WILDCARD CORS (Access-Control-Allow-Origin: '*' at index.ts:25) and IN-FUNCTION auth with a dual path. auth_kind = getUser (supabaseAdmin.auth.getUser(token) at :115) for normal bearers, PLUS a service-role-bearer bypass branch (:103 token===serviceRoleKey, :106-113) that trusts a caller-supplied body.userId. Missing Authorization header -> 401 (:96-100). getUser error/!user -> returns 401 'Authentication failed' (:116-119). anon not reachable: an unauthenticated or anon-key bearer hits 401 at :97 or :117; only OPTIONS preflight (:85-87) is served without auth. Privileged side effects are auth-gated: make_call (the dial + credit-reserve path) is DISABLED early, returning 503 TELNYX_OUTBOUND_EGRESS_NOT_CERTIFIED at :133-143 before any provider/billing effect; reachable auth'd actions are get_call (reads own call_logs, :361-389), end_call (Telnyx hangup on owned call, :394-417) and health_check (:422-431). resolveExactOrganization (:31-53) enforces exact org membership for non-health actions.

**evidence**

- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-outbound-ai/index.ts:25 (Access-Control-Allow-Origin: '*')
- index.ts:85-87 (OPTIONS preflight, unauthenticated)
- index.ts:95-100 (missing Authorization -> 401)
- index.ts:103-113 (service-role-bearer branch; body.userId trusted; 400 if absent)
- index.ts:115-119 (getUser; authError || !user -> 401 'Authentication failed')
- index.ts:31-53 (resolveExactOrganization, org membership enforcement)
- index.ts:133-143 (make_call disabled, 503 before side effects)
- index.ts:361-389 (get_call reads own-org call_logs)
- index.ts:394-417 (end_call Telnyx hangup on owned call)
- index.ts:422-431 (health_check)

**validation**

Read full file 447 lines; confirmed line numbers for CORS, header guard, getUser branch, 401 returns, 503 disable, and each reachable action.

**open_questions**

- Does the platform-level Supabase config (config.toml verify_jwt) impose an additional JWT gate before this function is invoked? Not checked here.
- Any other caller that passes the service role key to this function legitimately (internal crons)?

**edge_cases_considered**

- anon key passed as bearer -> getUser fails -> 401
- service role key holder can impersonate any userId via body.userId (by design, but a key-leak risk)
- make_call billing/credit-reserve code unreachable due to early 503 guard
- OPTIONS returns 200 with no auth but no privileged logic runs

**what_i_did_not_check**

- supabase/config.toml verify_jwt setting for this function
- callers of telnyx-outbound-ai elsewhere in the repo (who supplies service role key)
- telnyx-webhook function referenced at :292/:312
- RLS policies on call_logs/telnyx_assistants/phone_numbers (defense-in-depth behind service-role queries)

**confidence**: high