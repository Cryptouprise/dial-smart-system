-- Phase 0: Number Classification & Association System

-- 0.1 - Add Phone Number Classification Fields
ALTER TABLE public.phone_numbers 
ADD COLUMN IF NOT EXISTS provider text DEFAULT 'twilio',
ADD COLUMN IF NOT EXISTS purpose text DEFAULT 'general_rotation',
ADD COLUMN IF NOT EXISTS sip_trunk_provider text,
ADD COLUMN IF NOT EXISTS sip_trunk_config jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS is_stationary boolean DEFAULT false;

-- Add check constraints for valid values
ALTER TABLE public.phone_numbers 
ADD CONSTRAINT phone_numbers_provider_check 
CHECK (provider IN ('twilio', 'telnyx', 'retell_native', 'other'));

ALTER TABLE public.phone_numbers 
ADD CONSTRAINT phone_numbers_purpose_check 
CHECK (purpose IN ('broadcast', 'retell_agent', 'follow_up_dedicated', 'general_rotation', 'sms_only'));

-- Create index for efficient querying by purpose and provider
CREATE INDEX IF NOT EXISTS idx_phone_numbers_provider_purpose ON public.phone_numbers(provider, purpose);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_stationary ON public.phone_numbers(is_stationary) WHERE is_stationary = true;

-- 0.2 - Create Campaign Phone Pools Table
CREATE TABLE IF NOT EXISTS public.campaign_phone_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  phone_number_id uuid REFERENCES public.phone_numbers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text DEFAULT 'outbound',
  is_primary boolean DEFAULT false,
  priority integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(campaign_id, phone_number_id)
);

-- Add check constraint for role
ALTER TABLE public.campaign_phone_pools 
ADD CONSTRAINT campaign_phone_pools_role_check 
CHECK (role IN ('outbound', 'caller_id_only', 'sms_only', 'inbound'));

-- Enable RLS
ALTER TABLE public.campaign_phone_pools ENABLE ROW LEVEL SECURITY;

-- RLS policies for campaign_phone_pools
CREATE POLICY "Users can manage their own campaign phone pools"
ON public.campaign_phone_pools
FOR ALL
USING (auth.uid() = user_id);

-- Create indexes for campaign_phone_pools
CREATE INDEX IF NOT EXISTS idx_campaign_phone_pools_campaign ON public.campaign_phone_pools(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_phone_pools_phone ON public.campaign_phone_pools(phone_number_id);

-- 0.3 - Create Phone Providers Table
CREATE TABLE IF NOT EXISTS public.phone_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  display_name text,
  is_active boolean DEFAULT true,
  config_json jsonb DEFAULT '{}',
  capabilities jsonb DEFAULT '{"voice": true, "sms": true, "mms": false}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, name)
);

-- Enable RLS
ALTER TABLE public.phone_providers ENABLE ROW LEVEL SECURITY;

-- RLS policies for phone_providers
CREATE POLICY "Users can manage their own phone providers"
ON public.phone_providers
FOR ALL
USING (auth.uid() = user_id);

-- Phase 2: Intelligence & Learning

-- 2.1 - Create Lead Nudge Tracking Table
CREATE TABLE IF NOT EXISTS public.lead_nudge_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  last_ai_contact_at timestamptz,
  last_lead_response_at timestamptz,
  nudge_count integer DEFAULT 0,
  next_nudge_at timestamptz,
  is_engaged boolean DEFAULT false,
  sequence_paused boolean DEFAULT false,
  pause_reason text,
  current_sequence_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(lead_id)
);

-- Enable RLS
ALTER TABLE public.lead_nudge_tracking ENABLE ROW LEVEL SECURITY;

-- RLS policies for lead_nudge_tracking
CREATE POLICY "Users can manage their own nudge tracking"
ON public.lead_nudge_tracking
FOR ALL
USING (auth.uid() = user_id);

-- Create indexes for lead_nudge_tracking
CREATE INDEX IF NOT EXISTS idx_lead_nudge_next ON public.lead_nudge_tracking(next_nudge_at) WHERE sequence_paused = false;
CREATE INDEX IF NOT EXISTS idx_lead_nudge_engaged ON public.lead_nudge_tracking(is_engaged);

-- Create trigger for updated_at on new tables
CREATE TRIGGER update_campaign_phone_pools_updated_at
BEFORE UPDATE ON public.campaign_phone_pools
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_phone_providers_updated_at
BEFORE UPDATE ON public.phone_providers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_lead_nudge_tracking_updated_at
BEFORE UPDATE ON public.lead_nudge_tracking
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();