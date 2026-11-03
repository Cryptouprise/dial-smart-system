# quality-size

- status: completed
- tldr: 22 files over 1500 lines measured; full list + top-5 split plans delivered; edge functions vs React components noted.

Node quality-size DONE. Measured every .ts/.tsx under src/ and supabase/functions/ (PowerShell Measure-Object -Line, not trusted from brief): 22 files exceed 1500 lines. Structure verified for 15 files incl. all 9 largest (>6 required). Delivered: full over-1500 list with real counts, split into 12 edge functions vs 8 React components vs 2 others (codegen types.ts 9332, non-React host.ts 1866); top-5 split plans with concrete module targets (ai-brain, ai-autonomous-engine, calendar-integration, VoiceBroadcastManager, AgentEditDialog); caveat that types.ts is generated and must not be hand-split. RESEARCH ONLY, nothing modified. Confidence: high on measurements, medium on split proposals.

## Artifact

**Findings**

FACT: Exactly 22 .ts/.tsx files under src/ and supabase/functions/ exceed 1500 lines, measured with PowerShell (Get-Content | Measure-Object -Line) over the whole tree at C:/Users/charl/dial-smart-system.

FACT: The 22 over-1500 files split into three classes: (a) 12 Supabase Edge Functions (supabase/functions/*/index.ts), (b) 8 React components (src/components/*.tsx), (c) 2 others - src/integrations/supabase/types.ts (auto-generated Supabase codegen, 9332 lines) and src/packs/door_to_door/host.ts (1866, a non-React logic module of pure helper functions + one exported factory createDoorBossHost).

FACT: THE OVER-1500 LIST (measured line counts): src/integrations/supabase/types.ts 9332; supabase/functions/ai-autonomous-engine/index.ts 4954; supabase/functions/ai-brain/index.ts 4656; supabase/functions/calendar-integration/index.ts 3102; supabase/functions/ai-assistant/index.ts 3008; src/components/VoiceBroadcastManager.tsx 2940; supabase/functions/retell-call-webhook/index.ts 2888; src/components/AgentEditDialog.tsx 2561; supabase/functions/voice-broadcast-engine/index.ts 2254; supabase/functions/outbound-calling/index.ts 2078; src/components/CampaignManager.tsx 2052; supabase/functions/call-dispatcher/index.ts 1971; supabase/functions/telnyx-ai-assistant/index.ts 1961; src/packs/door_to_door/host.ts 1866; src/components/AiSmsConversations.tsx 1758; src/components/MissionBriefingWizard.tsx 1707; supabase/functions/twilio-sms-webhook/index.ts 1703; supabase/functions/workflow-executor/index.ts 1699; src/components/CallSimulator.tsx 1647; src/components/TwilioNumbersOverview.tsx 1530; supabase/functions/call-tracking-webhook/index.ts 1508; src/components/TelnyxAssistantEditor.tsx 1506.

FACT: The dominant pattern in the big EDGE FUNCTIONS is a single monolithic serve() request handler plus many module-level async helpers, or a single giant executeToolCall switch. e.g. ai-brain/index.ts has LOCATION_MAP (line 15), SYSTEM_KNOWLEDGE prompt (49), a TOOLS array (293) spanning ~1160 lines of literal JSON tool schemas, then one executeToolCall function starting at 1456 that runs to the end (~3000 lines). ai-assistant/index.ts is the same shape: executeToolCall at 670 running ~2188 lines to 2858. calendar-integration/index.ts puts its serve() at line 38 and runs ~3100 lines before any helper, with all helpers (timezone math, phone normalize, cal-com formatting) dumped AFTER the handler at 3142+.

FACT: ai-autonomous-engine/index.ts (4954) is not one function but ~35 independent top-level async jobs (assessGoalProgress, rescoreLeads, analyzePacing, analyzeFunnel, predictNumberHealth, extractTranscriptIntents, optimizePlaybook, manageLeadJourneys, planDay, six detect*Patterns detectors, trainConversionModel, predictLeadConversion, detectChurnRisk, plus pure stats helpers chiSquare2x2/wilsonScore), orchestrated by runForUser (5110). This is the most mechanically splittable edge function: each job is already a self-contained unit.

FACT: The big REACT components are monolith single-component files whose bodies are dominated by one component with many local handlers (useState/useCallback) plus inline sub-render blocks. VoiceBroadcastManager.tsx is one component with tabbed sections (quick test / broadcast / queue / readiness / progress) and already imports 5 sibling sub-components (QuickTestBroadcast, BroadcastReadinessChecker, BroadcastQueueManager, LiveProgressDashboard, BroadcastStepIndicator) plus 4 data hooks. CampaignManager.tsx (2052) already imports ~12 sibling sub-components and 8 hooks but still keeps a 2000-line orchestrator body. TwilioNumbersOverview.tsx has a long list of ~18 async handlers inside the component. TelnyxAssistantEditor.tsx also defines an inner PhoneNumberAssignment sub-component at line 95 before the main component at 308.

THEORY (proposal, not a verified defect): The top 5 needing a split, by severity and mechanical ease: 1) ai-brain/index.ts - extract tools/schemas.ts (TOOLS), prompts.ts (SYSTEM_KNOWLEDGE + PROMPT_SNIPPETS), location-map.ts (LOCATION_MAP), and split executeToolCall into per-domain handler modules (contacts, campaigns, calendar, workflows, analytics) behind a registry keyed by tool name. 2) ai-autonomous-engine/index.ts - extract detectors/{timing,gap,sequence,source,decay,number}.ts, planning.ts (planDay/generateRuleBasedPlan/planCampaignStrategy/buildRuleBasedStrategy), analysis.ts (chiSquare2x2/statisticalConfidence/wilsonScore), execution.ts (executeApprovedActions/executeCampaignStrategy), and leave runForUser as a thin orchestrator. 3) calendar-integration/index.ts - move all helpers out to tz.ts (zonedLocalToUtc/formatYmd/timezone helpers), phone.ts (normalizePhone/findLeadIdByPhone), calcom.ts + google.ts (token/event-type), and split the 3100-line serve handler into per-action handlers behind handleAction(). 4) VoiceBroadcastManager.tsx - extract constants.ts (ELEVENLABS_VOICES, DEFAULT_DTMF_ACTIONS), a DtmfActionEditor sub-component, a RecipientTable sub-component, a VoiceSelector sub-component, and move data-fetch/state into a useVoiceBroadcastManager hook. 5) AgentEditDialog.tsx - extract constants.ts (VOICE_SAMPLES, ELEVENLABS_VOICE_ID_BY_RETELL_VOICE_ID, buildAgentConfig), a useAgentForm hook, and per-tab panels (VoiceTab, ToolsTab, PromptTab, VoicemailTab) with AgentToolBuilder kept as its own module.

FACT/CAVEAT: src/integrations/supabase/types.ts (9332) is Supabase-generated code (Database type definitions) and must NOT be hand-split; regenerate via supabase gen types. It should be excluded from any refactor plan.

THEORY: No runtime behavior was changed or tested; all split plans are proposals requiring a build + edge-function deploy validation before adoption. Edge functions run on Deno and have their own import/bundle constraints, so extraction must keep each function self-contained (shared helpers should go in supabase/functions/_shared/, which already exists as a convention in this repo).

**evidence**

- Command: PowerShell Get-ChildItem -Recurse -Include *.ts,*.tsx over C:/Users/charl/dial-smart-system/src and /supabase/functions, sorted by Measure-Object -Line. Output top rows confirmed the 22 counts above (e.g. 'src\integrations\supabase\types.ts 9332', 'supabase\functions\ai-autonomous-engine\index.ts 4954', 'supabase\functions\ai-brain\index.ts 4656', 'src\components\VoiceBroadcastManager.tsx 2940', 'src\components\AgentEditDialog.tsx 2561', 'src\components\CampaignManager.tsx 2052', 'src\components\AiSmsConversations.tsx 1758', 'src\components\TwilioNumbersOverview.tsx 1530', 'src\components\TelnyxAssistantEditor.tsx 1506').
- supabase/functions/ai-brain/index.ts:15 LOCATION_MAP; :49 SYSTEM_KNOWLEDGE; :293 TOOLS array; :1456 async function executeToolCall; :4475 recordFeedback; :4593 PROMPT_SNIPPETS.
- supabase/functions/ai-assistant/index.ts:670 async function executeToolCall; :2858 fetchAnalytics; :2882 serve().
- supabase/functions/ai-autonomous-engine/index.ts:100 assessGoalProgress, :166 rescoreLeads, :312 analyzePacing, :543 executeApprovedActions, :839 makeDecisions, :1031 analyzeFunnel, :1141 predictNumberHealth, :1210 extractTranscriptIntents, :1339 optimizePlaybook, :1527 manageLeadJourneys, :2248 planDay, :2627 chiSquare2x2, :2658 wilsonScore, :2681 detectStrategicPatterns, :2825/2900/2979/3025/3111/3193 detect*Patterns, :3882 planCampaignStrategy, :4444 trainConversionModel, :4711 predictLeadConversion, :4895 detectChurnRisk, :5110 runForUser, :5502 serve().
- supabase/functions/calendar-integration/index.ts:38 serve(); helpers begin at :3142 ensureFreshGoogleToken, :3293 zonedLocalToUtc, :3487 normalizePhone, :3414 handleAction.
- src/components/VoiceBroadcastManager.tsx:1-41 imports (26 UI/icon/hook/sub-component imports); :43 ELEVENLABS_VOICES; :68 DEFAULT_DTMF_ACTIONS; imports QuickTestBroadcast/BroadcastReadinessChecker/BroadcastQueueManager/LiveProgressDashboard/BroadcastStepIndicator (lines 37-41).
- src/components/AgentEditDialog.tsx:1-22 imports (incl. VoicemailDetectionSettings, AgentToolBuilder, launchSafety); :33 VOICE_SAMPLES; :46 ELEVENLABS_VOICE_ID_BY_RETELL_VOICE_ID; :106 buildAgentConfig; main component body follows.
- src/components/CampaignManager.tsx:98 component; imports ~12 sibling sub-components (CampaignDispositionDashboard, QuickLeadLoader, AiSmsAgentGenerator, CampaignLeadManager, CampaignReadinessChecker, CampaignCallActivity, CampaignWizard, WorkflowPreview, CampaignWorkflowEditor, LiveCampaignStatusMonitor, DispatcherActivityFeed, CampaignPhonePool) and 8 hooks (lines 13-46).
- src/components/TwilioNumbersOverview.tsx:92 component with ~18 async handlers (:131 loadNumbers, :203 verifyAllNumbers, :230 syncFromTwilio, :294 configureSelectedNumbers, :466 addSelectedToSipTrunk, :541 deleteSelectedNumbers, etc.); :1631 export default.
- src/components/TelnyxAssistantEditor.tsx:95 inner PhoneNumberAssignment sub-component; :308 main component; :1598 export default.
- src/components/AiSmsConversations.tsx:83 CalendarIntegrationSection sub-component; :267 SMS_TEMPLATES; :318 main component with handlers :404-:697; :1856 export default.
- src/packs/door_to_door/host.ts: is a non-React module of pure helpers (:107 ROLE_MAP, :158 D2DHostError class, :283 metricOf, :326 repStats, :384 metresBetween, :597 export function createDoorBossHost) - a logic module, not a component.

**validation**

Line counts measured mechanically via PowerShell Measure-Object -Line across the full tree (not trusted from the brief). Structure verified by reading imports/heads and grepping top-level declarations for 15 of the 22 files (>6 required), including all 9 of the largest. Confirmed each of the 22 is a distinct file class (edge function vs React component vs codegen/logic module). No files were modified (RESEARCH ONLY).

**open_questions**

- What were the specific file names the brief listed that matched vs missed? The task text did not enumerate names, so I could not cross-check the brief's roster against measured counts.
- Which split (if any) will be greenlit, and does the team prefer _shared/ modules vs per-function folders for Deno bundling?

**edge_cases_considered**

- Auto-generated types.ts excluded from refactor.
- Deno edge-function bundling constraints (use _shared/).
- True orchestration differences between components vs edge functions.

**what_i_did_not_check**

- Did not read the full body of each over-1500 file end to end; only heads/imports and declaration greps.
- Did not inspect internals of MissionBriefingWizard.tsx, CallSimulator.tsx, telnyx-ai-assistant/index.ts, twilio-sms-webhook/index.ts, workflow-executor/index.ts, or voice-broadcast-engine/index.ts beyond top-level declarations.
- Did not measure cyclomatic complexity, hooks count, or duplicate code; sizes are raw line counts only.
- Did not check whether the brief named specific files that differ from the measured set (no explicit names given in the task).
- Did not verify deno/edge-function import or bundle limits, nor run any build or deploy.
- Did not measure bundle-size or cold-start impact of these files.
- Did not examine src/packs/door_to_door/coachRules.ts (810) or _shared/control-plane files that are near but under threshold.

**confidence**: high