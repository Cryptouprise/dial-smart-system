-- Executed only against the isolated fresh-database certification project.

BEGIN;

DO $credential_contract$
DECLARE
  rls_enabled boolean;
  policy_count integer;
  leaked_column_grants integer;
BEGIN
  SELECT relation.relrowsecurity
  INTO rls_enabled
  FROM pg_class AS relation
  WHERE relation.oid = 'public.user_credentials'::regclass;
  IF rls_enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'RLS is disabled on quarantined credential storage';
  END IF;

  IF has_table_privilege('anon', 'public.user_credentials', 'SELECT')
    OR has_table_privilege('anon', 'public.user_credentials', 'INSERT')
    OR has_table_privilege('anon', 'public.user_credentials', 'UPDATE')
    OR has_table_privilege('anon', 'public.user_credentials', 'DELETE')
    OR has_table_privilege('authenticated', 'public.user_credentials', 'SELECT')
    OR has_table_privilege('authenticated', 'public.user_credentials', 'INSERT')
    OR has_table_privilege('authenticated', 'public.user_credentials', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.user_credentials', 'DELETE')
  THEN
    RAISE EXCEPTION 'a browser role retains direct credential table privileges';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.user_credentials', 'SELECT')
    OR NOT has_table_privilege('service_role', 'public.user_credentials', 'INSERT')
    OR NOT has_table_privilege('service_role', 'public.user_credentials', 'UPDATE')
    OR NOT has_table_privilege('service_role', 'public.user_credentials', 'DELETE')
  THEN
    RAISE EXCEPTION 'service-side credential migration/integrations lack required table privileges';
  END IF;

  SELECT count(*) INTO leaked_column_grants
  FROM information_schema.column_privileges
  WHERE table_schema = 'public'
    AND table_name = 'user_credentials'
    AND grantee IN ('anon', 'authenticated', 'PUBLIC');
  IF leaked_column_grants <> 0 THEN
    RAISE EXCEPTION 'browser roles retain % direct credential column grants', leaked_column_grants;
  END IF;

  SELECT count(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'user_credentials';
  IF policy_count <> 1 THEN
    RAISE EXCEPTION 'credential quarantine must have exactly one service policy, found %', policy_count;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_credentials'
      AND policyname = 'Service role manages quarantined credentials'
      AND roles = ARRAY['service_role'::name]
      AND cmd = 'ALL'
  ) THEN
    RAISE EXCEPTION 'credential quarantine service-role policy is missing or overbroad';
  END IF;
END;
$credential_contract$;

ROLLBACK;
