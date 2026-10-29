-- Fix (Fable 10/29): enforce_organization_scope was SECURITY DEFINER, so current_user inside it was always the
-- function owner ('postgres') and the browser-role check never fired (guard was fail-open). SECURITY INVOKER makes
-- current_user the real session role; user_in_organization() is itself SECURITY DEFINER so the lookup still works.
CREATE OR REPLACE FUNCTION public.enforce_organization_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF current_user NOT IN ('authenticated','anon') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.organization_id IS NOT NULL AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'organization_id cannot be changed' USING ERRCODE = '42501';
  END IF;
  IF NEW.organization_id IS NOT NULL AND NOT public.user_in_organization(NEW.organization_id) THEN
    RAISE EXCEPTION 'organization_id must be a company you belong to' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_organization_scope() FROM PUBLIC, anon, authenticated;
-- Only the (SECURITY DEFINER) default-fill trigger needs this helper; browsers must not enumerate other users' companies.
REVOKE EXECUTE ON FUNCTION public.default_organization_for_user(uuid) FROM authenticated;
