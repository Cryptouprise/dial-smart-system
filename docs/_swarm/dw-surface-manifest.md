# dw-surface-manifest

- status: completed
- tldr: 6 surfaces mapped: (a,c,f) reachable, but all launch controls inert (browserCallDispatchAllowed=false); (b) QuickLaunchButton is a no-op; (d) CampaignLauncher & (e) CallCenter are dead code.

dw-surface-manifest complete. Router reality: App.tsx has NO routes for these surfaces; /dashboard (App.tsx:141) -> Index -> Dashboard.tsx, whose renderContent switch (234-519) is the real launch router, driven by activeTab (Dashboard.tsx:111) via onNavigate=handleTabChange (Dashboard.tsx:239). REACHABLE AND CLICKABLE: (a) CommandCenter->onNavigate('predictive') lands on PredictiveDialingDashboard (Dashboard.tsx:441-443); (b) Overview QuickLaunchButton (Dashboard.tsx:278) renders but is a NO-OP (no onLaunch prop; QuickLaunchButton.tsx:102-114); (c) PredictiveDialingDashboard mounts QuickTestCampaign (PdDD.tsx:162, toast-only launch-lock) and CampaignManager (PdDD.tsx:279, dispatch UI gated off). (f) MissionBriefingWizard renders by default inside AutonomousAgentDashboard tab 'overview' (line 359 default, 632 mount; reached via Dashboard.tsx:495-496). NOT REACHABLE / DEAD: (d) CampaignLauncher.tsx zero live mounts (only launchSafety.test.ts:245); (e) CallCenter.tsx zero importers. Every reachable launch control is inert because browserCallDispatchAllowed()=false (launchSafety.ts:128-133). This matches the dw-campaignwizard and dw-dispatch-reach gaps.

## Artifact

**Findings**

ROUTER REALITY: App.tsx declares NO route for any of the six surfaces (App.tsx:132-153). The only authenticated app surface is /dashboard (App.tsx:141) -> pages/Index.tsx:1-11 -> <Navigation/> + <Dashboard/>. So the real 'router manifest' is Dashboard.tsx:234-519 renderContent switch over activeTab (state declared Dashboard.tsx:111, default 'command-center'). CommandCenter's onNavigate IS Dashboard.handleTabChange (Dashboard.tsx:239; defined 131-134) which does setActiveTab + setSearchParams({tab}). Sidebar uses the same handler (Dashboard.tsx:525 -> DashboardSidebar.tsx:299-300/361-366). Pack gating (Dashboard.tsx:219-232; lib/packs.ts:103-110) touches ONLY se-workspace/wh-properties/d2d-app (lib/packs.ts:46-81; comment line 46: core dialer tabs predictive/rotation/spam/sms are NEVER pack-gated), so command-center/overview/predictive/autonomous-agent are never gated.

(a) REACHABLE. CommandCenter.tsx:521-524 CampaignWizard onComplete -> onNavigate('predictive') -> Dashboard.tsx:441-443 case 'predictive'/'dialer' renders <PredictiveDialingDashboard/>. CommandCenter is the DEFAULT tab and sidebar item '⚡ Command Center' value 'command-center' (DashboardSidebar.tsx:94).

(b) REACHABLE BUT INERT. Dashboard.tsx:278 renders <QuickLaunchButton/> in the 'overview' tab (sidebar 'Dashboard', DashboardSidebar.tsx:96) with NO onLaunch prop. Button 'Review Launch Requirements' shows only when readiness.isReady (QuickLaunchButton.tsx:129-155); handleLaunch (QuickLaunchButton.tsx:102-114) calls onLaunch only if defined -> undefined -> no-op (demo-mode branch just toasts). A real user can click it and nothing launches.

(c) REACHABLE, launch inert. PredictiveDialingDashboard (mounted Dashboard.tsx:443; sidebar 'AI Campaigns' value 'predictive' at DashboardSidebar.tsx:108) mounts QuickTestCampaign unconditionally (PredictiveDialingDashboard.tsx:162) whose activateCampaignAndDispatch is toast-only launch-locked (QuickTestCampaign.tsx:162-179), and CampaignManager in the default inner tab 'campaigns' (PredictiveDialingDashboard.tsx:226 default value, :279). CampaignManager dispatch is doubly blocked: handleDispatchNow gated by browserCallDispatchAllowed() (CampaignManager.tsx:726-731), and the Dispatch Now / Auto-Dispatch controls render only when browserCallDispatchAllowed() (CampaignManager.tsx:1710) which is hardcoded false (launchSafety.ts:128-133).

(d) NOT REACHABLE (dead). CampaignLauncher.tsx has ZERO live mounts: the only reference outside itself is the test src/lib/__tests__/launchSafety.test.ts:245 (findstr /s over src). Even if mounted, launchCampaign() only toasts launch-locked (CampaignLauncher.tsx:231-246).

(e) NOT REACHABLE (dead). CallCenter.tsx has ZERO importers: findstr /s for 'components/CallCenter' over src returns nothing; repo-wide grep matched only its own file, docs/_swarm reports, and an unrelated User-Agent string in supabase/functions/system-health-monitor.

(f) REACHABLE. MissionBriefingWizard is lazy-imported at AutonomousAgentDashboard.tsx:82 and rendered at :632 inside <TabsContent value="overview"> of the controlled Tabs (AutonomousAgentDashboard.tsx:588) whose state defaults to 'overview' (:359). AutonomousAgentDashboard mounts at Dashboard.tsx:495-496 for tab 'autonomous-agent' (sidebar 'Elite Pilot Copilot', DashboardSidebar.tsx:130, simpleMode:true), so the wizard is visible BY DEFAULT on that tab.

NET: The only launch controls a real user can reach AND click are the three inside PredictiveDialingDashboard (QuickTestCampaign, CampaignManager) plus the Overview QuickLaunchButton - and all of them are inert/launch-locked because browserCallDispatchAllowed()=false (launchSafety.ts:128-133). CampaignLauncher.tsx and CallCenter.tsx are unreachable dead code. This is consistent with the gaps from dw-campaignwizard (expected screen after onNavigate('predictive') is PredictiveDialingDashboard) and dw-dispatch-reach (CampaignLauncher unused; CallCenter unmounted).

**evidence**

- App.tsx:141 route /dashboard -> Index; App.tsx:132-153 (no routes for any dashboard surface)
- src/pages/Index.tsx:1-11 renders Navigation + Dashboard
- src/components/Dashboard.tsx:111 activeTab default 'command-center'; :131-134 handleTabChange; :239 CommandCenter onNavigate={handleTabChange}
- src/components/Dashboard.tsx:441-443 case 'predictive'/'dialer' -> PredictiveDialingDashboard (target of onNavigate('predictive'))
- src/components/Dashboard.tsx:278 <QuickLaunchButton /> in 'overview' (no props)
- src/components/Dashboard.tsx:495-496 case 'autonomous-agent' -> AutonomousAgentDashboard
- src/components/CommandCenter.tsx:521-524 onComplete -> onNavigate('predictive')
- src/components/QuickLaunchButton.tsx:102-114 handleLaunch (onLaunch undefined => no-op); :129-155 'Review Launch Requirements'
- src/components/PredictiveDialingDashboard.tsx:162 <QuickTestCampaign/>; :226 Tabs defaultValue='campaigns'; :279 <CampaignManager onRefresh/>
- src/components/QuickTestCampaign.tsx:162-179 activateCampaignAndDispatch = toast-only launch-locked
- src/components/CampaignManager.tsx:726-731 handleDispatchNow gated; :1710 dispatch UI wrapped in browserCallDispatchAllowed()
- src/lib/launchSafety.ts:128-133 browserCallDispatchAllowed() returns false
- src/components/CampaignLauncher.tsx:231-246 launchCampaign toast-only; only external ref src/lib/__tests__/launchSafety.test.ts:245
- src/components/CallCenter.tsx (zero importers; findstr /s 'components/CallCenter' src => none)
- src/components/AutonomousAgentDashboard.tsx:82 lazy MissionBriefingWizard; :359 useState('overview'); :588 controlled Tabs; :632 <MissionBriefingWizard/>
- src/components/DashboardSidebar.tsx:94 'command-center'; :96 'overview'; :108 'predictive'; :130 'autonomous-agent'
- src/lib/packs.ts:103-110 packForTab; :46-81 only se-workspace/wh-properties/d2d-app are pack-owned

**validation**

Read every cited file directly and cross-checked importers with `findstr /s /m` (which reliably resolves absolute project paths) plus repo-wide grep. Confirmed the initial state value of the AutonomousAgentDashboard tab via findstr (line 359). Confirmed browserCallDispatchAllowed body (launchSafety.ts:128-133). Confirmed pack ownership set (lib/packs.ts:46-81). Grep for the surfaces inside Navigation/MobileBottomNav/AIAssistantChat/QuickStartCards returned no matches, so no alternate launch entry points exist in the app chrome.

**open_questions**

- Does the deployed production build serve a commit where these files/line numbers match the live /dashboard (git state not inspected)?
- Is there a server-side or cron-based launch path (e.g. automation_scheduler) that is outside the browser manifest and thus out of scope here?

**edge_cases_considered**

- Pack gating could hide a reachable tab: verified command-center/overview/predictive/autonomous-agent are not pack-owned (lib/packs.ts:46-81) and packForTab returns null for them.
- Simple Mode could hide tabs: SIMPLE_MODE_TABS still includes command-center/predictive/autonomous-agent (DashboardSidebar.tsx:94,108,130 all carry simpleMode:true), so reachability holds in both modes.
- Sidebar auto-close on mobile toggles the sidebar but still calls onTabChange (DashboardSidebar.tsx:299-305) - navigation still occurs.
- browserCampaignConfigurationMutationAllowed path in CampaignManager:2066-2073 gates readiness 'onLaunch' to draft/paused and handleStatusChange toasts launch-locked (CampaignManager.tsx:513-523), so it is not a live launch.

**what_i_did_not_check**

- Did not run the app in a browser (research-only; no dev server) so all reachability is static-analysis, not a rendered/click-through confirmation.
- Did not enumerate every nested dispatch/launch button label inside CampaignReadinessChecker, CampaignWizard, or QuickStartCards beyond the gating functions observed.
- Did not inspect the top-level Navigation.tsx / MobileBottomNav.tsx contents in full, only grepped them for these six surfaces (returned no matches).
- Did not examine the docs/wholesale/phases/staging/p2 duplicate source tree; assess
reachability only for the live src tree.
- Did not verify the live deployed commit / build hash corresponds to this checkout.
- Did not audit server-side launch paths (supabase functions/crons) that bypass the browser router.

**confidence**: high