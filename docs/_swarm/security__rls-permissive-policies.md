# security::rls-permissive-policies

- status: completed
- tldr: 3 unsuperseded tenant-blind RLS policies (disposition_metrics, edge_function_errors, predictive_dialing_stats); 6 already remediated; live state unverified.

RESEARCH ONLY complete: tenant-blind RLS policies in dial-smart-system/supabase/migrations. 3 unsuperseded (likely live) findings, 6 remediated-in-repo, 5 false positives. Policies with no TO clause default to PUBLIC (anon+authenticated).

MOST EXPLOITABLE (unsuperseded in repo history):
1. disposition_metrics INSERT WITH CHECK (true) + UPDATE USING (true) — 20241218_disposition_metrics.sql:61-64 and :67-70. Tenant-scoped. Never dropped by name.
2. edge_function_errors INSERT WITH CHECK (true) — 20241218_edge_function_errors.sql:39-42 ('Service role can insert errors'); the 2026-07-01 lockdown dropped only the differently-named 2026 policy.
3. predictive_dialing_stats INSERT WITH CHECK (true) — 20251109171900_concurrency_management.sql:61-63; a second per-user policy exists but permissive OR keeps (true) effective.

LOW: organizations INSERT WITH CHECK (auth.uid() IS NOT NULL) — 20260109034232:91-94 (any signed-in user can create an org).

REMEDIATED in repo (safe if fix applied): daily_reports, system_alerts, calendar_tool_invocations (20260601173321); ghl_pending_updates (20260409195518); rotation_history (20251103035736); system_health_logs (20251103034349); edge_function_errors 2026 policy (20260701132102).
FALSE POSITIVES: USING(true) but TO service_role — user_credentials, calendar_integrations, api_keys, slack_users, coach_proposals.

VALIDATION: case-insensitive regex greps (USING (true), WITH CHECK (true), auth.uid() IS NOT NULL, auth.role(), TO anon); every hit read in full; cross-checked against DROP POLICY, pg_policies loops, and remediation migrations; cross-referenced live snapshot docs/wholesale/audit/phase1/LIVE-SCHEMA.md.

BLOCKERS/FOLLOW-UPS: live policy state for the ops tables is unverified (LIVE-SCHEMA.md covers only core tables). Recommended: (a) verify the 3 top policies exist live via pg_policies, (b) confirm anon/authenticated table grants, (c) confirm tenant_scope_guard triggers do NOT cover these ops tables. Full detail in the node artifact.

## Artifact

**Findings**

Tenant-blind RLS policies (USING/WITH CHECK with no org/tenant/user predicate) in dial-smart-system/supabase/migrations. Ranked most-exploitable first. NOTE: policies with no TO clause default to PUBLIC (= anon + authenticated), so they are reachable by unauthenticated PostgREST callers too.

1. disposition_metrics: FOR INSERT WITH CHECK (true) [20241218_disposition_metrics.sql:61-64, policy 'Service role can insert disposition metrics'] and FOR UPDATE USING (true) [same file :67-70, policy 'Service role can update disposition metrics']. Tenant-scoped table (user_id; organization_id added later). UNSUPERSEDED: no later migration drops these names (phase2 20260108_add_org drops only differently-named policies 'Users can view their own disposition metrics'/'System can insert disposition metrics'). Exploit: anon/authenticated can insert arbitrary rows and UPDATE any row (cross-tenant analytics tampering). HIGH.

2. edge_function_errors: FOR INSERT WITH CHECK (true) [20241218_edge_function_errors.sql:39-42, policy 'Service role can insert errors']. Tenant-scoped (user_id). UNSUPERSEDED: the 2026-07-01 lockdown (20260701132102) only dropped the differently-named 2026-01-09 policy 'Service role can insert edge function errors' (20260109034147:41-44). The legacy true policy remains -> arbitrary insert. HIGH/MED.

3. predictive_dialing_stats: FOR INSERT WITH CHECK (true) [20251109171900_concurrency_management.sql:61-63, policy 'System can insert dialing stats']. Tenant-scoped (user_id). UNSUPERSEDED: never dropped; a second per-user insert policy exists (20251201052229:83-86) but permissive policies are OR-ed so (true) still grants all. MED/HIGH.

4. organizations: FOR INSERT WITH CHECK (auth.uid() IS NOT NULL) [20260109034232_42952c00:91-94, policy 'Authenticated users can create organizations']. Not 'true' but no tenant predicate; any signed-in user can create an org. Not a cross-tenant read/write leak per se. Confirmed present in live per LIVE-SCHEMA.md. LOW.

HISTORICAL / already remediated in repo (not currently exploitable if the fix migration is applied):
- daily_reports INSERT WITH CHECK(true)+UPDATE USING(true) 20251204055913:42-48 -> fixed 20260601173321:41-53.
- system_alerts INSERT true 20260104213053:31-33 -> fixed 20260601173321:22-27.
- calendar_tool_invocations INSERT true 20260104213053:56-58 -> fixed 20260601173321:30-38.
- ghl_pending_updates FOR ALL USING(true) WITH CHECK(true) 20260204202911:82-85 -> fixed 20260409195518:16-20.
- rotation_history INSERT true 20250619152448:88-89 -> fixed 20251103035736:8-18.
- system_health_logs SELECT USING(true)+INSERT true 20250619152448:107-110 -> fixed 20251103034349:83-94 (also not tenant-scoped).

FALSE POSITIVES (USING(true) but correctly scoped): user_credentials 20260713063000:44-49, calendar_integrations 20260713130000:53-58, api_keys 20260713130000:123-128, slack_users 20260713130000:214-219, coach_proposals 20261029180000:93-95 -- all are TO service_role, so not exploitable. auth.role()='service_role' policies (white_label_credits, demo tables, storage broadcast-audio) are correctly scoped.

**evidence**

- 20241218_disposition_metrics.sql:55-70 (INSERT WITH CHECK (true) at :64, UPDATE USING (true) at :70)
- 20241218_edge_function_errors.sql:39-42 (WITH CHECK (true))
- 20251109171900_concurrency_management.sql:56-63 (System can insert dialing stats WITH CHECK (true) at :63)
- 20260107140730_63375bb5-d565-4a9a-8c3e-81f9aa99215f.sql:37-41 (recreate FOR ALL auth.uid()=user_id; does not drop legacy names)
- 20260108_phase2_add_org_to_additional_tables.sql:221-232 (drops 'Users can view their own disposition metrics'/'System can insert disposition metrics' only)
- 20260601173321_ff6ff43a-ccf4-409e-9df7-29b6b1e818c2.sql:22-53 (remediation for system_alerts, calendar_tool_invocations, daily_reports)
- 20260409195518_bea68906-b756-4bfb-891c-6984a71640de.sql:16-20 (ghl_pending_updates fix)
- 20251103035736_ea6eef40-afad-486e-8d72-4811de5f289c.sql:8-18 (rotation_history fix)
- 20251103034349_d8aa891c-617a-4d2f-a0e1-5d250f6a27e1.sql:83-94 (system_health_logs fix)
- 20260701132102_lock_down_privileged_rpcs_and_definer_views.sql:119-125 (edge_function_errors 2026 policy fix)
- 20260713130000_external_observer_control_plane.sql:53-58,123-128,214-219 (TO service_role - false positives)
- docs/wholesale/audit/phase1/LIVE-SCHEMA.md:31-40,54-55 (live policies per-user, core 8 tables have tenant_scope_guard trigger; ops tables not listed)

**validation**

Case-insensitive regex greps across supabase/migrations for USING\s*\(\s*true\s*\), WITH CHECK\s*\(\s*true\s*\), auth.uid() IS NOT NULL, auth.role(), and TO anon; each hit read in full context; each candidate cross-checked against DROP POLICY and loop-based drops and against remediation migrations; live snapshot docs consulted for current-state cross-reference. Verified the three top findings are never dropped by name or by a pg_policies loop.

**open_questions**

- Are the three unsuperseded policies (disposition_metrics, edge_function_errors legacy, predictive_dialing_stats) actually live, given the live DB has 160 migrations incl. 10 uncommitted live_only ones? LIVE-SCHEMA.md does not cover these ops tables.
- Do the live tenant_scope_guard / set_organization_from_user triggers extend to these ops tables (they are documented only for the 8 core tables)?
- Do anon/authenticated actually hold INSERT/UPDATE privileges on these ops tables (Supabase default grants assumed, not confirmed)?

**what_i_did_not_check**

- No live DB connection: live policy state for ops/monitoring tables (disposition_metrics, edge_function_errors, daily_reports, system_alerts, system_health_logs, predictive_dialing_stats) is unverified; LIVE-SCHEMA.md (2026-10-28) lists only core-table policies.
- Did not enumerate all 160 live migrations or the other live_only/*.sql files beyond close_cross_tenant_write_leaks.sql.
- Did not confirm per-table GRANTs to anon/authenticated (relied on Supabase default privileges).
- Did not scan for tables where RLS is never enabled (DISABLE ROW LEVEL SECURITY = 0 matches, but absence of ENABLE not audited) - out of node scope.
- Did not audit dynamic-SQL policy creation beyond the loops in phase1_org_scope/sms_per_org/door_to_door/billing_lock.
- Did not inspect SQL outside supabase/migrations (e.g. supabase/functions-live, scripts) nor the repo's docs/wholesale/audit/out and out-stale audit reports in detail.

**confidence**: medium