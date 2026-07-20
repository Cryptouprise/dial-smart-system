BEGIN;

-- Registration is intentionally not preparation. A signed no-PII artifact may
-- be made durable here, but it stays pending_adapter_provisioning until a
-- future tenant adapter independently validates the current recipient source,
-- suppression snapshot, approved copy, sender, provider, and time window.
-- That distinction keeps the existing atomic claim function fail-closed.
CREATE OR REPLACE FUNCTION public.register_elite_email_execution_release(
  p_organization_id uuid,
  p_user_id uuid,
  p_campaign_id uuid,
  p_provider text,
  p_release_fingerprint text,
  p_handoff_proposal_sha256 text,
  p_provider_account_reference text,
  p_sender_domain text,
  p_recipient_manifest_sha256 text,
  p_recipient_count integer,
  p_source_release_reference text,
  p_suppression_snapshot_sha256 text,
  p_copy_approval_reference text,
  p_compliance_approval_reference text,
  p_owner_approval_reference text,
  p_execution_key_id text,
  p_signer_principal_reference text,
  p_idempotency_key text,
  p_expires_at timestamptz
)
RETURNS TABLE (
  registered boolean,
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
BEGIN
  IF p_organization_id IS NULL OR p_user_id IS NULL OR p_campaign_id IS NULL
    OR p_provider NOT IN ('instantly', 'mailgun')
    OR p_release_fingerprint !~ '^sha256:[a-f0-9]{64}$'
    OR p_handoff_proposal_sha256 !~ '^[a-f0-9]{64}$'
    OR p_provider_account_reference !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{7,255}$'
    OR p_sender_domain !~ '^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'
    OR p_recipient_manifest_sha256 !~ '^[a-f0-9]{64}$'
    OR p_recipient_count NOT BETWEEN 1 AND 25
    OR p_source_release_reference !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{7,255}$'
    OR p_suppression_snapshot_sha256 !~ '^[a-f0-9]{64}$'
    OR p_copy_approval_reference !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{7,255}$'
    OR p_compliance_approval_reference !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{7,255}$'
    OR p_owner_approval_reference !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{7,255}$'
    OR p_execution_key_id !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{7,255}$'
    OR p_signer_principal_reference !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{7,255}$'
    OR p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'
    OR p_expires_at IS NULL OR p_expires_at <= now() THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, 'EMAIL_RELEASE_REGISTRATION_INPUT_INVALID'::text;
    RETURN;
  END IF;

  INSERT INTO public.elite_email_execution_releases (
    organization_id,
    user_id,
    campaign_id,
    provider,
    release_fingerprint,
    handoff_proposal_sha256,
    provider_account_reference,
    sender_domain,
    recipient_manifest_sha256,
    recipient_count,
    source_release_reference,
    suppression_snapshot_sha256,
    copy_approval_reference,
    compliance_approval_reference,
    owner_approval_reference,
    execution_key_id,
    signer_principal_reference,
    idempotency_key,
    expires_at
  ) VALUES (
    p_organization_id,
    p_user_id,
    p_campaign_id,
    p_provider,
    p_release_fingerprint,
    p_handoff_proposal_sha256,
    p_provider_account_reference,
    lower(p_sender_domain),
    p_recipient_manifest_sha256,
    p_recipient_count,
    p_source_release_reference,
    p_suppression_snapshot_sha256,
    p_copy_approval_reference,
    p_compliance_approval_reference,
    p_owner_approval_reference,
    p_execution_key_id,
    p_signer_principal_reference,
    p_idempotency_key,
    p_expires_at
  )
  ON CONFLICT DO NOTHING
  RETURNING * INTO v_release;

  IF FOUND THEN
    RETURN QUERY SELECT true, v_release.id, v_release.status, 'EMAIL_RELEASE_REGISTERED_PENDING_ADAPTER_VERIFICATION'::text;
    RETURN;
  END IF;

  SELECT * INTO v_release
  FROM public.elite_email_execution_releases
  WHERE organization_id = p_organization_id
    AND release_fingerprint = p_release_fingerprint
  FOR UPDATE;
  IF FOUND THEN
    IF v_release.user_id = p_user_id
      AND v_release.campaign_id = p_campaign_id
      AND v_release.provider = p_provider
      AND v_release.handoff_proposal_sha256 = p_handoff_proposal_sha256
      AND v_release.provider_account_reference = p_provider_account_reference
      AND v_release.sender_domain = lower(p_sender_domain)
      AND v_release.recipient_manifest_sha256 = p_recipient_manifest_sha256
      AND v_release.recipient_count = p_recipient_count
      AND v_release.source_release_reference = p_source_release_reference
      AND v_release.suppression_snapshot_sha256 = p_suppression_snapshot_sha256
      AND v_release.copy_approval_reference = p_copy_approval_reference
      AND v_release.compliance_approval_reference = p_compliance_approval_reference
      AND v_release.owner_approval_reference = p_owner_approval_reference
      AND v_release.execution_key_id = p_execution_key_id
      AND v_release.signer_principal_reference = p_signer_principal_reference
      AND v_release.idempotency_key = p_idempotency_key
      AND v_release.expires_at = p_expires_at THEN
      RETURN QUERY SELECT false, v_release.id, v_release.status, 'EMAIL_RELEASE_ALREADY_REGISTERED'::text;
      RETURN;
    END IF;
    RETURN QUERY SELECT false, NULL::uuid, v_release.status, 'EMAIL_RELEASE_FINGERPRINT_COLLISION'::text;
    RETURN;
  END IF;

  SELECT * INTO v_release
  FROM public.elite_email_execution_releases
  WHERE organization_id = p_organization_id
    AND idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, v_release.status, 'EMAIL_RELEASE_IDEMPOTENCY_COLLISION'::text;
    RETURN;
  END IF;

  RAISE EXCEPTION 'EMAIL_RELEASE_REGISTRATION_CONFLICT_UNRESOLVED' USING ERRCODE = '40001';
END;
$$;

REVOKE ALL ON FUNCTION public.register_elite_email_execution_release(
  uuid, uuid, uuid, text, text, text, text, text, text, integer, text, text,
  text, text, text, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_elite_email_execution_release(
  uuid, uuid, uuid, text, text, text, text, text, text, integer, text, text,
  text, text, text, text, text, text, timestamptz
) TO service_role;

COMMENT ON FUNCTION public.register_elite_email_execution_release(
  uuid, uuid, uuid, text, text, text, text, text, text, integer, text, text,
  text, text, text, text, text, text, timestamptz
) IS
  'Service-only registration of one verified Elite email release artifact. It never prepares, claims, sends, imports, or contacts a provider.';

COMMIT;
