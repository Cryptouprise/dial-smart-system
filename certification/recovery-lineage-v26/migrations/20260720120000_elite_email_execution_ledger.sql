BEGIN;

-- This ledger is the database-owned, default-deny foundation for the native
-- Elite Solar email adapter. It stores only tenant/campaign bindings, digests,
-- opaque external references, and HMAC-derived provider-event fingerprints.
-- Raw email addresses, message bodies, provider keys, mailboxes, and recipient
-- rows are intentionally absent. A missing prepared row always denies a future
-- provider request.

-- Reuse the same global/tenant/campaign/provider stop boundary for email that
-- already protects voice and SMS. The change only expands the fixed channel
-- vocabulary; it does not create a stop or change an existing stop's scope.
ALTER TABLE public.contact_stop_controls
  DROP CONSTRAINT IF EXISTS contact_stop_controls_channel_check;
ALTER TABLE public.contact_stop_controls
  ADD CONSTRAINT contact_stop_controls_channel_check
  CHECK (channel IN ('all', 'voice', 'sms', 'email'));

CREATE TABLE IF NOT EXISTS public.elite_email_execution_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (provider IN ('instantly', 'mailgun')),
  release_fingerprint text NOT NULL CHECK (release_fingerprint ~ '^sha256:[a-f0-9]{64}$'),
  handoff_proposal_sha256 text NOT NULL CHECK (handoff_proposal_sha256 ~ '^[a-f0-9]{64}$'),
  provider_account_reference text NOT NULL CHECK (provider_account_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{7,255}$'),
  sender_domain text NOT NULL CHECK (sender_domain ~ '^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'),
  recipient_manifest_sha256 text NOT NULL CHECK (recipient_manifest_sha256 ~ '^[a-f0-9]{64}$'),
  recipient_count integer NOT NULL CHECK (recipient_count BETWEEN 1 AND 25),
  source_release_reference text NOT NULL CHECK (source_release_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{7,255}$'),
  suppression_snapshot_sha256 text NOT NULL CHECK (suppression_snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  copy_approval_reference text NOT NULL CHECK (copy_approval_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{7,255}$'),
  compliance_approval_reference text NOT NULL CHECK (compliance_approval_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{7,255}$'),
  owner_approval_reference text NOT NULL CHECK (owner_approval_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{7,255}$'),
  execution_key_id text NOT NULL CHECK (execution_key_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{7,255}$'),
  signer_principal_reference text NOT NULL CHECK (signer_principal_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{7,255}$'),
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'),
  status text NOT NULL DEFAULT 'pending_adapter_provisioning'
    CHECK (status IN (
      'pending_adapter_provisioning',
      'prepared',
      'claimed',
      'provider_accepted',
      'reconciliation_required',
      'completed',
      'held',
      'revoked'
    )),
  prepared_at timestamptz,
  claimed_at timestamptz,
  provider_accepted_at timestamptz,
  reconciled_at timestamptz,
  held_at timestamptz,
  revoked_at timestamptz,
  hold_reason_code text CHECK (hold_reason_code IS NULL OR hold_reason_code ~ '^[A-Z][A-Z0-9_]{2,79}$'),
  provider_acceptance_fingerprint text CHECK (provider_acceptance_fingerprint IS NULL OR provider_acceptance_fingerprint ~ '^hmac-sha256:[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT elite_email_execution_releases_expiry_after_creation CHECK (expires_at > created_at),
  CONSTRAINT elite_email_execution_releases_member_fkey
    FOREIGN KEY (organization_id, user_id)
    REFERENCES public.organization_users(organization_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT elite_email_execution_releases_org_idempotency_key
    UNIQUE (organization_id, idempotency_key),
  CONSTRAINT elite_email_execution_releases_org_fingerprint_key
    UNIQUE (organization_id, release_fingerprint)
);

CREATE INDEX IF NOT EXISTS elite_email_execution_releases_campaign_status_idx
  ON public.elite_email_execution_releases (organization_id, campaign_id, status, expires_at);

CREATE TABLE IF NOT EXISTS public.elite_email_provider_event_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id uuid NOT NULL REFERENCES public.elite_email_execution_releases(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (provider IN ('instantly', 'mailgun')),
  receipt_fingerprint text NOT NULL CHECK (receipt_fingerprint ~ '^hmac-sha256:[a-f0-9]{64}$'),
  recipient_fingerprint text CHECK (recipient_fingerprint IS NULL OR recipient_fingerprint ~ '^hmac-sha256:[a-f0-9]{64}$'),
  event_kind text NOT NULL CHECK (event_kind IN (
    'email_accepted',
    'email_delivered',
    'email_opened',
    'link_clicked',
    'reply_received',
    'auto_reply_received',
    'permanent_bounce',
    'temporary_delivery_failure',
    'unsubscribe',
    'spam_complaint',
    'provider_error',
    'campaign_completed',
    'lead_neutral',
    'lead_interested',
    'lead_not_interested',
    'meeting_booked',
    'meeting_completed',
    'lead_closed',
    'out_of_office',
    'wrong_person'
  )),
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  correlation_status text NOT NULL CHECK (correlation_status IN ('recipient_hmac_bound', 'recipient_redacted_or_absent')),
  operator_attention_required boolean NOT NULL,
  suppression_review_required boolean NOT NULL,
  human_review_required boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT elite_email_provider_event_receipts_member_fkey
    FOREIGN KEY (organization_id, user_id)
    REFERENCES public.organization_users(organization_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT elite_email_provider_event_receipts_deduplicated
    UNIQUE (provider, receipt_fingerprint)
);

CREATE INDEX IF NOT EXISTS elite_email_provider_event_receipts_release_idx
  ON public.elite_email_provider_event_receipts (release_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS elite_email_provider_event_receipts_attention_idx
  ON public.elite_email_provider_event_receipts (organization_id, campaign_id, occurred_at DESC)
  WHERE operator_attention_required OR suppression_review_required OR human_review_required;

CREATE OR REPLACE FUNCTION public.enforce_elite_email_execution_release_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  immutable_changed boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ELITE_EMAIL_EXECUTION_RELEASE_DELETE_FORBIDDEN';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending_adapter_provisioning'
      OR NEW.prepared_at IS NOT NULL
      OR NEW.claimed_at IS NOT NULL
      OR NEW.provider_accepted_at IS NOT NULL
      OR NEW.reconciled_at IS NOT NULL
      OR NEW.held_at IS NOT NULL
      OR NEW.revoked_at IS NOT NULL
      OR NEW.hold_reason_code IS NOT NULL
      OR NEW.provider_acceptance_fingerprint IS NOT NULL THEN
      RAISE EXCEPTION 'ELITE_EMAIL_EXECUTION_RELEASE_INITIAL_STATE_INVALID';
    END IF;
    RETURN NEW;
  END IF;

  immutable_changed :=
    OLD.organization_id IS DISTINCT FROM NEW.organization_id
    OR OLD.user_id IS DISTINCT FROM NEW.user_id
    OR OLD.campaign_id IS DISTINCT FROM NEW.campaign_id
    OR OLD.provider IS DISTINCT FROM NEW.provider
    OR OLD.release_fingerprint IS DISTINCT FROM NEW.release_fingerprint
    OR OLD.handoff_proposal_sha256 IS DISTINCT FROM NEW.handoff_proposal_sha256
    OR OLD.provider_account_reference IS DISTINCT FROM NEW.provider_account_reference
    OR OLD.sender_domain IS DISTINCT FROM NEW.sender_domain
    OR OLD.recipient_manifest_sha256 IS DISTINCT FROM NEW.recipient_manifest_sha256
    OR OLD.recipient_count IS DISTINCT FROM NEW.recipient_count
    OR OLD.source_release_reference IS DISTINCT FROM NEW.source_release_reference
    OR OLD.suppression_snapshot_sha256 IS DISTINCT FROM NEW.suppression_snapshot_sha256
    OR OLD.copy_approval_reference IS DISTINCT FROM NEW.copy_approval_reference
    OR OLD.compliance_approval_reference IS DISTINCT FROM NEW.compliance_approval_reference
    OR OLD.owner_approval_reference IS DISTINCT FROM NEW.owner_approval_reference
    OR OLD.execution_key_id IS DISTINCT FROM NEW.execution_key_id
    OR OLD.signer_principal_reference IS DISTINCT FROM NEW.signer_principal_reference
    OR OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key
    OR OLD.expires_at IS DISTINCT FROM NEW.expires_at
    OR OLD.created_at IS DISTINCT FROM NEW.created_at;
  IF immutable_changed THEN
    RAISE EXCEPTION 'ELITE_EMAIL_EXECUTION_RELEASE_IMMUTABLE';
  END IF;

  IF OLD.status = NEW.status THEN
    RAISE EXCEPTION 'ELITE_EMAIL_EXECUTION_RELEASE_NOOP_UPDATE_FORBIDDEN';
  END IF;

  IF OLD.status = 'pending_adapter_provisioning'
    AND NEW.status IN ('prepared', 'held', 'revoked')
    AND (
      (NEW.status = 'prepared'
        AND NEW.prepared_at IS NOT NULL
        AND NEW.claimed_at IS NULL
        AND NEW.provider_accepted_at IS NULL
        AND NEW.reconciled_at IS NULL
        AND NEW.held_at IS NULL
        AND NEW.revoked_at IS NULL
        AND NEW.hold_reason_code IS NULL
        AND NEW.provider_acceptance_fingerprint IS NULL)
      OR (NEW.status = 'held'
        AND NEW.prepared_at IS NULL
        AND NEW.claimed_at IS NULL
        AND NEW.provider_accepted_at IS NULL
        AND NEW.reconciled_at IS NULL
        AND NEW.held_at IS NOT NULL
        AND NEW.revoked_at IS NULL
        AND NEW.hold_reason_code IS NOT NULL
        AND NEW.provider_acceptance_fingerprint IS NULL)
      OR (NEW.status = 'revoked'
        AND NEW.prepared_at IS NULL
        AND NEW.claimed_at IS NULL
        AND NEW.provider_accepted_at IS NULL
        AND NEW.reconciled_at IS NULL
        AND NEW.held_at IS NULL
        AND NEW.revoked_at IS NOT NULL
        AND NEW.hold_reason_code IS NULL
        AND NEW.provider_acceptance_fingerprint IS NULL)
    ) THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'prepared'
    AND NEW.status IN ('claimed', 'held', 'revoked')
    AND (
      (NEW.status = 'claimed'
        AND NEW.prepared_at = OLD.prepared_at
        AND NEW.claimed_at IS NOT NULL
        AND NEW.provider_accepted_at IS NULL
        AND NEW.reconciled_at IS NULL
        AND NEW.held_at IS NULL
        AND NEW.revoked_at IS NULL
        AND NEW.hold_reason_code IS NULL
        AND NEW.provider_acceptance_fingerprint IS NULL)
      OR (NEW.status = 'held'
        AND NEW.prepared_at = OLD.prepared_at
        AND NEW.claimed_at IS NULL
        AND NEW.provider_accepted_at IS NULL
        AND NEW.reconciled_at IS NULL
        AND NEW.held_at IS NOT NULL
        AND NEW.revoked_at IS NULL
        AND NEW.hold_reason_code IS NOT NULL
        AND NEW.provider_acceptance_fingerprint IS NULL)
      OR (NEW.status = 'revoked'
        AND NEW.prepared_at = OLD.prepared_at
        AND NEW.claimed_at IS NULL
        AND NEW.provider_accepted_at IS NULL
        AND NEW.reconciled_at IS NULL
        AND NEW.held_at IS NULL
        AND NEW.revoked_at IS NOT NULL
        AND NEW.hold_reason_code IS NULL
        AND NEW.provider_acceptance_fingerprint IS NULL)
    ) THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'claimed'
    AND NEW.status IN ('provider_accepted', 'reconciliation_required', 'held')
    AND (
      (NEW.status = 'provider_accepted'
        AND NEW.prepared_at = OLD.prepared_at
        AND NEW.claimed_at = OLD.claimed_at
        AND NEW.provider_accepted_at IS NOT NULL
        AND NEW.reconciled_at IS NULL
        AND NEW.held_at IS NULL
        AND NEW.revoked_at IS NULL
        AND NEW.hold_reason_code IS NULL
        AND NEW.provider_acceptance_fingerprint IS NOT NULL)
      OR (NEW.status IN ('reconciliation_required', 'held')
        AND NEW.prepared_at = OLD.prepared_at
        AND NEW.claimed_at = OLD.claimed_at
        AND NEW.provider_accepted_at IS NULL
        AND NEW.reconciled_at IS NULL
        AND NEW.held_at IS NOT NULL
        AND NEW.revoked_at IS NULL
        AND NEW.hold_reason_code IS NOT NULL
        AND NEW.provider_acceptance_fingerprint IS NULL)
    ) THEN
    RETURN NEW;
  END IF;
  IF OLD.status IN ('provider_accepted', 'reconciliation_required')
    AND NEW.status IN ('completed', 'held')
    AND (
      (NEW.status = 'completed'
        AND NEW.prepared_at = OLD.prepared_at
        AND NEW.claimed_at = OLD.claimed_at
        AND NEW.provider_accepted_at IS NOT NULL
        AND NEW.reconciled_at IS NOT NULL
        AND NEW.held_at IS NULL
        AND NEW.revoked_at IS NULL
        AND NEW.hold_reason_code IS NULL
        AND NEW.provider_acceptance_fingerprint = OLD.provider_acceptance_fingerprint)
      OR (NEW.status = 'held'
        AND NEW.prepared_at = OLD.prepared_at
        AND NEW.claimed_at = OLD.claimed_at
        AND NEW.provider_accepted_at IS NOT DISTINCT FROM OLD.provider_accepted_at
        AND NEW.reconciled_at IS NULL
        AND NEW.held_at IS NOT NULL
        AND NEW.revoked_at IS NULL
        AND NEW.hold_reason_code IS NOT NULL
        AND NEW.provider_acceptance_fingerprint IS NOT DISTINCT FROM OLD.provider_acceptance_fingerprint)
    ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'ELITE_EMAIL_EXECUTION_RELEASE_STATUS_TRANSITION_INVALID';
END;
$$;

DROP TRIGGER IF EXISTS elite_email_execution_releases_immutable
  ON public.elite_email_execution_releases;
CREATE TRIGGER elite_email_execution_releases_immutable
BEFORE INSERT OR UPDATE OR DELETE ON public.elite_email_execution_releases
FOR EACH ROW EXECUTE FUNCTION public.enforce_elite_email_execution_release_immutable();

CREATE OR REPLACE FUNCTION public.enforce_elite_email_provider_event_receipt()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_release public.elite_email_execution_releases%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'ELITE_EMAIL_PROVIDER_EVENT_RECEIPT_IMMUTABLE';
  END IF;

  SELECT release.* INTO v_release
  FROM public.elite_email_execution_releases
  WHERE id = NEW.release_id;
  IF NOT FOUND
    OR v_release.organization_id <> NEW.organization_id
    OR v_release.user_id <> NEW.user_id
    OR v_release.campaign_id <> NEW.campaign_id
    OR v_release.provider <> NEW.provider THEN
    RAISE EXCEPTION 'ELITE_EMAIL_PROVIDER_EVENT_RECEIPT_BINDING_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS elite_email_provider_event_receipts_immutable
  ON public.elite_email_provider_event_receipts;
CREATE TRIGGER elite_email_provider_event_receipts_immutable
BEFORE INSERT OR UPDATE OR DELETE ON public.elite_email_provider_event_receipts
FOR EACH ROW EXECUTE FUNCTION public.enforce_elite_email_provider_event_receipt();

CREATE OR REPLACE FUNCTION public.claim_elite_email_execution_release(
  p_release_id uuid,
  p_organization_id uuid,
  p_user_id uuid,
  p_campaign_id uuid,
  p_provider text,
  p_release_fingerprint text,
  p_idempotency_key text
)
RETURNS TABLE (
  claimed boolean,
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
  IF p_release_id IS NULL OR p_organization_id IS NULL OR p_user_id IS NULL
    OR p_campaign_id IS NULL OR p_provider NOT IN ('instantly', 'mailgun')
    OR p_release_fingerprint IS NULL OR p_idempotency_key IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, 'EMAIL_RELEASE_IDENTITY_INVALID'::text;
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
    OR v_release.campaign_id <> p_campaign_id
    OR v_release.provider <> p_provider
    OR v_release.release_fingerprint <> p_release_fingerprint
    OR v_release.idempotency_key <> p_idempotency_key THEN
    RETURN QUERY SELECT false, NULL::uuid, v_release.status, 'EMAIL_RELEASE_BINDING_MISMATCH'::text;
    RETURN;
  END IF;
  IF v_release.expires_at <= now() OR v_release.revoked_at IS NOT NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, v_release.status, 'EMAIL_RELEASE_EXPIRED_OR_REVOKED'::text;
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.evaluate_contact_stop(
      p_user_id,
      p_organization_id,
      p_campaign_id,
      p_provider,
      'email'
    ) AS stop
    WHERE stop.allowed = false
  ) THEN
    RETURN QUERY SELECT false, NULL::uuid, v_release.status, 'EMAIL_RELEASE_STOP_CONTROL_ACTIVE'::text;
    RETURN;
  END IF;
  IF v_release.status = 'claimed' THEN
    RETURN QUERY SELECT false, v_release.id, v_release.status, 'EMAIL_RELEASE_ALREADY_CLAIMED'::text;
    RETURN;
  END IF;
  IF v_release.status <> 'prepared' THEN
    RETURN QUERY SELECT false, NULL::uuid, v_release.status, 'EMAIL_RELEASE_NOT_PREPARED'::text;
    RETURN;
  END IF;

  UPDATE public.elite_email_execution_releases
  SET status = 'claimed', claimed_at = now()
  WHERE id = v_release.id AND status = 'prepared';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'EMAIL_RELEASE_CLAIM_RACE_LOST' USING ERRCODE = '40001';
  END IF;
  RETURN QUERY SELECT true, v_release.id, 'claimed'::text, 'EMAIL_RELEASE_CLAIMED'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_elite_email_execution_release_status(
  p_campaign_id uuid
)
RETURNS TABLE (
  release_state text,
  provider text,
  release_expires_at timestamptz,
  recipient_count integer,
  provider_receipt_count bigint,
  suppression_review_receipt_count bigint,
  human_review_receipt_count bigint,
  final_adapter_evaluation_required boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_release public.elite_email_execution_releases%ROWTYPE;
BEGIN
  IF p_campaign_id IS NULL OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'ELITE_EMAIL_RELEASE_STATUS_NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_release
  FROM public.elite_email_execution_releases AS release
  JOIN public.organization_users AS membership
    ON membership.organization_id = release.organization_id
   AND membership.user_id = auth.uid()
  WHERE release.campaign_id = p_campaign_id
  ORDER BY release.created_at DESC, release.id DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'no_release'::text, NULL::text, NULL::timestamptz, 0,
      0::bigint, 0::bigint, 0::bigint, true;
    RETURN;
  END IF;
  RETURN QUERY
  SELECT
    CASE WHEN v_release.expires_at <= now() AND v_release.status NOT IN ('completed', 'held', 'revoked')
      THEN 'expired' ELSE v_release.status END,
    v_release.provider,
    v_release.expires_at,
    v_release.recipient_count,
    count(receipt.id),
    count(receipt.id) FILTER (WHERE receipt.suppression_review_required),
    count(receipt.id) FILTER (WHERE receipt.human_review_required),
    true
  FROM public.elite_email_provider_event_receipts AS receipt
  WHERE receipt.release_id = v_release.id
  GROUP BY v_release.status, v_release.expires_at, v_release.provider, v_release.recipient_count;
  IF NOT FOUND THEN
    RETURN QUERY SELECT
      CASE WHEN v_release.expires_at <= now() AND v_release.status NOT IN ('completed', 'held', 'revoked')
        THEN 'expired' ELSE v_release.status END,
      v_release.provider,
      v_release.expires_at,
      v_release.recipient_count,
      0::bigint, 0::bigint, 0::bigint, true;
  END IF;
END;
$$;

ALTER TABLE public.elite_email_execution_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.elite_email_provider_event_receipts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.elite_email_execution_releases FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.elite_email_provider_event_receipts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_elite_email_execution_release(uuid, uuid, uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_elite_email_execution_release(uuid, uuid, uuid, uuid, text, text, text)
  TO service_role;
REVOKE ALL ON FUNCTION public.get_elite_email_execution_release_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_elite_email_execution_release_status(uuid) TO authenticated, service_role;

COMMENT ON TABLE public.elite_email_execution_releases IS
  'Default-deny, tenant-bound Elite email release ledger. It has no recipient data and a release must be prepared and claimed exactly once before a future provider adapter can consider a provider request.';
COMMENT ON TABLE public.elite_email_provider_event_receipts IS
  'Append-only, tenant-bound, HMAC-redacted Elite email provider receipts. Raw recipient addresses and provider payloads are forbidden.';
COMMENT ON FUNCTION public.claim_elite_email_execution_release(uuid, uuid, uuid, uuid, text, text, text) IS
  'Service-only atomic single-use claim for a prepared Elite email release. A non-claim result is a hard no-provider-request outcome.';
COMMENT ON FUNCTION public.get_elite_email_execution_release_status(uuid) IS
  'Tenant-scoped summary-only Elite email release status. It never authorizes a provider request.';

COMMIT;
