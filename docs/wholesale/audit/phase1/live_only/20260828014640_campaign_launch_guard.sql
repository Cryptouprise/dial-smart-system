-- LIVE-ONLY migration pulled from supabase_migrations.schema_migrations on 2026-10-28 (never committed to repo).
CREATE OR REPLACE FUNCTION public.guard_campaign_has_agent()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM 'active' THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NULLIF(btrim(NEW.agent_id), ''), NEW.telnyx_assistant_id::text) IS NULL THEN
    RAISE EXCEPTION
      'Campaign "%" cannot be activated: no Retell agent or Telnyx assistant assigned',
      NEW.name USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_campaign_has_agent ON public.campaigns;
CREATE TRIGGER trg_guard_campaign_has_agent
  BEFORE INSERT OR UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.guard_campaign_has_agent();

UPDATE public.campaigns
SET max_attempts        = 3,
    retry_delay_minutes = GREATEST(COALESCE(retry_delay_minutes, 0), 60),
    updated_at          = now()
WHERE COALESCE(max_attempts, 1) < 2;

UPDATE public.campaigns c
SET status = 'paused', updated_at = now()
WHERE c.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM public.dialing_queues q
    WHERE q.campaign_id = c.id AND q.status = 'pending'
  );
