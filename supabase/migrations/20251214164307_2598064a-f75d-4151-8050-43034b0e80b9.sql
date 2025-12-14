-- Add calendar integration setting to ai_sms_settings
ALTER TABLE public.ai_sms_settings 
ADD COLUMN IF NOT EXISTS enable_calendar_integration boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS calendar_booking_link text;