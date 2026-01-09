-- Create edge_function_errors table for logging edge function errors
CREATE TABLE IF NOT EXISTS public.edge_function_errors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  function_name TEXT NOT NULL,
  error_message TEXT NOT NULL,
  stack_trace TEXT,
  request_context JSONB,
  user_id UUID,
  severity TEXT NOT NULL DEFAULT 'error',
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX idx_edge_function_errors_function_name ON public.edge_function_errors(function_name);
CREATE INDEX idx_edge_function_errors_created_at ON public.edge_function_errors(created_at DESC);
CREATE INDEX idx_edge_function_errors_user_id ON public.edge_function_errors(user_id);
CREATE INDEX idx_edge_function_errors_severity ON public.edge_function_errors(severity);

-- Enable RLS
ALTER TABLE public.edge_function_errors ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own errors
CREATE POLICY "Users can view their own edge function errors"
  ON public.edge_function_errors
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Admins can view all errors (using user_roles table)
CREATE POLICY "Admins can view all edge function errors"
  ON public.edge_function_errors
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Policy: Service role can insert (for edge functions)
CREATE POLICY "Service role can insert edge function errors"
  ON public.edge_function_errors
  FOR INSERT
  WITH CHECK (true);

-- Policy: Users can update (mark resolved) their own errors
CREATE POLICY "Users can update their own edge function errors"
  ON public.edge_function_errors
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Comment on table
COMMENT ON TABLE public.edge_function_errors IS 'Logs errors from Supabase Edge Functions for debugging and monitoring';