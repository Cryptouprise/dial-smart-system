# security::rls-oldest-D-dec04-07

- status: completed
- tldr: 16 Dec-2025 tables: all RLS-enabled; daily_reports has using(true) write policies; 15 tables auth.uid()-only; embeds live anon JWT.

DONE: RLS audit of 10 Dec-2025 dial-smart migrations (16 tables). TOUCHED: none (research-only). RESULT: Every table has RLS ENABLED at creation. PERMISSIVE/ORG-BLIND: daily_reports INSERT WITH CHECK(true) @20251204055913:42-44 and UPDATE USING(true) @:46-48 (no WITH CHECK, can reassign user_id; no TO clause => PUBLIC/anon). FLAGGED (ONLY auth.uid()-based policies) = 15 tables: campaign_automation_rules, ai_chatbot_settings, autonomous_settings, agent_decisions, follow_up_sequences, sequence_steps, scheduled_follow_ups, agent_scripts, script_usage_logs, script_performance_metrics, script_suggestions, lead_scoring_settings, calendar_integrations, calendar_availability, calendar_appointments. SECRET: 20251204062700:16-17 embeds a live anon JWT in a pg_cron header (not reproduced). CROSS-CUTTING DRIFT: 20260108_phase2 later adds organization_id + rewrites policies for 4 of these tables (autonomous_settings, agent_scripts, calendar_integrations, follow_up_sequences); 20260601 later hardens daily_reports - so origin state != live.

## Artifact

**Findings**

16 tables created across 10 files; ALL have RLS ENABLED at creation (FACT). All are Dec-2025 pre-org-model: user_id + auth.uid() only, NO organization_id. PERMISSIVE/ORG-BLIND FLAG: daily_reports INSERT WITH CHECK (true) [20251204055913...:42-44] and UPDATE USING (true) [46-48] - the ONLY org-blind write policies in the set; any PUBLIC/anon/authenticated role can insert/update ANY row, and UPDATE (no WITH CHECK) can reassign user_id. FLAGGED (ONLY policies auth.uid()-based) = 15 tables: campaign_automation_rules, ai_chatbot_settings, autonomous_settings, agent_decisions, follow_up_sequences, sequence_steps, scheduled_follow_ups, agent_scripts, script_usage_logs, script_performance_metrics, script_suggestions, lead_scoring_settings, calendar_integrations, calendar_availability, calendar_appointments. SECRET-IN-MIGRATION: 20251204062700...:16-17 embeds a live anon JWT (role=anon) in a pg_cron job header - not reproduced; version-controlled credential, flag for rotation. REDUNDANT: script_performance_metrics has both FOR SELECT and FOR ALL auth.uid() policies [20251205200000:85-89]. Files with NO table/RLS: 20251204052716 (ALTER ai_sms_settings), 20251204062700 (ext+cron only), 20251206055249 (UPDATE phone_numbers), 20251207053845 (ALTER lead_scoring_settings ADD UNIQUE). CROSS-CUTTING DRIFT (FACT): 20260108_phase2_add_org_to_additional_tables.sql later adds organization_id + DROPs/rewrites user policies for autonomous_settings, agent_scripts, calendar_integrations, follow_up_sequences; 20260601 later drops daily_reports permissive policies. Origin state audited here != live for those tables.

**evidence**

- 20251204055913_240711f4...sql:35 ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;
- 20251204055913...sql:38-40 CREATE POLICY "Users can view their own reports" FOR SELECT USING (auth.uid() = user_id);
- 20251204055913...sql:42-44 CREATE POLICY "Service role can insert reports" FOR INSERT WITH CHECK (true);  <-- PERMISSIVE
- 20251204055913...sql:46-48 CREATE POLICY "Service role can update reports" FOR UPDATE USING (true);  <-- PERMISSIVE, no WITH CHECK
- 20251204061428...sql:31 ENABLE RLS campaign_automation_rules; :34-48 four policies all USING/WITH CHECK (auth.uid()=user_id)
- 20251204061428...sql:71 ENABLE RLS ai_chatbot_settings; :74-77 CREATE POLICY ... FOR ALL USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id)
- 20251205153218...sql:72-76 ENABLE RLS for autonomous_settings, agent_decisions, follow_up_sequences, sequence_steps, scheduled_follow_ups
- 20251205153218...sql:79-80 autonomous_settings FOR ALL USING auth.uid()=user_id; :83-87 agent_decisions SELECT/INSERT auth.uid(); :90-91 follow_up_sequences FOR ALL auth.uid(); :94-101 sequence_steps FOR ALL USING EXISTS(...user_id=auth.uid()); :104-105 scheduled_follow_ups FOR ALL auth.uid()
- 20251205200000_script_management.sql:68-71 ENABLE RLS for agent_scripts, script_usage_logs, script_performance_metrics, script_suggestions
- 20251205200000:74-75 agent_scripts FOR ALL auth.uid(); :78-82 script_usage_logs SELECT + INSERT auth.uid(); :85-89 script_performance_metrics SELECT + FOR ALL auth.uid(); :92-93 script_suggestions FOR ALL auth.uid()
- 20251207053541...sql:48 ENABLE RLS lead_scoring_settings; :51-54 FOR ALL USING auth.uid()=user_id
- 20251207054100...sql:112-114 ENABLE RLS calendar_integrations, calendar_availability, calendar_appointments; :117-124 three FOR ALL USING auth.uid()=user_id policies
- 20251204062700...sql:16-17 pg_cron job with embedded Bearer anon JWT (secret, not reproduced)
- 20251204052716...sql:1-9 ALTER ai_sms_settings ADD COLUMN only
- 20251206055249...sql:1-9 UPDATE phone_numbers only
- 20251207053845...sql:1-3 ALTER lead_scoring_settings ADD UNIQUE CONSTRAINT only
- 20260108_phase2_add_org_to_additional_tables.sql (later) ALTER ... ADD organization_id + DROP POLICY IF EXISTS for autonomous_settings/agent_scripts/calendar_integrations/follow_up_sequences
- 20260601173321...sql DROP POLICY 'Service role can insert/update reports' on daily_reports (later hardening)

**validation**

Read all 10 target files line-by-line; grepped the migrations directory for every in-scope table name to confirm no additional CREATE POLICY in these files and to detect later 20260108 org retrofit and 20260601 daily_reports hardening. Every claim carries file:line. No live DB connection (research-only), so classifications are source-derived only.

**open_questions**

- Live schema unverified: migrations show org retrofit (20260108) for 4 tables and daily_reports hardening (20260601) but whether they ran in prod and whether other in-scope tables were since altered needs a live pg_policies/pg_class check.
- The anon JWT embedded in 20251204062700 (exp ~2064312247) - is it retired/rotated or current? (secret; needs key-rotation check, not printed).

**edge_cases_considered**

- Policies with no TO clause default to PUBLIC (includes anon role) - noted on the daily_reports true policies.
- FOR ALL with USING but no WITH CHECK: Postgres inherits USING as WITH CHECK, so autonomous_settings/follow_up_sequences/agent_scripts/calendar_* are internally consistent (not a bypass).
- sequence_steps scoping is indirect (EXISTS subquery) rather than a direct user_id column - still auth.uid()-based.
- Tables with only SELECT+INSERT policies (script_usage_logs, agent_decisions) leave UPDATE/DELETE default-deny for authenticated - intentional audit-trail pattern, noted so it is not mistaken for missing RLS.

**what_i_did_not_check**

- Did not query the live database (research-only; no connection) - create-time RLS/policies stated from source only; later migrations may differ.
- Did not enumerate policies created by OTHER migrations after Dec 2025 for campaign_automation_rules, ai_chatbot_settings, lead_scoring_settings, calendar_availability, calendar_appointments, sequence_steps, scheduled_follow_ups, agent_decisions, script_usage_logs/performance/suggestions, daily_reports - only confirmed the 4 tables touched by 20260108.
- Did not inspect whether these tables gained organization_id/rows later beyond the 4 confirmed.
- Did not verify GRANTs to anon/authenticated roles on these tables (policy-level analysis only).

**confidence**: medium