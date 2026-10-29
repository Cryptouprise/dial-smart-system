
-- Industry packs: storage in organizations.settings->'packs' (jsonb array of pack ids).
-- No new tables, no constraint on settings (unrelated keys keep working).
-- Pack ids allowed: solar_exit, wholesale_re, door_to_door.

-- Read helper: true when the pack id is in the org's settings.packs AND the caller
-- is a member of that org. SECURITY DEFINER so it can read organizations.settings
-- regardless of the caller's row-level visibility, but it still gates on membership.
CREATE OR REPLACE FUNCTION public.org_has_pack(p_org_id uuid, p_pack text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    public.user_in_organization(p_org_id)
    AND EXISTS (
      SELECT 1
      FROM public.organizations o,
           jsonb_array_elements_text(
             CASE
               WHEN jsonb_typeof(o.settings -> 'packs') = 'array'
                 THEN o.settings -> 'packs'
               ELSE '[]'::jsonb
             END
           ) AS pack_id
      WHERE o.id = p_org_id
        AND pack_id = p_pack
    );
$function$;

REVOKE ALL ON FUNCTION public.org_has_pack(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.org_has_pack(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.org_has_pack(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.org_has_pack(uuid, text) IS
  'True when p_pack is listed in organizations.settings->''packs'' for p_org_id AND the caller is a member of that org. Read-only; safe for RLS predicates.';

-- Write helper: admin-only. Validates every id against the allowed list, then
-- merges into settings without touching any other key.
CREATE OR REPLACE FUNCTION public.set_org_packs(p_org_id uuid, p_packs text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_allowed constant text[] := ARRAY['solar_exit', 'wholesale_re', 'door_to_door']::text[];
  v_bad     text;
  v_new     jsonb;
BEGIN
  IF NOT public.is_org_admin(p_org_id) THEN
    RAISE EXCEPTION 'Only organization admins can change industry packs'
      USING ERRCODE = '42501';
  END IF;

  -- Reject any id outside the allowed list (NULL elements included).
  SELECT x
    INTO v_bad
    FROM unnest(coalesce(p_packs, ARRAY[]::text[])) AS x
   WHERE x IS NULL OR NOT (x = ANY (v_allowed))
   LIMIT 1;

  IF v_bad IS NOT NULL OR (p_packs IS NOT NULL AND array_position(p_packs, NULL) IS NOT NULL) THEN
    RAISE EXCEPTION 'Unknown industry pack id: %', coalesce(v_bad, 'NULL')
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.organizations
     SET settings = coalesce(settings, '{}'::jsonb)
                    || jsonb_build_object('packs', to_jsonb(coalesce(p_packs, ARRAY[]::text[]))),
         updated_at = now()
   WHERE id = p_org_id
  RETURNING settings INTO v_new;

  IF v_new IS NULL THEN
    RAISE EXCEPTION 'Organization not found: %', p_org_id
      USING ERRCODE = 'P0002';
  END IF;

  RETURN v_new;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_org_packs(uuid, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_org_packs(uuid, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_org_packs(uuid, text[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.set_org_packs(uuid, text[]) IS
  'Admin-only. Replaces organizations.settings->''packs'' with the given ids (validated against solar_exit/wholesale_re/door_to_door) and returns the new settings. Other settings keys are preserved.';

