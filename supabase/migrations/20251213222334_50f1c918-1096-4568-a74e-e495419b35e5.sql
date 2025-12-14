-- Add sms_from_number column to campaigns table
ALTER TABLE public.campaigns 
ADD COLUMN IF NOT EXISTS sms_from_number TEXT;

-- Add comment explaining the field
COMMENT ON COLUMN public.campaigns.sms_from_number IS 'The Twilio A2P phone number to use for sending SMS in workflows';