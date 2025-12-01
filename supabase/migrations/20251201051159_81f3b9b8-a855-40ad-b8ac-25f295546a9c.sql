-- Create SMS conversations table for threading
CREATE TABLE IF NOT EXISTS public.sms_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  contact_phone TEXT NOT NULL,
  contact_name TEXT,
  last_message_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  unread_count INTEGER DEFAULT 0,
  context_summary TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create SMS messages table
CREATE TABLE IF NOT EXISTS public.sms_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  conversation_id UUID REFERENCES public.sms_conversations(id) ON DELETE CASCADE,
  to_number TEXT NOT NULL,
  from_number TEXT NOT NULL,
  body TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  status TEXT NOT NULL DEFAULT 'pending',
  provider_type TEXT DEFAULT 'twilio',
  provider_message_id TEXT,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  is_ai_generated BOOLEAN DEFAULT false,
  has_image BOOLEAN DEFAULT false,
  image_url TEXT,
  image_analysis JSONB,
  is_reaction BOOLEAN DEFAULT false,
  reaction_type TEXT,
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create SMS context history for AI memory
CREATE TABLE IF NOT EXISTS public.sms_context_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES public.sms_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  context_window TEXT NOT NULL,
  summary TEXT,
  token_count INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create AI SMS settings table
CREATE TABLE IF NOT EXISTS public.ai_sms_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  enabled BOOLEAN DEFAULT true,
  context_window_size INTEGER DEFAULT 20,
  max_context_tokens INTEGER DEFAULT 4000,
  enable_image_analysis BOOLEAN DEFAULT true,
  enable_reaction_detection BOOLEAN DEFAULT true,
  prevent_double_texting BOOLEAN DEFAULT true,
  double_text_delay_seconds INTEGER DEFAULT 300,
  use_number_rotation BOOLEAN DEFAULT false,
  retell_agent_id TEXT,
  ai_personality TEXT DEFAULT 'professional and helpful',
  auto_response_enabled BOOLEAN DEFAULT false,
  business_hours_only BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sms_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_context_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_sms_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sms_conversations
CREATE POLICY "Users can view their own conversations"
  ON public.sms_conversations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own conversations"
  ON public.sms_conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own conversations"
  ON public.sms_conversations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own conversations"
  ON public.sms_conversations FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for sms_messages
CREATE POLICY "Users can view their own messages"
  ON public.sms_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own messages"
  ON public.sms_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own messages"
  ON public.sms_messages FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies for sms_context_history
CREATE POLICY "Users can view their own context"
  ON public.sms_context_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own context"
  ON public.sms_context_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for ai_sms_settings
CREATE POLICY "Users can view their own settings"
  ON public.ai_sms_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own settings"
  ON public.ai_sms_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own settings"
  ON public.ai_sms_settings FOR UPDATE
  USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX idx_sms_conversations_user_id ON public.sms_conversations(user_id);
CREATE INDEX idx_sms_conversations_contact_phone ON public.sms_conversations(contact_phone);
CREATE INDEX idx_sms_conversations_last_message ON public.sms_conversations(last_message_at DESC);
CREATE INDEX idx_sms_messages_conversation_id ON public.sms_messages(conversation_id);
CREATE INDEX idx_sms_messages_user_id ON public.sms_messages(user_id);
CREATE INDEX idx_sms_messages_created_at ON public.sms_messages(created_at DESC);
CREATE INDEX idx_sms_context_history_conversation_id ON public.sms_context_history(conversation_id);

-- Trigger to update updated_at timestamp
CREATE TRIGGER update_sms_conversations_updated_at
  BEFORE UPDATE ON public.sms_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ai_sms_settings_updated_at
  BEFORE UPDATE ON public.ai_sms_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();