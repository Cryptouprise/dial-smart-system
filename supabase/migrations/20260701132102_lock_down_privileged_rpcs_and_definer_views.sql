-- Security hardening: stop anon/authenticated from calling privileged
-- SECURITY DEFINER functions directly over PostgREST, flip flagged definer
-- views to security_invoker, and scope the always-true error-log insert policy.
-- service_role (used by edge functions) retains full access throughout.
--
-- Applied to production via MCP on 2026-07-01. This file mirrors that change so
-- the repo migration history stays in sync. Idempotent: safe to re-run.

-- ============================================================
-- GROUP A: server-only functions — revoke ALL client access.
-- Called only by edge functions (service_role) or cron. None are invoked from
-- the frontend (add_credits now routes through the credit-management edge fn).
-- ============================================================
DO $$
DECLARE
  fn text;
  sigs text[] := ARRAY[
    'public.add_credits(uuid, integer, text, text, text)',
    'public.calibrate_lead_scoring_weights(uuid)',
    'public.check_and_reset_daily_calls()',
    'public.check_credit_balance(uuid, numeric)',
    'public.cleanup_old_guardian_alerts()',
    'public.create_user_feature_flags()',
    'public.decrement_daily_calls(text)',
    'public.decrement_daily_calls(uuid)',
    'public.expire_old_actions()',
    'public.finalize_call_cost(uuid, uuid, text, numeric, integer, text, text)',
    'public.get_effective_daily_calls(uuid)',
    'public.get_funnel_trend(uuid, integer)',
    'public.get_telnyx_assistant_for_call(uuid, uuid)',
    'public.increment_daily_calls_with_reset(uuid)',
    'public.merge_custom_fields(uuid, jsonb)',
    'public.mint_api_key(uuid, text, text[], integer, interval)',
    'public.prune_api_key_audit_log(integer)',
    'public.rebalance_variant_weights(uuid, text)',
    'public.recalculate_calling_windows(uuid)',
    'public.recalculate_number_health(uuid)',
    'public.reserve_credits(uuid, integer, uuid, text)',
    'public.reset_all_daily_calls()',
    'public.reset_stale_daily_calls(uuid)',
    'public.save_operational_memory(uuid, text, text, jsonb, integer)',
    'public.seed_default_playbook(uuid)',
    'public.seed_disposition_values(uuid)',
    'public.select_script_variant(uuid, text)',
    'public.touch_api_key(uuid, text)',
    'public.update_guardian_alerts_updated_at()',
    'public.update_updated_at_column()',
    'public.update_variant_stats(uuid, text, integer, boolean)',
    'public.upgrade_user_tier(uuid, text, text, text)'
  ];
BEGIN
  FOREACH fn IN ARRAY sigs LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

-- ============================================================
-- GROUP B: RLS helper functions — revoke anon ONLY.
-- Referenced inside RLS USING clauses, so `authenticated` MUST keep EXECUTE.
-- ============================================================
DO $$
DECLARE
  fn text;
  sigs text[] := ARRAY[
    'public.get_user_org_role(uuid)',
    'public.has_role(uuid, app_role)',
    'public.is_org_admin(uuid)',
    'public.user_in_organization(uuid)'
  ];
BEGIN
  FOREACH fn IN ARRAY sigs LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END $$;

-- ============================================================
-- SECURITY DEFINER views (ERROR-level) → security_invoker (PG15+).
-- ============================================================
ALTER VIEW public.top_openers SET (security_invoker = on);
ALTER VIEW public.time_wasted_summary SET (security_invoker = on);
ALTER VIEW public.voicemail_performance SET (security_invoker = on);
ALTER VIEW public.call_outcome_dimensions SET (security_invoker = on);

-- ============================================================
-- edge_function_errors: replace the always-true INSERT policy.
-- ============================================================
DROP POLICY IF EXISTS "Service role can insert edge function errors" ON public.edge_function_errors;
DROP POLICY IF EXISTS "Users insert their own edge function errors" ON public.edge_function_errors;
CREATE POLICY "Users insert their own edge function errors"
  ON public.edge_function_errors
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
