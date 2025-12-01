-- Add AI provider selection to ai_sms_settings
ALTER TABLE public.ai_sms_settings 
ADD COLUMN IF NOT EXISTS ai_provider TEXT DEFAULT 'lovable' CHECK (ai_provider IN ('lovable', 'retell'));

-- Add Retell SMS configuration
ALTER TABLE public.ai_sms_settings
ADD COLUMN IF NOT EXISTS retell_llm_id TEXT,
ADD COLUMN IF NOT EXISTS retell_voice_id TEXT;