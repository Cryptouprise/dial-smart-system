# sr::billing-credit::credit-management

- status: completed
- tldr: credit-management/index.ts: service-role client, no 503 (403/500 only), caller-org VERIFIED (membership-scoped, cannot spoof).

AUDIT supabase/functions/credit-management/index.ts | uses-service-role=YES | disabled=NO-503 | caller-verified=VERIFIED. (1) Service role: index.ts:101 reads SUPABASE_SERVICE_ROLE_KEY, :107 createClient with it. (2) No 503 anywhere in this file; error status is only 403/500 at :755. Hardcoded launch-disable gates exist but return 200 launch_disabled:true (:573-577) or throw (:184-188 shared). (3) VERIFIED: isServiceRole = token===serviceKey (:111); userId from auth.getUser (:116,123); helper getOrganizationId (:767-797) scopes browser callers to organization_users membership filtered by user_id + requested org, throwing 'Forbidden' when data.length!==1 (:791-794). A browser JWT cannot name an arbitrary org. Mutating actions reserve/finalize/add also gated by assertServiceControlledCreditAction (:300,:347,:409). Deliverable: path:line | uses-service-role | disabled | caller-verified | evidence — credit-management/index.ts:107,111,767-797.

## Artifact

**Findings**

AUDIT: supabase/functions/credit-management/index.ts (818 lines).
(1) USES-SERVICE-ROLE: YES. FACT: index.ts:101 `const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');` and index.ts:107 `const supabase = createClient(supabaseUrl, supabaseServiceKey);` (service-role client). Model B (privileged edge fn).
(2) DISABLED GATE + 503: NO 503 in this file (FACT: grep for '503' scoped to this file = 0 matches; full read 1-818 shows none). The transition error path returns only 403 (CreditAuthorizationError) or 500 (index.ts:755 `const status = error instanceof CreditAuthorizationError ? 403 : 500;`). There ARE hardcoded launch-disable gates but they do NOT return 503: (a) check_auto_recharge returns HTTP 200 with `launch_disabled: true` (index.ts:573-577); (b) _shared/credit-purchase-policy.ts:184-188 throws 'Auto-recharge is launch-disabled...' when auto_recharge_enabled:true is passed to update_settings (surfaces as 500).
(3) CALLER-VERIFIED = VERIFIED. A normal browser JWT naming an ARBITRARY body.organization_id CANNOT be accepted. Path: authHeader (index.ts:91) -> token = authHeader.replace('Bearer ','') (110) -> isServiceRole = token === supabaseServiceKey (111) -> if NOT service role, userId = (await supabase.auth.getUser(token)).data.user.id (116,123). Helper getOrganizationId (index.ts:767-797): if isServiceRole -> requires requestedOrganizationId and RETURNS IT VERBATIM (773-778) [service-only-trust branch, gated on the secret eq compare at 111]; else -> membershipQuery on organization_users filtered .eq('user_id', userId) (781-784) AND, when requestedOrganizationId is present, .eq('organization_id', requestedOrganizationId) (785-787); .limit(2) (789); `if (data?.length !== 1)` throw — requested-org case throws 'Forbidden: user is not a member of the requested organization' (791-794). So a browser JWT can only ever resolve an org the verified user is actually a member of; a non-member arbitrary org yields 0 rows and throws. Org is derived server-side from the verified user's membership and cannot be spoofed by a browser caller. All 12 call sites (170,226,247,301,348,410,453,499,569,585,653,702) pass (supabase,userId,body.organization_id,isServiceRole) and reuse this same guard. The two most dangerous mutating actions (reserve_credits:300, finalize_cost:347, add_credits:409) additionally call assertServiceControlledCreditAction(action,isServiceRole) which throws CreditAuthorizationError when !isServiceRole (_shared/credit-purchase-policy.ts:133-142), so browser JWTs cannot reserve/finalize/mint even for their own org.

**evidence**

- supabase/functions/credit-management/index.ts:101 (SUPABASE_SERVICE_ROLE_KEY read)
- supabase/functions/credit-management/index.ts:107 (createClient service-role)
- supabase/functions/credit-management/index.ts:111 (isServiceRole = token === supabaseServiceKey)
- supabase/functions/credit-management/index.ts:116,123 (userId from auth.getUser)
- supabase/functions/credit-management/index.ts:767-797 (getOrganizationId helper)
- supabase/functions/credit-management/index.ts:773-778 (service-role branch returns requested org verbatim)
- supabase/functions/credit-management/index.ts:781-796 (membership-scoped query; length!==1 throws Forbidden)
- supabase/functions/credit-management/index.ts:755 (only 403/500 status; no 503)
- supabase/functions/credit-management/index.ts:573-577 (check_auto_recharge launch_disabled, HTTP 200)
- supabase/functions/credit-management/index.ts:300,347,409 (assertServiceControlledCreditAction gates)
- supabase/functions/_shared/credit-purchase-policy.ts:133-142 (assertServiceControlledCreditAction throws when !isServiceRole)
- supabase/functions/_shared/credit-purchase-policy.ts:184-188 (auto-recharge enable throw)
- supabase/functions/credit-management/index.ts:170,226,247,301,348,410,453,499,569,585,653,702 (all getOrganizationId call sites)

**validation**

Read full file (1-818) plus _shared/credit-purchase-policy.ts. Scoped grep for literal '503' in this file returned 0 matches; dir-wide grep confirmed 503 appears in many OTHER functions but not this one. Enumerated all 12 getOrganizationId call sites by reading every switch-case body. Traced helper boolean logic line-by-line. No code executed (read-only audit); no secrets printed.

**open_questions**

- Does any OTHER edge function share this credit-management auth model, or do some call it with a browser JWT and pass body.organization_id expecting service behavior? (out of scope for this node)
- Is the RPC layer (check_credit_balance/reserve_credits/add_credits/finalize_call_cost) additionally RLS-guarded, or does it rely solely on this function's org resolution? (RPC definitions not in this file)

**what_i_did_not_check**

- The Postgres RPC bodies (reserve_credits/add_credits/finalize_call_cost/check_credit_balance) and whether they re-validate org authorization internally.
- organization_users table RLS and whether a browser JWT could read/modify membership rows to alter the membership lookup result.
- The Stripe webhook path (resolvePaidCheckoutSession/resolveSucceededAutoRecharge consumers) outside this file.
- Whether supabaseServiceKey (env) is ever exposed to the browser bundle (would break the isServiceRole compare at line 111).

**confidence**: high