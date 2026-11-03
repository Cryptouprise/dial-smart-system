# scale-a-grep-realtime

- status: completed
- tldr: 11 files / 15 Supabase Realtime channels in src/; 8 mounted per-user, 3 (WorkflowHealthWidget, CoachPanel, BrowserPhone) have zero importers

Done: inventoried every Supabase Realtime subscription in dial-smart-system/src/. 11 files, 15 channels, all on the shared client (project emonjusymdripmkvtttc). Per file: channel name, watched table(s), filter, mount point, cleanup. Mounted per-user session via ProtectedRoute/dashboard tabs = AiSmsConversations, CampaignCallActivity, DispatcherActivityFeed, LiveCampaignMonitor, LiveCampaignStatusMonitor, PredictiveDialingDashboard, useConcurrencyManager, useRealtimeCallStatus. NOT mounted anywhere (0 importers) = WorkflowHealthWidget, CoachPanel, BrowserPhone (CallWorkspace.tsx has no importer). Cleanup present on all effects; exception: useConcurrencyManager.ts:435,437 uses .unsubscribe() instead of removeChannel (THEORY: partial leak). Several channels use global topic names with no user/org namespacing and some have no row filter (sms_messages, call_logs). Full detail in the completed node artifact.

## Artifact

**Findings**

11 files in src/ open Supabase Realtime channels on the shared client (src/integrations/supabase/client.ts, project emonjusymdripmkvtttc, default realtime params). Inventory: (1) components/AiSmsConversations.tsx:481 channel 'sms-messages-realtime' -> sms_messages INSERT(:483) + UPDATE(:511), no filter, per-user (App.tsx:142 /sms-conversations behind ProtectedRoute), cleanup removeChannel @536, deps [selectedConversation,loadConversations,loadMessages]. (2) components/CampaignCallActivity.tsx:66 'campaign-activity-${campaignId}' -> call_logs * filter campaign_id=eq.(:68), dialing_queues * filter campaign_id=eq.(:78), sms_messages * NO filter(:88); mounted via CampaignManager.tsx:2051 <- PredictiveDialingDashboard tab <- Dashboard (protected); cleanup removeChannel+15s interval @102-103, deps [campaignId]. (3) components/DispatcherActivityFeed.tsx:62 'dispatcher-call-logs' -> call_logs * optional filter campaign_id(:64); :121 'dispatcher-queue' -> dialing_queues UPDATE optional filter campaign_id(:123); mounted CampaignManager.tsx:1821,2058; early-return when !isActive (no channel); cleanup removeChannel x2 @146-147, deps [isActive,campaignId]. (4) components/LiveCampaignMonitor.tsx:49 'live-broadcast-queue' -> broadcast_queue * filter broadcast_id=eq.${selectedBroadcastId}(:50); mounted Dashboard.tsx:480 tab, gated on selectedBroadcastId; cleanup removeChannel+5s @75-76, deps [selectedBroadcastId]. (5) components/LiveCampaignStatusMonitor.tsx:182 'campaign-status' -> lead_workflow_progress(:183)+call_logs(:186)+sms_messages(:189) all * no filter; mounted CampaignManager.tsx:2062; cleanup removeChannel+10s @198-199, deps [campaignId,organizationId]. (6) components/PredictiveDialingDashboard.tsx:83 'call-logs-realtime' -> call_logs *(:85) throttled; :96 'dialing-queues-realtime' -> dialing_queues *(:99) log-only; mounted Dashboard.tsx:443 tab, demo-mode early return; cleanup removeChannel x2 @107-108, deps [isDemoMode,throttledRefresh]. (7) components/WorkflowHealthWidget.tsx:113 'workflow-health' -> lead_workflow_progress *(:115); NOT MOUNTED (0 importers repo-wide); cleanup removeChannel @129, deps []. (8) components/call/CoachPanel.tsx:161 'coach-transcripts-${callLogId}' -> call_live_transcripts INSERT filter call_log_id=eq.(:164); mounted only by CallWorkspace.tsx:768 which itself has 0 importers -> NOT mounted in app; cleanup clearTimeout+removeChannel @179-181, deps [callLogId,requestSuggest]. (9) hooks/useConcurrencyManager.ts:399 'call_logs_changes' -> call_logs *(:401); :414 'active_ai_transfers_changes' -> active_ai_transfers *(:416); mounted via ConcurrencyMonitor.tsx:33 and DialingPerformanceDashboard.tsx:23 (PredictiveDialingDashboard tab); guarded if(!userId); cleanup callsChannel.unsubscribe()+transfersChannel.unsubscribe() @435,437 (NOT removeChannel), deps [userId]. (10) hooks/useRealtimeCallStatus.ts:211 'call-status-updates' -> call_logs * filter organization_id=eq.${organizationId}(:213); mounted LiveCallMonitor.tsx:21 (PredictiveDialingDashboard tab); guarded by user+organizationId; cleanup removeChannel @268 + 2 intervals @270-271, deps [loadActiveCalls,handleRealtimeUpdate,calculateStats,organizationId]. (11) lib/voice/BrowserPhone.ts:381 'call_live_transcripts:${callLogId}' -> call_live_transcripts INSERT filter call_log_id=eq.(:383); instance built in CallWorkspace.tsx:308 (startCall) -> not mounted in app; cleanup unsubscribeTranscripts()->removeChannel @410-415 (method, not effect). Non-realtime .subscribe( matches (not Supabase channels): PhoneNumberPurchasing.tsx:84 (RxJS), AuthContext.tsx:56/OrganizationContext.tsx:75 (supabase auth onAuthStateChange), useEnabledPacks.ts:45 (custom listener), packs/door_to_door/app/scripts.js:1919 (web push).

**evidence**

- src/components/AiSmsConversations.tsx:481,483,511,533,536
- src/App.tsx:142 (ProtectedRoute)
- src/components/CampaignCallActivity.tsx:66,68,78,88,96,102
- src/components/CampaignManager.tsx:1821,2051,2058,2062
- src/components/DispatcherActivityFeed.tsx:62,121,146,147
- src/components/LiveCampaignMonitor.tsx:49,50,72,76
- src/components/Dashboard.tsx:443,480 (tab switch renderContent/activeTab)
- src/components/LiveCampaignStatusMonitor.tsx:182,183,186,189,198
- src/components/PredictiveDialingDashboard.tsx:83,92,96,104,107,108
- src/components/WorkflowHealthWidget.tsx:113,115,129
- src/components/call/CoachPanel.tsx:161,164,177,181
- src/components/call/CallWorkspace.tsx:308,768
- src/hooks/useConcurrencyManager.ts:399,411,414,426,435,437
- src/hooks/useRealtimeCallStatus.ts:211,213,222,268
- src/lib/voice/BrowserPhone.ts:381,383,403,410-415
- src/integrations/supabase/client.ts:5-11
- cross-check: findstr over src/**/*.ts/tsx for .channel(/.subscribe(/removeChannel/postgres_changes

**validation**

Two independent passes agree: (a) agentgrep for 'postgres_changes', '.channel(', '.subscribe(', 'removeChannel' over C:/Users/charl/dial-smart-system/src, and (b) a raw findstr /s over src/**/*.{ts,tsx,js,jsx}. Every channel matched a table+filter+subscribe; every file's cleanup read directly. Mount chains verified by grepping each component/hook name and reading Dashboard.tsx lazy list (lines 36-69) and renderContent switch.

**open_questions**

- Are loadConversations/loadMessages in AiSmsConversations.tsx memoized? If not, the channel tears down and re-subscribes every render (churn).
- Do the unnamespaced global topics ('campaign-status','call-logs-realtime','call-status-updates','workflow-health','dispatcher-call-logs') collide across users/tabs on the same client instance?
- Is WorkflowHealthWidget intended to be dead, or was it dropped from a tab?
- Is CallWorkspace (and its BrowserPhone/CoachPanel channels) intended to ship behind a 'Call' tab that is not yet wired in Dashboard.tsx?

**what_i_did_not_check**

- Server-side realtime publication setup (whether tables are added to supabase_realtime publication) and RLS policies on the watched tables — not inspected.
- Non-.ts/.tsx realtime usage (e.g. any inline HTML/JS in public/ or packs) beyond packs/door_to_door/app/scripts.js:1919 (web push, not realtime).
- Supabase edge functions under supabase/functions/ (server side) — task scoped to src/.
- Runtime behavior (actual reconnect/leak behavior of .unsubscribe() vs removeChannel) — static read only.
- Whether multiple components mounting the SAME global channel name simultaneously (e.g. two tabs both rendering 'call-logs-realtime') actually conflict at runtime.

**confidence**: high