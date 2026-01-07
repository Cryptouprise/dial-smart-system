-- Agent Improvement History table - tracks all script changes, analysis insights, and notes per agent
CREATE TABLE public.agent_improvement_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  agent_id TEXT NOT NULL,
  agent_name TEXT,
  improvement_type TEXT NOT NULL CHECK (improvement_type IN ('script_update', 'analysis_insight', 'manual_note', 'auto_optimization', 'performance_review')),
  title TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  created_by TEXT DEFAULT 'user' CHECK (created_by IN ('user', 'lady_jarvis', 'autonomous')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Lady Jarvis Memory table - persistent memory across sessions
CREATE TABLE public.lj_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  memory_type TEXT NOT NULL CHECK (memory_type IN ('preference', 'fact', 'recent_action', 'learned_pattern')),
  memory_key TEXT NOT NULL,
  memory_value JSONB NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, memory_key)
);

-- Add new columns to autonomous_settings for script optimization
ALTER TABLE public.autonomous_settings 
ADD COLUMN IF NOT EXISTS auto_script_optimization BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS script_optimization_threshold INTEGER DEFAULT 50,
ADD COLUMN IF NOT EXISTS max_auto_script_changes_per_day INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS require_approval_for_script_changes BOOLEAN DEFAULT true;

-- Indexes for agent_improvement_history
CREATE INDEX idx_agent_improvement_user ON public.agent_improvement_history(user_id);
CREATE INDEX idx_agent_improvement_agent ON public.agent_improvement_history(agent_id);
CREATE INDEX idx_agent_improvement_type ON public.agent_improvement_history(improvement_type);
CREATE INDEX idx_agent_improvement_created ON public.agent_improvement_history(created_at DESC);

-- Indexes for lj_memory
CREATE INDEX idx_lj_memory_user ON public.lj_memory(user_id);
CREATE INDEX idx_lj_memory_type ON public.lj_memory(memory_type);
CREATE INDEX idx_lj_memory_key ON public.lj_memory(memory_key);

-- Enable RLS
ALTER TABLE public.agent_improvement_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lj_memory ENABLE ROW LEVEL SECURITY;

-- RLS Policies for agent_improvement_history
CREATE POLICY "Users can view own agent history" ON public.agent_improvement_history
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own agent history" ON public.agent_improvement_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own agent history" ON public.agent_improvement_history
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own agent history" ON public.agent_improvement_history
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for lj_memory
CREATE POLICY "Users can view own memories" ON public.lj_memory
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own memories" ON public.lj_memory
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own memories" ON public.lj_memory
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own memories" ON public.lj_memory
  FOR DELETE USING (auth.uid() = user_id);

-- Function to update lj_memory updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_lj_memory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger for lj_memory updated_at
CREATE TRIGGER update_lj_memory_timestamp
  BEFORE UPDATE ON public.lj_memory
  FOR EACH ROW
  EXECUTE FUNCTION public.update_lj_memory_updated_at();