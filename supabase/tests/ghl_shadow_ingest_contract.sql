-- Executed only against the isolated fresh-database certification project.

BEGIN;

DO $catalog_contract$
DECLARE
  policy_count integer;
BEGIN
  IF has_table_privilege('anon', 'public.ghl_shadow_ingest_bindings', 'SELECT')
    OR has_table_privilege('anon', 'public.ghl_shadow_ingest_receipts', 'INSERT')
    OR has_table_privilege('authenticated', 'public.ghl_shadow_ingest_receipts', 'SELECT')
    OR has_table_privilege('service_role', 'public.ghl_shadow_ingest_bindings', 'SELECT')
    OR has_table_privilege('service_role', 'public.ghl_shadow_ingest_receipts', 'INSERT')
  THEN
    RAISE EXCEPTION 'shadow tables expose direct browser or service-role access';
  END IF;

  SELECT count(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN (
      'ghl_shadow_ingest_bindings',
      'ghl_shadow_ingest_receipts',
      'ghl_shadow_webhook_id_ledger'
    );
  IF policy_count <> 0 THEN
    RAISE EXCEPTION 'shadow tables must have no direct RLS policy surface';
  END IF;

  IF NOT has_function_privilege(
      'anon', 'public.get_ghl_shadow_ingest_contract(text,text)', 'EXECUTE')
    OR NOT has_function_privilege(
      'anon',
      'public.record_ghl_shadow_ingest_receipt(text,uuid,text,text,text,text,text,timestamp with time zone,text,text,text,text[],jsonb)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'authenticated', 'public.get_ghl_shadow_ingest_contract(text,text)', 'EXECUTE')
    OR has_function_privilege(
      'service_role',
      'public.record_ghl_shadow_ingest_receipt(text,uuid,text,text,text,text,text,timestamp with time zone,text,text,text,text[],jsonb)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'anon', 'public.assert_ghl_shadow_ingest_rpc_token(text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'shadow RPC grants are broader or narrower than the dedicated anon token gate';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE contype = 'f'
      AND conrelid IN (
        'public.ghl_shadow_ingest_bindings'::regclass,
        'public.ghl_shadow_ingest_receipts'::regclass,
        'public.ghl_shadow_webhook_id_ledger'::regclass
      )
  ) THEN
    RAISE EXCEPTION 'shadow evidence must have no operational foreign keys';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ghl_shadow_ingest_receipts'
      AND column_name IN (
        'phone', 'phone_number', 'email', 'name', 'first_name', 'last_name',
        'address', 'raw_body', 'raw_payload', 'payload', 'custom_fields', 'tags'
      )
  ) THEN
    RAISE EXCEPTION 'shadow receipt schema contains a raw contact-data column';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_attribute
    WHERE attrelid = 'public.ghl_shadow_ingest_receipts'::regclass
      AND attname IN (
        'contact_authorized', 'launch_authorized',
        'external_effects_created', 'external_trust_required'
      )
      AND attgenerated = 's'
  ) <> 4 THEN
    RAISE EXCEPTION 'shadow no-authority columns are not generated constants';
  END IF;

  IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'public.ghl_shadow_ingest_receipts'::regclass
        AND tgname = 'ghl_shadow_receipt_append_only' AND NOT tgisinternal
    ) OR NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'public.ghl_shadow_webhook_id_ledger'::regclass
        AND tgname = 'ghl_shadow_webhook_ledger_append_only' AND NOT tgisinternal
    )
  THEN
    RAISE EXCEPTION 'shadow evidence append-only triggers are missing';
  END IF;
END;
$catalog_contract$;

SELECT vault.create_secret(
  '605f1d8b4743130b44edc18cf0d50c8330a689a0cfaaed47b5cf85d03b8fa500',
  'dial_smart_ghl_shadow_ingest_rpc_token_sha256',
  'isolated contract fixture; transaction rolls back'
);

INSERT INTO public.ghl_shadow_ingest_bindings (
  id,
  organization_id,
  ghl_location_id,
  mapping_version,
  identifier_key_version,
  custom_field_mapping,
  custom_field_mapping_sha256,
  policy_version,
  policy_status,
  policy_snapshot,
  policy_snapshot_sha256,
  enabled
) VALUES (
  'd1000000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000001',
  'solar_location_001',
  'solar-ghl-map-v1',
  'shadow-hmac-v1',
  '{
    "ai_voice_calls_authorized":"cf_ai_voice",
    "telemarketing_calls_authorized":"cf_telemarketing",
    "consent_artifact_id":"cf_artifact",
    "consent_consumer_name":"cf_consumer",
    "consent_phone":"cf_consent_phone",
    "consent_lead_source":"cf_consent_source",
    "consent_disclosure_text":"cf_disclosure",
    "signature_evidence":"cf_signature",
    "source_form_version":"cf_form_version",
    "not_condition_of_purchase_disclosure":"cf_not_condition",
    "consent_text_version":"cf_text_version",
    "consent_captured_at":"cf_captured_at",
    "consent_seller":"cf_seller",
    "consent_revoked_at":"cf_revoked_at",
    "property_state":"cf_property_state",
    "calling_state":"cf_calling_state"
  }'::jsonb,
  repeat('a', 64),
  'counsel-approved-v1',
  'resolved',
  '{"fixture":"edge performs exact hash and policy validation"}'::jsonb,
  repeat('b', 64),
  true
);

CREATE TEMP TABLE shadow_rpc_results (
  receipt_id uuid,
  commit_status text,
  decision text,
  reason_codes text[]
);
GRANT SELECT, INSERT ON shadow_rpc_results TO anon;

SET LOCAL ROLE anon;

DO $direct_access_contract$
BEGIN
  BEGIN
    PERFORM * FROM public.ghl_shadow_ingest_bindings;
    RAISE EXCEPTION 'anon read shadow bindings directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.get_ghl_shadow_ingest_contract(
      'base64url:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      'solar_location_001'
    );
    RAISE EXCEPTION 'wrong RPC token was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$direct_access_contract$;

DO $contract_lookup$
DECLARE
  observed integer;
BEGIN
  SELECT count(*) INTO observed
  FROM public.get_ghl_shadow_ingest_contract(
    'base64url:AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA',
    'solar_location_001'
  );
  IF observed <> 1 THEN
    RAISE EXCEPTION 'exact enabled location contract was not returned';
  END IF;
END;
$contract_lookup$;

INSERT INTO shadow_rpc_results
SELECT * FROM public.record_ghl_shadow_ingest_receipt(
  'base64url:AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA',
  'd1000000-0000-4000-8000-000000000001',
  'solar_location_001',
  repeat('c', 64),
  repeat('d', 64),
  'x-ghl-signature-ed25519',
  'ContactDndUpdate',
  '2026-07-13T16:00:00Z',
  repeat('e', 64),
  repeat('f', 64),
  'held',
  ARRAY['EXTERNAL_SUPPRESSION_EVIDENCE_REQUIRED'],
  jsonb_build_object(
    'schema_version', '1.0.0',
    'payload_sha256', repeat('c', 64),
    'evidence_scope', 'zero_contact_shadow_observation_only',
    'contact_authorized', false,
    'launch_authorized', false,
    'external_effects_created', false,
    'external_trust_required', true
  )
);

INSERT INTO shadow_rpc_results
SELECT * FROM public.record_ghl_shadow_ingest_receipt(
  'base64url:AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA',
  'd1000000-0000-4000-8000-000000000001',
  'solar_location_001',
  repeat('c', 64),
  repeat('d', 64),
  'x-ghl-signature-ed25519',
  'ContactDndUpdate',
  '2026-07-13T16:00:00Z',
  repeat('e', 64),
  repeat('f', 64),
  'held',
  ARRAY['EXTERNAL_SUPPRESSION_EVIDENCE_REQUIRED'],
  jsonb_build_object(
    'schema_version', '1.0.0',
    'payload_sha256', repeat('c', 64),
    'evidence_scope', 'zero_contact_shadow_observation_only',
    'contact_authorized', false,
    'launch_authorized', false,
    'external_effects_created', false,
    'external_trust_required', true
  )
);

INSERT INTO shadow_rpc_results
SELECT * FROM public.record_ghl_shadow_ingest_receipt(
  'base64url:AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA',
  'd1000000-0000-4000-8000-000000000001',
  'solar_location_001',
  repeat('1', 64),
  repeat('d', 64),
  'x-ghl-signature-ed25519',
  'ContactDndUpdate',
  '2026-07-13T16:01:00Z',
  repeat('e', 64),
  repeat('f', 64),
  'held',
  ARRAY['EXTERNAL_SUPPRESSION_EVIDENCE_REQUIRED'],
  jsonb_build_object(
    'schema_version', '1.0.0',
    'payload_sha256', repeat('1', 64),
    'evidence_scope', 'zero_contact_shadow_observation_only',
    'contact_authorized', false,
    'launch_authorized', false,
    'external_effects_created', false,
    'external_trust_required', true
  )
);

DO $rpc_input_rejections$
DECLARE
  sixty_four_reasons text[];
BEGIN
  BEGIN
    PERFORM public.record_ghl_shadow_ingest_receipt(
      'base64url:AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA',
      'd1000000-0000-4000-8000-000000000001', 'solar_location_001',
      repeat('2', 64), repeat('3', 64), 'x-ghl-signature-ed25519',
      'ContactDndUpdate', '2026-07-13T16:02:00Z', repeat('e', 64), repeat('f', 64),
      'held', ARRAY['VALID_REASON', NULL]::text[],
      jsonb_build_object(
        'schema_version', '1.0.0', 'payload_sha256', repeat('2', 64),
        'evidence_scope', 'zero_contact_shadow_observation_only',
        'contact_authorized', false, 'launch_authorized', false,
        'external_effects_created', false, 'external_trust_required', true
      )
    );
    RAISE EXCEPTION 'NULL reason code was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    PERFORM public.record_ghl_shadow_ingest_receipt(
      'base64url:AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA',
      'd1000000-0000-4000-8000-000000000001', 'solar_location_001',
      repeat('2', 64), repeat('3', 64), 'x-ghl-signature-ed25519',
      'ContactDndUpdate', '2026-07-13T16:02:00Z', repeat('e', 64), repeat('f', 64),
      'held', ARRAY['VALID_REASON'],
      jsonb_build_object(
        'schema_version', '1.0.0', 'payload_sha256', repeat('2', 64),
        'evidence_scope', 'zero_contact_shadow_observation_only',
        'contact_authorized', false, 'launch_authorized', false,
        'external_effects_created', false, 'external_trust_required', true,
        'alternate_customer_blob', 'Jane Doe, (303) 555-0123'
      )
    );
    RAISE EXCEPTION 'non-allowlisted evidence key stored arbitrary PII';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  SELECT array_agg('REASON_' || lpad(value::text, 3, '0'))
  INTO sixty_four_reasons
  FROM generate_series(1, 64) AS series(value);
  BEGIN
    PERFORM public.record_ghl_shadow_ingest_receipt(
      'base64url:AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA',
      NULL, 'solar_location_001', repeat('4', 64), repeat('7', 64),
      'x-ghl-signature-ed25519', 'ContactDndUpdate', '2026-07-13T16:03:00Z',
      repeat('e', 64), repeat('f', 64), 'held', sixty_four_reasons,
      jsonb_build_object(
        'schema_version', '1.0.0', 'payload_sha256', repeat('4', 64),
        'evidence_scope', 'zero_contact_shadow_observation_only',
        'contact_authorized', false, 'launch_authorized', false,
        'external_effects_created', false, 'external_trust_required', true
      )
    );
    RAISE EXCEPTION 'binding-change reason expanded receipt beyond 64 reasons';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$rpc_input_rejections$;

INSERT INTO shadow_rpc_results
SELECT * FROM public.record_ghl_shadow_ingest_receipt(
  'base64url:AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA',
  'd1000000-0000-4000-8000-000000000001', 'solar_location_001',
  repeat('5', 64), repeat('6', 64), 'x-ghl-signature-ed25519',
  'ContactDndUpdate', '2026-07-13T16:04:00Z', repeat('e', 64), repeat('f', 64),
  'held', ARRAY['DUPLICATE_REASON', 'DUPLICATE_REASON'],
  jsonb_build_object(
    'schema_version', '1.0.0', 'payload_sha256', repeat('5', 64),
    'evidence_scope', 'zero_contact_shadow_observation_only',
    'contact_authorized', false, 'launch_authorized', false,
    'external_effects_created', false, 'external_trust_required', true
  )
);

RESET ROLE;

DO $receipt_contract$
BEGIN
  IF (SELECT count(*) FROM shadow_rpc_results WHERE commit_status = 'committed') <> 2
    OR (SELECT count(*) FROM shadow_rpc_results WHERE commit_status = 'duplicate') <> 1
    OR (SELECT count(*) FROM shadow_rpc_results WHERE commit_status = 'webhook_id_collision') <> 1
  THEN
    RAISE EXCEPTION 'durable raw replay/webhook collision classification failed';
  END IF;
  IF (SELECT count(*) FROM public.ghl_shadow_ingest_receipts) <> 3 THEN
    RAISE EXCEPTION 'duplicate delivery inserted a second receipt';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ghl_shadow_ingest_receipts
    WHERE payload_sha256 = repeat('5', 64)
      AND reason_codes = ARRAY['DUPLICATE_REASON']
  ) THEN
    RAISE EXCEPTION 'reason codes were not deduplicated before persistence';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ghl_shadow_ingest_receipts
    WHERE webhook_id_collision
      AND decision = 'quarantined'
      AND 'WEBHOOK_ID_PAYLOAD_COLLISION' = ANY(reason_codes)
  ) THEN
    RAISE EXCEPTION 'webhook-id payload collision was not durably quarantined';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ghl_shadow_ingest_receipts
    WHERE contact_authorized OR launch_authorized OR external_effects_created
      OR NOT external_trust_required
  ) THEN
    RAISE EXCEPTION 'shadow evidence gained contact, launch, or effect authority';
  END IF;

  BEGIN
    UPDATE public.ghl_shadow_ingest_receipts SET decision = 'held';
    RAISE EXCEPTION 'append-only receipt was updated';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%GHL_SHADOW_EVIDENCE_APPEND_ONLY%' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM public.ghl_shadow_webhook_id_ledger;
    RAISE EXCEPTION 'append-only webhook ledger was deleted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%GHL_SHADOW_EVIDENCE_APPEND_ONLY%' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.ghl_shadow_ingest_bindings
    SET custom_field_mapping_sha256 = repeat('9', 64)
    WHERE id = 'd1000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'versioned binding mapping was mutated';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%GHL_SHADOW_BINDING_VERSION_IMMUTABLE%' THEN RAISE; END IF;
  END;
END;
$receipt_contract$;

ROLLBACK;
