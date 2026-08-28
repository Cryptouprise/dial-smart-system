-- Security-advisor follow-up: tighten the exposed SECURITY DEFINER helpers and
-- record why two tables deliberately have RLS on with no policies.
--
-- Investigated all four functions the linter flags. Three of them
-- (get_user_org_role, is_org_admin, user_in_organization) already scope
-- internally to auth.uid(), so they can only answer questions about the caller,
-- and anon already holds no EXECUTE. They are required by RLS policies on
-- organizations and organization_users, which are evaluated as the querying
-- role, so `authenticated` must keep EXECUTE. Those advisor warnings are
-- expected for this design.
--
-- has_role(_user_id, _role) was different: it takes an ARBITRARY user id, so
-- any signed-in user could ask "is user X an admin?" and enumerate operators
-- given a uuid. Every real caller passes auth.uid() (verified: the only policy
-- using it is "Admins can view system health logs" on system_health_logs, and
-- no application or edge-function code calls it directly), so restricting it to
-- self-queries breaks nothing.

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Backend contexts (service_role, migrations, psql) have no auth.uid().
  -- They are already trusted and may ask about any user.
  IF auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid() THEN
    -- A signed-in user may only ask about themselves. The platform operator
    -- may ask about anyone, which is what the admin surfaces need.
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    ) THEN
      RETURN false;
    END IF;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- Make the "no anon" position explicit and durable for the org helpers, so a
-- future CREATE OR REPLACE does not silently re-grant the Supabase default.
REVOKE ALL ON FUNCTION public.get_user_org_role(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.is_org_admin(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.user_in_organization(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_org_role(uuid)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_in_organization(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Document the deliberate deny-all tables.
--
-- The linter reports rls_enabled_no_policy (INFO) on these two. That is the
-- intended configuration, not an oversight: RLS on with zero policies denies
-- every direct client request, while service_role bypasses RLS entirely. Both
-- tables are written only by verify_jwt=false edge functions running on the
-- service key (demo-funnel-track, law-firm-beta-submit), and no client code
-- references either table. demo_funnel_events already holds rows, which
-- confirms the write path works.
--
-- Do NOT "fix" the advisor warning by adding a permissive policy -- that would
-- expose public funnel submissions and captured lead data to any caller.
-- ---------------------------------------------------------------------------

COMMENT ON TABLE public.demo_funnel_events IS
  'Deny-all by design: RLS enabled with no policies. Written only by the demo-funnel-track edge function via service_role. Do not add client-facing policies.';

COMMENT ON TABLE public.law_firm_beta_leads IS
  'Deny-all by design: RLS enabled with no policies. Written only by the law-firm-beta-submit edge function via service_role. Contains captured lead PII. Do not add client-facing policies.';
