-- ============================================
-- MULTI-CARRIER PROVIDER INTEGRATION MIGRATION
-- ============================================
-- This migration adds tables for multi-carrier provider support
-- (Retell AI, Telnyx, Twilio) with STIR/SHAKEN, RVM, SMS, and routing.

-- 1. PHONE PROVIDERS TABLE
-- Stores provider configurations and credentials references
-- ============================================
CREATE TABLE IF NOT EXISTS public.phone_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  name TEXT NOT NULL CHECK (name IN ('retell', 'telnyx', 'twilio', 'custom')),
  display_name TEXT,
  config_json JSONB DEFAULT '{}'::jsonb,
  api_key_reference TEXT, -- Reference to secret name in Supabase secrets
  priority INTEGER NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);

-- Enable RLS
ALTER TABLE public.phone_providers ENABLE ROW LEVEL SECURITY;

-- Users can only access their own provider configs
CREATE POLICY "Users can view their own providers"
ON public.phone_providers FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own providers"
ON public.phone_providers FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own providers"
ON public.phone_providers FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own providers"
ON public.phone_providers FOR DELETE
USING (auth.uid() = user_id);

-- 2. PROVIDER NUMBERS TABLE
-- Stores phone numbers imported from each provider
-- ============================================
CREATE TABLE IF NOT EXISTS public.provider_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  provider_id UUID REFERENCES public.phone_providers(id) ON DELETE CASCADE,
  provider_type TEXT NOT NULL CHECK (provider_type IN ('retell', 'telnyx', 'twilio', 'custom')),
  number TEXT NOT NULL,
  capabilities_json JSONB DEFAULT '["voice"]'::jsonb, -- Array of: voice, sms, rvm, shaken
  region TEXT,
  friendly_name TEXT,
  verified BOOLEAN NOT NULL DEFAULT false,
  last_synced TIMESTAMP WITH TIME ZONE,
  provider_number_id TEXT, -- ID from the provider's system
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider_type, number)
);

-- Enable RLS
ALTER TABLE public.provider_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own provider numbers"
ON public.provider_numbers FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own provider numbers"
ON public.provider_numbers FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own provider numbers"
ON public.provider_numbers FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own provider numbers"
ON public.provider_numbers FOR DELETE
USING (auth.uid() = user_id);

-- 3. CARRIER CONFIGS TABLE
-- Stores per-provider capability settings
-- ============================================
CREATE TABLE IF NOT EXISTS public.carrier_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID REFERENCES public.phone_providers(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  capabilities JSONB DEFAULT '[]'::jsonb,
  signed_calls_enabled BOOLEAN NOT NULL DEFAULT false,
  cost_estimate_per_minute DECIMAL(10, 4),
  cost_estimate_per_sms DECIMAL(10, 4),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.carrier_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their carrier configs"
ON public.carrier_configs FOR ALL
USING (auth.uid() = user_id);

-- 4. CALL SIGNATURES TABLE
-- Stores STIR/SHAKEN signature metadata for calls
-- ============================================
CREATE TABLE IF NOT EXISTS public.call_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  call_id TEXT NOT NULL, -- Either local call_log id or provider call id
  provider_id UUID REFERENCES public.phone_providers(id) ON DELETE SET NULL,
  provider_type TEXT,
  signature TEXT,
  attestation_level TEXT CHECK (attestation_level IN ('A', 'B', 'C')),
  verified BOOLEAN NOT NULL DEFAULT false,
  signed_at TIMESTAMP WITH TIME ZONE,
  verification_error TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.call_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their call signatures"
ON public.call_signatures FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert call signatures"
ON public.call_signatures FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Service role can insert signatures (for webhook handlers)
CREATE POLICY "Service role can insert signatures"
ON public.call_signatures FOR INSERT
WITH CHECK (auth.jwt()->>'role' = 'service_role');

-- 5. RVM QUEUE TABLE
-- Stores ringless voicemail job queue
-- ============================================
CREATE TABLE IF NOT EXISTS public.rvm_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  provider_id UUID REFERENCES public.phone_providers(id) ON DELETE SET NULL,
  provider_type TEXT,
  to_number TEXT NOT NULL,
  from_number TEXT NOT NULL,
  audio_url TEXT,
  payload JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'processing', 'delivered', 'failed', 'cancelled')),
  provider_rvm_id TEXT, -- ID from provider
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_attempt_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.rvm_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their RVM queue"
ON public.rvm_queue FOR ALL
USING (auth.uid() = user_id);

-- 6. SMS MESSAGES TABLE
-- Stores SMS message history
-- ============================================
CREATE TABLE IF NOT EXISTS public.sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  provider_id UUID REFERENCES public.phone_providers(id) ON DELETE SET NULL,
  provider_type TEXT,
  to_number TEXT NOT NULL,
  from_number TEXT NOT NULL,
  body TEXT NOT NULL,
  template_id TEXT,
  direction TEXT NOT NULL DEFAULT 'outbound' CHECK (direction IN ('inbound', 'outbound')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'sent', 'delivered', 'failed', 'received')),
  provider_message_id TEXT,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  sent_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their SMS messages"
ON public.sms_messages FOR ALL
USING (auth.uid() = user_id);

-- Service role can insert messages (for webhook handlers)
CREATE POLICY "Service role can insert SMS"
ON public.sms_messages FOR INSERT
WITH CHECK (auth.jwt()->>'role' = 'service_role');

-- 7. FOLLOW-UPS TABLE
-- Stores scheduled follow-up actions (calls, SMS, etc.)
-- ============================================
CREATE TABLE IF NOT EXISTS public.follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('call', 'sms', 'rvm', 'email')),
  provider_type TEXT,
  template_id TEXT,
  metadata_json JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'in_progress', 'completed', 'failed', 'cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their follow-ups"
ON public.follow_ups FOR ALL
USING (auth.uid() = user_id);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_phone_providers_user_id ON public.phone_providers(user_id);
CREATE INDEX IF NOT EXISTS idx_phone_providers_name ON public.phone_providers(name);
CREATE INDEX IF NOT EXISTS idx_phone_providers_active ON public.phone_providers(active);

CREATE INDEX IF NOT EXISTS idx_provider_numbers_user_id ON public.provider_numbers(user_id);
CREATE INDEX IF NOT EXISTS idx_provider_numbers_provider_id ON public.provider_numbers(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_numbers_number ON public.provider_numbers(number);

CREATE INDEX IF NOT EXISTS idx_carrier_configs_provider_id ON public.carrier_configs(provider_id);

CREATE INDEX IF NOT EXISTS idx_call_signatures_call_id ON public.call_signatures(call_id);
CREATE INDEX IF NOT EXISTS idx_call_signatures_user_id ON public.call_signatures(user_id);

CREATE INDEX IF NOT EXISTS idx_rvm_queue_user_id ON public.rvm_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_rvm_queue_status ON public.rvm_queue(status);
CREATE INDEX IF NOT EXISTS idx_rvm_queue_lead_id ON public.rvm_queue(lead_id);

CREATE INDEX IF NOT EXISTS idx_sms_messages_user_id ON public.sms_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_lead_id ON public.sms_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_status ON public.sms_messages(status);
CREATE INDEX IF NOT EXISTS idx_sms_messages_direction ON public.sms_messages(direction);

CREATE INDEX IF NOT EXISTS idx_follow_ups_user_id ON public.follow_ups(user_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_lead_id ON public.follow_ups(lead_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_scheduled_at ON public.follow_ups(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_follow_ups_status ON public.follow_ups(status);

-- ============================================
-- UPDATED_AT TRIGGERS
-- ============================================
CREATE TRIGGER update_phone_providers_updated_at
  BEFORE UPDATE ON public.phone_providers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_provider_numbers_updated_at
  BEFORE UPDATE ON public.provider_numbers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_carrier_configs_updated_at
  BEFORE UPDATE ON public.carrier_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_rvm_queue_updated_at
  BEFORE UPDATE ON public.rvm_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_follow_ups_updated_at
  BEFORE UPDATE ON public.follow_ups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
