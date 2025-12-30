-- Add transfer concurrency settings to system_settings
ALTER TABLE system_settings 
ADD COLUMN IF NOT EXISTS retell_max_concurrent INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS assistable_max_concurrent INTEGER DEFAULT 200,
ADD COLUMN IF NOT EXISTS transfer_queue_enabled BOOLEAN DEFAULT true;

-- Create active_ai_transfers table to track active transfers by platform
CREATE TABLE IF NOT EXISTS active_ai_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('retell', 'assistable')),
  call_sid TEXT,
  retell_call_id TEXT,
  lead_id UUID REFERENCES leads(id),
  broadcast_id UUID REFERENCES voice_broadcasts(id),
  transfer_number TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE active_ai_transfers ENABLE ROW LEVEL SECURITY;

-- Create RLS policy
CREATE POLICY "Users can manage their own active transfers"
ON active_ai_transfers
FOR ALL
USING (auth.uid() = user_id);

-- Create index for fast capacity queries
CREATE INDEX IF NOT EXISTS idx_active_ai_transfers_platform_status 
ON active_ai_transfers(user_id, platform, status) 
WHERE status = 'active';

-- Create index for call_sid lookups (webhook updates)
CREATE INDEX IF NOT EXISTS idx_active_ai_transfers_call_sid 
ON active_ai_transfers(call_sid) 
WHERE call_sid IS NOT NULL;

-- Create index for retell_call_id lookups
CREATE INDEX IF NOT EXISTS idx_active_ai_transfers_retell_call_id 
ON active_ai_transfers(retell_call_id) 
WHERE retell_call_id IS NOT NULL;

-- Add trigger for updated_at
CREATE TRIGGER update_active_ai_transfers_updated_at
BEFORE UPDATE ON active_ai_transfers
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();