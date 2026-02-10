-- ============================================================================
-- AUTONOMOUS ENGINE UPGRADE - February 10, 2026
--
-- Adds:
-- 1. ai_action_queue - Server-side action queue with approval flow
-- 2. ai_operational_memory - Persistent structured memory for AI
-- 3. optimal_calling_windows - Learned best times to call
-- 4. lead_score_outcomes - Tracks score-at-call-time for feedback loop
-- 5. pg_cron job for ai-autonomous-engine (every 5 min)
-- ============================================================================

-- ============================================================================
-- TABLE: ai_action_queue
-- Queued actions the AI decides to take. Supports approval_required flow.
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_action_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  action_params JSONB NOT NULL DEFAULT '{}',
  priority INTEGER NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'executing', 'completed', 'failed', 'rejected', 'expired')),
  requires_approval BOOLEAN NOT NULL DEFAULT true,
  reasoning TEXT,
  source TEXT NOT NULL DEFAULT 'autonomous_engine' CHECK (source IN ('autonomous_engine', 'ai_brain', 'ai_assistant', 'manual')),
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '24 hours')
);

CREATE INDEX idx_action_queue_user_status ON ai_action_queue(user_id, status);
CREATE INDEX idx_action_queue_pending ON ai_action_queue(status, created_at) WHERE status = 'pending';
CREATE INDEX idx_action_queue_expires ON ai_action_queue(expires_at) WHERE status = 'pending';

ALTER TABLE ai_action_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own actions" ON ai_action_queue
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can approve/reject own actions" ON ai_action_queue
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================================
-- TABLE: ai_operational_memory
-- Persistent structured memory - campaigns, lessons, preferences, insights
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_operational_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  memory_type TEXT NOT NULL CHECK (memory_type IN (
    'campaign_result', 'user_preference', 'lesson_learned',
    'lead_insight', 'system_state', 'performance_baseline',
    'calling_pattern', 'error_pattern'
  )),
  subject TEXT NOT NULL,
  content JSONB NOT NULL,
  importance INTEGER NOT NULL DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_accessed TIMESTAMPTZ DEFAULT now(),
  access_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ
);

CREATE INDEX idx_op_memory_user_type ON ai_operational_memory(user_id, memory_type);
CREATE INDEX idx_op_memory_importance ON ai_operational_memory(user_id, importance DESC);
CREATE INDEX idx_op_memory_recent ON ai_operational_memory(user_id, last_accessed DESC);

ALTER TABLE ai_operational_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own memories" ON ai_operational_memory
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- TABLE: optimal_calling_windows
-- Learned best calling times from actual outcome data
-- ============================================================================
CREATE TABLE IF NOT EXISTS optimal_calling_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  hour_of_day INTEGER NOT NULL CHECK (hour_of_day BETWEEN 0 AND 23),
  total_calls INTEGER NOT NULL DEFAULT 0,
  answered_calls INTEGER NOT NULL DEFAULT 0,
  appointments_set INTEGER NOT NULL DEFAULT 0,
  answer_rate NUMERIC(5,4) DEFAULT 0,
  appointment_rate NUMERIC(5,4) DEFAULT 0,
  score NUMERIC(8,4) DEFAULT 0,
  last_calculated TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, day_of_week, hour_of_day)
);

ALTER TABLE optimal_calling_windows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own windows" ON optimal_calling_windows
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- TABLE: lead_score_outcomes
-- Tracks what a lead's score was at call time + what happened
-- Enables feedback loop for scoring weights
-- ============================================================================
CREATE TABLE IF NOT EXISTS lead_score_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL,
  call_id UUID,
  score_at_call NUMERIC(6,2),
  score_components JSONB,
  outcome TEXT NOT NULL CHECK (outcome IN ('answered', 'appointment', 'voicemail', 'no_answer', 'busy', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_score_outcomes_user ON lead_score_outcomes(user_id, created_at DESC);

ALTER TABLE lead_score_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own outcomes" ON lead_score_outcomes
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- FUNCTION: expire_old_actions()
-- Auto-expire pending actions older than 24h
-- ============================================================================
CREATE OR REPLACE FUNCTION expire_old_actions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE ai_action_queue
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at < now();

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;

-- ============================================================================
-- FUNCTION: save_operational_memory()
-- Upsert a memory entry, replacing if same user+type+subject exists
-- ============================================================================
CREATE OR REPLACE FUNCTION save_operational_memory(
  p_user_id UUID,
  p_memory_type TEXT,
  p_subject TEXT,
  p_content JSONB,
  p_importance INTEGER DEFAULT 5
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  memory_id UUID;
BEGIN
  INSERT INTO ai_operational_memory (user_id, memory_type, subject, content, importance)
  VALUES (p_user_id, p_memory_type, p_subject, p_content, p_importance)
  ON CONFLICT ON CONSTRAINT ai_operational_memory_pkey DO NOTHING;

  -- Check if exists by user+type+subject
  SELECT id INTO memory_id
  FROM ai_operational_memory
  WHERE user_id = p_user_id
    AND memory_type = p_memory_type
    AND subject = p_subject
  LIMIT 1;

  IF memory_id IS NOT NULL THEN
    UPDATE ai_operational_memory
    SET content = p_content,
        importance = p_importance,
        last_accessed = now(),
        access_count = access_count + 1
    WHERE id = memory_id;
    RETURN memory_id;
  ELSE
    INSERT INTO ai_operational_memory (user_id, memory_type, subject, content, importance)
    VALUES (p_user_id, p_memory_type, p_subject, p_content, p_importance)
    RETURNING id INTO memory_id;
    RETURN memory_id;
  END IF;
END;
$$;

-- ============================================================================
-- FUNCTION: recalculate_calling_windows()
-- Aggregates call outcome data into optimal windows per user
-- ============================================================================
CREATE OR REPLACE FUNCTION recalculate_calling_windows(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  windows_updated INTEGER := 0;
BEGIN
  INSERT INTO optimal_calling_windows (
    user_id, day_of_week, hour_of_day,
    total_calls, answered_calls, appointments_set,
    answer_rate, appointment_rate, score, last_calculated
  )
  SELECT
    p_user_id,
    EXTRACT(DOW FROM cl.created_at)::INTEGER as dow,
    EXTRACT(HOUR FROM cl.created_at)::INTEGER as hod,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE cl.outcome IN ('completed', 'answered', 'appointment_set')) as answered,
    COUNT(*) FILTER (WHERE cl.outcome = 'appointment_set') as appts,
    CASE WHEN COUNT(*) > 0
      THEN COUNT(*) FILTER (WHERE cl.outcome IN ('completed', 'answered', 'appointment_set'))::NUMERIC / COUNT(*)
      ELSE 0 END,
    CASE WHEN COUNT(*) > 0
      THEN COUNT(*) FILTER (WHERE cl.outcome = 'appointment_set')::NUMERIC / COUNT(*)
      ELSE 0 END,
    -- Score: weighted combination (appointments worth 3x answers)
    CASE WHEN COUNT(*) > 0
      THEN (
        COUNT(*) FILTER (WHERE cl.outcome IN ('completed', 'answered', 'appointment_set'))::NUMERIC / COUNT(*)
        + 3.0 * COUNT(*) FILTER (WHERE cl.outcome = 'appointment_set')::NUMERIC / COUNT(*)
      ) ELSE 0 END,
    now()
  FROM call_logs cl
  WHERE cl.user_id = p_user_id
    AND cl.created_at > now() - INTERVAL '30 days'
  GROUP BY dow, hod
  ON CONFLICT (user_id, day_of_week, hour_of_day) DO UPDATE SET
    total_calls = EXCLUDED.total_calls,
    answered_calls = EXCLUDED.answered_calls,
    appointments_set = EXCLUDED.appointments_set,
    answer_rate = EXCLUDED.answer_rate,
    appointment_rate = EXCLUDED.appointment_rate,
    score = EXCLUDED.score,
    last_calculated = now();

  GET DIAGNOSTICS windows_updated = ROW_COUNT;
  RETURN windows_updated;
END;
$$;

-- ============================================================================
-- Add last_engine_run and engine_interval_minutes to autonomous_settings
-- ============================================================================
DO $$
BEGIN
  ALTER TABLE autonomous_settings ADD COLUMN IF NOT EXISTS last_engine_run TIMESTAMPTZ;
  ALTER TABLE autonomous_settings ADD COLUMN IF NOT EXISTS engine_interval_minutes INTEGER DEFAULT 5;
  ALTER TABLE autonomous_settings ADD COLUMN IF NOT EXISTS auto_optimize_calling_times BOOLEAN DEFAULT false;
  ALTER TABLE autonomous_settings ADD COLUMN IF NOT EXISTS auto_adjust_pacing BOOLEAN DEFAULT false;
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

-- ============================================================================
-- Schedule pg_cron job for ai-autonomous-engine (every 5 minutes)
-- ============================================================================
DO $$
BEGIN
  -- Only create if pg_cron extension exists
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('ai-autonomous-engine-job');
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'ai-autonomous-engine-job',
      '*/5 * * * *',
      $$SELECT net.http_post(
        url := current_setting('app.supabase_url') || '/functions/v1/ai-autonomous-engine',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.service_role_key')
        ),
        body := '{"source": "pg_cron"}'::jsonb
      )$$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available, autonomous engine must be triggered externally';
END;
$$;
