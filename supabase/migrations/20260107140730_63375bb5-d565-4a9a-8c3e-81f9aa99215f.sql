-- Create disposition_metrics table for SMS and voice disposition tracking
CREATE TABLE IF NOT EXISTS disposition_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  call_id UUID REFERENCES call_logs(id) ON DELETE SET NULL,
  disposition_id UUID REFERENCES dispositions(id) ON DELETE SET NULL,
  disposition_name TEXT NOT NULL,
  set_by TEXT NOT NULL DEFAULT 'manual',
  set_by_user_id UUID,
  ai_confidence_score NUMERIC(5,4),
  call_ended_at TIMESTAMPTZ,
  disposition_set_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  time_to_disposition_seconds INTEGER,
  previous_status TEXT,
  new_status TEXT,
  previous_pipeline_stage TEXT,
  new_pipeline_stage TEXT,
  workflow_id UUID,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  actions_triggered JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_disposition_metrics_user_id ON disposition_metrics(user_id);
CREATE INDEX idx_disposition_metrics_lead_id ON disposition_metrics(lead_id);
CREATE INDEX idx_disposition_metrics_disposition_name ON disposition_metrics(disposition_name);
CREATE INDEX idx_disposition_metrics_set_by ON disposition_metrics(set_by);
CREATE INDEX idx_disposition_metrics_created_at ON disposition_metrics(created_at);

-- Enable RLS
ALTER TABLE disposition_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policy
CREATE POLICY "Users can manage their own disposition metrics"
  ON disposition_metrics
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);