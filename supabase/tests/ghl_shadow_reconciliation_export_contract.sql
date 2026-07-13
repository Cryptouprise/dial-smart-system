-- Executed only against the isolated fresh-database certification project.

BEGIN;

DO $catalog_contract$
DECLARE
  policy_count integer;
BEGIN
  IF has_table_privilege('anon', 'public.ghl_shadow_delivery_attempts', 'SELECT')
    OR has_table_privilege('authenticated', 'public.ghl_shadow_delivery_attempts', 'SELECT')
    OR has_table_privilege('service_role', 'public.ghl_shadow_delivery_attempts', 'SELECT')
  THEN
    RAISE EXCEPTION 'delivery-attempt evidence has direct table access';
  END IF;

  SELECT count(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'ghl_shadow_delivery_attempts';
  IF policy_count <> 0 THEN
    RAISE EXCEPTION 'delivery-attempt evidence must not expose an RLS policy surface';
  END IF;

  IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'public.ghl_shadow_delivery_attempts'::regclass
        AND tgname = 'ghl_shadow_delivery_attempt_append_only'
        AND NOT tgisinternal
    )
  THEN
    RAISE EXCEPTION 'delivery-attempt append-only trigger is missing';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_attribute
    WHERE attrelid = 'public.ghl_shadow_delivery_attempts'::regclass
      AND attname IN (
        'contact_authorized', 'launch_authorized',
        'provider_invocation_authorized', 'queue_mutation_authorized',
        'crm_mutation_authorized', 'external_effects_created',
        'external_trust_required'
      )
      AND attgenerated = 's'
  ) <> 7 THEN
    RAISE EXCEPTION 'delivery-attempt no-authority fields are not generated constants';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ghl_shadow_delivery_attempts'
      AND column_name IN (
        'phone', 'phone_number', 'email', 'name', 'first_name', 'last_name',
        'address', 'raw_body', 'raw_payload', 'payload', 'custom_fields', 'tags'
      )
  ) THEN
    RAISE EXCEPTION 'delivery-attempt ledger contains a raw contact-data column';
  END IF;

  IF NOT has_function_privilege(
      'anon',
      'public.record_ghl_shadow_ingest_receipt(text,uuid,text,text,text,text,text,timestamp with time zone,text,text,text,text[],jsonb)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'anon',
      'public.record_ghl_shadow_ingest_receipt_core(text,uuid,text,text,text,text,text,timestamp with time zone,text,text,text,text[],jsonb)',
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'authenticated',
      'public.export_ghl_shadow_reconciliation_evidence(uuid,timestamp with time zone,timestamp with time zone,integer)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'anon',
      'public.export_ghl_shadow_reconciliation_evidence(uuid,timestamp with time zone,timestamp with time zone,integer)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'service_role',
      'public.export_ghl_shadow_reconciliation_evidence(uuid,timestamp with time zone,timestamp with time zone,integer)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'anon',
      'public.ghl_shadow_reason_codes_are_export_safe(text[])',
      'EXECUTE'
    )
    OR has_function_privilege(
      'authenticated',
      'public.ghl_shadow_reason_codes_are_export_safe(text[])',
      'EXECUTE'
    )
    OR has_function_privilege(
      'service_role',
      'public.ghl_shadow_reason_codes_are_export_safe(text[])',
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'shadow writer/core/export grants violate the narrow capability boundary';
  END IF;

  IF NOT public.ghl_shadow_reason_codes_are_export_safe(
      ARRAY['EXTERNAL_SUPPRESSION_EVIDENCE_REQUIRED']
    )
    OR public.ghl_shadow_reason_codes_are_export_safe(ARRAY['PHONE_13035550123'])
  THEN
    RAISE EXCEPTION 'finite non-PII reason-code boundary is not fail-closed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE oid = 'public.export_ghl_shadow_reconciliation_evidence(uuid,timestamp with time zone,timestamp with time zone,integer)'::regprocedure
      AND prosecdef
      AND provolatile = 's'
  ) THEN
    RAISE EXCEPTION 'tenant export is not a stable SECURITY DEFINER read RPC';
  END IF;
END;
$catalog_contract$;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    'e2000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'shadow-owner-a@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'e2000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'shadow-admin-a@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'e2000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 'shadow-member-a@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'e2000000-0000-4000-8000-000000000004',
    'authenticated', 'authenticated', 'shadow-owner-b@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  );

INSERT INTO public.organizations (id, name, slug) VALUES
  ('e1000000-0000-4000-8000-000000000001', 'Shadow Tenant A', 'shadow-tenant-a'),
  ('e1000000-0000-4000-8000-000000000002', 'Shadow Tenant B', 'shadow-tenant-b');
INSERT INTO public.organization_users (organization_id, user_id, role) VALUES
  ('e1000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'owner'),
  ('e1000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000002', 'admin'),
  ('e1000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000003', 'member'),
  ('e1000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000004', 'owner');

SELECT vault.create_secret(
  '605f1d8b4743130b44edc18cf0d50c8330a689a0cfaaed47b5cf85d03b8fa500',
  'dial_smart_ghl_shadow_ingest_rpc_token_sha256',
  'isolated reconciliation contract fixture; transaction rolls back'
);

INSERT INTO public.ghl_shadow_ingest_bindings (
  id, organization_id, ghl_location_id, mapping_version,
  identifier_key_version, custom_field_mapping,
  custom_field_mapping_sha256, policy_version, policy_status,
  policy_snapshot, policy_snapshot_sha256, enabled
) VALUES
  (
    'e3000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'solar_location_a', 'solar-map-v1', 'shadow-key-v1',
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
    repeat('a', 64), 'solar-policy-v1', 'resolved', '{}', repeat('b', 64), true
  ),
  (
    'e3000000-0000-4000-8000-000000000002',
    'e1000000-0000-4000-8000-000000000002',
    'solar_location_b', 'solar-map-v1', 'shadow-key-v1',
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
    repeat('c', 64), 'solar-policy-v1', 'resolved', '{}', repeat('d', 64), true
  );

CREATE TEMP TABLE reconciliation_writer_results (
  receipt_id uuid,
  commit_status text,
  decision text,
  reason_codes text[]
);
GRANT SELECT, INSERT ON reconciliation_writer_results TO anon;

SET LOCAL ROLE anon;

INSERT INTO reconciliation_writer_results
SELECT * FROM public.record_ghl_shadow_ingest_receipt(
  'base64url:AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA',
  'e3000000-0000-4000-8000-000000000001', 'solar_location_a',
  repeat('1', 64), repeat('2', 64), 'x-ghl-signature-ed25519',
  'ContactDndUpdate', now(), repeat('3', 64), repeat('4', 64),
  'held', ARRAY['EXTERNAL_SUPPRESSION_EVIDENCE_REQUIRED'],
  jsonb_build_object(
    'schema_version', '1.0.0', 'evidence_scope', 'zero_contact_shadow_observation_only',
    'payload_sha256', repeat('1', 64), 'signature_scheme', 'x-ghl-signature-ed25519',
    'event_type', 'ContactDndUpdate',
    'contact_authorized', false, 'launch_authorized', false,
    'external_effects_created', false, 'external_trust_required', true
  )
);

-- Exact raw replay: same durable receipt, separate immutable delivery attempt.
INSERT INTO reconciliation_writer_results
SELECT * FROM public.record_ghl_shadow_ingest_receipt(
  'base64url:AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA',
  'e3000000-0000-4000-8000-000000000001', 'solar_location_a',
  repeat('1', 64), repeat('2', 64), 'x-ghl-signature-ed25519',
  'ContactDndUpdate', now(), repeat('3', 64), repeat('4', 64),
  'held', ARRAY['EXTERNAL_SUPPRESSION_EVIDENCE_REQUIRED'],
  jsonb_build_object(
    'schema_version', '1.0.0', 'evidence_scope', 'zero_contact_shadow_observation_only',
    'payload_sha256', repeat('1', 64), 'signature_scheme', 'x-ghl-signature-ed25519',
    'event_type', 'ContactDndUpdate',
    'contact_authorized', false, 'launch_authorized', false,
    'external_effects_created', false, 'external_trust_required', true
  )
);

-- Same webhook ID with a different payload: separate quarantined collision.
INSERT INTO reconciliation_writer_results
SELECT * FROM public.record_ghl_shadow_ingest_receipt(
  'base64url:AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA',
  'e3000000-0000-4000-8000-000000000001', 'solar_location_a',
  repeat('5', 64), repeat('2', 64), 'x-ghl-signature-ed25519',
  'ContactDndUpdate', now(), repeat('3', 64), repeat('4', 64),
  'held', ARRAY['EXTERNAL_SUPPRESSION_EVIDENCE_REQUIRED'],
  jsonb_build_object(
    'schema_version', '1.0.0', 'evidence_scope', 'zero_contact_shadow_observation_only',
    'payload_sha256', repeat('5', 64), 'signature_scheme', 'x-ghl-signature-ed25519',
    'event_type', 'ContactDndUpdate',
    'contact_authorized', false, 'launch_authorized', false,
    'external_effects_created', false, 'external_trust_required', true
  )
);

-- A different tenant's evidence must never enter Tenant A's export.
INSERT INTO reconciliation_writer_results
SELECT * FROM public.record_ghl_shadow_ingest_receipt(
  'base64url:AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA',
  'e3000000-0000-4000-8000-000000000002', 'solar_location_b',
  repeat('6', 64), repeat('7', 64), 'x-ghl-signature-ed25519',
  'ContactDndUpdate', now(), repeat('8', 64), repeat('9', 64),
  'held', ARRAY['EXTERNAL_SUPPRESSION_EVIDENCE_REQUIRED'],
  jsonb_build_object(
    'schema_version', '1.0.0', 'evidence_scope', 'zero_contact_shadow_observation_only',
    'payload_sha256', repeat('6', 64), 'signature_scheme', 'x-ghl-signature-ed25519',
    'event_type', 'ContactDndUpdate',
    'contact_authorized', false, 'launch_authorized', false,
    'external_effects_created', false, 'external_trust_required', true
  )
);

RESET ROLE;

DO $writer_contract$
BEGIN
  IF (SELECT count(*) FROM reconciliation_writer_results WHERE commit_status = 'committed') <> 2
    OR (SELECT count(*) FROM reconciliation_writer_results WHERE commit_status = 'duplicate') <> 1
    OR (SELECT count(*) FROM reconciliation_writer_results WHERE commit_status = 'webhook_id_collision') <> 1
    OR (SELECT count(*) FROM public.ghl_shadow_delivery_attempts) <> 4
  THEN
    RAISE EXCEPTION 'wrapper did not preserve exact committed/duplicate/collision attempt accounting';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ghl_shadow_delivery_attempts
    WHERE contact_authorized OR launch_authorized OR provider_invocation_authorized
      OR queue_mutation_authorized OR crm_mutation_authorized
      OR external_effects_created OR NOT external_trust_required
  ) THEN
    RAISE EXCEPTION 'delivery attempt gained operational authority';
  END IF;
  BEGIN
    DELETE FROM public.ghl_shadow_delivery_attempts;
    RAISE EXCEPTION 'delivery attempt evidence was deletable';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%GHL_SHADOW_EVIDENCE_APPEND_ONLY%' THEN RAISE; END IF;
  END;
END;
$writer_contract$;

CREATE TEMP TABLE reconciliation_window AS
SELECT now() - interval '1 minute' AS window_start, clock_timestamp() AS window_end;
CREATE TEMP TABLE reconciliation_exports (
  actor text PRIMARY KEY,
  document jsonb NOT NULL
);
GRANT SELECT, INSERT ON reconciliation_window, reconciliation_exports TO authenticated;

-- Members cannot export even their own tenant.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000003', true);
DO $member_denied$
DECLARE
  bounds record;
BEGIN
  SELECT * INTO bounds FROM reconciliation_window;
  BEGIN
    PERFORM public.export_ghl_shadow_reconciliation_evidence(
      'e1000000-0000-4000-8000-000000000001',
      bounds.window_start, bounds.window_end, 100
    );
    RAISE EXCEPTION 'member exported organization shadow evidence';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$member_denied$;
RESET ROLE;

-- Another tenant's owner cannot name Tenant A and cross the boundary.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000004', true);
DO $other_tenant_denied$
DECLARE
  bounds record;
BEGIN
  SELECT * INTO bounds FROM reconciliation_window;
  BEGIN
    PERFORM public.export_ghl_shadow_reconciliation_evidence(
      'e1000000-0000-4000-8000-000000000001',
      bounds.window_start, bounds.window_end, 100
    );
    RAISE EXCEPTION 'another tenant owner exported Tenant A evidence';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$other_tenant_denied$;
RESET ROLE;

-- Owner and admin receive byte-equivalent deterministic evidence for one fixed window.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000001', true);
INSERT INTO reconciliation_exports(actor, document)
SELECT 'owner', public.export_ghl_shadow_reconciliation_evidence(
  'e1000000-0000-4000-8000-000000000001', window_start, window_end, 100
)
FROM reconciliation_window;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000002', true);
INSERT INTO reconciliation_exports(actor, document)
SELECT 'admin', public.export_ghl_shadow_reconciliation_evidence(
  'e1000000-0000-4000-8000-000000000001', window_start, window_end, 100
)
FROM reconciliation_window;

DO $bounded_export_contract$
DECLARE
  bounds record;
BEGIN
  SELECT * INTO bounds FROM reconciliation_window;
  BEGIN
    PERFORM public.export_ghl_shadow_reconciliation_evidence(
      'e1000000-0000-4000-8000-000000000001',
      bounds.window_start, bounds.window_end, 1
    );
    RAISE EXCEPTION 'oversized evidence export was silently truncated';
  EXCEPTION WHEN program_limit_exceeded THEN NULL;
  END;
END;
$bounded_export_contract$;
RESET ROLE;
SELECT set_config('request.jwt.claim.role', '', true);
SELECT set_config('request.jwt.claim.sub', '', true);

DO $export_contract$
DECLARE
  document jsonb;
BEGIN
  SELECT candidate.document INTO document
  FROM reconciliation_exports AS candidate
  WHERE actor = 'owner';

  IF document IS DISTINCT FROM (
      SELECT candidate.document FROM reconciliation_exports AS candidate WHERE actor = 'admin'
    )
  THEN
    RAISE EXCEPTION 'same tenant/window export changed with authorized principal';
  END IF;
  IF document->>'organization_id' <> 'e1000000-0000-4000-8000-000000000001'
    OR document->>'campaign_key' <> 'solar-exit'
    OR document->>'evidence_scope' <> 'zero_contact_reconciliation_only'
    OR (document->'row_counts'->>'receipts')::integer <> 2
    OR (document->'row_counts'->>'delivery_attempts')::integer <> 3
    OR (document->'row_counts'->>'webhook_id_ledger_entries')::integer <> 1
  THEN
    RAISE EXCEPTION 'tenant export envelope or exact row counts are wrong';
  END IF;
  IF jsonb_array_length(document->'receipts') <> 2
    OR jsonb_array_length(document->'delivery_attempts') <> 3
    OR jsonb_array_length(document->'webhook_id_ledger') <> 1
    OR (
      SELECT count(*)
      FROM jsonb_array_elements(document->'delivery_attempts') AS attempt
      WHERE attempt->>'commit_status' = 'duplicate'
    ) <> 1
    OR (
      SELECT count(*)
      FROM jsonb_array_elements(document->'delivery_attempts') AS attempt
      WHERE attempt->>'commit_status' = 'webhook_id_collision'
    ) <> 1
  THEN
    RAISE EXCEPTION 'receipt/retry/collision arrays do not reconcile';
  END IF;
  IF document::text LIKE '%' || repeat('6', 64) || '%'
    OR document::text LIKE '%' || repeat('8', 64) || '%'
    OR document::text LIKE '%"phone_number"%'
    OR document::text LIKE '%"email"%'
    OR document::text LIKE '%"raw_payload"%'
  THEN
    RAISE EXCEPTION 'tenant B or raw contact data leaked into Tenant A export';
  END IF;
  IF document->'safety_invariants' IS DISTINCT FROM jsonb_build_object(
    'contact_authorized', false,
    'launch_authorized', false,
    'provider_invocation_authorized', false,
    'queue_mutation_authorized', false,
    'crm_mutation_authorized', false,
    'external_effects_created', false,
    'external_trust_required', true
  ) THEN
    RAISE EXCEPTION 'export safety invariants changed';
  END IF;
END;
$export_contract$;

ROLLBACK;
