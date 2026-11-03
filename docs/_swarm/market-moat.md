# market-moat

- status: completed
- tldr: Dial Smart: none of the 5 claimed differentiators is a real moat; all are copyable. Defensibility is off-list (data gravity, 199 migrations/495 RLS policies, carrier/GHL depth).

MOAT ANALYSIS complete. Verdict per claimed differentiator (moat vs copyable), all code-cited: (1) Multi-vendor telephony - COPYABLE: the three provider adapters (retell/telnyx/twilio) and CarrierRouter are TODO stubs (twilioAdapter.ts:7, carrierRouter.ts:12,78-81), but multi-vendor is real at the edge-function dispatch layer (outbound-calling/index.ts:162,308-318,885-938). (2) White-label metered credits - COPYABLE mechanism, real data-gravity asset once populated: real schema (20260124_white_label_credits.sql:27-86), wired end-to-end (stripe-webhook:382,417; retell-call-webhook:2114; api-gateway:1043). (3) AI managers - COPYABLE and currently non-functional in prod: ai-autonomous-engine is 5645 LOC and real (index.ts:401,752) but its cron is unscheduled/launch-quarantined (20260713061000:5,16-26). (4) Pack system - COPYABLE thin abstraction: packs.ts is 122 LOC, all PackDefinition.routes empty (packs.ts:54,67,80); backend gating is real but the architecture is a registry, not a plugin framework. (5) Door to Door vertical - WEAK-to-MODERATE moat, deepest of the five, but a verbatim PORT of DoorBoss (DoorToDoorApp.tsx:4). REAL defensibility is off-list: data gravity + 199 migrations/495 RLS policies + carrier/GHL integration depth + D2D content.

## Artifact

**Findings**

VERDICT SUMMARY: Of the five claimed differentiators, NONE is a defensible moat in the hard-to-copy sense; all five are copyable features (weeks to months for a competent team). The durable switching-cost asset is cumulative and OFF-list: multi-tenant data gravity plus 199 migrations/495 RLS policies plus carrier/GHL integration depth plus the D2D vertical content. The codebase is genuinely valuable (a real product), but its differentiators are features, not moats.

ITEM 1 - Multi-vendor telephony: COPYABLE (real at the dispatch layer; the unified adapter + intelligent routing abstraction is unfinished scaffolding). FACT: all three provider adapters are TODO stubs that always return failure (twilioAdapter.ts:7,52-65; telnyxAdapter.ts:7,57-70; retellAdapter.ts:7,49-60) and CarrierRouter is a stub (carrierRouter.ts:12 TODO PR E, :78-81 empty loadProviderConfigs). BUT multi-vendor is REAL at the edge-function dispatch layer: outbound-calling/index.ts:162 supports provider retell|telnyx, :308-318 uses real API keys, :885-938 verifies live agents; twilio-sms-webhook is 1706 LOC of real SMS. The working capability is thin routing (local-presence area-code match, STIR/SHAKEN preference) anyone can replicate in weeks.

ITEM 2 - White-label metered credits: COPYABLE mechanism; the ledger becomes a real data-gravity asset only once populated. FACT: real schema - 20260124_white_label_credits.sql (org credits table :27-58, transactions ledger :92+, RLS :70-86) plus v2_enhanced (28KB), credit_ledger_schema_contract (40KB), agent_pricing_schema_contract (14KB). Wired end to end: add/reserve/finalize RPCs, credit-management (32KB), stripe-webhook:382,417 checkout-to-add_credits idempotent, retell-call-webhook:2114 post-call deduction, api-gateway:1043 daily-cap gate. Metered billing is standard SaaS - copyable in weeks.

ITEM 3 - AI managers: COPYABLE feature AND currently non-functional in production. FACT: ai-autonomous-engine is 5645 LOC and does real work (queues ai_action_queue :401, executes outbound-calling :752, 24 output dimensions), and MissionBriefingWizard.tsx/AutonomousAgentDashboard.tsx exist. BUT its cron is disabled: migration 20260713061000:5 says it is launch-quarantined and :16-26 unschedules ai-autonomous-engine-job with no enable switch. An LLM optimize-loop is replicable in weeks.

ITEM 4 - Pack system: COPYABLE thin abstraction; value is in pack content, not the registry. FACT: packs.ts is 122 LOC; backend gating is real (20261029010000_industry_packs.sql: org_has_pack SECURITY DEFINER :9-31, set_org_packs admin-only :42-84, allow-list :49). BUT all PackDefinition.routes are empty (packs.ts:54,67,80) so route gating is unimplemented; enablement is a jsonb array plus one sidebar tab and a single Dashboard case d2d-app.

ITEM 5 - Door to Door vertical: WEAK-to-MODERATE moat (deepest of the five) but it is a PORT of DoorBoss, so the IP/content originate elsewhere. FACT: 12 files, 7666 LOC; host.ts (~2078 lines) maps 20+ DoorBoss routes onto 9 d2d_* tables over 3 migrations; enroll.ts bridges doorstep follow-ups with consent/DNC gating (:167-173); coachRules.ts (28.6KB) and doorboss.css (35KB) are verbatim DoorBoss ports; DoorToDoorApp.tsx:4 says 'a port, not a re-implementation'; 4 tests incl. DoorToDoorGhlOptional. A competitor who built a canvassing app once can rebuild this in months.

OFF-LIST SWITCHING-COST ASSETS (the real defensibility): (a) 199 migrations and 495 CREATE POLICY statements = long multi-tenant schema/RLS history, expensive to replicate and risky to migrate away from; (b) data gravity - leads, campaigns, call_logs, sms, scheduled_follow_ups and the credit ledger all in one Postgres (ref emonjusymdripmkvtttc); (c) GHL integration depth - ghl-integration (1225), ghl-webhook-trigger (424), ghl-batch-callback (617), ghl-shadow-ingest (148), GHLFieldMappingTab (1352), useGoHighLevel (867); (d) operational maturity - unattended safety-backstop migrations. These, not the five claimed differentiators, are what a competitor cannot clone quickly.

**evidence**

- src/services/providers/twilioAdapter.ts:7 (TODO stub) and :52-65 createCall returns failed
- src/services/providers/telnyxAdapter.ts:7; retellAdapter.ts:7 (both TODO stubs)
- src/services/carrierRouter.ts:12 TODO PR E; :78-81 loadProviderConfigs empty
- supabase/functions/outbound-calling/index.ts:162 provider retell|telnyx; :308-318 real API keys; :885-938 live agent verification
- supabase/migrations/20260124_white_label_credits.sql:27-58 organization_credits, :92+ credit_transactions, :70-86 RLS
- supabase/functions/credit-management/index.ts (32KB); _shared/credit-purchase-policy.ts add/reserve/finalize
- supabase/functions/stripe-webhook/index.ts:382,417 add_credits idempotent; retell-call-webhook/index.ts:2114 deduct; api-gateway/index.ts:1043 cap gate
- supabase/functions/ai-autonomous-engine/index.ts:401 ai_action_queue insert; :752 executes outbound-calling; 5645 LOC
- supabase/migrations/20260713061000_disable_uncertified_autonomous_engine_cron.sql:5 quarantined; :16-26 unscheduled, no enable switch
- src/components/MissionBriefingWizard.tsx + AutonomousAgentDashboard.tsx exist
- src/lib/packs.ts:14 ids; :31 PackDefinition; :54,67,80 all routes empty; :103,113 packForTab/packForPath
- supabase/migrations/20261029010000_industry_packs.sql:9-31 org_has_pack SECURITY DEFINER; :42-84 set_org_packs admin-only; :49 allow-list
- src/packs/door_to_door/host.ts:1-35 (~2078 lines) maps 20+ routes onto 9 d2d_* tables over 3 migrations
- src/packs/door_to_door/enroll.ts:167-173 consent/DNC/phone gating
- src/packs/door_to_door/DoorToDoorApp.tsx:4 'a port, not a re-implementation'; coachRules.ts:3-5 verbatim port
- counts via shell: 199 migration .sql files, 495 CREATE POLICY statements, D2D pack 12 files/7666 LOC, 4 D2D tests
- GHL edge fns: ghl-integration, ghl-webhook-trigger, ghl-batch-callback, ghl-shadow-ingest; GHLFieldMappingTab.tsx 1352 LOC; useGoHighLevel.ts 867 LOC

**validation**

Opened every named file directly and cited line numbers. Counted via shell: 199 migration .sql files; 495 CREATE POLICY statements; D2D pack = 12 files/7666 LOC; 4 D2D test files; both AI-manager UI components confirmed on disk. Confirmed the AI-engine cron is unscheduled by reading the migration body. Every FACT claim is read from the file at the cited line. No repo writes, no live-system calls, no secrets printed.

**open_questions**

- Is the Retell+Telnyx multi-vendor dispatch actually exercised in production or only compiled scaffolding?
- Does the credit ledger hold real populated transaction history on the live org (data gravity only counts if there is data)?
- Is DoorBoss's vendored app.js licensed/owned such that the D2D port is defensible IP or a liability?

**what_i_did_not_check**

- Runtime/deployed state of the live Supabase project (emonjusymdripmkvtttc) - only repo code and migrations were read, so deployed crons/functions may differ from migration intent.
- Did not run D2D tests (tests exist asserted, not pass).
- Did not enumerate all 199 migrations/495 policies - counts from bulk shell, sample-read only.
- Did not verify ai-autonomous-engine correctness when enabled.
- Did not assess market/competition, so moat-vs-copyable is a code-structure judgment.
- Did not examine email/ads/cold-email/scraping surfaces beyond the app map inventory.

**confidence**: medium