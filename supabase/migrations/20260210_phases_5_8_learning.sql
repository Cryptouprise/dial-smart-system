-- ============================================================================
-- AUTONOMOUS ENGINE PHASE 5-8 - February 10, 2026
--
-- Phase 5: Calling time optimizer → automation-scheduler
-- Phase 6: Lead score weight feedback loop
-- Phase 7: Script A/B testing system
-- Phase 8: Pacing adaptation (DB-driven)
-- ============================================================================

-- ============================================================================
-- Phase 7: SCRIPT A/B TESTING
-- ============================================================================

-- Stores script variants for each agent
CREATE TABLE IF NOT EXISTS agent_script_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  variant_name TEXT NOT NULL,
  variant_label TEXT NOT NULL DEFAULT 'A',
  general_prompt TEXT NOT NULL,
  begin_message TEXT,
  is_control BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  traffic_weight NUMERIC(5,2) NOT NULL DEFAULT 50.0 CHECK (traffic_weight BETWEEN 0 AND 100),
  total_calls INTEGER NOT NULL DEFAULT 0,
  answered_calls INTEGER NOT NULL DEFAULT 0,
  appointments_set INTEGER NOT NULL DEFAULT 0,
  avg_duration_seconds NUMERIC(8,2) DEFAULT 0,
  success_rate NUMERIC(5,4) DEFAULT 0,
  appointment_rate NUMERIC(5,4) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  UNIQUE(user_id, agent_id, variant_name)
);

CREATE INDEX idx_script_variants_agent ON agent_script_variants(user_id, agent_id, is_active);

ALTER TABLE agent_script_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own variants" ON agent_script_variants
  FOR ALL USING (auth.uid() = user_id);

-- Tracks which variant was used for each call
CREATE TABLE IF NOT EXISTS call_variant_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID,
  variant_id UUID NOT NULL REFERENCES agent_script_variants(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  outcome TEXT,
  duration_seconds INTEGER,
  appointment_set BOOLEAN DEFAULT false,
  recorded_at TIMESTAMPTZ
);

CREATE INDEX idx_variant_assignments_variant ON call_variant_assignments(variant_id, assigned_at DESC);
CREATE INDEX idx_variant_assignments_call ON call_variant_assignments(call_id);

ALTER TABLE call_variant_assignments ENABLE ROW LEVEL SECURITY;

-- RLS via variant owner
CREATE POLICY "Users see own variant assignments" ON call_variant_assignments
  FOR ALL USING (
    variant_id IN (SELECT id FROM agent_script_variants WHERE user_id = auth.uid())
  );

-- ============================================================================
-- Phase 8: PACING ADAPTATION (DB-driven)
-- ============================================================================

-- Tracks pacing decisions and outcomes over time
CREATE TABLE IF NOT EXISTS pacing_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  broadcast_id UUID,
  campaign_id UUID,
  previous_pace INTEGER NOT NULL,
  new_pace INTEGER NOT NULL,
  reason TEXT NOT NULL,
  error_rate NUMERIC(5,4),
  answer_rate NUMERIC(5,4),
  trigger TEXT NOT NULL DEFAULT 'autonomous' CHECK (trigger IN ('autonomous', 'manual', 'emergency')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pacing_history_user ON pacing_history(user_id, created_at DESC);

ALTER TABLE pacing_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own pacing" ON pacing_history
  FOR ALL USING (auth.uid() = user_id);

-- Stores the current optimal pace per broadcast/campaign
-- voice-broadcast-engine reads this
CREATE TABLE IF NOT EXISTS adaptive_pacing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  broadcast_id UUID,
  campaign_id UUID,
  optimal_pace INTEGER NOT NULL DEFAULT 50,
  min_pace INTEGER NOT NULL DEFAULT 10,
  max_pace INTEGER NOT NULL DEFAULT 100,
  last_adjusted TIMESTAMPTZ DEFAULT now(),
  adjustment_reason TEXT,
  UNIQUE(user_id, broadcast_id),
  UNIQUE(user_id, campaign_id)
);

ALTER TABLE adaptive_pacing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own pacing" ON adaptive_pacing
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- Phase 6: LEAD SCORE WEIGHT FEEDBACK
-- ============================================================================

-- Stores learned scoring weights per user (replaces hardcoded 0.3/0.25/0.25/0.2)
CREATE TABLE IF NOT EXISTS lead_scoring_weights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  engagement_weight NUMERIC(5,4) NOT NULL DEFAULT 0.30,
  recency_weight NUMERIC(5,4) NOT NULL DEFAULT 0.25,
  answer_rate_weight NUMERIC(5,4) NOT NULL DEFAULT 0.25,
  status_weight NUMERIC(5,4) NOT NULL DEFAULT 0.20,
  sample_size INTEGER NOT NULL DEFAULT 0,
  last_calibrated TIMESTAMPTZ,
  calibration_method TEXT DEFAULT 'default',
  UNIQUE(user_id)
);

ALTER TABLE lead_scoring_weights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own weights" ON lead_scoring_weights
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- FUNCTION: select_script_variant()
-- Thompson Sampling-inspired weighted random selection
-- ============================================================================
CREATE OR REPLACE FUNCTION select_script_variant(
  p_user_id UUID,
  p_agent_id TEXT
)
RETURNS TABLE(variant_id UUID, variant_name TEXT, general_prompt TEXT, begin_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  total_weight NUMERIC;
  random_val NUMERIC;
  running_total NUMERIC := 0;
  rec RECORD;
BEGIN
  -- Get total weight of active variants
  SELECT COALESCE(SUM(traffic_weight), 0) INTO total_weight
  FROM agent_script_variants
  WHERE user_id = p_user_id
    AND agent_id = p_agent_id
    AND is_active = true;

  IF total_weight = 0 THEN
    RETURN;
  END IF;

  -- Random weighted selection
  random_val := random() * total_weight;

  FOR rec IN
    SELECT asv.id, asv.variant_name, asv.general_prompt, asv.begin_message, asv.traffic_weight
    FROM agent_script_variants asv
    WHERE asv.user_id = p_user_id
      AND asv.agent_id = p_agent_id
      AND asv.is_active = true
    ORDER BY asv.traffic_weight DESC
  LOOP
    running_total := running_total + rec.traffic_weight;
    IF running_total >= random_val THEN
      variant_id := rec.id;
      variant_name := rec.variant_name;
      general_prompt := rec.general_prompt;
      begin_message := rec.begin_message;
      RETURN NEXT;
      RETURN;
    END IF;
  END LOOP;
END;
$$;

-- ============================================================================
-- FUNCTION: update_variant_stats()
-- Called after each call to update variant performance
-- ============================================================================
CREATE OR REPLACE FUNCTION update_variant_stats(
  p_variant_id UUID,
  p_outcome TEXT,
  p_duration INTEGER,
  p_appointment BOOLEAN DEFAULT false
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  is_positive BOOLEAN;
BEGIN
  is_positive := p_outcome IN ('completed', 'answered', 'interested', 'callback', 'appointment_set', 'converted');

  UPDATE agent_script_variants SET
    total_calls = total_calls + 1,
    answered_calls = answered_calls + CASE WHEN is_positive THEN 1 ELSE 0 END,
    appointments_set = appointments_set + CASE WHEN p_appointment THEN 1 ELSE 0 END,
    avg_duration_seconds = CASE
      WHEN total_calls = 0 THEN p_duration
      ELSE (avg_duration_seconds * total_calls + p_duration) / (total_calls + 1)
    END,
    success_rate = CASE
      WHEN total_calls = 0 THEN CASE WHEN is_positive THEN 1.0 ELSE 0.0 END
      ELSE (answered_calls + CASE WHEN is_positive THEN 1 ELSE 0 END)::NUMERIC / (total_calls + 1)
    END,
    appointment_rate = CASE
      WHEN total_calls = 0 THEN CASE WHEN p_appointment THEN 1.0 ELSE 0.0 END
      ELSE (appointments_set + CASE WHEN p_appointment THEN 1 ELSE 0 END)::NUMERIC / (total_calls + 1)
    END,
    last_used_at = now()
  WHERE id = p_variant_id;
END;
$$;

-- ============================================================================
-- FUNCTION: calibrate_lead_scoring_weights()
-- Analyzes lead_score_outcomes to find which factors predict success
-- ============================================================================
CREATE OR REPLACE FUNCTION calibrate_lead_scoring_weights(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  sample INTEGER;
  avg_answered_score NUMERIC;
  avg_missed_score NUMERIC;
  eng_corr NUMERIC := 0.30;
  rec_corr NUMERIC := 0.25;
  ans_corr NUMERIC := 0.25;
  sts_corr NUMERIC := 0.20;
  total_corr NUMERIC;
  result JSONB;
BEGIN
  -- Need at least 50 outcomes to calibrate
  SELECT COUNT(*) INTO sample
  FROM lead_score_outcomes
  WHERE user_id = p_user_id
    AND created_at > now() - INTERVAL '30 days';

  IF sample < 50 THEN
    RETURN jsonb_build_object(
      'calibrated', false,
      'reason', 'Need 50+ outcomes (have ' || sample || ')',
      'sample_size', sample
    );
  END IF;

  -- Compare average component scores for answered vs missed
  -- Higher average for answered calls = that component is more predictive
  SELECT
    COALESCE(AVG(CASE WHEN outcome IN ('answered', 'appointment')
      THEN (score_components->>'engagement')::NUMERIC END), 0),
    COALESCE(AVG(CASE WHEN outcome IN ('no_answer', 'voicemail', 'busy')
      THEN (score_components->>'engagement')::NUMERIC END), 0)
  INTO avg_answered_score, avg_missed_score
  FROM lead_score_outcomes
  WHERE user_id = p_user_id AND created_at > now() - INTERVAL '30 days';

  -- Engagement: bump weight if answered leads had higher engagement scores
  IF avg_answered_score > avg_missed_score * 1.2 THEN
    eng_corr := 0.35;
  ELSIF avg_answered_score < avg_missed_score * 0.8 THEN
    eng_corr := 0.20;
  END IF;

  -- Repeat for recency
  SELECT
    COALESCE(AVG(CASE WHEN outcome IN ('answered', 'appointment')
      THEN (score_components->>'recency')::NUMERIC END), 0),
    COALESCE(AVG(CASE WHEN outcome IN ('no_answer', 'voicemail', 'busy')
      THEN (score_components->>'recency')::NUMERIC END), 0)
  INTO avg_answered_score, avg_missed_score
  FROM lead_score_outcomes
  WHERE user_id = p_user_id AND created_at > now() - INTERVAL '30 days';

  IF avg_answered_score > avg_missed_score * 1.2 THEN
    rec_corr := 0.30;
  ELSIF avg_answered_score < avg_missed_score * 0.8 THEN
    rec_corr := 0.15;
  END IF;

  -- Repeat for answer_rate
  SELECT
    COALESCE(AVG(CASE WHEN outcome IN ('answered', 'appointment')
      THEN (score_components->>'answer_rate')::NUMERIC END), 0),
    COALESCE(AVG(CASE WHEN outcome IN ('no_answer', 'voicemail', 'busy')
      THEN (score_components->>'answer_rate')::NUMERIC END), 0)
  INTO avg_answered_score, avg_missed_score
  FROM lead_score_outcomes
  WHERE user_id = p_user_id AND created_at > now() - INTERVAL '30 days';

  IF avg_answered_score > avg_missed_score * 1.2 THEN
    ans_corr := 0.30;
  ELSIF avg_answered_score < avg_missed_score * 0.8 THEN
    ans_corr := 0.15;
  END IF;

  -- Normalize weights to sum to 1.0
  total_corr := eng_corr + rec_corr + ans_corr + sts_corr;
  eng_corr := eng_corr / total_corr;
  rec_corr := rec_corr / total_corr;
  ans_corr := ans_corr / total_corr;
  sts_corr := sts_corr / total_corr;

  -- Save calibrated weights
  INSERT INTO lead_scoring_weights (user_id, engagement_weight, recency_weight, answer_rate_weight, status_weight, sample_size, last_calibrated, calibration_method)
  VALUES (p_user_id, eng_corr, rec_corr, ans_corr, sts_corr, sample, now(), 'outcome_correlation')
  ON CONFLICT (user_id) DO UPDATE SET
    engagement_weight = EXCLUDED.engagement_weight,
    recency_weight = EXCLUDED.recency_weight,
    answer_rate_weight = EXCLUDED.answer_rate_weight,
    status_weight = EXCLUDED.status_weight,
    sample_size = EXCLUDED.sample_size,
    last_calibrated = now(),
    calibration_method = 'outcome_correlation';

  result := jsonb_build_object(
    'calibrated', true,
    'sample_size', sample,
    'weights', jsonb_build_object(
      'engagement', ROUND(eng_corr, 4),
      'recency', ROUND(rec_corr, 4),
      'answer_rate', ROUND(ans_corr, 4),
      'status', ROUND(sts_corr, 4)
    )
  );

  RETURN result;
END;
$$;

-- ============================================================================
-- FUNCTION: rebalance_variant_weights()
-- Shifts traffic toward winning variants (Upper Confidence Bound style)
-- ============================================================================
CREATE OR REPLACE FUNCTION rebalance_variant_weights(
  p_user_id UUID,
  p_agent_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec RECORD;
  total_calls INTEGER := 0;
  max_ucb NUMERIC := -1;
  best_variant_id UUID;
  results JSONB := '[]'::JSONB;
BEGIN
  -- Get total calls across all variants
  SELECT COALESCE(SUM(total_calls), 0) INTO total_calls
  FROM agent_script_variants
  WHERE user_id = p_user_id AND agent_id = p_agent_id AND is_active = true;

  IF total_calls < 20 THEN
    RETURN jsonb_build_object('rebalanced', false, 'reason', 'Need 20+ total calls');
  END IF;

  -- Calculate UCB for each variant and assign weights
  FOR rec IN
    SELECT id, variant_name, total_calls AS vc,
           success_rate,
           appointment_rate,
           -- UCB1 formula: mean + sqrt(2 * ln(N) / n)
           CASE WHEN total_calls > 0
             THEN (success_rate + 3 * appointment_rate)
                  + SQRT(2.0 * LN(total_calls::NUMERIC) / GREATEST(1, total_calls))
             ELSE 999 -- Unexplored = high UCB (explore first)
           END AS ucb
    FROM agent_script_variants
    WHERE user_id = p_user_id AND agent_id = p_agent_id AND is_active = true
  LOOP
    -- Assign weight proportional to UCB score
    -- Minimum 10% traffic to keep exploring
    UPDATE agent_script_variants
    SET traffic_weight = GREATEST(10, ROUND(rec.ucb * 100 / GREATEST(0.01, (
      SELECT SUM(CASE WHEN sv.total_calls > 0
        THEN (sv.success_rate + 3 * sv.appointment_rate)
             + SQRT(2.0 * LN(total_calls::NUMERIC) / GREATEST(1, sv.total_calls))
        ELSE 999 END)
      FROM agent_script_variants sv
      WHERE sv.user_id = p_user_id AND sv.agent_id = p_agent_id AND sv.is_active = true
    )) * 100, 1))
    WHERE id = rec.id;

    results := results || jsonb_build_object(
      'variant', rec.variant_name,
      'calls', rec.vc,
      'success_rate', ROUND(rec.success_rate, 4),
      'ucb', ROUND(rec.ucb, 4)
    );
  END LOOP;

  RETURN jsonb_build_object('rebalanced', true, 'total_calls', total_calls, 'variants', results);
END;
$$;
