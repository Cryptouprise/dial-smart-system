
INSERT INTO dispositions (user_id, name, description, color, pipeline_stage, auto_actions) VALUES
  ('5969774f-5340-4e4f-8517-bcc89fa6b1eb', 'Transferred', 'Successfully transferred to live agent', '#10b981', 'transferred', '{"remove_from_queue": true}'::jsonb),
  ('5969774f-5340-4e4f-8517-bcc89fa6b1eb', 'Dropped Call Positive', 'Call dropped mid-conversation with positive engagement', '#f59e0b', 'hot_leads', '{"pause_workflow": true}'::jsonb),
  ('5969774f-5340-4e4f-8517-bcc89fa6b1eb', 'Bad Number', 'Invalid or disconnected phone number', '#ef4444', 'invalid_leads', '{"remove_from_queue": true}'::jsonb),
  ('5969774f-5340-4e4f-8517-bcc89fa6b1eb', 'Busy Signal', 'Line busy, retry later', '#f97316', 'callbacks', '{"pause_workflow": true}'::jsonb),
  ('5969774f-5340-4e4f-8517-bcc89fa6b1eb', 'Call Not Connected', 'Call failed to connect', '#94a3b8', 'callbacks', '{"pause_workflow": true}'::jsonb),
  ('5969774f-5340-4e4f-8517-bcc89fa6b1eb', 'Send More Info', 'Lead requested additional information', '#8b5cf6', 'follow_up', '{"pause_workflow": true}'::jsonb)
ON CONFLICT DO NOTHING;
