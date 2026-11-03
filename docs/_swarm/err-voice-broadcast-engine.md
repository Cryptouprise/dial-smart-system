# err-voice-broadcast-engine

- status: completed
- tldr: voice-broadcast-engine error handling: only one 500 {error} shape, some failures return 200, cert gate makes all branches dead

Analyzed voice-broadcast-engine/index.ts (2452 lines) for error handling. Full file read + findstr confirmation. Key: certification gate returns false (L636-638) so function ALWAYS returns 503 and all action branches (L659+) are runtime-dead. Only ONE error shape (L2442-2450 -> 500 {error}); several failure paths return HTTP 200 (L1415-1423, L2198-2201). No .catch(()=>{})/fire-and-forget .then; instead many awaited supabase writes with discarded error results. CORS = wildcard origin, headers only. Env: SUPABASE_URL/KEY validated (throw), provider keys validated lazily. Evidence: file:line refs in artifact.

## Artifact

**Findings**

(1) SUCCESS SHAPES: explicit 200 only at L722-725 {success,message,processed} and L1022-1025 {success,totalProcessed,results}. Other success responses omit status (default 200): L1360-1368 {success:true,status:'throttled',message,currentConcurrent}; L1793-1806 {success:true,status:'active',provider,dispatched,sipTrunkCalls,rateLimitHits,usingSipTrunk,pending,errors}; L1829-1832 {success:true,status:'paused'}; L2011-2014 {success:true,...stats}; L2029-2036 {success:true,message,calls:[]}; L2097-2104 {success:true,inspected_count,calls}; L2123-2130 {success:true,message,updated:0}; L2175-2184 {success:true,total_calls,updated,total_cost,errors}; L2414-2417 {success:true,action:'replay'}; L2432-2435 {success:true,action,status}. OPTIONS L641-643 returns null body,200,corsHeaders only.  ||  (1) ERROR/DISABLED: only ONE error shape exists: catch-all L2442-2450 -> status 500 body {error:error.message} (no success key, no error_code). Disabled: 503 at L648-656 and L691-699 {success:false,disabled:true,error_code,error}. Two FAILURE responses return HTTP 200 (no explicit status): L1415-1423 {success:false,status:'paused',error,errorRate} and L2198-2201 {success:false,message:'Invalid digit'}.  ||  (1) FATAL: isVoiceBroadcastSurfaceTenantCertified() is hardcoded return false (L636-638) so gate L647-657 ALWAYS returns 503 before any action; every branch L659+ (process_active/start/stop/stats/inspect_calls/backfill_costs/handle_dtmf, auth, providers, calls) is UNREACHABLE at runtime. Only reachable responses: the 503 gate + OPTIONS 200. Static-only.  ||  (2) EMPTY/NO-OP CATCHES: L744 catch{} adaptive_pacing lookup and L1450 catch{} pacing - both silent, no log, no rethrow. L305-307 catch{return errorText;} parseTwilioError fallback. console.error with no rethrow: L88-90 createSystemAlert, L2314-2316 calendar, L2353-2355 SMS, L2376-2378 auto-callback, L1913-1915 reconcile loop continues.  ||  (2) UNCHECKED AWAITED WRITES (error result discarded): L915-918,L976-979,L987-990,L993(rpc),L1056,L1081-1086,L1118,L1212-1216,L1253-1258,L1267-1271,L1278-1282,L1388-1395,L1649-1657,L1714-1717,L1722(rpc),L1747-1755,L1760-1765,L1852-1857,L1902-1908,L1996-1999,L2155-2158,L2220-2223,L2230-2233,L2254-2257,L2300-2311,L2337-2351,L2363-2374,L2399-2402,L2406-2409. console.error-only no throw: L1784-1789 statsUpdateError, L1825 pauseError, L2395 dncError.  ||  (2) NO fire-and-forget: findstr confirms ZERO .catch(, ZERO .then(, ZERO Promise.all, ZERO unawaited promises. Risk is ignored write-error RESULTS, not ignored rejections.  ||  (3) CORS: corsHeaders L5-8 = only Access-Control-Allow-Origin '*' and Access-Control-Allow-Headers 'authorization, x-client-info, apikey, content-type'; no Allow-Methods, no Allow-Credentials, no Vary. OPTIONS L641-643 has no Content-Type. All other responses spread {...corsHeaders,'Content-Type':'application/json'}.  ||  (3) ENV/SECRETS: L665-666 reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, both checked L668-670 -> throw 'Supabase configuration missing'. L673-678 reads RETELL_AI_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TELNYX_API_KEY (Telnyx sanitized .trim().replace(non-printable,'')||undefined, L677). Provider keys NOT validated at read time; checked lazily: Twilio L921-923/L2039-2041/L2109-2111 (throw), selectProvider L611-634 returns null -> throw 'No telephony provider configured' L1310-1315.

**evidence**

- index.ts:5-8 corsHeaders
- index.ts:641-643 OPTIONS 200 null body
- index.ts:636-638 certified hardcoded false
- index.ts:647-657 503 gate (always fires)
- index.ts:648-656 503 {success,disabled,error_code,error}
- index.ts:665-677 env reads
- index.ts:690-699 503 disabled egress
- index.ts:722-725 200 success
- index.ts:744 empty catch
- index.ts:1022-1025 200 success
- index.ts:1360-1368 200 throttled
- index.ts:1415-1423 200 with success:false paused
- index.ts:1450 empty catch
- index.ts:1793-1806 200 active
- index.ts:1829-1832 200 paused
- index.ts:2011-2014 200 stats
- index.ts:2029-2036 200 no calls
- index.ts:2097-2104 200 inspected
- index.ts:2123-2130 200 backfill
- index.ts:2175-2184 200 backfill costs
- index.ts:2198-2201 200 success:false invalid digit
- index.ts:2414-2417 200 replay
- index.ts:2432-2435 200 dtmf
- index.ts:2442-2450 500 {error} only error shape
- index.ts:88-90 createSystemAlert swallow
- index.ts:305-307 parseTwilioError fallback
- index.ts:1784-1789 statsUpdateError console.error only
- index.ts:1825 pauseError console.error only
- index.ts:2395 dncError console.error only
- index.ts:2314-2316 calendar catch
- index.ts:2353-2355 sms catch
- index.ts:2376-2378 autocall catch
- index.ts:1913-1915 reconcile catch
- index.ts:915-918,976-979,987-990,993,1056,1081-1086,1118,1212-1216,1253-1258,1267-1271,1278-1282,1388-1395,1649-1657,1714-1717,1722,1747-1755,1760-1765,1852-1857,1902-1908,1996-1999,2155-2158,2220-2223,2230-2233,2254-2257,2300-2311,2337-2351,2363-2374,2399-2402,2406-2409 unchecked awaited writes
- findstr: zero .catch(/.then(/Promise.all/unawaited promises

**validation**

Read all 2452 lines in 5 sequential chunks plus head/tail; cross-checked every new Response, every status literal (200/500/503), every await supabase, and .catch(/.then(. Counts: 20 new Response sites -> 2 explicit 200, 2 explicit 503, 1 explicit 500, ~15 implicit-200.

**open_questions**

- Is the hardcoded return false (L636-638) an intentional kill-switch or designed to be env-overridden elsewhere?
- Do downstream consumers branch on HTTP status (L1415/L2198 return 200 with success:false) or on body.success?

**what_i_did_not_check**

- _shared/manager-notify.ts (sendManagerNotification, imported L3, used L1408/L2002) error handling
- Runtime execution - 503-always is a static claim only
- Downstream consumers/webhooks (call-tracking-webhook, twilio-dtmf-handler, frontend) keying off status vs body
- Whether env secrets are actually set in the deployment
- supabase-js v2 .update() silent-failure semantics (assumed from code pattern)

**confidence**: high