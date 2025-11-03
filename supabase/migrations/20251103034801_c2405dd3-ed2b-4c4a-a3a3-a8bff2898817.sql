-- ============================================
-- PIPELINE MANAGEMENT TABLES
-- ============================================

-- Create dispositions table
CREATE TABLE IF NOT EXISTS dispositions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#3B82F6',
  pipeline_stage TEXT NOT NULL,
  auto_actions JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE dispositions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for dispositions
CREATE POLICY "Users can view their own dispositions"
ON dispositions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own dispositions"
ON dispositions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own dispositions"
ON dispositions FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own dispositions"
ON dispositions FOR DELETE
USING (auth.uid() = user_id);

-- Create pipeline_boards table
CREATE TABLE IF NOT EXISTS pipeline_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  disposition_id UUID REFERENCES dispositions(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE pipeline_boards ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for pipeline_boards
CREATE POLICY "Users can view their own pipeline boards"
ON pipeline_boards FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own pipeline boards"
ON pipeline_boards FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own pipeline boards"
ON pipeline_boards FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own pipeline boards"
ON pipeline_boards FOR DELETE
USING (auth.uid() = user_id);

-- Create lead_pipeline_positions table
CREATE TABLE IF NOT EXISTS lead_pipeline_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
  pipeline_board_id UUID REFERENCES pipeline_boards(id) ON DELETE CASCADE NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  moved_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  moved_by_user BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(lead_id, pipeline_board_id)
);

-- Enable RLS
ALTER TABLE lead_pipeline_positions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for lead_pipeline_positions
CREATE POLICY "Users can view their own lead positions"
ON lead_pipeline_positions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own lead positions"
ON lead_pipeline_positions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own lead positions"
ON lead_pipeline_positions FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own lead positions"
ON lead_pipeline_positions FOR DELETE
USING (auth.uid() = user_id);

-- Add triggers for updated_at
CREATE TRIGGER update_dispositions_updated_at
BEFORE UPDATE ON dispositions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pipeline_boards_updated_at
BEFORE UPDATE ON pipeline_boards
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_dispositions_user_id ON dispositions(user_id);
CREATE INDEX idx_pipeline_boards_user_id ON pipeline_boards(user_id);
CREATE INDEX idx_pipeline_boards_disposition_id ON pipeline_boards(disposition_id);
CREATE INDEX idx_lead_pipeline_positions_user_id ON lead_pipeline_positions(user_id);
CREATE INDEX idx_lead_pipeline_positions_lead_id ON lead_pipeline_positions(lead_id);
CREATE INDEX idx_lead_pipeline_positions_board_id ON lead_pipeline_positions(pipeline_board_id);