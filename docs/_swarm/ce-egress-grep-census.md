# ce-egress-grep-census

- status: completed
- tldr: Egress census done: 8 dirs create calls directly, 8 indirectly; all 16 flagged functions classified (2 TRUE: assistable-make-call, api-gateway).

ce-egress-grep-census DONE. Exhaustive call-egress census of supabase/functions/ (105 dirs).

DIRECT call-creating egress (TRUE) in 8 dirs: outbound-calling (retell create-phone-call:1811; telnyx ai/assistants/{id}/calls:1271; texml/ai_calls:1308), demo-call (retell create-phone-call:350), voice-broadcast-engine (retell:121; telnyx /v2/calls:449; twilio Calls.json:396 & :575), retell-agent-management (create-web-call:503), telnyx-outbound-ai (/v2/calls:307), telnyx-ai-assistant (test-call 1985/2000), assistable-make-call (make-call:19/fetch:147).

INDIRECT egress (proxy/invoke): api-gateway (->outbound-calling:485, ->call-dispatcher:970), workflow-executor (:1468,:1678), ai-autonomous-engine (:752), call-dispatcher (:1955), automation-scheduler (:104), ai-assistant (:2259,:2336), retell-force-webhook (:134).

FLAGGED VERDICTS (phone-call egress): mcp=FALSE, mcp-observer=FALSE, ai-brain=FALSE (Retell config only), ghl-integration=FALSE, coach-decide=FALSE, coach-suggest=FALSE, yellowstone-integration=FALSE, test-workflow=FALSE (simulated), assistable-make-call=TRUE, api-gateway=TRUE (indirect), teams-observer=FALSE, zapier-observer=FALSE, ringba-enrich-proxy=FALSE (enrich lookup), voice-call=FALSE (browser leg, startOutbound returns null), voice-call-action=FALSE (in-call control), voice-token=FALSE (token mint).

Full markdown table is in the node artifact findings.

## Artifact

**Findings**

CALL-EGRESS CENSUS under supabase/functions/ (105 dirs). Direct provider call-egress (code that CREATES a phone call) lives in exactly 8 function dirs; 9 more place calls indirectly by proxying/invoking those. Full table:

DIRECT EGRESS (creates a phone call = TRUE):
| function | endpoint | file:line | real-egress? | notes |
|---|---|---|---|---|
| outbound-calling | Retell POST /v2/create-phone-call | outbound-calling/index.ts:1811 | YES | primary Retell outbound create |
| outbound-calling | Telnyx POST /v2/ai/assistants/{id}/calls | outbound-calling/index.ts:1271 | YES | Telnyx primary create |
| outbound-calling | Telnyx POST /v2/texml/ai_calls/{app} | outbound-calling/index.ts:1308 | YES | TeXML fallback create |
| demo-call | Retell POST /v2/create-phone-call | demo-call/index.ts:350 | YES | personalized demo call |
| voice-broadcast-engine | Retell POST /v2/create-phone-call | voice-broadcast-engine/index.ts:121 | YES | broadcast |
| voice-broadcast-engine | Telnyx POST /v2/calls | voice-broadcast-engine/index.ts:449 | YES | broadcast |
| voice-broadcast-engine | Twilio POST Calls.json | voice-broadcast-engine/index.ts:396 | YES | broadcast |
| voice-broadcast-engine | Twilio POST Calls.json (SIP trunk) | voice-broadcast-engine/index.ts:575 | YES | broadcast SIP |
| retell-agent-management | Retell POST /v2/create-web-call | retell-agent-management/index.ts:503 | YES (web call) | browser test call; baseUrl @83 |
| telnyx-outbound-ai | Telnyx POST /v2/calls | telnyx-outbound-ai/index.ts:307 | YES | dial then /actions/ai_assistant_start |
| telnyx-ai-assistant | Telnyx POST /v2/ai/assistants/{id}/calls | telnyx-ai-assistant/index.ts:1985 | YES | test call |
| telnyx-ai-assistant | Telnyx POST /v2/texml/ai_calls/{id} | telnyx-ai-assistant/index.ts:2000 | YES | test-call fallback |
| assistable-make-call | Assistable POST /v2/ghl/make-call | assistable-make-call/index.ts:19 (fetch @147) | YES | real Assistable egress |

INDIRECT EGRESS (proxy/invoke an egress function = TRUE via delegation):
| function | endpoint | file:line | real-egress? | notes |
|---|---|---|---|---|
| api-gateway | POST /v1/calls -> outbound-calling | api-gateway/index.ts:485 | YES (indirect) | documented route @25 |
| api-gateway | dispatch -> call-dispatcher | api-gateway/index.ts:970 | YES (indirect) | |
| workflow-executor | invoke outbound-calling | workflow-executor/index.ts:1468 | YES (indirect) | |
| workflow-executor | fetch assistable-make-call | workflow-executor/index.ts:1678 | YES (indirect) | |
| ai-autonomous-engine | fetch outbound-calling | ai-autonomous-engine/index.ts:752 | YES (indirect) | |
| call-dispatcher | invoke outbound-calling | call-dispatcher/index.ts:1955 | YES (indirect) | |
| automation-scheduler | fetch call-dispatcher | automation-scheduler/index.ts:104 | YES (indirect) | |
| ai-assistant | fetch voice-broadcast-engine | ai-assistant/index.ts:2259 | YES (indirect) | |
| ai-assistant | fetch call-dispatcher | ai-assistant/index.ts:2336 | YES (indirect) | |
| retell-force-webhook | fetch outbound-calling | retell-force-webhook/index.ts:134 | YES (indirect) | |

PROVIDER EGRESS THAT IS NOT A PHONE CALL (mutations/lookups; real-egress for calls = NO):
| function | endpoint | file:line | notes |
|---|---|---|---|
| _shared/telnyx.ts | POST /calls/{id}/actions/{cmd} | :78 | call control on existing leg |
| _shared/telnyx.ts | POST /telephony_credentials | :108 | credential create |
| _shared/twilio.ts | POST Calls/{sid}.json | :253 | hangup control |
| ai-assistant | Retell list-phone-numbers/list-agents/get-agent; create-phone-number | :1871,:2112,:2309,:1931 | provider mgmt |
| ai-brain | Retell list-agents/get-agent/get-retell-llm/update-retell-llm | :3642,:3848,:3657,:3864,:3888 | Retell config, NO call create |
| backfill-call-agent-data | Retell GET /v2/get-call | :127 | read |
| budget-tracker | Retell /v2/list-calls; Twilio Usage/Records | :216,:164,:176 | read |
| retell-call-webhook | /v2/update-call, /v2/get-call | :971,:2044 | read/update |
| retell-cost-backfill | /v2/get-call | :83 | read |
| retell-force-webhook | get-agent/update-agent | :87,:96,:173 | config |
| retell-reconciler | /v2/get-call, /v3/list-calls | :106,:132 | read |
| setup-lady-jarvis | create-retell-llm/create-agent/update-phone-number | :132,:156,:185 | config |
| system-health-monitor | list-agents | :58 | read |
| telnyx-ai-assistant | list-agents (Retell) | :1049 | read |
| twilio-integration | Retell import-phone-number/get-phone-number | :160,:329,:184 | number import |
| phone-number-purchasing | Retell create-phone-number; Twilio/Telnyx number order | :353,:200,:300 | number purchase |
| ai-sms-processor | Telnyx/Twilio Messages.json | :572,:598 | SMS egress |
| sms-messaging | Telnyx/Twilio Messages.json | :258,:329 | SMS egress |
| nudge-scheduler | Twilio Messages.json | :238 | SMS egress |
| enhanced-spam-lookup | Twilio Calls.json?From= (list), phone_numbers | :401,:636,:808,:983 | read |
| check-number-config/clear-voice-webhooks/remove-trunk/setup-inbound-calls/validate-phone-numbers | Twilio IncomingPhoneNumbers | various | number config |

FLAGGED-FUNCTION EGRESS VERDICT (true/false for PHONE-CALL egress):
mcp: FALSE (read-only MCP tools: account-summary/campaigns/leads/recent-calls/phone-number-health; src/lib/mcp/index.ts:15,20).
mcp-observer: FALSE (hard-locked disabled, MCP_OBSERVER_LAUNCH_CERTIFIED=false; observer runtime only).
ai-brain: FALSE for call egress (only Retell config list/get/update-retell-llm; indirect sms/retell-phone-mgmt invokes; no create-call).
ghl-integration: FALSE (only services.leadconnectorhq.com GHL calls).
coach-decide: FALSE (only fetch disposition-router:286).
coach-suggest: FALSE (LLM only, no provider I/O).
yellowstone-integration: FALSE (mock data:34-38).
test-workflow: FALSE (simulated 'Would call':516).
assistable-make-call: TRUE (POST api.assistable.ai/v2/ghl/make-call:19, fetch:147).
api-gateway: TRUE (indirect: POST /v1/calls -> outbound-calling:485; -> call-dispatcher:970).
teams-observer: FALSE (botframework observer only).
zapier-observer: FALSE (observer runtime only).
ringba-enrich-proxy: FALSE for call (Ringba enrich HTTP lookup display.ringba.com/enrich:21, fetch:163; not a phone call).
voice-call: FALSE (browser-first leg; _shared/telnyx.ts startOutbound:238 and twilio.ts startOutbound:224 return provider_call_id:null, no server POST /calls).
voice-call-action: FALSE (in-call control only: dtmf/hangup/transfer + register_provider_call; no new call).
voice-token: FALSE (mints telephony credential/token only).

**evidence**

- outbound-calling/index.ts:1811 fetch `${baseUrl}/create-phone-call`; :1271 fetch https://api.telnyx.com/v2/ai/assistants/{id}/calls; :1308 fetch /v2/texml/ai_calls/{app}
- demo-call/index.ts:350 fetch https://api.retellai.com/v2/create-phone-call
- voice-broadcast-engine/index.ts:121 fetch retell v2/create-phone-call; :449 fetch telnyx /v2/calls; :396 and :575 fetch twilio Calls.json POST
- retell-agent-management/index.ts:83 baseUrl='https://api.retellai.com'; :503 fetch `${baseUrl}/v2/create-web-call`
- telnyx-outbound-ai/index.ts:307 telnyxFetch('/calls','POST'); :409 /calls/{id}/actions/hangup
- telnyx-ai-assistant/index.ts:1985 /ai/assistants/{id}/calls; :2000 /texml/ai_calls/{id}
- assistable-make-call/index.ts:19 const ASSISTABLE_API_URL='https://api.assistable.ai/v2/ghl/make-call'; :147 fetch(ASSISTABLE_API_URL)
- api-gateway/index.ts:485 fetch .../functions/v1/outbound-calling; :970 fetch .../functions/v1/call-dispatcher; :25 documented POST /v1/calls
- workflow-executor/index.ts:1468 invoke outbound-calling; :1678 fetch assistable-make-call
- ai-autonomous-engine/index.ts:752 fetchFunctionJson('outbound-calling'); call-dispatcher/index.ts:1955 invoke outbound-calling
- automation-scheduler/index.ts:104 fetch call-dispatcher; retell-force-webhook/index.ts:134 fetch outbound-calling; ai-assistant/index.ts:2259 voice-broadcast-engine, :2336 call-dispatcher
- _shared/telnyx.ts:78 POST /calls/{id}/actions/{cmd}; _shared/twilio.ts:253 POST Calls/{sid}.json; voice-provider.ts:238/224 startOutbound return provider_call_id:null
- mcp/index.ts:6 imports src/lib/mcp/index.ts; src/lib/mcp/index.ts:15,20 read-only tools
- mcp-observer/index.ts:23 MCP_OBSERVER_LAUNCH_CERTIFIED=false; teams-observer/zapier-observer handler.ts comment 'no provider/CRM/queue/AI-model/callback I/O'
- quick-test-call/index.ts:19 disabled TWILIO_TEST_CALL_EGRESS_NOT_CERTIFIED

**validation**

Grep census across C:/Users/charl/dial-smart-system/supabase/functions via agentgrep for api.retellai.com (44 hits/23 files), api.telnyx.com (15/12), api.twilio.com|Calls.json|Messages.json (58/15), assistable (37/6), https://api. (145/52), create-phone-call|create-web-call|register-phone-call|create_call, call_control|texml|ai_calls|/calls, \bdial\b, telnyxFetch( (49/6), functions.invoke(|/functions/v1/ (109/46). Every direct-egress hit read at source (outbound-calling, demo-call, voice-broadcast-engine, telnyx-outbound-ai, telnyx-ai-assistant, assistable-make-call, retell-agent-management) to confirm POST-create vs read/control. Flagged functions each grepped+read.

**open_questions**

- Whether voice-broadcast-engine/index.ts:1877/2048/2142 Calls/{sid}.json transfer actions create a new leg (treated here as control on existing call).
- Whether telnyx-ai-assistant test-call paths (1985/2000) are gated to test assistants only in prod.
- Whether any SQL/cron (outside supabase/functions) triggers egress functions (out of scope for this grep).

**what_i_did_not_check**

- Non-functions/ paths (src/, supabase/migrations, cron.sql, netlify/vercel config) that may schedule/invoke egress.
- Frontend client code (src/**) that may call provider APIs directly from the browser (browser-phone WebRTC legs).
- Dynamic host construction beyond literal 'https://api.' (e.g., env-var base URLs, template hosts like https://${host}).
- Whether voice-broadcast-engine transfer calls (1877/2048/2142) create new legs vs redirect existing ones.

**confidence**: high