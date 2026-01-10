-- Add verification columns to phone_numbers table
ALTER TABLE public.phone_numbers
ADD COLUMN IF NOT EXISTS twilio_verified boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS twilio_verified_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS twilio_sid text,
ADD COLUMN IF NOT EXISTS capabilities jsonb DEFAULT '{}';

-- Add index for quick lookup of verified numbers
CREATE INDEX IF NOT EXISTS idx_phone_numbers_twilio_verified 
ON public.phone_numbers(user_id, twilio_verified) 
WHERE twilio_verified = true;

-- Comment for clarity
COMMENT ON COLUMN public.phone_numbers.twilio_verified IS 'Whether this number has been verified against the Twilio API';
COMMENT ON COLUMN public.phone_numbers.twilio_sid IS 'The Twilio SID for this number, proving ownership';
COMMENT ON COLUMN public.phone_numbers.capabilities IS 'Number capabilities: sms, voice, mms, fax';