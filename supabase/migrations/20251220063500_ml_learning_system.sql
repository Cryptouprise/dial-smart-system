-- ML Learning Data Table for Self-Improving System
CREATE TABLE IF NOT EXISTS ml_learning_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  call_id UUID REFERENCES call_logs(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  call_outcome TEXT NOT NULL,
  disposition TEXT NOT NULL,
  lead_converted BOOLEAN DEFAULT FALSE,
  script_used TEXT,
  agent_id UUID REFERENCES retell_agents(id) ON DELETE SET NULL,
  sentiment_score DECIMAL(3,2),
  confidence_score DECIMAL(3,2),
  time_to_conversion INTEGER,
  call_duration INTEGER,
  key_points JSONB,
  objections JSONB,
  pain_points JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_ml_learning_user_id ON ml_learning_data(user_id);
CREATE INDEX IF NOT EXISTS idx_ml_learning_created_at ON ml_learning_data(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ml_learning_disposition ON ml_learning_data(disposition);
CREATE INDEX IF NOT EXISTS idx_ml_learning_outcome ON ml_learning_data(call_outcome);
CREATE INDEX IF NOT EXISTS idx_ml_learning_converted ON ml_learning_data(lead_converted);

-- RLS Policies
ALTER TABLE ml_learning_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own learning data"
  ON ml_learning_data FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own learning data"
  ON ml_learning_data FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Script Performance Analytics Table
CREATE TABLE IF NOT EXISTS script_performance_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  script_name TEXT NOT NULL,
  script_version INTEGER DEFAULT 1,
  total_calls INTEGER DEFAULT 0,
  successful_calls INTEGER DEFAULT 0,
  success_rate DECIMAL(5,2) DEFAULT 0,
  avg_call_duration INTEGER,
  avg_sentiment_score DECIMAL(3,2),
  conversion_rate DECIMAL(5,2) DEFAULT 0,
  appointment_rate DECIMAL(5,2) DEFAULT 0,
  objection_count INTEGER DEFAULT 0,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_script_performance_user_id ON script_performance_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_script_performance_script ON script_performance_analytics(script_name);

-- RLS Policies for script performance
ALTER TABLE script_performance_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own script analytics"
  ON script_performance_analytics FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own script analytics"
  ON script_performance_analytics FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own script analytics"
  ON script_performance_analytics FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Disposition Accuracy Tracking Table
CREATE TABLE IF NOT EXISTS disposition_accuracy_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  disposition_name TEXT NOT NULL,
  auto_predicted_count INTEGER DEFAULT 0,
  correct_predictions INTEGER DEFAULT 0,
  accuracy_rate DECIMAL(5,2) DEFAULT 0,
  avg_confidence DECIMAL(3,2) DEFAULT 0,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_disposition_accuracy_user_id ON disposition_accuracy_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_disposition_accuracy_name ON disposition_accuracy_tracking(disposition_name);

-- RLS Policies
ALTER TABLE disposition_accuracy_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own disposition accuracy"
  ON disposition_accuracy_tracking FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own disposition accuracy"
  ON disposition_accuracy_tracking FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own disposition accuracy"
  ON disposition_accuracy_tracking FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- System Optimization Insights Table
CREATE TABLE IF NOT EXISTS system_optimization_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL, -- 'script', 'disposition', 'timing', 'lead_scoring'
  insight_category TEXT NOT NULL, -- 'recommendation', 'warning', 'success'
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority INTEGER DEFAULT 5, -- 1-10, higher is more important
  data JSONB,
  is_read BOOLEAN DEFAULT FALSE,
  is_applied BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_optimization_insights_user_id ON system_optimization_insights(user_id);
CREATE INDEX IF NOT EXISTS idx_optimization_insights_type ON system_optimization_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_optimization_insights_priority ON system_optimization_insights(priority DESC);
CREATE INDEX IF NOT EXISTS idx_optimization_insights_created ON system_optimization_insights(created_at DESC);

-- RLS Policies
ALTER TABLE system_optimization_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own insights"
  ON system_optimization_insights FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own insights"
  ON system_optimization_insights FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own insights"
  ON system_optimization_insights FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own insights"
  ON system_optimization_insights FOR DELETE
  USING (auth.uid() = user_id);
