-- ============================================================================
-- Migration: Autonomous Workflow Intelligence System
-- Date: 2026-03-29
--
-- Adds:
-- 1. Workflow branching (condition/branch steps with real if/then/else)
-- 2. AI Strategy Planner (goal -> auto-generated workflows/playbook)
-- 3. Sequence templates (nurture, reactivation, speed-to-lead, etc.)
-- 4. SMS copy A/B testing with auto-optimization
-- 5. Perpetual follow-up configuration
-- ============================================================================

-- ============================================================================
-- 1. WORKFLOW BRANCHING: Add graph navigation to workflow_steps
-- ============================================================================

-- Add branching columns to workflow_steps
ALTER TABLE workflow_steps ADD COLUMN IF NOT EXISTS true_branch_step INTEGER;
ALTER TABLE workflow_steps ADD COLUMN IF NOT EXISTS false_branch_step INTEGER;
ALTER TABLE workflow_steps ADD COLUMN IF NOT EXISTS branch_conditions JSONB DEFAULT '[]'::jsonb;
-- branch_conditions schema: [{ field, operator, value }]
-- field: 'disposition', 'interest_level', 'days_since_touch', 'call_count',
--         'sms_reply_contains', 'sentiment_score', 'journey_stage', 'tag_exists',
--         'custom_field', 'last_outcome', 'total_touches'
-- operator: 'equals', 'not_equals', 'greater_than', 'less_than', 'contains',
--           'not_contains', 'in', 'not_in', 'exists', 'between'
-- value: string | number | array

-- Add loop support for perpetual sequences
ALTER TABLE workflow_steps ADD COLUMN IF NOT EXISTS loop_back_to_step INTEGER;
ALTER TABLE workflow_steps ADD COLUMN IF NOT EXISTS max_loop_count INTEGER DEFAULT 0;
-- 0 = no looping, -1 = infinite (perpetual), N = loop N times

-- Track loop iterations per lead
ALTER TABLE lead_workflow_progress ADD COLUMN IF NOT EXISTS loop_count INTEGER DEFAULT 0;
ALTER TABLE lead_workflow_progress ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- ============================================================================
-- 2. AI STRATEGY PLANNER: Goal-driven workflow generation
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_campaign_strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),

  -- The user's goal
  goal_type TEXT NOT NULL CHECK (goal_type IN (
    'appointment_setting', 'lead_qualification', 'database_reactivation',
    'debt_collection', 'insurance_sales', 'real_estate', 'solar_sales',
    'home_services', 'custom'
  )),
  goal_description TEXT NOT NULL,
  -- e.g. "Book solar panel consultations with homeowners"

  -- AI analysis results
  analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- { lead_count, stage_distribution, recommended_pipelines, recommended_sequences,
  --   recommended_playbook_rules, estimated_conversion_rate, reasoning }

  -- What the AI created
  created_workflows JSONB DEFAULT '[]'::jsonb,
  -- [{ workflow_id, name, purpose, step_count }]
  created_playbook_rules JSONB DEFAULT '[]'::jsonb,
  -- [{ rule_id, rule_name, stage, action_type }]
  created_pipelines JSONB DEFAULT '[]'::jsonb,
  -- [{ pipeline_id, name, stages }]

  -- Status
  status TEXT NOT NULL DEFAULT 'analyzing' CHECK (status IN (
    'analyzing', 'proposed', 'approved', 'active', 'paused', 'completed', 'rejected'
  )),
  approved_at TIMESTAMPTZ,

  -- Performance tracking
  total_leads_processed INTEGER DEFAULT 0,
  total_calls_made INTEGER DEFAULT 0,
  total_appointments_set INTEGER DEFAULT 0,
  total_conversions INTEGER DEFAULT 0,
  conversion_rate NUMERIC(5,4) DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE ai_campaign_strategies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own strategies" ON ai_campaign_strategies
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- 3. SEQUENCE TEMPLATES: Pre-built multi-step workflow blueprints
-- ============================================================================

CREATE TABLE IF NOT EXISTS sequence_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Template identity
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN (
    'speed_to_lead', 'appointment_setting', 'nurture_drip',
    'database_reactivation', 'collections', 're_engagement',
    'appointment_confirmation', 'post_sale', 'win_back', 'custom'
  )),

  -- Template data
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- [{ step_number, step_type, step_config, delay_hours,
  --    branch_conditions, true_branch_step, false_branch_step,
  --    loop_back_to_step, max_loop_count }]

  -- Recommended settings
  recommended_goal_type TEXT,
  recommended_calling_hours JSONB DEFAULT '{"start": 9, "end": 21}'::jsonb,
  estimated_touchpoints INTEGER DEFAULT 1,
  estimated_days_to_complete INTEGER DEFAULT 1,

  -- System vs user-created
  is_system_template BOOLEAN DEFAULT false,
  user_id UUID REFERENCES auth.users(id),

  -- Metrics from usage
  times_used INTEGER DEFAULT 0,
  avg_conversion_rate NUMERIC(5,4) DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE sequence_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see system + own templates" ON sequence_templates
  FOR SELECT USING (is_system_template = true OR auth.uid() = user_id);
CREATE POLICY "Users manage own templates" ON sequence_templates
  FOR ALL USING (auth.uid() = user_id OR is_system_template = true);

-- ============================================================================
-- 4. SMS COPY A/B TESTING
-- ============================================================================

CREATE TABLE IF NOT EXISTS sms_copy_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),

  -- What this variant is for
  context_type TEXT NOT NULL CHECK (context_type IN (
    'playbook_rule', 'workflow_step', 'followup', 'reengagement', 'nurture', 'custom'
  )),
  context_id UUID, -- FK to playbook rule or workflow step
  variant_label TEXT NOT NULL DEFAULT 'A', -- A, B, C, etc.

  -- The copy
  message_template TEXT NOT NULL,
  -- Supports {{first_name}}, {{company}}, {{last_call_date}}, {{days_since_touch}}, etc.

  -- Performance tracking
  times_sent INTEGER DEFAULT 0,
  replies_received INTEGER DEFAULT 0,
  positive_replies INTEGER DEFAULT 0,
  led_to_call_answer INTEGER DEFAULT 0,
  led_to_appointment INTEGER DEFAULT 0,
  opt_outs INTEGER DEFAULT 0,

  -- Computed rates
  reply_rate NUMERIC(5,4) DEFAULT 0,
  positive_rate NUMERIC(5,4) DEFAULT 0,
  appointment_rate NUMERIC(5,4) DEFAULT 0,

  -- Traffic control (UCB1-style)
  traffic_weight NUMERIC(5,2) DEFAULT 50,
  is_control BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,

  -- AI-generated improvements
  ai_generated BOOLEAN DEFAULT false,
  ai_reasoning TEXT,
  parent_variant_id UUID REFERENCES sms_copy_variants(id),

  created_at TIMESTAMPTZ DEFAULT now(),
  last_sent_at TIMESTAMPTZ,

  UNIQUE(user_id, context_type, context_id, variant_label)
);

ALTER TABLE sms_copy_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own SMS variants" ON sms_copy_variants
  FOR ALL USING (auth.uid() = user_id);

-- Track which variant was sent to which lead
CREATE TABLE IF NOT EXISTS sms_variant_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID NOT NULL REFERENCES sms_copy_variants(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id),
  sent_at TIMESTAMPTZ DEFAULT now(),
  message_sent TEXT,
  reply_received BOOLEAN DEFAULT false,
  reply_text TEXT,
  reply_sentiment NUMERIC(3,2), -- 0.0 to 1.0
  led_to_appointment BOOLEAN DEFAULT false,
  opted_out BOOLEAN DEFAULT false,
  outcome_recorded_at TIMESTAMPTZ
);

ALTER TABLE sms_variant_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own SMS assignments" ON sms_variant_assignments
  FOR ALL USING (
    variant_id IN (SELECT id FROM sms_copy_variants WHERE user_id = auth.uid())
  );

-- Function: Select best SMS variant (UCB1)
CREATE OR REPLACE FUNCTION select_sms_variant(
  p_user_id UUID,
  p_context_type TEXT,
  p_context_id UUID
)
RETURNS TABLE(
  variant_id UUID,
  variant_label TEXT,
  message_template TEXT
) LANGUAGE plpgsql AS $$
DECLARE
  v_total_sends INTEGER;
  v_record RECORD;
  v_best_score NUMERIC := -1;
  v_best_variant RECORD;
BEGIN
  -- Get total sends across all variants for this context
  SELECT COALESCE(SUM(times_sent), 0) INTO v_total_sends
  FROM sms_copy_variants
  WHERE user_id = p_user_id
    AND context_type = p_context_type
    AND context_id = p_context_id
    AND is_active = true;

  -- If no data yet, random selection
  IF v_total_sends < 20 THEN
    RETURN QUERY
    SELECT sv.id, sv.variant_label, sv.message_template
    FROM sms_copy_variants sv
    WHERE sv.user_id = p_user_id
      AND sv.context_type = p_context_type
      AND sv.context_id = p_context_id
      AND sv.is_active = true
    ORDER BY random()
    LIMIT 1;
    RETURN;
  END IF;

  -- UCB1 selection
  FOR v_record IN
    SELECT sv.id, sv.variant_label, sv.message_template,
           sv.times_sent, sv.positive_rate,
           sv.positive_rate + sqrt(2 * ln(v_total_sends) / GREATEST(sv.times_sent, 1)) AS ucb_score
    FROM sms_copy_variants sv
    WHERE sv.user_id = p_user_id
      AND sv.context_type = p_context_type
      AND sv.context_id = p_context_id
      AND sv.is_active = true
  LOOP
    IF v_record.ucb_score > v_best_score THEN
      v_best_score := v_record.ucb_score;
      v_best_variant := v_record;
    END IF;
  END LOOP;

  IF v_best_variant IS NOT NULL THEN
    variant_id := v_best_variant.id;
    variant_label := v_best_variant.variant_label;
    message_template := v_best_variant.message_template;
    RETURN NEXT;
  END IF;
END;
$$;

-- Function: Update SMS variant stats after outcome
CREATE OR REPLACE FUNCTION update_sms_variant_stats(
  p_variant_id UUID,
  p_replied BOOLEAN DEFAULT false,
  p_positive BOOLEAN DEFAULT false,
  p_appointment BOOLEAN DEFAULT false,
  p_opted_out BOOLEAN DEFAULT false
)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE sms_copy_variants
  SET
    times_sent = times_sent + 1,
    replies_received = replies_received + CASE WHEN p_replied THEN 1 ELSE 0 END,
    positive_replies = positive_replies + CASE WHEN p_positive THEN 1 ELSE 0 END,
    led_to_appointment = led_to_appointment + CASE WHEN p_appointment THEN 1 ELSE 0 END,
    opt_outs = opt_outs + CASE WHEN p_opted_out THEN 1 ELSE 0 END,
    reply_rate = CASE WHEN times_sent > 0
      THEN (replies_received + CASE WHEN p_replied THEN 1 ELSE 0 END)::NUMERIC / (times_sent + 1)
      ELSE 0 END,
    positive_rate = CASE WHEN times_sent > 0
      THEN (positive_replies + CASE WHEN p_positive THEN 1 ELSE 0 END)::NUMERIC / (times_sent + 1)
      ELSE 0 END,
    appointment_rate = CASE WHEN times_sent > 0
      THEN (led_to_appointment + CASE WHEN p_appointment THEN 1 ELSE 0 END)::NUMERIC / (times_sent + 1)
      ELSE 0 END,
    last_sent_at = now()
  WHERE id = p_variant_id;
END;
$$;

-- ============================================================================
-- 5. PERPETUAL FOLLOW-UP CONFIGURATION
-- ============================================================================

-- Add perpetual follow-up settings to autonomous_settings
-- These control the "never give up" behavior
ALTER TABLE autonomous_settings ADD COLUMN IF NOT EXISTS
  perpetual_followup_enabled BOOLEAN DEFAULT false;
ALTER TABLE autonomous_settings ADD COLUMN IF NOT EXISTS
  perpetual_max_days INTEGER DEFAULT 365;
  -- Maximum days to keep following up (365 = 1 year, 0 = forever)
ALTER TABLE autonomous_settings ADD COLUMN IF NOT EXISTS
  perpetual_min_gap_days INTEGER DEFAULT 7;
  -- Minimum days between touches in perpetual mode
ALTER TABLE autonomous_settings ADD COLUMN IF NOT EXISTS
  perpetual_max_gap_days INTEGER DEFAULT 30;
  -- Maximum days between touches (escalates if no response)
ALTER TABLE autonomous_settings ADD COLUMN IF NOT EXISTS
  perpetual_channels JSONB DEFAULT '["sms", "call"]'::jsonb;
  -- Which channels to use in perpetual mode
ALTER TABLE autonomous_settings ADD COLUMN IF NOT EXISTS
  perpetual_stop_on JSONB DEFAULT '["dnc", "not_interested", "unsubscribe"]'::jsonb;
  -- Dispositions that stop perpetual follow-up

-- Add strategy reference to lead_journey_state
ALTER TABLE lead_journey_state ADD COLUMN IF NOT EXISTS
  strategy_id UUID REFERENCES ai_campaign_strategies(id);
ALTER TABLE lead_journey_state ADD COLUMN IF NOT EXISTS
  perpetual_touch_count INTEGER DEFAULT 0;
ALTER TABLE lead_journey_state ADD COLUMN IF NOT EXISTS
  perpetual_last_touch_at TIMESTAMPTZ;
ALTER TABLE lead_journey_state ADD COLUMN IF NOT EXISTS
  perpetual_next_touch_at TIMESTAMPTZ;

-- ============================================================================
-- 6. SEED SYSTEM SEQUENCE TEMPLATES
-- ============================================================================

INSERT INTO sequence_templates (name, description, category, is_system_template, estimated_touchpoints, estimated_days_to_complete, steps) VALUES

-- SPEED TO LEAD (immediate engagement)
('Speed to Lead - Call First',
 'Call within 5 minutes, SMS if no answer, retry with escalating delays',
 'speed_to_lead', true, 6, 3,
 '[
   {"step_number": 1, "step_type": "call", "step_config": {"max_attempts": 1}, "delay_hours": 0.08},
   {"step_number": 2, "step_type": "condition", "branch_conditions": [{"field": "last_outcome", "operator": "equals", "value": "answered"}], "true_branch_step": 7, "false_branch_step": 3},
   {"step_number": 3, "step_type": "sms", "step_config": {"content": "Hey {{first_name}}, just tried calling about {{lead_source}}. When works best for a quick chat?"}, "delay_hours": 0.03},
   {"step_number": 4, "step_type": "wait", "step_config": {"delay_hours": 4}},
   {"step_number": 5, "step_type": "call", "step_config": {"max_attempts": 1}, "delay_hours": 0},
   {"step_number": 6, "step_type": "condition", "branch_conditions": [{"field": "last_outcome", "operator": "equals", "value": "answered"}], "true_branch_step": 7, "false_branch_step": 8},
   {"step_number": 7, "step_type": "end", "step_config": {"reason": "connected"}},
   {"step_number": 8, "step_type": "ai_sms", "step_config": {"ai_prompt": "Write a short follow-up SMS. The lead {{first_name}} has not answered 2 calls. Reference their interest in {{lead_source}}. Be casual and helpful."}, "delay_hours": 24},
   {"step_number": 9, "step_type": "call", "step_config": {"max_attempts": 1}, "delay_hours": 48},
   {"step_number": 10, "step_type": "condition", "branch_conditions": [{"field": "total_touches", "operator": "greater_than", "value": 5}], "true_branch_step": 11, "false_branch_step": 3, "loop_back_to_step": 3, "max_loop_count": 2},
   {"step_number": 11, "step_type": "end", "step_config": {"reason": "max_attempts_exhausted"}}
 ]'::jsonb),

-- NURTURE DRIP (long-term value delivery)
('Long-Term Nurture Drip',
 'Monthly value-driven SMS touches that keep you top of mind without being pushy',
 'nurture_drip', true, 12, 365,
 '[
   {"step_number": 1, "step_type": "ai_sms", "step_config": {"ai_prompt": "Write a helpful SMS to {{first_name}} about {{lead_source}}. Share a useful tip or insight, not a pitch. Be genuinely helpful."}, "delay_hours": 168},
   {"step_number": 2, "step_type": "condition", "branch_conditions": [{"field": "sms_reply_contains", "operator": "exists", "value": true}], "true_branch_step": 5, "false_branch_step": 3},
   {"step_number": 3, "step_type": "wait", "step_config": {"delay_days": 21}},
   {"step_number": 4, "step_type": "ai_sms", "step_config": {"ai_prompt": "Write a different value-add SMS to {{first_name}}. Maybe a seasonal tip, industry news, or relevant stat about {{lead_source}}. Keep it short and useful."}, "delay_hours": 0},
   {"step_number": 5, "step_type": "condition", "branch_conditions": [{"field": "interest_level", "operator": "greater_than", "value": 6}], "true_branch_step": 6, "false_branch_step": 7},
   {"step_number": 6, "step_type": "call", "step_config": {"max_attempts": 1}, "delay_hours": 2},
   {"step_number": 7, "step_type": "wait", "step_config": {"delay_days": 30}, "loop_back_to_step": 1, "max_loop_count": -1}
 ]'::jsonb),

-- DATABASE REACTIVATION (re-engage cold leads)
('Database Reactivation',
 'Multi-touch sequence to wake up cold/dormant leads with curiosity-driven messaging',
 'database_reactivation', true, 8, 30,
 '[
   {"step_number": 1, "step_type": "ai_sms", "step_config": {"ai_prompt": "Write a curiosity-driven SMS to {{first_name}} who we haven''t spoken to in a while. Reference {{lead_source}} and ask if they''re still interested. Be casual, not salesy."}, "delay_hours": 0},
   {"step_number": 2, "step_type": "wait", "step_config": {"delay_days": 2}},
   {"step_number": 3, "step_type": "condition", "branch_conditions": [{"field": "sms_reply_contains", "operator": "exists", "value": true}], "true_branch_step": 4, "false_branch_step": 5},
   {"step_number": 4, "step_type": "call", "step_config": {"max_attempts": 2}, "delay_hours": 0.5},
   {"step_number": 5, "step_type": "call", "step_config": {"max_attempts": 1}, "delay_hours": 0},
   {"step_number": 6, "step_type": "condition", "branch_conditions": [{"field": "last_outcome", "operator": "in", "value": ["answered", "interested", "callback"]}], "true_branch_step": 10, "false_branch_step": 7},
   {"step_number": 7, "step_type": "ai_sms", "step_config": {"ai_prompt": "Write a ''breakup'' SMS to {{first_name}}. Say something like ''looks like the timing isn''t right, no worries. If things change, this number works.'' Be genuine."}, "delay_hours": 168},
   {"step_number": 8, "step_type": "wait", "step_config": {"delay_days": 14}},
   {"step_number": 9, "step_type": "ai_sms", "step_config": {"ai_prompt": "Write one final re-engagement SMS to {{first_name}}. Ask a simple yes/no question about {{lead_source}}."}, "delay_hours": 0},
   {"step_number": 10, "step_type": "end", "step_config": {"reason": "sequence_complete"}}
 ]'::jsonb),

-- APPOINTMENT CONFIRMATION (post-booking)
('Appointment Confirmation & Reminders',
 'Confirm appointment immediately, remind day before and morning of',
 'appointment_confirmation', true, 3, 7,
 '[
   {"step_number": 1, "step_type": "sms", "step_config": {"content": "Hey {{first_name}}! Your appointment is confirmed. We''ll call you at the scheduled time. Reply RESCHEDULE if you need to change it."}, "delay_hours": 0},
   {"step_number": 2, "step_type": "condition", "branch_conditions": [{"field": "sms_reply_contains", "operator": "contains", "value": "reschedule"}], "true_branch_step": 5, "false_branch_step": 3},
   {"step_number": 3, "step_type": "sms", "step_config": {"content": "Hi {{first_name}}, just a reminder about your appointment tomorrow. Looking forward to it! Reply if anything changed.", "relative_to": "appointment", "hours_before": 24}, "delay_hours": 24},
   {"step_number": 4, "step_type": "sms", "step_config": {"content": "Good morning {{first_name}}! Your appointment is today. Talk soon!", "relative_to": "appointment", "hours_before": 2}, "delay_hours": 2},
   {"step_number": 5, "step_type": "end", "step_config": {"reason": "reminders_complete"}}
 ]'::jsonb),

-- COLLECTIONS (debt/payment follow-up)
('Payment Follow-Up',
 'Professional payment reminder sequence with escalating urgency',
 'collections', true, 6, 30,
 '[
   {"step_number": 1, "step_type": "sms", "step_config": {"content": "Hi {{first_name}}, this is a friendly reminder regarding your account. Please give us a call at your convenience to discuss your options."}, "delay_hours": 0},
   {"step_number": 2, "step_type": "wait", "step_config": {"delay_days": 3}},
   {"step_number": 3, "step_type": "call", "step_config": {"max_attempts": 2}, "delay_hours": 0},
   {"step_number": 4, "step_type": "condition", "branch_conditions": [{"field": "last_outcome", "operator": "equals", "value": "answered"}], "true_branch_step": 8, "false_branch_step": 5},
   {"step_number": 5, "step_type": "ai_sms", "step_config": {"ai_prompt": "Write a professional but urgent follow-up SMS to {{first_name}} about their account. Mention you''ve been trying to reach them and want to help resolve this."}, "delay_hours": 168},
   {"step_number": 6, "step_type": "call", "step_config": {"max_attempts": 2}, "delay_hours": 72},
   {"step_number": 7, "step_type": "wait", "step_config": {"delay_days": 14}, "loop_back_to_step": 1, "max_loop_count": 3},
   {"step_number": 8, "step_type": "end", "step_config": {"reason": "resolved_or_max_attempts"}}
 ]'::jsonb),

-- WIN-BACK (lost leads)
('Win-Back Sequence',
 'Re-engage leads who previously said not interested after a cooling period',
 'win_back', true, 4, 90,
 '[
   {"step_number": 1, "step_type": "wait", "step_config": {"delay_days": 60}},
   {"step_number": 2, "step_type": "ai_sms", "step_config": {"ai_prompt": "Write a win-back SMS to {{first_name}} who declined {{lead_source}} a while ago. Something has changed (new pricing, new features, seasonal offer). Be respectful of their previous decision."}, "delay_hours": 0},
   {"step_number": 3, "step_type": "condition", "branch_conditions": [{"field": "sms_reply_contains", "operator": "exists", "value": true}], "true_branch_step": 4, "false_branch_step": 5},
   {"step_number": 4, "step_type": "call", "step_config": {"max_attempts": 1}, "delay_hours": 1},
   {"step_number": 5, "step_type": "end", "step_config": {"reason": "win_back_complete"}}
 ]'::jsonb)

ON CONFLICT DO NOTHING;

-- ============================================================================
-- 7. INDEX FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_ai_strategies_user_status ON ai_campaign_strategies(user_id, status);
CREATE INDEX IF NOT EXISTS idx_sms_variants_context ON sms_copy_variants(user_id, context_type, context_id, is_active);
CREATE INDEX IF NOT EXISTS idx_sms_assignments_variant ON sms_variant_assignments(variant_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_seq_templates_category ON sequence_templates(category, is_system_template);
CREATE INDEX IF NOT EXISTS idx_journey_perpetual ON lead_journey_state(user_id, perpetual_next_touch_at)
  WHERE perpetual_next_touch_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_journey_user_stage ON lead_journey_state(user_id, current_stage, next_action_at);
