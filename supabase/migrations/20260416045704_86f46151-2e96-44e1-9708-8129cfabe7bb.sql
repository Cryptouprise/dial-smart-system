
-- Add cost tracking columns to call_logs
ALTER TABLE public.call_logs 
  ADD COLUMN IF NOT EXISTS retell_cost_cents INTEGER,
  ADD COLUMN IF NOT EXISTS cost_breakdown JSONB,
  ADD COLUMN IF NOT EXISTS token_usage JSONB;

-- Add index for cost queries
CREATE INDEX IF NOT EXISTS idx_call_logs_retell_cost ON public.call_logs (campaign_id, retell_cost_cents) WHERE retell_cost_cents IS NOT NULL;
