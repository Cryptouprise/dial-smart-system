# sr::billing-credit::billing-portal

- status: completed
- tldr: billing-portal/index.ts: service-role YES (L96/116), disabled NO, caller VERIFIED via JWT+membership (L102,118-124)

AUDIT supabase/functions/billing-portal/index.ts done. Deliverable: supabase/functions/billing-portal/index.ts | uses-service-role=YES | disabled=NO | caller-verified=VERIFIED | evidence line: membership gate line 118-124 (.eq user_id,userId .eq organization_id,organizationId .in role owner/admin) after authenticateUser(req, anonClient) at line 102. Service-role client created at line 116 (SUPABASE_SERVICE_ROLE_KEY required line 96). No 503 disable gate exists.

## Artifact

**Findings**

AUDIT supabase/functions/billing-portal/index.ts (203 lines, read in full). (1) uses-service-role = YES. Requires SUPABASE_SERVICE_ROLE_KEY in requireEnvVars (line 96); creates service-role admin client createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY) at line 116; used for organization_users membership lookup (118-124), organizations lookup (133-137), plans lookup (160-164). A separate anon client (line 101) is used only to validate the JWT. (2) disabled = NO. No hardcoded disable gate; no 503 anywhere in the file (grep for 503: zero matches). Gate states present: OPTIONS->ok (82-84), non-POST->405 (85-88). (3) caller-verified = VERIFIED. authenticateUser(req, anonClient) at line 102 extracts the Bearer token from the Authorization header and calls supabase.auth.getUser(token) (_shared/utils.ts:146-159) => server-verified JWT user/userId. organization_id IS a client-supplied body field (parseJSON line 104, requireExplicitOrganizationId line 109) but is NOT trusted alone: the code requires a matching organization_users row for that userId+organizationId with role in (owner, admin) (lines 118-124) and returns NotFoundError otherwise (128-131). So the caller may only act on an org it is a verified owner/admin of. NOT SERVICE-ONLY-TRUST and NOT UNVERIFIED-CLIENT-ORG. Note (THEORY/risk): the email passed to Stripe Checkout (line 186-189) falls back to user.email or org.billing_email, but this only affects the Checkout session's customer_email, not authorization.

**evidence**

- supabase/functions/billing-portal/index.ts:96 requireEnvVars includes SUPABASE_SERVICE_ROLE_KEY
- supabase/functions/billing-portal/index.ts:116 createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
- supabase/functions/billing-portal/index.ts:101-102 anonClient + authenticateUser(req, anonClient)
- supabase/functions/billing-portal/index.ts:104,109 organization_id read from request body
- supabase/functions/billing-portal/index.ts:118-124 membership check .eq(user_id,userId).eq(organization_id,organizationId).in(role,[owner,admin])
- supabase/functions/billing-portal/index.ts:128-131 NotFoundError when no membership
- supabase/functions/_shared/utils.ts:146-159 authenticateUser pulls Bearer token and calls supabase.auth.getUser(token)
- grep '503' in billing-portal/index.ts => 0 matches

**validation**

Read all 203 lines directly; confirmed the anon-vs-service client split and the membership authorization path; confirmed absence of any 503 literal; confirmed authenticateUser JWT verification in _shared/utils.ts.

**open_questions**

- Whether verify_jwt=true is set at deploy for this function (header comment line 19 says default verify_jwt=true, not verifiable from source alone).
- Whether organization_users RLS/role values can be self-inserted by a user (would weaken the membership gate) - out of scope for this file.

**what_i_did_not_check**

- _shared/tenant-context.ts requireExplicitOrganizationId body (only signature/behavior inferred)
- stripe-webhook handle for metadata.organization_id resolution
- deploy config (config.toml / verify_jwt) for this function
- organization_users table RLS and whether membership rows are user-writable

**confidence**: high