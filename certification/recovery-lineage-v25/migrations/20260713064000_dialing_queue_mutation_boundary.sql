BEGIN;

-- Dialing queues are provider-lifecycle records, not browser-owned scratch
-- rows.  A direct client UPDATE/DELETE can otherwise erase an accepted call,
-- detach reconciliation evidence through ON DELETE SET NULL, and make the
-- dispatcher redial a person who may still be on a live call.
ALTER TABLE public.dialing_queues ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  policy_name text;
  column_list text;
BEGIN
  FOR policy_name IN
    SELECT policy.policyname
    FROM pg_policies AS policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename = 'dialing_queues'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.dialing_queues', policy_name);
  END LOOP;

  SELECT string_agg(format('%I', attribute.attname), ', ' ORDER BY attribute.attnum)
  INTO column_list
  FROM pg_attribute AS attribute
  WHERE attribute.attrelid = 'public.dialing_queues'::regclass
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped;

  REVOKE ALL PRIVILEGES ON TABLE public.dialing_queues
    FROM PUBLIC, anon, authenticated;
  IF column_list IS NOT NULL THEN
    EXECUTE format(
      'REVOKE ALL PRIVILEGES (%s) ON TABLE public.dialing_queues FROM PUBLIC, anon, authenticated',
      column_list
    );
  END IF;
END;
$$;

CREATE POLICY "Members view tenant dialing queues"
  ON public.dialing_queues
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.campaigns AS campaign
      JOIN public.leads AS lead
        ON lead.id = dialing_queues.lead_id
       AND lead.organization_id = campaign.organization_id
       AND lead.user_id = campaign.user_id
      JOIN public.organization_users AS membership
        ON membership.organization_id = campaign.organization_id
       AND membership.user_id = auth.uid()
      WHERE campaign.id = dialing_queues.campaign_id
    )
  );

GRANT SELECT ON TABLE public.dialing_queues TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.dialing_queues TO service_role;

CREATE OR REPLACE FUNCTION public.dialing_queue_has_provider_evidence(
  p_queue_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.dialing_queues AS queue
    WHERE queue.id = p_queue_id
      AND (
        COALESCE(queue.attempts, 0) > 0
        OR queue.dispatch_generation IS NOT NULL
        OR queue.last_provider IS NOT NULL
        OR queue.last_provider_call_id IS NOT NULL
        OR queue.last_attempted_at IS NOT NULL
        OR EXISTS (
          SELECT 1
          FROM public.provider_dispatch_claims AS dispatch
          WHERE dispatch.queue_id = queue.id
        )
        OR EXISTS (
          SELECT 1
          FROM public.provider_call_attempts AS attempt
          WHERE attempt.queue_id = queue.id
        )
        OR EXISTS (
          SELECT 1
          FROM public.call_logs AS call_log
          WHERE call_log.provider_reconciliation_queue_id = queue.id
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.dialing_queue_has_unresolved_lifecycle(
  p_queue_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.dialing_queues AS queue
    WHERE queue.id = p_queue_id
      AND (
        queue.status = 'calling'
        OR queue.last_provider_call_id IS NOT NULL
        OR EXISTS (
          SELECT 1
          FROM public.call_logs AS call_log
          WHERE call_log.provider_reconciliation_queue_id = queue.id
            AND call_log.provider_reconciliation_required = true
        )
        OR EXISTS (
          SELECT 1
          FROM public.provider_dispatch_claims AS dispatch
          WHERE dispatch.queue_id = queue.id
            AND (
              dispatch.status IN ('claimed', 'acceptance_unknown')
              OR (
                dispatch.status = 'accepted'
                AND (
                  dispatch.provider_call_id IS NULL
                  OR NOT EXISTS (
                    SELECT 1
                    FROM public.provider_callback_receipts AS terminal_receipt
                    WHERE terminal_receipt.provider = dispatch.provider
                      AND terminal_receipt.provider_call_id = dispatch.provider_call_id
                      AND terminal_receipt.lifecycle_stage = 'terminal_reconciliation'
                      AND terminal_receipt.status = 'processed'
                  )
                  OR EXISTS (
                    SELECT 1
                    FROM public.provider_callback_receipts AS unresolved_receipt
                    WHERE unresolved_receipt.provider = dispatch.provider
                      AND unresolved_receipt.provider_call_id = dispatch.provider_call_id
                      AND unresolved_receipt.lifecycle_stage IN (
                        'terminal_reconciliation', 'analysis_effects'
                      )
                      AND unresolved_receipt.status <> 'processed'
                  )
                )
              )
            )
        )
        OR EXISTS (
          SELECT 1
          FROM public.provider_dispatch_claims AS dispatch
          JOIN public.provider_reconciliation_jobs AS job
            ON job.dispatch_claim_id = dispatch.id
          WHERE dispatch.queue_id = queue.id
            AND job.state <> 'resolved'
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.protect_dialing_queue_provider_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.dialing_queue_has_provider_evidence(OLD.id)
    OR public.dialing_queue_has_unresolved_lifecycle(OLD.id)
  THEN
    RAISE EXCEPTION 'DIALING_QUEUE_PROVIDER_EVIDENCE_IMMUTABLE'
      USING ERRCODE = '23514',
      DETAIL = format(
        'queue %s has provider evidence or an unresolved provider lifecycle and must be retained',
        OLD.id
      ),
      HINT = 'Use an audited terminal status transition; never delete provider-linked queue evidence.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS dialing_queue_provider_evidence_delete_guard
  ON public.dialing_queues;
CREATE TRIGGER dialing_queue_provider_evidence_delete_guard
BEFORE DELETE ON public.dialing_queues
FOR EACH ROW EXECUTE FUNCTION public.protect_dialing_queue_provider_evidence();

-- Narrow browser command boundary.  The phone number and retry ceiling come
-- from authoritative tenant rows; callers cannot inject provider state or
-- overwrite an unresolved generation.  A fully reconciled row may be reused
-- for a new explicit callback without destroying its historical evidence.
CREATE OR REPLACE FUNCTION public.enqueue_dialing_queue(
  p_campaign_id uuid,
  p_lead_id uuid,
  p_scheduled_at timestamptz DEFAULT now(),
  p_priority integer DEFAULT 1
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_user_id uuid := auth.uid();
  caller_role text := auth.role();
  campaign public.campaigns%ROWTYPE;
  lead public.leads%ROWTYPE;
  queue public.dialing_queues%ROWTYPE;
  queue_id uuid;
BEGIN
  IF p_campaign_id IS NULL OR p_lead_id IS NULL THEN
    RAISE EXCEPTION 'campaign and lead are required' USING ERRCODE = '22023';
  END IF;
  IF p_scheduled_at IS NULL
    OR p_scheduled_at < now() - interval '5 minutes'
    OR p_scheduled_at > now() + interval '366 days'
  THEN
    RAISE EXCEPTION 'queue schedule must be between now and 366 days from now'
      USING ERRCODE = '22023';
  END IF;
  IF p_priority IS NULL OR p_priority NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'queue priority must be between 1 and 100'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO campaign
  FROM public.campaigns
  WHERE id = p_campaign_id
  FOR UPDATE;
  SELECT * INTO lead
  FROM public.leads
  WHERE id = p_lead_id
  FOR UPDATE;

  IF campaign.id IS NULL OR lead.id IS NULL THEN
    RAISE EXCEPTION 'campaign or lead does not exist' USING ERRCODE = '22023';
  END IF;
  IF campaign.organization_id IS DISTINCT FROM lead.organization_id
    OR campaign.user_id IS DISTINCT FROM lead.user_id
  THEN
    RAISE EXCEPTION 'queue campaign and lead do not share an authoritative tenant'
      USING ERRCODE = '42501';
  END IF;
  IF campaign.status <> 'active' THEN
    RAISE EXCEPTION 'only an active campaign may receive a queue entry'
      USING ERRCODE = '55000';
  END IF;
  IF caller_role IS DISTINCT FROM 'service_role'
    AND (
      caller_user_id IS NULL
      OR campaign.user_id IS DISTINCT FROM caller_user_id
      OR lead.user_id IS DISTINCT FROM caller_user_id
      OR NOT EXISTS (
        SELECT 1
        FROM public.organization_users AS membership
        WHERE membership.organization_id = campaign.organization_id
          AND membership.user_id = caller_user_id
      )
    )
  THEN
    RAISE EXCEPTION 'caller does not own the campaign/lead tenant graph'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO queue
  FROM public.dialing_queues
  WHERE campaign_id = p_campaign_id
    AND lead_id = p_lead_id
  FOR UPDATE;

  IF queue.id IS NOT NULL THEN
    IF public.dialing_queue_has_unresolved_lifecycle(queue.id) THEN
      RAISE EXCEPTION 'DIALING_QUEUE_RECONCILIATION_REQUIRED'
        USING ERRCODE = '55000',
        DETAIL = format('queue %s still has an unresolved provider lifecycle', queue.id);
    END IF;

    UPDATE public.dialing_queues
    SET phone_number = lead.phone_number,
        priority = p_priority,
        status = 'pending',
        scheduled_at = p_scheduled_at,
        attempts = 0,
        max_attempts = COALESCE(campaign.max_attempts, 3),
        updated_at = now(),
        notes = left(
          COALESCE(NULLIF(queue.notes, '') || ' | ', '')
            || 'Re-enqueued through the tenant command boundary',
          4000
        )
    WHERE id = queue.id
    RETURNING id INTO queue_id;
  ELSE
    INSERT INTO public.dialing_queues (
      campaign_id,
      lead_id,
      phone_number,
      priority,
      status,
      scheduled_at,
      attempts,
      max_attempts
    ) VALUES (
      campaign.id,
      lead.id,
      lead.phone_number,
      p_priority,
      'pending',
      p_scheduled_at,
      0,
      COALESCE(campaign.max_attempts, 3)
    )
    RETURNING id INTO queue_id;
  END IF;

  RETURN queue_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_dialing_queues(
  p_queue_id uuid DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL,
  p_lead_id uuid DEFAULT NULL,
  p_reason text DEFAULT 'Cancelled by tenant operator'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_user_id uuid := auth.uid();
  caller_role text := auth.role();
  queue record;
  cancelled_count integer := 0;
  reason text := NULLIF(btrim(p_reason), '');
BEGIN
  IF p_queue_id IS NULL AND p_campaign_id IS NULL AND p_lead_id IS NULL THEN
    RAISE EXCEPTION 'a queue, campaign, or lead selector is required'
      USING ERRCODE = '22023';
  END IF;
  IF reason IS NULL OR length(reason) > 500 THEN
    RAISE EXCEPTION 'a cancellation reason of 1 to 500 characters is required'
      USING ERRCODE = '22023';
  END IF;

  FOR queue IN
    SELECT q.id, q.notes
    FROM public.dialing_queues AS q
    JOIN public.campaigns AS campaign ON campaign.id = q.campaign_id
    JOIN public.leads AS lead
      ON lead.id = q.lead_id
     AND lead.organization_id = campaign.organization_id
     AND lead.user_id = campaign.user_id
    WHERE (p_queue_id IS NULL OR q.id = p_queue_id)
      AND (p_campaign_id IS NULL OR q.campaign_id = p_campaign_id)
      AND (p_lead_id IS NULL OR q.lead_id = p_lead_id)
      AND (
        caller_role = 'service_role'
        OR (
          caller_user_id IS NOT NULL
          AND campaign.user_id = caller_user_id
          AND lead.user_id = caller_user_id
          AND EXISTS (
            SELECT 1
            FROM public.organization_users AS membership
            WHERE membership.organization_id = campaign.organization_id
              AND membership.user_id = caller_user_id
          )
        )
      )
    ORDER BY q.id
    FOR UPDATE OF q
  LOOP
    IF public.dialing_queue_has_unresolved_lifecycle(queue.id) THEN
      RAISE EXCEPTION 'DIALING_QUEUE_RECONCILIATION_REQUIRED'
        USING ERRCODE = '55000',
        DETAIL = format('queue %s still has an unresolved provider lifecycle', queue.id);
    END IF;

    UPDATE public.dialing_queues
    SET status = 'removed',
        updated_at = now(),
        notes = left(
          COALESCE(NULLIF(queue.notes, '') || ' | ', '') || reason,
          4000
        )
    WHERE id = queue.id;
    cancelled_count := cancelled_count + 1;
  END LOOP;

  RETURN cancelled_count;
END;
$$;

REVOKE ALL ON FUNCTION public.dialing_queue_has_provider_evidence(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dialing_queue_has_unresolved_lifecycle(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_dialing_queue_provider_evidence()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_dialing_queue(uuid, uuid, timestamptz, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_dialing_queues(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.dialing_queue_has_provider_evidence(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.dialing_queue_has_unresolved_lifecycle(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_dialing_queue(uuid, uuid, timestamptz, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_dialing_queues(uuid, uuid, uuid, text)
  TO service_role;

COMMENT ON TABLE public.dialing_queues IS
  'Provider-lifecycle queue. Browsers have read-only access; service-only audited commands own mutations and provider-linked rows cannot be deleted.';
COMMENT ON FUNCTION public.enqueue_dialing_queue(uuid, uuid, timestamptz, integer) IS
  'Service-only tenant command boundary for an explicit pending enqueue/re-enqueue using authoritative campaign, lead, phone, and retry data.';
COMMENT ON FUNCTION public.cancel_dialing_queues(uuid, uuid, uuid, text) IS
  'Service-only tenant command boundary that soft-removes only queues with no unresolved provider lifecycle.';

COMMIT;
