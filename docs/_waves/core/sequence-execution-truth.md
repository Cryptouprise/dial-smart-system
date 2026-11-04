# Can a follow-up sequence run unattended?

lane: sequence-execution-truth  model: deepseek/deepseek-v4.1-flash  cost: $0.0048
tokens: 19757 in / 3469 out
files: supabase/functions/workflow-executor/index.ts, supabase/functions/automation-scheduler/index.ts

---

## Per-mechanism findings

**workflow-executor** (`supabase/functions/workflow-executor/index.ts`)
- **Reachable today: No.** `isWorkflowAutomationCertified()` is hardcoded `return false` (34–36), and the gate at 220–230 returns HTTP 503 `WORKFLOW_AUTOMATION_NOT_CERTIFIED` ("disabled in the Retell-only, call-only launch profile") *before* auth and before any action branch. Every action — `start_workflow`, `execute_pending`, `pause/resume`, `resolve_external_effect`, even `health_check` — is unreachable.
- **Cron scheduled: No.** No `cron.schedule` for workflow-executor appears in the cron grep.
- **What it would do:** header comment (4–9) says it places calls via outbound-calling, SMS via sms-messaging, AI SMS via ai-sms-processor, and waits. `execute_pending` (563–702) selects due `lead_workflow_progress` rows, takes a compare-and-set lease, and calls `executeStep` (671). The `executeStep` body is truncated at 1157–1158, so the actual side-effect code is not in evidence. It is a fully built engine that is switched off.

**automation-scheduler** (`supabase/functions/automation-scheduler/index.ts`)
- **Reachable: Yes, gated.** Requires service-role key or `X-DialSmart-Automation-Cron-Token` via `authorizeAutomationScheduler` (48–59); anon/user JWTs rejected.
- **Cron scheduled: Yes** — `cron.schedule('automation-scheduler-job', '* * * * *', …)` (`20260713050000_automation_scheduler_cron_auth.sql:42`), every minute.
- **What it does:** only reads due `dialing_queues` rows (63–68) and invokes `call-dispatcher` once per tenant (104–115). It explicitly reports `workflow_steps_processed: 0, nudges_sent: 0, automation_rules_processed: 0, callbacks_queued: 0` (148–152). Header comment (4–8) states callback pickup, rule-driven queue generation, workflow/nudge fan-out, and delayed timers "remain disabled until separately certified." So it does **not** run sequences or nudges.

**nudge-scheduler** — **Not in supplied evidence.** No file excerpt and no grep hit. The only related fact is automation-scheduler's comment that "workflow/nudge fan-out … remain disabled." I cannot confirm it exists, is reachable, or has a cron.

**scheduled_follow_ups**
- Table created `20251205153218_…sql:57`, RLS enabled (76), index (109).
- **Writers:** `retell-call-webhook/index.ts:1828` (comment: "for UI visibility"), `voice-broadcast-engine/index.ts:2338`, `src/packs/door_to_door/enroll.ts:241,249`.
- **Readers:** UI only — `src/components/*`, `src/hooks/useCallbacks.ts`, `src/hooks/useDispositionAutomation.ts`, `src/hooks/useAutonomousAgent.ts`.
- **No server-side processor appears in the grep.** `call-tracking-webhook/index.ts:1336` is a `.from('scheduled_follow_ups')` inside an edge function, but the operation is not shown; there is no evidence it selects due rows to execute them. `enroll.ts:20` comment: "It never sends anything. A scheduled_follow_ups row is a queue entry…"

**disposition automation hook** — `src/hooks/useDispositionAutomation.ts` is a **browser hook** (path `src/hooks/`) touching `scheduled_follow_ups` at 233, 410, 440, 471, 499, 522, 546. The file body is not in evidence, so the "logs a placeholder" claim cannot be confirmed or refuted from what I was given.

**ai-workflow-generator** — **Not in supplied evidence.** No excerpt, no grep hit. Cannot assess reachability or gating.

**campaign_workflows / workflow_type** — Table created `20251208035156_…sql:2`; referenced widely (ai-assistant, ai-brain, ai-sms-processor, twilio-sms-webhook, workflow-executor). **No `workflow_type` column or its values appear anywhere in the supplied evidence.** I cannot enumerate workflow_type values.

**pg_cron schedules found:** `20251204062700_…sql:10` (job unknown), `20260210_autonomous_engine_upgrade.sql:278` (unknown), `20260703224351_…sql:202` `safety-backstops` */10, `:213` `campaign-health-autofix` */15, `20260713043000_…sql:1893` `retell-provider-reconciler` */2, `20260713050000_…sql:42` `automation-scheduler-job` * * * * *. `20260409030000_…sql:109` is a **commented-out** example. **No cron targets workflow-executor, nudge-scheduler, or scheduled_follow_ups.**

## Commercial answer

**No — a customer could not run SMS→call→SMS unattended tomorrow.** The only engine that executes multi-step workflow steps (workflow-executor) is hard-disabled at 220–230 and has no cron. The one scheduler that *is* cron-driven every minute (automation-scheduler) only dispatches pre-existing pending `dialing_queues` rows to call-dispatcher and reports zero workflow/nudge/rule processing. `scheduled_follow_ups` has no server-side consumer in evidence. There is no reachable path that chains SMS, then a call, then SMS without a human/browser.

## Prior-audit verification

- **"Nothing server-side consumes scheduled_follow_ups" — VERIFIED (with one caveat).** All grep hits are inserts (retell-call-webhook, voice-broadcast-engine, enroll.ts) or UI reads under `src/`. The single edge-function hit (`call-tracking-webhook:1336`) shows no evidence of due-row processing. Caveat: I only see the grep line, not the operation.
- **"The only executor is a browser hook that logs a placeholder" — PARTIALLY VERIFIED.** The hook is real and browser-side (`src/hooks/useDispositionAutomation.ts`). The "logs a placeholder" behavior is **not verifiable** from the supplied evidence — no excerpt of that file was provided.

## Not checked
- nudge-scheduler (no evidence supplied)
- ai-workflow-generator (no evidence supplied)
- `useDispositionAutomation.ts` body (placeholder claim)
- `executeStep` body (truncated at 1157)
- `workflow_type` column/values
- The two unidentified cron jobs (`20251204062700:10`, `20260210:278`)
- `call-tracking-webhook:1336` operation type

**Confidence: medium** — the gating of workflow-executor and the scope of automation-scheduler are directly citable and solid; the gaps above (nudge-scheduler, ai-workflow-generator, the hook body) prevent a fully closed conclusion.
