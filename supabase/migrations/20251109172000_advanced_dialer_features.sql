-- Create advanced_dialer_settings table
CREATE TABLE IF NOT EXISTS public.advanced_dialer_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  enable_amd BOOLEAN NOT NULL DEFAULT false,
  enable_local_presence BOOLEAN NOT NULL DEFAULT false,
  enable_timezone_compliance BOOLEAN NOT NULL DEFAULT true,
  enable_dnc_check BOOLEAN NOT NULL DEFAULT true,
  amd_sensitivity TEXT NOT NULL DEFAULT 'medium',
  local_presence_strategy TEXT NOT NULL DEFAULT 'match_area_code',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.advanced_dialer_settings ENABLE ROW LEVEL SECURITY;

-- Users can manage their own settings
CREATE POLICY "Users can manage their own advanced dialer settings"
ON public.advanced_dialer_settings FOR ALL
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_advanced_dialer_settings_updated_at
  BEFORE UPDATE ON public.advanced_dialer_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add index
CREATE INDEX idx_advanced_dialer_settings_user_id ON public.advanced_dialer_settings(user_id);

-- Create DNC (Do Not Call) list table
CREATE TABLE IF NOT EXISTS public.dnc_list (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  reason TEXT,
  source TEXT, -- 'manual', 'imported', 'request', 'federal'
  added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(user_id, phone_number)
);

-- Enable RLS
ALTER TABLE public.dnc_list ENABLE ROW LEVEL SECURITY;

-- Users can manage their own DNC list
CREATE POLICY "Users can manage their own DNC list"
ON public.dnc_list FOR ALL
USING (auth.uid() = user_id);

-- Add indexes
CREATE INDEX idx_dnc_list_user_id ON public.dnc_list(user_id);
CREATE INDEX idx_dnc_list_phone_number ON public.dnc_list(phone_number);
CREATE INDEX idx_dnc_list_added_at ON public.dnc_list(added_at DESC);

-- Create timezone_rules table for custom calling windows
CREATE TABLE IF NOT EXISTS public.timezone_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timezone TEXT NOT NULL, -- e.g., 'America/New_York'
  call_window_start TIME NOT NULL DEFAULT '08:00:00',
  call_window_end TIME NOT NULL DEFAULT '21:00:00',
  allowed_days INTEGER[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6], -- 0=Sunday, 6=Saturday
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, timezone)
);

-- Enable RLS
ALTER TABLE public.timezone_rules ENABLE ROW LEVEL SECURITY;

-- Users can manage their own timezone rules
CREATE POLICY "Users can manage their own timezone rules"
ON public.timezone_rules FOR ALL
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_timezone_rules_updated_at
  BEFORE UPDATE ON public.timezone_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add indexes
CREATE INDEX idx_timezone_rules_user_id ON public.timezone_rules(user_id);
CREATE INDEX idx_timezone_rules_timezone ON public.timezone_rules(timezone);

-- Add AMD result column to call_logs if not exists
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS amd_result TEXT;
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS amd_confidence DECIMAL(5,2);

-- Create index for AMD results
CREATE INDEX IF NOT EXISTS idx_call_logs_amd_result ON public.call_logs(amd_result);

-- Create caller_id_pool table for local presence management
CREATE TABLE IF NOT EXISTS public.caller_id_pool (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number_id UUID NOT NULL REFERENCES public.phone_numbers(id) ON DELETE CASCADE,
  area_code TEXT NOT NULL,
  prefix TEXT,
  region TEXT,
  is_available BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(phone_number_id)
);

-- Enable RLS
ALTER TABLE public.caller_id_pool ENABLE ROW LEVEL SECURITY;

-- Users can view their own caller ID pool
CREATE POLICY "Users can view their own caller ID pool"
ON public.caller_id_pool FOR SELECT
USING (auth.uid() = user_id);

-- System can manage caller ID pool
CREATE POLICY "System can manage caller ID pool"
ON public.caller_id_pool FOR ALL
USING (auth.uid() = user_id);

-- Add indexes
CREATE INDEX idx_caller_id_pool_user_id ON public.caller_id_pool(user_id);
CREATE INDEX idx_caller_id_pool_area_code ON public.caller_id_pool(area_code);
CREATE INDEX idx_caller_id_pool_prefix ON public.caller_id_pool(prefix);
CREATE INDEX idx_caller_id_pool_is_available ON public.caller_id_pool(is_available);

-- Create contact_list_filters table for list scrubbing and optimization
CREATE TABLE IF NOT EXISTS public.contact_list_filters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  filter_type TEXT NOT NULL, -- 'duplicates', 'invalid_numbers', 'dnc', 'timezone', 'custom'
  criteria JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.contact_list_filters ENABLE ROW LEVEL SECURITY;

-- Users can manage their own filters
CREATE POLICY "Users can manage their own contact list filters"
ON public.contact_list_filters FOR ALL
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_contact_list_filters_updated_at
  BEFORE UPDATE ON public.contact_list_filters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add indexes
CREATE INDEX idx_contact_list_filters_user_id ON public.contact_list_filters(user_id);
CREATE INDEX idx_contact_list_filters_filter_type ON public.contact_list_filters(filter_type);
CREATE INDEX idx_contact_list_filters_is_active ON public.contact_list_filters(is_active);
