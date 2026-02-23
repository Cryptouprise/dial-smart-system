
-- Create telnyx_conversation_insights table for storing post-call AI insights
CREATE TABLE public.telnyx_conversation_insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  telnyx_conversation_id TEXT,
  telnyx_assistant_id TEXT,
  telnyx_insight_group_id TEXT,
  call_log_id UUID REFERENCES public.call_logs(id),
  lead_id UUID REFERENCES public.leads(id),
  insights JSONB,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.telnyx_conversation_insights ENABLE ROW LEVEL SECURITY;

-- Users can view their own insights
CREATE POLICY "Users can view their own telnyx insights"
  ON public.telnyx_conversation_insights FOR SELECT
  USING (auth.uid() = user_id);

-- Service role inserts (webhook), users can also insert their own
CREATE POLICY "Users can insert their own telnyx insights"
  ON public.telnyx_conversation_insights FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Index for lookups
CREATE INDEX idx_telnyx_insights_user_id ON public.telnyx_conversation_insights(user_id);
CREATE INDEX idx_telnyx_insights_conversation ON public.telnyx_conversation_insights(telnyx_conversation_id);
