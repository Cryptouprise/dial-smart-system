BEGIN;

-- Mailgun webhook replay tokens are never retained in the clear. This new
-- column lets the server-side receipt recorder reject a reused Mailgun token
-- even if an attacker were to vary another event field. Existing rows predate
-- this intake and intentionally remain NULL.
ALTER TABLE public.elite_email_provider_event_receipts
  ADD COLUMN IF NOT EXISTS provider_token_fingerprint text
  CHECK (
    provider_token_fingerprint IS NULL
    OR provider_token_fingerprint ~ '^hmac-sha256:[a-f0-9]{64}$'
  );

CREATE UNIQUE INDEX IF NOT EXISTS elite_email_provider_event_receipts_provider_token_key
  ON public.elite_email_provider_event_receipts (provider, provider_token_fingerprint)
  WHERE provider_token_fingerprint IS NOT NULL;

CREATE OR REPLACE FUNCTION public.record_elite_email_mailgun_event_receipt(
  p_release_id uuid,
  p_organization_id uuid,
  p_user_id uuid,
  p_campaign_id uuid,
  p_provider_account_reference text,
  p_sender_domain text,
  p_receipt_fingerprint text,
  p_recipient_fingerprint text,
  p_provider_token_fingerprint text,
  p_event_kind text,
  p_occurred_at timestamptz,
  p_correlation_status text,
  p_operator_attention_required boolean,
  p_suppression_review_required boolean,
  p_human_review_required boolean
)
RETURNS TABLE (
  recorded boolean,
  result_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_release public.elite_email_execution_releases%ROWTYPE;
  v_receipt_id uuid;
BEGIN
  IF p_release_id IS NULL OR p_organization_id IS NULL OR p_user_id IS NULL
    OR p_campaign_id IS NULL
    OR p_provider_account_reference !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{7,255}$'
    OR p_sender_domain !~ '^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'
    OR p_receipt_fingerprint !~ '^hmac-sha256:[a-f0-9]{64}$'
    OR (p_recipient_fingerprint IS NOT NULL AND p_recipient_fingerprint !~ '^hmac-sha256:[a-f0-9]{64}$')
    OR p_provider_token_fingerprint !~ '^hmac-sha256:[a-f0-9]{64}$'
    OR p_event_kind NOT IN (
      'email_accepted', 'email_delivered', 'email_opened', 'link_clicked',
      'permanent_bounce', 'temporary_delivery_failure', 'unsubscribe',
      'spam_complaint'
    )
    OR p_occurred_at IS NULL
    OR p_correlation_status NOT IN ('recipient_hmac_bound', 'recipient_redacted_or_absent')
    OR p_operator_attention_required IS NULL
    OR p_suppression_review_required IS NULL
    OR p_human_review_required IS NULL THEN
    RETURN QUERY SELECT false, 'EMAIL_EVENT_INPUT_INVALID'::text;
    RETURN;
  END IF;

  SELECT * INTO v_release
  FROM public.elite_email_execution_releases
  WHERE id = p_release_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'EMAIL_EVENT_RELEASE_NOT_FOUND'::text;
    RETURN;
  END IF;
  IF v_release.organization_id <> p_organization_id
    OR v_release.user_id <> p_user_id
    OR v_release.campaign_id <> p_campaign_id
    OR v_release.provider <> 'mailgun'
    OR v_release.provider_account_reference <> p_provider_account_reference
    OR v_release.sender_domain <> lower(p_sender_domain) THEN
    RETURN QUERY SELECT false, 'EMAIL_EVENT_RELEASE_BINDING_MISMATCH'::text;
    RETURN;
  END IF;
  IF v_release.status NOT IN (
    'claimed', 'provider_accepted', 'reconciliation_required', 'completed', 'held', 'revoked'
  ) THEN
    RETURN QUERY SELECT false, 'EMAIL_EVENT_RELEASE_NOT_EXECUTING'::text;
    RETURN;
  END IF;

  INSERT INTO public.elite_email_provider_event_receipts (
    release_id,
    organization_id,
    user_id,
    campaign_id,
    provider,
    receipt_fingerprint,
    recipient_fingerprint,
    provider_token_fingerprint,
    event_kind,
    occurred_at,
    correlation_status,
    operator_attention_required,
    suppression_review_required,
    human_review_required
  ) VALUES (
    p_release_id,
    p_organization_id,
    p_user_id,
    p_campaign_id,
    'mailgun',
    p_receipt_fingerprint,
    p_recipient_fingerprint,
    p_provider_token_fingerprint,
    p_event_kind,
    p_occurred_at,
    p_correlation_status,
    p_operator_attention_required,
    p_suppression_review_required,
    p_human_review_required
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_receipt_id;

  IF v_receipt_id IS NULL THEN
    RETURN QUERY SELECT false, 'EMAIL_EVENT_DUPLICATE_OR_REPLAY'::text;
    RETURN;
  END IF;
  RETURN QUERY SELECT true, 'EMAIL_EVENT_RECORDED'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.record_elite_email_mailgun_event_receipt(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, timestamptz,
  text, boolean, boolean, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_elite_email_mailgun_event_receipt(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, timestamptz,
  text, boolean, boolean, boolean
) TO service_role;

COMMENT ON FUNCTION public.record_elite_email_mailgun_event_receipt(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, timestamptz,
  text, boolean, boolean, boolean
) IS
  'Service-only, release-bound Mailgun event receipt recorder. It accepts only HMAC-redacted identifiers after the Edge handler verified Mailgun HMAC, binding, skew, and replay token.';

COMMIT;
