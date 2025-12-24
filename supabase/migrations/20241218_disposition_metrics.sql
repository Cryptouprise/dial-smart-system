-- Disposition Metrics Table
-- Tracks disposition events for analytics and optimization

CREATE TABLE IF NOT EXISTS public.disposition_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  call_id uuid REFERENCES public.call_logs(id) ON DELETE SET NULL,
  disposition_id uuid REFERENCES public.dispositions(id) ON DELETE SET NULL,
  disposition_name text NOT NULL,
  
  -- Who/what set the disposition
  set_by text NOT NULL CHECK (set_by IN ('ai', 'manual', 'automation')),
  set_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- AI confidence (if applicable)
  ai_confidence_score numeric(5,2), -- 0-100
  
  -- Timing metrics
  call_ended_at timestamptz,
  disposition_set_at timestamptz NOT NULL DEFAULT now(),
  time_to_disposition_seconds integer, -- seconds between call end and disposition set
  
  -- State changes
  previous_status text,
  new_status text,
  previous_pipeline_stage text,
  new_pipeline_stage text,
  
  -- Workflow tracking
  workflow_id uuid REFERENCES public.campaign_workflows(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  
  -- Auto-actions triggered
  actions_triggered jsonb DEFAULT '[]'::jsonb, -- Array of action types executed
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_disposition_metrics_user_id ON public.disposition_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_disposition_metrics_lead_id ON public.disposition_metrics(lead_id);
CREATE INDEX IF NOT EXISTS idx_disposition_metrics_call_id ON public.disposition_metrics(call_id);
CREATE INDEX IF NOT EXISTS idx_disposition_metrics_disposition_name ON public.disposition_metrics(disposition_name);
CREATE INDEX IF NOT EXISTS idx_disposition_metrics_set_by ON public.disposition_metrics(set_by);
CREATE INDEX IF NOT EXISTS idx_disposition_metrics_created_at ON public.disposition_metrics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_disposition_metrics_workflow_id ON public.disposition_metrics(workflow_id);

-- RLS Policies
ALTER TABLE public.disposition_metrics ENABLE ROW LEVEL SECURITY;

-- Users can view their own disposition metrics
CREATE POLICY "Users can view own disposition metrics"
  ON public.disposition_metrics
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can insert disposition metrics (from edge functions)
CREATE POLICY "Service role can insert disposition metrics"
  ON public.disposition_metrics
  FOR INSERT
  WITH CHECK (true);

-- Service role can update disposition metrics
CREATE POLICY "Service role can update disposition metrics"
  ON public.disposition_metrics
  FOR UPDATE
  USING (true);

-- Add comment
COMMENT ON TABLE public.disposition_metrics IS 'Tracks all disposition events with metrics for analytics and performance optimization';

-- Helper view for analytics
CREATE OR REPLACE VIEW public.disposition_analytics AS
SELECT 
  dm.user_id,
  dm.disposition_name,
  dm.set_by,
  COUNT(*) as total_count,
  AVG(dm.ai_confidence_score) as avg_confidence,
  AVG(dm.time_to_disposition_seconds) as avg_time_to_disposition,
  COUNT(CASE WHEN dm.set_by = 'ai' THEN 1 END) as ai_count,
  COUNT(CASE WHEN dm.set_by = 'manual' THEN 1 END) as manual_count,
  DATE(dm.created_at) as date
FROM public.disposition_metrics dm
GROUP BY dm.user_id, dm.disposition_name, dm.set_by, DATE(dm.created_at);

-- Grant access to view
GRANT SELECT ON public.disposition_analytics TO authenticated;
GRANT SELECT ON public.disposition_analytics TO service_role;
