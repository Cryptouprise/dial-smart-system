-- Edge Function Error Logging Table
-- Tracks all errors from edge functions for monitoring and debugging

CREATE TABLE IF NOT EXISTS public.edge_function_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  action text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  workflow_id uuid REFERENCES public.campaign_workflows(id) ON DELETE SET NULL,
  error_message text NOT NULL,
  error_stack text,
  request_payload jsonb,
  severity text NOT NULL CHECK (severity IN ('error', 'warning', 'critical')) DEFAULT 'error',
  resolved boolean DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_edge_errors_function ON public.edge_function_errors(function_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_edge_errors_unresolved ON public.edge_function_errors(resolved, severity, created_at DESC) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_edge_errors_user ON public.edge_function_errors(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_edge_errors_lead ON public.edge_function_errors(lead_id);

-- RLS Policies
ALTER TABLE public.edge_function_errors ENABLE ROW LEVEL SECURITY;

-- Users can view their own errors
CREATE POLICY "Users can view own errors"
  ON public.edge_function_errors
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can insert errors (from edge functions)
CREATE POLICY "Service role can insert errors"
  ON public.edge_function_errors
  FOR INSERT
  WITH CHECK (true);

-- Users can resolve their own errors
CREATE POLICY "Users can update own errors"
  ON public.edge_function_errors
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Comments
COMMENT ON TABLE public.edge_function_errors IS 'Tracks errors from edge functions for monitoring, debugging, and alerting';
COMMENT ON COLUMN public.edge_function_errors.severity IS 'error = normal error, warning = non-critical issue, critical = requires immediate attention';
COMMENT ON COLUMN public.edge_function_errors.request_payload IS 'JSON payload of the request that caused the error (for debugging)';

-- View for unresolved critical errors
CREATE OR REPLACE VIEW public.critical_errors_v AS
SELECT 
  function_name,
  COUNT(*) as error_count,
  MAX(created_at) as last_occurrence,
  array_agg(DISTINCT user_id) as affected_users
FROM public.edge_function_errors
WHERE resolved = false AND severity = 'critical'
  AND created_at > now() - interval '24 hours'
GROUP BY function_name
ORDER BY error_count DESC;

GRANT SELECT ON public.critical_errors_v TO authenticated;
