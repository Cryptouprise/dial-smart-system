-- LIVE-ONLY migration pulled from supabase_migrations.schema_migrations on 2026-10-28 (never committed to repo).
CREATE OR REPLACE FUNCTION public.is_platform_operator()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_claims text;
BEGIN
  v_claims := current_setting('request.jwt.claims', true);
  IF v_claims IS NULL OR v_claims = '' THEN RETURN true; END IF;
  IF (v_claims::jsonb ->> 'role') = 'service_role' THEN RETURN true; END IF;
  RETURN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin');
END;
$function$;

REVOKE ALL ON FUNCTION public.is_platform_operator() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_operator() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.org_has_no_members(p_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT NOT EXISTS (SELECT 1 FROM public.organization_users WHERE organization_id = p_org_id);
$function$;

REVOKE ALL ON FUNCTION public.org_has_no_members(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_has_no_members(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Org admins can add members" ON public.organization_users;
CREATE POLICY "Org admins can add members"
  ON public.organization_users FOR INSERT
  WITH CHECK (
    public.is_org_admin(organization_id)
    OR (auth.uid() = user_id AND role = 'owner' AND public.org_has_no_members(organization_id))
  );

DROP POLICY IF EXISTS "Admins can update own org credits" ON public.organization_credits;
CREATE POLICY "Platform operator manages credits"
  ON public.organization_credits FOR ALL
  USING (public.is_platform_operator())
  WITH CHECK (public.is_platform_operator());

CREATE OR REPLACE FUNCTION public.guard_organization_billing_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF public.is_platform_operator() THEN RETURN NEW; END IF;
  IF NEW.billing_enabled     IS DISTINCT FROM OLD.billing_enabled
  OR NEW.subscription_tier   IS DISTINCT FROM OLD.subscription_tier
  OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
  OR NEW.stripe_customer_id  IS DISTINCT FROM OLD.stripe_customer_id
  OR NEW.trial_ends_at       IS DISTINCT FROM OLD.trial_ends_at
  OR NEW.max_users           IS DISTINCT FROM OLD.max_users
  OR NEW.max_campaigns       IS DISTINCT FROM OLD.max_campaigns
  OR NEW.max_phone_numbers   IS DISTINCT FROM OLD.max_phone_numbers
  OR NEW.monthly_call_limit  IS DISTINCT FROM OLD.monthly_call_limit
  THEN
    RAISE EXCEPTION 'Billing and plan fields on organizations are managed by the platform'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_organization_billing_columns ON public.organizations;
CREATE TRIGGER trg_guard_organization_billing_columns
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.guard_organization_billing_columns();

DROP POLICY IF EXISTS "Admins can manage agent pricing" ON public.agent_pricing;
CREATE POLICY "Platform operator manages agent pricing"
  ON public.agent_pricing FOR ALL
  USING (public.is_platform_operator())
  WITH CHECK (public.is_platform_operator());
