-- Contact safety / provider exact-once foundation.
--
-- Invariants established here:
--   * queue claims do not count attempts;
--   * one provider-accepted physical call increments attempts exactly once;
--   * callbacks and one-time post-call effects are claimed idempotently;
--   * stop controls are evaluated at the final provider boundary;
--   * failed provider creation can release a credit reservation atomically.

CREATE TABLE IF NOT EXISTS public.contact_stop_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type text NOT NULL CHECK (scope_type IN ('global', 'organization', 'user', 'campaign', 'provider', 'channel')),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  provider text,
  channel text NOT NULL DEFAULT 'all' CHECK (channel IN ('all', 'voice', 'sms')),
  active boolean NOT NULL DEFAULT true,
  reason text NOT NULL,
  activated_at timestamptz NOT NULL DEFAULT now(),
  activated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (scope_type <> 'global' OR (organization_id IS NULL AND user_id IS NULL AND campaign_id IS NULL AND provider IS NULL AND channel = 'all')),
  CHECK (scope_type <> 'organization' OR organization_id IS NOT NULL),
  CHECK (scope_type <> 'user' OR user_id IS NOT NULL),
  CHECK (scope_type <> 'campaign' OR campaign_id IS NOT NULL),
  CHECK (scope_type <> 'provider' OR provider IS NOT NULL),
  CHECK (scope_type <> 'channel' OR channel <> 'all')
);

CREATE INDEX IF NOT EXISTS idx_contact_stop_controls_active
  ON public.contact_stop_controls(active, scope_type, organization_id, user_id, campaign_id, provider, channel)
  WHERE active = true;

ALTER TABLE public.contact_stop_controls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view applicable contact stops" ON public.contact_stop_controls;
CREATE POLICY "Users can view applicable contact stops"
  ON public.contact_stop_controls FOR SELECT TO authenticated
  USING (
    scope_type = 'global'
    OR user_id = auth.uid()
    OR (organization_id IS NOT NULL AND public.user_in_organization(organization_id))
    OR campaign_id IN (SELECT id FROM public.campaigns WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Org admins can manage contact stops" ON public.contact_stop_controls;
CREATE POLICY "Org admins can manage contact stops"
  ON public.contact_stop_controls FOR ALL TO authenticated
  USING (
    CASE scope_type
      WHEN 'user' THEN user_id = auth.uid()
      WHEN 'campaign' THEN campaign_id IN (SELECT id FROM public.campaigns WHERE user_id = auth.uid())
      WHEN 'organization' THEN organization_id IS NOT NULL AND public.is_org_admin(organization_id)
      WHEN 'provider' THEN
        CASE
          WHEN organization_id IS NOT NULL THEN public.is_org_admin(organization_id)
          WHEN campaign_id IS NOT NULL THEN campaign_id IN (SELECT id FROM public.campaigns WHERE user_id = auth.uid())
          WHEN user_id IS NOT NULL THEN user_id = auth.uid()
          ELSE false
        END
      WHEN 'channel' THEN
        CASE
          WHEN organization_id IS NOT NULL THEN public.is_org_admin(organization_id)
          WHEN campaign_id IS NOT NULL THEN campaign_id IN (SELECT id FROM public.campaigns WHERE user_id = auth.uid())
          WHEN user_id IS NOT NULL THEN user_id = auth.uid()
          ELSE false
        END
      ELSE false
    END
  )
  WITH CHECK (
    CASE scope_type
      WHEN 'user' THEN user_id = auth.uid()
      WHEN 'campaign' THEN campaign_id IN (SELECT id FROM public.campaigns WHERE user_id = auth.uid())
      WHEN 'organization' THEN organization_id IS NOT NULL AND public.is_org_admin(organization_id)
      WHEN 'provider' THEN
        CASE
          WHEN organization_id IS NOT NULL THEN public.is_org_admin(organization_id)
          WHEN campaign_id IS NOT NULL THEN campaign_id IN (SELECT id FROM public.campaigns WHERE user_id = auth.uid())
          WHEN user_id IS NOT NULL THEN user_id = auth.uid()
          ELSE false
        END
      WHEN 'channel' THEN
        CASE
          WHEN organization_id IS NOT NULL THEN public.is_org_admin(organization_id)
          WHEN campaign_id IS NOT NULL THEN campaign_id IN (SELECT id FROM public.campaigns WHERE user_id = auth.uid())
          WHEN user_id IS NOT NULL THEN user_id = auth.uid()
          ELSE false
        END
      ELSE false
    END
  );

CREATE TABLE IF NOT EXISTS public.provider_callback_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_call_id text NOT NULL,
  lifecycle_stage text NOT NULL,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'processed', 'failed', 'reconciliation_required')),
  payload_sha256 text,
  first_received_at timestamptz NOT NULL DEFAULT now(),
  last_received_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz DEFAULT (now() + interval '5 minutes'),
  claim_token uuid NOT NULL DEFAULT gen_random_uuid(),
  attempt_count integer NOT NULL DEFAULT 1,
  processed_at timestamptz,
  last_error text,
  UNIQUE (provider, provider_call_id, lifecycle_stage)
);

ALTER TABLE public.provider_callback_receipts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_provider_callback_receipts_reconciliation
  ON public.provider_callback_receipts(last_received_at)
  WHERE status = 'reconciliation_required';

CREATE TABLE IF NOT EXISTS public.provider_call_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_call_id text NOT NULL,
  queue_id uuid REFERENCES public.dialing_queues(id) ON DELETE SET NULL,
  call_log_id uuid REFERENCES public.call_logs(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (provider, provider_call_id)
);

ALTER TABLE public.provider_call_attempts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.dialing_queues
  ADD COLUMN IF NOT EXISTS last_provider text,
  ADD COLUMN IF NOT EXISTS last_provider_call_id text,
  ADD COLUMN IF NOT EXISTS last_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatch_generation uuid;

CREATE TABLE IF NOT EXISTS public.provider_dispatch_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  logical_key text NOT NULL UNIQUE CHECK (length(logical_key) BETWEEN 8 AND 512),
  queue_id uuid REFERENCES public.dialing_queues(id) ON DELETE SET NULL,
  dispatch_generation uuid,
  call_log_id uuid NOT NULL REFERENCES public.call_logs(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  provider text NOT NULL CHECK (provider IN ('retell', 'telnyx')),
  status text NOT NULL DEFAULT 'claimed'
    CHECK (status IN ('claimed', 'accepted', 'definite_failure', 'acceptance_unknown')),
  provider_call_id text,
  last_error text,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((queue_id IS NULL) = (dispatch_generation IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_dispatch_claim_queue_generation
  ON public.provider_dispatch_claims(queue_id, dispatch_generation)
  WHERE queue_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_provider_dispatch_claims_reconciliation
  ON public.provider_dispatch_claims(status, claimed_at)
  WHERE status IN ('claimed', 'acceptance_unknown');

ALTER TABLE public.provider_dispatch_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.provider_dispatch_claims FROM PUBLIC, anon, authenticated;

-- A provider create request can time out after the provider accepted it. Those
-- calls must be quarantined, not treated as definite failures and redialed.
-- The queue link lets cleanup jobs preserve the claim until a signed provider
-- callback (or a dedicated reconciler) resolves the ambiguity.
ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS provider_reconciliation_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS provider_reconciliation_reason text,
  ADD COLUMN IF NOT EXISTS provider_reconciliation_marked_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_reconciled_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_reconciliation_queue_id uuid REFERENCES public.dialing_queues(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_call_logs_provider_reconciliation
  ON public.call_logs(provider_reconciliation_required, provider_reconciliation_marked_at)
  WHERE provider_reconciliation_required = true;

CREATE INDEX IF NOT EXISTS idx_call_logs_provider_reconciliation_queue
  ON public.call_logs(provider_reconciliation_queue_id)
  WHERE provider_reconciliation_required = true;

CREATE OR REPLACE FUNCTION public.evaluate_contact_stop(
  p_user_id uuid,
  p_organization_id uuid,
  p_campaign_id uuid,
  p_provider text,
  p_channel text DEFAULT 'voice'
)
RETURNS TABLE (
  allowed boolean,
  stop_id uuid,
  scope_type text,
  reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_stop public.contact_stop_controls%ROWTYPE;
BEGIN
  SELECT control.* INTO v_stop
  FROM public.contact_stop_controls control
  WHERE control.active = true
    AND (control.expires_at IS NULL OR control.expires_at > now())
    AND (
      control.scope_type = 'global'
      OR (control.scope_type = 'organization' AND control.organization_id = p_organization_id)
      OR (control.scope_type = 'user' AND control.user_id = p_user_id)
      OR (control.scope_type = 'campaign' AND control.campaign_id = p_campaign_id)
      OR (
        control.scope_type = 'provider'
        AND lower(control.provider) = lower(p_provider)
        AND (control.organization_id IS NULL OR control.organization_id = p_organization_id)
        AND (control.user_id IS NULL OR control.user_id = p_user_id)
        AND (control.campaign_id IS NULL OR control.campaign_id = p_campaign_id)
      )
      OR (
        control.scope_type = 'channel'
        AND control.channel = p_channel
        AND (control.organization_id IS NULL OR control.organization_id = p_organization_id)
        AND (control.user_id IS NULL OR control.user_id = p_user_id)
        AND (control.campaign_id IS NULL OR control.campaign_id = p_campaign_id)
        AND (control.provider IS NULL OR lower(control.provider) = lower(p_provider))
      )
    )
  ORDER BY CASE control.scope_type
    WHEN 'global' THEN 1
    WHEN 'organization' THEN 2
    WHEN 'user' THEN 3
    WHEN 'campaign' THEN 4
    WHEN 'provider' THEN 5
    ELSE 6
  END
  LIMIT 1;

  IF v_stop.id IS NULL THEN
    RETURN QUERY SELECT true, NULL::uuid, NULL::text, NULL::text;
  ELSE
    RETURN QUERY SELECT false, v_stop.id, v_stop.scope_type, v_stop.reason;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_provider_callback(
  p_provider text,
  p_provider_call_id text,
  p_lifecycle_stage text,
  p_payload_sha256 text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_claim_token uuid;
BEGIN
  INSERT INTO public.provider_callback_receipts (
    provider, provider_call_id, lifecycle_stage, payload_sha256
  ) VALUES (
    lower(p_provider), p_provider_call_id, p_lifecycle_stage, p_payload_sha256
  )
  ON CONFLICT (provider, provider_call_id, lifecycle_stage) DO UPDATE
  SET status = 'processing',
      payload_sha256 = EXCLUDED.payload_sha256,
      last_received_at = now(),
      locked_until = now() + interval '5 minutes',
      claim_token = gen_random_uuid(),
      attempt_count = public.provider_callback_receipts.attempt_count + 1,
      last_error = NULL
  WHERE p_lifecycle_stage NOT IN ('analysis_effects', 'terminal_reconciliation')
    AND (
      public.provider_callback_receipts.status = 'failed'
      OR (
        public.provider_callback_receipts.status = 'processing'
        AND public.provider_callback_receipts.locked_until < now()
      )
    )
  RETURNING claim_token INTO v_claim_token;

  RETURN v_claim_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_provider_callback(
  p_provider text,
  p_provider_call_id text,
  p_lifecycle_stage text,
  p_claim_token uuid,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.provider_callback_receipts
  SET status = CASE
        WHEN p_error IS NULL THEN 'processed'
        WHEN p_lifecycle_stage IN ('analysis_effects', 'terminal_reconciliation')
          THEN 'reconciliation_required'
        ELSE 'failed'
      END,
      processed_at = CASE WHEN p_error IS NULL THEN now() ELSE NULL END,
      locked_until = NULL,
      last_error = p_error
  WHERE provider = lower(p_provider)
    AND provider_call_id = p_provider_call_id
    AND lifecycle_stage = p_lifecycle_stage
    AND claim_token = p_claim_token;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'PROVIDER_CALLBACK_LEASE_LOST'
      USING ERRCODE = '40001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_provider_dispatch(
  p_logical_key text,
  p_queue_id uuid,
  p_dispatch_generation uuid,
  p_call_log_id uuid,
  p_organization_id uuid,
  p_user_id uuid,
  p_campaign_id uuid,
  p_lead_id uuid,
  p_provider text
)
RETURNS TABLE(claimed boolean, claim_id uuid, claim_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_queue public.dialing_queues%ROWTYPE;
  v_claim public.provider_dispatch_claims%ROWTYPE;
BEGIN
  IF p_logical_key IS NULL OR length(btrim(p_logical_key)) NOT BETWEEN 8 AND 512 THEN
    RAISE EXCEPTION 'invalid provider dispatch logical key';
  END IF;
  IF lower(p_provider) NOT IN ('retell', 'telnyx') THEN
    RAISE EXCEPTION 'unsupported provider dispatch claim';
  END IF;
  IF (p_queue_id IS NULL) <> (p_dispatch_generation IS NULL) THEN
    RAISE EXCEPTION 'queue and dispatch generation must be supplied together';
  END IF;

  IF p_queue_id IS NOT NULL THEN
    SELECT * INTO v_queue
    FROM public.dialing_queues
    WHERE id = p_queue_id
    FOR UPDATE;
    IF v_queue.id IS NULL
      OR v_queue.status <> 'calling'
      OR v_queue.dispatch_generation IS DISTINCT FROM p_dispatch_generation
      OR v_queue.campaign_id IS DISTINCT FROM p_campaign_id
      OR v_queue.lead_id IS DISTINCT FROM p_lead_id
      OR v_queue.last_provider_call_id IS NOT NULL
    THEN
      RAISE EXCEPTION 'queue dispatch generation is not exclusively claimable';
    END IF;
  END IF;

  INSERT INTO public.provider_dispatch_claims (
    logical_key, queue_id, dispatch_generation, call_log_id,
    organization_id, user_id, campaign_id, lead_id, provider
  ) VALUES (
    btrim(p_logical_key), p_queue_id, p_dispatch_generation, p_call_log_id,
    p_organization_id, p_user_id, p_campaign_id, p_lead_id, lower(p_provider)
  )
  ON CONFLICT (logical_key) DO NOTHING
  RETURNING * INTO v_claim;

  IF v_claim.id IS NULL THEN
    SELECT * INTO v_claim
    FROM public.provider_dispatch_claims
    WHERE logical_key = btrim(p_logical_key);
    IF v_claim.id IS NULL
      OR v_claim.queue_id IS DISTINCT FROM p_queue_id
      OR v_claim.dispatch_generation IS DISTINCT FROM p_dispatch_generation
      OR v_claim.organization_id IS DISTINCT FROM p_organization_id
      OR v_claim.user_id IS DISTINCT FROM p_user_id
      OR v_claim.campaign_id IS DISTINCT FROM p_campaign_id
      OR v_claim.lead_id IS DISTINCT FROM p_lead_id
      OR v_claim.provider <> lower(p_provider)
    THEN
      RAISE EXCEPTION 'provider dispatch logical key payload mismatch';
    END IF;
    RETURN QUERY SELECT false, v_claim.id, v_claim.status;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_claim.id, v_claim.status;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_provider_dispatch(
  p_claim_id uuid,
  p_user_id uuid,
  p_status text,
  p_provider_call_id text DEFAULT NULL,
  p_last_error text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated integer;
  v_existing public.provider_dispatch_claims%ROWTYPE;
BEGIN
  IF p_status NOT IN ('accepted', 'definite_failure', 'acceptance_unknown') THEN
    RAISE EXCEPTION 'invalid provider dispatch final status';
  END IF;
  IF p_status = 'accepted' AND (p_provider_call_id IS NULL OR btrim(p_provider_call_id) = '') THEN
    RAISE EXCEPTION 'accepted dispatch requires provider call id';
  END IF;

  UPDATE public.provider_dispatch_claims
  SET status = p_status,
      provider_call_id = COALESCE(p_provider_call_id, provider_call_id),
      last_error = p_last_error,
      finalized_at = now(),
      updated_at = now()
  WHERE id = p_claim_id
    AND user_id = p_user_id
    AND status = 'claimed';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 1 THEN RETURN true; END IF;

  SELECT * INTO v_existing
  FROM public.provider_dispatch_claims
  WHERE id = p_claim_id AND user_id = p_user_id;
  IF v_existing.id IS NOT NULL
    AND v_existing.status = p_status
    AND (p_status <> 'accepted' OR v_existing.provider_call_id = p_provider_call_id)
  THEN
    RETURN true;
  END IF;
  RAISE EXCEPTION 'provider dispatch claim is missing or finalized differently';
END;
$$;

CREATE OR REPLACE FUNCTION public.record_physical_call_attempt(
  p_provider text,
  p_provider_call_id text,
  p_queue_id uuid DEFAULT NULL,
  p_call_log_id uuid DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL,
  p_lead_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempt_id uuid;
  v_existing public.provider_call_attempts%ROWTYPE;
  v_queue public.dialing_queues%ROWTYPE;
  v_updated integer;
BEGIN
  IF p_provider_call_id IS NULL OR btrim(p_provider_call_id) = '' THEN
    RAISE EXCEPTION 'provider_call_id is required';
  END IF;

  SELECT * INTO v_existing
  FROM public.provider_call_attempts
  WHERE provider = lower(p_provider)
    AND provider_call_id = p_provider_call_id;

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.queue_id IS DISTINCT FROM p_queue_id
      OR v_existing.call_log_id IS DISTINCT FROM p_call_log_id
      OR v_existing.organization_id IS DISTINCT FROM p_organization_id
      OR v_existing.user_id IS DISTINCT FROM p_user_id
      OR v_existing.campaign_id IS DISTINCT FROM p_campaign_id
      OR v_existing.lead_id IS DISTINCT FROM p_lead_id
    THEN
      RAISE EXCEPTION 'provider call attempt identity mismatch';
    END IF;
    RETURN false;
  END IF;

  IF p_queue_id IS NOT NULL THEN
    SELECT * INTO v_queue
    FROM public.dialing_queues
    WHERE id = p_queue_id
    FOR UPDATE;

    IF v_queue.id IS NULL THEN
      RAISE EXCEPTION 'queue % does not exist', p_queue_id;
    END IF;
    IF p_campaign_id IS NULL OR v_queue.campaign_id <> p_campaign_id THEN
      RAISE EXCEPTION 'queue % campaign ownership mismatch', p_queue_id;
    END IF;
    IF p_lead_id IS NULL OR v_queue.lead_id <> p_lead_id THEN
      RAISE EXCEPTION 'queue % lead ownership mismatch', p_queue_id;
    END IF;
    IF v_queue.status <> 'calling' THEN
      RAISE EXCEPTION 'queue % is not currently claimed for calling', p_queue_id;
    END IF;
    IF v_queue.last_provider_call_id IS NOT NULL
      AND v_queue.last_provider_call_id <> p_provider_call_id
    THEN
      RAISE EXCEPTION 'queue % is already bound to provider call %', p_queue_id, v_queue.last_provider_call_id;
    END IF;
  END IF;

  INSERT INTO public.provider_call_attempts (
    provider, provider_call_id, queue_id, call_log_id,
    organization_id, user_id, campaign_id, lead_id
  ) VALUES (
    lower(p_provider), p_provider_call_id, p_queue_id, p_call_log_id,
    p_organization_id, p_user_id, p_campaign_id, p_lead_id
  )
  ON CONFLICT (provider, provider_call_id) DO NOTHING
  RETURNING id INTO v_attempt_id;

  IF v_attempt_id IS NULL THEN
    SELECT * INTO v_existing
    FROM public.provider_call_attempts
    WHERE provider = lower(p_provider)
      AND provider_call_id = p_provider_call_id;
    IF v_existing.id IS NULL
      OR v_existing.queue_id IS DISTINCT FROM p_queue_id
      OR v_existing.call_log_id IS DISTINCT FROM p_call_log_id
      OR v_existing.organization_id IS DISTINCT FROM p_organization_id
      OR v_existing.user_id IS DISTINCT FROM p_user_id
      OR v_existing.campaign_id IS DISTINCT FROM p_campaign_id
      OR v_existing.lead_id IS DISTINCT FROM p_lead_id
    THEN
      RAISE EXCEPTION 'concurrent provider call attempt identity mismatch';
    END IF;
    RETURN false;
  END IF;

  IF p_queue_id IS NOT NULL THEN
    UPDATE public.dialing_queues
    SET attempts = COALESCE(attempts, 0) + 1,
        status = 'calling',
        last_provider = lower(p_provider),
        last_provider_call_id = p_provider_call_id,
        last_attempted_at = now(),
        updated_at = now()
    WHERE id = p_queue_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 1 THEN
      RAISE EXCEPTION 'queue % changed before provider attempt could be bound', p_queue_id;
    END IF;
  END IF;

  RETURN true;
END;
$$;

-- Read-only deployment probe used by authenticated health checks. Calling this
-- proves that the idempotency/attempt/reconciliation migration is installed;
-- the edge health endpoint separately proves signature enforcement is enabled.
CREATE OR REPLACE FUNCTION public.provider_safety_health_check()
RETURNS TABLE (
  idempotency_ready boolean,
  attempt_ledger_ready boolean,
  reconciliation_ready boolean,
  dispatch_claim_ready boolean,
  contact_stop_ready boolean,
  normalized_dnc_ready boolean,
  provider_safe_backstop_ready boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    to_regclass('public.provider_callback_receipts') IS NOT NULL,
    to_regclass('public.provider_call_attempts') IS NOT NULL,
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'call_logs'
        AND column_name = 'provider_reconciliation_required'
    ),
    to_regclass('public.provider_dispatch_claims') IS NOT NULL
      AND to_regprocedure('public.claim_provider_dispatch(text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text)') IS NOT NULL
      AND has_function_privilege(
        'service_role',
        'public.claim_provider_dispatch(text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text)',
        'EXECUTE'
      ),
    to_regprocedure('public.evaluate_contact_stop(uuid,uuid,uuid,text,text)') IS NOT NULL
      AND has_function_privilege(
        'service_role',
        'public.evaluate_contact_stop(uuid,uuid,uuid,text,text)',
        'EXECUTE'
      ),
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'dnc_list'
        AND column_name = 'phone_number_normalized'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'dnc_list'
        AND column_name = 'organization_id'
    ),
    COALESCE(
      position(
        'provider-safe backstop' IN pg_get_functiondef(to_regprocedure('public.run_safety_backstops()'))
      ) > 0,
      false
    );
$$;

-- Claims reserve the row but do not count an attempt. Only an accepted provider
-- call, recorded by record_physical_call_attempt, counts as an attempt.
CREATE OR REPLACE FUNCTION public.claim_pending_dispatches(
  p_campaign_ids uuid[],
  p_limit integer DEFAULT 50
)
RETURNS SETOF public.dialing_queues
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.dialing_queues
  SET status = 'calling',
      dispatch_generation = gen_random_uuid(),
      last_provider_call_id = NULL,
      updated_at = now()
  WHERE id IN (
    SELECT id
    FROM public.dialing_queues
    WHERE campaign_id = ANY(p_campaign_ids)
      AND status = 'pending'
      AND scheduled_at <= now()
      AND COALESCE(attempts, 0) < COALESCE(max_attempts, 3)
    ORDER BY priority DESC NULLS LAST, scheduled_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;

CREATE OR REPLACE FUNCTION public.claim_pending_dispatches_now(
  p_campaign_ids uuid[],
  p_limit integer DEFAULT 50
)
RETURNS SETOF public.dialing_queues
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.dialing_queues
  SET status = 'calling',
      dispatch_generation = gen_random_uuid(),
      last_provider_call_id = NULL,
      updated_at = now()
  WHERE id IN (
    SELECT id
    FROM public.dialing_queues
    WHERE campaign_id = ANY(p_campaign_ids)
      AND status = 'pending'
      AND COALESCE(attempts, 0) < COALESCE(max_attempts, 3)
    ORDER BY priority DESC NULLS LAST, scheduled_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;

REVOKE ALL ON FUNCTION public.evaluate_contact_stop(uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_provider_callback(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_provider_callback(text, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_provider_dispatch(text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_provider_dispatch(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_physical_call_attempt(text, text, uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_pending_dispatches(uuid[], integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_pending_dispatches_now(uuid[], integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.provider_safety_health_check() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.evaluate_contact_stop(uuid, uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_provider_callback(text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_provider_callback(text, text, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_provider_dispatch(text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_provider_dispatch(uuid, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_physical_call_attempt(text, text, uuid, uuid, uuid, uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_pending_dispatches(uuid[], integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_pending_dispatches_now(uuid[], integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.provider_safety_health_check() TO authenticated, service_role;

COMMENT ON TABLE public.contact_stop_controls IS
  'Authoritative contact-stop state for global, tenant, campaign, provider, and channel enforcement.';
COMMENT ON TABLE public.provider_call_attempts IS
  'Append-only ledger of provider-accepted physical calls; unique provider call IDs guarantee one queue attempt increment.';
COMMENT ON TABLE public.provider_callback_receipts IS
  'Idempotency receipts for exact provider event types and the one-time effects stage.';
