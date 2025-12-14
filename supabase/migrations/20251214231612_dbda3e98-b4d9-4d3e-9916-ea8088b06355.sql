-- Delete workflow progress entries for the test lead phone number
DELETE FROM lead_workflow_progress 
WHERE lead_id IN (
  SELECT id FROM leads WHERE phone_number = '+12145291531'
);

-- Also clear any dialing queue entries for this lead
DELETE FROM dialing_queues 
WHERE lead_id IN (
  SELECT id FROM leads WHERE phone_number = '+12145291531'
);