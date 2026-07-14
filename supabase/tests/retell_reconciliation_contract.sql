-- Run after a disposable migration rebuild:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/retell_reconciliation_contract.sql

BEGIN;

-- Exercise copies of the production CHECK constraints without requiring a
-- seeded auth/tenant graph. CREATE TABLE LIKE copies NOT NULL/CHECK/defaults,
-- but deliberately does not copy foreign keys.
CREATE TEMP TABLE retell_dispatch_evidence_contract (
  LIKE public.provider_dispatch_claims INCLUDING DEFAULTS INCLUDING CONSTRAINTS
);

DO $dispatch_evidence$
BEGIN
  INSERT INTO retell_dispatch_evidence_contract (
    logical_key, call_log_id, organization_id, user_id,
    provider, status, provider_call_id
  ) VALUES (
    'contract-accepted-valid',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000003',
    'retell', 'accepted', 'retell-contract-call'
  );

  INSERT INTO retell_dispatch_evidence_contract (
    logical_key, call_log_id, organization_id, user_id,
    provider, status, provider_call_id
  ) VALUES (
    'contract-failure-valid',
    '10000000-0000-0000-0000-000000000011',
    '10000000-0000-0000-0000-000000000012',
    '10000000-0000-0000-0000-000000000013',
    'retell', 'definite_failure', NULL
  );

  BEGIN
    INSERT INTO retell_dispatch_evidence_contract (
      logical_key, call_log_id, organization_id, user_id,
      provider, status, provider_call_id
    ) VALUES (
      'contract-accepted-missing-id',
      '10000000-0000-0000-0000-000000000021',
      '10000000-0000-0000-0000-000000000022',
      '10000000-0000-0000-0000-000000000023',
      'retell', 'accepted', NULL
    );
    RAISE EXCEPTION 'accepted dispatch without provider identity passed its CHECK constraint';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO retell_dispatch_evidence_contract (
      logical_key, call_log_id, organization_id, user_id,
      provider, status, provider_call_id
    ) VALUES (
      'contract-failure-positive-id',
      '10000000-0000-0000-0000-000000000031',
      '10000000-0000-0000-0000-000000000032',
      '10000000-0000-0000-0000-000000000033',
      'retell', 'definite_failure', 'retell-impossible-positive-id'
    );
    RAISE EXCEPTION 'definite failure carrying positive provider identity passed its CHECK constraint';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO retell_dispatch_evidence_contract (
      logical_key, call_log_id, organization_id, user_id,
      provider, status, provider_call_id
    ) VALUES (
      'contract-unknown-positive-id',
      '10000000-0000-0000-0000-000000000041',
      '10000000-0000-0000-0000-000000000042',
      '10000000-0000-0000-0000-000000000043',
      'retell', 'acceptance_unknown', 'retell-not-actually-unknown'
    );
    RAISE EXCEPTION 'unknown acceptance carrying positive provider identity passed its CHECK constraint';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END;
$dispatch_evidence$;

CREATE TEMP TABLE retell_job_state_contract (
  LIKE public.provider_reconciliation_jobs INCLUDING DEFAULTS INCLUDING CONSTRAINTS
);

DO $job_state$
BEGIN
  INSERT INTO retell_job_state_contract (
    dispatch_claim_id, organization_id, user_id, state, reason
  ) VALUES (
    '20000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000003',
    'manual_required', 'valid manual quarantine'
  );

  BEGIN
    INSERT INTO retell_job_state_contract (
      dispatch_claim_id, organization_id, user_id, state, reason
    ) VALUES (
      '20000000-0000-0000-0000-000000000011',
      '20000000-0000-0000-0000-000000000012',
      '20000000-0000-0000-0000-000000000013',
      'processing', 'missing lease evidence'
    );
    RAISE EXCEPTION 'processing reconciliation job without a lease passed its CHECK constraint';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO retell_job_state_contract (
      dispatch_claim_id, organization_id, user_id, state, reason,
      locked_until, claim_token
    ) VALUES (
      '20000000-0000-0000-0000-000000000021',
      '20000000-0000-0000-0000-000000000022',
      '20000000-0000-0000-0000-000000000023',
      'queued', 'non-processing job carrying a lease',
      now() + interval '5 minutes',
      '20000000-0000-0000-0000-000000000024'
    );
    RAISE EXCEPTION 'queued reconciliation job carrying a lease passed its CHECK constraint';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO retell_job_state_contract (
      dispatch_claim_id, organization_id, user_id, state, reason
    ) VALUES (
      '20000000-0000-0000-0000-000000000031',
      '20000000-0000-0000-0000-000000000032',
      '20000000-0000-0000-0000-000000000033',
      'resolved', 'missing resolution evidence'
    );
    RAISE EXCEPTION 'resolved reconciliation job without resolved_at passed its CHECK constraint';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END;
$job_state$;

DO $contract$
DECLARE
  v_bind text;
  v_claim text;
  v_claim_now text;
  v_complete text;
  v_configure text;
  v_dispatch_check text;
  v_finish text;
  v_finalize text;
  v_health text;
  v_identity_default text;
  v_identity_fk text;
  v_job_checks text;
  v_policy_cmd text;
  v_policy_qual text;
  v_policy_roles name[];
  v_proc text;
  v_reconcile_claim text;
  v_requeue text;
  v_rls boolean;
  v_count integer;
BEGIN
  IF to_regclass('public.provider_reconciliation_jobs') IS NULL
    OR to_regclass('public.retell_reconciliation_runtime') IS NULL
  THEN
    RAISE EXCEPTION 'Retell reconciliation tables are missing';
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_attribute
  WHERE attrelid = 'public.provider_reconciliation_jobs'::regclass
    AND attname IN ('organization_id', 'user_id')
    AND attnotnull
    AND NOT attisdropped;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'Reconciliation jobs are not bound to a non-null tenant identity';
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_identity_fk
  FROM pg_constraint
  WHERE conrelid = 'public.provider_reconciliation_jobs'::regclass
    AND conname = 'provider_reconciliation_jobs_dispatch_identity_fkey'
    AND contype = 'f';
  IF v_identity_fk IS NULL
    OR position('FOREIGN KEY (dispatch_claim_id, organization_id, user_id)' IN v_identity_fk) = 0
    OR position('REFERENCES provider_dispatch_claims(id, organization_id, user_id)' IN v_identity_fk) = 0
    OR position('ON DELETE RESTRICT' IN v_identity_fk) = 0
  THEN
    RAISE EXCEPTION 'Reconciliation jobs do not have the canonical composite dispatch identity FK';
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_dispatch_check
  FROM pg_constraint
  WHERE conrelid = 'public.provider_dispatch_claims'::regclass
    AND conname = 'provider_dispatch_claims_status_evidence_check'
    AND contype = 'c';
  IF v_dispatch_check IS NULL
    OR position('accepted' IN v_dispatch_check) = 0
    OR position('definite_failure' IN v_dispatch_check) = 0
    OR position('acceptance_unknown' IN v_dispatch_check) = 0
    OR position('provider_call_id IS NOT NULL' IN v_dispatch_check) = 0
    OR position('provider_call_id IS NULL' IN v_dispatch_check) = 0
  THEN
    RAISE EXCEPTION 'Provider dispatch status/evidence CHECK is incomplete';
  END IF;

  SELECT string_agg(pg_get_constraintdef(oid), E'\n') INTO v_job_checks
  FROM pg_constraint
  WHERE conrelid = 'public.provider_reconciliation_jobs'::regclass
    AND contype = 'c';
  IF v_job_checks IS NULL
    OR position('manual_required' IN v_job_checks) = 0
    OR position('state = ''processing''' IN v_job_checks) = 0
    OR position('locked_until IS NOT NULL' IN v_job_checks) = 0
    OR position('claim_token IS NOT NULL' IN v_job_checks) = 0
    OR position('state = ''resolved''' IN v_job_checks) = 0
    OR position('resolved_at IS NOT NULL' IN v_job_checks) = 0
  THEN
    RAISE EXCEPTION 'Reconciliation job state/lease CHECK constraints are incomplete';
  END IF;

  SELECT pg_get_expr(def.adbin, def.adrelid) INTO v_identity_default
  FROM pg_attribute AS attr
  JOIN pg_attrdef AS def
    ON def.adrelid = attr.attrelid
   AND def.adnum = attr.attnum
  WHERE attr.attrelid = 'public.provider_dispatch_claims'::regclass
    AND attr.attname = 'identity_contract_version'
    AND attr.attnotnull;
  IF v_identity_default IS NULL OR position('1' IN v_identity_default) = 0 THEN
    RAISE EXCEPTION 'New provider dispatches do not default to identity contract version 1';
  END IF;

  SELECT relrowsecurity INTO v_rls
  FROM pg_class
  WHERE oid = 'public.provider_reconciliation_jobs'::regclass;
  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'provider_reconciliation_jobs RLS is disabled';
  END IF;
  SELECT relrowsecurity INTO v_rls
  FROM pg_class
  WHERE oid = 'public.retell_reconciliation_runtime'::regclass;
  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'retell_reconciliation_runtime RLS is disabled';
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'provider_reconciliation_jobs';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'provider_reconciliation_jobs must have exactly one fail-closed client policy';
  END IF;

  SELECT cmd, qual, roles
  INTO v_policy_cmd, v_policy_qual, v_policy_roles
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'provider_reconciliation_jobs'
    AND policyname = 'Users can view owned provider reconciliation jobs';
  IF v_policy_cmd IS DISTINCT FROM 'SELECT'
    OR NOT ('authenticated'::name = ANY(v_policy_roles))
    OR position('user_id' IN v_policy_qual) = 0
    OR position('auth.uid()' IN v_policy_qual) = 0
    OR position('user_in_organization' IN v_policy_qual) = 0
    OR position('organization_id' IN v_policy_qual) = 0
  THEN
    RAISE EXCEPTION 'Reconciliation RLS does not require both owner and current organization membership';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.provider_reconciliation_jobs', 'SELECT')
    OR has_table_privilege('authenticated', 'public.provider_reconciliation_jobs', 'INSERT')
    OR has_table_privilege('authenticated', 'public.provider_reconciliation_jobs', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.provider_reconciliation_jobs', 'DELETE')
    OR has_table_privilege('anon', 'public.provider_reconciliation_jobs', 'SELECT')
    OR has_table_privilege('authenticated', 'public.retell_reconciliation_runtime', 'SELECT')
  THEN
    RAISE EXCEPTION 'Retell reconciliation table privilege boundary is unsafe';
  END IF;

  FOREACH v_proc IN ARRAY ARRAY[
    'public.claim_provider_callback(text,text,text,text)',
    'public.complete_provider_callback(text,text,text,uuid,text)',
    'public.claim_pending_dispatches(uuid[],integer)',
    'public.claim_pending_dispatches_now(uuid[],integer)',
    'public.claim_retell_reconciliation_jobs(integer)',
    'public.bind_retell_reconciliation_call(uuid,uuid,text,text,jsonb)',
    'public.finish_retell_reconciliation_job(uuid,uuid,text,text,text,timestamp with time zone,boolean)',
    'public.requeue_retell_reconciliation_job(uuid,text)',
    'public.fail_retell_reconciliation_job(uuid,uuid,text,boolean)',
    'public.mark_retell_reconciliation_run(text,integer,text)',
    'public.retell_reconciliation_health_check()',
    'public.configure_retell_reconciliation_cron(boolean)'
  ]::text[]
  LOOP
    IF to_regprocedure(v_proc) IS NULL THEN
      RAISE EXCEPTION 'Required Retell safety RPC is missing: %', v_proc;
    END IF;
    IF has_function_privilege('anon', v_proc, 'EXECUTE')
      OR has_function_privilege('authenticated', v_proc, 'EXECUTE')
      OR NOT has_function_privilege('service_role', v_proc, 'EXECUTE')
    THEN
      RAISE EXCEPTION 'Retell safety RPC privilege boundary is unsafe: %', v_proc;
    END IF;
  END LOOP;

  SELECT upper(pg_get_functiondef(to_regprocedure(
    'public.claim_retell_reconciliation_jobs(integer)'
  ))) INTO v_reconcile_claim;
  IF position('FOR UPDATE SKIP LOCKED' IN v_reconcile_claim) = 0
    OR position('P_LIMIT > 8' IN v_reconcile_claim) = 0
    OR position('ATTEMPT_COUNT >= 12' IN v_reconcile_claim) = 0
    OR position('INTERVAL ''2 HOURS''' IN v_reconcile_claim) = 0
    OR position('CL.ORGANIZATION_ID = DISPATCH.ORGANIZATION_ID' IN v_reconcile_claim) = 0
    OR position('CL.USER_ID = DISPATCH.USER_ID' IN v_reconcile_claim) = 0
    OR position('CL.CAMPAIGN_ID IS NOT DISTINCT FROM DISPATCH.CAMPAIGN_ID' IN v_reconcile_claim) = 0
    OR position('CL.LEAD_ID IS NOT DISTINCT FROM DISPATCH.LEAD_ID' IN v_reconcile_claim) = 0
  THEN
    RAISE EXCEPTION 'Retell reconciliation leases are not bounded, skip-locked, and exact-tenant joined';
  END IF;

  SELECT upper(pg_get_functiondef(to_regprocedure(
    'public.requeue_retell_reconciliation_job(uuid,text)'
  ))) INTO v_requeue;
  IF position('ATTEMPT_COUNT = 0' IN v_requeue) = 0
    OR position('FIRST_DETECTED_AT = NOW()' IN v_requeue) = 0
    OR position('STATE = ''MANUAL_REQUIRED''' IN v_requeue) = 0
  THEN
    RAISE EXCEPTION 'Operator requeue does not establish a new bounded retry window';
  END IF;

  SELECT upper(pg_get_functiondef(to_regprocedure(
    'public.finalize_provider_dispatch(uuid,uuid,text,text,text)'
  ))) INTO v_finalize;
  IF position('CLAIM_ROW.STATUS <> ''CLAIMED''' IN v_finalize) = 0
    OR position('CLAIM_ROW.STATUS = P_STATUS' IN v_finalize) = 0
    OR position('FINALIZED DIFFERENTLY' IN v_finalize) = 0
  THEN
    RAISE EXCEPTION 'Provider dispatch finalization can overwrite a terminal claim';
  END IF;

  SELECT upper(pg_get_functiondef(to_regprocedure(
    'public.retell_reconciliation_health_check()'
  ))) INTO v_health;
  IF position('FROM PUBLIC.RETELL_RECONCILIATION_RUNTIME AS RUNTIME' IN v_health) = 0
    OR position('LEFT JOIN PUBLIC.PROVIDER_RECONCILIATION_JOBS AS JOB ON TRUE' IN v_health) = 0
  THEN
    RAISE EXCEPTION 'Retell reconciliation health disappears when the job queue is empty';
  END IF;

  SELECT upper(pg_get_functiondef(to_regprocedure(
    'public.claim_pending_dispatches(uuid[],integer)'
  ))) INTO v_claim;
  SELECT upper(pg_get_functiondef(to_regprocedure(
    'public.claim_pending_dispatches_now(uuid[],integer)'
  ))) INTO v_claim_now;

  IF position('PROVIDER_CALLBACK_RECEIPTS AS TERMINAL_RECEIPT' IN v_claim) = 0
    OR position('TERMINAL_RECEIPT.PROVIDER_CALL_ID = DISPATCH.PROVIDER_CALL_ID' IN v_claim) = 0
    OR position('TERMINAL_RECEIPT.STATUS = ''PROCESSED''' IN v_claim) = 0
    OR position('PROVIDER_CALLBACK_RECEIPTS AS UNRESOLVED_RECEIPT' IN v_claim) = 0
    OR position('UNRESOLVED_RECEIPT.PROVIDER_CALL_ID = DISPATCH.PROVIDER_CALL_ID' IN v_claim) = 0
    OR position('DISPATCH.STATUS = ''ACCEPTED''' IN v_claim) = 0
    OR position('TERMINAL_RECONCILIATION' IN v_claim) = 0
    OR position('ANALYSIS_EFFECTS' IN v_claim) = 0
    OR position('UNRESOLVED_RECEIPT.STATUS <> ''PROCESSED''' IN v_claim) = 0
    OR position('PROVIDER_RECONCILIATION_REQUIRED = TRUE' IN v_claim) = 0
    OR position('FOR UPDATE SKIP LOCKED' IN v_claim) = 0
  THEN
    RAISE EXCEPTION 'Scheduled pending dispatch claims do not hold unresolved callback effects';
  END IF;

  IF position('PROVIDER_CALLBACK_RECEIPTS AS TERMINAL_RECEIPT' IN v_claim_now) = 0
    OR position('TERMINAL_RECEIPT.PROVIDER_CALL_ID = DISPATCH.PROVIDER_CALL_ID' IN v_claim_now) = 0
    OR position('TERMINAL_RECEIPT.STATUS = ''PROCESSED''' IN v_claim_now) = 0
    OR position('PROVIDER_CALLBACK_RECEIPTS AS UNRESOLVED_RECEIPT' IN v_claim_now) = 0
    OR position('UNRESOLVED_RECEIPT.PROVIDER_CALL_ID = DISPATCH.PROVIDER_CALL_ID' IN v_claim_now) = 0
    OR position('DISPATCH.STATUS = ''ACCEPTED''' IN v_claim_now) = 0
    OR position('TERMINAL_RECONCILIATION' IN v_claim_now) = 0
    OR position('ANALYSIS_EFFECTS' IN v_claim_now) = 0
    OR position('UNRESOLVED_RECEIPT.STATUS <> ''PROCESSED''' IN v_claim_now) = 0
    OR position('PROVIDER_RECONCILIATION_REQUIRED = TRUE' IN v_claim_now) = 0
    OR position('FOR UPDATE SKIP LOCKED' IN v_claim_now) = 0
  THEN
    RAISE EXCEPTION 'Immediate pending dispatch claims do not hold unresolved callback effects';
  END IF;

  SELECT upper(pg_get_functiondef(to_regprocedure(
    'public.complete_provider_callback(text,text,text,uuid,text)'
  ))) INTO v_complete;
  IF position('AND CLAIM_TOKEN = P_CLAIM_TOKEN' IN v_complete) = 0
    OR position('PROVIDER_CALLBACK_LEASE_LOST' IN v_complete) = 0
    OR position('ON CONFLICT (DISPATCH_CLAIM_ID) DO UPDATE' IN v_complete) = 0
    OR position('STATE = ''MANUAL_REQUIRED''' IN v_complete) = 0
    OR position('PROVIDER_RECONCILIATION_REQUIRED = TRUE' IN v_complete) = 0
    OR position('FROM PUBLIC.DIALING_QUEUES AS QUEUE' IN v_complete) = 0
    OR position('FOR UPDATE' IN v_complete) = 0
  THEN
    RAISE EXCEPTION 'Broad callback failures are not atomically claim-checked and quarantined';
  END IF;

  SELECT upper(pg_get_functiondef(to_regprocedure(
    'public.bind_retell_reconciliation_call(uuid,uuid,text,text,jsonb)'
  ))) INTO v_bind;
  IF position('RECORD_PHYSICAL_CALL_ATTEMPT' IN v_bind) = 0
    OR position('RETELL METADATA DOES NOT MATCH' IN v_bind) = 0
    OR position('PROVIDER_RECONCILIATION_REQUIRED = TRUE' IN v_bind) = 0
    OR position('PROVIDER_RECONCILIATION_REQUIRED = FALSE' IN v_bind) > 0
    OR position('ORGANIZATION_ID = V_DISPATCH.ORGANIZATION_ID' IN v_bind) = 0
    OR position('USER_ID = V_DISPATCH.USER_ID' IN v_bind) = 0
    OR position('CAMPAIGN_ID IS NOT DISTINCT FROM V_DISPATCH.CAMPAIGN_ID' IN v_bind) = 0
    OR position('LEAD_ID IS NOT DISTINCT FROM V_DISPATCH.LEAD_ID' IN v_bind) = 0
  THEN
    RAISE EXCEPTION 'Retell binding does not prove tenant/attempt identity while preserving quarantine';
  END IF;

  SELECT upper(pg_get_functiondef(to_regprocedure(
    'public.finish_retell_reconciliation_job(uuid,uuid,text,text,text,timestamp with time zone,boolean)'
  ))) INTO v_finish;
  IF position('PROVIDER_RECONCILIATION_REQUIRED IS DISTINCT FROM TRUE' IN v_finish) = 0
    OR position('SET PROVIDER_RECONCILIATION_REQUIRED = FALSE' IN v_finish) = 0
    OR position('TERMINAL_RECONCILIATION' IN v_finish) = 0
    OR position('RECEIPT.STATUS = ''PROCESSED''' IN v_finish) = 0
    OR position('ORGANIZATION_ID = V_DISPATCH.ORGANIZATION_ID' IN v_finish) = 0
    OR position('USER_ID = V_DISPATCH.USER_ID' IN v_finish) = 0
    OR position('CAMPAIGN_ID IS NOT DISTINCT FROM V_DISPATCH.CAMPAIGN_ID' IN v_finish) = 0
    OR position('LEAD_ID IS NOT DISTINCT FROM V_DISPATCH.LEAD_ID' IN v_finish) = 0
    OR position('UPDATE PUBLIC.DIALING_QUEUES' IN v_finish) > 0
  THEN
    RAISE EXCEPTION 'Retell completion can clear quarantine without complete evidence or mutate the queue';
  END IF;

  IF EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'retell-provider-reconciler'
  ) THEN
    RAISE EXCEPTION 'Retell reconciliation cron must be disabled after migrations';
  END IF;

  IF public.configure_retell_reconciliation_cron(false) IS DISTINCT FROM false
    OR EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'retell-provider-reconciler'
    )
  THEN
    RAISE EXCEPTION 'Disabling Retell reconciliation cron is not fail-closed';
  END IF;

  SELECT upper(pg_get_functiondef(to_regprocedure(
    'public.configure_retell_reconciliation_cron(boolean)'
  ))) INTO v_configure;
  IF position('DIAL_SMART_PROJECT_URL' IN v_configure) = 0
    OR position('DIAL_SMART_PUBLISHABLE_KEY' IN v_configure) = 0
    OR position('DIAL_SMART_RETELL_RECONCILER_CRON_TOKEN' IN v_configure) = 0
    OR position('''APIKEY''' IN v_configure) = 0
    OR position('X-DIALSMART-CRON-TOKEN' IN v_configure) = 0
    OR position('AUTHORIZATION' IN v_configure) > 0
    OR position('CURRENT_SETTING' IN v_configure) > 0
    OR position('EYJ' IN v_configure) > 0
  THEN
    RAISE EXCEPTION 'Retell cron is not Vault-backed with dedicated-token handler authentication';
  END IF;
END;
$contract$;

ROLLBACK;
