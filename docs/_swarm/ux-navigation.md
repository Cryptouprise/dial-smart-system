# ux-navigation

- status: completed
- tldr: Nav/IA slice done: real router is Dashboard.tsx tab switch (44 tabs, ?tab=); 5 parallel navs; 3 orphan tabs, broken '/?tab=' links, duplicated Analytics/Pipeline/Reports/Credits.

NAVIGATION/IA slice complete. Nav map, top-level area count, and 5 concrete IA problems delivered with file:line. Key facts: the "real router" is Dashboard.tsx's activeTab switch (44 tab cases) driven by ?tab= (Dashboard.tsx:111,131-134), not the App.tsx route table; users move via 5 parallel mechanisms (top Navigation.tsx:18-27, DashboardSidebar.tsx:89-169, MobileBottomNav.tsx:10-16, '/dashboard?tab=' deep links, CommandCenter onNavigate); login lands on /dashboard in Simple Mode (6 tabs) showing Command Center. IA problems: (1) 3 orphaned tabs ai-engine/ai-manager/agent-activity (Dashboard.tsx:452/466/470) unreachable from any nav; (2) many deep links use '/?tab=' (GuardianStatusWidget.tsx:84, RetellCalendarSetup.tsx:380, etc.) but '/' is the marketing LandingPage (App.tsx:133), so they exit the app; (3) Analytics/Pipeline/Reports/Credits duplicated across the /analytics route page (Analytics.tsx) and Dashboard tabs; (4) 3 nav bars with different item sets + 'Dashboard' label means two different things (Navigation.tsx:19 route vs DashboardSidebar.tsx:96 tab); (5) /number-webhooks (App.tsx:143) and /install (App.tsx:148, bottom-nav only) are effectively orphaned, and /sms-conversations (AiSmsConversations) has no global nav on desktop.

## Artifact

**Findings**

NAV MAP (login -> area). Public: '/' = LandingPage (App.tsx:133), '/auth' = Auth->AuthPage (pages/Auth.tsx:4-5), '/demo' = Demo (App.tsx:137). ProtectedRoute redirects unauthenticated to /auth (ProtectedRoute.tsx:42). On successful login AuthPage navigates to '/dashboard' (AuthPage.tsx:23,27,29,66). '/dashboard' = ProtectedRoute>Index (App.tsx:141); Index renders <Navigation/> + <Dashboard/> (Index.tsx:7-8). Dashboard is the REAL router: a stateful activeTab switch initialised from ?tab= (Dashboard.tsx:111, defaults 'command-center') driven by handleTabChange which writes ?tab= into the URL (Dashboard.tsx:131-134). So every in-product 'area' is a tab inside Dashboard, NOT a route. FIVE parallel navigation mechanisms exist: (1) top Navigation bar (Navigation.tsx navLinks lines 18-27, desktop splits slice(0,3):86-101 + slice(3):110-126, mobile Sheet 43-77) shown only on /dashboard (Index.tsx:7) and the standalone pages that import it (Settings.tsx:139, ApiKeys.tsx:13, Analytics.tsx:15, HelpSystem.tsx:187, SystemTestingHub.tsx:131, AgentConnect.tsx:109, InstallApp.tsx:67,92, NumberWebhooks.tsx:13); (2) DashboardSidebar (Dashboard.tsx:525) driven by navigationGroups (DashboardSidebar.tsx:89-169, 6 groups) whose items either call onTabChange (tab ids) or onNavigate (route: items: /demo 97, /system-testing 161, /settings 164), plus pack groups (getPackNavigation DashboardSidebar.tsx:210-229 from src/lib/packs.ts:40-82); (3) MobileBottomNav navItems (MobileBottomNav.tsx:10-16, 5 items, md:hidden line 21, hidden on '/demo' and '/' line 9); (4) in-component deep links '/dashboard?tab=' (AutonomousAgentDashboard.tsx:644,712; MissionBriefingWizard.tsx:839,881; OnboardingWizard.tsx:790,875; QuickStartWizard.tsx:91); (5) CommandCenter onNavigate/onOpenAIChat prop (Dashboard.tsx:239). COUNTS: 17 route entries in App.tsx (6 public 133-139, 11 protected 141-150, + catch-all 152) BUT only ~9 protected routes are real product pages; 44 distinct Dashboard tab destinations exist in the switch (Dashboard.tsx:234-519). Sidebar exposes 41 leaf items across 6 top-level groups -> 38 tab destinations (3 items are route links). FIRST-TIME USER: lands on marketing '/', must click Log In (/auth, LandingPage.tsx:183) or Sign Up (546); after auth goes to /dashboard in Simple Mode (SimpleModeContext.tsx:26-33 defaults true) so only 6 tabs show (SIMPLE_MODE_TABS, SimpleModeContext.tsx:16-23: command-center, launch-readiness, leads, autonomous-agent, campaign-results, settings). First authenticated view = Command Center (Dashboard.tsx:111, 235-242). ORPHANS/DEAD ENDS: (a) 3 Dashboard tabs have a switch case but NO sidebar/top/bottom entry anywhere: ai-engine (Dashboard.tsx:452), ai-manager (466), agent-activity (470) - greps return the definition only. (b) /number-webhooks route (App.tsx:143) has no nav entry; only reachable via AiSmsConversations.tsx:1143 navigate('/number-webhooks'). (c) /install (App.tsx:148) is reachable ONLY from MobileBottomNav.tsx:15, so desktop users cannot reach it from nav. (d) PipelineKanban is lazy-imported (Dashboard.tsx:43) but never rendered by any switch case - dead import; it is only used by pages/Analytics.tsx:51. (e) AiSmsConversations (/sms-conversations, App.tsx:142) does not import Navigation and renders its own full-screen shell, so on desktop (MobileBottomNav md:hidden) the AI SMS page has no global nav. DUPLICATES: Analytics/Pipeline/Reports/Credits each exist twice - as top-nav route /analytics -> pages/Analytics.tsx tabs (AI Analysis, Pipeline=52, Reports=55, Credits=59) AND as Dashboard sidebar tabs analytics->CallAnalytics (450), pipeline->EnhancedPipelineKanban (440), reports->DailyReports (460), credits->CreditDashboard (499). Two SMS surfaces: tab 'sms'->SmsMessaging (458) vs route /sms-conversations->AiSmsConversations (142). Two 'Dashboard' labels with different destinations: sidebar 'Dashboard'=tab overview (DashboardSidebar.tsx:96) vs top-nav 'Dashboard'=route /dashboard (Navigation.tsx:19). Multiple onboarding surfaces: Setup Wizard tab 'onboarding' (489) + AI Setup 'ai-setup' (491) + QuickStartCards on Overview (281) + QuickStartWizard/MissionBriefingWizard/OnboardingWizard components.

**evidence**

- src/App.tsx:133 LandingPage at '/' (no auth redirect)
- src/App.tsx:141-150 protected routes
- src/App.tsx:143 /number-webhooks route
- src/App.tsx:148 /install route
- src/components/ProtectedRoute.tsx:42 redirect to /auth
- src/components/AuthPage.tsx:23 post-login -> /dashboard
- src/pages/Index.tsx:7-8 Navigation + Dashboard
- src/components/Dashboard.tsx:111 default activeTab 'command-center' from ?tab=
- src/components/Dashboard.tsx:131-134 handleTabChange writes ?tab=
- src/components/Dashboard.tsx:234-519 tab switch (44 cases)
- src/components/Dashboard.tsx:452 ai-engine case
- src/components/Dashboard.tsx:466 ai-manager case
- src/components/Dashboard.tsx:470 agent-activity case
- src/components/Dashboard.tsx:43 PipelineKanban lazy import unused by switch
- src/components/SmsMessaging.tsx tab vs AiSmsConversations route
- src/components/Navigation.tsx:18-27 navLinks (8)
- src/components/Navigation.tsx:86,110 desktop split
- src/components/DashboardSidebar.tsx:89-169 navigationGroups (6 groups, 41 items)
- src/components/DashboardSidebar.tsx:97,161,164 route items
- src/components/DashboardSidebar.tsx:210-229 getPackNavigation
- src/components/MobileBottomNav.tsx:10-16 navItems (5)
- src/components/MobileBottomNav.tsx:9,21 hide rules
- src/lib/packs.ts:40-82 pack sidebarGroups ids (se-workspace/wh-properties/d2d-app)
- src/contexts/SimpleModeContext.tsx:16-23 SIMPLE_MODE_TABS
- src/contexts/SimpleModeContext.tsx:26-33 default Simple Mode true
- src/components/GuardianStatusWidget.tsx:84 href '/?tab=ai-errors'
- src/components/RetellCalendarSetup.tsx:380 href '/?tab=calendar'
- src/components/TelnyxAIManager.tsx:633 href '/?tab=calendar'
- src/components/VoiceBroadcastManager.tsx:2009 href '/?tab=leads'
- src/components/QuickTestBroadcast.tsx:206 href '/?tab=overview#phone-numbers'
- src/components/ReadinessFixDialogs.tsx:432,590,919,1002 '/?tab='
- src/components/CampaignSetupWizard.tsx:511-516 '/?tab=onboarding'
- src/components/ai-configuration/OnboardingWizard.tsx:675 '/?tab=overview'
- src/components/AutonomousAgentDashboard.tsx:644,712 '/dashboard?tab='
- src/components/AiSmsConversations.tsx:1143 navigate('/number-webhooks')
- src/pages/Analytics.tsx:5,15 Navigation import+render; :51 PipelineKanban; :55,59 reports/credits
- src/pages/HelpPage.tsx:8 HelpSystem; src/components/HelpSystem.tsx:187 <Navigation/>

**validation**

Read in full: src/pages/Index.tsx (13L), src/components/Dashboard.tsx (544L), src/components/DashboardSidebar.tsx (409L), src/components/Navigation.tsx (166L), src/components/MobileBottomNav.tsx (53L). Cross-checked the full route table src/App.tsx (170L), packs registry src/lib/packs.ts (121L), SimpleMode tabs src/contexts/SimpleModeContext.tsx, ProtectedRoute, AuthPage redirect, LandingPage (629L). Reachability of ai-engine/agent-activity/ai-manager/number-webhooks confirmed by targeted greps returning only their definitions (or the single in-page link). Counts (44 tab cases, 41 sidebar items, 8/5 nav items, 6 Simple-Mode tabs) tallied directly from source. No files were written.

**open_questions**

- Whether CommandCenter's onNavigate actually exposes the 3 orphan tabs (ai-engine/ai-manager/agent-activity) via in-app buttons - CommandCenter.tsx grep for 'onNavigate'/'navigate(' returned 0, so it may accept the prop but never call it; needs a read of CommandCenter.tsx to be certain.
- Whether '/?tab=' links break on the live deployment or whether a host-level redirect maps '/'->'/dashboard' for logged-in users (not present in code; App.tsx:133 is authoritative in source).
- Whether docs/dial-smart-app-map.md section 7/8 lists a canonical IA the code is expected to match (only section 8 review contract was read).

**what_i_did_not_check**

- CommandCenter.tsx internals (does it consume onNavigate to reach orphan tabs?)
- McpConsent.tsx, LegalBeta.tsx, NotFound.tsx, Demo.tsx nav behaviour
- The remaining ~120 non-nav components for additional orphaned-but-imported surfaces
- Runtime behavior of window.history.pushState('/?tab=...') vs href in ReadinessFixDialogs (pushState bypasses the router, so its URL change may not re-render Dashboard)
- Sidebar GroupLabel collapse state persistence and mobile Sheet vs Sidebar interaction
- Whether SIMPLE_MODE_TABS excluding 'ai-engine' etc. is the intended reason those tabs are hidden

**confidence**: medium