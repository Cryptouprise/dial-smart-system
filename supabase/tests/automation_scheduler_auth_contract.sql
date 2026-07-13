-- Run after a disposable migration rebuild. This proves that the legacy
-- anon-authorized cron is gone and only service_role can enable its replacement.

BEGIN;

DO $automation_scheduler_auth$
DECLARE
  function_definition text;
BEGIN
  IF to_regprocedure('public.configure_automation_scheduler_cron(boolean)') IS NULL THEN
    RAISE EXCEPTION 'configure_automation_scheduler_cron(boolean) is missing';
  END IF;

  IF has_function_privilege('anon', 'public.configure_automation_scheduler_cron(boolean)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.configure_automation_scheduler_cron(boolean)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'untrusted roles can enable the global automation cron';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.configure_automation_scheduler_cron(boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role cannot configure the global automation cron';
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'automation-scheduler-job') THEN
    RAISE EXCEPTION 'automation scheduler cron must be disabled after migration replay';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname IN (
      'ai-autonomous-engine-job',
      'safety-backstops',
      'campaign-health-autofix'
    )
  ) THEN
    RAISE EXCEPTION 'a launch-quarantined global mutation cron survived migration replay';
  END IF;

  SELECT pg_get_functiondef('public.configure_automation_scheduler_cron(boolean)'::regprocedure)
  INTO function_definition;
  IF position('dial_smart_automation_scheduler_cron_token' IN function_definition) = 0
    OR position('X-DialSmart-Automation-Cron-Token' IN function_definition) = 0
  THEN
    RAISE EXCEPTION 'automation scheduler cron is not bound to its dedicated Vault token';
  END IF;
  IF position('Authorization' IN function_definition) > 0 THEN
    RAISE EXCEPTION 'automation scheduler cron still embeds a bearer authorization header';
  END IF;
END;
$automation_scheduler_auth$;

ROLLBACK;
