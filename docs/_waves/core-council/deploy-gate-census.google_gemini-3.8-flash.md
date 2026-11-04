# The 503 certification gates: keep, flip or remove - reviewer google/gemini-3.8-flash

cost: $0.0423

---

### 1. Visibility & Subset Disclaimer
**Subset Notice:** The full file contents are **not** present in the supplied evidence for all edge functions. The evidence contains only:
- Exact grep hit lines for all 73 occurrences of `NOT_CERTIFIED`
- Grep hit lines for `return false`
- Full text of `supabase/functions-live/README.md` and `supabase/functions/_shared/tenant-context.ts`

Surrounding function blocks, local environment variable reads, and request handling blocks for most functions are unviewable in this excerpt. Statements on gate mechanisms outside the grep matches are marked as FACT (where visible in grep) or THEORY (inferred from surrounding structure).

---

### 2. Census of `NOT_CERTIFIED` Gates

Across the 73 hits, gates fall into 5 distinct architectural clusters:

#### Cluster A: Blanket Service/Feature Disables (Top-of-File Gates)
* **Error codes & locations:**
  - `GLOBAL_SPAM_ANALYSIS_NOT_CERTIFIED` (`advanced-spam-detection/index.ts:33`)
  - `AI_ASSISTANT_SMS_EGRESS_NOT_CERTIFIED` (`ai-assistant/index.ts:3007`)
  - `AI_CONFIGURATION_ASSISTANT_NOT_CERTIFIED` (`ai-assistant-config/index.ts:203`)
  - `AI_CONFIGURATION_COMPLETION_NOT_CERTIFIED` (`ai-configuration-complete/index.ts:341`)
  - `AI_ERROR_ANALYZER_NOT_CERTIFIED` (`ai-error-analyzer/index.ts:55`)
  - `AI_WORKFLOW_GENERATION_NOT_CERTIFIED` (`ai-workflow-generator/index.ts:18`)
  - `AIRTABLE_SYNC_NOT_CERTIFIED` (`airtable-sync/index.ts:40`)
  - `ASSISTABLE_EGRESS_NOT_CERTIFIED` (`assistable-make-call/index.ts:105`)
  - `RETELL_CALL_AGENT_BACKFILL_NOT_CERTIFIED` (`backfill-call-agent-data/index.ts:19`)
  - `CALENDAR_INTEGRATION_NOT_CERTIFIED` (`calendar-integration/index.ts:46`)
  - `DEMO_SMS_AI_SPEND_NOT_CERTIFIED` (`demo-sms-reply/index.ts:163`)
  - `ELEVENLABS_TTS_SPEND_NOT_CERTIFIED` (`elevenlabs-tts/index.ts:29`)
  - `ENHANCED_SPAM_PROVIDER_SURFACE_NOT_CERTIFIED` (`enhanced-spam-lookup/index.ts:34`)
  - `DAILY_REPORT_GENERATION_NOT_CERTIFIED` (`generate-daily-report/index.ts:226`)
  - `GHL_BATCH_CALLBACK_NOT_CERTIFIED` (`ghl-batch-callback/index.ts:302`)
  - `GHL_MULTI_ACCOUNT_SYNC_NOT_CERTIFIED` (`ghl-integration/index.ts:79`)
  - `GHL_BROADCAST_WEBHOOK_NOT_CERTIFIED` (`ghl-webhook-trigger/index.ts:91`)
  - `NUDGE_SCHEDULER_EGRESS_NOT_CERTIFIED` (`nudge-scheduler/index.ts:40`)
  - `TWILIO_TEST_CALL_EGRESS_NOT_CERTIFIED` (`quick-test-call/index.ts:19`)
  - `REACHABILITY_SCORING_NOT_CERTIFIED` (`reachability-scoring/index.ts:25`)
  - `RETELL_BUSINESS_VERIFICATION_NOT_CERTIFIED` (`retell-business-verification/index.ts:44`)
  - `RETELL_COST_BACKFILL_NOT_CERTIFIED` (`retell-cost-backfill/index.ts:24`)
  - `SCHEDULED_SPAM_CHECK_NOT_CERTIFIED` (`scheduled-spam-check/index.ts:26`)
  - `SPAM_DETECTION_NOT_CERTIFIED` (`spam-detection/index.ts:31`)
  - `SYSTEM_HEALTH_MONITOR_NOT_CERTIFIED` (`system-health-monitor/index.ts:128`)
  - `TELNYX_TEST_CALL_EGRESS_NOT_CERTIFIED` (`telnyx-ai-assistant/index.ts:285`)
  - `TELNYX_OUTBOUND_EGRESS_NOT_CERTIFIED` (`telnyx-outbound-ai/index.ts:137`)
  - `TELNYX_SCHEDULED_EVENT_SURFACE_NOT_CERTIFIED` & `TELNYX_SCHEDULED_EGRESS_NOT_CERTIFIED` (`telnyx-scheduled-events/index.ts:52, 94`)
  - `WORKFLOW_TESTING_NOT_CERTIFIED` (`test-workflow/index.ts:99`)
  - `VOICE_BROADCAST_EGRESS_NOT_CERTIFIED` & `VOICE_BROADCAST_TTS_SPEND_NOT_CERTIFIED` (`voice-broadcast-engine/index.ts:694`, `voice-broadcast-tts/index.ts:24`)
* **What each disables:** Shuts down execution entirely (returns HTTP 503 / `{ disabled: true }`) for outbound sync, AI generation, voice/SMS egress, and scheduled workers.
* **Mechanism:** Correlated directly with literal early `return false` statements (e.g., `ai-workflow-generator/index.ts:9`, `airtable-sync/index.ts:11`, `elevenlabs-tts/index.ts:15`) preceding the response. There is no env toggle in the grep hits.
* **Classification:** **FLIP** (for background syncs/tools needing verification) or **REMOVE** (if live functionality requires them running ungated). Specifically:
  - Spend/Egress (`ELEVENLABS_TTS_SPEND_NOT_CERTIFIED`, `VOICE_BROADCAST_EGRESS_NOT_CERTIFIED`, `DEMO_SMS_AI_SPEND_NOT_CERTIFIED`): **FLIP** (safe once small synthetic egress/spend-cap test passes).
  - Internal utility/read-only tools: **REMOVE** (revert to live state so deployed features aren't severed).

#### Cluster B: Core Dialing & Dispatching Live Engines
* **Error codes & locations:**
  - `FORCE_DISPATCH_NOT_CERTIFIED`, `TELNYX_EGRESS_NOT_CERTIFIED`, `PROVIDER_NOT_CERTIFIED` (`call-dispatcher/index.ts:417, 1666, 1777`)
  - `PROVIDER_EGRESS_NOT_CERTIFIED` (`outbound-calling/index.ts:299`)
  - `TELNYX_WEBHOOK_LIFECYCLE_NOT_CERTIFIED` (`telnyx-webhook/index.ts:189`)
  - `WORKFLOW_AUTOMATION_NOT_CERTIFIED`, `WORKFLOW_WEBHOOK_EGRESS_NOT_CERTIFIED` (`workflow-executor/index.ts:224, 1746`)
* **What each disables:** Blocks active campaign dialing, force dispatching leads, webhook handling, and step execution in the workflow engine.
* **Mechanism:** Hardcoded literal `return false` guards (e.g. `call-dispatcher/index.ts:16, 20, 24`, `outbound-calling/index.ts:65, 69`, `workflow-executor/index.ts:35`).
* **Classification:** **REMOVE**. Live runs these functions ungated (`README.md:25-30, 79-80`). Deploying `main` with these gates active instantly breaks core dialing and dispatching in production.

#### Cluster C: Unsigned Inbound Webhooks
* **Error codes & locations:**
  - `UNSIGNED_WEBHOOK_NOT_CERTIFIED` (`call-tracking-webhook/index.ts:137`, `inbound-transfer-webhook/index.ts:129`, `twilio-amd-webhook/index.ts:35`)
  - `INBOUND_DYNAMIC_VARS_NOT_CERTIFIED` (`retell-inbound-webhook/index.ts:46`, `telnyx-dynamic-vars/index.ts:29`)
* **What each disables:** Rejects incoming webhook payloads that lack cryptographic provider signatures or verified caller auth.
* **Mechanism:** Conditional failure returning error status when signature verification fails.
* **Classification:** **KEEP**. Protects webhook endpoints from arbitrary unauthenticated caller forgery and injection.

#### Cluster D: Provider Admin & Control Plane Egress
* **Error codes & locations:**
  - `PROVIDER_ADMIN_NOT_CERTIFIED` (`check-number-config/index.ts:16`, `phone-number-purchasing/index.ts:39`, `retell-agent-management/index.ts:47`, `retell-llm-management/index.ts:25`, `retell-phone-management/index.ts:31`, `twilio-integration/index.ts:37`)
  - `CONTROL_PLANE_NOT_CERTIFIED` (`clear-voice-webhooks/index.ts:16`, `remove-trunk/index.ts:17`, `setup-inbound-calls/index.ts:17`, `setup-lady-jarvis/index.ts:105`)
* **What each disables:** Direct modification of telecommunication provider infrastructure (purchasing phone numbers, mutating Retell LLMs/agents, deleting SIP trunks, clearing voice webhooks).
* **Mechanism:** Immediate entry block (throwing or returning 503 response).
* **Classification:** **KEEP** until authenticated tenant isolation (`assertTenantResourceOwnership` / `tenant-context.ts`) is verified; then **FLIP** once tenant admin tests pass.

#### Cluster E: Retell Runtime Provider Assertions
* **Error codes & locations:**
  - `RETELL_CALL_DURATION_NOT_CERTIFIED` (`outbound-calling/index.ts:890`, `_shared/call-exposure-policy.ts:12, 18`)
  - `RETELL_AGENT_NOT_CERTIFIED` (`outbound-calling/index.ts:899, 903, 907, 914`, `_shared/retell-provider-contract.ts:93, 96, 99, 102, 105, 108, 111, 114, 120, 128, 147, 151` [12 occurrences])
* **What each disables:** Validates that Retell agents use pinned versions, canonical signed webhooks, authorized LLMs, approved tool definitions, and duration limits under `LAUNCH_MAX_RETELL_CALL_DURATION_MS`.
* **Mechanism:** Literal assertion checks (`throw new Error(...)`); these are invariant guards, not blanket `return false` disables.
* **Classification:** **FLIP**. Must be validated against current live Retell agent configurations using a dry-run test (`test-retell-agent-contract`) before deploying, or outbound calls will fail during pre-flight checks.

---

### 3. Ordered Reversal Plan (Deploying `main` Without Regressing Live)

1. **Step 1: Baseline Parity Audit (Dry Run)**
   - Diff the 7 unreverted functions on `main` against their snapshot counterparts in `supabase/functions-live/` (`call-dispatcher`, `outbound-calling`, `disposition-router`, `telnyx-webhook`, `workflow-executor`, `retell-call-webhook`, `pipeline-management`).
   - Identify every literal `return false` added at function entrypoints.

2. **Step 2: REMOVE Blanket Dialing & Core Engine Gates**
   - In `call-dispatcher`, `outbound-calling`, `workflow-executor`, and `telnyx-webhook`, delete the top-level certification early returns (`PROVIDER_EGRESS_NOT_CERTIFIED`, `TELNYX_EGRESS_NOT_CERTIFIED`, `FORCE_DISPATCH_NOT_CERTIFIED`, `WORKFLOW_AUTOMATION_NOT_CERTIFIED`, `TELNYX_WEBHOOK_LIFECYCLE_NOT_CERTIFIED`).
   - *Rationale:* Live has operated without these since 2026-07-01 (`README.md:17-18, 79-80`); keeping them causes immediate production outage upon deployment.

3. **Step 3: KEEP Authentication & Unsigned Webhook Gates**
   - Retain `UNSIGNED_WEBHOOK_NOT_CERTIFIED` in `call-tracking-webhook`, `inbound-transfer-webhook`, and `twilio-amd-webhook`.
   - Ensure inbound routes fail closed on missing/invalid signatures.

4. **Step 4: FLIP Provider Contract & Duration Invariants via Targeted Test**
   - Execute a preflight verification (`retell-provider-contract.ts` check against live Retell agent IDs in production).
   - If live Retell agents use non-pinned versions or uncertified tools, loosen contract assertions to match live agent reality prior to deploying `_shared/retell-provider-contract.ts`.

5. **Step 5: FLIP / Un-gate Admin Control Plane Post-Tenant Auth**
   - For `PROVIDER_ADMIN_NOT_CERTIFIED` and `CONTROL_PLANE_NOT_CERTIFIED`, replace blanket 503 returns with explicit `authorizeOrganizationContext()` checks from `tenant-context.ts:66-84`.
   - Run a single-tenant admin test (`check-number-config`) to confirm authorization passes before opening phone number operations.

6. **Step 6: Deploy and Re-snapshot**
   - Deploy functions incrementally (core dialer first, then webhooks, then admin APIs).
   - Re-snapshot live bundles using `npx supabase functions download <slug>` into scratch to verify 0 occurrences of unexpected `NOT_CERTIFIED` regressions on live.

---

Confidence: medium
