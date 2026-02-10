-- ============================================================================
-- LEAD JOURNEY INTELLIGENCE - February 10, 2026
--
-- The missing brain that actively manages every lead through their journey.
-- Tracks where each lead is, what happened, what should happen next, and why.
-- ============================================================================

-- ============================================================================
-- TABLE: lead_journey_state
-- One row per lead. The AI's understanding of where this person is.
-- ============================================================================
CREATE TABLE IF NOT EXISTS lead_journey_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,

  -- Where they are
  journey_stage TEXT NOT NULL DEFAULT 'fresh' CHECK (journey_stage IN (
    'fresh',        -- Never contacted. Clock is ticking.
    'attempting',   -- We're trying to reach them. No answer yet.
    'engaged',      -- They answered or replied. Conversation started.
    'hot',          -- Strong interest signals. Compress timeline.
    'nurturing',    -- Talked but not ready. Long-term drip.
    'stalled',      -- Was engaged, went silent. Need re-engagement.
    'dormant',      -- 30+ days no activity. Low priority.
    'callback_set', -- They explicitly asked us to call at a specific time.
    'booked',       -- Appointment set. Shift to confirmation/reminder.
    'closed_won',   -- Converted.
    'closed_lost'   -- DNC, not interested, dead.
  )),

  -- Interaction history summary (computed, not stored per-event)
  total_touches INTEGER NOT NULL DEFAULT 0,
  call_attempts INTEGER NOT NULL DEFAULT 0,
  calls_answered INTEGER NOT NULL DEFAULT 0,
  sms_sent INTEGER NOT NULL DEFAULT 0,
  sms_received INTEGER NOT NULL DEFAULT 0,
  emails_sent INTEGER NOT NULL DEFAULT 0,

  -- Timing intelligence
  last_touch_at TIMESTAMPTZ,
  last_positive_signal_at TIMESTAMPTZ,
  first_contact_at TIMESTAMPTZ,
  explicit_callback_at TIMESTAMPTZ,      -- HARD date: "call me Tuesday at 2pm"
  explicit_callback_notes TEXT,           -- Why they asked for this time

  -- What we've learned about this person
  best_hour_to_call INTEGER CHECK (best_hour_to_call BETWEEN 0 AND 23),
  best_day_to_call INTEGER CHECK (best_day_to_call BETWEEN 0 AND 6),
  preferred_channel TEXT CHECK (preferred_channel IN ('call', 'sms', 'email', 'unknown')) DEFAULT 'unknown',
  interest_level INTEGER NOT NULL DEFAULT 5 CHECK (interest_level BETWEEN 1 AND 10),
  sentiment_trend TEXT DEFAULT 'unknown' CHECK (sentiment_trend IN ('warming', 'cooling', 'stable', 'unknown')),
  last_sentiment_score NUMERIC(3,2),

  -- Next action decision
  next_action_type TEXT CHECK (next_action_type IN (
    'call', 'sms', 'ai_sms', 'email', 'wait',
    'nurture_sms', 'reengagement_call', 'confirmation_sms',
    'appointment_reminder', 'none'
  )),
  next_action_at TIMESTAMPTZ,
  next_action_reason TEXT,               -- Human-readable explanation
  next_action_channel_rotation INTEGER DEFAULT 0,  -- Tracks call/SMS alternation

  -- Journey metrics
  days_in_current_stage INTEGER DEFAULT 0,
  stage_entered_at TIMESTAMPTZ DEFAULT now(),
  times_stage_changed INTEGER DEFAULT 0,
  longest_gap_days NUMERIC(6,1) DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id, lead_id)
);

CREATE INDEX idx_journey_user_stage ON lead_journey_state(user_id, journey_stage);
CREATE INDEX idx_journey_next_action ON lead_journey_state(user_id, next_action_at) WHERE next_action_at IS NOT NULL;
CREATE INDEX idx_journey_stale ON lead_journey_state(user_id, last_touch_at);

ALTER TABLE lead_journey_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own journeys" ON lead_journey_state
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- TABLE: followup_playbook
-- Configurable rules per user. Sales psychology defaults pre-loaded.
-- Each rule: when a lead is in [stage] + [condition], do [action] after [delay].
-- ============================================================================
CREATE TABLE IF NOT EXISTS followup_playbook (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rule_name TEXT NOT NULL,
  description TEXT,
  journey_stage TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 5,
  -- Conditions (all must be true)
  min_touches INTEGER DEFAULT 0,
  max_touches INTEGER DEFAULT 999,
  min_days_in_stage INTEGER DEFAULT 0,
  max_days_in_stage INTEGER DEFAULT 999,
  min_interest_level INTEGER DEFAULT 1,
  max_interest_level INTEGER DEFAULT 10,
  requires_no_explicit_callback BOOLEAN DEFAULT true,  -- Don't override explicit requests
  -- Action
  action_type TEXT NOT NULL CHECK (action_type IN ('call', 'sms', 'ai_sms', 'email', 'wait', 'nurture_sms', 'reengagement_call', 'move_stage')),
  action_config JSONB DEFAULT '{}',  -- message template, stage name, etc.
  -- Timing
  delay_hours NUMERIC(8,2) DEFAULT 0,  -- Hours from last touch before this fires
  preferred_hour INTEGER CHECK (preferred_hour BETWEEN 0 AND 23),  -- Prefer this hour
  respect_calling_windows BOOLEAN DEFAULT true,
  -- Control
  enabled BOOLEAN NOT NULL DEFAULT true,
  is_system_default BOOLEAN DEFAULT false,  -- Can't be deleted, only disabled
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_playbook_user_stage ON followup_playbook(user_id, journey_stage, enabled);

ALTER TABLE followup_playbook ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own playbook" ON followup_playbook
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- TABLE: journey_event_log
-- Audit trail of every decision the journey engine makes
-- ============================================================================
CREATE TABLE IF NOT EXISTS journey_event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  lead_id UUID NOT NULL,
  event_type TEXT NOT NULL,  -- 'stage_change', 'action_queued', 'rule_fired', 'signal_detected'
  from_stage TEXT,
  to_stage TEXT,
  rule_name TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_journey_events_lead ON journey_event_log(lead_id, created_at DESC);
CREATE INDEX idx_journey_events_user ON journey_event_log(user_id, created_at DESC);

ALTER TABLE journey_event_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own events" ON journey_event_log
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- FUNCTION: seed_default_playbook()
-- Inserts battle-tested sales follow-up rules for a user.
-- Based on real sales psychology and data from top performers.
-- ============================================================================
CREATE OR REPLACE FUNCTION seed_default_playbook(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rules_created INTEGER := 0;
BEGIN
  -- Only seed if user has no rules yet
  IF EXISTS (SELECT 1 FROM followup_playbook WHERE user_id = p_user_id LIMIT 1) THEN
    RETURN 0;
  END IF;

  -- ===========================================
  -- FRESH LEADS: Speed to lead is everything
  -- Harvard study: 5-minute response = 100x more likely to connect
  -- ===========================================
  INSERT INTO followup_playbook (user_id, rule_name, description, journey_stage, priority, action_type, delay_hours, action_config, is_system_default, min_touches, max_touches)
  VALUES
  (p_user_id, 'speed_to_lead', 'Call new leads within 5 minutes. Speed to lead is the #1 predictor of connection.', 'fresh', 1, 'call', 0.08, '{"urgency": "immediate"}', true, 0, 0),
  (p_user_id, 'fresh_sms_intro', 'If first call goes unanswered, send intro SMS within 2 minutes. Multi-channel increases connect rate by 25%.', 'attempting', 2, 'sms', 0.03, '{"template": "Hey {{first_name}}, just tried to give you a call. Is now a good time or would another time work better?"}', true, 1, 1),
  (p_user_id, 'fresh_call_2', 'Second call attempt 30 minutes after first. Different time = different chance.', 'attempting', 3, 'call', 0.5, '{}', true, 1, 2),
  (p_user_id, 'fresh_call_3', 'Third attempt 4 hours later. Change of day-part matters.', 'attempting', 4, 'call', 4, '{}', true, 2, 3),
  (p_user_id, 'fresh_sms_value', 'After 3 unanswered calls, send value-driven SMS. Stop calling, start giving.', 'attempting', 5, 'ai_sms', 1, '{"prompt": "Write a short, friendly follow-up SMS. Mention you tried calling a few times. Offer something of value. Ask if there is a better time. Keep it under 160 chars."}', true, 3, 4);
  rules_created := rules_created + 5;

  -- ===========================================
  -- ENGAGED: They answered. Momentum is key.
  -- Follow up while the iron is hot.
  -- ===========================================
  INSERT INTO followup_playbook (user_id, rule_name, description, journey_stage, priority, action_type, delay_hours, action_config, is_system_default, min_touches, max_touches)
  VALUES
  (p_user_id, 'engaged_followup_sms', 'After a good conversation, send recap SMS within 1 hour. Reinforce while memory is fresh.', 'engaged', 1, 'ai_sms', 1, '{"prompt": "Write a brief, warm follow-up SMS referencing our recent conversation. Include one specific thing discussed. Keep it personal and under 160 chars."}', true, 1, 10),
  (p_user_id, 'engaged_next_call', 'Follow-up call 24-48 hours after engagement. Keep the momentum.', 'engaged', 3, 'call', 36, '{}', true, 2, 10);
  rules_created := rules_created + 2;

  -- ===========================================
  -- HOT LEADS: Compress everything. They're ready.
  -- ===========================================
  INSERT INTO followup_playbook (user_id, rule_name, description, journey_stage, priority, action_type, delay_hours, action_config, is_system_default, min_touches, max_touches)
  VALUES
  (p_user_id, 'hot_same_day', 'Hot leads get same-day follow-up. Strike while interested.', 'hot', 1, 'call', 4, '{}', true, 0, 99),
  (p_user_id, 'hot_morning_text', 'Morning check-in SMS for hot leads. Stay top of mind.', 'hot', 2, 'sms', 18, '{"template": "Good morning {{first_name}}! Just wanted to check in. Any questions about what we discussed?"}', true, 2, 99);
  rules_created := rules_created + 2;

  -- ===========================================
  -- NURTURING: Not ready yet. Play the long game.
  -- Drip value, don't push.
  -- ===========================================
  INSERT INTO followup_playbook (user_id, rule_name, description, journey_stage, priority, action_type, delay_hours, action_config, is_system_default, min_touches, max_touches)
  VALUES
  (p_user_id, 'nurture_week_1', 'First nurture touch: 5-7 days. Provide value, not a pitch.', 'nurturing', 3, 'ai_sms', 144, '{"prompt": "Write a helpful, non-salesy follow-up SMS. Share a quick tip or insight related to our service. Keep it casual and under 160 chars. Do NOT ask for a meeting."}', true, 0, 99),
  (p_user_id, 'nurture_week_3', 'Second nurture: 2-3 weeks. Light touch, genuine check-in.', 'nurturing', 4, 'ai_sms', 432, '{"prompt": "Write a very brief, genuine check-in SMS. Ask how things are going. Reference something from earlier conversations if possible. Under 120 chars."}', true, 0, 99),
  (p_user_id, 'nurture_month', 'Monthly nurture: Just staying on the radar.', 'nurturing', 5, 'ai_sms', 720, '{"prompt": "Write a brief, friendly monthly check-in SMS. Keep it light. One sentence. Under 100 chars."}', true, 0, 99);
  rules_created := rules_created + 3;

  -- ===========================================
  -- STALLED: Was engaged, went silent. Re-engagement.
  -- Pattern interrupt needed.
  -- ===========================================
  INSERT INTO followup_playbook (user_id, rule_name, description, journey_stage, priority, action_type, delay_hours, action_config, is_system_default, min_touches, max_touches)
  VALUES
  (p_user_id, 'stalled_reengagement', 'Stalled lead re-engagement. Use curiosity, not pressure.', 'stalled', 2, 'ai_sms', 72, '{"prompt": "Write a brief re-engagement SMS for someone who was interested but went quiet. Use curiosity or a new angle. Do NOT be pushy. Under 140 chars."}', true, 0, 99),
  (p_user_id, 'stalled_breakup', 'The breakup text. Reverse psychology. Last attempt.', 'stalled', 5, 'sms', 240, '{"template": "Hey {{first_name}}, I haven''t heard back so I don''t want to keep bothering you. If things change, my line is always open. Best of luck!"}', true, 4, 99);
  rules_created := rules_created + 2;

  -- ===========================================
  -- CALLBACK SET: They told us when. Honor it EXACTLY.
  -- ===========================================
  INSERT INTO followup_playbook (user_id, rule_name, description, journey_stage, priority, action_type, delay_hours, action_config, is_system_default, min_touches, max_touches, requires_no_explicit_callback)
  VALUES
  (p_user_id, 'callback_reminder_sms', 'Send reminder SMS 1 hour before scheduled callback. Professional and respectful.', 'callback_set', 1, 'sms', 0, '{"template": "Hi {{first_name}}, just a heads up I''ll be calling you shortly as we discussed. Looking forward to chatting!"}', true, 0, 99, false),
  (p_user_id, 'callback_execute', 'Execute the callback call at the exact requested time. Never early, never late.', 'callback_set', 1, 'call', 0, '{"respect_explicit_time": true}', true, 0, 99, false);
  rules_created := rules_created + 2;

  -- ===========================================
  -- BOOKED: Appointment set. Reduce no-shows.
  -- Confirmation + reminder sequence.
  -- ===========================================
  INSERT INTO followup_playbook (user_id, rule_name, description, journey_stage, priority, action_type, delay_hours, action_config, is_system_default, min_touches, max_touches)
  VALUES
  (p_user_id, 'booked_confirmation', 'Immediate confirmation SMS after booking. Lock it in.', 'booked', 1, 'sms', 0.05, '{"template": "Awesome {{first_name}}! Your appointment is confirmed. Looking forward to it!"}', true, 0, 0),
  (p_user_id, 'booked_day_before', 'Reminder 24 hours before appointment.', 'booked', 2, 'sms', 0, '{"template": "Hi {{first_name}}, just a reminder about our call tomorrow. See you then!"}', true, 0, 99),
  (p_user_id, 'booked_morning_of', 'Morning-of reminder. Reduces no-shows by 30%.', 'booked', 3, 'sms', 0, '{"template": "Good morning {{first_name}}! Looking forward to our chat today. Talk soon!"}', true, 0, 99);
  rules_created := rules_created + 3;

  RETURN rules_created;
END;
$$;

-- ============================================================================
-- Add autonomous_settings column for journey engine
-- ============================================================================
DO $$
BEGIN
  ALTER TABLE autonomous_settings ADD COLUMN IF NOT EXISTS manage_lead_journeys BOOLEAN DEFAULT false;
  ALTER TABLE autonomous_settings ADD COLUMN IF NOT EXISTS journey_max_daily_touches INTEGER DEFAULT 200;
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;
