# security::rls-oldest-I-jan4-7

- status: completed
- tldr: All 11 pre-org-model Jan4-7 tables RLS-enabled in same file; no RLS-off table. Only finding: 2 permissive WITH CHECK(true) INSERT policies (system_alerts, calendar_tool_invocations).

ERA-BOUNDARY RLS AUDIT (node security::rls-oldest-I-jan4-7) — DONE.

Scope: all 11 *.sql in the 20260104/05/07 window (20260108 phase2 excluded), canonical repo C:/Users/charl/dial-smart-system/supabase/migrations (dialer-ghl-buddy replica byte-identical).

RESULT (headline): NO RLS-off table exists. Every one of the 11 CREATE TABLE statements is matched in the same file by `ALTER TABLE <t> ENABLE ROW LEVEL SECURITY` (11/11).

Tables + enablement (file:line):
- system_alerts 20260104213053:20; calendar_tool_invocations :49
- learning_outcomes 20260105024224:63; autonomous_goals :64; lead_priority_scores :65
- ghl_sync_settings 20260105203936:19
- smart_lists 20260107024232:24; lead_list_memberships :25
- agent_improvement_history 20260107031814:46; lj_memory :47
- disposition_metrics 20260107140730:34

Policy classes: 8 tables fully auth.uid()-based; lead_list_memberships auth.uid()-equivalent via EXISTS(parent smart_lists.user_id). 2 PERMISSIVE INSERT policies `WITH CHECK (true)` with no TO clause => apply to PUBLIC incl. anon: system_alerts (20260104213053:31-33) and calendar_tool_invocations (:56-58). That is the only material finding (low-medium: audit/monitoring-table write spoofing; intended 'System can insert' but not role-gated). No role-gated policies, no USING(true) reads. Deny-by-default gaps (secure): no DELETE on learning_outcomes/autonomous_goals/system_alerts, no UPDATE/DELETE on calendar_tool_invocations, no UPDATE on lead_list_memberships.

ALTER-only files (N/A for RLS, inherit existing table RLS): 20260105210531, 20260105211958, 20260105225115, 20260107014918, 20260107024252.

Validation: full read with line numbers + mechanical PowerShell grep reconcile (CREATE TABLE=11, same-file ENABLE=11, unguarded=0, WITH CHECK(true)=2). Replica hash parity confirmed.

Blockers: none. Follow-ups: (1) decide whether to tighten the two WITH CHECK(true) INSERT policies; (2) confirm live DB state matches source (not queried); (3) 8+ nested Documents/Codex snapshot replicas not hashed.

## Artifact

**Findings**

CONFIRMED: No RLS-off table exists. All 11 CREATE TABLE statements across the 6 table-creating files in the 20260104/05/07 window are followed, in the same file, by `ALTER TABLE <t> ENABLE ROW LEVEL SECURITY`. 11/11 tables RLS-enabled. Canonical repo C:/Users/charl/dial-smart-system/supabase/migrations (replica dialer-ghl-buddy byte-identical). TABLES: system_alerts, calendar_tool_invocations (20260104213053); learning_outcomes, autonomous_goals, lead_priority_scores (20260105024224); ghl_sync_settings (20260105203936); smart_lists, lead_list_memberships (20260107024232); agent_improvement_history, lj_memory (20260107031814); disposition_metrics (20260107140730). CLASSES: 8 tables fully auth.uid()-based (learning_outcomes, autonomous_goals, lead_priority_scores, ghl_sync_settings, smart_lists, agent_improvement_history, lj_memory, disposition_metrics); lead_list_memberships auth.uid()-equivalent via EXISTS on parent smart_lists.user_id. 2 tables carry PERMISSIVE `WITH CHECK (true)` INSERT policies: system_alerts (20260104213053:31-33) and calendar_tool_invocations (20260104213053:56-58), no TO clause so they apply to PUBLIC (incl. anon) - only material finding, severity low-medium (audit/monitoring-table spoofing), intended as 'System can insert' but not role-gated. NO role-gated policies and NO USING(true) reads anywhere. Deny-by-default gaps (secure, informational): no DELETE on learning_outcomes/autonomous_goals/system_alerts, no UPDATE/DELETE on calendar_tool_invocations, no UPDATE on lead_list_memberships. 5 files are ALTER-only, N/A for RLS: 20260105210531, 20260105211958, 20260105225115, 20260107014918, 20260107024252.

**evidence**

- 20260104213053:2 CREATE TABLE public.system_alerts; :20 ENABLE RLS; :23 SELECT auth.uid()=user_id; :27 UPDATE auth.uid()=user_id; :31+33 INSERT WITH CHECK(true) [PERMISSIVE]
- 20260104213053:36 CREATE TABLE public.calendar_tool_invocations; :49 ENABLE RLS; :52 SELECT auth.uid()=user_id; :56+58 INSERT WITH CHECK(true) [PERMISSIVE]
- 20260105024224:12 learning_outcomes; :26 autonomous_goals; :45 lead_priority_scores; :63/:64/:65 ENABLE RLS; policies :68,:72,:76 (learning_outcomes SELECT/INSERT/UPDATE) auth.uid(); :81,:85,:89 (autonomous_goals) auth.uid(); :94,:98,:102,:106 (lead_priority_scores SELECT/INSERT/UPDATE/DELETE) auth.uid()
- 20260105203936:2 CREATE TABLE public.ghl_sync_settings; :19 ENABLE RLS; :22,:27,:32,:37 SELECT/INSERT/UPDATE/DELETE auth.uid()=user_id
- 20260107024232:2 CREATE TABLE smart_lists; :15 CREATE TABLE lead_list_memberships; :24/:25 ENABLE RLS; smart_lists policies :28,:31,:34,:37 auth.uid(); memberships :41,:47,:53 EXISTS(smart_lists.id=smart_list_id AND user_id=auth.uid())
- 20260107031814:2 agent_improvement_history; :15 lj_memory; :46/:47 ENABLE RLS; :50,:53,:56,:59 + :63,:66,:69,:72 all auth.uid()=user_id, 4 verbs each
- 20260107140730:2 CREATE TABLE IF NOT EXISTS disposition_metrics; :34 ENABLE RLS; :37-41 CREATE POLICY FOR ALL USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id)
- Grep counts (C:/Users/charl/dial-smart-system/supabase/migrations): 20260104213053 CREATE TABLE=2 ENABLE=2 POLICY=5 WITHCHECK_TRUE=2; 20260105024224 3/3/10/0; 20260105203936 1/1/4/0; 20260107024232 2/2/7/0; 20260107031814 2/2/8/0; 20260107140730 1/1/1/0; five ALTER-only files 0/0/0/0. CREATE TABLE total=11, ENABLE total=11, 0 files with CREATE TABLE lacking ENABLE.
- SHA256 (first 12) of all 11 files identical between C:/Users/charl/dial-smart-system and C:/Users/charl/dialer-ghl-buddy (e.g. 20260104213053=22116B8F1678 both).

**validation**

Read all 11 files in full with line numbers, then mechanically re-derived counts (CREATE TABLE / ALTER TABLE...ENABLE ROW LEVEL SECURITY / CREATE POLICY / USING|WITH CHECK (true)) via PowerShell regex ignoring comments; results reconcile: 11 CREATE TABLE, 11 same-file ENABLE, 0 unguarded tables, exactly 2 permissive WITH CHECK(true) at the two cited lines. Cross-checked replica hash parity.

**open_questions**

- Are the two WITH CHECK(true) INSERT policies intentional/acceptable, or should they be tightened (TO service_role / drop user_id spoofing)? Owner decision, not a code fact.
- Whether anon-key clients can actually reach those INSERT paths depends on app layering outside these migrations (out of scope).
- Snapshot copies under Documents/Codex/.../work/<repo>/supabase/migrations were not hash-verified (see what_i_did_not_check); assumed identical.

**edge_cases_considered**

- RLS enablement ordering: ENABLE ROW LEVEL SECURITY appears after CREATE TABLE in the same file; Supabase migrations run transactionally so there is no unguarded window.
- Comment lines: file 20260105203936 contains the comment 'Enable Row Level Security' (line 18); counted the real ALTER (line 19) via regex on the statement, not the comment.
- Schema-qualification: smart_lists/lead_list_memberships created without `public.` prefix (20260107024232:2,15) unlike the others; relies on search_path. Robustness nit, not an RLS gap.
- lead_list_memberships has no user_id column, so auth.uid() is enforced indirectly via EXISTS against the parent smart_lists.user_id - still auth.uid()-based, correct.
- FOR ALL policy on disposition_metrics covers SELECT/INSERT/UPDATE/DELETE in one statement with both USING and WITH CHECK - classified auth.uid()-based, not permissive.

**what_i_did_not_check**

- The nested snapshot copies under C:/Users/charl/Documents/Codex/.../work/*/supabase/migrations (8+ replicas) were not hashed/read; only the two top-level repos (dial-smart-system, dialer-ghl-buddy) were verified identical. If a divergent replica is actually deployed, results could differ.
- Did not query the live Supabase database (pg_policies/pg_tables) to confirm applied state matches these migration files; this is a source-file audit only.
- Did not audit the pre-existing tables these files ALTER (call_logs, dialing_queues, lead_pipeline_positions, phone_numbers, voice_broadcasts, autonomous_settings) - their RLS lives in earlier migrations outside this date window.
- Did not enumerate the ~8 Documents/Codex snapshot replicas to confirm no extra tables appear there.

**confidence**: high