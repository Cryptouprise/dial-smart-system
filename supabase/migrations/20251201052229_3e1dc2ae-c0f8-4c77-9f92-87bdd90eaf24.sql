-- Create advanced_dialer_settings table
CREATE TABLE IF NOT EXISTS public.advanced_dialer_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  enable_amd BOOLEAN DEFAULT false,
  enable_local_presence BOOLEAN DEFAULT false,
  enable_timezone_compliance BOOLEAN DEFAULT true,
  enable_dnc_check BOOLEAN DEFAULT true,
  amd_sensitivity TEXT DEFAULT 'medium' CHECK (amd_sensitivity IN ('low', 'medium', 'high')),
  local_presence_strategy TEXT DEFAULT 'match_area_code' CHECK (local_presence_strategy IN ('match_area_code', 'match_prefix', 'nearest')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id)
);

-- Create system_settings table
CREATE TABLE IF NOT EXISTS public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  max_concurrent_calls INTEGER DEFAULT 10,
  calls_per_minute INTEGER DEFAULT 30,
  max_calls_per_agent INTEGER DEFAULT 3,
  enable_adaptive_pacing BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id)
);

-- Create predictive_dialing_stats table
CREATE TABLE IF NOT EXISTS public.predictive_dialing_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  concurrent_calls INTEGER NOT NULL,
  calls_attempted INTEGER DEFAULT 0,
  calls_connected INTEGER DEFAULT 0,
  calls_abandoned INTEGER DEFAULT 0,
  answer_rate NUMERIC DEFAULT 0,
  abandonment_rate NUMERIC DEFAULT 0,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create dnc_list table (Do Not Call)
CREATE TABLE IF NOT EXISTS public.dnc_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  reason TEXT,
  added_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, phone_number)
);

-- Add amd_result column to call_logs
ALTER TABLE public.call_logs 
ADD COLUMN IF NOT EXISTS amd_result TEXT CHECK (amd_result IN ('human', 'machine', 'unknown'));

-- Enable RLS
ALTER TABLE public.advanced_dialer_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.predictive_dialing_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dnc_list ENABLE ROW LEVEL SECURITY;

-- RLS Policies for advanced_dialer_settings
CREATE POLICY "Users can manage their own dialer settings"
  ON public.advanced_dialer_settings
  FOR ALL
  USING (auth.uid() = user_id);

-- RLS Policies for system_settings
CREATE POLICY "Users can manage their own system settings"
  ON public.system_settings
  FOR ALL
  USING (auth.uid() = user_id);

-- RLS Policies for predictive_dialing_stats
CREATE POLICY "Users can view their own dialing stats"
  ON public.predictive_dialing_stats
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own dialing stats"
  ON public.predictive_dialing_stats
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for dnc_list
CREATE POLICY "Users can manage their own DNC list"
  ON public.dnc_list
  FOR ALL
  USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_predictive_dialing_stats_user_id ON public.predictive_dialing_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_predictive_dialing_stats_campaign_id ON public.predictive_dialing_stats(campaign_id);
CREATE INDEX IF NOT EXISTS idx_predictive_dialing_stats_timestamp ON public.predictive_dialing_stats(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_dnc_list_phone_number ON public.dnc_list(phone_number);
CREATE INDEX IF NOT EXISTS idx_dnc_list_user_id ON public.dnc_list(user_id);