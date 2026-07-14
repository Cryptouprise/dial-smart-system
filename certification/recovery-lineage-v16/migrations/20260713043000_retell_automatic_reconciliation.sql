-- Bounded automatic Retell reconciliation.
--
-- This worker never proves a negative from a missing provider lookup. A stale
-- or ambiguous dispatch remains quarantined until Retell returns an exact,
-- tenant-bound call. Contradictory/exhausted evidence moves to manual review;
-- it never releases a queue for an automatic redial.

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

-- Snapshot provider-egress identity on the dispatch claim. Existing claims are
-- version 0 (bounded legacy drain); every claim created after this migration is
-- version 1 and must match all provider phone-call fields and metadata.
ALTER TABLE public.provider_dispatch_claims
  ADD COLUMN IF NOT EXISTS destination_phone text,
  ADD COLUMN IF NOT EXISTS caller_id text,
  ADD COLUMN IF NOT EXISTS agent_id text,
  ADD COLUMN IF NOT EXISTS identity_contract_version integer NOT NULL DEFAULT 0;

UPDATE public.provider_dispatch_claims AS dispatch
SET destination_phone = COALESCE(dispatch.destination_phone, call_log.phone_number),
    caller_id = COALESCE(dispatch.caller_id, call_log.caller_id),
    agent_id = COALESCE(dispatch.agent_id, call_log.agent_id)
FROM public.call_logs AS call_log
WHERE call_log.id = dispatch.call_log_id;

ALTER TABLE public.provider_dispatch_claims
  ALTER COLUMN identity_contract_version SET DEFAULT 1,
  DROP CONSTRAINT IF EXISTS provider_dispatch_claims_status_evidence_check,
  ADD CONSTRAINT provider_dispatch_claims_status_evidence_check CHECK (
    (status = 'accepted' AND provider_call_id IS NOT NULL AND btrim(provider_call_id) <> '')
    OR (status = 'definite_failure' AND provider_call_id IS NULL)
    OR (status IN ('claimed', 'acceptance_unknown') AND provider_call_id IS NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_dispatch_claims_provider_call_id
  ON public.provider_dispatch_claims(provider, provider_call_id)
  WHERE provider_call_id IS NOT NULL;

ALTER TABLE public.provider_dispatch_claims
  DROP CONSTRAINT IF EXISTS provider_dispatch_claims_identity_key,
  ADD CONSTRAINT provider_dispatch_claims_identity_key
  UNIQUE (id, organization_id, user_id);

-- Older dispatch claims were created by an RPC that accepted independently
-- supplied UUIDs. Reconciliation must not touch a call log until every legacy
-- claim is proven to belong to one call-log/campaign/lead tenant graph. This is
-- deliberately migration-blocking: an operator must repair any mismatch rather
-- than allowing the worker to quarantine another tenant's call.
DO $$
DECLARE
  invalid_dispatch_count bigint;
BEGIN
  SELECT count(*)
  INTO invalid_dispatch_count
  FROM public.provider_dispatch_claims AS dispatch
  LEFT JOIN public.call_logs AS call_log
    ON call_log.id = dispatch.call_log_id
  LEFT JOIN public.campaigns AS campaign
    ON campaign.id = dispatch.campaign_id
  LEFT JOIN public.leads AS lead
    ON lead.id = dispatch.lead_id
  WHERE call_log.id IS NULL
     OR call_log.organization_id IS DISTINCT FROM dispatch.organization_id
     OR call_log.user_id IS DISTINCT FROM dispatch.user_id
     OR call_log.campaign_id IS DISTINCT FROM dispatch.campaign_id
     OR call_log.lead_id IS DISTINCT FROM dispatch.lead_id
     OR (
       dispatch.campaign_id IS NOT NULL
       AND (
         campaign.id IS NULL
         OR campaign.organization_id IS DISTINCT FROM dispatch.organization_id
         OR campaign.user_id IS DISTINCT FROM dispatch.user_id
       )
     )
     OR (
       dispatch.lead_id IS NOT NULL
       AND (
         lead.id IS NULL
         OR lead.organization_id IS DISTINCT FROM dispatch.organization_id
         OR lead.user_id IS DISTINCT FROM dispatch.user_id
       )
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.organization_users AS membership
       WHERE membership.organization_id = dispatch.organization_id
         AND membership.user_id = dispatch.user_id
     );

  IF invalid_dispatch_count > 0 THEN
    RAISE EXCEPTION 'PROVIDER_DISPATCH_TENANT_REPAIR_REQUIRED'
      USING DETAIL = format(
        '%s provider dispatch claim(s) do not match their authoritative call-log tenant graph',
        invalid_dispatch_count
      ),
      HINT = 'Repair every dispatch/call-log/campaign/lead ownership mismatch before enabling provider reconciliation.';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.provider_reconciliation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_claim_id uuid NOT NULL UNIQUE
    REFERENCES public.provider_dispatch_claims(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'retell' CHECK (provider = 'retell'),
  state text NOT NULL DEFAULT 'queued'
    CHECK (state IN ('queued', 'processing', 'waiting_provider', 'resolved', 'manual_required')),
  reason text NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  first_detected_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  claim_token uuid,
  provider_call_id text,
  provider_status text,
  analysis_observed boolean NOT NULL DEFAULT false,
  last_error text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (state = 'processing' AND locked_until IS NOT NULL AND claim_token IS NOT NULL)
    OR (state <> 'processing' AND locked_until IS NULL AND claim_token IS NULL)
  ),
  CHECK ((state = 'resolved' AND resolved_at IS NOT NULL) OR state <> 'resolved')
);

ALTER TABLE public.provider_reconciliation_jobs
  ADD CONSTRAINT provider_reconciliation_jobs_dispatch_identity_fkey
  FOREIGN KEY (dispatch_claim_id, organization_id, user_id)
  REFERENCES public.provider_dispatch_claims(id, organization_id, user_id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_provider_reconciliation_jobs_claimable
  ON public.provider_reconciliation_jobs(state, next_attempt_at, first_detected_at)
  WHERE state IN ('queued', 'waiting_provider', 'processing');

CREATE INDEX IF NOT EXISTS idx_provider_reconciliation_jobs_manual
  ON public.provider_reconciliation_jobs(updated_at)
  WHERE state = 'manual_required';

ALTER TABLE public.provider_reconciliation_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.provider_reconciliation_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.provider_reconciliation_jobs TO authenticated;

DROP POLICY IF EXISTS "Users can view owned provider reconciliation jobs"
  ON public.provider_reconciliation_jobs;
CREATE POLICY "Users can view owned provider reconciliation jobs"
  ON public.provider_reconciliation_jobs FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    AND public.user_in_organization(auth.uid(), organization_id)
  );

CREATE TABLE IF NOT EXISTS public.retell_reconciliation_runtime (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  last_started_at timestamptz,
  last_succeeded_at timestamptz,
  last_failed_at timestamptz,
  last_claimed_count integer NOT NULL DEFAULT 0,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.retell_reconciliation_runtime(singleton)
VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

ALTER TABLE public.retell_reconciliation_runtime ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.retell_reconciliation_runtime FROM PUBLIC, anon, authenticated;

-- A broad callback-effect failure is positive evidence that the local state is
-- incomplete. Persist the failed receipt, operator-visible manual job, and
-- call-log quarantine in one transaction. The original claim-token equality
-- check remains the authority for completing a callback lease.
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
  v_dispatch public.provider_dispatch_claims%ROWTYPE;
  v_dispatch_id uuid;
  v_reason text;
  v_job_id uuid;
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

  IF p_error IS NULL
    OR lower(p_provider) <> 'retell'
    OR p_lifecycle_stage NOT IN ('analysis_effects', 'terminal_reconciliation')
  THEN
    RETURN;
  END IF;

  -- Only positive, immutable provider identity can bind a failed callback to
  -- one local tenant graph. Orphan receipts remain reconciliation_required and
  -- therefore visible to provider-receipt monitoring, but are never guessed
  -- onto a dispatch.
  SELECT * INTO v_dispatch
  FROM public.provider_dispatch_claims AS dispatch
  WHERE dispatch.provider = 'retell'
    AND dispatch.provider_call_id = p_provider_call_id
    AND dispatch.status = 'accepted';
  IF v_dispatch.id IS NULL THEN
    RETURN;
  END IF;
  v_dispatch_id := v_dispatch.id;

  v_reason := left(
    format(
      'Retell %s callback effects failed and require manual recovery: %s',
      p_lifecycle_stage,
      COALESCE(NULLIF(p_error, ''), 'unspecified callback failure')
    ),
    2000
  );

  -- The job row is the first graph lock, matching the worker's lock order. A
  -- failed one-time effect is not safe to replay automatically, so it enters
  -- manual_required immediately rather than waiting for worker discovery.
  INSERT INTO public.provider_reconciliation_jobs AS existing_job (
    dispatch_claim_id,
    organization_id,
    user_id,
    state,
    reason,
    provider_call_id,
    analysis_observed,
    last_error,
    next_attempt_at
  ) VALUES (
    v_dispatch.id,
    v_dispatch.organization_id,
    v_dispatch.user_id,
    'manual_required',
    v_reason,
    v_dispatch.provider_call_id,
    p_lifecycle_stage = 'analysis_effects',
    v_reason,
    now()
  )
  ON CONFLICT (dispatch_claim_id) DO UPDATE
  SET state = 'manual_required',
      reason = EXCLUDED.reason,
      provider_call_id = COALESCE(
        existing_job.provider_call_id,
        EXCLUDED.provider_call_id
      ),
      analysis_observed = existing_job.analysis_observed OR EXCLUDED.analysis_observed,
      locked_until = NULL,
      claim_token = NULL,
      last_error = EXCLUDED.last_error,
      resolved_at = NULL,
      updated_at = now()
  RETURNING id INTO v_job_id;

  -- Re-read and lock the immutable dispatch only after owning its job lock.
  SELECT * INTO v_dispatch
  FROM public.provider_dispatch_claims AS dispatch
  WHERE dispatch.id = v_dispatch_id
    AND dispatch.provider = 'retell'
    AND dispatch.provider_call_id = p_provider_call_id
    AND dispatch.status = 'accepted'
  FOR UPDATE;
  IF v_dispatch.id IS NULL THEN
    RAISE EXCEPTION 'Accepted Retell dispatch identity changed during callback completion'
      USING ERRCODE = '40001';
  END IF;

  PERFORM 1
  FROM public.call_logs AS call_log
  WHERE call_log.id = v_dispatch.call_log_id
    AND call_log.organization_id = v_dispatch.organization_id
    AND call_log.user_id = v_dispatch.user_id
    AND call_log.campaign_id IS NOT DISTINCT FROM v_dispatch.campaign_id
    AND call_log.lead_id IS NOT DISTINCT FROM v_dispatch.lead_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Accepted Retell callback is outside its call-log tenant graph';
  END IF;

  -- Queue locking serializes this quarantine with a concurrent dispatcher.
  -- claim_pending_dispatches also sees the processing/reconciliation receipt,
  -- so every claim that starts after receipt acquisition is committed is held.
  IF v_dispatch.queue_id IS NOT NULL THEN
    PERFORM 1
    FROM public.dialing_queues AS queue
    WHERE queue.id = v_dispatch.queue_id
    FOR UPDATE;
  END IF;

  UPDATE public.call_logs
  SET provider_reconciliation_required = true,
      provider_reconciliation_reason = v_reason,
      provider_reconciliation_marked_at = COALESCE(provider_reconciliation_marked_at, now()),
      provider_reconciled_at = NULL,
      provider_reconciliation_queue_id = v_dispatch.queue_id
  WHERE id = v_dispatch.call_log_id
    AND organization_id = v_dispatch.organization_id
    AND user_id = v_dispatch.user_id
    AND campaign_id IS NOT DISTINCT FROM v_dispatch.campaign_id
    AND lead_id IS NOT DISTINCT FROM v_dispatch.lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Accepted Retell callback quarantine could not be persisted';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.system_alerts AS alert
    WHERE alert.alert_type = 'retell_reconciliation_manual_required'
      AND alert.auto_resolved = false
      AND alert.metadata->>'job_id' = v_job_id::text
  ) THEN
    INSERT INTO public.system_alerts (
      user_id, alert_type, severity, title, message, metadata, related_id, related_type
    ) VALUES (
      v_dispatch.user_id,
      'retell_reconciliation_manual_required',
      'critical',
      'Retell callback effects require manual recovery',
      v_reason,
      jsonb_build_object(
        'job_id', v_job_id,
        'dispatch_claim_id', v_dispatch.id,
        'provider_call_id', v_dispatch.provider_call_id,
        'lifecycle_stage', p_lifecycle_stage
      ),
      v_job_id::text,
      'provider_reconciliation_job'
    );
  END IF;
END;
$$;

-- Discover and lease a small batch. The queue/dispatch/call identity returned
-- here is the authoritative local side of the provider metadata comparison.
CREATE OR REPLACE FUNCTION public.claim_retell_reconciliation_jobs(
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  job_id uuid,
  reconciliation_claim_token uuid,
  attempt_count integer,
  first_detected_at timestamptz,
  dispatch_claim_id uuid,
  dispatch_status text,
  provider_call_id text,
  call_log_id uuid,
  organization_id uuid,
  user_id uuid,
  campaign_id uuid,
  lead_id uuid,
  queue_id uuid,
  dispatch_generation uuid,
  reconciliation_reason text,
  identity_contract_version integer,
  failed_effect_receipt boolean,
  phone_number text,
  caller_id text,
  agent_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 8 THEN
    RAISE EXCEPTION 'Retell reconciliation batch size must be between 1 and 8';
  END IF;

  INSERT INTO public.provider_reconciliation_jobs (
    dispatch_claim_id,
    organization_id,
    user_id,
    reason,
    next_attempt_at
  )
  SELECT
    dispatch.id,
    dispatch.organization_id,
    dispatch.user_id,
    CASE
      WHEN dispatch.status IN ('claimed', 'acceptance_unknown')
        THEN 'Provider create acceptance is unresolved'
      WHEN cl.provider_reconciliation_required
        THEN COALESCE(cl.provider_reconciliation_reason, 'Call log requires provider reconciliation')
      WHEN NOT EXISTS (
        SELECT 1 FROM public.provider_call_attempts attempt
        WHERE attempt.provider = 'retell'
          AND attempt.provider_call_id = dispatch.provider_call_id
          AND attempt.call_log_id = dispatch.call_log_id
      ) THEN 'Accepted Retell call is missing its physical-attempt ledger row'
      WHEN EXISTS (
        SELECT 1 FROM public.provider_callback_receipts receipt
        WHERE receipt.provider = 'retell'
          AND receipt.provider_call_id = dispatch.provider_call_id
          AND receipt.status = 'reconciliation_required'
      ) THEN 'A Retell callback effect requires reconciliation'
      ELSE 'Accepted Retell call is missing its terminal callback'
    END,
    now()
  FROM public.provider_dispatch_claims dispatch
  JOIN public.call_logs cl
    ON cl.id = dispatch.call_log_id
   AND cl.organization_id = dispatch.organization_id
   AND cl.user_id = dispatch.user_id
   AND cl.campaign_id IS NOT DISTINCT FROM dispatch.campaign_id
   AND cl.lead_id IS NOT DISTINCT FROM dispatch.lead_id
  WHERE dispatch.provider = 'retell'
    AND (
      (
        dispatch.status IN ('claimed', 'acceptance_unknown')
        AND dispatch.claimed_at < now() - interval '90 seconds'
      )
      OR (
        dispatch.status = 'accepted'
        AND dispatch.claimed_at < now() - interval '2 minutes'
        AND (
          cl.provider_reconciliation_required = true
          OR NOT EXISTS (
            SELECT 1 FROM public.provider_call_attempts attempt
            WHERE attempt.provider = 'retell'
              AND attempt.provider_call_id = dispatch.provider_call_id
              AND attempt.call_log_id = dispatch.call_log_id
          )
          OR NOT EXISTS (
            SELECT 1 FROM public.provider_callback_receipts receipt
            WHERE receipt.provider = 'retell'
              AND receipt.provider_call_id = dispatch.provider_call_id
              AND receipt.lifecycle_stage = 'terminal_reconciliation'
              AND receipt.status = 'processed'
          )
          OR EXISTS (
            SELECT 1 FROM public.provider_callback_receipts receipt
            WHERE receipt.provider = 'retell'
              AND receipt.provider_call_id = dispatch.provider_call_id
              AND receipt.status = 'reconciliation_required'
          )
        )
      )
    )
  ON CONFLICT ON CONSTRAINT provider_reconciliation_jobs_dispatch_claim_id_key DO NOTHING;

  -- A later analysis callback can expose a failed one-time effect after the
  -- terminal job was resolved. Reopen only that positive failure evidence.
  UPDATE public.provider_reconciliation_jobs job
  SET state = 'queued',
      next_attempt_at = now(),
      resolved_at = NULL,
      updated_at = now(),
      reason = 'A later Retell callback effect requires reconciliation'
  FROM public.provider_dispatch_claims dispatch
  WHERE job.dispatch_claim_id = dispatch.id
    AND job.state = 'resolved'
    AND dispatch.provider_call_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.provider_callback_receipts receipt
      WHERE receipt.provider = 'retell'
        AND receipt.provider_call_id = dispatch.provider_call_id
        AND receipt.status = 'reconciliation_required'
    );

  -- A job is itself a redial hold. Install the call-log quarantine before any
  -- lease is returned, including jobs discovered from a later failed effect.
  UPDATE public.call_logs AS call_log
  SET provider_reconciliation_required = true,
      provider_reconciliation_reason = left(job.reason, 2000),
      provider_reconciliation_marked_at = COALESCE(call_log.provider_reconciliation_marked_at, now()),
      provider_reconciled_at = NULL,
      provider_reconciliation_queue_id = dispatch.queue_id
  FROM public.provider_reconciliation_jobs AS job
  JOIN public.provider_dispatch_claims AS dispatch ON dispatch.id = job.dispatch_claim_id
  WHERE call_log.id = dispatch.call_log_id
    AND call_log.organization_id = dispatch.organization_id
    AND call_log.user_id = dispatch.user_id
    AND call_log.campaign_id IS NOT DISTINCT FROM dispatch.campaign_id
    AND call_log.lead_id IS NOT DISTINCT FROM dispatch.lead_id
    AND job.state <> 'resolved';

  -- Expired leases and repeatedly failing jobs cannot churn forever. Escalate
  -- before leasing and preserve every queue/provider identity as evidence.
  WITH exhausted AS (
    UPDATE public.provider_reconciliation_jobs AS job
    SET state = 'manual_required',
        locked_until = NULL,
        claim_token = NULL,
        last_error = left(COALESCE(job.last_error, 'Automatic reconciliation exhausted its bounded lease window'), 2000),
        updated_at = now()
    WHERE job.state IN ('queued', 'waiting_provider', 'processing')
      AND (job.attempt_count >= 12 OR job.first_detected_at <= now() - interval '2 hours')
      AND (job.state <> 'processing' OR job.locked_until < now())
    RETURNING job.*
  )
  INSERT INTO public.system_alerts (
    user_id, alert_type, severity, title, message, metadata, related_id, related_type
  )
  SELECT
    exhausted.user_id,
    'retell_reconciliation_manual_required',
    'critical',
    'Retell reconciliation exhausted safely',
    'The job exceeded its bounded retry or lease window and remains quarantined.',
    jsonb_build_object(
      'job_id', exhausted.id,
      'dispatch_claim_id', exhausted.dispatch_claim_id,
      'reason', exhausted.last_error
    ),
    exhausted.id::text,
    'provider_reconciliation_job'
  FROM exhausted
  WHERE NOT EXISTS (
    SELECT 1 FROM public.system_alerts AS alert
    WHERE alert.alert_type = 'retell_reconciliation_manual_required'
      AND alert.auto_resolved = false
      AND alert.metadata->>'job_id' = exhausted.id::text
  );

  RETURN QUERY
  WITH picked AS (
    SELECT job.id
    FROM public.provider_reconciliation_jobs job
    WHERE (
        job.state IN ('queued', 'waiting_provider')
        OR (job.state = 'processing' AND job.locked_until < now())
      )
      AND job.next_attempt_at <= now()
    ORDER BY job.first_detected_at, job.created_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ), leased AS (
    UPDATE public.provider_reconciliation_jobs job
    SET state = 'processing',
        attempt_count = job.attempt_count + 1,
        last_attempt_at = now(),
        locked_until = now() + interval '10 minutes',
        claim_token = gen_random_uuid(),
        updated_at = now()
    FROM picked
    WHERE job.id = picked.id
    RETURNING job.*
  )
  SELECT
    leased.id,
    leased.claim_token,
    leased.attempt_count,
    leased.first_detected_at,
    dispatch.id,
    dispatch.status,
    COALESCE(leased.provider_call_id, dispatch.provider_call_id),
    dispatch.call_log_id,
    dispatch.organization_id,
    dispatch.user_id,
    dispatch.campaign_id,
    dispatch.lead_id,
    dispatch.queue_id,
    dispatch.dispatch_generation,
    leased.reason,
    dispatch.identity_contract_version,
    EXISTS (
      SELECT 1
      FROM public.provider_callback_receipts AS receipt
      WHERE receipt.provider = 'retell'
        AND receipt.provider_call_id = COALESCE(leased.provider_call_id, dispatch.provider_call_id)
        AND receipt.lifecycle_stage IN ('terminal_reconciliation', 'analysis_effects')
        AND receipt.status = 'reconciliation_required'
    ),
    dispatch.destination_phone,
    dispatch.caller_id,
    dispatch.agent_id
  FROM leased
  JOIN public.provider_dispatch_claims dispatch ON dispatch.id = leased.dispatch_claim_id
  JOIN public.call_logs cl
    ON cl.id = dispatch.call_log_id
   AND cl.organization_id = dispatch.organization_id
   AND cl.user_id = dispatch.user_id
   AND cl.campaign_id IS NOT DISTINCT FROM dispatch.campaign_id
   AND cl.lead_id IS NOT DISTINCT FROM dispatch.lead_id;
END;
$$;

-- Bind positive Retell evidence atomically. The physical-attempt ledger is
-- written before the call-log quarantine can be cleared.
CREATE OR REPLACE FUNCTION public.bind_retell_reconciliation_call(
  p_job_id uuid,
  p_claim_token uuid,
  p_provider_call_id text,
  p_provider_status text,
  p_provider_metadata jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job public.provider_reconciliation_jobs%ROWTYPE;
  v_dispatch public.provider_dispatch_claims%ROWTYPE;
  v_call_log public.call_logs%ROWTYPE;
  v_queue public.dialing_queues%ROWTYPE;
  v_campaign public.campaigns%ROWTYPE;
  v_lead public.leads%ROWTYPE;
BEGIN
  IF p_provider_call_id IS NULL OR btrim(p_provider_call_id) = '' THEN
    RAISE EXCEPTION 'Retell reconciliation requires a provider call id';
  END IF;
  IF p_provider_status NOT IN ('registered', 'not_connected', 'ongoing', 'ended', 'error') THEN
    RAISE EXCEPTION 'Unsupported Retell reconciliation status %', p_provider_status;
  END IF;
  IF p_provider_metadata IS NULL OR jsonb_typeof(p_provider_metadata) <> 'object' THEN
    RAISE EXCEPTION 'Retell reconciliation requires immutable provider metadata';
  END IF;

  SELECT * INTO v_job
  FROM public.provider_reconciliation_jobs
  WHERE id = p_job_id
    AND state = 'processing'
    AND claim_token = p_claim_token
    AND locked_until > now()
  FOR UPDATE;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'RETELL_RECONCILIATION_LEASE_LOST' USING ERRCODE = '40001';
  END IF;

  SELECT * INTO v_dispatch
  FROM public.provider_dispatch_claims
  WHERE id = v_job.dispatch_claim_id
  FOR UPDATE;
  IF v_dispatch.id IS NULL OR v_dispatch.provider <> 'retell' THEN
    RAISE EXCEPTION 'Retell dispatch claim is missing or has the wrong provider';
  END IF;
  IF v_dispatch.status = 'definite_failure' THEN
    RAISE EXCEPTION 'A definitely-failed dispatch cannot be rebound automatically';
  END IF;
  IF v_dispatch.status = 'accepted'
    AND v_dispatch.provider_call_id IS DISTINCT FROM p_provider_call_id
  THEN
    RAISE EXCEPTION 'Accepted dispatch is already bound to a different Retell call';
  END IF;

  SELECT * INTO v_call_log
  FROM public.call_logs
  WHERE id = v_dispatch.call_log_id
  FOR UPDATE;
  IF v_call_log.id IS NULL THEN
    RAISE EXCEPTION 'Owned call log is missing';
  END IF;
  IF v_call_log.user_id IS DISTINCT FROM v_dispatch.user_id
    OR v_call_log.organization_id IS DISTINCT FROM v_dispatch.organization_id
    OR v_call_log.campaign_id IS DISTINCT FROM v_dispatch.campaign_id
    OR v_call_log.lead_id IS DISTINCT FROM v_dispatch.lead_id
  THEN
    RAISE EXCEPTION 'Dispatch and call log do not form one authoritative tenant identity';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_users AS membership
    WHERE membership.organization_id = v_dispatch.organization_id
      AND membership.user_id = v_dispatch.user_id
  ) THEN
    RAISE EXCEPTION 'Dispatch owner is no longer a member of the organization';
  END IF;

  IF v_dispatch.campaign_id IS NOT NULL THEN
    SELECT * INTO v_campaign
    FROM public.campaigns
    WHERE id = v_dispatch.campaign_id;
    IF v_campaign.id IS NULL
      OR v_campaign.organization_id IS DISTINCT FROM v_dispatch.organization_id
      OR v_campaign.user_id IS DISTINCT FROM v_dispatch.user_id
    THEN
      RAISE EXCEPTION 'Dispatch campaign does not match the authoritative tenant';
    END IF;
  END IF;

  IF v_dispatch.lead_id IS NOT NULL THEN
    SELECT * INTO v_lead
    FROM public.leads
    WHERE id = v_dispatch.lead_id;
    IF v_lead.id IS NULL
      OR v_lead.organization_id IS DISTINCT FROM v_dispatch.organization_id
      OR v_lead.user_id IS DISTINCT FROM v_dispatch.user_id
    THEN
      RAISE EXCEPTION 'Dispatch lead does not match the authoritative tenant';
    END IF;
  END IF;

  IF NULLIF(p_provider_metadata->>'call_log_id', '') IS DISTINCT FROM v_dispatch.call_log_id::text
    OR NULLIF(p_provider_metadata->>'user_id', '') IS DISTINCT FROM v_dispatch.user_id::text
    OR NULLIF(p_provider_metadata->>'organization_id', '') IS DISTINCT FROM v_dispatch.organization_id::text
    OR NULLIF(p_provider_metadata->>'campaign_id', '') IS DISTINCT FROM v_dispatch.campaign_id::text
    OR NULLIF(p_provider_metadata->>'lead_id', '') IS DISTINCT FROM v_dispatch.lead_id::text
    OR NULLIF(p_provider_metadata->>'queue_id', '') IS DISTINCT FROM v_dispatch.queue_id::text
  THEN
    RAISE EXCEPTION 'Retell metadata does not match the authoritative dispatch identity';
  END IF;
  IF v_dispatch.identity_contract_version >= 1 THEN
    IF NULLIF(p_provider_metadata->>'dispatch_generation', '') IS DISTINCT FROM v_dispatch.dispatch_generation::text
      OR NULLIF(p_provider_metadata->>'dispatch_claim_id', '') IS DISTINCT FROM v_dispatch.id::text
      OR NULLIF(p_provider_metadata->>'reconciliation_contract_version', '') IS DISTINCT FROM v_dispatch.identity_contract_version::text
    THEN
      RAISE EXCEPTION 'Retell metadata does not satisfy the current dispatch identity contract';
    END IF;
  ELSE
    IF p_provider_metadata ? 'dispatch_generation'
      AND NULLIF(p_provider_metadata->>'dispatch_generation', '') IS DISTINCT FROM v_dispatch.dispatch_generation::text
    THEN
      RAISE EXCEPTION 'Retell metadata dispatch generation mismatch';
    END IF;
    IF p_provider_metadata ? 'dispatch_claim_id'
      AND NULLIF(p_provider_metadata->>'dispatch_claim_id', '') IS DISTINCT FROM v_dispatch.id::text
    THEN
      RAISE EXCEPTION 'Retell metadata dispatch claim mismatch';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.provider_dispatch_claims other
    WHERE other.id <> v_dispatch.id
      AND other.provider = 'retell'
      AND other.provider_call_id = p_provider_call_id
  ) OR EXISTS (
    SELECT 1 FROM public.call_logs other
    WHERE other.id <> v_call_log.id
      AND other.retell_call_id = p_provider_call_id
  ) THEN
    RAISE EXCEPTION 'Retell call id is already bound to a different local dispatch';
  END IF;

  IF v_dispatch.queue_id IS NOT NULL THEN
    SELECT * INTO v_queue
    FROM public.dialing_queues
    WHERE id = v_dispatch.queue_id
    FOR UPDATE;
    IF v_queue.id IS NULL
      OR v_queue.campaign_id IS DISTINCT FROM v_dispatch.campaign_id
      OR v_queue.lead_id IS DISTINCT FROM v_dispatch.lead_id
      OR v_queue.dispatch_generation IS DISTINCT FROM v_dispatch.dispatch_generation
    THEN
      RAISE EXCEPTION 'Retell queue identity changed before reconciliation';
    END IF;
  END IF;

  UPDATE public.provider_dispatch_claims
  SET status = 'accepted',
      provider_call_id = p_provider_call_id,
      last_error = NULL,
      finalized_at = COALESCE(finalized_at, now()),
      updated_at = now()
  WHERE id = v_dispatch.id;

  UPDATE public.call_logs
  SET retell_call_id = p_provider_call_id,
      provider_reconciliation_required = true,
      provider_reconciliation_reason = 'Retell call found; binding physical-attempt ledger',
      provider_reconciliation_marked_at = COALESCE(provider_reconciliation_marked_at, now()),
      provider_reconciliation_queue_id = v_dispatch.queue_id,
      provider_reconciled_at = NULL,
      status = CASE
        WHEN p_provider_status = 'registered' AND status IN ('queued', 'initiated') THEN 'ringing'
        WHEN p_provider_status = 'ongoing' AND status IN ('queued', 'initiated', 'ringing') THEN 'in_progress'
        ELSE status
      END
  WHERE id = v_call_log.id
    AND organization_id = v_dispatch.organization_id
    AND user_id = v_dispatch.user_id
    AND campaign_id IS NOT DISTINCT FROM v_dispatch.campaign_id
    AND lead_id IS NOT DISTINCT FROM v_dispatch.lead_id
    AND (retell_call_id IS NULL OR retell_call_id = p_provider_call_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Call log is already bound to different Retell evidence';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.provider_call_attempts attempt
    WHERE attempt.provider = 'retell'
      AND attempt.provider_call_id = p_provider_call_id
      AND attempt.call_log_id = v_dispatch.call_log_id
      AND attempt.organization_id = v_dispatch.organization_id
      AND attempt.user_id = v_dispatch.user_id
      AND attempt.campaign_id IS NOT DISTINCT FROM v_dispatch.campaign_id
      AND attempt.lead_id IS NOT DISTINCT FROM v_dispatch.lead_id
      AND attempt.queue_id IS NOT DISTINCT FROM v_dispatch.queue_id
  ) THEN
    IF v_dispatch.queue_id IS NOT NULL AND v_queue.status <> 'calling' THEN
      RAISE EXCEPTION 'Queue left calling state before the accepted physical attempt was recorded';
    END IF;
    PERFORM public.record_physical_call_attempt(
      'retell',
      p_provider_call_id,
      v_dispatch.queue_id,
      v_dispatch.call_log_id,
      v_dispatch.organization_id,
      v_dispatch.user_id,
      v_dispatch.campaign_id,
      v_dispatch.lead_id
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.provider_call_attempts attempt
    WHERE attempt.provider = 'retell'
      AND attempt.provider_call_id = p_provider_call_id
      AND attempt.call_log_id = v_call_log.id
  ) THEN
    RAISE EXCEPTION 'Physical-attempt evidence was not persisted';
  END IF;

  UPDATE public.provider_reconciliation_jobs
  SET provider_call_id = p_provider_call_id,
      provider_status = p_provider_status,
      last_error = NULL,
      updated_at = now()
  WHERE id = v_job.id
    AND claim_token = p_claim_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RETELL_RECONCILIATION_LEASE_LOST' USING ERRCODE = '40001';
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_retell_reconciliation_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_outcome text,
  p_provider_status text DEFAULT NULL,
  p_error text DEFAULT NULL,
  p_next_attempt_at timestamptz DEFAULT NULL,
  p_analysis_expected boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job public.provider_reconciliation_jobs%ROWTYPE;
  v_dispatch public.provider_dispatch_claims%ROWTYPE;
  v_call_log public.call_logs%ROWTYPE;
BEGIN
  IF p_outcome NOT IN ('waiting_provider', 'resolved', 'manual_required') THEN
    RAISE EXCEPTION 'Invalid Retell reconciliation outcome';
  END IF;
  IF p_provider_status IS NOT NULL
    AND p_provider_status NOT IN ('registered', 'not_connected', 'ongoing', 'ended', 'error')
  THEN
    RAISE EXCEPTION 'Invalid Retell reconciliation provider status';
  END IF;

  SELECT * INTO v_job
  FROM public.provider_reconciliation_jobs
  WHERE id = p_job_id
    AND state = 'processing'
    AND claim_token = p_claim_token
    AND locked_until > now()
  FOR UPDATE;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'RETELL_RECONCILIATION_LEASE_LOST' USING ERRCODE = '40001';
  END IF;

  SELECT * INTO v_dispatch
  FROM public.provider_dispatch_claims
  WHERE id = v_job.dispatch_claim_id;
  SELECT * INTO v_call_log
  FROM public.call_logs
  WHERE id = v_dispatch.call_log_id
    AND organization_id = v_dispatch.organization_id
    AND user_id = v_dispatch.user_id
    AND campaign_id IS NOT DISTINCT FROM v_dispatch.campaign_id
    AND lead_id IS NOT DISTINCT FROM v_dispatch.lead_id;
  IF v_dispatch.id IS NULL OR v_call_log.id IS NULL THEN
    RAISE EXCEPTION 'Retell reconciliation job is outside its authoritative tenant graph';
  END IF;

  IF p_outcome = 'waiting_provider' THEN
    IF p_next_attempt_at IS NULL
      OR p_next_attempt_at < now() + interval '15 seconds'
      OR p_next_attempt_at > now() + interval '30 minutes'
    THEN
      RAISE EXCEPTION 'Waiting reconciliation requires a bounded next-attempt time';
    END IF;
    UPDATE public.provider_reconciliation_jobs
    SET state = 'waiting_provider',
        provider_status = COALESCE(p_provider_status, provider_status),
        next_attempt_at = p_next_attempt_at,
        locked_until = NULL,
        claim_token = NULL,
        last_error = left(p_error, 2000),
        updated_at = now()
    WHERE id = v_job.id;
    RETURN true;
  END IF;

  IF p_outcome = 'resolved' THEN
    IF COALESCE(p_provider_status, v_job.provider_status) NOT IN ('not_connected', 'ended', 'error')
      OR v_job.provider_call_id IS NULL
      OR v_dispatch.status <> 'accepted'
      OR v_dispatch.provider_call_id IS DISTINCT FROM v_job.provider_call_id
      OR v_call_log.retell_call_id IS DISTINCT FROM v_job.provider_call_id
      OR v_call_log.provider_reconciliation_required IS DISTINCT FROM true
      OR NOT EXISTS (
        SELECT 1 FROM public.provider_call_attempts attempt
        WHERE attempt.provider = 'retell'
          AND attempt.provider_call_id = v_job.provider_call_id
          AND attempt.call_log_id = v_dispatch.call_log_id
      )
    THEN
      RAISE EXCEPTION 'Retell reconciliation cannot resolve without accepted-attempt evidence';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.provider_callback_receipts receipt
        WHERE receipt.provider = 'retell'
          AND receipt.provider_call_id = v_job.provider_call_id
          AND receipt.lifecycle_stage = 'terminal_reconciliation'
          AND receipt.status = 'processed'
      )
    THEN
      RAISE EXCEPTION 'Retell terminal reconciliation receipt is not complete';
    END IF;
    IF (
      p_analysis_expected
      OR EXISTS (
        SELECT 1 FROM public.provider_callback_receipts receipt
        WHERE receipt.provider = 'retell'
          AND receipt.provider_call_id = v_job.provider_call_id
          AND receipt.lifecycle_stage = 'analysis_effects'
      )
    ) AND NOT EXISTS (
        SELECT 1 FROM public.provider_callback_receipts receipt
        WHERE receipt.provider = 'retell'
          AND receipt.provider_call_id = v_job.provider_call_id
          AND receipt.lifecycle_stage = 'analysis_effects'
          AND receipt.status = 'processed'
      ) THEN
      RAISE EXCEPTION 'Retell analysis-effects receipt is not complete';
    END IF;

    UPDATE public.provider_reconciliation_jobs
    SET state = 'resolved',
        provider_status = COALESCE(p_provider_status, provider_status),
        analysis_observed = analysis_observed OR p_analysis_expected,
        locked_until = NULL,
        claim_token = NULL,
        last_error = NULL,
        resolved_at = now(),
        updated_at = now()
    WHERE id = v_job.id;

    UPDATE public.call_logs
    SET provider_reconciliation_required = false,
        provider_reconciliation_reason = NULL,
        provider_reconciled_at = now()
    WHERE id = v_dispatch.call_log_id
      AND organization_id = v_dispatch.organization_id
      AND user_id = v_dispatch.user_id
      AND campaign_id IS NOT DISTINCT FROM v_dispatch.campaign_id
      AND lead_id IS NOT DISTINCT FROM v_dispatch.lead_id
      AND retell_call_id = v_job.provider_call_id
      AND EXISTS (
        SELECT 1 FROM public.provider_call_attempts attempt
        WHERE attempt.provider = 'retell'
          AND attempt.provider_call_id = v_job.provider_call_id
          AND attempt.call_log_id = v_dispatch.call_log_id
      );
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Retell reconciliation could not clear the proven call-log quarantine';
    END IF;

    UPDATE public.system_alerts
    SET auto_resolved = true,
        resolved_at = now()
    WHERE alert_type = 'retell_reconciliation_manual_required'
      AND auto_resolved = false
      AND metadata->>'job_id' = v_job.id::text;
    RETURN true;
  END IF;

  -- Manual review is a quarantine state, not a provider rejection. Preserve
  -- the dispatch, queue generation, reservation, and any provider evidence.
  UPDATE public.provider_reconciliation_jobs
  SET state = 'manual_required',
      provider_status = COALESCE(p_provider_status, provider_status),
      locked_until = NULL,
      claim_token = NULL,
      last_error = left(COALESCE(p_error, 'Manual Retell reconciliation required'), 2000),
      updated_at = now()
  WHERE id = v_job.id;

  UPDATE public.call_logs
  SET provider_reconciliation_required = true,
      provider_reconciliation_reason = left(COALESCE(p_error, 'Manual Retell reconciliation required'), 2000),
      provider_reconciliation_marked_at = COALESCE(provider_reconciliation_marked_at, now()),
      provider_reconciled_at = NULL,
      provider_reconciliation_queue_id = v_dispatch.queue_id
  WHERE id = v_dispatch.call_log_id
    AND organization_id = v_dispatch.organization_id
    AND user_id = v_dispatch.user_id
    AND campaign_id IS NOT DISTINCT FROM v_dispatch.campaign_id
    AND lead_id IS NOT DISTINCT FROM v_dispatch.lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Manual Retell quarantine could not be bound to its authoritative tenant graph';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.system_alerts alert
    WHERE alert.alert_type = 'retell_reconciliation_manual_required'
      AND alert.auto_resolved = false
      AND alert.metadata->>'job_id' = v_job.id::text
  ) THEN
    INSERT INTO public.system_alerts (
      user_id, alert_type, severity, title, message, metadata, related_id, related_type
    ) VALUES (
      v_dispatch.user_id,
      'retell_reconciliation_manual_required',
      'critical',
      'Retell call requires manual reconciliation',
      'Automatic reconciliation stopped safely. This call remains quarantined and will not be redialed.',
      jsonb_build_object(
        'job_id', v_job.id,
        'dispatch_claim_id', v_dispatch.id,
        'call_log_id', v_dispatch.call_log_id,
        'queue_id', v_dispatch.queue_id,
        'provider_call_id', COALESCE(v_job.provider_call_id, v_dispatch.provider_call_id),
        'reason', left(COALESCE(p_error, 'Manual Retell reconciliation required'), 1000)
      ),
      v_job.id::text,
      'provider_reconciliation_job'
    );
  END IF;
  RETURN true;
END;
$$;

-- Service-only operator action. Requeueing does not alter or release the
-- quarantined dispatch; it only gives the evidence worker another lease.
CREATE OR REPLACE FUNCTION public.requeue_retell_reconciliation_job(
  p_job_id uuid,
  p_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN
    RAISE EXCEPTION 'A meaningful operator requeue reason is required';
  END IF;

  UPDATE public.provider_reconciliation_jobs
  SET state = 'queued',
      attempt_count = 0,
      first_detected_at = now(),
      next_attempt_at = now(),
      locked_until = NULL,
      claim_token = NULL,
      resolved_at = NULL,
      reason = left('Operator requeued: ' || btrim(p_reason), 2000),
      last_error = left('Operator requeued: ' || btrim(p_reason), 2000),
      updated_at = now()
  WHERE id = p_job_id
    AND state = 'manual_required';
  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE public.system_alerts
  SET auto_resolved = true,
      resolved_at = now()
  WHERE alert_type = 'retell_reconciliation_manual_required'
    AND auto_resolved = false
    AND metadata->>'job_id' = p_job_id::text;
  RETURN true;
END;
$$;

-- Persist unexpected worker/invariant failures instead of silently leaving a
-- lease to churn. Only a genuinely lost token can escape this state machine.
CREATE OR REPLACE FUNCTION public.fail_retell_reconciliation_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_error text,
  p_retryable boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  job public.provider_reconciliation_jobs%ROWTYPE;
  outcome text;
  next_attempt timestamptz;
BEGIN
  SELECT * INTO job
  FROM public.provider_reconciliation_jobs
  WHERE id = p_job_id
    AND state = 'processing'
    AND claim_token = p_claim_token
    AND locked_until > now()
  FOR UPDATE;

  IF job.id IS NULL THEN
    RAISE EXCEPTION 'RETELL_RECONCILIATION_LEASE_LOST' USING ERRCODE = '40001';
  END IF;

  outcome := CASE
    WHEN p_retryable
      AND job.attempt_count < 12
      AND job.first_detected_at > now() - interval '2 hours'
    THEN 'waiting_provider'
    ELSE 'manual_required'
  END;
  next_attempt := CASE WHEN outcome = 'waiting_provider'
    THEN now() + make_interval(secs => LEAST(900, 30 * (2 ^ LEAST(5, GREATEST(0, job.attempt_count - 1)))::integer))
    ELSE NULL
  END;

  PERFORM public.finish_retell_reconciliation_job(
    job.id,
    p_claim_token,
    outcome,
    job.provider_status,
    left(COALESCE(p_error, 'Unhandled Retell reconciliation worker failure'), 2000),
    next_attempt,
    false
  );
  RETURN outcome;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_retell_reconciliation_run(
  p_status text,
  p_claimed_count integer DEFAULT 0,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_status NOT IN ('started', 'succeeded', 'failed') THEN
    RAISE EXCEPTION 'Invalid Retell reconciliation run status';
  END IF;

  INSERT INTO public.retell_reconciliation_runtime (
    singleton,
    last_started_at,
    last_succeeded_at,
    last_failed_at,
    last_claimed_count,
    last_error,
    updated_at
  ) VALUES (
    true,
    CASE WHEN p_status = 'started' THEN now() END,
    CASE WHEN p_status = 'succeeded' THEN now() END,
    CASE WHEN p_status = 'failed' THEN now() END,
    GREATEST(COALESCE(p_claimed_count, 0), 0),
    CASE WHEN p_status = 'failed' THEN left(p_error, 2000) END,
    now()
  )
  ON CONFLICT (singleton) DO UPDATE
  SET last_started_at = CASE
        WHEN p_status = 'started' THEN now()
        ELSE retell_reconciliation_runtime.last_started_at
      END,
      last_succeeded_at = CASE
        WHEN p_status = 'succeeded' THEN now()
        ELSE retell_reconciliation_runtime.last_succeeded_at
      END,
      last_failed_at = CASE
        WHEN p_status = 'failed' THEN now()
        ELSE retell_reconciliation_runtime.last_failed_at
      END,
      last_claimed_count = GREATEST(COALESCE(p_claimed_count, 0), 0),
      last_error = CASE
        WHEN p_status = 'failed' THEN left(p_error, 2000)
        WHEN p_status = 'succeeded' THEN NULL
        ELSE retell_reconciliation_runtime.last_error
      END,
      updated_at = now();
END;
$$;

-- Replace the original service RPC with a complete tenant-graph assertion and
-- immutable provider-egress snapshot. Independently valid UUIDs are never
-- sufficient to create a dispatch claim.
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
  queue_row public.dialing_queues%ROWTYPE;
  claim_row public.provider_dispatch_claims%ROWTYPE;
  call_log_row public.call_logs%ROWTYPE;
  campaign_row public.campaigns%ROWTYPE;
  lead_row public.leads%ROWTYPE;
BEGIN
  IF p_logical_key IS NULL OR length(btrim(p_logical_key)) NOT BETWEEN 8 AND 512 THEN
    RAISE EXCEPTION 'invalid provider dispatch logical key';
  END IF;
  IF lower(p_provider) NOT IN ('retell', 'telnyx') THEN
    RAISE EXCEPTION 'unsupported provider dispatch claim';
  END IF;
  IF p_call_log_id IS NULL OR p_organization_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'provider dispatch requires call-log, organization, and user identity';
  END IF;
  IF (p_queue_id IS NULL) <> (p_dispatch_generation IS NULL) THEN
    RAISE EXCEPTION 'queue and dispatch generation must be supplied together';
  END IF;

  SELECT * INTO call_log_row
  FROM public.call_logs
  WHERE id = p_call_log_id
  FOR UPDATE;
  IF call_log_row.id IS NULL
    OR call_log_row.organization_id IS DISTINCT FROM p_organization_id
    OR call_log_row.user_id IS DISTINCT FROM p_user_id
    OR call_log_row.campaign_id IS DISTINCT FROM p_campaign_id
    OR call_log_row.lead_id IS DISTINCT FROM p_lead_id
  THEN
    RAISE EXCEPTION 'provider dispatch call log does not match the authoritative tenant graph';
  END IF;
  IF NULLIF(btrim(call_log_row.phone_number), '') IS NULL
    OR NULLIF(btrim(call_log_row.caller_id), '') IS NULL
    OR (lower(p_provider) = 'retell' AND NULLIF(btrim(call_log_row.agent_id), '') IS NULL)
  THEN
    RAISE EXCEPTION 'provider dispatch call identity is incomplete';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_users AS membership
    WHERE membership.organization_id = p_organization_id
      AND membership.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'provider dispatch owner is not a current organization member';
  END IF;

  IF p_campaign_id IS NOT NULL THEN
    SELECT * INTO campaign_row FROM public.campaigns WHERE id = p_campaign_id;
    IF campaign_row.id IS NULL
      OR campaign_row.organization_id IS DISTINCT FROM p_organization_id
      OR campaign_row.user_id IS DISTINCT FROM p_user_id
    THEN
      RAISE EXCEPTION 'provider dispatch campaign belongs to a different tenant';
    END IF;
  END IF;

  IF p_lead_id IS NOT NULL THEN
    SELECT * INTO lead_row FROM public.leads WHERE id = p_lead_id;
    IF lead_row.id IS NULL
      OR lead_row.organization_id IS DISTINCT FROM p_organization_id
      OR lead_row.user_id IS DISTINCT FROM p_user_id
    THEN
      RAISE EXCEPTION 'provider dispatch lead belongs to a different tenant';
    END IF;
  END IF;

  IF p_queue_id IS NOT NULL THEN
    SELECT * INTO queue_row
    FROM public.dialing_queues
    WHERE id = p_queue_id
    FOR UPDATE;
    IF queue_row.id IS NULL
      OR queue_row.status <> 'calling'
      OR queue_row.dispatch_generation IS DISTINCT FROM p_dispatch_generation
      OR queue_row.campaign_id IS DISTINCT FROM p_campaign_id
      OR queue_row.lead_id IS DISTINCT FROM p_lead_id
      OR queue_row.last_provider_call_id IS NOT NULL
    THEN
      RAISE EXCEPTION 'queue dispatch generation is not exclusively claimable';
    END IF;
  END IF;

  INSERT INTO public.provider_dispatch_claims (
    logical_key, queue_id, dispatch_generation, call_log_id,
    organization_id, user_id, campaign_id, lead_id, provider,
    destination_phone, caller_id, agent_id, identity_contract_version
  ) VALUES (
    btrim(p_logical_key), p_queue_id, p_dispatch_generation, p_call_log_id,
    p_organization_id, p_user_id, p_campaign_id, p_lead_id, lower(p_provider),
    call_log_row.phone_number, call_log_row.caller_id, call_log_row.agent_id, 1
  )
  ON CONFLICT (logical_key) DO NOTHING
  RETURNING * INTO claim_row;

  IF claim_row.id IS NULL THEN
    SELECT * INTO claim_row
    FROM public.provider_dispatch_claims
    WHERE logical_key = btrim(p_logical_key);
    IF claim_row.id IS NULL
      OR claim_row.queue_id IS DISTINCT FROM p_queue_id
      OR claim_row.dispatch_generation IS DISTINCT FROM p_dispatch_generation
      OR claim_row.call_log_id IS DISTINCT FROM p_call_log_id
      OR claim_row.organization_id IS DISTINCT FROM p_organization_id
      OR claim_row.user_id IS DISTINCT FROM p_user_id
      OR claim_row.campaign_id IS DISTINCT FROM p_campaign_id
      OR claim_row.lead_id IS DISTINCT FROM p_lead_id
      OR claim_row.provider <> lower(p_provider)
      OR claim_row.destination_phone IS DISTINCT FROM call_log_row.phone_number
      OR claim_row.caller_id IS DISTINCT FROM call_log_row.caller_id
      OR claim_row.agent_id IS DISTINCT FROM call_log_row.agent_id
    THEN
      RAISE EXCEPTION 'provider dispatch logical key payload mismatch';
    END IF;
    RETURN QUERY SELECT false, claim_row.id, claim_row.status;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, claim_row.id, claim_row.status;
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
  claim_row public.provider_dispatch_claims%ROWTYPE;
BEGIN
  IF p_status NOT IN ('accepted', 'definite_failure', 'acceptance_unknown') THEN
    RAISE EXCEPTION 'invalid provider dispatch final status';
  END IF;
  IF p_status = 'accepted' AND NULLIF(btrim(p_provider_call_id), '') IS NULL THEN
    RAISE EXCEPTION 'accepted dispatch requires provider call id';
  END IF;
  IF p_status = 'definite_failure' AND p_provider_call_id IS NOT NULL THEN
    RAISE EXCEPTION 'definite provider failure cannot carry positive provider identity';
  END IF;
  IF p_status = 'acceptance_unknown' AND p_provider_call_id IS NOT NULL THEN
    RAISE EXCEPTION 'unknown provider acceptance cannot carry a provider call id';
  END IF;

  SELECT * INTO claim_row
  FROM public.provider_dispatch_claims
  WHERE id = p_claim_id
    AND user_id = p_user_id
  FOR UPDATE;
  IF claim_row.id IS NULL THEN RETURN false; END IF;
  IF claim_row.status <> 'claimed' THEN
    IF claim_row.status = p_status
      AND (
        p_status <> 'accepted'
        OR claim_row.provider_call_id IS NOT DISTINCT FROM btrim(p_provider_call_id)
      )
    THEN
      RETURN true;
    END IF;
    RAISE EXCEPTION 'provider dispatch claim is missing or finalized differently';
  END IF;

  UPDATE public.provider_dispatch_claims
  SET status = p_status,
      provider_call_id = CASE WHEN p_status = 'accepted' THEN btrim(p_provider_call_id) ELSE NULL END,
      last_error = left(p_last_error, 2000),
      finalized_at = now(),
      updated_at = now()
  WHERE id = claim_row.id;

  IF p_status = 'acceptance_unknown' AND claim_row.provider = 'retell' THEN
    INSERT INTO public.provider_reconciliation_jobs (
      dispatch_claim_id, organization_id, user_id, reason, next_attempt_at
    ) VALUES (
      claim_row.id,
      claim_row.organization_id,
      claim_row.user_id,
      COALESCE(left(p_last_error, 2000), 'Retell create acceptance is unknown'),
      now() + interval '90 seconds'
    )
    ON CONFLICT (dispatch_claim_id) DO NOTHING;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_pending_dispatches(
  p_campaign_ids uuid[],
  p_limit integer DEFAULT 50
)
RETURNS SETOF public.dialing_queues
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.dialing_queues AS queue
  SET status = 'calling',
      dispatch_generation = gen_random_uuid(),
      last_provider_call_id = NULL,
      updated_at = now()
  WHERE queue.id IN (
    SELECT candidate.id
    FROM public.dialing_queues AS candidate
    WHERE candidate.campaign_id = ANY(p_campaign_ids)
      AND candidate.status = 'pending'
      AND candidate.scheduled_at <= now()
      AND COALESCE(candidate.attempts, 0) < COALESCE(candidate.max_attempts, 3)
      AND NOT EXISTS (
        SELECT 1
        FROM public.provider_dispatch_claims AS dispatch
        JOIN public.provider_reconciliation_jobs AS job ON job.dispatch_claim_id = dispatch.id
        WHERE dispatch.queue_id = candidate.id
          AND job.state <> 'resolved'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.provider_dispatch_claims AS dispatch
        WHERE dispatch.queue_id = candidate.id
          AND dispatch.provider = 'retell'
          AND dispatch.status = 'accepted'
          AND (
            NOT EXISTS (
              SELECT 1
              FROM public.provider_callback_receipts AS terminal_receipt
              WHERE terminal_receipt.provider = 'retell'
                AND terminal_receipt.provider_call_id = dispatch.provider_call_id
                AND terminal_receipt.lifecycle_stage = 'terminal_reconciliation'
                AND terminal_receipt.status = 'processed'
            )
            OR EXISTS (
              SELECT 1
              FROM public.provider_callback_receipts AS unresolved_receipt
              WHERE unresolved_receipt.provider = 'retell'
                AND unresolved_receipt.provider_call_id = dispatch.provider_call_id
                AND unresolved_receipt.lifecycle_stage IN ('terminal_reconciliation', 'analysis_effects')
                AND unresolved_receipt.status <> 'processed'
            )
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.call_logs AS call_log
        WHERE call_log.provider_reconciliation_queue_id = candidate.id
          AND call_log.provider_reconciliation_required = true
      )
    ORDER BY candidate.priority DESC NULLS LAST, candidate.scheduled_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING queue.*;
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
  UPDATE public.dialing_queues AS queue
  SET status = 'calling',
      dispatch_generation = gen_random_uuid(),
      last_provider_call_id = NULL,
      updated_at = now()
  WHERE queue.id IN (
    SELECT candidate.id
    FROM public.dialing_queues AS candidate
    WHERE candidate.campaign_id = ANY(p_campaign_ids)
      AND candidate.status = 'pending'
      AND COALESCE(candidate.attempts, 0) < COALESCE(candidate.max_attempts, 3)
      AND NOT EXISTS (
        SELECT 1
        FROM public.provider_dispatch_claims AS dispatch
        JOIN public.provider_reconciliation_jobs AS job ON job.dispatch_claim_id = dispatch.id
        WHERE dispatch.queue_id = candidate.id
          AND job.state <> 'resolved'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.provider_dispatch_claims AS dispatch
        WHERE dispatch.queue_id = candidate.id
          AND dispatch.provider = 'retell'
          AND dispatch.status = 'accepted'
          AND (
            NOT EXISTS (
              SELECT 1
              FROM public.provider_callback_receipts AS terminal_receipt
              WHERE terminal_receipt.provider = 'retell'
                AND terminal_receipt.provider_call_id = dispatch.provider_call_id
                AND terminal_receipt.lifecycle_stage = 'terminal_reconciliation'
                AND terminal_receipt.status = 'processed'
            )
            OR EXISTS (
              SELECT 1
              FROM public.provider_callback_receipts AS unresolved_receipt
              WHERE unresolved_receipt.provider = 'retell'
                AND unresolved_receipt.provider_call_id = dispatch.provider_call_id
                AND unresolved_receipt.lifecycle_stage IN ('terminal_reconciliation', 'analysis_effects')
                AND unresolved_receipt.status <> 'processed'
            )
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.call_logs AS call_log
        WHERE call_log.provider_reconciliation_queue_id = candidate.id
          AND call_log.provider_reconciliation_required = true
      )
    ORDER BY candidate.priority DESC NULLS LAST, candidate.scheduled_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING queue.*;
$$;

CREATE OR REPLACE FUNCTION public.resolve_provider_dispatch_invoke_error(
  p_queue_id uuid,
  p_dispatch_generation uuid,
  p_release_status text,
  p_scheduled_at timestamptz,
  p_retry_notes text
)
RETURNS TABLE(retry_released boolean, claim_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  queue_row public.dialing_queues%ROWTYPE;
  dispatch_row public.provider_dispatch_claims%ROWTYPE;
  updated_count integer := 0;
BEGIN
  IF p_release_status NOT IN ('pending', 'failed') THEN
    RAISE EXCEPTION 'Invoke-error release status must be pending or failed';
  END IF;

  SELECT * INTO queue_row
  FROM public.dialing_queues
  WHERE id = p_queue_id
  FOR UPDATE;
  IF queue_row.id IS NULL THEN RAISE EXCEPTION 'Dispatch queue does not exist'; END IF;
  IF queue_row.dispatch_generation IS DISTINCT FROM p_dispatch_generation THEN
    RAISE EXCEPTION 'Dispatch queue generation changed before invoke-error resolution';
  END IF;
  IF queue_row.status <> 'calling' THEN
    RETURN QUERY SELECT false, 'queue_not_calling'::text;
    RETURN;
  END IF;

  SELECT * INTO dispatch_row
  FROM public.provider_dispatch_claims AS dispatch
  WHERE dispatch.queue_id = p_queue_id
    AND dispatch.dispatch_generation = p_dispatch_generation;

  IF dispatch_row.id IS NOT NULL AND (
    dispatch_row.status <> 'definite_failure'
    OR dispatch_row.provider_call_id IS NOT NULL
  ) THEN
    RETURN QUERY SELECT false, dispatch_row.status;
    RETURN;
  END IF;

  IF queue_row.last_provider_call_id IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM public.provider_call_attempts AS attempt
      WHERE attempt.queue_id = p_queue_id
        OR (dispatch_row.id IS NOT NULL AND attempt.call_log_id = dispatch_row.call_log_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.provider_reconciliation_jobs AS job
      WHERE dispatch_row.id IS NOT NULL
        AND job.dispatch_claim_id = dispatch_row.id
        AND job.state <> 'resolved'
    )
    OR EXISTS (
      SELECT 1 FROM public.provider_callback_receipts AS receipt
      WHERE dispatch_row.provider_call_id IS NOT NULL
        AND receipt.provider = dispatch_row.provider
        AND receipt.provider_call_id = dispatch_row.provider_call_id
    )
    OR EXISTS (
      SELECT 1 FROM public.call_logs AS call_log
      WHERE (
          call_log.provider_reconciliation_queue_id = p_queue_id
          OR (dispatch_row.id IS NOT NULL AND call_log.id = dispatch_row.call_log_id)
        )
        AND (
          call_log.provider_reconciliation_required = true
          OR call_log.retell_call_id IS NOT NULL
          OR call_log.telnyx_call_control_id IS NOT NULL
          OR call_log.telnyx_call_session_id IS NOT NULL
          OR call_log.status IN ('initiated', 'ringing', 'in_progress')
        )
    )
  THEN
    RETURN QUERY SELECT false, COALESCE(dispatch_row.status, 'positive_evidence');
    RETURN;
  END IF;

  UPDATE public.dialing_queues
  SET status = p_release_status,
      scheduled_at = CASE WHEN p_release_status = 'pending' THEN p_scheduled_at ELSE scheduled_at END,
      updated_at = now(),
      notes = p_retry_notes
  WHERE id = p_queue_id
    AND status = 'calling'
    AND dispatch_generation = p_dispatch_generation
    AND last_provider_call_id IS NULL;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN QUERY SELECT updated_count = 1, COALESCE(dispatch_row.status, 'no_claim');
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
  attempt_id uuid;
  existing_attempt public.provider_call_attempts%ROWTYPE;
  dispatch_row public.provider_dispatch_claims%ROWTYPE;
  queue_row public.dialing_queues%ROWTYPE;
BEGIN
  IF NULLIF(btrim(p_provider_call_id), '') IS NULL THEN
    RAISE EXCEPTION 'provider_call_id is required';
  END IF;

  SELECT * INTO dispatch_row
  FROM public.provider_dispatch_claims AS dispatch
  WHERE dispatch.provider = lower(p_provider)
    AND dispatch.provider_call_id = p_provider_call_id
    AND dispatch.status = 'accepted'
  FOR UPDATE;
  IF dispatch_row.id IS NULL
    OR dispatch_row.queue_id IS DISTINCT FROM p_queue_id
    OR dispatch_row.call_log_id IS DISTINCT FROM p_call_log_id
    OR dispatch_row.organization_id IS DISTINCT FROM p_organization_id
    OR dispatch_row.user_id IS DISTINCT FROM p_user_id
    OR dispatch_row.campaign_id IS DISTINCT FROM p_campaign_id
    OR dispatch_row.lead_id IS DISTINCT FROM p_lead_id
  THEN
    RAISE EXCEPTION 'physical attempt does not match one accepted provider dispatch';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.call_logs AS call_log
    WHERE call_log.id = dispatch_row.call_log_id
      AND call_log.organization_id = dispatch_row.organization_id
      AND call_log.user_id = dispatch_row.user_id
      AND call_log.campaign_id IS NOT DISTINCT FROM dispatch_row.campaign_id
      AND call_log.lead_id IS NOT DISTINCT FROM dispatch_row.lead_id
  ) THEN
    RAISE EXCEPTION 'physical attempt call log is outside the dispatch tenant graph';
  END IF;

  SELECT * INTO existing_attempt
  FROM public.provider_call_attempts
  WHERE provider = lower(p_provider)
    AND provider_call_id = p_provider_call_id;
  IF existing_attempt.id IS NOT NULL THEN
    IF existing_attempt.queue_id IS DISTINCT FROM p_queue_id
      OR existing_attempt.call_log_id IS DISTINCT FROM p_call_log_id
      OR existing_attempt.organization_id IS DISTINCT FROM p_organization_id
      OR existing_attempt.user_id IS DISTINCT FROM p_user_id
      OR existing_attempt.campaign_id IS DISTINCT FROM p_campaign_id
      OR existing_attempt.lead_id IS DISTINCT FROM p_lead_id
    THEN
      RAISE EXCEPTION 'provider call attempt identity mismatch';
    END IF;
    RETURN false;
  END IF;

  IF p_queue_id IS NOT NULL THEN
    SELECT * INTO queue_row
    FROM public.dialing_queues
    WHERE id = p_queue_id
    FOR UPDATE;
    IF queue_row.id IS NULL
      OR queue_row.status <> 'calling'
      OR queue_row.dispatch_generation IS DISTINCT FROM dispatch_row.dispatch_generation
      OR queue_row.campaign_id IS DISTINCT FROM p_campaign_id
      OR queue_row.lead_id IS DISTINCT FROM p_lead_id
      OR (queue_row.last_provider_call_id IS NOT NULL AND queue_row.last_provider_call_id <> p_provider_call_id)
    THEN
      RAISE EXCEPTION 'queue is not exclusively bound to the accepted provider dispatch';
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
  RETURNING id INTO attempt_id;

  IF attempt_id IS NULL THEN
    RAISE EXCEPTION 'concurrent provider attempt must be retried for identity verification'
      USING ERRCODE = '40001';
  END IF;

  IF p_queue_id IS NOT NULL THEN
    UPDATE public.dialing_queues
    SET attempts = COALESCE(attempts, 0) + 1,
        status = 'calling',
        last_provider = lower(p_provider),
        last_provider_call_id = p_provider_call_id,
        last_attempted_at = now(),
        updated_at = now()
    WHERE id = p_queue_id
      AND dispatch_generation = dispatch_row.dispatch_generation;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'queue changed before provider attempt could be bound';
    END IF;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.retell_reconciliation_health_check()
RETURNS TABLE (
  contract_ready boolean,
  cron_scheduled boolean,
  cron_active boolean,
  vault_configured boolean,
  last_started_at timestamptz,
  last_succeeded_at timestamptz,
  recent_success boolean,
  queued_count bigint,
  expired_lease_count bigint,
  manual_required_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, cron, pg_temp
AS $$
  SELECT
    to_regclass('public.provider_reconciliation_jobs') IS NOT NULL
      AND to_regprocedure('public.claim_retell_reconciliation_jobs(integer)') IS NOT NULL
      AND to_regprocedure('public.bind_retell_reconciliation_call(uuid,uuid,text,text,jsonb)') IS NOT NULL
      AND to_regprocedure('public.finish_retell_reconciliation_job(uuid,uuid,text,text,text,timestamp with time zone,boolean)') IS NOT NULL
      AND to_regprocedure('public.fail_retell_reconciliation_job(uuid,uuid,text,boolean)') IS NOT NULL
      AND to_regprocedure('public.mark_retell_reconciliation_run(text,integer,text)') IS NOT NULL
      AND to_regprocedure('public.configure_retell_reconciliation_cron(boolean)') IS NOT NULL,
    EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'retell-provider-reconciler'),
    EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'retell-provider-reconciler' AND active),
    (
      SELECT count(DISTINCT secret.name) = 3
      FROM vault.decrypted_secrets AS secret
      WHERE secret.name IN (
        'dial_smart_project_url',
        'dial_smart_publishable_key',
        'dial_smart_retell_reconciler_cron_token'
      )
        AND NULLIF(secret.decrypted_secret, '') IS NOT NULL
    ),
    runtime.last_started_at,
    runtime.last_succeeded_at,
    runtime.last_succeeded_at > now() - interval '6 minutes',
    count(*) FILTER (WHERE state IN ('queued', 'waiting_provider')),
    count(*) FILTER (WHERE state = 'processing' AND locked_until < now()),
    count(*) FILTER (WHERE state = 'manual_required')
  FROM public.retell_reconciliation_runtime AS runtime
  LEFT JOIN public.provider_reconciliation_jobs AS job ON true
  WHERE runtime.singleton = true
  GROUP BY runtime.last_started_at, runtime.last_succeeded_at;
$$;

REVOKE ALL ON FUNCTION public.claim_retell_reconciliation_jobs(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bind_retell_reconciliation_call(uuid, uuid, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_retell_reconciliation_job(
  uuid, uuid, text, text, text, timestamptz, boolean
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.requeue_retell_reconciliation_job(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_retell_reconciliation_job(uuid, uuid, text, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_retell_reconciliation_run(text, integer, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.retell_reconciliation_health_check()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_provider_callback(text, text, text, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_pending_dispatches(uuid[], integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_pending_dispatches_now(uuid[], integer)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_retell_reconciliation_jobs(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.bind_retell_reconciliation_call(uuid, uuid, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_retell_reconciliation_job(
  uuid, uuid, text, text, text, timestamptz, boolean
) TO service_role;
GRANT EXECUTE ON FUNCTION public.requeue_retell_reconciliation_job(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_retell_reconciliation_job(uuid, uuid, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_retell_reconciliation_run(text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.retell_reconciliation_health_check() TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_provider_callback(text, text, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_pending_dispatches(uuid[], integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_pending_dispatches_now(uuid[], integer) TO service_role;

COMMENT ON TABLE public.provider_reconciliation_jobs IS
  'Leased, bounded Retell evidence-reconciliation jobs. Missing evidence never releases a quarantined redial.';

-- Cron is opt-in and Vault-backed. The scheduled command contains secret names,
-- never secret values. A dedicated token can only run this worker; requeue and
-- health remain service-role operations.
CREATE OR REPLACE FUNCTION public.configure_retell_reconciliation_cron(
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
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'retell-provider-reconciler') THEN
    PERFORM cron.unschedule('retell-provider-reconciler');
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
      'dial_smart_retell_reconciler_cron_token'
    )
    AND NULLIF(secret.decrypted_secret, '') IS NOT NULL;

  IF configured_secret_count <> 3 THEN
    RAISE EXCEPTION 'Retell reconciliation cron requires three named Vault secrets';
  END IF;

  PERFORM cron.schedule('retell-provider-reconciler', '*/2 * * * *', $command$
    SELECT net.http_post(
      url := rtrim((
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'dial_smart_project_url' LIMIT 1
      ), '/') || '/functions/v1/retell-reconciler',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (
          SELECT decrypted_secret FROM vault.decrypted_secrets
          WHERE name = 'dial_smart_publishable_key' LIMIT 1
        ),
        'X-DialSmart-Cron-Token', (
          SELECT decrypted_secret FROM vault.decrypted_secrets
          WHERE name = 'dial_smart_retell_reconciler_cron_token' LIMIT 1
        )
      ),
      body := '{"action":"run","source":"pg_cron"}'::jsonb
    ) AS request_id;
  $command$);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.configure_retell_reconciliation_cron(boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.configure_retell_reconciliation_cron(boolean)
  TO service_role;

-- Every migration leaves the worker disabled. Enabling it is an explicit
-- post-deploy operation after Vault, Edge secrets, and staging health are green.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'retell-provider-reconciler') THEN
    PERFORM cron.unschedule('retell-provider-reconciler');
  END IF;
END;
$$;
