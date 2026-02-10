
-- ============================================================================
-- MIGRATION 4: AI INTELLIGENCE UPGRADE
-- ============================================================================

-- 1. DISPOSITION VALUE WEIGHTS
CREATE TABLE IF NOT EXISTS disposition_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  disposition_name TEXT NOT NULL,
  conversion_probability NUMERIC(5,4) NOT NULL DEFAULT 0.05,
  value_weight INTEGER NOT NULL DEFAULT 5 CHECK (value_weight BETWEEN 1 AND 10),
  maps_to_stage TEXT CHECK (maps_to_stage IN (
    'fresh', 'attempting', 'engaged', 'hot', 'nurturing', 'stalled',
    'dormant', 'callback_set', 'booked', 'closed_won', 'closed_lost'
  )),
  priority_boost INTEGER NOT NULL DEFAULT 0,
  requires_immediate_followup BOOLEAN DEFAULT false,
  custom_followup_delay_hours NUMERIC(8,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, disposition_name)
);

ALTER TABLE disposition_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own disposition values" ON disposition_values
  FOR ALL USING (auth.uid() = user_id);

-- Seed function
CREATE OR REPLACE FUNCTION seed_disposition_values(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  seeded INTEGER := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM disposition_values WHERE user_id = p_user_id LIMIT 1) THEN
    RETURN 0;
  END IF;
  INSERT INTO disposition_values (user_id, disposition_name, conversion_probability, value_weight, maps_to_stage, priority_boost, requires_immediate_followup, custom_followup_delay_hours)
  VALUES
    (p_user_id, 'appointment_set',    0.95, 10, 'booked',      50, true,  0.05),
    (p_user_id, 'talk_to_human',      0.60, 9,  'hot',         40, true,  0.08),
    (p_user_id, 'interested',         0.45, 8,  'hot',         35, true,  0.5),
    (p_user_id, 'hot_lead',           0.40, 8,  'hot',         35, true,  0.5),
    (p_user_id, 'callback',           0.35, 8,  'callback_set', 30, false, null),
    (p_user_id, 'callback_requested', 0.35, 8,  'callback_set', 30, false, null),
    (p_user_id, 'completed',          0.15, 6,  'engaged',     15, false, 1),
    (p_user_id, 'answered',           0.12, 6,  'engaged',     10, false, 1),
    (p_user_id, 'contacted',          0.10, 5,  'engaged',     5,  false, 4),
    (p_user_id, 'left_voicemail',     0.08, 4,  'attempting',  0,  false, 4),
    (p_user_id, 'voicemail',          0.08, 4,  'attempting',  0,  false, 4),
    (p_user_id, 'no_answer',          0.05, 3,  'attempting',  -5, false, null),
    (p_user_id, 'busy',               0.04, 3,  'attempting',  -5, false, null),
    (p_user_id, 'failed',             0.02, 2,  'attempting',  -10, false, null),
    (p_user_id, 'not_interested',     0.01, 1,  'closed_lost', -50, false, null),
    (p_user_id, 'dnc',                0.00, 1,  'closed_lost', -100, false, null),
    (p_user_id, 'wrong_number',       0.00, 1,  'closed_lost', -100, false, null),
    (p_user_id, 'disconnected',       0.00, 1,  'closed_lost', -100, false, null);
  GET DIAGNOSTICS seeded = ROW_COUNT;
  RETURN seeded;
END;
$$;

-- 2. LEAD COST TRACKING on lead_journey_state
DO $$
BEGIN
  ALTER TABLE lead_journey_state ADD COLUMN IF NOT EXISTS total_cost_cents INTEGER DEFAULT 0;
  ALTER TABLE lead_journey_state ADD COLUMN IF NOT EXISTS call_cost_cents INTEGER DEFAULT 0;
  ALTER TABLE lead_journey_state ADD COLUMN IF NOT EXISTS sms_cost_cents INTEGER DEFAULT 0;
  ALTER TABLE lead_journey_state ADD COLUMN IF NOT EXISTS estimated_value_cents INTEGER DEFAULT 0;
  ALTER TABLE lead_journey_state ADD COLUMN IF NOT EXISTS roi_score NUMERIC(8,2) DEFAULT 0;
  ALTER TABLE lead_journey_state ADD COLUMN IF NOT EXISTS last_disposition TEXT;
  ALTER TABLE lead_journey_state ADD COLUMN IF NOT EXISTS campaign_type TEXT DEFAULT 'cold_outreach';
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

-- 3. TRANSCRIPT INTENT SIGNALS
CREATE TABLE IF NOT EXISTS lead_intent_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL,
  call_id UUID,
  timeline TEXT DEFAULT 'unknown',
  budget_mentioned BOOLEAN DEFAULT false,
  budget_range TEXT,
  is_decision_maker BOOLEAN DEFAULT true,
  decision_maker_name TEXT,
  buying_signals JSONB DEFAULT '[]',
  objections JSONB DEFAULT '[]',
  questions_asked JSONB DEFAULT '[]',
  pain_points JSONB DEFAULT '[]',
  specific_dates_mentioned JSONB DEFAULT '[]',
  competitor_mentions JSONB DEFAULT '[]',
  call_interest_score INTEGER DEFAULT 5 CHECK (call_interest_score BETWEEN 1 AND 10),
  llm_reasoning TEXT,
  model_used TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intent_signals_lead ON lead_intent_signals(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_intent_signals_user ON lead_intent_signals(user_id, created_at DESC);

ALTER TABLE lead_intent_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own intent signals" ON lead_intent_signals
  FOR ALL USING (auth.uid() = user_id);

-- 4. CAMPAIGN TYPE ON PLAYBOOK
DO $$
BEGIN
  ALTER TABLE followup_playbook ADD COLUMN IF NOT EXISTS campaign_type TEXT DEFAULT 'all';
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

-- 5. NUMBER HEALTH METRICS
CREATE TABLE IF NOT EXISTS number_health_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  phone_number_id UUID,
  calls_last_hour INTEGER NOT NULL DEFAULT 0,
  calls_last_24h INTEGER NOT NULL DEFAULT 0,
  calls_last_7d INTEGER NOT NULL DEFAULT 0,
  answer_rate_24h NUMERIC(5,4) DEFAULT 0,
  answer_rate_7d NUMERIC(5,4) DEFAULT 0,
  answer_rate_30d NUMERIC(5,4) DEFAULT 0,
  voicemail_rate_24h NUMERIC(5,4) DEFAULT 0,
  predicted_spam_risk NUMERIC(5,4) DEFAULT 0,
  spam_risk_factors JSONB DEFAULT '{}',
  recommended_rest_until TIMESTAMPTZ,
  max_safe_daily_calls INTEGER DEFAULT 100,
  health_score INTEGER DEFAULT 100 CHECK (health_score BETWEEN 0 AND 100),
  last_calculated TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, phone_number)
);

ALTER TABLE number_health_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own number health" ON number_health_metrics
  FOR ALL USING (auth.uid() = user_id);

-- Number health recalculation function
CREATE OR REPLACE FUNCTION recalculate_number_health(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  updated_count INTEGER := 0;
  rec RECORD;
  h1_calls INTEGER;
  h24_calls INTEGER;
  d7_calls INTEGER;
  h24_answered INTEGER;
  d7_answered INTEGER;
  d30_answered INTEGER;
  d30_total INTEGER;
  h24_vm INTEGER;
  spam_risk NUMERIC;
  health INTEGER;
  safe_daily INTEGER;
  rest_until TIMESTAMPTZ;
BEGIN
  FOR rec IN
    SELECT pn.id, pn.phone_number
    FROM phone_numbers pn
    WHERE pn.user_id = p_user_id AND pn.status = 'active'
  LOOP
    SELECT
      COUNT(*) FILTER (WHERE cl.created_at > now() - INTERVAL '1 hour'),
      COUNT(*) FILTER (WHERE cl.created_at > now() - INTERVAL '24 hours'),
      COUNT(*) FILTER (WHERE cl.created_at > now() - INTERVAL '7 days'),
      COUNT(*) FILTER (WHERE cl.created_at > now() - INTERVAL '24 hours' AND cl.outcome IN ('completed','answered','appointment_set','interested','callback')),
      COUNT(*) FILTER (WHERE cl.created_at > now() - INTERVAL '7 days' AND cl.outcome IN ('completed','answered','appointment_set','interested','callback')),
      COUNT(*) FILTER (WHERE cl.created_at > now() - INTERVAL '30 days' AND cl.outcome IN ('completed','answered','appointment_set','interested','callback')),
      COUNT(*) FILTER (WHERE cl.created_at > now() - INTERVAL '30 days'),
      COUNT(*) FILTER (WHERE cl.created_at > now() - INTERVAL '24 hours' AND cl.outcome IN ('voicemail','left_voicemail'))
    INTO h1_calls, h24_calls, d7_calls, h24_answered, d7_answered, d30_answered, d30_total, h24_vm
    FROM call_logs cl
    WHERE cl.caller_id = rec.phone_number
      AND cl.user_id = p_user_id;

    spam_risk := 0;
    IF h24_calls > 80 THEN spam_risk := spam_risk + 0.3; END IF;
    IF h24_calls > 50 THEN spam_risk := spam_risk + 0.15; END IF;
    IF h1_calls > 20 THEN spam_risk := spam_risk + 0.2; END IF;
    IF h24_calls > 0 AND (h24_answered::NUMERIC / h24_calls) < 0.05 THEN spam_risk := spam_risk + 0.25; END IF;
    IF h24_calls > 0 AND (h24_vm::NUMERIC / h24_calls) > 0.9 THEN spam_risk := spam_risk + 0.1; END IF;
    spam_risk := LEAST(1.0, spam_risk);

    health := 100;
    health := health - LEAST(40, h24_calls / 2);
    health := health - LEAST(30, (spam_risk * 30)::INTEGER);
    IF d7_calls > 0 AND (d7_answered::NUMERIC / d7_calls) < 0.05 THEN
      health := health - 20;
    END IF;
    health := GREATEST(0, health);

    safe_daily := CASE
      WHEN spam_risk > 0.7 THEN 0
      WHEN spam_risk > 0.5 THEN 20
      WHEN spam_risk > 0.3 THEN 50
      WHEN spam_risk > 0.15 THEN 80
      ELSE 100
    END;

    rest_until := CASE
      WHEN health < 20 THEN now() + INTERVAL '48 hours'
      WHEN health < 40 THEN now() + INTERVAL '24 hours'
      WHEN health < 60 THEN now() + INTERVAL '12 hours'
      ELSE NULL
    END;

    INSERT INTO number_health_metrics (
      user_id, phone_number, phone_number_id,
      calls_last_hour, calls_last_24h, calls_last_7d,
      answer_rate_24h, answer_rate_7d, answer_rate_30d,
      voicemail_rate_24h,
      predicted_spam_risk, spam_risk_factors,
      recommended_rest_until, max_safe_daily_calls,
      health_score, last_calculated
    ) VALUES (
      p_user_id, rec.phone_number, rec.id,
      h1_calls, h24_calls, d7_calls,
      CASE WHEN h24_calls > 0 THEN h24_answered::NUMERIC / h24_calls ELSE 0 END,
      CASE WHEN d7_calls > 0 THEN d7_answered::NUMERIC / d7_calls ELSE 0 END,
      CASE WHEN d30_total > 0 THEN d30_answered::NUMERIC / d30_total ELSE 0 END,
      CASE WHEN h24_calls > 0 THEN h24_vm::NUMERIC / h24_calls ELSE 0 END,
      spam_risk,
      jsonb_build_object(
        'velocity_24h', h24_calls,
        'velocity_1h', h1_calls,
        'answer_rate_24h', CASE WHEN h24_calls > 0 THEN ROUND(h24_answered::NUMERIC / h24_calls, 4) ELSE 0 END,
        'voicemail_rate_24h', CASE WHEN h24_calls > 0 THEN ROUND(h24_vm::NUMERIC / h24_calls, 4) ELSE 0 END
      ),
      rest_until, safe_daily,
      health, now()
    )
    ON CONFLICT (user_id, phone_number) DO UPDATE SET
      calls_last_hour = EXCLUDED.calls_last_hour,
      calls_last_24h = EXCLUDED.calls_last_24h,
      calls_last_7d = EXCLUDED.calls_last_7d,
      answer_rate_24h = EXCLUDED.answer_rate_24h,
      answer_rate_7d = EXCLUDED.answer_rate_7d,
      answer_rate_30d = EXCLUDED.answer_rate_30d,
      voicemail_rate_24h = EXCLUDED.voicemail_rate_24h,
      predicted_spam_risk = EXCLUDED.predicted_spam_risk,
      spam_risk_factors = EXCLUDED.spam_risk_factors,
      recommended_rest_until = EXCLUDED.recommended_rest_until,
      max_safe_daily_calls = EXCLUDED.max_safe_daily_calls,
      health_score = EXCLUDED.health_score,
      last_calculated = now();

    updated_count := updated_count + 1;
  END LOOP;
  RETURN updated_count;
END;
$$;

-- 6. PLAYBOOK PERFORMANCE TRACKING
CREATE TABLE IF NOT EXISTS playbook_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES followup_playbook(id) ON DELETE CASCADE,
  rule_name TEXT NOT NULL,
  times_fired INTEGER NOT NULL DEFAULT 0,
  led_to_response INTEGER NOT NULL DEFAULT 0,
  led_to_positive_response INTEGER NOT NULL DEFAULT 0,
  led_to_appointment INTEGER NOT NULL DEFAULT 0,
  led_to_no_response INTEGER NOT NULL DEFAULT 0,
  avg_response_time_hours NUMERIC(8,2),
  response_rate NUMERIC(5,4) DEFAULT 0,
  appointment_rate NUMERIC(5,4) DEFAULT 0,
  performance_score NUMERIC(8,4) DEFAULT 0,
  last_calculated TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, rule_id)
);

ALTER TABLE playbook_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own playbook performance" ON playbook_performance
  FOR ALL USING (auth.uid() = user_id);

-- 7. FUNNEL SNAPSHOTS
CREATE TABLE IF NOT EXISTS funnel_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  total_leads INTEGER DEFAULT 0,
  fresh_count INTEGER DEFAULT 0,
  attempting_count INTEGER DEFAULT 0,
  engaged_count INTEGER DEFAULT 0,
  hot_count INTEGER DEFAULT 0,
  nurturing_count INTEGER DEFAULT 0,
  stalled_count INTEGER DEFAULT 0,
  callback_count INTEGER DEFAULT 0,
  booked_count INTEGER DEFAULT 0,
  won_count INTEGER DEFAULT 0,
  lost_count INTEGER DEFAULT 0,
  calls_made INTEGER DEFAULT 0,
  sms_sent INTEGER DEFAULT 0,
  appointments_booked INTEGER DEFAULT 0,
  total_spend_cents INTEGER DEFAULT 0,
  cost_per_appointment_cents INTEGER DEFAULT 0,
  cost_per_conversation_cents INTEGER DEFAULT 0,
  call_to_conversation_rate NUMERIC(5,4) DEFAULT 0,
  conversation_to_appointment_rate NUMERIC(5,4) DEFAULT 0,
  overall_conversion_rate NUMERIC(5,4) DEFAULT 0,
  strategic_analysis TEXT,
  recommendations JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, snapshot_date)
);

ALTER TABLE funnel_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own funnel snapshots" ON funnel_snapshots
  FOR ALL USING (auth.uid() = user_id);

-- 8. PLAYBOOK OPTIMIZATION LOG
CREATE TABLE IF NOT EXISTS playbook_optimization_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  optimization_type TEXT NOT NULL,
  rule_id UUID REFERENCES followup_playbook(id),
  rule_name TEXT,
  before_value JSONB,
  after_value JSONB,
  reasoning TEXT NOT NULL,
  data_basis JSONB,
  model_used TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE playbook_optimization_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own optimization log" ON playbook_optimization_log
  FOR ALL USING (auth.uid() = user_id);

-- Add source column to ai_action_queue if missing
DO $$
BEGIN
  ALTER TABLE ai_action_queue ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'autonomous_engine';
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;
