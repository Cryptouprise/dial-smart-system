UPDATE broadcast_queue 
SET status = 'pending', attempts = 0, dtmf_pressed = NULL 
WHERE broadcast_id = 'a4d3c027-271b-4214-bfe2-998f3f29ea13';