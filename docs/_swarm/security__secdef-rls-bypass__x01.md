# security::secdef-rls-bypass::x01

- status: completed
- tldr: ACL sweep of 199 migrations: 97 SECURITY DEFINER functions, 96 revoked/managed, 1 never revoked (get_user_organizations) => default PUBLIC EXECUTE.

DONE: Static ACL sweep of all 199 migrations in dial-smart-system/supabase/migrations for REVOKE statements, SECURITY INVOKER, and dynamic revokes; produced revoked-vs-never-revoked list of SECURITY DEFINER functions.

KEY RESULT (FACT): 97 distinct SECURITY DEFINER functions; 96 are ACL-managed. EXACTLY ONE is never revoked => retains default PUBLIC EXECUTE: public.get_user_organizations(uuid) at 20260108_phase2_organizations.sql:76-84 (LANGUAGE SQL STABLE SECURITY DEFINER, body selects organization_id FROM organization_users WHERE user_id = user_uuid). anon + authenticated can call it over PostgREST with any user_uuid and enumerate org memberships (RLS bypass). It is needed by RLS policies (authenticated should keep it), but PUBLIC/anon was never revoked.

ALSO PRODUCED: full REVOKED-from-PUBLIC,anon,authenticated list (GROUP A dynamic at 20260701132102:26-63/:67 plus ~70 explicit revokes across the 20260712-20260720 and 20261028-20261103 boundary migrations); anon-only revokes (GROUP B 20260701132102:80-84/:89: get_user_org_role, has_role, is_org_admin, user_in_organization; plus external_control_is_org_admin, get_campaign_contact_release_status); revoke-then-regrant pairs; dynamic table/column revoke patterns; SECURITY INVOKER guard rewrites (20261029150000:5, 20261029180000:121, 20261029200000:44); and DEFINER views flipped to security_invoker (20260701132102:102-111).

PRECEDENCE CONFIRMED: latest statement wins (increment_daily_calls_with_reset GRANT 20260115000000:59 -> REVOKE GROUP A 20260701132102:67 => revoked; default_organization_for_user GRANT 20261029142121:30 -> REVOKE-from-authenticated 20261029150000:23 => service_role only). No GRANT ... TO PUBLIC exists.

VALIDATION: PowerShell regex scan; DEFINER extraction at 40- and 140-line lookback both agree; get_user_organizations manually confirmed and all 52 references checked (none is a REVOKE/GRANT); zero GRANT-to-PUBLIC grep hits.

FOLLOW-UPS: Static repo sweep only - NOT verified against live prod pg_proc/proacl. Worth one live query: confirm get_user_organizations ACL in prod, and check for any DEFINER functions created out-of-band via MCP absent from migrations (same default-PUBLIC-EXECUTE exposure). Overload-level revocation (add_credits/mint_api_key/finalize_call_cost/reserve_credits) also needs live signature verification.

## Artifact

**Findings**

METHOD: swept all 199 .sql files in supabase/migrations. Extracted (a) every REVOKE line with file:line+target role+object, (b) every SECURITY INVOKER, (c) every dynamic revoke (EXECUTE format('REVOKE...')), (d) every SECURITY DEFINER function (CREATE ... FUNCTION public.X within 140 lines of SECURITY DEFINER), then diffed the DEFINER set against the role-managed set (any REVOKE / GRANT-EXECUTE / GROUP-array mention). HEADLINE: 97 distinct SECURITY DEFINER functions exist; 96 are ACL-managed; EXACTLY ONE has NO explicit REVOKE/GRANT anywhere: public.get_user_organizations(uuid) at 20260108_phase2_organizations.sql:76 -> retains Postgres default PUBLIC EXECUTE, so anon + authenticated can invoke it over PostgREST (/rest/v1/rpc/get_user_organizations) with an arbitrary user_uuid. Body (20260108_phase2_organizations.sql:76-84): LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=public, SELECT organization_id FROM organization_users WHERE user_id = user_uuid -> bypasses RLS on organization_users and accepts any UUID, so any anon caller can enumerate org-membership IDs for any user_id. It is referenced by RLS policies (20260108_phase2_add_org_to_core_tables.sql:47+ ; _additional_tables.sql:37+) so authenticated needs EXECUTE, but PUBLIC/anon was never revoked. === REVOKED FROM ALL CLIENT ROLES (PUBLIC+anon+authenticated), server-only: GROUP A dynamic list (20260701132102:26-63; revoke at :67, guarded by to_regprocedure): add_credits, calibrate_lead_scoring_weights, check_and_reset_daily_calls, check_credit_balance, cleanup_old_guardian_alerts, create_user_feature_flags, decrement_daily_calls(text/uuid), expire_old_actions, finalize_call_cost, get_effective_daily_calls, get_funnel_trend, get_telnyx_assistant_for_call, increment_daily_calls_with_reset, merge_custom_fields, mint_api_key, prune_api_key_audit_log, rebalance_variant_weights, recalculate_calling_windows, recalculate_number_health, reserve_credits, reset_all_daily_calls, reset_stale_daily_calls, save_operational_memory, seed_default_playbook, seed_disposition_values, select_script_variant, touch_api_key, update_guardian_alerts_updated_at, update_updated_at_column, update_variant_stats, upgrade_user_tier. === REVOKED FROM ALL CLIENT ROLES (explicit, file:line): evaluate_contact_stop(20260712020000:694), claim_provider_callback(:695), complete_provider_callback(:696), claim_provider_dispatch(:697), finalize_provider_dispatch(:698), record_physical_call_attempt(:699), claim_pending_dispatches(:700), claim_pending_dispatches_now(:701), provider_safety_health_check(:702); claim_workflow_external_effect(20260712030000:438), transition_workflow_external_effect(:441), resolve_workflow_external_effect(:444); claim_sms_delivery_attempt(20260712040000:355), finalize_sms_delivery_attempt(:356), reconcile_sms_delivery_attempt(:357); resolve_provider_dispatch_invoke_error(20260712050000:312); transfer_organization_membership_resources(20260712070000:1204), enforce_tenant_owned_core_resource(:1211), enforce_call_log_tenant_graph(:1212), enforce_campaign_lead_tenant(:1213), enforce_campaign_phone_tenant(:1214), enforce_dialing_queue_tenant(:1215), enforce_integration_tenant(:1216), mint_api_key(:820); retell recon 20260713043000: claim_retell_reconciliation_jobs(:1819), bind_retell_reconciliation_call(:1821), finish_retell_reconciliation_job(:1823), requeue_retell_reconciliation_job(:1826), fail_retell_reconciliation_job(:1828), mark_retell_reconciliation_run(:1830), retell_reconciliation_health_check(:1832), complete_provider_callback(:1834), claim_pending_dispatches(:1836), claim_pending_dispatches_now(:1838), configure_retell_reconciliation_cron(:1917); configure_automation_scheduler_cron(20260713050000:66); check_credit_balance(20260713060000:1001), reserve_credits(:1003), finalize_call_cost(:1005), add_credits(:1007), enforce_credit_transaction_call_tenant(:1009); repair_dnc_tenant_scope(20260713062000:168); dialing_queue_has_provider_evidence(20260713064000:403), dialing_queue_has_unresolved_lifecycle(:405), protect_dialing_queue_provider_evidence(:407), enqueue_dialing_queue(:409), cancel_dialing_queues(:411); protect_organization_credit_balance(20260713065000:215); protect_call_log_evidence(20260713071000:109); protect_provider_resource_identity(20260713072000:270), enforce_provider_phone_number_contract(:272); protect_dnc_suppression_identity(20260713073000:90); ghl_shadow_custom_field_mapping_is_exact(20260713074000:667), ghl_shadow_evidence_is_redacted(:669), protect_ghl_shadow_binding_version(:671), protect_ghl_shadow_append_only(:673), assert_ghl_shadow_ingest_rpc_token(:675), get_ghl_shadow_ingest_contract(:677), record_ghl_shadow_ingest_receipt(:679); record_ghl_shadow_ingest_receipt_core(20260713075000:182), record_ghl_shadow_ingest_receipt(:270), export_ghl_shadow_reconciliation_evidence(:560), ghl_shadow_reason_codes_are_export_safe(:563); mint_api_key(20260713130000:146), touch_api_key(:157), guard_external_control_installation(:985), guard_external_control_principal(:987), protect_external_command_evidence(:989), protect_external_control_truncate(:991), claim_external_observer_command(:993); evaluate_campaign_contact_release(20260713150000:321); get_campaign_contact_release_observer_status(20260713170000:119); claim_elite_email_execution_release(20260720120000:489), get_elite_email_execution_release_status(:493), record_elite_email_mailgun_event_receipt(20260720130000:134), register_elite_email_execution_release(20260720140000:156), prepare_elite_email_execution_release(20260720150000:219); set_org_packs(20261029010000:86), org_has_pack(:33); set_organization_from_user(20261029142121:58), enforce_organization_scope(20261029142121:110 and 20261029150000:21); append_call_live_transcript(20261029170000:175-177); coach_proposal_decide_guard(20261029180000:165), coach_move_stage(:332); guard_organization_billing_columns(20261029200000:80-82); d2d_touch_updated_at(20261102234500:114), d2d_scope_knock(:145), d2d_apply_knock(:171); d2d_knock_books_appointment(20261103020000:159). === REVOKED FROM ANON ONLY (authenticated RETAINS, needed by RLS): GROUP B (20260701132102:80-84; revoke :89): get_user_org_role, has_role, is_org_admin, user_in_organization, then GRANT authenticated,service_role (20260701132102:90). Also user_in_organization revoked PUBLIC,anon (20260712070000:194) then granted authenticated (:195); external_control_is_org_admin revoked PUBLIC,anon (20260713130000:483); get_campaign_contact_release_status revoked PUBLIC,anon (20260713160000:117). === REVOKED THEN RE-GRANTED (net: client role holds EXECUTE by design): get_ghl_shadow_ingest_contract revoked all (20260713074000:677) then GRANT anon (:683); get_elite_email_execution_release_status revoked PUBLIC,anon (20260720120000:493) then GRANT authenticated,service_role (:494); org_has_pack/set_org_packs revoked then GRANT authenticated,service_role (20261029010000:33-35,86-88); coach_recent_corrections revoked PUBLIC,anon (20261029180000:258) then GRANT authenticated,service_role (:259); org_in_good_standing/org_access_allowed revoked PUBLIC,anon (20261029200000:119-120,144-145) then GRANT authenticated,service_role (:121,:146); wh_org_active/wh_can_use revoked public,anon (20261028210000:277-278) then GRANT authenticated (:279-280); d2d_company_members revoked PUBLIC,anon (20261103023000:39) then GRANT authenticated (:40). === PRECEDENCE CONFIRMED (latest statement wins): increment_daily_calls_with_reset GRANTed authenticated 20260115000000:59, later REVOKEd GROUP A 20260701132102:67 => final revoked. reset_stale_daily_calls GRANT 20260115000000:57 -> REVOKE GROUP A => final revoked. default_organization_for_user GRANTed authenticated 20261029142121:30, later REVOKEd from authenticated 20261029150000:23 => final only service_role/postgres. No GRANT ... TO PUBLIC exists anywhere, so nothing is re-exposed to PUBLIC after a revoke. === DYNAMIC REVOKE PATTERNS: (a) function-level, guarded by to_regprocedure: 20260701132102:67 (GROUP A: FROM PUBLIC,anon,authenticated) and :89 (GROUP B: FROM PUBLIC,anon); (b) TABLE-level dynamic revokes via format(%I / %s): 20260713063000:37 (user_credentials), 20260713064000:34 (dialing_queues), 20260713065000:114+119 (billing tables + column-level), 20260713070000:310+315 (agent pricing), 20260713071000:33 (call_logs), 20260713072000:239+244 (provider resources), 20260713073000:33 (dnc_list), 20260713130000:45+105+196+953+959 (calendar_integrations/api_keys/slack_users + column-level) - table/column ACLs, not function EXECUTE. === SECURITY INVOKER (deliberate de-privileging of guards): 20261029150000_phase1_scope_guard_fix.sql:5 (enforce_organization_scope re-created INVOKER to fix a fail-open guard), 20261029180000_live_coach.sql:121 (guard fn INVOKER on purpose), 20261029200000_billing_lock.sql:44 (guard_organization_billing_columns INVOKER). === SECURITY DEFINER VIEWS flipped to security_invoker via dynamic ALTER (20260701132102:102-111): top_openers, time_wasted_summary, voicemail_performance, call_outcome_dimensions.

**evidence**

- 20260108_phase2_organizations.sql:76-84 - get_user_organizations SECURITY DEFINER, no revoke anywhere
- 20260701132102_lock_down_privileged_rpcs_and_definer_views.sql:26-63 GROUP A sigs; :67 REVOKE FROM PUBLIC,anon,authenticated; :68 GRANT service_role; :80-84 GROUP B sigs; :89 REVOKE FROM PUBLIC,anon; :90 GRANT authenticated,service_role; :102-111 view security_invoker
- 20260701133759_canonicalize_add_credits_signature.sql:109
- 20260712020000_contact_safety_and_provider_idempotency.sql:694-702
- 20260712030000_workflow_external_effect_ledger.sql:438,441,444
- 20260712040000_sms_delivery_safety.sql:354-357,359
- 20260712050000_provider_safe_unattended_backstops.sql:234,312
- 20260712070000_multi_organization_routing_contract.sql:194-195,820,1204,1211-1216
- 20260713043000_retell_automatic_reconciliation.sql:1819-1838,1917
- 20260713050000_automation_scheduler_cron_auth.sql:66
- 20260713060000_credit_ledger_schema_contract.sql:1001-1009
- 20260713062000_dnc_tenant_uniqueness_contract.sql:168
- 20260713064000_dialing_queue_mutation_boundary.sql:403-411
- 20260713065000_billing_ownership_boundary.sql:215
- 20260713071000_call_log_evidence_boundary.sql:109
- 20260713072000_provider_resource_ownership_boundary.sql:270,272
- 20260713073000_irreversible_dnc_browser_boundary.sql:90
- 20260713074000_ghl_shadow_ingest_lane.sql:667-679,683
- 20260713075000_ghl_shadow_reconciliation_export.sql:182,270,560,563
- 20260713130000_external_observer_control_plane.sql:146,157,483,985-993
- 20260713140000_legacy_runtime_function_schema_repair.sql:354
- 20260713150000_campaign_contact_release_gate.sql:321
- 20260713160000_campaign_contact_release_status.sql:117
- 20260713170000_campaign_contact_release_observer_status.sql:119
- 20260720120000_elite_email_execution_ledger.sql:489,493-494
- 20260720130000_elite_email_mailgun_event_intake.sql:134
- 20260720140000_elite_email_release_registration.sql:156
- 20260720150000_elite_email_release_preparation.sql:219
- 20261028210000_wholesale_core.sql:277-280
- 20261029010000_industry_packs.sql:33-35,86-88
- 20261029142121_phase1_org_scope.sql:28-30,58-60,110
- 20261029150000_phase1_scope_guard_fix.sql:5,21,23
- 20261029170000_browser_phone.sql:175-177
- 20261029180000_live_coach.sql:121,165,258-259,332
- 20261029200000_billing_lock.sql:44,80-82,119-121,144-146
- 20261102234500_door_to_door_core.sql:114,145,171
- 20261103020000_door_to_door_workspace.sql:159
- 20261103023000_door_to_door_members.sql:39-40
- 20260115000000_add_daily_calls_reset_functions.sql:57,59

**validation**

Heuristic static scan via PowerShell regex over 199 migration files. Cross-checks: (1) broad REVOKE grep returned 178 matches; multi-line REVOKE statements resolved to their FROM-role clause by forward-scan to next 'FROM'; (2) DEFINER extraction run at both 40-line and 140-line lookback, both yielding the same single unmanaged function (get_user_organizations); (3) get_user_organizations confirmed manually by reading 20260108_phase2_organizations.sql:76-84 and grepping all 52 references (none is a REVOKE/GRANT); (4) GRANT-to-client-role grep confirmed zero GRANT ... TO PUBLIC. Static file analysis only, NOT run against the live Supabase DB.

**open_questions**

- Does the LIVE prod ACL for public.get_user_organizations actually match the repo (default PUBLIC EXECUTE), or was it revoked out-of-band via MCP? 20260701132102 was applied to prod via MCP then mirrored to repo; another un-mirrored change could exist.
- Are there SECURITY DEFINER functions that exist live but are NOT in these migrations (created directly via MCP)? Those would also carry default PUBLIC EXECUTE and be invisible to this sweep.
- Several functions are redefined with differing signatures across migrations (add_credits, mint_api_key, finalize_call_cost, reserve_credits). A REVOKE on one signature does not revoke a differently-typed overload; overload coverage needs live catalog verification.

**what_i_did_not_check**

- The live database pg_proc/proacl catalog - this is a static repo sweep; final ACL claims are inferred from migration text, not read from prod.
- SECURITY DEFINER functions created outside supabase/migrations (direct MCP/psql on prod) - invisible here.
- Table/column-level default grants and RLS policy correctness (out of scope; this node is function EXECUTE only).
- Edge function code (supabase/functions) and whether any depends on a now-revoked function.
- Any DEFINER function whose CREATE header is >140 lines before SECURITY DEFINER, whose name lacks a 'public.' qualifier, or is built via dynamic SQL - regex could miss these.
- Whether every overload signature of a redefined function (add_credits/mint_api_key/finalize_call_cost/reserve_credits) is individually revoked; matching was by name, not full signature.
- supabase/tests/*.sql contract tests were not audited for ACL assertions.

**confidence**: medium