# security::rls-coverage-tables

- status: completed

RLS coverage over dial-smart-system/supabase/migrations (199 .sql). Created=189 distinct; ENABLE RLS=194 distinct (189 repo-created + 5 external); tables created-but-never-enabled = 0; DISABLE RLS = 0; FORCE RLS = 4 (external_control_*).

## Artifact

**Findings**

RLS coverage over C:/Users/charl/dial-smart-system/supabase/migrations (199 .sql files). (1) TOTAL DISTINCT TABLES CREATED = 189. (FACT: PowerShell parse of all *.sql for 'CREATE TABLE [IF NOT EXISTS] <name>' gave CREATED=191; 2 are comment false-positives [20260712010000_canonical_ai_action_queue_contract.sql:4 '-- CREATE TABLE IF NOT EXISTS expected...'; 20250619152448-97fb6549-a522-4654-a60c-9cd1f5ea5e81.sql:2 '-- Create table for number rotation settings'], so 189 real). (2) TOTAL WITH RLS ENABLED = 194 distinct tables get 'ENABLE ROW LEVEL SECURITY' somewhere; 189 of those are the repo-created tables and 5 are NOT created anywhere in this folder (FACT). (3) TABLES CREATED BUT NEVER ENABLED = NONE (0). Every one of the 189 tables created in the repo has an 'ENABLE ROW LEVEL SECURITY' statement in at least one migration file; a programmatic set-difference of created-minus-enabled keyed on normalized (public.-stripped) names returned only the 2 comment false-positives. NO 'DISABLE ROW LEVEL SECURITY' exists anywhere (FACT: 0 matches across all files). 'FORCE ROW LEVEL SECURITY' exists for exactly 4 tables, all in the external observer control plane: external_control_installations, external_control_principals, external_command_claims, external_command_receipts (FACT: 20260713130000_external_observer_control_plane.sql:459,461,463,465). Tables enabled but not created in this folder (base/external schema): leads, call_logs, campaigns, phone_numbers (FACT: 20260712070000_multi_organization_routing_contract.sql:197-200) and retell_agents (FACT: 20260713072000_provider_resource_ownership_boundary.sql:212). Non-standard creations: only 3 CREATE TEMP TABLE statements (transient session tables, dropped; not RLS-relevant) at 20251214221955_8054901e-d2b3-437d-b035-44746ec85427.sql:33, 20260108_phase2_add_org_to_additional_tables.sql:12, 20260108_phase2_add_org_to_core_tables.sql:15; no CREATE TABLE AS, UNLOGGED, FOREIGN, or materialized-view table creation; no dynamic 'EXECUTE ... CREATE TABLE' (dynamic EXECUTE only builds triggers/policies). CAVEAT: enable != policy. RLS is enabled on all repo tables but this node did NOT verify each table has >=1 CREATE POLICY; RLS enabled with zero policies is deny-all to anon/authenticated (service_role still bypasses). CAVEAT: at least 5 tables referenced by RLS statements were never created in the repo, proving base/other-schema creation lives outside the migrations folder, so additional live-DB tables may exist outside repo control.

**evidence**

- dir /b /s *.sql => 199 files (FACT)
- findstr /s /i /n /c:"create table" *.sql => 251 raw lines incl. comments/duplicates
- PowerShell set-diff: CREATED=191 (2 comment false-positives), ENABLED_DISTINCT=194, MISSING(real)=0, DISABLE_COUNT=0
- 20260712070000_multi_organization_routing_contract.sql:197-200 => ALTER TABLE public.{campaigns,leads,phone_numbers,call_logs} ENABLE ROW LEVEL SECURITY (tables not created in repo)
- 20260713072000_provider_resource_ownership_boundary.sql:212 => retell_agents ENABLE RLS (not created in repo)
- 20260713130000_external_observer_control_plane.sql:459,461,463,465 => FORCE ROW LEVEL SECURITY on external_control_installations/principals/external_command_claims/external_command_receipts
- 20240115_workflow_test_logs.sql:2 create + :23 enable (representative of the per-table create:enable pairing present for all 189)

**validation**

Two independent passes agree: (a) manual eyeball of all 251 raw CREATE TABLE lines vs all ENABLE RLS lines found no created table lacking an enable; (b) a PowerShell parser keyed by normalized table name and computed created-minus-enabled, returning MISSING=0 real diff. A separate anchored-regex pass (^\s*create table) eliminated the 2 comment false-positives and produced the full 189-row create:enable mapping table. Cross-checked FORCE (4 tables) and DISABLE (0).

**open_questions**

- Do all 189 RLS-enabled tables actually have >=1 CREATE POLICY, or are some enable-with-no-policy (deny-all / broken access)?
- Which live-DB tables exist that were created outside this migrations folder (dashboard/other repo) and may have no RLS at all?
- Do the 5 externally-created tables (leads, call_logs, campaigns, phone_numbers, retell_agents) have RLS enabled in the live DB, or only in these ALTER statements (which could fail if the table is absent)?

**what_i_did_not_check**

- CREATE POLICY coverage per table (enable != usable RLS)
- GRANT/REVOKE and role privileges
- Live Supabase DB actual state (this is repo-only static analysis)
- supabase/functions and any SQL outside supabase/migrations
- Whether migrations were applied via dashboard vs repo (ordering/last-applied)
- service_role bypass implications
- Supabase-managed/other schemas (auth, storage, etc.)

**confidence**: medium