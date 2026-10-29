# Live vs Main: Certification Gates (Phase 1 audit)

Date: 2026-10-29. Repo: `C:\Users\charl\dial-smart-system`, branch `wholesale` = GitHub main `d370432f` (2026-08-17).
Live: Supabase project `emonjusymdripmkvtttc`, 100 functions listed via `list_edge_functions`.
Read-only: grep on disk, `get_edge_function` (4 of 8 returned "MCP error -32603" on every retry), and unauthenticated / anon-key HTTP probes of live functions.

## Headline

- Gates were introduced in commit `a8393da5` "Harden Dial Smart and add Solar Exit certification gates" (2026-07-13, 150 files, +22,690 / -4,473).
- Every gated function on live was last deployed in one mass deploy at **2026-07-01 18:15 UTC** (`updated_at` 1782929711947), **12 days before** the gating commit.
- Result: **none of the 8 checked live functions has a gate.** Live is the pre-gate, fully active legacy code. Main is the Retell-only "launch containment" profile that 503s most of the platform.
- Live is also missing the `_shared` tenant/receipt modules main depends on (`tenant-context.ts`, `provider-router.ts`, `effect-ledger.ts`, `sms-boundary.ts`, `call-exposure-policy.ts`, `contact-safety.ts`, `action-contracts.ts`).

## 1. Gate inventory on main (`supabase/functions/**/index.ts`)

74 of 99 function folders reference a certification gate; 81 `*_NOT_CERTIFIED` return sites. All helper functions are hard-coded `return false`. Format: `folder: CONSTANT@line` then what it blocks.

- advanced-spam-detection: GLOBAL_SPAM_ANALYSIS_NOT_CERTIFIED@33 (whole fn) · ai-assistant-config: AI_CONFIGURATION_ASSISTANT_NOT_CERTIFIED@203 (whole fn) · ai-configuration-complete: AI_CONFIGURATION_COMPLETION_NOT_CERTIFIED@341 (whole fn)
- ai-assistant: AI_ASSISTANT_TOOL_SURFACE_NOT_TENANT_CERTIFIED@2895 (tool calls), AI_ASSISTANT_SMS_EGRESS_NOT_CERTIFIED@3007 (SMS send) · ai-autonomous-engine: AUTONOMOUS_ENGINE_NOT_TENANT_CERTIFIED@5515 (whole fn) · ai-brain: AI_BRAIN_NOT_TENANT_CERTIFIED@4659 (whole fn)
- ai-error-analyzer: AI_ERROR_ANALYZER_NOT_CERTIFIED@55 · ai-sms-processor: AI_SMS_PROCESSOR_NOT_TENANT_CERTIFIED@46 (whole fn, before auth) · ai-workflow-generator: AI_WORKFLOW_GENERATION_NOT_CERTIFIED@18 · airtable-sync: AIRTABLE_SYNC_NOT_CERTIFIED@40
- analyze-call-transcript: FALLBACK_TRANSCRIPT_ANALYSIS_NOT_TENANT_CERTIFIED@160 (non-Retell fallback) · api-gateway: EXTERNAL_API_NOT_CERTIFIED@149 (every request, before routing, 503), API_SMS_TENANT_SCHEMA_NOT_CERTIFIED@76 (used @1047,@1072 for /sms routes)
- assistable-make-call: ASSISTABLE_EGRESS_NOT_CERTIFIED@105 (Assistable dial) · autonomous-prioritization: AUTONOMOUS_PRIORITIZATION_NOT_TENANT_CERTIFIED@30 · backfill-call-agent-data: RETELL_CALL_AGENT_BACKFILL_NOT_CERTIFIED@19 · budget-tracker: PROVIDER_BUDGET_TRACKING_NOT_TENANT_CERTIFIED@37
- calendar-integration: CALENDAR_INTEGRATION_NOT_CERTIFIED@46 · call-dispatcher: FORCE_DISPATCH_NOT_CERTIFIED@417 (force_dispatch action), TELNYX_EGRESS_NOT_CERTIFIED@1666 (Telnyx queue rows), PROVIDER_NOT_CERTIFIED@1777 (Assistable queue rows); also gates callback automation @640 and auto Retell number sync @1266
- call-tracking-webhook: UNSIGNED_WEBHOOK_NOT_CERTIFIED@137 · campaign-health-monitor: CAMPAIGN_HEALTH_AUTOMATION_NOT_TENANT_CERTIFIED@37 · check-number-config: PROVIDER_ADMIN_NOT_CERTIFIED@16 · clear-voice-webhooks: CONTROL_PLANE_NOT_CERTIFIED@16
- demo-sms-reply: DEMO_SMS_AI_SPEND_NOT_CERTIFIED@163 · disposition-router: DISPOSITION_AUTOMATION_NOT_TENANT_CERTIFIED@93 (whole fn after auth; blocks DNC/queue/pipeline side effects) · elevenlabs-tts: ELEVENLABS_TTS_SPEND_NOT_CERTIFIED@29 · email-sender: EMAIL_EGRESS_NOT_TENANT_CERTIFIED@25
- enhanced-rotation-manager: ENHANCED_ROTATION_NOT_TENANT_CERTIFIED@29 · enhanced-spam-lookup: ENHANCED_SPAM_PROVIDER_SURFACE_NOT_CERTIFIED@34 · generate-daily-report: DAILY_REPORT_GENERATION_NOT_CERTIFIED@226 · ghl-batch-callback: GHL_BATCH_CALLBACK_NOT_CERTIFIED@302
- ghl-integration: GHL_MULTI_ACCOUNT_SYNC_NOT_CERTIFIED@79 · ghl-webhook-trigger: GHL_BROADCAST_WEBHOOK_NOT_CERTIFIED@91 · inbound-transfer-webhook: UNSIGNED_WEBHOOK_NOT_CERTIFIED@129 · ml-learning-engine: ML_LEARNING_NOT_TENANT_CERTIFIED@60 · nudge-scheduler: NUDGE_SCHEDULER_EGRESS_NOT_CERTIFIED@40
- outbound-calling: PROVIDER_EGRESS_NOT_CERTIFIED@299 (create_call for any provider other than retell); plus RETELL_AGENT/RETELL_CALL_DURATION_NOT_CERTIFIED throws @890-914 and gated script experiments @1721 / diagnostic logging @1750
- phone-number-purchasing: PROVIDER_ADMIN_NOT_CERTIFIED@39 · pipeline-management: PIPELINE_MANAGEMENT_NOT_TENANT_CERTIFIED@20 · predictive-dialing-engine: PREDICTIVE_DIALING_NOT_TENANT_CERTIFIED@25 · provider-management: PROVIDER_CONFIGURATION_NOT_TENANT_CERTIFIED@59
- quick-test-call: TWILIO_TEST_CALL_EGRESS_NOT_CERTIFIED@19 · reachability-scoring: REACHABILITY_SCORING_NOT_CERTIFIED@25 · remove-trunk: CONTROL_PLANE_NOT_CERTIFIED@17 · retell-agent-management / retell-llm-management / retell-phone-management: PROVIDER_ADMIN_NOT_CERTIFIED@47/@25/@31
- retell-business-verification: RETELL_BUSINESS_VERIFICATION_NOT_CERTIFIED@44 · retell-cost-backfill: RETELL_COST_BACKFILL_NOT_CERTIFIED@24 · retell-force-webhook: RETELL_MAINTENANCE_ROUTE_NOT_TENANT_CERTIFIED@24 · retell-inbound-webhook: INBOUND_DYNAMIC_VARS_NOT_CERTIFIED@46
- scheduled-spam-check: SCHEDULED_SPAM_CHECK_NOT_CERTIFIED@26 · setup-inbound-calls / setup-lady-jarvis: CONTROL_PLANE_NOT_CERTIFIED@17/@105 · sms-messaging: SMS_EGRESS_NOT_CERTIFIED@129 (send_sms), PROVIDER_ADMIN_NOT_CERTIFIED@142 (get_available_numbers, check_webhook_status, configure_webhook)
- spam-detection: SPAM_DETECTION_NOT_CERTIFIED@31 · system-health-monitor: SYSTEM_HEALTH_MONITOR_NOT_CERTIFIED@128 · telnyx-ai-assistant: TELNYX_ASSISTANT_MANAGEMENT_NOT_TENANT_CERTIFIED@232, TELNYX_TEST_CALL_EGRESS_NOT_CERTIFIED@285 · telnyx-dynamic-vars: INBOUND_DYNAMIC_VARS_NOT_CERTIFIED@29
- telnyx-insights: TELNYX_INSIGHTS_NOT_TENANT_CERTIFIED@54 · telnyx-knowledge-base: TELNYX_KNOWLEDGE_BASE_NOT_TENANT_CERTIFIED@68 · telnyx-outbound-ai: TELNYX_OUTBOUND_EGRESS_NOT_CERTIFIED@137 · telnyx-scheduled-events: ..._SURFACE_NOT_CERTIFIED@52, ..._EGRESS_NOT_CERTIFIED@94 · telnyx-webhook: TELNYX_WEBHOOK_LIFECYCLE_NOT_CERTIFIED@189
- test-workflow: WORKFLOW_TESTING_NOT_CERTIFIED@99 · twilio-amd-webhook: UNSIGNED_WEBHOOK_NOT_CERTIFIED@35 · twilio-integration: PROVIDER_ADMIN_NOT_CERTIFIED@37 · twilio-sms-webhook: UNSIGNED_WEBHOOK_NOT_CERTIFIED@316 (every non-OPTIONS request, 503) · validate-phone-numbers: PROVIDER_PHONE_INVENTORY_NOT_TENANT_CERTIFIED@82
- voice-broadcast-engine: VOICE_BROADCAST_SURFACE_NOT_TENANT_CERTIFIED@651, VOICE_BROADCAST_EGRESS_NOT_CERTIFIED@694 · voice-broadcast-queue: ..._QUEUE_NOT_TENANT_CERTIFIED@19 · voice-broadcast-tts: ..._TTS_SPEND_NOT_CERTIFIED@24
- workflow-executor: WORKFLOW_AUTOMATION_NOT_CERTIFIED@224 (every request incl. execute_pending), WORKFLOW_WEBHOOK_EGRESS_NOT_CERTIFIED@1746 (webhook step) · yellowstone-integration: YELLOWSTONE_INTEGRATION_NOT_TENANT_CERTIFIED@102
- Ungated on main (no match): automation-scheduler, credit-management, demo-call, demo-funnel-track, demo-scrape-website, law-firm-beta-submit, mcp-observer, retell-call-webhook (only `certified...` helpers), stripe-webhook, twilio-dtmf-handler, twilio-inbound-handler, twilio-tts-audio, and the Elite/observer functions.

## 2. Live function list (relevant subset)

All 8 priority functions exist live, status ACTIVE, all `updated_at` = 2026-07-01 18:15 UTC. Versions: call-dispatcher v610, outbound-calling v600, twilio-sms-webhook v532, sms-messaging v525, ai-sms-processor v524, workflow-executor v476, disposition-router v472, api-gateway v35.
Only 7 live functions were touched after that date: `mcp` (v2, 2026-07-20), `demo-call`, `demo-scrape-website`, `demo-funnel-track`, `law-firm-beta-submit` (Aug 16-17), plus `gemini-video`/`patch-grace-once` (older).
Main-only (never deployed): elite-email-mailgun-events, elite-email-release-preparation, elite-email-release-registration, elite-email-release-status, elite-solar-preflight, ghl-shadow-ingest, mcp-observer, retell-reconciler, slack-webhook, teams-observer, zapier-observer.
Live-only (not in repo): configure-sip-trunk, debug-twilio-call, gemini-video, patch-grace-once, retell-credentials-check, test-sip-call, twilio-outbound-call, twilio-termination-proxy, twilio-trust-hub.

## 3. Per-function live check

| Function | Gate on main (name, line) | Live ver | Live has gate? | Evidence | Lines live / main | Newer side |
|---|---|---|---|---|---|---|
| disposition-router | DISPOSITION_AUTOMATION_NOT_TENANT_CERTIFIED @93 | v472 | **NO** | full live source read; 0 gate strings; no `sms-boundary` import; `send_sms` auto-action invokes sms-messaging directly | ~620 / 871 | main |
| sms-messaging | SMS_EGRESS_NOT_CERTIFIED @129, PROVIDER_ADMIN_NOT_CERTIFIED @142 | v525 | **NO** | source fetch failed (MCP -32603); unauthenticated POST `get_available_numbers` returned **HTTP 200 with the Twilio number inventory**. Main returns 401 (no bearer) then 503 | ? / 939 | main |
| api-gateway | EXTERNAL_API_NOT_CERTIFIED @149 (all requests), API_SMS_TENANT_SCHEMA_NOT_CERTIFIED @76 | v35 | **NO** | source fetch failed; GET `/v1/health` returned HTTP 200 `{"ok":true,"version":"0.2.0"}`. Main 503s before routing | ? / 1933 | main (same VERSION string 0.2.0) |
| ai-sms-processor | AI_SMS_PROCESSOR_NOT_TENANT_CERTIFIED @46 (before auth) | v524 | **NO** | source fetch failed; POST with anon key returned function-level 401 `{"error":"Authentication failed"}`; main's gate precedes auth and would 503 | ? / 1104 | main |
| twilio-sms-webhook | UNSIGNED_WEBHOOK_NOT_CERTIFIED @316 (unconditional) | v532 | **NO** | source fetch failed; GET returned HTTP 200 empty TwiML `<Response></Response>`; main returns 503 JSON | ? / 1892 | main |
| call-dispatcher | FORCE_DISPATCH_NOT_CERTIFIED @417, TELNYX_EGRESS_NOT_CERTIFIED @1666, PROVIDER_NOT_CERTIFIED @1777 | v610 | **NO** | full live source: 0 gate strings; same 4 actions (health_check, status_check, force_dispatch, cleanup_stuck_calls); live imports `./manager-notify.ts` + `_shared/alerting.ts` and has `sendManagerNotification`/`raiseAlert`/`resolveAlerts`; main instead imports `_shared/provider-router.ts` + `tenant-context.ts` | 2219 / 2169 | main (live has features main dropped) |
| outbound-calling | PROVIDER_EGRESS_NOT_CERTIFIED @299 (non-Retell create_call) | v600 | **NO** | full live source: 0 gate strings; live dials Telnyx and Retell; main adds `certifiedOutboundCallingWindow`, `certifiedRetellCallDurationMinutes`, live-agent version pinning, balance reservation for max exposure | 1374 / 2246 | main |
| workflow-executor | WORKFLOW_AUTOMATION_NOT_CERTIFIED @224, WORKFLOW_WEBHOOK_EGRESS_NOT_CERTIFIED @1746 | v476 | **NO** | full live source: 0 gate strings; webhook step does a real `fetch`; no `resolve_external_effect` action, no `effect-ledger.ts` | ~1000 / 1892 | main |

## 4. Risk if main were deployed as-is

| Function | What stops working on live |
|---|---|
| api-gateway | Entire external API and the `dialsmart` MCP server (whoami, campaigns, leads, calls, send_sms) return 503 for every request. |
| sms-messaging | All SMS egress 503s (workflows, disposition auto-actions, ai-assistant, api). Also closes the live hole where number inventory is served with no auth. |
| ai-sms-processor | Inbound AI SMS replies and `generate_and_send` steps stop; every call 503s before auth. |
| twilio-sms-webhook | Twilio inbound SMS callbacks get 503 (Twilio will retry/alert); inbound texts are not recorded. |
| disposition-router | DNC, queue removal, pipeline moves, callbacks and auto-actions after a disposition all stop. |
| workflow-executor | `execute_pending` cron no-ops: no multi-step call/SMS/wait workflows run at all. |
| call-dispatcher | Retell dispatch keeps working; Telnyx and Assistable queue rows are marked blocked; `force_dispatch` 503s; callback automation off; manager notifications/alerting removed. |
| outbound-calling | Telnyx (and any non-Retell) `create_call` 503s; Retell calls additionally require agent/LLM version pinning, 08:00-21:00 window and a balance reservation for max call duration. |

Also required before main could even boot: `_shared` modules (`tenant-context.ts`, `provider-router.ts`, `sms-boundary.ts`, `effect-ledger.ts`, `action-contracts.ts`, `contact-safety.ts`, `call-exposure-policy.ts`, `retell-provider-contract.ts`, `campaign-contact-release.ts`) and whatever tables/columns the tenant-context layer expects.

## 5. Caveats

- `get_edge_function` failed deterministically for sms-messaging, api-gateway, ai-sms-processor, twilio-sms-webhook (8 attempts). Their "no gate" verdict rests on HTTP behaviour plus the shared 2026-07-01 deploy timestamp; live line counts for them are unknown.
- Live line counts for disposition-router and workflow-executor are estimates from the returned source; call-dispatcher and outbound-calling are exact.
- Probes were GET/health or read-only inventory actions; nothing was sent, dialed or written.
