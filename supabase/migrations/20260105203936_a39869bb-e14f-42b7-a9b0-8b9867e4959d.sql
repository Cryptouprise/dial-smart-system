-- Create GHL sync settings table for storing user-specific sync configurations
CREATE TABLE public.ghl_sync_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  field_mappings JSONB DEFAULT '{}',
  pipeline_stage_mappings JSONB DEFAULT '{}',
  tag_rules JSONB DEFAULT '{}',
  auto_create_opportunities BOOLEAN DEFAULT false,
  default_opportunity_value NUMERIC DEFAULT 0,
  default_pipeline_id TEXT,
  remove_conflicting_tags BOOLEAN DEFAULT true,
  sync_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT ghl_sync_settings_user_id_unique UNIQUE (user_id)
);

-- Enable Row Level Security
ALTER TABLE public.ghl_sync_settings ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own GHL sync settings" 
ON public.ghl_sync_settings 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own GHL sync settings" 
ON public.ghl_sync_settings 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own GHL sync settings" 
ON public.ghl_sync_settings 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own GHL sync settings" 
ON public.ghl_sync_settings 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_ghl_sync_settings_updated_at
BEFORE UPDATE ON public.ghl_sync_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for faster user lookups
CREATE INDEX idx_ghl_sync_settings_user_id ON public.ghl_sync_settings(user_id);