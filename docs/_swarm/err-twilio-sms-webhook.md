# err-twilio-sms-webhook

- status: completed
- tldr: Webhook returns empty TwiML 200 on success AND on most failures; only 403 for bad signature; no JSON error bodies; ~20 swallowed failure sites; no .catch() handlers.

Analyzed twilio-sms-webhook/index.ts (1703 lines) for error handling. KEY: (1) SUCCESS = empty TwiML, status 200, Content-Type text/xml (no JSON keys). Only ONE non-200 path exists in the file: signature failure -> 403 text/plain 'Forbidden: invalid Twilio signature' (index.ts:490-496). No {error}/{message}/{success} JSON anywhere; top-level catch returns 200 (1694-1703). (2) Swallowed failures: empty catch (416-418); config-missing throw swallowed to 200 (461-463); DB-error logged then 200 (541-544); ~14 console.error-no-rethrow catches (679,1279,1327,1356,1360,1487,1495,1576,1583,1676,1683); non-ok HTTP logged only (674,1229,1353); many awaited Supabase calls ignore error (563,593,632,639,699,706,733,737,750,792,810,851,1308,1333,1462,1555,1664,1671); fired-await fetches with unchecked response (1469-1485,1563-1574); silent reschedule failure (1452-1458). ZERO .catch(()=>{}) present. (3) CORS = static corsHeaders (8-11), no Allow-Methods; env via Deno.env.get (TWILIO_AUTH_TOKEN fail-closed 423-427, SUPABASE_* throw->swallowed 461-463, LOVABLE_API_KEY missing->skip 933-936).

## Artifact

**Findings**

HTTP SUCCESS SHAPE: the handler returns TwiML, never JSON. Every success path returns new Response('<empty TwiML>', { headers: {...corsHeaders, Content-Type text/xml} }) with implicit status 200 (helper twimlResponse at index.ts:352 defaults status=200). Success body has NO JSON keys (no success/message). ERROR SHAPE: the ONLY non-200 path in the whole file is signature failure: status 403, plain-text body 'Forbidden: invalid Twilio signature', Content-Type text/plain (index.ts:490-496). No {error}, {message} or {success} JSON is ever emitted. The top-level catch returns status 200 (index.ts:1694-1703), so internal failures are indistinguishable from success by status code. SWALLOWED FAILURES (each cited): empty catch with only a comment (index.ts:416-418); top-level catch returns 200 instead of 5xx (index.ts:1694-1703); missing SUPABASE_URL/SERVICE_ROLE_KEY throws then is caught to 200 (index.ts:461-463); DB-error branch logs then returns 200 TwiML (index.ts:541-544); console.error-with-no-rethrow catches for disposition routing (679-681), check (1279-1281), booking (1360-1362), reschedule (1495-1497), cancel (1583-1585), three syncError blocks (1356-1358, 1487-1489, 1576-1578), sendError (1676-1678), aiError (1683-1685), apptError (1327-1329); non-ok HTTP responses logged only without throwing (disposition 674-678, AI gateway 1229-1231, calendar sync 1353-1354); failed conversation create logged then continues (588-589); message-store failure logged then full AI processing continues (623-627); isOrgAiReplyEnabled swallows the DB error and returns true (443-446); many awaited Supabase calls destructure only data and ignore error (563, 593, 632, 639-642, 699, 706, 733, 737, 750, 792, 810, 851, 1308, 1333, 1462, 1555, 1664, 1671); fire-and-forget awaited fetches whose HTTP response is never checked (calendar update_event 1469-1485, delete_event 1563-1574); silent no-log failure where reschedule only acts if !updateError and has no else (1452-1458). NOTE: grep found ZERO .catch( occurrences - there is no .catch(()=>{}) anywhere; the defect is ignored return/error values, not unhandled promise rejections. CORS: single static corsHeaders object (index.ts:8-11) = Access-Control-Allow-Origin '*', Access-Control-Allow-Headers 'authorization, x-client-info, apikey, content-type'; no Allow-Methods, no Vary, no credentials; OPTIONS preflight returns new Response(null,{headers:corsHeaders}) default 200 (451-455); headers spread into every response. SECRETS/ENV: read only via Deno.env.get - SUPABASE_URL (459, re-read 649), SUPABASE_SERVICE_ROLE_KEY (460, re-read 650), TWILIO_AUTH_TOKEN (423), LOVABLE_API_KEY (933). Missing handling: TWILIO_AUTH_TOKEN missing fails closed, returns false then 403 (423-427); SUPABASE_URL/ROLE_KEY missing throws then swallowed to 200 (461-463); LOVABLE_API_KEY missing logs and skips AI, still 200 (933-936); env re-read at 649-650 has no null check but is unreachable in practice since 461 throws first. No secret values hardcoded; serviceRoleKey is used as Bearer to call sibling functions (651-656, 1340-1345, 1469-1474, 1563-1568, 1642-1647).

**evidence**

- index.ts:8-11 corsHeaders
- index.ts:351-360 EMPTY_TWIML + twimlResponse status=200
- index.ts:416-418 empty catch
- index.ts:423-427 TWILIO_AUTH_TOKEN fail-closed
- index.ts:443-446 isOrgAiReplyEnabled swallows error, returns true
- index.ts:459-463 env read + throw on missing supa config
- index.ts:490-496 403 text/plain, the only non-200
- index.ts:541-544 ownedErr then 200 TwiML
- index.ts:559-574 ignored error, conversation update
- index.ts:588-589 convError logged only
- index.ts:623-627 msgError logged, continues
- index.ts:649-650 env re-read, no null check
- index.ts:674-681 disposition router non-ok plus catch, log only
- index.ts:699 / 706 / 737 awaited writes, error ignored
- index.ts:933-936 LOVABLE_API_KEY missing then error and skip
- index.ts:1229-1231 AI gateway non-ok logged
- index.ts:1308-1314 newLead insert error unchecked
- index.ts:1452-1458 updateError silent no-else
- index.ts:1469-1485 and 1563-1574 awaited fetch, response unchecked
- index.ts:1615-1618 confirm non-ok silent
- index.ts:1688-1703 final 200 plus outer catch returns status 200
- grep: zero .catch( matches; throw only at line 462; HTTP status values only 403 at 491 and 200 at 1698

**validation**

Read all 1703 lines of index.ts across four passes (1-500, 500-1000, 1000-1400, 1400-1703) and verified with Select-String greps for .catch(, status:, throw , Deno.env.get, catch ( - confirming zero promise .catch handlers, only one HTTP error status (403), only one throw (config missing), and exactly four env vars.

**open_questions**

- Is returning empty TwiML 200 on internal errors intentional (Twilio only needs 200 to avoid retries) or a defect that hides failures from monitoring? Comments suggest deliberate.
- Does a monitoring/alerting layer elsewhere compensate for the swallowed errors? Not observable in this file.

**what_i_did_not_check**

- Sibling functions called here (disposition-router, sms-messaging, calendar-integration) - their own error shapes not read.
- Callers of this webhook (Twilio config, dashboards) that may parse responses.
- Runtime behavior / whether Supabase auto-delivers SUPABASE_* secrets - static analysis only, no execution.
- Whether missing CORS Allow-Methods causes any real preflight issue for Twilio (server-side posts, no CORS preflight).

**confidence**: high