-- Add new columns to voice_broadcasts for error tracking and bypass calling hours
ALTER TABLE public.voice_broadcasts 
ADD COLUMN IF NOT EXISTS bypass_calling_hours boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS last_error text,
ADD COLUMN IF NOT EXISTS last_error_at timestamp with time zone;

-- Add comment for documentation
COMMENT ON COLUMN public.voice_broadcasts.bypass_calling_hours IS 'Allow testing outside configured calling hours';
COMMENT ON COLUMN public.voice_broadcasts.last_error IS 'Last error message encountered during broadcast';
COMMENT ON COLUMN public.voice_broadcasts.last_error_at IS 'Timestamp of the last error';