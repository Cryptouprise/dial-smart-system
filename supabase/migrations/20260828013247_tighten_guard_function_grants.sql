-- Grant hygiene for the guard/policy helper functions.
-- Applied separately from close_billing_escalation in production.

-- ---------------------------------------------------------------------------
-- 5. Grant hygiene
--
-- Supabase grants EXECUTE on new public-schema functions to anon and
-- authenticated by default, which the database linter flags for
-- SECURITY DEFINER functions. The trigger function needs no caller grants at
-- all (triggers execute with the table owner's rights). The two policy
-- helpers are evaluated as the querying role inside RLS, so signed-in users
-- need EXECUTE, but anonymous callers never do.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.guard_organization_billing_columns() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_organization_billing_columns() FROM anon;
REVOKE ALL ON FUNCTION public.guard_organization_billing_columns() FROM authenticated;

REVOKE ALL ON FUNCTION public.is_platform_operator() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_platform_operator() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_platform_operator() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.org_has_no_members(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.org_has_no_members(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.org_has_no_members(uuid) TO authenticated, service_role;
