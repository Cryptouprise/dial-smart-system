# security::rls-oldest-G-later-adds

- status: completed
- tldr: 64/64 oldest tables RLS at creation; column is organization_id not org_id; 13/64 got org scoping later, 51/64 none.

DONE: Determined, for all 64 oldest-era tables, whether RLS was enabled at creation and whether org scoping (organization_id) was added later, scanning the entire migrations dir incl. 20260108_phase2_* and later 2026 files.

KEY RESULT — the org column is `organization_id`, NOT `org_id`. A literal `org_id` grep returns ZERO hits for any target, so keying an audit on `org_id` is wrong.

Per-table (RLS-at-creation | org column | later policy changes):
- workflow_test_logs: Y (20240115:23) | NONE | policies 20240115:26,31
- disposition_metrics: Y (20241218:52) | organization_id phase2 additional:210 | phase2 additional 221-232
- edge_function_errors: Y (20241218:30) | NONE | 20260701132102:119-120; 20260720232851:35
- rotation_settings: Y (20250619...:80) | NONE | :81
- rotation_history: Y (:85) | NONE | 20251103035736:8
- number_orders: Y (:92) | NONE | :93
- user_roles: Y (20251103034349:52) | NONE | none
- user_credentials: Y (20251103034349:110) | NONE | 20260713063000:8,21,44
- dispositions: Y (20251103034801:19) | organization_id phase2 core:290 + phase1:9 | phase2 core 301-331; phase1 78-85
- pipeline_boards: Y (:52) | organization_id phase2 additional:238 + phase1:10 | phase2 additional 249-268; phase1 78-85
- lead_pipeline_positions: Y (:86) | organization_id phase1:11 | phase1 78-85
- system_settings: Y (20251109171900:20) | NONE | none
- predictive_dialing_stats: Y (:53) | NONE | none
- dialing_queue_priorities: Y (:82) | NONE | none
- advanced_dialer_settings: Y (20251109172000:17) | NONE | none
- dnc_list: Y (20251109172000:45) | organization_id phase2 additional:20 + phase1:8 | phase2 additional 31-45; phase1 78-85; 20260712040000:105-131; 20260713073000:19,40-56
- timezone_rules: Y (:71) | NONE | none
- phone_providers: Y (20251201000000:25) | NONE | none
- provider_numbers: Y (:65) | NONE | none
- carrier_configs: Y (:99) | NONE | none
- sms_conversations: Y (20251201051159:74) | organization_id 20261029190000:17 | 20261029190000:167/189-192
- sms_messages: Y (20251201000000:191 & :75) | organization_id 20261029190000:18 | same loop
- sms_context_history: Y (:76) | organization_id 20261029190000:19 | same loop
- retell_business_profiles/verified_numbers/branded_calls: Y (20251201054755:56/57/58) | NONE | none
- daily_reports: Y (20251204055913:35) | NONE | 20260601173321:41-42
- campaign_automation_rules: Y (20251204061428:31) | NONE | none
- ai_chatbot_settings: Y (:71) | NONE | none
- autonomous_settings: Y (20251205153218:72) | organization_id phase2 additional:80 | 91-100
- agent_decisions: Y (:73) | NONE | none
- follow_up_sequences: Y (:74) | organization_id phase2 additional:175 | 186-205
- agent_scripts: Y (20251205200000:68) | organization_id phase2 additional:105 | 116-135
- script_usage_logs: Y (:69) | NONE | none
- script_performance_metrics: Y (:70) | NONE | none
- lead_scoring_settings: Y (20251207053541:48) | NONE | none
- calendar_integrations: Y (20251207054100:112) | organization_id phase2 additional:140 | 151-170; 20260713130000:12,26,53
- calendar_availability: Y (:113) | NONE | none
- calendar_appointments: Y (:114) | NONE | none
- campaign_workflows: Y (20251208035156:67) | NONE | :73
- workflow_steps: Y (:68) | NONE | :76
- lead_workflow_progress: Y (:69) | NONE | :80
- lead_reachability_scores: Y (20251208040507:56) | NONE | :61
- reachability_events: Y (:57) | NONE | :62
- ai_workflow_generations: Y (:58) | NONE | :63
- voice_broadcasts: Y (20251209070143:76) | organization_id phase2 core:166 | phase2 core 177-207
- broadcast_queue: Y (:77) | NONE | none
- budget_settings/spending_logs/spending_summaries: Y (20251210183742:68/69/70) | NONE | none
- campaign_phone_pools: Y (20251211041547:44) | NONE | none
- lead_nudge_tracking: Y (:100) | NONE | none
- sip_trunk_configs: Y (20251212001827:40) | NONE | none
- ai_feedback/ai_learning/ai_session_memory: Y (20251212142142:58/59/60) | NONE | :64/68/72
- ml_learning_data: Y (20251220063500:31) | NONE | none
- script_performance_analytics: Y (:64) | NONE | none
- disposition_accuracy_tracking: Y (:96) | NONE | none
- ai_conversations / ai_conversation_messages: Y (20251220162500:24/25) | NONE | :28/32
- inbound_transfers: Y (20251229000000:81) | NONE | :84,89,94
- retell_transfer_context: Y (20251230015316:16) | NONE | 20260409195518:2-3
- active_ai_transfers: Y (20251230143304:25) | NONE | none

TOTALS: 64/64 RLS-enabled at creation; 13/64 got organization_id later; 51/64 have NO org column.
CONTRADICTION (flag): phase1_org_scope.sql:4-5 claims the 4 config tables lacked organization_id on 10/28, but phase2 added it on 2026-01-08 — implies phase2 may not have been applied live (THEORY; needs live schema check).

TOUCHED: none (read-only).
EVIDENCE: findstr scans over C:/Users/charl/dial-smart-system/supabase/migrations/*.sql (199 files); full reads of phase1/phase2 org files and boundary files cited above.
COULD_NOT: no live DB access, so this is migration-file evidence only.
CONFIDENCE: high on grep facts, medium on deployed state.

## Artifact

**Findings**

All 64 oldest-era tables had RLS ENABLED AT CREATION (Y) in their creation-era migration (a handful re-enabled idempotently in later files). CRITICAL: the org-scope column is named `organization_id`, NOT `org_id` — a literal grep for `org_id` returns zero hits for every target table, so any audit keyed on `org_id` is wrong. Org scoping was added LATER (Jan 2026 phase2 + Oct 2026 phase1) to 13 of the 64 targets: dispositions, pipeline_boards, lead_pipeline_positions, dnc_list, disposition_metrics, voice_broadcasts, autonomous_settings, agent_scripts, calendar_integrations, follow_up_sequences, sms_conversations, sms_messages, sms_context_history. The other 51 targets have NO organization_id and NO org scoping anywhere (still user_id-based RLS only). CONTRADICTION: 20261029142121_phase1_org_scope.sql:4-5 asserts dnc_list/dispositions/pipeline_boards/lead_pipeline_positions have no organization_id as of 10/28, yet 20260108_phase2_add_org_to_core/additional_tables.sql added it on 2026-01-08 — so either the phase2 migrations never reached the live DB, or phase1 re-added defensively (ADD COLUMN IF NOT EXISTS). THEORY (not verified against live DB).

**evidence**

- RLS-enable scan over all 199 *.sql: 64/64 targets matched; e.g. workflow_test_logs 20240115:23, dispositions 20251103034801:19, dnc_list 20251109172000:45, sms_messages 20251201000000:191 & 20251201051159:75, active_ai_transfers 20251230143304:25
- org column name FACT: 20260108_phase2_add_org_to_core_tables.sql:290-291 (dispositions ADD COLUMN organization_id), phase2_add_org_to_additional_tables.sql:20-21 dnc_list / :80-81 autonomous_settings / :105-106 agent_scripts / :140-141 calendar_integrations / :175-176 follow_up_sequences / :210-211 disposition_metrics / :238-239 pipeline_boards; core :166-167 voice_broadcasts
- phase1 org on 4 tables: 20261029142121_phase1_org_scope.sql:8 dnc_list, :9 dispositions, :10 pipeline_boards, :11 lead_pipeline_positions ADD COLUMN IF NOT EXISTS organization_id
- phase1 company-member policies (DO-loop, tables at :65/:77/:114): dnc_list, dispositions, pipeline_boards, lead_pipeline_positions; CREATE at :82-85
- SMS org: 20261029190000_sms_per_organization.sql:17 sms_conversations, :18 sms_messages, :19 sms_context_history ADD COLUMN organization_id; policy DO-loop tables at :167/:184, CREATE :189-192
- policy changes: user_credentials 20260713063000:8,21,44; dnc_list 20260713073000:6,19,40-56 and 20260712040000:105-131; calendar_integrations 20260713130000:12,26,53; edge_function_errors 20260701132102:119-120 and 20260720232851:35; daily_reports 20260601173321:41-42; retell_transfer_context 20260409195518:2-3; rotation_history 20251103035736:8

**validation**

Read-only findstr scans reproduced deterministically (ran the target-table filter twice). Cross-checked the two phase2 org files and the two phase1 org files line-by-line by reading full file contents, not just grep hits, so the organization_id-vs-org_id naming and the DO-loop table arrays are FACTS from file:line.

**open_questions**

- Was 20260108_phase2_add_org_to_* actually applied to the live Supabase DB? phase1's 10/28 comment implies the 4 tables still lacked organization_id, which contradicts phase2 having added it on 01-08. Needs a live information_schema.columns check.
- 51 target tables still have no org column: confirm whether user_id-only RLS is an accepted multi-tenant model for these (config/log tables) or an unremediated gap.
- Do later migrations (20261029010000 industry_packs, 20261102234500/20261103020000 door-to-door) add organization_id to any of the 51 via a mechanism not matching the literal table name on the same line?

**what_i_did_not_check**

- Live DB state (no information_schema query) — this is migration-file evidence only, not proof of what is deployed.
- The full contents of 20261029010000_industry_packs.sql, 20261102234500_door_to_door_core.sql, 20261103023000_door_to_door_members.sql, and 20260712070000_multi_organization_routing_contract.sql for bulk/indirect org-scoping of the 51 remaining tables.
- Whether any policy for a target was dropped/created via a fully dynamic format() string that does not contain the table literal (would evade the grep).
- Column-level GRANT changes and SECURITY DEFINER view exposure for the target tables.

**confidence**: high