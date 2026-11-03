# Dial Smart — the app, measured (shared brief for the review lanes)

Every lane reads this file FIRST. It is the same material for everyone, on purpose:
several model families reading one identical fact base beats each seeing a different slice.

Prepared 2026-11-03 by jcode, from a real census of the repository at
`C:\Users\charl\dial-smart-system` (git `origin/main` = `71f70c5e`).

---

## 1. What the app is

Dial Smart is a multi-tenant outbound/inbound calling and revenue platform. One login, one
database, many capabilities bolted onto it. A React SPA talks to Supabase (Postgres + RLS +
Edge Functions). Telephony is carried by several vendors at once. AI runs both the conversations
and, increasingly, the management.

It is NOT an iframe or a white-label of something else. It is its own codebase on its own
Supabase project (ref `emonjusymdripmkvtttc`).

## 2. Size, measured

| Area | Files | Lines |
|---|---|---|
| `src/` total | 462 | 160,832 |
| `src/components/` | 263 | 102,744 |
| `src/hooks/` | 80 | 25,373 |
| `src/integrations/` | 2 | 9,353 |
| `src/packs/` (door_to_door only) | 12 | 7,666 |
| `src/lib/` | 50 | 5,944 |
| `src/pages/` | 15 | 3,082 |
| `src/contexts/` | 12 | 2,406 |
| `supabase/functions/` | 110 edge functions | — |
| `supabase/migrations/` | 199 migrations | — |

Shape: **161 `.tsx` components, 68 hooks, 15 pages, 110 edge functions, 199 migrations.**

## 3. The five layers

1. **Browser app** — `src/`, React + Vite + TypeScript. One `App.tsx` (171 lines) and one
   `src/pages/Index.tsx` (14 lines) route everything; the real weight is in `components/`.
2. **Data + rules** — Supabase Postgres with row-level security, 199 migrations of schema and
   policy history, plus 110 Edge Functions as the only place secrets and vendor calls live.
3. **Telephony** — Twilio, Telnyx and Retell all present simultaneously (numbers, trunks,
   outbound, webhooks, transcription).
4. **AI** — an "AI brain" (`ai-brain` 5,027 LOC, `ai-autonomous-engine` 5,645 LOC), an assistant
   (`ai-assistant` 3,093), SMS AI (`ai-sms-processor` 1,215), a live call coach
   (`coach-suggest` 491, `coach-decide` 414), transcript analysis, and an ML learning engine.
5. **Packs** — `src/packs/door_to_door` is the first "pack": a whole vertical (door knocking,
   territories, properties, knocks, workspace, appointments) mounted into the same shell.
   `src/lib/packs.ts` is the registry; the pack system is the intended extension point.

## 4. Capability inventory, by the code that implements it

Read as: capability -> the file or function that carries it.

**Campaigns and dialing**
- `components/CampaignManager.tsx` 2,180 · `CampaignWizard.tsx` 891 · `CampaignSetupWizard.tsx` 641
- `hooks/usePredictiveDialing.ts` 796 · `functions/predictive-dialing-engine` 329
- `functions/call-dispatcher` 2,169 · `functions/outbound-calling` 2,246

**Voice broadcast**
- `components/VoiceBroadcastManager.tsx` 3,054 (the single largest component)
- `hooks/useVoiceBroadcast.ts` 701 · `functions/voice-broadcast-engine` 2,453 · `voice-broadcast-queue` 462

**Agents and AI configuration**
- `components/AgentEditDialog.tsx` 2,713 · `AgentToolBuilder.tsx` 1,186 · `AgentFlowBuilder.tsx` 701
- `components/ai-configuration/OnboardingWizard.tsx` 1,141 · `ConfigurationStepRenderer.tsx` 653
- `functions/ai-assistant` 3,093 · `ai-assistant-config` 311 · `ai-configuration-complete` 459

**AI autonomy (AI managers)**
- `components/AutonomousAgentDashboard.tsx` 1,274 · `MissionBriefingWizard.tsx` 1,838
- `hooks/useAutonomousAgent.ts` 686 · `useAutonomousGoals.ts` 387 · `useAutonomousPrioritization.ts` 360 · `useAutonomousCampaignOptimizer.ts` 358
- `functions/ai-autonomous-engine` 5,645 (the largest edge function) · `autonomous-prioritization` 298

**The live call workspace**
- `components/call/CallWorkspace.tsx` 795 · `CallSimulator.tsx` 1,780 · `TranscriptAnalyzer.tsx` 1,272
- `functions/coach-suggest` 491 · `coach-decide` 414 · `analyze-call-transcript` 758 · `voice-call-events` 253

**SMS**
- `components/AiSmsConversations.tsx` 1,857 · `AiSmsAgentGenerator.tsx` 650 · `AIAssistantChat.tsx` 698
- `functions/ai-sms-processor` 1,215 · `sms-messaging` 646 · `twilio-sms-webhook` 1,706

**Leads, pipeline, lists**
- `components/EnhancedLeadManager.tsx` 1,048 · `LeadManager.tsx` 725 · `LeadImportDialog.tsx` 852 · `LeadUpload.tsx` 792 · `LeadDetailDialog.tsx` 1,263
- `components/EnhancedPipelineKanban.tsx` 612 · `AIPipelineManager.tsx` 857 · `functions/pipeline-management` 216
- `hooks/useSmartLists.ts` 502 · `hooks/useMLLearning.ts` 438 · `functions/ml-learning-engine` 387

**Numbers, trunks, carriers**
- `components/TwilioNumbersOverview.tsx` 1,632 · `SipTrunkManager.tsx` 1,180 · `PhoneNumberPurchasing.tsx` 742
- `hooks/useMultiCarrierProvider.ts` 387 · `services/carrierRouter.ts` 227 · `functions/phone-number-purchasing` 490 · `provider-management` 303 · `enhanced-rotation-manager` 277

**Spam and deliverability**
- `components/EnhancedSpamDashboard.tsx` 922 · `functions/enhanced-spam-lookup` 1,070 · `advanced-spam-detection` 359 · `reachability-scoring` 267 · `scheduled-spam-check` 94

**CRM and integrations**
- `components/GoHighLevelManager.tsx` 998 · `GHLFieldMappingTab.tsx` 1,352
- `hooks/useGoHighLevel.ts` 867 · `functions/ghl-integration` 1,225 · `ghl-webhook-trigger` 424 · `ghl-batch-callback` 617 · `ghl-shadow-ingest` 148
- `functions/airtable-sync` 125 · `slack-webhook` 63 · `zapier-observer` 62 · `mcp-observer` 62 · `teams-observer` 65

**Calendar and appointments**
- `components/CalendarIntegrationManager.tsx` 932 · `RetellCalendarSetup.tsx` 1,093 · `FollowUpScheduler.tsx` 657
- `hooks/useCalendarIntegration.ts` 513 · `functions/calendar-integration` 3,497

**Billing, credits, budget**
- `components/CreditDashboard.tsx` 657 · `functions/stripe-webhook` 600 · `credit-management` 819 · `billing-portal` 204 · `budget-tracker` 547
- migrations `20260124_white_label_credits.sql`, `20260713060000_credit_ledger_schema_contract.sql`, `20260713070000_agent_pricing_schema_contract.sql`

**Compliance and safety**
- `lib/launchSafety.ts` 160 · `lib/smsAcceptance.ts` 36 · `hooks/useCampaignCompliance.ts` 379
- migrations `20260712020000_contact_safety_and_provider_idempotency.sql`, `20260712040000_sms_delivery_safety.sql`

**Analytics and reporting**
- `components/TranscriptAnalyzer.tsx` 1,272 · `pages/Analytics.tsx` 68 · `functions/generate-daily-report` 367 · `ml-learning-engine` 387

**Email (exists, small)**
- `functions/email-sender` 111 · `elevenlabs-tts` 106 · `elite-email-release-*` (4 functions) · migration `20260720120000_elite_email_execution_ledger.sql`

**Scraping (exists, small)**
- `functions/demo-scrape-website` 283

**The pack system**
- `src/lib/packs.ts` 122 · `src/packs/door_to_door/` 12 files, 7,666 LOC
- `components/Dashboard.tsx` is the router; `DoorToDoorApp` is lazy-loaded at line 77 and rendered
  in a single `case 'd2d-app':` at line 515

## 5. The multi-tenant model

- Organization scoping throughout; `OrganizationContext.tsx` 162, `lib/organizationContext.ts` 197
- Live org `11824e05-24e3-4dc3-b684-5d0bc7c436d6`; sole member is owner AND platform admin
- 36 RLS policies live on the Door to Door tables alone; the whole DB carries far more
- Credits are white-label and metered (`white_label_credits`, `credit_ledger_schema_contract`)

## 6. Known-open items carried in from the last session (verify, do not assume)

- `voice-call-events` returns 503 when `WEBHOOK_SECRET_TELNYX` is unset
- A Telnyx key is believed leaked and needs rotating
- Stripe secrets are believed missing in the live environment
- Door-to-door doorstep booking queues a callback that cannot fire while
  `call-dispatcher/index.ts:19` `isCallbackAutomationCertified()` returns `false`
- Local `dist/` is stale relative to source (local only; the published build is fine)
- New-house geocoding is unimplemented
- Consent "Record" switch and `coach-suggest` confidence handling are open
- Lint debt: test-harness vitest glob noise; generated Supabase types worked around via `LooseClient`

## 7. The question the owner is actually asking

He built this over a long time and wants an honest read on it, not a status report:

1. **Is this a big pile of garbage, or something genuinely valuable?** Say which, with evidence.
2. **Is it modular and scalable without limit?** Can tools keep being bolted on until it is one
   all-in-one app?
3. **What would you improve**, and what do you actually like and dislike?
4. **The last pieces** he names: run **ads** from here, run **cold email** from here, and
   **scrape for phone numbers** from here. Then: *describe what you want and it builds the
   campaign.*
5. **Which swarms of agents** should be pointed at which parts, to make this massively better.

## 8. The review contract (every lane, same shape)

You are a specialist reviewer. You are **research only**: read, analyze, report. You never write
to the repo, never touch a live system, never call a vendor API, never print a secret.

- **Cite evidence.** Every claim gets `file:line` or a function name. No citation, no claim.
- **Mark it.** Write `FACT` when you read it in the code; `THEORY` when you are inferring.
- **Say what you did not check.** An honest gap list is worth more than false completeness.
- **Do not pad.** Five real findings beat thirty generic ones. Generic advice ("add tests",
  "use a design system") with no file behind it is a failed lane.
- **Read selectively.** Start from the entry points in section 4, follow what matters, and sample
  the rest. Do not attempt to read all 160,832 lines; you will run out of budget and produce
  nothing. Aim to have actually opened the files you name.
- **Be willing to say "this part is good".** Praise backed by code is as useful as criticism.
- **Confidence.** Report `low`, `medium` or `high` honestly. Low is fine and it routes follow-up
  work to you; a fake high is worse than a low.
