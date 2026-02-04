-- GHL Workflow ↔ Voice Broadcast Integration
-- Phase 1: Database Schema Changes

-- ======================================================
-- 1.1 Add broadcast_webhook_key to ghl_sync_settings
-- ======================================================
ALTER TABLE ghl_sync_settings ADD COLUMN IF NOT EXISTS broadcast_webhook_key TEXT UNIQUE;

-- ======================================================
-- 1.2 Add GHL tracking columns to broadcast_queue
-- ======================================================
ALTER TABLE broadcast_queue 
  ADD COLUMN IF NOT EXISTS ghl_contact_id TEXT,
  ADD COLUMN IF NOT EXISTS ghl_callback_status TEXT DEFAULT 'pending';

-- Add check constraint for ghl_callback_status (only if column was just added)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'broadcast_queue_ghl_callback_status_check'
  ) THEN
    ALTER TABLE broadcast_queue 
      ADD CONSTRAINT broadcast_queue_ghl_callback_status_check 
      CHECK (ghl_callback_status IN ('pending', 'queued', 'sent', 'skipped', 'failed'));
  END IF;
END$$;

-- Create index for GHL contact lookups
CREATE INDEX IF NOT EXISTS idx_broadcast_queue_ghl_contact 
  ON broadcast_queue(ghl_contact_id) 
  WHERE ghl_contact_id IS NOT NULL;

-- ======================================================
-- 1.3 Create ghl_pending_updates table
-- ======================================================
CREATE TABLE IF NOT EXISTS ghl_pending_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ghl_contact_id TEXT NOT NULL,
  broadcast_id UUID REFERENCES voice_broadcasts(id) ON DELETE SET NULL,
  queue_item_id UUID REFERENCES broadcast_queue(id) ON DELETE SET NULL,
  broadcast_name TEXT,
  call_outcome TEXT NOT NULL,
  call_duration_seconds INTEGER,
  call_timestamp TIMESTAMPTZ,
  dtmf_pressed TEXT,
  callback_requested BOOLEAN DEFAULT FALSE,
  callback_time TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- Add helpful indexes
CREATE INDEX IF NOT EXISTS idx_ghl_pending_status ON ghl_pending_updates(status, user_id);
CREATE INDEX IF NOT EXISTS idx_ghl_pending_broadcast ON ghl_pending_updates(broadcast_id);
CREATE INDEX IF NOT EXISTS idx_ghl_pending_created ON ghl_pending_updates(created_at);

-- ======================================================
-- 1.4 Enable RLS on ghl_pending_updates
-- ======================================================
ALTER TABLE ghl_pending_updates ENABLE ROW LEVEL SECURITY;

-- Users can view their own pending updates
CREATE POLICY "Users can view own ghl_pending_updates" 
  ON ghl_pending_updates FOR SELECT 
  USING (auth.uid() = user_id);

-- Users can insert their own pending updates
CREATE POLICY "Users can insert own ghl_pending_updates" 
  ON ghl_pending_updates FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own pending updates
CREATE POLICY "Users can update own ghl_pending_updates" 
  ON ghl_pending_updates FOR UPDATE 
  USING (auth.uid() = user_id);

-- Service role can do everything (for edge functions)
CREATE POLICY "Service role full access to ghl_pending_updates"
  ON ghl_pending_updates FOR ALL
  USING (true)
  WITH CHECK (true);

-- ======================================================
-- 1.5 Create helper function for generating webhook keys
-- ======================================================
CREATE OR REPLACE FUNCTION generate_webhook_key()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  key_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  -- Generate a 32-character random key
  FOR i IN 1..32 LOOP
    result := result || substr(key_chars, floor(random() * length(key_chars) + 1)::INTEGER, 1);
  END LOOP;
  RETURN 'wh_' || result;
END;
$$;

-- ======================================================
-- 1.6 Add comments for documentation
-- ======================================================
COMMENT ON TABLE ghl_pending_updates IS 'Stores voice broadcast call outcomes pending GHL sync';
COMMENT ON COLUMN ghl_pending_updates.ghl_contact_id IS 'GHL contact ID to update';
COMMENT ON COLUMN ghl_pending_updates.call_outcome IS 'Call result: answered, voicemail, no_answer, busy, failed';
COMMENT ON COLUMN ghl_pending_updates.callback_requested IS 'True if caller pressed DTMF for callback';
COMMENT ON COLUMN broadcast_queue.ghl_contact_id IS 'GHL contact ID for callback after call completes';
COMMENT ON COLUMN broadcast_queue.ghl_callback_status IS 'Status of GHL callback: pending, queued, sent, skipped, failed';
COMMENT ON COLUMN ghl_sync_settings.broadcast_webhook_key IS 'Unique key for GHL workflow webhooks to add contacts to broadcasts';