-- Security hardening: stop anon/authenticated from calling privileged
-- SECURITY DEFINER functions directly over PostgREST, flip flagged definer
-- views to security_invoker, and scope the always-true error-log insert policy.
-- service_role (used by edge functions) retains full access throughout.
--
-- Applied to production via MCP on 2026-07-01. This file mirrors that change so
-- the repo migration history stays in sync.
--
-- ROBUSTNESS: every REVOKE/GRANT/ALTER is guarded with an existence check
-- (to_regprocedure / to_regclass). Function signatures differ between the live
-- DB and a DB rebuilt purely from repo migrations (known add_credits drift:
-- live uses p_transaction_type, older repo migrations use p_type). Without the
-- guards a missing signature would abort the whole DO block and skip the rest
-- of the lockdown. Guards make this migration safe + idempotent on any DB.

-- ============================================================
-- GROUP A: server-only functions — revoke ALL client access.
-- Called only by edge functions (service_role) or cron. None are invoked from
-- the frontend (add_credits now routes through the credit-management edge fn).
-- Signatures listed for BOTH the live and repo-defined variants where they
-- differ, so whichever exists gets locked down.
-- ============================================================
DO $$
DECLARE
  fn text;
  sigs text[] := ARRAY[
    'public.add_credits(uuid, integer, text, text, text)',                                  -- live
    'public.add_credits(uuid, integer, text, text, text, uuid)',                            -- repo variant (p_type/p_created_by)
    'public.add_credits(uuid, integer, text, text, text, uuid, text)',                      -- repo v2 variant
    'public.calibrate_lead_scoring_weights(uuid)',
    'public.check_and_reset_daily_calls()',
    'public.check_credit_balance(uuid, numeric)',
    'public.cleanup_old_guardian_alerts()',
    'public.create_user_feature_flags()',
    'public.decrement_daily_calls(text)',
    'public.decrement_daily_calls(uuid)',
    'public.expire_old_actions()',
    'public.finalize_call_cost(uuid, uuid, text, numeric, integer, text, text)',
    'public.finalize_call_cost(uuid, uuid, text, numeric, integer, text)',                  -- variant w/o agent_id
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
    'public.reserve_credits(uuid, integer, uuid, text, text)',                              -- variant w/ idempotency key
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
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    END IF;
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
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- SECURITY DEFINER views (ERROR-level) → security_invoker (PG15+).
-- Guarded so a rebuild missing any view doesn't abort the migration.
-- ============================================================
DO $$
DECLARE
  v text;
  views text[] := ARRAY[
    'public.top_openers',
    'public.time_wasted_summary',
    'public.voicemail_performance',
    'public.call_outcome_dimensions'
  ];
BEGIN
  FOREACH v IN ARRAY views LOOP
    IF to_regclass(v) IS NOT NULL THEN
      EXECUTE format('ALTER VIEW %s SET (security_invoker = on)', v);
    END IF;
  END LOOP;
END $$;

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
