-- Close four privilege-escalation paths in the multi-tenant / billing layer.
--
-- Found by impersonating a freshly provisioned tenant (role=authenticated,
-- request.jwt.claims set to their uid) and probing writes. All four were
-- reachable from the public PostgREST API with nothing but a valid session.
--
--   1. CROSS-TENANT TAKEOVER (critical)
--      organization_users INSERT policy allowed:
--          is_org_admin(org) OR (auth.uid() = user_id AND role = 'owner')
--      The second branch let ANY authenticated user insert themselves as
--      'owner' of ANY organization. Once in, is_org_admin() returns true for
--      that org and paths 2-4 below apply to the victim's organization.
--
--   2. SELF-GRANTED CREDITS (critical, revenue)
--      "Admins can update own org credits" was FOR ALL. Because every signup
--      is the owner of their own organization, every customer could set
--      balance_cents and cost_per_minute_cents to whatever they liked, i.e.
--      unlimited voice minutes billed to the platform.
--
--   3. BILLING BYPASS (critical, revenue)
--      organizations UPDATE let a tenant admin set billing_enabled = false,
--      which is the master switch the whole credit system is gated on. Also
--      exposed subscription_tier, limits and stripe_customer_id.
--
--   4. SELF-SET PRICING (high, revenue)
--      "Admins can manage agent pricing" was FOR ALL, so a customer could set
--      their own per-minute price to zero.
--
-- Approach: tenant members keep READ access to their own billing state.
-- All billing-affecting WRITES are restricted to the platform operator
-- (public.user_roles.role = 'admin', a table only service_role can write)
-- or to service_role itself, which bypasses RLS and is what the edge
-- functions (credit-management, outbound-calling, retell-call-webhook,
-- stripe-webhook) already run as.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- True when the caller is the platform operator, or a trusted backend
-- context (service_role, or a direct/migration connection with no JWT).
CREATE OR REPLACE FUNCTION public.is_platform_operator()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_claims text;
BEGIN
  v_claims := current_setting('request.jwt.claims', true);

  -- No JWT at all: migration / psql / superuser context.
  IF v_claims IS NULL OR v_claims = '' THEN
    RETURN true;
  END IF;

  -- Supabase service key.
  IF (v_claims::jsonb ->> 'role') = 'service_role' THEN
    RETURN true;
  END IF;

  -- Platform operator, per user_roles (writable only by service_role).
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.is_platform_operator() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_operator() TO authenticated, service_role;

-- Membership count without tripping RLS recursion on organization_users.
CREATE OR REPLACE FUNCTION public.org_has_no_members(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.organization_users WHERE organization_id = p_org_id
  );
$function$;

REVOKE ALL ON FUNCTION public.org_has_no_members(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_has_no_members(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. organization_users: no self-joining an existing organization
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Org admins can add members" ON public.organization_users;

CREATE POLICY "Org admins can add members"
  ON public.organization_users
  FOR INSERT
  WITH CHECK (
    -- An existing admin of that organization may add anyone.
    public.is_org_admin(organization_id)
    -- Or you may claim ownership of an organization that has no members yet,
    -- which is the "I just created this workspace" case. Once an org has any
    -- member, this branch is closed forever.
    OR (
      auth.uid() = user_id
      AND role = 'owner'
      AND public.org_has_no_members(organization_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 2. organization_credits: read for members, write for the platform only
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Admins can update own org credits" ON public.organization_credits;

CREATE POLICY "Platform operator manages credits"
  ON public.organization_credits
  FOR ALL
  USING (public.is_platform_operator())
  WITH CHECK (public.is_platform_operator());

-- "Users can view own org credits" (SELECT) is retained unchanged so the
-- credit dashboard and client portal keep working.

-- ---------------------------------------------------------------------------
-- 3. organizations: tenants may rename, not re-price themselves
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_organization_billing_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF public.is_platform_operator() THEN
    RETURN NEW;
  END IF;

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
    RAISE EXCEPTION
      'Billing and plan fields on organizations are managed by the platform'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_organization_billing_columns ON public.organizations;

CREATE TRIGGER trg_guard_organization_billing_columns
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_organization_billing_columns();

-- ---------------------------------------------------------------------------
-- 4. agent_pricing: read for members, write for the platform only
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Admins can manage agent pricing" ON public.agent_pricing;

CREATE POLICY "Platform operator manages agent pricing"
  ON public.agent_pricing
  FOR ALL
  USING (public.is_platform_operator())
  WITH CHECK (public.is_platform_operator());

-- "Users can view own org agent pricing" (SELECT) is retained unchanged.

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
