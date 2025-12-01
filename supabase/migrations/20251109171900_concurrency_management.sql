-- Create system_settings table for concurrency and dialing configuration
CREATE TABLE IF NOT EXISTS public.system_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  max_concurrent_calls INTEGER NOT NULL DEFAULT 10,
  calls_per_minute INTEGER NOT NULL DEFAULT 30,
  max_calls_per_agent INTEGER NOT NULL DEFAULT 3,
  enable_adaptive_pacing BOOLEAN NOT NULL DEFAULT true,
  abandonment_rate_threshold DECIMAL(5,2) NOT NULL DEFAULT 3.0,
  answer_rate_threshold DECIMAL(5,2) NOT NULL DEFAULT 50.0,
  enable_local_presence BOOLEAN NOT NULL DEFAULT false,
  enable_amd BOOLEAN NOT NULL DEFAULT false,
  time_zone_aware BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Users can manage their own system settings
CREATE POLICY "Users can manage their own system settings"
ON public.system_settings FOR ALL
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_system_settings_updated_at
  BEFORE UPDATE ON public.system_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for performance
CREATE INDEX idx_system_settings_user_id ON public.system_settings(user_id);

-- Create predictive_dialing_stats table for tracking performance
CREATE TABLE IF NOT EXISTS public.predictive_dialing_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  concurrent_calls INTEGER NOT NULL DEFAULT 0,
  calls_attempted INTEGER NOT NULL DEFAULT 0,
  calls_connected INTEGER NOT NULL DEFAULT 0,
  calls_abandoned INTEGER NOT NULL DEFAULT 0,
  answer_rate DECIMAL(5,2),
  abandonment_rate DECIMAL(5,2),
  average_wait_time INTEGER, -- in seconds
  agent_utilization DECIMAL(5,2),
  metadata JSONB
);

-- Enable RLS
ALTER TABLE public.predictive_dialing_stats ENABLE ROW LEVEL SECURITY;

-- Users can view their own stats
CREATE POLICY "Users can view their own dialing stats"
ON public.predictive_dialing_stats FOR SELECT
USING (auth.uid() = user_id);

-- System can insert stats
CREATE POLICY "System can insert dialing stats"
ON public.predictive_dialing_stats FOR INSERT
WITH CHECK (true);

-- Add indexes for performance
CREATE INDEX idx_predictive_dialing_stats_user_id ON public.predictive_dialing_stats(user_id);
CREATE INDEX idx_predictive_dialing_stats_campaign_id ON public.predictive_dialing_stats(campaign_id);
CREATE INDEX idx_predictive_dialing_stats_timestamp ON public.predictive_dialing_stats(timestamp DESC);

-- Create dialing_queue_priorities table for advanced queue management
CREATE TABLE IF NOT EXISTS public.dialing_queue_priorities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  priority_score INTEGER NOT NULL DEFAULT 1,
  rules JSONB NOT NULL, -- JSON rules for priority assignment
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.dialing_queue_priorities ENABLE ROW LEVEL SECURITY;

-- Users can manage their own queue priorities
CREATE POLICY "Users can manage their own queue priorities"
ON public.dialing_queue_priorities FOR ALL
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_dialing_queue_priorities_updated_at
  BEFORE UPDATE ON public.dialing_queue_priorities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for performance
CREATE INDEX idx_dialing_queue_priorities_user_id ON public.dialing_queue_priorities(user_id);
