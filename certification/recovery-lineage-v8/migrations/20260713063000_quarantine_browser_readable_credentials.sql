BEGIN;

-- credential_value_encrypted historically contains browser-generated base64,
-- which is encoding rather than encryption. Preserve existing integrations for
-- service-side migration, but remove every direct client capability now. A
-- later credential service must move provider secrets to Vault or envelope-
-- encrypted storage and expose only non-secret connection metadata.
ALTER TABLE public.user_credentials ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  policy_name text;
  column_list text;
BEGIN
  FOR policy_name IN
    SELECT policy.policyname
    FROM pg_policies AS policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename = 'user_credentials'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.user_credentials', policy_name);
  END LOOP;

  SELECT string_agg(format('%I', attribute.attname), ', ' ORDER BY attribute.attnum)
  INTO column_list
  FROM pg_attribute AS attribute
  WHERE attribute.attrelid = 'public.user_credentials'::regclass
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped;

  -- Clear table- and column-level grants. A historical column grant would
  -- otherwise survive a table-level REVOKE and still expose a provider secret.
  REVOKE ALL PRIVILEGES ON TABLE public.user_credentials
    FROM PUBLIC, anon, authenticated;
  IF column_list IS NOT NULL THEN
    EXECUTE format(
      'REVOKE ALL PRIVILEGES (%s) ON TABLE public.user_credentials FROM PUBLIC, anon, authenticated',
      column_list
    );
  END IF;
END;
$$;

CREATE POLICY "Service role manages quarantined credentials"
  ON public.user_credentials
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_credentials TO service_role;

COMMENT ON TABLE public.user_credentials IS
  'Launch-quarantined legacy credential storage. No browser role has direct privileges; migrate secret values to Vault/envelope encryption before exposing credential management.';
COMMENT ON COLUMN public.user_credentials.credential_value_encrypted IS
  'Legacy value with no trustworthy at-rest encryption guarantee. Service-side migration input only; never return to a browser.';

COMMIT;

