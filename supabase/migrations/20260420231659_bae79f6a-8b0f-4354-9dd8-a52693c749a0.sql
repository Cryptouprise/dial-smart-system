INSERT INTO public.dialing_queues (campaign_id, lead_id, phone_number, status, scheduled_at, attempts, priority)
VALUES ('c2756255-d99e-4c18-87f6-d756634cd8a2', 'bf40605c-7400-497a-b74f-bf2fefd38c13', '+14752429282', 'pending', now(), 0, 100)
ON CONFLICT (campaign_id, lead_id) DO UPDATE SET
  status = 'pending',
  phone_number = '+14752429282',
  scheduled_at = now(),
  attempts = 0,
  priority = 100,
  updated_at = now();