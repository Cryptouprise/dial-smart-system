-- Replace the legacy public-anon-JWT automation cron with an opt-in,
-- Vault-backed schedule using a dedicated cron-only secret. The Edge handler
-- independently requires this same token through AUTOMATION_SCHEDULER_CRON_TOKEN.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

CREATE OR REPLACE FUNCTION public.configure_automation_scheduler_cron(
  p_enabled boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron, vault, pg_temp
AS $$
DECLARE
  configured_secret_count integer;
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'automation-scheduler-job') THEN
    PERFORM cron.unschedule('automation-scheduler-job');
  END IF;

  IF NOT COALESCE(p_enabled, false) THEN
    RETURN false;
  END IF;

  SELECT count(DISTINCT secret.name)
  INTO configured_secret_count
  FROM vault.decrypted_secrets AS secret
  WHERE secret.name IN (
      'dial_smart_project_url',
      'dial_smart_publishable_key',
      'dial_smart_automation_scheduler_cron_token'
    )
    AND NULLIF(secret.decrypted_secret, '') IS NOT NULL;

  IF configured_secret_count <> 3 THEN
    RAISE EXCEPTION 'Automation scheduler cron requires project URL, publishable key, and dedicated token Vault secrets';
  END IF;

  PERFORM cron.schedule('automation-scheduler-job', '* * * * *', $command$
    SELECT net.http_post(
      url := rtrim((
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'dial_smart_project_url' LIMIT 1
      ), '/') || '/functions/v1/automation-scheduler',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (
          SELECT decrypted_secret FROM vault.decrypted_secrets
          WHERE name = 'dial_smart_publishable_key' LIMIT 1
        ),
        'X-DialSmart-Automation-Cron-Token', (
          SELECT decrypted_secret FROM vault.decrypted_secrets
          WHERE name = 'dial_smart_automation_scheduler_cron_token' LIMIT 1
        )
      ),
      body := '{"source":"pg_cron"}'::jsonb
    ) AS request_id;
  $command$);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.configure_automation_scheduler_cron(boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.configure_automation_scheduler_cron(boolean)
  TO service_role;

-- Deployments must set the matching Edge/Vault token and explicitly enable the
-- cron after staging health checks. Applying migrations always removes the old
-- anon-authorized schedule and leaves automation disabled.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'automation-scheduler-job') THEN
    PERFORM cron.unschedule('automation-scheduler-job');
  END IF;
END;
$$;
