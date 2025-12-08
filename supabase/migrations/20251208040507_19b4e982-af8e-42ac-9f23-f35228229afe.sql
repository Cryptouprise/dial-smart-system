-- Lead Reachability Scores - AI-powered contact probability scoring
CREATE TABLE public.lead_reachability_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  reachability_score NUMERIC NOT NULL DEFAULT 50, -- 0-100 percentage
  confidence_level NUMERIC DEFAULT 50, -- How confident the AI is (more data = higher confidence)
  total_call_attempts INTEGER DEFAULT 0,
  successful_calls INTEGER DEFAULT 0,
  voicemails_left INTEGER DEFAULT 0,
  sms_sent INTEGER DEFAULT 0,
  sms_replies INTEGER DEFAULT 0,
  emails_sent INTEGER DEFAULT 0,
  emails_opened INTEGER DEFAULT 0,
  last_successful_contact TIMESTAMP WITH TIME ZONE,
  best_contact_time TEXT, -- AI-learned best time to contact
  best_contact_day TEXT, -- AI-learned best day to contact
  preferred_channel TEXT, -- call, sms, email based on response rates
  decay_applied BOOLEAN DEFAULT false,
  score_factors JSONB DEFAULT '{}'::jsonb, -- Detailed breakdown of scoring factors
  ai_notes TEXT, -- AI-generated insights about this lead
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, lead_id)
);

-- Reachability Learning Events - Track every interaction for ML learning
CREATE TABLE public.reachability_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- call_attempt, call_connected, voicemail, sms_sent, sms_reply, email_sent, email_opened
  event_outcome TEXT, -- success, no_answer, busy, voicemail, replied, opened, bounced
  caller_id TEXT, -- Which number was used
  contact_time TIME, -- What time the attempt was made
  contact_day TEXT, -- What day of week
  duration_seconds INTEGER, -- For calls
  response_time_minutes INTEGER, -- How long until they responded (for SMS/email)
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- AI Workflow Generations - Track AI-generated workflows for learning
CREATE TABLE public.ai_workflow_generations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  user_prompt TEXT NOT NULL, -- What the user asked for
  generated_workflow_id UUID REFERENCES public.campaign_workflows(id) ON DELETE SET NULL,
  generated_steps JSONB NOT NULL, -- The steps that were generated
  user_feedback TEXT, -- good, bad, modified
  modifications_made JSONB, -- What the user changed (for learning)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.lead_reachability_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reachability_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_workflow_generations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can manage their own reachability scores" ON public.lead_reachability_scores FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own reachability events" ON public.reachability_events FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own AI generations" ON public.ai_workflow_generations FOR ALL USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX idx_reachability_scores_lead ON public.lead_reachability_scores(lead_id);
CREATE INDEX idx_reachability_scores_score ON public.lead_reachability_scores(reachability_score);
CREATE INDEX idx_reachability_events_lead ON public.reachability_events(lead_id);
CREATE INDEX idx_reachability_events_type ON public.reachability_events(event_type);
CREATE INDEX idx_reachability_events_time ON public.reachability_events(created_at DESC);