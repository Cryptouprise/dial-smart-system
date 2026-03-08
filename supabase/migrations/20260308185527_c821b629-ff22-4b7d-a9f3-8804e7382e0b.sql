-- Fix campaign retry delay from 300 to 5 minutes
UPDATE campaigns SET retry_delay_minutes = 5 WHERE id = '0312b0de-63f5-41db-93dc-b32cbcb66961';

-- Reset stuck queue entries to NOW so they're immediately eligible
UPDATE dialing_queues SET scheduled_at = now() WHERE campaign_id = '0312b0de-63f5-41db-93dc-b32cbcb66961' AND status = 'pending';