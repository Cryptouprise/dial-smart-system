# err-ai-sms-processor

- status: completed
- tldr: Error handling: 200/{success:true} vs {error}/{code}; 6 swallowed catches, ~11 dropped-error reads; wildcard CORS; RETELL key dead.

DONE: Error-handling analysis of ai-sms-processor/index.ts (1215 lines) — response shapes, swallowed failures, CORS/env handling.
TOUCHED: none (read-only).
EVIDENCE: full-file read; all claims cite index.ts line numbers.
RESULT:
(1) SUCCESS = HTTP 200, body {success:true,...} (also {response}, {skipped}, {message_sid,generated_message,provider}, {smsPrompt}); OPTIONS = null body (131-135). ERROR = {error} (+{code} only for HttpError), status = HttpError.status else 500 (731-746); 401 {error:'Unauthorized'|'Authentication failed'} (139-147,176-184). Errors never carry {success} or {message}.
(2) Swallowed: L105 console.error no rethrow; L113-116 fail-open return true; analyzeImage 931-937 catch returns object + L926 missing response.ok check; L1003-1005, 1106-1108, 1168-1170 catch-and-log only; awaited writes with error dropped L238-241,350-354,514-516,620-634,637-640; data-only destructure drops error at L207,272,278,294,338,419,941,952,1058,1118,1174; L1210-1213 rethrows (not swallowed); no .catch(()=>{}) and no true fire-and-forget (all awaited).
(3) CORS L12-15 wildcard '*' origin, no Allow-Methods, spread into every response. Env via Deno.env.get (L149-152,569,594-595,984,987); missing SUPABASE_URL/SERVICE_ROLE_KEY (153-155), LOVABLE_API_KEY (156-158), TELNYX_API_KEY (570), Twilio creds (596) all throw->500; RETELL_AI_API_KEY read (152) but never validated/used (1180-1182); error.message returned verbatim to client (736, info-disclosure THEORY; no secret values observed).
COULD_NOT: n/a.
CONFIDENCE: high.
Blocks/follow-ups: none. Open items: wildcard CORS intent; 500-vs-400 malformed JSON (161); fail-open intent at 113-116.

## Artifact

**Findings**

FILE: dial-smart-system/supabase/functions/ai-sms-processor/index.ts (Deno/Supabase Edge Function, 1215 lines).

(1) HTTP RESPONSE SHAPES
SUCCESS: every success returns HTTP 200 (some omit the status key entirely, which defaults to 200). Standard success body is {success:true, ...}. Variants:
- {success:true,message} DNC skip lines 210-219; AI-disabled lines 324-332; human-reply-pause lines 355-363; 'Processed without response' lines 384-392.
- {success:true,message:'Processed and responded',response} lines 372-381.
- {success:true,response} (generate_response) lines 423-431.
- {success:true,skipped:true,message} lines 471-481; {success:true,message} do_not_call lines 486-495.
- {success:true,message_sid,generated_message,provider} lines 642-652.
- {success:true,smsPrompt} lines 720-728.
- OPTIONS preflight: new Response(null,{headers:corsHeaders}) lines 131-135 (null body, no Content-Type).
ERROR: NOT symmetric with success. Error bodies use {error} and optionally {code}; they never include {success:false} and never {message}.
- 401 {error:'Unauthorized'} lines 139-147.
- 401 {error:'Authentication failed'} lines 176-184.
- Central catch lines 731-746: status = HttpError.status else 500 (line 734); body = {error: error instanceof Error ? error.message : 'Unknown error'} (735-737); body.code added only when error instanceof HttpError (738). So: HttpError -> real 400/403/404/500 + {error,code}; any other Error -> 500 + {error}.

(2) SWALLOWED FAILURES (all FACT with line refs)
- L105: if(error) console.error('[AI SMS] default_organization_for_user failed:',error); -> no rethrow; falls through to L108 ORGANIZATION_REQUIRED. Error text lost.
- L113-116: isOrgAiReplyEnabled catch-equivalent: if(error){console.error(...); return true;} -> FAIL-OPEN: DB error silently enables AI replies.
- L897-938 analyzeImage: whole try/catch returns {description:'Image analysis failed',error} on failure (931-937), no rethrow; caller (L248) treats it as normal result.
- L926: analyzeImage reads response.json() WITHOUT checking response.ok -> an HTTP error body is parsed and yields 'Unable to analyze image' (L928), masking the real status/error.
- L1003-1005: catch(calErr){console.error(...)} calendar availability fetch -> swallowed, no rethrow.
- L1106-1108: catch(e){console.error('[AI SMS] Reschedule error:',e)} -> swallowed.
- L1168-1170: catch(e){console.error('[AI SMS] Calendar booking error:',e)} -> swallowed.
- L1210-1213: catch(error){console.error(...); throw error;} -> NOT swallowed (rethrows).
- Awaited-but-error-ignored DB writes (result never destructured/checked): L238-241 update sms_conversations (legacy org stamp); L350-354 update ai_paused; L514-516 update organization_id; L620-634 insert outbound sms_messages (no .select(), error dropped); L637-640 update conversation last_message_at.
- Data-only destructuring that drops `error` on reads: L207 dncEntry, L272 lead, L278 activeWorkflow, L294 globalSettings, L338 manualMessages, L419 settings, L941 recentMessages, L952 messages, L1058 leadForReschedule, L1118 leadForBooking, L1174 leadData. Each silently continues with null data on query failure.
- No `.catch(()=>{})` patterns found (FACT: none in file). No true fire-and-forget (every promise is awaited); the failure mode is dropped await results, not unhandled rejections.
- L161 await req.json(): malformed body throws, caught by outer catch -> returns 500 (should arguably be 400). FACT.

(3) CORS / SECRET / ENV
- CORS L12-15: corsHeaders = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'}. Wildcard origin, NO allowlist, and NO Access-Control-Allow-Methods header. Spread into every JSON response; OPTIONS returns it raw (131-135).
- Env read via Deno.env.get: L149 SUPABASE_URL, L150 SUPABASE_SERVICE_ROLE_KEY, L151 LOVABLE_API_KEY, L152 RETELL_AI_API_KEY, L569 TELNYX_API_KEY, L594 TWILIO_ACCOUNT_SID, L595 TWILIO_AUTH_TOKEN; re-read inline L984/987 (SUPABASE_URL, SERVICE_ROLE_KEY).
- Missing-env handling: L153-155 throws if SUPABASE_URL or SERVICE_ROLE_KEY missing; L156-158 throws if LOVABLE_API_KEY missing; L570 throws if TELNYX_API_KEY missing; L596 throws if Twilio creds missing. All become 500 via catch.
- RETELL_AI_API_KEY (L152) is read but NEVER validated/used: retell branch only logs 'not supported yet' and falls back (L1180-1182) -> dead/unchecked secret. FACT.
- Secret hygiene: Telnyx key is trimmed and stripped of non-printable chars (L569); Twilio uses Basic btoa (L602).
- Info disclosure (THEORY): catch returns error.message verbatim (L736) for non-HttpError too, so raw DB/network error strings reach the client; no secret values observed in messages, but internal error text leaks.

**evidence**

- index.ts:12-15 corsHeaders wildcard origin, no Allow-Methods
- index.ts:131-135 OPTIONS returns null body + corsHeaders
- index.ts:139-147 401 {error:'Unauthorized'}
- index.ts:176-184 401 {error:'Authentication failed'}
- index.ts:210-219 success {success:true,message} DNC
- index.ts:324-332 success {success:true,message} AI disabled
- index.ts:355-363 success {success:true,message} human-reply pause
- index.ts:372-381 success {success:true,message,response}
- index.ts:423-431 success {success:true,response}
- index.ts:471-481 success {success:true,skipped:true,message}
- index.ts:486-495 success {success:true,message} do_not_call
- index.ts:642-652 success {success:true,message_sid,generated_message,provider}
- index.ts:720-728 success {success:true,smsPrompt}
- index.ts:731-746 catch: status=HttpError.status else 500; body {error, code?}
- index.ts:105 console.error no rethrow (default_organization_for_user)
- index.ts:113-116 return true on error (fail-open AI reply)
- index.ts:926 response.json() without response.ok check
- index.ts:931-937 analyzeImage catch returns object, no rethrow
- index.ts:1003-1005 calendar fetch catch swallowed
- index.ts:1106-1108 reschedule catch swallowed
- index.ts:1168-1170 booking catch swallowed
- index.ts:1210-1213 catch rethrows (not swallowed)
- index.ts:238-241,350-354,514-516,620-634,637-640 awaited writes with error never checked
- index.ts:207,272,278,294,338,419,941,952,1058,1118,1174 data-only destructure drops error
- index.ts:161 await req.json() -> 500 on malformed body
- index.ts:149-158,569-570,594-596 env validation
- index.ts:152,1180-1182 RETELL_AI_API_KEY read but unused
- index.ts:736 error.message returned to client

**validation**

Read the entire file (1215 lines) in one pass; every cited line cross-checked against the source text. Response-shape claims verified by locating each Response(...) construction and its headers/status. Swallow claims verified by locating each catch/console.error and confirming absence of rethrow or error destructuring. No execution performed (RESEARCH ONLY).

**open_questions**

- Whether the wildcard CORS '*' is intentional (internal edge fn behind auth) or a hardening gap.
- Whether 500-for-malformed-JSON (L161) is acceptable or should be 400.
- Whether isOrgAiReplyEnabled fail-open (L113-116) is deliberate.
- Whether the truncated trailing comment at L1215 indicates a cut-off file.

**what_i_did_not_check**

- Git baseline / whether earlier versions handled errors differently
- Actual runtime env values and Supabase secrets config (not accessible, read-only)
- Callers of this function (workflow-executor, frontend) to see how they treat the 200/500 and {success}/{error} split
- The trailing truncated comment/footer beyond line 1215
- Other edge functions in the repo for cross-function consistency
- Whether any of the ignored-error DB writes are compensated elsewhere

**confidence**: high