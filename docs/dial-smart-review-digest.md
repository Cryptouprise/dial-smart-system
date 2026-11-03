# Dial Smart / DoorBoss - capability review digest

Condensed findings from a multi-model review swarm. Every line is a model-authored finding with file:line evidence. Confidence is the author's own self-report (low|medium|high).

Nodes in this digest: 162 (review lanes). Plus 30 nodes from earlier unrelated plans (excluded).


## Architecture & modularity  (arch)


### arch-a-packs  [completed, confidence=high]
packs.ts = static central registry; pack gating is REAL, but the "plugin seam" is DECORATIVE (adding a pack needs edits in 4+ central places).

- src/lib/packs.ts:14 PACK_IDS = ['solar_exit','wholesale_re','door_to_door'] as const
- src/lib/packs.ts:31-38 PackDefinition interface
- src/lib/packs.ts:40 PACKS: Record<PackId,PackDefinition> literal (3 entries, ends line 82)
- src/lib/packs.ts:103 packForTab walks ALL_PACKS.sidebarGroups
- _not checked_: All supabase/migrations for other pack references / RLS policies using org_has_pack; Whether other non-src directories (scripts/, docs/) reference the pack registry; Full CallWorkspace.tsx body (only imports read) for how PackId/coach content is applied

### arch-b-dashboard  [completed, confidence=high]
Dashboard.tsx = 544-line hybrid/god object (47 cases), real router is App.tsx (18 routes).

- src/components/Dashboard.tsx:544 (file length; PowerShell (Get-Content).Count = 544)
- src/components/Dashboard.tsx:234 (switch (activeTab) {) and :517 (default:)
- src/components/Dashboard.tsx:235-515 (47 case labels, listed in findings; PowerShell Select-String 'case ' = 47 matches, all real labels)
- src/components/Dashboard.tsx:110-116 (useSearchParams, useState activeTab, useState numbers, useToast, useSimpleMode, useDemoMode, useEnabledPacks)
- _not checked_: DashboardSidebar.tsx and the sidebar tab registry (possible duplicate list of the same tab keys).; useEnabledPacks/packForTab internals (pack-gating at 223-232 assumed correct).; Whether any tab key is dead/unreachable or missing a sidebar entry (reachability 

### arch-c-registry  [completed, confidence=high]
No central capability registry. 110 dirs (109 functions+_shared). Only partial config.toml (90) + human app-map doc. Scattered.

- supabase/functions/ -> 110 directories total (Get-ChildItem -Directory .Count = 110)
- 109 deployable function dirs + _shared (dirs=109 computed excluding _shared)
- supabase/config.toml:1-449 -> 90 [functions.X] blocks, all 90 match real dirs, 0 phantom entries
- 19 function dirs absent from config.toml: assistable-make-call, billing-portal, bulk-lead-import, coach-decide, coach-suggest, credit-management, demo-funnel-track, law-firm-beta-submit, ringba-enrich-proxy, teams-observer, twilio-voice-status, twilio-voice-tr
- _not checked_: Did not read every docs/*.md file exhaustively (searched for function-name enumeration and registry terms only); Did not read .lovable/mcp/manifest.json contents in detail (path/size suggests Lovable tooling config, not app capabilities); Did not inspect src/l

### arch-d-newvertical  [completed, confidence=high]
Adding a vertical = 3 mandatory files (packs.ts, industry_packs.sql allow-list, Dashboard.tsx switch) + a 4th icon/map entry; seams mostly clean, allow-list is duplicated/leaky.

- src/lib/packs.ts:14 PACK_IDS = ['solar_exit','wholesale_re','door_to_door']
- src/lib/packs.ts:10-11 comment: 'Keep this list in sync with supabase/migrations/20261029010000_industry_packs.sql (set_org_packs).'
- src/lib/packs.ts:69-81 door_to_door PACKS entry (sidebar item id 'd2d-app')
- src/lib/packs.ts:85 ALL_PACKS derived from PACK_IDS; :103 packForTab; :113 packForPath
- _not checked_: The live DB state of set_org_packs / v_allowed (no DB query run -- read-only analysis only).; Whether any OTHER file imports PACK_IDS/PACKS beyond the ones found by grep (did not exhaustively open every file that mentions 'pack').; The 4 elite-email edge funct

### arch-e-coupling-aed  [completed, confidence=high]
agentEditDialog.tsx: 2712 lines; 12 supabase.functions.invoke calls, 0 supabase.from, 0 useContext; dominant pattern = direct-supabase

- C:/Users/charl/dial-smart-system/src/components/AgentEditDialog.tsx:1 import React, { useState, useEffect, useRef } from 'react';
- C:/Users/charl/dial-smart-system/src/components/AgentEditDialog.tsx:18 import { supabase } from '@/integrations/supabase/client';
- C:/Users/charl/dial-smart-system/src/components/AgentEditDialog.tsx:19 import { useToast } from '@/hooks/use-toast';
- C:/Users/charl/dial-smart-system/src/components/AgentEditDialog.tsx:21 import { useCurrentOrganizationId } from '@/contexts/OrganizationContext';
- _not checked_: Did not trace what the parent passes for agent/onSave props (no parent file read).; Did not inspect the '@/integrations/supabase/client' module to confirm it is a singleton client.; Did not read the full 2712-line body (read lines 1-183 plus all supabase-match

### arch-e-coupling-aisc  [completed, confidence=high]
AiSmsConversations.tsx: 1856 lines, 6 supabase.from( + 1 functions.invoke = 7 direct supabase calls, 0 useContext, 0 props, 5 custom hooks; dominant = direct-supabase.

- AiSmsConversations.tsx:1856 total lines (findstr /v "" count)
- AiSmsConversations.tsx:449 supabase.functions.invoke('sms-messaging', {
- AiSmsConversations.tsx:579 supabase (then .from('sms_conversations').update)
- AiSmsConversations.tsx:645 supabase (+.from('sms_conversations').select)
- _not checked_: The contents of '@/hooks/useAiSmsMessaging', '@/hooks/useTwilioIntegration', '@/hooks/useDebounce', '@/hooks/use-toast' - did not open them, so whether they also touch supabase or accept params is unchecked.; No React Context provider was searched across the a

### arch-e-coupling-children  [completed, confidence=high]
VBM children: QT/BQM/LPD add direct-supabase coupling; ReadinessChecker+StepIndicator pure presentational; CalendarIntegrationSection intra-file; CampaignComplianceStatus couples only via hook.

- VoiceBroadcastManager.tsx:37-41 (exact imports)
- VoiceBroadcastManager.tsx:683 <LiveProgressDashboard broadcastId onRefresh/>; :690 <QuickTestBroadcast/>; :1533 <BroadcastStepIndicator hasAudio hasLeads isGeneratingAudio/>; :1973 <BroadcastQueueManager broadcastId broadcastName isOpen onClose onQueueUpdated/
- VoiceBroadcastManager.tsx:38 BroadcastReadinessChecker imported, only match in file -> never rendered
- QuickTestBroadcast.tsx:11 supabase import; :62 .from('phone_numbers'); :102 functions.invoke('quick-test-call'); :35 React.FC no props
- _not checked_: Hooks imported by the children (useVoiceBroadcast, useBroadcastReadiness, useLiveCampaignStats, useAiSmsMessaging, useTwilioIntegration) - their internal supabase/context coupling not counted, so each child's real transitive coupling exceeds the direct numbers

### arch-e-coupling-cm  [completed, confidence=high]
CampaignManager.tsx: 2179 lines; 12 direct supabase calls (9 from + 3 invoke); 0 useContext; 1 prop (onRefresh); 9 custom hooks; dominant pattern hooks + heavy direct-supabase.

- CampaignManager.tsx:2179 line count
- CampaignManager.tsx:79-81 props interface CampaignManagerProps { onRefresh?: () => void }
- CampaignManager.tsx:98 destructures { onRefresh }
- CampaignManager.tsx:221 .from('campaign_workflows')
- _not checked_: Opened the imported hook files (usePredictiveDialing/useCallDispatcher/useCampaignReadiness etc.) to confirm whether those hooks themselves call supabase or an edge function - per-hook data-access depth unverified.; Inspected the parent that renders <CampaignM

### arch-e-coupling-context-layer  [completed, confidence=high]
Synth 'no service interface' = overstated; no supabase repository layer, but services/ + lib helpers exist

- src/integrations/supabase/client.ts:5 hardcoded SUPABASE_URL
- src/integrations/supabase/client.ts:6 hardcoded SUPABASE_PUBLISHABLE_KEY
- src/integrations/supabase/client.ts:11 export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
- src/contexts/OrganizationContext.tsx:9 import getUserOrganizations from @/lib/organizationContext
- _not checked_: Did not open hooks/useAIBrain.ts to confirm the ai-brain invoke import site.; Did not enumerate/categorize all ~190 direct supabase imports by pattern (only counted them).; Did not confirm whether client.ts anon key differs across envs / whether a .env overrid

### arch-e-coupling-mbw  [completed, confidence=high]
MBW: 1837 lines, 9 direct supabase calls (6 .from + 3 invoke), no props, 2 context hooks; dominant = direct-supabase.

- C:/Users/charl/dial-smart-system/src/components/MissionBriefingWizard.tsx:19 - `import { supabase } from '@/integrations/supabase/client';`
- C:/Users/charl/dial-smart-system/src/components/MissionBriefingWizard.tsx:328 - `const MissionBriefingWizard: React.FC = () => {` (no props)
- C:/Users/charl/dial-smart-system/src/components/MissionBriefingWizard.tsx:353 - `const { sendMessage } = useAIBrainContext();`
- C:/Users/charl/dial-smart-system/src/components/MissionBriefingWizard.tsx:354 - `const organizationId = useCurrentOrganizationId();`
- _not checked_: Did not inspect the imported modules '@/contexts/AIBrainContext', '@/contexts/OrganizationContext', '@/integrations/supabase/client', '@/lib/testCallUtils' - coupling is reported from the call sites in this file only.; Did not check other files/components for 

### arch-e-coupling-parents  [failed, confidence=high]
Parents traced: CM onRefresh live (:395,:531); AED agent/onSave supplied by RetellAIManager; VBM no-props; MBW/AISC unresolved. Node terminal-failed.

- PredictiveDialingDashboard.tsx:9 (static import of CampaignManager; no lazy)
- PredictiveDialingDashboard.tsx:59-61 (throttledRefresh wraps loadDashboardData)
- PredictiveDialingDashboard.tsx:112-146 (loadDashboardData definition)
- PredictiveDialingDashboard.tsx:279 (<CampaignManager onRefresh={loadDashboardData} /> — sole mount)
- _not checked_: Could not resolve MBW/AISC to any identifier (searched many plausible expansions) — treated as unresolvable, not as 'no-props-confirmed'.; Did not read the full 2000+ line CampaignManager body; relied on exhaustive literal Select-String for 'onRefresh' (found 

### arch-e-coupling-synth  [completed, confidence=high]
Synthesized 5 coupling reports: 11637 lines, 28 .from + 25 invoke = 53 direct supabase calls, 0 useContext, 0-5 props. All 5 bypass any service layer.

- C:/Users/charl/dial-smart-system/src/components/VoiceBroadcastManager.tsx:86,3053 (no props), :189,204,237,295,347,431,452 (.from=7), :215,250,281,309,476,1899 (invoke=6), useContext=0 — arch-e-coupling-vbm
- C:/Users/charl/dial-smart-system/src/components/CampaignManager.tsx:79-81,98 (1 prop onRefresh), :221,237,331,430,547,557,599,703,794 (.from=9), :271,272,407 (invoke=3), useContext=0 — arch-e-coupling-cm
- C:/Users/charl/dial-smart-system/src/components/AgentEditDialog.tsx:24-30,157-163 (5 props), :221 auth.getUser, :237,268,398,569,779,850,979 (invoke=12), .from=0, useContext=0, 9 hardcoded project-ref URL literals — arch-e-coupling-aed
- C:/Users/charl/dial-smart-system/src/components/MissionBriefingWizard.tsx:328 (no props), :353-354 (2 context hooks), :364,376,387,624,634,644 (.from=6), :554,679,1091 (invoke=3), useContext=0 — arch-e-coupling-mbw
- _not checked_: Interiors of any custom hook (@/hooks/*) or context module — whether they wrap supabase; scoped out by all siblings.; Parent/consumer files that render these 5 components — prop usage (e.g. CM's onRefresh) and provider wiring unverified.; Whether the 12 AED ed

### arch-e-coupling-vbm  [completed, confidence=high]
VBM.tsx: 3053 lines, 0 props, 0 useContext, 13 direct supabase calls (7 from + 6 invoke), 5 custom hooks; dominant pattern = hooks (heavy direct-supabase hybrid).

- C:/Users/charl/dial-smart-system/src/components/VoiceBroadcastManager.tsx:1-3053 (full file read)
- L86 `export const VoiceBroadcastManager: React.FC = () => {` (no props)
- L3053 `export default VoiceBroadcastManager;`
- L14 import { useToast } from '@/hooks/use-toast'
- _not checked_: The innards of the custom hooks (useVoiceBroadcast, useBroadcastReadiness, useLiveCampaignStats, useSystemHealth) — whether they themselves use direct supabase or context; this node scopes only the component file.; Whether any child components (QuickTestBroadc

## Data model & migrations  (data)


### data-a-destructive-migrations  [completed, confidence=high]
Lane (a) done: ranked 6 dangerous migrations - full-table DELETE of lead_pipeline_positions worst; phase2 SET NOT NULL replay aborts; no writes.

- 20260407220336_3e4797af:1
- 20251214221955_8054901e:3-119,122
- 20260713062000_dnc_tenant_uniqueness_contract.sql:147,158
- 20251214231612_dbda3e98:2-11
- _not checked_: Full body of 20260713070000 (grep+sample only) - THEORY on replay safety; Whether migrations are already applied (live schema_migrations); Non-destructive context of the remaining ALTER-flagged files

### data-b-schema-eras  [completed, confidence=high]
Schema eras: 199 migrations = 11 stacked eras on one additive trunk; re-modelling confined to 2026-07 contracts. Confidence high.

- dir /b supabase/migrations | find /c -> 199 files (FACT)
- per-month prefix counts: 202412=2, 202506=1, 202511=9, 202512=48, 202601=28, 202602=19, 202603=7, 202604=31, 202607=38, 202606+202608+202610+202611=15; plus 20240115=1 => 199 (FACT)
- findstr for 'DROP TABLE public'/'DROP TABLE IF EXISTS public' -> 0 hits; only DROP TABLE statements are temp tables: 20260108_phase2_add_org_to_core_tables.sql:334 'DROP TABLE IF EXISTS _default_org', 20260108_phase2_add_org_to_additional_tables.sql:271, 20251
- findstr -m ALTER TABLE -> 137/199 files; ADD COLUMN -> 74 files; CREATE TABLE IF NOT EXISTS -> 63 files (FACT)
- _not checked_: Did not read all 199 files end-to-end; era themes come from keyword file-counts (telnyx=19, retell=37, api_key=14, organization=53, CREATE POLICY=95, autonomous=21) plus sampled heads, so theme labels are directional not exhaustive.; Did not query the live DB 

### data-c-core-tables  [completed, confidence=medium]
Core tables: dialing_queues + scheduled_follow_ups lack org FK; dialing_queues lacks composite poll index; call_logs lacks created_at ORDER indexes. Cited file:line.

- supabase/migrations/20260108_phase2_organizations.sql:10 (organizations PK), :44-46 (org indexes)
- supabase/migrations/20250619152448-97fb6549-a522-4654-a60c-9cd1f5ea5e81.sql:41-53 (dialing_queues CREATE), :118-124 (FKs), :132-134 (indexes)
- supabase/migrations/20251205153218_06d8fe7f-4188-4afd-ba48-56c4b0c65e17.sql:57-69 (scheduled_follow_ups CREATE), :109 (index)
- supabase/migrations/20260108_phase2_add_org_to_core_tables.sql:23-35 (campaigns org FK+idx), :74-83 (leads org FK+idx), :258-267 (call_logs org FK+idx)
- _not checked_: Live schema: did not connect to Supabase to run pg_indexes / \d - all claims from migration files + a stale types.ts; a repo migration may or may not be applied to production.; campaign_leads junction table (indexes, PK, org propagation) - out of 6-table scope

### data-d-money-model  [completed, confidence=medium]
Lane (d): money is INTEGER cents; hybrid mutable balance guarded by trigger; canonical fns pinned empty; gaps = un-revoked deduct_call_credits + broken checkout metadata keys. Confidence medium.

- C:/Users/charl/dial-smart-system/supabase/migrations/20260124_white_label_credits.sql:32 balance_cents INTEGER
- C:/Users/charl/dial-smart-system/supabase/migrations/20260124_white_label_credits.sql:107 amount_cents INTEGER; :110-111 balance_before/after INTEGER
- C:/Users/charl/dial-smart-system/supabase/migrations/20260124_white_label_credits.sql:288,401,474 SECURITY DEFINER with no search_path
- C:/Users/charl/dial-smart-system/supabase/migrations/20260124_white_label_credits.sql:291 deduct_call_credits (only occurrence in 199 migrations)
- _not checked_: Other callers of add_credits/reserve_credits/finalize_call_cost across the 110 edge functions and the frontend (only stripe-webhook and credit-management were traced).; The live database schema/grants (I read migrations, not the live DB; migration replay vs li

### data-e-d2d-tables  [completed, confidence=high]
9 d2d_ tables, 36 RLS policies confirmed; matches newest contract with 6 deviations (CASCADE vs RESTRICT, dead updated_at, missing sync/zip indexes).

- core.sql:15,29,76 (tables); core.sql:17,31,78 (org FK CASCADE); core.sql:63 (deleted_at only on properties); core.sql:67-73 (property indexes); core.sql:98-100 (knock indexes); core.sql:105-121 (updated_at triggers); core.sql:124-175 (scope/apply triggers); co
- workspace.sql:19,30,44,55,67,80 (tables); workspace.sql:20,32,46,57,69,82 (org FK CASCADE); workspace.sql:41 (positions unique); workspace.sql:52,77,87 (updated_at); workspace.sql:92-98 (indexes); workspace.sql:102-112 (touch triggers for 3 tables only); works
- members.sql:8-40 (function only, no table)
- phase1_org_scope.sql:8-11 (RESTRICT), 47-69 (default-fill), 82-85 (canonical policies), 114-118 (guard)
- _not checked_: No live DB introspection (information_schema/LIVE-SCHEMA.md); facts are from migration text assuming they were applied verbatim (core.sql:11-12 only asserts the core one was applied).; Did not open src/integrations/supabase/types.ts to confirm the 6 workspace 

## Integrations  (integrations)


### gap-ads  [completed, confidence=high]
Ads gap: 0% built. No Meta/Google Ads, pixel, or ad tables anywhere. Closest assets: bulk-lead-import + LeadImportDialog. Cheapest step: FB Lead Ads webhook into existing leads table.

- package.json:75-168 - dependencies contain NO facebook/meta/google-ads/gtag/gtm/pixel SDK (only react, supabase, telnyx, twilio, stripe-adjacent, radix, etc.)
- grep 'meta_ads|google_ads|ad_account|ad_campaign|ads_manager' over C:/Users/charl/dial-smart-system = 0 matches
- grep 'AdCampaign|AdCreative|AdAccount|AdsManager|ad_spend|adSpend|AdBudget' over src/ = 0 matches
- grep 'facebook_ads|meta_ads|google_ads|ad_account|ad_campaign|ad_spend|ad_creative' over supabase/migrations = 0 matches
- _not checked_: The full text of all 78 edge functions (grepped by name/symbol only); The live Supabase database schema (only repo migrations scanned); CLAUDE.md and other docs/ files in full

### gap-cold-email  [completed, confidence=high]
Cold-email layer is a gated DEMO stub: Resend send is real code but hard-disabled; Release-* are scaffolding; no inbox/warmup/campaign/deliverability. Fix = EXTEND with one Instantly execute adapter.

- supabase/functions/email-sender/index.ts:8-10 isEmailEgressTenantCertified() returns false
- supabase/functions/email-sender/index.ts:21-31 hard 503 EMAIL_EGRESS_NOT_TENANT_CERTIFIED before any provider call
- supabase/functions/email-sender/index.ts:34,58-71 real Resend POST below the gate, default from noreply@resend.dev (:65); no budget/idempotency/dedup/receipt
- scripts/lib/contact-egress-surface-audit.mjs:103-118 email-sender registered hard_disabled, physicalApi https://api.resend.com/emails
- _not checked_: Did not verify live DB state (whether the ledger migration is applied in production).; Did not run any readiness probe against a live Instantly/Mailgun key.; Did not inspect the src/hooks/useAutonomousAgent.ts sendEmail caller beyond knowing it invokes email-s

### gap-nl-campaign  [completed, confidence=medium]
NL->campaign = two islands, both gated off on main; generator makes workflows only, wizard delegates to ai-brain setup_full_campaign; live is pre-gate legacy.

- supabase/functions/ai-workflow-generator/index.ts:8-10 (isAiWorkflowGenerationCertified returns false)
- supabase/functions/ai-workflow-generator/index.ts:17-22 (503 AI_WORKFLOW_GENERATION_NOT_CERTIFIED)
- supabase/functions/ai-workflow-generator/index.ts:79-85,149 (returns {workflow:{name,description,steps,sms_templates}} only)
- src/hooks/useAIWorkflowGenerator.ts:25 (invoke ai-workflow-generator)
- _not checked_: Live runtime behavior of ai-brain/ai-workflow-generator (not deployed-probed; relied on static snapshot + audit doc).; automation-scheduler cron definition/schedule and whether it is live.; Conversation AI / GHL-side agents that might also read workflows.

### gap-scraping  [completed, confidence=high]
gap-scraping: demo-scrape-website is demo-only, extracts no phones; leads enter by CSV. Cheapest path = new lead-scout edge fn reusing its Firecrawl plumbing.

- supabase/functions/demo-scrape-website/index.ts:111 FIRECRAWL_API_KEY read
- supabase/functions/demo-scrape-website/index.ts:137-145 Firecrawl /v1/scrape
- supabase/functions/demo-scrape-website/index.ts:155-198 Firecrawl /v1/map + key-page loop
- supabase/functions/demo-scrape-website/index.ts:208-219 Lovable AI gateway (knowledge_base only)
- _not checked_: Did not run the function or make live Firecrawl calls - behavior inferred from source (read-only lane).; Did not inspect GHL ingestion paths (ghl-integration, ghl-shadow-ingest) which may import leads from GoHighLevel - a possible 4th lead-in path.; Did not en

### int-crm-messaging  [completed, confidence=high]
GHL=deep code but disabled; Airtable=stub; Slack+Zapier=real read-only observer adapters, disabled, not stubs

- supabase/functions/ghl-integration/index.ts:63-65 isGhlMultiAccountSyncCertified()=>false
- supabase/functions/ghl-integration/index.ts:75-85 hard 503 GHL_MULTI_ACCOUNT_SYNC_NOT_CERTIFIED
- supabase/functions/ghl-integration/index.ts:137 baseUrl='https://services.leadconnectorhq.com'
- supabase/functions/ghl-integration/index.ts:150,171,217,263,289,342,403,408,629,653,668,685,756,772,784,793,836,853,883,930,944,973,997,1045,1087,1094 29 real GHL fetch() calls
- _not checked_: Live runtime/deployment state of each edge function (no Supabase project probe; verdicts are source-level).; The SQL side: certification/*/migrations ghl_shadow_ingest_lane + reconciliation_export bodies, and whether the two RPCs are actually present/certified

### int-infra  [completed, confidence=high]
int-infra: Stripe=deep (live); Supabase=platform; ElevenLabs=stub (real call gated off); Calendar=built-deep but 503-gated (Google+GHL+Cal.com)

- supabase/functions/elevenlabs-tts/index.ts:14-16 (gate false)
- supabase/functions/elevenlabs-tts/index.ts:25-35 (503)
- supabase/functions/elevenlabs-tts/index.ts:58-76 (real TTS fetch, unreachable)
- supabase/functions/stripe-webhook/index.ts:258-289 (idempotency)
- _not checked_: Did not read the remaining ~3420 lines of calendar-integration beyond header + provider grep (CRUD semantics assumed from grep hits); Did not read the rest of budget-tracker (lines 120-547) beyond provider-fetch entry; Did not read RetellCalendarSetup.tsx / Ca

### int-telephony  [completed, confidence=medium]
Telephony depth: Twilio integrated-deeply (SMS/admin/browser-phone; AI-voice stubbed), Telnyx shallow (browser-phone only, 8 surfaces 503), Retell integrated-deeply (only certified dialer).

- C:/Users/charl/dial-smart-system/supabase/functions/twilio-sms-webhook/index.ts:1-6
- C:/Users/charl/dial-smart-system/supabase/functions/twilio-integration/index.ts:11
- C:/Users/charl/dial-smart-system/supabase/functions/twilio-integration/index.ts:1530
- C:/Users/charl/dial-smart-system/supabase/functions/twilio-amd-webhook/index.ts:32-40
- _not checked_: Did not trace lib/voice/BrowserPhone.ts into the React UI to prove the browser-phone feature is actually rendered/enabled (so Telnyx/Twilio browser leg liveness is inferred from absence of a server guard only).; Did not read twilio-dtmf-handler/index.ts conten

## AI layer  (ai-layer)


### ai-layer  [completed, confidence=medium]
AI autonomy (engine + brain) is hard-disabled at 503; only the human-gated live coach actually runs. No server-side spend cap anywhere in the AI layer.

- ai-autonomous-engine/index.ts:5498-5521 (isAutonomousEngineTenantCertified=false -> 503)
- ai-brain/index.ts:10-12 and 4652-4663 (isAiBrainTenantCertified=false -> 503 AI_BRAIN_NOT_TENANT_CERTIFIED)
- supabase/migrations/20260713061000_disable_uncertified_autonomous_engine_cron.sql:19-26 (unschedules ai-autonomous-engine-job)
- supabase/migrations/20260210_autonomous_engine_upgrade.sql:262-269 (original 5-min pg_cron schedule)
- _not checked_: The tail of ai-brain's serve handler and final tool-execution loop (index.ts:4777-5026) - read only the header and case list.; ai-assistant/index.ts internals beyond the two model lines.; AutonomousAgentDashboard.tsx / useAutonomousAgent.ts / MissionBriefingWi

## Code quality  (quality)


### err-ai-assistant  [completed, confidence=high]
ai-assistant.ts: always 503s (cert guard hardcoded false); inconsistent error shapes; 7 success-on-failure swallows; no Allow-Methods CORS.

- 2878-2880 isAiAssistantToolSurfaceTenantCertified() returns false -> always 503 at 2891-2900
- 3082-3085 success {response, analytics} default 200
- 3075-3079 {response, actions_taken, analytics}
- 3032-3036 {response, pending_actions, analytics}
- _not checked_: Shared helper ../_shared/tenant-context.ts (authorizeOrganizationContext) error behavior; Frontend/client consumers of these response shapes (whether they expect success/message); ./_shared type-level lint or deno check of the function

### err-ai-sms-processor  [completed, confidence=high]
Error handling: 200/{success:true} vs {error}/{code}; 6 swallowed catches, ~11 dropped-error reads; wildcard CORS; RETELL key dead.

- index.ts:12-15 corsHeaders wildcard origin, no Allow-Methods
- index.ts:131-135 OPTIONS returns null body + corsHeaders
- index.ts:139-147 401 {error:'Unauthorized'}
- index.ts:176-184 401 {error:'Authentication failed'}
- _not checked_: Git baseline / whether earlier versions handled errors differently; Actual runtime env values and Supabase secrets config (not accessible, read-only); Callers of this function (workflow-executor, frontend) to see how they treat the 200/500 and {success}/{error

### err-calendar-integration  [completed, confidence=high]
calendar-integration is dead code: L43-51 returns 503 unconditionally; analyzed all response shapes, swallowed catches, CORS/env handling (every claim file:line).

- index.ts:43-51 serve handler returns 503 unconditionally before the try (everything after is unreachable)
- index.ts:53-59 env check throws but is dead code
- index.ts:39-41 OPTIONS -> Response(null,{corsHeaders})
- index.ts:4-7 corsHeaders constant (no Allow-Methods)
- _not checked_: Did not execute/run the function or issue any HTTP request (static read only).; Did not inspect other Supabase edge functions, the frontend callers, Retell agent config, or the DB schema/RLS.; Did not verify whether the L43-51 503 kill-switch is intentional/re

### err-call-dispatcher  [completed, confidence=high]
call-dispatcher error-handling audit done: inconsistent success shapes, ~40 swallowed/ignored failures, wildcard CORS, env validated. All line-cited.

- index.ts:2126-2159 main success 200 body keys
- index.ts:2161-2167 global catch -> 500 {error: error.message}
- index.ts:892-899 No active campaigns 200 without success key
- index.ts:1346-1358 no_numbers_available success:false but status 200
- _not checked_: _shared/alerting.ts, _shared/tenant-context.ts, _shared/provider-router.ts internal error handling (throw behavior of raiseAlert/resolveAlerts/assertTenantResourceOwnership/authorizeOrganizationContext/resolveRouting).; SQL RPCs claim_pending_dispatches, evalu

### err-coach-suggest  [completed, confidence=high]
coach-suggest err review: {proposals,error} only (no message/success); 6 swallowed failures; env handled, secret in lithos.ts

- coach-suggest/index.ts:21-24 corsHeaders constant
- coach-suggest/index.ts:77 OPTIONS null response
- coach-suggest/index.ts:78 405 POST only
- coach-suggest/index.ts:81-85 env read + 500 missing config
- _not checked_: _shared/lithos.ts (chatJSON/LithosError): env key reading, timeout implementation, error classification - not opened.; _shared/utils.ts (checkRateLimit/RateLimitError): whether sync or async, storage/backing - not opened.; Client callers (doorboss call.html / 

### err-outbound-calling  [completed, confidence=high]
outbound-calling/index.ts: success=200 shared return, errors across 7 statuses/3 body shapes; no empty catches but 10+ log-only/uncaptured failure sites; wildcard CORS lacks Allow-Methods.

- index.ts:27-30 corsHeaders definition
- index.ts:170-172 OPTIONS null body default 200 no Allow-Methods
- index.ts:190-199 401 {error,details}
- index.ts:231-234 400 {error}
- _not checked_: The five imported _shared modules (contact-safety, tenant-context, retell-provider-contract, call-exposure-policy, campaign-contact-release) and their error handling; Runtime behavior - function was not executed; DB RPC contracts (claim_provider_dispatch, fina

### err-twilio-sms-webhook  [completed, confidence=high]
Webhook returns empty TwiML 200 on success AND on most failures; only 403 for bad signature; no JSON error bodies; ~20 swallowed failure sites; no .catch() handlers.

- index.ts:8-11 corsHeaders
- index.ts:351-360 EMPTY_TWIML + twimlResponse status=200
- index.ts:416-418 empty catch
- index.ts:423-427 TWILIO_AUTH_TOKEN fail-closed
- _not checked_: Sibling functions called here (disposition-router, sms-messaging, calendar-integration) - their own error shapes not read.; Callers of this webhook (Twilio config, dashboards) that may parse responses.; Runtime behavior / whether Supabase auto-delivers SUPABAS

### err-voice-broadcast-engine  [completed, confidence=high]
voice-broadcast-engine error handling: only one 500 {error} shape, some failures return 200, cert gate makes all branches dead

- index.ts:5-8 corsHeaders
- index.ts:641-643 OPTIONS 200 null body
- index.ts:636-638 certified hardcoded false
- index.ts:647-657 503 gate (always fires)
- _not checked_: _shared/manager-notify.ts (sendManagerNotification, imported L3, used L1408/L2002) error handling; Runtime execution - 503-always is a static claim only; Downstream consumers/webhooks (call-tracking-webhook, twilio-dtmf-handler, frontend) keying off status vs 

### quality-dup  [completed, confidence=high]
4 big components share primitives but not domain helpers; top dupes: loadPhoneNumbers, phone_numbers query 4x, testCalendarConnection, status maps, 52 toast blocks.

- src/components/VoiceBroadcastManager.tsx:14,18 imports use-toast + supabase (shared primitives reused)
- src/components/VoiceBroadcastManager.tsx:199-262 loadPhoneNumbers (direct phone_numbers table + twilio-integration edge fn)
- src/components/AgentEditDialog.tsx:263-298 loadPhoneNumbers (retell-phone-management edge fn) -- same name, different impl
- src/components/VoiceBroadcastManager.tsx:204-210 phone_numbers query with .eq('status','active').eq('is_spam',false)
- _not checked_: Repo-wide (all ~60+ component/hook files) counts for status-map, phone_numbers query, and destructive-toast duplication; only the 4 named files were measured.; Whether the divergent loadPhoneNumbers/testCalendarConnection implementations produce different runt

### quality-size  [completed, confidence=high]
22 files over 1500 lines measured; full list + top-5 split plans delivered; edge functions vs React components noted.

- Command: PowerShell Get-ChildItem -Recurse -Include *.ts,*.tsx over C:/Users/charl/dial-smart-system/src and /supabase/functions, sorted by Measure-Object -Line. Output top rows confirmed the 22 counts above (e.g. 'src\integrations\supabase\types.ts 9332', 'su
- supabase/functions/ai-brain/index.ts:15 LOCATION_MAP; :49 SYSTEM_KNOWLEDGE; :293 TOOLS array; :1456 async function executeToolCall; :4475 recordFeedback; :4593 PROMPT_SNIPPETS.
- supabase/functions/ai-assistant/index.ts:670 async function executeToolCall; :2858 fetchAnalytics; :2882 serve().
- supabase/functions/ai-autonomous-engine/index.ts:100 assessGoalProgress, :166 rescoreLeads, :312 analyzePacing, :543 executeApprovedActions, :839 makeDecisions, :1031 analyzeFunnel, :1141 predictNumberHealth, :1210 extractTranscriptIntents, :1339 optimizePlayb
- _not checked_: Did not read the full body of each over-1500 file end to end; only heads/imports and declaration greps.; Did not inspect internals of MissionBriefingWizard.tsx, CallSimulator.tsx, telnyx-ai-assistant/index.ts, twilio-sms-webhook/index.ts, workflow-executor/ind

### quality-tests  [completed, confidence=high]
101 test files; ~8:1 behaviour:render, 0 snapshots; biggest untested risk = ai-autonomous-engine (4954 lines) + skipped call-dispatcher/outbound-calling tests.

- src/hooks/__tests__/usePredictiveDialing.test.ts:75
- src/__tests__/edge-functions/disposition-router.test.ts:118
- supabase/functions/_shared/control-plane/observer-runtime.test.ts:279
- src/__tests__/edge-functions/call-dispatcher.integration.test.ts:19
- _not checked_: I did not run the test suites (no pass/fail counts, no line/statement coverage percentages).; I did not read all 101 test files line-by-line; classification of small files is by aggregate regex counts, not full review.; I did not verify whether skipped (descri

### quality-types  [completed, confidence=high]
654 files scanned; ': any'=1560, 'as any'=413, 'any[]/any>'=354, LooseClient=2, ts-ignore=0, as-unknown-as=41

- TOTAL_TS_TSX_FILES=654 (Get-ChildItem -Path src,supabase/functions -Recurse -File -Include *.ts,*.tsx)
- P1_colon_any=1560 [pattern ': any\b']
- P2_as_any=413 [pattern '\bas any\b']
- P3_any_generic=354 [pattern 'any\[\]|any>']
- _not checked_: Did not AST-parse; comment/string false positives in P1/P2/P3 not removed.; Did not scan non-ts files (.js, .jsx, .d.ts, .sql) - none were implied by src/supabase path except .d.ts generated types.; Did not verify tsconfig strict flags or run tsc to cross-chec

## Scale & performance  (scale)


### scale-a-calltracking  [completed, confidence=high]
useCallTracking.ts: 0 timers/subscriptions. No setInterval/setTimeout/poll/realtime; all work is caller-triggered one-shot Supabase queries. No cleanup surface.

- L1: `import { useState, useCallback } from 'react';` (no useEffect)
- L7-L17: CallHistoryEntry interface (no timer fields)
- L50: getLeadCallHistory = useCallback(async (leadId) => {...}, [organizationId])
- L54-L59: supabase.from('call_logs').select('*').eq('lead_id',leadId).eq('organization_id',organizationId).order('created_at',{ascending:false}) - one-shot query
- _not checked_: Callers/consumers of useCallTracking and useAIPipelineManager elsewhere in the repo (polling may live in the parent component, not this hook).; Supabase client config/global realtime defaults in @/integrations/supabase/client.; Whether OrganizationContext (use

### scale-a-components-2  [completed, confidence=high]
10 recurring setIntervals in 8/10 files, all cleared; 3 use Supabase; 2 files have none

- ProductionHealthDashboard.tsx:51-61 useEffect, :56 setInterval(30000), :60 clearInterval
- SystemHealthDashboard.tsx:92-98 useEffect, :96 setInterval(5*60*1000), :60 supabase.functions.invoke('system-health-monitor'), :97 clearInterval
- VoiceBroadcastManager.tsx:405-410 setInterval 3000 + clearInterval; :419-423 setInterval 5000 + clearInterval; :452 supabase.from('broadcast_queue')
- ai-configuration/ConfigurationProgress.tsx:82-88 setInterval 1000 + clearInterval :87
- _not checked_: Did not open hooks/useVoiceBroadcast.ts to cite the exact Supabase table/queries behind loadBroadcasts() called by the 3s interval.; Did not inventory setInterval in the other subdirs (call/, settings/, ui/) or files A-L, which belong to sibling nodes, not thi

### scale-a-grep-realtime  [completed, confidence=high]
11 files / 15 Supabase Realtime channels in src/; 8 mounted per-user, 3 (WorkflowHealthWidget, CoachPanel, BrowserPhone) have zero importers

- src/components/AiSmsConversations.tsx:481,483,511,533,536
- src/App.tsx:142 (ProtectedRoute)
- src/components/CampaignCallActivity.tsx:66,68,78,88,96,102
- src/components/CampaignManager.tsx:1821,2051,2058,2062
- _not checked_: Server-side realtime publication setup (whether tables are added to supabase_realtime publication) and RLS policies on the watched tables — not inspected.; Non-.ts/.tsx realtime usage (e.g. any inline HTML/JS in public/ or packs) beyond packs/door_to_door/app/

### scale-a-hooks  [completed, confidence=high]
19 setInterval found; 15 network (Supabase), 4 local; only useCampaignCompliance.ts:246 lacks effective cleanup.

- dial-smart-system/src/hooks/useCallDispatcher.ts:230 (setInterval), :139 (functions.invoke call-dispatcher), :20 (module ref), :240 (self clear), components/CallCenter.tsx:53 (consumer cleanup)
- dial-smart-system/src/hooks/useCallbacks.ts:176,177
- dial-smart-system/src/hooks/useCampaignCompliance.ts:246,261,318-321,362,366
- dial-smart-system/src/hooks/useCampaignOptimization.ts:39,48,292,296
- _not checked_: The default runtime value of useProactiveHealthMonitor's intervalMs prop (prop-provided, default not traced).; Whether useCampaignOptimization's analyzeCampaignHealth or other network intervals are wrapped by additional debounce/cooldown guards beyond what was

### scale-a-lib-pages  [completed, confidence=high]
One setInterval: src/lib/performance.ts:212, 30s, local perf.memory only (no Supabase), never cleared. Zero in src/pages.

- src/lib/performance.ts:212 `setInterval(() => {`
- src/lib/performance.ts:213-214 `trackMemoryUsage(); }, 30000);`
- src/lib/performance.ts:205 `export const initPerformanceMonitoring = () => {` (returns undefined, no cleanup)
- src/lib/performance.ts:185-200 `export const trackMemoryUsage = () => { ... }` (local perf.memory read + trackPerformance + console.warn)
- _not checked_: Did not search outside src/lib and src/pages (e.g. src/components, src/hooks, or the app entry) for other setIntervals.; Did not trace the call sites of initPerformanceMonitoring to confirm invocation count.

### scale-a-packs  [completed, confidence=high]
16 setInterval sites in the single packs JS file; 5 boot/perf/idle intervals never cleared, 11 cleared. Full file:line detail in complete_node artifact.

- C:/Users/charl/dial-smart-system/src/packs/door_to_door/app/scripts.js:30-32 (CONFIG heartbeatMs=20000, teamPollMs=10000, queueFlushMs=30000)
- scripts.js:322 async function api(...){ return window.__D2D_HOST.api(...); }
- scripts.js:423 DB.heartbeat -> api('POST','/heartbeat')
- scripts.js:425 DB.listPositions -> api('GET','/positions')
- _not checked_: Any setInterval inside HTML files under src/packs (e.g. index.prod.html inline scripts) - task scoped to JS under src/packs only.; Whether sw.js or other non-.js-named script assets under src/packs run intervals (none found as .js, but a differently-named serv

### scale-a-predictive  [completed, confidence=high]
usePredictiveDialing.ts has zero timers/polls/realtime subs and no useEffect; it is a pure CRUD hook. Real timers live in usePredictiveDialingAlgorithm.ts:290.

- FACT src/hooks/usePredictiveDialing.ts:2 — `import { useCallback, useState } from 'react';` — only useState/useCallback imported; no useEffect imported anywhere in the file, so no interval/timeout/subscription can exist.
- FACT src/hooks/usePredictiveDialing.ts:76-795 — the entire hook body is async CRUD functions; no timer constructor, no `.channel()`, no `.subscribe(` appears.
- FACT grep over whole file (regex `setInterval|setTimeout|\.channel\(|\.subscribe\(|useEffect|on\(|realtime|poll`) = 0 matches (agentgrep) and findstr for setInterval/setTimeout/subscribe/channel/useEffect/realtime/poll = 0 matches (independent second method).
- FACT src/hooks/usePredictiveDialing.ts:77 — `const [isLoading, setIsLoading] = useState(false);` — the only React state.
- _not checked_: Component-level polling: did not grep src/components or pages for setInterval that calls the functions returned by this hook.; The exact interval/cleanup of the useEffect at usePredictiveDialingAlgorithm.ts:290 (out of this node's file scope).; Whether the `ou

### scale-a-voicebroadcast  [completed, confidence=high]
useVoiceBroadcast.ts has zero timers/polls/realtime subs; pure data hook (no useEffect).

- line 1: `import { useState } from 'react';` - no useEffect, so no effect-scheduled timers
- line 87: `const { toast } = useToast();` - last state/hook setup before functions
- line 91: `supabase.auth.getUser()` inside loadBroadcasts (lines 89-107) - one-shot await, not scheduled
- line 275: `supabase.functions.invoke('voice-broadcast-tts', ...)` inside generateAudio - one-shot
- _not checked_: Callers/consumers of useVoiceBroadcast (any .tsx that imports it) - potential caller-side setInterval polling was NOT inspected.; The returned function names' side effects at the Supabase edge layer (voice-broadcast-tts, voice-broadcast-queue, voice-broadcast-

### scale-b-concurrency  [completed, confidence=medium]
Concurrency ceiling is non-atomic (count-then-claim), per-user, and differs live (100, 10x overshoot) vs main (10); browser manager gates nothing; 500 reps overshoot.

- supabase/functions-live/call-dispatcher/functions/call-dispatcher/index.ts:1232-1233 (live ceiling = floor(retellConcurrency/0.10))
- supabase/functions/call-dispatcher/index.ts:1292 (main ceiling = max(1,min(retellConcurrency,maxConcurrent)))
- supabase/functions/call-dispatcher/index.ts:1377-1382 (active-call count, user_id+organization_id, status IN initiated/ringing/in_progress/queued)
- supabase/functions/call-dispatcher/index.ts:1408-1425 (at_capacity -> HTTP 200, dispatched 0, rows left pending)
- _not checked_: Live production DB state (actual system_settings rows, whether the cron job is enabled, real call_logs volume) — repo-only review, no live access.; Retell/Assistable/Twilio vendor-side concurrency caps and whether the code's proxy column matches them.; api-gat

### scale-c-edge-timeout  [completed, confidence=medium]
Lane C done: 3 big fns quarantined (503). ai-autonomous-engine = HIGH timeout risk (multi-tenant 21-step chain, no batching); ai-brain LOW-MED; calendar LOW. Cold start = file size.

- supabase/functions/ai-autonomous-engine/index.ts:5551-5554 selects ALL autonomous_settings where enabled=true
- supabase/functions/ai-autonomous-engine/index.ts:5573 unbounded tenant fan-out loop
- supabase/functions/ai-autonomous-engine/index.ts:5110-5492 runForUser = 21 sequential steps
- supabase/functions/ai-autonomous-engine/index.ts:1244,1465,2342,3259,3716,3978 dynamic import('../_shared/openrouter.ts') = ~6 LLM calls per tenant
- _not checked_: Did not read every one of the ~110 edge functions for timeout risk, only the three named plus immediate callers and _shared heuristics.; Did not read all 5645/5027/3497 lines line-by-line; sampled entry points, loops and LLM calls via targeted grep.; Did not q

### scale-d-db-queue  [completed, confidence=high]
Lane (d): real queue, atomic SKIP LOCKED claim, layered provider idempotency. Gaps: reclaim cron disabled; callback insert can drop on unique violation.

- supabase/migrations/20260712020000_contact_safety_and_provider_idempotency.sql:639-665 (claim_pending_dispatches: UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING *)
- supabase/migrations/20260712020000_contact_safety_and_provider_idempotency.sql:667-692 (claim_pending_dispatches_now variant)
- supabase/migrations/20260712020000_contact_safety_and_provider_idempotency.sql:147,166-168,384-411 (provider_dispatch_claims logical_key UNIQUE + ON CONFLICT DO NOTHING + (queue_id,dispatch_generation) partial unique)
- supabase/migrations/20260712020000_contact_safety_and_provider_idempotency.sql:113,259-335 (provider_callback_receipts unique + claim_token/locked_until lease)
- _not checked_: Live DB state, pg_cron contents, and whether 20260712020000 / 20260713061000 are actually applied in project emonjusymdripmkvtttc.; Did not run tests/retell_reconciliation_contract.sql or any function *.test.ts, and no load test.; Did not review the retell-pro

### scale-e-vendors-spof  [completed, confidence=medium]
Retell is the sole dialing vendor, all vendor keys are global/shared, SMS carrier is sticky, 429 handling is inconsistent and the circuit breaker is unused.

- outbound-calling/index.ts:1811 (Retell POST /create-phone-call is the dial critical path)
- outbound-calling/index.ts:1860-1863 (maxRetries=1 -> create never retried)
- outbound-calling/index.ts:1843-1845,1864-1890 (5xx => AmbiguousProviderCreateError, quarantined)
- call-dispatcher/index.ts:1646-1671 (Telnyx outbound blocked: TELNYX_EGRESS_NOT_CERTIFIED)
- _not checked_: The live Supabase secret configuration (which keys are set, whether any are per-tenant).; assistable-make-call and telnyx-outbound-ai / telnyx-ai-assistant runtime reachability.; Actual vendor rate-limit thresholds and concurrency caps (no vendor API calls all

## Security & tenancy  (security::seed-3350d144)


### callers::phone-number-purchasing  [completed, confidence=high]
8 callers of phone-number-purchasing inventoried; gate is an unconditional pre-try 503 (index.ts:36-44); no bypass exists, all parallel purchase routes also hard-503.

- src/hooks/usePhoneNumberPurchasing.ts:21,30,41,90,94,103
- src/components/PhoneNumberPurchasing.tsx:99,124
- src/components/MissionBriefingWizard.tsx:1083,1091,1094,1099
- src/components/TelnyxAIManager.tsx:76,93,498
- _not checked_: Did not query the live Supabase project (emonjusymdripmkvtttc) to confirm the deployed function body, verify_jwt, or the actual 503 response - repo-only.; Did not verify UI reachability/conditional rendering of MissionBriefingWizard's Buy button or whether it 

### security::client-secrets  [completed, confidence=high]
src/ clean: no real vendor secrets; only the public Supabase anon key hardcoded at client.ts:6 and AutomationEngine.tsx:53 (public-safe).

- src/integrations/supabase/client.ts:6 - hardcoded Supabase anon/publishable key (JWT role=anon); secret present (public-safe)
- src/integrations/supabase/client.ts:5 - hardcoded Supabase project URL
- src/components/AutomationEngine.tsx:53 - same anon key hardcoded as 'apikey'; secret present (public-safe)
- src/components/AutomationEngine.tsx:49,52 - VITE_SUPABASE_URL + dynamic Bearer session token
- _not checked_: supabase/functions/ (110 edge functions) and supabase/migrations/ (199) - server-side, where real secrets live; git history / .git - previously committed secrets; dist/ minified bundles - built artifacts

### security::rls-coverage-tables  [completed, confidence=medium]
RLS coverage over dial-smart-system/supabase/migrations (199 .sql). Created=189 distinct; ENABLE RLS=194 distinct (189 repo-created + 5 external); tables created-but-never-enabled = 0; DISABLE RLS = 0; FORCE RLS = 4 (external_control_*).

- dir /b /s *.sql => 199 files (FACT)
- findstr /s /i /n /c:"create table" *.sql => 251 raw lines incl. comments/duplicates
- PowerShell set-diff: CREATED=191 (2 comment false-positives), ENABLED_DISTINCT=194, MISSING(real)=0, DISABLE_COUNT=0
- 20260712070000_multi_organization_routing_contract.sql:197-200 => ALTER TABLE public.{campaigns,leads,phone_numbers,call_logs} ENABLE ROW LEVEL SECURITY (tables not created in repo)
- _not checked_: CREATE POLICY coverage per table (enable != usable RLS); GRANT/REVOKE and role privileges; Live Supabase DB actual state (this is repo-only static analysis)

### security::rls-newest-migrations  [completed, confidence=medium]
Newest-era (10/29-11/03) migrations audited: RLS on all new tables, org-scoped permissive policies, DEFINDER-R helpers mostly gated; 3 findings

- phase1_org_scope.sql:93-109 enforce_organization_scope SECURITY DEFINER fail-open
- phase1_scope_guard_fix.sql:4-23 SECURITY INVOKER fix + REVOKE default_organization_for_user from authenticated
- phase1_org_scope.sql:82-85; sms_per_organization.sql:189-192; door_to_door_core.sql:190-193; door_to_door_workspace.sql:131-134 org-scoped permissive policies
- billing_lock.sql:206-214 RESTRICTIVE 'Billing lock' on 4 core tables only
- _not checked_: Live DB state: did not connect to Supabase to verify RLS enabled on leads/campaigns/call_logs/phone_numbers/dnc_list/dispositions/pipeline_boards/lead_pipeline_positions or the 4 SMS tables.; Definitions of user_in_organization(uuid), is_org_admin(uuid), is_pl

### security::rls-oldest-A-2024  [completed, confidence=high]
3 2024 tables: RLS on at creation, auth.uid() SELECT; two have permissive true service-role policies with no TO clause. No org column.

- 20240115_workflow_test_logs.sql:2 CREATE TABLE IF NOT EXISTS workflow_test_logs (unqualified schema)
- 20240115_workflow_test_logs.sql:23 ALTER TABLE workflow_test_logs ENABLE ROW LEVEL SECURITY
- 20240115_workflow_test_logs.sql:26-29 policy SELECT USING (auth.uid() = user_id)
- 20240115_workflow_test_logs.sql:31-34 policy INSERT WITH CHECK (auth.uid() = user_id)
- _not checked_: Whether later 2025/2026 migrations alter or drop these policies (e.g. org-scoping additions, TO service_role fixes); Actual live DB state vs these migration files; Grants/REVOKE statements affecting anon/authenticated on the base tables

### security::rls-oldest-B-nov03  [completed, confidence=high]
All 11 tables in these 8 migrations have RLS enabled; policies auth.uid()-based and org-blind; 2 permissive inserts later dropped; has_role SECURITY DEFINER reads user_roles.

- C:/Users/charl/dial-smart-system/supabase/migrations/20250619152448-97fb6549-a522-4654-a60c-9cd1f5ea5e81.sql:3,16,27,41,56,67 (CREATE TABLE) and :80,85,92,97,106,113 (ENABLE ROW LEVEL SECURITY)
- 20250619152448-...:81-82,86-89,93-94,98-103,107-110,114-115 (CREATE POLICY)
- 20251103034349_...:7,10,13,16-19,22-36 (phone_numbers), :42,52,55-57,60-62 (user_roles + jwt gate), :65-74 (has_role SECURITY DEFINER), :83-94 (system_health_logs admin gate), :98,110,113-127 (user_credentials)
- 20251103034801_...:6,19,22-36 (dispositions), :39,52,55-69 (pipeline_boards), :72,86,89-103 (lead_pipeline_positions)
- _not checked_: Later migrations that rewrite/absorb these tables' RLS (20260108_phase2_*, 20260713* lockdown migrations).; Live database state: whether RLS is actually enabled and policies match what these files declare (audited files only, not applied DB).; GRANT/EXECUTE pr

### security::rls-oldest-C-dialer-carrier  [completed, confidence=medium]
All 22 dialer/carrier tables enable RLS but are user-scoped/org-blind; predictive_dialing_stats INSERT permissive; dnc_list not org-wide.

- 20251109171900_concurrency_management.sql:20 (system_settings RLS), :23-25 (policy FOR ALL USING auth.uid()=user_id), :53/:56-58, :61-63 (WITH CHECK(true)), :82/:85-87
- 20251109172000_advanced_dialer_features.sql:17/:20-22, :45/:48-50 (dnc_list), :71/:74-76, :109/:112-119 (caller_id_pool), :140/:143-145
- 20251201000000_multi_carrier_integration.sql:25/:28-42 (phone_providers), :65/:67-81 (provider_numbers), :99/:101-103 (carrier_configs), :123/:125-136 (call_signatures, incl. service_role insert), :162/:164-166, :191/:193-200 (sms_messages), :225/:227-229
- 20251201051159_81f3b9b8-a855-40ad-b8ac-25f295546a9c.sql:74-77 (RLS all 4), :80-94 (sms_conversations), :97-107 (sms_messages), :110-116 (sms_context_history), :119-129 (ai_sms_settings), :4 (user_id no FK)
- _not checked_: Live database pg_policies / information_schema state (no DB access; audit is static only); All other migrations that CREATE/ALTER/DROP these same tables or policies after 20251201 (e.g. 20260713062000_dnc_tenant_uniqueness_contract.sql, 20260713073000_irrevers

### security::rls-oldest-D-dec04-07  [completed, confidence=medium]
16 Dec-2025 tables: all RLS-enabled; daily_reports has using(true) write policies; 15 tables auth.uid()-only; embeds live anon JWT.

- 20251204055913_240711f4...sql:35 ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;
- 20251204055913...sql:38-40 CREATE POLICY "Users can view their own reports" FOR SELECT USING (auth.uid() = user_id);
- 20251204055913...sql:42-44 CREATE POLICY "Service role can insert reports" FOR INSERT WITH CHECK (true);  <-- PERMISSIVE
- 20251204055913...sql:46-48 CREATE POLICY "Service role can update reports" FOR UPDATE USING (true);  <-- PERMISSIVE, no WITH CHECK
- _not checked_: Did not query the live database (research-only; no connection) - create-time RLS/policies stated from source only; later migrations may differ.; Did not enumerate policies created by OTHER migrations after Dec 2025 for campaign_automation_rules, ai_chatbot_set

### security::rls-oldest-E-dec08-12  [completed, confidence=high]
22 tables, all RLS-on, all auth.uid()=user_id; no org_id/org policies (user-scoped only); public broadcast-audio bucket allows any authed upload

- 20251208035156_fd3f07ec:67-70 ALTER TABLE ... ENABLE ROW LEVEL SECURITY (campaign_workflows, workflow_steps, lead_workflow_progress, disposition_auto_actions)
- 20251208035156_fd3f07ec:73 CREATE POLICY campaign_workflows FOR ALL USING (auth.uid()=user_id)
- 20251208035156_fd3f07ec:76-77 CREATE POLICY workflow_steps FOR ALL USING (EXISTS campaign_workflows user_id=auth.uid())
- 20251208035156_fd3f07ec:80 CREATE POLICY lead_workflow_progress FOR ALL USING (auth.uid()=user_id)
- _not checked_: Whether later migrations retrofit organization_id / org-scoped RLS onto any of these 22 tables (only the creation-time state was audited, per task scope); The actual live database policy state (no psql/Supabase access used); Other storage buckets and storage.o

### security::rls-oldest-F-dec13-30  [completed, confidence=high]
RLS audit done: 9 tables created, all RLS-on-at-creation, all policies auth.uid()-based, no USING(true); 8 tables flagged org-blind (per-user only).

- 20251220063500_ml_learning_system.sql:31 ENABLE RLS ml_learning_data; :33-35 SELECT USING auth.uid()=user_id; :37-39 INSERT WITH CHECK auth.uid()=user_id
- 20251220063500_ml_learning_system.sql:64 ENABLE RLS script_performance_analytics; :66-68 SELECT; :70-72 UPDATE USING; :74-76 INSERT WITH CHECK (all auth.uid())
- 20251220063500_ml_learning_system.sql:96 ENABLE RLS disposition_accuracy_tracking; :98-100 SELECT; :102-104 UPDATE; :106-108 INSERT (all auth.uid())
- 20251220063500_ml_learning_system.sql:132 ENABLE RLS system_optimization_insights; :134-136 SELECT; :138-140 UPDATE; :142-144 INSERT; :146-148 DELETE (all auth.uid())
- _not checked_: Post-creation migrations that may alter/loosen these policies or add org_id columns.; RLS/policy state of the pre-existing tables only ALTERed here (campaigns, calendar_availability, ai_sms_settings, campaign_workflows, voice_broadcasts, system_settings, call_

### security::rls-oldest-G-later-adds  [completed, confidence=high]
64/64 oldest tables RLS at creation; column is organization_id not org_id; 13/64 got org scoping later, 51/64 none.

- RLS-enable scan over all 199 *.sql: 64/64 targets matched; e.g. workflow_test_logs 20240115:23, dispositions 20251103034801:19, dnc_list 20251109172000:45, sms_messages 20251201000000:191 & 20251201051159:75, active_ai_transfers 20251230143304:25
- org column name FACT: 20260108_phase2_add_org_to_core_tables.sql:290-291 (dispositions ADD COLUMN organization_id), phase2_add_org_to_additional_tables.sql:20-21 dnc_list / :80-81 autonomous_settings / :105-106 agent_scripts / :140-141 calendar_integrations / 
- phase1 org on 4 tables: 20261029142121_phase1_org_scope.sql:8 dnc_list, :9 dispositions, :10 pipeline_boards, :11 lead_pipeline_positions ADD COLUMN IF NOT EXISTS organization_id
- phase1 company-member policies (DO-loop, tables at :65/:77/:114): dnc_list, dispositions, pipeline_boards, lead_pipeline_positions; CREATE at :82-85
- _not checked_: Live DB state (no information_schema query) — this is migration-file evidence only, not proof of what is deployed.; The full contents of 20261029010000_industry_packs.sql, 20261102234500_door_to_door_core.sql, 20261103023000_door_to_door_members.sql, and 20260

### security::rls-oldest-H-orgblind  [completed, confidence=high]
RLS inventory of 61 oldest migrations: 8 permissive USING(true)/CHECK(true), 3 public-read, ~85 org-blind, 1 deny-all table.

- 20241218_disposition_metrics.sql:69-70
- 20241218_edge_function_errors.sql:39-42
- 20250619152448-97fb6549-a522-4654-a60c-9cd1f5ea5e81.sql:88-89,107-108,110
- 20251109171900_concurrency_management.sql:61-63
- _not checked_: Whether 2026 migrations fully remediate every TIER-1/TIER-2 item (out of era scope).; Live database state and actual Supabase default privileges/grants.; Non-public schema objects and SECURITY DEFINER function predicates (separate node).

### security::rls-oldest-I-jan4-7  [completed, confidence=high]
All 11 pre-org-model Jan4-7 tables RLS-enabled in same file; no RLS-off table. Only finding: 2 permissive WITH CHECK(true) INSERT policies (system_alerts, calendar_tool_invocations).

- 20260104213053:2 CREATE TABLE public.system_alerts; :20 ENABLE RLS; :23 SELECT auth.uid()=user_id; :27 UPDATE auth.uid()=user_id; :31+33 INSERT WITH CHECK(true) [PERMISSIVE]
- 20260104213053:36 CREATE TABLE public.calendar_tool_invocations; :49 ENABLE RLS; :52 SELECT auth.uid()=user_id; :56+58 INSERT WITH CHECK(true) [PERMISSIVE]
- 20260105024224:12 learning_outcomes; :26 autonomous_goals; :45 lead_priority_scores; :63/:64/:65 ENABLE RLS; policies :68,:72,:76 (learning_outcomes SELECT/INSERT/UPDATE) auth.uid(); :81,:85,:89 (autonomous_goals) auth.uid(); :94,:98,:102,:106 (lead_priority_s
- 20260105203936:2 CREATE TABLE public.ghl_sync_settings; :19 ENABLE RLS; :22,:27,:32,:37 SELECT/INSERT/UPDATE/DELETE auth.uid()=user_id
- _not checked_: The nested snapshot copies under C:/Users/charl/Documents/Codex/.../work/*/supabase/migrations (8+ replicas) were not hashed/read; only the two top-level repos (dial-smart-system, dialer-ghl-buddy) were verified identical. If a divergent replica is actually de

### security::rls-oldest-J-disposition-metrics-accum  [completed, confidence=high]
2026 migration never drops the 2024 permissive disposition_metrics INSERT/UPDATE policies (both DROP names mismatched) -> anon/authenticated can still write arbitrary rows.

- 20241218_disposition_metrics.sql:4-40 CREATE TABLE public.disposition_metrics (2024 schema, FKs/NOT NULL/CHECK)
- 20241218_disposition_metrics.sql:52 ENABLE ROW LEVEL SECURITY
- 20241218_disposition_metrics.sql:54 comment 'Users can view their own disposition metrics' (name/comment mismatch trap)
- 20241218_disposition_metrics.sql:55-58 CREATE POLICY 'Users can view own disposition metrics' FOR SELECT USING(auth.uid()=user_id)
- _not checked_: Live database pg_policies rows, grants, and whether these migrations were actually applied in order (no DB access in this node).; Non-migration artifacts: supabase/functions*/**, and the duplicated repo copies under Documents/Codex/**/work/** plus dial-smart-s

### security::rls-oldest-L-grants-privileges  [completed, confidence=medium]
No GRANT/REVOKE on the 6 oldest tables in any migration; grants are Supabase defaults, so 3 residual USING(true) policies are anon-reachable via PostgREST.

- dial-smart-system/supabase/migrations/20241218_disposition_metrics.sql:61-70 (permissive INSERT WITH CHECK(true) + UPDATE USING(true), never dropped)
- dial-smart-system/supabase/migrations/20241218_edge_function_errors.sql:39-42 and :68 (permissive INSERT WITH CHECK(true); GRANT SELECT on view critical_errors_v)
- dial-smart-system/supabase/migrations/20251109171900_concurrency_management.sql:61-63 (permissive 'System can insert dialing stats' WITH CHECK(true), never dropped)
- dial-smart-system/supabase/migrations/20251201052229_3e1dc2ae-c0f8-4c77-9f92-87bdd90eaf24.sql:77-86 (adds own-row policies; does not drop the permissive one)
- _not checked_: Live database ACL (relacl / role_table_grants) - the 'anon/authenticated hold privileges' premise is inferred from Supabase defaults, not read from the DB.; graphql_public and other non-public PostgREST surfaces.; The four external_control_* tables that DO hav

### security::rls-oldest-O-kill-anon-jwt  [completed, confidence=high]
Live anon JWT in pg_cron migration: both jobs unscheduled + Vault-backed in 2026-07-13 migrations, but the anon key was never rotated and still sits in 4 version-controlled files.

- supabase/migrations/20251204062700_c7d0cc0d-ce0d-4041-992b-b13e6ed23207.sql:16-17
- supabase/migrations/20260703224351_unattended_safety_backstops.sql:215-216
- supabase/migrations/20260713050000_automation_scheduler_cron_auth.sql:20-22,42-61,74-79
- supabase/migrations/20260713061000_disable_uncertified_autonomous_engine_cron.sql:16-26
- _not checked_: Did not query the live production cron.job table or Supabase project to confirm the legacy jobs are gone and no other anon-JWT job remains.; Did not inspect the 8+ duplicate copies of this migration under Documents/Codex/2026-07-11/*/work/*/supabase/migrations

### security::rls-org-gating-sample  [completed, confidence=high]
Repo vs live diverge: live core tables are per-user OR same-company; SMS/dialing_queues have no org gate live; stricter org-only contracts are main-only.

- docs/wholesale/audit/phase1/LIVE-SCHEMA.md:1 (TRUTH capture 10/28)
- docs/wholesale/audit/phase1/LIVE-SCHEMA.md:21-33 (core+SMS per-user only)
- docs/wholesale/audit/phase1/LIVE-SCHEMA.md:34-40 (org tables org-gated)
- docs/wholesale/audit/phase1/LIVE-SCHEMA.md:43,57 (1-arg user_in_organization live)
- _not checked_: Live DB directly; migration-applied order (supabase_migrations.schema_migrations).; Tables outside the sampled list: dnc_suppressions, slack_users, coach_proposals, call_live_transcripts, campaign_leads / campaign_phone_pools live policies, provider_dispatch_c

### security::rls-permissive-policies  [completed, confidence=medium]
3 unsuperseded tenant-blind RLS policies (disposition_metrics, edge_function_errors, predictive_dialing_stats); 6 already remediated; live state unverified.

- 20241218_disposition_metrics.sql:55-70 (INSERT WITH CHECK (true) at :64, UPDATE USING (true) at :70)
- 20241218_edge_function_errors.sql:39-42 (WITH CHECK (true))
- 20251109171900_concurrency_management.sql:56-63 (System can insert dialing stats WITH CHECK (true) at :63)
- 20260107140730_63375bb5-d565-4a9a-8c3e-81f9aa99215f.sql:37-41 (recreate FOR ALL auth.uid()=user_id; does not drop legacy names)
- _not checked_: No live DB connection: live policy state for ops/monitoring tables (disposition_metrics, edge_function_errors, daily_reports, system_alerts, system_health_logs, predictive_dialing_stats) is unverified; LIVE-SCHEMA.md (2026-10-28) lists only core-table policies

### security::secdef-rls-bypass::g01  [completed, confidence=high]
Audited 7 migrations: 2 SECURITY DEFINER fns (has_role RPC-callable w/ no caller check; update_updated_at_column trigger-only); no GRANT EXECUTE anywhere.

- 20251103034349_d8aa891c-617a-4d2f-a0e1-5d250f6a27e1.sql:65 CREATE FUNCTION has_role; :67 SQL STABLE SECURITY DEFINER; :68 SET search_path=public; :71 SELECT 1 FROM user_roles; :89 policy USING public.has_role(auth.uid(),'admin')
- 20251103035736_ea6eef40-afad-486e-8d72-4811de5f289c.sql:22-31 has_role redefinition (SQL STABLE SECURITY DEFINER)
- 20251103035810_06a50f99-8093-48a7-bc14-dd73a00b2244.sql:7-16 has_role redefinition
- 20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:3-13 update_updated_at_column plpgsql RETURNS TRIGGER SECURITY DEFINER SET search_path=public
- _not checked_: Live DB ACL state (pg_proc.prosecdef / proacl); Other ~100 migrations that may redefine/revoke these functions or add GRANT EXECUTE; Table-level (pre-RLS) privileges to anon/authenticated on user_roles

### security::secdef-rls-bypass::g02  [completed, confidence=medium]
4 migrations audited; 11 fns. HIGH risk: file-A org helpers take caller user_uuid with no auth.uid() check and were never revoked. Later lockdowns harden the daily_calls/guardian fns.

- 20260108_phase2_organizations.sql:76-84 get_user_organizations DEFINER, reads organization_users:82, no auth.uid()
- 20260108_phase2_organizations.sql:87-98 user_in_organization(uuid,uuid) DEFINER, reads :94, no tenant check
- 20260108_phase2_organizations.sql:101-111 get_user_org_role(uuid,uuid) DEFINER, reads :106-109
- 20260108_phase2_organizations.sql:114-126 is_org_admin(uuid,uuid) DEFINER, reads :120-124
- _not checked_: Live production database grant/privilege state (only repo migration text read); Whether the later lockdown migrations were applied to prod; Exhaustive search of all ~hundreds of migrations for every other REVOKE/REDEFINE of these exact signatures (grep-based s

### security::secdef-rls-bypass::g03  [completed, confidence=high]
10 SECDEF funcs, 0 GRANT/REVOKE, no in-body tenant checks => cross-tenant RLS bypass; add_credits critical.

- 20260124_white_label_credits.sql:288
- 20260124_white_label_credits.sql:401
- 20260124_white_label_credits.sql:474
- 20260124_white_label_credits.sql:541
- _not checked_: Other migrations outside the two named files that may REVOKE EXECUTE on the same signatures.; Live Postgres catalog (pg_proc.proacl), owner, search_path pinning, PostgREST schema exposure.; Supabase anon/authenticated default EXECUTE grants in the actual proje

### security::secdef-rls-bypass::g04  [completed, confidence=high]
Audit done: 10 SECURITY DEFINER fns, no grants in-file, no tenant checks, later lockdown limits to service_role.

- file1 20260210143830 line 8 expire_old_actions(); SECURITY DEFINER L11; SET search_path L12; UPDATE ai_action_queue L17; org check NONE
- file1 L27 save_operational_memory(); SEC L36; sp L37; io ai_operational_memory L43/50/59; NONE
- file1 L68 recalculate_calling_windows(); SEC L71; sp L72; read call_logs L101; write optimal_calling_windows L77; NONE
- file1 L120 seed_default_playbook(); SEC L123; sp L124; read/write followup_playbook L129/134; NONE
- _not checked_: Live DB grant state / pg_proc.proacl (no DB access; grant conclusions are from repo migrations only); Full repo scan of ALL 100+ migrations for a later re-GRANT to authenticated/anon on these names (only the 20260701 lockdown was inspected); The edge functions

### security::secdef-rls-bypass::g05  [completed, confidence=medium]
5 migrations: no GRANT/REVOKE; 7 SECURITY DEFINER fns, none check auth.uid(), 5/7 lack search_path; views are owner-rights. All HIGH risk.

- 20260210_campaign_strategist.sql:268 CREATE OR REPLACE FUNCTION get_funnel_trend(p_user_id UUID, p_days INTEGER DEFAULT 14)
- 20260210_campaign_strategist.sql:284 SECURITY DEFINER
- 20260210_campaign_strategist.sql:285 SET search_path TO 'public'
- 20260210_campaign_strategist.sql:302-303 FROM funnel_snapshots fs WHERE fs.user_id = p_user_id
- _not checked_: Live pg_proc.proacl / prosecdef / proconfig for these functions - repo files only; deployed DB may differ (a later migration may have revoked EXECUTE or pinned search_path).; Later hardening migrations in the same repo (e.g. 20260701132102, 20260701132334, 202

### security::secdef-rls-bypass::g06  [completed, confidence=high]
Audited 5 migrations: lockdown flips 4 views to security_invoker; REVOKEs 36 fns from public/anon/authenticated (service_role re-granted) + 4 RLS helpers from anon.

- .../20260701132102_lock_down_privileged_rpcs_and_definer_views.sql:67
- .../20260701132102...:68
- .../20260701132102...:27-62
- .../20260701132102...:89-90
- _not checked_: organizations/organization_users definitions and whether api_keys.organization_id is enforced at query time; RLS policies on dialing_queues/organization_users (out of scope) constraining claim_pending_dispatches; whether security_invoker views' base tables hav

### security::secdef-rls-bypass::g07  [completed, confidence=high]
Audited 4 migrations, 14 SECURITY DEFINER fns: all service_role-only except one authenticated read-only check; 4 medium-risk no-tenant-check items flagged.

- f1:14 CREATE add_credits; f1:23 SECDEF; f1:109 REVOKE FROM PUBLIC,anon,authenticated; f1:110 GRANT service_role; f1:48 SELECT org_credits FOR UPDATE; f1:55 INSERT org_credits; f1:63 UPDATE org_credits; f1:92 dynamic INSERT credit_transactions; no auth.uid() in
- f2:21 run_safety_backstops; f2:24 SECDEF; f2:193 REVOKE; f2:194 GRANT service_role; f2:89 UPDATE dialing_queues; f2:160 UPDATE campaigns; f2:154 UPDATE budget_settings; f2:216 embedded anon-role JWT literal in cron definition
- f3:196 evaluate_contact_stop SECDEF f3:210, REVOKE f3:694 GRANT f3:704; f3:259 claim_provider_callback SECDEF f3:267 REVOKE f3:695 GRANT f3:705; f3:300 complete_provider_callback SECDEF f3:309 REVOKE f3:696 GRANT f3:706; f3:338 claim_provider_dispatch SECDEF f
- f4:75 claim_workflow_external_effect SECDEF f4:88 REVOKE f4:438-440 GRANT f4:447-449 (tenant check f4:114/f4:128); f4:163 transition_workflow_external_effect SECDEF f4:172 REVOKE f4:441-443 GRANT f4:450-452 (no tenant check); f4:221 resolve_workflow_external_e
- _not checked_: Other migrations in supabase/migrations (default PUBLIC EXECUTE on functions outside this set).; Live DB grant state / whether the 4 migrations are applied.; RLS enforcement effectiveness on the tables these SECDEF fns touch.

### security::secdef-rls-bypass::g08  [completed, confidence=high]
g08 audit: 16 SECDEF/granted functions across 3 migrations documented; key tenant-check gaps in sms_* funcs (no org check) and user_in_organization enumeration surface flagged

- 20260712040000_sms_delivery_safety.sql:8,11,14,72,73,170,181,190,191,200,235,264,274,275,285,299,308,317,318,338,353,354,355,356,357,359,360,361,362
- 20260712050000_provider_safe_unattended_backstops.sql:9,12,13,30,37,44,59,72,82,92,106,110,120,133,139,146,155,163,179,186,192,234,235,243,250,252,253,265,281,286,312,315
- 20260712070000_multi_organization_routing_contract.sql:1,179,182,183,184,186,194,195,347,348,349,351,352,354,355,366,384,386,418,421,422,430,432,444,462,465,466,480,481,499,502,503,517,519,537,540,541,550,552,688,691,692,696,721,723,731,738,739,764,775,794,820
- _not checked_: No live DB query; deployed privilege/RLS state may differ if later migrations GRANT/REVOKE/ALTER/DROP these functions.; Did not scan other migrations in the folder for later statements touching these 16 functions or the two tables.; Did not audit is_org_admin 

### security::secdef-rls-bypass::g09  [completed, confidence=medium]
21 SECDEF fns audited across 3 migrations: all EXECUTE service_role-only, no anon exposure; 4 file-A fns rely on prior-migration ACLs, 4 lack in-body org checks.

- 20260713043000:178,366,612,852,1066,1107,1160,1218,1355,1425,1490,1554,1652,1770,1860 = 15 SECDEF headers
- 20260713043000:1819-1852 and 1917-1920 = REVOKE/GRANT service_role covering 10 of 15; A:1218/1355/1554/1652 absent
- 20260712020000:697-699 REVOKE + :707-709 GRANT service_role for claim_provider_dispatch/finalize_provider_dispatch/record_physical_call_attempt
- 20260712050000:312-315 REVOKE/GRANT service_role for resolve_provider_dispatch_invoke_error
- _not checked_: Live DB ACL/ownership state (migration-file only; no pg_proc.proacl read); migrations later than 20260713060000; RLS policies on tables touched by SECDEF fns other than the 2 in-file policies (provider_callback_receipts, provider_call_attempts, system_alerts, 

### security::secdef-rls-bypass::g10  [completed, confidence=high]
8-migration security audit: 10 SECURITY DEFINER fns, 0 secdef views, 11 authenticated table grants (all RLS-guarded); gap = 2 trigger fns with no explicit REVOKE.

- SECURITY DEFINER set (grep confirmed exactly 10): 062000:72 repair_dnc_tenant_scope; 064000:69 dialing_queue_has_provider_evidence; 064000:107 dialing_queue_has_unresolved_lifecycle; 064000:170 protect_dialing_queue_provider_evidence; 064000:207 enqueue_dialin
- F1 public.repair_dnc_tenant_scope() 062000:65-166 | plpgsql VOLATILE | RETURNS TABLE(not trigger) | REVOKE ALL :168-169 role PUBLIC,anon,authenticated; GRANT EXECUTE :170 service_role; invoked :172 | reads/writes dnc_list(LOCK/UPDATE/INSERT/DELETE), organizati
- F2 public.dialing_queue_has_provider_evidence(uuid) 064000:63-99 | sql STABLE | RETURNS boolean(not trigger) | REVOKE ALL :403-404; GRANT EXECUTE :414 service_role | reads dialing_queues, provider_dispatch_claims, provider_call_attempts, call_logs; writes NONE
- F3 public.dialing_queue_has_unresolved_lifecycle(uuid) 064000:101-165 | sql STABLE | RETURNS boolean(not trigger) | REVOKE ALL :405-406; GRANT EXECUTE :416 service_role | reads dialing_queues, call_logs, provider_dispatch_claims, provider_callback_receipts, pr
- _not checked_: Bodies/definitions of helper functions used by policies and function bodies but defined in other migrations: public.user_in_organization(uuid,uuid), public.normalize_contact_phone(text), public.update_updated_at_column() - not verified SECURITY DEFINER/INVOKER

### security::secdef-rls-bypass::g12  [completed, confidence=medium]
8 secdef fns audited: 0 anon-callable, 2 authenticated read-only getters (auth.uid-bound), rest service_role-only; search_path pinned

- 20260713150000 line 206 SECURITY DEFINER evaluate_campaign_contact_release; line 321-323 REVOKE ALL FROM PUBLIC, anon, authenticated; line 324-326 GRANT EXECUTE TO service_role; membership join line 259-286
- 20260713160000 line 22 SECURITY DEFINER/STABLE get_campaign_contact_release_status; line 117-118 REVOKE ALL FROM PUBLIC, anon; line 119-120 GRANT EXECUTE TO authenticated, service_role; auth.uid() check line 31 and line 41
- 20260713170000 line 22 SECURITY DEFINER/STABLE get_campaign_contact_release_observer_status; line 119-121 REVOKE ALL FROM PUBLIC, anon, authenticated; line 122-124 GRANT EXECUTE TO service_role; membership EXISTS line 30-44
- 20260720120000 line 354 SECURITY DEFINER claim_elite_email_execution_release; line 489-490 REVOKE ALL FROM PUBLIC, anon, authenticated; line 491-492 GRANT TO service_role; identity binding line 375-383; stop check line 388-401
- _not checked_: RLS policies: tables get ENABLE ROW LEVEL SECURITY but these files define NO CREATE POLICY; default-deny relies solely on REVOKE + service_role. Did not inspect any policies defined elsewhere.; evaluate_contact_stop implementation and its tenant guarantees.; L

### security::secdef-rls-bypass::g13  [completed, confidence=high]
18 SECDEF functions audited; 2 low-severity caller-check gaps flagged, 1 fail-open trigger bug already fixed; most functions gate on membership correctly.

- 20261029010000_industry_packs.sql:9-38 (org_has_pack create + grants 33-35 + membership check :17)
- 20261029010000_industry_packs.sql:42-91 (set_org_packs + grants 86-88 + is_org_admin check :53)
- 20261029142121_phase1_org_scope.sql:18-30 (default_organization_for_user, no caller check, grants :28-30)
- 20261029142121_phase1_org_scope.sql:47-60 (set_organization_from_user trigger, grants :58-60)
- _not checked_: The bodies of user_in_organization(uuid), is_org_admin(uuid), is_platform_operator(), auth.role() semantics, merge_custom_fields(uuid,jsonb) — these are defined in OTHER migrations outside the 10-file scope; I assumed they check auth.uid() internally as the co

### security::secdef-rls-bypass::x01  [completed, confidence=medium]
ACL sweep of 199 migrations: 97 SECURITY DEFINER functions, 96 revoked/managed, 1 never revoked (get_user_organizations) => default PUBLIC EXECUTE.

- 20260108_phase2_organizations.sql:76-84 - get_user_organizations SECURITY DEFINER, no revoke anywhere
- 20260701132102_lock_down_privileged_rpcs_and_definer_views.sql:26-63 GROUP A sigs; :67 REVOKE FROM PUBLIC,anon,authenticated; :68 GRANT service_role; :80-84 GROUP B sigs; :89 REVOKE FROM PUBLIC,anon; :90 GRANT authenticated,service_role; :102-111 view security
- 20260701133759_canonicalize_add_credits_signature.sql:109
- 20260712020000_contact_safety_and_provider_idempotency.sql:694-702
- _not checked_: The live database pg_proc/proacl catalog - this is a static repo sweep; final ACL claims are inferred from migration text, not read from prod.; SECURITY DEFINER functions created outside supabase/migrations (direct MCP/psql on prod) - invisible here.; Table/co

### security::secdef-rls-bypass::x02  [completed, confidence=medium]
SECDEF/RLS audit done: 3 anon grants (token-gated), no default-privilege widening, ~6 residual definer funcs lacking REVOKE, all tables RLS-enabled. Confidence medium.

- 20260713074000_ghl_shadow_ingest_lane.sql:683,684-686 GRANT EXECUTE TO anon; :660-681 REVOKE ALL from PUBLIC,anon,authenticated,service_role on the shadow tables
- 20260713075000_ghl_shadow_reconciliation_export.sql:273-275 record_ghl_shadow_ingest_receipt TO anon
- 20251204062700_c7d0cc0d-ce0d-4041-992b-b13e6ed23207.sql:7 only ON ALL TABLES grant, TO postgres
- findstr: ALTER DEFAULT PRIVILEGES = 0 matches; GRANT EXECUTE = 90 lines, 3 with TO anon, 0 literal TO PUBLIC
- _not checked_: Actual live production ACLs (pg_proc.proacl / pg_class.relacl) - migration-source only, not the running DB; dashboard-applied SQL absent from repo is invisible here.; Core base tables created outside this folder (leads, campaigns, users, call_logs, user_roles,

### security::storage-pii  [completed, confidence=medium]
2 public buckets (broadcast-audio, marketing-assets); anon policies already dropped but public=true remains; ringba-enrich-proxy logs full lead PII + emails in URLs; PII logs pervasive.

- supabase/migrations/20251210010622_7901ac13-fe4a-4b52-8a45-1d3ed0a8a21c.sql:2-3
- supabase/migrations/20251211220758_74c0ca0f-3774-4fee-b5ef-12c9d4fd9176.sql:2-3,7-41
- supabase/migrations/20260402225758_ec719bb8-259f-4c41-9832-475862927a11.sql:1-19
- supabase/migrations/20260402225829_e17df753-8165-4d17-a790-ab5da6a1656e.sql:1-4
- _not checked_: Did not query the live Supabase project (emonjusymdripmkvtttc) for actual bucket objects, real policy state, or log retention - repo-only.; Did not enumerate all 350 PII-keyword console matches; sampled the highest-signal ones.; Did not audit src/packs/door_to

### security::webhook-auth  [completed, confidence=high]
All 4 webhooks verify signatures or are disabled; none accepts unsigned POST.

- twilio-sms-webhook/index.ts:422-439 verifyTwilioSignature: missing TWILIO_AUTH_TOKEN -> return false (424-427); missing x-twilio-signature -> false (429-432); HMAC-SHA1 over url+sorted(params) (387-401); constant-time compare (376-384). Enforced: index.ts:488-
- telnyx-webhook/index.ts:172-174 isTelnyxWebhookLifecycleCertified() returns false; index.ts:185-195 returns 503 disabled before body/env/DB access. Ed25519 verifier at 120-170 (returns false if !signature||!timestamp 126-129, or !webhookSecret 130-133). Caller
- retell-call-webhook/index.ts:522 verify mode default 'enforce'; 572-577 503 if not enforce; 578-583 503 if RETELL_WEBHOOK_SIGNING_KEY unset; 584-595 verify x-retell-signature then 401 on invalid; health_check path 528-567 requires service-role/user bearer. Ver
- stripe-webhook/index.ts:298-321: secret unset -> 500 (311-314); missing stripe-signature -> 400 (315-317); verifyStripeSignature -> 401 on invalid (318-321). Verifier _shared/stripe-signature.ts: HMAC-SHA256 of `${timestamp}.${payload}`, MAX_AGE 300s, future s
- _not checked_: Other webhook-ish edge functions: call-tracking-webhook, ghl-webhook-trigger, ghl-batch-callback, slack-webhook, retell-inbound-webhook, retell-force-webhook, twilio-amd-webhook, twilio-inbound-handler, inbound-transfer-webhook, elite-email-mailgun-events, dem

### sr::agent-config  [completed, confidence=high]
sr::agent-config done: all 11 agent/LLM/phone fns use service-role AND are hard-disabled (503); org verified server-side except 4 weak service-role/client-org paths, all gated off.

- retell-agent-management/index.ts:44-71
- retell-llm-management/index.ts:22-49
- retell-phone-management/index.ts:28-71
- retell-business-verification/index.ts:34-71
- _not checked_: Did not trace downstream RPCs (telnyx-outbound-ai:249/271 p_organization_id, outbound-calling) to confirm they re-validate org.; Did not audit the many other functions outside the 11 named.; Did not confirm whether 503 gates are edge-config enforced vs in-code

### sr::ai-internal  [completed, confidence=high]
9 AI engines audited: 8/9 service-role + hard-disabled (return false->503); only ai-sms-processor live; 2 config files have no auth.

- ai-assistant/index.ts:2935 | service-role Y | disabled Y | VERIFIED | gate isAiAssistantToolSurfaceTenantCertified()@2878 return false, 503@2898; getUser@2943; org via authorizeOrganizationContext@2956 (_shared/tenant-context.ts:72-77 checks organization_users
- ai-autonomous-engine/index.ts:5545 | service-role Y | disabled Y | SERVICE-ONLY-TRUST | gate isAutonomousEngineTenantCertified()@5498 false, 503@5518; only token===supabaseKey accepted @5538 (no user JWT)
- ai-brain/index.ts:4688 | service-role Y | disabled Y | VERIFIED | gate isAiBrainTenantCertified()@10 false, 503@4662; getUser@4702; internal branch trusts body userId ONLY when internal:true && token===supabaseKey @4695
- ai-sms-processor/index.ts:159 | service-role Y | disabled N | VERIFIED | no gate; getUser@174; internal path token===serviceRoleKey@167; org derived from organization_users membership via loadMemberOrgIds@57 -> resolveOrganizationId@198 (explicit request.organ
- _not checked_: Deep bodies of ai-brain tool execution and ai-assistant executeToolCall: whether every tool call is org-bound after the gate is removed; Whether the frontend actually passes service keys to the internal branches of ai-brain/ai-sms-processor/ai-assistant; Other

### sr::billing-credit::billing-portal  [completed, confidence=high]
billing-portal/index.ts: service-role YES (L96/116), disabled NO, caller VERIFIED via JWT+membership (L102,118-124)

- supabase/functions/billing-portal/index.ts:96 requireEnvVars includes SUPABASE_SERVICE_ROLE_KEY
- supabase/functions/billing-portal/index.ts:116 createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
- supabase/functions/billing-portal/index.ts:101-102 anonClient + authenticateUser(req, anonClient)
- supabase/functions/billing-portal/index.ts:104,109 organization_id read from request body
- _not checked_: _shared/tenant-context.ts requireExplicitOrganizationId body (only signature/behavior inferred); stripe-webhook handle for metadata.organization_id resolution; deploy config (config.toml / verify_jwt) for this function

### sr::billing-credit::budget-tracker  [completed, confidence=high]
budget-tracker: service-role YES, disabled YES (stub-false -> 503), caller VERIFIED via JWT (user.id), user-scoped not org-scoped

- C:/Users/charl/dial-smart-system/supabase/functions/budget-tracker/index.ts:47 — Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
- index.ts:56 — createClient(supabaseUrl, supabaseServiceKey)
- index.ts:21-23 — isProviderBudgetTrackingTenantCertified() returns false
- index.ts:33-43 — if (!certified) return new Response(..., { status: 503 })
- _not checked_: Runtime/interpreter behavior of supabase.auth.getUser with a service-role client (theoretically valid; not executed).; RLS policies on budget_settings, spending_summaries, budget_alerts, user_credentials, campaigns tables (outside this file).; Whether any clie

### sr::billing-credit::credit-management  [completed, confidence=high]
credit-management/index.ts: service-role client, no 503 (403/500 only), caller-org VERIFIED (membership-scoped, cannot spoof).

- supabase/functions/credit-management/index.ts:101 (SUPABASE_SERVICE_ROLE_KEY read)
- supabase/functions/credit-management/index.ts:107 (createClient service-role)
- supabase/functions/credit-management/index.ts:111 (isServiceRole = token === supabaseServiceKey)
- supabase/functions/credit-management/index.ts:116,123 (userId from auth.getUser)
- _not checked_: The Postgres RPC bodies (reserve_credits/add_credits/finalize_call_cost/check_credit_balance) and whether they re-validate org authorization internally.; organization_users table RLS and whether a browser JWT could read/modify membership rows to alter the memb

### sr::billing-credit::gate::config-verify-jwt  [completed, confidence=high]
verify_jwt resolved for all 7 functions; anon key defeats it, so it is not an authz gate. ringba verdict holds; 503 gates are the only real spend control.

- supabase/config.toml:245 [functions.stripe-webhook] verify_jwt = false
- supabase/config.toml:286 [functions.retell-cost-backfill] verify_jwt = true
- supabase/config.toml:299 [functions.budget-tracker] verify_jwt = true
- supabase/config.toml:135 [functions.phone-number-purchasing] verify_jwt = true
- _not checked_: Whether the DEPLOYED function verify_jwt values on project emonjusymdripmkvtttc actually match config.toml (config.toml governs CLI deploys; a manual dashboard deploy could differ). Not verified against the live platform.; credit-management in-function auth be

### sr::billing-credit::phone-number-purchasing  [completed, confidence=high]
phone-number-purchasing: service-role client, 503-disabled (dead code below gate), caller identity = JWT user.id (VERIFIED, no cross-org charge).

- supabase/functions/phone-number-purchasing/index.ts:48 - Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
- supabase/functions/phone-number-purchasing/index.ts:57 - createClient(supabaseUrl, serviceRoleKey)
- supabase/functions/phone-number-purchasing/index.ts:36-44 - unconditional return, disabled:true (l.38), 503 (l.42)
- supabase/functions/phone-number-purchasing/index.ts:59-68 - Authorization header + auth.getUser(token) (l.65), 401 if !user
- _not checked_: RLS policies and schema for number_orders / phone_numbers (whether a user could read/write other tenants via DB layer).; The caller UI / API wrapper that invokes this function (rate limits, credit pre-check).; Whether any OTHER function or route (e.g. a number

### sr::billing-credit::retell-cost-backfill  [completed, confidence=high]
retell-cost-backfill: service-role YES, hardcoded disabled (503) YES, caller-verified NO (presence-only bearer). Intent service-only, impl unverified-client.

- supabase/functions/retell-cost-backfill/index.ts:8-10 hardcoded `return false`
- supabase/functions/retell-cost-backfill/index.ts:20-29 disable gate returns 503
- supabase/functions/retell-cost-backfill/index.ts:33-34 presence-only Authorization check
- supabase/functions/retell-cost-backfill/index.ts:37 SUPABASE_SERVICE_ROLE_KEY env
- _not checked_: Supabase platform edge-function config (supabase/config.toml verify_jwt) that could add auth outside index.ts; Whether call_logs has tenant columns/RLS (irrelevant to the service key, which bypasses RLS); Whether any cron or dashboard currently invokes this ro

### sr::billing-credit::ringba-enrich-proxy  [completed, confidence=high]
ringba-enrich-proxy: service-role=YES, disabled=NO (no 503), caller-verified=NO (unverified client). Dead-but-enabled.

- supabase/functions/ringba-enrich-proxy/index.ts:84 - const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
- supabase/functions/ringba-enrich-proxy/index.ts:85 - const supabase = createClient(supabaseUrl, serviceKey);
- supabase/functions/ringba-enrich-proxy/index.ts:89-94 - service-role read: supabase.from('leads').select('first_name,last_name,email,address,city,state,zip_code,phone_number,custom_fields').in('phone_number', variants)
- supabase/functions/ringba-enrich-proxy/index.ts:18 - 'apikey' listed only in CORS Access-Control-Allow-Headers (not verification)
- _not checked_: Did not query live Supabase to confirm the function is currently deployed/active (research-only, no live calls).; Did not inspect `leads` RLS policies to confirm the service-role client bypasses row security.; Did not enumerate every caller (Retell tool config

### sr::billing-credit::stripe-webhook  [completed, confidence=high]
stripe-webhook: signature verified (line 318) before service-role client (334) and all DB writes; no 503 disable gate.

- supabase/functions/stripe-webhook/index.ts:48 imports { verifyStripeSignature } from ../_shared/stripe-signature.ts
- index.ts:307 const body = await req.text(); and :308 const signature = req.headers.get('stripe-signature')
- index.ts:311-314 if (!STRIPE_WEBHOOK_SECRET) return jsonResponse({error:'Webhook not configured'}, 500)
- index.ts:315-317 if (!signature) return jsonResponse({error:'Missing signature'}, 400)
- _not checked_: supabase/config.toml verify_jwt setting for this function (only the header comment asserts it).; Other webhook files (e.g. functions-live/stripe-webhook/index.ts) referenced in the header as the prior byte-exact source.; The add_credits RPC definition and stri

### sr::coach-pipeline  [completed, confidence=high]
6-function service-role auth audit complete; 3 live/VERIFIED, 3 503-gated; coach orgs server-derived

- coach-suggest/index.ts:82,88,95,115-123,127-135
- coach-decide/index.ts:76,82,89,104-112,114-122,130-137
- pipeline-management/index.ts:10-12,19-24,28,34,43,54-65
- analyze-call-transcript/index.ts:144-146,156-166,170,180,197-216
- _not checked_: supabase/functions-live/disposition-router/index.ts and other functions-live/* variants; deployment state (which source tree is live); RLS policies on call_logs/coach_proposals/organization_users/dialing_queues

### sr::crm-ghl  [completed, confidence=high]
8-function service-role auth audit done: 6 gated (4 dead-code behind 503), 2 ungated+unverified (update-lead-info, bulk-lead-import) = HIGH RISK client-trusted identity.

- ghl-integration/index.ts:75-85 gate 503; :89/:94 service role; :102 auth.getUser; :127-131 authorizeOrganizationContext
- ghl-batch-callback/index.ts:9-11 gate func; :298-308 gate 503; :312/:318 service role; :321-327 header-presence only; :330 body user_id
- ghl-webhook-trigger/index.ts:88-96 unconditional 503; :100/:106 service role; :149-153 webhook_key lookup
- ghl-shadow-ingest/index.ts:46-47/:63 anon/publishable client; :23-42/:136-146 fail-closed 503; ghl-shadow-ingest/handler.ts:228-246 ed25519 signature required
- _not checked_: Deployed/live function config vs repo (repo-only read).; Other callers' auth paths and whether call-tracking-webhook re-verifies.; Whether Supabase platform default verify_jwt is actually true on the deployed project for the two unlisted functions.

### sr::dialing::call-dispatcher  [completed, confidence=high]
call-dispatcher: service-role yes, disabled yes, caller-verified VERIFIED (JWT + server-side org authorize)

- index.ts:261 const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
- index.ts:270 const supabase = createClient(supabaseUrl, supabaseKey);
- index.ts:19 function isCallbackAutomationCertified(): boolean {
- index.ts:20 return false;
- _not checked_: ../_shared/tenant-context.ts internals (authorizeOrganizationContext / assertTenantResourceOwnership); ../_shared/alerting.ts and provider-router.ts; Whether other edge functions or the scheduler call this function with the service-role key and whether that wi

### sr::dialing::demo-call  [completed, confidence=high]
demo-call: service role YES, no isXCertified gate, caller UNVERIFIED-CLIENT-ORG

- index.ts:229 const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
- index.ts:234 const supabase = createClient(supabaseUrl, supabaseServiceKey);
- index.ts:231 503 'Demo calling is not configured.' (env-missing gate, not isXCertified)
- index.ts:302-306 503 error_code 'DEMO_AGENT_CONFIG_INVALID' (config gate)
- _not checked_: Whether the front-end generates sessionId in a way that binds it to the caller (no proof of ownership check server-side); Whether Supabase gateway/JWT verification is enforced before the function executes (Deno.serve has no verify_jwt config visible in this fi

### sr::dialing::gap-deployed-revision  [completed, confidence=medium]
Working tree dirty but the 11 audited functions are clean == HEAD 617094a0; gates born false 2026-07-13, never toggled; no deploy pipeline, deployed-state UNVERIFIED.

- git rev-parse HEAD -> 617094a042e743670d3558141e4e399b97b04c90; HEAD->main, origin/main
- git status --porcelain -> 6 modified + many untracked; ' M supabase/functions/mcp/index.ts'; '?? docs/_swarm/*.md'; '?? .deployed-*.ts'
- git status --porcelain -- <11 audited function paths> -> EMPTY
- supabase/functions/call-dispatcher/index.ts:15-25 -> isForceDispatchCertified/isCallbackAutomationCertified/isAutomaticRetellNumberSyncCertified all 'return false'
- _not checked_: No live check of Supabase or Lovable, so the actual deployed revision cannot be pinned (repo has no marker).; Did not run git log -L on all 108 gates across 51 functions - only the 3 call-dispatcher gates plus global -S/-G.; Did not resolve why 6d8c7989 also m

### sr::dialing::gap-rls-backstop  [completed, confidence=-]
RLS is enabled on all 11 tables and IS enforced on the browser path (anon+JWT); only edge functions bypass it. Triggers/constraints are the real cross-tenant backstop.

### sr::dialing::gap-sibling-dialing-functions  [completed, confidence=high]
41 sibling dialing funcs audited: 8 reachable, 33 hard-disabled; 11 core nodes excluded.

- C:/Users/charl/dial-smart-system/supabase/functions/ (124 dirs, from `dir /b`)
- twilio-voice-twiml/index.ts:79 (SR), :65 (sig), :104/:124-132 (org membership)
- twilio-voice-status/index.ts:41 (SR), :35 (sig)
- twilio-voice-transcription/index.ts:52 (SR), :36 (sig)
- _not checked_: LIVE/deployed state: I audited the repo working tree only. I did not diff deployed Supabase revisions or read deployed secrets, so I cannot confirm what is actually running (e.g. whether RETELL_RECONCILER_ENABLED or RETELL_WEBHOOK_VERIFY_MODE are set live, or 

### sr::dialing::outbound-calling  [completed, confidence=high]
outbound-calling: service-role yes (204/214), disabled yes (64-70 + 503 @295-305), caller VERIFIED (auth.getUser @240, org membership @288-290)

- C:/Users/charl/dial-smart-system/supabase/functions/outbound-calling/index.ts:204 = "const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');"
- C:/Users/charl/dial-smart-system/supabase/functions/outbound-calling/index.ts:214 = "const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);"
- C:/Users/charl/dial-smart-system/supabase/functions/outbound-calling/index.ts:220 = "const isServiceRoleCall = token === serviceRoleKey;"
- C:/Users/charl/dial-smart-system/supabase/functions/outbound-calling/index.ts:64-66 = "function isScriptExperimentCertified(): boolean { return false; }"
- _not checked_: Did not trace call-dispatcher (call-dispatcher/index.ts:319) to confirm the service-role caller passes a consistent org_id.; Did not verify the Supabase secret is actually set in the deployed project (read-only source audit only).; Did not audit the other ~110

### sr::dialing::predictive-dialing-engine  [completed, confidence=high]
pred-dialing-engine: service-role YES, disabled YES (503), caller-verified VERIFIED via JWT + user_id scoping.

- predictive-dialing-engine/index.ts:33 const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
- predictive-dialing-engine/index.ts:42 const supabase = createClient(supabaseUrl, supabaseKey);
- predictive-dialing-engine/index.ts:15-17 function isPredictiveDialingTenantCertified(): boolean { return false; }
- predictive-dialing-engine/index.ts:24-28 if (!isPredictiveDialingTenantCertified()) { ... status: 503 ... error_code: 'PREDICTIVE_DIALING_NOT_TENANT_CERTIFIED'
- _not checked_: Whether RLS policies exist on campaigns/dialing_queues/campaign_leads in the DB (if they do, service-role bypass is moot but defense-in-depth is reduced).; Other Edge Functions in the same repo for the same disable-gate / service-role pattern (out of this node

### sr::dialing::voice-broadcast-engine  [completed, confidence=high]
voice-broadcast-engine: service-role yes (666/680), hard-disabled 503 (637/647), caller VERIFIED via getUser+user.id (1030/1045); process_active is service-only.

- index.ts:666
- index.ts:680
- index.ts:636-637
- index.ts:647-656
- _not checked_: supabase/config.toml verify_jwt / JWT settings for this function; RLS policies on voice_broadcasts, broadcast_queue, dnc lists; the 'canonical provider boundary' / contact-safety / billing modules referenced in comments

### sr::dialing::voice-broadcast-queue  [completed, confidence=high]
voice-broadcast-queue: uses service-role, hard-disabled (503), caller auth VERIFIED server-side (user_id from bearer token).

- index.ts:32 const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
- index.ts:38 const supabase = createClient(supabaseUrl, supabaseKey);
- index.ts:9-11 function isVoiceBroadcastQueueTenantCertified(): boolean { return false; }
- index.ts:18-23 gate -> status 503, disabled:true, error_code VOICE_BROADCAST_QUEUE_NOT_TENANT_CERTIFIED
- _not checked_: Did not sweep sibling edge functions for the same disabled-gate pattern.; Did not verify Supabase RLS policies on voice_broadcasts/broadcast_queue/leads/dnc_list.; Did not check for stale callers still invoking this 503 endpoint.

### sr::dialing::voice-broadcast-tts  [completed, confidence=high]
voice-broadcast-tts: uses-service-role, disabled(503 gate L20), caller-verified VERIFIED (auth.getUser L54, org derived server-side L74)

- C:/Users/charl/dial-smart-system/supabase/functions/voice-broadcast-tts/index.ts:39 const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
- C:/Users/charl/dial-smart-system/supabase/functions/voice-broadcast-tts/index.ts:50 const supabase = createClient(supabaseUrl, supabaseKey)
- C:/Users/charl/dial-smart-system/supabase/functions/voice-broadcast-tts/index.ts:9-11 function isVoiceBroadcastTtsSpendCertified(): boolean { return false; }
- C:/Users/charl/dial-smart-system/supabase/functions/voice-broadcast-tts/index.ts:20-29 if (!isVoiceBroadcastTtsSpendCertified()) { ... status: 503, error_code: 'VOICE_BROADCAST_TTS_SPEND_NOT_CERTIFIED' }
- _not checked_: DB schema/RLS on voice_broadcasts and broadcast-audio bucket; Sibling edge functions for the same disable pattern; git history / when the gate was introduced

### sr::dialing::voice-call  [completed, confidence=high]
voice-call: service-role YES, no disable gate, caller org VERIFIED server-side

- C:/Users/charl/dial-smart-system/supabase/functions/voice-call/index.ts:53 `const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');`
- voice-call/index.ts:56 `const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);`
- voice-call/index.ts:57-58 token from Authorization Bearer; `await supabaseAdmin.auth.getUser(token)` -> 401 if invalid (:59-66)
- voice-call/index.ts:83 `organizationId = await authorizeOrganizationContext(supabaseAdmin, user.id, body?.organization_id);` -> 403 ORG_FORBIDDEN on failure (:84-86)
- _not checked_: Sibling dialing edge functions (twiml, register-provider-call) for the same trust pattern; RLS policies backing organization_users / organization_id scoping; Whether getUser(token) with a service-role client behaves identically to an anon-key client for token 

### sr::dialing::voice-call-action  [completed, confidence=high]
voice-call-action: uses-service-role YES (L55/58); disable gate ABSENT; caller VERIFIED (L51/60/86/93-98).

- C:/Users/charl/dial-smart-system/supabase/functions/voice-call-action/index.ts:55 - const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
- C:/Users/charl/dial-smart-system/supabase/functions/voice-call-action/index.ts:58 - const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)
- C:/Users/charl/dial-smart-system/supabase/functions/voice-call-action/index.ts:51-52 - const authHeader = req.headers.get('Authorization'); if (!authHeader) return fail('UNAUTHENTICATED',...,401)
- C:/Users/charl/dial-smart-system/supabase/functions/voice-call-action/index.ts:60 - const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
- _not checked_: _shared/voice-provider.ts internals (getProvider/isVoiceAction/providerCallIdColumn; whether provider.action does any client-org trust); _shared/utils.ts corsHeaders and whether anon client body org fields are consumed elsewhere in the call path; Whether organ

### sr::dialing::voice-call-events  [completed, confidence=high]
voice-call-events: service-role yes; 503 gate only on missing secret (no isXCertified); Ed25519-signed caller, org from DB row.

- L229: const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
- L231: const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
- L217-220: if (!publicKey) { console.error(...); return json({ error: 'Telnyx webhook signature verification is not configured' }, 503); }
- L221-225: const valid = await verifyTelnyxSignature(...); if (!valid) { ... return json({ error: 'Invalid webhook signature' }, 401); }
- _not checked_: the _shared/voice-provider.ts getProvider('telnyx').parseWebhookBody behavior and whether it validates the 'to' field against the row's own phone_number (spoof risk beyond signature); whether call_logs RLS or a DB-level constraint additionally scopes writes; d

### sr::dialing::voice-token  [completed, confidence=high]
voice-token: service role YES :41, disable gate NO (0 isXCertified hits), caller VERIFIED via getUser + server-side org membership; client org_id is validated, not trusted.

- C:/Users/charl/dial-smart-system/supabase/functions/voice-token/index.ts:38 : const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
- C:/Users/charl/dial-smart-system/supabase/functions/voice-token/index.ts:41 : const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
- C:/Users/charl/dial-smart-system/supabase/functions/voice-token/index.ts:43 : const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
- C:/Users/charl/dial-smart-system/supabase/functions/voice-token/index.ts:32-35 : authHeader required else 401 UNAUTHENTICATED
- _not checked_: voice-provider.ts getProvider/mintToken body (twilio.ts/telnyx mint paths).; Whether 'isVoiceProvider' correctly rejects all non-allowlisted providers.; Other supabase/functions/* for a global 503 disable gate.

### sr::email-demo-misc  [completed, confidence=high]
16 edge functions audited: 13 use service role, 8 have hardcoded 503 gates, 4 elite-email + api-gateway VERIFIED; 3 live anon endpoints UNVERIFIED-CLIENT-ORG.

- supabase/functions/email-sender/index.ts:9 isEmailEgressTenantCertified returns false; :21-31 503 gate
- supabase/functions/elevenlabs-tts/index.ts:15 return false; :25-35 503
- supabase/functions/system-health-monitor/index.ts:11 return false; :124-134 503; :29/:138 service key
- supabase/functions/campaign-health-monitor/index.ts:28 return false; :36-41 503; :44-45 service key; :54 getUser; :84 trusts body userId
- _not checked_: I did not run the DB RPCs (prepare_elite_email_execution_release, register_elite_email_execution_release, record_elite_email_mailgun_event_receipt) to confirm server-side org enforcement.; I did not inspect api-gateway's full 1200-line route table for per-rout

### sr::observers-integrations  [completed, confidence=high]
9 observers/integrations: all use service role; 7 hard-locked 503; scheduler=service-only-trust; no client org_id trust.

- slack-webhook/index.ts:24 const SLACK_OBSERVER_LAUNCH_CERTIFIED=false; :28+:42 service role + createClient; :51-52 gate; handler.ts:77-87 disabled 503.
- teams-observer/index.ts:24 const false; :29+:43 service role; :52-53 gate; handler.ts:65-73 disabled 503.
- zapier-observer/index.ts:23 const false; :27+:41 service role; :50-51 gate; handler.ts:119-128 disabled 503.
- mcp-observer/index.ts:23 const false; :27+:41 service role; :50-51 gate; handler.ts:32-33 disabled 503.
- _not checked_: Full observer handler credential-resolution internals (signing-secret/Zapier/MCP key/Teams JWK checks) not line-audited; _shared/control-plane/observer-runtime.ts not inspected; Platform-level verify_jwt config for these functions not checked

### sr::spam-inventory  [completed, confidence=high]
10/10 spam/inventory/provider fns are service-role and disabled; only enhanced-spam-lookup verifies JWT+derives org; 4 have no caller auth at all.

- enhanced-spam-lookup/index.ts:24-26 (isEnhancedSpamProviderSurfaceCertified returns false)
- enhanced-spam-lookup/index.ts:33-38 (503 gate)
- enhanced-spam-lookup/index.ts:42,48 (service role)
- enhanced-spam-lookup/index.ts:67-75 (getUser + authorizeOrganizationContext)
- _not checked_: The deep helper bodies beyond the entry handlers (e.g. enhanced-spam-lookup syncNumbersFromTelnyx/checkAllNumbers, provider-management switch cases beyond list/add, rotation-manager remaining actions, telnyx-webhook write paths past L300) - only the gate + aut

### sr::telephony-webhooks  [completed, confidence=high]
12 webhook SR audit done: active functions all signature-gated; 4 legacy handlers safe-by-disable with latent service-role risk

- retell-call-webhook/index.ts:42,504 (SR); :572,578,584-595 (sig enforce)
- config.toml:274-275 retell-call-webhook verify_jwt=false
- retell-inbound-webhook/index.ts:43-51 (disabled 503), :55 (SR unreachable) ; config.toml:288-289
- retell-force-webhook/index.ts:9-11,20-30 (disabled), :35,47 (SR), :41-53,70-81 (user JWT+ownership) ; config.toml:177 verify_jwt=true
- _not checked_: Did not execute functions or live-probe the deployed Supabase URL; hardening flags read from source only.; Did not read retell-call-webhook lines 120-499 and 680-2952 (post-signature side effects) exhaustively; a deep forged-metadata path was not fully traced.

## UX & UI  (ux)


### ux-a11y  [completed, confidence=medium]
A11y measured: ~80% of interactive elements labeled; 34+ icon-only buttons unlabeled, 62% of inputs lack a name source; dialogs are shadcn-Radix consistent.

- docs/dial-smart-app-map.md:159-175 section 8 review contract
- src/components/ui/dialog.tsx:1-52 stock shadcn Radix Dialog; :47 sr-only Close
- src/components/ai-configuration/ConfigurationStepRenderer.tsx:55 raw modal div
- src/pages/LandingPage.tsx:160-162 fixed inset-0 decorative pointer-events-none
- _not checked_: Checkbox/Select/Switch/Combobox/RadioGroup and other interactive control families (only Button and Input measured).; Whether the 211 unlabeled inputs are wrapped in a <label> that provides implicit association (shadcn Label is not implicit; unverified).; Color

### ux-consistency  [completed, confidence=high]
8 large components share a PARTIAL design language: primitives/spacing/dialog consistent, but loading (0/8 Skeleton) and empty states (6 hand-rolled variants) diverge.

- CampaignManager.tsx:3-15 imports card/button/input/textarea/badge/select/dialog/popover/command/alert-dialog from ui
- VoiceBroadcastManager.tsx:2-36 imports 15 ui primitives incl dialog/table/progress/slider/tooltip
- MissionBriefingWizard.tsx:2-12 imports 11 ui primitives, NO dialog
- AiSmsConversations.tsx:16-35 imports card/button/.../dialog/scroll-area/avatar/tabs
- _not checked_: Did not read all 8 files exhaustively; sampled imports + targeted regions + scripted counts.; Did not audit the other ~153 components for inline-button / empty-state divergence rate (only Skeleton usage counted repo-wide).; Did not verify dark-mode consistency

### ux-mobile  [completed, confidence=medium]
Phone verdict: BARELY usable. SMS screen (w-80 two-pane, 0 responsive classes), Twilio 7-col table (no overflow), AgentEditDialog grid-cols-10 tabs all break; bottom nav covers content.

- src/App.tsx:37 (import) and src/App.tsx:107-113 (render inside PublicAwareAppChrome)
- src/components/MobileBottomNav.tsx:7-11 (nav items + hide on public), :21 (md:hidden fixed bottom-0 h-16 safe-area-bottom)
- tailwind.config.ts:13-20 (no screens override; container 2xl only)
- src/index.css:100-180 (overflow-x hidden on body, safe-area-*, touch-target 44px, btn-mobile, pb-mobile-nav definition, global mobile [role=dialog] max-h)
- _not checked_: Did not render the app in a mobile viewport or on a device (no browser/emulator run); all layout claims are from code inspection.; Did not audit all 161 .tsx components - only the 8 largest plus Dashboard, DashboardSidebar, CallHistoryTable, Navigation, LeadDe

### ux-navigation  [completed, confidence=medium]
Nav/IA slice done: real router is Dashboard.tsx tab switch (44 tabs, ?tab=); 5 parallel navs; 3 orphan tabs, broken '/?tab=' links, duplicated Analytics/Pipeline/Reports/Credits.

- src/App.tsx:133 LandingPage at '/' (no auth redirect)
- src/App.tsx:141-150 protected routes
- src/App.tsx:143 /number-webhooks route
- src/App.tsx:148 /install route
- _not checked_: CommandCenter.tsx internals (does it consume onNavigate to reach orphan tabs?); McpConsent.tsx, LegalBeta.tsx, NotFound.tsx, Demo.tsx nav behaviour; The remaining ~120 non-nav components for additional orphaned-but-imported surfaces

### ux-wizards  [completed, confidence=high]
3 wizards characterized: MissionBriefing = 10 steps, ~110 controls, wall of fields + dead end; Onboarding = 14 areas, guided path (router); ConfigurationStepRenderer = 14-area dispatcher, guided.

- src/components/MissionBriefingWizard.tsx:432 totalSteps = 10
- src/components/MissionBriefingWizard.tsx:329 const [step, setStep] = useState(0)
- src/components/MissionBriefingWizard.tsx:437-448 STEP_NAMES 0..9
- src/components/MissionBriefingWizard.tsx:450-475 canAdvance() inline validation
- _not checked_: Child components rendered by ConfigurationStepRenderer (PhoneNumberPurchasing, SipTrunkManager, AdvancedDialerSettings, CampaignSetupWizard, WorkflowBuilder, VoiceBroadcastManager, LeadScoringSettings, BudgetManager, GoHighLevelManager, RetellAISetupWizard, AI

## Product & capability  (product)


### product  [completed, confidence=medium]
Verdict: gold ore, 7/10 — real engineering, but no end-to-end certified call path; browser money/contact actions all fail-closed.

- package.json:73 (certify:static chain) and :27-72 (72 *.mjs verification scripts, deno-based per-function certifications)
- supabase/functions/_shared/tenant-context.ts:44-63 fail-closed ownership assertion
- supabase/functions/_shared/openrouter.ts:122-165 real multi-provider LLM routing; ai-autonomous-engine/index.ts:1244,1465,2342 imports it
- supabase/functions/call-dispatcher/index.ts:15-25 (isForceDispatchCertified/isCallbackAutomationCertified/isAutomaticRetellNumberSyncCertified all return false)
- _not checked_: Did not execute the test suite, typecheck, build, or the certify:* pipelines - 'it builds and passes' is unverified.; Did not inspect the live Supabase project (emonjusymdripmkvtttc) - the one-org/one-member and secrets claims are inherited from the fact base,

## Market & competition  (market)


### market-competitors  [completed, confidence=medium]
5-competitor pricing table (GHL, Close, JustCall, Aircall, Nooks) + closest competitor = GoHighLevel; confidence medium.

- C:/Users/charl/dial-smart-system/docs/dial-smart-app-map.md:53-125 (Dial Smart capability inventory, packs, multi-tenant/credits model)
- C:/Users/charl/dial-smart-system/docs/dial-smart-app-map.md:97-98 (GHL integration already present: GoHighLevelManager.tsx 998, ghl-integration 1,225)
- https://www.gohighlevel.com/pricing (FACT pricing, seen 2026-11-03)
- https://www.close.com/pricing (FACT pricing, seen 2026-11-03)
- _not checked_: Orum's actual dollar figures and any AI-SDR pure-play public prices (DuckDuckGo/Bing blocked here).; GoHighLevel and Close per-minute/per-credit unit rates beyond the headline plan price.; Independent verification of Dial Smart's claimed lack of a mobile app /

### market-first-customer  [completed, confidence=medium]
D2D pack is the wedge as a standalone canvassing app; the locked dialer half is a distraction. Ideal first customer: door-to-door solar canvassers targeting bankrupt-installer homes.

- src/lib/launchSafety.ts:128-133,140-142,149-151,157-159
- supabase/functions/call-dispatcher/index.ts:15-25,636-652
- src/packs/door_to_door/host.ts:738-783,792-843,1364-1379,1403-1418,1568-2050,1983-1984,2011-2018,2022-2025
- src/packs/door_to_door/enroll.ts:160-265 (consent gate :173, dnc :167, phone :170)
- _not checked_: The live deployed environment's effective flags (I read repo source only).; The 199 migrations / 36 RLS policies on d2d_* tables for runtime tenant safety.; Whether the four pilot orgs exist live and which packs they have enabled.

### market-moat  [completed, confidence=medium]
Dial Smart: none of the 5 claimed differentiators is a real moat; all are copyable. Defensibility is off-list (data gravity, 199 migrations/495 RLS policies, carrier/GHL depth).

- src/services/providers/twilioAdapter.ts:7 (TODO stub) and :52-65 createCall returns failed
- src/services/providers/telnyxAdapter.ts:7; retellAdapter.ts:7 (both TODO stubs)
- src/services/carrierRouter.ts:12 TODO PR E; :78-81 loadProviderConfigs empty
- supabase/functions/outbound-calling/index.ts:162 provider retell|telnyx; :308-318 real API keys; :885-938 live agent verification
- _not checked_: Runtime/deployed state of the live Supabase project (emonjusymdripmkvtttc) - only repo code and migrations were read, so deployed crons/functions may differ from migration intent.; Did not run D2D tests (tests exist asserted, not pass).; Did not enumerate all 

### market-objection  [completed, confidence=medium]
Top 3 buyer objections cited: cert gates hardcoded false (108/51 funcs), live anon number leak + 503 webhook, demo-not-product hygiene; "no tests" claim is false.

- supabase/functions/call-dispatcher/index.ts:15-25 (three isXCertified() return false) consumed at :413, :640, :1266
- supabase/functions/ai-assistant/index.ts:2878-2880 gate false; :2887-2890 rationale comment; :2891-2900 HTTP 503 response
- grep 'Certified' = 108 matches in 51 files under supabase/functions (advanced-spam-detection:10/29, ai-brain:10/4652, ai-autonomous-engine:5498/5511, disposition-router:76/89, ghl-integration:63/75, ml-learning-engine:50/59, nudge-scheduler:25/36)
- supabase/functions-live/README.md:8-10 (main carries unidentified 503 gates live does NOT have) and :23 (live sms-messaging verify_jwt=FALSE -> unauthenticated get_available_numbers leak)
- _not checked_: Ran no tests and no build (could not verify the suite is green).; Did not query the live Supabase project (secrets, deployed function bodies, org/user counts).; Did not diff main against functions-live byte-for-byte per slug to enumerate exactly which function

### market-pricing-schema  [completed, confidence=high]
Unit = the cent ('credit'); 1 credit = $0.01 (implicit, /100). Retail voice $0.15/min, provider $0.07/min, no retail SMS price; SKUs $25-$1000.

- supabase/migrations/20260124_white_label_credits.sql:31,35,36
- supabase/migrations/20260713070000_agent_pricing_schema_contract.sql:7-32 (+ constraints agent_pricing_nonnegative_margin_check, agent_pricing_active_price_check)
- supabase/migrations/20260713060000_credit_ledger_schema_contract.sql (reserve_credits/finalize_call_cost/check_credit_balance; agent_pricing lookup ~465-472)
- supabase/functions/credit-management/index.ts:194,200-206,590-624
- _not checked_: Live DB values (no connection to emonjusymdripmkvtttc); all figures are schema/default/code-level.; plans / subscription monthly pricing (stripe_price_id -> plan).; legacy_runtime_function_schema_repair.sql (20260713140000) and the legacy calculate_agent_base_

### market-synth  [completed, confidence=medium]
Positioning doc written: POSITIONING.md; Dial Smart ships as a solar-exit canvassing app, priced per seat; everything else is disabled.

- C:/Users/charl/dial-smart-system/docs/market/POSITIONING.md (the deliverable, 137 lines)
- C:/Users/charl/dial-smart-system/docs/dial-smart-app-map.md:13-19 (own codebase / own Supabase project, not a wrapper); :53-125 (capability inventory); :97-98 (GHL integration present); :123-125 (packs / d2d single case)
- src/packs/door_to_door/DoorToDoorApp.tsx:4 ('a port, not a re-implementation'); host.ts:1568-2050 (REST surface); host.ts:1364-1379 (pack meters nothing); host.ts:1403,1514-1542 (solar-exit content)
- src/components/Dashboard.tsx:511-516 (only d2d pack has a real screen)
- _not checked_: Live deployed function bodies / secret store on emonjusymdripmkvtttc (repo-only analysis).; Live pricing_tiers / agent_pricing production row values, and plan/subscription monthly prices (stripe_price_id -> plan).; Ran no tests and no build; suite configured b

## Launch risks  (risks)


### calllogs-insert-rls  [completed, confidence=high]
call_logs: writers use service_role (RLS bypassed); outbound-calling inserts WITHOUT organization_id then updates it; browser-phone sets it explicitly; NOT-NULL satisfied by a phase1 trigger.

- certification/recovery-lineage-v24/migrations/20260712000000_live_public_schema_baseline.sql:3062-3105 (call_logs CREATE TABLE; organization_id uuid nullable at 3097; user_id NOT NULL 3064; status NOT NULL 3070)
- supabase/migrations/20260108_phase2_add_org_to_core_tables.sql:258-267 (adds organization_id, backfills, SET NOT NULL)
- supabase/migrations/20261029142121_phase1_org_scope.sql:33-44 (backfill), 47-69 (set_organization_from_user BEFORE INSERT trigger over call_logs at 65), 82-85 (company permissive policies), 93-119 (tenant_scope_guard), 125 (organization_id SET NOT NULL)
- supabase/migrations/20260713071000_call_log_evidence_boundary.sql:6 (ENABLE RLS), 13-20 (drop policies), 29-36 (REVOKE ALL from anon/authenticated), 40-44 (single authenticated SELECT policy), 46 (GRANT SELECT authenticated), 47-48 (service_role REVOKE DELETE 
- _not checked_: Did not query the live Supabase DB (no credentials/read-only constraint); all schema claims come from migration files + the recovery-lineage baseline dump, not a live pg_dump.; Did not exhaustively enumerate every other writer into call_logs (e.g. supabase/fun

### ce-ai-autonomous-engine  [completed, confidence=high]
ai-autonomous-engine is coded to autonomously egress calls/SMS but is fully launch-quarantined (early 503, service-only auth, cron removed); DNC+hours checked, no credit/consent check.

- supabase/functions/ai-autonomous-engine/index.ts:414-432 (fetchFunctionJson egress helper; fetch at :417 with service-role Bearer)
- supabase/functions/ai-autonomous-engine/index.ts:752 (journey_call -> outbound-calling)
- supabase/functions/ai-autonomous-engine/index.ts:673 (send_followup_sms -> sms-messaging)
- supabase/functions/ai-autonomous-engine/index.ts:779 (journey_ai_sms -> ai-sms-processor)
- _not checked_: Full read of downstream functions sms-messaging/index.ts and ai-sms-processor/index.ts for credit/consent/timezone enforcement (only grep-sampled).; Whether any OTHER invoker (e.g. a Deno.cron, an external scheduler, or the Hermes server) calls this function's

### dialpath-db-schema-org  [completed, confidence=high]
Dispatcher filters phone_numbers by user_id AND organization_id, so a fresh org gets zero numbers; no platform pool, no seed, no signup provisioning.

- supabase/functions/call-dispatcher/index.ts:1170-1177
- supabase/functions/call-dispatcher/index.ts:1199-1205
- supabase/functions/call-dispatcher/index.ts:1270-1274
- supabase/functions/call-dispatcher/index.ts:1314-1348
- _not checked_: Service-role edge functions that INSERT/UPDATE phone_numbers (retell-phone-management, telnyx-management, twilio number purchase, webhooks) - not opened for writes/auto-assignment to new orgs; supabase/functions-live/** deployed copies (only functions/ inspect

### dialpath-dispatcher-callerid  [completed, confidence=high]
Dead-end is index.ts:1314 (HTTP 200 no_numbers_available); sync recovery unreachable via index.ts:24 return false; empty table never reaches callerId=1929.

- index.ts:23-25 isAutomaticRetellNumberSyncCertified(){return false}
- index.ts:1264-1312 Retell sync fallback (unreachable)
- index.ts:1266 gate on certified flag
- index.ts:1314 if(availableNumbers.length===0) terminal guard
- _not checked_: outbound-calling internals when callerId is absent; upstream/scheduler handling of the 200 + no_numbers_available body; the never-called retell-phone-management sync path

### dialpath-dispatcher-gates  [completed, confidence=medium]
12 ranked day-one dispatcher gates; top cause: cron only wakes tenants with pre-existing due queue rows, so an unseeded first launch never dials.

- call-dispatcher/index.ts:15-25 certification flags hardcoded false
- call-dispatcher/index.ts:64-70 getLeadTimezone uses state only
- call-dispatcher/index.ts:319 authorizeOrganizationContext throws without explicit org id
- call-dispatcher/index.ts:350-353 bypassCallingHours forced false
- _not checked_: Frontend/app launch path and any Refresh-Leads/seeding RPC.; Whether live production DB matches repo migrations.; automation-scheduler auth (scheduler-auth.ts) and cron registration.

### dialpath-other-entrypoints  [completed, confidence=high]
All 10 number/trunk functions are 503 certification-disabled; none is a viable day-one provisioning path.

- retell-phone-management/index.ts:28-36 unconditional 503 PROVIDER_ADMIN_NOT_CERTIFIED
- retell-business-verification/index.ts:34-36 guard fn returns false; :43-48 503
- twilio-integration/index.ts:34-42 unconditional 503; interface line 11 lists create_sip_trunk/import_number/release_phone_number
- telnyx-outbound-ai/index.ts:133-143 make_call 503 only; no purchase/import actions; :186-195 callerId must be org-owned
- _not checked_: phone-number-purchasing, provider-management, telnyx-ai-assistant, retell-agent-management, provider-router.ts, _shared/control-plane/registry.ts and elite-solar-provider-readiness.ts - all related provisioning entrypoints OUTSIDE the 10 named; Live/deployed s

### dialpath-outbound-calling-contract  [completed, confidence=high]
outbound-calling create_call contract mapped: callers, callerId binding, retell/telnyx/twilio dispatch, fresh-account death points; api-gateway proxy defect found.

- outbound-calling/index.ts:220,230-236,283,295-305,332-341,364-368,442-445,460-508,532-546,683,945,1049-1406,1422,1445,1811-1835
- call-dispatcher/index.ts:1170-1177,1217-1222,1644-1658,1846-1868,1914-1926,1939-1961
- api-gateway/index.ts:470-512
- workflow-executor/index.ts:175-211,1451-1481
- _not checked_: Live production phone_numbers rows (retell_phone_id present vs bound).; Retell dashboard import state beyond the code's live GET check.; telnyx-outbound-ai internals (separate egress).

### dialpath-outbound-config  [completed, confidence=medium]
First outbound call is Retell-only; dies on missing callerId (400 :332) or agentId (500 :343), plus retell_phone_id/owned-rows and Retell-account checks.

- outbound-calling/index.ts:283
- outbound-calling/index.ts:295-305
- outbound-calling/index.ts:308-316
- outbound-calling/index.ts:332-345
- _not checked_: Live DB state: whether a fresh org actually has phone_numbers/retell_agents/active campaign rows.; Full retell-phone-management import/sync flow (whether retell_phone_id can be set without Retell-side existence).; supabase-js version semantics for error.messag

### dialpath-provider-trunk-config  [completed, confidence=high]
CONFIRMED: provider-management, twilio-integration, remove-trunk all unconditionally 503 before auth. No trunk/provider creation possible; no Telnyx connection-create endpoint exists.

- supabase/functions/provider-management/index.ts:48-50 (return false), :58-63 (503 return), :103 switch never reached
- supabase/functions/twilio-integration/index.ts:34-42 (unconditional 503 before auth :57; handlers :1066+ unreachable)
- supabase/functions/remove-trunk/index.ts:14-22 (unconditional 503)
- src/components/SipTrunkManager.tsx:229,289,306,343,372,394,418,472 (twilio-integration calls) and :100-122,:124-177,:179-195,:197-223,:448-461,:495-531 (direct DB writes)
- _not checked_: No live probe of the Supabase URL, so source-vs-deployment match is UNVERIFIED.; Did not enumerate the return value of all ~52 NOT_CERTIFIED gates (sampled 7).; Did not fully read voice-broadcast-engine, NumberRotationManager, TwilioNumbersOverview, SystemHeal

### dialpath-purchase-path  [completed, confidence=high]
Seed confirmed: main's purchase fn is an unconditional pre-try 503; every caller gated; live deploy may predate gates.

- supabase/functions/phone-number-purchasing/index.ts:31-46 (serve handler; unconditional 503 at 36-44 precedes try at 46; dead logic 46-489)
- src/lib/launchSafety.ts:157-159 (browserProviderAdministrationAllowed returns false)
- src/lib/launchSafety.ts:33-34 (PROVIDER_ADMIN_LAUNCH_LOCK_MESSAGE)
- src/hooks/usePhoneNumberPurchasing.ts:21-25 (client lock then throw) and :30 (invoke phone-number-purchasing)
- _not checked_: The actual deployed/live function source for phone-number-purchasing and sibling provider functions (emonjusymdripmkvtttc) - not called, research-only constraint.; Whether the deployed frontend bundle includes launchSafety.ts or predates it.; Database RLS/poli

### dialpath-services-binding  [completed, confidence=high]
provider-layer from-number binding: in-scope services/* are stubs; live binding lives in edge functions; Retell requires retell_phone_id, Telnyx binding unverified

- src/services/providers/types.ts:22-33
- src/services/providers/telnyxAdapter.ts:57-70
- src/services/providers/twilioAdapter.ts:52-65
- src/services/providers/retellAdapter.ts:49-60
- _not checked_: inbound number resolution (outbound only in scope); staging duplicate voice-provider.ts copies; whether src/services/providers stubs are imported in the React app

### dialpath-ui-dayone  [completed, confidence=high]
Fresh org has no day-one from-number path: TwilioNumbersOverview load 503s at L135, PhoneNumberPurchasing purchase/import/sync locked at L99/134/171.

- TwilioNumbersOverview.tsx:131-201 and 135-137 (loadNumbers invokes twilio-integration check_a2p_status)
- twilio-integration/index.ts:34-42 (unconditional 503 disabled before try)
- PhoneNumberPurchasing.tsx:99-102,134-137,171-174 (guard calls)
- src/lib/launchSafety.ts:157-159 (browserProviderAdministrationAllowed returns false)
- _not checked_: Whether local disabled edge functions match what is deployed to Supabase (no prod call made; research only).; RLS policies on phone_numbers and fresh-org read/write.; Other possible from-number surfaces: Settings API-keys, provider-management, retell-phone-man

### dialpath-webhooks  [completed, confidence=medium]
Retell call webhook 503s without signing key (top day-one cause); Telnyx 503 confirmed; all webhook setters 503-disabled; URLs account-global not per-org.

- retell-call-webhook/index.ts:521-522,572-583
- voice-call-events/index.ts:212-220,246-250
- call-tracking-webhook/index.ts:134-142
- retell-inbound-webhook/index.ts:43-51
- _not checked_: Live secret/portal state for RETELL_WEBHOOK_SIGNING_KEY, RETELL_WEBHOOK_VERIFY_MODE, RETELL_AI_API_KEY, WEBHOOK_SECRET_TELNYX, TWILIO_AUTH_TOKEN and the Telnyx/Twilio webhook registrations.; Deployed live bundles vs this repo for retell-call-webhook, retell-in

### dw-callerid-derive  [completed, confidence=high]
Caller-ID and SMS sender are derived server-side from the phone_numbers pool; a Wizard campaign needs neither from_number nor sms_from_number to launch.

- supabase/functions-live/call-dispatcher/functions/call-dispatcher/index.ts:1716 const callerId = selectedNumber.number; passes callerId to outbound-calling at :1732/:1768; pool fetch :1019 (retell) and :1051 (telnyx); campaign selects :424,:734,:1317 have no f
- .deployed-call-dispatcher-v609.ts:1007-1064 pool fetch, :1082-1101 campaignPoolMap, :1588-1608 pool scoping ('Empty pool = use global pool'), :1627-1669 round-robin/local-presence selection, :1668-1692 callBody with callerId, :1147-1176 no_numbers_available
- supabase/functions-live/outbound-calling/index.ts:117 callerId?: string; :257-266 MISSING_CALLER_ID 400 if absent; :292 stores caller_id; :645/:664 Telnyx From/from; :744/:1163 Retell from/from_number
- supabase/functions-live/api-gateway/index.ts:458-482 caller-id fallback to first active rotation_enabled phone_numbers row; :545-559 SMS sender fallback; :356/:401/:694 sms_from_number passthrough
- _not checked_: Live deployment state of the Supabase functions (project emonjusymdripmkvtttc) - repo-vs-deployed parity unverified.; Full diff of the non-live supabase/functions/call-dispatcher/index.ts copy vs the live copy (it also derives callerId at line 1929 but was not

### dw-campaignmanager  [completed, confidence=high]
CampaignManager 'Launch/Activate' 495-518 only toasts; no draft->active path exists in browser. Only ->paused allowed (launchSafety 115-119).

- CampaignManager.tsx:495-518 handleStatusChange active branch
- CampaignManager.tsx:520-531 non-paused lock + only mutation path
- CampaignManager.tsx:1587-1604 status ternary Play/Activate
- CampaignManager.tsx:161-178 guard + rejectBrowserDispatch
- _not checked_: executeTestCall/testCallUtils.ts + edge function behavior; CampaignWizard.tsx:827 and CampaignReadinessChecker.tsx wiring; CampaignLauncher/QuickLaunchButton/QuickTestCampaign/AgentDashboard alternate surfaces

### dw-campaignwizard  [completed, confidence=medium]
CampaignWizard is draft-only, no dispatch; BLOCKER: insert omits organization_id (campaigns requires it) so first-campaign create fails at DB.

- src/components/CampaignWizard.tsx:205-217 (WizardState; no from_number/sms_from_number)
- src/components/CampaignWizard.tsx:430-460 (handleCreate guard + insert with status:'draft', no organization_id)
- src/components/CampaignWizard.tsx:478-486 (canProceed gating)
- src/components/CampaignWizard.tsx:311-323 (applyProfile pre-fills optional fields)
- _not checked_: Live/deployed Supabase DB state - whether the org-scope migrations and tenant trigger are actually applied (research-only, no live access). This is the pivot for whether the org_id omission is a hard blocker or a latent miss.; RLS policies on public.campaigns 

### dw-dispatch-reach  [completed, confidence=high]
No browser component can start a real first-campaign call: UI gate browserCallDispatchAllowed()=false AND server rejects browser campaign calls at outbound-calling:364-368.

- src/hooks/usePredictiveDialing.ts:663-732 makeCall (no internal launch-lock guard; always passes campaignId at :696)
- src/hooks/usePredictiveDialing.ts:691-702 invokes outbound-calling action:create_call
- src/components/CampaignManager.tsx:777-783 handleStartCall gated by browserCallDispatchAllowed() at :780
- src/components/CampaignManager.tsx:726-732 handleDispatchNow gated at :727
- _not checked_: campaign_contact_release RPC SQL body (default-deny inferred); actual DB/seed state (no DB read; research-only); api-gateway and other edge functions that may dial

### dw-lead-assign  [completed, confidence=high]
First-campaign lead assignment required by all gates but missing from happy path; wizard never writes campaign_leads and no frontend launch exists

- src/hooks/usePredictiveDialing.ts:588-643 (addLeadsToCampaign; campaign_leads insert at 619)
- src/components/EnhancedLeadManager.tsx:242-261 (handleAddToCampaign, call at 252)
- src/components/CampaignSetupWizard.tsx:148-183 (draft create), 416 ('assign leads after campaign creation'), 470-528 (step 5 Review, no assignment), 512 (fix route)
- src/components/ai-configuration/OnboardingWizard.tsx:61-67 (leads area); src/components/ai-configuration/ConfigurationStepRenderer.tsx:366-379 (renders LeadUpload)
- _not checked_: Any frontend launch/activate entry point other than CampaignLauncher, QuickTestCampaign and launchSafety gates (did not exhaustively enumerate all status->active writers).; The duplicate campaigns/functions mirror vs supabase/functions and functions-live/* dis

### dw-quicklaunch  [completed, confidence=medium]
All 3 browser launch paths are no-ops; real egress is server-side only; top risk = addTestLead writes live leads with no lock

- QuickLaunchButton.tsx:35-101 (checkReadiness), :61-66, :69-73, :76-81, :91
- QuickLaunchButton.tsx:102-114 (handleLaunch no-op/toast), :144, :154, :173
- Dashboard.tsx:16 (import), :278 (<QuickLaunchButton /> no onLaunch)
- QuickTestCampaign.tsx:55-161 (addTestLead writes), :97-101 (reset to new), :131-138 (campaign_leads insert), :162-180 (activateCampaignAndDispatch no-op), :268 (label)
- _not checked_: Whether pg_cron or automation-scheduler invokes call-dispatcher automatically and at what cadence; call-dispatcher's full pre-dispatch gating beyond active-campaign selection (webhook signing, idempotency, contact-stop, DNC correctness); outbound-calling's own

### dw-status-activate  [completed, confidence=high]
One live path activates a campaign: api-gateway POST /v1/campaigns/:id/launch (campaigns:write + owner); UI is fully locked; canary path never writes.

- supabase/functions-live/api-gateway/index.ts:183 route regex contains launch|pause|validate|... ; :188 `if (action === "launch" && method === "POST") return setCampaignStatus(rc, id, "active");`
- supabase/functions-live/api-gateway/index.ts:361-369 setCampaignStatus(rc, id, status): requireScope(rc.ctx, "campaigns:write") then rc.supabase.from("campaigns").update({ status }).eq("user_id", rc.ctx.userId).eq("id", id).select(CAMPAIGN_FIELDS) -- no launch
- supabase/functions/api-gateway/index.ts:188 and :361 identical unguarded launch route + writer (containment-profile duplicate of the same file)
- mcp-server/src/tools/campaigns.ts:32-41 dialsmart_launch_campaign -> c.post('/v1/campaigns/${args.id}/launch'), description: 'Launch (activate) a campaign by setting its status to active. The dispatcher will start placing calls on its next tick.'
- _not checked_: Live Supabase (project emonjusymdripmkvtttc) was NOT queried: I did not confirm that guard_campaign_has_agent is still installed on public.campaigns or that it is the only trigger on that table.; I did not fetch deployed edge-function bodies via get_edge_funct

### dw-surface-manifest  [completed, confidence=high]
6 surfaces mapped: (a,c,f) reachable, but all launch controls inert (browserCallDispatchAllowed=false); (b) QuickLaunchButton is a no-op; (d) CampaignLauncher & (e) CallCenter are dead code.

- App.tsx:141 route /dashboard -> Index; App.tsx:132-153 (no routes for any dashboard surface)
- src/pages/Index.tsx:1-11 renders Navigation + Dashboard
- src/components/Dashboard.tsx:111 activeTab default 'command-center'; :131-134 handleTabChange; :239 CommandCenter onNavigate={handleTabChange}
- src/components/Dashboard.tsx:441-443 case 'predictive'/'dialer' -> PredictiveDialingDashboard (target of onNavigate('predictive'))
- _not checked_: Did not run the app in a browser (research-only; no dev server) so all reachability is static-analysis, not a rendered/click-through confirmation.; Did not enumerate every nested dispatch/launch button label inside CampaignReadinessChecker, CampaignWizard, or 

### knownopen-item5-d2d-callback  [completed, confidence=high]
TRUE: d2d booking queues leads.next_callback_at + scheduled_follow_ups, but dispatcher callback automation is gated off and also needs a campaign_leads row it never gets.

- supabase/functions/call-dispatcher/index.ts:19-21 - function isCallbackAutomationCertified(): boolean { return false; }
- supabase/functions/call-dispatcher/index.ts:636 - console.log('[Dispatcher] Callback automation is launch-disabled')
- supabase/functions/call-dispatcher/index.ts:640 - if (isCallbackAutomationCertified()) { ... } gates the entire past-due-callback block (reads leads.next_callback_at at :647-648)
- src/packs/door_to_door/host.ts:738-783 - syncDoorFollowUps() filters status 'callback' with callback_at / 'appointment' with appointment_at, then calls enrollDoorFollowUp (dueAt = knock.callback_at ?? knock.appointment_at at :779)
- _not checked_: Live Supabase DB (emonjusymdripmkvtttc): whether any door-sourced leads/campaign_leads rows exist today, or whether the callback block has ever executed in prod logs.; Whether the published/live build matches this source, or local dist staleness affects which 

### knownopen-item6-geocoding  [completed, confidence=high]
Claim (6) TRUE: new-house geocoding is unimplemented — lat/lng come only from map taps or pre-geocoded CSV rows; no geocoding call exists.

- supabase/migrations/20261102234500_door_to_door_core.sql:62
- src/packs/door_to_door/app/scripts.js:942-955
- src/packs/door_to_door/app/scripts.js:951
- src/packs/door_to_door/app/scripts.js:934
- _not checked_: I did not query the live Supabase project (emonjusymdripmkvtttc) to inspect actual geocode_status/lat-lng distribution, so I cannot say how many live rows lack coordinates.; I did not exhaustively open all ~200 migrations or every one of ~78 edge functions lin

### knownopen-item7-record-coach  [completed, confidence=high]
Claim(7) PARTIALLY TRUE: Record consent switch is BUILT (CallWorkspace.tsx:582-590); coach-suggest confidence is half-built (hardcoded except disposition/stage, no threshold).

- docs/dial-smart-app-map.md:143 - claim text 'Consent "Record" switch and coach-suggest confidence handling are open' (section 6 heading at 134)
- src/components/call/CallWorkspace.tsx:177 - const [consented, setConsented] = useState(false)
- src/components/call/CallWorkspace.tsx:582-590 - Record button: variant={consented?'default':'outline'}, onClick={()=>setConsented(v=>!v)}, label {consented?'Recording':'Record'}
- src/components/call/CallWorkspace.tsx:243-253 - coach effect: 'if (!consented || !rules.length) return;' (consent gates coach)
- _not checked_: Whether `consented` triggers real audio recording or a persisted consent artifact (only the UI toggle/gate was traced; no write to a consent table seen); The deployed/live version of coach-suggest vs repo HEAD (verified repo source only); The DB schema/RLS for

### knownopen-item8-lint-looseclient  [completed, confidence=high]
Claim (8): (a) glob noise real but from scripts/*.test.mjs not test-harness/ (PARTIAL); (b) LooseClient workaround TRUE (host.ts:82-97).

- docs/dial-smart-app-map.md:144 - 'Lint debt: test-harness vitest glob noise; generated Supabase types worked around via `LooseClient`'
- eslint.config.js:8 - ignores: ["dist","coverage","playwright-report","test-results"] (no vitest/scripts ignore)
- eslint.config.js:11 - files: ["**/*.{ts,tsx}"] (so .mjs scripts unlinted)
- package.json:13 - "lint": "eslint ."
- _not checked_: Did not execute `npm run lint` or `npx vitest run` to observe the 36-file output live; relied on config + file count + the prior checkpoint doc.; Did not search for alternate lint configs beyond eslint glob find (only eslint.config.js exists; no .eslintrc* sur

### risks-a1-auth-tenant  [completed, confidence=high]
Day-one auth/tenant review: no invite/provisioning path (blocker), self-signup is org-less (blocker), plus silent-empty-app and role-gating failures.

- src/components/AuthPage.tsx:39-45
- src/lib/organizationContext.ts:44-79,134-141,147-154
- src/contexts/OrganizationContext.tsx:41-51,59-77,86-92,117-161
- src/components/ProtectedRoute.tsx:32-61
- _not checked_: The live database schema and data: org/role/RLS claims are from migration files and code comments, not from querying the live project.; RLS policies beyond organization_users/organizations and the four org-scoped core tables; the other ~190 migrations were not

### risks-b1a-dispatch-stop-enforcement  [completed, confidence=medium]
DNC/contact-stop IS enforced: outbound-calling gates every provider create via enforceFinalBoundary; call-dispatcher double-checks; predictive/voice-broadcast disabled.

- outbound-calling/index.ts:652-693 - assertContactAllowed(): evaluate_contact_stop RPC (653-665, fail-closed throw on error/empty), re-read leads.do_not_call (667-679, throw DNC_BLOCKED), re-query dnc_list on phone_number_normalized (684-691, throw DNC_BLOCKED)
- outbound-calling/index.ts:807-819 - enforceFinalBoundary() calls assertContactAllowed('final-provider-boundary') + calling-hours + campaign release
- outbound-calling/index.ts:1269 -> create 1271 (Telnyx direct), 1306 -> create 1308 (Telnyx TeXML fallback), 1808 (inside retry loop) -> create 1811 (Retell create-phone-call): every egress preceded by enforceFinalBoundary
- call-dispatcher/index.ts:1695-1727 - DNC hard-stop vs dnc_list, fail-closed throw at 1708-1710; 1729-1750 - evaluate_contact_stop, fail-closed throw at 1738-1740; 1955 - invoke outbound-calling
- _not checked_: Egress paths outside the four named functions: voice-call (partial), twilio-voice-call, telnyx-outbound-ai, assistable-make-call, quick-test-call, demo-call, voice-broadcast-queue; Did not read the 97KB/105KB/106KB function files end-to-end; only grep-hit regi

### risks-b1b-dnc-list-usage  [completed, confidence=medium]
DNC enforced server-side (call-dispatcher, outbound-calling, sms-messaging, voice-call, ai-sms-processor); browser can only INSERT; two reads user-scoped not org-scoped.

- supabase/migrations/20260712040000_sms_delivery_safety.sql:8-26 normalize_contact_phone; :31-33 dnc_list gets phone_number_normalized+organization_id; :88-91 sync_dnc_normalized_phone trigger; :101-103 idx_dnc_org_normalized_phone.
- supabase/migrations/20260713062000_dnc_tenant_uniqueness_contract.sql:29-34,55-59 drops (phone_number,user_id)/(phone_number_normalized,user_id)/(organization_id,phone_number_normalized) uniqueness; :174-178 NOT NULL + unique (organization_id,phone_number_norm
- supabase/migrations/20260713073000_irreversible_dnc_browser_boundary.sql:6 ENABLE RLS; :29-36 REVOKE ALL from PUBLIC,anon,authenticated; :40-53 SELECT/INSERT policies; :55 GRANT SELECT,INSERT to authenticated; :56-57 service_role grants; :59-88 protect_dnc_sup
- supabase/migrations/20260712020000_contact_safety_and_provider_idempotency.sql:196-256 evaluate_contact_stop reads only contact_stop_controls (no dnc_list).
- _not checked_: Live production DB state (information_schema/pg_policies) to confirm the 7/13 grants+constraints are applied vs the repo-vs-live divergence noted in docs/wholesale/audit/LIVE-SCHEMA.md.; Runtime behavior of the legacy onConflict 'user_id,phone_number' upserts 

### risks-b1c-sms-optout-stop  [completed, confidence=medium]
SMS STOP is parsed + flags lead do_not_call but does NOT write dnc_list (disposition-router disabled); reply path bypasses the check.

- twilio-sms-webhook/index.ts:14-29 (OPT_OUT_KEYWORDS list)
- twilio-sms-webhook/index.ts:166-183 (analyzeSmsForDisposition opt-out branch: shouldAddToDnc/shouldStopAutoReply/suggestedStatus=dnc)
- twilio-sms-webhook/index.ts:170 (substring includes() match)
- twilio-sms-webhook/index.ts:645 + 727-730 (disposition processed only when lead.id exists; otherwise only logged)
- _not checked_: Live database state: whether any dnc_list rows are written by another path, whether phone_number vs phone_number_normalized is populated for SMS opt-outs, and RLS policies on dnc_list inserts.; The deployed/active version of each edge function in Supabase (sou

### risks-b1d-consent-capture  [completed, confidence=medium]
risks-b1d-consent-capture: no durable per-lead consent record and no consent check in the call path; consent exists only in JSON docs + a zero-contact redacted shadow lane.

- campaigns/solar-exit/eligibility-policy.json:10-45 lists consent.required_evidence_fields (consent_artifact_id, ai_voice_calls_authorized, telemarketing_calls_authorized, revoked, etc.) and :5-9 default_decision=deny / seller_specific_consent_required=true, bu
- agentgrep repo-wide for eligibility-policy|eligibility_policy|reactivation-policy returned 0 matches in code -> the solar-exit policy JSONs are never loaded by src/ or supabase/ (FACT).
- campaigns/solar-exit/manifest.json:6-7 environment=offline_only, production_launch_allowed=false; :142-217 all launch_approvals.approved=false; :80-105 required_launch_placeholders remain __REQUIRED_*__ -> package is unshipped test material, not running config
- No operational consent table exists: agentgrep for 'CREATE TABLE ... consent' / 'public.consents' / 'REFERENCES public.consent' across supabase returned 0 matches (FACT). Only consent-named schema is the shadow lane.
- _not checked_: Other egress entry points: assistable-make-call, api-gateway, ai-sms-processor, workflow-executor SMS steps, lead-reset/Refresh Leads, and any Telnyx/Twilio send paths were not read; consent enforcement for SMS specifically was not traced.; The live Supabase d

### risks-b1e-acceptance-gate-ui  [completed, confidence=high]
Guards are hardcoded-false real UI blocks, not server enforcement; useSmsMessaging.sendSms is unguarded; autoPauseCampaign is dead code.

- src/lib/launchSafety.ts:115-159 (guard bodies)
- src/lib/launchSafety.ts:2-4 (comment: must cross trusted server boundary)
- src/lib/smsAcceptance.ts:14-35 (assertAcceptedSmsEnvelope = post-hoc validator)
- src/components/AgentEditDialog.tsx:822-825 block; :850 invoke; :2592 disabled prop
- _not checked_: Server-side enforcement inside outbound-calling / call-dispatcher / sms-messaging / voice-broadcast-engine (only noted that cert gates exist for some AI tools); RLS policies on campaigns / phone_numbers / call_logs / sms_messages that might independently block

### risks-b2-calling-hours-tcpa  [completed, confidence=high]
Calling-hours/TCPA: campaign calls fail closed to local 8am-9pm (2 layers), but voice broadcast bypass flag + defaulted ET timezone + zero state rules are real risks.

- supabase/functions/_shared/contact-safety.ts:19-20, 30-46, 48-51, 53-84
- supabase/functions/outbound-calling/index.ts:357, 399, 411, 765-790, 807-819, 830-879
- supabase/functions/call-dispatcher/index.ts:29-58, 64-70, 76-101, 347-352, 551-623, 1516-1566
- supabase/functions/voice-broadcast-engine/index.ts:752-774, 1089-1123
- _not checked_: api-gateway pre-launch hasWarnings calling_hours semantics (678-797) beyond the window echo; predictive-dialing-engine and scheduled-spam-check paths; frontend CampaignWizard/CampaignManager validation of the hours input

### risks-c1-credit-spend  [completed, confidence=medium]
Voice credits enforce race-safe (reserve gate pre-egress); SMS is unmetered (F1); below-zero spend is a configured option (F3).

- docs/dial-smart-app-map.md — read in full (shared fact base + contract).
- supabase/functions/credit-management/index.ts — read in full (819 lines).
- supabase/migrations/20260124_white_label_credits.sql — read in full.
- supabase/migrations/20260713060000_credit_ledger_schema_contract.sql — read in full; reserve_credits:350-527, finalize_call_cost:529-878, check_credit_balance:281-348, add_credits:880-999, grants/revokes:1001-1015.
- _not checked_: voice-broadcast-engine actual dispatch path (grep found only a 'billing contract' comment; not traced whether reservations are per-call or per-batch).; predictive-dialing-engine and voice-broadcast-queue dispatch internals.; billing_ownership_boundary.sql (202

### risks-c2-doublecharge  [completed, confidence=high]
No working double-credit vector (stripe_events PK + add_credits unique idempotency); real gaps: credit purchases credit ZERO (F1) and billing-portal 60s window allows double subscriptions (F2).

- supabase/functions/credit-management/index.ts:611-627 sets metadata[paid_amount_cents]/[credit_amount_cents]/[credit_policy_version] (credits: checkout session creator)
- supabase/functions/stripe-webhook/index.ts:368-369 reads session.metadata?.amount_cents/bonus_cents
- supabase/functions/stripe-webhook/index.ts:391-396 swallows add_credits error and does not throw; :594 returns 200
- supabase/migrations/20260713060000_credit_ledger_schema_contract.sql:913-914 add_credits raises on amount_cents=0
- _not checked_: The live DB's actual constraint/index state (I read the migration contract; this repo has documented live<->repo drift).; Full byte-equality of supabase/functions-live/stripe-webhook vs supabase/functions/stripe-webhook (both read metadata.bonus_cents at :369 

### risks-d-support  [completed, confidence=medium]
'It did not call' diagnostics: app records reason in dialing_queues.notes (+providers/alerts), but notes is overwritten, unsurfaced in UI, and pre-acceptance failures aren't durably logged.

- supabase/functions/call-dispatcher/index.ts:1570-1603 diagnostics computed only when eligibleCalls.length===0
- supabase/functions/call-dispatcher/index.ts:2126-2159 HTTP 200 success body with diagnostics + results[] even on per-item failure
- supabase/functions/call-dispatcher/index.ts:1690,1716,1746,1835,1863,1922,1652,1763,1980,2043-2044 dialing_queues.notes breadcrumb values
- supabase/functions/call-dispatcher/index.ts:1801 edge_function_errors; :1817 raiseAlert campaign_no_agent; :2075 raiseAlert provider_call_failed
- _not checked_: RPC bodies: claim_pending_dispatches(_now), claim_provider_dispatch, finalize_provider_dispatch, resolve_provider_dispatch_invoke_error, evaluate_contact_stop, record_physical_call_attempt internals; _shared/alerting.ts raiseAlert/resolveAlerts behavior (persi

### risks-e1-knownopen-runtime  [completed, confidence=medium]
Section 6 runtime items: 503 gate TRUE; Stripe-missing TRUE; dist stale TRUE; "Telnyx key leaked" only PARTIALLY - no committed secret, real basis is a Hermes process-list exposure.

- supabase/functions/voice-call-events/index.ts:212,217-219 (503 gate)
- supabase/functions/telnyx-webhook/index.ts:131 (sibling fails OPEN, skips verification)
- grep KEY[0-9a-zA-Z_]{20,} across repo -> 0 matches
- grep whsec_/sk_live_/sk_test_ real values -> 0 (only generated 'dsk_live_' tokens in migrations)
- _not checked_: Git history / packed objects for a historically committed secret - git commands timed out on this large repo, so only the working tree was scanned.; Live Supabase project env (which secrets actually exist/are unset in the deployed emonjusymdripmkvtttc project)
