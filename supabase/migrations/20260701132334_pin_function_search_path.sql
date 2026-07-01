-- Hardening: pin search_path on public functions that don't have one, to close
-- the function_search_path_mutable advisories (search-path injection defense).
-- Safe path: public + extensions + pg_temp (pg_catalog is always implicit).
-- Skips functions that already declare a search_path. Idempotent.
--
-- Applied to production via MCP on 2026-07-01 (version 20260701132334).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND (p.proconfig IS NULL
           OR NOT EXISTS (
             SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'
           ))
  LOOP
    BEGIN
      EXECUTE format(
        'ALTER FUNCTION public.%I(%s) SET search_path = public, extensions, pg_temp',
        r.proname, r.args
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipped %(%): %', r.proname, r.args, SQLERRM;
    END;
  END LOOP;
END $$;
