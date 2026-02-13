
-- View using actual lead_journey_state columns
CREATE OR REPLACE VIEW call_outcome_dimensions AS
SELECT
  cl.user_id,
  cl.id AS call_id,
  cl.lead_id,
  cl.outcome,
  cl.duration_seconds AS duration,
  cl.sentiment AS sentiment_score,
  cl.created_at,
  EXTRACT(DOW FROM cl.created_at) AS day_of_week,
  EXTRACT(HOUR FROM cl.created_at) AS hour_of_day,
  EXTRACT(MONTH FROM cl.created_at) AS month,
  cl.caller_id AS from_number,
  cl.campaign_id,
  l.lead_source,
  l.status AS lead_status,
  l.tags AS lead_tags,
  ljs.current_stage AS journey_stage,
  ljs.campaign_type,
  ljs.total_touches,
  ljs.total_calls AS call_attempts,
  NULL::TEXT AS preferred_channel,
  ljs.engagement_score AS interest_level,
  CASE
    WHEN cl.outcome IN ('appointment_set') THEN 'appointment'
    WHEN cl.outcome IN ('completed','answered','interested','callback','talk_to_human') THEN 'positive'
    WHEN cl.outcome IN ('voicemail','left_voicemail') THEN 'voicemail'
    WHEN cl.outcome IN ('no_answer','busy') THEN 'no_connect'
    WHEN cl.outcome IN ('not_interested','dnc','wrong_number') THEN 'negative'
    ELSE 'other'
  END AS outcome_category
FROM call_logs cl
LEFT JOIN leads l ON cl.lead_id = l.id
LEFT JOIN lead_journey_state ljs ON cl.lead_id = ljs.lead_id AND cl.user_id = ljs.user_id;

-- Funnel trend function
CREATE OR REPLACE FUNCTION get_funnel_trend(p_user_id UUID, p_days INTEGER DEFAULT 14)
RETURNS TABLE (
  snapshot_date DATE,
  total_leads INTEGER,
  hot_count INTEGER,
  engaged_count INTEGER,
  stalled_count INTEGER,
  booked_count INTEGER,
  won_count INTEGER,
  calls_made INTEGER,
  appointments_booked INTEGER,
  total_spend_cents INTEGER,
  cost_per_appointment_cents INTEGER,
  overall_conversion_rate NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    fs.snapshot_date,
    fs.total_leads,
    fs.hot_count,
    fs.engaged_count,
    fs.stalled_count,
    fs.booked_count,
    fs.won_count,
    fs.calls_made,
    fs.appointments_booked,
    fs.total_spend_cents,
    fs.cost_per_appointment_cents,
    fs.overall_conversion_rate
  FROM funnel_snapshots fs
  WHERE fs.user_id = p_user_id
    AND fs.snapshot_date >= CURRENT_DATE - p_days
  ORDER BY fs.snapshot_date ASC;
END;
$$;
