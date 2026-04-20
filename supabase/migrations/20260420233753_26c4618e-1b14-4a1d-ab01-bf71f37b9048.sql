UPDATE dialing_queues
SET status='pending', attempts=0, scheduled_at=now(), priority=100, notes='Manual retry'
WHERE id='4e64fc3f-c787-4245-862e-3c93a2646d15';