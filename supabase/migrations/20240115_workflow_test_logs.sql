-- Create workflow_test_logs table for tracking workflow tests
CREATE TABLE IF NOT EXISTS workflow_test_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  test_id TEXT NOT NULL,
  workflow_name TEXT,
  mode TEXT CHECK (mode IN ('simulation', 'real')),
  speed TEXT CHECK (speed IN ('fast', 'realtime')),
  total_steps INTEGER,
  successful_steps INTEGER,
  failed_steps INTEGER,
  estimated_cost DECIMAL(10, 4),
  test_results JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_workflow_test_logs_user_id ON workflow_test_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_workflow_test_logs_test_id ON workflow_test_logs(test_id);
CREATE INDEX IF NOT EXISTS idx_workflow_test_logs_created_at ON workflow_test_logs(created_at DESC);

-- Enable RLS
ALTER TABLE workflow_test_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own test logs"
  ON workflow_test_logs
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own test logs"
  ON workflow_test_logs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Add comment
COMMENT ON TABLE workflow_test_logs IS 'Stores logs of workflow tests for validation and debugging';
