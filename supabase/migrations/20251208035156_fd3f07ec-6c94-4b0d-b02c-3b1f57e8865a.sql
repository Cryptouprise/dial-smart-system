-- Campaign Workflows - The workflow definition
CREATE TABLE public.campaign_workflows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  workflow_type TEXT NOT NULL DEFAULT 'calling_only', -- calling_only, follow_up, mixed, appointment_reminder, no_show
  is_template BOOLEAN DEFAULT false,
  settings JSONB DEFAULT '{}'::jsonb,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Workflow Steps - Individual steps in a workflow
CREATE TABLE public.workflow_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id UUID NOT NULL REFERENCES public.campaign_workflows(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  step_type TEXT NOT NULL, -- call, sms, wait, condition, ai_sms
  step_config JSONB NOT NULL DEFAULT '{}'::jsonb, -- timing, content, delay_minutes, delay_hours, delay_days, time_of_day, etc.
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Lead Workflow Progress - Track where each lead is in a workflow
CREATE TABLE public.lead_workflow_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES public.campaign_workflows(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  current_step_id UUID REFERENCES public.workflow_steps(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active, paused, completed, removed, converted
  started_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_action_at TIMESTAMP WITH TIME ZONE,
  next_action_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  removal_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Disposition Auto Actions - What happens per disposition
CREATE TABLE public.disposition_auto_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  disposition_id UUID REFERENCES public.dispositions(id) ON DELETE CASCADE,
  disposition_name TEXT, -- For matching by name if disposition_id is null
  action_type TEXT NOT NULL, -- remove_all_campaigns, remove_from_campaign, move_to_stage, add_to_dnc, start_workflow
  action_config JSONB DEFAULT '{}'::jsonb, -- target_stage_id, target_workflow_id, etc.
  priority INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add workflow_id to campaigns table
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS workflow_id UUID REFERENCES public.campaign_workflows(id) ON DELETE SET NULL;

-- Add retry settings to campaigns
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS retry_delay_minutes INTEGER DEFAULT 300;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS max_calls_per_day INTEGER DEFAULT 2;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS sms_on_no_answer BOOLEAN DEFAULT false;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS sms_template TEXT;

-- Enable RLS on all new tables
ALTER TABLE public.campaign_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_workflow_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disposition_auto_actions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for campaign_workflows
CREATE POLICY "Users can manage their own workflows" ON public.campaign_workflows FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for workflow_steps (via workflow ownership)
CREATE POLICY "Users can manage their workflow steps" ON public.workflow_steps FOR ALL 
USING (EXISTS (SELECT 1 FROM public.campaign_workflows WHERE id = workflow_steps.workflow_id AND user_id = auth.uid()));

-- RLS Policies for lead_workflow_progress
CREATE POLICY "Users can manage their lead progress" ON public.lead_workflow_progress FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for disposition_auto_actions
CREATE POLICY "Users can manage their disposition actions" ON public.disposition_auto_actions FOR ALL USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_workflow_steps_workflow ON public.workflow_steps(workflow_id);
CREATE INDEX idx_lead_workflow_progress_lead ON public.lead_workflow_progress(lead_id);
CREATE INDEX idx_lead_workflow_progress_workflow ON public.lead_workflow_progress(workflow_id);
CREATE INDEX idx_lead_workflow_progress_next_action ON public.lead_workflow_progress(next_action_at) WHERE status = 'active';
CREATE INDEX idx_disposition_auto_actions_disposition ON public.disposition_auto_actions(disposition_id);