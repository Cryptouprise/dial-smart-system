-- Executed only against the isolated fresh-database certification project.
-- Every fixture and assertion is rolled back.

BEGIN;

DO $catalog_contract$
DECLARE
  object_count integer;
  key_columns text[];
  trigger_definition text;
BEGIN
  SELECT count(*) INTO object_count
  FROM pg_attribute
  WHERE attrelid = 'public.dnc_list'::regclass
    AND attname IN ('organization_id', 'phone_number_normalized')
    AND attnotnull
    AND NOT attisdropped;
  IF object_count <> 2 THEN
    RAISE EXCEPTION 'DNC tenant and normalized phone columns must both be non-null';
  END IF;

  SELECT count(*) INTO object_count
  FROM pg_constraint AS constraint_record
  WHERE constraint_record.conrelid = 'public.dnc_list'::regclass
    AND constraint_record.contype = 'u'
    AND (
      SELECT array_agg(attribute.attname::text ORDER BY attribute.attname)
      FROM unnest(constraint_record.conkey) AS key(attnum)
      JOIN pg_attribute AS attribute
        ON attribute.attrelid = constraint_record.conrelid
       AND attribute.attnum = key.attnum
    ) = ARRAY['organization_id', 'phone_number_normalized']::text[];
  IF object_count <> 1 THEN
    RAISE EXCEPTION 'DNC must have exactly one organization + normalized phone unique constraint';
  END IF;

  FOR key_columns IN
    SELECT (
      SELECT array_agg(attribute.attname::text ORDER BY attribute.attname)
      FROM unnest(index_record.indkey::smallint[]) AS key(attnum)
      JOIN pg_attribute AS attribute
        ON attribute.attrelid = index_record.indrelid
       AND attribute.attnum = key.attnum
    )
    FROM pg_index AS index_record
    WHERE index_record.indrelid = 'public.dnc_list'::regclass
      AND index_record.indisunique
      AND NOT index_record.indisprimary
  LOOP
    IF key_columns = ARRAY['phone_number', 'user_id']::text[]
      OR key_columns = ARRAY['phone_number_normalized', 'user_id']::text[]
    THEN
      RAISE EXCEPTION 'legacy cross-tenant DNC uniqueness survived: %', key_columns;
    END IF;
  END LOOP;

  SELECT pg_get_triggerdef(trigger_record.oid)
  INTO trigger_definition
  FROM pg_trigger AS trigger_record
  WHERE trigger_record.tgrelid = 'public.dnc_list'::regclass
    AND trigger_record.tgname = 'enforce_dnc_tenant_contract'
    AND NOT trigger_record.tgisinternal;
  IF trigger_definition IS NULL THEN
    RAISE EXCEPTION 'DNC tenant enforcement trigger is missing';
  END IF;

  IF has_function_privilege('anon', 'public.repair_dnc_tenant_scope()', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.repair_dnc_tenant_scope()', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.repair_dnc_tenant_scope()', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'DNC tenant repair is not service-role-only';
  END IF;
END;
$catalog_contract$;

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) VALUES
  ('00000000-0000-0000-0000-000000000000', '62000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'dnc-multitenant@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '62000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'dnc-ownerless@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

INSERT INTO public.organizations (id, name, slug) VALUES
  ('62100000-0000-0000-0000-000000000001', 'DNC Contract A', 'dnc-contract-a'),
  ('62100000-0000-0000-0000-000000000002', 'DNC Contract B', 'dnc-contract-b');

INSERT INTO public.organization_users (organization_id, user_id, role) VALUES
  ('62100000-0000-0000-0000-000000000001', '62000000-0000-0000-0000-000000000001', 'owner'),
  ('62100000-0000-0000-0000-000000000002', '62000000-0000-0000-0000-000000000001', 'member');

DO $tenant_uniqueness_contract$
DECLARE
  row_count integer;
  org_a_reason text;
  org_b_reason text;
  rejected boolean;
BEGIN
  INSERT INTO public.dnc_list (
    user_id, organization_id, phone_number, reason
  ) VALUES (
    '62000000-0000-0000-0000-000000000001',
    '62100000-0000-0000-0000-000000000001',
    '(303) 555-0100',
    'tenant-a'
  );
  INSERT INTO public.dnc_list (
    user_id, organization_id, phone_number, reason
  ) VALUES (
    '62000000-0000-0000-0000-000000000001',
    '62100000-0000-0000-0000-000000000002',
    '+1 303 555 0100',
    'tenant-b-first'
  );
  INSERT INTO public.dnc_list (
    user_id, organization_id, phone_number, reason
  ) VALUES (
    '62000000-0000-0000-0000-000000000001',
    '62100000-0000-0000-0000-000000000002',
    '303.555.0100',
    'tenant-b-updated'
  )
  ON CONFLICT (organization_id, phone_number_normalized)
  DO UPDATE SET reason = EXCLUDED.reason;

  SELECT count(*),
    max(reason) FILTER (WHERE organization_id = '62100000-0000-0000-0000-000000000001'),
    max(reason) FILTER (WHERE organization_id = '62100000-0000-0000-0000-000000000002')
  INTO row_count, org_a_reason, org_b_reason
  FROM public.dnc_list
  WHERE phone_number_normalized = '+13035550100';
  IF row_count <> 2 OR org_a_reason <> 'tenant-a' OR org_b_reason <> 'tenant-b-updated' THEN
    RAISE EXCEPTION 'tenant DNC upsert crossed organizations or duplicated within one: rows %, A %, B %',
      row_count, org_a_reason, org_b_reason;
  END IF;

  rejected := false;
  BEGIN
    INSERT INTO public.dnc_list (user_id, organization_id, phone_number)
    VALUES (
      '62000000-0000-0000-0000-000000000002',
      '62100000-0000-0000-0000-000000000002',
      '+13035550101'
    );
  EXCEPTION WHEN foreign_key_violation THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'DNC writer accepted an owner outside the target organization';
  END IF;

  rejected := false;
  BEGIN
    INSERT INTO public.dnc_list (user_id, organization_id, phone_number)
    VALUES (
      '62000000-0000-0000-0000-000000000001',
      '62100000-0000-0000-0000-000000000001',
      'not-a-phone'
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'DNC writer accepted a phone that cannot be normalized';
  END IF;
END;
$tenant_uniqueness_contract$;

-- Recreate a pre-contract null-tenant row inside this rollback-only database
-- and execute the same service repair used by the migration. The irreversible
-- boundary is installed after that repair in production, so suspend only its
-- trigger while recreating this historical migration state. The dedicated
-- browser-boundary contract verifies that the guard cannot be bypassed during
-- normal operation.
ALTER TABLE public.dnc_list DISABLE TRIGGER dnc_suppression_identity_guard;
ALTER TABLE public.dnc_list ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE public.dnc_list DISABLE TRIGGER enforce_dnc_tenant_contract;
INSERT INTO public.dnc_list (
  user_id, organization_id, phone_number, phone_number_normalized, reason
)
VALUES (
  '62000000-0000-0000-0000-000000000001',
  NULL,
  '(720) 555-0110',
  '+17205550110',
  'legacy fanout fixture'
);

SELECT * FROM public.repair_dnc_tenant_scope();
ALTER TABLE public.dnc_list ENABLE TRIGGER enforce_dnc_tenant_contract;

DO $fanout_contract$
DECLARE
  row_count integer;
BEGIN
  SELECT count(*) INTO row_count
  FROM public.dnc_list
  WHERE phone_number_normalized = '+17205550110';
  IF row_count <> 2 THEN
    RAISE EXCEPTION 'legacy null-tenant suppression did not fan out to both memberships: % rows', row_count;
  END IF;
  IF EXISTS (SELECT 1 FROM public.dnc_list WHERE organization_id IS NULL) THEN
    RAISE EXCEPTION 'legacy null-tenant suppression remained invisible after repair';
  END IF;
END;
$fanout_contract$;

-- A null-tenant row whose owner has no current membership must stop repair and
-- remain present for explicit operator assignment.
ALTER TABLE public.dnc_list DISABLE TRIGGER enforce_dnc_tenant_contract;
INSERT INTO public.dnc_list (
  user_id, organization_id, phone_number, phone_number_normalized, reason
)
VALUES (
  '62000000-0000-0000-0000-000000000002',
  NULL,
  '+17205550111',
  '+17205550111',
  'ownerless legacy fixture'
);

DO $ownerless_contract$
DECLARE
  rejected boolean := false;
BEGIN
  BEGIN
    PERFORM * FROM public.repair_dnc_tenant_scope();
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%DNC_TENANT_REPAIR_REQUIRED%' THEN
      rejected := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'ownerless legacy DNC suppression did not fail closed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.dnc_list
    WHERE user_id = '62000000-0000-0000-0000-000000000002'
      AND organization_id IS NULL
      AND phone_number = '+17205550111'
  ) THEN
    RAISE EXCEPTION 'ownerless legacy DNC suppression was discarded on failed repair';
  END IF;
END;
$ownerless_contract$;

ALTER TABLE public.dnc_list ENABLE TRIGGER enforce_dnc_tenant_contract;

DELETE FROM public.dnc_list
WHERE user_id = '62000000-0000-0000-0000-000000000002'
  AND organization_id IS NULL;
ALTER TABLE public.dnc_list ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.dnc_list ENABLE TRIGGER dnc_suppression_identity_guard;

ROLLBACK;
