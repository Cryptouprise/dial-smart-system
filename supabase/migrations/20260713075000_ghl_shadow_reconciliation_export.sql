BEGIN;

CREATE OR REPLACE FUNCTION public.ghl_shadow_reason_codes_are_export_safe(
  reasons text[]
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT reasons IS NOT NULL
    AND cardinality(reasons) BETWEEN 1 AND 64
    AND array_position(reasons, NULL) IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(reasons) AS candidate(reason)
      WHERE NOT candidate.reason = ANY(ARRAY[
        'AI_VOICE_CONSENT_AMBIGUOUS',
        'AI_VOICE_CONSENT_NOT_GRANTED',
        'BINDING_AUTHORITY_ESCALATION',
        'BINDING_CHANGED_BEFORE_COMMIT',
        'BINDING_DISABLED',
        'BINDING_NOT_SHADOW_ONLY',
        'CALLING_STATE_NOT_APPROVED',
        'CONSENT_CAPTURED_IN_FUTURE',
        'CONSENT_DISCLOSURE_HASH_MISMATCH',
        'CONSENT_EVIDENCE_EXPIRED',
        'CONSENT_REVOCATION_AMBIGUOUS',
        'CONSENT_REVOKED',
        'CONSENT_SELLER_MISMATCH',
        'CURRENT_CONTACT_PHONE_UNKNOWN',
        'CURRENT_PHONE_DOES_NOT_MATCH_CONSENT_PHONE',
        'CUSTOM_FIELD_MAPPING_HASH_MISMATCH',
        'DND_ORDERING_EVIDENCE_UNSAFE',
        'DUPLICATE_CUSTOM_FIELD_ENTRY',
        'DUPLICATE_CUSTOM_FIELD_ID_MAPPING',
        'DUPLICATE_JSON_KEY',
        'EXTERNAL_SUPPRESSION_EVIDENCE_REQUIRED',
        'GHL_CALL_DND_ACTIVE',
        'GHL_CALL_DND_AMBIGUOUS',
        'GHL_GLOBAL_DND_ACTIVE',
        'GHL_GLOBAL_DND_AMBIGUOUS',
        'INEXACT_CUSTOM_FIELD_MAPPING',
        'INVALID_BINDING_ID',
        'INVALID_CONSENT_ARTIFACT_ID',
        'INVALID_CONSENT_CAPTURED_AT',
        'INVALID_CONSENT_CONSUMER_NAME',
        'INVALID_CONSENT_DISCLOSURE_TEXT',
        'INVALID_CONSENT_LEAD_SOURCE',
        'INVALID_CONSENT_PHONE',
        'INVALID_CONSENT_SELLER',
        'INVALID_CONSENT_TEXT_VERSION',
        'INVALID_CUSTOM_FIELD_ENTRY',
        'INVALID_CUSTOM_FIELD_ID',
        'INVALID_CUSTOM_FIELD_MAPPING',
        'INVALID_IDENTIFIER_KEY_VERSION',
        'INVALID_JSON',
        'INVALID_JSON_NUMBER',
        'INVALID_JSON_STRING',
        'INVALID_JSON_TRAILING_DATA',
        'INVALID_LOCATION_ID',
        'INVALID_MAPPING_HASH',
        'INVALID_MAPPING_VERSION',
        'INVALID_OR_MISSING_LOCATION_ID',
        'INVALID_ORGANIZATION_ID',
        'INVALID_POLICY_HASH',
        'INVALID_POLICY_SNAPSHOT',
        'INVALID_SOURCE_FORM_VERSION',
        'INVALID_UTF8_BODY',
        'INVALID_WEBHOOK_ID',
        'JSON_ARRAY_LIMIT',
        'JSON_DEPTH_LIMIT',
        'JSON_NODE_LIMIT',
        'JSON_OBJECT_KEY_LIMIT',
        'JSON_OBJECT_REQUIRED',
        'JSON_STRING_LIMIT',
        'LOCATION_BINDING_MISMATCH',
        'MISSING_AI_VOICE_CALLS_AUTHORIZED',
        'MISSING_CALLING_STATE',
        'MISSING_CONSENT_ARTIFACT_ID',
        'MISSING_CONSENT_CAPTURED_AT',
        'MISSING_CONSENT_CONSUMER_NAME',
        'MISSING_CONSENT_DISCLOSURE_TEXT',
        'MISSING_CONSENT_LEAD_SOURCE',
        'MISSING_CONSENT_PHONE',
        'MISSING_CONSENT_REVOKED_AT',
        'MISSING_CONSENT_SELLER',
        'MISSING_CONSENT_TEXT_VERSION',
        'MISSING_CONTACT_ID',
        'MISSING_CUSTOM_FIELDS',
        'MISSING_NOT_CONDITION_OF_PURCHASE_DISCLOSURE',
        'MISSING_PROPERTY_STATE',
        'MISSING_SIGNATURE_EVIDENCE',
        'MISSING_SOURCE_FORM_VERSION',
        'MISSING_TELEMARKETING_CALLS_AUTHORIZED',
        'MISSING_WEBHOOK_ID',
        'NO_ENABLED_LOCATION_BINDING',
        'NOT_CONDITION_DISCLOSURE_AMBIGUOUS',
        'NOT_CONDITION_DISCLOSURE_NOT_CONFIRMED',
        'POLICY_HASH_MISMATCH',
        'PROPERTY_STATE_NOT_APPROVED',
        'SOURCE_TIMESTAMP_IN_FUTURE',
        'SOURCE_TIMESTAMP_INVALID',
        'SOURCE_TIMESTAMP_MISSING',
        'SOURCE_TIMESTAMP_STALE',
        'SUPPRESSION_STATE_UNKNOWN_FOR_EVENT',
        'TELEMARKETING_CONSENT_AMBIGUOUS',
        'TELEMARKETING_CONSENT_NOT_GRANTED',
        'UNAPPROVED_CONSENT_ARTIFACT',
        'UNAPPROVED_CONSENT_LEAD_SOURCE',
        'UNAPPROVED_CONSENT_TEXT_VERSION',
        'UNAPPROVED_SOURCE_FORM_VERSION',
        'UNKNOWN_CALLING_STATE',
        'UNKNOWN_PROPERTY_STATE',
        'UNRESOLVED_POLICY',
        'UNSUPPORTED_EVENT_TYPE',
        'WEBHOOK_ID_PAYLOAD_COLLISION',
        'WRONG_CAMPAIGN_BINDING'
      ]::text[])
    );
$$;

-- Every successfully acknowledged signed delivery gets a separate immutable
-- attempt row. The original receipt remains deduplicated by installation and
-- raw-payload digest, while this ledger preserves exact retry/collision counts.
CREATE TABLE public.ghl_shadow_delivery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL,
  binding_id uuid,
  organization_id uuid,
  installation_scope_sha256 text NOT NULL,
  payload_sha256 text NOT NULL,
  webhook_id_sha256 text,
  commit_status text NOT NULL,
  decision text NOT NULL,
  reason_codes text[] NOT NULL,
  contact_authorized boolean GENERATED ALWAYS AS (false) STORED,
  launch_authorized boolean GENERATED ALWAYS AS (false) STORED,
  provider_invocation_authorized boolean GENERATED ALWAYS AS (false) STORED,
  queue_mutation_authorized boolean GENERATED ALWAYS AS (false) STORED,
  crm_mutation_authorized boolean GENERATED ALWAYS AS (false) STORED,
  external_effects_created boolean GENERATED ALWAYS AS (false) STORED,
  external_trust_required boolean GENERATED ALWAYS AS (true) STORED,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ghl_shadow_delivery_attempt_hashes CHECK (
    installation_scope_sha256 ~ '^[a-f0-9]{64}$'
    AND payload_sha256 ~ '^[a-f0-9]{64}$'
    AND (webhook_id_sha256 IS NULL OR webhook_id_sha256 ~ '^[a-f0-9]{64}$')
  ),
  CONSTRAINT ghl_shadow_delivery_attempt_status CHECK (
    commit_status IN ('committed', 'duplicate', 'webhook_id_collision')
  ),
  CONSTRAINT ghl_shadow_delivery_attempt_decision CHECK (
    decision IN ('held', 'quarantined')
  ),
  CONSTRAINT ghl_shadow_delivery_attempt_reasons CHECK (
    cardinality(reason_codes) BETWEEN 1 AND 64
    AND array_position(reason_codes, NULL) IS NULL
  )
);

CREATE INDEX ghl_shadow_delivery_attempt_org_time
  ON public.ghl_shadow_delivery_attempts (organization_id, attempted_at, id);
CREATE INDEX ghl_shadow_delivery_attempt_receipt
  ON public.ghl_shadow_delivery_attempts (receipt_id, attempted_at, id);

ALTER TABLE public.ghl_shadow_delivery_attempts ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER ghl_shadow_delivery_attempt_append_only
BEFORE UPDATE OR DELETE ON public.ghl_shadow_delivery_attempts
FOR EACH ROW EXECUTE FUNCTION public.protect_ghl_shadow_append_only();

-- Preserve the already-reviewed writer as an inaccessible core and keep the
-- public RPC signature stable for the Edge function. The wrapper records one
-- attempt only after the core has returned a durable receipt classification;
-- any attempt-ledger failure rolls the whole transaction back and therefore
-- cannot receive the Edge function's 204 acknowledgement.
ALTER FUNCTION public.record_ghl_shadow_ingest_receipt(
  text, uuid, text, text, text, text, text, timestamptz, text, text, text, text[], jsonb
) RENAME TO record_ghl_shadow_ingest_receipt_core;

REVOKE ALL ON FUNCTION public.record_ghl_shadow_ingest_receipt_core(
  text, uuid, text, text, text, text, text, timestamptz, text, text, text, text[], jsonb
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_ghl_shadow_ingest_receipt(
  p_rpc_token text,
  p_expected_binding_id uuid,
  p_location_id text,
  p_payload_sha256 text,
  p_webhook_id_sha256 text,
  p_signature_scheme text,
  p_event_type text,
  p_source_occurred_at timestamptz,
  p_source_contact_identifier_hmac text,
  p_consent_phone_identifier_hmac text,
  p_decision text,
  p_reason_codes text[],
  p_evidence jsonb
)
RETURNS TABLE (
  receipt_id uuid,
  commit_status text,
  decision text,
  reason_codes text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  core_result record;
  receipt public.ghl_shadow_ingest_receipts%ROWTYPE;
BEGIN
  SELECT result.*
  INTO STRICT core_result
  FROM public.record_ghl_shadow_ingest_receipt_core(
    p_rpc_token,
    p_expected_binding_id,
    p_location_id,
    p_payload_sha256,
    p_webhook_id_sha256,
    p_signature_scheme,
    p_event_type,
    p_source_occurred_at,
    p_source_contact_identifier_hmac,
    p_consent_phone_identifier_hmac,
    p_decision,
    p_reason_codes,
    p_evidence
  ) AS result;

  SELECT candidate.*
  INTO STRICT receipt
  FROM public.ghl_shadow_ingest_receipts AS candidate
  WHERE candidate.id = core_result.receipt_id;

  INSERT INTO public.ghl_shadow_delivery_attempts (
    receipt_id,
    binding_id,
    organization_id,
    installation_scope_sha256,
    payload_sha256,
    webhook_id_sha256,
    commit_status,
    decision,
    reason_codes
  ) VALUES (
    receipt.id,
    receipt.binding_id,
    receipt.organization_id,
    receipt.installation_scope_sha256,
    receipt.payload_sha256,
    receipt.webhook_id_sha256,
    core_result.commit_status,
    core_result.decision,
    core_result.reason_codes
  );

  receipt_id := core_result.receipt_id;
  commit_status := core_result.commit_status;
  decision := core_result.decision;
  reason_codes := core_result.reason_codes;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON TABLE public.ghl_shadow_delivery_attempts
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_ghl_shadow_ingest_receipt(
  text, uuid, text, text, text, text, text, timestamptz, text, text, text, text[], jsonb
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_ghl_shadow_ingest_receipt(
  text, uuid, text, text, text, text, text, timestamptz, text, text, text, text[], jsonb
) TO anon;

CREATE OR REPLACE FUNCTION public.export_ghl_shadow_reconciliation_evidence(
  p_organization_id uuid,
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_max_evidence_rows integer DEFAULT 10000
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET timezone = 'UTC'
AS $$
DECLARE
  caller_id uuid := auth.uid();
  evidence_row_count bigint;
  export_values_safe boolean;
  export_document jsonb;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'GHL_SHADOW_EXPORT_AUTHENTICATION_REQUIRED'
      USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.organization_users AS membership
    WHERE membership.organization_id = p_organization_id
      AND membership.user_id = caller_id
      AND membership.role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'GHL_SHADOW_EXPORT_OWNER_OR_ADMIN_REQUIRED'
      USING ERRCODE = '42501';
  END IF;
  IF p_window_start IS NULL
    OR p_window_end IS NULL
    OR p_window_start >= p_window_end
    OR p_window_end - p_window_start > interval '31 days'
  THEN
    RAISE EXCEPTION 'GHL_SHADOW_EXPORT_WINDOW_INVALID' USING ERRCODE = '22023';
  END IF;
  IF p_window_end > statement_timestamp() THEN
    RAISE EXCEPTION 'GHL_SHADOW_EXPORT_WINDOW_MUST_BE_CLOSED' USING ERRCODE = '22023';
  END IF;
  IF p_max_evidence_rows IS NULL OR p_max_evidence_rows NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'GHL_SHADOW_EXPORT_ROW_LIMIT_INVALID' USING ERRCODE = '22023';
  END IF;

  -- Count before building JSON arrays. Because this function is STABLE, the
  -- caller's statement snapshot is shared by this preflight and the export
  -- query below; the evidence set cannot drift between the two reads.
  WITH
  activity_attempts AS (
    SELECT attempt.receipt_id
    FROM public.ghl_shadow_delivery_attempts AS attempt
    WHERE attempt.organization_id = p_organization_id
      AND attempt.attempted_at >= p_window_start
      AND attempt.attempted_at < p_window_end
  ),
  activity_receipt_ids AS (
    SELECT receipt.id AS receipt_id
    FROM public.ghl_shadow_ingest_receipts AS receipt
    WHERE receipt.organization_id = p_organization_id
      AND receipt.received_at >= p_window_start
      AND receipt.received_at < p_window_end
    UNION
    SELECT attempt.receipt_id FROM activity_attempts AS attempt
  ),
  selected_receipts AS (
    SELECT
      receipt.id,
      receipt.installation_scope_sha256,
      receipt.webhook_id_sha256,
      receipt.reason_codes,
      receipt.event_type,
      receipt.evidence
    FROM public.ghl_shadow_ingest_receipts AS receipt
    JOIN activity_receipt_ids AS activity ON activity.receipt_id = receipt.id
    WHERE receipt.organization_id = p_organization_id
      AND receipt.received_at < p_window_end
  ),
  selected_attempts AS (
    SELECT attempt.id, attempt.reason_codes
    FROM public.ghl_shadow_delivery_attempts AS attempt
    WHERE attempt.organization_id = p_organization_id
      AND attempt.attempted_at < p_window_end
      AND attempt.receipt_id IN (SELECT receipt_id FROM activity_receipt_ids)
  ),
  selected_ledger AS (
    SELECT DISTINCT ledger.installation_scope_sha256, ledger.webhook_id_sha256
    FROM public.ghl_shadow_webhook_id_ledger AS ledger
    JOIN selected_receipts AS receipt
      ON receipt.installation_scope_sha256 = ledger.installation_scope_sha256
      AND receipt.webhook_id_sha256 = ledger.webhook_id_sha256
  )
  SELECT
    (SELECT count(*) FROM selected_receipts)
      + (SELECT count(*) FROM selected_attempts)
      + (SELECT count(*) FROM selected_ledger),
    COALESCE((
      SELECT bool_and(public.ghl_shadow_reason_codes_are_export_safe(candidate.reason_codes))
      FROM (
        SELECT receipt.reason_codes FROM selected_receipts AS receipt
        UNION ALL
        SELECT attempt.reason_codes FROM selected_attempts AS attempt
      ) AS candidate
    ), true)
    AND NOT EXISTS (
      SELECT 1
      FROM selected_receipts AS receipt
      WHERE (
          receipt.event_type IS NOT NULL
          AND receipt.event_type NOT IN ('ContactCreate', 'ContactUpdate', 'ContactDndUpdate')
        )
        OR receipt.evidence->>'event_type' IS NULL
        OR receipt.evidence->>'event_type' NOT IN (
          'ContactCreate', 'ContactUpdate', 'ContactDndUpdate', 'invalid'
        )
    )
  INTO evidence_row_count, export_values_safe;

  IF NOT export_values_safe THEN
    RAISE EXCEPTION 'GHL_SHADOW_EXPORT_NON_ALLOWLISTED_VALUE' USING ERRCODE = '22023';
  END IF;

  IF evidence_row_count > p_max_evidence_rows THEN
    RAISE EXCEPTION 'GHL_SHADOW_EXPORT_WINDOW_TOO_LARGE count=% limit=%',
      evidence_row_count, p_max_evidence_rows USING ERRCODE = '54000';
  END IF;

  WITH
  activity_attempts AS MATERIALIZED (
    SELECT attempt.*
    FROM public.ghl_shadow_delivery_attempts AS attempt
    WHERE attempt.organization_id = p_organization_id
      AND attempt.attempted_at >= p_window_start
      AND attempt.attempted_at < p_window_end
  ),
  activity_receipt_ids AS MATERIALIZED (
    SELECT receipt.id AS receipt_id
    FROM public.ghl_shadow_ingest_receipts AS receipt
    WHERE receipt.organization_id = p_organization_id
      AND receipt.received_at >= p_window_start
      AND receipt.received_at < p_window_end
    UNION
    SELECT attempt.receipt_id
    FROM activity_attempts AS attempt
  ),
  selected_receipts AS MATERIALIZED (
    SELECT receipt.*
    FROM public.ghl_shadow_ingest_receipts AS receipt
    JOIN activity_receipt_ids AS activity ON activity.receipt_id = receipt.id
    WHERE receipt.organization_id = p_organization_id
      AND receipt.received_at < p_window_end
  ),
  selected_attempts AS MATERIALIZED (
    SELECT attempt.*
    FROM public.ghl_shadow_delivery_attempts AS attempt
    WHERE attempt.organization_id = p_organization_id
      AND attempt.attempted_at < p_window_end
      AND attempt.receipt_id IN (SELECT receipt_id FROM activity_receipt_ids)
  ),
  selected_ledger AS MATERIALIZED (
    SELECT DISTINCT
      ledger.installation_scope_sha256,
      ledger.webhook_id_sha256,
      ledger.first_payload_sha256,
      ledger.created_at
    FROM public.ghl_shadow_webhook_id_ledger AS ledger
    JOIN selected_receipts AS receipt
      ON receipt.installation_scope_sha256 = ledger.installation_scope_sha256
      AND receipt.webhook_id_sha256 = ledger.webhook_id_sha256
  ),
  row_counts AS (
    SELECT
      (SELECT count(*) FROM selected_receipts) AS receipts,
      (SELECT count(*) FROM selected_attempts) AS attempts,
      (SELECT count(*) FROM selected_ledger) AS ledger_entries
  ),
  receipt_array AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'receipt_id', receipt.id,
        'binding_id', receipt.binding_id,
        'organization_id', receipt.organization_id,
        'installation_scope_sha256', receipt.installation_scope_sha256,
        'location_identifier_sha256', receipt.location_identifier_sha256,
        'payload_sha256', receipt.payload_sha256,
        'webhook_id_sha256', receipt.webhook_id_sha256,
        'signature_scheme', receipt.signature_scheme,
        'event_type', receipt.event_type,
        'source_occurred_at', CASE WHEN receipt.source_occurred_at IS NULL THEN NULL
          ELSE to_char(receipt.source_occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END,
        'source_contact_identifier_hmac', receipt.source_contact_identifier_hmac,
        'consent_phone_identifier_hmac', receipt.consent_phone_identifier_hmac,
        'decision', receipt.decision,
        'reason_codes', to_jsonb(receipt.reason_codes),
        'evidence', receipt.evidence,
        'webhook_id_collision', receipt.webhook_id_collision,
        'received_at', to_char(receipt.received_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'contact_authorized', receipt.contact_authorized,
        'launch_authorized', receipt.launch_authorized,
        'external_effects_created', receipt.external_effects_created,
        'external_trust_required', receipt.external_trust_required
      ) ORDER BY receipt.received_at, receipt.id
    ), '[]'::jsonb) AS value
    FROM selected_receipts AS receipt
  ),
  attempt_array AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'attempt_id', attempt.id,
        'receipt_id', attempt.receipt_id,
        'binding_id', attempt.binding_id,
        'organization_id', attempt.organization_id,
        'installation_scope_sha256', attempt.installation_scope_sha256,
        'payload_sha256', attempt.payload_sha256,
        'webhook_id_sha256', attempt.webhook_id_sha256,
        'commit_status', attempt.commit_status,
        'decision', attempt.decision,
        'reason_codes', to_jsonb(attempt.reason_codes),
        'attempted_at', to_char(attempt.attempted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'contact_authorized', attempt.contact_authorized,
        'launch_authorized', attempt.launch_authorized,
        'provider_invocation_authorized', attempt.provider_invocation_authorized,
        'queue_mutation_authorized', attempt.queue_mutation_authorized,
        'crm_mutation_authorized', attempt.crm_mutation_authorized,
        'external_effects_created', attempt.external_effects_created,
        'external_trust_required', attempt.external_trust_required
      ) ORDER BY attempt.attempted_at, attempt.id
    ), '[]'::jsonb) AS value
    FROM selected_attempts AS attempt
  ),
  ledger_array AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'installation_scope_sha256', ledger.installation_scope_sha256,
        'webhook_id_sha256', ledger.webhook_id_sha256,
        'first_payload_sha256', ledger.first_payload_sha256,
        'created_at', to_char(ledger.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
      ) ORDER BY ledger.installation_scope_sha256, ledger.webhook_id_sha256
    ), '[]'::jsonb) AS value
    FROM selected_ledger AS ledger
  )
  SELECT
    jsonb_build_object(
        'schema_version', '1.0.0',
        'export_type', 'ghl_solar_exit_shadow_reconciliation_evidence',
        'evidence_scope', 'zero_contact_reconciliation_only',
        'organization_id', p_organization_id,
        'campaign_key', 'solar-exit',
        'window', jsonb_build_object(
          'start_inclusive', to_char(p_window_start AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
          'end_exclusive', to_char(p_window_end AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
        ),
        'selection_semantics', 'receipts_or_delivery_attempts_active_in_window_with_receipt_attempt_history_before_window_end',
        'row_counts', jsonb_build_object(
          'receipts', counts.receipts,
          'delivery_attempts', counts.attempts,
          'webhook_id_ledger_entries', counts.ledger_entries
        ),
        'receipts', receipt_array.value,
        'delivery_attempts', attempt_array.value,
        'webhook_id_ledger', ledger_array.value,
        'safety_invariants', jsonb_build_object(
          'contact_authorized', false,
          'launch_authorized', false,
          'provider_invocation_authorized', false,
          'queue_mutation_authorized', false,
          'crm_mutation_authorized', false,
          'external_effects_created', false,
          'external_trust_required', true
        )
      )
  INTO export_document
  FROM row_counts AS counts
  CROSS JOIN receipt_array
  CROSS JOIN attempt_array
  CROSS JOIN ledger_array;

  RETURN export_document;
END;
$$;

REVOKE ALL ON FUNCTION public.export_ghl_shadow_reconciliation_evidence(
  uuid, timestamptz, timestamptz, integer
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ghl_shadow_reason_codes_are_export_safe(text[])
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.export_ghl_shadow_reconciliation_evidence(
  uuid, timestamptz, timestamptz, integer
) TO authenticated;

COMMENT ON TABLE public.ghl_shadow_delivery_attempts IS
  'Append-only redacted delivery accounting for every durably acknowledged GHL shadow receipt, exact retry, and webhook-id collision. It has no contact or operational authority.';
COMMENT ON FUNCTION public.export_ghl_shadow_reconciliation_evidence(
  uuid, timestamptz, timestamptz, integer
) IS
  'Owner/admin-only tenant-scoped read export of redacted GHL shadow receipts, delivery attempts, and webhook-id lineage. It cannot contact, launch, invoke providers, mutate queues, or write CRM data.';

COMMIT;
