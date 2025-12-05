-- Autonomous Agent Settings
CREATE TABLE public.autonomous_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  enabled BOOLEAN DEFAULT false,
  auto_execute_recommendations BOOLEAN DEFAULT false,
  auto_approve_script_changes BOOLEAN DEFAULT false,
  require_approval_for_high_priority BOOLEAN DEFAULT true,
  max_daily_autonomous_actions INTEGER DEFAULT 50,
  decision_tracking_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id)
);

-- Agent Decisions (audit trail)
CREATE TABLE public.agent_decisions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  lead_name TEXT,
  decision_type TEXT NOT NULL,
  reasoning TEXT,
  action_taken TEXT,
  outcome TEXT,
  success BOOLEAN,
  executed_at TIMESTAMP WITH TIME ZONE,
  approved_by TEXT CHECK (approved_by IN ('autonomous', 'manual')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Follow-up Sequences
CREATE TABLE public.follow_up_sequences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  pipeline_stage_id UUID REFERENCES public.pipeline_boards(id) ON DELETE SET NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Sequence Steps
CREATE TABLE public.sequence_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sequence_id UUID NOT NULL REFERENCES public.follow_up_sequences(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('ai_call', 'ai_sms', 'manual_sms', 'email', 'wait')),
  delay_minutes INTEGER DEFAULT 0,
  content TEXT,
  ai_prompt TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Scheduled Follow-ups
CREATE TABLE public.scheduled_follow_ups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  sequence_id UUID REFERENCES public.follow_up_sequences(id) ON DELETE CASCADE,
  current_step_id UUID REFERENCES public.sequence_steps(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  action_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
  executed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.autonomous_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_up_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_follow_ups ENABLE ROW LEVEL SECURITY;

-- RLS Policies for autonomous_settings
CREATE POLICY "Users can manage their own autonomous settings"
ON public.autonomous_settings FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for agent_decisions
CREATE POLICY "Users can view their own decisions"
ON public.agent_decisions FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own decisions"
ON public.agent_decisions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for follow_up_sequences
CREATE POLICY "Users can manage their own sequences"
ON public.follow_up_sequences FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for sequence_steps (via sequence ownership)
CREATE POLICY "Users can manage their sequence steps"
ON public.sequence_steps FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.follow_up_sequences
    WHERE id = sequence_steps.sequence_id
    AND user_id = auth.uid()
  )
);

-- RLS Policies for scheduled_follow_ups
CREATE POLICY "Users can manage their scheduled follow-ups"
ON public.scheduled_follow_ups FOR ALL USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_agent_decisions_user_date ON public.agent_decisions(user_id, created_at DESC);
CREATE INDEX idx_scheduled_follow_ups_user_status ON public.scheduled_follow_ups(user_id, status, scheduled_at);
CREATE INDEX idx_sequence_steps_sequence ON public.sequence_steps(sequence_id, step_number);