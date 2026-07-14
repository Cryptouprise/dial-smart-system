-- Executed only against the isolated fresh-database certification project.

BEGIN;

DO $catalog_contract$
DECLARE
  relation_name text;
  policy_count integer;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['phone_numbers', 'retell_agents']
  LOOP
    IF NOT has_table_privilege(
        'authenticated', format('public.%I', relation_name), 'SELECT')
      OR has_table_privilege(
        'authenticated', format('public.%I', relation_name), 'INSERT')
      OR has_table_privilege(
        'authenticated', format('public.%I', relation_name), 'UPDATE')
      OR has_table_privilege(
        'authenticated', format('public.%I', relation_name), 'DELETE')
      OR has_table_privilege(
        'anon', format('public.%I', relation_name), 'SELECT')
      OR NOT has_table_privilege(
        'service_role', format('public.%I', relation_name), 'SELECT')
      OR NOT has_table_privilege(
        'service_role', format('public.%I', relation_name), 'INSERT')
      OR NOT has_table_privilege(
        'service_role', format('public.%I', relation_name), 'UPDATE')
      OR NOT has_table_privilege(
        'service_role', format('public.%I', relation_name), 'DELETE')
    THEN
      RAISE EXCEPTION '% does not enforce browser-read/service-write ownership', relation_name;
    END IF;

    SELECT count(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = relation_name;
    IF policy_count <> 1 OR EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = relation_name
        AND (cmd <> 'SELECT' OR roles <> ARRAY['authenticated'::name])
    ) THEN
      RAISE EXCEPTION '% must expose exactly one authenticated SELECT policy', relation_name;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.phone_numbers'::regclass
      AND conname = 'phone_numbers_number_key'
      AND contype = 'u'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.retell_agents'::regclass
      AND conname = 'retell_agents_retell_agent_id_key'
      AND contype = 'u'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_index
    WHERE indexrelid = 'public.phone_numbers_retell_phone_id_unique'::regclass
      AND indisunique
      AND indpred IS NOT NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_index
    WHERE indexrelid = 'public.phone_numbers_twilio_sid_unique'::regclass
      AND indisunique
      AND indpred IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'provider identities are not globally unique';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.phone_numbers'::regclass
      AND tgname = 'normalize_provider_phone_number'
      AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.phone_numbers'::regclass
      AND tgname = 'provider_resource_identity_guard'
      AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.retell_agents'::regclass
      AND tgname = 'provider_resource_identity_guard'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'provider normalization/identity triggers are missing';
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
    'a2000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'provider-a@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Provider A"}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a2000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'provider-b@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Provider B"}', now(), now()
  );

INSERT INTO public.organizations (id, name, slug) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Provider Tenant A', 'provider-tenant-a'),
  ('a1000000-0000-0000-0000-000000000002', 'Provider Tenant B', 'provider-tenant-b');
INSERT INTO public.organization_users (organization_id, user_id, role) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'owner'),
  ('a1000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000002', 'owner');

INSERT INTO public.phone_numbers (
  id, user_id, organization_id, number, area_code,
  provider, retell_phone_id, twilio_sid
) VALUES
  (
    'a3000000-0000-0000-0000-000000000001',
    'a2000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    '(202) 555-0171', '202', 'retell_native', 'retell-phone-contract-a', 'PNCONTRACTA'
  ),
  (
    'a3000000-0000-0000-0000-000000000002',
    'a2000000-0000-0000-0000-000000000002',
    'a1000000-0000-0000-0000-000000000002',
    '+12025550172', '202', 'retell_native', 'retell-phone-contract-b', 'PNCONTRACTB'
  );

INSERT INTO public.retell_agents (
  id, user_id, organization_id, retell_agent_id, agent_name
) VALUES
  (
    'a4000000-0000-0000-0000-000000000001',
    'a2000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    'retell-agent-contract-a', 'Contract Agent A'
  ),
  (
    'a4000000-0000-0000-0000-000000000002',
    'a2000000-0000-0000-0000-000000000002',
    'a1000000-0000-0000-0000-000000000002',
    'retell-agent-contract-b', 'Contract Agent B'
  );

CREATE TEMP TABLE provider_contract_result (
  assertion text PRIMARY KEY,
  observed integer NOT NULL
);
GRANT SELECT, INSERT ON provider_contract_result TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claim.sub',
  'a2000000-0000-0000-0000-000000000001',
  true
);
INSERT INTO provider_contract_result(assertion, observed)
SELECT 'phone_rows', count(*)::integer FROM public.phone_numbers;
INSERT INTO provider_contract_result(assertion, observed)
SELECT 'agent_rows', count(*)::integer FROM public.retell_agents;

DO $browser_mutation_contract$
BEGIN
  BEGIN
    INSERT INTO public.phone_numbers (
      user_id, organization_id, number, area_code, provider
    ) VALUES (
      'a2000000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001',
      '+12025550179', '202', 'retell_native'
    );
    RAISE EXCEPTION 'browser claimed an arbitrary safe-test destination';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    UPDATE public.retell_agents
    SET retell_agent_id = 'retell-agent-forged'
    WHERE id = 'a4000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'browser replaced its provider agent identity';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    DELETE FROM public.phone_numbers
    WHERE id = 'a3000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'browser deleted provider inventory';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$browser_mutation_contract$;
RESET ROLE;
SELECT set_config('request.jwt.claim.role', '', true);
SELECT set_config('request.jwt.claim.sub', '', true);

DO $provider_identity_contract$
BEGIN
  IF (SELECT observed FROM provider_contract_result WHERE assertion = 'phone_rows') <> 1
    OR (SELECT observed FROM provider_contract_result WHERE assertion = 'agent_rows') <> 1
  THEN
    RAISE EXCEPTION 'provider inventory RLS leaked or hid tenant rows';
  END IF;

  IF (SELECT number FROM public.phone_numbers WHERE id = 'a3000000-0000-0000-0000-000000000001')
      <> '+12025550171'
  THEN
    RAISE EXCEPTION 'provider phone was not canonicalized to E.164';
  END IF;

  BEGIN
    INSERT INTO public.phone_numbers (
      user_id, organization_id, number, area_code, provider
    ) VALUES (
      'a2000000-0000-0000-0000-000000000002',
      'a1000000-0000-0000-0000-000000000002',
      '202.555.0171', '202', 'retell_native'
    );
    RAISE EXCEPTION 'same physical E.164 number was claimed by another tenant';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  BEGIN
    UPDATE public.phone_numbers
    SET retell_phone_id = 'retell-phone-replacement'
    WHERE id = 'a3000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'established provider phone identity was overwritten';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%PHONE_PROVIDER_IDENTITY_IMMUTABLE%' THEN
      RAISE;
    END IF;
  END;

  BEGIN
    UPDATE public.retell_agents
    SET organization_id = 'a1000000-0000-0000-0000-000000000002',
        user_id = 'a2000000-0000-0000-0000-000000000002'
    WHERE id = 'a4000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'provider agent was rebound to another tenant';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%PROVIDER_RESOURCE_TENANT_IDENTITY_IMMUTABLE%' THEN
      RAISE;
    END IF;
  END;

  BEGIN
    INSERT INTO public.retell_agents (
      user_id, organization_id, retell_agent_id, agent_name
    ) VALUES (
      'a2000000-0000-0000-0000-000000000002',
      'a1000000-0000-0000-0000-000000000002',
      'retell-agent-contract-a', 'Forged Duplicate Agent'
    );
    RAISE EXCEPTION 'same provider agent identity was claimed by another tenant';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END;
$provider_identity_contract$;

SET LOCAL ROLE service_role;
UPDATE public.retell_agents
SET agent_name = 'Service Synchronized Agent A'
WHERE id = 'a4000000-0000-0000-0000-000000000001';
RESET ROLE;

ROLLBACK;
