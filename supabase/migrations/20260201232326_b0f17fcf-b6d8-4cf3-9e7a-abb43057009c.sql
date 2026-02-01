-- Add campaign_prompts JSONB to store campaign-specific script variations
ALTER TABLE demo_agent_config 
ADD COLUMN IF NOT EXISTS campaign_prompts jsonb DEFAULT '{}';

-- Add sms_confirmation_enabled flag
ALTER TABLE demo_agent_config 
ADD COLUMN IF NOT EXISTS sms_confirmation_enabled boolean DEFAULT true;