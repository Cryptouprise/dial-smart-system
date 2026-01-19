-- ============================================================================
-- Script Analytics Enhancement Migration
-- Adds: Opener Effectiveness, Time Wasted Scoring, Voicemail Message Analytics
-- Created: January 18, 2026
-- ============================================================================

-- ============================================================================
-- PART 1: OPENER EFFECTIVENESS TRACKING
-- ============================================================================

-- Table to store unique openers and their performance metrics
CREATE TABLE IF NOT EXISTS public.opener_analytics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  agent_id TEXT,
  agent_name TEXT,
  -- The opener text (first 500 chars of script opening)
  opener_text TEXT NOT NULL,
  -- Normalized version for matching (lowercase, trimmed, no extra spaces)
  opener_normalized TEXT NOT NULL,
  -- Performance metrics
  total_uses INTEGER DEFAULT 0,
  calls_answered INTEGER DEFAULT 0,
  calls_engaged INTEGER DEFAULT 0,  -- Calls > 30 seconds with human
  calls_converted INTEGER DEFAULT 0, -- Appointments/positive outcomes
  avg_call_duration INTEGER DEFAULT 0,
  avg_engagement_duration INTEGER DEFAULT 0, -- Duration for engaged calls only
  -- Calculated scores
  answer_rate DECIMAL(5,2) DEFAULT 0.00,
  engagement_rate DECIMAL(5,2) DEFAULT 0.00,
  conversion_rate DECIMAL(5,2) DEFAULT 0.00,
  effectiveness_score INTEGER DEFAULT 0, -- 0-100 composite score
  -- Timestamps
  first_used_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  -- Unique constraint on normalized opener per user
  UNIQUE(user_id, opener_normalized)
);

-- Table to link calls to their openers for detailed analysis
CREATE TABLE IF NOT EXISTS public.call_opener_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  call_id UUID REFERENCES public.call_logs(id) ON DELETE CASCADE,
  opener_id UUID REFERENCES public.opener_analytics(id) ON DELETE CASCADE,
  -- What happened with this opener on this call
  was_answered BOOLEAN DEFAULT false,
  was_engaged BOOLEAN DEFAULT false, -- > 30 seconds human conversation
  was_converted BOOLEAN DEFAULT false,
  call_duration INTEGER DEFAULT 0,
  time_to_engagement INTEGER, -- Seconds until prospect engaged (or null if never)
  -- The actual opener text used (for A/B tracking even if text varies slightly)
  opener_text_used TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================================================
-- PART 2: TIME WASTED SCORING
-- ============================================================================

-- Add time wasted fields to call_logs
ALTER TABLE public.call_logs
ADD COLUMN IF NOT EXISTS time_wasted_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS time_wasted_reason TEXT,
ADD COLUMN IF NOT EXISTS opener_extracted TEXT,
ADD COLUMN IF NOT EXISTS opener_score INTEGER;

-- Time wasted reasons enum-style check
COMMENT ON COLUMN public.call_logs.time_wasted_reason IS
'Reason for time wasted: vm_too_late (hit VM after 30s), short_no_outcome (< 15s, no result),
long_no_conversion (> 5min, no appointment), repeated_no_answer, objection_not_handled';

-- ============================================================================
-- PART 3: VOICEMAIL MESSAGE ANALYTICS
-- ============================================================================

-- Table to track voicemail message effectiveness
CREATE TABLE IF NOT EXISTS public.voicemail_analytics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  broadcast_id UUID,
  campaign_id UUID,
  -- Voicemail message details
  voicemail_audio_url TEXT,
  voicemail_message_text TEXT, -- If we have the script
  voicemail_duration_seconds INTEGER,
  -- Performance metrics
  total_voicemails_left INTEGER DEFAULT 0,
  callbacks_received INTEGER DEFAULT 0,
  callbacks_within_24h INTEGER DEFAULT 0,
  callbacks_within_1h INTEGER DEFAULT 0,
  appointments_from_callbacks INTEGER DEFAULT 0,
  -- Calculated rates
  callback_rate DECIMAL(5,2) DEFAULT 0.00,
  callback_rate_24h DECIMAL(5,2) DEFAULT 0.00,
  appointment_conversion_rate DECIMAL(5,2) DEFAULT 0.00,
  -- Effectiveness score 0-100
  effectiveness_score INTEGER DEFAULT 0,
  -- Timestamps
  first_used_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Table to track individual voicemail-to-callback connections
CREATE TABLE IF NOT EXISTS public.voicemail_callback_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  -- The outbound VM call
  voicemail_call_id UUID REFERENCES public.call_logs(id) ON DELETE SET NULL,
  voicemail_left_at TIMESTAMP WITH TIME ZONE NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  broadcast_id UUID,
  voicemail_analytics_id UUID REFERENCES public.voicemail_analytics(id) ON DELETE SET NULL,
  -- The callback (if any)
  callback_call_id UUID REFERENCES public.call_logs(id) ON DELETE SET NULL,
  callback_received_at TIMESTAMP WITH TIME ZONE,
  callback_outcome TEXT,
  time_to_callback_minutes INTEGER,
  -- Status tracking
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'callback_received', 'no_callback', 'expired')),
  expired_at TIMESTAMP WITH TIME ZONE, -- When we stop waiting for callback
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================================================
-- PART 4: INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_opener_analytics_user ON public.opener_analytics(user_id, effectiveness_score DESC);
CREATE INDEX IF NOT EXISTS idx_opener_analytics_agent ON public.opener_analytics(agent_id, effectiveness_score DESC);
CREATE INDEX IF NOT EXISTS idx_call_opener_logs_opener ON public.call_opener_logs(opener_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_opener_logs_call ON public.call_opener_logs(call_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_time_wasted ON public.call_logs(user_id, time_wasted_score DESC) WHERE time_wasted_score > 0;
CREATE INDEX IF NOT EXISTS idx_voicemail_analytics_user ON public.voicemail_analytics(user_id, effectiveness_score DESC);
CREATE INDEX IF NOT EXISTS idx_voicemail_callback_tracking_lead ON public.voicemail_callback_tracking(lead_id, status);
CREATE INDEX IF NOT EXISTS idx_voicemail_callback_tracking_phone ON public.voicemail_callback_tracking(phone_number, status);

-- ============================================================================
-- PART 5: RLS POLICIES
-- ============================================================================

ALTER TABLE public.opener_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_opener_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voicemail_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voicemail_callback_tracking ENABLE ROW LEVEL SECURITY;

-- Opener analytics policies
CREATE POLICY "Users can manage their own opener analytics"
ON public.opener_analytics FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own call opener logs"
ON public.call_opener_logs FOR ALL USING (auth.uid() = user_id);

-- Voicemail analytics policies
CREATE POLICY "Users can manage their own voicemail analytics"
ON public.voicemail_analytics FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own voicemail callback tracking"
ON public.voicemail_callback_tracking FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- PART 6: FUNCTIONS FOR ANALYTICS CALCULATIONS
-- ============================================================================

-- Function to calculate time wasted score for a call
CREATE OR REPLACE FUNCTION calculate_time_wasted_score(
  p_duration INTEGER,
  p_amd_result TEXT,
  p_outcome TEXT,
  p_auto_disposition TEXT,
  p_answered_at TIMESTAMPTZ,
  p_created_at TIMESTAMPTZ
) RETURNS TABLE (score INTEGER, reason TEXT) AS $$
DECLARE
  v_score INTEGER := 0;
  v_reason TEXT := NULL;
  v_time_to_answer INTEGER;
BEGIN
  -- Calculate time to answer
  IF p_answered_at IS NOT NULL AND p_created_at IS NOT NULL THEN
    v_time_to_answer := EXTRACT(EPOCH FROM (p_answered_at - p_created_at))::INTEGER;
  ELSE
    v_time_to_answer := 0;
  END IF;

  -- Scenario 1: Hit voicemail after 30+ seconds of ringing (wasted 30s waiting)
  IF p_amd_result LIKE 'machine%' AND v_time_to_answer > 30 THEN
    v_score := 70;
    v_reason := 'vm_too_late';

  -- Scenario 2: Short call with no outcome (< 15s, likely immediate hangup or wrong number)
  ELSIF p_duration < 15 AND (p_outcome IS NULL OR p_outcome IN ('no_answer', 'failed', 'unknown')) THEN
    v_score := 40;
    v_reason := 'short_no_outcome';

  -- Scenario 3: Long call with no conversion (> 5 min, no appointment)
  ELSIF p_duration > 300 AND p_auto_disposition NOT IN ('appointment_booked', 'interested', 'callback') THEN
    v_score := 60;
    v_reason := 'long_no_conversion';

  -- Scenario 4: Voicemail left but message too long (implied by duration > 60s on VM)
  ELSIF p_amd_result LIKE 'machine%' AND p_duration > 60 THEN
    v_score := 50;
    v_reason := 'vm_message_too_long';

  -- Scenario 5: Human answered but hung up quickly (< 20s)
  ELSIF p_amd_result = 'human' AND p_duration < 20 THEN
    v_score := 55;
    v_reason := 'quick_hangup';

  -- Scenario 6: Failed/busy calls (infrastructure waste)
  ELSIF p_outcome IN ('failed', 'busy') THEN
    v_score := 30;
    v_reason := 'call_failed';
  END IF;

  RETURN QUERY SELECT v_score, v_reason;
END;
$$ LANGUAGE plpgsql;

-- Function to extract opener from transcript
CREATE OR REPLACE FUNCTION extract_opener_from_transcript(p_transcript TEXT)
RETURNS TEXT AS $$
DECLARE
  v_opener TEXT;
  v_lines TEXT[];
  v_agent_lines TEXT := '';
  v_line TEXT;
  v_count INTEGER := 0;
BEGIN
  IF p_transcript IS NULL OR LENGTH(p_transcript) < 10 THEN
    RETURN NULL;
  END IF;

  -- Split into lines
  v_lines := string_to_array(p_transcript, E'\n');

  -- Get first few agent lines (usually marked with "Agent:" or similar)
  FOREACH v_line IN ARRAY v_lines LOOP
    -- Look for agent speech patterns
    IF v_line ~* '^(agent|assistant|ai|bot|rep):' OR
       (v_count = 0 AND LENGTH(v_line) > 10) THEN
      v_agent_lines := v_agent_lines || ' ' || v_line;
      v_count := v_count + 1;
      IF v_count >= 3 THEN
        EXIT;
      END IF;
    END IF;
  END LOOP;

  -- If no agent lines found, just take first 500 chars
  IF LENGTH(v_agent_lines) < 10 THEN
    v_opener := LEFT(p_transcript, 500);
  ELSE
    v_opener := LEFT(TRIM(v_agent_lines), 500);
  END IF;

  RETURN v_opener;
END;
$$ LANGUAGE plpgsql;

-- Function to normalize opener text for comparison
CREATE OR REPLACE FUNCTION normalize_opener_text(p_opener TEXT)
RETURNS TEXT AS $$
BEGIN
  IF p_opener IS NULL THEN
    RETURN NULL;
  END IF;

  -- Lowercase, remove extra whitespace, remove punctuation except periods
  RETURN LOWER(REGEXP_REPLACE(
    REGEXP_REPLACE(TRIM(p_opener), '\s+', ' ', 'g'),
    '[^\w\s\.]', '', 'g'
  ));
END;
$$ LANGUAGE plpgsql;

-- Function to update opener analytics when a call is analyzed
CREATE OR REPLACE FUNCTION update_opener_analytics(
  p_user_id UUID,
  p_agent_id TEXT,
  p_agent_name TEXT,
  p_opener_text TEXT,
  p_was_answered BOOLEAN,
  p_was_engaged BOOLEAN,
  p_was_converted BOOLEAN,
  p_call_duration INTEGER,
  p_call_id UUID
) RETURNS UUID AS $$
DECLARE
  v_opener_id UUID;
  v_normalized TEXT;
BEGIN
  v_normalized := normalize_opener_text(p_opener_text);

  IF v_normalized IS NULL OR LENGTH(v_normalized) < 10 THEN
    RETURN NULL;
  END IF;

  -- Upsert opener analytics
  INSERT INTO public.opener_analytics (
    user_id, agent_id, agent_name, opener_text, opener_normalized,
    total_uses, calls_answered, calls_engaged, calls_converted,
    avg_call_duration, last_used_at
  ) VALUES (
    p_user_id, p_agent_id, p_agent_name, LEFT(p_opener_text, 500), v_normalized,
    1,
    CASE WHEN p_was_answered THEN 1 ELSE 0 END,
    CASE WHEN p_was_engaged THEN 1 ELSE 0 END,
    CASE WHEN p_was_converted THEN 1 ELSE 0 END,
    COALESCE(p_call_duration, 0),
    NOW()
  )
  ON CONFLICT (user_id, opener_normalized) DO UPDATE SET
    total_uses = opener_analytics.total_uses + 1,
    calls_answered = opener_analytics.calls_answered + CASE WHEN p_was_answered THEN 1 ELSE 0 END,
    calls_engaged = opener_analytics.calls_engaged + CASE WHEN p_was_engaged THEN 1 ELSE 0 END,
    calls_converted = opener_analytics.calls_converted + CASE WHEN p_was_converted THEN 1 ELSE 0 END,
    avg_call_duration = (opener_analytics.avg_call_duration * opener_analytics.total_uses + COALESCE(p_call_duration, 0)) / (opener_analytics.total_uses + 1),
    last_used_at = NOW(),
    updated_at = NOW()
  RETURNING id INTO v_opener_id;

  -- Update calculated rates
  UPDATE public.opener_analytics SET
    answer_rate = CASE WHEN total_uses > 0 THEN (calls_answered::DECIMAL / total_uses * 100) ELSE 0 END,
    engagement_rate = CASE WHEN calls_answered > 0 THEN (calls_engaged::DECIMAL / calls_answered * 100) ELSE 0 END,
    conversion_rate = CASE WHEN calls_engaged > 0 THEN (calls_converted::DECIMAL / calls_engaged * 100) ELSE 0 END,
    effectiveness_score = LEAST(100, GREATEST(0,
      (CASE WHEN total_uses > 0 THEN (calls_answered::DECIMAL / total_uses * 30) ELSE 0 END) +
      (CASE WHEN calls_answered > 0 THEN (calls_engaged::DECIMAL / calls_answered * 40) ELSE 0 END) +
      (CASE WHEN calls_engaged > 0 THEN (calls_converted::DECIMAL / calls_engaged * 30) ELSE 0 END)
    )::INTEGER)
  WHERE id = v_opener_id;

  -- Log the call-opener relationship
  INSERT INTO public.call_opener_logs (
    user_id, call_id, opener_id, was_answered, was_engaged, was_converted,
    call_duration, opener_text_used
  ) VALUES (
    p_user_id, p_call_id, v_opener_id, p_was_answered, p_was_engaged, p_was_converted,
    p_call_duration, LEFT(p_opener_text, 500)
  );

  RETURN v_opener_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update voicemail analytics
CREATE OR REPLACE FUNCTION update_voicemail_analytics(
  p_user_id UUID,
  p_broadcast_id UUID,
  p_voicemail_audio_url TEXT,
  p_voicemail_duration INTEGER,
  p_is_callback BOOLEAN DEFAULT FALSE,
  p_callback_within_1h BOOLEAN DEFAULT FALSE,
  p_callback_within_24h BOOLEAN DEFAULT FALSE,
  p_resulted_in_appointment BOOLEAN DEFAULT FALSE
) RETURNS UUID AS $$
DECLARE
  v_analytics_id UUID;
BEGIN
  -- Find or create analytics record
  SELECT id INTO v_analytics_id
  FROM public.voicemail_analytics
  WHERE user_id = p_user_id
    AND (broadcast_id = p_broadcast_id OR (broadcast_id IS NULL AND p_broadcast_id IS NULL))
    AND (voicemail_audio_url = p_voicemail_audio_url OR (voicemail_audio_url IS NULL AND p_voicemail_audio_url IS NULL));

  IF v_analytics_id IS NULL THEN
    INSERT INTO public.voicemail_analytics (
      user_id, broadcast_id, voicemail_audio_url, voicemail_duration_seconds,
      total_voicemails_left
    ) VALUES (
      p_user_id, p_broadcast_id, p_voicemail_audio_url, p_voicemail_duration,
      CASE WHEN NOT p_is_callback THEN 1 ELSE 0 END
    )
    RETURNING id INTO v_analytics_id;
  ELSE
    -- Update existing record
    IF p_is_callback THEN
      UPDATE public.voicemail_analytics SET
        callbacks_received = callbacks_received + 1,
        callbacks_within_1h = callbacks_within_1h + CASE WHEN p_callback_within_1h THEN 1 ELSE 0 END,
        callbacks_within_24h = callbacks_within_24h + CASE WHEN p_callback_within_24h THEN 1 ELSE 0 END,
        appointments_from_callbacks = appointments_from_callbacks + CASE WHEN p_resulted_in_appointment THEN 1 ELSE 0 END,
        updated_at = NOW()
      WHERE id = v_analytics_id;
    ELSE
      UPDATE public.voicemail_analytics SET
        total_voicemails_left = total_voicemails_left + 1,
        last_used_at = NOW(),
        updated_at = NOW()
      WHERE id = v_analytics_id;
    END IF;
  END IF;

  -- Recalculate rates
  UPDATE public.voicemail_analytics SET
    callback_rate = CASE WHEN total_voicemails_left > 0
      THEN (callbacks_received::DECIMAL / total_voicemails_left * 100) ELSE 0 END,
    callback_rate_24h = CASE WHEN total_voicemails_left > 0
      THEN (callbacks_within_24h::DECIMAL / total_voicemails_left * 100) ELSE 0 END,
    appointment_conversion_rate = CASE WHEN callbacks_received > 0
      THEN (appointments_from_callbacks::DECIMAL / callbacks_received * 100) ELSE 0 END,
    effectiveness_score = LEAST(100, GREATEST(0,
      (CASE WHEN total_voicemails_left > 0 THEN (callbacks_received::DECIMAL / total_voicemails_left * 50) ELSE 0 END) +
      (CASE WHEN callbacks_received > 0 THEN (appointments_from_callbacks::DECIMAL / callbacks_received * 50) ELSE 0 END)
    )::INTEGER)
  WHERE id = v_analytics_id;

  RETURN v_analytics_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 7: VIEWS FOR EASY QUERYING
-- ============================================================================

-- View: Top performing openers
CREATE OR REPLACE VIEW public.top_openers AS
SELECT
  oa.id,
  oa.user_id,
  oa.agent_name,
  oa.opener_text,
  oa.total_uses,
  oa.calls_answered,
  oa.calls_engaged,
  oa.calls_converted,
  oa.answer_rate,
  oa.engagement_rate,
  oa.conversion_rate,
  oa.effectiveness_score,
  oa.avg_call_duration,
  oa.first_used_at,
  oa.last_used_at
FROM public.opener_analytics oa
WHERE oa.total_uses >= 5  -- Only show openers with meaningful sample size
ORDER BY oa.effectiveness_score DESC;

-- View: Time wasted calls summary
CREATE OR REPLACE VIEW public.time_wasted_summary AS
SELECT
  cl.user_id,
  cl.time_wasted_reason,
  COUNT(*) as call_count,
  SUM(cl.duration_seconds) as total_seconds_wasted,
  AVG(cl.time_wasted_score) as avg_waste_score
FROM public.call_logs cl
WHERE cl.time_wasted_score > 0
GROUP BY cl.user_id, cl.time_wasted_reason
ORDER BY total_seconds_wasted DESC;

-- View: Voicemail performance
CREATE OR REPLACE VIEW public.voicemail_performance AS
SELECT
  va.id,
  va.user_id,
  va.broadcast_id,
  va.voicemail_audio_url,
  va.voicemail_duration_seconds,
  va.total_voicemails_left,
  va.callbacks_received,
  va.callback_rate,
  va.callbacks_within_24h,
  va.callback_rate_24h,
  va.appointments_from_callbacks,
  va.appointment_conversion_rate,
  va.effectiveness_score,
  va.first_used_at,
  va.last_used_at
FROM public.voicemail_analytics va
WHERE va.total_voicemails_left >= 10  -- Only show with meaningful sample
ORDER BY va.effectiveness_score DESC;

-- ============================================================================
-- DONE
-- ============================================================================

COMMENT ON TABLE public.opener_analytics IS 'Tracks effectiveness of different script openers';
COMMENT ON TABLE public.call_opener_logs IS 'Links individual calls to their openers for detailed analysis';
COMMENT ON TABLE public.voicemail_analytics IS 'Tracks voicemail message effectiveness and callback rates';
COMMENT ON TABLE public.voicemail_callback_tracking IS 'Tracks individual voicemail-to-callback connections';
