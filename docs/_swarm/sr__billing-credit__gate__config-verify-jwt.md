# sr::billing-credit::gate::config-verify-jwt

- status: completed
- tldr: verify_jwt resolved for all 7 functions; anon key defeats it, so it is not an authz gate. ringba verdict holds; 503 gates are the only real spend control.

Resolved verify_jwt for all 7 audited billing-credit functions from C:/Users/charl/dial-smart-system/supabase/config.toml. Values: credit-management/billing-portal/ringba-enrich-proxy = default true (no config entry); stripe-webhook=false (:245); retell-cost-backfill=true (:286); budget-tracker=true (:299); phone-number-purchasing=true (:135). Caveat: anon key is a valid project JWT, so verify_jwt=true is NOT an authz gate. (a) ringba-enrich-proxy verdict unaffected - only the public anon key is needed; no in-function getUser (index.ts:84). (b) Removing the three in-function 503 gates does not restore spend control: budget-tracker/phone-number-purchasing keep an any-authenticated-user getUser (:63/:65), retell-cost-backfill keeps bearer-presence only (:33) i.e. any anon-key holder.

## Artifact

**Findings**

PLATFORM verify_jwt PER AUDITED FUNCTION (source: C:/Users/charl/dial-smart-system/supabase/config.toml; Supabase default for an unlisted function is verify_jwt=true, confirmed by billing-portal's own header 'Deploy with the default verify_jwt = true' at functions/billing-portal/index.ts:19). 1) credit-management: NO [functions.credit-management] entry -> default verify_jwt=true. 2) billing-portal: NO entry -> default true (intentional, per its docstring). 3) ringba-enrich-proxy: NO entry -> default true. 4) stripe-webhook: verify_jwt=false (config.toml:245). 5) retell-cost-backfill: verify_jwt=true (config.toml:286). 6) budget-tracker: verify_jwt=true (config.toml:299). 7) phone-number-purchasing: verify_jwt=true (config.toml:135). CRITICAL CAVEAT: Supabase's verify_jwt gate only asserts a JWT signed by this project is present. The project anon key IS such a JWT (role=anon) and is public (shipped to browsers / present in every @supabase client). So verify_jwt=true is NOT an authorization gate - it only rejects fully credential-less calls; any caller holding the public anon key passes. (a) ringba-enrich-proxy: verify_jwt=true does NOT undermine the 'unauthenticated service-role read' verdict; it merely raises the bar from 'no credential' to 'the public anon key'. The function performs no in-function Authorization/getUser check (functions/ringba-enrich-proxy/index.ts:84 reads SUPABASE_SERVICE_ROLE_KEY and proceeds; only header at :18 is CORS). So any anon-key holder triggers a service-role read. Verdict stands. (b) budget-tracker / phone-number-purchasing / retell-cost-backfill: all three gate with a hard-coded-in-function 503 before any auth (budget-tracker :33 isProviderBudgetTrackingTenantCertified()=false; phone-number-purchasing :36-44 unconditional 503; retell-cost-backfill :20 isRetellCostBackfillCertified()=false). Removing that 503 gate does NOT restore a spend barrier via verify_jwt (anon key passes). After removal: budget-tracker retains an in-function auth.getUser check (:63-68) = any authenticated user, not role-gated; phone-number-purchasing retains auth.getUser (:65-68) = any authenticated user; retell-cost-backfill retains only 'any bearer present' (:33-34, no getUser) = any anon-key holder. So budgeting goes from 'hard 503 for everyone' to 'reachable by any authenticated user, and for retell-cost-backfill by any anon-key holder', i.e. the 503 gate is the only real current control and verify_jwt adds no meaningful protection for any of the three.

**evidence**

- supabase/config.toml:245 [functions.stripe-webhook] verify_jwt = false
- supabase/config.toml:286 [functions.retell-cost-backfill] verify_jwt = true
- supabase/config.toml:299 [functions.budget-tracker] verify_jwt = true
- supabase/config.toml:135 [functions.phone-number-purchasing] verify_jwt = true
- grep 'credit-management|billing-portal|ringba-enrich-proxy' config.toml = 0 function-table matches -> default verify_jwt=true
- supabase/functions/billing-portal/index.ts:18-19 'Deploy with the default verify_jwt = true'
- supabase/functions/ringba-enrich-proxy/index.ts:84 serviceKey read, no getUser check
- supabase/functions/retell-cost-backfill/index.ts:20 503 gate before :33 auth; :33-34 bearer-presence only
- supabase/functions/budget-tracker/index.ts:33 503 gate before :63 getUser
- supabase/functions/phone-number-purchasing/index.ts:36-44 503 before :65 getUser
- function dirs exist for all 7 (supabase/functions listings): billing-portal, budget-tracker, credit-management, phone-number-purchasing, retell-cost-backfill, ringba-enrich-proxy, stripe-webhook

**validation**

Read config.toml via findstr with line numbers (all 7 functions' values captured); confirmed no [functions.*] table for credit-management/billing-portal/ringba-enrich-proxy; read each function's index.ts sections to confirm in-function auth ordering (503 gate vs getUser) with exact line numbers.

**open_questions**

- Do the live-deployed verify_jwt flags equal config.toml? (would require supabase functions list / dashboard check)
- Is there any gateway/WAF in front of the functions that enforces an apikey or rate limit beyond verify_jwt?

**what_i_did_not_check**

- Whether the DEPLOYED function verify_jwt values on project emonjusymdripmkvtttc actually match config.toml (config.toml governs CLI deploys; a manual dashboard deploy could differ). Not verified against the live platform.
- credit-management in-function auth beyond error-code lines (only saw :91-120 header/getUser pattern via grep, not full read of its role/membership logic).
- billing-portal's downstream authorization (authenticateUser at :102) - whether it enforces role beyond presence of a valid user JWT.
- Whether SUPABASE_ANON_KEY is exposed client-side in the dial-smart frontends (assumed public standard Supabase practice; not grepped in this node).

**confidence**: high