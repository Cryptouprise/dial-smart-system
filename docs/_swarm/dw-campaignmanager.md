# dw-campaignmanager

- status: completed
- tldr: CampaignManager 'Launch/Activate' 495-518 only toasts; no draft->active path exists in browser. Only ->paused allowed (launchSafety 115-119).

Traced CampaignManager.tsx launch/activate/start controls + guard helpers. Headline: 'Launch/Activate' is a silent no-op, and there is NO browser path draft->active, so a first draft campaign cannot be started from the UI.

(1) Draft-campaign controls: card row 1537-1629 (Quick Test Call popover 1539-1566; Disposition 1568-1576; Edit 1578-1585; Play/'Activate' 1587-1604 -> handleStatusChange('active'); Load Leads 1606-1613; Caller-ID pool 1615-1622; Clone 1624-1629; Delete AlertDialog 1648) + lower grid 1965-2038 (Manage Leads/View Activity/Live Status/Check Readiness/Edit Workflow/Prioritize/AI SMS).
(2) Launch does NOT mutate status: handleStatusChange(campaign,'active') 495-518 only toasts (not-ready 503-509, or lock 512-517) and returns; usePredictiveDialing.ts:456-463/521-529 confirm no non-draft/non-paused write.
(3) No real validation of agent_id (||null 486), script (||null 485), from_number, calling hours (default 09:00-17:00 494-495) or lead count; only org+name required (471-473).
(4) Only browser transition allowed is -> 'paused' (launchSafety.ts:115-119; 520-527; hook 522). updateCampaign also blocks paused+other edits (531-539).

Ranked day-one failures: CRITICAL no draft->active path; HIGH handleQuickTestCall 621-655 calls executeTestCall with no egress guard while popover says 'Bypasses queues and DNC' 1549; MEDIUM readiness view dead-ends; MEDIUM create accepts missing agent/script/phone and zero leads.

Validation: static read only (RESEARCH ONLY). Confidence: high. Not checked: executeTestCall edge function; CampaignWizard:827; alternate launch surfaces; RLS; any server promote path.

## Artifact

**Findings**

(2) Launch/Activate is a SILENT NO-OP: handleStatusChange(campaign,'active') CampaignManager.tsx:495-518 never writes status; not-ready toasts 'Campaign Not Ready' and returns (503-509), ready toasts lock + CAMPAIGN_ACTIVATION_LAUNCH_LOCK_MESSAGE and returns (512-517). Confirmed by usePredictiveDialing.ts:456-463 and :521-529. (4) Only browser-allowed transition is to 'paused' (launchSafety.ts:115-119; CampaignManager.tsx:520-527; usePredictiveDialing.ts:522). No draft->active or paused->active path. (1) Draft campaign controls: card row 1537-1629 = Quick Test Call popover (1539-1566), Disposition (1568-1576), Edit (1578-1585), Play/Activate (1587-1604 -> handleStatusChange active), Load Leads (1606-1613), Caller-ID pool (1615-1622), Clone (1624-1629), Delete AlertDialog (1648); lower grid 1965-2038 = Manage Leads, View Activity, Live Status, Check Readiness, Edit Workflow, Prioritize, AI SMS. Activate->lock toast only; Quick Test Call->handleQuickTestCall (621-655) places a real test call via executeTestCall; Edit/Load/Phone pool/Manage allowed on draft; Clone inserts new draft (536-581); Delete->lock toast (583-589). (3) handleStatusChange('active') validates nothing itself, only surfaces checkCampaignReadiness reasons (500-517); create/edit (handleSubmit 347-396 -> createCampaign usePredictiveDialing.ts:455-519) requires only organizationId+name (471-473); agent_id||null (486), script||null (485), hours default 09:00-17:00 (494-495), zero leads accepted. requireCampaignConfigurationMutable 161-170 gates submit (352), edit (468), test call (622), lead loading (658), phone pool (663), workflow (668), SMS (673), lead queue (682), readiness (693), retry-delay (698), prioritize (735), allowing only draft/paused.

**evidence**

- CampaignManager.tsx:495-518 handleStatusChange active branch
- CampaignManager.tsx:520-531 non-paused lock + only mutation path
- CampaignManager.tsx:1587-1604 status ternary Play/Activate
- CampaignManager.tsx:161-178 guard + rejectBrowserDispatch
- CampaignManager.tsx:621-655 handleQuickTestCall no egress guard
- CampaignManager.tsx:2066-2078 readiness onLaunch still locks
- CampaignManager.tsx:583-589 delete lock; 858-864 clear history lock
- launchSafety.ts:115-126 status/config mutability
- launchSafety.ts:15-16 CAMPAIGN_ACTIVATION_LAUNCH_LOCK_MESSAGE
- usePredictiveDialing.ts:455-463 create not-draft lock
- usePredictiveDialing.ts:521-539 update guards

**validation**

Static trace only; RESEARCH ONLY no live calls. Read launchSafety.ts fully, CampaignManager.tsx 1-220/340-760/1440-2110, usePredictiveDialing.ts 420-549; grep of launchSafety usage across src; matches launchSafety.test.ts:17-20.

**open_questions**

- Does executeTestCall (testCallUtils.ts edge function) actually dial, or reject server-side?
- Is there ANY server-side promotion path draft->active anywhere?

**edge_cases_considered**

- active->paused pause path (1587-1595) allowed
- paused+dirty config blocked (usePredictiveDialing.ts:531-539)
- browserCallDispatchAllowed false makes inline call center unreachable (1691-1963)

**what_i_did_not_check**

- executeTestCall/testCallUtils.ts + edge function behavior
- CampaignWizard.tsx:827 and CampaignReadinessChecker.tsx wiring
- CampaignLauncher/QuickLaunchButton/QuickTestCampaign/AgentDashboard alternate surfaces
- useCallDispatcher server side + campaigns RLS policies
- Any non-UI server path that promotes draft->active

**confidence**: high