# arch-e-coupling-children

- status: completed
- tldr: VBM children: QT/BQM/LPD add direct-supabase coupling; ReadinessChecker+StepIndicator pure presentational; CalendarIntegrationSection intra-file; CampaignComplianceStatus couples only via hook.

Node arch-e-coupling-children COMPLETE. Verified VBM child coupling at C:\Users\charl\dial-smart-system\src\components\.

VBM L37-41 imports confirmed exact: QuickTestBroadcast, BroadcastReadinessChecker, BroadcastQueueManager, LiveProgressDashboard, BroadcastStepIndicator.

Direct coupling per child (supabase import / .from() / functions.invoke / useContext / props):
- QuickTestBroadcast.tsx: yes / 1 (phone_numbers L62) / 1 (quick-test-call L102) / 0 / none. ADDS coupling.
- BroadcastQueueManager.tsx: yes / 2 (broadcast_queue L61,L108) / 1 (voice-broadcast-queue L82) / 0 / {broadcastId,broadcastName,isOpen,onClose,onQueueUpdated}. ADDS coupling.
- LiveProgressDashboard.tsx: yes / 2 (broadcast_queue L48, dialing_queues L74) / 0 / 0 / {broadcastId?,campaignId?,onRefresh?}. ADDS coupling.
- BroadcastReadinessChecker.tsx: none / 0 / 0 / 0 / {result,isChecking,onCheck,onStart,onFixAction?,isStarting?}. Presentational. NOTE: imported VBM:38 but never rendered (dead import).
- BroadcastStepIndicator.tsx: none / 0 / 0 / 0 / {hasAudio,hasLeads,isGeneratingAudio?}. Presentational.
- AISC CalendarIntegrationSection (AiSmsConversations.tsx L83-86): intra-file, shares parent supabase @77; >=3 .from; 0 invoke; 0 useContext; props {settings,updateSettings}. NO coupling beyond parent.
- CM CampaignComplianceStatus (CampaignManager.tsx L901): 0 direct supabase; delegates to useCampaignCompliance hook (supabase + 8 .from). Indirect only.

Answer: QT/BQM/LPD add direct-supabase coupling parents missed; two presentational children and intra-file section add none; CampaignComplianceStatus adds only indirect hook coupling.

Validation: direct file reads with line numbers + findstr counts; corrected an Array.from false positive (BQM raw 4 -> true 2).

## Artifact

**Findings**

VBM (source: C:\Users\charl\dial-smart-system\src\components\VoiceBroadcastManager.tsx) child imports L37-41 confirmed EXACT, all under @/components/: L37 QuickTestBroadcast, L38 BroadcastReadinessChecker, L39 BroadcastQueueManager, L40 LiveProgressDashboard, L41 BroadcastStepIndicator. Filenames match import names 1:1. CHILD COUPLING (per-file): (1) QuickTestBroadcast.tsx - imports supabase @11; supabase .from() = 1 (phone_numbers L62); functions.invoke = 1 ('quick-test-call' L102); useContext = 0; props = NONE (React.FC no props, fully self-contained); rendered <QuickTestBroadcast /> at VBM:690. ADDS COUPLING: yes - own direct supabase client + table read + edge-function call. (2) BroadcastQueueManager.tsx - imports supabase @10; supabase .from() = 2 (broadcast_queue L61, L108); functions.invoke = 1 ('voice-broadcast-queue' L82); useContext = 0; props = {broadcastId, broadcastName, isOpen, onClose, onQueueUpdated} (VBM:1973). ADDS COUPLING: yes. (3) LiveProgressDashboard.tsx - imports supabase @10; supabase .from() = 2 (broadcast_queue L48, dialing_queues L74); functions.invoke = 0; useContext = 0; props = {broadcastId?, campaignId?, onRefresh?} (VBM:683). ADDS COUPLING: yes. (4) BroadcastReadinessChecker.tsx - NO supabase import; .from=0; invoke=0; useContext=0; props = {result, isChecking, onCheck, onStart, onFixAction?, isStarting?}. PURELY PRESENTATIONAL. NOTE: imported at VBM:38 but NEVER rendered (only the import line matches 'BroadcastReadinessChecker' in VBM) - dead import. (5) BroadcastStepIndicator.tsx - NO supabase; .from=0; invoke=0; useContext=0; props = {hasAudio, hasLeads, isGeneratingAudio?} (VBM:1533). PURELY PRESENTATIONAL. AISC inner CalendarIntegrationSection (AiSmsConversations.tsx L83-86): defined inline in SAME file, reuses the file-level supabase import @77; within section: supabase.auth.getUser (L100, L134), .from('calendar_integrations') L103, .from('calendar_availability') L138, .from('calendar_appointments') L145 (>=3 .from); invoke=0 within section; useContext=0; props = {settings: AiSmsSettings|null, updateSettings}. DOES NOT add coupling beyond parent-file node: intra-file, same supabase import, calls already counted in the parent file. CM nested CampaignComplianceStatus (CampaignManager.tsx L901): inline component, props = {campaignId: string}; direct supabase in component = 0; delegates to hook useCampaignCompliance(campaignId). Indirect coupling lives in hooks/useCampaignCompliance.ts: imports supabase @2, .from() = 8 (campaigns L64,L214; call_logs L103,L134,L184,L281,L292), invoke=0, useContext=0. ADDS COUPLING: indirect only (via hook), not in the component body. NET ANSWER: QT/BQM/LPD each add real direct-supabase coupling their parent nodes did not capture; BroadcastReadinessChecker + BroadcastStepIndicator add none; CalendarIntegrationSection adds none beyond parent; CampaignComplianceStatus adds only indirect hook coupling.

**evidence**

- VoiceBroadcastManager.tsx:37-41 (exact imports)
- VoiceBroadcastManager.tsx:683 <LiveProgressDashboard broadcastId onRefresh/>; :690 <QuickTestBroadcast/>; :1533 <BroadcastStepIndicator hasAudio hasLeads isGeneratingAudio/>; :1973 <BroadcastQueueManager broadcastId broadcastName isOpen onClose onQueueUpdated/>
- VoiceBroadcastManager.tsx:38 BroadcastReadinessChecker imported, only match in file -> never rendered
- QuickTestBroadcast.tsx:11 supabase import; :62 .from('phone_numbers'); :102 functions.invoke('quick-test-call'); :35 React.FC no props
- BroadcastQueueManager.tsx:10 supabase; :61/:108 .from('broadcast_queue'); :82 functions.invoke('voice-broadcast-queue'); :29-35 props interface
- LiveProgressDashboard.tsx:10 supabase; :48 .from('broadcast_queue'); :74 .from('dialing_queues'); :24-27 props interface
- BroadcastReadinessChecker.tsx:11-17 props interface; no supabase import; :20 component
- BroadcastStepIndicator.tsx:12-15 props interface; no supabase import; :18 component
- AiSmsConversations.tsx:77 supabase; :83-86 CalendarIntegrationSection signature; :103/:138/:145 .from(); :100/:134 auth.getUser
- CampaignManager.tsx:901 CampaignComplianceStatus inline; :28 supabase (file-level); hooks/useCampaignCompliance.ts:2 supabase import, :64/:103/:134/:184/:214/:281/:292 .from()

**validation**

Read file:line ranges directly and cross-checked with findstr counts. Corrected a false positive: raw '.from(' count for BroadcastQueueManager was 4 but 2 were JS Array.from( (L246,L254); true supabase .from() = 2. Confirmed BroadcastReadinessChecker appears in VoiceBroadcastManager only at the import line. Confirmed child call-site prop values by reading VBM L683-689, L1533-1539, L1973-1979.

**open_questions**

- Total transitive coupling per child is higher than reported: hooks imported by these children (useAiSmsMessaging, useTwilioIntegration, useVoiceBroadcast, useBroadcastReadiness, useLiveCampaignStats) were not inspected for their own supabase/context coupling.
- Whether BroadcastReadinessChecker is used by any other file (only confirmed unused within VBM).
- Whether any imported hook calls useContext (transitive context coupling not measured).

**what_i_did_not_check**

- Hooks imported by the children (useVoiceBroadcast, useBroadcastReadiness, useLiveCampaignStats, useAiSmsMessaging, useTwilioIntegration) - their internal supabase/context coupling not counted, so each child's real transitive coupling exceeds the direct numbers above.
- useCampaignCompliance.ts beyond a supabase grep (realtime channels, polling, error paths).
- The duplicate Codex archive copies of these components (scoped to the live dial-smart-system project only).
- Whether BroadcastReadinessChecker's unused import is intentional (dead import flagged, not verified as a build warning).

**confidence**: high