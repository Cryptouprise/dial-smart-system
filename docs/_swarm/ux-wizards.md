# ux-wizards

- status: completed
- tldr: 3 wizards characterized: MissionBriefing = 10 steps, ~110 controls, wall of fields + dead end; Onboarding = 14 areas, guided path (router); ConfigurationStepRenderer = 14-area dispatcher, guided.

WIZARD/ONBOARDING slice done. MissionBriefingWizard: 10 steps (totalSteps=10 line 432), ~45 fields + 56 disposition toggles + 9 workflow switches; defaults pre-filled, inline validation via canAdvance() line 450-475, progress bar line 915 + back line 1802; VERDICT wall of fields AND dead end: handleBuild (line 659) early-returns because isAutonomousCampaignBuildCertified() is hardcoded false (line 322-324, guard line 664), and the final Build button is hard-disabled 'Autonomous Build Locked' (line 1823) so the success screen (line 790) is unreachable. OnboardingWizard: 14 areas (CONFIGURATION_AREAS line 35-151), 14 checkboxes + delegated child forms (ConfigurationStepRenderer line 866), per-area skip (line 631), progress (line 920), defaults auto-selected by use case (line 311), TTV just calls onComplete/navigates (line 671-676); VERDICT guided success path (a router/menu). ConfigurationStepRenderer: 14 dispatched switch cases (line 227), 0 own fields, interaction-gated Complete (line 635); VERDICT guided success path (dispatcher). Full evidence with file:line in the node artifact. No repo writes.

## Artifact

**Findings**

MissionBriefingWizard.tsx (src/components/): 10 steps (FACT: totalSteps=10 at line 432; step state useState(0) line 329; rendered as step===0..9 at lines 925,941,1028,1115,1244,1315,1451,1477,1522,1597; STEP_NAMES map 0-9 lines 437-448). ~45 data-entry fields across the 10 steps plus 9 workflow switches (step 7, generateWorkflowSteps 'balanced' line 262-273) and 56 disposition badge toggles (step 8: 8 events x 7 actions, EVENT_LABELS line 220-229, ACTION_OPTIONS line 231-239) = ~110 interactive controls. Defaults pre-filled via INITIAL_DATA (line 139-173) and DEFAULT_EVENT_HANDLING (line 128-137); only step 0 businessDescription is blank-required. Inline per-step validation via canAdvance() line 450-475 disabling Next (NOT an end wall). Progress bar line 915 + 'Step X of Y' badge line 911-913; Back button line 1802-1816. KEY DEFECT: the wizard cannot finish. Completion handler handleBuild (line 659) early-returns at line 664-667 because isAutonomousCampaignBuildCertified() is hardcoded false (line 322-324), AND the final Build button is hard-`disabled` with label 'Autonomous Build Locked' (line 1823). So a user fills 10 steps and hits a locked door; the 'Mission Launched' success screen (line 790-901) is unreachable from the UI. VERDICT: wall of fields + dead end. | OnboardingWizard.tsx (src/components/ai-configuration/): 14 configuration areas/steps (FACT: CONFIGURATION_AREAS line 35-151: phone_numbers, sip_trunk, ai_agent, leads, workflows, campaign, dialer_settings, number_pools, voice_broadcast, integrations, compliance, budget, lead_scoring, autonomous_agent). The shell itself has no data-entry fields; it has 14 checkboxes (ConfigurationAreaCard Checkbox line 1090) and delegates each area's form to ConfigurationStepRenderer (line 866-887). Strongly skippable: per-area 'Skip This Step' (CompletionFooter line 631, renderStepIntro Skip line 216), 'Skip Setup' (line 907), 'Skip for Now' (line 743). Progress bar line 860 (in-area) and line 920 (checklist) + 'Step X of Y' line 862 + 'X of Y completed' line 917. Back via handleGoBack line 396 / button line 771. Defaults pre-filled: areas auto-selected by use case (getRecommendedAreas line 311, handleUseCaseSelect line 299-309). Validation inline: handleStartSetup requires >=1 area (line 352); per-area completion requires interaction (handleCompleteClick line 43). TTV: completion runs onComplete() or navigates to /?tab=overview (line 671-676); it does not itself create a running campaign. Primary CTA 'Quick Start (4 steps)' (line 703-716) mounts QuickStartWizard (line 758-759), whose STEPS array has 5 entries (line 21-62) and whose final button 'Go to Campaigns & Start Calling' (line 226-229) merely navigates to /dashboard?tab=campaign-results (line 91). VERDICT: guided success path (scaffolded, skippable, defaults, progress, back) but it is a router/menu, not a value-producing build. | ConfigurationStepRenderer.tsx (src/components/ai-configuration/): NOT a step wizard; a dispatcher. 14 explicit switch cases matching the 14 areas (switch line 227: phone_numbers, sip_trunk, dialer_settings, campaign, ai_agent, leads, workflows, number_pools, voice_broadcast, lead_scoring, budget, integrations, compliance, autonomous_agent + default line 583). Own step count = 0; own form fields = 0 (only UI state hasInteracted line 34, showConfirmation line 35). Skippable via CompletionFooter Skip (line 631) and confirmation modal Skip (line 71). No progress/back locally (parent owns them). Validation = interaction gate: Complete button disabled until hasInteracted (line 635); a confirmation modal intercepts no-change completes (line 43-49). TTV: onComplete -> parent handleAreaComplete -> next area or completion; launches nothing itself. VERDICT: guided success path (dispatcher, no field wall).

**evidence**

- src/components/MissionBriefingWizard.tsx:432 totalSteps = 10
- src/components/MissionBriefingWizard.tsx:329 const [step, setStep] = useState(0)
- src/components/MissionBriefingWizard.tsx:437-448 STEP_NAMES 0..9
- src/components/MissionBriefingWizard.tsx:450-475 canAdvance() inline validation
- src/components/MissionBriefingWizard.tsx:139-173 INITIAL_DATA defaults
- src/components/MissionBriefingWizard.tsx:128-137 DEFAULT_EVENT_HANDLING
- src/components/MissionBriefingWizard.tsx:220-239 EVENT_LABELS(8) + ACTION_OPTIONS(7)=56 toggles
- src/components/MissionBriefingWizard.tsx:911-915 progress badge + Progress bar; 1802-1816 Back button
- src/components/MissionBriefingWizard.tsx:659 handleBuild; 664-667 early return; 322-324 isAutonomousCampaignBuildCertified()=>false
- src/components/MissionBriefingWizard.tsx:1823 final Build button hard-disabled 'Autonomous Build Locked'
- src/components/MissionBriefingWizard.tsx:790-901 unreachable success screen
- src/components/ai-configuration/OnboardingWizard.tsx:35-151 CONFIGURATION_AREAS (14)
- src/components/ai-configuration/OnboardingWizard.tsx:299-328 handleUseCaseSelect/getRecommendedAreas
- src/components/ai-configuration/OnboardingWizard.tsx:860-863 area progress + Step X of Y
- src/components/ai-configuration/OnboardingWizard.tsx:396-420 handleGoBack
- src/components/ai-configuration/OnboardingWizard.tsx:671-676 completion onComplete/navigate
- src/components/ai-configuration/OnboardingWizard.tsx:703-716 Quick Start CTA; 758-759 mounts QuickStartWizard
- src/components/ai-configuration/QuickStartWizard.tsx:21-62 STEPS (5); 226-229 final button; 91 navigate
- src/components/ai-configuration/ConfigurationStepRenderer.tsx:227-599 switch over 14 areaIds
- src/components/ai-configuration/ConfigurationStepRenderer.tsx:34-49 hasInteracted/showConfirmation; 635 disabled=!hasInteracted
- src/components/ai-configuration/ConfigurationStepRenderer.tsx:631,71 Skip buttons

**validation**

Read all three named files plus OnboardingWizard's primary CTA QuickStartWizard.tsx and ConfigurationProgress.tsx end to end (full files, not excerpts). Counts derived from named constants (totalSteps, CONFIGURATION_AREAS length, STEPS length) and explicit rendered step blocks, not estimates. Verified the completion handlers by reading the functions (handleBuild, handleAreaComplete, QuickStart handleComplete) and the button state. No repo writes performed.

**open_questions**

- Does any other entry point mount MissionBriefingWizard with the disabled flag lifted, or is autonomous build globally unreachable?
- What are the exact field counts inside the child components that ConfigurationStepRenderer renders (PhoneNumberPurchasing, RetellAISetupWizard, LeadUpload, CampaignSetupWizard, etc.)? Not counted here.
- Is OnboardingWizard actually surfaced to new users, or is the entry the CampaignWizard/QuickAIAction instead?

**what_i_did_not_check**

- Child components rendered by ConfigurationStepRenderer (PhoneNumberPurchasing, SipTrunkManager, AdvancedDialerSettings, CampaignSetupWizard, WorkflowBuilder, VoiceBroadcastManager, LeadScoringSettings, BudgetManager, GoHighLevelManager, RetellAISetupWizard, AIWorkflowGenerator, LeadUpload) - their internal field counts are unknown.
- Sibling wizards not in scope: CampaignWizard, QuickAIAction.tsx, AISetupAssistant.tsx, ConfigurationAreaIntegrations.tsx.
- Whether the MissionBriefingWizard 'disabled' Build button is ever conditionally enabled elsewhere in the app.
- Runtime behavior / actual screenshot UX; this is a static source read.

**confidence**: high