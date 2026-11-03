# security::secdef-rls-bypass::g04

- status: completed
- tldr: Audit done: 10 SECURITY DEFINER fns, no grants in-file, no tenant checks, later lockdown limits to service_role.

AUDIT COMPLETE - node security::secdef-rls-bypass::g04. 4 files, 15 SECURITY DEFINER definitions / 10 distinct names. All plpgsql volatile, none RETURNS trigger. ZERO GRANT/REVOKE in the four files. No body has a tenant check. Later migration 20260701132102 locks all 10 down to service_role.

## Artifact

**Findings**

AUDITED 4 files in C:/Users/charl/dial-smart-system/supabase/migrations. 15 SECURITY DEFINER function DEFINITIONS, 10 DISTINCT names. ALL are LANGUAGE plpgsql, VOLATILE (default; none declare volatility). NONE return trigger (all return INTEGER/UUID/VOID/JSONB/TABLE). ZERO GRANT or REVOKE statements exist inside ANY of the four files (grep-confirmed 0 matches for GRANT|REVOKE|EXECUTE per file) -> default Postgres behavior grants EXECUTE to PUBLIC (anon+authenticated) on creation. NO function body contains an auth.uid()/current_user/tenant check; every one trusts a caller-supplied p_user_id (update_variant_stats trusts only a variant id and has NO user scoping at all). This is the classic SECURITY DEFINER RLS-bypass / confused-deputy pattern. MITIGATION IS OUT-OF-SCOPE-BUT-EXISTS: later migration 20260701132102_lock_down_privileged_rpcs_and_definer_views.sql (applied to prod via MCP 2026-07-01) REVOKEs EXECUTE from PUBLIC,anon,authenticated and GRANTs only to service_role for all 10 distinct names (lines 30,37,47,48,49,54,55,56,57,61). Fresh DB replay of the audited 4 files WITHOUT that lockdown re-opens the exposure. EXTRA: file 4's 3 functions are SECURITY DEFINER with NO `SET search_path` (search_path-injection risk); files 1-3 all set `SET search_path TO 'public'`. Column drift: recalculate_number_health uses cl.caller_id in file2(line183) vs cl.from_number in file3(line237) - one is wrong vs live schema. No secret literals; file4 pg_cron passes app.service_role_key via current_setting (line 285).

**evidence**

- file1 20260210143830 line 8 expire_old_actions(); SECURITY DEFINER L11; SET search_path L12; UPDATE ai_action_queue L17; org check NONE
- file1 L27 save_operational_memory(); SEC L36; sp L37; io ai_operational_memory L43/50/59; NONE
- file1 L68 recalculate_calling_windows(); SEC L71; sp L72; read call_logs L101; write optimal_calling_windows L77; NONE
- file1 L120 seed_default_playbook(); SEC L123; sp L124; read/write followup_playbook L129/134; NONE
- file1 L223 select_script_variant(); SEC L229; sp L230; read agent_script_variants L239/248; NONE
- file1 L266 update_variant_stats(); SEC L274; sp L275; write agent_script_variants L278 (by id only, NO user scope); NONE
- file1 L291 calibrate_lead_scoring_weights(); SEC L294; sp L295; read lead_score_outcomes L311/326; write lead_scoring_weights L343; NONE
- file1 L364 rebalance_variant_weights(); SEC L370; sp L371; io agent_script_variants L381/391/406/415; NONE
- file2 20260210144944 L29 seed_disposition_values(); SEC L32; sp L33; io disposition_values L38/41; NONE
- file2 L145 recalculate_number_health(); SEC L148; sp L149; read phone_numbers L169 & call_logs L182(caller_id L183); write number_health_metrics L217; NONE
- file3 20260210_ai_intelligence_upgrade L48 seed_disposition_values(); SEC L51; sp L52; io disposition_values L57/61; NONE
- file3 L198 recalculate_number_health(); SEC L201; sp L202; read phone_numbers L222 & call_logs L236(from_number L237); write number_health_metrics L276; NONE
- file4 20260210_autonomous_engine_upgrade L127 expire_old_actions(); SEC L130; NO SET search_path; UPDATE ai_action_queue L135 (global, all tenants); NONE
- file4 L149 save_operational_memory(); SEC L158; NO SET search_path; io ai_operational_memory L163/168/176/184; ON CONFLICT ..._pkey DO NOTHING L165; NONE
- file4 L196 recalculate_calling_windows(); SEC L199; NO SET search_path; read call_logs L229; write optimal_calling_windows L204; NONE
- grep 0 matches for GRANT/REVOKE/EXECUTE in all 4 files
- 20260701132102 L23-71 REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated + GRANT ... TO service_role; list L30,37,47,48,49,54,55,56,57,61
- file4 pg_cron L281-288 net.http_post with Authorization 'Bearer '|| current_setting('app.service_role_key')

**validation**

Read all 4 files in full (460/346/433/294 lines). Cross-checked SECURITY DEFINER count via regex grep (file1=8+8 search_path, file2=2, file3=2, file4=3 - file4 zero search_path). Confirmed 0 GRANT/REVOKE/EXECUTE in the four files via glob-scoped regex grep. Grepped repo-wide for later REVOKE/GRANT on these names and read 20260701132102 to confirm service_role-only lockdown of all 10 distinct names. No live DB queries (research-only).

**open_questions**

- Does the LIVE Supabase project (emonjusymdripmkvtttc) actually reflect 20260701132102, or do any of these still carry PUBLIC EXECUTE?
- Do any OTHER migrations after 2026-02-10 re-GRANT EXECUTE to authenticated/anon on these names?
- Is recalculate_number_health's live column caller_id or from_number (file2 vs file3 disagree)?
- Are these functions reachable via edge functions using service_role (expected) and is that the only caller?

**what_i_did_not_check**

- Live DB grant state / pg_proc.proacl (no DB access; grant conclusions are from repo migrations only)
- Full repo scan of ALL 100+ migrations for a later re-GRANT to authenticated/anon on these names (only the 20260701 lockdown was inspected)
- The edge functions ai-autonomous-engine / ai-brain call paths in depth (only confirmed they call via supabase.rpc with p_user_id)
- RLS policies on the underlying tables (disposition_values, number_health_metrics, ai_action_queue etc.) beyond the CREATE POLICY lines in these files
- Whether the audited four files were ever applied to prod before the lockdown
- anon vs authenticated reachability over PostgREST given current PostgREST exposure settings

**confidence**: high