-- Add calendar_preference column to ghl_sync_settings table
ALTER TABLE public.ghl_sync_settings 
ADD COLUMN IF NOT EXISTS calendar_preference TEXT DEFAULT 'both' 
CHECK (calendar_preference IN ('google', 'ghl', 'both', 'none'));