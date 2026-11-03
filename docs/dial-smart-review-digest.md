# Dial Smart / DoorBoss - capability review digest

Condensed findings from a multi-model review swarm. Every line is a model-authored finding with file:line evidence. Confidence is the author's own self-report (low|medium|high).

Nodes in this digest: 37 (review lanes). Plus 28 nodes from earlier unrelated plans (excluded).


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

### arch-e-coupling-cm  [completed, confidence=high]
CampaignManager.tsx: 2179 lines; 12 direct supabase calls (9 from + 3 invoke); 0 useContext; 1 prop (onRefresh); 9 custom hooks; dominant pattern hooks + heavy direct-supabase.

- CampaignManager.tsx:2179 line count
- CampaignManager.tsx:79-81 props interface CampaignManagerProps { onRefresh?: () => void }
- CampaignManager.tsx:98 destructures { onRefresh }
- CampaignManager.tsx:221 .from('campaign_workflows')
- _not checked_: Opened the imported hook files (usePredictiveDialing/useCallDispatcher/useCampaignReadiness etc.) to confirm whether those hooks themselves call supabase or an edge function - per-hook data-access depth unverified.; Inspected the parent that renders <CampaignM

### arch-e-coupling-mbw  [completed, confidence=high]
MBW: 1837 lines, 9 direct supabase calls (6 .from + 3 invoke), no props, 2 context hooks; dominant = direct-supabase.

- C:/Users/charl/dial-smart-system/src/components/MissionBriefingWizard.tsx:19 - `import { supabase } from '@/integrations/supabase/client';`
- C:/Users/charl/dial-smart-system/src/components/MissionBriefingWizard.tsx:328 - `const MissionBriefingWizard: React.FC = () => {` (no props)
- C:/Users/charl/dial-smart-system/src/components/MissionBriefingWizard.tsx:353 - `const { sendMessage } = useAIBrainContext();`
- C:/Users/charl/dial-smart-system/src/components/MissionBriefingWizard.tsx:354 - `const organizationId = useCurrentOrganizationId();`
- _not checked_: Did not inspect the imported modules '@/contexts/AIBrainContext', '@/contexts/OrganizationContext', '@/integrations/supabase/client', '@/lib/testCallUtils' - coupling is reported from the call sites in this file only.; Did not check other files/components for 

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
