-- Create system_alerts table for monitoring and alerting
CREATE TABLE public.system_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  alert_type TEXT NOT NULL, -- 'campaign_error', 'high_error_rate', 'stuck_calls', 'api_limit', 'budget_warning'
  severity TEXT NOT NULL DEFAULT 'warning', -- 'info', 'warning', 'error', 'critical'
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  related_id TEXT, -- campaign_id, broadcast_id, etc.
  related_type TEXT, -- 'campaign', 'broadcast', 'phone_number'
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  auto_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_alerts ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own alerts"
  ON public.system_alerts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own alerts"
  ON public.system_alerts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert alerts"
  ON public.system_alerts FOR INSERT
  WITH CHECK (true);

-- Create calendar_tool_invocations table for audit trail
CREATE TABLE public.calendar_tool_invocations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  parameters JSONB DEFAULT '{}',
  result JSONB DEFAULT '{}',
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.calendar_tool_invocations ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own calendar invocations"
  ON public.calendar_tool_invocations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert calendar invocations"
  ON public.calendar_tool_invocations FOR INSERT
  WITH CHECK (true);

-- Add indexes for performance
CREATE INDEX idx_system_alerts_user_id ON public.system_alerts(user_id);
CREATE INDEX idx_system_alerts_created_at ON public.system_alerts(created_at DESC);
CREATE INDEX idx_system_alerts_unacknowledged ON public.system_alerts(user_id, acknowledged) WHERE NOT acknowledged;
CREATE INDEX idx_calendar_tool_invocations_user_id ON public.calendar_tool_invocations(user_id);
CREATE INDEX idx_calendar_appointments_user_start ON public.calendar_appointments(user_id, start_time);
CREATE INDEX idx_broadcast_queue_status ON public.broadcast_queue(broadcast_id, status);
CREATE INDEX idx_broadcast_queue_calling ON public.broadcast_queue(broadcast_id, status, updated_at) WHERE status = 'calling';