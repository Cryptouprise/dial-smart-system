# risks-b1e-acceptance-gate-ui

- status: completed
- tldr: Guards are hardcoded-false real UI blocks, not server enforcement; useSmsMessaging.sendSms is unguarded; autoPauseCampaign is dead code.

Audited the UI launch-lock/acceptance gate (src/lib/launchSafety.ts, src/lib/smsAcceptance.ts, src/hooks/useCampaignCompliance.ts) and every caller of the 7 guard functions. Conclusion: all browser*Allowed guards are hardcoded false (except two status predicates), and every guard call site that precedes an egress invoke early-returns/throwing = real UI blocks, none message-only. But they are client-side UX guards, not a security boundary (egress is supabase.functions.invoke with the user JWT). Gap found: useSmsMessaging.sendSms (:64-98) invokes sms-messaging without any launch guard (only assertAcceptedSmsEnvelope after). autoPauseCampaign is NOT a real control: it is only called by startMonitoring, which is never invoked anywhere; the sole app consumer uses only metrics. Full evidence in the node artifact.

## Artifact

**Findings**

UI launch-lock audit of the 7 guard functions. FACT: launchSafety.ts guard bodies are constants except two status predicates: browserCallDispatchAllowed=false (128-133), browserAutonomousActionAllowed=false (140-148), browserContactEgressAllowed=false (149-156), browserProviderAdministrationAllowed=false (157-159); browserCampaignStatusMutationAllowed(status) returns status==='paused' (115-119); browserCampaignConfigurationMutationAllowed(status) returns draft||paused (121-126). Every guard call site that precedes an egress invoke does an early return/throw, i.e. all of them are REAL UI blocks, not message-only: browserContactEgressAllowed -> AgentEditDialog.tsx:822-825 (outbound-calling :850), useAiSmsMessaging.ts:160-167 (sms-messaging :172), useBroadcastReadiness.ts:387-389 (voice-broadcast-engine :407); browserCallDispatchAllowed -> useCallDispatcher.ts:109-118 and :199-206 (call-dispatcher :139/:304), CampaignManager.tsx:727-730, :780-783, :878 (handlers) with :1710 as a supplementary display-only render gate; browserAutonomousActionAllowed -> useAutonomousAgent.ts:278-285, placed BEFORE the switch over call/sms/email/wait (:290-311) so it blocks all four action types; browserProviderAdministrationAllowed -> usePhoneNumberPurchasing.ts:21-25 (throw), useNumberSync.ts:47-50 & :159-162, useAIConfiguration.ts:102-104 (throw), useRetellAI.ts:48-56 helper used by import/update/delete/purchase/agent-create/update/delete/configureWebhooks (:88,125,163,196,226,258,291,321,365,401,440,478), useRetellLLM.ts:27-33 helper used by create/list/get/update/delete (:40,81,113,153,193), PhoneNumberPurchasing.tsx:99-102,134-137,171-174. No caller was found that only shows a toast and then continues to egress. CAVEAT (THEORY, localized): these are client-side React guards; egress is supabase.functions.invoke to edge functions authenticated by the same user JWT, so the gate is a fail-closed UX boundary (launchSafety.ts:2-4 itself says the control 'must cross a trusted server boundary'), and it is bypassable by calling the edge function directly from the console. Server-side certification gates exist for some AI tools (ai-assistant/index.ts:2997-3008 uncertifiedEgressTools incl. send_sms; ai-autonomous-engine/index.ts:5498 isAutonomousEngineTenantCertified; ai-brain isAiBrainTenantCertified; disposition-router isDispositionAutomationTenantCertified) but enforcement inside outbound-calling/call-dispatcher/sms-messaging was NOT verified here. GAP (FACT): useSmsMessaging.ts sendSms (:64-98) invokes sms-messaging/send_sms (:68) with NO launch guard; only assertAcceptedSmsEnvelope runs AFTER acceptance (:80). The 7 guards are not referenced in that file (only assertAcceptedSmsEnvelope imported, :16). assertAcceptedSmsEnvelope (src/lib/smsAcceptance.ts:14-35) is a post-hoc response validator, not a pre-egress gate. autoPauseCampaign REAL? FACT: NO. autoPauseCampaign (useCampaignCompliance.ts:211-237) is only called by startMonitoring's interval (:260). startMonitoring (:240) is never invoked anywhere (grep over src: appears only in its own file at 240, 329 comment, 375 export). The sole app consumer of the hook is CampaignManager.tsx:901-918 CampaignComplianceStatus, which destructures only {metrics}. So autoPauseCampaign is dead code / a stub, not a live safety control. Even if wired it is browser-side (user-session RLS) update of campaigns.status='paused' (:213-219), fires at most every 60s, does not stop a server-side dispatcher, and performComplianceCheck fails OPEN on transient/network failure (returns {passed:true} at :157-159 and :196-201; checkCallingHours returns true on error :69,:88-94). The static test src/lib/__tests__/launchSafety.test.ts enforces guard-before-invoke ordering only for a fixed list (AgentEditDialog.startTestCall, useBroadcastReadiness.runTestBatch, useAiSmsMessaging.sendMessage :52-68; PhoneNumberPurchasing handlers :140-156; useRetellAI/LLM/AIConfiguration/NumberSync/PhoneNumberPurchasing :158-221) and does NOT cover useSmsMessaging.sendSms, useCallDispatcher, usePredictiveDialing, or useAutonomousAgent.sendSMS/sendEmail. usePredictiveDialing.updateCampaign is the one status/config path with a real DB-level guard: the write uses .in('status',['draft','paused']) (:552-554) so a stale dialog cannot mutate a live campaign.

**evidence**

- src/lib/launchSafety.ts:115-159 (guard bodies)
- src/lib/launchSafety.ts:2-4 (comment: must cross trusted server boundary)
- src/lib/smsAcceptance.ts:14-35 (assertAcceptedSmsEnvelope = post-hoc validator)
- src/components/AgentEditDialog.tsx:822-825 block; :850 invoke; :2592 disabled prop
- src/hooks/useAiSmsMessaging.ts:160-167 block; :172 invoke; :184 assert
- src/hooks/useBroadcastReadiness.ts:387-389 block; :407 invoke
- src/hooks/useCallDispatcher.ts:109-118 block; :139 invoke; :199-206 block
- src/components/CampaignManager.tsx:727-730,:780-783,:878 blocks; :1710,:2040,:2066,:2096,:2134,:2157,:2167 render gates; :520-527 status block; :499-517 activation block
- src/hooks/useAutonomousAgent.ts:278-285 block before switch :290-311; sendSMS :370-425 (no internal gate)
- src/hooks/usePhoneNumberPurchasing.ts:21-25 throw; src/hooks/useNumberSync.ts:47-50,:159-162; src/hooks/useAIConfiguration.ts:102-104
- src/hooks/useRetellAI.ts:48-56 helper (+12 call sites); src/hooks/useRetellLLM.ts:27-33 helper (+5 call sites)
- src/components/PhoneNumberPurchasing.tsx:99-102,:134-137,:171-174
- src/hooks/usePredictiveDialing.ts:522-529 status block; :552-554 DB .in('status',['draft','paused']) guard
- src/hooks/useSmsMessaging.ts:16 import; :64-98 sendSms with NO launch guard; :68 invoke; :80 assert
- src/hooks/useCampaignCompliance.ts:211-237 autoPauseCampaign; :240-245,:318-322 startMonitoring; :260 call site; :157-159,:196-201 fail-open
- src/components/CampaignManager.tsx:18 import; :901-918 CampaignComplianceStatus destructures only metrics
- src/lib/__tests__/launchSafety.test.ts:52-68,:140-156,:158-221 static ordering assertions
- supabase/functions/ai-assistant/index.ts:2997-3008 uncertifiedEgressTools(send_sms); supabase/functions/ai-autonomous-engine/index.ts:5498 isAutonomousEngineTenantCertified

**validation**

Static source audit only (read + grep of C:/Users/charl/dial-smart-system). Grepped all 7 guard identifiers across the repo (paths: src and supabase/functions), read every src/ caller's surrounding handler body, and exhaustively grepped startMonitoring across src (3 hits, all in useCampaignCompliance.ts). No code executed, no tests run, no live calls.

**open_questions**

- Do outbound-calling, call-dispatcher, sms-messaging and voice-broadcast-engine edge functions enforce their own server-side consent/DNC/certification gate, or do they trust the caller JWT?
- Is useSmsMessaging.sendSms reachable from any navigable live UI surface, making the unguarded SMS path exploitable?
- Are the other unguarded egress callers (CallSimulator.tsx:309/832, QuickTestBroadcast.tsx:102, ReadinessFixDialogs.tsx:772, MissionBriefingWizard.tsx:1091, dashboard quick-test-call) reachable in the shipped UI?

**edge_cases_considered**

- silent=true inspection paths in providerAdministrationLocked (useRetellAI.ts:58,196,226,291,365; useRetellLLM.ts:81,113) block reads without a toast - over-broad but not a safety gap
- activation path in CampaignManager.handleStatusChange (:499-517) is blocked explicitly even before the status guard, with a readiness pre-check
- render-only guard usages (CampaignManager :1710 etc.) hide panels but are backed by handler-level blocks, so they are not the sole defense
- browserCampaignStatusMutationAllowed allows 'paused' by design (pause = safety action), so that path does reach a real DB write
- assertAcceptedSmsEnvelope throws on success!==true/sent!==true/skipped===true/error/missing provider_message_id but runs only AFTER the request resolved

**what_i_did_not_check**

- Server-side enforcement inside outbound-calling / call-dispatcher / sms-messaging / voice-broadcast-engine (only noted that cert gates exist for some AI tools)
- RLS policies on campaigns / phone_numbers / call_logs / sms_messages that might independently block the browser writes
- Reachability of the unguarded egress callers from live routes (CallSimulator, QuickTestBroadcast, ReadinessFixDialogs, MissionBriefingWizard, dashboard widgets)
- Whether useSmsMessaging is wired to any live component
- Runtime behavior - no execution, tests, or live calls were performed
- The ~88 files repo-wide that invoke egress/provider edge functions were not individually classified

**confidence**: high