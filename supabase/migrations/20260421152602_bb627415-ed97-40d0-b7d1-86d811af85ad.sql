UPDATE public.dialing_queues
SET status = 'pending',
    attempts = 0,
    scheduled_at = now(),
    priority = 100,
    updated_at = now()
WHERE id = '4e64fc3f-c787-4245-862e-3c93a2646d15'
  AND campaign_id = 'c2756255-d99e-4c18-87f6-d756634cd8a2'
  AND lead_id = '09a9edc0-9ede-4823-a83e-1229280942a6';