# sr::billing-credit::phone-number-purchasing

- status: completed
- tldr: phone-number-purchasing: service-role client, 503-disabled (dead code below gate), caller identity = JWT user.id (VERIFIED, no cross-org charge).

AUDIT DONE: supabase/functions/phone-number-purchasing/index.ts (C:/Users/charl/dial-smart-system). RESULT: uses-service-role=YES (L48 env, L57 createClient service-role); disabled=YES (unconditional 503 return L36-44, disabled:true L38, status:503 L42 -- sits before try so L46-489 is unreachable dead code); caller-verified=VERIFIED via JWT (L59-68 Authorization + auth.getUser(token) L65 -> 401 if no user; charged identity = server-derived user.id at L103/227/325/387/458). Body schema L24-29 has NO user/org field and total_cost is server-computed L108, so an arbitrary caller CANNOT charge/spend against another org. Caveat: no entitlement/credit/role check -- any authenticated user can spend (max $299/order) but only on their own user_id. VERDICT: VERIFIED (not SERVICE-ONLY-TRUST, not UNVERIFIED-CLIENT-ORG).

## Artifact

**Findings**

AUDIT supabase/functions/phone-number-purchasing/index.ts (489 lines).

(1) SERVICE ROLE: YES. FACT - line 48 `const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');`; line 57 `const supabaseClient = createClient(supabaseUrl, serviceRoleKey);` -> full service-role client (bypasses RLS). No secret values printed.

(2) HARDCODED DISABLE GATE + 503: YES. FACT - lines 36-44 return an unconditional Response with `disabled: true` (l.38), `error_code: 'PROVIDER_ADMIN_NOT_CERTIFIED'` (l.39), and `status: 503` (l.42), BEFORE any auth or purchase logic. This `return` sits outside the try block, so ALL code from line 46 to the end (the entire purchase path) is UNREACHABLE dead code as deployed. FACT.

(3) CALLER VERIFICATION / WHO IS CHARGED: The charged identity is derived from a VERIFIED JWT, NOT from client-supplied body/query.
  - FACT l.59-68: reads `Authorization` header, strips Bearer, calls `supabaseClient.auth.getUser(token)` (l.65); rejects 401 if `!user` (l.66-68).
  - FACT l.103: order insert uses `user_id: user.id` (server-derived from JWT).
  - FACT l.227, l.325, l.387: purchased `phone_numbers` rows use `user_id: user.id` from JWT.
  - FACT l.458: GET order history scoped `.eq('user_id', user.id)`.
  - FACT: PurchaseRequestSchema (l.24-29) contains ONLY `areaCode`, `quantity`, `provider`, `purpose` -- there is NO user_id/org_id/tenant field, so a caller cannot name another org/tenant. No body/query field feeds the charged identity.
  - FACT: total_cost computed server-side l.108 (`quantity * 2.99`), not client-supplied.

VERDICT: **VERIFIED** (JWT-derived identity), with a caveat: no entitlement/role/credit check -- ANY authenticated user can trigger spend (max 100 numbers x $2.99 = $299/order per lane) but only against their OWN user_id. Cross-org charge by an arbitrary caller is NOT possible via this function. Note the entire path is currently 503-disabled (unreachable), so no spend can occur as deployed.

Deliverable line: supabase/functions/phone-number-purchasing/index.ts L48/L57 | uses-service-role=YES | disabled=YES(L36-44,503@L42) | caller-verified=JWT L59-68,L65,L103 | evidence L65 getUser(token) + L103 user_id:user.id.

**evidence**

- supabase/functions/phone-number-purchasing/index.ts:48 - Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
- supabase/functions/phone-number-purchasing/index.ts:57 - createClient(supabaseUrl, serviceRoleKey)
- supabase/functions/phone-number-purchasing/index.ts:36-44 - unconditional return, disabled:true (l.38), 503 (l.42)
- supabase/functions/phone-number-purchasing/index.ts:59-68 - Authorization header + auth.getUser(token) (l.65), 401 if !user
- supabase/functions/phone-number-purchasing/index.ts:24-29 - zod schema has no user/org field
- supabase/functions/phone-number-purchasing/index.ts:103,227,325,387,458 - user_id from JWT user.id
- supabase/functions/phone-number-purchasing/index.ts:108 - total_cost = quantity*2.99 server-side

**validation**

Read the complete file (489 lines) top to bottom; no unread regions. Cross-checked every write to number_orders/phone_numbers for the identity source; all use user.id from JWT (l.103/227/325/387/l.458). Confirmed by inspection that the disable gate (l.36) precedes the try (l.46) making the rest unreachable. No execution (read-only audit); no secrets printed.

**open_questions**

- Does an org/tenant layer exist elsewhere (RLS on number_orders/phone_numbers, or a separate org table) that maps user.id -> org and enforces credit/entitlement before spend? Not audited here.
- No credit/balance check exists in this function before calling Twilio/Telnyx/Retell; is spend gated by a DB trigger, RLS, or a separate wrapper?
- Does auth.getUser(token) via the SERVICE-ROLE client behave identically to an anon-key client for token validation (both validate against GoTrue)?

**what_i_did_not_check**

- RLS policies and schema for number_orders / phone_numbers (whether a user could read/write other tenants via DB layer).
- The caller UI / API wrapper that invokes this function (rate limits, credit pre-check).
- Whether any OTHER function or route (e.g. a number-order worker) can re-enable / bypass the 503 gate.
- Provider-side spend caps (Twilio/Telnyx/Retell account limits).
- History/version control of this file to see when the 503 gate was added.

**confidence**: high