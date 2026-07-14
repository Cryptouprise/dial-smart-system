-- Executed only against the isolated fresh-database certification project.

BEGIN;

DO $catalog_contract$
DECLARE
  relation_name text;
  policy_count integer;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['pricing_tiers', 'agent_pricing']
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
      RAISE EXCEPTION '% grants do not enforce read-only browser/service ownership', relation_name;
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
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.agent_pricing'::regclass
      AND conname = 'agent_pricing_organization_retell_agent_key'
      AND contype = 'u'
  ) THEN
    RAISE EXCEPTION 'tenant/Retell agent pricing identity is not unique';
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
    '92000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'pricing-a@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Pricing A"}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '92000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'pricing-b@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Pricing B"}', now(), now()
  );

INSERT INTO public.organizations (id, name, slug) VALUES
  ('91000000-0000-0000-0000-000000000001', 'Pricing Tenant A', 'pricing-tenant-a'),
  ('91000000-0000-0000-0000-000000000002', 'Pricing Tenant B', 'pricing-tenant-b');
INSERT INTO public.organization_users (organization_id, user_id, role) VALUES
  ('91000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', 'owner'),
  ('91000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000002', 'owner');

INSERT INTO public.pricing_tiers (
  tier_type, tier_name, display_name, base_cost_per_min_cents
) VALUES ('test', 'contract', 'Contract Tier', 1.25);

INSERT INTO public.agent_pricing (
  organization_id, retell_agent_id, agent_name,
  base_cost_per_min_cents, markup_cents, customer_price_per_min_cents
) VALUES
  (
    '91000000-0000-0000-0000-000000000001', 'retell-shared-agent', 'Tenant A Agent',
    7.5, 4.5, 12
  ),
  (
    '91000000-0000-0000-0000-000000000002', 'retell-shared-agent', 'Tenant B Agent',
    8, 5, 13
  );

CREATE TEMP TABLE pricing_contract_result (
  assertion text PRIMARY KEY,
  observed integer NOT NULL
);
GRANT SELECT, INSERT ON pricing_contract_result TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claim.sub',
  '92000000-0000-0000-0000-000000000001',
  true
);

INSERT INTO pricing_contract_result(assertion, observed)
SELECT 'tenant_agent_rows', count(*)::integer
FROM public.agent_pricing;
INSERT INTO pricing_contract_result(assertion, observed)
SELECT 'active_tier_rows', count(*)::integer
FROM public.pricing_tiers;

DO $browser_mutation_contract$
BEGIN
  BEGIN
    UPDATE public.agent_pricing
    SET customer_price_per_min_cents = 1
    WHERE organization_id = '91000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'tenant browser changed its own billable price';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.pricing_tiers (
      tier_type, tier_name, display_name, base_cost_per_min_cents
    ) VALUES ('browser', 'forged', 'Forged Tier', 0);
    RAISE EXCEPTION 'tenant browser wrote platform provider cost data';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$browser_mutation_contract$;
RESET ROLE;
SELECT set_config('request.jwt.claim.role', '', true);
SELECT set_config('request.jwt.claim.sub', '', true);

DO $behavior_contract$
BEGIN
  IF (SELECT observed FROM pricing_contract_result WHERE assertion = 'tenant_agent_rows') <> 1
    OR (SELECT observed FROM pricing_contract_result WHERE assertion = 'active_tier_rows') <> 1
  THEN
    RAISE EXCEPTION 'pricing RLS leaked or hid the wrong rows: %',
      (SELECT jsonb_object_agg(assertion, observed) FROM pricing_contract_result);
  END IF;

  BEGIN
    INSERT INTO public.agent_pricing (
      organization_id, retell_agent_id,
      base_cost_per_min_cents, markup_cents, customer_price_per_min_cents
    ) VALUES (
      '91000000-0000-0000-0000-000000000001', 'unsafe-negative-margin',
      20, 0, 10
    );
    RAISE EXCEPTION 'negative-margin active agent pricing was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END;
$behavior_contract$;

ROLLBACK;
