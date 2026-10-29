ASSUMPTION: The 30 July files are exactly the 30 files under `supabase/migrations/` with versions 20260712010000..20260720150000 present in MATERIAL; the 10 live_only files are those in `docs/wholesale/audit/phase1/live_only/`. Only objects visible in MATERIAL are considered; anything not shown is UNKNOWN.

# A. One row per July migration

| # | file | objects it CREATES | objects it REPLACES/DROPS that ALSO appear in a live_only file -> REGRESSION | data preconditions | depends on earlier July file? | touches dialer-written table? | verdict |
|---|---|---|---|---|---|---|---|
| 1 | 20260712010000_canonical_ai_action_queue_contract.sql | columns on ai_action_queue; functions sync_ai_action_queue_contract(), protect_ai_action_queue_contract(); triggers sync_ai_action_queue_contract_trigger, protect_ai_action_queue_contract_trigger; index idx_ai_action_queue_execution_order; constraints ai_action_queue_priority_score_check, ai_action_queue_source_check | none | SET NOT NULL on action_params/priority_score/requires_approval after UPDATE backfill (20260712010000:14-41); CHECK priority_score BETWEEN 1 AND 100 (20260712010000:47-48) | no | no | APPLY |
| 2 | 20260712020000_contact_safety_and_provider_idempotency.sql | tables contact_stop_controls, provider_callback_receipts, provider_call_attempts, provider_dispatch_claims; columns on dialing_queues (last_provider, last_provider_call_id, last_attempted_at, dispatch_generation) and call_logs (provider_reconciliation_*); functions evaluate_contact_stop, claim_provider_callback, complete_provider_callback, claim_provider_dispatch, finalize_provider_dispatch, record_physical_call_attempt, provider_safety_health_check, claim_pending_dispatches, claim_pending_dispatches_now; policies on contact_stop_controls | none | provider_dispatch_claims.call_log_id NOT NULL FK call_logs (20260712020000:150), organization_id NOT NULL FK organizations (20260712020000:151), user_id NOT NULL FK auth.users (20260712020000:152); call_logs.provider_reconciliation_required NOT NULL DEFAULT false (20260712020000:182) | no | yes (dialing_queues, call_logs) | APPLY |
| 3 | 20260712030000_workflow_external_effect_ledger.sql | table workflow_external_effects; column lead_workflow_progress.external_effect_generation; functions claim_workflow_external_effect, transition_workflow_external_effect, resolve_workflow_external_effect; policy on workflow_external_effects | none | UPDATE backfill then SET NOT NULL on lead_workflow_progress.external_effect_generation (20260712030000:9-15); FKs to lead_workflow_progress/campaign_workflows/workflow_steps/leads (20260712030000:20-23) | no | yes (leads FK only) | APPLY |
| 4 | 20260712040000_sms_delivery_safety.sql | function normalize_contact_phone; columns leads.phone_number_normalized, dnc_list.phone_number_normalized/organization_id; function sync_normalized_contact_phone; triggers sync_lead_normalized_phone, sync_dnc_normalized_phone; indexes; policies on dnc_list; table sms_delivery_attempts; functions claim_sms_delivery_attempt, finalize_sms_delivery_attempt, reconcile_sms_delivery_attempt | none | sms_messages_status_check re-added (20260712040000:38-50); sms_delivery_attempts.organization_id NOT NULL FK organizations (20260712040000:138) | no | yes (leads, sms_messages, dnc_list) | APPLY |
| 5 | 20260712050000_provider_safe_unattended_backstops.sql | function run_safety_backstops (replace), resolve_provider_dispatch_invoke_error | none | none | yes (20260712020000 for provider_dispatch_claims/provider_call_attempts) | yes (dialing_queues, call_logs, campaigns) | APPLY |
| 6 | 20260712070000_multi_organization_routing_contract.sql | columns organization_id on campaigns/leads/phone_numbers/call_logs; indexes; FKs *_organization_id_fkey, *_organization_user_membership_fkey; function user_in_organization(uuid,uuid); policies on campaigns/leads/phone_numbers/call_logs; table organization_membership_transfers; functions enforce_tenant_owned_core_resource, enforce_call_log_tenant_graph, enforce_campaign_lead_tenant, enforce_campaign_phone_tenant, enforce_dialing_queue_tenant, enforce_integration_tenant, mint_api_key, transfer_organization_membership_resources; triggers *_require_authoritative_tenant, call_logs_same_tenant_graph, campaign_leads_same_tenant, campaign_phone_pools_same_tenant, dialing_queues_same_tenant, slack_users_require_authoritative_tenant, api_keys_require_authoritative_tenant; column slack_users.organization_id | REGRESSION: `public.user_in_organization(uuid, uuid)` (20260712070000:179-192) vs live_only 20260828015210:26-29 (grant/revoke only, no body) — see B; `public.mint_api_key(uuid,text,text[],uuid,integer,timestamptz)` (20260712070000:723-818) vs live_only 20260828013123/013247/015210 (no mint_api_key body in live_only) — no live_only body, so no regression; policies on campaigns/leads/phone_numbers/call_logs vs live_only 20260828030638 (campaign_leads only) — no overlap | SET NOT NULL on campaigns/leads/phone_numbers/call_logs.organization_id (20260712070000:141,145,149,153); RAISE TENANT_BACKFILL_REQUIRED if any NULL (20260712070000:86-96); RAISE TENANT_RELATIONSHIP_REPAIR_REQUIRED on mismatched graphs (20260712070000:622-632); FK (organization_id,user_id) -> organization_users (20260712070000:158-177) | yes (20260712020000 for provider_dispatch_claims/provider_call_attempts referenced in transfer RPC) | yes (leads, campaigns, call_logs, phone_numbers, dialing_queues) | HOLD |
| 7 | 20260713043000_retell_automatic_reconciliation.sql | columns on provider_dispatch_claims (destination_phone, caller_id, agent_id, identity_contract_version); constraints provider_dispatch_claims_status_evidence_check, provider_dispatch_claims_identity_key; index idx_provider_dispatch_claims_provider_call_id; tables provider_reconciliation_jobs, retell_reconciliation_runtime; functions complete_provider_callback (replace), claim_retell_reconciliation_jobs, bind_retell_reconciliation_call, finish_retell_reconciliation_job, requeue_retell_reconciliation_job, fail_retell_reconciliation_job, mark_retell_reconciliation_run, claim_provider_dispatch (replace), finalize_provider_dispatch (replace), claim_pending_dispatches (replace), claim_pending_dispatches_now (replace), resolve_provider_dispatch_invoke_error (replace), record_physical_call_attempt (replace), retell_reconciliation_health_check, configure_retell_reconciliation_cron; policy on provider_reconciliation_jobs | none | RAISE PROVIDER_DISPATCH_TENANT_REPAIR_REQUIRED if any dispatch claim mismatches call-log tenant graph (20260713043000:90-97); provider_reconciliation_jobs.dispatch_claim_id NOT NULL UNIQUE FK (20260713043000:103-104) | yes (20260712020000, 20260712070000) | yes (dialing_queues, call_logs, leads, campaigns) | HOLD |
| 8 | 20260713050000_automation_scheduler_cron_auth.sql | function configure_automation_scheduler_cron | none | none | no | no | APPLY |
| 9 | 20260713060000_credit_ledger_schema_contract.sql | columns on credit_transactions; function enforce_credit_transaction_call_tenant; trigger credit_transaction_call_same_tenant; functions check_credit_balance, reserve_credits, finalize_call_cost, add_credits (all DROP+CREATE); columns on organization_credits; columns on call_logs (billed_cost_cents, credit_deducted); indexes | REGRESSION: `public.check_credit_balance(uuid, numeric)` (20260713060000:281-348) vs live_only 20260828034111:32-67 — different RETURNS TABLE shape (July returns 9 cols incl. reserved_balance_cents/allow_negative/negative_limit_cents; live_only returns 5 cols billing_enabled/has_balance/available_balance_cents/cost_per_minute_cents/required_cents) — see B | RAISE CREDIT_TRANSACTION_TYPE_REPAIR_REQUIRED (20260713060000:34-36,44-46,103-105); RAISE CREDIT_PAYMENT_PROVENANCE_REPAIR_REQUIRED (20260713060000:77-78); RAISE CREDIT_CALL_TENANT_REPAIR_REQUIRED (20260713060000:118-122); RAISE CREDIT_RESERVATION_SNAPSHOT_REPAIR_REQUIRED (20260713060000:213-215); transaction_type SET NOT NULL (20260713060000:165); organization_credits balance contract CHECK (20260713060000:249-258) | yes (20260712070000 for call_logs.organization_id) | yes (call_logs) | HOLD |
| 10 | 20260713061000_disable_uncertified_autonomous_engine_cron.sql | none (unschedules cron jobs) | none | none | no | no | APPLY |
| 11 | 20260713062000_dnc_tenant_uniqueness_contract.sql | function repair_dnc_tenant_scope; function enforce_dnc_tenant_contract; trigger enforce_dnc_tenant_contract; constraint dnc_list_organization_phone_normalized_key | none | RAISE DNC_PHONE_REPAIR_REQUIRED (20260713062000:90-93); RAISE DNC_TENANT_REPAIR_REQUIRED (20260713062000:104-107); SET NOT NULL organization_id/phone_number_normalized (20260713062000:174-176); UNIQUE (organization_id, phone_number_normalized) (20260713062000:177-178) | yes (20260712040000 for normalize_contact_phone) | yes (dnc_list) | APPLY-WITH-PATCH (backfill dnc_list.organization_id first; see C) |
| 12 | 20260713063000_quarantine_browser_readable_credentials.sql | policy on user_credentials | none | none | no | no | APPLY |
| 13 | 20260713064000_dialing_queue_mutation_boundary.sql | policy on dialing_queues; functions dialing_queue_has_provider_evidence, dialing_queue_has_unresolved_lifecycle, protect_dialing_queue_provider_evidence, enqueue_dialing_queue, cancel_dialing_queues; trigger dialing_queue_provider_evidence_delete_guard | none | none | yes (20260712020000, 20260713043000 for provider_dispatch_claims/provider_reconciliation_jobs) | yes (dialing_queues) | APPLY |
| 14 | 20260713065000_billing_ownership_boundary.sql | table usage_summaries; view organization_credit_status; policies on organizations/organization_credits/credit_transactions/usage_summaries; function protect_organization_credit_balance; trigger organization_credit_balance_owner | REGRESSION: policies on `organizations` (20260713065000:128-132) vs live_only 20260828013123:36-40 (organization_credits policy) and 20260828034111 (plans/promo policies) — see B; `organization_credits` policy "Platform operator manages credits" (live_only 20260828013123:37-40) is DROPped by the DO-loop at 20260713065000:97-104 | none | yes (20260713060000 for organization_credits columns) | no | HOLD |
| 15 | 20260713070000_agent_pricing_schema_contract.sql | tables pricing_tiers, agent_pricing; constraints; triggers set_pricing_tiers_updated_at, set_agent_pricing_updated_at; policies on pricing_tiers/agent_pricing | REGRESSION: policy "Platform operator manages agent pricing" on agent_pricing (live_only 20260828013123:70-74) is DROPped by DO-loop at 20260713070000:293-300 — see B | RAISE PRICING_TIER_REPAIR_REQUIRED (20260713070000:90-93,102-105); RAISE AGENT_PRICING_REPAIR_REQUIRED (20260713070000:125-128,137-140); SET NOT NULL on pricing_tiers/agent_pricing columns (20260713070000:213-243) | no | no | HOLD |
| 16 | 20260713071000_call_log_evidence_boundary.sql | policy on call_logs; function protect_call_log_evidence; trigger call_log_evidence_guard | none | none | yes (20260712070000 for organization_membership_transfers) | yes (call_logs) | APPLY |
| 17 | 20260713072000_provider_resource_ownership_boundary.sql | column phone_numbers.organization_id; constraints phone_numbers_number_key, phone_numbers_retell_phone_id_unique, phone_numbers_twilio_sid_unique; constraints on retell_agents; functions enforce_provider_phone_number_contract, protect_provider_resource_identity; triggers normalize_provider_phone_number, provider_resource_identity_guard; policies on phone_numbers/retell_agents | none | RAISE RETELL_AGENTS_BASELINE_REQUIRED if retell_agents missing (20260713072000:8-11); RAISE PROVIDER_RESOURCE_OWNERSHIP_REPAIR_REQUIRED (20260713072000:88-99); SET NOT NULL on retell_agents.organization_id/retell_agent_id (20260713072000:121-122) | yes (20260712040000 for normalize_contact_phone) | yes (phone_numbers) | HOLD (retell_agents baseline UNKNOWN; see E) |
| 18 | 20260713073000_irreversible_dnc_browser_boundary.sql | policies on dnc_list; function protect_dnc_suppression_identity; trigger dnc_suppression_identity_guard | none | none | yes (20260713062000) | yes (dnc_list) | APPLY |
| 19 | 20260713074000_ghl_shadow_ingest_lane.sql | functions ghl_shadow_custom_field_mapping_is_exact, ghl_shadow_evidence_is_redacted, protect_ghl_shadow_binding_version, protect_ghl_shadow_append_only, assert_ghl_shadow_ingest_rpc_token, get_ghl_shadow_ingest_contract, record_ghl_shadow_ingest_receipt; tables ghl_shadow_ingest_bindings, ghl_shadow_ingest_receipts, ghl_shadow_webhook_id_ledger; triggers | none | none | no | no | APPLY |
| 20 | 20260713075000_ghl_shadow_reconciliation_export.sql | function ghl_shadow_reason_codes_are_export_safe; table ghl_shadow_delivery_attempts; trigger ghl_shadow_delivery_attempt_append_only; function record_ghl_shadow_ingest_receipt (wrapper), export_ghl_shadow_reconciliation_evidence | none | none | yes (20260713074000) | no | APPLY |
| 21 | 20260713130000_external_observer_control_plane.sql | type external_control_provider; tables external_control_installations, external_control_principals, external_command_claims, external_command_receipts; functions external_control_is_org_admin, guard_external_control_installation, guard_external_control_principal, protect_external_command_evidence, protect_external_control_truncate, claim_external_observer_command; triggers; policies on calendar_integrations/api_keys/slack_users | none | none | yes (20260712070000 for user_in_organization, organization_users) | no | APPLY |
| 22 | 20260713140000_legacy_runtime_function_schema_repair.sql | functions get_agent_customer_price, predict_lead_conversion, recalculate_number_health, mint_api_key (replace) | none | none | yes (20260713070000 for agent_pricing) | no | APPLY |
| 23 | 20260713150000_campaign_contact_release_gate.sql | tables campaign_contact_releases, campaign_contact_release_members; functions enforce_campaign_contact_release_immutable, enforce_campaign_contact_release_member, evaluate_campaign_contact_release; triggers | none | FKs to organizations/campaigns/leads/phone_numbers/organization_users (20260713150000:8-41,63-72) | yes (20260712070000) | yes (campaigns, leads, phone_numbers) | APPLY |
| 24 | 20260713160000_campaign_contact_release_status.sql | function get_campaign_contact_release_status | none | none | yes (20260713150000) | no | APPLY |
| 25 | 20260713170000_campaign_contact_release_observer_status.sql | function get_campaign_contact_release_observer_status | none | none | yes (20260713150000) | no | APPLY |
| 26 | 20260719100000_campaign_contact_release_source_shadow_evidence.sql | columns source_shadow_adapter, source_shadow_certificate_sha256 on campaign_contact_releases; constraints; function enforce_campaign_contact_release_immutable (replace) | none | SET NOT NULL source_shadow_adapter/source_shadow_certificate_sha256 after UPDATE (20260719100000:11-21) | yes (20260713150000) | no | APPLY |
| 27 | 20260720120000_elite_email_execution_ledger.sql | constraint contact_stop_controls_channel_check (replace); tables elite_email_execution_releases, elite_email_provider_event_receipts; functions enforce_elite_email_execution_release_immutable, enforce_elite_email_provider_event_receipt, claim_elite_email_execution_release, get_elite_email_execution_release_status; triggers | none | FKs to organizations/campaigns/auth.users/organization_users (20260720120000:21-23,61-63,76-78,111-113) | yes (20260712020000 for contact_stop_controls) | no | APPLY |
| 28 | 20260720130000_elite_email_mailgun_event_intake.sql | column provider_token_fingerprint; index elite_email_provider_event_receipts_provider_token_key; function record_elite_email_mailgun_event_receipt | none | none | yes (20260720120000) | no | APPLY |
| 29 | 20260720140000_elite_email_release_registration.sql | function register_elite_email_execution_release | none | none | yes (20260720120000) | no | APPLY |
| 30 | 20260720150000_elite_email_release_preparation.sql | table elite_email_release_preparation_attestations; function enforce_elite_email_release_preparation_attestation_immutable; trigger; function prepare_elite_email_execution_release | none | FKs to elite_email_execution_releases/organizations/auth.users/campaigns/organization_users (20260720150000:10-13,27-29) | yes (20260720120000) | no | APPLY |

# B. Regression list

| object | July definition | live_only definition | difference | winner |
|---|---|---|---|---|
| function `public.user_in_organization(uuid, uuid)` | 20260712070000:179-192 (body: EXISTS on organization_users) | 20260828015210:26-29 (only REVOKE/GRANT on `user_in_organization(uuid)` — no body) | live_only does not redefine the body; it only re-grants the 1-arg overload. July's 2-arg body is not overwritten by live_only. | July body stands; live_only grants must be re-run (they target the 1-arg overload, which July does not touch). No regression. |
| function `public.check_credit_balance(uuid, numeric)` | 20260713060000:281-348 — RETURNS TABLE(has_balance, current_balance_cents, reserved_balance_cents, available_balance_cents, cost_per_minute_cents, required_cents, billing_enabled, allow_negative, negative_limit_cents) | 20260828034111:32-67 — RETURNS TABLE(billing_enabled, has_balance, available_balance_cents, cost_per_minute_cents, required_cents) | Different return column set and order; July's version also honors `unlimited_access` (live_only 20260828034111:46-48) only indirectly — July reads billing_enabled but not unlimited_access (20260713060000:311-322). | live_only August wins: it is the version the live credit-management edge function and `unlimited_access` promo path depend on (20260828034111:46-48, 20260828034020:81-82). July is NOT a superset. |
| function `public.guard_organization_billing_columns()` | not defined in any July file in MATERIAL | 20260828013123:42-63 (SECURITY DEFINER), 20260828034111:2-26 (adds plan_id/unlimited_access/unlimited_reason), 20260828034301:20-55 (SECURITY INVOKER final) | July does not touch it. | live_only 20260828034301 wins (no July competitor). |
| function `public.handle_new_user()` | not defined in any July file in MATERIAL | 20260828012734:2-63, 20260828034301:58-122 | July does not touch it. | live_only 20260828034301 wins. |
| function `public.is_platform_operator()` | not defined in any July file in MATERIAL | 20260828013123:2-13 | July does not touch it. | live_only wins. |
| function `public.org_has_no_members(uuid)` | not defined in any July file in MATERIAL | 20260828013123:18-23 | July does not touch it. | live_only wins. |
| function `public.has_role(uuid, app_role)` | not defined in any July file in MATERIAL | 20260828015210:2-18 | July does not touch it. | live_only wins. |
| function `public.guard_campaign_has_agent()` | not defined in any July file in MATERIAL | 20260828014640:2-17 | July does not touch it. | live_only wins. |
| policy `"Org admins can add members"` on `organization_users` | not defined in any July file in MATERIAL | 20260828013123:28-34 | July does not touch it. | live_only wins. |
| policy `"Platform operator manages credits"` on `organization_credits` | July 20260713065000:97-104 DROPs every policy on organization_credits (DO-loop) and creates only `"Members view their organization credits"` (20260713065000:134-138) | 20260828013123:36-40 creates `"Platform operator manages credits"` | July's DO-loop drops the August operator policy and does not recreate it. | live_only August wins (operator credit management must survive). |
| policy `"Platform operator manages agent pricing"` on `agent_pricing` | July 20260713070000:293-300 DROPs every policy on agent_pricing and creates only `"Members view their tenant agent pricing"` (20260713070000:330-334) | 20260828013123:70-74 creates `"Platform operator manages agent pricing"` | July's DO-loop drops the August operator policy and does not recreate it. | live_only August wins. |
| policy `"Users can update their campaign leads"` on `campaign_leads` | not defined in any July file in MATERIAL | 20260828030638:5-15 | July does not touch it. | live_only wins. |
| policies on `sequence_templates` | not defined in any July file in MATERIAL | 20260828030638:19-33 | July does not touch it. | live_only wins. |
| policies on `plans`/`plan_addons`/`promo_codes`/`promo_redemptions` | not defined in any July file in MATERIAL | 20260828034111:176-195 | July does not touch it. | live_only wins. |
| function `public.apply_plan_to_organization(uuid, text)` | not defined in any July file in MATERIAL | 20260828034111:69-94 | July does not touch it. | live_only wins. |
| function `public.redeem_promo_code(text)` | not defined in any July file in MATERIAL | 20260828034111:100-165 | July does not touch it. | live_only wins. |
| trigger `trg_guard_organization_billing_columns` on `organizations` | not defined in any July file in MATERIAL | 20260828013123:65-68 | July does not touch it. | live_only wins. |
| trigger `trg_guard_campaign_has_agent` on `campaigns` | not defined in any July file in MATERIAL | 20260828014640:19-22 | July does not touch it. | live_only wins. |
| trigger `on_auth_user_created_organization` on `auth.users` | not defined in any July file in MATERIAL | 20260828012734:69-74 | July does not touch it. | live_only wins. |
| column `user_feature_flags.onboarding_completed_at` | not defined in any July file in MATERIAL | 20260828014743:2-7 | July does not touch it. | live_only wins. |
| tables `plans`, `plan_addons`, `promo_codes`, `promo_redemptions`; columns `organizations.plan_id/unlimited_access/unlimited_reason/phone_mode` | not defined in any July file in MATERIAL | 20260828034020:2-79 | July does not touch it. | live_only wins. |

# C. Pre-apply SQL

```sql
-- 1. Backfill leads.organization_id for NULL rows to Default Organization.
UPDATE public.leads
SET organization_id = '11824e05-24e3-4dc3-b684-5d0bc7c436d6'
WHERE organization_id IS NULL;
-- expect: 5 rows

-- 2. Backfill call_logs.organization_id: prefer lead's org via lead_id, else campaign's org via campaign_id, else Default Organization.
UPDATE public.call_logs cl
SET organization_id = COALESCE(
  (SELECT l.organization_id FROM public.leads l WHERE l.id = cl.lead_id),
  (SELECT c.organization_id FROM public.campaigns c WHERE c.id = cl.campaign_id),
  '11824e05-24e3-4dc3-b684-5d0bc7c436d6'
)
WHERE cl.organization_id IS NULL;
-- expect: 519 rows

-- 3. Backfill dnc_list.organization_id (needed by 20260713062000 SET NOT NULL).
UPDATE public.dnc_list d
SET organization_id = COALESCE(
  (SELECT ou.organization_id FROM public.organization_users ou WHERE ou.user_id = d.user_id LIMIT 1),
  '11824e05-24e3-4dc3-b684-5d0bc7c436d6'
)
WHERE d.organization_id IS NULL;
-- expect: 28 rows (all dnc_list rows lack organization_id per LIVE-SCHEMA.md:8)

-- 4. Backfill dnc_list.phone_number_normalized (needed by 20260713062000 SET NOT NULL).
UPDATE public.dnc_list
SET phone_number_normalized = public.normalize_contact_phone(phone_number)
WHERE phone_number_normalized IS DISTINCT FROM public.normalize_contact_phone(phone_number);
-- expect: 28 rows (column does not exist live per LIVE-SCHEMA.md:8; created by 20260712040000)
-- NOTE: this statement must run AFTER 20260712040000 creates the column and function; if run before, it errors. Run it as a post-20260712040000 patch instead.

-- 5. Verify no NULL organization_id remains on the four core tables (20260712070000:86-96 gate).
SELECT count(*) FROM public.leads WHERE organization_id IS NULL;          -- expect: 0
SELECT count(*) FROM public.call_logs WHERE organization_id IS NULL;      -- expect: 0
SELECT count(*) FROM public.campaigns WHERE organization_id IS NULL;      -- expect: 0
SELECT count(*) FROM public.phone_numbers WHERE organization_id IS NULL;  -- expect: 0
```

# D. Apply plan

Ordered list (run in this order; patches inline):

1. `20260712010000_canonical_ai_action_queue_contract.sql` — APPLY
2. `20260712020000_contact_safety_and_provider_idempotency.sql` — APPLY
3. `20260712030000_workflow_external_effect_ledger.sql` — APPLY
4. `20260712040000_sms_delivery_safety.sql` — APPLY
5. `20260712050000_provider_safe_unattended_backstops.sql` — APPLY
6. `20260712070000_multi_organization_routing_contract.sql` — **HOLD** (see E; requires operator decision on tenant graph repair; do not run until C steps 1-2 and the relationship preflight below pass)
   - Preflight before running:
     ```sql
     SELECT count(*) FROM public.campaign_leads link
     LEFT JOIN public.campaigns c ON c.id = link.campaign_id
     LEFT JOIN public.leads l ON l.id = link.lead_id
     WHERE c.id IS NULL OR l.id IS NULL
        OR c.organization_id IS DISTINCT FROM l.organization_id
        OR c.user_id IS DISTINCT FROM l.user_id;
     -- expect: 0
     SELECT count(*) FROM public.dialing_queues q
     LEFT JOIN public.campaigns c ON c.id = q.campaign_id
     LEFT JOIN public.leads l ON l.id = q.lead_id
     WHERE c.id IS NULL OR l.id IS NULL
        OR c.organization_id IS DISTINCT FROM l.organization_id
        OR c.user_id IS DISTINCT FROM l.user_id;
     -- expect: 0
     SELECT count(*) FROM public.call_logs cl
     LEFT JOIN public.campaigns c ON c.id = cl.campaign_id
     LEFT JOIN public.leads l ON l.id = cl.lead_id
     WHERE cl.organization_id IS NULL
        OR (cl.campaign_id IS NOT NULL AND (c.id IS NULL OR c.organization_id IS DISTINCT FROM cl.organization_id OR c.user_id IS DISTINCT FROM cl.user_id))
        OR (cl.lead_id IS NOT NULL AND (l.id IS NULL OR l.organization_id IS DISTINCT FROM cl.organization_id OR l.user_id IS DISTINCT FROM cl.user_id));
     -- expect: 0
     ```
7. `20260713043000_retell_automatic_reconciliation.sql` — **HOLD** (preflight below must return 0)
   ```sql
   SELECT count(*) FROM public.provider_dispatch_claims d
   LEFT JOIN public.call_logs cl ON cl.id = d.call_log_id
   LEFT JOIN public.campaigns c ON c.id = d.campaign_id
   LEFT JOIN public.leads l ON l.id = d.lead_id
   WHERE cl.id IS NULL
      OR cl.organization_id IS DISTINCT FROM d.organization_id
      OR cl.user_id IS DISTINCT FROM d.user_id
      OR cl.campaign_id IS DISTINCT FROM d.campaign_id
      OR cl.lead_id IS DISTINCT FROM d.lead_id
      OR (d.campaign_id IS NOT NULL AND (c.id IS NULL OR c.organization_id IS DISTINCT FROM d.organization_id OR c.user_id IS DISTINCT FROM d.user_id))
      OR (d.lead_id IS NOT NULL AND (l.id IS NULL OR l.organization_id IS DISTINCT FROM d.organization_id OR l.user_id IS DISTINCT FROM d.user_id))
      OR NOT EXISTS (SELECT 1 FROM public.organization_users m WHERE m.organization_id = d.organization_id AND m.user_id = d.user_id);
   -- expect: 0
   ```
8. `20260713050000_automation_scheduler_cron_auth.sql` — APPLY
9. `20260713060000_credit_ledger_schema_contract.sql` — **HOLD** (regresses `check_credit_balance`; see B). If forced, patch: after the file, re-run `20260828034111` lines 32-67 to restore the August `check_credit_balance`.
10. `20260713061000_disable_uncertified_autonomous_engine_cron.sql` — APPLY
11. `20260713062000_dnc_tenant_uniqueness_contract.sql` — **APPLY-WITH-PATCH**. Patch (run after 20260712040000, before this file):
    ```sql
    UPDATE public.dnc_list
    SET phone_number_normalized = public.normalize_contact_phone(phone_number)
    WHERE phone_number_normalized IS DISTINCT FROM public.normalize_contact_phone(phone_number);
    -- expect: 28 rows
    UPDATE public.dnc_list d
    SET organization_id = COALESCE(
      (SELECT ou.organization_id FROM public.organization_users ou WHERE ou.user_id = d.user_id LIMIT 1),
      '11824e05-24e3-4dc3-b684-5d0bc7c436d6')
    WHERE d.organization_id IS NULL;
    -- expect: 28 rows
    ```
12. `20260713063000_quarantine_browser_readable_credentials.sql` — APPLY
13. `20260713064000_dialing_queue_mutation_boundary.sql` — APPLY
14. `20260713065000_billing_ownership_boundary.sql` — **HOLD** (drops August operator credit policy). If forced, patch after the file:
    ```sql
    DROP POLICY IF EXISTS "Platform operator manages credits" ON public.organization_credits;
    CREATE POLICY "Platform operator manages credits"
      ON public.organization_credits FOR ALL
      USING (public.is_platform_operator())
      WITH CHECK (public.is_platform_operator());
    ```
15. `20260713070000_agent_pricing_schema_contract.sql` — **HOLD** (drops August operator agent_pricing policy). If forced, patch after the file:
    ```sql
    DROP POLICY IF EXISTS "Platform operator manages agent pricing" ON public.agent_pricing;
    CREATE POLICY "Platform operator manages agent pricing"
      ON public.agent_pricing FOR ALL
      USING (public.is_platform_operator())
      WITH CHECK (public.is_platform_operator());
    ```
16. `20260713071000_call_log_evidence_boundary.sql` — APPLY
17. `20260713072000_provider_resource_ownership_boundary.sql` — **HOLD** (retell_agents baseline UNKNOWN; see E)
18. `20260713073000_irreversible_dnc_browser_boundary.sql` — APPLY
19. `20260713074000_ghl_shadow_ingest_lane.sql` — APPLY
20. `20260713075000_ghl_shadow_reconciliation_export.sql` — APPLY
21. `20260713130000_external_observer_control_plane.sql` — APPLY
22. `20260713140000_legacy_runtime_function_schema_repair.sql` — APPLY
23. `20260713150000_campaign_contact_release_gate.sql` — APPLY
24. `20260713160000_campaign_contact_release_status.sql` — APPLY
25. `20260713170000_campaign_contact_release_observer_status.sql` — APPLY
26. `20260719100000_campaign_contact_release_source_shadow_evidence.sql` — APPLY
27. `20260720120000_elite_email_execution_ledger.sql` — APPLY
28. `20260720130000_elite_email_mailgun_event_intake.sql` — APPLY
29. `20260720140000_elite_email_release_registration.sql` — APPLY
30. `20260720150000_elite_email_release_preparation.sql` — APPLY

Live_only files to RE-RUN at the end (in version order) to restore August definitions:
1. `docs/wholesale/audit/phase1/live_only/20260828012734_provision_org_on_signup.sql`
2. `docs/wholesale/audit/phase1/live_only/20260828013123_close_billing_escalation.sql`
3. `docs/wholesale/audit/phase1/live_only/20260828013247_tighten_guard_function_grants.sql`
4. `docs/wholesale/audit/phase1/live_only/20260828014640_campaign_launch_guard.sql`
5. `docs/wholesale/audit/phase1/live_only/20260828014743_onboarding_completion_flag.sql`
6. `docs/wholesale/audit/phase1/live_only/20260828015210_harden_definer_helpers.sql`
7. `docs/wholesale/audit/phase1/live_only/20260828030638_close_cross_tenant_write_leaks.sql`
8. `docs/wholesale/audit/phase1/live_only/20260828034020_plan_catalog_tables.sql`
9. `docs/wholesale/audit/phase1/live_only/20260828034111_plan_catalog_functions_rls_seed.sql`
10. `docs/wholesale/audit/phase1/live_only/20260828034301_fix_billing_guard_definer_context.sql`

Verification SQL (end state):

```sql
-- August objects intact
SELECT tgname FROM pg_trigger WHERE tgname IN (
  'trg_guard_organization_billing_columns','trg_guard_campaign_has_agent','on_auth_user_created_organization');
-- expect: 3 rows

SELECT proname, prosecdef FROM pg_proc
WHERE proname IN ('guard_organization_billing_columns','handle_new_user','is_platform_operator',
                  'org_has_no_members','has_role','check_credit_balance','apply_plan_to_organization',
                  'redeem_promo_code','user_in_organization','is_org_admin','get_user_org_role');
-- expect: guard_organization_billing_columns prosecdef = false (SECURITY INVOKER per 20260828034301:23)

SELECT policyname, tablename FROM pg_policies
WHERE (tablename='organization_credits' AND policyname='Platform operator manages credits')
   OR (tablename='agent_pricing' AND policyname='Platform operator manages agent pricing')
   OR (tablename='organization_users' AND policyname='Org admins can add members')
   OR (tablename='campaign_leads' AND policyname='Users can update their campaign leads')
   OR (tablename='plans' AND policyname='Anyone can view public plans')
   OR (tablename='promo_codes' AND policyname='Platform operator manages promo codes');
-- expect: 6 rows

SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='organizations'
  AND column_name IN ('plan_id','unlimited_access','unlimited_reason','phone_mode');
-- expect: 4 rows

SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='user_feature_flags'
  AND column_name='onboarding_completed_at';
-- expect: 1 row

-- July objects present
SELECT to_regclass('public.provider_dispatch_claims'), to_regclass('public.provider_reconciliation_jobs'),
       to_regclass('public.contact_stop_controls'), to_regclass('public.sms_delivery_attempts'),
       to_regclass('public.workflow_external_effects'), to_regclass('public.campaign_contact_releases'),
       to_regclass('public.elite_email_execution_releases'), to_regclass('public.ghl_shadow_ingest_bindings');
-- expect: all non-null

SELECT proname FROM pg_proc WHERE proname IN (
  'claim_provider_dispatch','record_physical_call_attempt','run_safety_backstops',
  'claim_sms_delivery_attempt','enqueue_dialing_queue','evaluate_campaign_contact_release',
  'claim_elite_email_execution_release','record_ghl_shadow_ingest_receipt');
-- expect: 8 rows

SELECT tgname FROM pg_trigger WHERE tgname IN (
  'call_log_evidence_guard','dialing_queue_provider_evidence_delete_guard',
  'dnc_suppression_identity_guard','campaign_contact_releases_immutable',
  'elite_email_execution_releases_immutable');
-- expect: 5 rows

-- NOT NULL gates from 20260712070000
SELECT table_name, column_name, is_nullable FROM information_schema.columns
WHERE table_schema='public' AND column_name='organization_id'
  AND table_name IN ('leads','call_logs','campaigns','phone_numbers');
-- expect: is_nullable = 'NO' on all four
```

# E. UNKNOWNs

1. Whether `retell_agents` exists live with the columns 20260713072000 requires (`organization_id`, `user_id`, `retell_agent_id`). LIVE-SCHEMA.md does not list it. File that answers: a live `information_schema.columns` dump for `public.retell_agents`, or the certified production baseline referenced at 20260713072000:8-11.
2. Whether `campaign_leads` and `campaign_phone_pools` exist live and whether their rows satisfy the tenant-graph preflight at 20260712070000:578-620. LIVE-SCHEMA.md does not list them. Query: the preflight SQL in D step 6.
3. Whether `provider_dispatch_claims` has any rows live (the 20260713043000:49-99 gate). LIVE-SCHEMA.md does not list the table. Query: `SELECT count(*) FROM public.provider_dispatch_claims;` and the preflight in D step 7.
4. Whether `credit_transactions` live has `type` or `transaction_type`, and whether any active reservation lacks pricing snapshot metadata (20260713060000:6-49, 188-218). LIVE-SCHEMA.md does not list `credit_transactions`. Query: `information_schema.columns` for `public.credit_transactions` plus the reservation query at 20260713060000:192-211.
5. Whether `organization_credits` live has `reserved_balance_cents`, `allow_negative_balance`, `negative_balance_limit_cents`, `stripe_payment_method_id` (20260713060000:238-242). LIVE-SCHEMA.md does not list `organization_credits`. Query: `information_schema.columns`.
6. Whether `pricing_tiers` and `agent_pricing` live have rows that violate the 20260713070000:77-142 preflight. LIVE-SCHEMA.md does not list them. Query: the DO-block SELECTs at 20260713070000:83-140.
7. Whether `dnc_list` live has any row whose `user_id` has no `organization_users` membership (20260713062000:96-108). LIVE-SCHEMA.md:8 shows no `organization_id`; membership is not shown. Query: `SELECT count(*) FROM public.dnc_list d WHERE NOT EXISTS (SELECT 1 FROM public.organization_users m WHERE m.user_id = d.user_id);`.
8. Whether `call_logs` live has a `campaign_id` column usable for the C backfill fallback. LIVE-SCHEMA.md:6 lists `campaign_id uuid`, so it exists; but whether any of the 519 NULL-org rows have a non-null `campaign_id` with a non-null `campaigns.organization_id` is UNKNOWN. Query: `SELECT count(*) FROM public.call_logs WHERE organization_id IS NULL AND campaign_id IS NOT NULL;`.
9. Whether `user_credentials`, `calendar_integrations`, `api_keys`, `slack_users`, `sequence_templates`, `demo_funnel_events`, `law_firm_beta_leads` exist live with the columns the July files reference. LIVE-SCHEMA.md does not list them. Query: `to_regclass` for each.
10. Whether the live `check_credit_balance` return shape is the 5-column August one (20260828034111:34) or something else. LIVE-SCHEMA.md:43 lists only the signature `check_credit_balance(uuid, numeric)`, not the return columns. Query: `SELECT pg_get_function_result('public.check_credit_balance(uuid,numeric)'::regprocedure);`.
11. Whether `merge_custom_fields` signature matches any July file. LIVE-SCHEMA.md:43 says signature UNKNOWN. No July file in MATERIAL defines it, so no regression; but 20260701132102:44 references it. Query: `SELECT oid::regprocedure FROM pg_proc WHERE proname='merge_custom_fields';`.
12. Whether the 30 July files are exactly the 30 listed in A. FINDINGS.md:9 says "30 July 2026 migrations NOT live: 20260712010000 .. 20260720150000"; MATERIAL contains exactly 30 such files, so this is treated as confirmed, but the authoritative list is `supabase_migrations.schema_migrations` minus the repo set.