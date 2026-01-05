-- Add new columns to autonomous_settings for advanced autonomy features
ALTER TABLE public.autonomous_settings
ADD COLUMN IF NOT EXISTS autonomy_level text DEFAULT 'suggestions_only' CHECK (autonomy_level IN ('full_auto', 'approval_required', 'suggestions_only')),
ADD COLUMN IF NOT EXISTS daily_goal_appointments integer DEFAULT 5,
ADD COLUMN IF NOT EXISTS daily_goal_calls integer DEFAULT 100,
ADD COLUMN IF NOT EXISTS daily_goal_conversations integer DEFAULT 20,
ADD COLUMN IF NOT EXISTS learning_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS auto_optimize_campaigns boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_prioritize_leads boolean DEFAULT true;

-- Create learning_outcomes table to track decision outcomes for self-learning
CREATE TABLE IF NOT EXISTS public.learning_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  decision_id uuid REFERENCES public.agent_decisions(id) ON DELETE CASCADE,
  outcome_type text NOT NULL CHECK (outcome_type IN ('success', 'failure', 'neutral')),
  outcome_details jsonb DEFAULT '{}',
  learned_adjustment jsonb DEFAULT '{}',
  conversion_happened boolean DEFAULT false,
  response_time_seconds integer,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Create autonomous_goals table to track daily/weekly goals
CREATE TABLE IF NOT EXISTS public.autonomous_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_type text NOT NULL CHECK (goal_type IN ('daily', 'weekly')),
  goal_date date NOT NULL,
  appointments_target integer DEFAULT 5,
  appointments_achieved integer DEFAULT 0,
  calls_target integer DEFAULT 100,
  calls_achieved integer DEFAULT 0,
  conversations_target integer DEFAULT 20,
  conversations_achieved integer DEFAULT 0,
  goal_met boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, goal_type, goal_date)
);

-- Create lead_priority_scores table for autonomous prioritization
CREATE TABLE IF NOT EXISTS public.lead_priority_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  priority_score numeric DEFAULT 50,
  engagement_score numeric DEFAULT 0,
  recency_score numeric DEFAULT 0,
  sentiment_score numeric DEFAULT 50,
  best_contact_time text,
  best_contact_day text,
  factors jsonb DEFAULT '{}',
  last_calculated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, lead_id)
);

-- Enable RLS on new tables
ALTER TABLE public.learning_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.autonomous_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_priority_scores ENABLE ROW LEVEL SECURITY;

-- RLS policies for learning_outcomes
CREATE POLICY "Users can view their own learning outcomes"
ON public.learning_outcomes FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own learning outcomes"
ON public.learning_outcomes FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own learning outcomes"
ON public.learning_outcomes FOR UPDATE
USING (auth.uid() = user_id);

-- RLS policies for autonomous_goals
CREATE POLICY "Users can view their own autonomous goals"
ON public.autonomous_goals FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own autonomous goals"
ON public.autonomous_goals FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own autonomous goals"
ON public.autonomous_goals FOR UPDATE
USING (auth.uid() = user_id);

-- RLS policies for lead_priority_scores
CREATE POLICY "Users can view their own lead priority scores"
ON public.lead_priority_scores FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own lead priority scores"
ON public.lead_priority_scores FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own lead priority scores"
ON public.lead_priority_scores FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own lead priority scores"
ON public.lead_priority_scores FOR DELETE
USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_learning_outcomes_user_created ON public.learning_outcomes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_autonomous_goals_user_date ON public.autonomous_goals(user_id, goal_date DESC);
CREATE INDEX IF NOT EXISTS idx_lead_priority_scores_user_score ON public.lead_priority_scores(user_id, priority_score DESC);