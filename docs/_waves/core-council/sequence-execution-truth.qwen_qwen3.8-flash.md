# Can a follow-up sequence run unattended? - reviewer qwen/qwen3.8-flash

cost: $0.0090

---

Scope caveat: I inspected only the supplied excerpts. I did **not** verify actual Supabase deployment state, applied migrations, cron job bodies, provider credentials, or full function bodies.

## Truth table

| Mechanism | Reachable today? | Gated? | Cron scheduled? | What it does when it runs |
|---|---:|---:|---:|---|
| `campaign_workflows` / workflow definitions | FACT: table exists and is RLS-owned: `supabase/migrations/20251208035156_...sql:2`, `:67`, `:73`. Referenced by AI surfaces: `supabase/functions/ai-assistant/workflow-tools.ts:440`, `supabase/functions/ai-brain/index.ts:1470`. | FACT: not an executor; execution depends on `workflow-executor`, which is disabled. | FACT: no supplied cron invokes workflow execution. | FACT: stores workflow rows and `workflow_steps`. In the executor excerpt, step types are `wait`, `call`, `sms`, `ai_sms`: `supabase/functions/workflow-executor/index.ts:483`, `:494`, `:504`, `:511`. FACT: no `workflow_type` values are shown in the supplied evidence. THEORY: `workflow_type` is not established from this evidence. |
| `workflow-executor` | FACT: server-side executor code exists and advertises actual call/SMS/AI-SMS execution: `supabase/functions/workflow-executor/index.ts:4-10`. | FACT: hard-disabled: `isWorkflowAutomationCertified()` returns `false` (`:34-36`), and every request returns 503 before action handling (`:220-230`). | FACT: no supplied cron schedules `workflow-executor`. THEORY: even if gate were lifted, no supplied scheduler calls it. | FACT: if enabled, it would handle `start_workflow`, `execute_pending`, pause/resume/remove, and external-effect reconciliation: `:345`, `:563`, `:704`, `:731`, `:753`, `:305`. `execute_pending` would query due `lead_workflow_progress`, batch-process up to 100 rows, lease rows, and call `executeStep`: `:563-702`, `:649-671`. Today it does nothing except return disabled. |
| `automation-scheduler` | FACT: function exists and can run if authorized: `supabase/functions/automation-scheduler/index.ts:34-59`. | FACT: authorization required: service role or configured cron token; anon/user JWTs are not sufficient: `:46-59`. | FACT: repo migration schedules a job named `automation-scheduler-job` every minute: `supabase/migrations/20260713050000_automation_scheduler_cron_auth.sql:42`. THEORY: the job name implies it invokes `automation-scheduler`, but the cron command body is not shown. | FACT: it only finds due `dialing_queues` rows with `status='pending'` and `scheduled_at <= now`, then invokes `call-dispatcher` per tenant: `:63-68`, `:99-115`. FACT: it explicitly does **not** process callbacks, workflow fan-out, nudges, or automation rules: `:4-8`, `:148-153`. |
| `nudge-scheduler` | FACT: no supplied `nudge-scheduler` code. | FACT: `automation-scheduler` says legacy nudge fan-out remains disabled and reports `nudges_sent: 0`: `supabase/functions/automation-scheduler/index.ts:4-8`, `:151`. | FACT: no supplied cron for nudge execution. | FACT: workflow-executor only reads `lead_nudge_tracking` to skip paused sequences: `supabase/functions/workflow-executor/index.ts:633-644`. THEORY: no reachable nudge automation is evidenced. |
| `scheduled_follow_ups` | FACT: table exists with RLS and index: `supabase/migrations/20251205153218_...sql:57`, `:76`, `:105`, `:109`. Written by Retell webhook: `supabase/functions/retell-call-webhook/index.ts:1826-1836`. Written by voice broadcast engine: `supabase/functions/voice-broadcast-engine/index.ts:2336-2338`. Read by UI/hooks: `src/hooks/useDispositionAutomation.ts:233`, `:410`, `:440`, `:471`, `:499`, `:522`, `:546`; also `src/components/*`. Read by `call-tracking-webhook`: `supabase/functions/call-tracking-webhook/index.ts:1336`. | FACT: not gated by a visible executor because no visible executor is supplied. | FACT: no supplied cron consumes `scheduled_follow_ups`. | FACT: Retell webhook inserts “for UI visibility”: `supabase/functions/retell-call-webhook/index.ts:1826-1836`. FACT: voice broadcast engine saves “for processing later”: `supabase/functions/voice-broadcast-engine/index.ts:2336-2338`. FACT: door-to-door pack says it “never sends anything” and treats the row as a queue entry: `src/packs/door_to_door/enroll.ts:10`, `:20`. FACT: no supplied server-side code selects due `scheduled_follow_ups` and executes SMS/call steps. THEORY: it is a queue/UI table, not a running sequence engine. |
| `ai-workflow-generator` | FACT: no supplied file named `ai-workflow-generator`. Closest workflow-management references are `supabase/functions/ai-assistant/workflow-tools.ts:440`, `:485`, `:492`, `:527` and `supabase/functions/ai-brain/index.ts:1470`, `:1516`, `:1530`. | FACT: any generated workflow would still need `workflow-executor`, which is disabled: `supabase/functions/workflow-executor/index.ts:34-36`, `:220-230`. | FACT: no supplied cron. | THEORY: if it creates `campaign_workflows`, it can create definitions only; it cannot make them run unattended from this evidence. |
| Disposition automation hook | FACT: browser hook `src/hooks/useDispositionAutomation.ts` queries `scheduled_follow_ups`: `:233`, `:410`, `:440`, `:471`, `:499`, `:522`, `:546`. | FACT: client-side only; no server-side cron evidence. | FACT: no cron. | FACT: the supplied grep does not show placeholder logging or actual SMS/call execution. THEORY: it may display/manage follow-up rows, but it is not an unattended server executor. |
| Other `pg_cron` schedules | FACT: `safety-backstops` every 10 min: `supabase/migrations/20260703224351_unattended_safety_backstops.sql:202`. FACT: `campaign-health-autofix` every 15 min: `:213`. FACT: `retell-provider-reconciler` every 2 min: `supabase/migrations/20260713043000_retell_automatic_reconciliation.sql:1893`. FACT: additional `cron.schedule` lines exist without visible target: `supabase/migrations/20251204062700_...sql:10`, `supabase/migrations/20260210_autonomous_engine_upgrade.sql:278`. FACT: `prune-api-audit` is only a comment, not proven scheduled: `supabase/migrations/20260409030000_mint_api_key_helper.sql:109`. | FACT: none of the shown bodies indicate multi-step follow-up execution. | FACT: these jobs are scheduled in repo migrations. | THEORY: safety/health/reconciliation jobs are unrelated to SMS-call-SMS sequences; cron command bodies are not fully shown, so exact behavior is not proven. |

## Commercial answer: can a customer bought tomorrow run SMS → call → SMS unattended?

**No, not from the supplied evidence.**

FACT: the only code path designed to execute multi-step workflow actions is `workflow-executor`, and it is hard-disabled before doing anything: `supabase/functions/workflow-executor/index.ts:34-36`, `:220-230`.

FACT: the scheduled `automation-scheduler` does not process workflow steps, nudges, callbacks, or automation rules; it only wakes `call-dispatcher` for due `dialing_queues`: `supabase/functions/automation-scheduler/index.ts:4-8`, `:63-68`, `:99-115`, `:148-153`.

FACT: `scheduled_follow_ups` is written/read for UI/queue visibility, but no supplied server-side executor consumes due rows to send SMS/call/SMS: `supabase/functions/retell-call-webhook/index.ts:1826-1836`, `supabase/functions/voice-broadcast-engine/index.ts:2336-2338`, `src/packs/door_to_door/enroll.ts:10`, `:20`.

Therefore, a customer could potentially create workflow definitions or see follow-up rows, but there is no evidenced unattended server-side engine to run an SMS-then-call-then-SMS sequence.

## Prior audit verification

The prior audit’s practical conclusion is **supported**, but its absolute wording is **not fully provable** from the supplied evidence.

FACT: no supplied server-side function is shown to execute due `scheduled_follow_ups` rows.

FACT: the supplied `workflow-executor` is a server-side workflow executor, but it is disabled and operates on `lead_workflow_progress`, not `scheduled_follow_ups`: `supabase/functions/workflow-executor/index.ts:4-10`, `:34-36`, `:220-230`, `:563-702`.

FACT: browser hooks query `scheduled_follow_ups`: `src/hooks/useDispositionAutomation.ts:233`, `:410`, `:440`, `:471`, `:499`, `:522`, `:546`.

FACT: `call-tracking-webhook` reads `scheduled_follow_ups` at `supabase/functions/call-tracking-webhook/index.ts:1336`, but the surrounding behavior is not supplied.

Therefore:

- “Nothing server-side consumes `scheduled_follow_ups`” is **partially verified**: no visible server-side executor is shown, but absolute absence cannot be proven because `call-tracking-webhook` has a read whose logic is not shown.
- “The only executor is a browser hook that logs a placeholder” is **not verified** from the supplied evidence; no placeholder log is shown, and a disabled server-side executor exists in code.
- The commercial conclusion remains: **no unattended SMS-call-SMS follow-up is available today**.

Confidence: high
