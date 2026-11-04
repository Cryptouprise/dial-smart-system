# What did the review miss? - reviewer google/gemini-3.8-flash

cost: $0.0127

---

### Capability Surface Sweep (App Map vs. Grep Inventory)

| Capability Surface | Evidence Citation | Status |
|---|---|---|
| **Campaigns & Dialing Engine** | `docs/dial-smart-app-map.md:57-61` (`CampaignManager.tsx`, `call-dispatcher`, `outbound-calling`) | **COVERED** |
| **Voice Broadcast Engine** | `docs/dial-smart-app-map.md:62-65` (`VoiceBroadcastManager.tsx`, `voice-broadcast-engine`) | **COVERED** |
| **AI Agents & Config Wizards** | `docs/dial-smart-app-map.md:66-70` (`AgentEditDialog.tsx`, `OnboardingWizard.tsx`, `ai-assistant`) | **COVERED** |
| **AI Autonomous Managers** | `docs/dial-smart-app-map.md:71-75` (`AutonomousAgentDashboard.tsx`, `ai-autonomous-engine`) | **COVERED** |
| **Live Call Workspace & Coaching** | `docs/dial-smart-app-map.md:76-79` (`CallWorkspace.tsx`, `coach-suggest`, `coach-decide`) | **COVERED** |
| **SMS Conversations & Automation** | `docs/dial-smart-app-map.md:80-83` (`AiSmsConversations.tsx`, `ai-sms-processor`, `twilio-sms-webhook`) | **COVERED** |
| **Leads, Pipelines & Smart Lists** | `docs/dial-smart-app-map.md:84-88` (`EnhancedLeadManager.tsx`, `pipeline-management`, `useSmartLists.ts`) | **COVERED** |
| **Carriers & Number Purchasing** | `docs/dial-smart-app-map.md:89-92` (`TwilioNumbersOverview.tsx`, `SipTrunkManager.tsx`, `phone-number-purchasing`) | **COVERED** |
| **Spam Reputation & Deliverability** | `docs/dial-smart-app-map.md:93-95` (`EnhancedSpamDashboard.tsx`, `enhanced-spam-lookup`) | **COVERED** |
| **CRM Integrations (GHL, Airtable, etc.)** | `docs/dial-smart-app-map.md:96-100` (`GoHighLevelManager.tsx`, `ghl-integration`) | **COVERED** |
| **Calendar & Scheduling** | `docs/dial-smart-app-map.md:101-104` (`CalendarIntegrationManager.tsx`, `calendar-integration`) | **COVERED** |
| **Credits, Metering & Billing** | `docs/dial-smart-app-map.md:105-108` (`CreditDashboard.tsx`, `stripe-webhook`, migrations) | **COVERED** |
| **Compliance, Safety & Limits** | `docs/dial-smart-app-map.md:109-112` (`launchSafety.ts`, `smsAcceptance.ts`, migrations) | **COVERED** |
| **Analytics & Transcripts** | `docs/dial-smart-app-map.md:113-115` (`TranscriptAnalyzer.tsx`, `generate-daily-report`) | **COVERED** |
| **Door-to-Door Pack** | `docs/dial-smart-app-map.md:122-126` (`src/packs/door_to_door/`, `packs.ts`) | **COVERED** |
| **Workflow Automation & Step Builder** | Grep: `WorkflowBuilder.tsx:60`, `WorkflowTester.tsx:70`, `WorkflowABTesting.tsx:29` | **UNCOVERED** |
| **Interactive Demo & Legal Inbound Sales Funnel** | Grep: `Demo.tsx:390`, `src/components/demo/Demo*` (14 components) | **UNCOVERED** |
| **Testing, Diagnostics & Pilot Dashboards** | Grep: `SystemTestingHub.tsx:319`, `ProductionHealthDashboard.tsx:45`, `TenantPilotPortfolio.tsx:74` | **UNCOVERED** |
| **External Auth, API Keys & MCP Observability** | Grep: `ApiKeys.tsx:48`, `McpConsent.tsx:33`, `NumberWebhooks.tsx:34` | **UNCOVERED** |
| **Vertical Launch Packs (Elite Solar)** | Grep: `EliteSolarLaunchControl.tsx:248` | **UNCOVERED** |

---

### Explicit UNCOVERED List (Ranked by Commercial Importance)

1. **Visual Workflow Engine & A/B Testing**
   * *Files:* `src/components/WorkflowBuilder.tsx:60`, `src/components/WorkflowTester.tsx:70`, `src/components/WorkflowABTesting.tsx:29`, `src/components/AIWorkflowGenerator.tsx:38`.
   * *Commercial Impact:* High. Multi-step cadence execution (calls, SMS, delays, branch logic, A/B variants). The review captured campaign managers and wizards but missed the underlying workflow state-machine authoring and test framework. (FACT)

2. **Self-Serve Demo & Legal Inbound Acquisition Engine**
   * *Files:* `src/pages/Demo.tsx:390`, `src/components/demo/DemoLanding.tsx:31`, `src/components/demo/DemoLegalInboundSetup.tsx:42`, `src/components/demo/DemoLegalInboundSimulation.tsx:58`, `src/components/demo/DemoROIDashboard.tsx:35`, `src/components/demo/DemoWebsiteScraper.tsx:14`.
   * *Commercial Impact:* High. A turnkey prospect-facing interactive simulator specifically targeting the legal vertical with live mock calls, ROI calculator, and lead scrapers. App map briefly notes `functions/demo-scrape-website` (`docs/dial-smart-app-map.md:120`) but completely misses the entire front-end product demonstration and conversion flow. (FACT)

3. **Production Telephony & Tenant Pilot Governance Hubs**
   * *Files:* `src/pages/SystemTestingHub.tsx:319`, `src/components/ProductionHealthDashboard.tsx:45`, `src/components/TenantPilotPortfolio.tsx:74`, `src/components/OperatorIntegrationStatus.tsx:53`, `src/components/DialingSystemMonitor.tsx:48`.
   * *Commercial Impact:* Medium-High. Multi-tenant live monitoring and operational validation interfaces necessary to operate the platform across pilot customers without downtime or silent vendor breakages. (FACT)

4. **API Key Management, Webhook Endpoints & MCP Consent**
   * *Files:* `src/pages/ApiKeys.tsx:48`, `src/pages/McpConsent.tsx:33`, `src/pages/NumberWebhooks.tsx:34`.
   * *Commercial Impact:* Medium. Enables platform extensibility via Model Context Protocol (MCP) tool authorization and direct inbound webhook routing for purchased numbers. (FACT)

5. **Vertical-Specific Solution: Elite Solar Launch Control**
   * *Files:* `src/components/EliteSolarLaunchControl.tsx:248`.
   * *Commercial Impact:* Medium. App map claims `src/packs/door_to_door` is the only pack (`docs/dial-smart-app-map.md:29`), missing custom dedicated vertical launchers such as Elite Solar. (FACT)

---

### What Was Not Checked
* Did not inspect `src/contexts/` (12 files) or `src/hooks/` (80 files) directly beyond lines cited in the app map.
* Did not examine the 199 migration files or remaining 80+ edge functions not explicitly listed in `dial-smart-app-map.md`.
* Did not read internal component implementation logic beyond grep declarations.

Confidence: high.
