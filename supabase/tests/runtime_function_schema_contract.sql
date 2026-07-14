-- Executed only against the isolated fresh-database certification project.
-- Proves repaired legacy functions compile and run against canonical tables.

BEGIN;

DO $runtime_compile_contract$
BEGIN
  IF public.get_agent_customer_price(
      'c1000000-0000-4000-8000-000000000001',
      'retell-agent-runtime-contract'
    ) <> 15.0
  THEN
    RAISE EXCEPTION 'agent pricing fallback no longer resolves through the canonical credit schema';
  END IF;

  IF public.predict_lead_conversion(
      'c2000000-0000-4000-8000-000000000001',
      'c3000000-0000-4000-8000-000000000001'
    ) <> 0.5
  THEN
    RAISE EXCEPTION 'lead-conversion fallback no longer compiles against the canonical journey schema';
  END IF;

  IF public.recalculate_number_health(
      'c2000000-0000-4000-8000-000000000001'
    ) <> 0
  THEN
    RAISE EXCEPTION 'number health recalculation touched an empty runtime fixture';
  END IF;
END;
$runtime_compile_contract$;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'c2000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'runtime-function-owner@example.invalid', '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

INSERT INTO public.organizations (id, name, slug) VALUES (
  'c1000000-0000-4000-8000-000000000001',
  'Runtime Function Contract',
  'runtime-function-contract'
);

INSERT INTO public.organization_users (organization_id, user_id, role) VALUES (
  'c1000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001',
  'owner'
);

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);

DO $mint_contract$
DECLARE
  minted_id uuid;
  minted_plaintext text;
  minted_prefix text;
  minted_scopes text[];
  function_config text;
BEGIN
  SELECT minted.id, minted.plaintext, minted.key_prefix, minted.scopes
  INTO minted_id, minted_plaintext, minted_prefix, minted_scopes
  FROM public.mint_api_key(
    'c2000000-0000-4000-8000-000000000001',
    'runtime function contract',
    ARRAY['read']::text[],
    'c1000000-0000-4000-8000-000000000001',
    600,
    NULL
  ) AS minted;

  IF minted_id IS NULL
    OR minted_plaintext !~ '^dsk_live_[A-Za-z0-9]{32}$'
    OR minted_prefix <> substring(minted_plaintext FOR 12)
    OR minted_scopes IS DISTINCT FROM ARRAY['read']::text[]
    OR NOT EXISTS (
      SELECT 1
      FROM public.api_keys AS key
      WHERE key.id = minted_id
        AND key.user_id = 'c2000000-0000-4000-8000-000000000001'
        AND key.organization_id = 'c1000000-0000-4000-8000-000000000001'
    )
  THEN
    RAISE EXCEPTION 'service API-key minting did not produce canonical tenant-bound evidence';
  END IF;

  SELECT COALESCE(array_to_string(proconfig, ','), '')
  INTO function_config
  FROM pg_proc
  WHERE oid = to_regprocedure(
    'public.mint_api_key(uuid,text,text[],uuid,integer,timestamp with time zone)'
  );
  IF function_config <> 'search_path=""' THEN
    RAISE EXCEPTION 'mint_api_key does not pin an empty SECURITY DEFINER search path';
  END IF;
END;
$mint_contract$;

RESET ROLE;
ROLLBACK;
