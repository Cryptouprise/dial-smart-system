# dw-campaignwizard

- status: completed
- tldr: CampaignWizard is draft-only, no dispatch; BLOCKER: insert omits organization_id (campaigns requires it) so first-campaign create fails at DB.

DONE: Traced src/components/CampaignWizard.tsx end to end for a brand-new customer's first campaign. TOUCHED: no files (research only). EVIDENCE: see artifact for full file:line list. Key facts: (1) WizardState 205-217 has NO from_number/sms_from_number field; canProceed 478-486 + handleCreate guard 430-435 require only profile+name+workflowId+agentId; description/calling hours/maxCallsPerDay/sms flags/template/script are silently optional. (2) handleCreate 442-460 is INSERT-only with status:'draft' (455); no activation, no dispatch, toasts 'No calls were started'. (3) Never calls addLeadsToCampaign; zero-lead campaign creation is possible. (4) Zero makeCall/functions.invoke(dispatch) matches; only edge call is fetchAgents->retell-agent-management 'list' 350-352. Parents (CampaignManager 2150-2153, CommandCenter 521-524) just close/navigate, no launch. BLOCKER: the insert omits organization_id, but campaigns.organization_id is NOT NULL (20260108_phase2:32; 20261029142121_phase1:123) and trigger campaigns_require_authoritative_tenant raises 'requires an explicit organization_id' on NULL (20260712070000:379-382,398-401); sibling wizards DO set it (CampaignManager:559, CampaignSetupWizard:159). RESULT: ranked day-one failures - BLOCKER org_id omission (CampaignWizard.tsx:442-460); HIGH no SMS sender/caller-ID captured anywhere; MEDIUM zero-agent first-run dead end (fetchAgents empty, agent id required); MEDIUM no script/copy field; MEDIUM workflow-required-but-none-exists for a new tenant. CONFIDENCE: medium (trace high; blocker hinges on live-DB migration state, unverified - no live access). COULD_NOT: verify live DB migration/RLS state.

## Artifact

**Findings**

TRACE OF src/components/CampaignWizard.tsx (891 lines). The wizard is a 5-step dialog (step0 profile picker; steps1-4 info/workflow/agent/launch). It is explicitly a 'Draft Mode' review-only flow: DialogTitle 'Campaign Wizard - Draft Mode' (505) and description 'Build a review-only campaign draft. It cannot launch or contact anyone.' (508).

(1) REQUIRED vs OPTIONAL: WizardState is defined at 205-217 with exactly: name, description, workflowId, agentId, callingHoursStart, callingHoursEnd, maxCallsPerDay, smsOnNoAnswer, smsTemplate, provider, telnyxAssistantId. There is NO from_number and NO sms_from_number field anywhere in the wizard (grep: 0 matches in file). canProceed() (478-486) gates: step0 = selectedProfile!==null; step1 = name.length>0; step2 = workflowId.length>0; step3 = agentId (provider retell) OR telnyxAssistantId (provider telnyx); step4 default true. handleCreate guard (430-435) re-checks the same three (name, workflowId, provider-appropriate agent id). REQUIRED to advance/submit: profile choice, name, workflowId, agent id. SILENTLY OPTIONAL (never validated, only pre-filled by applyProfile 311-323): description, callingHoursStart/End, maxCallsPerDay, smsOnNoAnswer, smsTemplate, provider itself (defaults 'retell' at 299), telnyxAssistantId when provider=retell. The wizard ALSO never collects script/copy (a campaigns.script column exists but is not in WizardState).

(2) SUBMIT PATH: handleCreate (430-476) does a single supabase.from('campaigns').insert({...}) with status:'draft' (455) and .select().single() (459-460). It then toasts 'Draft campaign created ... No calls were started.' (464-467) and calls onComplete(campaign.id); onClose() (468-469). It does NOT update status to active, does NOT call any edge function, does NOT start dispatch. FACT: insert is INSERT-only, draft-only.

(3) LEADS: The wizard NEVER calls addLeadsToCampaign or attaches leads (grep 0 matches for addLeadsToCampaign in file). A campaign can be created with zero leads. addLeadsToCampaign exists in usePredictiveDialing.ts:588-624 (inserts into campaign_leads, requires organization_id match) but it is invoked only from EnhancedLeadManager.tsx:252, never from the wizard.

(4) makeCall / edge function / dispatch: grep of the whole file for makeCall|functions.invoke|dispatch|from_number returned 0 matches. The ONLY edge-function call in the file is fetchAgents -> supabase.functions.invoke('retell-agent-management',{action:'list'}) at 350-352 (read-only list). No dispatch path exists in the wizard.

PARENT HANDLERS (onComplete): CampaignManager.tsx:2150-2153 -> loadCampaigns() + setShowWizard(false); CommandCenter.tsx:521-524 -> setShowWizard(false) + onNavigate('predictive'). Neither launches.

DB-LEVEL BLOCKER (strongest day-one failure): campaigns.organization_id is NOT NULL (migrations 20260108_phase2_add_org_to_core_tables.sql:32 ALTER ... SET NOT NULL; 20261029142121_phase1_org_scope.sql:123) and a BEFORE INSERT trigger campaigns_require_authoritative_tenant (20260712070000_multi_organization_routing_contract.sql:398-401) calls enforce_tenant_owned_core_resource() which RAISES EXCEPTION '... requires an explicit organization_id' when NEW.organization_id IS NULL (lines 379-382). handleCreate's insert object (442-460) sets user_id, name, description, workflow_id, agent_id, calling_hours_start/end, max_calls_per_day, sms_on_no_answer, sms_template, status, provider, telnyx_assistant_id - and DOES NOT set organization_id. The two sibling campaign creators DO set it: CampaignManager.handleCloneCampaign sets organization_id at 559; CampaignSetupWizard.handleCreateCampaign sets organization_id at 159 (and even guards !organizationId at 153). This makes CampaignWizard the anomalous path that would be rejected by the NOT NULL constraint + tenant trigger.

**evidence**

- src/components/CampaignWizard.tsx:205-217 (WizardState; no from_number/sms_from_number)
- src/components/CampaignWizard.tsx:430-460 (handleCreate guard + insert with status:'draft', no organization_id)
- src/components/CampaignWizard.tsx:478-486 (canProceed gating)
- src/components/CampaignWizard.tsx:311-323 (applyProfile pre-fills optional fields)
- src/components/CampaignWizard.tsx:333-346 fetchTelnyxAssistants / 348-359 fetchAgents(invoke retell-agent-management) / 361-382 fetchWorkflows
- src/components/CampaignWizard.tsx:384-428 handleCreateFromTemplate (inserts campaign_workflows active:false + workflow_steps)
- src/components/CampaignWizard.tsx:499-509 (Draft Mode dialog copy)
- src/components/CampaignManager.tsx:2150-2153 and src/components/CommandCenter.tsx:521-524 (onComplete handlers, no launch)
- src/components/CampaignManager.tsx:557-573 (clone insert SETS organization_id:559)
- src/components/CampaignSetupWizard.tsx:155-171 (insert SETS organization_id:159)
- supabase/migrations/20260108_phase2_add_org_to_core_tables.sql:32 (campaigns.organization_id SET NOT NULL)
- supabase/migrations/20261029142121_phase1_org_scope.sql:123 (campaigns.organization_id SET NOT NULL)
- certification/recovery-lineage-v24/migrations/20260712070000_multi_organization_routing_contract.sql:379-382 + 398-401 (trigger raises when organization_id IS NULL)
- certification/recovery-lineage-v24/migrations/20260712000000_live_public_schema_baseline.sql:3397-3424 (campaigns columns: script/sms_from_number/agent_id/telnyx_assistant_id NULLABLE; status CHECK draft/active/paused/completed)
- supabase/migrations/20251213222334_...sql:3 (ADD COLUMN IF NOT EXISTS sms_from_number TEXT; nullable)
- src/hooks/usePredictiveDialing.ts:588-624 (addLeadsToCampaign, org-scoped; not called by wizard)
- grep result: 0 matches for from_number|sms_from_number|addLeadsToCampaign|makeCall|functions.invoke|dispatch in CampaignWizard.tsx

**validation**

Read the entire 891-line CampaignWizard.tsx. Grepped the file for from_number|sms_from_number|addLeadsToCampaign|makeCall|functions.invoke|dispatch -> 0 matches. Grepped repo for addLeadsToCampaign -> defined usePredictiveDialing.ts:588, used only EnhancedLeadManager.tsx:252. Read both real parent onComplete handlers. Read campaigns table definition in the v24 schema baseline (columns/constraints). Confirmed organization_id NOT NULL via two migrations and the tenant trigger exception text. Cross-checked two sibling campaign-insert sites that DO set organization_id. Read invariant test src/lib/__tests__/launchSafety.test.ts:96-128 which asserts active:false for templates, status:'draft' for the campaign, and the review-only profile.

**open_questions**

- Is the org-scope migration set (20260108 phase2 / 20261029142121 phase1_org_scope / 20260712070000 tenant trigger) actually APPLIED to the live/staging Supabase DB? If not applied, the campaign would insert but be org-invisible to org-scoped screens.
- Does the live DB have an RLS INSERT policy on campaigns that would independently reject a NULL organization_id?
- Is there any AFTER INSERT trigger on campaign_leads or a dispatch-queue table that could kick dialing (not audited here)?
- Does the campaigns.script column get populated elsewhere at activation, or is a scriptless campaign functional at all?

**what_i_did_not_check**

- Live/deployed Supabase DB state - whether the org-scope migrations and tenant trigger are actually applied (research-only, no live access). This is the pivot for whether the org_id omission is a hard blocker or a latent miss.
- RLS policies on public.campaigns for the INSERT role in the live DB.
- Exhaustive trigger/queue audit on campaign_leads and any dialing-queue table (only campaigns triggers were checked).
- Internals of the retell-agent-management edge function (fetchAgents source of truth).
- CampaignManager's full wizard-adjacent launch path and the 'predictive' navigation target in CommandCenter (did not follow onNavigate('predictive') to its screen).
- Whether a from_number/caller-ID/sms_from_number is derived server-side at dispatch time rather than stored on the campaign.

**confidence**: medium