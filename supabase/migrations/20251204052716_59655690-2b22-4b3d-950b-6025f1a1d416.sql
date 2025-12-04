-- Add comprehensive AI configuration fields to ai_sms_settings
ALTER TABLE ai_sms_settings 
ADD COLUMN IF NOT EXISTS custom_instructions text DEFAULT '',
ADD COLUMN IF NOT EXISTS knowledge_base text DEFAULT '',
ADD COLUMN IF NOT EXISTS dynamic_variables_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS include_lead_context boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS include_call_history boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS include_sms_history boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS max_history_items integer DEFAULT 5;