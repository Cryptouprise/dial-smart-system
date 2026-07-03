-- Unattended safety backstops: make autonomous operation safe with nobody
-- logged in. Previously budget auto-pause and stuck-call recovery only ran
-- from the frontend; overnight overspend / error storms went un-remediated.
--
-- Applied to production via MCP on 2026-07-03 (version 20260703224351).
-- This file mirrors that change so repo migration history stays in sync.
--
-- run_safety_backstops() is pure SQL (no HTTP, no secrets) and covers:
--   1. Engine heartbeat  — alert when ai-autonomous-engine stops running
--   2. Stuck-queue sweep — recover dialing_queues rows stuck in 'calling'
--   3. Budget backstop   — auto-pause campaigns when daily/monthly spend
--                          exceeds budget_settings limits
-- Scheduled every 10 minutes via pg_cron. campaign-health-monitor auto_fix
-- is scheduled separately over HTTP (it needs provider API access); that
-- cron job uses the public anon JWT like the pre-existing scheduler jobs.

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
  -- If the autonomous engine hasn't run in 3x its interval (min 15 min)
  -- for an enabled user, raise a critical alert (deduped, 6h window).
  ------------------------------------------------------------------
  FOR v_stale IN
    SELECT s.user_id, s.last_engine_run, s.engine_interval_minutes
    FROM autonomous_settings s
    WHERE s.enabled = true
      AND s.last_engine_run IS NOT NULL
      AND s.last_engine_run < v_now - make_interval(
            mins => GREATEST(COALESCE(s.engine_interval_minutes, 5) * 3, 15))
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM system_alerts a
      WHERE a.user_id = v_stale.user_id
        AND a.alert_type = 'engine_heartbeat_stale'
        AND a.acknowledged = false AND a.auto_resolved = false
        AND a.created_at > v_now - interval '6 hours'
    ) THEN
      INSERT INTO system_alerts (user_id, alert_type, severity, title, message, metadata)
      VALUES (
        v_stale.user_id, 'engine_heartbeat_stale', 'critical',
        'Autonomous engine heartbeat lost',
        'ai-autonomous-engine has not completed a run since '
          || to_char(v_stale.last_engine_run, 'YYYY-MM-DD HH24:MI UTC')
          || '. Autonomous calling/follow-ups are NOT executing. Check pg_cron and function logs.',
        jsonb_build_object('last_engine_run', v_stale.last_engine_run)
      );
      v_alerts := v_alerts + 1;
    END IF;
  END LOOP;

  -- Auto-resolve heartbeat alerts once the engine is running again.
  UPDATE system_alerts a
  SET auto_resolved = true, resolved_at = v_now
  FROM autonomous_settings s
  WHERE a.alert_type = 'engine_heartbeat_stale'
    AND a.auto_resolved = false
    AND s.user_id = a.user_id
    AND s.last_engine_run > v_now - make_interval(
          mins => GREATEST(COALESCE(s.engine_interval_minutes, 5) * 2, 10));

  ------------------------------------------------------------------
  -- 2. STUCK-QUEUE SWEEP
  -- dialing_queues rows stuck in 'calling' for >15 min mean the dispatch
  -- or webhook path died mid-call. Fail them so leads aren't stranded,
  -- and alert (deduped) so the operator knows it happened.
  ------------------------------------------------------------------
  WITH stuck AS (
    UPDATE dialing_queues q
    SET status = 'failed',
        updated_at = v_now,
        notes = COALESCE(q.notes || ' | ', '') || 'auto-failed by safety backstop: stuck in calling >15min'
    WHERE q.status = 'calling'
      AND q.updated_at < v_now - interval '15 minutes'
    RETURNING q.campaign_id
  )
  SELECT count(*) INTO v_stuck_count FROM stuck;

  IF v_stuck_count > 0 THEN
    INSERT INTO system_alerts (user_id, alert_type, severity, title, message, metadata)
    SELECT c.user_id, 'stuck_calls_recovered', 'warning',
           'Stuck queue entries auto-recovered',
           v_stuck_count || ' dialing-queue entries were stuck in calling >15 min and were marked failed. If this repeats, the dispatch/webhook path is dropping calls.',
           jsonb_build_object('count', v_stuck_count)
    FROM campaigns c
    WHERE c.status IN ('active','running')
      AND NOT EXISTS (
        SELECT 1 FROM system_alerts a
        WHERE a.user_id = c.user_id
          AND a.alert_type = 'stuck_calls_recovered'
          AND a.created_at > v_now - interval '1 hour')
    GROUP BY c.user_id;
  END IF;

  ------------------------------------------------------------------
  -- 3. BUDGET BACKSTOP
  -- Spend today/this month vs budget_settings limits. Spend source is the
  -- max of spending_summaries (provider-synced) and call_logs.call_cost
  -- (real-time), so a stale provider sync can't hide overspend.
  ------------------------------------------------------------------
  FOR v_budget IN
    SELECT b.* FROM budget_settings b
    WHERE b.auto_pause_enabled = true AND b.is_paused = false
  LOOP
    SELECT GREATEST(
      COALESCE((SELECT sum(ss.total_cost) FROM spending_summaries ss
                WHERE ss.user_id = v_budget.user_id
                  AND (v_budget.campaign_id IS NULL OR ss.campaign_id = v_budget.campaign_id)
                  AND ss.summary_date = current_date), 0),
      COALESCE((SELECT sum(cl.call_cost) FROM call_logs cl
                WHERE cl.user_id = v_budget.user_id
                  AND (v_budget.campaign_id IS NULL OR cl.campaign_id = v_budget.campaign_id)
                  AND cl.created_at >= date_trunc('day', v_now)), 0)
    ) INTO v_daily_spend;

    SELECT GREATEST(
      COALESCE((SELECT sum(ss.total_cost) FROM spending_summaries ss
                WHERE ss.user_id = v_budget.user_id
                  AND (v_budget.campaign_id IS NULL OR ss.campaign_id = v_budget.campaign_id)
                  AND ss.summary_date >= date_trunc('month', v_now)::date), 0),
      COALESCE((SELECT sum(cl.call_cost) FROM call_logs cl
                WHERE cl.user_id = v_budget.user_id
                  AND (v_budget.campaign_id IS NULL OR cl.campaign_id = v_budget.campaign_id)
                  AND cl.created_at >= date_trunc('month', v_now)), 0)
    ) INTO v_monthly_spend;

    IF (v_budget.daily_limit IS NOT NULL AND v_budget.daily_limit > 0 AND v_daily_spend >= v_budget.daily_limit)
       OR (v_budget.monthly_limit IS NOT NULL AND v_budget.monthly_limit > 0 AND v_monthly_spend >= v_budget.monthly_limit) THEN

      UPDATE budget_settings
      SET is_paused = true, paused_at = v_now,
          pause_reason = 'Auto-paused by safety backstop: spend $' || round(v_daily_spend, 2)
            || ' today / $' || round(v_monthly_spend, 2) || ' this month exceeded limit'
      WHERE id = v_budget.id;

      UPDATE campaigns
      SET status = 'paused', updated_at = v_now
      WHERE user_id = v_budget.user_id
        AND status IN ('active','running')
        AND (v_budget.campaign_id IS NULL OR id = v_budget.campaign_id);

      INSERT INTO budget_alerts (user_id, budget_setting_id, alert_type, threshold_percent,
                                 amount_spent, budget_limit, message, action_taken)
      VALUES (v_budget.user_id, v_budget.id, 'auto_pause', 100,
              v_daily_spend, COALESCE(v_budget.daily_limit, v_budget.monthly_limit),
              'Safety backstop auto-paused campaigns: budget limit reached.',
              'campaigns_paused');

      INSERT INTO system_alerts (user_id, alert_type, severity, title, message, metadata)
      VALUES (v_budget.user_id, 'budget_auto_pause', 'critical',
              'Budget limit reached — campaigns auto-paused',
              'Spend reached $' || round(v_daily_spend,2) || ' today / $' || round(v_monthly_spend,2)
                || ' this month. Campaigns were paused by the unattended safety backstop.',
              jsonb_build_object('daily_spend', v_daily_spend, 'monthly_spend', v_monthly_spend,
                                 'budget_setting_id', v_budget.id));
      v_paused := v_paused + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'heartbeat_alerts', v_alerts,
    'stuck_recovered', v_stuck_count,
    'budgets_paused', v_paused,
    'ran_at', v_now);
END;
$$;

-- Server-only, per project security standard.
REVOKE EXECUTE ON FUNCTION public.run_safety_backstops() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_safety_backstops() TO service_role;

-- Schedule: every 10 minutes (idempotent — unschedule first if it exists).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'safety-backstops') THEN
    PERFORM cron.unschedule('safety-backstops');
  END IF;
  PERFORM cron.schedule('safety-backstops', '*/10 * * * *', 'SELECT public.run_safety_backstops()');
END $$;

-- campaign-health-monitor auto_fix every 15 min. Uses the project's public
-- anon JWT in the header exactly like the pre-existing scheduler cron jobs
-- (the function tolerates non-user auth and then checks ALL users' broadcasts).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'campaign-health-autofix') THEN
    PERFORM cron.unschedule('campaign-health-autofix');
  END IF;
  PERFORM cron.schedule('campaign-health-autofix', '*/15 * * * *', $cmd$
  SELECT net.http_post(
    url := 'https://emonjusymdripmkvtttc.supabase.co/functions/v1/campaign-health-monitor',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtb25qdXN5bWRyaXBta3Z0dHRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg3MzYyNDcsImV4cCI6MjA2NDMxMjI0N30.NPmcCmeJwR_vNymUZp73G9PqbsiPJ7KSTA9x8xG6Soc"}'::jsonb,
    body := '{"action": "auto_fix"}'::jsonb
  ) AS request_id;
  $cmd$);
END $$;
