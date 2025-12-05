-- Agent Scripts Table (stores scripts for each agent)
CREATE TABLE public.agent_scripts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  agent_id TEXT, -- Retell AI agent ID (optional, can be null for manual scripts)
  agent_name TEXT NOT NULL,
  script_name TEXT NOT NULL,
  script_type TEXT NOT NULL DEFAULT 'call' CHECK (script_type IN ('call', 'sms', 'email')),
  script_content TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Script Usage Logs Table (tracks performance of scripts)
CREATE TABLE public.script_usage_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  script_id UUID NOT NULL REFERENCES public.agent_scripts(id) ON DELETE CASCADE,
  agent_id TEXT,
  call_id UUID REFERENCES public.call_logs(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  outcome TEXT, -- 'positive', 'negative', 'neutral'
  disposition TEXT,
  call_duration INTEGER, -- in seconds
  conversion_achieved BOOLEAN DEFAULT false,
  sentiment_score DECIMAL(3,2), -- -1 to 1
  notes TEXT,
  used_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Script Performance Metrics (aggregated view)
CREATE TABLE public.script_performance_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  script_id UUID NOT NULL REFERENCES public.agent_scripts(id) ON DELETE CASCADE,
  total_uses INTEGER DEFAULT 0,
  positive_outcomes INTEGER DEFAULT 0,
  negative_outcomes INTEGER DEFAULT 0,
  neutral_outcomes INTEGER DEFAULT 0,
  conversion_rate DECIMAL(5,2) DEFAULT 0.00,
  average_call_duration INTEGER DEFAULT 0,
  average_sentiment DECIMAL(3,2) DEFAULT 0.00,
  performance_score INTEGER DEFAULT 0, -- 0-100
  last_calculated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(script_id)
);

-- Script Suggestions Table (AI-generated improvement suggestions)
CREATE TABLE public.script_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  script_id UUID NOT NULL REFERENCES public.agent_scripts(id) ON DELETE CASCADE,
  current_performance JSONB, -- stores current metrics
  suggested_script TEXT NOT NULL,
  reasoning TEXT[],
  expected_improvement TEXT,
  based_on_data JSONB, -- stores the data that led to this suggestion
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'rejected', 'testing')),
  applied_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agent_scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.script_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.script_performance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.script_suggestions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for agent_scripts
CREATE POLICY "Users can manage their own scripts"
ON public.agent_scripts FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for script_usage_logs
CREATE POLICY "Users can view their own script usage"
ON public.script_usage_logs FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own script usage logs"
ON public.script_usage_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for script_performance_metrics
CREATE POLICY "Users can view their own script metrics"
ON public.script_performance_metrics FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own script metrics"
ON public.script_performance_metrics FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for script_suggestions
CREATE POLICY "Users can manage their own script suggestions"
ON public.script_suggestions FOR ALL USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_agent_scripts_user ON public.agent_scripts(user_id, is_active);
CREATE INDEX idx_script_usage_logs_script ON public.script_usage_logs(script_id, used_at DESC);
CREATE INDEX idx_script_performance_script ON public.script_performance_metrics(script_id);
CREATE INDEX idx_script_suggestions_script_status ON public.script_suggestions(script_id, status);

-- Function to update script performance metrics
CREATE OR REPLACE FUNCTION update_script_performance_metrics()
RETURNS TRIGGER AS $$
DECLARE
  v_total INTEGER;
  v_positive INTEGER;
  v_negative INTEGER;
  v_neutral INTEGER;
  v_avg_duration INTEGER;
  v_avg_sentiment DECIMAL(3,2);
  v_conversion_rate DECIMAL(5,2);
  v_performance_score INTEGER;
BEGIN
  -- Calculate aggregated metrics
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE outcome = 'positive'),
    COUNT(*) FILTER (WHERE outcome = 'negative'),
    COUNT(*) FILTER (WHERE outcome = 'neutral'),
    COALESCE(AVG(call_duration), 0)::INTEGER,
    COALESCE(AVG(sentiment_score), 0.00)::DECIMAL(3,2),
    COALESCE((COUNT(*) FILTER (WHERE conversion_achieved = true)::DECIMAL / NULLIF(COUNT(*), 0)) * 100, 0.00)::DECIMAL(5,2)
  INTO
    v_total,
    v_positive,
    v_negative,
    v_neutral,
    v_avg_duration,
    v_avg_sentiment,
    v_conversion_rate
  FROM public.script_usage_logs
  WHERE script_id = NEW.script_id;

  -- Calculate performance score (0-100)
  v_performance_score := LEAST(100, GREATEST(0, 
    (v_conversion_rate * 0.4)::INTEGER + 
    (CASE WHEN v_total > 0 THEN ((v_positive::DECIMAL / v_total) * 30)::INTEGER ELSE 0 END) +
    (CASE WHEN v_avg_sentiment >= 0 THEN (v_avg_sentiment * 15)::INTEGER ELSE 0 END) +
    (CASE WHEN v_avg_duration >= 60 THEN 15 ELSE (v_avg_duration::DECIMAL / 4)::INTEGER END)
  ));

  -- Upsert metrics
  INSERT INTO public.script_performance_metrics (
    user_id, script_id, total_uses, positive_outcomes, negative_outcomes, neutral_outcomes,
    conversion_rate, average_call_duration, average_sentiment, performance_score, last_calculated_at
  ) VALUES (
    NEW.user_id, NEW.script_id, v_total, v_positive, v_negative, v_neutral,
    v_conversion_rate, v_avg_duration, v_avg_sentiment, v_performance_score, NOW()
  )
  ON CONFLICT (script_id) DO UPDATE SET
    total_uses = v_total,
    positive_outcomes = v_positive,
    negative_outcomes = v_negative,
    neutral_outcomes = v_neutral,
    conversion_rate = v_conversion_rate,
    average_call_duration = v_avg_duration,
    average_sentiment = v_avg_sentiment,
    performance_score = v_performance_score,
    last_calculated_at = NOW(),
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update metrics when usage logs are inserted
CREATE TRIGGER update_metrics_on_script_usage
AFTER INSERT ON public.script_usage_logs
FOR EACH ROW
EXECUTE FUNCTION update_script_performance_metrics();

-- Trigger for updated_at columns
CREATE TRIGGER update_agent_scripts_updated_at
BEFORE UPDATE ON public.agent_scripts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_script_performance_metrics_updated_at
BEFORE UPDATE ON public.script_performance_metrics
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
