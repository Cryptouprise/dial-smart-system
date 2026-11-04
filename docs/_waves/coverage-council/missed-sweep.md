# What did the review miss?

lane: missed-sweep  mode: council  reconciled by: manager:deepseek/deepseek-v4.1-flash over 3 reviewers
reviewers: deepseek/deepseek-v4.1-flash, qwen/qwen3.8-flash, google/gemini-3.8-flash
cost: $0.0369 (reviewers $0.0282 + manager $0.0087)
tokens: 15063 in / 6000 out
files: docs/dial-smart-app-map.md

---

**Reconciled answer**

Evidence supports these as **COVERED**: app-map §4 named cores (campaigns/dialing, voice broadcast, agents/AI config, autonomy, live call, SMS, leads/pipeline, numbers/trunks, spam, GHL/CRM, calendar, billing, compliance, analytics, email, scraping, pack system) and pages `Index`, `Analytics`.

Evidence supports these as **UNCOVERED**:

- **Pages (13):** `AgentConnect.tsx:102`, `ApiKeys.tsx:48`, `Auth.tsx:8`, `Demo.tsx:390`, `HelpPage.tsx:14`, `InstallApp.tsx:237`, `LandingPage.tsx:629`, `LegalBeta.tsx:248`, `McpConsent.tsx:33`, `NotFound.tsx:27`, `NumberWebhooks.tsx:34`, `Settings.tsx:586`, `SystemTestingHub.tsx:319`.
- **Workflow:** `WorkflowBuilder.tsx:60`, `WorkflowTester.tsx:70`, `WorkflowPreview.tsx:29`, `WorkflowABTesting.tsx:29`, `AIWorkflowGenerator.tsx:38`, `CampaignWorkflowEditor.tsx:47`.
- **Demo/sales:** `pages/Demo.tsx:390`, `DemoLanding.tsx:31`, `DemoLegalInboundSimulation.tsx:58`, `DemoROIDashboard.tsx:35`, `DemoWebsiteScraper.tsx:14`, etc.
- **Readiness/fix:** `CampaignReadinessChecker.tsx:30`, `CampaignLaunchVerification.tsx:46`, `BroadcastReadinessChecker.tsx:20`, `ReadinessFixDialogs.tsx` seven dialogs.
- **Lead scoring/filter:** `LeadScoreIndicator.tsx:19`, `LeadScoringSettings.tsx:18`, `LowScoreAutomation.tsx:25`, `AdvancedLeadFilter.tsx:44`.
- **Billing enforcement:** `BillingPaused.tsx:21`, `RateLimitingSettings.tsx:39`.
- **Tenant pilot:** `TenantPilotPortfolio.tsx:74`.
- **Ops/health/monitors:** `ProductionHealthDashboard.tsx:45`, `SystemHealthCheck.tsx:51`, `SystemHealthIndicator.tsx:17`, `DialingSystemMonitor.tsx:48`, `LadyJarvisMonitor.tsx:71`, `ManagerNotifications.tsx:106`, `OperatorIntegrationStatus.tsx:53`, `CallbackMonitorWidget.tsx:24`, `PendingCallbacksWidget.tsx:16`.
- **Retell onboarding:** `RetellAISetupWizard.tsx:30`, `RetellBusinessVerification.tsx:13`.
- **Broadcast/campaign/ai-config subfamilies:** `BroadcastControlPanel.tsx:43`, `BroadcastQueueManager.tsx:37`, `BroadcastStepIndicator.tsx:18`; `CampaignCallActivity.tsx:27`, `CampaignLeadManager.tsx:31`, `CampaignResultsDashboard.tsx:23`, `LiveCampaignMonitor.tsx:28`, `LiveProgressDashboard.tsx:30`, `DailyReports.tsx:45`; `QuickStartWizard.tsx:64`, `AISetupAssistant.tsx:94`, `ConfigurationPreview.tsx:75`, `ConfigurationProgress.tsx:73`, `ConfigurationAreaIntegrations.tsx:72`, `QuickAIAction.tsx:13`.
- **Settings/misc:** `GHLBroadcastFieldMapping.tsx:103`, `GHLWebhookConfig.tsx:20`, `DashboardSidebar.tsx:172/210`, `ProtectedRoute.tsx:32`, `ErrorBoundary.tsx:134`.

**Edge functions:** only ~60 named; ~50 unenumerable. **Migrations:** only ~6 named; ~193 unenumerable. **Hooks:** only ~15 named; rest unenumerable. **Packs:** only `door_to_door` evidenced.

**Disagreements**

1. **Top rank:** R1 demo/sales, R3 workflow, R2 pages/auth/settings. Ranking is not evidence-backed; no file contents. Unresolved.
2. **Elite Solar:** R1 says second vertical; R2 says no additional pack evidenced; R3 says missing vertical launcher. Evidence favors R2: only `EliteSolarLaunchControl.tsx:248`; no pack-registry evidence.
3. **Page count:** R1 says 14 unnamed; R2 table shows 13. Evidence favors R2: 15 exports; `Index`, `Analytics` named.
4. **Edge/migration “uncovered”:** R2 says none; R1/R3 list tails. R2 is correct for *named* surfaces; the tail is a real but unenumerable gap.
5. **Confidence:** R3 high vs R1 medium. Presence/absence is high; ranking is low. R3 overconfident.

**Rejected claims**

- R1: “EliteSolar suggests a second vertical/pack.” Unsupported; component ≠ pack.
- R1: “14 of 15 pages unnamed.” False; 13.
- R3: “Production Telephony & Tenant Pilot Governance Hubs … necessary to operate the platform.” No file contents checked; theory.
- R3: “missing custom dedicated vertical launchers such as Elite Solar.” Only a component export; no pack evidence.

**None checked**

Contents of any uncovered file beyond export line; routing/imports/usage; live vs dead code; 193 migrations, ~50 edge functions, ~53 hooks, contexts, `lib/`, `packs.ts`; security/vendor behavior; owner’s questions; tests.

**Confidence:** medium on presence/
