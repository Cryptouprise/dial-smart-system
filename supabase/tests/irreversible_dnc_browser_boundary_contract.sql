-- Executed only against the isolated fresh-database certification project.

BEGIN;

DO $catalog_contract$
DECLARE
  policy_count integer;
BEGIN
  IF NOT has_table_privilege('authenticated', 'public.dnc_list', 'SELECT')
    OR NOT has_table_privilege('authenticated', 'public.dnc_list', 'INSERT')
    OR has_table_privilege('authenticated', 'public.dnc_list', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.dnc_list', 'DELETE')
    OR has_table_privilege('anon', 'public.dnc_list', 'SELECT')
    OR NOT has_table_privilege('service_role', 'public.dnc_list', 'SELECT')
    OR NOT has_table_privilege('service_role', 'public.dnc_list', 'INSERT')
    OR NOT has_table_privilege('service_role', 'public.dnc_list', 'UPDATE')
    OR has_table_privilege('service_role', 'public.dnc_list', 'DELETE')
  THEN
    RAISE EXCEPTION 'DNC privileges do not enforce append-only browser access and service metadata updates';
  END IF;

  SELECT count(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'dnc_list';
  IF policy_count <> 2 OR EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'dnc_list'
      AND (
        cmd NOT IN ('SELECT', 'INSERT')
        OR roles <> ARRAY['authenticated'::name]
      )
  ) THEN
    RAISE EXCEPTION 'DNC must expose exactly authenticated SELECT and INSERT policies';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.dnc_list'::regclass
      AND tgname = 'dnc_suppression_identity_guard'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'DNC irreversible identity trigger is missing';
  END IF;

  IF has_function_privilege(
      'authenticated', 'public.protect_dnc_suppression_identity()', 'EXECUTE')
    OR has_function_privilege(
      'anon', 'public.protect_dnc_suppression_identity()', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'browser roles can invoke the DNC identity trigger function directly';
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
    'b2000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'dnc-a@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"DNC A"}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'b2000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'dnc-b@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"DNC B"}', now(), now()
  );

INSERT INTO public.organizations (id, name, slug) VALUES
  ('b1000000-0000-0000-0000-000000000001', 'DNC Tenant A', 'dnc-tenant-a'),
  ('b1000000-0000-0000-0000-000000000002', 'DNC Tenant B', 'dnc-tenant-b');
INSERT INTO public.organization_users (organization_id, user_id, role) VALUES
  ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'owner'),
  ('b1000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000002', 'owner');

INSERT INTO public.dnc_list (
  id, user_id, organization_id, phone_number, reason
) VALUES (
  'b3000000-0000-0000-0000-000000000002',
  'b2000000-0000-0000-0000-000000000002',
  'b1000000-0000-0000-0000-000000000002',
  '+12025550182',
  'tenant-b-existing'
);

CREATE TEMP TABLE dnc_contract_result (
  assertion text PRIMARY KEY,
  observed integer NOT NULL
);
GRANT SELECT, INSERT ON dnc_contract_result TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claim.sub',
  'b2000000-0000-0000-0000-000000000001',
  true
);

INSERT INTO public.dnc_list (
  id, user_id, organization_id, phone_number, reason
) VALUES (
  'b3000000-0000-0000-0000-000000000001',
  'b2000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000001',
  '(202) 555-0181',
  'consumer-request'
);

INSERT INTO dnc_contract_result(assertion, observed)
SELECT 'tenant_rows', count(*)::integer FROM public.dnc_list;

DO $browser_contract$
BEGIN
  BEGIN
    UPDATE public.dnc_list
    SET reason = 'browser-rewritten'
    WHERE id = 'b3000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'browser updated a durable DNC suppression';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    DELETE FROM public.dnc_list
    WHERE id = 'b3000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'browser deleted a durable DNC suppression';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.dnc_list (
      user_id, organization_id, phone_number, reason
    ) VALUES (
      'b2000000-0000-0000-0000-000000000001',
      'b1000000-0000-0000-0000-000000000002',
      '+12025550189',
      'cross-tenant-forgery'
    );
    RAISE EXCEPTION 'browser inserted a suppression into another tenant';
  EXCEPTION WHEN insufficient_privilege OR foreign_key_violation THEN
    NULL;
  END;
END;
$browser_contract$;

RESET ROLE;
SELECT set_config('request.jwt.claim.role', '', true);
SELECT set_config('request.jwt.claim.sub', '', true);

DO $tenant_contract$
BEGIN
  IF (SELECT observed FROM dnc_contract_result WHERE assertion = 'tenant_rows') <> 1 THEN
    RAISE EXCEPTION 'DNC tenant RLS leaked or hid suppressions';
  END IF;

  IF (
    SELECT phone_number_normalized
    FROM public.dnc_list
    WHERE id = 'b3000000-0000-0000-0000-000000000001'
  ) <> '+12025550181' THEN
    RAISE EXCEPTION 'DNC browser insert was not normalized';
  END IF;
END;
$tenant_contract$;

SET LOCAL ROLE service_role;
UPDATE public.dnc_list
SET reason = 'provider-confirmed'
WHERE id = 'b3000000-0000-0000-0000-000000000001';
RESET ROLE;

DO $irreversible_contract$
BEGIN
  IF (
    SELECT reason
    FROM public.dnc_list
    WHERE id = 'b3000000-0000-0000-0000-000000000001'
  ) <> 'provider-confirmed' THEN
    RAISE EXCEPTION 'trusted service could not update non-identity DNC metadata';
  END IF;

  BEGIN
    UPDATE public.dnc_list
    SET phone_number = '+12025550188'
    WHERE id = 'b3000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'trusted writer moved a suppression to another phone';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%DNC_SUPPRESSION_IDENTITY_IMMUTABLE%' THEN
      RAISE;
    END IF;
  END;

  BEGIN
    UPDATE public.dnc_list
    SET organization_id = 'b1000000-0000-0000-0000-000000000002',
        user_id = 'b2000000-0000-0000-0000-000000000002'
    WHERE id = 'b3000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'trusted writer rebound a suppression to another tenant';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%DNC_SUPPRESSION_IDENTITY_IMMUTABLE%' THEN
      RAISE;
    END IF;
  END;

  BEGIN
    DELETE FROM public.dnc_list
    WHERE id = 'b3000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'owner bypassed irreversible DNC deletion guard';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%DNC_SUPPRESSION_IRREVERSIBLE%' THEN
      RAISE;
    END IF;
  END;
END;
$irreversible_contract$;

ROLLBACK;
