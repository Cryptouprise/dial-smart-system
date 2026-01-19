# Quick Campaign Analysis Commands

Run these via Claude with Supabase MCP connected.

## One-Liner: Full Summary

Ask Claude:
> "Analyze the voice broadcast campaign called [NAME] and update LEARNINGS.md"

## Manual Queries (if needed)

### 1. Find Campaign ID
```sql
SELECT id, name, status, calls_made, calls_answered
FROM voice_broadcasts
WHERE name ILIKE '%[SEARCH_TERM]%'
ORDER BY created_at DESC;
```

### 2. Quick Stats
```sql
SELECT
  COUNT(*) as total_calls,
  SUM(CASE WHEN status = 'answered' THEN 1 ELSE 0 END) as answered,
  SUM(CASE WHEN dtmf_pressed IS NOT NULL THEN 1 ELSE 0 END) as presses,
  ROUND(SUM(CASE WHEN status = 'answered' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as answer_rate,
  ROUND(SUM(CASE WHEN dtmf_pressed IS NOT NULL THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 4) as press_rate,
  SUM(COALESCE(call_cost, 0)) as total_cost
FROM broadcast_queue
WHERE broadcast_id = '[CAMPAIGN_ID]';
```

### 3. Status Breakdown
```sql
SELECT status, COUNT(*) as count
FROM broadcast_queue
WHERE broadcast_id = '[CAMPAIGN_ID]'
GROUP BY status ORDER BY count DESC;
```

### 4. DTMF Presses
```sql
SELECT dtmf_pressed, COUNT(*)
FROM broadcast_queue
WHERE broadcast_id = '[CAMPAIGN_ID]' AND dtmf_pressed IS NOT NULL
GROUP BY dtmf_pressed;
```

### 5. Retry Effectiveness
```sql
SELECT attempts, status, COUNT(*)
FROM broadcast_queue
WHERE broadcast_id = '[CAMPAIGN_ID]'
GROUP BY attempts, status
ORDER BY attempts;
```

### 6. Hourly Performance
```sql
SELECT
  EXTRACT(HOUR FROM created_at) as hour,
  COUNT(*) as calls,
  SUM(CASE WHEN dtmf_pressed IS NOT NULL THEN 1 ELSE 0 END) as presses
FROM broadcast_queue
WHERE broadcast_id = '[CAMPAIGN_ID]'
GROUP BY EXTRACT(HOUR FROM created_at)
ORDER BY hour;
```

## After Analysis: Update LEARNINGS.md

Add row to Campaign History table:
```
| [DATE] | [NAME] | [CALLS] | [ANSWERED] ([%]) | [PRESSES] | [RATE]% | $[COST] | $[COST/PRESS] | [KEY LEARNING] |
```

## Comparison Query

Compare two campaigns:
```sql
WITH campaign_a AS (
  SELECT 'Campaign A' as name, COUNT(*) as calls,
    SUM(CASE WHEN dtmf_pressed IS NOT NULL THEN 1 ELSE 0 END) as presses
  FROM broadcast_queue WHERE broadcast_id = '[ID_A]'
),
campaign_b AS (
  SELECT 'Campaign B' as name, COUNT(*) as calls,
    SUM(CASE WHEN dtmf_pressed IS NOT NULL THEN 1 ELSE 0 END) as presses
  FROM broadcast_queue WHERE broadcast_id = '[ID_B]'
)
SELECT * FROM campaign_a UNION ALL SELECT * FROM campaign_b;
```
