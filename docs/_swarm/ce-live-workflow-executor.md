# ce-live-workflow-executor

- status: completed
- tldr: LIVE workflow-executor: verify_jwt=false @config.toml:210, NO gate in live bytes, ZERO inbound auth -> anon can run any defined call/SMS/webhook workflow.

RESEARCH ONLY complete for ce-live-workflow-executor (workflow-executor).

(a) config.toml: `[functions.workflow-executor]` @supabase/config.toml:207; `verify_jwt = false` @line 210. Expected false CONFIRMED.

(b) Certification gate in LIVE bytes: NONE. grep of supabase/functions-live/workflow-executor/index.ts for NOT_CERTIFIED|certified|resolve_external_effect = 0 matches. Main has WORKFLOW_AUTOMATION_NOT_CERTIFIED @supabase/functions/workflow-executor/index.ts:224 and WORKFLOW_WEBHOOK_EGRESS_NOT_CERTIFIED @1746 (per LIVE-VS-MAIN-GATES.md:37,58). LIVE:224 is only a closing brace; LIVE is the pre-gate variant.

(c) Anon reachability: the handler does ZERO inbound auth (grep getUser|jwt|unauthor|401|403|denied|forbidden|svix|signature|hmac = 0). It builds a service-role client from SUPABASE_SERVICE_ROLE_KEY @index.ts:23-36 and takes action/leadId/workflowId/campaignId straight from await req.json() @37. Only authorization tokens are line 14 (CORS header) and line 982 (outbound Bearer to assistable-make-call). With verify_jwt=false, an anon caller passes and reaches full execution.

Actions (LIVE cites): health_check @39; start_workflow @60 (insert lead_workflow_progress @202); execute_pending @225 (runs engine, executeStep @259); remove_from_workflow @287; pause_workflow @309; resume_workflow @328. Step switch @651: call @652 -> invoke outbound-calling @826 (real dial); sms @655 -> invoke sms-messaging @879; ai_sms @658 -> invoke ai-sms-processor @926; webhook @675 -> real fetch(webhookUrl) @1038-1045; assistable_call @678 -> fetch assistable-make-call @979; tag/update_status @716 -> writes leads @719,732; end @742. DB writes: lead_workflow_progress @202,289,310,744; lead_nudge_tracking @315,335,691,764; leads @719,732, all under service-role (bypasses RLS).

Verdict: an unauthenticated caller CAN drive arbitrary workflow execution over already-defined workflows (on-demand real call/SMS/AI-SMS/webhook/assistable side effects; enroll any leadId into any existing workflowId; pause/resume/remove). Bound: no path here authors new step definitions, so arbitrary = arbitrary triggering/enrollment over existing definitions + attacker-chosen lead targets.

Per-function row: workflow-executor | main gate WORKFLOW_AUTOMATION_NOT_CERTIFIED@224, WORKFLOW_WEBHOOK_EGRESS_NOT_CERTIFIED@1746 | live v476 (est) | Live has gate? NO | Evidence: full live source read, 0 gate strings, real fetch for webhook step, no resolve_external_effect, no inbound auth | 1157 lines live / 1892 main | newer side: main.

Validation: full-file read + PowerShell Grep counts; all cites from direct reads. No live network probes made. Follow-ups: verify deployed bytes match the on-disk functions-live snapshot and that the live gateway honors verify_jwt=false; check whether downstream gated functions would still 503 the egress.

## Artifact

**Findings**

(a) CONFIG: [functions.workflow-executor] at supabase/config.toml:207; verify_jwt = false at supabase/config.toml:210 (comment 208-209). Matches expected false.  (b) GATE: LIVE bytes contain NO certification gate. grep of supabase/functions-live/workflow-executor/index.ts for NOT_CERTIFIED|certified|resolve_external_effect returned 0 matches. Main (supabase/functions/workflow-executor/index.ts) has error_code WORKFLOW_AUTOMATION_NOT_CERTIFIED @224 and error_code WORKFLOW_WEBHOOK_EGRESS_NOT_CERTIFIED @1746 (matches LIVE-VS-MAIN-GATES.md:37,58). At LIVE:224 there is only a closing brace, so LIVE is the pre-gate variant.  (c) ANON REACHABILITY: the handler does ZERO inbound authentication. grep LIVE for getUser|jwt|unauthor|401|403|denied|forbidden|svix|signature|hmac = 0 matches. The only authorization tokens are line 14 (CORS Access-Control-Allow-Headers response header) and line 982 (OUTBOUND Bearer using the service-role key to call assistable-make-call). The handler builds a service-role client at index.ts:23-36 from SUPABASE_SERVICE_ROLE_KEY (@24) and reads action/userId/leadId/workflowId/campaignId straight from await req.json() @37 - no JWT, apikey, or signature check before dispatch. With verify_jwt=false the platform does not require a JWT either, so an anon caller (anon key or none) passes and reaches full execution.  ACTIONS with LIVE cites: health_check @39 (read-only); start_workflow @60 (dup check @64-69, insert into lead_workflow_progress @202-211 - enrolls a chosen leadId into an existing workflowId); execute_pending @225 (selects active+due progress rows limit 100 @228-233, batches of 10 @236-246, calls executeStep per row @259 -> runs the multi-step engine); remove_from_workflow @287 (update status=removed @289-297); pause_workflow @309 (progress paused @310, lead_nudge_tracking sequence_paused @315); resume_workflow @328 (progress active @329-333, nudge tracking @335). None gated.  STEP ENGINE (switch @651): call @652 -> executeCallStep @780 -> functions.invoke(outbound-calling) @826 = REAL outbound dial; sms @655 -> executeSmsStep @852 -> invoke(sms-messaging) @879 = REAL SMS egress; ai_sms/ai_auto_reply @658-659 -> executeAiSmsStep @907 -> invoke(ai-sms-processor) @926; wait @662 (no-op, schedules next_action_at); email @668 (not implemented, skipped); webhook @675 -> executeWebhookStep @1019 -> real fetch(webhookUrl) @1038-1045 with method=config.method||POST @1039 and headers ...config.headers @1042 = REAL outbound egress (SSRF surface; URL comes from DB step config, not the request body); assistable_call @678 -> executeAssistableCallStep @958 -> fetch assistable-make-call @979 = REAL AI call; condition/branch @681-682; tag/update_status @716-717 -> writes leads.status @719 and leads.tags @732; end/stop @742 -> completes progress @744. Step loop support re-arms steps in moveToNextStep @1064-1138.  DB WRITES (service-role client @36, bypasses RLS): lead_workflow_progress insert @202; update @289,310,329,580,590,598,621,634,744,1067,1083,1098,1111,1123,1131; lead_nudge_tracking update @315,335 and upsert @691,764; leads update @719,732.  VERDICT: an unauthenticated caller CAN drive workflow EXECUTION of already-defined workflows. execute_pending runs every active+due workflow row on demand (real call/SMS/AI-SMS/webhook/assistable side effects); start_workflow enrolls any chosen leadId into any existing workflowId; pause/resume/remove mutate workflow state. Bound: this function has no path that authors new workflow_steps/lead definitions, so arbitrary means arbitrary triggering and enrollment over existing definitions plus attacker-chosen lead targets and on-demand webhook egress to already-configured URLs.

**evidence**

- supabase/config.toml:207 [functions.workflow-executor]
- supabase/config.toml:210 verify_jwt = false
- supabase/functions-live/workflow-executor/index.ts:23-36 env + service-role createClient
- supabase/functions-live/workflow-executor/index.ts:24 SUPABASE_SERVICE_ROLE_KEY
- supabase/functions-live/workflow-executor/index.ts:37 action/userId/leadId/workflowId/campaignId from await req.json()
- supabase/functions-live/workflow-executor/index.ts:225 execute_pending
- supabase/functions-live/workflow-executor/index.ts:259 executeStep
- supabase/functions-live/workflow-executor/index.ts:651 switch(step.step_type)
- supabase/functions-live/workflow-executor/index.ts:826 invoke outbound-calling
- supabase/functions-live/workflow-executor/index.ts:879 invoke sms-messaging
- supabase/functions-live/workflow-executor/index.ts:926 invoke ai-sms-processor
- supabase/functions-live/workflow-executor/index.ts:979 fetch assistable-make-call
- supabase/functions-live/workflow-executor/index.ts:1038-1045 fetch(webhookUrl)
- supabase/functions-live/workflow-executor/index.ts DB writes at 202,289,310,719,732,744,764
- LIVE line count 1157 via PowerShell Get-Content .Count
- supabase/functions/workflow-executor/index.ts:224 WORKFLOW_AUTOMATION_NOT_CERTIFIED on main
- supabase/functions/workflow-executor/index.ts:1746 WORKFLOW_WEBHOOK_EGRESS_NOT_CERTIFIED on main
- docs/wholesale/audit/phase1/LIVE-VS-MAIN-GATES.md:37 and :58

**validation**

Read the LIVE index.ts in full; line count confirmed 1157 via PowerShell (Get-Content).Count. Grep counts: NOT_CERTIFIED/certified/resolve_external_effect = 0 in LIVE; getUser|jwt|unauthor|401|403|denied|forbidden|svix|signature|hmac = 0 in LIVE. Main gate strings confirmed present at main index.ts:224 and :1746. config.toml lines read directly with numbering (Select-String). All cites come from direct file reads/Select-String output, not memory.

**open_questions**

- Does the deployed LIVE function (emonjusymdripmkvtttc) actually honor verify_jwt=false, and are the deployed bytes identical to the on-disk functions-live snapshot? Repo config.toml is not proof of the deployed gateway setting.
- Can lead_workflow_progress / workflow_steps rows be influenced elsewhere to widen arbitrary beyond existing definitions?

**what_i_did_not_check**

- No live HTTP/anon-key probe of the deployed function was made (research-only, no live network calls). Anon reachability is proven from on-disk handler bytes plus repo config.toml, not from a live response.
- Did not verify that the deployed live bytes match supabase/functions-live/workflow-executor/index.ts, nor the deployed gateway auth setting for this slug.
- Did not audit RLS policies on lead_workflow_progress/leads/workflow_steps - immaterial here because the handler uses the service-role key @36 which bypasses RLS.
- Did not inspect the downstream functions the executor invokes (outbound-calling, sms-messaging, ai-sms-processor, assistable-make-call) to see whether their own live gates would 503 the egress - workflow-executor itself has none, but downstream egress may still be blocked.
- Did not date the LIVE snapshot beyond LIVE-VS-MAIN-GATES.md's 2026-07-01/2026-07-13 claims.

**confidence**: high