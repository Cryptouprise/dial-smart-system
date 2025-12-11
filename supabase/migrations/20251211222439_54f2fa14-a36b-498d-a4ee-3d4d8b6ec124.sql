-- Reset queue item for retesting
UPDATE broadcast_queue 
SET status = 'pending', attempts = 0, dtmf_pressed = NULL 
WHERE broadcast_id = 'a4d3c027-271b-4214-bfe2-998f3f29ea13';

-- Reset broadcast stats
UPDATE voice_broadcasts 
SET status = 'draft', calls_made = 0, calls_answered = 0, transfers_completed = 0, callbacks_scheduled = 0, dnc_requests = 0
WHERE id = 'a4d3c027-271b-4214-bfe2-998f3f29ea13';