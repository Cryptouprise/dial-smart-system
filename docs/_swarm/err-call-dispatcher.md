# err-call-dispatcher

- status: completed
- tldr: call-dispatcher error-handling audit done: inconsistent success shapes, ~40 swallowed/ignored failures, wildcard CORS, env validated. All line-cited.

DONE: Analysed error handling in dial-smart-system/supabase/functions/call-dispatcher/index.ts (2169 lines) - HTTP response shapes, swallowed failures, CORS/secret/env handling.

TOUCHED: none (research-only, read-only).

EVIDENCE: Read all 2169 lines in one pass; line refs verified against printed source.

RESULT (summary):
(1) Shapes - Success is inconsistent: main dispatch 200 {success:true,dispatched,...,results[]} (2126-2159); 'No active campaigns' 200 has NO success key (892-899); no_numbers_available returns success:false with status 200 (1346-1358). All hard errors use {error}: 500 config (264), 401 (274,307), 400 (429), 404 (447), 409 (461,466,503), 500 global catch (2161). force_dispatch-disabled 503 {success:false,disabled,error_code,error} (414). CRITICAL: per-item loop failures (1609-2097) caught at 2018 NEVER become HTTP errors - request still 200, failure only in results[].

(2) Swallowed: quiet fail-closed catch 98-100; intentional swallow 1969-1971; log-only-no-rethrow at 127,151,165,331,626,1179,1207,1249,1309,1384,1982,1102,1136,866; error silently ignored (not even destructured) at 214,562,910,926,935,963,996,705,663,725,789,834,1270,2102; fire-and-forget awaited writes discarding result at 230-240,677-691,737-740,774-777,812-828,1655,1688-1691,1714-1724,1742-1747,1917-1925; ignored async results: functions.invoke('workflow-executor') 780-782 and 1144-1148, rpc('increment_daily_calls_with_reset') 2016, raiseAlert 1333/1817/2075, resolveAlerts 1370, edge_function_errors insert 1318. No .catch(()=>{}) patterns exist.

(3) CORS/env: static corsHeaders 10-13 wildcard origin '*', no Allow-Methods/Vary; OPTIONS 255-257. Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY both validated, missing -> 500 (260-268). RETELL_WEBHOOK_SIGNING_KEY/VERIFY_MODE read 358-359 for health only. Service key reused as sibling-invoke auth (1288,1958).

VALIDATION: full-file read, no execution.

BLOCKERS/FOLLOW-UPS: none blocking. Open that an ownership module (alerting.ts, tenant-context.ts, provider-router.ts) and the SQL RPCs were not read; raiseAlert throw-propagation and workflow-executor invoke-failure impact unverified.

## Artifact

**Findings**

(1) RESPONSE SHAPES. SUCCESS is not one shape. Main dispatch: status 200, body {success:true, organizationId, dispatched, workflowEnrolled, dialingQueued, remaining, batchSize, activeCallCount, maxDialsInFlight, utilizationPercent, nextBatchDelaySeconds, diagnostics, usedSettings, targetBatchSize, availableSlots, callbacks{queued,enrolled,resumed}, results[]} (index.ts:2126-2159). Branch successes: cleanup_stuck_calls {success,cleaned,resetQueue,message} 200 (397-405); force_dispatch {success,message,clearedCalls} 200 (536-543); health_check {success,healthy,timestamp,...} 200/503 (370-390); calling-hours block {success,dispatched:0,status,message,remaining:0} 200 (607-618); at_capacity {success,dispatched:0,status,message,...} 200 (1410-1424); 'No active campaigns' {message,dispatched:0,callbacks} 200 with NO success key (892-899); no_numbers_available {success:false,status,error,dispatched:0,...,action_required} status 200 (1346-1358). ERROR responses all use {error}: config missing 500 (264-267); no auth header 401 (274-277); Unauthorized 401 (307-310); force_dispatch missing params 400 (429-432); not-owned 404 (447-450); campaign not active 409 (461-463); lead DNC 409 (466-468); max attempts 409 (503-505); force_dispatch disabled 503 {success:false,disabled,error_code,error} (414-422); global catch 500 {error: error.message} (2161-2167). CRITICAL: per-item loop failures (1609-2097) are caught at 2018 and NEVER become an HTTP error - they only append {leadId,success:false,error} to results[] while the request still returns status 200. || (2) SWALLOWED FAILURES. Quiet catch: isWithinCallingHours catch (98-100) returns fail-closed with NO logging. Intentional swallow: callResponse error-detail parse 'catch { // keep fallback message }' (1969-1971). Log-only, no rethrow: ringing cleanup (127-129), queued cleanup (151-153), user campaigns (165-167), settings fetch (331-333), body parse (286-290), auto-cleanup wrapper try/catch (626-630), retell numbers (1179-1180), telnyx numbers (1207-1208), campaign_phone_pools (1249-1250), retell sync catch (1309-1311, ALSO unreachable since isAutomaticRetellNumberSyncCertified()=false at 23-25), active-call count (1384-1386), ambiguous-create quarantine persist (1982-1984 logs CRITICAL with no rethrow), workflow enrollment insert (1102-1106), queue insert non-23505 (1136-1138), callback queue insert (866-868). Silently-ignored errors (error not destructured or logged): maxedOut queues query (214, guarded by !maxedOutError with no else), calling hours campaigns query (562), workflow_steps first steps (910), existing dialing_queues (926-929), existing workflow progress (935-939), recent call_logs (963-967), terminal call_logs (996-1003), paused workflow (663-671), callback campaign_leads (705), first step (714-722, 748-753), existing workflow (725-732), existing queue entry (789-795), recent attempt (834-844), allUserNumbers (1270-1274), remaining count (2102-2106). Fire-and-forget awaited writes with result discarded: supabase .update()/.insert() at 230-240, 677-685, 688-691, 737-740, 774-777, 805-808, 812-828, 862-865, 1688-1691, 1714-1724, 1742-1747, 1858-1865, 1917-1925. Ignored async results: functions.invoke('workflow-executor') at 780-782 and 1144-1148 (never inspected); rpc('increment_daily_calls_with_reset') at 2016 (result entirely discarded); edge_function_errors insert 1318-1328; raiseAlert 1333-1344 / 1817-1828 / 2075-2086; resolveAlerts 1370. No literal '.catch(()=>{})' patterns exist. Well-handled counter-examples: campaignError 889, leadsError 1027, claimError 1445, DNC lookup 1708-1710, contact-stop RPC 1738-1740, ownership lookups 444-445, quarantine reconcil lookup 181-183, resolve_provider_dispatch_invoke_error 2047-2057. || (3) CORS/SECRET/ENV. corsHeaders is a static object (index.ts:10-13): Access-Control-Allow-Origin '*' (wildcard, no credentials), Access-Control-Allow-Headers 'authorization, x-client-info, apikey, content-type'. No Access-Control-Allow-Methods, no Vary: Origin. Every response spreads ...corsHeaders plus Content-Type merged inline as {...corsHeaders, 'Content-Type':'application/json'}; the force_dispatch-disabled response additionally sets Cache-Control: no-store (421). Preflight handled at 255-257 (OPTIONS -> new Response(null,{headers:corsHeaders})). Env/secret reads: Deno.env.get('SUPABASE_URL') and Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') at 260-261, BOTH validated - if either missing returns 500 {error:'Supabase configuration missing'} (263-268) = handled. RETELL_WEBHOOK_SIGNING_KEY (358) and RETELL_WEBHOOK_VERIFY_MODE (359, default 'enforce') read for health_check only and surfaced in the health body; missing values drive 503 but do NOT throw. The service-role key doubles as bearer/apikey when invoking sibling functions retell-phone-management (1288-1290) and outbound-calling (1958-1960) and as the internal-call token comparison (296). Auth: bearer token extracted (280) and validated via supabase.auth.getUser unless internal (300-314). No secret is logged; supabaseKey is compared, never printed.

**evidence**

- index.ts:2126-2159 main success 200 body keys
- index.ts:2161-2167 global catch -> 500 {error: error.message}
- index.ts:892-899 No active campaigns 200 without success key
- index.ts:1346-1358 no_numbers_available success:false but status 200
- index.ts:98-100 empty catch (fail-closed, no log)
- index.ts:1969-1971 intentional swallow catch with comment
- index.ts:562 calling hours query error not destructured
- index.ts:214 maxedOutError silently ignored (no else)
- index.ts:780-782 and 1144-1148 functions.invoke results ignored
- index.ts:2016 rpc increment_daily_calls_with_reset result discarded
- index.ts:2018-2097 per-item catch, no HTTP error escalation
- index.ts:10-13 corsHeaders definition (wildcard origin, no methods/Vary)
- index.ts:255-257 OPTIONS preflight
- index.ts:260-268 env read + missing-config 500
- index.ts:358-359 RETELL env reads
- index.ts:1288-1290,1958-1960 service key passed to sibling functions

**validation**

Read all 2169 lines of index.ts in one pass; each cited line inspected directly. No execution (research only). Line numbers verified against printed source.

**open_questions**

- Does raiseAlert (alerting.ts) throw on failure, and would that throw then propagate to the outer 500 catch at 2161?
- Does an ignored functions.invoke('workflow-executor') failure matter operationally (SMS/workflow execution silently skipped)?
- Are the ignored dialing_queues .update() writes consequential (lead stuck 'calling') or best-effort sinks?

**edge_cases_considered**

- Malformed/absent JSON body: parse failure only warns and defaults requestBody to {} (283-290), so a bad body silently degrades to a normal run with action=undefined.
- Internal call path (296) trusts token==serviceKey and bypasses getUser.
- Three certification functions hardcoded false (15-25) make force_dispatch (409+), callback automation (640-870) and retell sync (1265-1312) dead at runtime, so their error paths are unreachable today.
- Rate-limit path breaks the loop (2069) after pushing a rateLimited result.

**what_i_did_not_check**

- _shared/alerting.ts, _shared/tenant-context.ts, _shared/provider-router.ts internal error handling (throw behavior of raiseAlert/resolveAlerts/assertTenantResourceOwnership/authorizeOrganizationContext/resolveRouting).
- SQL RPCs claim_pending_dispatches, evaluate_contact_stop, resolve_provider_dispatch_invoke_error, provider_safety_health_check, increment_daily_calls_with_reset.
- Sibling edge functions outbound-calling, workflow-executor, retell-phone-management response contracts.
- Deno runtime unhandled-rejection semantics / whether fire-and-forget writes resolve.
- Other functions in the repo (only this one file analyzed).
- Whether wildcard CORS '*' is acceptable given bearer-header auth (security review out of scope).

**confidence**: high