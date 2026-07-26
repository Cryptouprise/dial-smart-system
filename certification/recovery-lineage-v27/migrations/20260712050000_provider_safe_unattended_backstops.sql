-- Provider-aware unattended safety backstops.
--
-- The original backstop treated every queue row left in `calling` for fifteen
-- minutes as abandoned. That is unsafe after a provider accepts a call: a long
-- conversation or delayed callback could be marked failed and redialed. This
-- replacement preserves heartbeat and budget protection while recovering only
-- rows that have no provider marker and no authoritative call-log evidence.

CREATE OR REPLACE FUNCTION public.run_safety_backstops()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
  v_stale record;
  v_stuck_count int := 0;
  v_budget record;
  v_daily_spend numeric;
  v_monthly_spend numeric;
  v_alerts int := 0;
  v_paused int := 0;
BEGIN
  ------------------------------------------------------------------
  -- 1. ENGINE HEARTBEAT
  ------------------------------------------------------------------
  FOR v_stale IN
    SELECT s.user_id, s.last_engine_run, s.engine_interval_minutes
    FROM public.autonomous_settings s
    WHERE s.enabled = true
      AND s.last_engine_run IS NOT NULL
      AND s.last_engine_run < v_now - make_interval(
            mins => GREATEST(COALESCE(s.engine_interval_minutes, 5) * 3, 15))
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.system_alerts a
      WHERE a.user_id = v_stale.user_id
        AND a.alert_type = 'engine_heartbeat_stale'
        AND a.acknowledged = false
        AND a.auto_resolved = false
        AND a.created_at > v_now - interval '6 hours'
    ) THEN
      INSERT INTO public.system_alerts (user_id, alert_type, severity, title, message, metadata)
      VALUES (
        v_stale.user_id,
        'engine_heartbeat_stale',
        'critical',
        'Autonomous engine heartbeat lost',
        'ai-autonomous-engine has not completed a run since '
          || to_char(v_stale.last_engine_run, 'YYYY-MM-DD HH24:MI UTC')
          || '. Autonomous calling/follow-ups are NOT executing. Check pg_cron and function logs.',
        jsonb_build_object('last_engine_run', v_stale.last_engine_run)
      );
      v_alerts := v_alerts + 1;
    END IF;
  END LOOP;

  UPDATE public.system_alerts a
  SET auto_resolved = true, resolved_at = v_now
  FROM public.autonomous_settings s
  WHERE a.alert_type = 'engine_heartbeat_stale'
    AND a.auto_resolved = false
    AND s.user_id = a.user_id
    AND s.last_engine_run > v_now - make_interval(
          mins => GREATEST(COALESCE(s.engine_interval_minutes, 5) * 2, 10));

  ------------------------------------------------------------------
  -- 2. PRE-PROVIDER QUEUE RECOVERY
  ------------------------------------------------------------------
  WITH stuck AS (
    UPDATE public.dialing_queues q
    SET status = 'failed',
        updated_at = v_now,
        notes = COALESCE(q.notes || ' | ', '')
          || 'auto-failed by provider-safe backstop: pre-provider claim stuck >15min'
    WHERE q.status = 'calling'
      AND q.updated_at < v_now - interval '15 minutes'
      AND q.last_provider_call_id IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.provider_dispatch_claims dispatch
        WHERE dispatch.queue_id = q.id
          AND dispatch.dispatch_generation = q.dispatch_generation
          AND (
            dispatch.status IN ('claimed', 'accepted', 'acceptance_unknown')
            OR dispatch.provider_call_id IS NOT NULL
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.call_logs cl
        WHERE cl.provider_reconciliation_queue_id = q.id
          AND (
            cl.provider_reconciliation_required = true
            OR cl.retell_call_id IS NOT NULL
            OR cl.telnyx_call_control_id IS NOT NULL
            OR cl.status IN ('initiated', 'ringing', 'in_progress')
          )
      )
    RETURNING q.campaign_id
  ),
  per_user AS (
    SELECT c.user_id, count(*) AS n
    FROM stuck s
    JOIN public.campaigns c ON c.id = s.campaign_id
    GROUP BY c.user_id
  ),
  ins AS (
    INSERT INTO public.system_alerts (user_id, alert_type, severity, title, message, metadata)
    SELECT
      pu.user_id,
      'stuck_calls_recovered',
      'warning',
      'Pre-provider queue claims auto-recovered',
      pu.n || ' queue claims had no provider evidence after 15 minutes and were marked failed.',
      jsonb_build_object('count', pu.n, 'provider_safe', true)
    FROM per_user pu
    WHERE NOT EXISTS (
      SELECT 1 FROM public.system_alerts a
      WHERE a.user_id = pu.user_id
        AND a.alert_type = 'stuck_calls_recovered'
        AND a.created_at > v_now - interval '1 hour'
    )
    RETURNING 1
  )
  SELECT count(*) INTO v_stuck_count FROM stuck;

  ------------------------------------------------------------------
  -- 3. BUDGET BACKSTOP
  ------------------------------------------------------------------
  FOR v_budget IN
    SELECT b.* FROM public.budget_settings b
    WHERE b.auto_pause_enabled = true AND b.is_paused = false
  LOOP
    SELECT GREATEST(
      COALESCE((
        SELECT sum(ss.total_cost)
        FROM public.spending_summaries ss
        WHERE ss.user_id = v_budget.user_id
          AND (v_budget.campaign_id IS NULL OR ss.campaign_id = v_budget.campaign_id)
          AND ss.summary_date = current_date
      ), 0),
      COALESCE((
        SELECT sum(COALESCE(cl.retell_cost_cents, 0)) / 100.0
        FROM public.call_logs cl
        WHERE cl.user_id = v_budget.user_id
          AND (v_budget.campaign_id IS NULL OR cl.campaign_id = v_budget.campaign_id)
          AND cl.created_at >= date_trunc('day', v_now)
      ), 0)
    ) INTO v_daily_spend;

    SELECT GREATEST(
      COALESCE((
        SELECT sum(ss.total_cost)
        FROM public.spending_summaries ss
        WHERE ss.user_id = v_budget.user_id
          AND (v_budget.campaign_id IS NULL OR ss.campaign_id = v_budget.campaign_id)
          AND ss.summary_date >= date_trunc('month', v_now)::date
      ), 0),
      COALESCE((
        SELECT sum(COALESCE(cl.retell_cost_cents, 0)) / 100.0
        FROM public.call_logs cl
        WHERE cl.user_id = v_budget.user_id
          AND (v_budget.campaign_id IS NULL OR cl.campaign_id = v_budget.campaign_id)
          AND cl.created_at >= date_trunc('month', v_now)
      ), 0)
    ) INTO v_monthly_spend;

    IF (
      v_budget.daily_limit IS NOT NULL
      AND v_budget.daily_limit > 0
      AND v_daily_spend >= v_budget.daily_limit
    ) OR (
      v_budget.monthly_limit IS NOT NULL
      AND v_budget.monthly_limit > 0
      AND v_monthly_spend >= v_budget.monthly_limit
    ) THEN
      UPDATE public.budget_settings
      SET is_paused = true,
          paused_at = v_now,
          pause_reason = 'Auto-paused by safety backstop: spend $' || round(v_daily_spend, 2)
            || ' today / $' || round(v_monthly_spend, 2) || ' this month exceeded limit'
      WHERE id = v_budget.id;

      UPDATE public.campaigns
      SET status = 'paused', updated_at = v_now
      WHERE user_id = v_budget.user_id
        AND status IN ('active', 'running')
        AND (v_budget.campaign_id IS NULL OR id = v_budget.campaign_id);

      INSERT INTO public.budget_alerts (
        user_id, budget_setting_id, alert_type, threshold_percent,
        amount_spent, budget_limit, message, action_taken
      ) VALUES (
        v_budget.user_id,
        v_budget.id,
        'auto_pause',
        100,
        v_daily_spend,
        COALESCE(v_budget.daily_limit, v_budget.monthly_limit),
        'Safety backstop auto-paused campaigns: budget limit reached.',
        'campaigns_paused'
      );

      INSERT INTO public.system_alerts (user_id, alert_type, severity, title, message, metadata)
      VALUES (
        v_budget.user_id,
        'budget_auto_pause',
        'critical',
        'Budget limit reached - campaigns auto-paused',
        'Spend reached $' || round(v_daily_spend, 2) || ' today / $'
          || round(v_monthly_spend, 2) || ' this month. Campaigns were paused.',
        jsonb_build_object(
          'daily_spend', v_daily_spend,
          'monthly_spend', v_monthly_spend,
          'budget_setting_id', v_budget.id
        )
      );
      v_paused := v_paused + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'heartbeat_alerts', v_alerts,
    'stuck_recovered', v_stuck_count,
    'budgets_paused', v_paused,
    'provider_safe', true,
    'ran_at', v_now
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.run_safety_backstops() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_safety_backstops() TO service_role;

-- Resolve an outbound-calling invocation error while holding the same queue-row
-- lock used by claim_provider_dispatch. This closes the race where the
-- dispatcher observes no claim, releases the queue, and a still-running
-- outbound worker inserts its claim immediately afterward. Either the recovery
-- wins the lock and makes the later claim fail closed, or the claim wins and
-- recovery preserves the quarantine.
CREATE OR REPLACE FUNCTION public.resolve_provider_dispatch_invoke_error(
  p_queue_id uuid,
  p_dispatch_generation uuid,
  p_release_status text,
  p_scheduled_at timestamptz,
  p_retry_notes text
)
RETURNS TABLE(retry_released boolean, claim_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_queue public.dialing_queues%ROWTYPE;
  v_claim_status text;
  v_updated integer := 0;
BEGIN
  IF p_release_status NOT IN ('pending', 'failed') THEN
    RAISE EXCEPTION 'Invoke-error release status must be pending or failed';
  END IF;

  SELECT * INTO v_queue
  FROM public.dialing_queues
  WHERE id = p_queue_id
  FOR UPDATE;

  IF v_queue.id IS NULL THEN
    RAISE EXCEPTION 'Dispatch queue does not exist';
  END IF;
  IF v_queue.dispatch_generation IS DISTINCT FROM p_dispatch_generation THEN
    RAISE EXCEPTION 'Dispatch queue generation changed before invoke-error resolution';
  END IF;
  IF v_queue.status <> 'calling' THEN
    RETURN QUERY SELECT false, 'queue_not_calling'::text;
    RETURN;
  END IF;

  SELECT dispatch.status INTO v_claim_status
  FROM public.provider_dispatch_claims dispatch
  WHERE dispatch.queue_id = p_queue_id
    AND dispatch.dispatch_generation = p_dispatch_generation;

  IF v_claim_status IS NULL OR v_claim_status = 'definite_failure' THEN
    UPDATE public.dialing_queues
    SET status = p_release_status,
        scheduled_at = CASE WHEN p_release_status = 'pending' THEN p_scheduled_at ELSE scheduled_at END,
        updated_at = now(),
        notes = p_retry_notes
    WHERE id = p_queue_id
      AND status = 'calling'
      AND dispatch_generation = p_dispatch_generation
      AND last_provider_call_id IS NULL;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN QUERY SELECT v_updated = 1, COALESCE(v_claim_status, 'no_claim');
    RETURN;
  END IF;

  UPDATE public.dialing_queues
  SET status = 'calling',
      updated_at = now(),
      notes = 'Provider dispatch is claimed or acceptance is unresolved; automatic redial is blocked pending reconciliation'
  WHERE id = p_queue_id
    AND status = 'calling'
    AND dispatch_generation = p_dispatch_generation;

  RETURN QUERY SELECT false, v_claim_status;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_provider_dispatch_invoke_error(
  uuid, uuid, text, timestamptz, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_provider_dispatch_invoke_error(
  uuid, uuid, text, timestamptz, text
) TO service_role;
