# sr::billing-credit::budget-tracker

- status: completed
- tldr: budget-tracker: service-role YES, disabled YES (stub-false -> 503), caller VERIFIED via JWT (user.id), user-scoped not org-scoped

AUDIT COMPLETE: supabase/functions/budget-tracker/index.ts | uses-service-role=YES (index.ts:47 read, :56 createClient service role) | disabled=YES (index.ts:21-23 stub returns false, :33-43 hard 503 PROVIDER_BUDGET_TRACKING_NOT_TENANT_CERTIFIED, all handlers 73-94 unreachable) | caller-verified=VERIFIED(JWT) (index.ts:58 Authorization header, :63-65 auth.getUser, :66-68 throw, handlers get user.id 75-90; no client-supplied org). Verdict: VERIFIED-JWT, user-scoped (not org-scoped); provider creds from global Deno.env :121-122 :140 = the cross-tenant hazard the gate cites.

## Artifact

**Findings**

AUDIT: supabase/functions/budget-tracker/index.ts (546 lines, read in full). (1) USES SERVICE ROLE: YES. Line 47 reads Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'); line 56 createClient(supabaseUrl, supabaseServiceKey) constructs a service-role client with no auth-passthrough options. This client is used for ALL DB ops AND for auth.getUser. (2) HARDCODED DISABLE GATE + 503: YES. Lines 21-23 stubbed function isProviderBudgetTrackingTenantCertified() unconditionally returns false. Lines 33-43: if (!isProviderBudgetTrackingTenantCertified()) returns HTTP 503 JSON {success:false, disabled:true, error_code:'PROVIDER_BUDGET_TRACKING_NOT_TENANT_CERTIFIED'}. Gate sits AFTER the OPTIONS preflight (26-28) and BEFORE the try block (45), so it short-circuits every real request. All action handlers (fetch_usage/get_spending_summary/check_budget/update_budget_settings/acknowledge_alert/toggle_pause, lines 73-94) are therefore unreachable in production. (3) CALLER VERIFICATION: VERIFIED (JWT). Line 58 reads the Authorization header only; lines 59-61 throw if absent; lines 63-65 verify the token via supabase.auth.getUser(authHeader.replace('Bearer ','')) and lines 66-68 throw 'Unauthorized' if authError or no user. Every handler receives user.id (lines 75-90), NOT any client-supplied org/user id from the request body. So identity is JWT-verified, not client-supplied. CAVEAT: scope is user-level (user_id), never organization-level; and provider credentials are read from GLOBAL Deno.env (TWILIO_ACCOUNT_SID/AUTH_TOKEN lines 121-122, RETELL_AI_API_KEY line 140), which is exactly the cross-tenant attribution hazard the disable gate cites (lines 30-32). All DB writes are keyed by user_id and (for updates) also filtered by .eq('user_id', userId) (e.g. 509, 531, 539), so no IDOR within the gate's intent.

**evidence**

- C:/Users/charl/dial-smart-system/supabase/functions/budget-tracker/index.ts:47 — Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
- index.ts:56 — createClient(supabaseUrl, supabaseServiceKey)
- index.ts:21-23 — isProviderBudgetTrackingTenantCertified() returns false
- index.ts:33-43 — if (!certified) return new Response(..., { status: 503 })
- index.ts:58 — const authHeader = req.headers.get('Authorization')
- index.ts:63-65 — supabase.auth.getUser(authHeader.replace('Bearer ',''))
- index.ts:66-68 — throw 'Unauthorized' if authError || !user
- index.ts:75-90 — handlers called with user.id
- index.ts:121-122,140 — provider creds from global Deno.env

**validation**

Read complete file (1-546) via read tool; confirmed no second budget-tracker variant via file find (single match). Confirmed gate ordering by line order (preflight 26-28 -> gate 33-43 -> try 45). Confirmed all user_id derivations trace to auth.getUser result at 63-65. No secrets printed (env var names only).

**open_questions**

- Is isProviderBudgetTrackingTenantCertified() intended to become true behind a real org-scoped reconciliation check, or is this route meant to be permanently retired (candidates for deletion to reduce attack surface)?
- spending_summaries/budget_settings/budget_alerts RLS posture: the file relies on the service-role client, which bypasses RLS; confirm those tables have RLS enabled so no other path leaks cross-user rows.
- Do any OTHER edge functions still call this route expecting 200, so a hard 503 breaks a live caller?

**what_i_did_not_check**

- Runtime/interpreter behavior of supabase.auth.getUser with a service-role client (theoretically valid; not executed).
- RLS policies on budget_settings, spending_summaries, budget_alerts, user_credentials, campaigns tables (outside this file).
- Whether any client frontend or cron invokes this function and how it handles the 503.
- git history/blame to confirm when the gate was added and whether an enabled version existed.
- Sibling billing/credit edge functions for the same pattern (only this node's file audited).

**confidence**: high