-- Executed only against the isolated fresh-database certification project.

BEGIN;

DO $catalog_contract$
DECLARE
  relation_name text;
  policy_count integer;
  definition text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'organizations',
    'organization_credits',
    'credit_transactions',
    'usage_summaries'
  ]
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
      OR has_table_privilege(
        'anon', format('public.%I', relation_name), 'INSERT')
      OR has_table_privilege(
        'anon', format('public.%I', relation_name), 'UPDATE')
      OR has_table_privilege(
        'anon', format('public.%I', relation_name), 'DELETE')
    THEN
      RAISE EXCEPTION '% browser grants are not authenticated read-only', relation_name;
    END IF;

    IF NOT has_table_privilege(
        'service_role', format('public.%I', relation_name), 'SELECT')
      OR NOT has_table_privilege(
        'service_role', format('public.%I', relation_name), 'INSERT')
      OR NOT has_table_privilege(
        'service_role', format('public.%I', relation_name), 'UPDATE')
      OR NOT has_table_privilege(
        'service_role', format('public.%I', relation_name), 'DELETE')
    THEN
      RAISE EXCEPTION '% lacks its trusted service grants', relation_name;
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
        AND (
          cmd <> 'SELECT'
          OR roles <> ARRAY['authenticated'::name]
        )
    ) THEN
      RAISE EXCEPTION '% does not have exactly one authenticated SELECT policy', relation_name;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class
    WHERE oid = 'public.organization_credit_status'::regclass
      AND COALESCE(reloptions, ARRAY[]::text[]) @> ARRAY['security_invoker=true']
  ) OR NOT has_table_privilege(
    'authenticated', 'public.organization_credit_status', 'SELECT'
  ) OR has_table_privilege(
    'anon', 'public.organization_credit_status', 'SELECT'
  ) THEN
    RAISE EXCEPTION 'organization_credit_status is not an authenticated RLS-invoker view';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.organization_credits'::regclass
      AND tgname = 'organization_credit_balance_owner'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'canonical balance ownership trigger is missing';
  END IF;

  IF has_function_privilege(
    'authenticated', 'public.protect_organization_credit_balance()', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'browser role can invoke the internal balance ownership trigger';
  END IF;

  SELECT pg_get_functiondef(
    'public.reserve_credits(uuid,integer,uuid,text,text,integer,text)'::regprocedure
  ) INTO definition;
  IF definition NOT LIKE '%app.credit_ledger_writer%credit-ledger-v1%' THEN
    RAISE EXCEPTION 'reserve_credits does not identify itself to the balance owner trigger';
  END IF;
  SELECT pg_get_functiondef(
    'public.finalize_call_cost(uuid,uuid,text,numeric,integer,text,text)'::regprocedure
  ) INTO definition;
  IF definition NOT LIKE '%app.credit_ledger_writer%credit-ledger-v1%' THEN
    RAISE EXCEPTION 'finalize_call_cost does not identify itself to the balance owner trigger';
  END IF;
  SELECT pg_get_functiondef(
    'public.add_credits(uuid,integer,text,text,text,text)'::regprocedure
  ) INTO definition;
  IF definition NOT LIKE '%app.credit_ledger_writer%credit-ledger-v1%' THEN
    RAISE EXCEPTION 'add_credits does not identify itself to the balance owner trigger';
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
  (
    '00000000-0000-0000-0000-000000000000',
    '82000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'billing-a@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Billing A"}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '82000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'billing-b@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Billing B"}', now(), now()
  );

INSERT INTO public.organizations (id, name, slug, billing_enabled) VALUES
  ('81000000-0000-0000-0000-000000000001', 'Billing Tenant A', 'billing-tenant-a', true),
  ('81000000-0000-0000-0000-000000000002', 'Billing Tenant B', 'billing-tenant-b', true);
INSERT INTO public.organization_users (organization_id, user_id, role) VALUES
  ('81000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', 'owner'),
  ('81000000-0000-0000-0000-000000000002', '82000000-0000-0000-0000-000000000002', 'owner');

DO $canonical_funding_contract$
DECLARE
  result record;
BEGIN
  SELECT * INTO result FROM public.add_credits(
    '81000000-0000-0000-0000-000000000001',
    500,
    'manual_add',
    'billing ownership fixture A',
    'billing-owner-a',
    NULL
  );
  IF result.success IS DISTINCT FROM true OR result.new_balance_cents <> 500 THEN
    RAISE EXCEPTION 'canonical funding failed for tenant A: %', row_to_json(result);
  END IF;

  SELECT * INTO result FROM public.add_credits(
    '81000000-0000-0000-0000-000000000002',
    700,
    'manual_add',
    'billing ownership fixture B',
    'billing-owner-b',
    NULL
  );
  IF result.success IS DISTINCT FROM true OR result.new_balance_cents <> 700 THEN
    RAISE EXCEPTION 'canonical funding failed for tenant B: %', row_to_json(result);
  END IF;
END;
$canonical_funding_contract$;
SELECT set_config('app.credit_ledger_writer', '', true);

-- Even a trusted table writer cannot mutate balances outside the canonical
-- ledger functions; this protects against accidental service-side drift.
DO $direct_balance_contract$
BEGIN
  BEGIN
    UPDATE public.organization_credits
    SET balance_cents = 999999
    WHERE organization_id = '81000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'direct service/owner balance mutation bypassed the ledger';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%CREDIT_BALANCE_LEDGER_OWNERSHIP_REQUIRED%' THEN
      RAISE;
    END IF;
  END;

  BEGIN
    INSERT INTO public.organization_credits (organization_id, balance_cents)
    VALUES ('81000000-0000-0000-0000-000000000099', 10);
    RAISE EXCEPTION 'non-zero credit account initialization bypassed the ledger';
  EXCEPTION
    WHEN foreign_key_violation THEN
      RAISE EXCEPTION 'balance ownership trigger ran after unrelated FK enforcement';
    WHEN insufficient_privilege THEN
      IF SQLERRM NOT LIKE '%CREDIT_BALANCE_LEDGER_OWNERSHIP_REQUIRED%' THEN
        RAISE;
      END IF;
  END;
END;
$direct_balance_contract$;

CREATE TEMP TABLE billing_rls_result (
  assertion text PRIMARY KEY,
  observed integer NOT NULL
);
GRANT SELECT, INSERT ON billing_rls_result TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '82000000-0000-0000-0000-000000000001',
  true
);
INSERT INTO billing_rls_result(assertion, observed)
SELECT 'tenant_view_rows', count(*)::integer
FROM public.organization_credit_status;

DO $browser_mutation_contract$
BEGIN
  BEGIN
    UPDATE public.organizations
    SET billing_enabled = false
    WHERE id = '81000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'tenant browser disabled platform-owned billing';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    UPDATE public.organization_credits
    SET balance_cents = 999999
    WHERE organization_id = '81000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'tenant browser minted credits directly';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    DELETE FROM public.credit_transactions
    WHERE organization_id = '81000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'tenant browser deleted immutable credit evidence';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$browser_mutation_contract$;
RESET ROLE;

DO $tenant_view_contract$
DECLARE
  balance integer;
BEGIN
  IF (SELECT observed FROM billing_rls_result WHERE assertion = 'tenant_view_rows') <> 1 THEN
    RAISE EXCEPTION 'RLS-invoker status view leaked another tenant';
  END IF;
  SELECT balance_cents INTO balance
  FROM public.organization_credits
  WHERE organization_id = '81000000-0000-0000-0000-000000000001';
  IF balance <> 500 OR EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = '81000000-0000-0000-0000-000000000001'
      AND billing_enabled = false
  ) THEN
    RAISE EXCEPTION 'blocked browser mutation changed billing state: balance %', balance;
  END IF;
END;
$tenant_view_contract$;

ROLLBACK;
