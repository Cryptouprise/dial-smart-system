BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

CREATE OR REPLACE FUNCTION public.ghl_shadow_custom_field_mapping_is_exact(
  mapping jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT jsonb_typeof(mapping) = 'object'
    AND mapping ?& ARRAY[
      'ai_voice_calls_authorized',
      'telemarketing_calls_authorized',
      'consent_artifact_id',
      'consent_consumer_name',
      'consent_phone',
      'consent_lead_source',
      'consent_disclosure_text',
      'signature_evidence',
      'source_form_version',
      'not_condition_of_purchase_disclosure',
      'consent_text_version',
      'consent_captured_at',
      'consent_seller',
      'consent_revoked_at',
      'property_state',
      'calling_state'
    ]
    AND (
      SELECT count(*) = 16
        AND count(DISTINCT value #>> '{}') = 16
        AND bool_and(
          jsonb_typeof(value) = 'string'
          AND (value #>> '{}') ~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$'
          AND (value #>> '{}') !~ '^__.*__$'
        )
      FROM jsonb_each(mapping)
    );
$$;

CREATE OR REPLACE FUNCTION public.ghl_shadow_evidence_is_redacted(
  evidence jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  allowed_root_keys constant text[] := ARRAY[
    'schema_version', 'evidence_scope', 'payload_sha256', 'signature_scheme',
    'exact_location_binding_found', 'event_type', 'mapping_version',
    'identifier_key_version',
    'mapping_sha256', 'policy_version', 'policy_sha256',
    'mapped_field_presence', 'source_contact_identifier_hmac',
    'consent_phone_identifier_hmac', 'consent_consumer_identifier_hmac',
    'consent_signature_identifier_hmac', 'consent_artifact_identifier_hmac',
    'consent_source_identifier_hmac', 'consent_disclosure_sha256',
    'current_contact_phone_matches_consent_phone',
    'current_contact_state_ignored', 'current_contact_source_ignored',
    'exact_boolean_consent_types', 'consent_captured_at_valid',
    'consent_not_revoked', 'source_timestamp_present',
    'source_timestamp_valid', 'source_timestamp_fresh_for_ordering',
    'source_timestamp_sha256', 'ghl_dnd_clear_from_contact_dnd_update',
    'external_suppression_evidence_present', 'contact_authorized',
    'launch_authorized', 'external_effects_created', 'external_trust_required'
  ];
  boolean_keys constant text[] := ARRAY[
    'exact_location_binding_found',
    'current_contact_phone_matches_consent_phone',
    'current_contact_state_ignored', 'current_contact_source_ignored',
    'exact_boolean_consent_types', 'consent_captured_at_valid',
    'consent_not_revoked', 'source_timestamp_present',
    'source_timestamp_valid', 'source_timestamp_fresh_for_ordering',
    'ghl_dnd_clear_from_contact_dnd_update',
    'external_suppression_evidence_present', 'contact_authorized',
    'launch_authorized', 'external_effects_created', 'external_trust_required'
  ];
  hash_keys constant text[] := ARRAY[
    'payload_sha256', 'mapping_sha256', 'policy_sha256',
    'source_contact_identifier_hmac', 'consent_phone_identifier_hmac',
    'consent_consumer_identifier_hmac', 'consent_signature_identifier_hmac',
    'consent_artifact_identifier_hmac', 'consent_source_identifier_hmac',
    'consent_disclosure_sha256', 'source_timestamp_sha256'
  ];
  required_presence_keys constant text[] := ARRAY[
    'ai_voice_calls_authorized', 'telemarketing_calls_authorized',
    'consent_artifact_id', 'consent_consumer_name', 'consent_phone',
    'consent_lead_source', 'consent_disclosure_text', 'signature_evidence',
    'source_form_version', 'not_condition_of_purchase_disclosure',
    'consent_text_version', 'consent_captured_at', 'consent_seller',
    'consent_revoked_at', 'property_state', 'calling_state'
  ];
  key_name text;
  mapped_presence jsonb;
BEGIN
  IF jsonb_typeof(evidence) IS DISTINCT FROM 'object'
    OR octet_length(evidence::text) > 65536
    OR evidence->>'schema_version' IS DISTINCT FROM '1.0.0'
    OR evidence->>'evidence_scope' IS DISTINCT FROM 'zero_contact_shadow_observation_only'
    OR evidence->>'payload_sha256' !~ '^[a-f0-9]{64}$'
    OR evidence->'contact_authorized' IS DISTINCT FROM 'false'::jsonb
    OR evidence->'launch_authorized' IS DISTINCT FROM 'false'::jsonb
    OR evidence->'external_effects_created' IS DISTINCT FROM 'false'::jsonb
    OR evidence->'external_trust_required' IS DISTINCT FROM 'true'::jsonb
  THEN
    RETURN false;
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(evidence) AS candidate(key)
    WHERE NOT (candidate.key = ANY(allowed_root_keys))
  ) THEN
    RETURN false;
  END IF;
  FOREACH key_name IN ARRAY boolean_keys LOOP
    IF evidence ? key_name AND jsonb_typeof(evidence->key_name) <> 'boolean' THEN
      RETURN false;
    END IF;
  END LOOP;
  FOREACH key_name IN ARRAY hash_keys LOOP
    IF evidence ? key_name
      AND jsonb_typeof(evidence->key_name) <> 'null'
      AND evidence->>key_name !~ '^[a-f0-9]{64}$'
    THEN
      RETURN false;
    END IF;
  END LOOP;
  IF evidence ? 'signature_scheme'
    AND evidence->>'signature_scheme' IS DISTINCT FROM 'x-ghl-signature-ed25519'
  THEN
    RETURN false;
  END IF;
  IF evidence ? 'event_type'
    AND evidence->>'event_type' !~ '^[A-Za-z][A-Za-z0-9._:-]{0,127}$'
  THEN
    RETURN false;
  END IF;
  FOREACH key_name IN ARRAY ARRAY[
    'mapping_version', 'identifier_key_version', 'policy_version'
  ] LOOP
    IF evidence ? key_name
      AND evidence->>key_name !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
    THEN
      RETURN false;
    END IF;
  END LOOP;
  IF evidence ? 'mapped_field_presence' THEN
    mapped_presence := evidence->'mapped_field_presence';
    IF jsonb_typeof(mapped_presence) <> 'object'
      OR NOT mapped_presence ?& required_presence_keys
      OR (SELECT count(*) FROM jsonb_object_keys(mapped_presence)) <> 16
      OR EXISTS (
        SELECT 1 FROM jsonb_each(mapped_presence) AS item
        WHERE jsonb_typeof(item.value) <> 'boolean'
      )
    THEN
      RETURN false;
    END IF;
  END IF;
  RETURN true;
END;
$$;

CREATE TABLE public.ghl_shadow_ingest_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  ghl_location_id text NOT NULL,
  campaign_key text NOT NULL DEFAULT 'solar-exit',
  mapping_version text NOT NULL,
  identifier_key_version text NOT NULL,
  custom_field_mapping jsonb NOT NULL,
  custom_field_mapping_sha256 text NOT NULL,
  policy_version text NOT NULL,
  policy_status text NOT NULL DEFAULT 'unresolved',
  policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  policy_snapshot_sha256 text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  mode text GENERATED ALWAYS AS ('shadow_read_only'::text) STORED,
  outbound_writeback_enabled boolean GENERATED ALWAYS AS (false) STORED,
  workflow_triggering_enabled boolean GENERATED ALWAYS AS (false) STORED,
  contact_authorized boolean GENERATED ALWAYS AS (false) STORED,
  launch_authorized boolean GENERATED ALWAYS AS (false) STORED,
  external_trust_required boolean GENERATED ALWAYS AS (true) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz,
  CONSTRAINT ghl_shadow_binding_location_format CHECK (
    ghl_location_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$'
  ),
  CONSTRAINT ghl_shadow_binding_campaign CHECK (campaign_key = 'solar-exit'),
  CONSTRAINT ghl_shadow_binding_mapping_version CHECK (
    mapping_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
  ),
  CONSTRAINT ghl_shadow_binding_identifier_key_version CHECK (
    identifier_key_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
  ),
  CONSTRAINT ghl_shadow_binding_policy_version CHECK (
    policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
    AND policy_version !~ '^__.*__$'
  ),
  CONSTRAINT ghl_shadow_binding_mapping_exact CHECK (
    public.ghl_shadow_custom_field_mapping_is_exact(custom_field_mapping)
  ),
  CONSTRAINT ghl_shadow_binding_mapping_hash CHECK (
    custom_field_mapping_sha256 ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT ghl_shadow_binding_policy_hash CHECK (
    policy_snapshot_sha256 ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT ghl_shadow_binding_policy_snapshot_object CHECK (
    jsonb_typeof(policy_snapshot) = 'object'
  ),
  CONSTRAINT ghl_shadow_binding_policy_state CHECK (
    policy_status IN ('unresolved', 'resolved', 'withdrawn')
    AND (NOT enabled OR policy_status = 'resolved')
  ),
  CONSTRAINT ghl_shadow_binding_enabled_not_disabled CHECK (
    NOT enabled OR disabled_at IS NULL
  ),
  UNIQUE (ghl_location_id, campaign_key, mapping_version)
);

CREATE UNIQUE INDEX ghl_shadow_one_enabled_location
  ON public.ghl_shadow_ingest_bindings (ghl_location_id)
  WHERE enabled;
CREATE UNIQUE INDEX ghl_shadow_one_enabled_org_campaign
  ON public.ghl_shadow_ingest_bindings (organization_id, campaign_key)
  WHERE enabled;

CREATE TABLE public.ghl_shadow_ingest_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  binding_id uuid,
  organization_id uuid,
  installation_scope_sha256 text NOT NULL,
  location_identifier_sha256 text NOT NULL,
  payload_sha256 text NOT NULL,
  webhook_id_sha256 text,
  signature_scheme text NOT NULL,
  event_type text,
  source_occurred_at timestamptz,
  source_contact_identifier_hmac text,
  consent_phone_identifier_hmac text,
  decision text NOT NULL,
  reason_codes text[] NOT NULL,
  evidence jsonb NOT NULL,
  webhook_id_collision boolean NOT NULL DEFAULT false,
  contact_authorized boolean GENERATED ALWAYS AS (false) STORED,
  launch_authorized boolean GENERATED ALWAYS AS (false) STORED,
  external_effects_created boolean GENERATED ALWAYS AS (false) STORED,
  external_trust_required boolean GENERATED ALWAYS AS (true) STORED,
  received_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ghl_shadow_receipt_hashes CHECK (
    installation_scope_sha256 ~ '^[a-f0-9]{64}$'
    AND location_identifier_sha256 ~ '^[a-f0-9]{64}$'
    AND payload_sha256 ~ '^[a-f0-9]{64}$'
    AND (webhook_id_sha256 IS NULL OR webhook_id_sha256 ~ '^[a-f0-9]{64}$')
    AND (
      source_contact_identifier_hmac IS NULL
      OR source_contact_identifier_hmac ~ '^[a-f0-9]{64}$'
    )
    AND (
      consent_phone_identifier_hmac IS NULL
      OR consent_phone_identifier_hmac ~ '^[a-f0-9]{64}$'
    )
  ),
  CONSTRAINT ghl_shadow_receipt_modern_signature CHECK (
    signature_scheme = 'x-ghl-signature-ed25519'
  ),
  CONSTRAINT ghl_shadow_receipt_event_type CHECK (
    event_type IS NULL OR event_type ~ '^[A-Za-z][A-Za-z0-9._:-]{0,127}$'
  ),
  CONSTRAINT ghl_shadow_receipt_decision CHECK (decision IN ('held', 'quarantined')),
  CONSTRAINT ghl_shadow_receipt_reasons CHECK (
    cardinality(reason_codes) BETWEEN 1 AND 64
  ),
  CONSTRAINT ghl_shadow_receipt_redacted CHECK (
    public.ghl_shadow_evidence_is_redacted(evidence)
  ),
  UNIQUE (installation_scope_sha256, payload_sha256)
);

CREATE TABLE public.ghl_shadow_webhook_id_ledger (
  installation_scope_sha256 text NOT NULL,
  webhook_id_sha256 text NOT NULL,
  first_payload_sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (installation_scope_sha256, webhook_id_sha256),
  CONSTRAINT ghl_shadow_webhook_ledger_hashes CHECK (
    installation_scope_sha256 ~ '^[a-f0-9]{64}$'
    AND webhook_id_sha256 ~ '^[a-f0-9]{64}$'
    AND first_payload_sha256 ~ '^[a-f0-9]{64}$'
  )
);

ALTER TABLE public.ghl_shadow_ingest_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghl_shadow_ingest_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghl_shadow_webhook_id_ledger ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.protect_ghl_shadow_binding_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'GHL_SHADOW_BINDING_DELETE_FORBIDDEN' USING ERRCODE = '23514';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.ghl_location_id IS DISTINCT FROM OLD.ghl_location_id
    OR NEW.campaign_key IS DISTINCT FROM OLD.campaign_key
    OR NEW.mapping_version IS DISTINCT FROM OLD.mapping_version
    OR NEW.identifier_key_version IS DISTINCT FROM OLD.identifier_key_version
    OR NEW.custom_field_mapping IS DISTINCT FROM OLD.custom_field_mapping
    OR NEW.custom_field_mapping_sha256 IS DISTINCT FROM OLD.custom_field_mapping_sha256
    OR NEW.policy_version IS DISTINCT FROM OLD.policy_version
    OR NEW.policy_status IS DISTINCT FROM OLD.policy_status
    OR NEW.policy_snapshot IS DISTINCT FROM OLD.policy_snapshot
    OR NEW.policy_snapshot_sha256 IS DISTINCT FROM OLD.policy_snapshot_sha256
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'GHL_SHADOW_BINDING_VERSION_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  IF OLD.enabled AND NOT NEW.enabled AND NEW.disabled_at IS NULL THEN
    RAISE EXCEPTION 'GHL_SHADOW_BINDING_DISABLE_TIMESTAMP_REQUIRED' USING ERRCODE = '23514';
  END IF;
  IF NOT OLD.enabled AND OLD.disabled_at IS NOT NULL AND NEW.enabled THEN
    RAISE EXCEPTION 'GHL_SHADOW_BINDING_REENABLE_FORBIDDEN_CREATE_NEW_VERSION'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ghl_shadow_binding_version_guard
BEFORE UPDATE OR DELETE ON public.ghl_shadow_ingest_bindings
FOR EACH ROW EXECUTE FUNCTION public.protect_ghl_shadow_binding_version();

CREATE OR REPLACE FUNCTION public.protect_ghl_shadow_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'GHL_SHADOW_EVIDENCE_APPEND_ONLY' USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER ghl_shadow_receipt_append_only
BEFORE UPDATE OR DELETE ON public.ghl_shadow_ingest_receipts
FOR EACH ROW EXECUTE FUNCTION public.protect_ghl_shadow_append_only();
CREATE TRIGGER ghl_shadow_webhook_ledger_append_only
BEFORE UPDATE OR DELETE ON public.ghl_shadow_webhook_id_ledger
FOR EACH ROW EXECUTE FUNCTION public.protect_ghl_shadow_append_only();

CREATE OR REPLACE FUNCTION public.assert_ghl_shadow_ingest_rpc_token(
  p_rpc_token text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  expected_sha256 text;
  actual_sha256 text;
  token_bytes bytea;
  distinct_byte_count integer;
  maximum_byte_frequency integer;
BEGIN
  IF p_rpc_token IS NULL OR p_rpc_token !~ '^base64url:[A-Za-z0-9_-]{43}$' THEN
    RAISE EXCEPTION 'GHL_SHADOW_RPC_UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;
  BEGIN
    token_bytes := decode(
      translate(substring(p_rpc_token FROM 11), '-_', '+/') || '=',
      'base64'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'GHL_SHADOW_RPC_UNAUTHORIZED' USING ERRCODE = '42501';
  END;
  SELECT count(*), max(byte_frequency)
  INTO distinct_byte_count, maximum_byte_frequency
  FROM (
    SELECT get_byte(token_bytes, byte_offset), count(*) AS byte_frequency
    FROM generate_series(0, 31) AS offsets(byte_offset)
    GROUP BY get_byte(token_bytes, byte_offset)
  ) AS byte_frequencies;
  IF octet_length(token_bytes) IS DISTINCT FROM 32
    OR distinct_byte_count < 16
    OR maximum_byte_frequency > 4
  THEN
    RAISE EXCEPTION 'GHL_SHADOW_RPC_UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;
  SELECT lower(secret.decrypted_secret)
  INTO expected_sha256
  FROM vault.decrypted_secrets AS secret
  WHERE secret.name = 'dial_smart_ghl_shadow_ingest_rpc_token_sha256'
  ORDER BY secret.created_at DESC
  LIMIT 1;
  IF expected_sha256 IS NULL OR expected_sha256 !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'GHL_SHADOW_RPC_DISABLED' USING ERRCODE = '42501';
  END IF;
  actual_sha256 := encode(
    extensions.digest(convert_to(p_rpc_token, 'UTF8'), 'sha256'),
    'hex'
  );
  IF actual_sha256 IS DISTINCT FROM expected_sha256 THEN
    RAISE EXCEPTION 'GHL_SHADOW_RPC_UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_ghl_shadow_ingest_contract(
  p_rpc_token text,
  p_location_id text
)
RETURNS SETOF public.ghl_shadow_ingest_bindings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.assert_ghl_shadow_ingest_rpc_token(p_rpc_token);
  IF p_location_id IS NULL
    OR p_location_id !~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$'
  THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT binding.*
  FROM public.ghl_shadow_ingest_bindings AS binding
  WHERE binding.ghl_location_id = p_location_id
    AND binding.enabled
    AND binding.campaign_key = 'solar-exit';
END;
$$;

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
  binding public.ghl_shadow_ingest_bindings%ROWTYPE;
  binding_found boolean := false;
  location_hash text;
  scope_hash text;
  final_decision text := p_decision;
  final_reasons text[] := p_reason_codes;
  existing_receipt public.ghl_shadow_ingest_receipts%ROWTYPE;
  first_payload text;
  ledger_inserted integer;
  inserted_id uuid;
  collision_detected boolean := false;
  reason text;
BEGIN
  PERFORM public.assert_ghl_shadow_ingest_rpc_token(p_rpc_token);
  IF p_payload_sha256 !~ '^[a-f0-9]{64}$'
    OR (p_webhook_id_sha256 IS NOT NULL AND p_webhook_id_sha256 !~ '^[a-f0-9]{64}$')
    OR p_signature_scheme IS DISTINCT FROM 'x-ghl-signature-ed25519'
    OR p_decision NOT IN ('held', 'quarantined')
    OR p_reason_codes IS NULL
    OR cardinality(p_reason_codes) NOT BETWEEN 1 AND 64
    OR array_position(p_reason_codes, NULL) IS NOT NULL
    OR p_evidence IS NULL
    OR NOT public.ghl_shadow_evidence_is_redacted(p_evidence)
    OR p_evidence->>'payload_sha256' IS DISTINCT FROM p_payload_sha256
    OR (
      p_source_contact_identifier_hmac IS NOT NULL
      AND p_source_contact_identifier_hmac !~ '^[a-f0-9]{64}$'
    )
    OR (
      p_consent_phone_identifier_hmac IS NOT NULL
      AND p_consent_phone_identifier_hmac !~ '^[a-f0-9]{64}$'
    )
    OR (
      p_event_type IS NOT NULL
      AND p_event_type !~ '^[A-Za-z][A-Za-z0-9._:-]{0,127}$'
    )
  THEN
    RAISE EXCEPTION 'GHL_SHADOW_RECEIPT_CONTRACT_INVALID' USING ERRCODE = '23514';
  END IF;
  FOREACH reason IN ARRAY p_reason_codes LOOP
    IF reason IS NULL OR reason = '' OR reason !~ '^[A-Z][A-Z0-9_]{0,127}$' THEN
      RAISE EXCEPTION 'GHL_SHADOW_REASON_CODE_INVALID' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  SELECT array_agg(DISTINCT item ORDER BY item) INTO final_reasons
  FROM unnest(final_reasons) AS item;

  IF p_location_id IS NOT NULL
    AND p_location_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$'
  THEN
    SELECT candidate.* INTO binding
    FROM public.ghl_shadow_ingest_bindings AS candidate
    WHERE candidate.ghl_location_id = p_location_id
      AND candidate.enabled
      AND candidate.campaign_key = 'solar-exit';
    binding_found := FOUND;
  END IF;

  location_hash := encode(extensions.digest(convert_to(
    'ghl-shadow-location-v1' || chr(10) || COALESCE(p_location_id, 'missing'),
    'UTF8'
  ), 'sha256'), 'hex');
  scope_hash := encode(extensions.digest(convert_to(
    CASE WHEN binding_found
      THEN 'ghl-shadow-installation-v1' || chr(10) || binding.id::text
      ELSE 'ghl-shadow-unbound-v1' || chr(10) || location_hash
    END,
    'UTF8'
  ), 'sha256'), 'hex');

  IF p_expected_binding_id IS DISTINCT FROM (CASE WHEN binding_found THEN binding.id ELSE NULL END) THEN
    final_decision := 'quarantined';
    final_reasons := array_append(final_reasons, 'BINDING_CHANGED_BEFORE_COMMIT');
  END IF;
  SELECT array_agg(DISTINCT item ORDER BY item) INTO final_reasons
  FROM unnest(final_reasons) AS item;
  IF cardinality(final_reasons) NOT BETWEEN 1 AND 64 THEN
    RAISE EXCEPTION 'GHL_SHADOW_REASON_LIMIT_EXCEEDED' USING ERRCODE = '23514';
  END IF;

  SELECT receipt.* INTO existing_receipt
  FROM public.ghl_shadow_ingest_receipts AS receipt
  WHERE receipt.installation_scope_sha256 = scope_hash
    AND receipt.payload_sha256 = p_payload_sha256;
  IF FOUND THEN
    receipt_id := existing_receipt.id;
    commit_status := 'duplicate';
    decision := existing_receipt.decision;
    reason_codes := existing_receipt.reason_codes;
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_webhook_id_sha256 IS NOT NULL THEN
    INSERT INTO public.ghl_shadow_webhook_id_ledger (
      installation_scope_sha256, webhook_id_sha256, first_payload_sha256
    ) VALUES (scope_hash, p_webhook_id_sha256, p_payload_sha256)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS ledger_inserted = ROW_COUNT;
    IF ledger_inserted = 0 THEN
      SELECT ledger.first_payload_sha256 INTO first_payload
      FROM public.ghl_shadow_webhook_id_ledger AS ledger
      WHERE ledger.installation_scope_sha256 = scope_hash
        AND ledger.webhook_id_sha256 = p_webhook_id_sha256;
      IF first_payload IS DISTINCT FROM p_payload_sha256 THEN
        collision_detected := true;
        final_decision := 'quarantined';
        final_reasons := array_append(final_reasons, 'WEBHOOK_ID_PAYLOAD_COLLISION');
        SELECT array_agg(DISTINCT item ORDER BY item) INTO final_reasons
        FROM unnest(final_reasons) AS item;
        IF cardinality(final_reasons) > 64 THEN
          RAISE EXCEPTION 'GHL_SHADOW_REASON_LIMIT_EXCEEDED' USING ERRCODE = '23514';
        END IF;
      ELSE
        SELECT receipt.* INTO existing_receipt
        FROM public.ghl_shadow_ingest_receipts AS receipt
        WHERE receipt.installation_scope_sha256 = scope_hash
          AND receipt.payload_sha256 = p_payload_sha256;
        IF FOUND THEN
          receipt_id := existing_receipt.id;
          commit_status := 'duplicate';
          decision := existing_receipt.decision;
          reason_codes := existing_receipt.reason_codes;
          RETURN NEXT;
          RETURN;
        END IF;
        RAISE EXCEPTION 'GHL_SHADOW_WEBHOOK_LEDGER_INCONSISTENT' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  INSERT INTO public.ghl_shadow_ingest_receipts (
    binding_id,
    organization_id,
    installation_scope_sha256,
    location_identifier_sha256,
    payload_sha256,
    webhook_id_sha256,
    signature_scheme,
    event_type,
    source_occurred_at,
    source_contact_identifier_hmac,
    consent_phone_identifier_hmac,
    decision,
    reason_codes,
    evidence,
    webhook_id_collision
  ) VALUES (
    CASE WHEN binding_found THEN binding.id ELSE NULL END,
    CASE WHEN binding_found THEN binding.organization_id ELSE NULL END,
    scope_hash,
    location_hash,
    p_payload_sha256,
    p_webhook_id_sha256,
    p_signature_scheme,
    p_event_type,
    p_source_occurred_at,
    p_source_contact_identifier_hmac,
    p_consent_phone_identifier_hmac,
    final_decision,
    final_reasons,
    p_evidence,
    collision_detected
  )
  ON CONFLICT (installation_scope_sha256, payload_sha256) DO NOTHING
  RETURNING id INTO inserted_id;

  IF inserted_id IS NULL THEN
    SELECT receipt.* INTO existing_receipt
    FROM public.ghl_shadow_ingest_receipts AS receipt
    WHERE receipt.installation_scope_sha256 = scope_hash
      AND receipt.payload_sha256 = p_payload_sha256;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'GHL_SHADOW_RECEIPT_COMMIT_RACE' USING ERRCODE = '40001';
    END IF;
    receipt_id := existing_receipt.id;
    commit_status := 'duplicate';
    decision := existing_receipt.decision;
    reason_codes := existing_receipt.reason_codes;
  ELSE
    receipt_id := inserted_id;
    commit_status := CASE WHEN collision_detected
      THEN 'webhook_id_collision' ELSE 'committed' END;
    decision := final_decision;
    reason_codes := final_reasons;
  END IF;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON TABLE public.ghl_shadow_ingest_bindings
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.ghl_shadow_ingest_receipts
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.ghl_shadow_webhook_id_ledger
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ghl_shadow_custom_field_mapping_is_exact(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ghl_shadow_evidence_is_redacted(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.protect_ghl_shadow_binding_version()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.protect_ghl_shadow_append_only()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assert_ghl_shadow_ingest_rpc_token(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_ghl_shadow_ingest_contract(text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_ghl_shadow_ingest_receipt(
  text, uuid, text, text, text, text, text, timestamptz, text, text, text, text[], jsonb
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_ghl_shadow_ingest_contract(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.record_ghl_shadow_ingest_receipt(
  text, uuid, text, text, text, text, text, timestamptz, text, text, text, text[], jsonb
) TO anon;

COMMENT ON TABLE public.ghl_shadow_ingest_bindings IS
  'Versioned, exact organization-to-HighLevel-location contracts for the Solar Exit zero-contact shadow lane. No operational foreign key exists by design.';
COMMENT ON TABLE public.ghl_shadow_ingest_receipts IS
  'Append-only redacted/HMAC-bound HighLevel shadow evidence. It cannot authorize contact, launch, writeback, queueing, messaging, or provider effects.';
COMMENT ON TABLE public.ghl_shadow_webhook_id_ledger IS
  'Append-only installation-scoped webhook-id ledger used to distinguish exact raw-body retries from signed webhook-id payload collisions.';
COMMENT ON FUNCTION public.record_ghl_shadow_ingest_receipt(
  text, uuid, text, text, text, text, text, timestamptz, text, text, text, text[], jsonb
) IS
  'The sole evidence writer. An anon client must prove the dedicated Edge-to-Vault token; only its SHA-256 is stored in Vault. Returns only after durable insert/duplicate/collision resolution.';

COMMIT;
