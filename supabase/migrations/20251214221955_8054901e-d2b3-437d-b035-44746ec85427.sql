-- Step 1: Handle tables with unique constraints on lead_id by deleting duplicates first
-- Delete older nudge tracking records for duplicate leads (keep the one for the oldest lead)
DELETE FROM lead_nudge_tracking lnt
WHERE EXISTS (
  SELECT 1 FROM (
    SELECT 
      phone_number,
      user_id,
      array_agg(id ORDER BY created_at) as all_ids
    FROM leads
    GROUP BY phone_number, user_id
    HAVING COUNT(*) > 1
  ) dl 
  WHERE lnt.lead_id = ANY(dl.all_ids[2:])
);

-- Delete older reachability scores for duplicate leads
DELETE FROM lead_reachability_scores lrs
WHERE EXISTS (
  SELECT 1 FROM (
    SELECT 
      phone_number,
      user_id,
      array_agg(id ORDER BY created_at) as all_ids
    FROM leads
    GROUP BY phone_number, user_id
    HAVING COUNT(*) > 1
  ) dl 
  WHERE lrs.lead_id = ANY(dl.all_ids[2:])
);

-- Step 2: Create temp table with duplicates for updates
CREATE TEMP TABLE duplicate_leads AS
SELECT 
  phone_number,
  user_id,
  MIN(created_at) as oldest_created,
  array_agg(id ORDER BY created_at) as all_ids
FROM leads
GROUP BY phone_number, user_id
HAVING COUNT(*) > 1;

-- Step 3: Update foreign key references to point to oldest lead
UPDATE call_logs cl
SET lead_id = (
  SELECT (all_ids)[1] FROM duplicate_leads dl 
  WHERE cl.lead_id = ANY(dl.all_ids[2:])
)
WHERE EXISTS (
  SELECT 1 FROM duplicate_leads dl 
  WHERE cl.lead_id = ANY(dl.all_ids[2:])
);

UPDATE sms_messages sm
SET lead_id = (
  SELECT (all_ids)[1] FROM duplicate_leads dl 
  WHERE sm.lead_id = ANY(dl.all_ids[2:])
)
WHERE EXISTS (
  SELECT 1 FROM duplicate_leads dl 
  WHERE sm.lead_id = ANY(dl.all_ids[2:])
);

UPDATE campaign_leads cml
SET lead_id = (
  SELECT (all_ids)[1] FROM duplicate_leads dl 
  WHERE cml.lead_id = ANY(dl.all_ids[2:])
)
WHERE EXISTS (
  SELECT 1 FROM duplicate_leads dl 
  WHERE cml.lead_id = ANY(dl.all_ids[2:])
);

UPDATE lead_workflow_progress lwp
SET lead_id = (
  SELECT (all_ids)[1] FROM duplicate_leads dl 
  WHERE lwp.lead_id = ANY(dl.all_ids[2:])
)
WHERE EXISTS (
  SELECT 1 FROM duplicate_leads dl 
  WHERE lwp.lead_id = ANY(dl.all_ids[2:])
);

UPDATE lead_pipeline_positions lpp
SET lead_id = (
  SELECT (all_ids)[1] FROM duplicate_leads dl 
  WHERE lpp.lead_id = ANY(dl.all_ids[2:])
)
WHERE EXISTS (
  SELECT 1 FROM duplicate_leads dl 
  WHERE lpp.lead_id = ANY(dl.all_ids[2:])
);

UPDATE calendar_appointments ca
SET lead_id = (
  SELECT (all_ids)[1] FROM duplicate_leads dl 
  WHERE ca.lead_id = ANY(dl.all_ids[2:])
)
WHERE EXISTS (
  SELECT 1 FROM duplicate_leads dl 
  WHERE ca.lead_id = ANY(dl.all_ids[2:])
);

UPDATE broadcast_queue bq
SET lead_id = (
  SELECT (all_ids)[1] FROM duplicate_leads dl 
  WHERE bq.lead_id = ANY(dl.all_ids[2:])
)
WHERE EXISTS (
  SELECT 1 FROM duplicate_leads dl 
  WHERE bq.lead_id = ANY(dl.all_ids[2:])
);

-- Step 4: Delete duplicate leads (keep oldest)
DELETE FROM leads l
WHERE EXISTS (
  SELECT 1 FROM duplicate_leads dl 
  WHERE l.id = ANY(dl.all_ids[2:])
);

-- Drop temp table
DROP TABLE IF EXISTS duplicate_leads;