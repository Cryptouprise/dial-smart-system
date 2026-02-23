-- ============================================================================
-- Telnyx Voice AI Platform Integration
-- Created: February 23, 2026
--
-- Tables for managing Telnyx AI assistants, tools, knowledge bases,
-- insight templates, scheduled events, and call tracking.
-- ============================================================================

-- ============================================================================
-- 1. TELNYX AI ASSISTANTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS telnyx_assistants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  -- Telnyx IDs
  telnyx_assistant_id TEXT UNIQUE,          -- From Telnyx API after creation
  telnyx_texml_app_id TEXT,                 -- Auto-created by Telnyx
  telnyx_messaging_profile_id TEXT,         -- Auto-created by Telnyx

  -- Assistant config
  name TEXT NOT NULL,
  description TEXT,
  model TEXT NOT NULL DEFAULT 'Qwen/Qwen3-235B-A22B',
  instructions TEXT NOT NULL DEFAULT '',
  greeting TEXT,                            -- Spoken at conversation start

  -- Voice settings
  voice TEXT DEFAULT 'Telnyx.NaturalHD.Ava',
  voice_api_key_ref TEXT,                   -- Integration secret for ElevenLabs etc.

  -- Transcription
  transcription_model TEXT DEFAULT 'telnyx_deepgram_nova3',

  -- LLM config
  llm_api_key_ref TEXT,                     -- Integration secret for third-party LLM
  fallback_model TEXT,                      -- Fallback if primary LLM fails

  -- Features
  enabled_features TEXT[] DEFAULT ARRAY['telephony'],  -- telephony, messaging

  -- Dynamic variables
  dynamic_variables_webhook_url TEXT,       -- URL called at conversation start
  dynamic_variables JSONB DEFAULT '{}',     -- Default variable values

  -- Privacy
  data_retention BOOLEAN DEFAULT true,      -- Store conversation history

  -- Insight settings
  insight_group_id TEXT,                    -- Telnyx insight group ID

  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  is_default BOOLEAN DEFAULT false,         -- Default assistant for this user

  -- Versioning / A/B testing
  version INTEGER DEFAULT 1,
  traffic_percentage INTEGER DEFAULT 100 CHECK (traffic_percentage BETWEEN 0 AND 100),

  -- Metadata
  tools JSONB DEFAULT '[]',                 -- Array of tool configurations
  metadata JSONB DEFAULT '{}',              -- Custom metadata

  -- Phone number assignment
  assigned_phone_number_ids UUID[] DEFAULT ARRAY[]::UUID[],

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_telnyx_assistants_user ON telnyx_assistants(user_id);
CREATE INDEX IF NOT EXISTS idx_telnyx_assistants_org ON telnyx_assistants(organization_id);
CREATE INDEX IF NOT EXISTS idx_telnyx_assistants_telnyx_id ON telnyx_assistants(telnyx_assistant_id);
CREATE INDEX IF NOT EXISTS idx_telnyx_assistants_status ON telnyx_assistants(status);

-- RLS
ALTER TABLE telnyx_assistants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own telnyx assistants"
  ON telnyx_assistants FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 2. TELNYX INSIGHT TEMPLATES
-- ============================================================================
CREATE TABLE IF NOT EXISTS telnyx_insight_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Telnyx IDs
  telnyx_insight_id TEXT,                   -- From Telnyx API
  telnyx_group_id TEXT,                     -- Insight group this belongs to

  -- Template config
  name TEXT NOT NULL,
  instructions TEXT NOT NULL,               -- AI prompt for what to analyze
  json_schema JSONB,                        -- Optional structured output schema
  webhook_url TEXT,                         -- Per-insight webhook override

  -- Local tracking
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telnyx_insights_user ON telnyx_insight_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_telnyx_insights_group ON telnyx_insight_templates(telnyx_group_id);

ALTER TABLE telnyx_insight_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own insight templates"
  ON telnyx_insight_templates FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 3. TELNYX KNOWLEDGE BASES
-- ============================================================================
CREATE TABLE IF NOT EXISTS telnyx_knowledge_bases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Telnyx storage
  bucket_name TEXT NOT NULL,
  embedding_model TEXT DEFAULT 'thenlper/gte-large',
  document_chunk_size INTEGER DEFAULT 1024,
  document_chunk_overlap INTEGER DEFAULT 512,

  -- Status
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'embedding', 'ready', 'error')),
  last_embed_task_id TEXT,                  -- Telnyx async task ID
  document_count INTEGER DEFAULT 0,

  -- Connected assistants
  assistant_ids UUID[] DEFAULT ARRAY[]::UUID[],

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telnyx_kb_user ON telnyx_knowledge_bases(user_id);

ALTER TABLE telnyx_knowledge_bases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own knowledge bases"
  ON telnyx_knowledge_bases FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 4. TELNYX SCHEDULED EVENTS (local cache)
-- ============================================================================
CREATE TABLE IF NOT EXISTS telnyx_scheduled_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Telnyx IDs
  telnyx_event_id TEXT,
  telnyx_assistant_id TEXT NOT NULL,

  -- Event config
  channel TEXT NOT NULL CHECK (channel IN ('phone_call', 'sms_chat')),
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  text_message TEXT,                        -- Required for SMS events
  conversation_metadata JSONB DEFAULT '{}',

  -- Local tracking
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  campaign_id UUID,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'executed', 'cancelled', 'failed')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telnyx_events_user ON telnyx_scheduled_events(user_id);
CREATE INDEX IF NOT EXISTS idx_telnyx_events_scheduled ON telnyx_scheduled_events(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_telnyx_events_status ON telnyx_scheduled_events(status);

ALTER TABLE telnyx_scheduled_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own scheduled events"
  ON telnyx_scheduled_events FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 5. TELNYX CALL TRACKING (extends call_logs)
-- ============================================================================
-- Add Telnyx-specific columns to call_logs
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS telnyx_call_control_id TEXT;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS telnyx_call_session_id TEXT;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS telnyx_conversation_id TEXT;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS telnyx_assistant_id TEXT;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'retell' CHECK (provider IN ('retell', 'telnyx', 'twilio'));
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS amd_result TEXT;           -- human/machine/etc
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS amd_type TEXT;             -- standard/premium

-- Index for Telnyx call lookups
CREATE INDEX IF NOT EXISTS idx_call_logs_telnyx_control ON call_logs(telnyx_call_control_id) WHERE telnyx_call_control_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_call_logs_telnyx_conversation ON call_logs(telnyx_conversation_id) WHERE telnyx_conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_call_logs_provider ON call_logs(provider);

-- ============================================================================
-- 6. TELNYX CONVERSATION INSIGHTS (received from webhooks)
-- ============================================================================
CREATE TABLE IF NOT EXISTS telnyx_conversation_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Telnyx IDs
  telnyx_conversation_id TEXT NOT NULL,
  telnyx_assistant_id TEXT NOT NULL,
  telnyx_insight_group_id TEXT,

  -- Call reference
  call_log_id UUID REFERENCES call_logs(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,

  -- Insight data
  insights JSONB NOT NULL DEFAULT '[]',     -- Array of {insight_id, name, result}

  -- Raw webhook payload for debugging
  raw_payload JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telnyx_conv_insights_user ON telnyx_conversation_insights(user_id);
CREATE INDEX IF NOT EXISTS idx_telnyx_conv_insights_conv ON telnyx_conversation_insights(telnyx_conversation_id);
CREATE INDEX IF NOT EXISTS idx_telnyx_conv_insights_call ON telnyx_conversation_insights(call_log_id);

ALTER TABLE telnyx_conversation_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own conversation insights"
  ON telnyx_conversation_insights FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 7. TELNYX PROVIDER SETTINGS (per-user config)
-- ============================================================================
CREATE TABLE IF NOT EXISTS telnyx_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- API config
  api_key_configured BOOLEAN DEFAULT false,  -- We don't store the key, just track if set

  -- Default assistant
  default_assistant_id UUID REFERENCES telnyx_assistants(id) ON DELETE SET NULL,

  -- Default voice settings
  default_voice TEXT DEFAULT 'Telnyx.NaturalHD.Ava',
  default_model TEXT DEFAULT 'Qwen/Qwen3-235B-A22B',
  default_transcription TEXT DEFAULT 'telnyx_deepgram_nova3',

  -- AMD settings
  amd_enabled BOOLEAN DEFAULT true,
  amd_type TEXT DEFAULT 'premium' CHECK (amd_type IN ('detect', 'detect_words', 'detect_beep', 'greeting_end', 'premium')),

  -- Webhook URLs (auto-populated from SUPABASE_URL)
  webhook_url TEXT,
  dynamic_vars_webhook_url TEXT,

  -- Feature toggles
  memory_enabled BOOLEAN DEFAULT true,
  insights_enabled BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE telnyx_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own telnyx settings"
  ON telnyx_settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 8. HELPER FUNCTION: Get user's Telnyx assistant for a call
-- ============================================================================
CREATE OR REPLACE FUNCTION get_telnyx_assistant_for_call(
  p_user_id UUID,
  p_assistant_id UUID DEFAULT NULL
)
RETURNS TABLE (
  assistant_id UUID,
  telnyx_assistant_id TEXT,
  name TEXT,
  model TEXT,
  voice TEXT,
  amd_enabled BOOLEAN,
  amd_type TEXT
) LANGUAGE plpgsql AS $$
BEGIN
  -- If specific assistant requested, use that
  IF p_assistant_id IS NOT NULL THEN
    RETURN QUERY
      SELECT a.id, a.telnyx_assistant_id, a.name, a.model, a.voice,
             COALESCE(s.amd_enabled, true), COALESCE(s.amd_type, 'premium')
      FROM telnyx_assistants a
      LEFT JOIN telnyx_settings s ON s.user_id = a.user_id
      WHERE a.id = p_assistant_id AND a.user_id = p_user_id;
    RETURN;
  END IF;

  -- Otherwise, try default assistant
  RETURN QUERY
    SELECT a.id, a.telnyx_assistant_id, a.name, a.model, a.voice,
           COALESCE(s.amd_enabled, true), COALESCE(s.amd_type, 'premium')
    FROM telnyx_settings s
    JOIN telnyx_assistants a ON a.id = s.default_assistant_id
    WHERE s.user_id = p_user_id AND a.status = 'active';

  -- If no default, get any active assistant
  IF NOT FOUND THEN
    RETURN QUERY
      SELECT a.id, a.telnyx_assistant_id, a.name, a.model, a.voice,
             COALESCE(s.amd_enabled, true), COALESCE(s.amd_type, 'premium')
      FROM telnyx_assistants a
      LEFT JOIN telnyx_settings s ON s.user_id = a.user_id
      WHERE a.user_id = p_user_id AND a.status = 'active'
      ORDER BY a.is_default DESC, a.created_at DESC
      LIMIT 1;
  END IF;
END;
$$;

-- ============================================================================
-- DONE
-- ============================================================================
