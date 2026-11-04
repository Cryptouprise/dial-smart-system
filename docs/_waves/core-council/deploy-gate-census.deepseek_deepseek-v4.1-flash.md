# The 503 certification gates: keep, flip or remove - reviewer deepseek/deepseek-v4.1-flash

cost: $0.0083

---

## 1. Census (FACT — from the supplied grep)

73 occurrences, in 52 files (50 `index.ts` + 2 `_shared`). Breakdown:

| Bucket | Count | Evidence |
|---|---|---|
| Gate occurrences (`error_code: '…_NOT_CERTIFIED'` in a disabled/503 Response) | **54** | grep lines; 9 show the full `return new Response(JSON.stringify({ success:false, disabled:true, …` shape (e.g. `ai-workflow-generator/index.ts:18`, `demo-sms-reply/index.ts:163`) |
| Validation throws (`throw new Error('…_NOT_CERTIFIED: …')`) | **19** | `outbound-calling/index.ts:890,899,903,907,914`; `_shared/call-exposure-policy.ts:12,18`; `_shared/retell-provider-contract.ts:93,96,99,102,105,108,111,114,120,128,147,151` |
| **Total** | **73** | matches the stated 73 |

The 19 throws are **not gates** — they are Retell provider-contract / call-duration validation. Removing them would let malformed agent configs through. They must not be touched by any reversal.

Distinct functions carrying at least one occurrence: **50**. `outbound-calling` carries both a gate (`:299`) and 5 throws.

## 2. Literal `return false` pairing (FACT for the line numbers, THEORY for the link)

For **29 of the 50** functions, a `return false` sits at a low line number in the same file, well before the `NOT_CERTIFIED` line — consistent with a `function isXCertified() { return false; }` helper with no env read. Examples: `ai-workflow-generator` 9→18, `backfill-call-agent-data` 10→19, `reachability-scoring` 10→25, `spam-detection` 11→31, `voice-broadcast-tts` 10→24, `call-dispatcher` 16/20/24→417/1666/1777, `workflow-executor` 35→224.

**21 functions have no such pairing visible**: `calendar-integration:46`, `call-tracking-webhook:137`, `check-number-config:16`, `clear-voice-webhooks:16`, `inbound-transfer-webhook:129`, `phone-number-purchasing:39`, `quick-test-call:19`, `remove-trunk:17`, `retell-agent-management:47`, `retell-inbound-webhook:46`, `retell-llm-management:25`, `retell-phone-management:31`, `setup-inbound-calls:17`, `setup-lady-jarvis:105`, `telnyx-dynamic-vars:29`, `telnyx-outbound-ai:137`, `telnyx-webhook:189`, `twilio-amd-webhook:35`, `twilio-integration:37`, `voice-broadcast-engine:694`, `workflow-executor:1746`. For these I **cannot** say whether the gate is a literal `return false` or reads an env toggle — the bodies are not in evidence.

**Census caveat (THEORY):** the `return false` grep shows ~18 further functions with a low-line `return false` and **no** `NOT_CERTIFIED` string (`ai-brain:11`, `autonomous-prioritization:20`, `budget-tracker:22`, `campaign-health-monitor:28`, `email-sender:9`, `enhanced-rotation-manager:20`, `ml-learning-engine:51`, `predictive-dialing-engine:16`, `provider-management:49`, `retell-force-webhook:10`, `telnyx-insights:45`, `telnyx-knowledge-base:34`, `voice-broadcast-queue:10`, `yellowstone-integration:93`, `disposition-router:77`, `retell-call-webhook:83`, `pipeline-management:11`, `ai-autonomous-engine:3458,5499`). Three of those (`disposition-router`, `retell-call-webhook`, `pipeline-management`) are **live** functions per README lines 25/29/31. So 73 is a lower bound on disabled surface, not the whole of it.

## 3. Classification (THEORY — based on error-code names and the truncated messages; bodies not seen)

**KEEP — 19 occurrences.** Security controls that must survive the deploy:

| Code | Occurrences |
|---|---|
| `UNSIGNED_WEBHOOK_NOT_CERTIFIED` | `call-tracking-webhook:137`, `inbound-transfer-webhook:129`, `twilio-amd-webhook:35` |
| `CONTROL_PLANE_NOT_CERTIFIED` | `clear-voice-webhooks:16`, `remove-trunk:17`, `setup-inbound-calls:17`, `setup-lady-jarvis:105` |
| `PROVIDER_ADMIN_NOT_CERTIFIED` | `check-number-config:16`, `phone-number-purchasing:39`, `retell-agent-management:47`, `retell-llm-management:25`, `retell-phone-management:31`, `twilio-integration:37` |
| `FORCE_DISPATCH_NOT_CERTIFIED` | `call-dispatcher:417` |
| `RETELL_CALL_AGENT_BACKFILL_NOT_CERTIFIED` | `backfill-call-agent-data:19` (message: "disabled until it is service-only") |
| `RETELL_BUSINESS_VERIFICATION_NOT_CERTIFIED` | `retell-business-verification:44` ("until exact organization owners…") |
| `INBOUND_DYNAMIC_VARS_NOT_CERTIFIED` | `retell-inbound-webhook:46`, `telnyx-dynamic-vars:29` |
| `TELNYX_WEBHOOK_LIFECYCLE_NOT_CERTIFIED` | `telnyx-webhook:189` |

**REMOVE — 5 occurrences.** All sit on functions that are live and already perform the operation (README lines 26/28/30), so the gate buys no protection live does not already forgo; it only breaks parity:

`call-dispatcher:1666` `TELNYX_EGRESS`, `call-dispatcher:1777` `PROVIDER_NOT_CERTIFIED`, `outbound-calling:299` `PROVIDER_EGRESS`, `workflow-executor:224` `WORKFLOW_AUTOMATION`, `workflow-executor:1746` `WORKFLOW_WEBHOOK_EGRESS`.

**FLIP — 30 occurrences.** Spend/egress, AI, spam, sync and report gates; each is safe once a named test passes:

`advanced-spam-detection:33`, `ai-assistant:3007`, `ai-assistant-config:203`, `ai-configuration-complete:341`, `ai-error-analyzer:55`, `ai-workflow-generator:18`, `airtable-sync:40`, `assistable-make-call:105`, `calendar-integration:46`, `demo-sms-reply:163`, `elevenlabs-tts:29`, `enhanced-spam-lookup:34`, `generate-daily-report:226`, `ghl-batch-callback:302`, `ghl-integration:79`, `ghl-webhook-trigger:91`, `nudge-scheduler:40`, `quick-test-call:19`, `reachability-scoring:25`, `retell-cost-backfill:24`, `scheduled-spam-check:26`, `spam-detection:31`, `system-health-monitor:128`, `telnyx-ai-assistant:285`, `telnyx-outbound-ai:137`, `telnyx-scheduled-events:52`, `telnyx-scheduled-events:94`, `test-workflow:99`, `voice-broadcast-engine:694`, `voice-broadcast-tts:24`.

Note the six gates whose own message says "disabled until authentication, organization…" (`ai-assistant-config:203`, `ai-configuration-complete:341`, `ai-error-analyzer:55`, `ai-workflow-generator:18`, `demo-sms-reply:163`, `retell-business-verification:44`). `_shared/tenant-context.ts` already implements exactly that authz (`requireExplicitOrganizationId:16`, `assertOrganizationMembership:24`, `assertTenantResourceOwnership:44`, `authorizeOrganizationContext:66`). These are FLIP-with-a-real-fix, not FLIP-with-a-test: replace the blanket 503 with a call to those helpers.

## 4. Ordered plan

1. **Do not deploy `main` as-is.** README line 80 says the 503 gates are main-only; `wholesale` is the branch the 5 re-snapshotted functions were verified byte-identical against (README line 66-68).
2. **Remove the 5 REMOVE gates** (`call-dispatcher:1666,1777`; `outbound-calling:299`; `workflow-executor:224,1746`). This is the only change needed to restore live parity on the 4 live functions that carry gates.
3. **Leave the 19 validation throws alone** — they are the Retell provider contract, not gates.
4. **Deploy those 4 functions** (`call-dispatcher`, `outbound-calling`, `workflow-executor`, `telnyx-webhook` — the last only if its `:189` gate is also a parity break; verify against the v520 snapshot first). Verify against `functions-live/` before and after.
5. **Keep the 19 KEEP gates.** Then, as a separate change, replace the six "disabled until authentication/organization" gates with `_shared/tenant-context.ts` calls so they become real authz instead of 503s.
6. **FLIP the 30, one function per deploy**, each gated on a named test (bounded-spend test for the `*_EGRESS`/`*_SPEND` codes; tenant-isolation test for the AI codes; provider-contract test for the spam/sync codes).
7. **Re-snapshot `functions-live/` after each deploy** (README lines 10-11).

## 5. What I did NOT check

- The gate bodies. I saw only the `error_code` lines and 9 truncated messages — so "literal `return false`, no env toggle" is inferred from line proximity, not read.
- The live snapshots' contents. The "0 occurrences on live" claim is README line 80 only; I did not verify it.
- Whether live
