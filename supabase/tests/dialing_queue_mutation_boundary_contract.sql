-- Executed only against the isolated fresh-database certification project.

BEGIN;

DO $catalog_contract$
DECLARE
  policy_count integer;
  unsafe_column_grants integer;
  definition text;
BEGIN
  IF NOT has_table_privilege('authenticated', 'public.dialing_queues', 'SELECT')
    OR has_table_privilege('authenticated', 'public.dialing_queues', 'INSERT')
    OR has_table_privilege('authenticated', 'public.dialing_queues', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.dialing_queues', 'DELETE')
    OR has_table_privilege('anon', 'public.dialing_queues', 'SELECT')
    OR has_table_privilege('anon', 'public.dialing_queues', 'INSERT')
    OR has_table_privilege('anon', 'public.dialing_queues', 'UPDATE')
    OR has_table_privilege('anon', 'public.dialing_queues', 'DELETE')
  THEN
    RAISE EXCEPTION 'dialing queue browser table privileges are not read-only authenticated access';
  END IF;

  SELECT count(*) INTO unsafe_column_grants
  FROM information_schema.column_privileges
  WHERE table_schema = 'public'
    AND table_name = 'dialing_queues'
    AND grantee IN ('anon', 'authenticated', 'PUBLIC')
    AND privilege_type IN ('INSERT', 'UPDATE', 'REFERENCES');
  IF unsafe_column_grants <> 0 THEN
    RAISE EXCEPTION 'browser roles retain % unsafe dialing queue column grants', unsafe_column_grants;
  END IF;

  SELECT count(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'dialing_queues';
  IF policy_count <> 1 OR NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'dialing_queues'
      AND policyname = 'Members view tenant dialing queues'
      AND cmd = 'SELECT'
      AND roles = ARRAY['authenticated'::name]
  ) THEN
    RAISE EXCEPTION 'dialing queues must expose exactly one authenticated SELECT policy';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.dialing_queues'::regclass
      AND tgname = 'dialing_queue_provider_evidence_delete_guard'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'provider-evidence queue deletion guard is missing';
  END IF;

  IF has_function_privilege('anon',
      'public.enqueue_dialing_queue(uuid,uuid,timestamptz,integer)', 'EXECUTE')
    OR has_function_privilege('authenticated',
      'public.enqueue_dialing_queue(uuid,uuid,timestamptz,integer)', 'EXECUTE')
    OR has_function_privilege('authenticated',
      'public.cancel_dialing_queues(uuid,uuid,uuid,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role',
      'public.enqueue_dialing_queue(uuid,uuid,timestamptz,integer)', 'EXECUTE')
    OR NOT has_function_privilege('service_role',
      'public.cancel_dialing_queues(uuid,uuid,uuid,text)', 'EXECUTE')
    OR has_function_privilege('authenticated',
      'public.dialing_queue_has_provider_evidence(uuid)', 'EXECUTE')
    OR has_function_privilege('authenticated',
      'public.dialing_queue_has_unresolved_lifecycle(uuid)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'dialing queue RPC exposure is broader or narrower than the command boundary';
  END IF;

  SELECT pg_get_functiondef(
    'public.protect_dialing_queue_provider_evidence()'::regprocedure
  ) INTO definition;
  IF definition NOT LIKE '%DIALING_QUEUE_PROVIDER_EVIDENCE_IMMUTABLE%'
    OR definition NOT LIKE '%dialing_queue_has_unresolved_lifecycle%'
  THEN
    RAISE EXCEPTION 'queue deletion guard does not preserve provider/reconciliation evidence';
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
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '72000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'queue-contract@example.invalid',
  '',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Queue Contract"}',
  now(),
  now()
);

INSERT INTO public.organizations (id, name, slug) VALUES (
  '71000000-0000-0000-0000-000000000001',
  'Queue Contract Tenant',
  'queue-contract-tenant'
);
INSERT INTO public.organization_users (organization_id, user_id, role) VALUES (
  '71000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  'owner'
);
INSERT INTO public.campaigns (
  id, user_id, organization_id, name, status, max_attempts
) VALUES (
  '73000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  '71000000-0000-0000-0000-000000000001',
  'Queue Contract Campaign',
  'active',
  4
);
INSERT INTO public.leads (
  id, user_id, organization_id, phone_number
) VALUES (
  '74000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  '71000000-0000-0000-0000-000000000001',
  '+12025550141'
);

CREATE TEMP TABLE queue_contract_result (
  queue_id uuid PRIMARY KEY,
  cancelled_count integer
);
GRANT SELECT, INSERT, UPDATE ON queue_contract_result TO authenticated, service_role;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '72000000-0000-0000-0000-000000000001',
  true
);

DO $direct_mutation_denial$
BEGIN
  BEGIN
    INSERT INTO public.dialing_queues (
      campaign_id, lead_id, phone_number, status
    ) VALUES (
      '73000000-0000-0000-0000-000000000001',
      '74000000-0000-0000-0000-000000000001',
      '+19995550199',
      'pending'
    );
    RAISE EXCEPTION 'authenticated direct queue insert unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    UPDATE public.dialing_queues SET status = 'pending' WHERE false;
    RAISE EXCEPTION 'authenticated direct queue update unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    DELETE FROM public.dialing_queues WHERE false;
    RAISE EXCEPTION 'authenticated direct queue delete unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$direct_mutation_denial$;

DO $browser_command_denial$
BEGIN
  BEGIN
    PERFORM public.enqueue_dialing_queue(
      '73000000-0000-0000-0000-000000000001',
      '74000000-0000-0000-0000-000000000001',
      now() + interval '10 minutes',
      12
    );
    RAISE EXCEPTION 'authenticated browser unexpectedly invoked queue enqueue';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM public.cancel_dialing_queues(
      NULL,
      '73000000-0000-0000-0000-000000000001',
      '74000000-0000-0000-0000-000000000001',
      'must be denied before command execution'
    );
    RAISE EXCEPTION 'authenticated browser unexpectedly invoked queue cancellation';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$browser_command_denial$;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', '', true);

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);

INSERT INTO queue_contract_result(queue_id)
SELECT public.enqueue_dialing_queue(
  '73000000-0000-0000-0000-000000000001',
  '74000000-0000-0000-0000-000000000001',
  now() + interval '10 minutes',
  12
);

UPDATE queue_contract_result
SET cancelled_count = public.cancel_dialing_queues(
  queue_id,
  NULL,
  NULL,
  'Queue contract cancellation'
);
RESET ROLE;
SELECT set_config('request.jwt.claim.role', '', true);

DO $safe_command_contract$
DECLARE
  queue record;
BEGIN
  SELECT q.* INTO queue
  FROM public.dialing_queues AS q
  JOIN queue_contract_result AS result ON result.queue_id = q.id;

  IF queue.phone_number <> '+12025550141'
    OR queue.priority <> 12
    OR queue.max_attempts <> 4
    OR queue.status <> 'removed'
    OR (SELECT cancelled_count FROM queue_contract_result) <> 1
  THEN
    RAISE EXCEPTION 'audited enqueue/cancel did not use authoritative data: %', row_to_json(queue);
  END IF;
END;
$safe_command_contract$;

-- A reconciled historical row may be reused without erasing provider evidence,
-- but no role (including service/owner) may physically delete that evidence.
UPDATE public.dialing_queues
SET status = 'completed',
    attempts = 1,
    last_provider = 'retell',
    last_attempted_at = now(),
    dispatch_generation = '75000000-0000-0000-0000-000000000001'
WHERE id = (SELECT queue_id FROM queue_contract_result);

DO $evidence_delete_contract$
BEGIN
  BEGIN
    DELETE FROM public.dialing_queues
    WHERE id = (SELECT queue_id FROM queue_contract_result);
    RAISE EXCEPTION 'provider-evidence queue row was physically deleted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%DIALING_QUEUE_PROVIDER_EVIDENCE_IMMUTABLE%' THEN
      RAISE;
    END IF;
  END;
END;
$evidence_delete_contract$;

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT public.enqueue_dialing_queue(
  '73000000-0000-0000-0000-000000000001',
  '74000000-0000-0000-0000-000000000001',
  now() + interval '20 minutes',
  15
);
RESET ROLE;
SELECT set_config('request.jwt.claim.role', '', true);

DO $evidence_retention_contract$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.dialing_queues
    WHERE id = (SELECT queue_id FROM queue_contract_result)
      AND status = 'pending'
      AND attempts = 0
      AND last_provider = 'retell'
      AND last_attempted_at IS NOT NULL
      AND dispatch_generation = '75000000-0000-0000-0000-000000000001'
  ) THEN
    RAISE EXCEPTION 'safe re-enqueue erased historical provider evidence';
  END IF;
END;
$evidence_retention_contract$;

UPDATE public.dialing_queues
SET status = 'calling',
    dispatch_generation = '75000000-0000-0000-0000-000000000002'
WHERE id = (SELECT queue_id FROM queue_contract_result);

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
DO $unresolved_cancel_contract$
BEGIN
  BEGIN
    PERFORM public.cancel_dialing_queues(
      (SELECT queue_id FROM queue_contract_result),
      NULL,
      NULL,
      'must not cancel a live generation'
    );
    RAISE EXCEPTION 'unresolved calling generation was cancelled';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    IF SQLERRM NOT LIKE '%DIALING_QUEUE_RECONCILIATION_REQUIRED%' THEN
      RAISE;
    END IF;
  END;
END;
$unresolved_cancel_contract$;
RESET ROLE;
SELECT set_config('request.jwt.claim.role', '', true);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claim.sub',
  '72000000-0000-0000-0000-000000000099',
  true
);
DO $cross_tenant_command_contract$
BEGIN
  BEGIN
    PERFORM public.enqueue_dialing_queue(
      '73000000-0000-0000-0000-000000000001',
      '74000000-0000-0000-0000-000000000001',
      now() + interval '30 minutes',
      1
    );
    RAISE EXCEPTION 'non-owner invoked queue command across tenants';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$cross_tenant_command_contract$;
RESET ROLE;
SELECT set_config('request.jwt.claim.role', '', true);
SELECT set_config('request.jwt.claim.sub', '', true);

ROLLBACK;
