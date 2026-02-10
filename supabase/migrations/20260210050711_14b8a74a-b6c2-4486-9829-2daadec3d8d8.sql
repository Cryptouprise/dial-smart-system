
-- =============================================
-- Phase 5-8: Autonomous Engine Tables
-- =============================================

-- AI Action Queue for human-approved automated tasks
CREATE TABLE IF NOT EXISTS public.ai_action_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  action_type TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'pending',
  title TEXT NOT NULL,
  description TEXT,
  target_entity_type TEXT,
  target_entity_id UUID,
  action_payload JSONB DEFAULT '{}',
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_action_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own action queue" ON public.ai_action_queue
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_action_queue_user_status ON public.ai_action_queue(user_id, status);
CREATE INDEX idx_action_queue_priority ON public.ai_action_queue(priority, created_at);

-- AI Operational Memory
CREATE TABLE IF NOT EXISTS public.ai_operational_memory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  memory_type TEXT NOT NULL,
  memory_key TEXT NOT NULL,
  memory_value JSONB NOT NULL DEFAULT '{}',
  confidence NUMERIC(5,2) DEFAULT 0.5,
  last_accessed_at TIMESTAMPTZ,
  access_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, memory_type, memory_key)
);

ALTER TABLE public.ai_operational_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own operational memory" ON public.ai_operational_memory
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Lead Journey State
CREATE TABLE IF NOT EXISTS public.lead_journey_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  current_stage TEXT NOT NULL DEFAULT 'new',
  previous_stage TEXT,
  stage_entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_touches INTEGER DEFAULT 0,
  total_calls INTEGER DEFAULT 0,
  total_sms INTEGER DEFAULT 0,
  total_emails INTEGER DEFAULT 0,
  sentiment_score NUMERIC(5,2),
  engagement_score NUMERIC(5,2),
  journey_health TEXT DEFAULT 'neutral',
  next_recommended_action TEXT,
  next_action_scheduled_at TIMESTAMPTZ,
  stale_since TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, lead_id)
);

ALTER TABLE public.lead_journey_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own lead journeys" ON public.lead_journey_state
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_lj_state_lead ON public.lead_journey_state(lead_id);
CREATE INDEX idx_lj_state_stage ON public.lead_journey_state(user_id, current_stage);

-- Journey Event Log
CREATE TABLE IF NOT EXISTS public.journey_event_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  journey_state_id UUID REFERENCES public.lead_journey_state(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  event_source TEXT NOT NULL DEFAULT 'system',
  from_stage TEXT,
  to_stage TEXT,
  event_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.journey_event_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own journey events" ON public.journey_event_log
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_journey_events_lead ON public.journey_event_log(lead_id, created_at DESC);

-- Followup Playbook
CREATE TABLE IF NOT EXISTS public.followup_playbook (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  trigger_stage TEXT NOT NULL,
  conditions JSONB DEFAULT '{}',
  actions JSONB NOT NULL DEFAULT '[]',
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.followup_playbook ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own playbooks" ON public.followup_playbook
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Agent Script Variants (A/B Testing with Thompson Sampling)
CREATE TABLE IF NOT EXISTS public.agent_script_variants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  variant_name TEXT NOT NULL,
  variant_label TEXT,
  prompt_patch JSONB NOT NULL DEFAULT '{}',
  weight NUMERIC(5,4) DEFAULT 0.5,
  alpha INTEGER DEFAULT 1,
  beta INTEGER DEFAULT 1,
  total_calls INTEGER DEFAULT 0,
  total_conversions INTEGER DEFAULT 0,
  avg_duration_seconds NUMERIC(10,2),
  avg_sentiment_score NUMERIC(5,2),
  is_active BOOLEAN DEFAULT true,
  is_control BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_script_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own script variants" ON public.agent_script_variants
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Call Variant Assignments
CREATE TABLE IF NOT EXISTS public.call_variant_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  call_id UUID REFERENCES public.call_logs(id) ON DELETE SET NULL,
  variant_id UUID NOT NULL REFERENCES public.agent_script_variants(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  outcome TEXT,
  duration_seconds INTEGER,
  sentiment_score NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.call_variant_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own variant assignments" ON public.call_variant_assignments
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Adaptive Pacing
CREATE TABLE IF NOT EXISTS public.adaptive_pacing (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  current_cpm NUMERIC(5,2) DEFAULT 1.0,
  target_answer_rate NUMERIC(5,2) DEFAULT 0.25,
  actual_answer_rate NUMERIC(5,2),
  window_size_minutes INTEGER DEFAULT 15,
  last_adjusted_at TIMESTAMPTZ,
  adjustment_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, campaign_id)
);

ALTER TABLE public.adaptive_pacing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own pacing" ON public.adaptive_pacing
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Pacing History
CREATE TABLE IF NOT EXISTS public.pacing_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  pacing_id UUID NOT NULL REFERENCES public.adaptive_pacing(id) ON DELETE CASCADE,
  old_cpm NUMERIC(5,2),
  new_cpm NUMERIC(5,2),
  answer_rate NUMERIC(5,2),
  calls_in_window INTEGER,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pacing_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own pacing history" ON public.pacing_history
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Optimal Calling Windows
CREATE TABLE IF NOT EXISTS public.optimal_calling_windows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  day_of_week INTEGER NOT NULL,
  hour_of_day INTEGER NOT NULL,
  total_calls INTEGER DEFAULT 0,
  answered_calls INTEGER DEFAULT 0,
  converted_calls INTEGER DEFAULT 0,
  answer_rate NUMERIC(5,4),
  conversion_rate NUMERIC(5,4),
  score NUMERIC(5,2) DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, day_of_week, hour_of_day)
);

ALTER TABLE public.optimal_calling_windows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own calling windows" ON public.optimal_calling_windows
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Lead Score Outcomes
CREATE TABLE IF NOT EXISTS public.lead_score_outcomes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  score_at_contact NUMERIC(5,2),
  factors_at_contact JSONB,
  outcome TEXT,
  converted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_score_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own score outcomes" ON public.lead_score_outcomes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Lead Scoring Weights
CREATE TABLE IF NOT EXISTS public.lead_scoring_weights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  factor_name TEXT NOT NULL,
  weight NUMERIC(5,4) DEFAULT 1.0,
  calibrated_at TIMESTAMPTZ,
  sample_size INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, factor_name)
);

ALTER TABLE public.lead_scoring_weights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own scoring weights" ON public.lead_scoring_weights
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Add columns to autonomous_settings if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'autonomous_settings' AND column_name = 'manage_lead_journeys') THEN
    ALTER TABLE public.autonomous_settings ADD COLUMN manage_lead_journeys BOOLEAN DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'autonomous_settings' AND column_name = 'auto_adjust_pacing') THEN
    ALTER TABLE public.autonomous_settings ADD COLUMN auto_adjust_pacing BOOLEAN DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'autonomous_settings' AND column_name = 'enable_script_ab_testing') THEN
    ALTER TABLE public.autonomous_settings ADD COLUMN enable_script_ab_testing BOOLEAN DEFAULT false;
  END IF;
END $$;
