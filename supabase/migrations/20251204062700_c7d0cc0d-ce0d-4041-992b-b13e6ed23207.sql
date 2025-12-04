-- Enable required extensions for scheduled edge function calls
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Grant usage to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Schedule automation-scheduler to run every minute
SELECT cron.schedule(
  'automation-scheduler-job',
  '* * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://emonjusymdripmkvtttc.supabase.co/functions/v1/automation-scheduler',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtb25qdXN5bWRyaXBta3Z0dHRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg3MzYyNDcsImV4cCI6MjA2NDMxMjI0N30.NPmcCmeJwR_vNymUZp73G9PqbsiPJ7KSTA9x8xG6Soc"}'::jsonb,
      body := concat('{"triggered_at": "', now(), '"}')::jsonb
    ) AS request_id;
  $$
);