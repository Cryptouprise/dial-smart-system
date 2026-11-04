# ce-anon-true-authB

- status: completed
- tldr: All 8 funcs have getUser guards but they are dead code: unconditional 503 quarantine stubs fire first. 5 would 401, 2 would 500, 1 is best-effort anon.

Analyzed the 8 named edge functions' in-function auth guards. Emitted one pipe row per function (see artifact). Key result: all 8 have an in-function getUser guard BUT every one is UNREACHABLE dead code, because each is launch-quarantined by an unconditional certification stub (`return false`) that returns HTTP 503 before auth. anon_reachable=no for all 8, but the block is the 503 quarantine gate, not the auth guard. verify_jwt=true is set per-function in supabase/config.toml for all 8. Auth-failure behavior: 5 return 401 (enhanced-rotation-manager@53, ml-learning-engine@87, phone-number-purchasing@66, predictive-dialing-engine@54, provider-management@89); 2 throw and the catch returns 500 not 401/403 (enhanced-spam-lookup@68->1045, ghl-integration@104->1220); 1 (pipeline-management) is best-effort auth returning HTTP 200 {success:true,data:[]} to anonymous callers by design (flag false@11, gate 503@19).

## Artifact

**Findings**

All 8 target edge functions in C:/Users/charl/dial-smart-system/supabase/functions/<name>/index.ts contain an in-function getUser auth guard, BUT every one is currently UNREACHABLE dead code because each is launch-quarantined by an unconditional certification stub (return false) that returns HTTP 503 before any auth logic. anon_reachable=no for all 8 - but the reason is the 503 quarantine gate, not the auth guard. verify_jwt=true is set per-function in supabase/config.toml for all 8 (does not block an anon browser holding the public anon key). Auth-failure behavior splits: 4 return 401 (enhanced-rotation-manager, ml-learning-engine, phone-number-purchasing, predictive-dialing-engine, provider-management = 5 actually), 2 throw -> catch returns 500 not 401/403 (enhanced-spam-lookup, ghl-integration), 1 (pipeline-management) is best-effort auth that returns HTTP 200 {success:true,data:[]} for anonymous callers by design.

ROWS:
enhanced-rotation-manager | cors_wildcard=yes@7 | in_func_auth=yes@51 | auth_kind=getUser | auth_rejects_on_failure=yes@53 | anon_reachable=no@28 | priv_side_effect=number-pool rotation settings + provider mutations (dead code) | note="if (!user) { return new Response('Unauthorized', { status: 401, headers: corsHeaders }); }" @52-54; gate "if (!isEnhancedRotationTenantCertified()) {...status:503}" @28, flag "return false" @20
enhanced-spam-lookup | cors_wildcard=yes@6 | in_func_auth=yes@67 | auth_kind=getUser | auth_rejects_on_failure=no@68 | anon_reachable=no@33 | priv_side_effect=Telnyx/Twilio spam + TrustHub profile ops, provider spend (dead code) | note="if (authError || !user) throw new Error('Authentication required');" @68 -> catch returns status:500 @1045, NOT 401/403; gate 503 @33, flag false@25
ghl-integration | cors_wildcard=yes@7 | in_func_auth=yes@102 | auth_kind=getUser | auth_rejects_on_failure=no@104 | anon_reachable=no@75 | priv_side_effect=GHL contacts/opportunities/pipelines writes + stored API-key use (dead code) | note="if (!user) { throw new Error('Unauthorized'); }" @103-105 -> catch returns status:500 @1220, NOT 401/403; gate 503 @75-84, flag false@64
ml-learning-engine | cors_wildcard=yes@5 | in_func_auth=yes@85 | auth_kind=getUser | auth_rejects_on_failure=yes@87 | anon_reachable=no@59 | priv_side_effect=writes training/learning data + generates insights (dead code) | note="if (authError || !user) { return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, ... }); }" @87-92; gate 503 @59-63, flag false@51
phone-number-purchasing | cors_wildcard=yes@7 | in_func_auth=yes@65 | auth_kind=getUser | auth_rejects_on_failure=yes@66 | anon_reachable=no@36 | priv_side_effect=provider number search + purchase (real money spend) (dead code) | note="if (!user) { return new Response('Unauthorized', { status: 401, ... }); }" @66-68 but UNREACHABLE: unconditional stub returns status:503 @36-44 before try, no flag function at all
pipeline-management | cors_wildcard=yes@6 | in_func_auth=yes@43 | auth_kind=getUser | auth_rejects_on_failure=no@54 | anon_reachable=no@19 | priv_side_effect=disposition/stage/lead mutations (dead code) | note=auth best-effort by design: "if (!authError && authUser) { user = authUser; }" @44, then "if (!user) { return JSON(200 {success:true,data:[]}) }" @54-65 (graceful anon, no 401); gate 503 @19-24, flag false@11
predictive-dialing-engine | cors_wildcard=yes@6 | in_func_auth=yes@52 | auth_kind=getUser | auth_rejects_on_failure=yes@54 | anon_reachable=no@24 | priv_side_effect=campaign start/stop + dialing-queue dispatch/pacing (dead code) | note="if (authError || !user) { return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, ... }); }" @54-59; gate 503 @24-29, flag false@16
provider-management | cors_wildcard=yes@19 | in_func_auth=yes@87 | auth_kind=getUser | auth_rejects_on_failure=yes@89 | anon_reachable=no@58 | priv_side_effect=provider configs incl. API keys + number import (dead code) | note="if (authError || !user) { return new Response(JSON.stringify({ error: 'Authentication failed' }), { status: 401, ... }); }" @89-94; gate 503 @58-63, flag false@49

**evidence**

- supabase/config.toml:95 verify_jwt = true [functions.enhanced-spam-lookup]
- supabase/config.toml:104 verify_jwt = true [functions.enhanced-rotation-manager]
- supabase/config.toml:132 verify_jwt = true [functions.predictive-dialing-engine]
- supabase/config.toml:135 verify_jwt = true [functions.phone-number-purchasing]
- supabase/config.toml:140 verify_jwt = true [functions.ghl-integration]
- supabase/config.toml:158 verify_jwt = true [functions.provider-management]
- supabase/config.toml:163 verify_jwt = true [functions.pipeline-management]
- supabase/config.toml:344 verify_jwt = true [functions.ml-learning-engine]
- enhanced-rotation-manager/index.ts:7 'Access-Control-Allow-Origin': '*' ; :20 return false ; :28 503 gate ; :51 getUser ; :52-54 if (!user) 401
- enhanced-spam-lookup/index.ts:6 cors * ; :25 return false ; :33 503 gate ; :67 getUser ; :68 throw ; :1044-1047 catch status 500
- ghl-integration/index.ts:7 cors * ; :64 return false ; :75 503 gate ; :102 getUser ; :104 throw ; :1219-1222 catch status 500
- ml-learning-engine/index.ts:5 cors * ; :51 return false ; :59 503 gate ; :85 getUser ; :87-91 401
- phone-number-purchasing/index.ts:7 cors * ; :36-44 unconditional 503 ; :59-62 authHeader 401 ; :65 getUser ; :66-68 401
- pipeline-management/index.ts:6 cors * ; :11 return false ; :19 503 gate ; :43 getUser ; :44 best-effort ; :54-65 200 graceful anon
- predictive-dialing-engine/index.ts:6 cors * ; :16 return false ; :24 503 gate ; :52 getUser ; :54-58 401
- provider-management/index.ts:19 cors * ; :49 return false ; :58 503 gate ; :67-72 401 missing header ; :87 getUser ; :89-93 401

**validation**

Read source with PowerShell line-numbered output and the read tool for each of the 8 index.ts files: top-of-file gate, ~50 lines around each getUser call, and the catch/tail block. Cross-checked verify_jwt per function against supabase/config.toml with findstr. Confirmed each certification stub body is literally 'return false' (enhanced-rotation-manager:20, enhanced-spam-lookup:25, ghl-integration:64, ml-learning-engine:51, pipeline-management:11, predictive-dialing-engine:16, provider-management:49) and phone-number-purchasing has no flag at all (unconditional 503). No function was executed; this is static source analysis only (research-only mandate).

**open_questions**

- Is the repo state identical to the deployed functions on the live Supabase project (emonjusymdripmkvtttc)? Static analysis here describes the repo, not necessarily production.
- When a stub is flipped to true, does the getUser(anonKey) path actually 401? The public anon key is a validly-signed JWT but typically lacks a 'sub' claim, so /auth/v1/user should error -> the guard would fire. Not empirically verified.

**what_i_did_not_check**

- Whether repo files match the currently DEPLOYED function versions on Supabase (no live API call made).
- All other ~100 functions in the directory - only the 8 named were analyzed.
- The _shared/tenant-context.ts authorizeOrganizationContext() downstream of getUser - a post-auth authorization gap there is out of this node's scope.
- Whether any client-side/browser code actually calls these functions with the anon key in a way that mattered before quarantine.
- Runtime behavior of the 503 stubs (assumed reachable since they precede auth, but not executed).
- CORS preflight responses (OPTIONS returns null body with corsHeaders) - not assessed for preflight-bypass concerns.

**confidence**: high