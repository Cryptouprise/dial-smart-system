-- LIVE-ONLY migration pulled from supabase_migrations.schema_migrations on 2026-10-28 (never committed to repo).
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid() THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
    ) THEN
      RETURN false;
    END IF;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_user_org_role(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.is_org_admin(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.user_in_organization(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_org_role(uuid)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_in_organization(uuid) TO authenticated, service_role;

COMMENT ON TABLE public.demo_funnel_events IS
  'Deny-all by design: RLS enabled with no policies. Written only by the demo-funnel-track edge function via service_role. Do not add client-facing policies.';

COMMENT ON TABLE public.law_firm_beta_leads IS
  'Deny-all by design: RLS enabled with no policies. Written only by the law-firm-beta-submit edge function via service_role. Contains captured lead PII. Do not add client-facing policies.';
