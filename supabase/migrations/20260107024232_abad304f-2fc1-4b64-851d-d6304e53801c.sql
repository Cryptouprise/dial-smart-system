-- Create smart_lists table for saved filters/segments
CREATE TABLE smart_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  filters JSONB NOT NULL DEFAULT '{}',
  is_dynamic BOOLEAN DEFAULT true,
  lead_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create lead_list_memberships for static list membership
CREATE TABLE lead_list_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  smart_list_id UUID REFERENCES smart_lists(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(smart_list_id, lead_id)
);

-- Enable RLS on both tables
ALTER TABLE smart_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_list_memberships ENABLE ROW LEVEL SECURITY;

-- Smart lists policies
CREATE POLICY "Users can view their own smart lists"
  ON smart_lists FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own smart lists"
  ON smart_lists FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own smart lists"
  ON smart_lists FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own smart lists"
  ON smart_lists FOR DELETE USING (auth.uid() = user_id);

-- Lead list memberships policies (access via smart list ownership)
CREATE POLICY "Users can view memberships of their lists"
  ON lead_list_memberships FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM smart_lists WHERE id = smart_list_id AND user_id = auth.uid()
  ));

CREATE POLICY "Users can add to their lists"
  ON lead_list_memberships FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM smart_lists WHERE id = smart_list_id AND user_id = auth.uid()
  ));

CREATE POLICY "Users can remove from their lists"
  ON lead_list_memberships FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM smart_lists WHERE id = smart_list_id AND user_id = auth.uid()
  ));

-- Add indexes for performance
CREATE INDEX idx_smart_lists_user_id ON smart_lists(user_id);
CREATE INDEX idx_lead_list_memberships_list ON lead_list_memberships(smart_list_id);
CREATE INDEX idx_lead_list_memberships_lead ON lead_list_memberships(lead_id);

-- Add GIN index on leads.tags for fast tag searches
CREATE INDEX IF NOT EXISTS idx_leads_tags ON leads USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads (status);
CREATE INDEX IF NOT EXISTS idx_leads_lead_source ON leads (lead_source);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads (created_at);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_smart_lists_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER smart_lists_updated_at
  BEFORE UPDATE ON smart_lists
  FOR EACH ROW EXECUTE FUNCTION update_smart_lists_updated_at();