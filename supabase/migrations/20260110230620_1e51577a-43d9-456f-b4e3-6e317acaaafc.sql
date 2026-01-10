-- Add use_sip_trunk column to voice_broadcasts (default false for reliability)
ALTER TABLE public.voice_broadcasts 
ADD COLUMN IF NOT EXISTS use_sip_trunk boolean DEFAULT false;

-- Add comment explaining the field
COMMENT ON COLUMN public.voice_broadcasts.use_sip_trunk IS 'When true, use SIP trunk for calls (cost savings). When false (default), use direct API for reliability.';

-- Disable any active SIP trunks with the problematic trunk SID
-- This is the immediate fix - makes broadcasts use direct Twilio API
UPDATE public.sip_trunk_configs 
SET is_active = false, 
    is_default = false
WHERE twilio_trunk_sid = 'TKdf7e1d842b244c639b4860c1a0982a1c';