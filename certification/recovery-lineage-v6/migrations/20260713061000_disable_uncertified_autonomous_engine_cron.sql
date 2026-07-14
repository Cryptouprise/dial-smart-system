-- Historical unattended jobs mutate global provider/queue state without the
-- certified tenant, generation, and maximum-call-duration contracts. In
-- particular, safety-backstops can fail a legitimate 60-minute call after 15
-- minutes and make it eligible for redial, while campaign-health-autofix resets
-- broadcast queues globally. ai-autonomous-engine is also launch-quarantined.
-- Remove every matching job and provide no enable switch.

DO $$
DECLARE
  target_job_id bigint;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RETURN;
  END IF;

  FOR target_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN (
      'ai-autonomous-engine-job',
      'safety-backstops',
      'campaign-health-autofix'
    )
  LOOP
    PERFORM cron.unschedule(target_job_id);
  END LOOP;
END;
$$;
