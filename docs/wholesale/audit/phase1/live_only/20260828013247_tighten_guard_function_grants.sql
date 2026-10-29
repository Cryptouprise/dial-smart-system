-- LIVE-ONLY migration pulled from supabase_migrations.schema_migrations on 2026-10-28 (never committed to repo).
-- Trigger function: never callable over the REST API by anyone.
REVOKE ALL ON FUNCTION public.guard_organization_billing_columns() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_organization_billing_columns() FROM anon;
REVOKE ALL ON FUNCTION public.guard_organization_billing_columns() FROM authenticated;

-- Policy helpers: evaluated as the querying user inside RLS, so signed-in
-- users need EXECUTE. Anonymous callers never do.
REVOKE ALL ON FUNCTION public.is_platform_operator() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_platform_operator() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_platform_operator() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.org_has_no_members(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.org_has_no_members(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.org_has_no_members(uuid) TO authenticated, service_role;
