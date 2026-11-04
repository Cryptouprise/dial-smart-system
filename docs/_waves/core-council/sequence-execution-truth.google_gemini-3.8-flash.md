# Can a follow-up sequence run unattended? - reviewer google/gemini-3.8-flash

cost: $0.0304

---

### Mechanism-by-Mechanism Audit

#### 1. `campaign_workflows` (and `workflow_type`)
* **Reachable today:** Reachable for CRUD via Supabase API / UI and AI assistant tools (`ai-assistant`, `ai-brain`), but cannot be executed.
* **Gated:** Schema and data exist (`supabase/migrations/20251208035156_...sql:2`), but execution is completely blocked by the executor gate.
* **Cron scheduled:** No pg_cron job references or polls `campaign_workflows`.
* **What it does when it runs:** Definitions store workflow steps (call, sms, wait, ai_sms). In runtime, it acts as read-only configuration; `ai-sms-processor` only reads `auto_reply_settings` (`supabase/functions/ai-sms-processor/index.ts:280-290`).

#### 2. `workflow-executor`
* **Reachable today:** Reachable over HTTP, but fails immediately on all entry points.
* **Gated:** **HARD-GATED.** `isWorkflowAutomationCertified()` returns `false` unconditionally (`supabase/functions/workflow-executor/index.ts:34-36`). Any non-OPTIONS request immediately returns HTTP 503 with error code `WORKFLOW_AUTOMATION_NOT_CERTIFIED` ("Workflow execution is disabled in the Retell-only, call-only launch profile", `index.ts:220-230`).
* **Cron scheduled:** No cron job invokes `workflow-executor`.
* **What it does when it runs:** Returns HTTP 503 without touching the database or external APIs.

#### 3. `automation-scheduler`
* **Reachable today:** Yes, invoked by pg_cron every minute.
* **Gated:** Requires service role key or `AUTOMATION_SCHEDULER_CRON_TOKEN` (`supabase/functions/automation-scheduler/index.ts:48-59`).
* **Cron scheduled:** Yes: scheduled every minute (`* * * * *`) via job `automation-scheduler-job` (`supabase/migrations/20260713050000_automation_scheduler_cron_auth.sql:42`).
* **What it does when it runs:** Strictly dispatches `dialing_queues` rows with `status = 'pending'` and `scheduled_at <= now` to `/functions/v1/call-dispatcher` (`index.ts:63-68, 104-115`). It explicitly hardcodes zeroes for all other systems: `workflow_steps_processed: 0`, `nudges_sent: 0`, `automation_rules_processed: 0`, `callbacks_queued: 0` (`index.ts:148-152`).

#### 4. `nudge-scheduler`
* **Reachable today:** Not scheduled.
* **Gated:** Disabled by architecture. `automation-scheduler` specifically documents that nudge fan-out remains disabled (`supabase/functions/automation-scheduler/index.ts:1-8`).
* **Cron scheduled:** No pg_cron schedule exists for nudges in migration evidence.
* **What it does when it runs:** Does not run; zero nudges sent (`automation-scheduler/index.ts:151`).

#### 5. `scheduled_follow_ups`
* **Reachable today:** Written to by webhooks and UI; never polled or executed server-side.
* **Gated:** Passive database table.
* **Cron scheduled:** No cron job checks or runs rows from `scheduled_follow_ups`.
* **What it does when it runs:**
  * **Server-side:** Rows are inserted as passive UI records (e.g. `retell-call-webhook/index.ts:1826-1836`: `// Also add to scheduled_follow_ups for UI visibility`, and `voice-broadcast-engine/index.ts:2336-2338`). Zero edge functions query, poll, or transition pending rows for execution.
  * **Client-side:** The door-to-door pack comments explicitly confirm: `It never sends anything. A scheduled_follow_ups row is a queue entry that the follow-up [system UI displays]` (`src/packs/door_to_door/enroll.ts:20`).
  * **Prior Audit Verdict:** **VERIFIED.** The evidence confirms no server-side process consumes `scheduled_follow_ups`.

#### 6. `ai-workflow-generator`
* **Reachable today:** Only referenced as a foreign key on migration tables (`generated_workflow_id` in `supabase/migrations/20251208040507_...sql:48`).
* **Gated / Cron:** Not scheduled by any cron.
* **What it does:** Generates workflow definitions into `campaign_workflows`; does not execute them.

#### 7. Disposition Automation Hook (`useDispositionAutomation.ts`)
* **Reachable today:** Client-side React hook running in user browser only.
* **Gated:** Requires an active authenticated browser session.
* **Cron scheduled:** None (browser code).
* **What it does when it runs:** Reads/writes `scheduled_follow_ups` rows locally (`src/hooks/useDispositionAutomation.ts:233, 410, 440...`). It does not run unattended.

#### 8. `pg_cron` Schedules
Active schedules in migrations:
1. `safety-backstops` (`*/10 * * * *`) – `public.run_safety_backstops()` (`20260703224351_unattended_safety_backstops.sql:202`)
2. `campaign-health-autofix` (`*/15 * * * *`) (`20260703224351_unattended_safety_backstops.sql:213`)
3. `retell-provider-reconciler` (`*/2 * * * *`) (`20260713043000_retell_automatic_reconciliation.sql:1893`)
4. `automation-scheduler-job` (`* * * * *`) – calls `automation-scheduler` edge function (`20260713050000_automation_scheduler_cron_auth.sql:42`)
* None of these crons execute multi-step sequences or `workflow-executor`.

---

### Commercial Verdict: Can a customer run SMS-then-call-then-SMS follow-up unattended?

**NO.**
1. `workflow-executor` is hardcoded to return HTTP 503 (`WORKFLOW_AUTOMATION_NOT_CERTIFIED`) (`workflow-executor/index.ts:34-36, 220-230`).
2. The only running scheduler cron (`automation-scheduler`) exclusively drains `dialing_queues` into `call-dispatcher` and leaves all workflow and nudge processing disabled (`automation-scheduler/index.ts:1-8, 63-68, 148-152`).
3. `scheduled_follow_ups` is a passive holding table with zero server-side consumer.

---

### What Was NOT Checked
* Full contents of `useDispositionAutomation.ts` (only grep hits were provided).
* Retell webhook inbound disposition processing logic outside the grep hits.
* Migration files older than those included in grep outputs.

Confidence: High.
