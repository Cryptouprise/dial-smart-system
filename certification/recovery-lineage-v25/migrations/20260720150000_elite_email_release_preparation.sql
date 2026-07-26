BEGIN;

-- A signed source/suppression attestation is the only input that can move a
-- durable release from pending_adapter_provisioning to prepared. This table
-- deliberately stores no email address, recipient row, copy, provider key,
-- mailbox, or provider response. It records only immutable provenance and
-- digests needed to prove that the source evidence matched the release.
CREATE TABLE IF NOT EXISTS public.elite_email_release_preparation_attestations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id uuid NOT NULL UNIQUE REFERENCES public.elite_email_execution_releases(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE RESTRICT,
  attestation_fingerprint text NOT NULL CHECK (attestation_fingerprint ~ '^sha256:[a-f0-9]{64}$'),
  source_system text NOT NULL CHECK (source_system ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{7,255}$'),
  source_release_reference text NOT NULL CHECK (source_release_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{7,255}$'),
  recipient_manifest_sha256 text NOT NULL CHECK (recipient_manifest_sha256 ~ '^[a-f0-9]{64}$'),
  suppression_snapshot_sha256 text NOT NULL CHECK (suppression_snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  recipient_count integer NOT NULL CHECK (recipient_count BETWEEN 1 AND 25),
  signing_key_id text NOT NULL CHECK (signing_key_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{7,255}$'),
  signer_principal_reference text NOT NULL CHECK (signer_principal_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{7,255}$'),
  public_key_spki_sha256 text NOT NULL CHECK (public_key_spki_sha256 ~ '^[a-f0-9]{64}$'),
  evidence_as_of timestamptz NOT NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT elite_email_release_preparation_member_fkey
    FOREIGN KEY (organization_id, user_id)
    REFERENCES public.organization_users(organization_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT elite_email_release_preparation_evidence_window
    CHECK (
      evidence_as_of <= issued_at
      AND issued_at - evidence_as_of <= interval '5 minutes'
      AND expires_at > issued_at
      AND expires_at - evidence_as_of <= interval '24 hours'
    ),
  CONSTRAINT elite_email_release_preparation_org_fingerprint_key
    UNIQUE (organization_id, attestation_fingerprint)
);

CREATE INDEX IF NOT EXISTS elite_email_release_preparation_campaign_expiry_idx
  ON public.elite_email_release_preparation_attestations (
    organization_id, campaign_id, expires_at
  );

CREATE OR REPLACE FUNCTION public.enforce_elite_email_release_preparation_attestation_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'ELITE_EMAIL_RELEASE_PREPARATION_ATTESTATION_IMMUTABLE';
  END IF;
  IF NEW.created_at > now() + interval '1 minute' THEN
    RAISE EXCEPTION 'ELITE_EMAIL_RELEASE_PREPARATION_ATTESTATION_CREATED_AT_INVALID';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS elite_email_release_preparation_attestations_immutable
  ON public.elite_email_release_preparation_attestations;
CREATE TRIGGER elite_email_release_preparation_attestations_immutable
BEFORE INSERT OR UPDATE OR DELETE ON public.elite_email_release_preparation_attestations
FOR EACH ROW EXECUTE FUNCTION public.enforce_elite_email_release_preparation_attestation_immutable();

CREATE OR REPLACE FUNCTION public.prepare_elite_email_execution_release(
  p_release_id uuid,
  p_organization_id uuid,
  p_user_id uuid,
  p_campaign_id uuid,
  p_attestation_fingerprint text,
  p_source_system text,
  p_source_release_reference text,
  p_recipient_manifest_sha256 text,
  p_suppression_snapshot_sha256 text,
  p_recipient_count integer,
  p_signing_key_id text,
  p_signer_principal_reference text,
  p_public_key_spki_sha256 text,
  p_evidence_as_of timestamptz,
  p_issued_at timestamptz,
  p_expires_at timestamptz
)
RETURNS TABLE (
  prepared boolean,
  release_id uuid,
  release_state text,
  reason_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_release public.elite_email_execution_releases%ROWTYPE;
  v_attestation public.elite_email_release_preparation_attestations%ROWTYPE;
BEGIN
  IF p_release_id IS NULL OR p_organization_id IS NULL OR p_user_id IS NULL
    OR p_campaign_id IS NULL
    OR p_attestation_fingerprint !~ '^sha256:[a-f0-9]{64}$'
    OR p_source_system !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{7,255}$'
    OR p_source_release_reference !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{7,255}$'
    OR p_recipient_manifest_sha256 !~ '^[a-f0-9]{64}$'
    OR p_suppression_snapshot_sha256 !~ '^[a-f0-9]{64}$'
    OR p_recipient_count NOT BETWEEN 1 AND 25
    OR p_signing_key_id !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{7,255}$'
    OR p_signer_principal_reference !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{7,255}$'
    OR p_public_key_spki_sha256 !~ '^[a-f0-9]{64}$'
    OR p_evidence_as_of IS NULL OR p_issued_at IS NULL OR p_expires_at IS NULL
    OR p_evidence_as_of > p_issued_at
    OR p_issued_at - p_evidence_as_of > interval '5 minutes'
    OR p_expires_at <= p_issued_at
    OR p_expires_at - p_evidence_as_of > interval '24 hours' THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, 'EMAIL_PREPARATION_INPUT_INVALID'::text;
    RETURN;
  END IF;

  SELECT * INTO v_release
  FROM public.elite_email_execution_releases
  WHERE id = p_release_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, 'EMAIL_RELEASE_NOT_FOUND'::text;
    RETURN;
  END IF;
  IF v_release.organization_id <> p_organization_id
    OR v_release.user_id <> p_user_id
    OR v_release.campaign_id <> p_campaign_id THEN
    RETURN QUERY SELECT false, NULL::uuid, v_release.status, 'EMAIL_RELEASE_BINDING_MISMATCH'::text;
    RETURN;
  END IF;
  IF v_release.expires_at <= now() OR v_release.revoked_at IS NOT NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, v_release.status, 'EMAIL_RELEASE_EXPIRED_OR_REVOKED'::text;
    RETURN;
  END IF;
  IF p_issued_at > now() OR p_expires_at <= now() OR p_expires_at < v_release.expires_at THEN
    RETURN QUERY SELECT false, NULL::uuid, v_release.status, 'EMAIL_PREPARATION_EVIDENCE_NOT_CURRENT'::text;
    RETURN;
  END IF;
  IF v_release.source_release_reference <> p_source_release_reference
    OR v_release.recipient_manifest_sha256 <> p_recipient_manifest_sha256
    OR v_release.suppression_snapshot_sha256 <> p_suppression_snapshot_sha256
    OR v_release.recipient_count <> p_recipient_count THEN
    RETURN QUERY SELECT false, NULL::uuid, v_release.status, 'EMAIL_PREPARATION_RELEASE_EVIDENCE_MISMATCH'::text;
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.evaluate_contact_stop(
      p_user_id,
      p_organization_id,
      p_campaign_id,
      v_release.provider,
      'email'
    ) AS stop
    WHERE stop.allowed = false
  ) THEN
    RETURN QUERY SELECT false, NULL::uuid, v_release.status, 'EMAIL_RELEASE_STOP_CONTROL_ACTIVE'::text;
    RETURN;
  END IF;

  IF v_release.status = 'prepared' THEN
    SELECT * INTO v_attestation
    FROM public.elite_email_release_preparation_attestations AS attestation
    WHERE attestation.release_id = v_release.id
    FOR UPDATE;
    IF FOUND
      AND v_attestation.attestation_fingerprint = p_attestation_fingerprint
      AND v_attestation.source_system = p_source_system
      AND v_attestation.source_release_reference = p_source_release_reference
      AND v_attestation.recipient_manifest_sha256 = p_recipient_manifest_sha256
      AND v_attestation.suppression_snapshot_sha256 = p_suppression_snapshot_sha256
      AND v_attestation.recipient_count = p_recipient_count
      AND v_attestation.signing_key_id = p_signing_key_id
      AND v_attestation.signer_principal_reference = p_signer_principal_reference
      AND v_attestation.public_key_spki_sha256 = p_public_key_spki_sha256
      AND v_attestation.evidence_as_of = p_evidence_as_of
      AND v_attestation.issued_at = p_issued_at
      AND v_attestation.expires_at = p_expires_at THEN
      RETURN QUERY SELECT false, v_release.id, 'prepared'::text, 'EMAIL_RELEASE_ALREADY_PREPARED'::text;
      RETURN;
    END IF;
    RETURN QUERY SELECT false, NULL::uuid, v_release.status, 'EMAIL_PREPARATION_ATTESTATION_COLLISION'::text;
    RETURN;
  END IF;
  IF v_release.status <> 'pending_adapter_provisioning' THEN
    RETURN QUERY SELECT false, NULL::uuid, v_release.status, 'EMAIL_RELEASE_NOT_PENDING_PREPARATION'::text;
    RETURN;
  END IF;

  INSERT INTO public.elite_email_release_preparation_attestations (
    release_id, organization_id, user_id, campaign_id, attestation_fingerprint,
    source_system, source_release_reference, recipient_manifest_sha256,
    suppression_snapshot_sha256, recipient_count, signing_key_id,
    signer_principal_reference, public_key_spki_sha256, evidence_as_of,
    issued_at, expires_at
  ) VALUES (
    v_release.id, p_organization_id, p_user_id, p_campaign_id,
    p_attestation_fingerprint, p_source_system, p_source_release_reference,
    p_recipient_manifest_sha256, p_suppression_snapshot_sha256,
    p_recipient_count, p_signing_key_id, p_signer_principal_reference,
    p_public_key_spki_sha256, p_evidence_as_of, p_issued_at, p_expires_at
  );

  UPDATE public.elite_email_execution_releases
  SET status = 'prepared', prepared_at = now()
  WHERE id = v_release.id AND status = 'pending_adapter_provisioning';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'EMAIL_RELEASE_PREPARATION_RACE_LOST' USING ERRCODE = '40001';
  END IF;
  RETURN QUERY SELECT true, v_release.id, 'prepared'::text, 'EMAIL_RELEASE_PREPARED_NO_PROVIDER_ACTION'::text;
END;
$$;

ALTER TABLE public.elite_email_release_preparation_attestations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.elite_email_release_preparation_attestations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prepare_elite_email_execution_release(
  uuid, uuid, uuid, uuid, text, text, text, text, text, integer, text, text,
  text, timestamptz, timestamptz, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_elite_email_execution_release(
  uuid, uuid, uuid, uuid, text, text, text, text, text, integer, text, text,
  text, timestamptz, timestamptz, timestamptz
) TO service_role;

COMMENT ON TABLE public.elite_email_release_preparation_attestations IS
  'Immutable, no-PII proof that a current source/suppression attestation matched one Elite email release. It is not a send queue or recipient store.';
COMMENT ON FUNCTION public.prepare_elite_email_execution_release(
  uuid, uuid, uuid, uuid, text, text, text, text, text, integer, text, text,
  text, timestamptz, timestamptz, timestamptz
) IS
  'Service-only preparation of one registered Elite email release after a current signed no-PII source/suppression proof matches exactly. It never claims, sends, imports, or invokes a provider.';

COMMIT;
