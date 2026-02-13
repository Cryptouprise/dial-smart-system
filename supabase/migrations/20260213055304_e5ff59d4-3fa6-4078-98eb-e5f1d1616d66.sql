
-- Campaign Strategist: Complete migration

-- 1. Settings columns
ALTER TABLE public.autonomous_settings 
  ADD COLUMN IF NOT EXISTS enable_daily_planning BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_strategic_insights BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS daily_budget_cents INTEGER DEFAULT 50000,
  ADD COLUMN IF NOT EXISTS auto_create_rules_from_insights BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS insight_confidence_threshold NUMERIC DEFAULT 0.75,
  ADD COLUMN IF NOT EXISTS briefing_frequency TEXT DEFAULT 'daily';

-- 2. Daily Battle Plans
CREATE TABLE IF NOT EXISTS public.daily_battle_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  plan_date DATE NOT NULL DEFAULT CURRENT_DATE,
  executive_summary TEXT,
  priority_order JSONB DEFAULT '[]'::jsonb,
  budget_allocation JSONB DEFAULT '{}'::jsonb,
  number_allocation JSONB DEFAULT '{}'::jsonb,
  time_blocks JSONB DEFAULT '[]'::jsonb,
  risk_factors JSONB DEFAULT '[]'::jsonb,
  expected_outcomes JSONB DEFAULT '{}'::jsonb,
  actual_outcomes JSONB DEFAULT '{}'::jsonb,
  adherence_score NUMERIC,
  resource_inventory JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, plan_date)
);
ALTER TABLE public.daily_battle_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own battle plans" ON public.daily_battle_plans FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3. Strategic Insights
CREATE TABLE IF NOT EXISTS public.strategic_insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  insight_type TEXT NOT NULL,
  pattern_description TEXT NOT NULL,
  confidence NUMERIC NOT NULL DEFAULT 0,
  sample_size INTEGER NOT NULL DEFAULT 0,
  effect_magnitude NUMERIC,
  recommended_action TEXT,
  statistical_backing JSONB DEFAULT '{}'::jsonb,
  auto_rule_created BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.strategic_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own insights" ON public.strategic_insights FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4. Insight Generated Rules
CREATE TABLE IF NOT EXISTS public.insight_generated_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  insight_id UUID REFERENCES public.strategic_insights(id),
  rule_type TEXT NOT NULL,
  rule_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  performance_score NUMERIC,
  times_fired INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.insight_generated_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own generated rules" ON public.insight_generated_rules FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 5. Strategic Briefings
CREATE TABLE IF NOT EXISTS public.strategic_briefings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  briefing_type TEXT NOT NULL DEFAULT 'daily',
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  headline TEXT,
  executive_summary TEXT,
  wins JSONB DEFAULT '[]'::jsonb,
  concerns JSONB DEFAULT '[]'::jsonb,
  recommendations JSONB DEFAULT '[]'::jsonb,
  action_items JSONB DEFAULT '[]'::jsonb,
  metrics_current JSONB DEFAULT '{}'::jsonb,
  metrics_previous JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.strategic_briefings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own briefings" ON public.strategic_briefings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 6. View
DROP VIEW IF EXISTS public.call_outcome_dimensions CASCADE;
CREATE VIEW public.call_outcome_dimensions AS
SELECT 
  cl.id as call_id, cl.user_id, cl.lead_id, cl.outcome, cl.duration_seconds, cl.sentiment,
  cl.created_at as call_time,
  EXTRACT(DOW FROM cl.created_at) as day_of_week,
  EXTRACT(HOUR FROM cl.created_at) as hour_of_day,
  cl.caller_id as from_number, cl.phone_number as to_number,
  cl.agent_id, cl.campaign_id,
  l.lead_source, l.status as lead_status
FROM public.call_logs cl
LEFT JOIN public.leads l ON cl.lead_id = l.id;

-- 7. Indexes
CREATE INDEX IF NOT EXISTS idx_battle_plans_user_date ON public.daily_battle_plans(user_id, plan_date DESC);
CREATE INDEX IF NOT EXISTS idx_strategic_insights_user ON public.strategic_insights(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_strategic_briefings_user ON public.strategic_briefings(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_insight_rules_user ON public.insight_generated_rules(user_id, is_active);
