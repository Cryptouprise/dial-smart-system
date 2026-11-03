# security::rls-oldest-H-orgblind

- status: completed
- tldr: RLS inventory of 61 oldest migrations: 8 permissive USING(true)/CHECK(true), 3 public-read, ~85 org-blind, 1 deny-all table.

DONE: Inventoried org-blind/permissive RLS policies across the 61 oldest-era migration files (2024/2025, pre-20260104), C:/Users/charl/dial-smart-system/supabase/migrations. TOUCHED: none (research only).

TIER1 - USING(true)/WITH CHECK(true), no role predicate (any role): disposition_metrics UPDATE 20241218_disposition_metrics.sql:69-70 (worst); daily_reports UPDATE 20251204055913_240711f4-...sql:46-48; disposition_metrics INSERT :61-64; edge_function_errors INSERT 20241218_edge_function_errors.sql:39-42; daily_reports INSERT 20251204055913:42-44; predictive_dialing_stats INSERT 20251109171900_concurrency_management.sql:61-63; rotation_history INSERT 20250619152448-...sql:88-89 (later tightened); system_health_logs SELECT USING(true) 20250619152448:107-108 + INSERT :110 (later tightened to admin-only 20251103034349:83-94).

TIER2 - public read: storage.objects broadcast-audio SELECT TO public 20251211220758_74c0ca0f-...sql:17-21; SELECT 20251210010622_7901ac13-...sql:7-9; INSERT WITH CHECK(bucket_id + auth.role()=authenticated) 20251210010622:12-14 (any authenticated user can write into shared bucket, no path ownership).

TIER3 - ~85 org-blind auth.uid()=user_id-only policies across ~60 tables (full list in artifact), e.g. phone_providers 20251201000000:30-42; lead_reachability_scores 20251208040507:61-63; ai_conversations 20251220162500:29.

RLS-enabled-zero-policy (deny-all, intended): exactly ONE - public.retell_transfer_context 20251230015316_502a4377-...sql:16-18. NO RLS-off tables in era (all 31 CREATE TABLE files enable RLS). No literal TO anon in era.

VALIDATION: 61-file boundary confirmed; grepped 6 patterns; read all 32 policy-bearing era files in full; cross-checked 3 file-set diffs. COULD_NOT: n/a (migrations only, live DB/grants not verified). CONFIDENCE: high.

FOLLOW-UPS: verify 2026 org migrations remediate TIER1/2; confirm product intent (if multi-user-per-org, all ~85 TIER3 are intra-org leaks); check broadcast-audio bucket public flag + grants.

## Artifact

**Findings**

TIER 1 - PERMISSIVE `USING(true)`/`WITH CHECK(true)` with NO role restriction (implicitly TO public; any role): (1) public.disposition_metrics UPDATE USING(true) 20241218_disposition_metrics.sql:69-70 [WORST - name says service role but no role predicate]; (2) public.daily_reports UPDATE USING(true) 20251204055913_240711f4-...sql:46-48; (3) public.disposition_metrics INSERT WITH CHECK(true) :61-64; (4) public.edge_function_errors INSERT WITH CHECK(true) 20241218_edge_function_errors.sql:39-42; (5) public.daily_reports INSERT WITH CHECK(true) 20251204055913...:42-44; (6) public.predictive_dialing_stats INSERT WITH CHECK(true) 20251109171900_concurrency_management.sql:61-63; (7) public.rotation_history INSERT WITH CHECK(true) 20250619152448-...sql:88-89 (later dropped/replaced); (8) public.system_health_logs SELECT USING(true) 20250619152448-...sql:107-108 (later dropped/replaced).

TIER 2 - PUBLIC read exposure: (9) storage.objects bucket broadcast-audio SELECT TO public USING(bucket_id=broadcast-audio) 20251211220758_74c0ca0f-...sql:17-21; (10) storage.objects bucket broadcast-audio SELECT USING(bucket_id=broadcast-audio) 20251210010622_7901ac13-...sql:7-9; (11) 20251210010622:12-14 INSERT WITH CHECK(bucket_id=broadcast-audio AND auth.role()=authenticated) = any authenticated user may write into the shared bucket (no per-user path ownership), looser than 20251211220758:11-14 which adds auth.uid()::text=(storage.foldername(name))[1].

TIER 3 - ORG-BLIND (only predicate auth.uid()=user_id, no organization/tenant boundary): ~85 policies across ~60 tables. Tables: phone_numbers, dispositions, pipeline_boards, lead_pipeline_positions, rotation_settings, number_orders, yellowstone_settings, dialing_queue_priorities, system_settings, advanced_dialer_settings, dnc_list, timezone_rules, caller_id_pool, contact_list_filters, phone_providers, provider_numbers, carrier_configs, call_signatures, rvm_queue, sms_messages, follow_ups, sms_conversations, sms_context_history, ai_sms_settings, predictive_dialing_stats, retell_business_profiles, retell_verified_numbers, retell_branded_calls, daily_reports, campaign_automation_rules, ai_chatbot_settings, autonomous_settings, agent_decisions, follow_up_sequences, sequence_steps, scheduled_follow_ups, agent_scripts, script_usage_logs, script_performance_metrics, script_suggestions, lead_scoring_settings, calendar_integrations, calendar_availability, calendar_appointments, campaign_workflows, workflow_steps, lead_workflow_progress, disposition_auto_actions, lead_reachability_scores, reachability_events, ai_workflow_generations, voice_broadcasts, broadcast_queue, budget_settings, spending_logs, spending_summaries, budget_alerts, campaign_phone_pools, lead_nudge_tracking, sip_trunk_configs, workflow_test_logs, ai_feedback, ai_learning, ai_session_memory, ai_daily_insights, ml_learning_data, script_performance_analytics, disposition_accuracy_tracking, system_optimization_insights, ai_conversations, ai_conversation_messages, inbound_transfers, active_ai_transfers. All use FOR ALL/SELECT/INSERT/UPDATE/DELETE USING(auth.uid()=user_id) or the subquery-via-parent variant; none reference an organization/company/tenant column.

RLS-ENABLED-ZERO-POLICY (deny-all, intended): exactly ONE table - public.retell_transfer_context (20251230015316_502a4377-...sql:16-18, comment 'No RLS policies on purpose').

NO RLS-OFF tables: all 31 CREATE TABLE-bearing era files also ENABLE RLS for their tables.

No literal TO anon policy exists in the era; public exposure is via TO public (storage) and USING(true) (system_health_logs).

**evidence**

- 20241218_disposition_metrics.sql:69-70
- 20241218_edge_function_errors.sql:39-42
- 20250619152448-97fb6549-a522-4654-a60c-9cd1f5ea5e81.sql:88-89,107-108,110
- 20251109171900_concurrency_management.sql:61-63
- 20251204055913_240711f4-13e2-49b9-b726-4c9705235983.sql:42-48
- 20251210010622_7901ac13-fe4a-4b52-8a45-1d3ed0a8a21c.sql:7-9,12-14
- 20251211220758_74c0ca0f-3774-4fee-b5ef-12c9d4fd9176.sql:10,17-21,27,37
- 20251230015316_502a4377-524c-4ef2-a632-4466801cd6c4.sql:16-18
- 20251103034349_d8aa891c-617a-4d2f-a0e1-5d250f6a27e1.sql:16-19

**validation**

Era set = 61 files (2024/2025 filenames, boundary <20260104) confirmed against dir listing. Grepped 6 patterns (create policy, enable row level security, create table, using(true), with check(true), ^TO (anon|public|authenticated), for all) across the era. Read all 32 policy-bearing era files in full to capture exact predicate text. Cross-checked RLS-enabled vs CREATE-POLICY file lists (diff = retell_transfer_context) and CREATE-TABLE vs RLS-enabled (diff = none).

**open_questions**

- Does the deployed DB match these migrations, or were grants changed out-of-band?
- Are Supabase default GRANTs present for anon/authenticated? If anon lacks grants, USING(true) is still an intra-authenticated cross-tenant leak.
- For TIER 3 tables: is the product now multi-user-per-org (2026 org model)? If so every one of the ~85 policies is an intra-org cross-user leak.
- Does the broadcast-audio bucket public flag + storage grants expose files beyond the bucket policy?

**edge_cases_considered**

- storage.objects policies are not table RLS but bucket policies - included because task lists anon/public exposure
- policies with no explicit TO clause default to PUBLIC role
- later migrations dropping earlier permissive policies (superseded, not removed from history)

**what_i_did_not_check**

- Whether 2026 migrations fully remediate every TIER-1/TIER-2 item (out of era scope).
- Live database state and actual Supabase default privileges/grants.
- Non-public schema objects and SECURITY DEFINER function predicates (separate node).
- Boundary files at 20260104 (assumed excluded per instructions).

**confidence**: high