# security::rls-oldest-A-2024

- status: completed
- tldr: 3 2024 tables: RLS on at creation, auth.uid() SELECT; two have permissive true service-role policies with no TO clause. No org column.

DONE: Audited RLS/org-blindness of 3 legacy 2024 migrations (workflow_test_logs, disposition_metrics, edge_function_errors).

TOUCHED: none (research only).

EVIDENCE: type+findstr /n on all 3 files; org/tenant grep returned exit 1 (no matches).

RESULT:
- workflow_test_logs (20240115_workflow_test_logs.sql): RLS enabled at creation (line 23, after CREATE TABLE line 2). 2 policies, both auth.uid()-based and NO TO clause (=> PUBLIC): SELECT USING(auth.uid()=user_id) L26-29; INSERT WITH CHECK(auth.uid()=user_id) L31-34. No permissive policy. No org column.
- disposition_metrics (20241218_disposition_metrics.sql): RLS enabled L52 (CREATE TABLE L4, public schema). 3 policies, none with TO clause: SELECT USING(auth.uid()=user_id) L55-58; INSERT WITH CHECK(true) L61-64 (PERMISSIVE, org-blind); UPDATE USING(true) L67-70 (PERMISSIVE, org-blind). No org column.
- edge_function_errors (20241218_edge_function_errors.sql): RLS enabled L30 (CREATE TABLE L4). 3 policies, none with TO clause: SELECT USING(auth.uid()=user_id) L33-36; INSERT WITH CHECK(true) L39-42 (PERMISSIVE, org-blind); UPDATE USING(auth.uid()=user_id) L45-48. No org column.
- KEY GAP (FACT): the "Service role can insert/update" policies use USING(true)/WITH CHECK(true) and omit TO, so they apply to PUBLIC (anon+authenticated), not just service_role. Any authenticated/anon can INSERT into disposition_metrics/edge_function_errors and UPDATE disposition_metrics.
- org/org_id/tenant/organization: ZERO references in all 3 files (FACT, grep exit 1) — pre-multi-tenancy era, as expected.

COULD_NOT: (out of scope, listed as open questions) whether later migrations org-scope/replace these permissive policies; live DB state; base-table grants; view security_invoker.

CONFIDENCE: high.

## Artifact

**Findings**

All 3 legacy 2024 migrations enable RLS at creation and use auth.uid()-based policies plus permissive service-role policies. NO org/org_id/tenant column exists in any of the 3 tables or policies (this is the pre-multi-tenancy era). Key security gap: the 'Service role can insert/update' policies use USING(true)/WITH CHECK(true) AND omit any TO clause, so they apply to PUBLIC (all roles incl. anon/authenticated), not just service_role. Any authenticated/anon user can INSERT into disposition_metrics and edge_function_errors, and UPDATE disposition_metrics. workflow_test_logs is tighter (SELECT/INSERT tied to auth.uid(), no permissive policy). disposition_analytics and critical_errors_v views are granted SELECT to authenticated but the underlying RLS still filters rows (views are not SECURITY DEFINER unless set; not set here).

**evidence**

- 20240115_workflow_test_logs.sql:2 CREATE TABLE IF NOT EXISTS workflow_test_logs (unqualified schema)
- 20240115_workflow_test_logs.sql:23 ALTER TABLE workflow_test_logs ENABLE ROW LEVEL SECURITY
- 20240115_workflow_test_logs.sql:26-29 policy SELECT USING (auth.uid() = user_id)
- 20240115_workflow_test_logs.sql:31-34 policy INSERT WITH CHECK (auth.uid() = user_id)
- 20241218_disposition_metrics.sql:4 CREATE TABLE IF NOT EXISTS public.disposition_metrics
- 20241218_disposition_metrics.sql:52 ALTER TABLE public.disposition_metrics ENABLE ROW LEVEL SECURITY
- 20241218_disposition_metrics.sql:55-58 SELECT USING (auth.uid() = user_id)
- 20241218_disposition_metrics.sql:61-64 INSERT WITH CHECK (true)
- 20241218_disposition_metrics.sql:67-70 UPDATE USING (true)
- 20241218_edge_function_errors.sql:4 CREATE TABLE IF NOT EXISTS public.edge_function_errors
- 20241218_edge_function_errors.sql:30 ALTER TABLE public.edge_function_errors ENABLE ROW LEVEL SECURITY
- 20241218_edge_function_errors.sql:33-36 SELECT USING (auth.uid() = user_id)
- 20241218_edge_function_errors.sql:39-42 INSERT WITH CHECK (true)
- 20241218_edge_function_errors.sql:45-48 UPDATE USING (auth.uid() = user_id)
- findstr org/tenant search across all 3 files: exit 1, no matches

**validation**

Read all 3 files fully via type; numbered with findstr /n; grep for org/org_id/tenant/organization returned zero matches (exit 1). RLS-at-creation confirmed by ALTER TABLE ENABLE ROW LEVEL SECURITY present in each file. No TO clause on any CREATE POLICY confirmed by reading each statement (none has a TO line).

**open_questions**

- Do later migrations (e.g. 20260108_phase2_add_org_to_core_tables.sql) add org_id + tighten/replace these permissive USING(true) service-role policies? Not checked here.
- Does the disposition_analytics view run as owner (bypassing RLS) — CREATE OR REPLACE VIEW without security_invoker means it runs as view owner in PG<15 semantics; Postgres 15+ default security_invoker=false still owner-run. Impact on cross-user data exposure not checked.
- Are these 3 tables reachable by anon role in this Supabase project's default grants?

**what_i_did_not_check**

- Whether later 2025/2026 migrations alter or drop these policies (e.g. org-scoping additions, TO service_role fixes)
- Actual live DB state vs these migration files
- Grants/REVOKE statements affecting anon/authenticated on the base tables
- security_invoker setting on the two views and their effective RLS behavior

**confidence**: high