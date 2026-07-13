-- Executed only against the isolated fresh-database certification project.

BEGIN;

DO $catalog_contract$
DECLARE
  policy_count integer;
  unsafe_column_grants integer;
BEGIN
  IF NOT has_table_privilege('authenticated', 'public.call_logs', 'SELECT')
    OR has_table_privilege('authenticated', 'public.call_logs', 'INSERT')
    OR has_table_privilege('authenticated', 'public.call_logs', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.call_logs', 'DELETE')
    OR has_table_privilege('anon', 'public.call_logs', 'SELECT')
    OR NOT has_table_privilege('service_role', 'public.call_logs', 'SELECT')
    OR NOT has_table_privilege('service_role', 'public.call_logs', 'INSERT')
    OR NOT has_table_privilege('service_role', 'public.call_logs', 'UPDATE')
    OR has_table_privilege('service_role', 'public.call_logs', 'DELETE')
  THEN
    RAISE EXCEPTION 'call log grants do not enforce authenticated-read/service-lifecycle ownership';
  END IF;

  SELECT count(*) INTO unsafe_column_grants
  FROM information_schema.column_privileges
  WHERE table_schema = 'public'
    AND table_name = 'call_logs'
    AND grantee IN ('anon', 'authenticated', 'PUBLIC')
    AND privilege_type IN ('INSERT', 'UPDATE', 'REFERENCES');
  IF unsafe_column_grants <> 0 THEN
    RAISE EXCEPTION 'browser roles retain % unsafe call log column grants', unsafe_column_grants;
  END IF;

  SELECT count(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'call_logs';
  IF policy_count <> 1 OR NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'call_logs'
      AND policyname = 'Members view their tenant call logs'
      AND cmd = 'SELECT'
      AND roles = ARRAY['authenticated'::name]
  ) THEN
    RAISE EXCEPTION 'call logs must expose exactly one authenticated tenant SELECT policy';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.call_logs'::regclass
      AND tgname = 'call_log_evidence_guard'
      AND NOT tgisinternal
  ) OR has_function_privilege(
    'authenticated', 'public.protect_call_log_evidence()', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'call log evidence guard is missing or browser executable';
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
    '95000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'call-log-a@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Call Log A"}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '95000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'call-log-b@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Call Log B"}', now(), now()
  );

INSERT INTO public.organizations (id, name, slug) VALUES
  ('94000000-0000-0000-0000-000000000001', 'Call Log Tenant A', 'call-log-tenant-a'),
  ('94000000-0000-0000-0000-000000000002', 'Call Log Tenant B', 'call-log-tenant-b');
INSERT INTO public.organization_users (organization_id, user_id, role) VALUES
  ('94000000-0000-0000-0000-000000000001', '95000000-0000-0000-0000-000000000001', 'owner'),
  ('94000000-0000-0000-0000-000000000002', '95000000-0000-0000-0000-000000000002', 'owner');

INSERT INTO public.call_logs (
  id, user_id, organization_id, phone_number, caller_id, status
) VALUES
  (
    '96000000-0000-0000-0000-000000000001',
    '95000000-0000-0000-0000-000000000001',
    '94000000-0000-0000-0000-000000000001',
    '+12025550161', '+12025550961', 'queued'
  ),
  (
    '96000000-0000-0000-0000-000000000002',
    '95000000-0000-0000-0000-000000000002',
    '94000000-0000-0000-0000-000000000002',
    '+12025550162', '+12025550962', 'queued'
  );

CREATE TEMP TABLE call_log_contract_result (
  assertion text PRIMARY KEY,
  observed integer NOT NULL
);
GRANT SELECT, INSERT ON call_log_contract_result TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claim.sub',
  '95000000-0000-0000-0000-000000000001',
  true
);
INSERT INTO call_log_contract_result(assertion, observed)
SELECT 'tenant_rows', count(*)::integer FROM public.call_logs;

DO $browser_mutation_contract$
BEGIN
  BEGIN
    INSERT INTO public.call_logs (
      user_id, organization_id, phone_number, caller_id, status
    ) VALUES (
      '95000000-0000-0000-0000-000000000001',
      '94000000-0000-0000-0000-000000000001',
      '+12025550169', '+12025550969', 'completed'
    );
    RAISE EXCEPTION 'browser manufactured a provider call log';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    UPDATE public.call_logs
    SET credit_deducted = true, billed_cost_cents = 999999
    WHERE id = '96000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'browser manufactured call billing evidence';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    DELETE FROM public.call_logs
    WHERE id = '96000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'browser deleted durable call evidence';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$browser_mutation_contract$;
RESET ROLE;
SELECT set_config('request.jwt.claim.role', '', true);
SELECT set_config('request.jwt.claim.sub', '', true);

DO $evidence_contract$
BEGIN
  IF (SELECT observed FROM call_log_contract_result WHERE assertion = 'tenant_rows') <> 1 THEN
    RAISE EXCEPTION 'call log tenant SELECT policy leaked or hid rows';
  END IF;

  UPDATE public.call_logs
  SET retell_call_id = 'retell-contract-call',
      credit_deducted = true,
      billed_cost_cents = 12,
      status = 'completed'
  WHERE id = '96000000-0000-0000-0000-000000000001';

  BEGIN
    UPDATE public.call_logs
    SET retell_call_id = 'retell-forged-replacement'
    WHERE id = '96000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'established provider identity was overwritten';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CALL_LOG_PROVIDER_BILLING_IDENTITY_IMMUTABLE%' THEN
      RAISE;
    END IF;
  END;

  BEGIN
    UPDATE public.call_logs
    SET organization_id = '94000000-0000-0000-0000-000000000002',
        user_id = '95000000-0000-0000-0000-000000000002'
    WHERE id = '96000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'durable call log was rebound to another tenant';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CALL_LOG_TENANT_IDENTITY_IMMUTABLE%' THEN
      RAISE;
    END IF;
  END;

  BEGIN
    DELETE FROM public.call_logs
    WHERE id = '96000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'owner/service path physically deleted call evidence';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CALL_LOG_EVIDENCE_IMMUTABLE%' THEN
      RAISE;
    END IF;
  END;
END;
$evidence_contract$;

ROLLBACK;
