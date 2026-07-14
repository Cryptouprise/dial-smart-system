-- Executed only against the isolated fresh-database certification project.
-- Every fixture and assertion is rolled back.

BEGIN;

DO $catalog_contract$
DECLARE
  relation_name text;
  trigger_count integer;
  function_config text;
  gate_oid oid;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'campaign_contact_releases',
    'campaign_contact_release_members'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_class AS relation
      WHERE relation.oid = format('public.%I', relation_name)::regclass
        AND relation.relrowsecurity
    ) OR EXISTS (
      SELECT 1
      FROM pg_policies AS policy
      WHERE policy.schemaname = 'public' AND policy.tablename = relation_name
    ) THEN
      RAISE EXCEPTION '% must be RLS-protected with no browser policy', relation_name;
    END IF;

    IF has_table_privilege('anon', format('public.%I', relation_name), 'SELECT')
      OR has_table_privilege('anon', format('public.%I', relation_name), 'INSERT')
      OR has_table_privilege('authenticated', format('public.%I', relation_name), 'SELECT')
      OR has_table_privilege('authenticated', format('public.%I', relation_name), 'INSERT')
      OR has_table_privilege('authenticated', format('public.%I', relation_name), 'UPDATE')
      OR has_table_privilege('authenticated', format('public.%I', relation_name), 'DELETE')
    THEN
      RAISE EXCEPTION '% is directly accessible to a browser role', relation_name;
    END IF;
  END LOOP;

  SELECT count(*) INTO trigger_count
  FROM pg_trigger
  WHERE tgrelid IN (
      'public.campaign_contact_releases'::regclass,
      'public.campaign_contact_release_members'::regclass
    )
    AND tgname IN (
      'campaign_contact_releases_immutable',
      'campaign_contact_release_members_valid'
    )
    AND tgenabled <> 'D'
    AND NOT tgisinternal;
  IF trigger_count <> 2 THEN
    RAISE EXCEPTION 'campaign release immutability/cohort triggers are missing';
  END IF;

  SELECT procedure.oid, COALESCE(array_to_string(procedure.proconfig, ','), '')
  INTO gate_oid, function_config
  FROM pg_proc AS procedure
  WHERE procedure.oid = to_regprocedure(
    'public.evaluate_campaign_contact_release(uuid,uuid,uuid,uuid,text,text,integer,text,integer,uuid)'
  );
  IF gate_oid IS NULL
    OR NOT (SELECT prosecdef FROM pg_proc WHERE oid = gate_oid)
    OR position('search_path=public, pg_temp' IN function_config) = 0
    OR has_function_privilege('anon', gate_oid, 'EXECUTE')
    OR has_function_privilege('authenticated', gate_oid, 'EXECUTE')
    OR NOT has_function_privilege('service_role', gate_oid, 'EXECUTE')
  THEN
    RAISE EXCEPTION 'campaign release evaluator is not a pinned service-only capability';
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
    'authenticated', 'authenticated', 'release-gate@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Release Gate Operator"}', now(), now()
  );

INSERT INTO public.organizations (id, name, slug) VALUES
  ('e1000000-0000-4000-8000-000000000001', 'Release Gate Tenant', 'release-gate-tenant');
INSERT INTO public.organization_users (organization_id, user_id, role) VALUES
  (
    'e1000000-0000-4000-8000-000000000001',
    'e2000000-0000-4000-8000-000000000001',
    'owner'
  );
INSERT INTO public.campaigns (
  id, user_id, organization_id, name, status, provider, agent_id,
  calling_hours_start, calling_hours_end, timezone
) VALUES (
  'e3000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'Solar Exit release-gate contract', 'active', 'retell', 'agent_solar_exit_release',
  '09:00', '17:00', 'America/Denver'
);
INSERT INTO public.leads (
  id, user_id, organization_id, phone_number, first_name, timezone
) VALUES (
  'e4000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  '+13035550101', 'Contract Lead', 'America/Denver'
);
INSERT INTO public.campaign_leads (campaign_id, lead_id) VALUES (
  'e3000000-0000-4000-8000-000000000001',
  'e4000000-0000-4000-8000-000000000001'
);
INSERT INTO public.phone_numbers (
  id, user_id, organization_id, number, area_code, provider,
  retell_phone_id, rotation_enabled
) VALUES (
  'e5000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  '+13035550102', '303', 'retell_native', 'retell-phone-release-gate', true
);

DO $missing_release_contract$
DECLARE
  gate_result record;
BEGIN
  SELECT * INTO gate_result
  FROM public.evaluate_campaign_contact_release(
    'e2000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'e3000000-0000-4000-8000-000000000001',
    'e4000000-0000-4000-8000-000000000001',
    'retell', 'agent_solar_exit_release', 7, 'llm_solar_exit_release', 4,
    'e5000000-0000-4000-8000-000000000001'
  );
  IF gate_result.allowed IS DISTINCT FROM false
    OR gate_result.reason_code <> 'CAMPAIGN_RELEASE_NOT_FOUND'
  THEN
    RAISE EXCEPTION 'a campaign contact was allowed without an explicit release';
  END IF;
END;
$missing_release_contract$;

INSERT INTO public.campaign_contact_releases (
  id, organization_id, user_id, campaign_id, provider,
  retell_agent_id, retell_agent_version, retell_llm_id, retell_llm_version,
  caller_number_id, release_stage, cohort_limit,
  campaign_bundle_sha256, database_certificate_sha256,
  provider_owned_phone_certificate_sha256, global_stop_drill_sha256,
  seller_dnc_drill_sha256, voice_opt_out_drill_sha256,
  conversation_suite_sha256, ghl_shadow_certificate_sha256,
  approval_chain_sha256, external_trust_root_sha256, expires_at
) VALUES (
  'e6000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  'e3000000-0000-4000-8000-000000000001', 'retell',
  'agent_solar_exit_release', 7, 'llm_solar_exit_release', 4,
  'e5000000-0000-4000-8000-000000000001', 'canary_5', 5,
  repeat('a', 64), repeat('b', 64), repeat('c', 64), repeat('d', 64),
  repeat('e', 64), repeat('f', 64), repeat('1', 64), repeat('2', 64),
  repeat('3', 64), repeat('4', 64), now() + interval '1 hour'
);
INSERT INTO public.campaign_contact_release_members (
  release_id, organization_id, user_id, campaign_id, lead_id
) VALUES (
  'e6000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  'e3000000-0000-4000-8000-000000000001',
  'e4000000-0000-4000-8000-000000000001'
);

DO $release_gate_contract$
DECLARE
  gate_result record;
BEGIN
  SELECT * INTO gate_result
  FROM public.evaluate_campaign_contact_release(
    'e2000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'e3000000-0000-4000-8000-000000000001',
    'e4000000-0000-4000-8000-000000000001',
    'retell', 'agent_solar_exit_release', 7, 'llm_solar_exit_release', 4,
    'e5000000-0000-4000-8000-000000000001'
  );
  IF gate_result.allowed IS DISTINCT FROM true
    OR gate_result.release_id <> 'e6000000-0000-4000-8000-000000000001'::uuid
    OR gate_result.release_stage <> 'canary_5'
    OR gate_result.reason_code <> 'CONTACT_RELEASE_APPROVED'
  THEN
    RAISE EXCEPTION 'matching release did not authorize its exact lead cohort';
  END IF;

  SELECT * INTO gate_result
  FROM public.evaluate_campaign_contact_release(
    'e2000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'e3000000-0000-4000-8000-000000000001',
    'e4000000-0000-4000-8000-000000000001',
    'retell', 'agent_solar_exit_release', 7, 'llm_solar_exit_release', 5,
    'e5000000-0000-4000-8000-000000000001'
  );
  IF gate_result.allowed IS DISTINCT FROM false
    OR gate_result.reason_code <> 'CAMPAIGN_RELEASE_IDENTITY_MISMATCH'
  THEN
    RAISE EXCEPTION 'a changed live LLM version was not denied';
  END IF;

  BEGIN
    UPDATE public.campaign_contact_releases
    SET campaign_bundle_sha256 = repeat('9', 64)
    WHERE id = 'e6000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'release evidence was mutable';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'CAMPAIGN_CONTACT_RELEASE_IMMUTABLE%' THEN
      RAISE;
    END IF;
  END;

  BEGIN
    DELETE FROM public.campaign_contact_release_members
    WHERE release_id = 'e6000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'release cohort was mutable';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'CAMPAIGN_CONTACT_RELEASE_MEMBER_IMMUTABLE%' THEN
      RAISE;
    END IF;
  END;

  UPDATE public.campaign_contact_releases
  SET revoked_at = now()
  WHERE id = 'e6000000-0000-4000-8000-000000000001';
  SELECT * INTO gate_result
  FROM public.evaluate_campaign_contact_release(
    'e2000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'e3000000-0000-4000-8000-000000000001',
    'e4000000-0000-4000-8000-000000000001',
    'retell', 'agent_solar_exit_release', 7, 'llm_solar_exit_release', 4,
    'e5000000-0000-4000-8000-000000000001'
  );
  IF gate_result.allowed IS DISTINCT FROM false
    OR gate_result.reason_code <> 'CAMPAIGN_RELEASE_EXPIRED_OR_REVOKED'
  THEN
    RAISE EXCEPTION 'revoked release was not denied';
  END IF;
END;
$release_gate_contract$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000001', true);
DO $browser_boundary_contract$
BEGIN
  BEGIN
    SELECT count(*) FROM public.campaign_contact_releases;
    RAISE EXCEPTION 'browser read release evidence';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM public.evaluate_campaign_contact_release(
      'e2000000-0000-4000-8000-000000000001',
      'e1000000-0000-4000-8000-000000000001',
      'e3000000-0000-4000-8000-000000000001',
      'e4000000-0000-4000-8000-000000000001',
      'retell', 'agent_solar_exit_release', 7, 'llm_solar_exit_release', 4,
      'e5000000-0000-4000-8000-000000000001'
    );
    RAISE EXCEPTION 'browser executed campaign release evaluator';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$browser_boundary_contract$;
RESET ROLE;

ROLLBACK;
