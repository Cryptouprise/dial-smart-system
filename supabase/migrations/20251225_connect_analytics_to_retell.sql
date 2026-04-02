-- Add agent_id to call_logs to track which Retell agent was used
-- This enables analytics feedback loop to improve agents over time
ALTER TABLE public.call_logs 
ADD COLUMN IF NOT EXISTS agent_id TEXT;

-- Add comment explaining the field
COMMENT ON COLUMN public.call_logs.agent_id IS 'Retell AI agent ID used for this call - enables performance tracking and agent improvement';

-- Create index for performance when querying by agent
CREATE INDEX IF NOT EXISTS idx_call_logs_agent_id ON public.call_logs(agent_id);

-- Add agent_id to campaign_scripts to link scripts to specific Retell agents
-- This was already in the schema but ensuring it exists
ALTER TABLE public.campaign_scripts 
ADD COLUMN IF NOT EXISTS agent_id TEXT;

COMMENT ON COLUMN public.campaign_scripts.agent_id IS 'Retell AI agent ID associated with this script';

-- Create agent_performance_metrics table for tracking Retell agent performance
CREATE TABLE IF NOT EXISTS public.agent_performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  agent_name TEXT,
  total_calls INTEGER DEFAULT 0,
  successful_calls INTEGER DEFAULT 0,
  success_rate DECIMAL(5,2) DEFAULT 0,
  avg_call_duration INTEGER,
  avg_sentiment_score DECIMAL(3,2),
  conversion_rate DECIMAL(5,2) DEFAULT 0,
  appointment_rate DECIMAL(5,2) DEFAULT 0,
  common_objections JSONB,
  best_performing_scripts TEXT[],
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, agent_id)
);

-- Add indexes for agent performance
CREATE INDEX IF NOT EXISTS idx_agent_performance_user_id ON public.agent_performance_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_performance_agent_id ON public.agent_performance_metrics(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_performance_success_rate ON public.agent_performance_metrics(success_rate DESC);

-- RLS Policies for agent performance metrics
ALTER TABLE public.agent_performance_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own agent metrics"
  ON public.agent_performance_metrics FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own agent metrics"
  ON public.agent_performance_metrics FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own agent metrics"
  ON public.agent_performance_metrics FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create function to update agent performance metrics
CREATE OR REPLACE FUNCTION update_agent_performance_metrics()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process if we have an agent_id and the call is completed
  IF NEW.agent_id IS NOT NULL AND NEW.status = 'completed' THEN
    INSERT INTO public.agent_performance_metrics (
      user_id,
      agent_id,
      total_calls,
      successful_calls,
      avg_call_duration
    )
    VALUES (
      NEW.user_id,
      NEW.agent_id,
      1,
      CASE WHEN NEW.outcome IN ('interested', 'hot_lead', 'appointment_booked') THEN 1 ELSE 0 END,
      NEW.duration_seconds
    )
    ON CONFLICT (user_id, agent_id)
    DO UPDATE SET
      total_calls = agent_performance_metrics.total_calls + 1,
      successful_calls = agent_performance_metrics.successful_calls + 
        CASE WHEN NEW.outcome IN ('interested', 'hot_lead', 'appointment_booked') THEN 1 ELSE 0 END,
      success_rate = CASE 
        WHEN (agent_performance_metrics.total_calls + 1) > 0 THEN
          ROUND(
            (agent_performance_metrics.successful_calls::DECIMAL + 
              CASE WHEN NEW.outcome IN ('interested', 'hot_lead', 'appointment_booked') THEN 1 ELSE 0 END) / 
            (agent_performance_metrics.total_calls + 1) * 100, 
            2
          )
        ELSE 0
      END,
      avg_call_duration = CASE
        WHEN agent_performance_metrics.total_calls > 0 THEN
          ROUND(
            (COALESCE(agent_performance_metrics.avg_call_duration, 0) * agent_performance_metrics.total_calls + 
              COALESCE(NEW.duration_seconds, 0)) / 
            (agent_performance_metrics.total_calls + 1)
          )
        ELSE COALESCE(NEW.duration_seconds, 0)
      END,
      last_updated = NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update agent performance
DROP TRIGGER IF EXISTS trigger_update_agent_performance ON public.call_logs;
CREATE TRIGGER trigger_update_agent_performance
  AFTER INSERT OR UPDATE ON public.call_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_performance_metrics();

-- Create view for easy agent performance analysis
CREATE OR REPLACE VIEW agent_performance_summary AS
SELECT 
  apm.user_id,
  apm.agent_id,
  apm.agent_name,
  apm.total_calls,
  apm.successful_calls,
  apm.success_rate,
  apm.avg_call_duration,
  apm.conversion_rate,
  apm.appointment_rate,
  COUNT(DISTINCT cl.lead_id) as unique_leads_contacted,
  COUNT(CASE WHEN cl.outcome = 'hot_lead' THEN 1 END) as hot_leads,
  COUNT(CASE WHEN cl.outcome = 'appointment_booked' THEN 1 END) as appointments_booked,
  apm.last_updated
FROM public.agent_performance_metrics apm
LEFT JOIN public.call_logs cl ON cl.agent_id = apm.agent_id AND cl.user_id = apm.user_id
GROUP BY apm.user_id, apm.agent_id, apm.agent_name, apm.total_calls, 
         apm.successful_calls, apm.success_rate, apm.avg_call_duration,
         apm.conversion_rate, apm.appointment_rate, apm.last_updated;

COMMENT ON VIEW agent_performance_summary IS 'Comprehensive view of agent performance metrics for analytics dashboard';
