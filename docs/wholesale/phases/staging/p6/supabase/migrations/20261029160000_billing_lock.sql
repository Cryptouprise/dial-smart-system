-- P6 Billing lock: Stripe subscription state drives access.
--
-- Version note: the brief named this file 20261029050000_billing_lock.sql. That version sorts BEFORE the
-- applied phase-1 migrations (20261029142121, 20261029150000) and `supabase db push` refuses out-of-order
-- files without --include-all, so the file is numbered 20261029160000 instead. Contents are unchanged.
--
-- org_in_good_standing() is the single source of truth for "may this tenant use the product". It is consumed by:
--   * a RESTRICTIVE policy on the four core tables (belt and braces: a paused company's rows go invisible and
--     un-writable for its browser sessions, ANDed with every existing permissive policy, which all stay in place)
--   * the frontend via supabase.rpc('org_in_good_standing', { p_org_id })
--   * org_access_allowed() for future gates that want membership AND standing in one call
--
-- Billing off (billing_enabled IS NOT TRUE) and unlimited_access never lock. Today's single live org has
-- billing_enabled = false, so nothing changes for it until a Stripe subscription turns billing on.
-- Platform operators (user_roles.role = 'admin'), service_role and postgres are never locked.
--
-- The past_due grace window lives in a DEDICATED column, organizations.billing_grace_until, protected by the
-- billing-columns guard trigger. It must NOT live in organizations.settings: org admins can UPDATE settings
-- through the live policies "Org admins can update their organization" / org_admin_update, so a locked tenant
-- could have written settings.grace_until far into the future and unlocked itself.
--
-- No BEGIN/COMMIT here: the CLI wraps each migration file in its own transaction.

-- ---------------------------------------------------------------------------
-- 1. Grace window column (platform-managed, tenant-read-only)
-- ---------------------------------------------------------------------------
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS billing_grace_until timestamptz;

COMMENT ON COLUMN public.organizations.billing_grace_until IS
  'End of the past_due grace window. While subscription_status = ''past_due'' and billing_grace_until > now() the org stays in good standing. Written only by the platform (stripe-webhook via service_role): set once per dunning cycle on invoice.payment_failed (now() + 3 days, never extended while set), cleared on invoice.paid or when the subscription returns to active/trialing. Tenant writes are blocked by trg_guard_organization_billing_columns.';

-- ---------------------------------------------------------------------------
-- 2. Extend the billing-columns guard so tenants cannot write billing_grace_until.
--    This is the live SECURITY INVOKER version from
--    docs/wholesale/audit/phase1/live_only/20260828034301_fix_billing_guard_definer_context.sql,
--    identical except for the one added `billing_grace_until` line. current_user is the genuine session
--    role: 'authenticated'/'anon' = tenant (guard applies unless platform operator);
--    'postgres'/'service_role' = migrations, trusted SECURITY DEFINER functions, edge functions (pass).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_organization_billing_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

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
  OR NEW.plan_id             IS DISTINCT FROM OLD.plan_id
  OR NEW.unlimited_access    IS DISTINCT FROM OLD.unlimited_access
  OR NEW.unlimited_reason    IS DISTINCT FROM OLD.unlimited_reason
  OR NEW.billing_grace_until IS DISTINCT FROM OLD.billing_grace_until
  THEN
    RAISE EXCEPTION
      'Billing and plan fields on organizations are managed by the platform'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

-- Grants exactly as live (20260828013247_tighten_guard_function_grants.sql): never callable over REST.
REVOKE ALL ON FUNCTION public.guard_organization_billing_columns() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_organization_billing_columns() FROM anon;
REVOKE ALL ON FUNCTION public.guard_organization_billing_columns() FROM authenticated;

-- The trigger trg_guard_organization_billing_columns (BEFORE UPDATE ON organizations) already exists live and
-- points at this function by name; CREATE OR REPLACE swaps the body in place. Re-assert it for a fresh DB.
DROP TRIGGER IF EXISTS trg_guard_organization_billing_columns ON public.organizations;
CREATE TRIGGER trg_guard_organization_billing_columns
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.guard_organization_billing_columns();

-- ---------------------------------------------------------------------------
-- 3. Standing predicate
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.org_in_good_standing(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((
    SELECT
      COALESCE(o.unlimited_access, false)
      OR o.billing_enabled IS NOT TRUE
      OR o.subscription_status IN ('active', 'trialing')
      OR (
        o.subscription_status = 'past_due'
        AND o.billing_grace_until IS NOT NULL
        AND o.billing_grace_until > now()
      )
    FROM public.organizations o
    WHERE o.id = p_org_id
  ), false);
$function$;

COMMENT ON FUNCTION public.org_in_good_standing(uuid) IS
  'True when the organization may use the product: unlimited_access, billing disabled, subscription active/trialing, or past_due before billing_grace_until. False otherwise (including an unknown org id or NULL).';

REVOKE ALL ON FUNCTION public.org_in_good_standing(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.org_in_good_standing(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.org_in_good_standing(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Combined access predicate (operator short-circuit, then membership AND standing)
--    user_in_organization(uuid) takes ONE argument and reads auth.uid() itself.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.org_access_allowed(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.is_platform_operator()
      OR (
        public.user_in_organization(p_org_id)
        AND public.org_in_good_standing(p_org_id)
      );
$function$;

COMMENT ON FUNCTION public.org_access_allowed(uuid) IS
  'Platform-operator short-circuit, else membership AND good standing. Use for new gates. The core-table RLS lock uses org_in_good_standing directly so the existing per-user and company policies keep deciding membership.';

REVOKE ALL ON FUNCTION public.org_access_allowed(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.org_access_allowed(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.org_access_allowed(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Stripe event idempotency ledger
--    The live stripe-webhook has no idempotency table of its own; credit writes rely on
--    add_credits(p_idempotency_key := 'stripe_<event.id>'). Subscription-state writes need their own
--    dedupe. The webhook INSERTs the event id FIRST (23505 = already processed, return 200) and DELETEs
--    the row if the business update fails, so Stripe's retry can reprocess.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stripe_events (
  id           text PRIMARY KEY,
  type         text NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.stripe_events IS
  'Stripe webhook idempotency ledger (one row per processed event.id). Deny-all by design: RLS enabled with no policies. Written only by the stripe-webhook edge function via service_role. Do not add client-facing policies.';

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_stripe_events_received_at
  ON public.stripe_events(received_at);

-- Supabase default privileges normally cover service_role; make it explicit so a missing default grant
-- can never turn every webhook into a 500. Browser roles get nothing (RLS has no policies anyway).
REVOKE ALL ON TABLE public.stripe_events FROM PUBLIC;
REVOKE ALL ON TABLE public.stripe_events FROM anon;
REVOKE ALL ON TABLE public.stripe_events FROM authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.stripe_events TO service_role;

-- The webhook resolves an org by Stripe customer when the event carries no organization_id metadata.
CREATE INDEX IF NOT EXISTS idx_organizations_stripe_customer_id
  ON public.organizations(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 6. Lock the four core tables with a RESTRICTIVE policy beside the existing permissive ones.
--
--    Live policies today (LIVE-SCHEMA.md, UPDATE section), all PERMISSIVE and all kept as-is:
--      per-user : "Users can manage their own <t>" (ALL, auth.uid() = user_id) on leads/campaigns/call_logs;
--                 4 per-command "Users can ... their own phone numbers" on phone_numbers
--      company  : "Company members can view/insert/update", "Company admins can delete"
--                 (organization_id IS NOT NULL AND user_in_organization(organization_id) / is_org_admin(...))
--
--    Permissive policies OR together; a RESTRICTIVE policy is ANDed on top of whatever they allow. So one
--    restrictive policy per table locks BOTH the per-user and the company path without dropping or
--    rewriting anything (the brief's "drop and re-create with the same predicate" would have left the
--    company policies un-locked and is intentionally not done).
--
--    FOR ALL (not just SELECT): a paused company's browser sessions can neither read nor write its rows.
--    USING covers SELECT/UPDATE/DELETE, WITH CHECK covers INSERT/UPDATE. WITH CHECK is evaluated on the
--    final row, i.e. after the BEFORE INSERT trigger set_organization_from_user has filled organization_id.
--
--    organization_id is NOT NULL on all four tables since phase 1, so there is no NULL-org row to protect.
--    is_platform_operator() returns true for service_role, for sessions without JWT claims (postgres) and
--    for user_roles admins, so none of them are ever locked. service_role also bypasses RLS outright.
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['leads','campaigns','call_logs','phone_numbers'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Billing lock" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Billing lock" ON public.%I AS RESTRICTIVE FOR ALL '
      || 'USING (public.org_in_good_standing(organization_id) OR public.is_platform_operator()) '
      || 'WITH CHECK (public.org_in_good_standing(organization_id) OR public.is_platform_operator())',
      t
    );
  END LOOP;
END $$;
