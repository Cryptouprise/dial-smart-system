-- LIVE-ONLY migration pulled from supabase_migrations.schema_migrations on 2026-10-28 (never committed to repo).
-- The guard must be SECURITY INVOKER.
--
-- As SECURITY DEFINER (owned by postgres) current_user inside the trigger was
-- ALWAYS 'postgres', so the trigger could not distinguish a tenant's direct
-- UPDATE from a privileged one -- and worse, it blocked legitimate writes made
-- by other SECURITY DEFINER functions (redeem_promo_code could not apply the
-- grant it had just authorized, because is_platform_operator() still evaluated
-- the *tenant's* JWT).
--
-- As SECURITY INVOKER, current_user is the genuine execution context:
--   'authenticated' / 'anon'  -> a real tenant session; apply the column guard
--   'postgres'                -> a migration, or a trusted SECURITY DEFINER
--                                function like redeem_promo_code
--   'service_role'            -> an edge function
-- A tenant cannot SET ROLE to a privileged role, so this signal is unforgeable.
-- The guard needs no elevated privileges of its own: it only inspects OLD/NEW
-- and calls is_platform_operator(), which remains SECURITY DEFINER.

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
  THEN
    RAISE EXCEPTION
      'Billing and plan fields on organizations are managed by the platform'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

-- New signups land on the entry plan instead of plan_id NULL.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_org_id  uuid;
  v_name    text;
  v_base    text;
  v_slug    text;
  v_suffix  integer := 0;
  v_plan    text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.organization_users WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  v_name := COALESCE(
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'organization_name'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'company'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(btrim(split_part(COALESCE(NEW.email, ''), '@', 1)), ''),
    'New Workspace'
  );
  v_name := left(v_name, 80);

  v_base := btrim(regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'), '-');
  IF v_base = '' THEN v_base := 'workspace'; END IF;
  v_base := left(v_base, 40);

  v_slug := v_base;
  WHILE EXISTS (SELECT 1 FROM public.organizations WHERE slug = v_slug) LOOP
    v_suffix := v_suffix + 1;
    IF v_suffix > 50 THEN
      v_slug := v_base || '-' || replace(gen_random_uuid()::text, '-', '');
      EXIT;
    END IF;
    v_slug := v_base || '-' || v_suffix::text;
  END LOOP;

  -- Lowest-priced active public plan becomes the default entry plan, so
  -- renaming or repricing tiers never leaves signups plan-less.
  SELECT id INTO v_plan FROM public.plans
  WHERE is_active AND is_public ORDER BY price_cents ASC, sort_order ASC LIMIT 1;

  INSERT INTO public.organizations (name, slug, billing_email, plan_id)
  VALUES (v_name, v_slug, NEW.email, v_plan)
  RETURNING id INTO v_org_id;

  INSERT INTO public.organization_users (organization_id, user_id, role)
  VALUES (v_org_id, NEW.id, 'owner')
  ON CONFLICT (organization_id, user_id) DO NOTHING;

  INSERT INTO public.organization_credits (organization_id, balance_cents)
  VALUES (v_org_id, 0)
  ON CONFLICT (organization_id) DO NOTHING;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user: provisioning failed for user % (%): %',
    NEW.id, COALESCE(NEW.email, '<no email>'), SQLERRM;
  RETURN NEW;
END;
$function$;
