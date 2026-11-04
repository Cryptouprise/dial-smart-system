# The 503 certification gates: keep, flip or remove - reviewer qwen/qwen3.8-flash

cost: $0.0151

---

## Scope / evidence caveat

This is a **subset review**. I can see the `NOT_CERTIFIED` grep census, the `return false` grep census, the live-function inventory, and `tenant-context.ts`. I cannot see the surrounding gate bodies, env toggles, request-auth shape, `verify_jwt` for most live functions, deployment config, or the actual live snapshot files. Therefore:

- **FACT**: line-cited counts and README assertions.
- **THEORY**: what each gate disables and KEEP/FLIP/REMOVE classification, inferred from the error-code name, visible `return false`/disabled-response lines, and live-status.

---

## 1. Census: 73 `NOT_CERTIFIED` occurrences

I counted **73** grep hits.

### Live-function occurrences: 12

These are in slugs listed as live in `supabase/functions-live/README.md:22-33`.

| live slug | file:line | code |
|---|---:|---|
| `call-dispatcher` | `supabase/functions/call-dispatcher/index.ts:417` | `FORCE_DISPATCH_NOT_CERTIFIED` |
| `call-dispatcher` | `supabase/functions/call-dispatcher/index.ts:1666` | `TELNYX_EGRESS_NOT_CERTIFIED` |
| `call-dispatcher` | `supabase/functions/call-dispatcher/index.ts:1777` | `PROVIDER_NOT_CERTIFIED` |
| `outbound-calling` | `supabase/functions/outbound-calling/index.ts:299` | `PROVIDER_EGRESS_NOT_CERTIFIED` |
| `outbound-calling` | `supabase/functions/outbound-calling/index.ts:890` | `RETELL_CALL_DURATION_NOT_CERTIFIED` throw |
| `outbound-calling` | `supabase/functions/outbound-calling/index.ts:899` | `RETELL_AGENT_NOT_CERTIFIED` throw |
| `outbound-calling` | `supabase/functions/outbound-calling/index.ts:903` | `RETELL_AGENT_NOT_CERTIFIED` throw |
| `outbound-calling` | `supabase/functions/outbound-calling/index.ts:907` | `RETELL_AGENT_NOT_CERTIFIED` throw |
| `outbound-calling` | `supabase/functions/outbound-calling/index.ts:914` | `RETELL_AGENT_NOT_CERTIFIED` throw |
| `telnyx-webhook` | `supabase/functions/telnyx-webhook/index.ts:189` | `TELNYX_WEBHOOK_LIFECYCLE_NOT_CERTIFIED` |
| `workflow-executor` | `supabase/functions/workflow-executor/index.ts:224` | `WORKFLOW_AUTOMATION_NOT_CERTIFIED` |
| `workflow-executor` | `supabase/functions/workflow-executor/index.ts:1746` | `WORKFLOW_WEBHOOK_EGRESS_NOT_CERTIFIED` |

**FACT**: README says the `*_NOT_CERTIFIED` 503 gates exist only on GitHub `main`, never live: `supabase/functions-live/README.md:79-80`. It also says `main` carries unreleased 503 certification-gate changes that live does not have: `supabase/functions-live/README.md:9-10`.

---

### Shared occurrences: 14

These are not standalone edge-function slugs, but they can affect live `outbound-calling` if imported.

| file:line | code/message |
|---|---:|
| `supabase/functions/_shared/call-exposure-policy.ts:12` | `RETELL_CALL_DURATION_NOT_CERTIFIED` |
| `supabase/functions/_shared/call-exposure-policy.ts:18` | `RETELL_CALL_DURATION_NOT_CERTIFIED` |
| `supabase/functions/_shared/retell-provider-contract.ts:93` | `RETELL_AGENT_NOT_CERTIFIED` |
| `supabase/functions/_shared/retell-provider-contract.ts:96` | `RETELL_AGENT_NOT_CERTIFIED` |
| `supabase/functions/_shared/retell-provider-contract.ts:99` | `RETELL_AGENT_NOT_CERTIFIED` |
| `supabase/functions/_shared/retell-provider-contract.ts:102` | `RETELL_AGENT_NOT_CERTIFIED` |
| `supabase/functions/_shared/retell-provider-contract.ts:105` | `RETELL_AGENT_NOT_CERTIFIED` |
| `supabase/functions/_shared/retell-provider-contract.ts:108` | `RETELL_AGENT_NOT_CERTIFIED` |
| `supabase/functions/_shared/retell-provider-contract.ts:111` | `RETELL_AGENT_NOT_CERTIFIED` |
| `supabase/functions/_shared/retell-provider-contract.ts:114` | `RETELL_AGENT_NOT_CERTIFIED` |
| `supabase/functions/_shared/retell-provider-contract.ts:120` | `RETELL_AGENT_NOT_CERTIFIED` |
| `supabase/functions/_shared/retell-provider-contract.ts:128` | `RETELL_AGENT_NOT_CERTIFIED` |
| `supabase/functions/_shared/retell-provider-contract.ts:147` | `RETELL_AGENT_NOT_CERTIFIED` |
| `supabase/functions/_shared/retell-provider-contract.ts:151` | `RETELL_AGENT_NOT_CERTIFIED` |

---

### Non-live function occurrences: 47

| file:line | code |
|---|---:|
| `supabase/functions/advanced-spam-detection/index.ts:33` | `GLOBAL_SPAM_ANALYSIS_NOT_CERTIFIED` |
| `supabase/functions/ai-assistant/index.ts:3007` | `AI_ASSISTANT_SMS_EGRESS_NOT_CERTIFIED` |
| `supabase/functions/ai-assistant-config/index.ts:203` | `AI_CONFIGURATION_ASSISTANT_NOT_CERTIFIED` |
| `supabase/functions/ai-configuration-complete/index.ts:341` | `AI_CONFIGURATION_COMPLETION_NOT_CERTIFIED` |
| `supabase/functions/ai-error-analyzer/index.ts:55` | `AI_ERROR_ANALYZER_NOT_CERTIFIED` |
| `supabase/functions/ai-workflow-generator/index.ts:18` | `AI_WORKFLOW_GENERATION_NOT_CERTIFIED` |
| `supabase/functions/airtable-sync/index.ts:40` | `AIRTABLE_SYNC_NOT_CERTIFIED` |
| `supabase/functions/assistable-make-call/index.ts:105` | `ASSISTABLE_EGRESS_NOT_CERTIFIED` |
| `supabase/functions/backfill-call-agent-data/index.ts:19` | `RETELL_CALL_AGENT_BACKFILL_NOT_CERTIFIED` |
| `supabase/functions/calendar-integration/index.ts:46` | `CALENDAR_INTEGRATION_NOT_CERTIFIED` |
| `supabase/functions/call-tracking-webhook/index.ts:137` | `UNSIGNED_WEBHOOK_NOT_CERTIFIED` |
| `supabase/functions/check-number-config/index.ts:16` | `PROVIDER_ADMIN_NOT_CERTIFIED` |
| `supabase/functions/clear-voice-webhooks/index.ts:16` | `CONTROL_PLANE_NOT_CERTIFIED` |
| `supabase/functions/demo-sms-reply/index.ts:163` | `DEMO_SMS_AI_SPEND_NOT_CERTIFIED` |
| `supabase/functions/elevenlabs-tts/index.ts:29` | `ELEVENLABS_TTS_SPEND_NOT_CERTIFIED` |
| `supabase/functions/enhanced-spam-lookup/index.ts:34` | `ENHANCED_SPAM_PROVIDER_SURFACE_NOT_CERTIFIED` |
| `supabase/functions/generate-daily-report/index.ts:226` | `DAILY_REPORT_GENERATION_NOT_CERTIFIED` |
| `supabase/functions/ghl-batch-callback/index.ts:302` | `GHL_BATCH_CALLBACK_NOT_CERTIFIED` |
| `supabase/functions/ghl-integration/index.ts:79` | `GHL_MULTI_ACCOUNT_SYNC_NOT_CERTIFIED` |
| `supabase/functions/ghl-webhook-trigger/index.ts:91` | `GHL_BROADCAST_WEBHOOK_NOT_CERTIFIED` |
| `supabase/functions/inbound-transfer-webhook/index.ts:129` | `UNSIGNED_WEBHOOK_NOT_CERTIFIED` |
| `supabase/functions/nudge-scheduler/index.ts:40` | `NUDGE_SCHEDULER_EGRESS_NOT_CERTIFIED` |
| `supabase/functions/phone-number-purchasing/index.ts:39` | `PROVIDER_ADMIN_NOT_CERTIFIED` |
| `supabase/functions/quick-test-call/index.ts:19` | `TWILIO_TEST_CALL_EGRESS_NOT_CERTIFIED` |
| `supabase/functions/reachability-scoring/index.ts:25` | `REACHABILITY_SCORING_NOT_CERTIFIED` |
| `supabase/functions/remove-trunk/index.ts:17` | `CONTROL_PLANE_NOT_CERTIFIED` |
| `supabase/functions/retell-agent-management/index.ts:47` | `PROVIDER_ADMIN_NOT_CERTIFIED` |
| `supabase/functions/retell-business-verification/index.ts:44` | `RETELL_BUSINESS_VERIFICATION_NOT_CERTIFIED` |
| `supabase/functions/retell-cost-backfill/index.ts:24` | `RETELL_COST_BACKFILL_NOT_CERTIFIED` |
| `supabase/functions/retell-inbound-webhook/index.ts:46` | `INBOUND_DYNAMIC_VARS_NOT_CERTIFIED` |
| `supabase/functions/retell-llm-management/index.ts:25` | `PROVIDER_ADMIN_NOT_CERTIFIED` |
| `supabase/functions/retell-phone-management/index.ts:31` | `PROVIDER_ADMIN_NOT_CERTIFIED` |
| `supabase/functions/scheduled-spam-check/index.ts:26` | `SCHEDULED_SPAM_CHECK_NOT_CERTIFIED` |
| `supabase/functions/setup-inbound-calls/index.ts:17` | `CONTROL_PLANE_NOT_CERTIFIED` |
| `supabase/functions/setup-lady-jarvis/index.ts:105` | `CONTROL_PLANE_NOT_CERTIFIED` |
| `supabase/functions/spam-detection/index.ts:31` | `SPAM_DETECTION_NOT_CERTIFIED` |
| `supabase/functions/system-health-monitor/index.ts:128` | `SYSTEM_HEALTH_MONITOR_NOT_CERTIFIED` |
| `supabase/functions/telnyx-ai-assistant/index.ts:285` | `TELNYX_TEST_CALL_EGRESS_NOT_CERTIFIED` |
| `supabase/functions/telnyx-dynamic-vars/index.ts:29` | `INBOUND_DYNAMIC_VARS_NOT_CERTIFIED` |
| `supabase/functions/telnyx-outbound-ai/index.ts:137` | `TELNYX_OUTBOUND_EGRESS_NOT_CERTIFIED` |
| `supabase/functions/telnyx-scheduled-events/index.ts:52` | `TELNYX_SCHEDULED_EVENT_SURFACE_NOT_CERTIFIED` |
| `supabase/functions/telnyx-scheduled-events/index.ts:94` | `TELNYX_SCHEDULED_EGRESS_NOT_CERTIFIED` |
| `supabase/functions/test-workflow/index.ts:99` | `WORKFLOW_TESTING_NOT_CERTIFIED` |
| `supabase/functions/twilio-amd-webhook/index.ts:35` | `UNSIGNED_WEBHOOK_NOT_CERTIFIED` |
| `supabase/functions/twilio-integration/index.ts:37` | `PROVIDER_ADMIN_NOT_CERTIFIED` |
| `supabase/functions/voice-broadcast-engine/index.ts:694` | `VOICE_BROADCAST_EGRESS_NOT_CERTIFIED` |
| `supabase/functions/voice-broadcast-tts/index.ts:24` | `VOICE_BROADCAST_TTS_SPEND_NOT_CERTIFIED` |

Total: `12 live + 14 shared + 47 non-live = 73`.

---

## 2. Visible gate classification

Legend:

- **RF visible** = grep shows literal `return false;` in the same file. This does **not** prove “no env toggle” because surrounding code is not supplied.
- **No RF visible** = only the `NOT_CERTIFIED` label, disabled-response, or throw is visible.
- **Class** is **THEORY** from the error-code name and live status.

---

### A. REMOVE: live-parity blanket gates

These are on live slugs. Current live behaviour is ungated per `README.md:79-80`. Deploying them as blanket 503/return-false gates would regress live availability.

| gate file:line(s) | disables | RF visible? | class | reason |
|---|---|---:|---|---|
| `supabase/functions/call-dispatcher/index.ts:417`, `:1666`, `:1777`; RF at `:16`, `:20`, `:24` | force dispatch, Telnyx egress, provider selection | Yes | REMOVE for deploy parity | live `call-dispatcher` exists in `README.md:28`; README says live has no 503 certification gates: `README.md:79-80` |
| `supabase/functions/outbound-calling/index.ts:299`; RF at `:65`, `:69` | provider egress from outbound calling | Yes | REMOVE for deploy parity | live `outbound-calling` exists in `README.md:26`; no live gate per `README.md:79-80` |
| `supabase/functions/telnyx-webhook/index.ts:189`; RF at `:128`, `:132`, `:168`, `:173` | Telnyx webhook lifecycle handling | Yes | REMOVE for deploy parity | live `telnyx-webhook` exists in `README.md:27`; no live gate per `README.md:79-80` |
| `supabase/functions/workflow-executor/index.ts:224`, `:1746`; RF at `:35` | workflow automation and workflow webhook egress | Yes | REMOVE for deploy parity | live `workflow-executor` exists in `README.md:30`; no live gate per `README.md:79-80` |

---

### B. FLIP: safe once named small tests pass

These are either non-live surfaces or runtime contract assertions that can be enabled only after a targeted test proves current live traffic would not regress.

| gate file:line(s) | disables | RF visible? | class | named test |
|---|---|---:|---|---|
| `supabase/functions/outbound-calling/index.ts:890`, `:899`, `:903`, `:907`, `:914`; shared `supabase/functions/_shared/call-exposure-policy.ts:12`, `:18`; shared `supabase/functions/_shared/retell-provider-contract.ts:93-151` | Retell call if duration/agent/LLM/webhook/tool contract fails | No; throws | FLIP | `retell-live-agent-contract-test`: current live Retell agent/LLM passes version, published, response-engine, webhook, tool, and max-duration checks |
| `supabase/functions/advanced-spam-detection/index.ts:33`; RF at `:11` | global spam analysis | Yes | FLIP | `spam-analysis-tenant-budget-test` |
| `supabase/functions/ai-assistant-config/index.ts:203`; RF at `:194` | AI configuration assistant | Yes | FLIP | `ai-config-auth-tenant-test` |
| `supabase/functions/ai-configuration-complete/index.ts:341`; RF at `:332` | AI configuration completion | Yes | FLIP | `ai-config-auth-tenant-test` |
| `supabase/functions/ai-error-analyzer/index.ts:55`; RF at `:46` | AI error analysis | Yes | FLIP | `tenant-diagnostics-auth-test` |
| `supabase/functions/ai-workflow-generator/index.ts:18`; RF at `:9` | AI workflow generation | Yes | FLIP | `workflow-generation-tenant-budget-test` |
| `supabase/functions/airtable-sync/index.ts:40`; RF at `:11` | Airtable sync | Yes | FLIP | `airtable-auth-boundary-test` |
| `supabase/functions/backfill-call-agent-data/index.ts:19`; RF at `:10` | Retell call-agent backfill | Yes | FLIP | `backfill-service-auth-test` |
| `supabase/functions/calendar-integration/index.ts:46` | calendar integration | No visible top-level RF | FLIP | `calendar-auth-egress-test` |
| `supabase/functions/demo-sms-reply/index.ts:163`; RF at `:154` | demo SMS AI spend | Yes | FLIP | `demo-sms-budget-auth-test` |
| `supabase/functions/enhanced-spam-lookup/index.ts:34`; RF at `:25` | enhanced spam/provider operations | Yes | FLIP | `enhanced-spam-provider-identity-test` |
| `supabase/functions/generate-daily-report/index.ts:226`; RF at `:17` | daily report generation | Yes | FLIP | `daily-report-tenant-auth-test` |
| `supabase/functions/reachability-scoring/index.ts:25`; RF at `:10` | reachability scoring | Yes | FLIP | `reachability-tenant-auth-test` |
| `supabase/functions/retell-cost-backfill/index.ts:24`; RF at `:9` | Retell cost backfill | Yes | FLIP | `cost-backfill-service-auth-test` |
| `supabase/functions/scheduled-spam-check/index.ts:26`; RF at `:11` | scheduled spam check | Yes | FLIP | `scheduled-spam-auth-budget-test` |
| `supabase/functions/spam-detection/index.ts:31`; RF at `:11` | spam detection | Yes | FLIP | `spam-detection-tenant-auth-test` |
| `supabase/functions/system-health-monitor/index.ts:128`; RF at `:11` | system health monitor | Yes | FLIP | `health-monitor-auth-test` |
| `supabase/functions/telnyx-scheduled-events/index.ts:52`; RF at `:43` | Telnyx scheduled-event surface | Yes | FLIP | `telnyx-scheduled-surface-auth-test` |
| `supabase/functions/test-workflow/index.ts:99`; RF at `:24` | workflow testing | Yes | FLIP | `workflow-test-auth-tenant-test` |

---

### C. KEEP: protects dangerous or unauthenticated surfaces

These are mostly non-live in the supplied live inventory. If they are deployed from `main`, they should remain gated unless replaced by stronger auth/tenant checks.

| gate group | file:line(s) | disables | RF visible? | class |
|---|---|---|---:|---|
| Provider admin | `check-number-config/index.ts:16`, `phone-number-purchasing/index.ts:39`, `retell-agent-management/index.ts:47`, `retell-llm-management/index.ts:25`, `retell-phone-management/index.ts:31`, `twilio-integration/index.ts:37` | provider admin/configuration/purchasing | No | KEEP |
| Control plane | `clear-voice-webhooks/index.ts:16`, `remove-trunk/index.ts:17`, `setup-inbound-calls/index.ts:17`, `setup-lady-jarvis/index.ts:105` | voice/webhook/trunk/inbound setup | No | KEEP |
| Unsigned webhook | `call-tracking-webhook/index.ts:137`, `inbound-transfer-webhook/index.ts:129`, `twilio-amd-webhook/index.ts:35` | unsigned webhook handling | No | KEEP |
| Business verification | `retell-business-verification/index.ts:44`; RF at `:35` | Retell business verification | Yes | KEEP |
| Inbound dynamic vars | `retell-inbound-webhook/index.ts:46`, `telnyx-dynamic-vars/index.ts:29` | inbound dynamic-var handling | No | KEEP |
| SMS/AI egress | `ai-assistant/index.ts:3007`; RF at `:2879` | AI assistant SMS egress | Yes, not top-level | KEEP |
| Call/test egress | `assistable-make-call/index.ts:105`; RF at `:22`; `quick-test-call/index.ts:19`; `telnyx-ai-assistant/index.ts:285`; RF at `:80`; `telnyx-outbound-ai/index.ts:137` | outbound/test call egress | mixed | KEEP |
| TTS/spend egress | `elevenlabs-tts/index.ts:
