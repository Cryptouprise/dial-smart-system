-- Add caller_id column to voice_broadcasts for specifying which number to call from
ALTER TABLE public.voice_broadcasts 
ADD COLUMN IF NOT EXISTS caller_id TEXT;

-- Add comment for clarity
COMMENT ON COLUMN public.voice_broadcasts.caller_id IS 'The phone number ID or number to use as caller ID for this broadcast';