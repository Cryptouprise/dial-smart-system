# ce-egress-telnyx-twilio

- status: completed
- tldr: 4-function egress/quarantine audit done; telnyx-outbound-ai is the only one with an ungated egress path.

Egress + launch-lock audit of telnyx-outbound-ai, telnyx-ai-assistant, telnyx-scheduled-events, twilio-integration (read-only, source + supabase/config.toml).

| function | egress? | verify_jwt | launch-quarantined(503)? | anon-browser reachable? | bypasses launch lock? | citations |
|---|---|---|---|---|---|---|
| telnyx-outbound-ai | YES | false (config:401) | PARTIAL: no gate helper; inline 503 only for action==='make_call' (index:133-143, status :140), before make_call egress (:307). end_call hangup egress (:409) UNGATED | CORS '*' (:25); needs Authorization -> 401 (:95-100); service-role exact match (:103) or getUser(token) 401 (:115-120). Anonymous blocked | YES: end_call path (:394-417) reaches POST hangup (:409) with no gate; make_call case (:157-356) is dead code after early return | index.ts:307,409,133-143,95-122; config.toml:401 |
| telnyx-ai-assistant | YES | true (config:398) | YES: isTelnyxAssistantManagementTenantCertified() (:79-81, false); 503 :228-238 (status :235) BEFORE any egress; 2nd 503 test_call :281-291 | CORS '*' (:27); gate 503 returns to anyone pre-auth; auth (:246-269) is dead code | NO: unconditional gate after OPTIONS (:218-220, no egress) | index.ts:79-81,228-238,368,1070,1574,1352; config.toml:398 |
| telnyx-scheduled-events | YES | true (config:421) | YES: isTelnyxScheduledEventSurfaceCertified() (:42-44, false); 503 :51-56 (status :53) BEFORE any egress; 2nd 503 schedule_call/schedule_sms :90-100 | CORS '*' (:18); gate 503 returns to anyone pre-auth | NO: unconditional gate after OPTIONS (:47-49, no egress) | index.ts:42-44,51-56,132-147,200-215,280-283; config.toml:421 |
| twilio-integration | YES (real mutations, NOT just config) | true (config:149) | YES: UNCONDITIONAL early return 503 (:34-42, status :40), no helper/condition, before any egress; :44+ dead code | CORS '*' (:6); 503 returns to anyone incl. anon; in-function auth (:57-67) dead code | NO: return at :34 unconditional; only OPTIONS (:30-32) returns earlier and does no egress | index.ts:34-42,1084-1094,597-606,1543-1551,293; config.toml:149 |

Bottom line: 3 of 4 are hard-quarantined (whole surface 503) and verify_jwt=true. telnyx-outbound-ai is the outlier: verify_jwt=false, and only a partial inline gate that leaves the end_call hangup egress (POST /v2/calls/{id}/actions/hangup) reachable; its make_call create-call case is dead code.

## Artifact

**Findings**

Egress + launch-lock audit of 4 edge functions (repo C:/Users/charl/dial-smart-system).

1) telnyx-outbound-ai: REAL egress present. POST /v2/calls (index.ts:307, inside case make_call) and POST /v2/calls/{call_control_id}/actions/hangup (index.ts:409, case end_call). No shared gate helper. An INLINE 503 covers ONLY action==='make_call' (index.ts:133-143, status 503 at :140) and it does run before the make_call egress at :307 - but that make_call case body (:157-356) is DEAD CODE because the early return at :133 fires first. The end_call hangup egress at :409 is NOT covered by any launch gate -> reachable egress that bypasses the lock. verify_jwt=false (config.toml:401). CORS '*'. In-function auth: Authorization required (:95-100 ->401); service-role exact-match branch (:103) or supabaseAdmin.auth.getUser(token) (:115-120 ->401) => anonymous (no token) blocked.

2) telnyx-ai-assistant: REAL egress present but unreachable. POST /v2/ai/assistants (:368,:1070), POST /v2/ai/assistants/{id} (:597,:849,:898,:959,:2120,:2155), POST /v2/ai/assistants/import (:1039), POST /v2/number_orders (:1574), POST /v2/ai/generate (:1352-1355), Retell list-agents (:1049). Gate helper isTelnyxAssistantManagementTenantCertified() (index.ts:79-81, hardcoded false) with 503 at :228-238 (status :235), placed BEFORE any egress. A second 503 covers action==='test_call' (:281-291). verify_jwt=true (config.toml:398). CORS '*'. Auth (:246-269) is dead code behind the gate.

3) telnyx-scheduled-events: REAL egress present but unreachable. POST /v2/ai/assistants/{id}/scheduled_events (:132-147 schedule_call; :200-215 schedule_sms) and DELETE /v2/ai/assistants/{id}/scheduled_events/{id} (:280-283). Gate helper isTelnyxScheduledEventSurfaceCertified() (index.ts:42-44, hardcoded false) with 503 at :51-56 (status :53), BEFORE any egress; second 503 for schedule_call/schedule_sms (:90-100, status :97). verify_jwt=true (config.toml:421). CORS '*'.

4) twilio-integration: REAL provider mutations (NOT merely returning config). POST trunking.twilio.com/v1/Trunks (:1084-1094), POST messaging.twilio.com/v1/Services/{sid}/PhoneNumbers (:597-606), DELETE api.twilio.com IncomingPhoneNumbers/{sid} (:1543-1551), plus many IncomingPhoneNumbers GET/POST (:293,:414,:693,:947,:1027,:1250,:1350,:1413,:1498) and Retell import-phone-number (:160,:329). ALL are dead code: the function does an UNCONDITIONAL early return 503 (index.ts:34-42, status :40) with no condition and no helper, immediately after OPTIONS; everything from :44 is unreachable. verify_jwt=true (config.toml:149). CORS '*'.

Net: 3 of 4 are hard-quarantined (whole surface 503) with verify_jwt=true. telnyx-outbound-ai is the outlier: verify_jwt=false and only a partial inline gate that leaves the end_call hangup egress open.

**evidence**

- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-outbound-ai/index.ts:307
- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-outbound-ai/index.ts:409
- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-outbound-ai/index.ts:133-143
- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-outbound-ai/index.ts:95-122
- C:/Users/charl/dial-smart-system/supabase/config.toml:401
- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-ai-assistant/index.ts:79-81
- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-ai-assistant/index.ts:228-238
- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-ai-assistant/index.ts:281-291
- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-ai-assistant/index.ts:368
- C:/Users/charl/dial-smart-system/supabase/config.toml:398
- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-scheduled-events/index.ts:42-44
- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-scheduled-events/index.ts:51-56
- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-scheduled-events/index.ts:132-147
- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-scheduled-events/index.ts:280-283
- C:/Users/charl/dial-smart-system/supabase/config.toml:421
- C:/Users/charl/dial-smart-system/supabase/functions/twilio-integration/index.ts:34-42
- C:/Users/charl/dial-smart-system/supabase/functions/twilio-integration/index.ts:1084-1094
- C:/Users/charl/dial-smart-system/supabase/functions/twilio-integration/index.ts:597-606
- C:/Users/charl/dial-smart-system/supabase/functions/twilio-integration/index.ts:1543-1551
- C:/Users/charl/dial-smart-system/supabase/config.toml:149

**validation**

Read-only static verification: read each index.ts in full or in targeted windows, grepped for fetch(/telnyxFetch/api.twilio/503/certified/CORS/serviceRoleKey/getUser/OPTIONS, and read supabase/config.toml lines 140-159 and 392-427 to confirm verify_jwt values. Confirmed HTTP methods for representative egress (POST /v2/calls, POST hangup, POST trunk create, POST service PhoneNumbers, DELETE IncomingPhoneNumbers). No code changed; no deploy or runtime execution performed.

**open_questions**

- Is supabase/config.toml the deployed config, or could live functions be deployed with different verify_jwt values?
- Is telnyx-outbound-ai end_call (hangup egress at :409) actually invoked by any live caller (e.g. a UI 'end call' button)?
- Do TELNYX_API_KEY / TWILIO_* / SUPABASE_SERVICE_ROLE_KEY secrets exist in the deployed environment (would make dead code live if a gate were flipped)?

**what_i_did_not_check**

- Runtime/deployed state: verify_jwt and 503 behavior were read from source+config, not observed against a live endpoint.
- Other telnyx-*/twilio-* functions outside the 4 requested (e.g. telnyx-webhook, twilio-sms-webhook, voice-call-action) were not audited.
- Callers of these functions (frontend, cron, other functions) were not traced, so reachability of end_call from a real client is inferred from the switch only.
- telnyx.ts/twilio.ts shared helpers: read telnyx.ts fully (it is a browser-phone provider using /telephony_credentials + /calls/{id}/actions/*); twilio.ts and utils.ts were NOT read in full.
- Whether any WAF/gateway (Supabase edge) adds CORS or auth on top of the function code.

**confidence**: high