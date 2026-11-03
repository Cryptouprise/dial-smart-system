# security::rls-oldest-J-disposition-metrics-accum

- status: completed
- tldr: The two 2024 permissive policies on disposition_metrics (INSERT WITH CHECK(true), UPDATE USING(true)) are NEVER dropped. 20260108's two DROP POLICY IF EXISTS statements target MISMATCHED names, so both are silent no-ops. As of the latest migration, any role (PUBLIC, incl. anon/authenticated) can still INSERT and UPDATE arbitrary disposition_metrics rows.

DONE: Determined whether the migration set ever drops/renames the 2024 permissive 'insert'/'update' policies on public.disposition_metrics, whether the 2026-01-07 re-declaration conflicts with the 2024 schema, and the resulting anon/authenticated reachability. Research only; no live DB touched.

TOUCHED: docs/_swarm/security__rls-oldest-J-disposition-metrics-accum.md (this report).

## Answer to the required conclusion

NO. As of the latest migration (20261103023000_door_to_door_members.sql), the 2024 permissive policies are still in force:

- `"Service role can insert disposition metrics"` FOR INSERT WITH CHECK (true) — 20241218_disposition_metrics.sql:61-64
- `"Service role can update disposition metrics"` FOR UPDATE USING (true) — 20241218_disposition_metrics.sql:67-70

Since neither has a `TO` clause, both apply to PUBLIC (anon + authenticated + service_role). Under PostgreSQL permissive-policy OR semantics, the presence of any `WITH CHECK(true)` / `USING(true)` policy makes the action unconditionally allowed, regardless of the newer tenant-scoped policies. Therefore anon/authenticated can still INSERT arbitrary rows and UPDATE arbitrary (any user's / any org's) disposition_metrics rows at the policy layer.

## Why the 2026 remediation silently failed (the core finding)

`20260108_phase2_add_org_to_additional_tables.sql` does attempt to drop them, but BOTH drop statements name policies that do not exist:

- :221 `DROP POLICY IF EXISTS "Users can view their own disposition metrics" ON public.disposition_metrics;`
  Actual 2024 policy name (20241218_disposition_metrics.sql:55) is `"Users can view own disposition metrics"` (no "their").
  The author likely copied "their own" from the SQL comment on 20241218:54 (`-- Users can view their own disposition metrics`), which does NOT match the real name. `IF EXISTS` swallows the miss -> no-op. (Also this only concerns SELECT, which was never the permissive one.)
- :222 `DROP POLICY IF EXISTS "System can insert disposition metrics" ON public.disposition_metrics;`
  Actual 2024 policy name (20241218:61) is `"Service role can insert disposition metrics"`. "System" != "Service role" -> no-op.
- The 2024 UPDATE policy `"Service role can update disposition metrics"` (20241218:67) is NEVER referenced by any DROP anywhere. The worst policy is not even attempted.

Net effect: 20260108 replaces the SELECT policy (recreates an org-scoped SELECT at :224-226) and ADDS a new org-scoped INSERT policy ("System can insert disposition metrics", :228-233), but leaves the two permissive 2024 policies untouched. Adding a stricter permissive policy does NOT weaken protection — but it also does not remove the permissive one, so the permissive one still grants everything.

## Schema "conflict" question — no conflict, because the 2026 CREATE is a no-op

- 20241218 creates `public.disposition_metrics` (unqualified CREATE with FK's: lead_id NOT NULL REFERENCES leads, user_id NOT NULL REFERENCES auth.users, ai_confidence_score numeric(5,2), set_by CHECK(...), workflow_id/campaign_id FK's) at :4-40.
- 20260107 file does `CREATE TABLE IF NOT EXISTS disposition_metrics (...)` at :2-24 with a DIFFERENT column set (user_id UUID NOT NULL with NO FK, lead_id ... ON DELETE SET NULL, ai_confidence_score numeric(5,4), set_by ... DEFAULT 'manual' with NO CHECK, no FK on workflow_id). Because the table already exists, `IF NOT EXISTS` makes this entire block a NO-OP. The 2024 physical schema and its constraints stand; the 2026 divergent column list never applies. So there is no actual conflict — only dead/misleading DDL. The real 2026 effect of that file is solely the added policy at :37-41.
- 20260108 then legitimately ALTERs the existing table: adds `organization_id UUID ... ON DELETE CASCADE`, backfills, sets `SET NOT NULL` (:210-217). That does add a real INSERT constraint (a non-null organization_id is required), but it is satisfied by supplying any existing organization id, so it is not a barrier to the permissive INSERT.

## Compliance / provenance of the disposition_metrics table

Whole-migrations-dir greps prove disposition_metrics is touched by exactly THREE migration files: 20241218_disposition_metrics.sql, 20260107140730_63375bb5-....sql, 20260108_phase2_add_org_to_additional_tables.sql. No other migration references it (so no DROP POLICY, ALTER POLICY, RENAME, or table-scoped REVOKE exists elsewhere). No schema-wide dynamic sweep exists either (pg_tables: 0 matches; the 8 pg_policies LOOP sweeps target explicitly-named relations — call_logs, dnc_list, user_credentials, dialing_queues, api_keys, calendar_integrations, slack_users, coach_proposals — none is disposition_metrics).

## evidence (file:line)

- 20241218_disposition_metrics.sql:4-40 CREATE TABLE public.disposition_metrics (2024 schema, FKs + NOT NULL + CHECK)
- 20241218_disposition_metrics.sql:52 ALTER TABLE ... ENABLE ROW LEVEL SECURITY
- 20241218_disposition_metrics.sql:54 comment "Users can view their own disposition metrics" (name/comment trap)
- 20241218_disposition_metrics.sql:55-58 CREATE POLICY "Users can view own disposition metrics" FOR SELECT USING(auth.uid()=user_id)
- 20241218_disposition_metrics.sql:61-64 CREATE POLICY "Service role can insert disposition metrics" FOR INSERT WITH CHECK (true)
- 20241218_disposition_metrics.sql:67-70 CREATE POLICY "Service role can update disposition metrics" FOR UPDATE USING (true)
- 20260107140730_63375bb5-d565-4a9a-8c3e-81f9aa99215f.sql:2 CREATE TABLE IF NOT EXISTS disposition_metrics (no-op; diverging columns)
- 20260107140730_63375bb5-d565-4a9a-8c3e-81f9aa99215f.sql:34 ALTER TABLE ... ENABLE ROW LEVEL SECURITY (redundant)
- 20260107140730_63375bb5-d565-4a9a-8c3e-81f9aa99215f.sql:37-41 CREATE POLICY "Users can manage their own disposition metrics" FOR ALL USING/WITH CHECK (auth.uid()=user_id)
- 20260108_phase2_add_org_to_additional_tables.sql:210-217 ALTER TABLE disposition_metrics ADD organization_id (NOT NULL)
- 20260108_phase2_add_org_to_additional_tables.sql:221 DROP POLICY IF EXISTS "Users can view their own disposition metrics"  (MISMATCH -> no-op)
- 20260108_phase2_add_org_to_additional_tables.sql:222 DROP POLICY IF EXISTS "System can insert disposition metrics"  (MISMATCH -> no-op)
- 20260108_phase2_add_org_to_additional_tables.sql:224-233 CREATE org-scoped SELECT + INSERT policies (added, not replacing permissive ones)
- whole-dir grep "disposition_metrics": 3 files only (20241218, 20260107, 20260108)
- whole-dir grep "pg_tables": 0 matches ; grep "pg_policies": 8 files, none naming disposition_metrics

## validation

- Two independent whole-dir greps for "disposition_metrics" and for "disposition metrics" both returned the same 3-file set (proves no 4th file drops/renames anything here).
- Read all three files in full and string-compared the DROP names against the CREATE names: both 20260108 drops are literal mismatches ("their own" vs "own"; "System" vs "Service role"); the UPDATE policy has no drop attempt.
- Grepped for dynamic RLS sweeps (pg_policies / pg_tables) to rule out a schema-wide drop that would not name the table; confirmed none targets disposition_metrics.
- Confirmed latest migration by sorted listing (20261103023000_door_to_door_members.sql); it does not reference disposition_metrics.

## open_questions

- Live state: does the deployed project actually carry these 2024 policies, or were any dropped by hand in Supabase Studio (which would not appear in migrations)? Not verifiable from files.
- Are Supabase default GRANTs (anon/authenticated = DML on public tables) present on disposition_metrics? If yes, the hole is live and anon-reachable; if anon lacks grants, it is at least an authenticated cross-tenant write hole. Not verified.
- The recovery baseline (20260712000000_live_public_schema_baseline.sql) contains no policy DDL for this table, so it cannot confirm live policy state either.

## what_i_did_not_check

- Live database: actual pg_policies rows, grants, and whether these migrations were applied in order (no DB access this node).
- Non-migration artifacts: supabase/functions*/**, and the duplicated repo copies under Documents/Codex/**/work/** and dial-smart-system/certification/recovery-lineage-vN/ (which are generated snapshots, not applied migrations).
- Any REVOKE/GRANT sweep outside the migrations dir.

**confidence**: high (on the migration-file-level conclusion: the 2024 permissive INSERT/UPDATE policies are never dropped, and the two 20260108 drops are name-mismatched no-ops). Live-DB reachability carries the grants caveat above.
