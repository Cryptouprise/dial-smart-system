-- Create daily reports table
CREATE TABLE public.daily_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,
  report_type TEXT NOT NULL DEFAULT 'daily',
  
  -- Metrics
  total_calls INTEGER DEFAULT 0,
  connected_calls INTEGER DEFAULT 0,
  answer_rate NUMERIC DEFAULT 0,
  avg_call_duration INTEGER DEFAULT 0,
  appointments_set INTEGER DEFAULT 0,
  callbacks_scheduled INTEGER DEFAULT 0,
  dnc_added INTEGER DEFAULT 0,
  sms_sent INTEGER DEFAULT 0,
  sms_received INTEGER DEFAULT 0,
  
  -- AI Analysis
  summary TEXT,
  wins TEXT[],
  improvements TEXT[],
  failures TEXT[],
  recommendations TEXT[],
  performance_score INTEGER DEFAULT 0,
  
  -- Metadata
  raw_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  UNIQUE(user_id, report_date, report_type)
);

-- Enable RLS
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own reports"
  ON public.daily_reports FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert reports"
  ON public.daily_reports FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update reports"
  ON public.daily_reports FOR UPDATE
  USING (true);

-- Index for fast lookups
CREATE INDEX idx_daily_reports_user_date ON public.daily_reports(user_id, report_date DESC);