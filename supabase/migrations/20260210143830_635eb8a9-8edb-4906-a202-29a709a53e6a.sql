
-- ============================================================================
-- ALL MISSING FUNCTIONS - Adapted to ACTUAL database schema
-- Tables already exist with different column names than branch migrations
-- ============================================================================

-- 1. expire_old_actions() - Works as-is (columns match)
CREATE OR REPLACE FUNCTION expire_old_actions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE ai_action_queue
  SET status = 'expired', updated_at = now()
  WHERE status = 'pending'
    AND expires_at < now();
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;

-- 2. save_operational_memory() - Uses memory_key/memory_value/confidence
CREATE OR REPLACE FUNCTION save_operational_memory(
  p_user_id UUID,
  p_memory_type TEXT,
  p_subject TEXT,
  p_content JSONB,
  p_importance INTEGER DEFAULT 5
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  memory_id UUID;
BEGIN
  SELECT id INTO memory_id
  FROM ai_operational_memory
  WHERE user_id = p_user_id
    AND memory_type = p_memory_type
    AND memory_key = p_subject
  LIMIT 1;

  IF memory_id IS NOT NULL THEN
    UPDATE ai_operational_memory
    SET memory_value = p_content,
        confidence = p_importance,
        last_accessed_at = now(),
        access_count = access_count + 1,
        updated_at = now()
    WHERE id = memory_id;
    RETURN memory_id;
  ELSE
    INSERT INTO ai_operational_memory (user_id, memory_type, memory_key, memory_value, confidence)
    VALUES (p_user_id, p_memory_type, p_subject, p_content, p_importance)
    RETURNING id INTO memory_id;
    RETURN memory_id;
  END IF;
END;
$$;

-- 3. recalculate_calling_windows() - Uses converted_calls/conversion_rate
CREATE OR REPLACE FUNCTION recalculate_calling_windows(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  windows_updated INTEGER := 0;
BEGIN
  INSERT INTO optimal_calling_windows (
    user_id, day_of_week, hour_of_day,
    total_calls, answered_calls, converted_calls,
    answer_rate, conversion_rate, score, updated_at
  )
  SELECT
    p_user_id,
    EXTRACT(DOW FROM cl.created_at)::INTEGER as dow,
    EXTRACT(HOUR FROM cl.created_at)::INTEGER as hod,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE cl.outcome IN ('completed', 'answered', 'appointment_set')) as answered,
    COUNT(*) FILTER (WHERE cl.outcome = 'appointment_set') as converted,
    CASE WHEN COUNT(*) > 0
      THEN COUNT(*) FILTER (WHERE cl.outcome IN ('completed', 'answered', 'appointment_set'))::NUMERIC / COUNT(*)
      ELSE 0 END,
    CASE WHEN COUNT(*) > 0
      THEN COUNT(*) FILTER (WHERE cl.outcome = 'appointment_set')::NUMERIC / COUNT(*)
      ELSE 0 END,
    CASE WHEN COUNT(*) > 0
      THEN (
        COUNT(*) FILTER (WHERE cl.outcome IN ('completed', 'answered', 'appointment_set'))::NUMERIC / COUNT(*)
        + 3.0 * COUNT(*) FILTER (WHERE cl.outcome = 'appointment_set')::NUMERIC / COUNT(*)
      ) ELSE 0 END,
    now()
  FROM call_logs cl
  WHERE cl.user_id = p_user_id
    AND cl.created_at > now() - INTERVAL '30 days'
  GROUP BY dow, hod
  ON CONFLICT (user_id, day_of_week, hour_of_day) DO UPDATE SET
    total_calls = EXCLUDED.total_calls,
    answered_calls = EXCLUDED.answered_calls,
    converted_calls = EXCLUDED.converted_calls,
    answer_rate = EXCLUDED.answer_rate,
    conversion_rate = EXCLUDED.conversion_rate,
    score = EXCLUDED.score,
    updated_at = now();

  GET DIAGNOSTICS windows_updated = ROW_COUNT;
  RETURN windows_updated;
END;
$$;

-- 4. seed_default_playbook() - Uses name/trigger_stage/conditions/actions JSONB
CREATE OR REPLACE FUNCTION seed_default_playbook(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rules_created INTEGER := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM followup_playbook WHERE user_id = p_user_id LIMIT 1) THEN
    RETURN 0;
  END IF;

  -- FRESH: Speed to lead
  INSERT INTO followup_playbook (user_id, name, trigger_stage, priority, conditions, actions, is_active) VALUES
  (p_user_id, 'Speed to Lead', 'fresh', 1,
   '{"min_touches": 0, "max_touches": 0}'::jsonb,
   '{"type": "call", "delay_hours": 0.08, "config": {"urgency": "immediate"}}'::jsonb, true),
  (p_user_id, 'Fresh SMS Intro', 'attempting', 2,
   '{"min_touches": 1, "max_touches": 1}'::jsonb,
   '{"type": "sms", "delay_hours": 0.03, "template": "Hey {{first_name}}, just tried to give you a call. Is now a good time?"}'::jsonb, true),
  (p_user_id, 'Second Call Attempt', 'attempting', 3,
   '{"min_touches": 1, "max_touches": 2}'::jsonb,
   '{"type": "call", "delay_hours": 0.5}'::jsonb, true),
  (p_user_id, 'Third Call Attempt', 'attempting', 4,
   '{"min_touches": 2, "max_touches": 3}'::jsonb,
   '{"type": "call", "delay_hours": 4}'::jsonb, true),
  (p_user_id, 'Value-Driven AI SMS', 'attempting', 5,
   '{"min_touches": 3, "max_touches": 4}'::jsonb,
   '{"type": "ai_sms", "delay_hours": 1, "prompt": "Write a short friendly follow-up SMS. Under 160 chars."}'::jsonb, true);
  rules_created := rules_created + 5;

  -- ENGAGED
  INSERT INTO followup_playbook (user_id, name, trigger_stage, priority, conditions, actions, is_active) VALUES
  (p_user_id, 'Engaged Follow-up SMS', 'engaged', 1,
   '{"min_touches": 1, "max_touches": 10}'::jsonb,
   '{"type": "ai_sms", "delay_hours": 1, "prompt": "Write a brief warm follow-up SMS. Under 160 chars."}'::jsonb, true),
  (p_user_id, 'Engaged Next Call', 'engaged', 3,
   '{"min_touches": 2, "max_touches": 10}'::jsonb,
   '{"type": "call", "delay_hours": 36}'::jsonb, true);
  rules_created := rules_created + 2;

  -- HOT
  INSERT INTO followup_playbook (user_id, name, trigger_stage, priority, conditions, actions, is_active) VALUES
  (p_user_id, 'Hot Same-Day Call', 'hot', 1,
   '{}'::jsonb,
   '{"type": "call", "delay_hours": 4}'::jsonb, true),
  (p_user_id, 'Hot Morning Check-in', 'hot', 2,
   '{"min_touches": 2}'::jsonb,
   '{"type": "sms", "delay_hours": 18, "template": "Good morning {{first_name}}! Any questions about what we discussed?"}'::jsonb, true);
  rules_created := rules_created + 2;

  -- NURTURING
  INSERT INTO followup_playbook (user_id, name, trigger_stage, priority, conditions, actions, is_active) VALUES
  (p_user_id, 'Nurture Week 1', 'nurturing', 3,
   '{}'::jsonb,
   '{"type": "ai_sms", "delay_hours": 144, "prompt": "Write a helpful non-salesy follow-up. Under 160 chars."}'::jsonb, true),
  (p_user_id, 'Nurture Week 3', 'nurturing', 4,
   '{}'::jsonb,
   '{"type": "ai_sms", "delay_hours": 432, "prompt": "Write a brief genuine check-in. Under 120 chars."}'::jsonb, true),
  (p_user_id, 'Nurture Monthly', 'nurturing', 5,
   '{}'::jsonb,
   '{"type": "ai_sms", "delay_hours": 720, "prompt": "Write a brief friendly monthly check-in. Under 100 chars."}'::jsonb, true);
  rules_created := rules_created + 3;

  -- STALLED
  INSERT INTO followup_playbook (user_id, name, trigger_stage, priority, conditions, actions, is_active) VALUES
  (p_user_id, 'Stalled Re-engagement', 'stalled', 2,
   '{}'::jsonb,
   '{"type": "ai_sms", "delay_hours": 72, "prompt": "Write a brief re-engagement SMS using curiosity. Under 140 chars."}'::jsonb, true),
  (p_user_id, 'Breakup Text', 'stalled', 5,
   '{"min_touches": 4}'::jsonb,
   '{"type": "sms", "delay_hours": 240, "template": "Hey {{first_name}}, I haven''t heard back so I don''t want to keep bothering you. If things change, my line is always open!"}'::jsonb, true);
  rules_created := rules_created + 2;

  -- CALLBACK SET
  INSERT INTO followup_playbook (user_id, name, trigger_stage, priority, conditions, actions, is_active) VALUES
  (p_user_id, 'Callback Reminder SMS', 'callback_set', 1,
   '{}'::jsonb,
   '{"type": "sms", "delay_hours": 0, "template": "Hi {{first_name}}, heads up I''ll be calling you shortly as discussed!"}'::jsonb, true),
  (p_user_id, 'Execute Callback', 'callback_set', 1,
   '{}'::jsonb,
   '{"type": "call", "delay_hours": 0, "config": {"respect_explicit_time": true}}'::jsonb, true);
  rules_created := rules_created + 2;

  -- BOOKED
  INSERT INTO followup_playbook (user_id, name, trigger_stage, priority, conditions, actions, is_active) VALUES
  (p_user_id, 'Booking Confirmation', 'booked', 1,
   '{"min_touches": 0, "max_touches": 0}'::jsonb,
   '{"type": "sms", "delay_hours": 0.05, "template": "Awesome {{first_name}}! Your appointment is confirmed!"}'::jsonb, true),
  (p_user_id, 'Day-Before Reminder', 'booked', 2,
   '{}'::jsonb,
   '{"type": "sms", "template": "Hi {{first_name}}, reminder about our call tomorrow!"}'::jsonb, true),
  (p_user_id, 'Morning-Of Reminder', 'booked', 3,
   '{}'::jsonb,
   '{"type": "sms", "template": "Good morning {{first_name}}! Looking forward to our chat today!"}'::jsonb, true);
  rules_created := rules_created + 3;

  RETURN rules_created;
END;
$$;

-- 5. select_script_variant() - Uses weight instead of traffic_weight, prompt_patch instead of general_prompt
CREATE OR REPLACE FUNCTION select_script_variant(
  p_user_id UUID,
  p_agent_id TEXT
)
RETURNS TABLE(variant_id UUID, variant_name TEXT, prompt_patch JSONB, variant_label TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  total_weight NUMERIC;
  random_val NUMERIC;
  running_total NUMERIC := 0;
  rec RECORD;
BEGIN
  SELECT COALESCE(SUM(asv.weight), 0) INTO total_weight
  FROM agent_script_variants asv
  WHERE asv.user_id = p_user_id AND asv.agent_id = p_agent_id AND asv.is_active = true;

  IF total_weight = 0 THEN RETURN; END IF;

  random_val := random() * total_weight;

  FOR rec IN
    SELECT asv.id, asv.variant_name, asv.prompt_patch, asv.variant_label, asv.weight
    FROM agent_script_variants asv
    WHERE asv.user_id = p_user_id AND asv.agent_id = p_agent_id AND asv.is_active = true
    ORDER BY asv.weight DESC
  LOOP
    running_total := running_total + rec.weight;
    IF running_total >= random_val THEN
      variant_id := rec.id;
      variant_name := rec.variant_name;
      prompt_patch := rec.prompt_patch;
      variant_label := rec.variant_label;
      RETURN NEXT;
      RETURN;
    END IF;
  END LOOP;
END;
$$;

-- 6. update_variant_stats() - Uses total_conversions instead of appointments_set
CREATE OR REPLACE FUNCTION update_variant_stats(
  p_variant_id UUID,
  p_outcome TEXT,
  p_duration INTEGER,
  p_converted BOOLEAN DEFAULT false
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE agent_script_variants SET
    total_calls = total_calls + 1,
    total_conversions = total_conversions + CASE WHEN p_converted THEN 1 ELSE 0 END,
    avg_duration_seconds = CASE
      WHEN total_calls = 0 THEN p_duration
      ELSE (avg_duration_seconds * total_calls + p_duration) / (total_calls + 1)
    END,
    updated_at = now()
  WHERE id = p_variant_id;
END;
$$;

-- 7. calibrate_lead_scoring_weights() - Uses factor_name/weight rows
CREATE OR REPLACE FUNCTION calibrate_lead_scoring_weights(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  sample_count INTEGER;
  avg_converted_score NUMERIC;
  avg_not_converted_score NUMERIC;
  factor TEXT;
  new_weight NUMERIC;
  result JSONB := '{}'::jsonb;
  factors TEXT[] := ARRAY['engagement', 'recency', 'answer_rate', 'status'];
  default_weights NUMERIC[] := ARRAY[0.30, 0.25, 0.25, 0.20];
  total_weight NUMERIC := 0;
  weights NUMERIC[] := ARRAY[0.30, 0.25, 0.25, 0.20];
  i INTEGER;
BEGIN
  SELECT COUNT(*) INTO sample_count
  FROM lead_score_outcomes
  WHERE user_id = p_user_id
    AND created_at > now() - INTERVAL '30 days';

  IF sample_count < 50 THEN
    RETURN jsonb_build_object('calibrated', false, 'reason', 'Need 50+ outcomes (have ' || sample_count || ')', 'sample_size', sample_count);
  END IF;

  FOR i IN 1..4 LOOP
    factor := factors[i];

    SELECT
      COALESCE(AVG(CASE WHEN converted THEN (factors_at_contact->>factor)::NUMERIC END), 0),
      COALESCE(AVG(CASE WHEN NOT converted THEN (factors_at_contact->>factor)::NUMERIC END), 0)
    INTO avg_converted_score, avg_not_converted_score
    FROM lead_score_outcomes
    WHERE user_id = p_user_id AND created_at > now() - INTERVAL '30 days';

    IF avg_converted_score > avg_not_converted_score * 1.2 THEN
      weights[i] := default_weights[i] + 0.05;
    ELSIF avg_converted_score < avg_not_converted_score * 0.8 THEN
      weights[i] := default_weights[i] - 0.05;
    ELSE
      weights[i] := default_weights[i];
    END IF;
  END LOOP;

  -- Normalize
  total_weight := weights[1] + weights[2] + weights[3] + weights[4];
  FOR i IN 1..4 LOOP
    weights[i] := weights[i] / total_weight;

    INSERT INTO lead_scoring_weights (user_id, factor_name, weight, calibrated_at, sample_size)
    VALUES (p_user_id, factors[i], weights[i], now(), sample_count)
    ON CONFLICT (user_id, factor_name) DO UPDATE SET
      weight = EXCLUDED.weight,
      calibrated_at = now(),
      sample_size = EXCLUDED.sample_size;
  END LOOP;

  RETURN jsonb_build_object(
    'calibrated', true, 'sample_size', sample_count,
    'weights', jsonb_build_object(
      'engagement', ROUND(weights[1], 4),
      'recency', ROUND(weights[2], 4),
      'answer_rate', ROUND(weights[3], 4),
      'status', ROUND(weights[4], 4)
    )
  );
END;
$$;

-- 8. rebalance_variant_weights() - Uses weight instead of traffic_weight
CREATE OR REPLACE FUNCTION rebalance_variant_weights(
  p_user_id UUID,
  p_agent_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rec RECORD;
  v_total_calls INTEGER := 0;
  results JSONB := '[]'::JSONB;
  conversion_rate NUMERIC;
  ucb NUMERIC;
  total_ucb NUMERIC := 0;
BEGIN
  SELECT COALESCE(SUM(asv.total_calls), 0) INTO v_total_calls
  FROM agent_script_variants asv
  WHERE asv.user_id = p_user_id AND asv.agent_id = p_agent_id AND asv.is_active = true;

  IF v_total_calls < 20 THEN
    RETURN jsonb_build_object('rebalanced', false, 'reason', 'Need 20+ total calls');
  END IF;

  -- First pass: compute UCBs
  FOR rec IN
    SELECT id, variant_name, asv.total_calls AS vc, asv.total_conversions,
           CASE WHEN asv.total_calls > 0
             THEN asv.total_conversions::NUMERIC / asv.total_calls
             ELSE 0 END AS conv_rate
    FROM agent_script_variants asv
    WHERE asv.user_id = p_user_id AND asv.agent_id = p_agent_id AND asv.is_active = true
  LOOP
    IF rec.vc > 0 THEN
      ucb := rec.conv_rate + SQRT(2.0 * LN(v_total_calls::NUMERIC) / rec.vc);
    ELSE
      ucb := 999;
    END IF;
    total_ucb := total_ucb + ucb;

    -- Store temporarily
    UPDATE agent_script_variants
    SET weight = GREATEST(0.1, ucb)
    WHERE id = rec.id;

    results := results || jsonb_build_object('variant', rec.variant_name, 'calls', rec.vc, 'conv_rate', ROUND(rec.conv_rate, 4), 'ucb', ROUND(ucb, 4));
  END LOOP;

  -- Normalize weights to sum ~= 1
  IF total_ucb > 0 THEN
    UPDATE agent_script_variants
    SET weight = GREATEST(0.1, weight / total_ucb)
    WHERE user_id = p_user_id AND agent_id = p_agent_id AND is_active = true;
  END IF;

  RETURN jsonb_build_object('rebalanced', true, 'total_calls', v_total_calls, 'variants', results);
END;
$$;

-- Add autonomous_settings columns if missing
DO $$
BEGIN
  ALTER TABLE autonomous_settings ADD COLUMN IF NOT EXISTS last_engine_run TIMESTAMPTZ;
  ALTER TABLE autonomous_settings ADD COLUMN IF NOT EXISTS engine_interval_minutes INTEGER DEFAULT 5;
  ALTER TABLE autonomous_settings ADD COLUMN IF NOT EXISTS auto_optimize_calling_times BOOLEAN DEFAULT false;
  ALTER TABLE autonomous_settings ADD COLUMN IF NOT EXISTS auto_adjust_pacing BOOLEAN DEFAULT false;
  ALTER TABLE autonomous_settings ADD COLUMN IF NOT EXISTS manage_lead_journeys BOOLEAN DEFAULT false;
  ALTER TABLE autonomous_settings ADD COLUMN IF NOT EXISTS journey_max_daily_touches INTEGER DEFAULT 200;
  ALTER TABLE autonomous_settings ADD COLUMN IF NOT EXISTS enable_script_ab_testing BOOLEAN DEFAULT false;
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

-- Add unique constraint for lead_scoring_weights if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lead_scoring_weights_user_factor_unique'
  ) THEN
    ALTER TABLE lead_scoring_weights ADD CONSTRAINT lead_scoring_weights_user_factor_unique UNIQUE (user_id, factor_name);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

-- Add unique constraint for optimal_calling_windows if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'optimal_calling_windows_user_day_hour_key'
  ) THEN
    ALTER TABLE optimal_calling_windows ADD CONSTRAINT optimal_calling_windows_user_day_hour_key UNIQUE (user_id, day_of_week, hour_of_day);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;
