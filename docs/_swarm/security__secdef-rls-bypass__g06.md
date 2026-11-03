# security::secdef-rls-bypass::g06

- status: completed
- tldr: Audited 5 migrations: lockdown flips 4 views to security_invoker; REVOKEs 36 fns from public/anon/authenticated (service_role re-granted) + 4 RLS helpers from anon.

Audited all 5 migrations in C:/Users/charl/dial-smart-system/supabase/migrations (repo-file only, no DB calls, no secrets printed).

20260701132102 (lockdown): GROUP A DO block (L23-71) REVOKEs EXECUTE FROM PUBLIC,anon,authenticated (L67) and re-GRANTs to service_role (L68) for 36 signatures (L27-62, listed in artifact). GROUP B (L77-93) REVOKEs FROM PUBLIC,anon (L89) and GRANTs TO authenticated,service_role (L90) for 4 RLS helpers: get_user_org_role, has_role, is_org_admin, user_in_organization (L81-84). Views flipped to security_invoker=on at L111: top_openers, time_wasted_summary, voicemail_performance, call_outcome_dimensions (L103-106). edge_function_errors insert policy replaced L119-125.

File A 20260409020305: api_keys + api_key_audit_log tables, RLS, 2 policies; fn api_keys_touch_updated_at (plpgsql, RETURNS TRIGGER), touch_api_key (plpgsql SECURITY DEFINER, VOID); GRANT L90 touch_api_key TO service_role; org check NONE.
File B 20260409030000: mint_api_key (plpgsql SECURITY DEFINER, TABLE) REVOKE L101 PUBLIC / GRANT L102 service_role; prune_api_key_audit_log (plpgsql SECURITY DEFINER, INTEGER) REVOKE L129 / GRANT L130 service_role; org check NONE.
File C 20260410135538: duplicates A's tables/policies + touch_api_key (GRANT L64); REDEFINES mint_api_key sig (uuid,text,text[],int,interval) matching lockdown, REVOKE L119/GRANT L120; redefines prune_api_key_audit_log with NO grant in-file.
File D 20260415230836: claim_pending_dispatches (LANGUAGE SQL, VOLATILE, NOT definer, RETURNS SETOF dialing_queues), GRANT L25 service_role, no REVOKE; org check NONE.

See node artifact for full file:line detail.

## Artifact

**Findings**

Audited 5 migrations. FILE E (lockdown) 20260701132102: GRP A DO block L23-71 does, for each existing sig, REVOKE EXECUTE FROM PUBLIC,anon,authenticated (L67) + GRANT EXECUTE TO service_role (L68). 36 sigs L27-62: add_credits(uuid,int,text,text,text) L27; add_credits(uuid,int,text,text,text,uuid) L28; add_credits(uuid,int,text,text,text,uuid,text) L29; calibrate_lead_scoring_weights(uuid) L30; check_and_reset_daily_calls() L31; check_credit_balance(uuid,numeric) L32; cleanup_old_guardian_alerts() L33; create_user_feature_flags() L34; decrement_daily_calls(text) L35; decrement_daily_calls(uuid) L36; expire_old_actions() L37; finalize_call_cost(uuid,uuid,text,numeric,int,text,text) L38; finalize_call_cost(uuid,uuid,text,numeric,int,text) L39; get_effective_daily_calls(uuid) L40; get_funnel_trend(uuid,int) L41; get_telnyx_assistant_for_call(uuid,uuid) L42; increment_daily_calls_with_reset(uuid) L43; merge_custom_fields(uuid,jsonb) L44; mint_api_key(uuid,text,text[],int,interval) L45; prune_api_key_audit_log(int) L46; rebalance_variant_weights(uuid,text) L47; recalculate_calling_windows(uuid) L48; recalculate_number_health(uuid) L49; reserve_credits(uuid,int,uuid,text) L50; reserve_credits(uuid,int,uuid,text,text) L51; reset_all_daily_calls() L52; reset_stale_daily_calls(uuid) L53; save_operational_memory(uuid,text,text,jsonb,int) L54; seed_default_playbook(uuid) L55; seed_disposition_values(uuid) L56; select_script_variant(uuid,text) L57; touch_api_key(uuid,text) L58; update_guardian_alerts_updated_at() L59; update_updated_at_column() L60; update_variant_stats(uuid,text,int,boolean) L61; upgrade_user_tier(uuid,text,text,text) L62. GRP B DO block L77-93: REVOKE FROM PUBLIC,anon (L89) + GRANT TO authenticated,service_role (L90), 4 helpers L81-84: get_user_org_role(uuid) L81; has_role(uuid,app_role) L82; is_org_admin(uuid) L83; user_in_organization(uuid) L84 (authenticated KEEPS execute - used in RLS clauses). VIEWS flipped to security_invoker=on L111, list L103-106: public.top_openers L103; time_wasted_summary L104; voicemail_performance L105; call_outcome_dimensions L106; guarded to_regclass L110. edge_function_errors: DROP policies L119-120, CREATE 'Users insert their own edge function errors' L121-125 FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid()).
FILE A 20260409020305 L1-4 header. Tables api_keys L6-22, api_key_audit_log L29-41; RLS L47-48; policies L50-54, L56-59. Fns: api_keys_touch_updated_at L62-68 plpgsql RETURNS TRIGGER (yes) + trigger L70-74; touch_api_key(uuid,text) L77-88 plpgsql SECURITY DEFINER RETURNS VOID. GRANT L90 touch_api_key TO service_role. Tables: UPDATE api_keys L83. Org check: NONE (only auth.uid()=user_id policies).
FILE B 20260409030000 L1-19 header. mint_api_key(uuid,text,text[],uuid,int,timestamptz) L21-97 plpgsql SECURITY DEFINER RETURNS TABLE; REVOKE L101 FROM PUBLIC, GRANT L102 TO service_role. Reads organization_users L58, INSERT api_keys L73. prune_api_key_audit_log(int DEF30) L110-127 plpgsql SECURITY DEFINER RETURNS INTEGER; REVOKE L129 PUBLIC, GRANT L130 service_role; DELETE api_key_audit_log L121. Org check: NONE.
FILE C 20260410135538 L1. Duplicates A: CREATE TABLE IF NOT EXISTS api_keys L2-18, audit L25-37, policies L45-52, api_keys_touch_updated_at L54-55 (RETURNS TRIGGER) + trigger L57-59, touch_api_key L61-62 SECURITY DEFINER RETURNS VOID, GRANT L64 service_role. REDEFINES mint_api_key with different sig (uuid,text,text[],int,interval) L69-117 plpgsql SECURITY DEFINER SET search_path=public RETURNS TABLE(name...,plaintext) - matches lockdown L45; REVOKE L119 PUBLIC, GRANT L120 service_role. REDEFINES prune_api_key_audit_log(int DEF90) L123-139 with NO REVOKE/GRANT in-file. Reads organization_users L101, INSERT api_keys L105, DELETE audit L134. Org check: NONE.
FILE D 20260415230836 L1 (no header). claim_pending_dispatches(uuid[],int DEF50) L2-23 LANGUAGE SQL (no volatility kw=default VOLATILE), NOT security definer, RETURNS SETOF dialing_queues; GRANT L25 TO service_role (no REVOKE, PUBLIC not removed here). UPDATE dialing_queues L9, read subquery L14. Org check: NONE (only campaign_id filter).

**evidence**

- .../20260701132102_lock_down_privileged_rpcs_and_definer_views.sql:67
- .../20260701132102...:68
- .../20260701132102...:27-62
- .../20260701132102...:89-90
- .../20260701132102...:81-84
- .../20260701132102...:111
- .../20260701132102...:103-106
- .../20260701132102...:119-125
- .../20260409020305_api_keys.sql:90
- .../20260409030000_mint_api_key_helper.sql:101-102
- .../20260409030000...:129-130
- .../20260410135538_260acbba-269c-4326-a263-033f8c9c2ce6.sql:119-120
- .../20260415230836_605b13a6-9584-4a9d-8008-8724b54b2505.sql:25

**validation**

Read all 5 files in full (95/133/139/25/125 lines); verified every GRANT/REVOKE, function header, RETURNS clause and view ALTER by direct file read; cross-checked FILE C mint_api_key signature matches lockdown GROUP A entry. No DB connection, no commands run.

**open_questions**

- Live DB: do all GROUP A signatures exist, or do guards skip (3 add_credits + 2 reserve_credits variants - likely only one each exists)?
- FILE D never REVOKEs PUBLIC on claim_pending_dispatches - is PUBLIC execute still open live?
- FILE C's prune_api_key_audit_log(int) has no GRANT in-file; is service_role execute bound to that body or only FILE B's?

**what_i_did_not_check**

- organizations/organization_users definitions and whether api_keys.organization_id is enforced at query time
- RLS policies on dialing_queues/organization_users (out of scope) constraining claim_pending_dispatches
- whether security_invoker views' base tables have passable RLS for authenticated
- later migrations that might re-GRANT execute to anon/authenticated post-lockdown
- live DB state via MCP (repo-file-only audit)

**confidence**: high