-- Durable SMS delivery safety and normalized contact matching.
--
-- At-most-once invariant: an idempotency key is claimed exactly once before
-- provider mutation. A claim is never automatically reopened. Network errors,
-- timeouts, provider 5xx responses, and malformed 2xx responses are recorded as
-- acceptance_unknown and require reconciliation rather than blind retry.

CREATE OR REPLACE FUNCTION public.normalize_contact_phone(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
RETURNS NULL ON NULL INPUT
SET search_path = public, pg_temp
AS $$
  WITH normalized AS (
    SELECT regexp_replace(p_phone, '[^0-9]', '', 'g') AS digits
  )
  SELECT CASE
    WHEN length(digits) = 10 THEN '+1' || digits
    WHEN length(digits) = 11 AND left(digits, 1) = '1' THEN '+' || digits
    WHEN length(digits) BETWEEN 8 AND 15 THEN '+' || digits
    ELSE NULL
  END
  FROM normalized;
$$;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS phone_number_normalized text;

ALTER TABLE public.dnc_list
  ADD COLUMN IF NOT EXISTS phone_number_normalized text,
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.sms_messages
  DROP CONSTRAINT IF EXISTS sms_messages_status_check;

ALTER TABLE public.sms_messages
  ADD CONSTRAINT sms_messages_status_check
  CHECK (status IN (
    'pending',
    'queued',
    'sending',
    'sent',
    'delivered',
    'failed',
    'received',
    'acceptance_unknown',
    'duplicate_suppressed'
  ));

UPDATE public.leads
SET phone_number_normalized = public.normalize_contact_phone(phone_number)
WHERE phone_number_normalized IS DISTINCT FROM public.normalize_contact_phone(phone_number);

UPDATE public.dnc_list
SET phone_number_normalized = public.normalize_contact_phone(phone_number)
WHERE phone_number_normalized IS DISTINCT FROM public.normalize_contact_phone(phone_number);

WITH one_membership AS (
  SELECT user_id, min(organization_id::text)::uuid AS organization_id
  FROM public.organization_users
  GROUP BY user_id
  HAVING count(DISTINCT organization_id) = 1
)
UPDATE public.dnc_list dnc
SET organization_id = membership.organization_id
FROM one_membership membership
WHERE dnc.user_id = membership.user_id
  AND dnc.organization_id IS DISTINCT FROM membership.organization_id;

CREATE OR REPLACE FUNCTION public.sync_normalized_contact_phone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.phone_number_normalized := public.normalize_contact_phone(NEW.phone_number);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_lead_normalized_phone ON public.leads;
CREATE TRIGGER sync_lead_normalized_phone
BEFORE INSERT OR UPDATE OF phone_number, phone_number_normalized ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.sync_normalized_contact_phone();

DROP TRIGGER IF EXISTS sync_dnc_normalized_phone ON public.dnc_list;
CREATE TRIGGER sync_dnc_normalized_phone
BEFORE INSERT OR UPDATE OF phone_number, phone_number_normalized ON public.dnc_list
FOR EACH ROW EXECUTE FUNCTION public.sync_normalized_contact_phone();

CREATE INDEX IF NOT EXISTS idx_leads_user_normalized_phone
  ON public.leads(user_id, phone_number_normalized)
  WHERE phone_number_normalized IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dnc_user_normalized_phone
  ON public.dnc_list(user_id, phone_number_normalized)
  WHERE phone_number_normalized IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dnc_org_normalized_phone
  ON public.dnc_list(organization_id, phone_number_normalized)
  WHERE organization_id IS NOT NULL AND phone_number_normalized IS NOT NULL;

DROP POLICY IF EXISTS "Users can manage their own DNC list" ON public.dnc_list;
DROP POLICY IF EXISTS "Users can view their own DNC list" ON public.dnc_list;
DROP POLICY IF EXISTS "Users can insert to their DNC list" ON public.dnc_list;
DROP POLICY IF EXISTS "Users can delete from their DNC list" ON public.dnc_list;
DROP POLICY IF EXISTS "Users can view DNC list in their organization" ON public.dnc_list;
DROP POLICY IF EXISTS "Users can insert to DNC list in their organization" ON public.dnc_list;
DROP POLICY IF EXISTS "Users can delete from DNC list in their organization" ON public.dnc_list;

CREATE POLICY "Organization members can view DNC suppressions"
  ON public.dnc_list FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL AND public.user_in_organization(organization_id));

CREATE POLICY "Organization members can add DNC suppressions"
  ON public.dnc_list FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND organization_id IS NOT NULL
    AND public.user_in_organization(organization_id)
  );

CREATE POLICY "Organization members can update their DNC suppressions"
  ON public.dnc_list FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.user_in_organization(organization_id))
  WITH CHECK (user_id = auth.uid() AND public.user_in_organization(organization_id));

CREATE POLICY "Organization admins can delete DNC suppressions"
  ON public.dnc_list FOR DELETE TO authenticated
  USING (organization_id IS NOT NULL AND public.is_org_admin(organization_id));

CREATE TABLE IF NOT EXISTS public.sms_delivery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 512),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sms_message_id uuid REFERENCES public.sms_messages(id) ON DELETE SET NULL,
  provider text NOT NULL CHECK (provider IN ('twilio', 'telnyx')),
  from_number_normalized text NOT NULL,
  to_number_normalized text NOT NULL,
  body_sha256 text NOT NULL CHECK (body_sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'claimed'
    CHECK (status IN ('claimed', 'accepted', 'rejected', 'acceptance_unknown')),
  provider_message_id text,
  last_error text,
  provider_response jsonb,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  reconciled_at timestamptz,
  reconciliation_notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_delivery_attempts_org_idempotency
  ON public.sms_delivery_attempts(organization_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_sms_delivery_attempts_reconciliation
  ON public.sms_delivery_attempts(status, claimed_at)
  WHERE status IN ('claimed', 'acceptance_unknown');

CREATE INDEX IF NOT EXISTS idx_sms_delivery_attempts_user_created
  ON public.sms_delivery_attempts(user_id, created_at DESC);

ALTER TABLE public.sms_delivery_attempts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.claim_sms_delivery_attempt(
  p_idempotency_key text,
  p_user_id uuid,
  p_organization_id uuid,
  p_sms_message_id uuid,
  p_provider text,
  p_from_number_normalized text,
  p_to_number_normalized text,
  p_body_sha256 text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  claimed boolean,
  attempt_id uuid,
  current_status text,
  existing_sms_message_id uuid,
  existing_provider_message_id text,
  reconciliation_required boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempt public.sms_delivery_attempts%ROWTYPE;
BEGIN
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 8 AND 512 THEN
    RAISE EXCEPTION 'invalid SMS idempotency key';
  END IF;

  INSERT INTO public.sms_delivery_attempts (
    idempotency_key,
    user_id,
    organization_id,
    sms_message_id,
    provider,
    from_number_normalized,
    to_number_normalized,
    body_sha256,
    metadata
  ) VALUES (
    p_idempotency_key,
    p_user_id,
    p_organization_id,
    p_sms_message_id,
    lower(p_provider),
    p_from_number_normalized,
    p_to_number_normalized,
    lower(p_body_sha256),
    COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (organization_id, idempotency_key) DO NOTHING
  RETURNING * INTO v_attempt;

  IF v_attempt.id IS NOT NULL THEN
    RETURN QUERY SELECT
      true,
      v_attempt.id,
      v_attempt.status,
      v_attempt.sms_message_id,
      v_attempt.provider_message_id,
      false;
    RETURN;
  END IF;

  SELECT * INTO v_attempt
  FROM public.sms_delivery_attempts
  WHERE organization_id = p_organization_id
    AND idempotency_key = p_idempotency_key;

  IF v_attempt.id IS NULL THEN
    RAISE EXCEPTION 'SMS delivery claim could not be resolved';
  END IF;

  IF v_attempt.user_id <> p_user_id
    OR v_attempt.organization_id <> p_organization_id
    OR v_attempt.provider <> lower(p_provider)
    OR v_attempt.from_number_normalized <> p_from_number_normalized
    OR v_attempt.to_number_normalized <> p_to_number_normalized
    OR v_attempt.body_sha256 <> lower(p_body_sha256)
  THEN
    RAISE EXCEPTION 'SMS idempotency key was reused with a different delivery payload';
  END IF;

  RETURN QUERY SELECT
    false,
    v_attempt.id,
    v_attempt.status,
    v_attempt.sms_message_id,
    v_attempt.provider_message_id,
    v_attempt.status IN ('claimed', 'acceptance_unknown');
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_sms_delivery_attempt(
  p_attempt_id uuid,
  p_user_id uuid,
  p_status text,
  p_provider_message_id text DEFAULT NULL,
  p_last_error text DEFAULT NULL,
  p_provider_response jsonb DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated integer;
  v_existing_status text;
BEGIN
  IF p_status NOT IN ('accepted', 'rejected', 'acceptance_unknown') THEN
    RAISE EXCEPTION 'invalid SMS delivery final status';
  END IF;

  UPDATE public.sms_delivery_attempts
  SET status = p_status,
      provider_message_id = COALESCE(p_provider_message_id, provider_message_id),
      last_error = p_last_error,
      provider_response = p_provider_response,
      finalized_at = now(),
      updated_at = now()
  WHERE id = p_attempt_id
    AND user_id = p_user_id
    AND status = 'claimed';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 1 THEN RETURN true; END IF;

  SELECT status INTO v_existing_status
  FROM public.sms_delivery_attempts
  WHERE id = p_attempt_id AND user_id = p_user_id;

  IF v_existing_status = p_status THEN RETURN true; END IF;
  RAISE EXCEPTION 'SMS delivery attempt is missing or already finalized as %', v_existing_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_sms_delivery_attempt(
  p_attempt_id uuid,
  p_user_id uuid,
  p_resolution text,
  p_notes text,
  p_provider_message_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
BEGIN
  IF p_resolution NOT IN ('confirmed_accepted', 'confirmed_not_accepted') THEN
    RAISE EXCEPTION 'SMS reconciliation resolution must be confirmed_accepted or confirmed_not_accepted';
  END IF;
  IF p_notes IS NULL OR length(trim(p_notes)) = 0 THEN
    RAISE EXCEPTION 'SMS reconciliation notes are required';
  END IF;
  IF p_resolution = 'confirmed_accepted' AND p_provider_message_id IS NULL THEN
    RAISE EXCEPTION 'Confirmed SMS acceptance requires the provider message id';
  END IF;

  v_status := CASE
    WHEN p_resolution = 'confirmed_accepted' THEN 'accepted'
    ELSE 'rejected'
  END;

  UPDATE public.sms_delivery_attempts
  SET status = v_status,
      provider_message_id = COALESCE(p_provider_message_id, provider_message_id),
      reconciled_at = now(),
      reconciliation_notes = trim(p_notes),
      finalized_at = COALESCE(finalized_at, now()),
      updated_at = now()
  WHERE id = p_attempt_id
    AND user_id = p_user_id
    AND status IN ('claimed', 'acceptance_unknown');

  RETURN FOUND;
END;
$$;

REVOKE ALL ON TABLE public.sms_delivery_attempts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.normalize_contact_phone(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_sms_delivery_attempt(text, uuid, uuid, uuid, text, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_sms_delivery_attempt(uuid, uuid, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_sms_delivery_attempt(uuid, uuid, text, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.normalize_contact_phone(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_sms_delivery_attempt(text, uuid, uuid, uuid, text, text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_sms_delivery_attempt(uuid, uuid, text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_sms_delivery_attempt(uuid, uuid, text, text, text) TO service_role;
