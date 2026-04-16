UPDATE public.dialing_queues
SET status = 'pending',
    attempts = 0,
    scheduled_at = now(),
    priority = 100,
    updated_at = now()
WHERE id = '4e64fc3f-c787-4245-862e-3c93a2646d15';

UPDATE public.campaigns
SET status = 'active',
    updated_at = now()
WHERE id = 'c2756255-d99e-4c18-87f6-d756634cd8a2';