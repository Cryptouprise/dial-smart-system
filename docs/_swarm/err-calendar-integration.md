# err-calendar-integration

- status: completed
- tldr: calendar-integration is dead code: L43-51 returns 503 unconditionally; analyzed all response shapes, swallowed catches, CORS/env handling (every claim file:line).

err-calendar-integration DONE. Analyzed C:/Users/charl/dial-smart-system/supabase/functions/calendar-integration/index.ts (3496 lines) read-only.

HEADLINE FACT (L43-51): serve() unconditionally returns 503 {success:false,disabled:true,error_code:'CALENDAR_INTEGRATION_NOT_CERTIFIED',error:...} BEFORE the try block, so L53-3139 (all handlers) is unreachable dead code. Only reachable shapes: OPTIONS 200 empty; everything else 503.

(1) Response shapes: enumerated all dead success shapes (default 200: {success:true,...} plus {slots},{booking},{appointments},{authUrl},{connected,...}) and error shapes (global catch 500 {error}; default 400 {error:'Unknown action'}; 401 {error:'Authentication required'} x5; many 400 {error}/{error,message}). Body shape is INCONSISTENT (mix of {error}, {error,message}, {success:false,error}, {success:false,message}). Several failures return HTTP 200 (retell_* no-user L1400/L1440; delete_event L3032; update_event L3111; test_google_calendar catch L1238).

(2) Swallowed failures cited: empty catch L403 (browser JS) and L2102-2104; console.error-only no-rethrow at L33-35,694-697,714-716,787-790,955-957,976-978,1018-1020,1559-1563,2080-2082,2159-2161,2391-2393,2409-2411,2703-2705,2954-2956,3191-3193; catch-returns-200 at L1238-1248; ignored rejection `.catch(()=>'...')` L3188; auth error silently ignored L70. Unchecked fire-and-forget DB awaits at L303-317,501-512,517-525,591-597,675-678,771-774,1371-1380,1573-1576,2960-2969 (reschedule reports success even if DB update failed). Highest-risk silent failure: L955-957/L1018-1020 busy-time fetch errors -> availability computed ignoring Google/GHL (double-booking risk).

(3) CORS/secrets: corsHeaders const L4-7 wildcard origin, no Allow-Methods; OPTIONS L39-41; exceptions (google_callback HTML L420-425 and handleAction L3418 lack CORS). Env all Deno.env.get: SUPABASE_* checked L54-59 (dead); GOOGLE_CLIENT_ID checked L206; GOOGLE_REDIRECT_URI fallback interpolates unchecked SUPABASE_URL L207-208; google_callback reads CLIENT_ID/SECRET unchecked then uses `!` L255-256; ensureFreshGoogleToken checks L3153-3159. Tokens only base64 (btoa/atob), not real encryption.

Confidence: high. Every claim is FACT (file:line). Artifact submitted via complete_node. Blocker: function is disabled, so none of this executes at runtime today.

## Artifact

**Findings**

HEADLINE (FACT, L43-51): the serve() handler unconditionally `return`s a 503 DISABLED response before the try block, so EVERYTHING from L53-3139 (the try/catch and all ~20 switch cases) is UNREACHABLE dead code. The only reachable runtime behavior is: OPTIONS -> Response(null,{corsHeaders}) [HTTP 200, no body]; any other method -> 503 body {success:false, disabled:true, error_code:'CALENDAR_INTEGRATION_NOT_CERTIFIED', error:'Calendar availability, booking, cancellation, and OAuth are disabled until tenant-bound tool authentication is certified.'}. All shapes below describe the intended (dead) handlers.

(1) HTTP RESPONSE SHAPES.
REACHABLE success: OPTIONS 200 empty (L39-41); everything else 503 (L43-51).
Dead-but-intended success shapes (all default status 200 unless noted, all include {...corsHeaders,'Content-Type':'application/json'} unless noted): check_token_status {connected,needsReconnect,hasRefreshToken,isExpired,expiresAt} L193-202 / no-integration {connected:false,needsReconnect:false} L174-177; get_google_auth_url {authUrl} L231-234; google_callback -> 200 text/html (JSON none) L420-425 [NO cors headers]; sync_ghl_calendar {success:true,synced} L527-530; sync_appointment {success:true,results} L803-806; get_available_slots {success:true,current_time,timezone,range_start,range_end,available_slots,slots,message} L1106-1125; test_google_calendar {success:true,message,details:{calendarName,email,upcomingEvents,tomorrowSlots,timezone,meetingDuration}} L1222-1236; test_calcom {success:true} L1283-1286; calcom_get_slots {slots,formatted,message} L1317-1326; calcom_book_appointment {success:true,booking,message} L1383-1390; retell_book_appointment {success:true,appointment,message} L1477-1484; create_google_calendar_test_event {success:true,message,eventId,eventLink,startTime} L1578-1587; list_appointments {success:true,appointments,count,message} L1682-1690; create_appointment/book_appointment {success:true,appointment_id,event_id,message} L2216-2224; cancel_appointment {success:true,appointment_id,event_id,message} L2738-2746 / cancel_all {success:true,cancelled,appointment_ids,message} L2442-2450; reschedule_appointment {success:true,appointment_id,event_id,message} L2983-2991; delete_event {success:true} L3041-3044; update_event {success:true} L3120-3123.
Dead-but-intended ERROR shapes: global catch -> 500 {error: <message>} L3132-3137; unknown action -> 400 {error:'Unknown action: <action>'} L3126-3130; 401 {error:'Authentication required'} L161-163,431-433,1254-1256,1491-1493; 401 {success:false,error:'Authentication required'} L1131-1133; 400 {error:'Google Calendar not configured...'} L211-214; 400 plain-text 'Missing code or state' L242; 400 {error:<tokens.error_description>} L266-269; 400 {error:'Go High Level not connected'} L444-448; 400 {error:'Failed to fetch GHL calendar'} L469-472; 400 {error:'Appointment data required'} L536-539; 400 {error:'Cal.com API key not configured'} L1268-1272; 400 {error:'Cal.com not configured',message} L1296-1300; 400 {error:'Cal.com not configured'} L1335-1339; 400 {error:'Google Calendar not connected'} L1505-1510,3014-3018; 400 {error:<parsed Google msg>} L1564-1567; 400 {error:'event_id is required'} L2999-3003,3053-3057; 400 {error:'Google Calendar not connected'} L3068-3072. NOTE INCONSISTENCY: error bodies are a mix of {error} (no success flag), {error,message}, {success:false,error}, {success:false,message}. Several FAILURES return HTTP 200: retell_check_availability no-user -> 200 {error,message} L1400-1406; retell_book_appointment no-user -> 200 {message} L1440-1445; delete_event failure -> 200 {success:false,error} L3032-3037; update_event failure -> 200 {success:false,error} L3111-3117; test_google_calendar catch -> 200 {success:false,error,step} L1238-1248. Several 'soft' errors also return 200 with success:false/message: L830-839, L1599-1605, L1813-1821, L1948-1955, L2013-2020, L2236-2252, etc.

(2) SWALLOWED FAILURES (file:line).
- L33-35 catch(logError){console.error} in logCalendarInvocation - swallowed, no rethrow.
- L403 `catch (e) {}` - EMPTY catch (client-side browser JS embedded in the success page).
- L694-697 Google sync catch -> console.error + results.google (not rethrown).
- L714-716 decode GHL credential catch -> console.error, continue (cred omitted).
- L787-790 GHL sync catch -> console.error + results.ghl.
- L955-957 Google Calendar busy-times fetch catch -> console.error ONLY; busyTimes silently empty -> availability can be computed ignoring Google (double-booking risk).
- L976-978 decode GHL credential catch -> console.error.
- L1018-1020 GHL Calendar busy fetch catch -> console.error ONLY (silent).
- L1238-1248 test_google_calendar catch RETURNS HTTP 200 with {success:false}. (catch that returns 200)
- L1559-1563 inner JSON.parse catch -> console.error, keeps default message.
- L2080-2082 Google event creation catch -> console.error ONLY; booking proceeds with google_event_id=null and still reports success.
- L2102-2104 `catch { }` EMPTY catch, no logging ('Ignore malformed legacy credentials').
- L2159-2161 GHL Calendar creation catch -> console.error ONLY (booking still succeeds).
- L2391-2393 refresh-token catch -> console.error; proceeds with accessToken=null so Google deletes are skipped, local still marked cancelled.
- L2409-2411 Google cancel_all per-event catch -> console.error.
- L2703-2705 Google cancel catch -> console.error.
- L2954-2956 Google reschedule catch -> console.error; local DB still updated as success.
- L3191-3193 ensureFreshGoogleToken refresh catch -> console.error, returns stale access token.
- L3188 `.catch(() => 'Unable to read error response')` - ignored promise rejection on refreshResponse.text().
- L3241-3244 safeJsonParse catch -> returns fallback (intentional).
- L70 `if (!error && user) userId=user.id;` - auth error silently ignored, no log; proceeds unauthenticated.
FIRE-AND-FORGET / UNCHECKED AWAITS on DB writes (result/error never inspected, failure silent): L303-317 upsert calendar_integrations; L501-512 insert calendar_appointments; L517-525 upsert integration; L591-597 update token; L675-678 update google_event_id; L771-774 update ghl_appointment_id; L1371-1380 insert calendar_appointments (calcom); L1573-1576 update last_sync_at; L2960-2969 update on reschedule (NOT checked -> reports success even if DB write failed). (For contrast, L2166-2189 insert IS checked at L2191, and L2416/L2709 updates ARE checked.)

(3) CORS / SECRET / ENV.
CORS: module constant corsHeaders L4-7 = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'}. NO Access-Control-Allow-Methods header. Wildcard origin, no credential restriction. OPTIONS preflight L39-41 returns Response(null,{headers:corsHeaders}) at default 200. Each JSON response spreads ...corsHeaders. EXCEPTIONS: google_callback success HTML L420-425 sets ONLY Content-Type (no CORS); L242 error uses raw `headers: corsHeaders` (no Content-Type); handleAction L3418-3421 returns a response with no CORS headers at all.
SECRETS/ENV (all via Deno.env.get): SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY L54-59 are checked and throw -> 500 (but this throw is in dead code). GOOGLE_CLIENT_ID checked -> 400 L206-215. GOOGLE_REDIRECT_URI L207-208 falls back to `${Deno.env.get('SUPABASE_URL')}/...` with no null check -> literal 'undefined/functions/...' if unset. google_callback L245-259 reads GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET but does NOT validate, then sends them with TS non-null assertions `clientId!`/`clientSecret!` L255-256 (would send 'null'). ensureFreshGoogleToken L3153-3159 DOES check both and returns the existing token if missing. Token 'encryption' is base64 btoa/atob only (L286,L310,L452,L556,L1178,L1512,L3021,L3075,L3143,L3152,L3181) - reversible, not real encryption.
STRUCTURE SMELL (context): L2037-2084 Google branch has mis-indented block where `if (integration?.access_token_encrypted)` at L2045 sits outside the intended nesting and its close brace L2084 closes the preference-if; GHL branch L2089-2163 has a similar mis-indented try inside `if (ghlCreds && ghlCreds.length>0)`. Also handleAction (L3414-3422) merely returns {redirect,action,params} - it does NOT execute the action, so the retell_check_availability/retell_book_appointment re-routing (L1425,1432,1458) would return an unexecuted redirect.

**evidence**

- index.ts:43-51 serve handler returns 503 unconditionally before the try (everything after is unreachable)
- index.ts:53-59 env check throws but is dead code
- index.ts:39-41 OPTIONS -> Response(null,{corsHeaders})
- index.ts:4-7 corsHeaders constant (no Allow-Methods)
- index.ts:3132-3137 global catch -> 500 {error}
- index.ts:3126-3130 default -> 400 {error:'Unknown action'}
- index.ts:161-163 / 431-433 / 1131-1133 / 1254-1256 / 1491-1493 -> 401 {error:'Authentication required'}
- index.ts:1400-1406 retell_check_availability no-user -> status 200 with error
- index.ts:1440-1445 retell_book_appointment no-user -> status 200
- index.ts:1238-1248 test_google_calendar catch returns 200
- index.ts:3032-3037 delete_event failure returns 200 {success:false}
- index.ts:3111-3117 update_event failure returns 200 {success:false}
- index.ts:33-35 catch logs, no rethrow
- index.ts:403 empty catch (embedded browser JS)
- index.ts:955-957 Google busy-times catch -> console.error only (silent)
- index.ts:1018-1020 GHL busy fetch catch -> console.error only
- index.ts:2080-2082 Google event creation catch -> console.error only, booking still succeeds
- index.ts:2102-2104 empty catch (silent)
- index.ts:2159-2161 GHL creation catch -> console.error only
- index.ts:2391-2393 / 2409-2411 / 2703-2705 / 2954-2956 / 3191-3193 catch -> console.error only
- index.ts:3188 .catch(() => 'Unable to read error response')
- index.ts:2960-2969 reschedule DB update result unchecked (silent failure reported as success)
- index.ts:303-317, 501-512, 517-525, 591-597, 675-678, 771-774, 1371-1380, 1573-1576 unchecked DB writes
- index.ts:245-259 GOOGLE_CLIENT_ID/SECRET read unchecked, used with ! assertions at 255-256
- index.ts:3153-3159 ensureFreshGoogleToken checks creds, returns stale token if missing
- index.ts:207-208 GOOGLE_REDIRECT_URI fallback interpolates unchecked SUPABASE_URL
- index.ts:420-425 google_callback HTML response lacks CORS headers
- index.ts:3414-3422 handleAction returns unexecuted redirect (no CORS)
- index.ts:70 auth error silently ignored

**validation**

Static read-only review of all 3496 lines (three reads covering 1-1800, 1800-2700, 2700-3496) plus findstr confirmation of every catch/console.error/.catch(/Deno.env.get/status: line number. Every claim carries a file:line. No commands were run against live systems; no files written.

**open_questions**

- Is the L43-51 503 kill-switch intended to be permanent, temporary, or a leftover that should be trimmed once 'tenant-bound tool authentication is certified'?
- Do Retell agents currently hit an action that returns an unexecuted {redirect} via handleAction (L1425/1432/1458) if the switch were re-enabled?
- Should Google/GHL sync failures during booking be surfaced to the caller instead of reported as success?
- Is base64 (btoa/atob) sufficient token 'encryption' for this deployment, or is a KMS expected?
- Should availability computation fail closed (block booking) when the Google busy-time fetch errors?

**edge_cases_considered**

- OPTIONS preflight with no explicit status (defaults 200)
- Unknown action name falls through to default 400
- Auth error during getUser silently downgrades to anonymous
- Retell-called actions with no user context return 200 to avoid breaking voice flow
- Google/GHL API failures mid-booking do not roll back the local DB insert
- Partial-credential cases (apiKey present but locationId missing)
- Malformed base64 credentials during decode
- handleAction referral never executes the target action

**what_i_did_not_check**

- Did not execute/run the function or issue any HTTP request (static read only).
- Did not inspect other Supabase edge functions, the frontend callers, Retell agent config, or the DB schema/RLS.
- Did not verify whether the L43-51 503 kill-switch is intentional/recent or which git commit introduced it.
- Did not analyze timezone/date-parsing correctness, auth/tenant-binding logic, or duplicate-booking logic beyond the swallowed busy-time fetches.
- Did not check Supabase dashboard env/secret configuration.
- Did not run lint/tsc on the file.
- Did not analyze the other ~20 edge functions in the repo for the same patterns.

**confidence**: high