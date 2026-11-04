# security::rls-oldest-L-grants-privileges

- status: completed
- tldr: No GRANT/REVOKE on the 6 oldest tables in any migration; grants are Supabase defaults, so 3 residual USING(true) policies are anon-reachable via PostgREST.

Node security::rls-oldest-L-grants-privileges CLOSED (atomic). Audited all 199 files in dial-smart-system/supabase/migrations for GRANT/REVOKE/ALTER DEFAULT PRIVILEGES/FORCE RLS.

HEADLINE: There is NO table-level GRANT or REVOKE for any of the six target tables anywhere in the migrations (stated explicitly). No ALTER DEFAULT PRIVILEGES exists (only prose at billing_lock.sql:169). No schema-wide grant touches public (only 'GRANT ... ON ALL TABLES IN SCHEMA cron TO postgres', 20251204062700:7). The 2026 REVOKE-ALL loops exclude all six tables. No FORCE RLS on any of them (only 4 external_control_* tables). So live grants are OUT-OF-BAND (Supabase project-init defaults: ALL on public tables to anon/authenticated/service_role). PostgREST exposes public (config.toml:16) -> anon/authenticated hold table privileges -> RLS is the only gate -> any USING(true)/WITH CHECK(true) policy IS anon-reachable.

RESIDUAL PERMISSIVE POLICIES still standing at end of history: predictive_dialing_stats 'System can insert dialing stats' INSERT WITH CHECK(true) (20251109171900:61-63, never dropped); disposition_metrics 'Service role can insert' WITH CHECK(true) + 'Service role can update' USING(true) (20241218:61-70, never dropped - 20260108:221-222 drops different names); edge_function_errors 'Service role can insert errors' WITH CHECK(true) (20241218:39-42, never dropped). Root cause: those names carry no TO service_role / jwt check, so they apply to any role with the table privilege.

FIXED (no hole): system_health_logs (permissive read dropped 20251103034349:83), rotation_history (permissive insert dropped 20251103035736:8), daily_reports (insert/update dropped+recreated service_role-scoped 20260601173321:41-53).

Answers node C/D's open question: yes, these tables are exposed via PostgREST auto-API in the public schema.

VALIDATION: exhaustive findstr + agentgrep over the full migrations dir; per-table CREATE/DROP POLICY enumeration; verified 2026 loops exclude the six; read config.toml. Repo-only.

CONFIDENCE: medium (migration-side facts high; exploitability hinges on unverified live ACL).

## Artifact

**Findings**

GRANTS (core answer, stated explicitly as requested): There is NO table-level GRANT or REVOKE for ANY of the six target tables (disposition_metrics, edge_function_errors, daily_reports, predictive_dialing_stats, system_health_logs, rotation_history) anywhere in the 199 migration files. The only privilege statements in the oldest-era files are on VIEWS, not tables: 'GRANT SELECT ON public.disposition_analytics TO authenticated/service_role' (20241218_disposition_metrics.sql:91-92) and 'GRANT SELECT ON public.critical_errors_v TO authenticated' (20241218_edge_function_errors.sql:68). || (2) NO 'ALTER DEFAULT PRIVILEGES' exists in any migration; only a prose mention at 20261029200000_billing_lock.sql:169. || (3) NO schema-wide privilege statement touches public: the only 'ALL TABLES IN SCHEMA' statement is 'GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres' (20251204062700...:7) - the cron schema. || (4) The 2026 'contract' migrations' REVOKE ALL PRIVILEGES loops (%I over explicit table lists) do NOT include any of the six tables; they target user_credentials, dialing_queues, organizations/organization_credits/credit_transactions/usage_summaries, pricing_tiers/agent_pricing, call_logs, phone_numbers/retell_agents, dnc_list, calendar_integrations/api_keys/slack_users (2026071306*-20260713130000). Confirmed by zero hits for the six names in those files. || (5) FORCE ROW LEVEL SECURITY is never applied to any of the six tables (it appears ONLY on external_control_installations/principals/command_claims/command_receipts at 20260713130000:459-465). No 'DISABLE ROW LEVEL SECURITY' anywhere. All six tables DO have ENABLE ROW LEVEL SECURITY (disposition_metrics 20241218:52 / 20260107140730:34; edge_function_errors 20241218:30 / 20260109034147:21; daily_reports 20251204055913:35; predictive_dialing_stats 20251109171900:53 / 20251201052229:62; system_health_logs 20250619152448:106; rotation_history 20250619152448:85). || (6) PostgREST exposure: supabase/config.toml:16 sets schemas=[public, graphql_public] and all six tables are created in schema public, so they are auto-exposed at /rest/v1/<table> (project_id=emonjusymdripmkvtttc, config.toml:1). Nothing excludes them. || (7) REACHABILITY CONCLUSION GIVEN GRANTS: because migrations neither grant nor revoke table privileges on these tables, the live grants are OUT-OF-BAND (Supabase project-init defaults), which grant ALL on public-schema tables to anon, authenticated and service_role. If that stock default holds, anon AND authenticated hold SELECT/INSERT/UPDATE/DELETE on these tables, so RLS is the ONLY gate, and any USING(true)/WITH CHECK(true) policy IS reachable by anon via PostgREST - that is the exploit path. || (8) RESIDUAL PERMISSIVE POLICIES still standing at end of history (headline): predictive_dialing_stats 'System can insert dialing stats' FOR INSERT WITH CHECK(true) (20251109171900:61-63) is NEVER dropped (20251201052229 adds own-row policies but leaves it); disposition_metrics 'Service role can insert disposition metrics' FOR INSERT WITH CHECK(true) (20241218:61-64) and 'Service role can update disposition metrics' FOR UPDATE USING(true) (20241218:67-70) are NEVER dropped (20260108_phase2:221-222 drops DIFFERENT names); edge_function_errors 'Service role can insert errors' FOR INSERT WITH CHECK(true) (20241218:39-42) is NEVER dropped (only the differently-named 2026 policies were dropped at 20260701132102:119 and 20260720232851:35). || (9) FIXED (no residual hole): system_health_logs 'Anyone can view system health logs' USING(true) DROPPED at 20251103034349:83 (-> admin-only SELECT + service_role insert); rotation_history 'System can insert rotation history' WITH CHECK(true) DROPPED at 20251103035736:8; daily_reports 'Service role can insert/update reports' WITH CHECK(true)/USING(true) DROPPED and recreated service_role-scoped at 20260601173321:41-53. || (10) NAMING TRAP (root cause): policies named 'Service role can ...' / 'System can ...' carry NO 'TO service_role' clause and NO jwt-role check, so they grant the action to ANY role holding the table privilege - they are not service-role-restricted at all. || (11) Owner bypass: the tables are owned by postgres/supabase_admin and FORCE RLS is absent, so the OWNER bypasses RLS - but anon/authenticated are not owners, so owner bypass is NOT the exposure vector; the vector is anon/authenticated grants + permissive policies. FORCE RLS is addressed only for unrelated external_control_* tables.

**evidence**

- dial-smart-system/supabase/migrations/20241218_disposition_metrics.sql:61-70 (permissive INSERT WITH CHECK(true) + UPDATE USING(true), never dropped)
- dial-smart-system/supabase/migrations/20241218_edge_function_errors.sql:39-42 and :68 (permissive INSERT WITH CHECK(true); GRANT SELECT on view critical_errors_v)
- dial-smart-system/supabase/migrations/20251109171900_concurrency_management.sql:61-63 (permissive 'System can insert dialing stats' WITH CHECK(true), never dropped)
- dial-smart-system/supabase/migrations/20251201052229_3e1dc2ae-c0f8-4c77-9f92-87bdd90eaf24.sql:77-86 (adds own-row policies; does not drop the permissive one)
- dial-smart-system/supabase/migrations/20260108_phase2_add_org_to_additional_tables.sql:221-222 (drops DIFFERENTLY-NAMED policies; the 2024 permissive ones survive)
- dial-smart-system/supabase/migrations/20251103034349_d8aa891c-617a-4d2f-a0e1-5d250f6a27e1.sql:83-94 (system_health_logs permissive read dropped, admin-scoped)
- dial-smart-system/supabase/migrations/20251103035736_ea6eef40-afad-486e-8d72-4811de5f289c.sql:8-18 (rotation_history permissive insert dropped)
- dial-smart-system/supabase/migrations/20260601173321_ff6ff43a-ccf4-409e-9df7-29b6b1e818c2.sql:41-53 (daily_reports permissive insert/update dropped, service_role-scoped)
- dial-smart-system/supabase/migrations/20260701132102_lock_down_privileged_rpcs_and_definer_views.sql:119-125 (drops 'Service role can insert edge function errors', NOT the 2024 'Service role can insert errors')
- dial-smart-system/supabase/migrations/20260720232851_c4b83f62-0649-4a9d-9774-83f4c3f63155.sql:35 (drops authenticated own-insert on edge_function_errors)
- dial-smart-system/supabase/migrations/20260713130000_external_observer_control_plane.sql:459-465 (the ONLY FORCE RLS in the repo; unrelated tables)
- dial-smart-system/supabase/migrations/20251204062700_c7d0cc0d-ce0d-4041-992b-b13e6ed23207.sql:6-7 (the ONLY 'ALL TABLES IN SCHEMA' grant; cron schema, not public)
- dial-smart-system/supabase/config.toml:1 and :16 (project_id emonjusymdripmkvtttc; PostgREST schemas public+graphql_public)
- dial-smart-system/supabase/migrations/20261029142121_phase1_org_scope.sql:65,77,114 (org-scope table array excludes all six target tables)

**validation**

Exhaustive greps over all 199 files in dial-smart-system/supabase/migrations for GRANT, REVOKE, ALTER DEFAULT PRIVILEGES, FORCE/DISABLE ROW LEVEL SECURITY, ALL TABLES/ALL PRIVILEGES, DROP TABLE, and each of the six table names; cross-checked with agentgrep for every CREATE/DROP POLICY naming each target table; verified the 2026 REVOKE-ALL loops exclude the six tables; confirmed PostgREST schema exposure in config.toml. Repo-only (no live DB access).

**open_questions**

- LIVE table ACL not verified from the repo: need pg_class.relacl / information_schema.role_table_grants for the six tables in project emonjusymdripmkvtttc to confirm anon/authenticated actually hold SELECT/INSERT/UPDATE/DELETE; exploitability depends on this.
- Whether Supabase project-init ALTER DEFAULT PRIVILEGES is at its stock value (assumed, not verifiable in-repo).
- Whether the 2024 permissive policies created by 20241218_* are actually present in the live DB (if the project was rebuilt from a partial history they may not be).

**edge_cases_considered**

- Tables re-created with CREATE TABLE IF NOT EXISTS do NOT drop their existing RLS policies, so older permissive policies persist across later re-creations (disposition_metrics, edge_function_errors, predictive_dialing_stats).
- DROP POLICY IF EXISTS with a non-matching name is a silent no-op - the exact mechanism by which the 2024 permissive policies survived every later cleanup.
- Permissive policies are OR'd: adding a stricter org-scope or own-row policy never removes an existing USING(true)/WITH CHECK(true) policy.
- No DROP TABLE on any of the six tables (verified), so table identity and its policies persist.
- FORCE RLS only matters for the table owner; anon/authenticated exposure comes from grants + policies, not owner bypass.

**what_i_did_not_check**

- Live database ACL (relacl / role_table_grants) - the 'anon/authenticated hold privileges' premise is inferred from Supabase defaults, not read from the DB.
- graphql_public and other non-public PostgREST surfaces.
- The four external_control_* tables that DO have FORCE RLS (out of scope).
- Column-level grant history on these tables (migrations have none; live could).
- Whether any of the six tables are wrapped by SECURITY DEFINER views that could re-expose them.
- Other oldest-era tables beyond the six named (the stated set may be incomplete).

**confidence**: medium