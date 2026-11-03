# dw-lead-assign

- status: completed
- tldr: First-campaign lead assignment required by all gates but missing from happy path; wizard never writes campaign_leads and no frontend launch exists

dw-lead-assign COMPLETE. First-campaign lead assignment is REQUIRED by all gates but MISSING from the happy path; no frontend launch exists anyway.

Findings:
- addLeadsToCampaign (src/hooks/usePredictiveDialing.ts:588-643; campaign_leads insert at :619) has ONE UI caller: EnhancedLeadManager.tsx:242-261 (call :252). Not in the wizard/onboarding.
- CampaignSetupWizard creates status:'draft' (CampaignSetupWizard.tsx:168), jumps to step 5 Review (:177) with toast "add leads" (:176); step 3 defers "assign leads after campaign creation" (:416); step 5 has NO assign control (:470-528); its leads_assigned fix (:512) routes to Onboarding Import Leads.
- Onboarding Import Leads (OnboardingWizard.tsx:61-67 -> ConfigurationStepRenderer.tsx:366-379) renders <LeadUpload/>, which inserts into `leads` only (LeadUpload.tsx:308) and NEVER into campaign_leads (grep=0); its dropdown filters status='active' (:87), so a draft campaign can't be chosen.
- Required gates: CampaignLauncher {id:'leads',required:true} (:30) fails on 0 (:77), canLaunch blocks (:226-229); useCampaignReadiness leads_assigned fail critical:true + blockingReasons (:454-462).
- No frontend launch: CampaignLauncher.launchCampaign only toasts launch-lock (:241-246); QuickTestCampaign.activateCampaignAndDispatch only toasts (:162-179); browserCallDispatchAllowed=false (launchSafety.ts:128-133).
- Server dispatch (supabase/functions/call-dispatcher/index.ts:879 active-only; :891-899 early return; :1011-1070 read+filter campaign_leads) silently no-ops on zero leads, console.log only (:1070).
- Real assignment UI lives only in tabs: CampaignLeadManager (CampaignManager.tsx:2040-2046, gated draft/paused at launchSafety.ts:121-126), LeadImportDialog:479, QuickLeadLoader:102/179, ReadinessFixDialogs:493, QuickTestCampaign:133 (QuickTestCampaign.tsx).

Conclusion: lead assignment is REQUIRED by every gate but MISSING from the first-campaign happy path; an empty first campaign is blocked at preflight/readiness and would silently no-op at dispatch. Ranked day-one failures: (CRIT) no assign step in wizard + fix path doesn't attach to campaign; (CRIT) launch fully launch-locked so first campaign cannot activate from frontend; (HIGH) LeadUpload dropdown excludes draft campaigns; (MED) empty campaign silent no-op at dispatcher; (LOW) tutorial copy implies a step that doesn't exist.

## Artifact

**Findings**

FACT: addLeadsToCampaign (src/hooks/usePredictiveDialing.ts:588-643) inserts into campaign_leads at line 619 (batchSize=500 at 611). Its ONLY UI caller is EnhancedLeadManager.handleAddToCampaign (src/components/EnhancedLeadManager.tsx:242-261, call at :252); it is NOT used by the first-campaign wizard or the onboarding Import Leads step. || FACT: Direct campaign_leads inserts (bypassing the hook) exist at CampaignLeadManager.tsx:227, LeadImportDialog.tsx:479, QuickLeadLoader.tsx:102 & 179, ReadinessFixDialogs.tsx:493, QuickTestCampaign.tsx:133 - all in management/lead tabs, none in the first-campaign happy path. || FACT: The first-campaign wizard (src/components/CampaignSetupWizard.tsx) creates the campaign with status:'draft' (168), jumps to step 5 Review (177) with toast 'Now add leads to your campaign' (176); step 3 says 'You can assign leads after campaign creation' (416); step 5 (470-528) renders ONLY CampaignReadinessChecker + fix guidance with no lead-assign control; the leads_assigned fix route (512) points to /?tab=onboarding&fixArea=leads. || FACT: The onboarding 'Import Leads' area (OnboardingWizard.tsx:61-67) renders via ConfigurationStepRenderer.tsx:366-379 the <LeadUpload/> component, which NEVER inserts into campaign_leads (grep = 0 matches in file); it only inserts into leads (LeadUpload.tsx:308). So Import Leads attaches leads to the DB but NOT to the campaign. || FACT: LeadUpload loads its campaign dropdown filtered to status='active' (LeadUpload.tsx:83-88, .eq('status','active') at 87), so a fresh draft campaign cannot even be selected there. || FACT: Every preflight/readiness gate treats leads as required: CampaignLauncher declares {id:'leads',required:true} (CampaignLauncher.tsx:30) and fails when count==0 (69-78); canLaunch() blocks required fails (226-229); useCampaignReadiness pushes leads_assigned status fail critical:true and blockingReasons.push('No leads attached to campaign') (useCampaignReadiness.ts:454-462). || FACT: No frontend path actually launches/dispatches. CampaignLauncher.launchCampaign() only fires a launch-lock toast (CampaignLauncher.tsx:231-246); QuickTestCampaign.activateCampaignAndDispatch() only fires a launch-lock toast (QuickTestCampaign.tsx:162-179); launchSafety.browserCallDispatchAllowed() is hard false (launchSafety.ts:128-133). So an empty first campaign does not 'die' at frontend launch because launch from the browser is impossible. || FACT: At the server boundary, call-dispatcher selects only status='active' campaigns (supabase/functions/call-dispatcher/index.ts:879) and returns early if none (891-899); it then reads campaign_leads (1012-1025) and filters to leadsToQueue (1031-1068). Zero campaign_leads rows => empty leadsToQueue => nothing queued => silent no-op, surfaced only as a console.log (1070) with no error. || FACT: The true campaign-assignment UI CampaignLeadManager is rendered only inside CampaignManager (CampaignManager.tsx:2040-2046), gated by browserCampaignConfigurationMutationAllowed(status) which allows only 'draft' or 'paused' (launchSafety.ts:121-126; launchSafety.test.ts:31 confirms active=false). || CONCLUSION: Lead assignment is REQUIRED by every gate (critical) but MISSING from the first-campaign happy path; the wizard and the recommended fix path (Onboarding Import Leads -> LeadUpload) never write campaign_leads. An empty first campaign is blocked at the readiness/preflight gate and, if it ever became active without leads, silently no-ops at dispatch.

**evidence**

- src/hooks/usePredictiveDialing.ts:588-643 (addLeadsToCampaign; campaign_leads insert at 619)
- src/components/EnhancedLeadManager.tsx:242-261 (handleAddToCampaign, call at 252)
- src/components/CampaignSetupWizard.tsx:148-183 (draft create), 416 ('assign leads after campaign creation'), 470-528 (step 5 Review, no assignment), 512 (fix route)
- src/components/ai-configuration/OnboardingWizard.tsx:61-67 (leads area); src/components/ai-configuration/ConfigurationStepRenderer.tsx:366-379 (renders LeadUpload)
- src/components/LeadUpload.tsx:83-96 (campaign dropdown .eq('status','active')), 305-318 (inserts into leads only, no campaign_leads)
- src/components/CampaignLauncher.tsx:30,69-78,226-246 (required leads check + launch lock)
- src/hooks/useCampaignReadiness.ts:450-471 (leads_assigned critical fail + blockingReasons)
- src/components/QuickTestCampaign.tsx:162-179 (activation locked)
- src/lib/launchSafety.ts:115-133 (browser status/dispatch gates)
- src/components/CampaignManager.tsx:2040-2046 (CampaignLeadManager render + gate)
- supabase/functions/call-dispatcher/index.ts:876-900,1011-1070 (active-only, early return, empty silent no-op)

**validation**

Grep for addLeadsToCampaign and campaign_leads across src/ and supabase/ (callers enumerated). Read-in-full of CampaignSetupWizard, CampaignLeadManager, QuickTestCampaign, CampaignLauncher preflight, LeadUpload insert path, useCampaignReadiness leads check, launchSafety gates, and call-dispatcher queue-build region. Cross-checked launchSafety.test.ts expectations. Static read-only; no live system calls.

**open_questions**

- Do any other frontend surfaces (CampaignReadinessChecker onLaunch, Dashboard tabs, useCampaignReadiness) transition a campaign draft->active or trigger dispatch?
- Does the campaign_contact_release_gate migration/trigger (supabase/migrations/20260713150000_campaign_contact_release_gate.sql) additionally block campaign_leads enrollment or dispatch for unapproved cohorts?
- Are QuickLeadLoader.tsx and ReadinessFixDialogs.tsx reachable from the first-campaign happy path?

**what_i_did_not_check**

- Any frontend launch/activate entry point other than CampaignLauncher, QuickTestCampaign and launchSafety gates (did not exhaustively enumerate all status->active writers).
- The duplicate campaigns/functions mirror vs supabase/functions and functions-live/* dispatcher copies.
- Supabase RLS policies/triggers that could reject campaign_leads inserts (release-gate migration, multi-org routing trigger).
- Whether a cron/trigger/admin tool auto-transitions draft campaigns to active and what it requires.
- QuickLeadLoader.tsx and ReadinessFixDialogs.tsx reachability from the guided happy path.
- Database schema constraints (unique campaign_id+lead_id, NOT NULL) on campaign_leads.

**confidence**: high