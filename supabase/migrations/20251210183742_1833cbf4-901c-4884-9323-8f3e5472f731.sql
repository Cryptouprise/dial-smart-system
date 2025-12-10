-- Budget settings table for global and campaign-specific budgets
CREATE TABLE public.budget_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  daily_limit NUMERIC(10,2),
  monthly_limit NUMERIC(10,2),
  alert_threshold_percent INTEGER DEFAULT 80,
  auto_pause_enabled BOOLEAN DEFAULT true,
  is_paused BOOLEAN DEFAULT false,
  paused_at TIMESTAMP WITH TIME ZONE,
  pause_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, campaign_id)
);

-- Spending logs to track individual costs
CREATE TABLE public.spending_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  broadcast_id UUID REFERENCES public.voice_broadcasts(id) ON DELETE SET NULL,
  call_log_id UUID REFERENCES public.call_logs(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  cost_type TEXT NOT NULL,
  amount NUMERIC(10,4) NOT NULL DEFAULT 0,
  duration_seconds INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Daily spending summary for quick lookups
CREATE TABLE public.spending_summaries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  summary_date DATE NOT NULL DEFAULT CURRENT_DATE,
  twilio_cost NUMERIC(10,4) DEFAULT 0,
  retell_cost NUMERIC(10,4) DEFAULT 0,
  elevenlabs_cost NUMERIC(10,4) DEFAULT 0,
  total_cost NUMERIC(10,4) DEFAULT 0,
  call_count INTEGER DEFAULT 0,
  sms_count INTEGER DEFAULT 0,
  total_duration_seconds INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, campaign_id, summary_date)
);

-- Budget alerts table
CREATE TABLE public.budget_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  budget_setting_id UUID REFERENCES public.budget_settings(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  threshold_percent INTEGER,
  amount_spent NUMERIC(10,4),
  budget_limit NUMERIC(10,4),
  message TEXT,
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  action_taken TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.budget_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spending_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spending_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for budget_settings
CREATE POLICY "Users can manage their own budget settings"
  ON public.budget_settings FOR ALL
  USING (auth.uid() = user_id);

-- RLS Policies for spending_logs
CREATE POLICY "Users can view their own spending logs"
  ON public.spending_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own spending logs"
  ON public.spending_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for spending_summaries
CREATE POLICY "Users can manage their own spending summaries"
  ON public.spending_summaries FOR ALL
  USING (auth.uid() = user_id);

-- RLS Policies for budget_alerts
CREATE POLICY "Users can manage their own budget alerts"
  ON public.budget_alerts FOR ALL
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_budget_settings_updated_at
  BEFORE UPDATE ON public.budget_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_spending_summaries_updated_at
  BEFORE UPDATE ON public.spending_summaries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for faster lookups
CREATE INDEX idx_spending_logs_user_created ON public.spending_logs(user_id, created_at);
CREATE INDEX idx_spending_logs_campaign ON public.spending_logs(campaign_id, created_at);
CREATE INDEX idx_spending_summaries_user_date ON public.spending_summaries(user_id, summary_date);
CREATE INDEX idx_budget_alerts_user_unack ON public.budget_alerts(user_id, acknowledged) WHERE acknowledged = false;