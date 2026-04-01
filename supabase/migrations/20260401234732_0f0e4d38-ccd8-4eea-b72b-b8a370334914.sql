-- ML Model Registry
CREATE TABLE IF NOT EXISTS ml_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  model_type TEXT NOT NULL CHECK (model_type IN (
    'lead_conversion', 'churn_risk', 'contact_timing', 'message_effectiveness', 'lead_scoring_weights'
  )),
  coefficients JSONB NOT NULL DEFAULT '{}'::jsonb,
  training_samples INTEGER DEFAULT 0,
  training_positives INTEGER DEFAULT 0,
  training_accuracy NUMERIC(5,4) DEFAULT 0,
  auc_score NUMERIC(5,4) DEFAULT 0,
  precision_score NUMERIC(5,4) DEFAULT 0,
  recall_score NUMERIC(5,4) DEFAULT 0,
  predictions_made INTEGER DEFAULT 0,
  correct_predictions INTEGER DEFAULT 0,
  online_accuracy NUMERIC(5,4) DEFAULT 0,
  version INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  superseded_by UUID REFERENCES ml_models(id),
  trained_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, model_type, version)
);
ALTER TABLE ml_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own models" ON ml_models FOR ALL USING (auth.uid() = user_id);

-- Lead Predictions
CREATE TABLE IF NOT EXISTS lead_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  model_id UUID REFERENCES ml_models(id),
  conversion_probability NUMERIC(5,4) DEFAULT 0,
  churn_risk NUMERIC(5,4) DEFAULT 0,
  optimal_contact_hour INTEGER,
  optimal_contact_day INTEGER,
  expected_value_cents INTEGER DEFAULT 0,
  roi_score NUMERIC(8,4) DEFAULT 0,
  feature_snapshot JSONB DEFAULT '{}'::jsonb,
  actual_outcome TEXT,
  outcome_recorded_at TIMESTAMPTZ,
  predicted_segment TEXT,
  predicted_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT now() + INTERVAL '7 days',
  UNIQUE(user_id, lead_id)
);
ALTER TABLE lead_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own predictions" ON lead_predictions FOR ALL USING (auth.uid() = user_id);

-- Segment ROI Metrics
CREATE TABLE IF NOT EXISTS segment_roi_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  segment_name TEXT NOT NULL,
  segment_criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_leads INTEGER DEFAULT 0,
  total_spend_cents INTEGER DEFAULT 0,
  total_calls INTEGER DEFAULT 0,
  total_sms INTEGER DEFAULT 0,
  appointments_set INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  cost_per_appointment_cents INTEGER DEFAULT 0,
  cost_per_conversion_cents INTEGER DEFAULT 0,
  roi_ratio NUMERIC(8,4) DEFAULT 0,
  conversion_rate NUMERIC(5,4) DEFAULT 0,
  recommended_budget_pct NUMERIC(5,2) DEFAULT 0,
  recommended_channel TEXT,
  recommended_pacing INTEGER,
  roi_trend TEXT DEFAULT 'stable' CHECK (roi_trend IN ('improving', 'stable', 'declining')),
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  calculated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, segment_name, period_start)
);
ALTER TABLE segment_roi_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own segment ROI" ON segment_roi_metrics FOR ALL USING (auth.uid() = user_id);

-- Churn Risk Events
CREATE TABLE IF NOT EXISTS churn_risk_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  risk_score NUMERIC(5,4) NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  trigger_reason TEXT NOT NULL,
  risk_signals JSONB DEFAULT '{}'::jsonb,
  action_taken TEXT,
  action_result TEXT,
  detected_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
ALTER TABLE churn_risk_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own churn events" ON churn_risk_events FOR ALL USING (auth.uid() = user_id);

-- Message Effectiveness
CREATE TABLE IF NOT EXISTS message_effectiveness (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  message_type TEXT NOT NULL CHECK (message_type IN ('sms', 'ai_sms', 'opener', 'voicemail')),
  message_content TEXT,
  message_hash TEXT,
  effective_for_stage TEXT,
  effective_for_source TEXT,
  effective_for_disposition TEXT,
  effective_for_interest_range INT4RANGE,
  times_sent INTEGER DEFAULT 0,
  replies INTEGER DEFAULT 0,
  positive_replies INTEGER DEFAULT 0,
  appointments INTEGER DEFAULT 0,
  opt_outs INTEGER DEFAULT 0,
  effectiveness_score NUMERIC(5,4) DEFAULT 0,
  is_significant BOOLEAN DEFAULT false,
  p_value NUMERIC(6,5),
  confidence_level NUMERIC(5,4) DEFAULT 0,
  sample_size_needed INTEGER,
  calculated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, message_hash, effective_for_stage)
);
ALTER TABLE message_effectiveness ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own message effectiveness" ON message_effectiveness FOR ALL USING (auth.uid() = user_id);

-- Chi-square test function
CREATE OR REPLACE FUNCTION chi_square_2x2(a INTEGER, b INTEGER, c INTEGER, d INTEGER)
RETURNS NUMERIC LANGUAGE plpgsql AS $$
DECLARE n INTEGER; chi2 NUMERIC; p_approx NUMERIC;
BEGIN
  n := a + b + c + d;
  IF n = 0 THEN RETURN 1.0; END IF;
  chi2 := (n * power(abs(a * d - b * c) - n / 2.0, 2)) / ((a + b)::NUMERIC * (c + d)::NUMERIC * (a + c)::NUMERIC * (b + d)::NUMERIC);
  IF chi2 < 0.001 THEN RETURN 1.0;
  ELSIF chi2 > 10 THEN RETURN 0.001;
  ELSE p_approx := exp(-0.5 * chi2); RETURN GREATEST(0.001, LEAST(1.0, p_approx));
  END IF;
END;
$$;

-- Sigmoid function
CREATE OR REPLACE FUNCTION sigmoid(x NUMERIC) RETURNS NUMERIC LANGUAGE SQL IMMUTABLE AS $$
  SELECT 1.0 / (1.0 + exp(-LEAST(GREATEST(x, -500), 500)));
$$;

-- Predict lead conversion using stored model
CREATE OR REPLACE FUNCTION predict_lead_conversion(p_user_id UUID, p_lead_id UUID)
RETURNS NUMERIC LANGUAGE plpgsql AS $$
DECLARE v_model RECORD; v_lead RECORD; v_journey RECORD; v_intent RECORD; v_logit NUMERIC := 0; v_coeff JSONB;
BEGIN
  SELECT * INTO v_model FROM ml_models WHERE user_id = p_user_id AND model_type = 'lead_conversion' AND is_active = true ORDER BY version DESC LIMIT 1;
  IF v_model IS NULL THEN RETURN 0.5; END IF;
  v_coeff := v_model.coefficients;
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  SELECT * INTO v_journey FROM lead_journey_state WHERE lead_id = p_lead_id;
  SELECT * INTO v_intent FROM lead_intent_signals WHERE lead_id = p_lead_id ORDER BY extracted_at DESC LIMIT 1;
  v_logit := COALESCE((v_coeff->>'intercept')::NUMERIC, 0);
  v_logit := v_logit + COALESCE((v_coeff->'features'->>'recency_days')::NUMERIC, 0) * LEAST(COALESCE(EXTRACT(EPOCH FROM now() - COALESCE(v_journey.last_touch_at, v_lead.created_at)) / 86400, 30) / 90.0, 1.0);
  v_logit := v_logit + COALESCE((v_coeff->'features'->>'total_calls')::NUMERIC, 0) * LEAST(COALESCE(v_journey.total_calls, 0)::NUMERIC / 10.0, 1.0);
  v_logit := v_logit + COALESCE((v_coeff->'features'->>'interest_level')::NUMERIC, 0) * LEAST(COALESCE(v_journey.interest_level, 0)::NUMERIC / 10.0, 1.0);
  v_logit := v_logit + COALESCE((v_coeff->'features'->>'engagement_score')::NUMERIC, 0) * LEAST(COALESCE(v_journey.engagement_score, 0)::NUMERIC / 100.0, 1.0);
  v_logit := v_logit + COALESCE((v_coeff->'features'->>'has_intent_timeline')::NUMERIC, 0) * CASE WHEN v_intent.intent_timeline IS NOT NULL THEN 1 ELSE 0 END;
  v_logit := v_logit + COALESCE((v_coeff->'features'->>'is_decision_maker')::NUMERIC, 0) * CASE WHEN v_intent.is_decision_maker THEN 1 ELSE 0 END;
  v_logit := v_logit + COALESCE((v_coeff->'features'->>'sentiment_score')::NUMERIC, 0) * COALESCE(v_journey.sentiment_score, 0.5);
  RETURN sigmoid(v_logit);
END;
$$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ml_models_active ON ml_models(user_id, model_type, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_lead_predictions_segment ON lead_predictions(user_id, predicted_segment, conversion_probability DESC);
CREATE INDEX IF NOT EXISTS idx_lead_predictions_expiry ON lead_predictions(expires_at) WHERE actual_outcome IS NULL;
CREATE INDEX IF NOT EXISTS idx_churn_risk_active ON churn_risk_events(user_id, risk_level, detected_at) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_segment_roi_user ON segment_roi_metrics(user_id, calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_effectiveness_lookup ON message_effectiveness(user_id, message_type, effective_for_stage);