-- Campaign Automation Rules table
CREATE TABLE public.campaign_automation_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  rule_type TEXT NOT NULL DEFAULT 'schedule', -- schedule, retry_logic, time_window, condition
  priority INTEGER DEFAULT 0,
  enabled BOOLEAN DEFAULT true,
  
  -- Conditions (when to apply this rule)
  conditions JSONB DEFAULT '{}',
  -- Example: {"no_answer_count": 3, "days_since_last_call": 2, "day_of_week": ["saturday", "sunday"]}
  
  -- Actions (what to do)
  actions JSONB DEFAULT '{}',
  -- Example: {"max_calls_per_day": 3, "call_times": ["09:00-12:00", "17:00-20:00"], "pause_days": 1}
  
  -- Schedule settings
  start_date DATE,
  end_date DATE,
  days_of_week TEXT[] DEFAULT ARRAY['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
  time_windows JSONB DEFAULT '[{"start": "09:00", "end": "17:00"}]',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.campaign_automation_rules ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own automation rules"
  ON public.campaign_automation_rules FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own automation rules"
  ON public.campaign_automation_rules FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own automation rules"
  ON public.campaign_automation_rules FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own automation rules"
  ON public.campaign_automation_rules FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_campaign_automation_rules_updated_at
  BEFORE UPDATE ON public.campaign_automation_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- AI Chatbot Settings table (to persist settings)
CREATE TABLE public.ai_chatbot_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  voice_enabled BOOLEAN DEFAULT true,
  voice_id TEXT DEFAULT 'EXAVITQu4vr4xnSDxMaL',
  auto_speak BOOLEAN DEFAULT false,
  ai_actions_enabled BOOLEAN DEFAULT true,
  custom_report_instructions TEXT,
  report_metrics TEXT[] DEFAULT ARRAY['total_calls', 'connected_calls', 'answer_rate', 'appointments_set', 'wins', 'improvements', 'recommendations'],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_chatbot_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can manage their own chatbot settings"
  ON public.ai_chatbot_settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_ai_chatbot_settings_updated_at
  BEFORE UPDATE ON public.ai_chatbot_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();