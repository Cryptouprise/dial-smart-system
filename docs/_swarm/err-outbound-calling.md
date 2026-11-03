# err-outbound-calling

- status: completed
- tldr: outbound-calling/index.ts: success=200 shared return, errors across 7 statuses/3 body shapes; no empty catches but 10+ log-only/uncaptured failure sites; wildcard CORS lacks Allow-Methods.

DONE: analyzed supabase/functions/outbound-calling/index.ts (2245 lines) for HTTP response shapes, swallowed failures, and CORS/secret/env handling.
TOUCHED: none (read-only).
EVIDENCE: full-file read; every claim cites file:line.
RESULT: (1) SUCCESS = HTTP 200 via shared return :2186-2188, per-action result bodies (Retell create_call :2038, Telnyx :1396, end_call {success:true} :2147, health_check :2166). ERROR = 3 distinct body shapes across 7 statuses: {error,details} (:190,:250,:2237), {error} (:231), and {success:false,error_code,error[,...]} for 202/409/503 and the 200 OUTSIDE_CALLING_HOURS (:865). (2) No empty catch and no .catch(()=>{}); swallows = catch-without-rethrow at :124,:1744,:1798,:1926, log-only error paths at :708,:741,:758,:1906,:2204,:2231, and 11 unchecked fire-and-forget call_logs.update awaits (:610-614 etc.). (3) corsHeaders static wildcard :27-30 with NO Access-Control-Allow-Methods (end_call uses DELETE :2137); env via Deno.env.get; 3 required secrets throw-then-500 when missing, signing key is health-check-only.
COULD_NOT: execute the function or inspect the imported _shared modules / DB RPC contracts.
CONFIDENCE: high.

## Artifact

**Findings**

HTTP shapes: SUCCESS is emitted by the shared terminal return (index.ts:2186-2188) as new Response(JSON.stringify(result), {headers:{...corsHeaders,'Content-Type':'application/json'}}) with NO explicit status => HTTP 200. result is per-action: create_call/Retell = {call_id, call_log_id, status:'created', attempt_recorded} (:2038-2043); create_call/Telnyx = {call_id, call_log_id, status:'created', provider:'telnyx', attempt_recorded, assistant_name, used_fallback} (:1396-1404); get_call_status = raw Retell body (:2111) or DB-derived {call_status,status,outcome,duration_seconds,from_database[,expired]} (:2091-2107); end_call = {success:true} (:2147); health_check = {success,healthy,retell_configured,webhook_signing_configured,webhook_verify_mode,idempotency_ready,safety_error,timestamp,capabilities,rate_limit_handling,retry_logic} (:2166-2178). ERROR bodies are NOT uniform: 401 missing header {error,details} (:190-199); 400 service-role missing userId {error} (:231-234); 401 auth failed {error,details} (:250-256); 503 provider uncertified {success:false,disabled:true,error_code,error} (:296-304); 400 missing phone/callerId {error,error_code,hint} (:333-340); 409 duplicate {success:false,duplicate_suppressed,reconciliation_required,error_code,error} (:615-624); 200 business-block {success:false,error,error_code:'OUTSIDE_CALLING_HOURS',details} (:865-873); 202 ambiguous/reconciliation x10 {success:false,reconciliation_required,error_code,error[,call_log_id,queue_id,provider_call_id]} (:1292,1329,1361,1385,1879,1963,1979,2010,2027,2213-2221); 500 catch-all {error,details:'Check edge function logs for more information'} (:2237-2243). Consumers must handle 3 distinct error body shapes and 7 status codes (200,202,400,401,409,500,503). Swallowed failures: no empty catch blocks and no .catch(()=>{}). Catch-without-rethrow: logError inner catch console.error only (:124-126); A/B variant catch console.error '(continuing)' (:1744-1746); diagnostic catch console.warn '(non-blocking)' (:1798-1800); JSON.parse-of-error-body catch sets fallback (:1926-1933). Error-path helpers that log but do not rethrow: cancelReservation 'CRITICAL' log only (:708-713); recordAcceptedAttempt returns false on ledger error (:741-749) and on verification error (:758-761); failedLogError console.error only (:1906); outer-catch dispatch-finalize failure (:2204-2206); outer-catch reservation-release failure (:2231-2236). markProviderReconciliationRequired DOES throw (:727). Unchecked fire-and-forget awaits call_logs.update (result never inspected, no .catch): :610-614,:814-816,:824-826,:861-864,:992-1001,:1037-1040,:1071-1074,:1079-1082,:1345-1348,:1375-1380,:1936-1944. Checked awaits: :575-578,:1033,:1906,:1995-2007. throw new Error('Max retries exceeded') at :99 is unreachable dead code. CORS/secrets: static corsHeaders {Access-Control-Allow-Origin:'*', Access-Control-Allow-Headers:'authorization, x-client-info, apikey, content-type'} (:27-30); OPTIONS returns new Response(null,{headers:corsHeaders}), default 200, no Content-Type (:170-172); NO Access-Control-Allow-Methods header anywhere (FACT) despite end_call using DELETE (:2137); all JSON responses spread corsHeaders + Content-Type. Env via Deno.env.get: SUPABASE_URL (:203), SUPABASE_SERVICE_ROLE_KEY (:204), RETELL_AI_API_KEY (:308), TELNYX_API_KEY (:309 trimmed/sanitized), RETELL_WEBHOOK_SIGNING_KEY (:2154), RETELL_WEBHOOK_VERIFY_MODE (:2155 default 'enforce'). Missing SUPABASE_* throws (:209-211); missing RETELL key throws (:311-313); missing TELNYX key throws (:314-316) - all caught by outer catch => generic HTTP 500, not startup failure. Signing key/verify-mode are health-check-only reads, not gated; health_check just reports healthy=false (:2153-2165). Service-role auth is `token === serviceRoleKey` string equality (:220).

**evidence**

- index.ts:27-30 corsHeaders definition
- index.ts:170-172 OPTIONS null body default 200 no Allow-Methods
- index.ts:190-199 401 {error,details}
- index.ts:231-234 400 {error}
- index.ts:250-256 401 {error,details}
- index.ts:296-304 503 {success:false,disabled,error_code,error}
- index.ts:333-340 400 {error,error_code,hint}
- index.ts:615-624 409 {success:false,duplicate_suppressed,reconciliation_required,error_code,error}
- index.ts:865-873 HTTP 200 success:false OUTSIDE_CALLING_HOURS
- index.ts:124-126 logError inner catch swallows
- index.ts:708-713 cancelReservation logs CRITICAL no throw
- index.ts:727 markProviderReconciliationRequired throws
- index.ts:741-749 recordAcceptedAttempt returns false no throw
- index.ts:758-761 attempt verification error logged returns false
- index.ts:1744-1746 variant catch no rethrow
- index.ts:1798-1800 diagnostic catch no rethrow
- index.ts:1906 failedLogError console.error only
- index.ts:1926-1933 JSON.parse catch fallback
- index.ts:2038-2043 Retell create_call success shape
- index.ts:2147 end_call {success:true}
- index.ts:2166-2178 health_check result shape
- index.ts:2186-2188 shared success return default 200
- index.ts:2194-2207 dispatch finalize failure swallowed
- index.ts:2209-2221 202 reconciliation in outer catch
- index.ts:2231-2236 release failure swallowed
- index.ts:2237-2243 500 catch-all {error,details}
- index.ts:203-211 env reads + missing-config throw
- index.ts:308-316 provider key reads + missing throws
- index.ts:2154-2155 webhook signing env read health only

**validation**

Static read of the full 2245-line file; every claim cites an exact line range. Full-file read confirms zero empty catch blocks and zero .catch() sites. All 11 unchecked update sites and all 4 catch-no-rethrow sites individually read. No execution (RESEARCH ONLY, read-only).

**open_questions**

- Is HTTP 200 + success:false for OUTSIDE_CALLING_HOURS (:865-873) intended, or should it be 4xx? Callers must branch on success flag, not status.
- Missing Access-Control-Allow-Methods may block DELETE end_call preflight from browser origins - needs a live preflight test (THEORY only).
- Are the 11 unchecked call_logs.update awaits acceptable fail-closed design, or can they leave rows stuck in non-terminal status?
- Does `token === serviceRoleKey` (:220) warrant a constant-time comparison (security, out of scope).

**what_i_did_not_check**

- The five imported _shared modules (contact-safety, tenant-context, retell-provider-contract, call-exposure-policy, campaign-contact-release) and their error handling
- Runtime behavior - function was not executed
- DB RPC contracts (claim_provider_dispatch, finalize_provider_dispatch, evaluate_contact_stop, check_credit_balance, etc.)
- Caller-side (call-dispatcher/UI) handling of the returned shapes and the 200-on-business-error convention
- Whether CORS wildcard plus missing Allow-Methods actually breaks browser DELETE preflight
- Downstream retell-call-webhook error handling

**confidence**: high