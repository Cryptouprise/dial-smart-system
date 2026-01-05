-- Fix call_logs.outcome constraint to include all possible outcomes
ALTER TABLE call_logs DROP CONSTRAINT IF EXISTS call_logs_outcome_check;
ALTER TABLE call_logs ADD CONSTRAINT call_logs_outcome_check 
  CHECK (outcome IS NULL OR outcome = ANY (ARRAY[
    'interested',
    'not_interested', 
    'callback',
    'callback_requested',
    'converted',
    'do_not_call',
    'contacted',
    'appointment_set',
    'dnc',
    'completed',
    'voicemail',
    'no_answer',
    'busy',
    'failed',
    'unknown'
  ]));

-- Add unique constraint on dialing_queues if not exists for upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'dialing_queues_campaign_lead_unique'
  ) THEN
    ALTER TABLE dialing_queues ADD CONSTRAINT dialing_queues_campaign_lead_unique 
      UNIQUE (campaign_id, lead_id);
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Add unique constraint on lead_pipeline_positions if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'lead_pipeline_positions_lead_user_unique'
  ) THEN
    ALTER TABLE lead_pipeline_positions ADD CONSTRAINT lead_pipeline_positions_lead_user_unique 
      UNIQUE (lead_id, user_id);
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;