# What did the review miss? - reviewer qwen/qwen3.8-flash

cost: $0.0086

---

## Review baseline and method

I treat the supplied `docs/dial-smart-app-map.md` as the review baseline.  
**COVERED** = named or clearly represented in the app map.  
**UNCOVERED** = present in the supplied grep evidence but not named in the app map.  
I do **not** claim code is missing unless the supplied evidence shows it.

---

## 1. Pages

FACT: `grep 'export default' in src/pages .tsx` shows 15 page exports.

| Page | Evidence | Status | Note |
|---|---:|---:|---|
| `src/pages/AgentConnect.tsx` | `src/pages/AgentConnect.tsx:102` | **UNCOVERED** | Not named in app map. |
| `src/pages/Analytics.tsx` | `src/pages/Analytics.tsx:67`; app map `docs/dial-smart-app-map.md:114` | COVERED | Named as analytics surface. |
| `src/pages/ApiKeys.tsx` | `src/pages/ApiKeys.tsx:48` | **UNCOVERED** | Not named in app map. |
| `src/pages/Auth.tsx` | `src/pages/Auth.tsx:8` | **UNCOVERED** | Not named in app map. |
| `src/pages/Demo.tsx` | `src/pages/Demo.tsx:390` | **UNCOVERED** | App map mentions scraping/demo edge function only, not this page. |
| `src/pages/HelpPage.tsx` | `src/pages/HelpPage.tsx:14` | **UNCOVERED** | Not named in app map. |
| `src/pages/Index.tsx` | `src/pages/Index.tsx:13`; app map `docs/dial-smart-app-map.md:40` | COVERED | Named as routing surface. |
| `src/pages/InstallApp.tsx` | `src/pages/InstallApp.tsx:237` | **UNCOVERED** | Not named in app map. |
| `src/pages/LandingPage.tsx` | `src/pages/LandingPage.tsx:629` | **UNCOVERED** | Not named in app map. |
| `src/pages/LegalBeta.tsx` | `src/pages/LegalBeta.tsx:248` | **UNCOVERED** | Not named in app map. |
| `src/pages/McpConsent.tsx` | `src/pages/McpConsent.tsx:33` | **UNCOVERED** | Not named in app map. |
| `src/pages/NotFound.tsx` | `src/pages/NotFound.tsx:27` | **UNCOVERED** | Low commercial importance, but still a page surface. |
| `src/pages/NumberWebhooks.tsx` | `src/pages/NumberWebhooks.tsx:34` | **UNCOVERED** | Not named in app map. |
| `src/pages/Settings.tsx` | `src/pages/Settings.tsx:586` | **UNCOVERED** | Not named in app map. |
| `src/pages/SystemTestingHub.tsx` | `src/pages/SystemTestingHub.tsx:319` | **UNCOVERED** | Not named in app map. |

---

## 2. Component families

FACT: `grep 'export const' in src/components .tsx` shows many component exports.  
THEORY: grouping below is my classification, not repo-native naming.

| Component family | Evidence | Status |
|---|---|---:|
| Core campaigns/dialing | `docs/dial-smart-app-map.md:57-60` names `CampaignManager.tsx`, `CampaignWizard.tsx`, `CampaignSetupWizard.tsx`, `usePredictiveDialing.ts`, `call-dispatcher`, `outbound-calling` | COVERED |
| Campaign verification/readiness/results/workflow | `src/components/CampaignLaunchVerification.tsx:46`, `src/components/CampaignReadinessChecker.tsx:30`, `src/components/CampaignResultsDashboard.tsx:23`, `src/components/CampaignWorkflowEditor.tsx:47`, `src/components/CampaignCallActivity.tsx:27`, `src/components/CampaignLeadManager.tsx:31` | **UNCOVERED subfamily** |
| Core voice broadcast | `docs/dial-smart-app-map.md:62-64` names `VoiceBroadcastManager.tsx`, `useVoiceBroadcast.ts`, `voice-broadcast-engine`, `voice-broadcast-queue` | COVERED |
| Broadcast control/readiness/queue UI | `src/components/BroadcastControlPanel.tsx:43`, `src/components/BroadcastReadinessChecker.tsx:20`, `src/components/BroadcastQueueManager.tsx:37`, `src/components/BroadcastStepIndicator.tsx:18` | **UNCOVERED subfamily** |
| Core agent/AI configuration | `docs/dial-smart-app-map.md:66-69` names `AgentEditDialog.tsx`, `AgentToolBuilder.tsx`, `AgentFlowBuilder.tsx`, `OnboardingWizard.tsx`, `ConfigurationStepRenderer.tsx`, `ai-assistant`, `ai-assistant-config`, `ai-configuration-complete` | COVERED |
| AI configuration assistant/onboarding subcomponents | `src/components/ai-configuration/AISetupAssistant.tsx:94`, `src/components/ai-configuration/QuickStartWizard.tsx:64`, `src/components/ai-configuration/ConfigurationPreview.tsx:75`, `src/components/ai-configuration/ConfigurationProgress.tsx:73`, `src/components/ai-configuration/QuickAIAction.tsx:13`, `src/components/ai-configuration/ConfigurationAreaIntegrations.tsx:72` | **UNCOVERED subfamily** |
| AI autonomy | `docs/dial-smart-app-map.md:71-74` names `AutonomousAgentDashboard.tsx`, `MissionBriefingWizard.tsx`, autonomous hooks, `ai-autonomous-engine`, `autonomous-prioritization` | COVERED |
| Live call workspace | `docs/dial-smart-app-map.md:76-78` names `CallWorkspace.tsx`, `CallSimulator.tsx`, `TranscriptAnalyzer.tsx`, coach functions, `analyze-call-transcript`, `voice-call-events` | COVERED |
| Workflow automation UI | `src/components/WorkflowBuilder.tsx:60`, `src/components/WorkflowPreview.tsx:29`, `src/components/WorkflowTester.tsx:70`, `src/components/WorkflowABTesting.tsx:29`, `src/components/AIWorkflowGenerator.tsx:38` | **UNCOVERED** |
| SMS | `docs/dial-smart-app-map.md:80-82` names `AiSmsConversations.tsx`, `AiSmsAgentGenerator.tsx`, `AIAssistantChat.tsx`, `ai-sms-processor`, `sms-messaging`, `twilio-sms-webhook` | COVERED |
| Core leads/pipeline/lists | `docs/dial-smart-app-map.md:84-87` names `EnhancedLeadManager.tsx`, `LeadManager.tsx`, `LeadImportDialog.tsx`, `LeadUpload.tsx`, `LeadDetailDialog.tsx`, `EnhancedPipelineKanban.tsx`, `AIPipelineManager.tsx`, `pipeline-management`, `useSmartLists.ts`, `useMLLearning.ts`, `ml-learning-engine` | COVERED |
| Lead scoring/filtering/smart-list UI | `src/components/LeadScoringSettings.tsx:18`, `src/components/LeadScoreIndicator.tsx:19`, `src/components/LowScoreAutomation.tsx:25`, `src/components/AdvancedLeadFilter.tsx:44`, `src/components/SmartListsSidebar.tsx:29`, `src/components/QuickLeadLoader.tsx:21` | **UNCOVERED subfamily** |
| Script management | `src/components/ScriptManager.tsx:91` | **UNCOVERED** |
| Core numbers/trunks/carriers | `docs/dial-smart-app-map.md:89-91` names `TwilioNumbersOverview.tsx`, `SipTrunkManager.tsx`, `PhoneNumberPurchasing.tsx`, `useMultiCarrierProvider.ts`, `carrierRouter.ts`, `phone-number-purchasing`, `provider-management`, `enhanced-rotation-manager` | COVERED |
| Provider/carrier UI component | `src/components/ProviderManagement.tsx:80` | **UNCOVERED** |
| Core spam/deliverability | `docs/dial-smart-app-map.md:93-94` names `EnhancedSpamDashboard.tsx`, `enhanced-spam-lookup`, `advanced-spam-detection`, `reachability-scoring`, `scheduled-spam-check` | COVERED |
| Deliverability settings UI | `src/components/RateLimitingSettings.tsx:39`, `src/components/VoicemailDetectionSettings.tsx:35`, `src/components/ReachabilityDashboard.tsx:57` | **UNCOVERED subfamily** |
| Core CRM/GoHighLevel | `docs/dial-smart-app-map.md:96-99` names `GoHighLevelManager.tsx`, `GHLFieldMappingTab.tsx`, `useGoHighLevel.ts`, GHL edge functions, Airtable/Slack/Zapier/MCP/Teams observers | COVERED |
| GHL settings subcomponents | `src/components/settings/GHLBroadcastFieldMapping.tsx:103`, `src/components/settings/GHLWebhookConfig.tsx:20` | **UNCOVERED subfamily** |
| Core calendar/appointments | `docs/dial-smart-app-map.md:101-103` names `CalendarIntegrationManager.tsx`, `RetellCalendarSetup.tsx`, `FollowUpScheduler.tsx`, `useCalendarIntegration.ts`, `calendar-integration` | COVERED |
| Retell setup/verification subcomponents | `src/components/RetellAISetupWizard.tsx:30`, `src/components/RetellBusinessVerification.tsx:13` | **UNCOVERED subfamily** |
| Core billing/credits/budget | `docs/dial-smart-app-map.md:105-107` names `CreditDashboard.tsx`, `stripe-webhook`, `credit-management`, `billing-portal`, `budget-tracker`, credit/pricing migrations | COVERED |
| Billing paused UI | `src/components/BillingPaused.tsx:21` | **UNCOVERED** |
| Core compliance/safety | `docs/dial-smart-app-map.md:109-111` names `launchSafety.ts`, `smsAcceptance.ts`, `useCampaignCompliance.ts`, safety/idempotency/SMS delivery migrations | COVERED |
| Legal beta announcement UI | `src/components/LegalBetaAnnouncement.tsx:4` | **UNCOVERED** |
| Core analytics/reporting | `docs/dial-smart-app-map.md:113-114` names `TranscriptAnalyzer.tsx`, `pages/Analytics.tsx`, `generate-daily-report`, `ml-learning-engine` | COVERED |
| Reporting/insights UI | `src/components/DailyReports.tsx:45`, `src/components/OptimizationInsightsDashboard.tsx:38`, `src/components/AILearningInsights.tsx:36`, `src/components/AgentImprovementHistory.tsx:66`, `src/components/PromptTemplateGuide.tsx:279` | **UNCOVERED subfamily** |
| Core email/scraping | `docs/dial-smart-app-map.md:116-120` names `email-sender`, `elevenlabs-tts`, `elite-email-release-*`, elite email migration, `demo-scrape-website` | COVERED |
| Demo/sales surfaces | `src/pages/Demo.tsx:390`, `src/components/DemoBadge.tsx:6`, `src/components/DemoModeToggle.tsx:9`, and `src/components/demo/*` exports such as `DemoLanding.tsx:31`, `DemoWebsiteScraper.tsx:14`, `DemoROIDashboard.tsx:35`, `DemoLegalVision.tsx:67` | **UNCOVERED** |
| Health/ops monitoring | `src/components/DialingSystemMonitor.tsx:48`, `src/components/LiveCampaignMonitor.tsx:28`, `src/components/ProductionHealthDashboard.tsx:45`, `src/components/SystemHealthCheck.tsx:51`, `src/components/SystemHealthIndicator.tsx:17`, `src/components/LadyJarvisMonitor.tsx:71`, `src/components/OperatorIntegrationStatus.tsx:53`, `src/components/TenantPilotPortfolio.tsx:74`, `src/components/ManagerNotifications.tsx:106`, `src/components/CallbackMonitorWidget.tsx:24`, `src/components/PendingCallbacksWidget.tsx:16` | **UNCOVERED** |
| Navigation/pack discovery | `src/components/DashboardSidebar.tsx:172` `getFilteredNavigation`, `src/components/DashboardSidebar.tsx:210` `getPackNavigation` | **UNCOVERED** |
| Core pack system | `docs/dial-smart-app-map.md:122-125` names `src/lib/packs.ts`, `src/packs/door_to_door/`, `Dashboard.tsx`, lazy `DoorToDoorApp`, `case 'd2d-app'` | COVERED |
| Launch controls | `src/components/QuickLaunchButton.tsx:25`, `src/components/EliteSolarLaunchControl.tsx:248` | **UNCOVERED** |

---

## 3. Edge functions

FACT: the only edge-function evidence supplied is the app map. I cannot enumerate additional edge-function files from the supplied evidence.

| Edge-function surface | Evidence | Status |
|---|---|---:|
| Predictive dialing / outbound dispatch | `docs/dial-smart-app-map.md:59-60` names `predictive-dialing-engine`, `call-dispatcher`, `outbound-calling` | COVERED |
| Voice broadcast | `docs/dial-smart-app-map.md:64` names `voice-broadcast-engine`, `voice-broadcast-queue` | COVERED |
| AI assistant/config | `docs/dial-smart-app-map.md:69` names `ai-assistant`, `ai-assistant-config`, `ai-configuration-complete` | COVERED |
| AI autonomy | `docs/dial-smart-app-map.md:74` names `ai-autonomous-engine`, `autonomous-prioritization` | COVERED |
| Live call coaching/transcripts/events | `docs/dial-smart-app-map.md:78` names `coach-suggest`, `coach-decide`, `analyze-call-transcript`, `voice-call-events` | COVERED |
| SMS | `docs/dial-smart-app-map.md:82` names `ai-sms-processor`, `sms-messaging`, `twilio-sms-webhook` | COVERED |
| Pipeline/ML | `docs/dial-smart-app-map.md:86-87` names `pipeline-management`, `ml-learning-engine` | COVERED |
| Numbers/providers/rotation | `docs/dial-smart-app-map.md:91` names `phone-number-purchasing`, `provider-management`, `enhanced-rotation-manager` | COVERED |
| Spam/reachability | `docs/dial-smart-app-map.md:94` names `enhanced-spam-lookup`, `advanced-spam-detection`, `reachability-scoring`, `scheduled-spam-check` | COVERED |
| CRM/integrations | `docs/dial-smart-app-map.md:98-99` names `ghl-integration`, `ghl-webhook-trigger`, `ghl-batch-callback`, `ghl-shadow-ingest`, `airtable-sync`, `slack-webhook`, `zapier-observer`, `mcp-observer`, `teams-observer` | COVERED |
| Calendar | `docs/dial-smart-app-map.md:103` names `calendar-integration` | COVERED |
| Billing/credits/budget | `docs/dial-smart-app-map.md:106` names `stripe-webhook`, `credit-management`, `billing-portal`, `budget-tracker` | COVERED |
| Reporting | `docs/dial-smart-app-map.md:114` names `generate-daily-report` | COVERED |
| Email/TTS/elite email | `docs/dial-smart-app-map.md:117` names `email-sender`, `elevenlabs-tts`, `elite-email-release-*` | COVERED |
| Scraping | `docs/dial-smart-app-map.md:120` names `demo-scrape-website` | COVERED |

**No edge function is marked UNCOVERED because no additional edge-function evidence was supplied.**

---

## 4. Migration themes

FACT: the only migration evidence supplied is the app map.

| Migration theme | Evidence | Status |
|---|---|---:|
| White-label credits | `docs/dial-smart-app-map.md:107` names `20260124_white_label_credits.sql` | COVERED |
| Credit ledger contract | `docs/dial-smart-app-map.md:107` names `20260713060000_credit_ledger_schema_contract.sql` | COVERED |
| Agent pricing contract | `docs/dial-smart-app-map.md:107` names `20260713070000_agent_pricing_schema_contract.sql` | COVERED |
| Contact safety / provider idempotency | `docs/dial-smart-app-map.md:111` names `20260712020000_contact_safety_and_provider_idempotency.sql` | COVERED |
| SMS delivery safety | `docs/dial-smart-app-map.md:111` names `20260712040000_sms_delivery_safety.sql` | COVERED |
| Elite email execution ledger | `docs/dial-smart-app-map.md:117` names `20260720120000_elite_email_execution_ledger.sql` | COVERED |
| Door-to-door RLS | `docs/dial-smart-app-map.md:131` says 36 RLS policies live on Door to Door tables | COVERED |

**No migration theme is marked UNCOVERED because no additional migration evidence was supplied.**

---

## 5. Packs

| Pack surface | Evidence | Status |
|---|---|---:|
| `door_to_door` pack | `docs/dial-smart-app-map.md:49`, `docs/dial-smart-app-map.md:123` | COVERED |
| Pack registry | `docs/dial-smart-app-map.md:51`, `docs/dial-smart-app-map.md:123` names `src/lib/packs.ts` | COVERED |
| Pack routing into Dashboard | `docs/dial-smart-app-map.md:124-125` names `Dashboard.tsx`, lazy `DoorToDoorApp`, `case 'd2d-app'` | COVERED |

**No additional pack is evidenced.**

---

# Explicit UNCOVERED list, ranked by commercial importance

THEORY: ranking is commercial importance inferred from names and app context, not from file contents.

| Rank | Uncovered surface | Concrete evidence | Commercial importance |
|---:|---|---|---|
| 1 | **Tenant access, settings, API keys, agent connection, number webhooks** | `src/pages/Auth.tsx:8`, `src/pages/Settings.tsx:586`, `src/pages/ApiKeys.tsx:48`, `src/pages/AgentConnect.tsx:102`, `src/pages/NumberWebhooks.tsx:34` | Very high. These are likely account provisioning, security, integration, and telephony control surfaces. |
| 2 | **Campaign launch verification/readiness/results/workflow** | `src/components/CampaignLaunchVerification.tsx:46`, `src/components/CampaignReadinessChecker.tsx:30`, `
