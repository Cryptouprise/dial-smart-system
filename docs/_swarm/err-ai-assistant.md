# err-ai-assistant

- status: completed
- tldr: ai-assistant.ts: always 503s (cert guard hardcoded false); inconsistent error shapes; 7 success-on-failure swallows; no Allow-Methods CORS.

DONE: read-only error-handling audit of ai-assistant/index.ts (3008 lines).
RESULT: (1) SUCCESS = 200, body {response, analytics} (+actions_taken|pending_actions). ERROR shapes inconsistent: plain {error} for 400/401/429/500, but {success:false,disabled:true,error_code,error} for the two 503 gates. No {message}/{success} at HTTP top level. (2) 7 true swallows that report success after failure: 1100-1102, 1269-1271 (silent, no log), 2135-2137, 2267-2274, 2315-2318, 2350-2357, 2405-2419. One bare catch 3020-3024. No .catch() anywhere (grep 0). 9 result-ignored awaits. (3) CORS = Allow-Origin:'*' + Allow-Headers, NO Allow-Methods; env fail-fast 500 for LOVABLE/SUPABASE at top level but SUPABASE_URL/SERVICE_ROLE_KEY re-read without null check at 2621-2622/2256-2257/2333-2334.
KEY FACT: isAiAssistantToolSurfaceTenantCertified() is hardcoded false (2878-2880) -> the function always 503s (2891-2900); all tool code + 17 catch blocks are unreachable in production.
VALIDATION: enumerated all 18 catches via Select-String and read each; read entire serve() (2882-3092), helpers, CORS block. Read-only, nothing mutated.
BLOCKERS: none. FOLLOW-UPS: verify client expectations for success/message keys; inspect _shared/tenant-context.ts; decide if the 503 guard is intentional.

## Artifact

**Findings**

ai-assistant/index.ts (3008 lines). KEY GATING FACT: serve() calls isAiAssistantToolSurfaceTenantCertified() (2891) which is hardcoded to return false (2878-2880), so in production the function ALWAYS short-circuits to a 503 before auth, and none of the 6 auth checks, tool code, or its 17 catch blocks are reachable.

(1) HTTP RESPONSE SHAPES. SUCCESS bodies carry NO status (Deno default 200) and NO `success` key: main text path -> {response, analytics} (3082-3085); tool path -> {response, actions_taken, analytics} (3075-3079); confirmation path -> {response, pending_actions, analytics} (3032-3036); OPTIONS preflight -> null body, corsHeaders only (2884). ERROR bodies are INCONSISTENT: plain errors use {error} only -> 401 Unauthorized (2906,2945,2952), 400 Message required (2917), 500 'AI not configured' (2923), 500 'Supabase configuration missing' (2931), 429 'Rate limited' (2988), 500 generic {error: error.message} (3089); the two 'containment' errors use a DIFFERENT shape {success:false, disabled:true, error_code, error} -> 503 (2892-2900) and 503 (3004-3012). {success}/{message} exist ONLY inside executeToolCall return objects (folded into response text/actions_taken), never at HTTP top level.

(2) SWALLOWED FAILURES. No `.catch(` promise handlers exist anywhere (grep: 0). Only one bare empty-ish catch: 3020-3024 `catch { args = {}; }` swallows JSON.parse failure. Catches that continue and still report SUCCESS (TRUE swallows): 1100-1102 (alt-number fetch fails -> console.error, falls through, no rethrow); 1269-1271 (per-lead blast send -> `failCount++` ONLY, no log, error discarded); 2135-2137 (agent list fetch -> console.error, continues); 2267-2274 (voice-broadcast-engine trigger -> console.error, still returns success:true 'now LIVE'); 2315-2318 (retell agent verify -> console.error, continues); 2350-2357 (call-dispatcher trigger -> console.error, still returns success:true 'now ACTIVE'); 2405-2419 (workflow_steps insert error -> console.error only, still returns success:true 'Workflow Created'). Catches that return a graceful {success:false} object (not rethrown, so HTTP stays 200): 964-968, 1023-1027, 1126-1134, 1173-1175, 1360-1363, 1862-1865 (warnings.push), 1886-1889 (warnings.push), 1960-1963, 2656-2659. Main handler catch 3087-3091 logs + returns 500 (correct). Fire-and-forget / result-ignored awaits (no response.ok check or error check): 2259-2266, 2336-2349, 2207 (campaign_leads insert), 2835-2838, 2841-2845, 1345-1354, 1112-1119, 1075-1078, 1129-1132. console.error with no rethrow at 966,1025,1101,1128,1863,1887,1957,2136,2268,2316,2351,2406,2594,2657,2740,2771,3088.

(3) CORS / SECRETS / ENV. corsHeaders (11-14) = {Access-Control-Allow-Origin:'*', Access-Control-Allow-Headers:'authorization, x-client-info, apikey, content-type'}; NO Access-Control-Allow-Methods header. OPTIONS returns null body (2884). Every response spreads ...corsHeaders + Content-Type: application/json. Env read via Deno.env.get: LOVABLE_API_KEY (2921) fail-fast 500 if missing (2923); SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (2927-2928) fail-fast 500 (2931); TWILIO_ACCOUNT_SID/AUTH_TOKEN read at 920-921,972-973,1138-1139,1287-1288,1790-1791,1916-1917 and null-checked per-tool returning {success:false} (975,1141,1290) or guarded by `&&` (1928); RETELL_AI_API_KEY read at 1792,1915,2107,2306 and guarded by `if (retellApiKey)` (1869,2107,2307). MISMATCH: inside buy_phone_numbers (2621-2622) and the two trigger fetches (2256-2257, 2333-2334) SUPABASE_URL/SERVICE_ROLE_KEY are re-read with NO null check, so if unset fetch() hits the literal string 'undefined/...' and throws -> swallowed by the local try (2267/2350) or the buy catch (2656). Secrets are only interpolated into Authorization headers (Bearer ${serviceKey}, Basic btoa(sid:token)); no console.log of secret values found (677 logs toolName+args, 1060 logs phone numbers only).

**evidence**

- 2878-2880 isAiAssistantToolSurfaceTenantCertified() returns false -> always 503 at 2891-2900
- 3082-3085 success {response, analytics} default 200
- 3075-3079 {response, actions_taken, analytics}
- 3032-3036 {response, pending_actions, analytics}
- 2892-2900 & 3004-3012 error shape {success:false,disabled:true,error_code,error} 503
- 2906-2907,2945-2946,2952-2953 {error:'Unauthorized'} 401
- 2917-2918 {error:'Message required'} 400; 2923-2924 {error:'AI not configured'} 500; 2931-2932 {error:'Supabase configuration missing'} 500; 2988 {error:'Rate limited'} 429; 3089-3090 {error:error.message} 500
- 1269-1271 silent swallow: catch { failCount++; } no log
- 2405-2419 stepsError console.error then success:true
- 2267-2274 & 2350-2357 trigger fetch console.error then success:true
- 1100-1102 nested swallow console.error then fallthrough
- 2135-2137 & 2315-2318 console.error then continue
- 3020-3024 catch { args={} }
- 11-14 corsHeaders incl Allow-Origin '*' and Allow-Headers, no Allow-Methods
- 2921-2932 env fail-fast 500 for LOVABLE + SUPABASE
- 2621-2622 & 2256-2257 & 2333-2334 SUPABASE_URL/SERVICE_ROLE_KEY re-read without null check
- grep '.catch(' -> 0 matches

**validation**

Enumerated all 18 'catch' occurrences via Select-String (964,1023,1100,1126,1173,1269,1360,1862,1886,1960,2135,2267,2315,2350,2405,2656,3022,3087) and read each site; read the full serve() handler (2882-3092), all response constructors, corsHeaders (11-14), env reads, and the two helper functions (executeToolCall 670, fetchAnalytics 2858, isAiAssistantToolSurfaceTenantCertified 2878). Confirmed 0 '.catch(' via Select-String. Read-only; no commands mutated anything.

**open_questions**

- Does the frontend read `success`/`message` at HTTP top level? Success bodies do not include them, so a client expecting those keys would misparse.
- Is executing the ~2900 lines of tool code intended to be dead (503 guard) or is the guard a temporary launch gate to be flipped?

**what_i_did_not_check**

- Shared helper ../_shared/tenant-context.ts (authorizeOrganizationContext) error behavior
- Frontend/client consumers of these response shapes (whether they expect success/message)
- ./_shared type-level lint or deno check of the function
- Other edge functions in the repo for the same swallowed-failure pattern
- git history / whether the hardcoded-false certification is recent
- Full tool-schema-to-implementation cross-check (only error paths were inspected, not every tool's happy path)

**confidence**: high