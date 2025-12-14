-- Add auto_reply_settings column to campaign_workflows for workflow-level AI auto-reply configuration
ALTER TABLE public.campaign_workflows 
ADD COLUMN IF NOT EXISTS auto_reply_settings jsonb DEFAULT NULL;

-- Add a comment explaining the structure
COMMENT ON COLUMN public.campaign_workflows.auto_reply_settings IS 'Workflow-level AI auto-reply settings: { enabled: boolean, ai_instructions: string, response_delay_seconds: number, stop_on_human_reply: boolean, calendar_enabled: boolean, booking_link: string }';