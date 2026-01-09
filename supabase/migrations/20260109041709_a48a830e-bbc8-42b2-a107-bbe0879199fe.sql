-- Stage 1.1: Add missing columns to call_logs table for AI transcript analysis
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS transcript TEXT;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS ai_analysis JSONB;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS auto_disposition TEXT;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS confidence_score DECIMAL(3,2);
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS agent_id TEXT;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS agent_name TEXT;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS recording_url TEXT;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS sentiment TEXT;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS call_summary TEXT;

-- Stage 1.2: Create ml_learning_data table for continuous learning
CREATE TABLE IF NOT EXISTS ml_learning_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  call_id UUID REFERENCES call_logs(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  agent_id TEXT,
  agent_name TEXT,
  call_outcome TEXT,
  disposition TEXT,
  sentiment TEXT,
  sentiment_score DECIMAL(3,2),
  confidence_score DECIMAL(3,2),
  call_duration_seconds INTEGER,
  key_points TEXT[],
  objections TEXT[],
  pain_points TEXT[],
  next_action TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on ml_learning_data
ALTER TABLE ml_learning_data ENABLE ROW LEVEL SECURITY;

-- RLS policies for ml_learning_data
CREATE POLICY "Users can view their own learning data"
  ON ml_learning_data FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own learning data"
  ON ml_learning_data FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage all learning data"
  ON ml_learning_data FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_ml_learning_data_user_id ON ml_learning_data(user_id);
CREATE INDEX IF NOT EXISTS idx_ml_learning_data_agent_id ON ml_learning_data(agent_id);
CREATE INDEX IF NOT EXISTS idx_ml_learning_data_disposition ON ml_learning_data(disposition);
CREATE INDEX IF NOT EXISTS idx_ml_learning_data_created_at ON ml_learning_data(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_agent_id ON call_logs(agent_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_auto_disposition ON call_logs(auto_disposition);
CREATE INDEX IF NOT EXISTS idx_call_logs_sentiment ON call_logs(sentiment);