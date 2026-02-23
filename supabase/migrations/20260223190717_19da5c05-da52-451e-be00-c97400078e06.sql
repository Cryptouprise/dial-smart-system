
-- =============================================
-- TELNYX VOICE AI PLATFORM - Full Infrastructure
-- =============================================

-- 1. telnyx_assistants
CREATE TABLE IF NOT EXISTS public.telnyx_assistants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  organization_id UUID REFERENCES public.organizations(id),
  telnyx_assistant_id TEXT,
  telnyx_texml_app_id TEXT,
  telnyx_messaging_profile_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  model TEXT DEFAULT 'Qwen/Qwen3-235B-A22B',
  instructions TEXT,
  greeting TEXT,
  voice TEXT DEFAULT 'Telnyx.NaturalHD.Ava',
  transcription_model TEXT DEFAULT 'telnyx_deepgram_nova3',
  tools JSONB DEFAULT '[]'::jsonb,
  enabled_features TEXT[] DEFAULT '{telephony}',
  dynamic_variables_webhook_url TEXT,
  dynamic_variables JSONB DEFAULT '{}'::jsonb,
  data_retention BOOLEAN DEFAULT true,
  insight_group_id TEXT,
  status TEXT DEFAULT 'active',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telnyx_assistants_user_id ON public.telnyx_assistants(user_id);
CREATE INDEX IF NOT EXISTS idx_telnyx_assistants_telnyx_id ON public.telnyx_assistants(telnyx_assistant_id);

ALTER TABLE public.telnyx_assistants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own telnyx assistants"
  ON public.telnyx_assistants FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own telnyx assistants"
  ON public.telnyx_assistants FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own telnyx assistants"
  ON public.telnyx_assistants FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own telnyx assistants"
  ON public.telnyx_assistants FOR DELETE USING (auth.uid() = user_id);

-- 2. telnyx_settings
CREATE TABLE IF NOT EXISTS public.telnyx_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  api_key_configured BOOLEAN DEFAULT false,
  amd_enabled BOOLEAN DEFAULT true,
  amd_type TEXT DEFAULT 'premium',
  webhook_url TEXT,
  dynamic_vars_webhook_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.telnyx_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own telnyx settings"
  ON public.telnyx_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own telnyx settings"
  ON public.telnyx_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own telnyx settings"
  ON public.telnyx_settings FOR UPDATE USING (auth.uid() = user_id);

-- 3. telnyx_knowledge_bases
CREATE TABLE IF NOT EXISTS public.telnyx_knowledge_bases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  bucket_name TEXT,
  embedding_model TEXT DEFAULT 'text-embedding-3-small',
  document_chunk_size INTEGER DEFAULT 1000,
  document_chunk_overlap INTEGER DEFAULT 200,
  status TEXT DEFAULT 'pending',
  last_embed_task_id TEXT,
  assistant_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.telnyx_knowledge_bases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own telnyx knowledge bases"
  ON public.telnyx_knowledge_bases FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own telnyx knowledge bases"
  ON public.telnyx_knowledge_bases FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own telnyx knowledge bases"
  ON public.telnyx_knowledge_bases FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own telnyx knowledge bases"
  ON public.telnyx_knowledge_bases FOR DELETE USING (auth.uid() = user_id);

-- 4. telnyx_insight_templates
CREATE TABLE IF NOT EXISTS public.telnyx_insight_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  instructions TEXT,
  json_schema JSONB,
  telnyx_group_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.telnyx_insight_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own telnyx insight templates"
  ON public.telnyx_insight_templates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own telnyx insight templates"
  ON public.telnyx_insight_templates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own telnyx insight templates"
  ON public.telnyx_insight_templates FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own telnyx insight templates"
  ON public.telnyx_insight_templates FOR DELETE USING (auth.uid() = user_id);

-- 5. telnyx_scheduled_events
CREATE TABLE IF NOT EXISTS public.telnyx_scheduled_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  telnyx_event_id TEXT,
  telnyx_assistant_id TEXT,
  channel TEXT DEFAULT 'phone_call',
  from_number TEXT,
  to_number TEXT,
  scheduled_at TIMESTAMPTZ,
  text_message TEXT,
  lead_id UUID REFERENCES public.leads(id),
  campaign_id UUID REFERENCES public.campaigns(id),
  conversation_metadata JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'scheduled',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.telnyx_scheduled_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own telnyx scheduled events"
  ON public.telnyx_scheduled_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own telnyx scheduled events"
  ON public.telnyx_scheduled_events FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own telnyx scheduled events"
  ON public.telnyx_scheduled_events FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own telnyx scheduled events"
  ON public.telnyx_scheduled_events FOR DELETE USING (auth.uid() = user_id);

-- 6. Add columns to call_logs
ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'retell',
  ADD COLUMN IF NOT EXISTS telnyx_call_control_id TEXT,
  ADD COLUMN IF NOT EXISTS telnyx_call_session_id TEXT,
  ADD COLUMN IF NOT EXISTS telnyx_conversation_id TEXT,
  ADD COLUMN IF NOT EXISTS telnyx_assistant_id TEXT,
  ADD COLUMN IF NOT EXISTS amd_type TEXT,
  ADD COLUMN IF NOT EXISTS organization_id UUID,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_call_logs_telnyx_control_id ON public.call_logs(telnyx_call_control_id) WHERE telnyx_call_control_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_call_logs_telnyx_session_id ON public.call_logs(telnyx_call_session_id) WHERE telnyx_call_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_call_logs_provider ON public.call_logs(provider);

-- 7. Add columns to voice_broadcasts
ALTER TABLE public.voice_broadcasts
  ADD COLUMN IF NOT EXISTS broadcast_provider TEXT DEFAULT 'twilio_classic',
  ADD COLUMN IF NOT EXISTS telnyx_assistant_id UUID REFERENCES public.telnyx_assistants(id),
  ADD COLUMN IF NOT EXISTS telnyx_script TEXT;

-- 8. Updated_at triggers for new tables
CREATE TRIGGER update_telnyx_assistants_updated_at
  BEFORE UPDATE ON public.telnyx_assistants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_telnyx_settings_updated_at
  BEFORE UPDATE ON public.telnyx_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_telnyx_knowledge_bases_updated_at
  BEFORE UPDATE ON public.telnyx_knowledge_bases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_telnyx_insight_templates_updated_at
  BEFORE UPDATE ON public.telnyx_insight_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_telnyx_scheduled_events_updated_at
  BEFORE UPDATE ON public.telnyx_scheduled_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 9. DB function to resolve assistant for a call
CREATE OR REPLACE FUNCTION public.get_telnyx_assistant_for_call(p_user_id UUID, p_assistant_id UUID DEFAULT NULL)
RETURNS TABLE(assistant_id UUID, telnyx_assistant_id TEXT, name TEXT, instructions TEXT, greeting TEXT, voice TEXT, model TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF p_assistant_id IS NOT NULL THEN
    RETURN QUERY
      SELECT ta.id, ta.telnyx_assistant_id, ta.name, ta.instructions, ta.greeting, ta.voice, ta.model
      FROM telnyx_assistants ta
      WHERE ta.id = p_assistant_id AND ta.user_id = p_user_id AND ta.status = 'active'
      LIMIT 1;
  ELSE
    RETURN QUERY
      SELECT ta.id, ta.telnyx_assistant_id, ta.name, ta.instructions, ta.greeting, ta.voice, ta.model
      FROM telnyx_assistants ta
      WHERE ta.user_id = p_user_id AND ta.status = 'active'
      ORDER BY ta.created_at DESC
      LIMIT 1;
  END IF;
END;
$$;
