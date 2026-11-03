# err-coach-suggest

- status: completed
- tldr: coach-suggest err review: {proposals,error} only (no message/success); 6 swallowed failures; env handled, secret in lithos.ts

DONE: Static error-handling review of supabase/functions/coach-suggest/index.ts (491 lines, read-only).

TOUCHED: none (read only).

EVIDENCE: full-file read L1-491; all json() call sites (L78,85,93,96,103,111,121,122,135,147,191,205,245,286,289); catch blocks L99-106, L109, L242-246, L287-290; ignore-error reads L155, L197; console.warn-only L219, L284; corsHeaders L21-24; env reads L81-85.

RESULT:
(1) Shapes - success 200: normal {proposals, batch_id, through_seq} (L286); cached {proposals, batch_id, through_seq, cached:true} (L205); 200-WITH-error for no-transcript {proposals:[],error,through_seq} (L191) and LLM failure {proposals:[],error,through_seq} (L245). Errors: 405/500/401/401/429/400/404/409/403/403/500 with body {proposals:[], error:<string>}. Body keys are ONLY 'proposals' + 'error'; there is NO 'message' and NO 'success' key anywhere.
(2) Swallowed failures - req.json().catch(()=>({})) L109; dedupe SELECT ignores error L197-203; campaign SELECT ignores error L155-161; corrections RPC console.warn no rethrow L219; expire UPDATE console.warn no rethrow L284; LLM catch returns 200 L242-246. All other awaited supabase reads that capture error rethrow (L120,134,146,171,172,185,274). Rate-limit catch rethrows non-RateLimitError (L105).
(3) CORS/env - corsHeaders constant L21-24 (wildcard origin, no Allow-Methods/Max-Age), spread into every json() L296-299, OPTIONS returns null body L77. Env vars SUPABASE_URL/SERVICE_ROLE_KEY/ANON_KEY read L81-83 with explicit 500 on mismatch L84-85; LLM secret lives in _shared/lithos.ts, not here.

COULD_NOT: not evaluated - lithos.ts/utils.ts internals, client parsing, runtime behavior.

CONFIDENCE: high.

## Artifact

**Findings**

RESPONSE SHAPE (FACT): Every response body is built by json() at L295-300 and ALWAYS carries a {proposals} key plus, on degraded/error paths, an {error} string. There is NO {message} key and NO {success} boolean anywhere in the file. OPTIONS returns a null body (L77).

SUCCESS shapes (FACT): (a) normal -> 200 {proposals: inserted ?? [], batch_id, through_seq} (L286); (b) dedupe cache hit -> 200 {proposals: existing, batch_id, through_seq, cached: true} (L205); (c) no-final-transcript -> 200 {proposals: [], error: 'No final transcript lines yet', through_seq} (L191) i.e. status 200 carrying an error key; (d) LLM failure -> 200 {proposals: [], error: message, through_seq} (L245) also 200-with-error, by design per header comment L12.

ERROR shapes (FACT): 405 {proposals:[], error:'POST only'} (L78); 500 {proposals:[], error:'Supabase configuration missing'} (L85); 401 {proposals:[], error:'Missing authorization'} (L93); 401 {proposals:[], error:'Unauthorized'} (L96); 429 {proposals:[], error:'Too many coach requests; slow down'} (L103); 400 {proposals:[], error:'call_log_id (uuid) is required'} (L111); 404 'Call log not found' (L121); 409 'Call log has no organization' (L122); 403 'Not a member of this organization' (L135); 403 'Lead is not in this organization' (L147); catch-all 500 {proposals:[], error: err.message|'Unknown error'} (L289). All error bodies use the key 'error' (never 'message'), and none include 'success'.

SWALLOWED FAILURES (FACT): (1) L109 `await req.json().catch(() => ({}))` swallows the body-parse rejection and coerces to {} (then 400 at L111) - an ignored promise rejection. (2) L197-203 dedupe SELECT ignores its error entirely: only `data` is destructured, no `error`; on query failure existing is null and the code silently proceeds to pay for a fresh LLM call. (3) L155-161 campaign/script SELECT also destructures only `data` (const { data: campaignRow }); error ignored, script silently null. (4) L219 console.warn on coach_recent_corrections RPC error, then no rethrow (corrections degrade to []); loop continues. (5) L284 console.warn on expireErr for the supersede UPDATE, no rethrow; still returns 200. (6) L242-246 LLM catch logs console.error then returns 200 (intentional/documented at L12, but converts a failure into success at the HTTP layer).

NO other swallow patterns (FACT): every other supabase await that destructures error either throws (L120, L134, L146, L171, L172, L185, L274). No `.catch(()=>{})` fire-and-forget and no un-awaited promises other than checkRateLimit at L100, which is invoked as if synchronous.

RATE-LIMIT catch (FACT): L99-106 converts only RateLimitError to 429 (L102-103); all other throws are re-thrown (L105).

CORS (FACT): corsHeaders is a module constant L21-24 = {Access-Control-Allow-Origin:'*', Access-Control-Allow-Headers:'authorization, x-client-info, apikey, content-type'}. No Access-Control-Allow-Methods and no Max-Age. OPTIONS preflight returns new Response(null,{headers:corsHeaders}) L77 (no Content-Type). All other responses go through json() which spreads corsHeaders + Content-Type:application/json + Cache-Control:no-store (L296-299). Wildcard '*' origin (L22).

ENV/SECRETS (FACT): L81-83 read SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY via Deno.env.get; if ANY is falsy a 500 {error:'Supabase configuration missing'} is returned (L84-85) - missing explicitly handled. The LLM key/secret is NOT read in this file; it is encapsulated in chatJSON from ../_shared/lithos.ts (imported L18, called L233).

THEORY: the 200-with-error convention (L191, L245) means a caller checking only res.ok cannot distinguish 'LLM down' / 'no transcript' from real success; failures read as success.

THEORY: the three error-ignoring reads (L155, L197, L209-221) are the main silent-degradation risk: dedupe failure doubles LLM spend, campaign failure drops the script from the prompt, corrections failure drops the learning block - all with no signal to the caller.

**evidence**

- coach-suggest/index.ts:21-24 corsHeaders constant
- coach-suggest/index.ts:77 OPTIONS null response
- coach-suggest/index.ts:78 405 POST only
- coach-suggest/index.ts:81-85 env read + 500 missing config
- coach-suggest/index.ts:93,96 401 paths
- coach-suggest/index.ts:99-106 rate-limit catch/rethrow
- coach-suggest/index.ts:109 req.json().catch(()=>{})
- coach-suggest/index.ts:111 400 uuid
- coach-suggest/index.ts:120-122 404/409
- coach-suggest/index.ts:135,147 403s
- coach-suggest/index.ts:155-161 campaign read ignores error
- coach-suggest/index.ts:167-172 Promise.all dispositions/boards errors thrown
- coach-suggest/index.ts:185 transcript error thrown
- coach-suggest/index.ts:191 200-with-error no transcript
- coach-suggest/index.ts:197-206 dedupe read ignores error + cached 200
- coach-suggest/index.ts:209-221 corrections rpc console.warn no rethrow
- coach-suggest/index.ts:233-246 LLM call catch -> 200
- coach-suggest/index.ts:274 insert error thrown
- coach-suggest/index.ts:278-284 expire console.warn no rethrow
- coach-suggest/index.ts:286 success 200
- coach-suggest/index.ts:287-290 catch-all 500
- coach-suggest/index.ts:295-300 json() header builder

**validation**

Read the full 491-line file end-to-end once (L1-491). Cross-checked every catch, every console.error/warn, and every destructuring of a supabase result against the response builders. Confirmed no {message}/{success} keys by scanning all json(...) call sites (L78,85,93,96,103,111,121,122,135,147,191,205,245,286,289).

**open_questions**

- Does checkRateLimit in _shared/utils.ts throw synchronously or return a rejected promise? If async, L100 is un-awaited and the limit may not apply.
- Does chatJSON in _shared/lithos.ts read its API key from an env var, and is a missing key handled there?
- Do clients of coach-suggest (doorboss call.html) rely on res.ok only, which would treat the 200-with-error LLM path as success?

**what_i_did_not_check**

- _shared/lithos.ts (chatJSON/LithosError): env key reading, timeout implementation, error classification - not opened.
- _shared/utils.ts (checkRateLimit/RateLimitError): whether sync or async, storage/backing - not opened.
- Client callers (doorboss call.html / rep_assistant.py) and how they parse these response shapes.
- Whether Access-Control-Allow-Methods should be present (preflight may fail for some clients) - not runtime-verified.
- No execution/runtime test; analysis is static read-only.

**confidence**: high