-- Stop a campaign from going active without an agent, and fix the campaigns
-- that would waste half of every list.
--
-- Two campaigns had no agent on either provider:
--   "Solar Freedom - Speed to Lead"       provider=assistable, agent_id NULL
--   "Accounting Firm Appointment Setter"  provider=retell,     agent_id NULL
-- Both would fail the moment anyone pressed launch. A third, "3.7 test telnyx",
-- stores agent_id as the empty string rather than NULL, so any guard has to
-- treat blank as missing -- a plain NULL check would let it through.
--
-- Separately, three campaigns ran with max_attempts = 1. The April 2026 data
-- shows a 53.6% no-answer rate (2,333 of 4,353 dials), so a single attempt
-- discards more than half the list on the first pass. The retry machinery in
-- call-tracking-webhook was built for exactly this and was switched off.

-- ---------------------------------------------------------------------------
-- 1. Launch guard
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_campaign_has_agent()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Only gate the transition into a dialing state. Draft and paused campaigns
  -- are work in progress and may legitimately be incomplete.
  IF NEW.status IS DISTINCT FROM 'active' THEN
    RETURN NEW;
  END IF;

  -- Dual-provider: a campaign may carry both a Retell agent and a Telnyx
  -- assistant. At least one must be usable. NULLIF collapses the empty-string
  -- case that "3.7 test telnyx" demonstrates.
  IF COALESCE(NULLIF(btrim(NEW.agent_id), ''), NEW.telnyx_assistant_id::text) IS NULL THEN
    RAISE EXCEPTION
      'Campaign "%" cannot be activated: no Retell agent or Telnyx assistant assigned',
      NEW.name
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_campaign_has_agent ON public.campaigns;

CREATE TRIGGER trg_guard_campaign_has_agent
  BEFORE INSERT OR UPDATE ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_campaign_has_agent();

-- ---------------------------------------------------------------------------
-- 2. Turn retries on
--
-- 3 attempts spaced 60 minutes apart matches the playbook already documented
-- in CLAUDE.md (max_attempts=3, retry_delay=60min). Only campaigns still on
-- the single-attempt default are touched; anything already configured with
-- retries keeps its own settings.
-- ---------------------------------------------------------------------------

UPDATE public.campaigns
SET max_attempts        = 3,
    retry_delay_minutes = GREATEST(COALESCE(retry_delay_minutes, 0), 60),
    updated_at          = now()
WHERE COALESCE(max_attempts, 1) < 2;

-- ---------------------------------------------------------------------------
-- 3. No active campaign with an empty queue
--
-- "Cortana New Jersey Solar Update" sat at status=active with 498 completed
-- and 0 pending queue rows: permanently idle, with no signal explaining why.
-- Park it until it has work. Leaving it active is indistinguishable from a
-- broken dispatcher.
-- ---------------------------------------------------------------------------

UPDATE public.campaigns c
SET status     = 'paused',
    updated_at = now()
WHERE c.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM public.dialing_queues q
    WHERE q.campaign_id = c.id AND q.status = 'pending'
  );
