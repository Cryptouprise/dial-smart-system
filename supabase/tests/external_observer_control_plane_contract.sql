-- Executed only against the isolated fresh-database certification project.

BEGIN;

DO $catalog_contract$
DECLARE
  relation_name text;
  privilege_name text;
  policy_count integer;
  function_oid oid;
  function_config text;
  provider_labels text[];
  constraint_literals text[];
BEGIN
  -- Calendar OAuth values are preserved for service migration but are no
  -- longer reachable through any browser table or column grant.
  IF EXISTS (
    SELECT 1
    FROM pg_policies AS policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename = 'calendar_integrations'
      AND (
        policy.cmd <> 'ALL'
        OR cardinality(policy.roles) <> 1
        OR NOT ('service_role'::name = ANY(policy.roles))
      )
  ) OR (
    SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'calendar_integrations'
  ) <> 1 THEN
    RAISE EXCEPTION 'calendar integration policies are not service-only';
  END IF;

  FOREACH privilege_name IN ARRAY ARRAY[
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
  ] LOOP
    IF has_table_privilege(
        'anon', 'public.calendar_integrations', privilege_name)
      OR has_table_privilege(
        'authenticated', 'public.calendar_integrations', privilege_name)
    THEN
      RAISE EXCEPTION 'browser retains calendar_integrations %', privilege_name;
    END IF;
  END LOOP;
  IF has_column_privilege(
      'anon', 'public.calendar_integrations', 'access_token_encrypted', 'SELECT')
    OR has_column_privilege(
      'authenticated', 'public.calendar_integrations', 'access_token_encrypted', 'SELECT')
    OR has_column_privilege(
      'anon', 'public.calendar_integrations', 'refresh_token_encrypted', 'SELECT')
    OR has_column_privilege(
      'authenticated', 'public.calendar_integrations', 'refresh_token_encrypted', 'SELECT')
  THEN
    RAISE EXCEPTION 'browser retains an OAuth-token column grant';
  END IF;
  IF NOT has_table_privilege(
      'service_role', 'public.calendar_integrations', 'SELECT')
    OR NOT has_table_privilege(
      'service_role', 'public.calendar_integrations', 'INSERT')
    OR NOT has_table_privilege(
      'service_role', 'public.calendar_integrations', 'UPDATE')
    OR NOT has_table_privilege(
      'service_role', 'public.calendar_integrations', 'DELETE')
    OR has_table_privilege(
      'service_role', 'public.calendar_integrations', 'TRUNCATE')
  THEN
    RAISE EXCEPTION 'calendar service-migration privileges are incorrect';
  END IF;

  -- Browser API-key mint/update/delete is gone. Metadata is an explicit safe
  -- column allowlist; the credential hash and sensitive operational fields are
  -- not browser-readable.
  IF NOT (
    SELECT relation.relrowsecurity
    FROM pg_class AS relation
    WHERE relation.oid = 'public.api_keys'::regclass
  ) THEN
    RAISE EXCEPTION 'api_keys RLS is not enabled';
  END IF;
  SELECT procedure.oid,
         COALESCE(array_to_string(procedure.proconfig, ','), '')
  INTO function_oid, function_config
  FROM pg_proc AS procedure
  WHERE procedure.oid = to_regprocedure('public.user_in_organization(uuid,uuid)');
  IF function_oid IS NULL
    OR NOT (SELECT prosecdef FROM pg_proc WHERE oid = function_oid)
    OR position('search_path=' IN function_config) = 0
    OR position('public' IN function_config) > 0
    OR has_function_privilege('anon', function_oid, 'EXECUTE')
    OR NOT has_function_privilege('authenticated', function_oid, 'EXECUTE')
    OR NOT has_function_privilege('service_role', function_oid, 'EXECUTE')
  THEN
    RAISE EXCEPTION 'two-argument tenant membership helper is not pinned';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'api_keys'
      AND policyname = 'users_manage_own_api_keys'
  ) THEN
    RAISE EXCEPTION 'legacy browser API-key management policy remains';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies AS policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename = 'api_keys'
      AND policy.policyname = 'Users read their tenant-bound API key metadata'
      AND policy.qual LIKE '%user_in_organization(auth.uid(), organization_id)%'
  ) THEN
    RAISE EXCEPTION 'API-key metadata policy does not use explicit safe membership';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND table_name = 'api_keys'
      AND grantee = 'authenticated'
      AND privilege_type = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'authenticated has table-level API-key SELECT';
  END IF;
  IF NOT has_column_privilege(
      'authenticated', 'public.api_keys', 'id', 'SELECT')
    OR NOT has_column_privilege(
      'authenticated', 'public.api_keys', 'key_prefix', 'SELECT')
    OR has_column_privilege(
      'authenticated', 'public.api_keys', 'key_hash', 'SELECT')
    OR has_column_privilege(
      'authenticated', 'public.api_keys', 'last_used_ip', 'SELECT')
    OR has_column_privilege(
      'authenticated', 'public.api_keys', 'revoked_reason', 'SELECT')
  THEN
    RAISE EXCEPTION 'API-key metadata column allowlist is incorrect';
  END IF;
  FOREACH privilege_name IN ARRAY ARRAY[
    'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
  ] LOOP
    IF has_table_privilege('authenticated', 'public.api_keys', privilege_name)
      OR has_table_privilege('anon', 'public.api_keys', privilege_name)
    THEN
      RAISE EXCEPTION 'browser retains API-key %', privilege_name;
    END IF;
  END LOOP;
  IF NOT has_table_privilege('service_role', 'public.api_keys', 'SELECT')
    OR NOT has_table_privilege('service_role', 'public.api_keys', 'INSERT')
    OR NOT has_table_privilege('service_role', 'public.api_keys', 'UPDATE')
    OR NOT has_table_privilege('service_role', 'public.api_keys', 'DELETE')
    OR has_table_privilege('service_role', 'public.api_keys', 'TRUNCATE')
  THEN
    RAISE EXCEPTION 'service API-key privileges are incorrect';
  END IF;
  FOR function_oid IN
    SELECT procedure.oid
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'mint_api_key'
  LOOP
    IF has_function_privilege('anon', function_oid, 'EXECUTE')
      OR has_function_privilege('authenticated', function_oid, 'EXECUTE')
      OR NOT has_function_privilege('service_role', function_oid, 'EXECUTE')
    THEN
      RAISE EXCEPTION 'a mint_api_key overload is not service-only';
    END IF;
  END LOOP;
  SELECT procedure.oid,
         COALESCE(array_to_string(procedure.proconfig, ','), '')
  INTO function_oid, function_config
  FROM pg_proc AS procedure
  JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
  WHERE procedure.oid = to_regprocedure('public.touch_api_key(uuid,text)');
  IF function_oid IS NULL
    OR NOT (SELECT prosecdef FROM pg_proc WHERE oid = function_oid)
    OR position('search_path=' IN function_config) = 0
    OR position('public' IN function_config) > 0
    OR has_function_privilege('anon', function_oid, 'EXECUTE')
    OR has_function_privilege('authenticated', function_oid, 'EXECUTE')
    OR NOT has_function_privilege('service_role', function_oid, 'EXECUTE')
  THEN
    RAISE EXCEPTION 'touch_api_key is not a pinned service-only capability';
  END IF;

  -- Slack mappings are read-only to the mapped browser user; guessed external
  -- identity self-claims and browser deletion are gone.
  IF NOT (
    SELECT relation.relrowsecurity
    FROM pg_class AS relation
    WHERE relation.oid = 'public.slack_users'::regclass
  ) THEN
    RAISE EXCEPTION 'slack_users RLS is not enabled';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies AS policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename = 'slack_users'
      AND policy.policyname = 'Users read their tenant-bound Slack mapping'
      AND policy.qual LIKE '%user_in_organization(auth.uid(), organization_id)%'
  ) THEN
    RAISE EXCEPTION 'Slack mapping policy does not use explicit safe membership';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'slack_users'
      AND policyname IN (
        'Users view their own slack mapping',
        'Users create their own slack mapping',
        'Users delete their own slack mapping'
      )
  ) THEN
    RAISE EXCEPTION 'legacy Slack self-claim policy remains';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.slack_users', 'SELECT')
    OR has_table_privilege('authenticated', 'public.slack_users', 'INSERT')
    OR has_table_privilege('authenticated', 'public.slack_users', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.slack_users', 'DELETE')
    OR has_table_privilege('authenticated', 'public.slack_users', 'TRUNCATE')
  THEN
    RAISE EXCEPTION 'Slack browser privileges are not SELECT-only';
  END IF;
  FOREACH privilege_name IN ARRAY ARRAY[
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
  ] LOOP
    IF has_table_privilege('anon', 'public.slack_users', privilege_name) THEN
      RAISE EXCEPTION 'anon retains Slack mapping %', privilege_name;
    END IF;
  END LOOP;
  IF NOT has_table_privilege('service_role', 'public.slack_users', 'SELECT')
    OR NOT has_table_privilege('service_role', 'public.slack_users', 'INSERT')
    OR NOT has_table_privilege('service_role', 'public.slack_users', 'UPDATE')
    OR NOT has_table_privilege('service_role', 'public.slack_users', 'DELETE')
    OR has_table_privilege('service_role', 'public.slack_users', 'TRUNCATE')
  THEN
    RAISE EXCEPTION 'Slack service privileges are incorrect';
  END IF;

  SELECT array_agg(enum_value.enumlabel::text ORDER BY enum_value.enumsortorder)
  INTO provider_labels
  FROM pg_type AS enum_type
  JOIN pg_namespace AS namespace ON namespace.oid = enum_type.typnamespace
  JOIN pg_enum AS enum_value ON enum_value.enumtypid = enum_type.oid
  WHERE namespace.nspname = 'public'
    AND enum_type.typname = 'external_control_provider';
  IF provider_labels IS DISTINCT FROM ARRAY['slack', 'teams', 'zapier', 'mcp']::text[] THEN
    RAISE EXCEPTION 'external provider enum is not exact: %', provider_labels;
  END IF;

  IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint AS constraint_info
      WHERE constraint_info.conrelid = 'public.external_control_installations'::regclass
        AND constraint_info.conname = 'external_control_route_tenant_unique'
        AND constraint_info.contype = 'u'
        AND pg_get_constraintdef(constraint_info.oid) =
          'UNIQUE (provider, external_tenant_id_hmac, external_route_id_hmac)'
    ) OR NOT EXISTS (
      SELECT 1
      FROM pg_constraint AS constraint_info
      WHERE constraint_info.conrelid = 'public.external_control_installations'::regclass
        AND constraint_info.conname = 'external_control_route_installation_unique'
        AND constraint_info.contype = 'u'
        AND pg_get_constraintdef(constraint_info.oid) =
          'UNIQUE (provider, external_installation_id_hmac, external_route_id_hmac)'
    )
  THEN
    RAISE EXCEPTION 'external route uniqueness constraints are not exact';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_info
    WHERE constraint_info.conrelid = 'public.external_control_principals'::regclass
      AND constraint_info.conname = 'external_control_principal_installation_fk'
      AND constraint_info.contype = 'f'
      AND constraint_info.confrelid = 'public.external_control_installations'::regclass
      AND constraint_info.confdeltype = 'r'
      AND pg_get_constraintdef(constraint_info.oid) LIKE
        'FOREIGN KEY (installation_id, organization_id) REFERENCES %external_control_installations(id, organization_id) ON DELETE RESTRICT'
  ) THEN
    RAISE EXCEPTION 'principal installation/organization composite FK is not exact';
  END IF;

  FOREACH relation_name IN ARRAY ARRAY[
    'external_control_installations',
    'external_control_principals',
    'external_command_claims',
    'external_command_receipts'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = relation_name
        AND relation.relkind = 'r'
        AND relation.relrowsecurity
        AND relation.relforcerowsecurity
    ) THEN
      RAISE EXCEPTION '% does not FORCE RLS', relation_name;
    END IF;

    SELECT count(*) INTO policy_count
    FROM pg_policies AS policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename = relation_name
      AND policy.cmd = 'SELECT'
      AND cardinality(policy.roles) = 1
      AND 'authenticated'::name = ANY(policy.roles);
    IF policy_count <> 1 OR (
      SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = relation_name
    ) <> 1 THEN
      RAISE EXCEPTION '% does not have one authenticated SELECT policy', relation_name;
    END IF;

    IF NOT has_table_privilege(
        'authenticated', format('public.%I', relation_name), 'SELECT')
      OR has_table_privilege(
        'authenticated', format('public.%I', relation_name), 'INSERT')
      OR has_table_privilege(
        'authenticated', format('public.%I', relation_name), 'UPDATE')
      OR has_table_privilege(
        'authenticated', format('public.%I', relation_name), 'DELETE')
      OR has_table_privilege(
        'authenticated', format('public.%I', relation_name), 'TRUNCATE')
      OR has_table_privilege(
        'anon', format('public.%I', relation_name), 'SELECT')
    THEN
      RAISE EXCEPTION '% browser privilege boundary is incorrect', relation_name;
    END IF;
    IF has_table_privilege(
      'service_role', format('public.%I', relation_name), 'TRUNCATE')
    THEN
      RAISE EXCEPTION 'service_role can truncate %', relation_name;
    END IF;
  END LOOP;

  IF NOT COALESCE((
    SELECT role_info.rolbypassrls
    FROM pg_roles AS role_info
    WHERE role_info.rolname = 'service_role'
  ), false) THEN
    RAISE EXCEPTION 'service_role does not have the required FORCE-RLS bypass';
  END IF;

  SELECT procedure.oid,
         COALESCE(array_to_string(procedure.proconfig, ','), '')
  INTO function_oid, function_config
  FROM pg_proc AS procedure
  WHERE procedure.oid = to_regprocedure('public.external_control_is_org_admin(uuid)');
  IF function_oid IS NULL
    OR NOT (SELECT prosecdef FROM pg_proc WHERE oid = function_oid)
    OR position('search_path=' IN function_config) = 0
    OR position('public' IN function_config) > 0
    OR has_function_privilege('anon', function_oid, 'EXECUTE')
    OR NOT has_function_privilege('authenticated', function_oid, 'EXECUTE')
    OR NOT has_function_privilege('service_role', function_oid, 'EXECUTE')
    OR (
      SELECT count(*)
      FROM pg_policies AS policy
      WHERE policy.schemaname = 'public'
        AND policy.tablename IN (
          'external_control_installations',
          'external_control_principals',
          'external_command_claims',
          'external_command_receipts'
        )
        AND policy.qual LIKE '%external_control_is_org_admin(organization_id)%'
    ) <> 4
  THEN
    RAISE EXCEPTION 'external admin RLS helper is not an exact pinned capability';
  END IF;

  IF NOT has_table_privilege(
      'service_role', 'public.external_control_installations', 'INSERT')
    OR NOT has_table_privilege(
      'service_role', 'public.external_control_installations', 'UPDATE')
    OR has_table_privilege(
      'service_role', 'public.external_control_installations', 'DELETE')
    OR NOT has_table_privilege(
      'service_role', 'public.external_control_principals', 'INSERT')
    OR NOT has_table_privilege(
      'service_role', 'public.external_control_principals', 'UPDATE')
    OR has_table_privilege(
      'service_role', 'public.external_control_principals', 'DELETE')
    OR has_table_privilege(
      'service_role', 'public.external_command_claims', 'INSERT')
    OR has_table_privilege(
      'service_role', 'public.external_command_claims', 'UPDATE')
    OR has_table_privilege(
      'service_role', 'public.external_command_claims', 'DELETE')
    OR has_table_privilege(
      'service_role', 'public.external_command_receipts', 'INSERT')
    OR has_table_privilege(
      'service_role', 'public.external_command_receipts', 'UPDATE')
    OR has_table_privilege(
      'service_role', 'public.external_command_receipts', 'DELETE')
  THEN
    RAISE EXCEPTION 'service installation/evidence privileges are incorrect';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns AS column_info
    WHERE column_info.table_schema = 'public'
      AND column_info.table_name IN (
        'external_control_installations',
        'external_control_principals',
        'external_command_claims',
        'external_command_receipts'
      )
      AND (
        column_info.column_name IN (
          'secret', 'token', 'access_token', 'refresh_token', 'url',
          'callback_url', 'response_url', 'raw_payload', 'payload', 'body',
          'phone', 'phone_number', 'email', 'name', 'display_name'
        )
        OR column_info.column_name LIKE '%secret%'
        OR column_info.column_name LIKE '%url%'
      )
  ) THEN
    RAISE EXCEPTION 'external observer schema contains a raw secret/URL/payload column';
  END IF;

  IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint AS constraint_info
      WHERE constraint_info.conrelid = 'public.external_command_claims'::regclass
        AND constraint_info.conname = 'external_command_claim_name'
        AND pg_get_constraintdef(constraint_info.oid) LIKE '%operator.context%'
        AND pg_get_constraintdef(constraint_info.oid) LIKE '%system.status%'
        AND pg_get_constraintdef(constraint_info.oid) LIKE '%campaign.list%'
        AND pg_get_constraintdef(constraint_info.oid) LIKE '%campaign.inspect%'
        AND pg_get_constraintdef(constraint_info.oid) NOT LIKE '%campaign.pause%'
    ) OR NOT EXISTS (
      SELECT 1
      FROM pg_constraint AS constraint_info
      WHERE constraint_info.conrelid = 'public.external_command_receipts'::regclass
        AND constraint_info.conname = 'external_command_receipt_name'
        AND pg_get_constraintdef(constraint_info.oid) LIKE '%operator.context%'
        AND pg_get_constraintdef(constraint_info.oid) LIKE '%system.status%'
        AND pg_get_constraintdef(constraint_info.oid) LIKE '%campaign.list%'
        AND pg_get_constraintdef(constraint_info.oid) LIKE '%campaign.inspect%'
        AND pg_get_constraintdef(constraint_info.oid) NOT LIKE '%campaign.pause%'
    ) OR NOT EXISTS (
      SELECT 1
      FROM pg_constraint AS constraint_info
      WHERE constraint_info.conrelid = 'public.external_command_claims'::regclass
        AND constraint_info.conname = 'external_command_claim_schema_version'
        AND pg_get_constraintdef(constraint_info.oid) LIKE '%control.command.v1%'
    ) OR NOT EXISTS (
      SELECT 1
      FROM pg_constraint AS constraint_info
      WHERE constraint_info.conrelid = 'public.external_command_receipts'::regclass
        AND constraint_info.conname = 'external_command_receipt_schema_version'
        AND pg_get_constraintdef(constraint_info.oid) LIKE '%control.command.v1%'
    )
  THEN
    RAISE EXCEPTION 'observer command/schema allowlist constraints are not exact';
  END IF;
  FOREACH relation_name IN ARRAY ARRAY[
    'external_command_claims',
    'external_command_receipts'
  ] LOOP
    SELECT array_agg(extracted.match[1] ORDER BY extracted.match[1])
    INTO constraint_literals
    FROM pg_constraint AS constraint_info
    CROSS JOIN LATERAL regexp_matches(
      pg_get_constraintdef(constraint_info.oid),
      $command_literal$'([^']+)'$command_literal$,
      'g'
    ) AS extracted(match)
    WHERE constraint_info.conrelid = format('public.%I', relation_name)::regclass
      AND constraint_info.conname = CASE relation_name
        WHEN 'external_command_claims' THEN 'external_command_claim_name'
        ELSE 'external_command_receipt_name'
      END;
    IF constraint_literals IS DISTINCT FROM ARRAY[
      'campaign.inspect', 'campaign.list', 'operator.context', 'system.status'
    ]::text[] THEN
      RAISE EXCEPTION '% command allowlist contains non-R0 values: %',
        relation_name, constraint_literals;
    END IF;

    SELECT array_agg(extracted.match[1] ORDER BY extracted.match[1])
    INTO constraint_literals
    FROM pg_constraint AS constraint_info
    CROSS JOIN LATERAL regexp_matches(
      pg_get_constraintdef(constraint_info.oid),
      $schema_literal$'([^']+)'$schema_literal$,
      'g'
    ) AS extracted(match)
    WHERE constraint_info.conrelid = format('public.%I', relation_name)::regclass
      AND constraint_info.conname = CASE relation_name
        WHEN 'external_command_claims' THEN 'external_command_claim_schema_version'
        ELSE 'external_command_receipt_schema_version'
      END;
    IF constraint_literals IS DISTINCT FROM ARRAY['control.command.v1']::text[] THEN
      RAISE EXCEPTION '% command schema allowlist is not exact: %',
        relation_name, constraint_literals;
    END IF;
  END LOOP;

  IF (
    SELECT count(*)
    FROM pg_attribute AS attribute
    WHERE attribute.attrelid IN (
        'public.external_control_installations'::regclass,
        'public.external_control_principals'::regclass,
        'public.external_command_claims'::regclass,
        'public.external_command_receipts'::regclass
      )
      AND attribute.attname IN (
        'contact_authorized', 'launch_authorized',
        'queue_mutation_authorized', 'crm_write_authorized', 'spend_authorized'
      )
      AND attribute.attgenerated = 's'
  ) <> 20 THEN
    RAISE EXCEPTION 'observer authority flags are not generated constants';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_attribute AS attribute
    JOIN pg_attrdef AS default_info
      ON default_info.adrelid = attribute.attrelid
     AND default_info.adnum = attribute.attnum
    WHERE attribute.attrelid IN (
        'public.external_control_installations'::regclass,
        'public.external_control_principals'::regclass,
        'public.external_command_claims'::regclass,
        'public.external_command_receipts'::regclass
      )
      AND attribute.attname IN (
        'contact_authorized', 'launch_authorized',
        'queue_mutation_authorized', 'crm_write_authorized', 'spend_authorized'
      )
      AND pg_get_expr(default_info.adbin, default_info.adrelid) IS DISTINCT FROM 'false'
  ) THEN
    RAISE EXCEPTION 'an observer authority flag is not generated from literal false';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_attribute AS attribute
    WHERE attribute.attrelid IN (
        'public.external_control_installations'::regclass,
        'public.external_control_principals'::regclass,
        'public.external_command_claims'::regclass,
        'public.external_command_receipts'::regclass
      )
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND (
        attribute.attname LIKE '%authorized%'
        OR attribute.attname LIKE '%authority%'
        OR attribute.attname LIKE '%permission%'
        OR left(attribute.attname, 4) = 'can_'
      )
      AND attribute.attname NOT IN (
        'contact_authorized', 'launch_authorized',
        'queue_mutation_authorized', 'crm_write_authorized', 'spend_authorized'
      )
  ) THEN
    RAISE EXCEPTION 'unexpected observer authority-like column exists';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('external_command_claims', 'external_command_receipts')
      AND column_name = 'crm_mutation_authorized'
  ) THEN
    RAISE EXCEPTION 'legacy CRM authority field name remains';
  END IF;

  IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'public.external_command_claims'::regclass
        AND tgname = 'external_command_claim_append_only'
        AND NOT tgisinternal
    ) OR NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'public.external_command_receipts'::regclass
        AND tgname = 'external_command_receipt_append_only'
        AND NOT tgisinternal
    )
  THEN
    RAISE EXCEPTION 'external evidence append-only trigger is missing';
  END IF;
  IF (
    SELECT count(*)
    FROM (VALUES
      ('external_control_installation_no_truncate',
        'public.external_control_installations'::regclass),
      ('external_control_principal_no_truncate',
        'public.external_control_principals'::regclass),
      ('external_command_claim_no_truncate',
        'public.external_command_claims'::regclass),
      ('external_command_receipt_no_truncate',
        'public.external_command_receipts'::regclass)
    ) AS expected(trigger_name, relation_oid)
    JOIN pg_trigger AS trigger_info
      ON trigger_info.tgname = expected.trigger_name
     AND trigger_info.tgrelid = expected.relation_oid
    WHERE trigger_info.tgenabled = 'O'
      AND NOT trigger_info.tgisinternal
      AND trigger_info.tgtype = 34
      AND trigger_info.tgfoid =
        to_regprocedure('public.protect_external_control_truncate()')
  ) <> 4 THEN
    RAISE EXCEPTION 'external control truncate trigger set is incomplete';
  END IF;
  SELECT procedure.oid,
         COALESCE(array_to_string(procedure.proconfig, ','), '')
  INTO function_oid, function_config
  FROM pg_proc AS procedure
  JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname = 'protect_external_control_truncate';
  IF function_oid IS NULL
    OR NOT (SELECT prosecdef FROM pg_proc WHERE oid = function_oid)
    OR position('search_path=' IN function_config) = 0
    OR position('public' IN function_config) > 0
    OR has_function_privilege('anon', function_oid, 'EXECUTE')
    OR has_function_privilege('authenticated', function_oid, 'EXECUTE')
    OR has_function_privilege('service_role', function_oid, 'EXECUTE')
  THEN
    RAISE EXCEPTION 'external truncate guard is not a pinned trigger-only capability';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_info
    WHERE constraint_info.contype = 'f'
      AND constraint_info.conrelid IN (
        'public.external_command_claims'::regclass,
        'public.external_command_receipts'::regclass
      )
      AND constraint_info.confdeltype <> 'r'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE contype = 'f'
      AND conrelid = 'public.external_command_receipts'::regclass
  ) THEN
    RAISE EXCEPTION 'external evidence has a cascading/non-RESTRICT foreign key';
  END IF;

  SELECT procedure.oid,
         COALESCE(array_to_string(procedure.proconfig, ','), '')
  INTO function_oid, function_config
  FROM pg_proc AS procedure
  JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
  WHERE procedure.oid = to_regprocedure(
    'public.claim_external_observer_command(uuid,uuid,text,text,text,text,text,text,timestamptz)'
  );
  IF function_oid IS NULL
    OR (SELECT count(*) FROM pg_proc AS procedure
        JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
        WHERE namespace.nspname = 'public'
          AND procedure.proname = 'claim_external_observer_command') <> 1
    OR NOT (SELECT prosecdef FROM pg_proc WHERE oid = function_oid)
    OR function_config <> 'search_path=""'
    OR NOT has_function_privilege('service_role', function_oid, 'EXECUTE')
    OR has_function_privilege('authenticated', function_oid, 'EXECUTE')
    OR has_function_privilege('anon', function_oid, 'EXECUTE')
    OR NOT EXISTS (
      SELECT 1
      FROM pg_proc AS owned_procedure
      JOIN pg_roles AS owner_role ON owner_role.oid = owned_procedure.proowner
      WHERE owned_procedure.oid = function_oid
        AND (owner_role.rolsuper OR owner_role.rolbypassrls)
    )
  THEN
    RAISE EXCEPTION 'observer claim RPC is not an exact pinned service capability';
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
    'f2000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'observer-owner-a@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'f2000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'observer-admin-a@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'f2000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 'observer-member-a@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'f2000000-0000-4000-8000-000000000004',
    'authenticated', 'authenticated', 'observer-owner-b@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  );

INSERT INTO public.organizations (id, name, slug) VALUES
  ('f1000000-0000-4000-8000-000000000001', 'Observer Tenant A', 'observer-tenant-a'),
  ('f1000000-0000-4000-8000-000000000002', 'Observer Tenant B', 'observer-tenant-b');

INSERT INTO public.organization_users (organization_id, user_id, role) VALUES
  ('f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'owner'),
  ('f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000002', 'admin'),
  ('f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000003', 'member'),
  ('f1000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000004', 'owner'),
  -- The primary owner is deliberately multi-membership. Every observer call
  -- must still name one explicit organization and installation.
  ('f1000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000001', 'member');

INSERT INTO public.external_control_installations (
  id, organization_id, provider,
  external_tenant_id_hmac, external_installation_id_hmac,
  external_route_id_hmac, identifier_key_version,
  status, created_by_user_id
) VALUES
  (
    'f3000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000001', 'slack',
    repeat('a', 64), repeat('b', 64), repeat('c', 64), 'observer-hmac-v1',
    'active', 'f2000000-0000-4000-8000-000000000001'
  ),
  (
    'f3000000-0000-4000-8000-000000000002',
    'f1000000-0000-4000-8000-000000000002', 'slack',
    repeat('a', 64), repeat('d', 64), repeat('e', 64), 'observer-hmac-v1',
    'active', 'f2000000-0000-4000-8000-000000000004'
  );

DO $installation_binding_contract$
BEGIN
  BEGIN
    INSERT INTO public.external_control_installations (
      id, organization_id, provider,
      external_tenant_id_hmac, external_installation_id_hmac,
      external_route_id_hmac, identifier_key_version,
      status, created_by_user_id
    ) VALUES (
      'f3000000-0000-4000-8000-000000000099',
      'f1000000-0000-4000-8000-000000000002', 'slack',
      repeat('a', 64), repeat('9', 64), repeat('c', 64), 'observer-hmac-v1',
      'active', 'f2000000-0000-4000-8000-000000000004'
    );
    RAISE EXCEPTION 'one external workspace route bound two organizations';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.external_control_installations (
      id, organization_id, provider,
      external_tenant_id_hmac, external_installation_id_hmac,
      external_route_id_hmac, identifier_key_version,
      status, created_by_user_id
    ) VALUES (
      'f3000000-0000-4000-8000-000000000097',
      'f1000000-0000-4000-8000-000000000002', 'slack',
      repeat('9', 64), repeat('b', 64), repeat('c', 64), 'observer-hmac-v1',
      'active', 'f2000000-0000-4000-8000-000000000004'
    );
    RAISE EXCEPTION 'one external installation route bound two organizations';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.external_control_installations (
      id, organization_id, provider,
      external_tenant_id_hmac, external_installation_id_hmac,
      external_route_id_hmac, identifier_key_version,
      status, created_by_user_id
    ) VALUES (
      'f3000000-0000-4000-8000-000000000098',
      'f1000000-0000-4000-8000-000000000001', 'mcp',
      repeat('8', 64), repeat('7', 64), repeat('6', 64), 'observer-hmac-v1',
      'active', 'f2000000-0000-4000-8000-000000000003'
    );
    RAISE EXCEPTION 'ordinary member created an external installation';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%EXTERNAL_CONTROL_INSTALLATION_ADMIN_REQUIRED%' THEN
      RAISE;
    END IF;
  END;
END;
$installation_binding_contract$;

INSERT INTO public.external_control_principals (
  id, installation_id, organization_id, external_principal_id_hmac,
  user_id, verification_evidence_sha256, identifier_key_version
) VALUES
  (
    'f4000000-0000-4000-8000-000000000001',
    'f3000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000001', repeat('d', 64),
    'f2000000-0000-4000-8000-000000000001', repeat('1', 64), 'observer-hmac-v1'
  ),
  (
    'f4000000-0000-4000-8000-000000000002',
    'f3000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000001', repeat('e', 64),
    'f2000000-0000-4000-8000-000000000002', repeat('2', 64), 'observer-hmac-v1'
  ),
  (
    'f4000000-0000-4000-8000-000000000003',
    'f3000000-0000-4000-8000-000000000002',
    'f1000000-0000-4000-8000-000000000002', repeat('f', 64),
    'f2000000-0000-4000-8000-000000000004', repeat('3', 64), 'observer-hmac-v1'
  );

DO $principal_binding_contract$
BEGIN
  BEGIN
    INSERT INTO public.external_control_principals (
      id, installation_id, organization_id, external_principal_id_hmac,
      user_id, verification_evidence_sha256, identifier_key_version
    ) VALUES (
      'f4000000-0000-4000-8000-000000000097',
      'f3000000-0000-4000-8000-000000000001',
      'f1000000-0000-4000-8000-000000000001', repeat('8', 64),
      'f2000000-0000-4000-8000-000000000001', repeat('6', 64), 'wrong-key-v2'
    );
    RAISE EXCEPTION 'principal HMAC key version diverged from installation';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%EXTERNAL_CONTROL_PRINCIPAL_KEY_VERSION_MISMATCH%' THEN
      RAISE;
    END IF;
  END;

  BEGIN
    INSERT INTO public.external_control_principals (
      id, installation_id, organization_id, external_principal_id_hmac,
      user_id, verification_evidence_sha256, identifier_key_version
    ) VALUES (
      'f4000000-0000-4000-8000-000000000099',
      'f3000000-0000-4000-8000-000000000001',
      'f1000000-0000-4000-8000-000000000001', repeat('9', 64),
      'f2000000-0000-4000-8000-000000000003', repeat('8', 64), 'observer-hmac-v1'
    );
    RAISE EXCEPTION 'ordinary member became an external control principal';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%EXTERNAL_CONTROL_PRINCIPAL_ADMIN_REQUIRED%' THEN
      RAISE;
    END IF;
  END;
END;
$principal_binding_contract$;

-- FORCE RLS is deliberate: service_role must be able to provision the two
-- mutable binding tables, while direct evidence writes remain unavailable.
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
DO $service_provisioning_contract$
BEGIN
  BEGIN
    INSERT INTO public.external_control_installations (
      id, organization_id, provider,
      external_tenant_id_hmac, external_installation_id_hmac,
      external_route_id_hmac, identifier_key_version,
      status, created_by_user_id
    ) VALUES (
      'f3000000-0000-4000-8000-000000000096',
      'f1000000-0000-4000-8000-000000000001', 'zapier',
      repeat('1', 64), repeat('2', 64), repeat('3', 64), 'observer-hmac-v1',
      'pending', 'f2000000-0000-4000-8000-000000000001'
    );
    RAISE EXCEPTION 'SERVICE_PROVISION_INSTALLATION_OK';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'SERVICE_PROVISION_INSTALLATION_OK' THEN RAISE; END IF;
  END;

  BEGIN
    INSERT INTO public.external_control_principals (
      id, installation_id, organization_id, external_principal_id_hmac,
      user_id, verification_evidence_sha256, identifier_key_version
    ) VALUES (
      'f4000000-0000-4000-8000-000000000096',
      'f3000000-0000-4000-8000-000000000001',
      'f1000000-0000-4000-8000-000000000001', repeat('9', 64),
      'f2000000-0000-4000-8000-000000000001', repeat('7', 64), 'observer-hmac-v1'
    );
    RAISE EXCEPTION 'SERVICE_PROVISION_PRINCIPAL_OK';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'SERVICE_PROVISION_PRINCIPAL_OK' THEN RAISE; END IF;
  END;
END;
$service_provisioning_contract$;
RESET ROLE;
SELECT set_config('request.jwt.claim.role', '', true);

-- Existing browser surfaces used by the containment tests.
INSERT INTO public.api_keys (
  id, organization_id, user_id, name, key_prefix, key_hash, scopes,
  rate_limit_per_minute
) VALUES
  (
    'f5000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000001',
    'f2000000-0000-4000-8000-000000000001',
    'Tenant A fixture', 'dsk_live_AAA', repeat('4', 64), ARRAY['read']::text[], 120
  ),
  (
    'f5000000-0000-4000-8000-000000000002',
    'f1000000-0000-4000-8000-000000000002',
    'f2000000-0000-4000-8000-000000000004',
    'Tenant B fixture', 'dsk_live_BBB', repeat('5', 64), ARRAY['read']::text[], 120
  );

INSERT INTO public.slack_users (
  id, slack_team_id, slack_user_id, user_id, display_name, organization_id
) VALUES (
  'f7000000-0000-4000-8000-000000000001',
  'T_OBSERVER_A', 'U_OBSERVER_A',
  'f2000000-0000-4000-8000-000000000001', 'Owner A',
  'f1000000-0000-4000-8000-000000000001'
);

INSERT INTO public.calendar_integrations (
  id, user_id, provider, provider_account_id,
  access_token_encrypted, refresh_token_encrypted, calendar_id
) VALUES (
  'f6000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001',
  'google', 'provider-account-fixture',
  'base64-access-fixture', 'base64-refresh-fixture', 'primary-fixture'
);

CREATE TEMP TABLE external_claim_results (
  label text PRIMARY KEY,
  claim_id uuid NOT NULL,
  receipt_id uuid NOT NULL,
  commit_status text NOT NULL,
  decision text NOT NULL,
  reason_codes text[] NOT NULL
);
GRANT SELECT, INSERT ON external_claim_results TO service_role;

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);

INSERT INTO external_claim_results
SELECT 'tenant_a_first', result.*
FROM public.claim_external_observer_command(
  'f1000000-0000-4000-8000-000000000001',
  'f3000000-0000-4000-8000-000000000001',
  repeat('d', 64), repeat('6', 64), repeat('7', 64), repeat('8', 64),
  'system.status', 'control.command.v1', '2026-07-13T18:00:00Z'
) AS result;

INSERT INTO external_claim_results
SELECT 'tenant_a_duplicate', result.*
FROM public.claim_external_observer_command(
  'f1000000-0000-4000-8000-000000000001',
  'f3000000-0000-4000-8000-000000000001',
  repeat('d', 64), repeat('6', 64), repeat('7', 64), repeat('8', 64),
  'system.status', 'control.command.v1', '2026-07-13T18:00:00Z'
) AS result;

-- Same external event and raw payload, but a changed canonical intent digest,
-- is a collision. The original intent digest must remain immutable.
INSERT INTO external_claim_results
SELECT 'tenant_a_collision', result.*
FROM public.claim_external_observer_command(
  'f1000000-0000-4000-8000-000000000001',
  'f3000000-0000-4000-8000-000000000001',
  repeat('d', 64), repeat('6', 64), repeat('7', 64), repeat('9', 64),
  'system.status', 'control.command.v1', '2026-07-13T18:00:00Z'
) AS result;

-- A changed raw payload is also a collision even when canonical intent stays
-- identical. The first payload and intent pair remains the logical claim.
INSERT INTO external_claim_results
SELECT 'tenant_a_payload_first', result.*
FROM public.claim_external_observer_command(
  'f1000000-0000-4000-8000-000000000001',
  'f3000000-0000-4000-8000-000000000001',
  repeat('d', 64), repeat('5', 64), repeat('c', 64), repeat('e', 64),
  'operator.context', 'control.command.v1', '2026-07-13T18:01:00Z'
) AS result;

INSERT INTO external_claim_results
SELECT 'tenant_a_payload_collision', result.*
FROM public.claim_external_observer_command(
  'f1000000-0000-4000-8000-000000000001',
  'f3000000-0000-4000-8000-000000000001',
  repeat('d', 64), repeat('5', 64), repeat('d', 64), repeat('e', 64),
  'operator.context', 'control.command.v1', '2026-07-13T18:01:00Z'
) AS result;

-- The same provider event hash is valid in another explicit installation.
INSERT INTO external_claim_results
SELECT 'tenant_b_first', result.*
FROM public.claim_external_observer_command(
  'f1000000-0000-4000-8000-000000000002',
  'f3000000-0000-4000-8000-000000000002',
  repeat('f', 64), repeat('6', 64), repeat('a', 64), repeat('b', 64),
  'campaign.list', 'control.command.v1', '2026-07-13T18:00:00Z'
) AS result;

DO $service_claim_denials$
BEGIN
  BEGIN
    PERFORM public.claim_external_observer_command(
      NULL,
      'f3000000-0000-4000-8000-000000000001',
      repeat('d', 64), repeat('1', 64), repeat('2', 64), repeat('3', 64),
      'operator.context', 'control.command.v1', now()
    );
    RAISE EXCEPTION 'observer claim selected an implicit organization';
  EXCEPTION WHEN invalid_parameter_value THEN
    IF SQLERRM NOT LIKE '%EXTERNAL_OBSERVER_EXPLICIT_ORGANIZATION_AND_INSTALLATION_REQUIRED%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.claim_external_observer_command(
      'f1000000-0000-4000-8000-000000000002',
      'f3000000-0000-4000-8000-000000000001',
      repeat('d', 64), repeat('1', 64), repeat('2', 64), repeat('3', 64),
      'operator.context', 'control.command.v1', now()
    );
    RAISE EXCEPTION 'observer installation crossed organizations';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%EXTERNAL_OBSERVER_ACTIVE_INSTALLATION_REQUIRED%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.claim_external_observer_command(
      'f1000000-0000-4000-8000-000000000001',
      'f3000000-0000-4000-8000-000000000001',
      repeat('f', 64), repeat('1', 64), repeat('2', 64), repeat('3', 64),
      'operator.context', 'control.command.v1', now()
    );
    RAISE EXCEPTION 'principal from another installation crossed the boundary';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%EXTERNAL_OBSERVER_LIVE_ADMIN_PRINCIPAL_REQUIRED%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.claim_external_observer_command(
      'f1000000-0000-4000-8000-000000000001',
      'f3000000-0000-4000-8000-000000000001',
      repeat('d', 64), repeat('1', 64), repeat('2', 64), repeat('3', 64),
      'campaign.pause', 'control.command.v1', now()
    );
    RAISE EXCEPTION 'non-R0 command entered the observer claim lane';
  EXCEPTION WHEN invalid_parameter_value THEN
    IF SQLERRM NOT LIKE '%EXTERNAL_OBSERVER_CANONICAL_COMMAND_ENVELOPE_REQUIRED%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.claim_external_observer_command(
      'f1000000-0000-4000-8000-000000000001',
      'f3000000-0000-4000-8000-000000000001',
      repeat('d', 64), repeat('1', 64), repeat('2', 64), repeat('3', 64),
      'system.status', 'control.command.v2', now()
    );
    RAISE EXCEPTION 'wrong command schema version entered the observer lane';
  EXCEPTION WHEN invalid_parameter_value THEN
    IF SQLERRM NOT LIKE '%EXTERNAL_OBSERVER_CANONICAL_COMMAND_ENVELOPE_REQUIRED%' THEN RAISE; END IF;
  END;
END;
$service_claim_denials$;

RESET ROLE;
SELECT set_config('request.jwt.claim.role', '', true);

-- Role and membership are live authority, not snapshots on the principal row.
UPDATE public.organization_users
SET role = 'member'
WHERE organization_id = 'f1000000-0000-4000-8000-000000000001'
  AND user_id = 'f2000000-0000-4000-8000-000000000002';

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
DO $downgraded_principal_denied$
BEGIN
  BEGIN
    PERFORM public.claim_external_observer_command(
      'f1000000-0000-4000-8000-000000000001',
      'f3000000-0000-4000-8000-000000000001',
      repeat('e', 64), repeat('c', 64), repeat('d', 64), repeat('e', 64),
      'campaign.inspect', 'control.command.v1', now()
    );
    RAISE EXCEPTION 'role-downgraded principal retained observer authority';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%EXTERNAL_OBSERVER_LIVE_ADMIN_PRINCIPAL_REQUIRED%' THEN RAISE; END IF;
  END;
END;
$downgraded_principal_denied$;
RESET ROLE;
SELECT set_config('request.jwt.claim.role', '', true);

DELETE FROM public.organization_users
WHERE organization_id = 'f1000000-0000-4000-8000-000000000001'
  AND user_id = 'f2000000-0000-4000-8000-000000000002';

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
DO $removed_principal_denied$
BEGIN
  BEGIN
    PERFORM public.claim_external_observer_command(
      'f1000000-0000-4000-8000-000000000001',
      'f3000000-0000-4000-8000-000000000001',
      repeat('e', 64), repeat('f', 64), repeat('1', 64), repeat('2', 64),
      'campaign.inspect', 'control.command.v1', now()
    );
    RAISE EXCEPTION 'removed principal retained observer authority';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%EXTERNAL_OBSERVER_LIVE_ADMIN_PRINCIPAL_REQUIRED%' THEN RAISE; END IF;
  END;
END;
$removed_principal_denied$;
RESET ROLE;
SELECT set_config('request.jwt.claim.role', '', true);

INSERT INTO public.organization_users (organization_id, user_id, role) VALUES
  ('f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000002', 'admin');

DO $replay_contract$
BEGIN
  IF (SELECT count(*) FROM external_claim_results WHERE commit_status = 'committed') <> 3
    OR (SELECT count(*) FROM external_claim_results WHERE commit_status = 'duplicate') <> 1
    OR (SELECT count(*) FROM external_claim_results WHERE commit_status = 'event_id_collision') <> 2
    OR (SELECT count(*) FROM public.external_command_claims) <> 3
    OR (SELECT count(*) FROM public.external_command_receipts) <> 6
  THEN
    RAISE EXCEPTION 'first/replay/collision accounting is incorrect';
  END IF;
  IF (
      SELECT count(DISTINCT claim_id)
      FROM external_claim_results
      WHERE label IN ('tenant_a_first', 'tenant_a_duplicate', 'tenant_a_collision')
    ) <> 1
    OR (
      SELECT count(DISTINCT claim_id)
      FROM external_claim_results
      WHERE label IN ('tenant_a_payload_first', 'tenant_a_payload_collision')
    ) <> 1
    OR (
      SELECT claim_id FROM external_claim_results WHERE label = 'tenant_a_first'
    ) = (
      SELECT claim_id FROM external_claim_results WHERE label = 'tenant_a_payload_first'
    )
    OR (
      SELECT claim_id FROM external_claim_results WHERE label = 'tenant_a_first'
    ) = (
      SELECT claim_id FROM external_claim_results WHERE label = 'tenant_b_first'
    )
  THEN
    RAISE EXCEPTION 'logical claims are not installation-scoped';
  END IF;
  IF NOT EXISTS (
      SELECT 1
      FROM public.external_command_claims
      WHERE installation_id = 'f3000000-0000-4000-8000-000000000001'
        AND payload_sha256 = repeat('7', 64)
        AND intent_sha256 = repeat('8', 64)
        AND command_name = 'system.status'
        AND command_schema_version = 'control.command.v1'
        AND decision = 'held'
    ) OR NOT EXISTS (
      SELECT 1
      FROM public.external_command_receipts
      WHERE commit_status = 'event_id_collision'
        AND attempted_payload_sha256 = repeat('7', 64)
        AND attempted_intent_sha256 = repeat('9', 64)
        AND decision = 'quarantined'
    ) OR NOT EXISTS (
      SELECT 1
      FROM public.external_command_claims
      WHERE installation_id = 'f3000000-0000-4000-8000-000000000001'
        AND external_event_id_hmac = repeat('5', 64)
        AND payload_sha256 = repeat('c', 64)
        AND intent_sha256 = repeat('e', 64)
        AND command_name = 'operator.context'
    ) OR NOT EXISTS (
      SELECT 1
      FROM public.external_command_receipts
      WHERE commit_status = 'event_id_collision'
        AND attempted_external_event_id_hmac = repeat('5', 64)
        AND attempted_payload_sha256 = repeat('d', 64)
        AND attempted_intent_sha256 = repeat('e', 64)
        AND decision = 'quarantined'
    )
  THEN
    RAISE EXCEPTION 'first intent was overwritten or collision evidence was lost';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.external_control_installations
    WHERE contact_authorized OR launch_authorized OR queue_mutation_authorized
      OR crm_write_authorized OR spend_authorized
  ) OR EXISTS (
    SELECT 1 FROM public.external_control_principals
    WHERE contact_authorized OR launch_authorized OR queue_mutation_authorized
      OR crm_write_authorized OR spend_authorized
  ) OR EXISTS (
    SELECT 1 FROM public.external_command_claims
    WHERE contact_authorized OR launch_authorized OR queue_mutation_authorized
      OR crm_write_authorized OR spend_authorized OR decision <> 'held'
  ) OR EXISTS (
    SELECT 1 FROM public.external_command_receipts
    WHERE contact_authorized OR launch_authorized OR queue_mutation_authorized
      OR crm_write_authorized OR spend_authorized
  ) THEN
    RAISE EXCEPTION 'observer evidence gained operational authority';
  END IF;
END;
$replay_contract$;

-- Tenant-scoped redacted reads and browser mutation denials.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'f2000000-0000-4000-8000-000000000002', true);
DO $admin_a_browser_contract$
BEGIN
  IF (SELECT count(*) FROM public.external_control_installations) <> 1
    OR (SELECT count(*) FROM public.external_control_principals) <> 2
    OR (SELECT count(*) FROM public.external_command_claims) <> 2
    OR (SELECT count(*) FROM public.external_command_receipts) <> 5
  THEN
    RAISE EXCEPTION 'Tenant A admin redacted observer view crossed a tenant';
  END IF;
END;
$admin_a_browser_contract$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'f2000000-0000-4000-8000-000000000001', true);
DO $owner_a_browser_contract$
DECLARE
  observed integer;
BEGIN
  SELECT count(id) INTO observed FROM public.api_keys;
  IF observed <> 1 THEN
    RAISE EXCEPTION 'Tenant A owner saw wrong API-key metadata count: %', observed;
  END IF;
  IF (SELECT count(*) FROM public.slack_users) <> 1
    OR (SELECT count(*) FROM public.external_control_installations) <> 1
    OR (SELECT count(*) FROM public.external_control_principals) <> 2
    OR (SELECT count(*) FROM public.external_command_claims) <> 2
    OR (SELECT count(*) FROM public.external_command_receipts) <> 5
  THEN
    RAISE EXCEPTION 'Tenant A owner redacted observer view crossed a tenant';
  END IF;
  BEGIN
    PERFORM key_hash FROM public.api_keys;
    RAISE EXCEPTION 'browser selected API key hash';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.api_keys
    SET scopes = ARRAY['admin']::text[]
    WHERE id = 'f5000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'browser updated API-key scopes';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.api_keys
    WHERE id = 'f5000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'browser deleted API key';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM access_token_encrypted FROM public.calendar_integrations;
    RAISE EXCEPTION 'browser selected calendar OAuth token';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$owner_a_browser_contract$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'f2000000-0000-4000-8000-000000000003', true);
DO $member_browser_contract$
BEGIN
  IF (SELECT count(*) FROM public.external_control_installations) <> 0
    OR (SELECT count(*) FROM public.external_control_principals) <> 0
    OR (SELECT count(*) FROM public.external_command_claims) <> 0
    OR (SELECT count(*) FROM public.external_command_receipts) <> 0
  THEN
    RAISE EXCEPTION 'ordinary member read owner/admin observer evidence';
  END IF;
  BEGIN
    INSERT INTO public.api_keys (
      organization_id, user_id, name, key_prefix, key_hash, scopes
    ) VALUES (
      'f1000000-0000-4000-8000-000000000001',
      'f2000000-0000-4000-8000-000000000003',
      'browser admin key', 'dsk_live_BAD', repeat('f', 64), ARRAY['admin']::text[]
    );
    RAISE EXCEPTION 'browser minted a chosen admin API key';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.mint_api_key(
      'f2000000-0000-4000-8000-000000000003',
      'browser mint', ARRAY['admin']::text[],
      'f1000000-0000-4000-8000-000000000001', 1000, NULL
    );
    RAISE EXCEPTION 'browser executed service mint_api_key';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.touch_api_key(
      'f5000000-0000-4000-8000-000000000001',
      '203.0.113.9'
    );
    RAISE EXCEPTION 'browser executed service touch_api_key';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.slack_users (
      slack_team_id, slack_user_id, user_id, organization_id
    ) VALUES (
      'T_GUESSED', 'U_GUESSED',
      'f2000000-0000-4000-8000-000000000003',
      'f1000000-0000-4000-8000-000000000001'
    );
    RAISE EXCEPTION 'browser self-claimed a guessed Slack identity';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.calendar_integrations
    SET access_token_encrypted = 'browser-replaced-token'
    WHERE id = 'f6000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'browser updated calendar OAuth token';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$member_browser_contract$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'f2000000-0000-4000-8000-000000000004', true);
DO $owner_b_browser_contract$
DECLARE
  observed integer;
BEGIN
  SELECT count(id) INTO observed FROM public.api_keys;
  IF observed <> 1
    OR (SELECT count(*) FROM public.external_control_installations) <> 1
    OR (SELECT count(*) FROM public.external_control_principals) <> 1
    OR (SELECT count(*) FROM public.external_command_claims) <> 1
    OR (SELECT count(*) FROM public.external_command_receipts) <> 1
    OR (SELECT count(*) FROM public.slack_users) <> 0
  THEN
    RAISE EXCEPTION 'Tenant B owner redacted view crossed a tenant';
  END IF;
END;
$owner_b_browser_contract$;
RESET ROLE;
SELECT set_config('request.jwt.claim.role', '', true);
SELECT set_config('request.jwt.claim.sub', '', true);

-- Service role has no direct evidence mutation or truncation capability.
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
DO $service_evidence_denial$
BEGIN
  BEGIN
    UPDATE public.external_command_receipts
    SET decision = 'held'
    WHERE id = (SELECT id FROM public.external_command_receipts LIMIT 1);
    RAISE EXCEPTION 'service_role updated an external receipt';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.external_command_receipts
    WHERE id = (SELECT id FROM public.external_command_receipts LIMIT 1);
    RAISE EXCEPTION 'service_role deleted an external receipt';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    TRUNCATE TABLE public.external_command_receipts;
    RAISE EXCEPTION 'service_role truncated external receipts';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$service_evidence_denial$;
RESET ROLE;
SELECT set_config('request.jwt.claim.role', '', true);

-- Row-owner attempts prove trigger semantics independently from ACL denial.
DO $append_only_and_lifecycle_contract$
BEGIN
  BEGIN
    TRUNCATE TABLE public.external_command_receipts;
    RAISE EXCEPTION 'table owner truncated external receipt evidence';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE 'EXTERNAL_CONTROL_TRUNCATE_FORBIDDEN:%' THEN RAISE; END IF;
  END;
  BEGIN
    TRUNCATE TABLE public.external_command_claims CASCADE;
    RAISE EXCEPTION 'table owner truncated external claim evidence';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE 'EXTERNAL_CONTROL_TRUNCATE_FORBIDDEN:%' THEN RAISE; END IF;
  END;
  BEGIN
    TRUNCATE TABLE public.external_control_principals CASCADE;
    RAISE EXCEPTION 'table owner truncated external principals';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE 'EXTERNAL_CONTROL_TRUNCATE_FORBIDDEN:%' THEN RAISE; END IF;
  END;
  BEGIN
    TRUNCATE TABLE public.external_control_installations CASCADE;
    RAISE EXCEPTION 'table owner truncated external installations';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE 'EXTERNAL_CONTROL_TRUNCATE_FORBIDDEN:%' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.external_command_receipts
    SET decision = 'held'
    WHERE id = (SELECT id FROM public.external_command_receipts LIMIT 1);
    RAISE EXCEPTION 'table owner updated external receipt evidence';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE 'EXTERNAL_COMMAND_EVIDENCE_APPEND_ONLY:%' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM public.external_command_receipts
    WHERE id = (SELECT id FROM public.external_command_receipts LIMIT 1);
    RAISE EXCEPTION 'table owner deleted external receipt evidence';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE 'EXTERNAL_COMMAND_EVIDENCE_APPEND_ONLY:%' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.external_command_claims
    SET payload_sha256 = repeat('0', 64)
    WHERE id = (SELECT id FROM public.external_command_claims LIMIT 1);
    RAISE EXCEPTION 'table owner changed first-seen claim evidence';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE 'EXTERNAL_COMMAND_EVIDENCE_APPEND_ONLY:%' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.external_control_installations
    SET organization_id = 'f1000000-0000-4000-8000-000000000002'
    WHERE id = 'f3000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'installation identity changed organizations';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%EXTERNAL_CONTROL_INSTALLATION_IDENTITY_IMMUTABLE%' THEN RAISE; END IF;
  END;

  UPDATE public.external_control_principals
  SET status = 'revoked'
  WHERE id = 'f4000000-0000-4000-8000-000000000001';
  BEGIN
    UPDATE public.external_control_principals
    SET status = 'active'
    WHERE id = 'f4000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'revoked external principal was reactivated';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%EXTERNAL_CONTROL_PRINCIPAL_REVOCATION_ONE_WAY%' THEN RAISE; END IF;
  END;

  UPDATE public.external_control_installations
  SET status = 'revoked'
  WHERE id = 'f3000000-0000-4000-8000-000000000001';
  BEGIN
    UPDATE public.external_control_installations
    SET status = 'active'
    WHERE id = 'f3000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'revoked external installation was reactivated';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%EXTERNAL_CONTROL_INSTALLATION_INVALID_TRANSITION%' THEN RAISE; END IF;
  END;
END;
$append_only_and_lifecycle_contract$;

ROLLBACK;
