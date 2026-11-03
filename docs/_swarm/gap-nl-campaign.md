# gap-nl-campaign

- status: completed
- tldr: NL->campaign = two islands, both gated off on main; generator makes workflows only, wizard delegates to ai-brain setup_full_campaign; live is pre-gate legacy.

LANE gap-nl-campaign DONE (read-only). 'Describe what you want and it creates the campaign' = two separate islands, both hard-gated on main, ~90% built on paper / 0% live on main.

CHAIN A (workflow only): AIWorkflowGenerator.tsx (Dashboard.tsx:473) -> useAIWorkflowGenerator.ts:25 -> ai-workflow-generator edge fn: GATE isAiWorkflowGenerationCertified()=false (:8-10), 503 (:17-22). Even open, returns only {workflow:{name,description,steps}} (:79-85,149). Save writes campaign_workflows+workflow_steps only (:78-105) - NO campaign, NO campaigns.workflow_id.

CHAIN B (NL -> full campaign, the real promise): MissionBriefingWizard.tsx handleBuild (:659) GATED isAutonomousCampaignBuildCertified()=false (:322-324, gate :664). Open, it builds a text prompt ending 'setup_full_campaign' (:771) and sends it to ai-brain chat (:774). ai-brain case setup_full_campaign (:4230+) DOES create campaigns(status:'paused')(:4242), campaign_workflows active(:4338), workflow_steps(:4354), campaigns.workflow_id link(:4357), autonomous full_auto(:4363). ai-brain itself gated isAiBrainTenantCertified()=false (:10-12).

EXECUTOR: main workflow-executor is a REAL executor (outbound-calling :1468, sms-messaging :1542, ai-sms-processor :1607, assistable :1678; webhook disabled :1740) but GATED (isWorkflowAutomationCertified()=false :34-36, 503 :220 blocks execute_pending too). Live snapshot functions-live/workflow-executor has 0 gate + real webhook fetch.

MISSING LINKS: (1) ai-workflow-generator gate off; (2) generator output is workflow-only, never creates/links a campaign; (3) ai-brain gate off -> setup_full_campaign unreachable on main; (4) MissionBriefingWizard gate off; (5) workflow-executor gate off -> even a built campaign executes nothing; (6) enrollment is separate (LeadUpload start_workflow :344; call-dispatcher execute_pending :781,1146) and setup_full_campaign creates the campaign PAUSED (:4248).

VALIDATION: read the 5 files + connecting edge functions from disk; cross-checked gates against repo audit doc docs/wholesale/audit/phase1/LIVE-VS-MAIN-GATES.md (live=pre-gate legacy, main=gated). Read-only, nothing executed live. Confidence medium (live ai-brain/ai-workflow-generator not runtime-probed).

## Artifact

**Findings**

TWO SEPARATE ISLANDS, both certificate-locked on main. (1) 'AI Workflow Generator' turns NL text into a WORKFLOW ONLY (never a campaign); (2) 'Mission Briefing Wizard' does NL->full campaign but only by delegating to ai-brain's setup_full_campaign tool. The live workflow-executor really does place calls / send SMS (not abstract) but is gated off on main and executes nothing until leads are separately enrolled. NL output never structurally feeds CampaignManager/CampaignWizard: the generator writes campaign_workflows+workflow_steps with no campaign and no campaigns.workflow_id link.

CHAIN A (workflow-only): AIWorkflowGenerator.tsx (mounted: Dashboard.tsx:473 tab 'AI Workflows'; ConfigurationStepRenderer.tsx:396) -> useAIWorkflowGenerator.generateWorkflow -> invoke 'ai-workflow-generator' (useAIWorkflowGenerator.ts:25) -> EDGE FN supabase/functions/ai-workflow-generator/index.ts: GATE isAiWorkflowGenerationCertified()=false (:8-10) returns 503 (:17-22). Even ungated it only returns {workflow:{name,description,steps,sms_templates}} (:79-85, :149) via Lovable gateway gemini-2.5-flash (:93-107). Save path saveGeneratedWorkflow writes campaign_workflows + workflow_steps only (useAIWorkflowGenerator.ts:78-105) - creates a workflow, NO campaign, NO campaigns.workflow_id assignment. WorkflowBuilder.handleAIBuildWorkflow also calls it and drops steps into the editor (:236-298).

CHAIN B (NL->full campaign, the 'it creates the campaign' promise): MissionBriefingWizard.tsx (mounted: AutonomousAgentDashboard.tsx:632) -> handleBuild (:659) GATED by isAutonomousCampaignBuildCertified()=false (:322-324), toast+return at :664-667. Ungated, it assembles a long text prompt (:710-772) ending 'Create this campaign now using setup_full_campaign' (:771) and hands it to sendMessage() = the ai-brain chat (:774). ai-brain tool case 'setup_full_campaign' (supabase/functions/ai-brain/index.ts:4230+) DOES build everything: insert campaigns status:'paused' (:4242-4256), derive call/wait/sms/ai_sms steps from strategy (:4268-4335), insert campaign_workflows active:true (:4338-4348), insert workflow_steps (:4352-4354), set campaigns.workflow_id (:4357-4360), upsert autonomous_settings full_auto (:4363-4390). ai-brain itself is gated: isAiBrainTenantCertified()=false (:10-12), AI_BRAIN_NOT_TENANT_CERTIFIED@4659.

EXECUTOR: main supabase/functions/workflow-executor/index.ts is a REAL executor but GATED (isWorkflowAutomationCertified()=false :34-36; 503 at :220-230 blocks every action incl. execute_pending). Body genuinely acts: executeCallStep invokes 'outbound-calling' (:1468-1481), executeSmsStep invokes 'sms-messaging' (:1542-1554), executeAiSmsStep invokes 'ai-sms-processor' (:1607-1622), executeAssistableCallStep fetches 'assistable-make-call' (:1678), webhook egress explicitly disabled (:1740). Live snapshot supabase/functions-live/workflow-executor/index.ts has NO gate and no effect-ledger (real fetch webhook :1038).

CAMPAIGN<->WORKFLOW LINK EXISTS: campaigns.workflow_id set by both CampaignWizard.handleCreate (:448) and setup_full_campaign (:4359). workflow-executor loads campaign_workflows+workflow_steps and enforces campaign.workflow_id===progress.workflow_id (:1164-1192). Enrollment is a SEPARATE step: LeadUpload.tsx invokes workflow-executor action 'start_workflow' (:344-347). Scheduling tick: call-dispatcher invokes action 'execute_pending' (call-dispatcher/index.ts:781,1146), per AUTONOMOUS_SYSTEM_FLOW.md automation-scheduler -> workflow-executor execute_pending. useAutonomousAgent.ts is a THIRD, separate engine (agent_decisions loop), gated by browserAutonomousActionAllowed() (:278-285); its queueCall only sets next_callback_at, does NOT dial (:359-367) - so it is not a back-door to placing calls.

DISTANCE ASSESSMENT: the capability is ~90% built on paper but 0% live on main. Every NL entry point is hard-return-false gated, and there is no code path where the generator's output becomes a campaign.

**evidence**

- supabase/functions/ai-workflow-generator/index.ts:8-10 (isAiWorkflowGenerationCertified returns false)
- supabase/functions/ai-workflow-generator/index.ts:17-22 (503 AI_WORKFLOW_GENERATION_NOT_CERTIFIED)
- supabase/functions/ai-workflow-generator/index.ts:79-85,149 (returns {workflow:{name,description,steps,sms_templates}} only)
- src/hooks/useAIWorkflowGenerator.ts:25 (invoke ai-workflow-generator)
- src/hooks/useAIWorkflowGenerator.ts:78-105 (save writes campaign_workflows + workflow_steps only; no campaign)
- src/components/Dashboard.tsx:473 and src/components/ai-configuration/ConfigurationStepRenderer.tsx:396 (AIWorkflowGenerator mount points)
- src/components/WorkflowBuilder.tsx:236-298 (handleAIBuildWorkflow -> ai-workflow-generator)
- src/components/MissionBriefingWizard.tsx:322-324 (isAutonomousCampaignBuildCertified returns false)
- src/components/MissionBriefingWizard.tsx:664-667 (build gate toast+return)
- src/components/MissionBriefingWizard.tsx:710-772,771,774 (prompt text ending 'setup_full_campaign' -> sendMessage)
- src/components/MissionBriefingWizard.tsx:632 (mounted in AutonomousAgentDashboard.tsx:632)
- supabase/functions/ai-brain/index.ts:10-12 (isAiBrainTenantCertified returns false)
- supabase/functions/ai-brain/index.ts:4230-4390 (setup_full_campaign creates campaign+workflow+steps+link+autonomous)
- supabase/functions/ai-brain/index.ts:4248 (campaign inserted status:'paused')
- supabase/functions/ai-brain/index.ts:4357-4360 (campaigns.workflow_id link)
- supabase/functions/workflow-executor/index.ts:34-36,220-230 (isWorkflowAutomationCertified false; 503 all actions)
- supabase/functions/workflow-executor/index.ts:1468-1481,1542-1554,1607-1622,1678,1740 (real outbound-calling/sms-messaging/ai-sms-processor/assistable calls; webhook disabled)
- supabase/functions-live/workflow-executor/index.ts:16-22,1038 (live copy has NO gate; real webhook fetch)
- src/components/CampaignWizard.tsx:361-382 (fetchWorkflows reads campaign_workflows) and :442-460 (campaign insert with workflow_id)
- src/components/LeadUpload.tsx:344-347 (enrolls leads via workflow-executor start_workflow)
- supabase/functions/call-dispatcher/index.ts:781,1146 (invokes execute_pending)
- src/hooks/useAutonomousAgent.ts:278-285,347-368 (browserAutonomousActionAllowed gate; queueCall sets next_callback_at only)
- docs/wholesale/audit/phase1/LIVE-VS-MAIN-GATES.md:11,19,37,58,69 (live deployed 2026-07-01 pre-gate; workflow-executor live v476 no gate; main execute_pending no-ops)

**validation**

Read all five assigned files plus the connecting edge functions (ai-brain setup_full_campaign, campaign-wizard/manager and LeadUpload wiring) directly from disk. Cross-checked the gate state against the repo's own audit doc docs/wholesale/audit/phase1/LIVE-VS-MAIN-GATES.md, which independently states live = pre-gate legacy and main = gated. Confirmed each gate by reading the literal `return false`/503 lines. No commands executed against any live system; read-only.

**open_questions**

- Is ai-workflow-generator deployed live at all, and if so is it pre-gate (working)? LIVE-VS-MAIN-GATES.md only verified 8 functions; ai-workflow-generator and ai-brain were NOT probed.
- Does the live (pre-gate) ai-brain actually contain setup_full_campaign and resolve the tool call, i.e. does NL->campaign work end-to-end on LIVE even though it is dead on main?
- Does automation-scheduler exist live and call workflow-executor execute_pending on a cron (AUTONOMOUS_SYSTEM_FLOW.md claims it; only call-dispatcher invocations were seen in code)?
- What is required to flip each is*Certified() to true (the certification criteria) - tenant context, budgets, bounded inputs throughout?

**what_i_did_not_check**

- Live runtime behavior of ai-brain/ai-workflow-generator (not deployed-probed; relied on static snapshot + audit doc).
- automation-scheduler cron definition/schedule and whether it is live.
- Conversation AI / GHL-side agents that might also read workflows.
- Whether campaigns.status is ever auto-flipped from 'paused' to 'active' after setup_full_campaign (launch activation path).
- CampaignManager.tsx deeper persistence (grep for workflow_id returned 0 there, implying CampaignManager may not manage the workflow link).
- DB RLS/migration state for campaign_workflows/workflow_steps tables on live.

**confidence**: medium