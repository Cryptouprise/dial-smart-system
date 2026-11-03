# security::secdef-rls-bypass::x02

- status: completed
- tldr: SECDEF/RLS audit done: 3 anon grants (token-gated), no default-privilege widening, ~6 residual definer funcs lacking REVOKE, all tables RLS-enabled. Confidence medium.

Node security::secdef-rls-bypass::x02 CLOSED (atomic execute). Audited all SQL migrations in C:/Users/charl/dial-smart-system/supabase/migrations across the 4 cross-cutting concerns. (1) GRANT EXECUTE to anon/PUBLIC: only 3 lines, all TO anon, all in the token-gated GHL shadow-ingest lane (20260713074000:683-686, 20260713075000:273-275); zero literal TO PUBLIC; backing tables REVOKE'd from all roles. (2) No ALTER DEFAULT PRIVILEGES anywhere; no GRANT ON TABLE TO anon; only ON ALL TABLES grant is to postgres (20251204062700:7). All table grants are to authenticated (RLS-gated read) and service_role. (3) ~164 SECURITY DEFINER over 61 files; curated lock_down migration 20260701132102 revokes 37 GROUP A sigs + GROUP B helpers. High-confidence RESIDUALS (definer + no REVOKE, not on lock_down list): get_user_organizations, get_organization_for_user, get_organization_for_lead, check_auto_recharge, deduct_call_credits, update_daily_usage_summary. Proved the exposure class was real: reset_stale_daily_calls/increment_daily_calls_with_reset were definer+ungranted-then-revoked by lock_down. (4) Zero DISABLE RLS, zero NO FORCE; only 4 tables use FORCE (external_control_*, 20260713130000:459-465); all 191 migration-created tables have ENABLE RLS. Confidence: medium. Deliverable: typed artifact on the node.

## Artifact

**Findings**

(1) GRANT EXECUTE to anon/PUBLIC: only 3 lines exist, all TO anon (zero literal GRANT EXECUTE .. TO PUBLIC). 20260713074000_ghl_shadow_ingest_lane.sql:683 grants get_ghl_shadow_ingest_contract(text,text) TO anon; :684-686 grants record_ghl_shadow_ingest_receipt(13 args) TO anon. 20260713075000_ghl_shadow_reconciliation_export.sql:273-275 re-grants record_ghl_shadow_ingest_receipt TO anon. These are DELIBERATE and token-gated: both assert a secret ingest RPC token (SHA-256 in Vault) and their backing tables are REVOKE'd from PUBLIC,anon,authenticated AND service_role (20260713074000:660-681). Lane is evidence-only, cannot authorize contact/launch/messaging. Intentional anon surface, worth monitoring. (2) GRANT ON TABLE / ON ALL TABLES / ALTER DEFAULT PRIVILEGES: NO ALTER DEFAULT PRIVILEGES anywhere. NO GRANT ... ON TABLE ... TO anon anywhere. Only ON ALL TABLES is 20251204062700:7 GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres (postgres only, benign). All table grants are to authenticated (read-only SELECT on core tables) and service_role; notable authenticated SELECT on billing tables (20260713065000:152-155), call_logs (20260713071000:46), dnc_list SELECT+INSERT (20260713073000:55), dialing_queues (20260713064000:60), phone_numbers/retell_agents (20260713072000:265-266), api/slack/voice/coach tables. All RLS-gated. (3) SECURITY DEFINER without REVOKE: ~164 SECURITY DEFINER occurrences in 61 files. Curated hardening migration 20260701132102_lock_down_privileged_rpcs_and_definer_views.sql dynamically REVOKEs a GROUP A list of 37 server-only definer signatures from PUBLIC,anon,authenticated (:67) and GROUP B RLS helpers from PUBLIC,anon (:81-90). Postgres default grants EXECUTE on new functions to PUBLIC, so any definer function not individually REVOKEd AND not on that list stayed anon-callable. HIGH-CONFIDENCE RESIDUAL CANDIDATES (definer file has zero REVOKE and name not in lock_down lists): get_user_organizations(uuid) [20260108:76]; get_organization_for_user(uuid) [20260124_v2:538]; get_organization_for_lead(uuid) [same:560]; check_auto_recharge(uuid) [same:580]; deduct_call_credits [20260124_white_label_credits:291]; update_daily_usage_summary() trigger [same:480]. Some may be superseded/dropped in live DB (unverifiable from repo). CONFIRMED-EXPOSED-AND-FIXED proof: reset_stale_daily_calls(uuid) and increment_daily_calls_with_reset(uuid) were definer + GRANTed only to authenticated/service_role with NO revoke (20260115000000:57-60) yet appear in the lock_down GROUP A revoke list (:43,:53) - proving the exposure class was real. All 2026-07 boundary migrations pair definer CREATEs with explicit REVOKE. (4) RLS enable vs force vs disable: ZERO DISABLE ROW LEVEL SECURITY, ZERO NO FORCE. 261 total RLS alter statements. Only FOUR tables use FORCE ROW LEVEL SECURITY (20260713130000:459,461,463,465 - external_control_installations/principals/command_claims/command_receipts); all others use plain ENABLE (owner bypasses RLS, normal). Of 191 tables created in migrations every real one has matching ENABLE RLS (2 apparent misses were comment regex artifacts at 20260712010000:4 and 20250619152448:2). Core tables leads/campaigns/phone_numbers ENABLE'd at 20260712070000:197-199; call_logs at 20260713071000:6.

**evidence**

- 20260713074000_ghl_shadow_ingest_lane.sql:683,684-686 GRANT EXECUTE TO anon; :660-681 REVOKE ALL from PUBLIC,anon,authenticated,service_role on the shadow tables
- 20260713075000_ghl_shadow_reconciliation_export.sql:273-275 record_ghl_shadow_ingest_receipt TO anon
- 20251204062700_c7d0cc0d-ce0d-4041-992b-b13e6ed23207.sql:7 only ON ALL TABLES grant, TO postgres
- findstr: ALTER DEFAULT PRIVILEGES = 0 matches; GRANT EXECUTE = 90 lines, 3 with TO anon, 0 literal TO PUBLIC
- 20260701132102_lock_down_privileged_rpcs_and_definer_views.sql:26-63 GROUP A 37 sigs; :67 REVOKE EXECUTE FROM PUBLIC,anon,authenticated; :80-90 GROUP B REVOKE FROM PUBLIC,anon
- 20260115000000_add_daily_calls_reset_functions.sql:6-10,29-36 SECURITY DEFINER; :57-60 GRANT EXECUTE to authenticated/service_role with NO REVOKE
- Residual candidates: 20260108_phase2_organizations.sql:76 get_user_organizations; 20260124_white_label_credits_v2_enhanced.sql:538 get_organization_for_user, :560 get_organization_for_lead, :580 check_auto_recharge; 20260124_white_label_credits.sql:291 deduct_call_credits, :480 update_daily_usage_summary
- findstr: FORCE ROW LEVEL SECURITY only at 20260713130000:459,461,463,465; DISABLE ROW LEVEL SECURITY = 0 matches
- PowerShell scan: 191 CREATE TABLE, 194 ENABLE RLS, 261 RLS alter stmts; created-without-ENABLE = 2 regex artifacts only (20260712010000:4, 20250619152448:2)
- 20260712070000:197-199 ENABLE campaigns/leads/phone_numbers; 20260713071000:6 ENABLE call_logs

**validation**

Used findstr /S /N line-exact extraction (no grep truncation) for GRANT EXECUTE, TO anon/public, ON ALL TABLES, ALTER DEFAULT PRIVILEGES, FORCE/DISABLE RLS, REVOKE. Cross-referenced definer-file set vs REVOKE-file set via findstr /M to derive no-REVOKE definer candidates. Independently re-derived RLS coverage by PowerShell-parsing every migration for CREATE TABLE vs ENABLE RLS names and set-differencing. Verified the 2 residual table misses were comment false-positives by reading the source lines. Confirmed anon grants are token-gated by reading 20260713074000:660-699.

**open_questions**

- Do the residual definer candidates (get_user_organizations, get_organization_for_user, get_organization_for_lead, check_auto_recharge, deduct_call_credits, update_daily_usage_summary) still exist in the LIVE database and remain callable by anon? Repo migrations cannot show live ACLs or post-migration drops.
- Are there definer functions not on the lock_down GROUP A/B list and not individually revoked, but later re-created in a boundary migration with a revoke? Needs a per-signature join across all 61 definer files.
- Whether storage.objects public SELECT policies (broadcast-audio bucket public=true; marketing-assets) are intended long-term; 20260601173321 dropped the anonymous marketing-assets INSERT policy and 20260720232851 flags storage.objects anon-listing policies.

**what_i_did_not_check**

- Actual live production ACLs (pg_proc.proacl / pg_class.relacl) - migration-source only, not the running DB; dashboard-applied SQL absent from repo is invisible here.
- Core base tables created outside this folder (leads, campaigns, users, call_logs, user_roles, storage.*) - original CREATE/RLS not in this folder; only inferable from later ALTERs.
- Per-signature exhaustive join of every definer function against every REVOKE and the lock_down list - class and high-confidence candidates identified, but each residual one not proven live/exposed.
- Tables created via dynamic SQL (EXECUTE/DO blocks) that a CREATE TABLE regex would miss.
- Edge Function code, PostgREST exposed-schema config, and Supabase anon default-privilege setup (withheld: determines whether PUBLIC-default EXECUTE actually reaches anon here).
- RLS policy correctness (USING/WITH CHECK logic) - RLS enabled was verified, policy strength was not audited.

**confidence**: medium