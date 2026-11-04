# Can a follow-up sequence run unattended? - reviewer deepseek/deepseek-v4.1-flash

cost: $0.0025

---

## Per-mechanism findings

**workflow-executor** (`supabase/functions/workflow-executor/index.ts`)
- Reachable today: **No.** `isWorkflowAutomationCertified()` is hard-coded `return false` (line 34–36), and the handler returns HTTP 503 `WORKFLOW_AUTOMATION_NOT_CERTIFIED` before any action runs (lines 220–230). Message: *"Workflow execution is disabled in the Retell-only, call-only launch profile."*
- Gated: **Yes — fail-closed at the top of `serve()`.**
- Cron: none shown.
- What it would do: actions `start_workflow`, `execute_pending`, `remove_from_workflow`, `pause_workflow`, `resume_workflow`, `resolve_external_effect` (line 299). `execute_pending` selects `lead_workflow_progress` where `status='active'` and `next_action_at <= now` (lines 567–578), takes a compare-and-set lease (649–669), and calls `executeStep` (671). Step types validated: `wait`, `call`, `sms`, `ai_sms` (483–515). This is the only server-side multi-step engine in evidence — and it is off.

**automation-scheduler** (`supabase/functions/automation-scheduler/index.ts`)
- Reachable: **Yes**, but only for one job. Header states the only certified responsibility is waking `call-dispatcher` for tenants with due pending `dialing_queues` rows (lines 1–8, 63–68, 104–115).
- Gated: **Yes** — `authorizeAutomationScheduler` requires service-role key or `AUTOMATION_SCHEDULER_CRON_TOKEN` (48–59).
- Cron: **Yes** — `cron.schedule('automation-scheduler-job', '* * * * *', …)` (migration `20260713050000_automation_scheduler_cron_auth.sql:42`), every minute.
- What it does: dispatches queue work only. It explicitly returns `workflow_steps_processed: 0`, `nudges_sent: 0`, `callbacks_queued: 0`, `callbacks_reset: 0`, `automation_rules_processed: 0` (lines 148–152). It does **not** touch workflows or nudges.

**scheduled_follow_ups**
- Table exists (migration `20251205153218…:57`), RLS on (line 76), index `(user_id, status, scheduled_at)` (line 109).
- Server-side hits in evidence are **writes/reads only, no consumer**: `retell-call-webhook:1828` inserts "for UI visibility" (comment line 1826); `voice-broadcast-engine:2338` inserts; `call-tracking-webhook:1336` reads. No server-side loop selects due rows and acts on them.
- Client-side: read/updated by `src/hooks/useDispositionAutomation.ts` (233, 410, 440, 471, 499, 522, 546), `src/hooks/useCallbacks.ts:113`, `src/packs/door_to_door/enroll.ts:241,249`, plus UI components.
- `enroll.ts:20` comment: *"It never sends anything. A scheduled_follow_ups row is a queue entry that the follow-up…"* (truncated) — consistent with a queue with no server drain.

**pg_cron schedules** (from grep)
- `automation-scheduler-job` `* * * * *` (`20260713050000…:42`)
- `retell-provider-reconciler` `*/2 * * * *` (`20260713043000…:1893`)
- `safety-backstops` `*/10 * * * *` (`20260703224351…:202`)
- `campaign-health-autofix` `*/15 * * * *` (`20260703224351…:213`)
- Two more `cron.schedule` calls at `20251204062700…:10` and `20260210_autonomous_engine_upgrade.sql:278` (bodies not shown).
- `20260409030000…:109` is a **commented-out** example, not a live schedule.
- **No cron invokes workflow-executor or any nudge/workflow processor.**

**campaign_workflows** — table created `20251208035156…:2`, RLS on (67), `auto_reply_settings` added `20251214165246…:2`. Read by ai-assistant, ai-brain, ai-autonomous-engine, ai-sms-processor, twilio-sms-webhook. **No `workflow_type` column appears anywhere in the supplied evidence** — I cannot state its values.

**Not in supplied evidence (did not check):** `nudge-scheduler`, `ai-workflow-generator`, the body of `useDispositionAutomation.ts`, the full `call-tracking-webhook` consumer, the `campaign_workflows` column list, and the cron bodies at `20251204062700` / `20260210`.

## Commercial answer

**No.** A customer buying tomorrow could not run an unattended SMS→call→SMS follow-up.
- The only engine that executes multi-step sequences (`workflow-executor`) is hard-disabled (lines 34–36, 220–230).
- The only live automation cron (`automation-scheduler-job`, every minute) explicitly does not process workflow steps or nudges (lines 148–152).
- `scheduled_follow_ups` has no server-side drain in evidence.

## Prior audit: verify / refute

- *"Nothing server-side consumes scheduled_follow_ups"* — **Verified** by the supplied grep: server-side hits are inserts (`retell-call-webhook:1828`, `voice-broadcast-engine:2338`) and one read (`call-tracking-webhook:1336`); no processing loop.
- *"The only executor is a browser hook that logs a placeholder"* — **Partly refuted / partly unverifiable.** There **is** a server-side executor (`workflow-executor`), it is simply gated off — so "only executor is a browser hook" is imprecise. The "logs a placeholder" detail cannot be confirmed: the body of `useDispositionAutomation.ts` is not in the supplied evidence.

**Confidence: medium** — the gating and cron facts are directly cited, but several named mechanisms (nudge-scheduler, ai-workflow-generator, workflow_type values, the disposition hook body) are absent from the evidence and were not checked.
