-- ============================================================================
-- CAMPAIGN STRATEGIST - February 10, 2026
--
-- Takes the AI from 8/10 to 10/10:
--   9/10: Campaign Resource Allocator - Plans entire days like a war room
--   10/10: Strategic Pattern Detective - Discovers patterns humans miss
-- ============================================================================

-- ============================================================================
-- 1. DAILY BATTLE PLANS
-- The AI's daily resource allocation: how to spend numbers, budget, time
-- across competing priorities (callbacks, hot leads, cold, reactivation)
-- ============================================================================
CREATE TABLE IF NOT EXISTS daily_battle_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_date DATE NOT NULL,
  -- Resource inventory at plan time
  total_phone_numbers INTEGER DEFAULT 0,
  healthy_numbers INTEGER DEFAULT 0,
  resting_numbers INTEGER DEFAULT 0,
  estimated_budget_cents INTEGER DEFAULT 0,
  -- Lead inventory by tier
  callbacks_pending INTEGER DEFAULT 0,
  hot_leads INTEGER DEFAULT 0,
  engaged_leads INTEGER DEFAULT 0,
  stalled_leads INTEGER DEFAULT 0,
  fresh_leads INTEGER DEFAULT 0,
  nurturing_leads INTEGER DEFAULT 0,
  -- Allocation decisions
  budget_for_callbacks_pct INTEGER DEFAULT 0,
  budget_for_hot_pct INTEGER DEFAULT 0,
  budget_for_engaged_pct INTEGER DEFAULT 0,
  budget_for_cold_pct INTEGER DEFAULT 0,
  budget_for_reactivation_pct INTEGER DEFAULT 0,
  -- Number allocation
  numbers_for_hot_leads INTEGER DEFAULT 0,
  numbers_for_cold_leads INTEGER DEFAULT 0,
  numbers_for_reactivation INTEGER DEFAULT 0,
  -- Pace recommendations per time block
  morning_pace INTEGER DEFAULT 30,
  midday_pace INTEGER DEFAULT 50,
  afternoon_pace INTEGER DEFAULT 40,
  evening_pace INTEGER DEFAULT 20,
  -- LLM-generated strategic plan (the actual "battle plan")
  executive_summary TEXT,
  priority_order JSONB DEFAULT '[]',   -- ["callbacks","hot","engaged","stalled","fresh"]
  time_blocks JSONB DEFAULT '[]',      -- [{hour:9, focus:"callbacks", pace:30, numbers:["..."]}]
  risk_factors JSONB DEFAULT '[]',     -- ["3 numbers at spam risk","budget tight"]
  expected_outcomes JSONB DEFAULT '{}', -- {appointments:5, conversations:40, cost_cents:3500}
  -- Plan execution tracking
  plan_status TEXT DEFAULT 'draft' CHECK (plan_status IN ('draft','active','completed','abandoned')),
  adherence_score NUMERIC(5,2),        -- How closely the day followed the plan (0-100)
  actual_outcomes JSONB DEFAULT '{}',  -- Filled at end of day
  -- LLM metadata
  model_used TEXT,
  generation_time_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE(user_id, plan_date)
);

ALTER TABLE daily_battle_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own battle plans" ON daily_battle_plans
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- 2. STRATEGIC INSIGHTS
-- Patterns the AI discovers across time, source, channel, and outcome data
-- These are the "aha" moments: things humans would miss in the data
-- ============================================================================
CREATE TABLE IF NOT EXISTS strategic_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- What was discovered
  insight_type TEXT NOT NULL CHECK (insight_type IN (
    'timing_pattern',           -- "Thursday 2pm converts 3x Monday 10am"
    'source_channel_correlation', -- "Leads from source X respond better to SMS"
    'attempt_gap_pattern',      -- "3rd attempt after 48h converts better than after 24h"
    'cost_efficiency',          -- "Reactivation leads cost 60% less per appointment"
    'number_effectiveness',     -- "Numbers with 555 area code get 2x answer rate"
    'sequence_pattern',         -- "Call→SMS→Wait→Call converts 2x vs Call→Call→Call"
    'objection_pattern',        -- "Leads who mention 'budget' convert if followed up in 4h"
    'seasonal_pattern',         -- "January has 2x conversion vs December"
    'decay_pattern',            -- "Lead value drops 50% after 72h of no contact"
    'cross_campaign'            -- "Running campaigns A and B simultaneously hurts both"
  )),
  -- The insight itself
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  -- Statistical backing
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0.5,  -- 0-1, how confident the AI is
  sample_size INTEGER NOT NULL DEFAULT 0,          -- How many data points
  effect_magnitude NUMERIC(8,4),                   -- How big is the effect (e.g., 3.0 = 3x)
  baseline_rate NUMERIC(5,4),                      -- What's normal
  observed_rate NUMERIC(5,4),                      -- What was observed
  -- Dimensions analyzed
  dimensions JSONB DEFAULT '{}',  -- {day_of_week:"Thursday", hour:14, source:"Facebook", channel:"sms"}
  -- What to do about it
  recommended_action TEXT,
  -- Did we auto-create a rule from this?
  auto_rule_created BOOLEAN DEFAULT false,
  generated_rule_id UUID,
  -- Status
  status TEXT DEFAULT 'new' CHECK (status IN ('new','acknowledged','applied','dismissed','expired')),
  acknowledged_at TIMESTAMPTZ,
  -- Raw data the insight was derived from
  data_basis JSONB,
  model_used TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '30 days')
);

CREATE INDEX IF NOT EXISTS idx_insights_user_type ON strategic_insights(user_id, insight_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_insights_confidence ON strategic_insights(user_id, confidence DESC) WHERE status = 'new';

ALTER TABLE strategic_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own insights" ON strategic_insights
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- 3. INSIGHT-GENERATED RULES
-- When the AI discovers a pattern strong enough, it writes a NEW playbook rule
-- This is the 10/10 feature: the AI creating its own strategies
-- ============================================================================
CREATE TABLE IF NOT EXISTS insight_generated_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  insight_id UUID NOT NULL REFERENCES strategic_insights(id) ON DELETE CASCADE,
  -- What was generated
  rule_type TEXT NOT NULL CHECK (rule_type IN (
    'playbook_rule',     -- New followup_playbook entry
    'timing_override',   -- Change when to call certain leads
    'channel_preference', -- Switch default channel for a segment
    'pace_adjustment',   -- Change pace for specific hours
    'number_assignment'  -- Assign specific numbers to specific lead types
  )),
  -- The actual rule content
  rule_config JSONB NOT NULL,  -- Full rule definition
  -- Link to followup_playbook if created there
  playbook_rule_id UUID REFERENCES followup_playbook(id),
  -- Performance tracking
  times_applied INTEGER DEFAULT 0,
  success_rate NUMERIC(5,4) DEFAULT 0,
  -- Status
  status TEXT DEFAULT 'proposed' CHECK (status IN ('proposed','active','paused','retired')),
  activated_at TIMESTAMPTZ,
  retired_at TIMESTAMPTZ,
  retirement_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE insight_generated_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own generated rules" ON insight_generated_rules
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- 4. STRATEGIC BRIEFINGS
-- Weekly/daily AI-generated summaries of what's happening, what's working,
-- what to change. The AI as a strategic advisor, not just an executor.
-- ============================================================================
CREATE TABLE IF NOT EXISTS strategic_briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  briefing_type TEXT NOT NULL CHECK (briefing_type IN ('daily','weekly','monthly')),
  briefing_date DATE NOT NULL,
  -- The briefing content
  headline TEXT NOT NULL,         -- "Your best week in 3 months"
  executive_summary TEXT NOT NULL, -- 2-3 sentence overview
  -- Key metrics compared to previous period
  metrics_comparison JSONB DEFAULT '{}',
  -- What's working / what isn't
  wins JSONB DEFAULT '[]',        -- ["Thursday campaigns up 40%", "SMS follow-up rule converting at 18%"]
  concerns JSONB DEFAULT '[]',    -- ["3 numbers approaching spam risk", "Cost per appointment up 15%"]
  -- Strategic recommendations
  recommendations JSONB DEFAULT '[]', -- ["Shift 30% of budget from cold to reactivation", "Rest numbers 3,7,12"]
  -- New insights discovered this period
  new_insights_count INTEGER DEFAULT 0,
  top_insight_id UUID REFERENCES strategic_insights(id),
  -- Action items
  action_items JSONB DEFAULT '[]', -- [{action:"increase afternoon pace", priority:"high", reasoning:"..."}]
  -- Metadata
  model_used TEXT,
  period_start DATE,
  period_end DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, briefing_type, briefing_date)
);

ALTER TABLE strategic_briefings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own briefings" ON strategic_briefings
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- 5. NEW AUTONOMOUS SETTINGS COLUMNS
-- ============================================================================
DO $$
BEGIN
  ALTER TABLE autonomous_settings ADD COLUMN IF NOT EXISTS enable_daily_planning BOOLEAN DEFAULT false;
  ALTER TABLE autonomous_settings ADD COLUMN IF NOT EXISTS enable_strategic_insights BOOLEAN DEFAULT false;
  ALTER TABLE autonomous_settings ADD COLUMN IF NOT EXISTS daily_budget_cents INTEGER DEFAULT 50000;  -- $500 default
  ALTER TABLE autonomous_settings ADD COLUMN IF NOT EXISTS auto_create_rules_from_insights BOOLEAN DEFAULT false;
  ALTER TABLE autonomous_settings ADD COLUMN IF NOT EXISTS insight_confidence_threshold NUMERIC(5,4) DEFAULT 0.75;
  ALTER TABLE autonomous_settings ADD COLUMN IF NOT EXISTS briefing_frequency TEXT DEFAULT 'daily' CHECK (briefing_frequency IN ('daily','weekly'));
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

-- ============================================================================
-- 6. EXPAND AI_ACTION_QUEUE SOURCE CHECK
-- ============================================================================
DO $$
BEGIN
  ALTER TABLE ai_action_queue DROP CONSTRAINT IF EXISTS ai_action_queue_source_check;
  ALTER TABLE ai_action_queue ADD CONSTRAINT ai_action_queue_source_check
    CHECK (source IN (
      'autonomous_engine', 'ai_brain', 'ai_assistant', 'manual',
      'journey_engine', 'funnel_intelligence', 'number_health',
      'daily_planner', 'strategic_insight'
    ));
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

-- ============================================================================
-- 7. HELPER VIEW: Cross-dimensional call outcome analysis
-- Used by the strategic pattern detective for fast queries
-- ============================================================================
CREATE OR REPLACE VIEW call_outcome_dimensions AS
SELECT
  cl.user_id,
  cl.id AS call_id,
  cl.lead_id,
  cl.outcome,
  cl.duration,
  cl.sentiment_score,
  cl.created_at,
  EXTRACT(DOW FROM cl.created_at) AS day_of_week,   -- 0=Sun, 1=Mon, ..., 6=Sat
  EXTRACT(HOUR FROM cl.created_at) AS hour_of_day,
  EXTRACT(MONTH FROM cl.created_at) AS month,
  cl.from_number,
  cl.campaign_id,
  l.source AS lead_source,
  l.status AS lead_status,
  l.tags AS lead_tags,
  ljs.journey_stage,
  ljs.campaign_type,
  ljs.total_touches,
  ljs.call_attempts,
  ljs.preferred_channel,
  ljs.interest_level,
  CASE
    WHEN cl.outcome IN ('appointment_set') THEN 'appointment'
    WHEN cl.outcome IN ('completed','answered','interested','callback','talk_to_human') THEN 'positive'
    WHEN cl.outcome IN ('voicemail','left_voicemail') THEN 'voicemail'
    WHEN cl.outcome IN ('no_answer','busy') THEN 'no_connect'
    WHEN cl.outcome IN ('not_interested','dnc','wrong_number') THEN 'negative'
    ELSE 'other'
  END AS outcome_category
FROM call_logs cl
LEFT JOIN leads l ON cl.lead_id = l.id
LEFT JOIN lead_journey_state ljs ON cl.lead_id = ljs.lead_id AND cl.user_id = ljs.user_id;

-- ============================================================================
-- 8. HELPER FUNCTION: Get funnel trend (last N days)
-- Returns daily snapshots for trend analysis
-- ============================================================================
CREATE OR REPLACE FUNCTION get_funnel_trend(p_user_id UUID, p_days INTEGER DEFAULT 14)
RETURNS TABLE (
  snapshot_date DATE,
  total_leads INTEGER,
  hot_count INTEGER,
  engaged_count INTEGER,
  stalled_count INTEGER,
  booked_count INTEGER,
  won_count INTEGER,
  calls_made INTEGER,
  appointments_booked INTEGER,
  total_spend_cents INTEGER,
  cost_per_appointment_cents INTEGER,
  overall_conversion_rate NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    fs.snapshot_date,
    fs.total_leads,
    fs.hot_count,
    fs.engaged_count,
    fs.stalled_count,
    fs.booked_count,
    fs.won_count,
    fs.calls_made,
    fs.appointments_booked,
    fs.total_spend_cents,
    fs.cost_per_appointment_cents,
    fs.overall_conversion_rate
  FROM funnel_snapshots fs
  WHERE fs.user_id = p_user_id
    AND fs.snapshot_date >= CURRENT_DATE - p_days
  ORDER BY fs.snapshot_date ASC;
END;
$$;
