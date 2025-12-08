-- Add friendly_name to phone_numbers table
ALTER TABLE public.phone_numbers ADD COLUMN IF NOT EXISTS friendly_name text;

-- Add last_from_number to sms_conversations to remember the number used
ALTER TABLE public.sms_conversations ADD COLUMN IF NOT EXISTS last_from_number text;