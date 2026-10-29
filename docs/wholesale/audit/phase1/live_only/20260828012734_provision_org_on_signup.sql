-- LIVE-ONLY migration pulled from supabase_migrations.schema_migrations on 2026-10-28 (never committed to repo).
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
  IF v_base = '' THEN
    v_base := 'workspace';
  END IF;
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
  RAISE WARNING 'handle_new_user: provisioning failed for user % (%): %',
    NEW.id, COALESCE(NEW.email, '<no email>'), SQLERRM;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created_organization ON auth.users;

CREATE TRIGGER on_auth_user_created_organization
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

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
