# security::rls-oldest-J-disposition-metrics-accum

- status: completed
- tldr: 2026 migration never drops the 2024 permissive disposition_metrics INSERT/UPDATE policies (both DROP names mismatched) -> anon/authenticated can still write arbitrary rows.

GAP CONFIRMED (node security::rls-oldest-J-disposition-metrics-accum). disposition_metrics is touched by exactly 3 migrations; the two 2024 permissive policies are NEVER dropped. 20260108 attempts DROP POLICY IF EXISTS at :221-222 but BOTH names are mismatched, so they are silent no-ops (:221 'Users can view their own disposition metrics' vs real :55 'Users can view own disposition metrics'; :222 'System can insert disposition metrics' vs real :61 'Service role can insert disposition metrics'). The worst policy, UPDATE USING(true) at :67-70, is never referenced by any DROP at all. Neither has a TO clause, so both bind to PUBLIC (anon+authenticated); permissive-OR semantics mean the added tenant-scoped policies at 20260108:224-233 do NOT neutralize them. CONCLUSION: as of the latest migration (20261103023000_door_to_door_members.sql), anon/authenticated can still INSERT arbitrary rows and UPDATE arbitrary cross-user/cross-org disposition_metrics rows at the policy layer. SCHEMA: no real conflict - the 20260107 CREATE TABLE IF NOT EXISTS (divergent columns) is a no-op because the 2024 table exists; only its FOR ALL policy (:37-41) takes effect. 20260108's organization_id NOT NULL (:210-217) is trivially satisfiable and does not close the hole. Report: docs/_swarm/security__rls-oldest-J-disposition-metrics-accum.md. Confidence: high (migration-file level); live-DB grants caveat noted.

## Artifact

**Findings**

CONFIRMED GAP, and it undercuts a naive reading of H's remediation. disposition_metrics is touched by exactly 3 migrations (20241218, 20260107, 20260108) - no other file drops/renames/revokes. The two 2024 PERMISSIVE policies are NEVER removed: (a) 'Service role can insert disposition metrics' FOR INSERT WITH CHECK(true) at 20241218_disposition_metrics.sql:61-64; (b) 'Service role can update disposition metrics' FOR UPDATE USING(true) at 20241218_disposition_metrics.sql:67-70. Neither has a TO clause => both apply to PUBLIC (anon+authenticated). 20260108_phase2_add_org_to_additional_tables.sql attempts drops at :221-222 but BOTH names are wrong, so IF EXISTS makes them silent no-ops: :221 names 'Users can view their own disposition metrics' while the real policy (:55) is 'Users can view own disposition metrics' (extra 'their'); :222 names 'System can insert disposition metrics' while the real policy (:61) is 'Service role can insert disposition metrics'. The worst policy (the UPDATE one) is never referenced by any DROP at all. So as of the latest migration (20261103023000_door_to_door_members.sql) any anon/authenticated role can still INSERT arbitrary rows and UPDATE arbitrary (cross-user, cross-org) disposition_metrics rows at the policy layer. SCHEMA CONFLICT: none in practice - 20260107:2 does CREATE TABLE IF NOT EXISTS with a DIVERGENT column set (user_id no FK, lead_id ON DELETE SET NULL, ai_confidence_score numeric(5,4), set_by no CHECK), but the table already exists so the whole block is a NO-OP; the 2024 physical schema/constraints stand. 20260107's only real effect is the added FOR ALL policy at :37-41. 20260108 adds organization_id NOT NULL (:210-217) which requires a non-null org id on INSERT but is trivially satisfiable, so it does not close the hole. RLS permissive-OR semantics: the newer tenant-scoped policies at 20260108:224-233 are ADDED, not replacements, so the WITH CHECK(true)/USING(true) policies still grant everything.

**evidence**

- 20241218_disposition_metrics.sql:4-40 CREATE TABLE public.disposition_metrics (2024 schema, FKs/NOT NULL/CHECK)
- 20241218_disposition_metrics.sql:52 ENABLE ROW LEVEL SECURITY
- 20241218_disposition_metrics.sql:54 comment 'Users can view their own disposition metrics' (name/comment mismatch trap)
- 20241218_disposition_metrics.sql:55-58 CREATE POLICY 'Users can view own disposition metrics' FOR SELECT USING(auth.uid()=user_id)
- 20241218_disposition_metrics.sql:61-64 CREATE POLICY 'Service role can insert disposition metrics' FOR INSERT WITH CHECK (true)
- 20241218_disposition_metrics.sql:67-70 CREATE POLICY 'Service role can update disposition metrics' FOR UPDATE USING (true)
- 20260107140730_63375bb5-d565-4a9a-8c3e-81f9aa99215f.sql:2 CREATE TABLE IF NOT EXISTS disposition_metrics (no-op; divergent columns)
- 20260107140730_63375bb5-d565-4a9a-8c3e-81f9aa99215f.sql:37-41 CREATE POLICY 'Users can manage their own disposition metrics' FOR ALL USING/WITH CHECK (auth.uid()=user_id)
- 20260108_phase2_add_org_to_additional_tables.sql:210-217 ALTER TABLE disposition_metrics ADD organization_id SET NOT NULL
- 20260108_phase2_add_org_to_additional_tables.sql:221 DROP POLICY IF EXISTS 'Users can view their own disposition metrics' (MISMATCH vs :55 -> no-op)
- 20260108_phase2_add_org_to_additional_tables.sql:222 DROP POLICY IF EXISTS 'System can insert disposition metrics' (MISMATCH vs :61 -> no-op)
- 20260108_phase2_add_org_to_additional_tables.sql:224-233 CREATE org-scoped SELECT+INSERT policies (added, not replacing permissive ones)
- whole-migrations-dir grep 'disposition_metrics': 3 files only (20241218, 20260107, 20260108)
- whole-migrations-dir grep 'pg_tables': 0 matches; grep 'pg_policies': 8 files, none naming disposition_metrics

**validation**

Two independent whole-dir greps ('disposition_metrics' and 'disposition metrics') returned the same 3-file set, proving no 4th migration drops/renames/revokes here. Read all three files in full; string-compared DROP names against CREATE names (both mismatched; UPDATE policy has no drop attempt). Grepped for schema-wide dynamic sweeps (pg_policies/pg_tables) to rule out an unnamed drop; none targets disposition_metrics. Confirmed latest migration via sorted dir listing (20261103023000_door_to_door_members.sql) and that it does not reference the table. Cross-checked sibling nodes A-2024 and H-orgblind (both flagged these same permissive policies and left 'do later migrations remediate?' open - this node answers: they do NOT).

**open_questions**

- Live state: does the deployed project actually still carry these 2024 policies, or were any dropped by hand in Supabase Studio (not present in migrations)?
- Are Supabase default GRANTs (anon/authenticated DML on public tables) present on disposition_metrics? If yes the hole is anon-reachable; if not, it is at least an authenticated cross-tenant write hole.
- The recovery baseline 20260712000000_live_public_schema_baseline.sql contains no policy DDL for this table, so it cannot confirm live policy state.

**what_i_did_not_check**

- Live database pg_policies rows, grants, and whether these migrations were actually applied in order (no DB access in this node).
- Non-migration artifacts: supabase/functions*/**, and the duplicated repo copies under Documents/Codex/**/work/** plus dial-smart-system/certification/recovery-lineage-vN/ (generated snapshots, not applied migrations).
- Any GRANT/REVOKE sweep outside the migrations directory.

**confidence**: high