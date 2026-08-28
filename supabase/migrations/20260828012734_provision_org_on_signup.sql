-- Provision an organization for every new signup.
--
-- Before this migration the only trigger on auth.users was
-- create_user_feature_flags(). A new customer therefore landed with feature
-- flags and nothing else: no organization, no membership, and no credit
-- record. Every organization-scoped feature (credits, billing, the client
-- portal, org-filtered queries on leads/campaigns/phone_numbers) had no row
-- to attach to, which made the product unusable for anyone but the original
-- account holder.
--
-- This creates the missing three rows in one transaction:
--   organizations         -> the workspace itself
--   organization_users    -> the signup user as 'owner'
--   organization_credits  -> a zero balance record so billing can engage
--
-- Design notes:
--   * The function NEVER blocks signup. Any failure is caught, logged as a
--     warning, and the user is still created. A hard failure here would take
--     down registration entirely, which is far worse than a missing org.
--   * Slug generation is collision-safe: organizations.slug is UNIQUE.
--   * Idempotent: if the user already has a membership (re-run, backfill,
--     future invite flow) the function does nothing.
--   * billing_enabled stays false, matching the existing default. The credit
--     system remains dormant until explicitly switched on per organization.

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
BEGIN
  -- Never provision twice for the same user.
  IF EXISTS (SELECT 1 FROM public.organization_users WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Workspace name: explicit metadata first, then the email local part.
  v_name := COALESCE(
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'organization_name'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'company'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(btrim(split_part(COALESCE(NEW.email, ''), '@', 1)), ''),
    'New Workspace'
  );
  v_name := left(v_name, 80);

  -- Slug: lowercase, alphanumeric, dash separated.
  v_base := btrim(regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'), '-');
  IF v_base = '' THEN
    v_base := 'workspace';
  END IF;
  v_base := left(v_base, 40);

  v_slug := v_base;
  WHILE EXISTS (SELECT 1 FROM public.organizations WHERE slug = v_slug) LOOP
    v_suffix := v_suffix + 1;
    IF v_suffix > 50 THEN
      -- Pathological contention: fall back to a guaranteed-unique slug.
      v_slug := v_base || '-' || replace(gen_random_uuid()::text, '-', '');
      EXIT;
    END IF;
    v_slug := v_base || '-' || v_suffix::text;
  END LOOP;

  INSERT INTO public.organizations (name, slug, billing_email)
  VALUES (v_name, v_slug, NEW.email)
  RETURNING id INTO v_org_id;

  INSERT INTO public.organization_users (organization_id, user_id, role)
  VALUES (v_org_id, NEW.id, 'owner')
  ON CONFLICT (organization_id, user_id) DO NOTHING;

  INSERT INTO public.organization_credits (organization_id, balance_cents)
  VALUES (v_org_id, 0)
  ON CONFLICT (organization_id) DO NOTHING;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Signup must succeed even if provisioning does not.
  RAISE WARNING 'handle_new_user: provisioning failed for user % (%): %',
    NEW.id, COALESCE(NEW.email, '<no email>'), SQLERRM;
  RETURN NEW;
END;
$function$;

-- Trigger function only; nothing should call this over the REST API.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created_organization ON auth.users;

CREATE TRIGGER on_auth_user_created_organization
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Backfill: any existing user with no membership gets a workspace.
DO $backfill$
DECLARE
  r          record;
  v_org_id   uuid;
  v_base     text;
  v_slug     text;
  v_suffix   integer;
BEGIN
  FOR r IN
    SELECT u.id, u.email
    FROM auth.users u
    WHERE NOT EXISTS (
      SELECT 1 FROM public.organization_users ou WHERE ou.user_id = u.id
    )
  LOOP
    v_base := btrim(regexp_replace(
      lower(COALESCE(NULLIF(split_part(COALESCE(r.email, ''), '@', 1), ''), 'workspace')),
      '[^a-z0-9]+', '-', 'g'), '-');
    IF v_base = '' THEN
      v_base := 'workspace';
    END IF;
    v_base := left(v_base, 40);

    v_slug := v_base;
    v_suffix := 0;
    WHILE EXISTS (SELECT 1 FROM public.organizations WHERE slug = v_slug) LOOP
      v_suffix := v_suffix + 1;
      v_slug := v_base || '-' || v_suffix::text;
    END LOOP;

    INSERT INTO public.organizations (name, slug, billing_email)
    VALUES (left(COALESCE(NULLIF(split_part(COALESCE(r.email, ''), '@', 1), ''),
                          'New Workspace'), 80),
            v_slug, r.email)
    RETURNING id INTO v_org_id;

    INSERT INTO public.organization_users (organization_id, user_id, role)
    VALUES (v_org_id, r.id, 'owner')
    ON CONFLICT (organization_id, user_id) DO NOTHING;

    INSERT INTO public.organization_credits (organization_id, balance_cents)
    VALUES (v_org_id, 0)
    ON CONFLICT (organization_id) DO NOTHING;

    RAISE NOTICE 'Backfilled organization % for user %', v_org_id, r.id;
  END LOOP;
END;
$backfill$;
