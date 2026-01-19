-- ============================================================================
-- CAMPAIGN ANALYZER - Run these queries after each campaign
-- Usage: Replace 'CAMPAIGN_NAME' with your campaign name (e.g., 'Test 1.18')
-- ============================================================================

-- ============================================================================
-- 1. CAMPAIGN OVERVIEW
-- ============================================================================
SELECT
  vb.name as campaign_name,
  vb.status,
  vb.total_leads,
  vb.calls_made,
  vb.calls_answered,
  vb.transfers_completed,
  vb.dnc_requests,
  vb.max_attempts,
  vb.retry_delay_minutes,
  vb.calls_per_minute,
  vb.created_at,
  vb.updated_at
FROM voice_broadcasts vb
WHERE vb.name = 'CAMPAIGN_NAME';

-- ============================================================================
-- 2. STATUS BREAKDOWN
-- ============================================================================
SELECT
  status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
FROM broadcast_queue
WHERE broadcast_id = (SELECT id FROM voice_broadcasts WHERE name = 'CAMPAIGN_NAME')
GROUP BY status
ORDER BY count DESC;

-- ============================================================================
-- 3. AMD RESULTS (Answering Machine Detection)
-- ============================================================================
SELECT
  COALESCE(amd_result, 'no_amd') as amd_result,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
FROM broadcast_queue
WHERE broadcast_id = (SELECT id FROM voice_broadcasts WHERE name = 'CAMPAIGN_NAME')
GROUP BY amd_result
ORDER BY count DESC;

-- ============================================================================
-- 4. DTMF PRESSES (The Money Metric)
-- ============================================================================
SELECT
  dtmf_pressed,
  COUNT(*) as count
FROM broadcast_queue
WHERE broadcast_id = (SELECT id FROM voice_broadcasts WHERE name = 'CAMPAIGN_NAME')
  AND dtmf_pressed IS NOT NULL
GROUP BY dtmf_pressed
ORDER BY dtmf_pressed;

-- ============================================================================
-- 5. RETRY ANALYSIS (How well did retries work?)
-- ============================================================================
SELECT
  attempts,
  status,
  COUNT(*) as count
FROM broadcast_queue
WHERE broadcast_id = (SELECT id FROM voice_broadcasts WHERE name = 'CAMPAIGN_NAME')
GROUP BY attempts, status
ORDER BY attempts, status;

-- ============================================================================
-- 6. TIME OF DAY ANALYSIS
-- ============================================================================
SELECT
  EXTRACT(HOUR FROM created_at) as hour,
  COUNT(*) as total_calls,
  SUM(CASE WHEN status = 'answered' THEN 1 ELSE 0 END) as answered,
  SUM(CASE WHEN dtmf_pressed IS NOT NULL THEN 1 ELSE 0 END) as presses,
  ROUND(SUM(CASE WHEN status = 'answered' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as answer_rate
FROM broadcast_queue
WHERE broadcast_id = (SELECT id FROM voice_broadcasts WHERE name = 'CAMPAIGN_NAME')
GROUP BY EXTRACT(HOUR FROM created_at)
ORDER BY hour;

-- ============================================================================
-- 7. AREA CODE ANALYSIS
-- ============================================================================
SELECT
  SUBSTRING(phone_number FROM 3 FOR 3) as area_code,
  COUNT(*) as total_calls,
  SUM(CASE WHEN status = 'answered' THEN 1 ELSE 0 END) as answered,
  SUM(CASE WHEN dtmf_pressed IS NOT NULL THEN 1 ELSE 0 END) as presses,
  ROUND(SUM(CASE WHEN status = 'answered' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 2) as answer_rate
FROM broadcast_queue
WHERE broadcast_id = (SELECT id FROM voice_broadcasts WHERE name = 'CAMPAIGN_NAME')
GROUP BY SUBSTRING(phone_number FROM 3 FOR 3)
HAVING COUNT(*) >= 5
ORDER BY answer_rate DESC;

-- ============================================================================
-- 8. CALL DURATION ANALYSIS
-- ============================================================================
SELECT
  CASE
    WHEN call_duration_seconds IS NULL THEN 'No Duration'
    WHEN call_duration_seconds < 10 THEN '0-10s'
    WHEN call_duration_seconds < 30 THEN '10-30s'
    WHEN call_duration_seconds < 60 THEN '30-60s'
    WHEN call_duration_seconds < 120 THEN '1-2min'
    ELSE '2min+'
  END as duration_bucket,
  COUNT(*) as count,
  SUM(CASE WHEN dtmf_pressed IS NOT NULL THEN 1 ELSE 0 END) as presses
FROM broadcast_queue
WHERE broadcast_id = (SELECT id FROM voice_broadcasts WHERE name = 'CAMPAIGN_NAME')
GROUP BY
  CASE
    WHEN call_duration_seconds IS NULL THEN 'No Duration'
    WHEN call_duration_seconds < 10 THEN '0-10s'
    WHEN call_duration_seconds < 30 THEN '10-30s'
    WHEN call_duration_seconds < 60 THEN '30-60s'
    WHEN call_duration_seconds < 120 THEN '1-2min'
    ELSE '2min+'
  END
ORDER BY
  CASE
    WHEN call_duration_seconds IS NULL THEN 0
    WHEN call_duration_seconds < 10 THEN 1
    WHEN call_duration_seconds < 30 THEN 2
    WHEN call_duration_seconds < 60 THEN 3
    WHEN call_duration_seconds < 120 THEN 4
    ELSE 5
  END;

-- ============================================================================
-- 9. COST ANALYSIS
-- ============================================================================
SELECT
  COUNT(*) as total_calls,
  SUM(COALESCE(call_cost, 0)) as total_cost,
  ROUND(AVG(COALESCE(call_cost, 0))::numeric, 4) as avg_cost_per_call,
  SUM(CASE WHEN dtmf_pressed IS NOT NULL THEN 1 ELSE 0 END) as total_presses,
  CASE
    WHEN SUM(CASE WHEN dtmf_pressed IS NOT NULL THEN 1 ELSE 0 END) > 0
    THEN ROUND((SUM(COALESCE(call_cost, 0)) / SUM(CASE WHEN dtmf_pressed IS NOT NULL THEN 1 ELSE 0 END))::numeric, 2)
    ELSE NULL
  END as cost_per_press
FROM broadcast_queue
WHERE broadcast_id = (SELECT id FROM voice_broadcasts WHERE name = 'CAMPAIGN_NAME');

-- ============================================================================
-- 10. ERROR ANALYSIS
-- ============================================================================
SELECT
  error_message,
  error_code,
  COUNT(*) as count
FROM broadcast_queue
WHERE broadcast_id = (SELECT id FROM voice_broadcasts WHERE name = 'CAMPAIGN_NAME')
  AND error_message IS NOT NULL
GROUP BY error_message, error_code
ORDER BY count DESC
LIMIT 10;

-- ============================================================================
-- 11. PACING ANALYSIS (Calls per minute over time)
-- ============================================================================
SELECT
  DATE_TRUNC('minute', created_at) as minute,
  COUNT(*) as calls_in_minute
FROM broadcast_queue
WHERE broadcast_id = (SELECT id FROM voice_broadcasts WHERE name = 'CAMPAIGN_NAME')
GROUP BY DATE_TRUNC('minute', created_at)
ORDER BY minute;

-- ============================================================================
-- 12. SUMMARY METRICS (Copy to LEARNINGS.md)
-- ============================================================================
WITH campaign_stats AS (
  SELECT
    COUNT(*) as total_calls,
    SUM(CASE WHEN status = 'answered' THEN 1 ELSE 0 END) as answered,
    SUM(CASE WHEN status = 'voicemail' THEN 1 ELSE 0 END) as voicemail,
    SUM(CASE WHEN status = 'no_answer' THEN 1 ELSE 0 END) as no_answer,
    SUM(CASE WHEN status = 'busy' THEN 1 ELSE 0 END) as busy,
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
    SUM(CASE WHEN dtmf_pressed IS NOT NULL THEN 1 ELSE 0 END) as presses,
    SUM(COALESCE(call_cost, 0)) as total_cost
  FROM broadcast_queue
  WHERE broadcast_id = (SELECT id FROM voice_broadcasts WHERE name = 'CAMPAIGN_NAME')
)
SELECT
  total_calls,
  answered,
  ROUND(answered * 100.0 / NULLIF(total_calls, 0), 2) as answer_rate_pct,
  voicemail,
  ROUND(voicemail * 100.0 / NULLIF(total_calls, 0), 2) as voicemail_rate_pct,
  no_answer + busy + failed as retry_candidates,
  presses,
  ROUND(presses * 100.0 / NULLIF(total_calls, 0), 4) as press_rate_pct,
  ROUND(total_cost::numeric, 2) as total_cost,
  CASE WHEN presses > 0 THEN ROUND((total_cost / presses)::numeric, 2) ELSE NULL END as cost_per_press
FROM campaign_stats;
