# Can a follow-up sequence run unattended?

lane: sequence-execution-truth  mode: council  reconciled by: manager:z-ai/glm-5.3-prime over 3 reviewers
reviewers: deepseek/deepseek-v4.1-flash, qwen/qwen3.8-flash, google/gemini-3.8-flash
cost: $0.2460 (reviewers $0.0419 + manager $0.2041)
tokens: 24725 in / 15556 out
files: supabase/functions/workflow-executor/index.ts, supabase/functions/automation-scheduler/index.ts

---

## 1. Reconciled answer (evidence-cited only)

| Mechanism | Reachable today? | Gated? | Cron? | What it does |
|---|---|---|---|---|
| `campaign_workflows` | As a definition store only (RLS owner-scoped, `20251208035156:2,67,73`; `auto_reply_settings` added `20251214165246:2`) | Execution blocked downstream | No | Stores steps; read by AI surfaces and inbound-SMS webhooks. **No `workflow_type` column or values appear anywhere in the evidence — the question's presupposition is not established.** |
| `workflow-executor` | HTTP-reachable, but every non-OPTIONS request returns 503 `WORKFLOW_AUTOMATION_NOT_CERTIFIED` before any action (`index.ts:34-36, 220-230`) | Hard fail-closed | No | If enabled: `start/execute_pending/pause/resume/remove/resolve` (`:299`); `execute_pending` drains due `lead_workflow_progress` (limit 100, CAS lease `:649-669`); step types `wait/call/sms/ai_sms` (`:483-515`). Imports `buildOutboundCallRequest/buildSmsRequest/buildAiSmsRequest` — but `executeStep`'s body is **truncated at line 1157**; the actual provider-effect code is unseen. |
| `automation-scheduler` | Yes, when authorized (service key or `AUTOMATION_SCHEDULER_CRON_TOKEN`, `:48-59`) | Yes | `automation-scheduler-job` `* * * * *` (`20260713050000:42`; command body not shown — filename + mandatory cron-token header make the link near-certain) | Only wakes `call-dispatcher` per tenant with due pending `dialing_queues` (`:63-68, 104-115`). Hard-reports `workflow_steps_processed: 0, nudges_sent: 0, callbacks_queued: 0` (`:148-152`). |
| `nudge-scheduler` | No code in evidence | n/a | No | Scheduler header says nudge fan-out "remain[s] disabled until separately certified" (`:4-8`). |
| `scheduled_follow_ups` | Table exists (RLS + index, `20251205153218:57,76,109`) | Passive | No | Server-side: **inserts only** (`retell-call-webhook:1828` "for UI visibility"; `voice-broadcast-engine:2338`; functions-live retell `:1315`) plus **one read of unseen purpose** (`call-tracking-webhook:1336`). No server-side loop selects due rows and acts. `enroll.ts:20`: "It never sends anything." |
| `ai-workflow-generator` | No file, no cron, no invocation in evidence | n/a | No | Only trace is a `generated_workflow_id` FK → `campaign_workflows` (`20251208040507:48`) — a column, not a mechanism. |
| Disposition hook | Browser-only React hook; 7 queries against `scheduled_follow_ups` (`useDispositionAutomation.ts:233-546`) | Requires a session | No (client code) | Body unseen; cannot run unattended regardless. |
| pg_cron inventory | — | — | `safety-backstops` */10, `campaign-health-autofix` */15 (`20260703224351:202,213`), `retell-provider-reconciler` */2 (`20260713043000:1893`), `automation-scheduler-job` every minute; **two schedules with unseen bodies** (`20251204062700:10`, `20260210:278`); `prune-api-audit` is a comment only | None shown to advance sequences. |

The only live automation touching workflows at all is **reactive** inbound-SMS auto-reply via `auto_reply_settings` (`ai-sms-processor:280-290`, `twilio-sms-webhook:754-761`) — a reply-on-inbound behavior, not a sequencer.

**Commercial answer: No.** Three independent evidence legs: (1) the only multi-step sequencer is 503-gated before touching anything; (2) the only live cron dispatches `dialing_queues` and explicitly zeroes workflow/nudge work; (3) `scheduled_follow_ups` has no server-side drain. A customer could define workflows and view follow-up rows; nothing executes them unattended.

**Prior audit:** "Nothing server-side consumes `scheduled_follow_ups`" — **verified in substance** (inserts plus one read of unknown purpose; no execution loop anywhere). "The only executor is a browser hook that logs a placeholder" — **partly refuted**: a server-side executor exists in code but is hard-gated, and no placeholder logging appears in the evidence. The audit's conclusion was right; its mechanism description was not.

## 2. Disagreements

1. **"Zero edge functions query `scheduled_follow_ups`" (R3) vs R1/R2 flagging `call-tracking-webhook:1336`.** Evidence favours R1/R2 — that read exists in the grep; only its purpose is unknown. R3's absolute is factually wrong.
2. **Prior-audit claim 2:** R1 partly refutes, R2 marks unverified, R3 is silent. Evidence favours R1/R2 (server executor exists, disabled; "placeholder" detail absent from evidence).
3. **`ai-workflow-generator`:** R3 attributes an FK reference and generation behavior; R1/R2 say absent. Evidence favours R1/R2 (see §3).
4. **Cron target of `automation-scheduler-job`:** R1/R3 assert as fact; R2 correctly notes the command body is unseen. Strictly unresolved; the filename plus the function's required `X-DialSmart-Automation-Cron-Token` header make the inference very strong.
5. **Cron inventory completeness:** R3 omits the two unseen-body schedules that R1/R2 list. The grep favours R1/R2's fuller list.

## 3. Rejected claims (both from Reviewer 3 / Gemini)

- **"ai-workflow-generator… referenced as a foreign key (`generated_workflow_id`)… generates workflow definitions into campaign_workflows."** The FK at `20251208040507:48` references the `campaign_workflows` table, not any generator; no such mechanism, file, or cron exists in evidence. Both the reference claim and the behavior claim are fabricated.
- **"Zero edge functions query, poll, or transition pending rows."** `call-tracking-webhook:1336` queries the table. (I also downgrade, without rejecting, R1/R3's flat assertion that the every-minute cron invokes `automation-scheduler` — the command body is unseen.)

## 4. What NONE of them checked

- **`supabase/functions-live/workflow-executor/index.ts`** — a second, divergent executor copy sits in the grep output (lines 118, 231, 610) and was ignored by all three. Its line 118 lacks the `user_id` ownership filter present in the gated copy (`:422-426`), so it is a different version. Whether it carries the certification gate, and which directory is actually deployed, is unknown — the "reachable: No (503)" row may describe the repo, not production.
- The **command bodies** of `cron.schedule` at `20251204062700:10` and `20260210:278` — the latter is an "autonomous engine" migration, and `ai-autonomous-engine` reads `campaign_workflows` (`:4288`). A hidden driver here is the one thing that could flip the commercial verdict.
- `useDispositionAutomation.ts` body (the "logs a placeholder" detail); `call-tracking-webhook` logic around `:1336`; `executeStep` past line 1157; the `campaign_workflows` column list (hence `workflow_type`); and all runtime state — applied migrations, live cron jobs, env tokens, repo-vs-prod parity.

## 5. Confidence

**Medium.** The commercial "No" is well-supported on repo evidence, but the two shared blind spots above were never examined. **Single most valuable next check:** open the command bodies of the two unseen `cron.schedule` calls — especially `20260210_autonomous_engine_upgrade.sql:278` — because a hidden scheduled driver is the only evidence gap that could make any executor run unattended; if both are benign, the "No" is solid and the `functions-live` variant becomes moot for the commercial question (though it should still be diffed to settle the executor's reachability row).
