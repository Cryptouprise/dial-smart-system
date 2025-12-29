-- Create inbound_transfers table to track incoming transfers from external systems
-- This supports receiving live transfers from systems like VICIdial with full metadata

CREATE TABLE IF NOT EXISTS inbound_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  
  -- Transfer identification
  external_call_id VARCHAR(255), -- VICIdial call_id or external system identifier
  external_campaign_id VARCHAR(255), -- Campaign ID from external system
  external_list_id VARCHAR(255), -- List ID from external system
  
  -- Call information
  from_number VARCHAR(50) NOT NULL, -- Caller's phone number
  to_number VARCHAR(50) NOT NULL, -- Destination number (your phone number)
  transfer_type VARCHAR(50) DEFAULT 'live', -- live, warm, cold
  
  -- Lead/Client information
  lead_id UUID, -- Reference to our leads table if matched
  client_first_name VARCHAR(255),
  client_last_name VARCHAR(255),
  client_email VARCHAR(255),
  client_phone VARCHAR(50),
  client_address TEXT,
  client_city VARCHAR(100),
  client_state VARCHAR(50),
  client_zip VARCHAR(20),
  client_country VARCHAR(100),
  
  -- Custom fields (flexible JSON for any additional data)
  custom_fields JSONB DEFAULT '{}'::jsonb,
  
  -- Transfer metadata
  transfer_reason VARCHAR(255), -- Why the call was transferred
  agent_notes TEXT, -- Notes from the transferring agent
  disposition VARCHAR(100), -- Disposition from external system
  priority INTEGER DEFAULT 0, -- Priority level (0-10)
  
  -- Status tracking
  status VARCHAR(50) DEFAULT 'pending', -- pending, answered, completed, failed, no-answer
  answered_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  call_duration_seconds INTEGER,
  
  -- Recording and transcript
  recording_url TEXT,
  transcript TEXT,
  
  -- Integration details
  source_system VARCHAR(100) DEFAULT 'vicidial', -- vicidial, custom, other
  webhook_payload JSONB, -- Store the full webhook payload for debugging
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Foreign keys
  CONSTRAINT fk_inbound_transfers_lead
    FOREIGN KEY (lead_id) 
    REFERENCES leads(id) 
    ON DELETE SET NULL
);

-- Create indexes for common queries
CREATE INDEX idx_inbound_transfers_user_id ON inbound_transfers(user_id);
CREATE INDEX idx_inbound_transfers_lead_id ON inbound_transfers(lead_id);
CREATE INDEX idx_inbound_transfers_status ON inbound_transfers(status);
CREATE INDEX idx_inbound_transfers_from_number ON inbound_transfers(from_number);
CREATE INDEX idx_inbound_transfers_external_call_id ON inbound_transfers(external_call_id);
CREATE INDEX idx_inbound_transfers_created_at ON inbound_transfers(created_at DESC);
CREATE INDEX idx_inbound_transfers_source_system ON inbound_transfers(source_system);

-- Create index on custom_fields JSONB for efficient queries
CREATE INDEX idx_inbound_transfers_custom_fields ON inbound_transfers USING GIN (custom_fields);

-- Enable Row Level Security
ALTER TABLE inbound_transfers ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own inbound transfers"
  ON inbound_transfers
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own inbound transfers"
  ON inbound_transfers
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own inbound transfers"
  ON inbound_transfers
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_inbound_transfers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER trigger_inbound_transfers_updated_at
  BEFORE UPDATE ON inbound_transfers
  FOR EACH ROW
  EXECUTE FUNCTION update_inbound_transfers_updated_at();

-- Add comments for documentation
COMMENT ON TABLE inbound_transfers IS 'Tracks incoming call transfers from external dialing systems like VICIdial';
COMMENT ON COLUMN inbound_transfers.external_call_id IS 'Unique call identifier from the external system';
COMMENT ON COLUMN inbound_transfers.custom_fields IS 'Flexible JSON storage for any additional client or campaign data';
COMMENT ON COLUMN inbound_transfers.webhook_payload IS 'Full webhook payload for debugging and audit trail';
COMMENT ON COLUMN inbound_transfers.transfer_type IS 'Type of transfer: live (hot), warm, or cold';
