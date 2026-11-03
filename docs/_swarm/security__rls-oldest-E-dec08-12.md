# security::rls-oldest-E-dec08-12

- status: completed
- tldr: 22 tables, all RLS-on, all auth.uid()=user_id; no org_id/org policies (user-scoped only); public broadcast-audio bucket allows any authed upload

RLS audit of 11 Dec-2025 migrations complete. 22 tables created; ALL have RLS enabled at creation and ALL use auth.uid()=user_id (or EXISTS via parent owner). Zero org-blind tables, zero USING(true) on tables. Flag: all 22 are user-scoped only with no organization_id/org policy (predate the 20260108 org model) - per-user scope, not a cross-tenant leak. Two files (20251207150153, 20251208023834) create no tables. Storage: public 'broadcast-audio' bucket has an any-authenticated-user INSERT policy with no ownership check.

## Artifact

**Findings**

Audited 11 migrations (Dec 7-12 2025) creating 22 tables + 3 storage.objects policies. Every one of the 22 tables has RLS ENABLED at creation, and every table's policies are user-scoped auth.uid()=user_id (or EXISTS via parent owner). NONE is org-blind (all carry user_id) and NONE uses USING(true). KEY FINDING: all 22 tables are user-scoped only, with no organization_id and no org-membership policy. They predate the org model (20260108_phase2_organizations.sql) and 20260108_phase2_add_org_to_core_tables.sql / _additional_tables.sql, so this is a per-user scope, not a cross-tenant leak (auth.uid() is strictly narrower than org scope). Secondary findings: (1) storage.objects policy in 20251210010622 grants ANY authenticated user INSERT into the public 'broadcast-audio' bucket with no ownership check (bucket set public=true, so it is also publicly readable); (2) spending_logs and workflow_test_logs have only SELECT/INSERT policies (no UPDATE/DELETE) = default-deny, safe; (3) workflow_test_logs.user_id is nullable; (4) FOR ALL policies omit explicit WITH CHECK but Postgres defaults WITH CHECK to the USING expression for FOR ALL, so inserts are still keyed to user_id.

**evidence**

- 20251208035156_fd3f07ec:67-70 ALTER TABLE ... ENABLE ROW LEVEL SECURITY (campaign_workflows, workflow_steps, lead_workflow_progress, disposition_auto_actions)
- 20251208035156_fd3f07ec:73 CREATE POLICY campaign_workflows FOR ALL USING (auth.uid()=user_id)
- 20251208035156_fd3f07ec:76-77 CREATE POLICY workflow_steps FOR ALL USING (EXISTS campaign_workflows user_id=auth.uid())
- 20251208035156_fd3f07ec:80 CREATE POLICY lead_workflow_progress FOR ALL USING (auth.uid()=user_id)
- 20251208035156_fd3f07ec:83 CREATE POLICY disposition_auto_actions FOR ALL USING (auth.uid()=user_id)
- 20251208040507_19b4e982:56-58 ENABLE RLS (lead_reachability_scores, reachability_events, ai_workflow_generations)
- 20251208040507_19b4e982:61-63 FOR ALL USING (auth.uid()=user_id) x3
- 20251209070143_d04c49b6:76-77 ENABLE RLS (voice_broadcasts, broadcast_queue)
- 20251209070143_d04c49b6:80-83 voice_broadcasts FOR ALL USING (auth.uid()=user_id)
- 20251209070143_d04c49b6:86-94 broadcast_queue FOR ALL USING EXISTS voice_broadcasts.user_id=auth.uid()
- 20251210010622_7901ac13:7-9 storage.objects FOR SELECT USING (bucket_id='broadcast-audio') [public read]
- 20251210010622_7901ac13:12-14 storage.objects FOR INSERT WITH CHECK (bucket_id='broadcast-audio' AND auth.role()='authenticated') [any authed user]
- 20251210010622_7901ac13:17-19 storage.objects FOR ALL USING (bucket_id='broadcast-audio' AND auth.role()='service_role')
- 20251210183742_1833cbf4:68-71 ENABLE RLS (budget_settings, spending_logs, spending_summaries, budget_alerts)
- 20251210183742_1833cbf4:74-76 budget_settings FOR ALL USING (auth.uid()=user_id)
- 20251210183742_1833cbf4:79-85 spending_logs FOR SELECT USING + FOR INSERT WITH CHECK (auth.uid()=user_id); no UPDATE/DELETE
- 20251210183742_1833cbf4:88-95 spending_summaries + budget_alerts FOR ALL USING (auth.uid()=user_id)
- 20251211041547_a77f9fed:44,71,100 ENABLE RLS (campaign_phone_pools, phone_providers, lead_nudge_tracking)
- 20251211041547_a77f9fed:47-50,74-77,103-106 FOR ALL USING (auth.uid()=user_id) x3
- 20251212001827_947a57c5:40 ENABLE RLS sip_trunk_configs; 43-57 SELECT/INSERT/UPDATE/DELETE policies USING/WITH CHECK (auth.uid()=user_id)
- 20251212013726_27ea1b67:23 ENABLE RLS workflow_test_logs; 26-34 FOR SELECT USING + FOR INSERT WITH CHECK (auth.uid()=user_id); user_id nullable (line 4)
- 20251212142142_a2db3547:58-61 ENABLE RLS (ai_feedback, ai_learning, ai_session_memory, ai_daily_insights)
- 20251212142142_a2db3547:64-77 FOR ALL USING (auth.uid()=user_id) x4
- 20251207150153_59843a12: no CREATE TABLE (only ALTER TABLE calendar_integrations ADD CONSTRAINT UNIQUE)
- 20251208023834_29d62ad4: no CREATE TABLE (ALTER phone_numbers / sms_conversations ADD COLUMN)

**validation**

Read all 11 files in full; used findstr /n to capture exact line numbers for every ENABLE ROW LEVEL SECURITY and CREATE POLICY statement. Confirmed table count = 22. Cross-checked that no table lacks an ENABLE RLS line and none uses USING(true). No live DB connection was made; findings are static analysis of migration text only.

**open_questions**

- Do any later migrations (20260108_phase2_add_org_to_core_tables.sql / _additional_tables.sql) ADD organization_id + org policies to these 22 tables, or are they still user-scoped today? (out of scope for this node)
- Is the public 'broadcast-audio' bucket's any-authenticated-INSERT policy a real tenant-isolation concern in the current app, or are uploads gated elsewhere?

**what_i_did_not_check**

- Whether later migrations retrofit organization_id / org-scoped RLS onto any of these 22 tables (only the creation-time state was audited, per task scope)
- The actual live database policy state (no psql/Supabase access used)
- Other storage buckets and storage.objects policies created outside these 11 files
- Tables altered (not created) in these files: calendar_integrations, phone_numbers, sms_conversations, campaigns, leads, dispositions

**confidence**: high