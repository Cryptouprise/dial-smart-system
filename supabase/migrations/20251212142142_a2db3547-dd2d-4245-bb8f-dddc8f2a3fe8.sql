-- AI Feedback table (thumbs up/down on responses)
CREATE TABLE public.ai_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  response_id TEXT NOT NULL,
  rating TEXT NOT NULL CHECK (rating IN ('up', 'down')),
  message_content TEXT,
  response_content TEXT,
  context JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- AI Learning table (patterns, preferences, success tracking)
CREATE TABLE public.ai_learning (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  pattern_type TEXT NOT NULL,
  pattern_key TEXT NOT NULL,
  pattern_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- AI Session Memory (tracks what AI did in current session)
CREATE TABLE public.ai_session_memory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  session_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  resource_id TEXT,
  resource_type TEXT,
  resource_name TEXT,
  can_undo BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- AI Daily Insights (self-review data)
CREATE TABLE public.ai_daily_insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  insight_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_interactions INTEGER DEFAULT 0,
  positive_feedback INTEGER DEFAULT 0,
  negative_feedback INTEGER DEFAULT 0,
  top_actions JSONB DEFAULT '[]'::jsonb,
  patterns_learned JSONB DEFAULT '[]'::jsonb,
  recommendations JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, insight_date)
);

-- Enable RLS
ALTER TABLE public.ai_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_learning ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_session_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_daily_insights ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ai_feedback
CREATE POLICY "Users can manage their own feedback" ON public.ai_feedback
  FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for ai_learning
CREATE POLICY "Users can manage their own learning data" ON public.ai_learning
  FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for ai_session_memory
CREATE POLICY "Users can manage their own session memory" ON public.ai_session_memory
  FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for ai_daily_insights
CREATE POLICY "Users can manage their own insights" ON public.ai_daily_insights
  FOR ALL USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX idx_ai_feedback_user_id ON public.ai_feedback(user_id);
CREATE INDEX idx_ai_learning_user_pattern ON public.ai_learning(user_id, pattern_type);
CREATE INDEX idx_ai_session_memory_session ON public.ai_session_memory(user_id, session_id);
CREATE INDEX idx_ai_daily_insights_date ON public.ai_daily_insights(user_id, insight_date);

-- Trigger for updated_at on ai_learning
CREATE TRIGGER update_ai_learning_updated_at
  BEFORE UPDATE ON public.ai_learning
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for updated_at on ai_daily_insights
CREATE TRIGGER update_ai_daily_insights_updated_at
  BEFORE UPDATE ON public.ai_daily_insights
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();