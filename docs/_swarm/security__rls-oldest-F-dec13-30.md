# security::rls-oldest-F-dec13-30

- status: completed
- tldr: RLS audit done: 9 tables created, all RLS-on-at-creation, all policies auth.uid()-based, no USING(true); 8 tables flagged org-blind (per-user only).

RLS audit of the 16 requested Dec 13-30 2025 migrations is complete. Only 7 files create tables (9 tables); the rest are ALTER/DML with no RLS work. Every created table enables RLS at creation. Every policy is auth.uid()-scoped; no USING(true) anywhere. retell_transfer_context is deny-all by design (service-role only). FLAGGED (only auth.uid()-based, no org scoping): ml_learning_data, script_performance_analytics, disposition_accuracy_tracking, system_optimization_insights, ai_conversations, ai_conversation_messages, inbound_transfers, active_ai_transfers. Confidence high. Node security::rls-oldest-F-dec13-30 complete.

## Artifact

**Findings**

RLS audit of 16 migrations (Dec 13-30 2025). Only 7 files create tables (9 tables): ml_learning_data, script_performance_analytics, disposition_accuracy_tracking, system_optimization_insights (all in 20251220063500_ml_learning_system.sql); ai_conversations + ai_conversation_messages (20251220162500_add_ai_conversations.sql); inbound_transfers (20251229000000_inbound_transfers.sql); retell_transfer_context (20251230015316...); active_ai_transfers (20251230143304...). The other files are pure ALTER/DML with no table creation and no policy changes. FACT: every new table enables RLS in the same migration that creates it. FACT: every CREATE POLICY is auth.uid()-scoped; the ONLY table without a policy is retell_transfer_context, which enables RLS with an explicit comment that no policies are made on purpose so only service-role can access it (deny-all, fail-closed). FACT: no policy uses USING(true) or grants public/org-wide access, so NONE are org-blind-leaky. HOWEVER all 8 policy-bearing tables are per-user (auth.uid()=user_id) with NO organization_id scoping, so under the multi-org model added later they are org-blind in the functional sense (no shared org visibility, no org key) though not a cross-tenant leak because auth.uid()=user_id cannot match another user. FLAG (ONLY auth.uid()-based policies): ml_learning_data, script_performance_analytics, disposition_accuracy_tracking, system_optimization_insights, ai_conversations, ai_conversation_messages, inbound_transfers, active_ai_transfers. Two of them (ai_conversations, active_ai_transfers) use a single FOR ALL policy with USING only and no explicit WITH CHECK (Postgres applies USING as WITH CHECK, so still user-scoped, but broad). Several tables omit a DELETE policy (fail-closed, not a hole).

**evidence**

- 20251220063500_ml_learning_system.sql:31 ENABLE RLS ml_learning_data; :33-35 SELECT USING auth.uid()=user_id; :37-39 INSERT WITH CHECK auth.uid()=user_id
- 20251220063500_ml_learning_system.sql:64 ENABLE RLS script_performance_analytics; :66-68 SELECT; :70-72 UPDATE USING; :74-76 INSERT WITH CHECK (all auth.uid())
- 20251220063500_ml_learning_system.sql:96 ENABLE RLS disposition_accuracy_tracking; :98-100 SELECT; :102-104 UPDATE; :106-108 INSERT (all auth.uid())
- 20251220063500_ml_learning_system.sql:132 ENABLE RLS system_optimization_insights; :134-136 SELECT; :138-140 UPDATE; :142-144 INSERT; :146-148 DELETE (all auth.uid())
- 20251220162500_add_ai_conversations.sql:24-25 ENABLE RLS both; :28-29 ai_conversations FOR ALL USING auth.uid()=user_id; :32-39 ai_conversation_messages FOR ALL USING EXISTS(parent.user_id=auth.uid())
- 20251229000000_inbound_transfers.sql:81 ENABLE RLS; :84-87 SELECT USING; :89-92 INSERT WITH CHECK; :94-98 UPDATE USING+WITH CHECK (all auth.uid()=user_id)
- 20251230015316_502a4377-524c-4ef2-a632-4466801cd6c4.sql:16 ENABLE RLS retell_transfer_context; :18 comment no RLS policies on purpose (service-role only)
- 20251230143304_3c1db463-2115-432a-9ca9-be3aa468d4c9.sql:25 ENABLE RLS active_ai_transfers; :28-31 FOR ALL USING auth.uid()=user_id
- DDL/DML-only (no table, no policy): 20251213222334 ALTER campaigns; 20251213223008 INSERT calendar_availability; 20251214164307 ALTER ai_sms_settings; 20251214165246 ALTER campaign_workflows; 20251214213751 UPDATE ai_sms_settings; 20251214221955 lead-dedup DML; 20251214231612 DELETE test lead; 20251216010254 ALTER voice_broadcasts; 20251216173855 ALTER voice_broadcasts; 20251230004642 ALTER call_logs UNIQUE; 20251230143913 ALTER leads address cols

**validation**

All 16 files read in full with findstr /n ^ so every file:line is verbatim. Confirmed no CREATE POLICY exists outside those enumerated and no USING(true) appears anywhere. Counted 9 tables created across 7 files; 7 files carry no table DDL.

**open_questions**

- Whether later migrations (20260108_phase2_add_org_to_core_tables.sql, 20261029142121_phase1_org_scope.sql, 20260713064000_dialing_queue_mutation_boundary.sql) ALTER these tables' RLS or add org_id columns after creation.
- Whether any SECURITY DEFINER function/view exposes retell_transfer_context or the auth.uid()-only tables to an authenticated/anon role.
- Whether auth.uid()-only scoping is business-acceptable once organizations exist, or needs org_id policies (manager judgement).

**what_i_did_not_check**

- Post-creation migrations that may alter/loosen these policies or add org_id columns.
- RLS/policy state of the pre-existing tables only ALTERed here (campaigns, calendar_availability, ai_sms_settings, campaign_workflows, voice_broadcasts, system_settings, call_logs, leads).
- Live database state; this is a static read of migration files only.
- Reachability of these tables through SECURITY DEFINER functions/views or anon-key paths.

**confidence**: high