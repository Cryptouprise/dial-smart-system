# What did the review miss? - reviewer deepseek/deepseek-v4.1-flash

cost: $0.0069

---

## Method / assumption

The only review-like artifact supplied is the capability inventory in `docs/dial-smart-app-map.md` §4 (lines 53–125). I treat that as "the review" and mark each surface named there COVERED, each surface visible in the two greps but absent from §4 UNCOVERED. Ranking is THEORY; presence/absence is FACT.

## COVERED (named in §4)

Campaigns/dialing, voice broadcast (manager only), agents/AI config (partial), AI autonomy, live call workspace, SMS, leads/pipeline (partial), numbers/trunks, spam, GHL/CRM, calendar, billing, compliance, analytics, email, scraping, pack system. Also `pages/Analytics.tsx` and `pages/Index.tsx` (§3 line 41).

## UNCOVERED — ranked by commercial importance

1. **Demo / sales-funnel family — ~20 components + `pages/Demo.tsx`.** `src/components/demo/DemoLanding.tsx:31`, `DemoCampaignSetup.tsx:32`, `DemoCallInProgress.tsx:13`, `DemoROIDashboard.tsx:35`, `DemoLegalInboundSimulation.tsx:58`, `DemoLegalVisionWithVSL.tsx:26`, `DemoWebsiteScraper.tsx:14`, `DemoEmailMockup.tsx:15`, `DemoSmsRepliesPanel.tsx:18`, `DemoPhoneMockup.tsx:61`, plus `DemoBadge.tsx:6`, `DemoModeToggle.tsx:9`, `pages/Demo.tsx:390`. §4 names none of these. This is the top-of-funnel sales asset and the owner's own "run ads / cold email / scrape" pitch (doc §7 item 4) is demoed here.

2. **Workflow / campaign-automation family.** `WorkflowBuilder.tsx:60`, `WorkflowTester.tsx:70`, `WorkflowPreview.tsx:29`, `WorkflowABTesting.tsx:29`, `CampaignWorkflowEditor.tsx:47`, `AIWorkflowGenerator.tsx:38`. §4 names no workflow component at all.

3. **Launch-readiness / fix-dialog family.** `CampaignReadinessChecker.tsx:30`, `CampaignLaunchVerification.tsx:46`, `BroadcastReadinessChecker.tsx:20`, and `ReadinessFixDialogs.tsx` exporting seven dialogs (`A2PFixDialog:28`, `PhoneNumbersFixDialog:349`, `LeadsFixDialog:447`, `AIAgentFixDialog:613`, `RetellPhoneFixDialog:734`, `WaitStepsFixDialog:879`, `AISmsFixDialog:939`). This is the compliance gate that §6 (lines 136–144) says is partly broken; the UI carrying it is unreviewed.

4. **Lead scoring / filtering.** `LeadScoreIndicator.tsx:19`, `LeadScoringSettings.tsx:18`, `LowScoreAutomation.tsx:25`, `AdvancedLeadFilter.tsx:44`. §4 covers lead CRUD but not scoring.

5. **Billing enforcement.** `BillingPaused.tsx:21`, `RateLimitingSettings.tsx:39`. §4 names `CreditDashboard` and `stripe-webhook` but not the enforcement UI.

6. **Multi-tenant pilot management.** `TenantPilotPortfolio.tsx:74`. §5 (lines 127–132) describes the tenant model but no component is named.

7. **Vertical launch control.** `EliteSolarLaunchControl.tsx:248`. A second vertical beyond `door_to_door`; §4/§5 name only the d2d pack.

8. **AI-manager / ops surfaces.** `LadyJarvisMonitor.tsx:71`, `ManagerNotifications.tsx:106`, `OperatorIntegrationStatus.tsx:53`, `OptimizationInsightsDashboard.tsx:38`, `AILearningInsights.tsx:36`, `AgentImprovementHistory.tsx:66`.

9. **Callback widgets (tied to the known-open bug).** `CallbackMonitorWidget.tsx:24`, `PendingCallbacksWidget.tsx:16`. §6 line 139–140 flags the callback path as dead; the monitoring UI is unreviewed.

10. **Health / ops dashboards.** `ProductionHealthDashboard.tsx:45`, `SystemHealthCheck.tsx:51`, `SystemHealthIndicator.tsx:17`, `DialingSystemMonitor.tsx:48`.

11. **Retell onboarding.** `RetellAISetupWizard.tsx:30`, `RetellBusinessVerification.tsx:13`. §4 names `RetellCalendarSetup` only.

12. **Broadcast subfamily.** `BroadcastControlPanel.tsx:43`, `BroadcastQueueManager.tsx:37`, `BroadcastStepIndicator.tsx:18` — §4 names only `VoiceBroadcastManager`.

13. **Campaign subfamily.** `CampaignCallActivity.tsx:27`, `CampaignLeadManager.tsx:31`, `CampaignResultsDashboard.tsx:23`, `LiveCampaignMonitor.tsx:28`, `LiveProgressDashboard.tsx:30`, `DailyReports.tsx:45`.

14. **ai-configuration subfamily.** `QuickStartWizard.tsx:64`, `AISetupAssistant.tsx:94`, `ConfigurationPreview.tsx:75`, `ConfigurationProgress.tsx:73`, `ConfigurationAreaIntegrations.tsx:72`, `QuickAIAction.tsx:13` — §4 names only `OnboardingWizard` and `ConfigurationStepRenderer`.

15. **Pages (14 of 15 unnamed).** `Settings.tsx:586`, `LandingPage.tsx:629`, `Auth.tsx:8`, `ApiKeys.tsx:48`, `McpConsent.tsx:33`, `NumberWebhooks.tsx:34`, `SystemTestingHub.tsx:319`, `AgentConnect.tsx:102`, `InstallApp.tsx:237`, `HelpPage.tsx:14`, `LegalBeta.tsx:248`, `NotFound.tsx:27`. `McpConsent` is notable given `mcp-observer` is named in §4 line 99.

16. **Settings subfamily.** `settings/GHLBroadcastFieldMapping.tsx:103`, `settings/GHLWebhookConfig.tsx:20`.

17. **Misc / infra.** `ProtectedRoute.tsx:32`, `ErrorBoundary.tsx:134` (`withErrorBoundary`), `DashboardSidebar.tsx:172`/`:210` (`getFilteredNavigation`, `getPackNavigation` — the pack-gating logic §5 relies on), `ScriptManager.tsx:91`, `PromptTemplateGuide.tsx:279`, `VoicemailDetectionSettings.tsx:35`, `QuickLaunchButton.tsx:25`, `QuickLeadLoader.tsx:21`, `ReachabilityDashboard.tsx:57`, `ProviderManagement.tsx:80`, `SmartListsSidebar.tsx:29`, `LegalBetaAnnouncement.tsx:4`, `ui/animated-counter.tsx:17`, `ui/dynamic-variables-input.tsx:53`.

## Honest limits

- **Migrations:** §4 names ~6 of 199. I cannot name the other ~193 — no migration listing was supplied. Coverage gap is real but unenumerable from this evidence.
- **Edge functions:** §4 names ~60 of 110. The remaining ~50 are unenumerable here.
- **Hooks:** no hook grep supplied; §4 names ~15 of 68. Unenumerable.
- **Packs:** only `door_to_door` exists per §4 line 123; `EliteSolarLaunchControl` (item 7) suggests a second vertical may exist outside the pack registry — THEORY, unverified.

Far more than five things are genuinely uncovered; the list above is not padded.

**Confidence: medium** — high on presence/absence (grep hits are literal), medium on ranking, low on the migration/edge-function/hook tails which the supplied evidence cannot enumerate.
