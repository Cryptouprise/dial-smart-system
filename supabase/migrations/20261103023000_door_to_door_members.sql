-- Door to Door: the company roster.
--
-- The Team tab and the "who knocked this door" lines need each rep's display name and email.
-- Those live in auth.users, which the client cannot read, and there is no public profiles
-- table in this project. So this exposes exactly one thing: the members of ONE company, and
-- only to someone who is already a member of that company.

CREATE OR REPLACE FUNCTION public.d2d_company_members(p_organization_id uuid)
RETURNS TABLE (
  id         uuid,
  name       text,
  email      text,
  role       text,
  joined_at  timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
  SELECT
    ou.user_id,
    COALESCE(
      NULLIF(u.raw_user_meta_data->>'full_name', ''),
      NULLIF(u.raw_user_meta_data->>'name', ''),
      NULLIF(trim(concat_ws(' ', u.raw_user_meta_data->>'first_name', u.raw_user_meta_data->>'last_name')), ''),
      split_part(COALESCE(u.email, 'rep'), '@', 1)
    )::text,
    u.email::text,
    ou.role::text,
    ou.joined_at
  FROM public.organization_users ou
  JOIN auth.users u ON u.id = ou.user_id
  WHERE ou.organization_id = p_organization_id
    AND public.user_in_organization(p_organization_id)
  ORDER BY ou.joined_at NULLS LAST, u.email;
$$;

REVOKE ALL ON FUNCTION public.d2d_company_members(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.d2d_company_members(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
