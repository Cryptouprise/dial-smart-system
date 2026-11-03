# data-b-schema-eras

- status: completed
- tldr: Schema eras: 199 migrations = 11 stacked eras on one additive trunk; re-modelling confined to 2026-07 contracts. Confidence high.

LANE (b) SCHEMA ERAS done (research-only, no writes; scratch file deleted). 199 migrations grouped into 11 stacked eras on ONE additive trunk. Counts (measured): 2024-01=1, 2024-12=2, 2025-06=1, 2025-11=9, 2025-12=48, 2026-01=28, 2026-02=19, 2026-03=7, 2026-04=31, 2026-06=1, 2026-07=38, 2026-08=2, 2026-10=8, 2026-11=4 =199. Naming: 122 auto-generated uuid/CLI-named (burst confined to 2025-11..2026-04) vs 77 human-named. Q1: one continuous additive substrate, many chapters. Q2: overwhelmingly EXTENDED - 0 'DROP TABLE public', 137/199 files ALTER TABLE, 74 ADD COLUMN, 63 CREATE TABLE IF NOT EXISTS; re-modelling confined to 2 files, both 2026-07. Q3: 2026-07 contracts mostly ADD constraints/indices/tables and supersede FUNCTION definitions (credit_ledger_schema_contract.sql:268-279), not base tables. Confidence: high on counts/grouping and additive-vs-remodel; medium on theme labels (sampled, not all 199 read).

## Artifact

**Findings**

199 migrations form ONE continuous additive schema trunk with MANY stacked eras. ERA TABLE (name | range | count | themes | naming | implication):
1) Proto dialer | 2024-01..2024-12 | 3 | workflow_test_logs, disposition_metrics, edge_function_errors; single-user user_id=auth.uid() RLS | 100% human | began as a personal single-user tool.
2) Tooling switch | 2025-06 | 1 | stray CLI file | auto | repo starts tracking Supabase CLI output.
3) Dialer buildout | 2025-11..2025-12 | 57 | concurrency_management, advanced_dialer_features, multi_carrier_integration (retell/telnyx/twilio), script_management, ml_learning_system, add_ai_conversations, inbound_transfers, lead dedup | ~90% auto-uuid | peak velocity, one feature per file, additive.
4) Multi-tenancy retrofit | 2026-01 | 28 | phase2_organizations + phase2_add_org_to_core_tables + phase2_add_org_to_additional_tables; white_label_credits; daily-call reset; script analytics | mixed (7 human) | pivotal shift: org_id retrofit + RLS rewrite, but still ADD COLUMN IF NOT EXISTS.
5) Intelligence layer | 2026-02..2026-03 | 26 | ai_intelligence_upgrade, autonomous_engine_upgrade, campaign_strategist, lead_journey_intelligence, phases_5_8_learning, telnyx_voice_ai_platform, predictive_intelligence, autonomous_workflow_intelligence | mixed | AI/autonomy bolted on as new tables/functions.
6) API + ops | 2026-04 | 31 | api_keys, mint_api_key_helper, manager_notifications; heavy uuid churn | mostly auto | programmatic access layer.
7) Quiet | 2026-06 | 1 | stray | auto | gap.
8) HARDENING / CONTRACTS (flagship) | 2026-07 | 38 | *_contract/*_boundary/*_safety/*_ledger: lock_down_privileged_rpcs_and_definer_views, pin_function_search_path, canonicalize_add_credits_signature, canonical_ai_action_queue_contract, contact_safety_and_provider_idempotency, workflow_external_effect_ledger, sms_delivery_safety, multi_organization_routing_contract, credit_ledger_schema_contract, dnc_tenant_uniqueness_contract, dialing_queue_mutation_boundary, billing_ownership_boundary, call_log_evidence_boundary, ghl_shadow_ingest_lane, campaign_contact_release_gate, elite_email_* ledgers, external_observer_control_plane | human semantic, minute-stamped | regime change: security/audit correctness; FIRST and only era that also re-models drifted structures.
9) Product verticals | 2026-08 | 2 | law_firm_beta_leads, demo_funnel_events | human | new-market land grab.
10) Industry packs / wholesale | 2026-10 | 8 | wholesale_core (wh_* tables), industry_packs, phase1_org_scope, browser_phone, live_coach, sms_per_organization, billing_lock | human | sellable multi-company product.
11) Door-to-door pack | 2026-11 | 4 | subscription_status_vocabulary, door_to_door core/workspace/members | human | newest vertical, org-scoped port.
Naming split: 121 files are auto-generated Supabase-CLI uuid-named (YYYYMMDDHHMMSS_<uuid>.sql) plus 1 hyphen-form = 122 auto; 77 human semantic. Auto-gen burst confined to 2025-11..2026-04; human names dominate 2024 and 2026-07 onward.

ANSWER 1: ONE continuous additive substrate, MANY stacked chapters (single-user dialer -> feature buildout -> multi-tenant retrofit -> AI/autonomy -> hardened contracts -> productized verticals). Never forked, never reset.
ANSWER 2: Overwhelmingly EXTENDED, not re-modelled. 0 'DROP TABLE public'; 137/199 files ALTER TABLE; 74 ADD COLUMN; 63 CREATE TABLE IF NOT EXISTS. Re-modelling (RENAME/DROP COLUMN) occurs in exactly 2 files, both 2026-07.
ANSWER 3: The 2026-07 contracts predominantly ADD (constraints, indices, new tables/functions) and constrain earlier tables; they do NOT drop/recreate base tables (agent_pricing uses CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS; credit_ledger keeps credit_transactions/organization_credits intact). They DO supersede prior FUNCTION definitions (credit_ledger_schema_contract.sql:268-279 drops old add_credits/reserve_credits/finalize_call_cost signatures and recreates canonical ones) and are the only era that re-models drifted columns. Net: supersede function contracts + tighten table constraints; augment, not replace, table definitions.

**evidence**

- dir /b supabase/migrations | find /c -> 199 files (FACT)
- per-month prefix counts: 202412=2, 202506=1, 202511=9, 202512=48, 202601=28, 202602=19, 202603=7, 202604=31, 202607=38, 202606+202608+202610+202611=15; plus 20240115=1 => 199 (FACT)
- findstr for 'DROP TABLE public'/'DROP TABLE IF EXISTS public' -> 0 hits; only DROP TABLE statements are temp tables: 20260108_phase2_add_org_to_core_tables.sql:334 'DROP TABLE IF EXISTS _default_org', 20260108_phase2_add_org_to_additional_tables.sql:271, 20251214221955_8054901e....sql:122 'DROP TABLE IF EXISTS duplicate_leads' (FACT)
- findstr -m ALTER TABLE -> 137/199 files; ADD COLUMN -> 74 files; CREATE TABLE IF NOT EXISTS -> 63 files (FACT)
- findstr RENAME COLUMN/RENAME TO -> only 2 files: 20260713060000_credit_ledger_schema_contract.sql:26 (type->transaction_type) and 20260713075000_ghl_shadow_reconciliation_export.sql (RENAME TO record_ghl_shadow_ingest_receipt_core) (FACT)
- 20260713060000_credit_ledger_schema_contract.sql:42,84 DROP COLUMN type / stripe_payment_intent_id; :51-58 ADD COLUMN IF NOT EXISTS; :127-183 ADD/drop constraints+indices; :244-258 organization_credits balance constraints; :268-279 DROP FUNCTION old add_credits/reserve_credits/finalize_call_cost then recreate (FACT)
- 20260713070000_agent_pricing_schema_contract.sql:7-46 CREATE TABLE IF NOT EXISTS public.pricing_tiers/agent_pricing then ALTER ADD COLUMN IF NOT EXISTS to converge live shape (FACT)
- 20260108_phase2_add_org_to_core_tables.sql:23-24 ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS organization_id; :32 SET NOT NULL; :38-68 drop old user-only policies and create org-aware ones (FACT)
- 20261028210000_wholesale_core.sql:4 comment: 'Purely additive: new wh_* tables, two helper functions, RLS. Touches no existing table, function or policy.' (FACT)
- 20240115_workflow_test_logs.sql:2,26 earliest: CREATE TABLE IF NOT EXISTS + RLS policy 'Users can view their own test logs' USING (auth.uid()=user_id) => single-user era (FACT)
- keyword file counts: telnyx=19, retell=37, api_key=14, organization=53, CREATE POLICY=95, autonomous=21 (FACT)

**validation**

Recounted totals three ways (per-month prefix sum=199; manual listing=199). Cross-checked the additive claim with literal findstr for DROP TABLE public (0), ALTER TABLE (137 files), ADD COLUMN (74), CREATE TABLE IF NOT EXISTS (63), RENAME COLUMN (2). Read full credit_ledger_schema_contract.sql (1026 lines) and heads of agent_pricing_schema_contract, phase2_add_org_to_core_tables, 20240115_workflow_test_logs, 20251201000000_multi_carrier_integration, 20261028210000_wholesale_core, 20261102234500_door_to_door_core. Read review contract at docs/dial-smart-app-map.md:159-174.

**open_questions**

- Are the 10 live-only 2026-08-28 migrations under docs/wholesale/audit/phase1/live_only/ (absent from supabase/migrations) an un-reconciled repo-vs-live gap? Direct evidence of drift; not fully verified in scope.
- Does any 2025-11/12 auto-generated file drop a table via dynamic SQL (EXECUTE 'DROP TABLE...'), which a literal grep would miss?

**what_i_did_not_check**

- Did not read all 199 files end-to-end; era themes come from keyword file-counts (telnyx=19, retell=37, api_key=14, organization=53, CREATE POLICY=95, autonomous=21) plus sampled heads, so theme labels are directional not exhaustive.
- Did not query the live DB / supabase_migrations.schema_migrations; analysis is repo-file only.
- Did not inspect the 10 extra live_only 2026-08-28 migration files outside supabase/migrations (flagged as an open question).
- Did not run git log to see whether any migration was ever deleted from the repo.
- Did not scan for dynamic-SQL DROP TABLE inside DO blocks beyond the literal grep.

**confidence**: high