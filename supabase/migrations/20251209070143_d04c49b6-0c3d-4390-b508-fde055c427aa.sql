-- Voice Broadcasting Campaigns table
CREATE TABLE public.voice_broadcasts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  
  -- TTS Configuration
  message_text TEXT NOT NULL,
  voice_id TEXT DEFAULT 'EXAVITQu4vr4xnSDxMaL',
  voice_model TEXT DEFAULT 'eleven_turbo_v2_5',
  audio_url TEXT,
  
  -- IVR Configuration
  ivr_enabled BOOLEAN DEFAULT true,
  ivr_mode TEXT DEFAULT 'dtmf', -- 'dtmf' or 'ai_conversational'
  ivr_prompt TEXT DEFAULT 'Press 1 to speak with a representative. Press 2 to schedule a callback. Press 3 to opt out.',
  
  -- DTMF Actions (what happens when they press 1, 2, 3, etc.)
  dtmf_actions JSONB DEFAULT '[
    {"digit": "1", "action": "transfer", "transfer_to": null, "label": "Connect to Agent"},
    {"digit": "2", "action": "callback", "delay_hours": 24, "label": "Schedule Callback"},
    {"digit": "3", "action": "dnc", "label": "Do Not Call"}
  ]'::jsonb,
  
  -- AI Conversational Settings
  ai_system_prompt TEXT DEFAULT 'You are a friendly assistant. If the caller is interested, offer to transfer them. If they want to opt out, respect their wishes.',
  ai_transfer_keywords TEXT[] DEFAULT ARRAY['yes', 'interested', 'connect me', 'speak to someone'],
  
  -- Campaign Settings
  max_attempts INTEGER DEFAULT 1,
  retry_delay_minutes INTEGER DEFAULT 60,
  calling_hours_start TIME DEFAULT '09:00',
  calling_hours_end TIME DEFAULT '17:00',
  timezone TEXT DEFAULT 'America/New_York',
  calls_per_minute INTEGER DEFAULT 50,
  
  -- Stats
  total_leads INTEGER DEFAULT 0,
  calls_made INTEGER DEFAULT 0,
  calls_answered INTEGER DEFAULT 0,
  transfers_completed INTEGER DEFAULT 0,
  callbacks_scheduled INTEGER DEFAULT 0,
  dnc_requests INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Voice Broadcast Queue
CREATE TABLE public.broadcast_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  broadcast_id UUID NOT NULL REFERENCES public.voice_broadcasts(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL,
  lead_name TEXT,
  
  status TEXT NOT NULL DEFAULT 'pending', -- pending, calling, answered, completed, failed, transferred, callback, dnc
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 1,
  scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Call Results
  dtmf_pressed TEXT,
  call_duration_seconds INTEGER,
  transfer_status TEXT,
  callback_scheduled_at TIMESTAMP WITH TIME ZONE,
  ai_transcript TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.voice_broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies for voice_broadcasts
CREATE POLICY "Users can manage their own broadcasts"
  ON public.voice_broadcasts
  FOR ALL
  USING (auth.uid() = user_id);

-- RLS Policies for broadcast_queue (through broadcast ownership)
CREATE POLICY "Users can manage their broadcast queues"
  ON public.broadcast_queue
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.voice_broadcasts
      WHERE voice_broadcasts.id = broadcast_queue.broadcast_id
      AND voice_broadcasts.user_id = auth.uid()
    )
  );

-- Indexes for performance
CREATE INDEX idx_voice_broadcasts_user_status ON public.voice_broadcasts(user_id, status);
CREATE INDEX idx_broadcast_queue_broadcast_status ON public.broadcast_queue(broadcast_id, status);
CREATE INDEX idx_broadcast_queue_scheduled ON public.broadcast_queue(scheduled_at) WHERE status = 'pending';

-- Trigger for updated_at
CREATE TRIGGER update_voice_broadcasts_updated_at
  BEFORE UPDATE ON public.voice_broadcasts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_broadcast_queue_updated_at
  BEFORE UPDATE ON public.broadcast_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();