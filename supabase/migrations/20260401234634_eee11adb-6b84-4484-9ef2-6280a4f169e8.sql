-- Workflow branching columns
ALTER TABLE workflow_steps ADD COLUMN IF NOT EXISTS true_branch_step INTEGER;
ALTER TABLE workflow_steps ADD COLUMN IF NOT EXISTS false_branch_step INTEGER;
ALTER TABLE workflow_steps ADD COLUMN IF NOT EXISTS branch_conditions JSONB DEFAULT '[]'::jsonb;
ALTER TABLE workflow_steps ADD COLUMN IF NOT EXISTS loop_back_to_step INTEGER;
ALTER TABLE workflow_steps ADD COLUMN IF NOT EXISTS max_loop_count INTEGER DEFAULT 0;

ALTER TABLE lead_workflow_progress ADD COLUMN IF NOT EXISTS loop_count INTEGER DEFAULT 0;
ALTER TABLE lead_workflow_progress ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- AI Campaign Strategies
CREATE TABLE IF NOT EXISTS ai_campaign_strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  goal_type TEXT NOT NULL CHECK (goal_type IN (
    'appointment_setting', 'lead_qualification', 'database_reactivation',
    'debt_collection', 'insurance_sales', 'real_estate', 'solar_sales',
    'home_services', 'custom'
  )),
  goal_description TEXT NOT NULL,
  analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_workflows JSONB DEFAULT '[]'::jsonb,
  created_playbook_rules JSONB DEFAULT '[]'::jsonb,
  created_pipelines JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'analyzing' CHECK (status IN (
    'analyzing', 'proposed', 'approved', 'active', 'paused', 'completed', 'rejected'
  )),
  approved_at TIMESTAMPTZ,
  total_leads_processed INTEGER DEFAULT 0,
  total_calls_made INTEGER DEFAULT 0,
  total_appointments_set INTEGER DEFAULT 0,
  total_conversions INTEGER DEFAULT 0,
  conversion_rate NUMERIC(5,4) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE ai_campaign_strategies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own strategies" ON ai_campaign_strategies FOR ALL USING (auth.uid() = user_id);

-- Sequence Templates
CREATE TABLE IF NOT EXISTS sequence_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN (
    'speed_to_lead', 'appointment_setting', 'nurture_drip',
    'database_reactivation', 'collections', 're_engagement',
    'appointment_confirmation', 'post_sale', 'win_back', 'custom'
  )),
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommended_goal_type TEXT,
  recommended_calling_hours JSONB DEFAULT '{"start": 9, "end": 21}'::jsonb,
  estimated_touchpoints INTEGER DEFAULT 1,
  estimated_days_to_complete INTEGER DEFAULT 1,
  is_system_template BOOLEAN DEFAULT false,
  user_id UUID REFERENCES auth.users(id),
  times_used INTEGER DEFAULT 0,
  avg_conversion_rate NUMERIC(5,4) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE sequence_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see system and own templates" ON sequence_templates FOR SELECT USING (is_system_template = true OR auth.uid() = user_id);
CREATE POLICY "Users manage own templates" ON sequence_templates FOR ALL USING (auth.uid() = user_id OR is_system_template = true);

-- SMS Copy Variants
CREATE TABLE IF NOT EXISTS sms_copy_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  context_type TEXT NOT NULL CHECK (context_type IN (
    'playbook_rule', 'workflow_step', 'followup', 'reengagement', 'nurture', 'custom'
  )),
  context_id UUID,
  variant_label TEXT NOT NULL DEFAULT 'A',
  message_template TEXT NOT NULL,
  times_sent INTEGER DEFAULT 0,
  replies_received INTEGER DEFAULT 0,
  positive_replies INTEGER DEFAULT 0,
  led_to_call_answer INTEGER DEFAULT 0,
  led_to_appointment INTEGER DEFAULT 0,
  opt_outs INTEGER DEFAULT 0,
  reply_rate NUMERIC(5,4) DEFAULT 0,
  positive_rate NUMERIC(5,4) DEFAULT 0,
  appointment_rate NUMERIC(5,4) DEFAULT 0,
  traffic_weight NUMERIC(5,2) DEFAULT 50,
  is_control BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  ai_generated BOOLEAN DEFAULT false,
  ai_reasoning TEXT,
  parent_variant_id UUID REFERENCES sms_copy_variants(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  last_sent_at TIMESTAMPTZ,
  UNIQUE(user_id, context_type, context_id, variant_label)
);
ALTER TABLE sms_copy_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own SMS variants" ON sms_copy_variants FOR ALL USING (auth.uid() = user_id);

-- SMS Variant Assignments
CREATE TABLE IF NOT EXISTS sms_variant_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID NOT NULL REFERENCES sms_copy_variants(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id),
  sent_at TIMESTAMPTZ DEFAULT now(),
  message_sent TEXT,
  reply_received BOOLEAN DEFAULT false,
  reply_text TEXT,
  reply_sentiment NUMERIC(3,2),
  led_to_appointment BOOLEAN DEFAULT false,
  opted_out BOOLEAN DEFAULT false,
  outcome_recorded_at TIMESTAMPTZ
);
ALTER TABLE sms_variant_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own SMS assignments" ON sms_variant_assignments FOR ALL USING (variant_id IN (SELECT id FROM sms_copy_variants WHERE user_id = auth.uid()));

-- UCB1 SMS variant selection function
CREATE OR REPLACE FUNCTION select_sms_variant(p_user_id UUID, p_context_type TEXT, p_context_id UUID)
RETURNS TABLE(variant_id UUID, variant_label TEXT, message_template TEXT) LANGUAGE plpgsql AS $$
DECLARE
  v_total_sends INTEGER;
  v_record RECORD;
  v_best_score NUMERIC := -1;
  v_best_variant RECORD;
BEGIN
  SELECT COALESCE(SUM(times_sent), 0) INTO v_total_sends
  FROM sms_copy_variants WHERE user_id = p_user_id AND context_type = p_context_type AND context_id = p_context_id AND is_active = true;

  IF v_total_sends < 20 THEN
    RETURN QUERY SELECT sv.id, sv.variant_label, sv.message_template FROM sms_copy_variants sv
    WHERE sv.user_id = p_user_id AND sv.context_type = p_context_type AND sv.context_id = p_context_id AND sv.is_active = true ORDER BY random() LIMIT 1;
    RETURN;
  END IF;

  FOR v_record IN
    SELECT sv.id, sv.variant_label, sv.message_template, sv.times_sent, sv.positive_rate,
           sv.positive_rate + sqrt(2 * ln(v_total_sends) / GREATEST(sv.times_sent, 1)) AS ucb_score
    FROM sms_copy_variants sv WHERE sv.user_id = p_user_id AND sv.context_type = p_context_type AND sv.context_id = p_context_id AND sv.is_active = true
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

-- Update SMS variant stats function
CREATE OR REPLACE FUNCTION update_sms_variant_stats(p_variant_id UUID, p_replied BOOLEAN DEFAULT false, p_positive BOOLEAN DEFAULT false, p_appointment BOOLEAN DEFAULT false, p_opted_out BOOLEAN DEFAULT false)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE sms_copy_variants SET
    times_sent = times_sent + 1,
    replies_received = replies_received + CASE WHEN p_replied THEN 1 ELSE 0 END,
    positive_replies = positive_replies + CASE WHEN p_positive THEN 1 ELSE 0 END,
    led_to_appointment = led_to_appointment + CASE WHEN p_appointment THEN 1 ELSE 0 END,
    opt_outs = opt_outs + CASE WHEN p_opted_out THEN 1 ELSE 0 END,
    reply_rate = CASE WHEN times_sent > 0 THEN (replies_received + CASE WHEN p_replied THEN 1 ELSE 0 END)::NUMERIC / (times_sent + 1) ELSE 0 END,
    positive_rate = CASE WHEN times_sent > 0 THEN (positive_replies + CASE WHEN p_positive THEN 1 ELSE 0 END)::NUMERIC / (times_sent + 1) ELSE 0 END,
    appointment_rate = CASE WHEN times_sent > 0 THEN (led_to_appointment + CASE WHEN p_appointment THEN 1 ELSE 0 END)::NUMERIC / (times_sent + 1) ELSE 0 END,
    last_sent_at = now()
  WHERE id = p_variant_id;
END;
$$;

-- Perpetual follow-up settings
ALTER TABLE autonomous_settings ADD COLUMN IF NOT EXISTS perpetual_followup_enabled BOOLEAN DEFAULT false;
ALTER TABLE autonomous_settings ADD COLUMN IF NOT EXISTS perpetual_max_days INTEGER DEFAULT 365;
ALTER TABLE autonomous_settings ADD COLUMN IF NOT EXISTS perpetual_min_gap_days INTEGER DEFAULT 7;
ALTER TABLE autonomous_settings ADD COLUMN IF NOT EXISTS perpetual_max_gap_days INTEGER DEFAULT 30;
ALTER TABLE autonomous_settings ADD COLUMN IF NOT EXISTS perpetual_channels JSONB DEFAULT '["sms", "call"]'::jsonb;
ALTER TABLE autonomous_settings ADD COLUMN IF NOT EXISTS perpetual_stop_on JSONB DEFAULT '["dnc", "not_interested", "unsubscribe"]'::jsonb;

-- Lead journey state additions
ALTER TABLE lead_journey_state ADD COLUMN IF NOT EXISTS strategy_id UUID REFERENCES ai_campaign_strategies(id);
ALTER TABLE lead_journey_state ADD COLUMN IF NOT EXISTS perpetual_touch_count INTEGER DEFAULT 0;
ALTER TABLE lead_journey_state ADD COLUMN IF NOT EXISTS perpetual_last_touch_at TIMESTAMPTZ;
ALTER TABLE lead_journey_state ADD COLUMN IF NOT EXISTS perpetual_next_touch_at TIMESTAMPTZ;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_strategies_user_status ON ai_campaign_strategies(user_id, status);
CREATE INDEX IF NOT EXISTS idx_sms_variants_context ON sms_copy_variants(user_id, context_type, context_id, is_active);
CREATE INDEX IF NOT EXISTS idx_sms_assignments_variant ON sms_variant_assignments(variant_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_seq_templates_category ON sequence_templates(category, is_system_template);
CREATE INDEX IF NOT EXISTS idx_journey_perpetual ON lead_journey_state(user_id, perpetual_next_touch_at) WHERE perpetual_next_touch_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_journey_user_stage ON lead_journey_state(user_id, current_stage, next_action_scheduled_at);