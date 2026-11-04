# ce-anon-true-authC-telnyx-insights

- status: completed
- tldr: telnyx-insights: CORS *@L20; auth getUser@L73 rejects 401@L74-78; anon blocked by 503 kill-switch@L53.

telnyx-insights (supabase/functions/telnyx-insights/index.ts): CORS wildcard '*' @L20; in-function auth present @L65-78; auth_kind=getUser @L73; rejects on failure with 401 @L74-78; anon_reachable=partial (always-503 kill-switch @L53-58 precedes auth, so anon never reaches business logic); priv_side_effect=none currently reachable, service-role client @L62-63 does user-scoped DB ops only. Row: FUNC | cors_wildcard=yes@20 | in_func_auth=yes@65-78 | auth_kind=getUser@73 | auth_rejects_on_failure=yes@74-78 | anon_reachable=partial@53 | priv_side_effect=none-currently@53 | note="if (!isTelnyxInsightsTenantCertified()) { return ...status:503... }" L53-58 preceded by isTelnyxInsightsTenantCertified()=>false L44-46; auth guard "if (authError || !user) { return ...status:401... }" L74-78.

## Artifact

**Findings**

TELNYX-INSIGHTS (supabase/functions/telnyx-insights/index.ts, 264 lines, Deno serve). (1) CORS: Access-Control-Allow-Origin is the wildcard '*' at L20 (corsHeaders const L19-22), applied to every response incl. OPTIONS L49-51 and all error paths. (2) In-function auth: YES, L65-78. (3) auth_kind = getUser (supabaseAdmin.auth.getUser(token) at L73), token parsed from Authorization header via authHeader.replace('Bearer ','') at L72; missing header short-circuits 401 at L66-70. (4) Rejects on failure: YES, L74-78 returns status 401 with body {'error':'Authentication failed'} when authError || !user. (5) anon_reachable = partial/effectively-no: a hard kill-switch runs BEFORE auth. isTelnyxInsightsTenantCertified() is hardcoded to return false (L44-46), and L53-58 returns status 503 {disabled:true, error_code:'TELNYX_INSIGHTS_NOT_TENANT_CERTIFIED'} for ALL callers including unauthenticated ones. So anon never reaches the auth block or any action; the function returns 503 unconditionally today. (6) priv_side_effect = none currently reachable (all actions are behind the always-true 503 guard). If the kill-switch were flipped, the handler uses a service-role client (SUPABASE_SERVICE_ROLE_KEY, L62-63) and performs user-scoped writes/deletes on telnyx_insight_templates and reads on telnyx_conversation_insights, every query filtered by .eq('user_id', userId) (L118, L136, L223, L242) except delete_template which filters id+user_id (L134-136). No cross-tenant/unsafe-privilege path observed.

**evidence**

- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-insights/index.ts:19-22 corsHeaders with 'Access-Control-Allow-Origin': '*'
- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-insights/index.ts:44-46 isTelnyxInsightsTenantCertified() returns false
- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-insights/index.ts:53-58 kill-switch returns 503 before any auth
- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-insights/index.ts:65-70 missing Authorization -> 401
- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-insights/index.ts:72-73 token parsed, supabaseAdmin.auth.getUser(token)
- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-insights/index.ts:74-78 authError || !user -> 401 'Authentication failed'
- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-insights/index.ts:61-63 service-role client from SUPABASE_SERVICE_ROLE_KEY
- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-insights/index.ts:94-136,220-244 user-scoped DB writes/reads keyed on userId

**validation**

Read the entire file (all 264 lines) in one pass. Confirmed: word 'Access-Control-Allow-Origin' appears once (L20) with value '*'. Confirmed exactly one getUser call (L73) and two 401 returns (L67-69, L75-77). Confirmed the 503 kill-switch at L53-58 precedes the auth block at L65, so it is the first substantive statement after the OPTIONS handler. No file writes/commands/APIs executed (research-only honored).

**open_questions**

- Is the deployed version of this function identical to this file (has it been redeployed since the kill-switch was added)? Not verifiable from source alone.
- Does supabase/config.toml set verify_jwt=true or false for telnyx-insights (platform-level JWT gate could add a second auth layer or, if false, make the in-function getUser the sole gate once the kill-switch is lifted)?

**what_i_did_not_check**

- supabase/config.toml verify_jwt setting for this function (platform-level JWT enforcement was not read)
- Deployed/live state vs this source (no API calls permitted in research-only mode)
- Other functions in supabase/functions/ for the same CORS/auth pattern (out of scope for this single node)
- Whether telnyx_insight_templates / telnyx_conversation_insights have RLS policies (service-role bypasses RLS, so not a risk vector, but unverified)

**confidence**: high