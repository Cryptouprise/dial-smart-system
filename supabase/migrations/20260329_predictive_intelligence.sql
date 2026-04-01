-- ============================================================================
-- Migration: Predictive Intelligence & ML Learning System
-- Date: 2026-03-29
--
-- Adds:
-- 1. ML model storage and versioning
-- 2. Lead conversion probability tracking
-- 3. Churn risk scoring
-- 4. Message effectiveness prediction
-- 5. Statistical significance functions
-- 6. Segment ROI tracking for budget optimization
-- ============================================================================

-- ============================================================================
-- 1. ML MODEL REGISTRY: Track trained models and their accuracy
-- ============================================================================

CREATE TABLE IF NOT EXISTS ml_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),

  model_type TEXT NOT NULL CHECK (model_type IN (
    'lead_conversion',     -- P(lead will convert)
    'churn_risk',          -- P(lead will never respond again)
    'contact_timing',      -- P(lead will answer if called at hour X)
    'message_effectiveness', -- P(message variant will get reply)
    'lead_scoring_weights'  -- Calibrated scoring weights
  )),

  -- Model data (coefficients for logistic regression)
  coefficients JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- { "intercept": -2.1, "features": { "recency_days": -0.05, "total_calls": 0.12, ... } }

  -- Training metadata
  training_samples INTEGER DEFAULT 0,
  training_positives INTEGER DEFAULT 0,
  training_accuracy NUMERIC(5,4) DEFAULT 0,  -- 0.0 to 1.0
  auc_score NUMERIC(5,4) DEFAULT 0,          -- Area Under ROC Curve
  precision_score NUMERIC(5,4) DEFAULT 0,
  recall_score NUMERIC(5,4) DEFAULT 0,

  -- Online performance (how well predictions match reality)
  predictions_made INTEGER DEFAULT 0,
  correct_predictions INTEGER DEFAULT 0,
  online_accuracy NUMERIC(5,4) DEFAULT 0,

  -- Versioning
  version INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  superseded_by UUID REFERENCES ml_models(id),

  trained_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id, model_type, version)
);

ALTER TABLE ml_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own models" ON ml_models
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- 2. LEAD PREDICTIONS: Per-lead probability scores
-- ============================================================================

CREATE TABLE IF NOT EXISTS lead_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  model_id UUID REFERENCES ml_models(id),

  -- Predictions
  conversion_probability NUMERIC(5,4) DEFAULT 0,    -- P(will convert)
  churn_risk NUMERIC(5,4) DEFAULT 0,                 -- P(will never respond)
  optimal_contact_hour INTEGER,                       -- Best hour to call (0-23)
  optimal_contact_day INTEGER,                        -- Best day (0=Sun, 6=Sat)
  expected_value_cents INTEGER DEFAULT 0,             -- EV = P(convert) × deal_value - cost
  roi_score NUMERIC(8,4) DEFAULT 0,                   -- expected_value / cost_so_far

  -- Feature snapshot (what the model saw when making prediction)
  feature_snapshot JSONB DEFAULT '{}'::jsonb,
  -- { recency_days, total_calls, total_sms, interest_level, intent_timeline, ... }

  -- Outcome tracking (for model retraining)
  actual_outcome TEXT,  -- 'converted', 'churned', 'active', null=pending
  outcome_recorded_at TIMESTAMPTZ,

  -- Segment assignment
  predicted_segment TEXT, -- 'high_value', 'nurture', 'at_risk', 'low_priority', 'reactivate'

  predicted_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT now() + INTERVAL '7 days',

  UNIQUE(user_id, lead_id)  -- One active prediction per lead
);

ALTER TABLE lead_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own predictions" ON lead_predictions
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- 3. SEGMENT ROI: Track return on investment per lead segment
-- ============================================================================

CREATE TABLE IF NOT EXISTS segment_roi_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),

  -- Segment definition
  segment_name TEXT NOT NULL,
  segment_criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- { "source": "facebook", "campaign_type": "cold_outreach", "journey_stage": "attempting" }

  -- Performance
  total_leads INTEGER DEFAULT 0,
  total_spend_cents INTEGER DEFAULT 0,
  total_calls INTEGER DEFAULT 0,
  total_sms INTEGER DEFAULT 0,
  appointments_set INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,

  -- ROI metrics
  cost_per_appointment_cents INTEGER DEFAULT 0,
  cost_per_conversion_cents INTEGER DEFAULT 0,
  roi_ratio NUMERIC(8,4) DEFAULT 0,  -- revenue / cost
  conversion_rate NUMERIC(5,4) DEFAULT 0,

  -- Recommendations
  recommended_budget_pct NUMERIC(5,2) DEFAULT 0,  -- % of budget to allocate
  recommended_channel TEXT,  -- 'call', 'sms', 'both'
  recommended_pacing INTEGER, -- calls per minute for this segment

  -- Trend
  roi_trend TEXT DEFAULT 'stable' CHECK (roi_trend IN ('improving', 'stable', 'declining')),
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,

  calculated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id, segment_name, period_start)
);

ALTER TABLE segment_roi_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own segment ROI" ON segment_roi_metrics
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- 4. CHURN RISK EVENTS: Track when leads are flagged as at-risk
-- ============================================================================

CREATE TABLE IF NOT EXISTS churn_risk_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,

  risk_score NUMERIC(5,4) NOT NULL,  -- 0.0 to 1.0
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),

  -- What triggered the risk assessment
  trigger_reason TEXT NOT NULL,
  -- 'no_response_7d', 'declining_interest', 'negative_sentiment', 'callback_missed', etc.

  -- Signals that contributed
  risk_signals JSONB DEFAULT '{}'::jsonb,
  -- { days_since_response, declining_sentiment, missed_callbacks, total_no_answers }

  -- What action was taken
  action_taken TEXT,
  -- 'reengagement_sms', 'priority_callback', 'nurture_sequence', 'none'
  action_result TEXT,  -- 'responded', 'no_response', 'converted', 'lost'

  detected_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

ALTER TABLE churn_risk_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own churn events" ON churn_risk_events
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- 5. MESSAGE EFFECTIVENESS: Predict which messages work for which segments
-- ============================================================================

CREATE TABLE IF NOT EXISTS message_effectiveness (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),

  -- Message context
  message_type TEXT NOT NULL CHECK (message_type IN ('sms', 'ai_sms', 'opener', 'voicemail')),
  message_content TEXT,
  message_hash TEXT,  -- For deduplication

  -- Segment it works best for
  effective_for_stage TEXT,       -- journey stage
  effective_for_source TEXT,      -- lead source
  effective_for_disposition TEXT, -- after this disposition
  effective_for_interest_range INT4RANGE, -- interest level range

  -- Performance data
  times_sent INTEGER DEFAULT 0,
  replies INTEGER DEFAULT 0,
  positive_replies INTEGER DEFAULT 0,
  appointments INTEGER DEFAULT 0,
  opt_outs INTEGER DEFAULT 0,

  -- Effectiveness score (computed)
  effectiveness_score NUMERIC(5,4) DEFAULT 0,
  -- Formula: (positive_replies * 2 + appointments * 5 - opt_outs * 3) / times_sent

  -- Statistical significance
  is_significant BOOLEAN DEFAULT false,
  p_value NUMERIC(6,5),
  confidence_level NUMERIC(5,4) DEFAULT 0,
  sample_size_needed INTEGER,  -- How many more sends needed for significance

  calculated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id, message_hash, effective_for_stage)
);

ALTER TABLE message_effectiveness ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own message effectiveness" ON message_effectiveness
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- 6. STATISTICAL FUNCTIONS
-- ============================================================================

-- Chi-square test for independence (2x2 contingency table)
-- Returns p-value approximation using Wilson-Hilferty transformation
CREATE OR REPLACE FUNCTION chi_square_2x2(
  a INTEGER,  -- group1 success
  b INTEGER,  -- group1 failure
  c INTEGER,  -- group2 success
  d INTEGER   -- group2 failure
)
RETURNS NUMERIC LANGUAGE plpgsql AS $$
DECLARE
  n INTEGER;
  chi2 NUMERIC;
  p_approx NUMERIC;
BEGIN
  n := a + b + c + d;
  IF n = 0 THEN RETURN 1.0; END IF;

  -- Yates' continuity correction for small samples
  chi2 := (n * power(abs(a * d - b * c) - n / 2.0, 2)) /
          ((a + b)::NUMERIC * (c + d)::NUMERIC * (a + c)::NUMERIC * (b + d)::NUMERIC);

  -- Approximate p-value from chi2 with 1 df
  -- Using the relationship: p ≈ exp(-0.5 * chi2) for chi2 > 3
  IF chi2 < 0.001 THEN
    RETURN 1.0;
  ELSIF chi2 > 10 THEN
    RETURN 0.001;  -- Highly significant
  ELSE
    p_approx := exp(-0.5 * chi2);
    RETURN GREATEST(0.001, LEAST(1.0, p_approx));
  END IF;
END;
$$;

-- Logistic sigmoid function
CREATE OR REPLACE FUNCTION sigmoid(x NUMERIC)
RETURNS NUMERIC LANGUAGE SQL IMMUTABLE AS $$
  SELECT 1.0 / (1.0 + exp(-LEAST(GREATEST(x, -500), 500)));
$$;

-- Predict conversion probability using stored model coefficients
CREATE OR REPLACE FUNCTION predict_lead_conversion(
  p_user_id UUID,
  p_lead_id UUID
)
RETURNS NUMERIC LANGUAGE plpgsql AS $$
DECLARE
  v_model RECORD;
  v_lead RECORD;
  v_journey RECORD;
  v_intent RECORD;
  v_logit NUMERIC := 0;
  v_coeff JSONB;
BEGIN
  -- Get active conversion model
  SELECT * INTO v_model FROM ml_models
  WHERE user_id = p_user_id AND model_type = 'lead_conversion' AND is_active = true
  ORDER BY version DESC LIMIT 1;

  IF v_model IS NULL THEN RETURN 0.5; END IF; -- No model, return 50%

  v_coeff := v_model.coefficients;

  -- Get lead data
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  SELECT * INTO v_journey FROM lead_journey_state WHERE lead_id = p_lead_id;
  SELECT * INTO v_intent FROM lead_intent_signals
    WHERE lead_id = p_lead_id ORDER BY extracted_at DESC LIMIT 1;

  -- Start with intercept
  v_logit := COALESCE((v_coeff->>'intercept')::NUMERIC, 0);

  -- Add feature contributions (MUST match TypeScript normalization in trainConversionModel)
  -- recency_days: normalized to 0-1 by dividing by 90 and capping
  v_logit := v_logit + COALESCE((v_coeff->'features'->>'recency_days')::NUMERIC, 0) *
    LEAST(COALESCE(EXTRACT(EPOCH FROM now() - COALESCE(v_journey.last_touch_at, v_lead.created_at)) / 86400, 30) / 90.0, 1.0);

  -- total_calls: normalized to 0-1 by dividing by 10 and capping
  v_logit := v_logit + COALESCE((v_coeff->'features'->>'total_calls')::NUMERIC, 0) *
    LEAST(COALESCE(v_journey.total_calls, 0)::NUMERIC / 10.0, 1.0);

  -- interest_level: normalized to 0-1 by dividing by 10 (scale is 1-10)
  v_logit := v_logit + COALESCE((v_coeff->'features'->>'interest_level')::NUMERIC, 0) *
    LEAST(COALESCE(v_journey.interest_level, 0)::NUMERIC / 10.0, 1.0);

  -- engagement_score: normalized to 0-1 by dividing by 100
  v_logit := v_logit + COALESCE((v_coeff->'features'->>'engagement_score')::NUMERIC, 0) *
    LEAST(COALESCE(v_journey.engagement_score, 0)::NUMERIC / 100.0, 1.0);

  v_logit := v_logit + COALESCE((v_coeff->'features'->>'has_intent_timeline')::NUMERIC, 0) *
    CASE WHEN v_intent.intent_timeline IS NOT NULL THEN 1 ELSE 0 END;

  v_logit := v_logit + COALESCE((v_coeff->'features'->>'is_decision_maker')::NUMERIC, 0) *
    CASE WHEN v_intent.is_decision_maker THEN 1 ELSE 0 END;

  v_logit := v_logit + COALESCE((v_coeff->'features'->>'sentiment_score')::NUMERIC, 0) *
    COALESCE(v_journey.sentiment_score, 0.5);

  RETURN sigmoid(v_logit);
END;
$$;

-- ============================================================================
-- 7. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_ml_models_active ON ml_models(user_id, model_type, is_active)
  WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_lead_predictions_segment ON lead_predictions(user_id, predicted_segment, conversion_probability DESC);
CREATE INDEX IF NOT EXISTS idx_lead_predictions_expiry ON lead_predictions(expires_at)
  WHERE actual_outcome IS NULL;
CREATE INDEX IF NOT EXISTS idx_churn_risk_active ON churn_risk_events(user_id, risk_level, detected_at)
  WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_segment_roi_user ON segment_roi_metrics(user_id, calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_effectiveness_lookup ON message_effectiveness(user_id, message_type, effective_for_stage);
