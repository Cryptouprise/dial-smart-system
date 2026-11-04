# ce-config-jwt-census

- status: completed
- tldr: config.toml: 90 function blocks (28 verify_jwt=false); 6 true-block call/SMS egress; 19 on-disk dirs unlisted (default true)

ce-config-jwt-census DONE. supabase/config.toml has 90 [functions.*] blocks: 62 verify_jwt=true, 28 verify_jwt=false. Of the 62 true blocks, 6 make outbound call/SMS egress to Retell/Telnyx/Twilio (ai-assistant:38 SMS; ai-sms-processor:109 SMS; nudge-scheduler:327 SMS; voice-broadcast-engine:226 call; demo-call:371 call; telnyx-ai-assistant:395 call). On disk: 109 function dirs, 19 have NO config block (default true): assistable-make-call, billing-portal, bulk-lead-import, coach-decide, coach-suggest, credit-management, demo-funnel-track, law-firm-beta-submit, ringba-enrich-proxy, teams-observer, twilio-voice-status, twilio-voice-transcription, twilio-voice-twiml, update-lead-info, voice-call, voice-call-action, voice-call-events, voice-token, zapier-observer. No config block lacks a dir. Full verbatim table + per-row file:line citations are in the node artifact.

## Artifact

**Findings**

CENSUS COMPLETE. supabase/config.toml contains 90 [functions.*] blocks (findstr count = 90; PowerShell CONFIG=90). verify_jwt=false blocks = 28. verify_jwt=true blocks = 62. Of the 62 true blocks, 6 make outbound call/SMS egress to Retell/Telnyx/Twilio. On disk there are 109 function directories (excluding _shared); 19 of them have NO config block and therefore default verify_jwt=true. No config block name lacks an on-disk directory.

SECTION 1 - verify_jwt = false (function | line | verbatim comment):
1 twilio-dtmf-handler | 11 | (block comment 9-10) 'Launch-quarantined in-function and intentionally side-effect free. Twilio callbacks will require signature verification before this route is restored.'
2 elite-email-mailgun-events | 82 | (78-81) 'Mailgun cannot present a Supabase JWT. The handler remains disabled unless a release-specific binding and both server-only HMAC keys exist...'
3 sms-messaging | 107 | (none)
4 outbound-calling | 124 | inline: 'Handles auth internally - supports both JWT and service-role calls from dispatcher'
5 call-dispatcher | 127 | inline: 'Internal service function - called by automation-scheduler'
6 ghl-shadow-ingest | 146 | (143-145) 'HighLevel cannot present a Supabase JWT. The function instead requires the exact raw-body Ed25519 signature...'
7 analyze-call-transcript | 173 | inline: 'Called internally by retell-call-webhook via service role key'
8 automation-scheduler | 193 | (190-192) 'Global scheduler authorization is enforced in-function using the exact service-role bearer or AUTOMATION_SCHEDULER_CRON_TOKEN...'
9 workflow-executor | 210 | (208-209) 'Launch-quarantined before secrets/database access; the certified scheduler dispatches only existing call queues...'
10 disposition-router | 215 | (213-214) 'Launch-quarantined before service-role construction. The legacy router is user-scoped and fans out non-transactional DNC/workflow/pipeline effects.'
11 twilio-sms-webhook | 237 | (none)
12 call-tracking-webhook | 240 | (none)
13 stripe-webhook | 245 | (243-244) 'Stripe cannot send a Supabase JWT. This route instead requires and verifies the Stripe-Signature header with STRIPE_WEBHOOK_SECRET...'
14 telnyx-webhook | 250 | (248-249) 'Launch-quarantined before body, environment, database, or provider access until immutable receipts and exact provider-object tenant routing exist.'
15 twilio-inbound-handler | 255 | (253-254) 'Launch-quarantined before parsing/database access until Twilio signatures and exact receiving-number tenant routing are certified.'
16 twilio-tts-audio | 272 | (270-271) 'Launch-quarantined in-function. A future Twilio media URL must use a short-lived signed token...'
17 retell-call-webhook | 275 | (none)
18 retell-reconciler | 281 | (278-280) 'New opaque Supabase publishable keys cannot pass the legacy JWT gate. This worker validates either the exact service-role bearer or its dedicated cron token...'
19 retell-inbound-webhook | 289 | (none)
20 inbound-transfer-webhook | 336 | (none)
21 twilio-amd-webhook | 339 | (none)
22 ghl-webhook-trigger | 384 | (382-383) 'Launch-quarantined in-function until a signed, organization-bound GHL callback can enter the canonical dispatch boundary.'
23 telnyx-outbound-ai | 401 | inline: 'Exact JWT/service auth in-function; Telnyx egress remains launch-quarantined'
24 telnyx-dynamic-vars | 406 | (404-405) 'Launch-quarantined in-function until signed requests and exact phone-number tenant ownership are certified.'
25 slack-webhook | 428 | (424-427) '...Slack cannot send a Supabase JWT - security is Slack signature verification (SLACK_SIGNING_SECRET) inside the function.'
26 mcp-observer | 434 | (431-433) '...MCP clients use a tenant-bound API-key contract inside the function; a Supabase JWT is neither expected nor sufficient.'
27 api-gateway | 444 | (442-443) 'Launch-quarantined before database/provider access. The legacy dsk_live_ control plane can bypass certified queue lifecycle and retry contracts.'
28 mcp | 449 | (447-448) 'MCP validates Supabase OAuth bearer tokens in-function and must also serve OAuth protected-resource metadata to unauthenticated connector probes.'

SECTION 2 - verify_jwt = true AND outbound call/SMS egress to Retell/Telnyx/Twilio (function | verify_jwt | config line | egress evidence):
ai-assistant | true | 38 | sms-egress: functions/ai-assistant/index.ts:1053,1218,1329 (POST api.twilio.com/.../Messages.json)
ai-sms-processor | true | 109 | sms-egress: functions/ai-sms-processor/index.ts:598 (Twilio Messages.json), :572 (POST api.telnyx.com/v2/messages)
nudge-scheduler | true | 327 | sms-egress: functions/nudge-scheduler/index.ts:238-249 (POST api.twilio.com/.../Messages.json). NOTE: config comment line 328 claims 'legacy direct SMS egress is fail-closed' - unverified whether a guard precedes line 238.
voice-broadcast-engine | true | 226 | call-egress: functions/voice-broadcast-engine/index.ts:121 (Retell POST /v2/create-phone-call), :396 and :575 (Twilio Calls.json), :449 (Telnyx POST /v2/calls)
demo-call | true | 371 | call-egress: functions/demo-call/index.ts:350 (Retell POST api.retellai.com/v2/create-phone-call)
telnyx-ai-assistant | true | 395 | call-egress: functions/telnyx-ai-assistant/index.ts:1985 (POST /ai/assistants/{id}/calls), :2000 (TeXML fallback /texml/ai_calls/{id})

SECTION 3 - on-disk function dirs with NO [functions.<name>] block (default verify_jwt=true) - 19 total:
supabase/functions/assistable-make-call, billing-portal, bulk-lead-import, coach-decide, coach-suggest, credit-management, demo-funnel-track, law-firm-beta-submit, ringba-enrich-proxy, teams-observer, twilio-voice-status, twilio-voice-transcription, twilio-voice-twiml, update-lead-info, voice-call, voice-call-action, voice-call-events, voice-token, zapier-observer
NOTE: assistable-make-call/index.ts:19,147 places outbound calls via Assistable (POST https://api.assistable.ai/v2/ghl/make-call) but is disabled in-function at :106; it is a 4th provider, not Retell/Telnyx/Twilio, so excluded from Section 2.

SECTION 4 - total [functions.*] blocks = 90.

**evidence**

- supabase/config.toml:3-449 (all 90 [functions.*] blocks; verify_jwt=false at lines 11,82,107,124,127,146,173,193,210,215,237,240,245,250,255,272,275,281,289,336,339,384,401,406,428,434,444,449) - 28 false
- findstr /n '^\[functions\.' config.toml -> 90 lines; PowerShell Select-String '^\[functions\.(.+)\]' -> CONFIG=90
- PowerShell Get-ChildItem -Directory functions (excl _shared) -> ON_DISK=109; diff -> 19 unlisted, 0 config-names-without-dir
- functions/ai-assistant/index.ts:1053,1218,1329 (Twilio Messages.json egress)
- functions/ai-sms-processor/index.ts:572 (Telnyx v2/messages), :598 (Twilio Messages.json)
- functions/nudge-scheduler/index.ts:238-249 (Twilio POST Messages.json)
- functions/voice-broadcast-engine/index.ts:121 (Retell create-phone-call), :396/:575 (Twilio Calls.json), :449 (Telnyx v2/calls)
- functions/demo-call/index.ts:350 (Retell create-phone-call)
- functions/telnyx-ai-assistant/index.ts:1985,2000 (Telnyx outbound call)
- functions/assistable-make-call/index.ts:19,147 (Assistable make-call) :106 (disabled guard)
- Non-egress provider users (checked, excluded): ai-brain/index.ts:3642,3657,3848,3888 (Retell mgmt only), backfill-call-agent-data/index.ts:127 (Retell get-call), budget-tracker/index.ts:164,176 (Twilio Usage records GET), system-health-monitor/index.ts:58 (Retell list-agents), retell-cost-backfill/index.ts:83 (Retell get-call), enhanced-spam-lookup/index.ts:401 (Twilio Calls.json GET lookup), twilio-integration/index.ts:152,322 (termination_uri config, not egress)

**validation**

config.toml read in full (449 lines). False-count cross-checked two ways: findstr of 'verify_jwt = false' (28 lines) and manual block-by-block scan. Block count cross-checked: findstr '^\[functions\.' = 90 and PowerShell regex = 90. Directory diff done programmatically (PowerShell), not by eye: ON_DISK=109, CONFIG=90, unlisted=19, config-names-without-dir=0. Egress classification done by grepping every index.ts + _shared for the provider egress endpoints (create-phone-call, v2/calls, v2/messages, Messages.json POST, Calls.json POST, /ai/assistants/{id}/calls) and reading the matched lines; each egress row has the exact file:line.

**open_questions**

- Is nudge-scheduler's SMS egress at line 238 actually unreachable (config comment line 328 says 'fail-closed')? A guard check is needed to resolve the comment-vs-code discrepancy.
- Do any verify_jwt=true functions egress indirectly via _shared helpers or via api-gateway routing to outbound-calling? voice-call/voice-call-action/voice-call-events/voice-token (unlisted, default true) import _shared/voice-provider.ts; no egress endpoints were found in that shared module, but its full body was not read.
- What do the other unlisted dirs (bulk-lead-import, billing-portal, credit-management, demo-funnel-track, law-firm-beta-submit, ringba-enrich-proxy, teams-observer, update-lead-info, zapier-observer) do, and do any touch egress?

**what_i_did_not_check**

- Runtime reachability of each egress line (launch-quarantine guards returning 503 before egress) - the census reports code capability, not live reachability.
- Full body of _shared/voice-provider.ts, _shared/twilio.ts (only endpoint-grepped); helper-based egress via a different base-URL constant could be missed.
- Bodies of unlisted dirs bulk-lead-import, billing-portal, credit-management, demo-funnel-track, law-firm-beta-submit, ringba-enrich-proxy, teams-observer, update-lead-info, zapier-observer.
- api-gateway's routing targets (it is verify_jwt=false but may proxy egress on behalf of other functions).
- Whether config.toml is the deployed config (no check against the live Supabase project's actual verify_jwt settings).

**confidence**: medium