-- Add call_sid column to broadcast_queue for bulletproof Twilio webhook matching
ALTER TABLE public.broadcast_queue 
ADD COLUMN IF NOT EXISTS call_sid TEXT;

-- Create index for fast lookup by call_sid
CREATE INDEX IF NOT EXISTS idx_broadcast_queue_call_sid ON public.broadcast_queue(call_sid) WHERE call_sid IS NOT NULL;

-- Add recording_url column to broadcast_queue to store call recordings
ALTER TABLE public.broadcast_queue 
ADD COLUMN IF NOT EXISTS recording_url TEXT;

-- Comment for documentation
COMMENT ON COLUMN public.broadcast_queue.call_sid IS 'Twilio CallSid for matching status webhooks';
COMMENT ON COLUMN public.broadcast_queue.recording_url IS 'URL to call recording if available';