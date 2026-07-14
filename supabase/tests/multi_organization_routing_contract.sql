-- Executed only against the isolated fresh-database certification project.
-- Every fixture and assertion is rolled back.

BEGIN;

DO $catalog_contract$
DECLARE
  table_name text;
  policy_count integer;
  expected_policy_count integer;
  definition text;
  rls_enabled boolean;
  object_count integer;
BEGIN
  SELECT count(*) INTO object_count
  FROM pg_attribute
  WHERE attrelid IN (
      'public.campaigns'::regclass,
      'public.leads'::regclass,
      'public.phone_numbers'::regclass,
      'public.call_logs'::regclass
    )
    AND attname = 'organization_id'
    AND attnotnull
    AND NOT attisdropped;
  IF object_count <> 4 THEN
    RAISE EXCEPTION 'Every core routing table must have a non-null organization_id';
  END IF;

  SELECT count(*) INTO object_count
  FROM pg_constraint
  WHERE conname IN (
      'campaigns_organization_id_fkey',
      'leads_organization_id_fkey',
      'phone_numbers_organization_id_fkey',
      'call_logs_organization_id_fkey'
    )
    AND contype = 'f'
    AND confrelid = 'public.organizations'::regclass
    AND confdeltype = 'r';
  IF object_count <> 4 THEN
    RAISE EXCEPTION 'Core organization foreign keys must all be canonical ON DELETE RESTRICT constraints';
  END IF;

  SELECT count(*) INTO object_count
  FROM pg_constraint
  WHERE conname IN (
      'campaigns_organization_user_membership_fkey',
      'leads_organization_user_membership_fkey',
      'phone_numbers_organization_user_membership_fkey',
      'call_logs_organization_user_membership_fkey'
    )
    AND contype = 'f'
    AND confrelid = 'public.organization_users'::regclass
    AND confdeltype = 'r'
    AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (organization_id, user_id)%';
  IF object_count <> 4 THEN
    RAISE EXCEPTION 'Core ownership is not protected by all four membership RESTRICT foreign keys';
  END IF;

  SELECT count(*) INTO object_count
  FROM pg_constraint
  WHERE conname IN (
      'slack_users_organization_user_membership_fkey',
      'api_keys_organization_user_membership_fkey'
    )
    AND contype = 'f'
    AND confrelid = 'public.organization_users'::regclass
    AND confdeltype = 'c';
  IF object_count <> 2 THEN
    RAISE EXCEPTION 'Organization-bound credentials must be removed with their membership';
  END IF;

  FOREACH table_name IN ARRAY ARRAY['campaigns', 'leads', 'phone_numbers', 'call_logs']
  LOOP
    -- Provider phone inventory is intentionally browser read-only after the
    -- later provider-resource boundary; the other three core resources retain
    -- their four membership-guarded CRUD policies.
    expected_policy_count := CASE WHEN table_name = 'phone_numbers' THEN 1 ELSE 4 END;

    SELECT relation.relrowsecurity
    INTO rls_enabled
    FROM pg_class AS relation
    WHERE relation.oid = format('public.%I', table_name)::regclass;
    IF rls_enabled IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'RLS is disabled on public.%', table_name;
    END IF;

    SELECT count(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = table_name;
    IF policy_count <> expected_policy_count THEN
      RAISE EXCEPTION 'public.% must have exactly % canonical tenant policies, found %',
        table_name, expected_policy_count, policy_count;
    END IF;

    SELECT count(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = table_name
      AND roles @> ARRAY['authenticated'::name]
      AND (
        COALESCE(qual, '') LIKE '%user_in_organization%'
        OR COALESCE(with_check, '') LIKE '%user_in_organization%'
      );
    IF policy_count <> expected_policy_count THEN
      RAISE EXCEPTION 'Every public.% policy must require current organization membership', table_name;
    END IF;
  END LOOP;

  SELECT count(*) INTO object_count
  FROM pg_trigger
  WHERE tgname IN (
      'campaigns_require_authoritative_tenant',
      'leads_require_authoritative_tenant',
      'phone_numbers_require_authoritative_tenant',
      'call_logs_require_authoritative_tenant',
      'call_logs_same_tenant_graph',
      'campaign_leads_same_tenant',
      'campaign_phone_pools_same_tenant',
      'dialing_queues_same_tenant'
    )
    AND tgenabled <> 'D'
    AND NOT tgisinternal;
  IF object_count <> 8 THEN
    RAISE EXCEPTION 'One or more authoritative tenant-graph triggers are missing or disabled';
  END IF;

  IF to_regclass('public.organization_membership_transfers') IS NULL
    OR to_regprocedure(
      'public.transfer_organization_membership_resources(uuid,uuid,uuid,text,boolean)'
    ) IS NULL
  THEN
    RAISE EXCEPTION 'Certified organization membership transfer contract is missing';
  END IF;

  SELECT relrowsecurity INTO rls_enabled
  FROM pg_class
  WHERE oid = 'public.organization_membership_transfers'::regclass;
  IF rls_enabled IS DISTINCT FROM true
    OR EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'organization_membership_transfers'
    )
    OR has_table_privilege('anon', 'public.organization_membership_transfers', 'SELECT')
    OR has_table_privilege('authenticated', 'public.organization_membership_transfers', 'SELECT')
    OR has_table_privilege('service_role', 'public.organization_membership_transfers', 'INSERT')
  THEN
    RAISE EXCEPTION 'Transfer authorization rows are directly accessible outside their definer RPC';
  END IF;

  IF has_function_privilege(
      'anon',
      'public.transfer_organization_membership_resources(uuid,uuid,uuid,text,boolean)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'authenticated',
      'public.transfer_organization_membership_resources(uuid,uuid,uuid,text,boolean)',
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'service_role',
      'public.transfer_organization_membership_resources(uuid,uuid,uuid,text,boolean)',
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'Membership transfer RPC is not service-role-only';
  END IF;

  SELECT upper(pg_get_functiondef(to_regprocedure(
    'public.enforce_tenant_owned_core_resource()'
  ))) INTO definition;
  IF position('ORGANIZATION OWNERSHIP IS IMMUTABLE' IN definition) = 0
    OR position('ORGANIZATION_MEMBERSHIP_TRANSFERS' IN definition) = 0
    OR position('TRANSACTION_ID = TXID_CURRENT()' IN definition) = 0
    OR position('STATE = ''PROCESSING''' IN definition) = 0
    OR position('FROM_USER_ID = OLD.USER_ID' IN definition) = 0
    OR position('TO_USER_ID = NEW.USER_ID' IN definition) = 0
  THEN
    RAISE EXCEPTION 'Core ownership trigger does not require one exact transaction-bound transfer';
  END IF;

  SELECT upper(pg_get_functiondef(to_regprocedure(
    'public.transfer_organization_membership_resources(uuid,uuid,uuid,text,boolean)'
  ))) INTO definition;
  IF position('PROVIDER_EVIDENCE_TRANSFER_REQUIRED' IN definition) = 0
    OR position('ACTIVE_DISPATCH_TRANSFER_FORBIDDEN' IN definition) = 0
    OR position('FROM PUBLIC.ORGANIZATION_USERS AS MEMBERSHIP' IN definition) = 0
    OR position('ORDER BY MEMBERSHIP.USER_ID' IN definition) = 0
    OR position('FROM PUBLIC.CAMPAIGNS AS CAMPAIGN' IN definition) = 0
    OR position('FROM PUBLIC.LEADS AS LEAD' IN definition) = 0
    OR position('FROM PUBLIC.PHONE_NUMBERS AS PHONE' IN definition) = 0
    OR position('UPDATE PUBLIC.CAMPAIGNS' IN definition) = 0
    OR position('UPDATE PUBLIC.LEADS' IN definition) = 0
    OR position('UPDATE PUBLIC.PHONE_NUMBERS' IN definition) = 0
    OR position('UPDATE PUBLIC.CALL_LOGS' IN definition) = 0
    OR position('UPDATE PUBLIC.CAMPAIGN_PHONE_POOLS' IN definition) = 0
    OR position('DELETE FROM PUBLIC.ORGANIZATION_USERS' IN definition) = 0
    OR position('STATE = ''COMPLETED''' IN definition) = 0
  THEN
    RAISE EXCEPTION 'Certified transfer RPC omits a required fail-closed phase';
  END IF;
END;
$catalog_contract$;

-- Prove the legacy backfill rule does not guess when a user has multiple
-- memberships. The production columns are now NOT NULL, so this isolated model
-- exercises the exact unique-membership predicate used before that boundary.
CREATE TEMP TABLE ambiguous_legacy_resource (
  user_id uuid NOT NULL,
  organization_id uuid
);

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
  ('00000000-0000-0000-0000-000000000000', '32000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'contract-source@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Contract Source"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '32000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'contract-target@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Contract Target"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '32000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'contract-viewer@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Contract Viewer"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '32000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'contract-outsider@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Contract Outsider"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '32000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'contract-ambiguous@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Contract Ambiguous"}', now(), now());

INSERT INTO public.organizations (id, name, slug) VALUES
  ('31000000-0000-0000-0000-000000000001', 'Tenant Contract A', 'tenant-contract-a'),
  ('31000000-0000-0000-0000-000000000002', 'Tenant Contract B', 'tenant-contract-b');

INSERT INTO public.organization_users (organization_id, user_id, role) VALUES
  ('31000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001', 'member'),
  ('31000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000002', 'owner'),
  ('31000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000003', 'member'),
  ('31000000-0000-0000-0000-000000000002', '32000000-0000-0000-0000-000000000004', 'owner'),
  ('31000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000005', 'member'),
  ('31000000-0000-0000-0000-000000000002', '32000000-0000-0000-0000-000000000005', 'member');

INSERT INTO ambiguous_legacy_resource(user_id)
VALUES ('32000000-0000-0000-0000-000000000005');

WITH unique_membership AS (
  SELECT user_id, min(organization_id::text)::uuid AS organization_id
  FROM public.organization_users
  GROUP BY user_id
  HAVING count(DISTINCT organization_id) = 1
)
UPDATE ambiguous_legacy_resource AS resource
SET organization_id = membership.organization_id
FROM unique_membership AS membership
WHERE resource.organization_id IS NULL
  AND resource.user_id = membership.user_id;

DO $ambiguous_backfill$
BEGIN
  IF EXISTS (
    SELECT 1 FROM ambiguous_legacy_resource
    WHERE organization_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Multi-membership legacy ownership was guessed instead of remaining launch-blocking';
  END IF;
END;
$ambiguous_backfill$;

INSERT INTO public.campaigns (
  id, user_id, organization_id, name
) VALUES (
  '33000000-0000-0000-0000-000000000001',
  '32000000-0000-0000-0000-000000000001',
  '31000000-0000-0000-0000-000000000001',
  'Transfer Contract Campaign'
);

INSERT INTO public.leads (
  id, user_id, organization_id, phone_number
) VALUES (
  '34000000-0000-0000-0000-000000000001',
  '32000000-0000-0000-0000-000000000001',
  '31000000-0000-0000-0000-000000000001',
  '+12025550111'
);

INSERT INTO public.phone_numbers (
  id, user_id, organization_id, number, area_code
) VALUES (
  '35000000-0000-0000-0000-000000000001',
  '32000000-0000-0000-0000-000000000001',
  '31000000-0000-0000-0000-000000000001',
  '+12025550112',
  '202'
);

INSERT INTO public.campaign_leads (id, campaign_id, lead_id) VALUES (
  '36000000-0000-0000-0000-000000000001',
  '33000000-0000-0000-0000-000000000001',
  '34000000-0000-0000-0000-000000000001'
);

INSERT INTO public.campaign_phone_pools (
  id, campaign_id, phone_number_id, user_id
) VALUES (
  '37000000-0000-0000-0000-000000000001',
  '33000000-0000-0000-0000-000000000001',
  '35000000-0000-0000-0000-000000000001',
  '32000000-0000-0000-0000-000000000001'
);

INSERT INTO public.dialing_queues (
  id, campaign_id, lead_id, phone_number, status
) VALUES (
  '38000000-0000-0000-0000-000000000001',
  '33000000-0000-0000-0000-000000000001',
  '34000000-0000-0000-0000-000000000001',
  '+12025550111',
  'pending'
);

INSERT INTO public.call_logs (
  id,
  user_id,
  organization_id,
  campaign_id,
  lead_id,
  phone_number,
  caller_id,
  status
) VALUES (
  '39000000-0000-0000-0000-000000000001',
  '32000000-0000-0000-0000-000000000001',
  '31000000-0000-0000-0000-000000000001',
  '33000000-0000-0000-0000-000000000001',
  '34000000-0000-0000-0000-000000000001',
  '+12025550111',
  '+12025550112',
  'completed'
);

DO $trigger_behavior$
BEGIN
  BEGIN
    UPDATE public.campaigns
    SET user_id = '32000000-0000-0000-0000-000000000002'
    WHERE id = '33000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'Direct resource-owner mutation bypassed the certified transfer RPC';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.leads (
      id, user_id, organization_id, phone_number
    ) VALUES (
      '34000000-0000-0000-0000-000000000099',
      '32000000-0000-0000-0000-000000000004',
      '31000000-0000-0000-0000-000000000001',
      '+12025550199'
    );
    RAISE EXCEPTION 'Cross-organization resource insert passed tenant enforcement';
  EXCEPTION
    WHEN insufficient_privilege OR foreign_key_violation THEN
      NULL;
  END;

  BEGIN
    INSERT INTO public.call_logs (
      id,
      user_id,
      organization_id,
      campaign_id,
      lead_id,
      phone_number,
      caller_id,
      status
    ) VALUES (
      '39000000-0000-0000-0000-000000000099',
      '32000000-0000-0000-0000-000000000003',
      '31000000-0000-0000-0000-000000000001',
      '33000000-0000-0000-0000-000000000001',
      '34000000-0000-0000-0000-000000000001',
      '+12025550198',
      '+12025550112',
      'completed'
    );
    RAISE EXCEPTION 'Call-log relationship accepted a different member as its campaign/lead owner';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$trigger_behavior$;

-- Even if a privileged writer bypasses the certified claim RPC after the
-- migration, the reconciler's exact tenant join must ignore that corrupt row
-- and must not quarantine the unrelated call log. The sentinel exception rolls
-- the deliberately corrupt fixture back after the assertions pass.
DO $reconciler_tenant_join$
BEGIN
  BEGIN
    INSERT INTO public.provider_dispatch_claims (
      id,
      logical_key,
      call_log_id,
      organization_id,
      user_id,
      campaign_id,
      lead_id,
      provider,
      status,
      claimed_at,
      identity_contract_version
    ) VALUES (
      '3a000000-0000-0000-0000-000000000099',
      'multi-org-contract-mismatched-dispatch',
      '39000000-0000-0000-0000-000000000001',
      '31000000-0000-0000-0000-000000000002',
      '32000000-0000-0000-0000-000000000004',
      NULL,
      NULL,
      'retell',
      'acceptance_unknown',
      now() - interval '5 minutes',
      1
    );

    PERFORM 1 FROM public.claim_retell_reconciliation_jobs(1);

    IF EXISTS (
        SELECT 1
        FROM public.provider_reconciliation_jobs
        WHERE dispatch_claim_id = '3a000000-0000-0000-0000-000000000099'
      )
      OR EXISTS (
        SELECT 1
        FROM public.call_logs
        WHERE id = '39000000-0000-0000-0000-000000000001'
          AND provider_reconciliation_required = true
      )
    THEN
      RAISE EXCEPTION 'Reconciler crossed a mismatched dispatch/call-log tenant graph';
    END IF;

    RAISE EXCEPTION 'rollback deliberate mismatched dispatch'
      USING ERRCODE = 'P0002';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    NULL;
  END;
END;
$reconciler_tenant_join$;

-- Positive provider identity is immutable. Prove that even a perfectly
-- tenant-matched historical dispatch makes the core transfer fail closed.
DO $provider_evidence_block$
BEGIN
  BEGIN
    INSERT INTO public.provider_dispatch_claims (
      id,
      logical_key,
      call_log_id,
      organization_id,
      user_id,
      campaign_id,
      lead_id,
      provider,
      status,
      identity_contract_version
    ) VALUES (
      '3a000000-0000-0000-0000-000000000001',
      'multi-org-contract-provider-dispatch',
      '39000000-0000-0000-0000-000000000001',
      '31000000-0000-0000-0000-000000000001',
      '32000000-0000-0000-0000-000000000001',
      '33000000-0000-0000-0000-000000000001',
      '34000000-0000-0000-0000-000000000001',
      'retell',
      'definite_failure',
      1
    );

    PERFORM public.transfer_organization_membership_resources(
      '31000000-0000-0000-0000-000000000001',
      '32000000-0000-0000-0000-000000000001',
      '32000000-0000-0000-0000-000000000002',
      'Contract provider evidence rejection',
      true
    );
    RAISE EXCEPTION 'Provider-bound ownership was reassigned by the core transfer RPC';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;
END;
$provider_evidence_block$;

DO $certified_transfer$
DECLARE
  result record;
BEGIN
  SELECT * INTO STRICT result
  FROM public.transfer_organization_membership_resources(
    '31000000-0000-0000-0000-000000000001',
    '32000000-0000-0000-0000-000000000001',
    '32000000-0000-0000-0000-000000000002',
    'Contract verifies safe offboarding',
    true
  );

  IF result.campaigns_transferred <> 1
    OR result.leads_transferred <> 1
    OR result.phone_numbers_transferred <> 1
    OR result.call_logs_transferred <> 1
    OR result.phone_pools_transferred <> 1
    OR result.membership_removed IS DISTINCT FROM true
  THEN
    RAISE EXCEPTION 'Certified transfer returned incorrect resource counts: %', row_to_json(result);
  END IF;

  IF EXISTS (
      SELECT 1 FROM public.organization_users
      WHERE organization_id = '31000000-0000-0000-0000-000000000001'
        AND user_id = '32000000-0000-0000-0000-000000000001'
    )
    OR EXISTS (
      SELECT 1 FROM public.campaigns
      WHERE organization_id = '31000000-0000-0000-0000-000000000001'
        AND user_id <> '32000000-0000-0000-0000-000000000002'
    )
    OR EXISTS (
      SELECT 1 FROM public.leads
      WHERE organization_id = '31000000-0000-0000-0000-000000000001'
        AND id = '34000000-0000-0000-0000-000000000001'
        AND user_id <> '32000000-0000-0000-0000-000000000002'
    )
    OR EXISTS (
      SELECT 1 FROM public.phone_numbers
      WHERE organization_id = '31000000-0000-0000-0000-000000000001'
        AND id = '35000000-0000-0000-0000-000000000001'
        AND user_id <> '32000000-0000-0000-0000-000000000002'
    )
    OR EXISTS (
      SELECT 1 FROM public.call_logs
      WHERE organization_id = '31000000-0000-0000-0000-000000000001'
        AND id = '39000000-0000-0000-0000-000000000001'
        AND user_id <> '32000000-0000-0000-0000-000000000002'
    )
    OR EXISTS (
      SELECT 1 FROM public.campaign_phone_pools
      WHERE id = '37000000-0000-0000-0000-000000000001'
        AND user_id <> '32000000-0000-0000-0000-000000000002'
    )
  THEN
    RAISE EXCEPTION 'Certified transfer did not atomically move and offboard the source graph';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_membership_transfers
    WHERE id = result.transfer_id
      AND state = 'completed'
      AND membership_removed = true
      AND completed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Certified transfer did not persist its completed audit record';
  END IF;
END;
$certified_transfer$;

-- Exercise the real RLS policies with authenticated JWT identities.
CREATE TEMP TABLE multi_org_rls_results (
  assertion text PRIMARY KEY,
  observed integer NOT NULL
);
GRANT SELECT, INSERT ON multi_org_rls_results TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '32000000-0000-0000-0000-000000000003', true);
INSERT INTO multi_org_rls_results
SELECT 'member_select', count(*)::integer
FROM public.campaigns
WHERE id = '33000000-0000-0000-0000-000000000001';
WITH changed AS (
  UPDATE public.campaigns
  SET description = 'viewer must not write'
  WHERE id = '33000000-0000-0000-0000-000000000001'
  RETURNING 1
)
INSERT INTO multi_org_rls_results
SELECT 'member_update', count(*)::integer FROM changed;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '32000000-0000-0000-0000-000000000001', true);
INSERT INTO multi_org_rls_results
SELECT 'removed_member_select', count(*)::integer
FROM public.campaigns
WHERE id = '33000000-0000-0000-0000-000000000001';
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '32000000-0000-0000-0000-000000000004', true);
INSERT INTO multi_org_rls_results
SELECT 'other_org_select', count(*)::integer
FROM public.campaigns
WHERE id = '33000000-0000-0000-0000-000000000001';
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '32000000-0000-0000-0000-000000000002', true);
WITH changed AS (
  UPDATE public.campaigns
  SET description = 'target owner update'
  WHERE id = '33000000-0000-0000-0000-000000000001'
  RETURNING 1
)
INSERT INTO multi_org_rls_results
SELECT 'target_update', count(*)::integer FROM changed;
RESET ROLE;

DO $rls_behavior$
BEGIN
  IF (SELECT observed FROM multi_org_rls_results WHERE assertion = 'member_select') <> 1
    OR (SELECT observed FROM multi_org_rls_results WHERE assertion = 'member_update') <> 0
    OR (SELECT observed FROM multi_org_rls_results WHERE assertion = 'removed_member_select') <> 0
    OR (SELECT observed FROM multi_org_rls_results WHERE assertion = 'other_org_select') <> 0
    OR (SELECT observed FROM multi_org_rls_results WHERE assertion = 'target_update') <> 1
  THEN
    RAISE EXCEPTION 'Core multi-organization RLS behavior is not fail-closed: %',
      (SELECT jsonb_object_agg(assertion, observed) FROM multi_org_rls_results);
  END IF;
END;
$rls_behavior$;

ROLLBACK;
