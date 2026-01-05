-- Add GHL calendar selection columns to ghl_sync_settings
ALTER TABLE public.ghl_sync_settings
ADD COLUMN IF NOT EXISTS ghl_calendar_id TEXT,
ADD COLUMN IF NOT EXISTS ghl_calendar_name TEXT;