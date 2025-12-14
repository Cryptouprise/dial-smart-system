-- Create SIP trunk configurations table
CREATE TABLE public.sip_trunk_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  provider_type TEXT NOT NULL DEFAULT 'generic', -- 'twilio', 'telnyx', 'generic'
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  
  -- Connection details
  sip_host TEXT, -- e.g., sip.provider.com
  sip_port INTEGER DEFAULT 5060,
  transport TEXT DEFAULT 'udp', -- 'udp', 'tcp', 'tls'
  
  -- Authentication
  auth_type TEXT DEFAULT 'credentials', -- 'credentials', 'ip_whitelist'
  username TEXT,
  password_encrypted TEXT,
  
  -- Twilio specific
  twilio_trunk_sid TEXT,
  twilio_termination_uri TEXT, -- e.g., yourdomain.pstn.twilio.com
  
  -- Telnyx specific
  telnyx_connection_id TEXT,
  
  -- Generic SIP settings
  outbound_proxy TEXT,
  caller_id_header TEXT DEFAULT 'P-Asserted-Identity', -- or 'From', 'Remote-Party-ID'
  extra_headers JSONB DEFAULT '{}',
  
  -- Pricing tracking
  cost_per_minute DECIMAL(10,6) DEFAULT 0.007,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sip_trunk_configs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own SIP configs"
  ON public.sip_trunk_configs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own SIP configs"
  ON public.sip_trunk_configs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own SIP configs"
  ON public.sip_trunk_configs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own SIP configs"
  ON public.sip_trunk_configs FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_sip_trunk_configs_updated_at
  BEFORE UPDATE ON public.sip_trunk_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add index
CREATE INDEX idx_sip_trunk_configs_user_id ON public.sip_trunk_configs(user_id);
CREATE INDEX idx_sip_trunk_configs_active ON public.sip_trunk_configs(user_id, is_active, is_default);