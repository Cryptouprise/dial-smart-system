-- Phase 1 (reshaped, Fable 2026-10-28): every core row belongs to a company, and teammates in a company
-- can see each other's rows. Additive only: existing per-user policies stay; a company-membership
-- policy is ADDED next to them. Nothing the live app does today stops working.
-- Live facts this relies on (verified 10/28): 1 organization, 1 user, 1 membership; leads 5 NULL org,
-- call_logs 519 NULL org; dnc_list/dispositions/pipeline_boards/lead_pipeline_positions have no organization_id.

-- 1. organization_id on the four per-user config tables that lacked it
ALTER TABLE public.dnc_list                ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;
ALTER TABLE public.dispositions            ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;
ALTER TABLE public.pipeline_boards         ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;
ALTER TABLE public.lead_pipeline_positions ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_dnc_list_organization_id                ON public.dnc_list(organization_id);
CREATE INDEX IF NOT EXISTS idx_dispositions_organization_id            ON public.dispositions(organization_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_boards_organization_id         ON public.pipeline_boards(organization_id);
CREATE INDEX IF NOT EXISTS idx_lead_pipeline_positions_organization_id ON public.lead_pipeline_positions(organization_id);

-- 2. The company a user's rows default to: their single membership, or their owner/admin membership if several.
CREATE OR REPLACE FUNCTION public.default_organization_for_user(p_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT ou.organization_id
  FROM public.organization_users ou
  WHERE ou.user_id = p_user_id
  ORDER BY CASE ou.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END, ou.joined_at
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.default_organization_for_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.default_organization_for_user(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.default_organization_for_user(uuid) TO authenticated, service_role;

-- 3. Backfill
UPDATE public.leads                   SET organization_id = public.default_organization_for_user(user_id) WHERE organization_id IS NULL;
UPDATE public.campaigns               SET organization_id = public.default_organization_for_user(user_id) WHERE organization_id IS NULL;
UPDATE public.phone_numbers           SET organization_id = public.default_organization_for_user(user_id) WHERE organization_id IS NULL;
UPDATE public.call_logs cl            SET organization_id = COALESCE(
                                            (SELECT l.organization_id FROM public.leads l WHERE l.id = cl.lead_id),
                                            (SELECT c.organization_id FROM public.campaigns c WHERE c.id = cl.campaign_id),
                                            public.default_organization_for_user(cl.user_id))
                                      WHERE organization_id IS NULL;
UPDATE public.dnc_list                SET organization_id = public.default_organization_for_user(user_id) WHERE organization_id IS NULL;
UPDATE public.dispositions            SET organization_id = public.default_organization_for_user(user_id) WHERE organization_id IS NULL;
UPDATE public.pipeline_boards         SET organization_id = public.default_organization_for_user(user_id) WHERE organization_id IS NULL;
UPDATE public.lead_pipeline_positions SET organization_id = public.default_organization_for_user(user_id) WHERE organization_id IS NULL;

-- 4. Rows inserted without a company get the user's company (keeps today's edge functions working).
CREATE OR REPLACE FUNCTION public.set_organization_from_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.user_id IS NOT NULL THEN
    NEW.organization_id := public.default_organization_for_user(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.set_organization_from_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_organization_from_user() FROM anon;
REVOKE ALL ON FUNCTION public.set_organization_from_user() FROM authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['leads','campaigns','phone_numbers','call_logs','dnc_list','dispositions','pipeline_boards','lead_pipeline_positions'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_organization_from_user ON public.%I', t);
    EXECUTE format('CREATE TRIGGER set_organization_from_user BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_organization_from_user()', t);
  END LOOP;
END $$;

-- 5. Company-membership policies ADDED beside the per-user ones (permissive policies OR together).
--    Members read/insert/update their company's rows; only company admins delete through this policy
--    (the row's own creator can still delete via the existing per-user policy).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['leads','campaigns','phone_numbers','call_logs','dnc_list','dispositions','pipeline_boards','lead_pipeline_positions'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Company members can view" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Company members can insert" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Company members can update" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Company admins can delete" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Company members can view"   ON public.%I FOR SELECT USING (organization_id IS NOT NULL AND public.user_in_organization(organization_id))', t);
    EXECUTE format('CREATE POLICY "Company members can insert" ON public.%I FOR INSERT WITH CHECK (organization_id IS NOT NULL AND public.user_in_organization(organization_id))', t);
    EXECUTE format('CREATE POLICY "Company members can update" ON public.%I FOR UPDATE USING (organization_id IS NOT NULL AND public.user_in_organization(organization_id)) WITH CHECK (organization_id IS NOT NULL AND public.user_in_organization(organization_id))', t);
    EXECUTE format('CREATE POLICY "Company admins can delete"  ON public.%I FOR DELETE USING (organization_id IS NOT NULL AND public.is_org_admin(organization_id))', t);
  END LOOP;
END $$;

-- 6. Tenant scope guard for browser sessions (authenticated/anon). Runs AFTER the default-fill trigger (alphabetical
--    order: set_... < tenant_...). Two rules: a user may only write a company they belong to (closes the hole where the
--    old per-user INSERT policy let a caller pick any organization_id), and a row may never move to another company.
--    service_role and postgres (edge functions, migrations) are exempt.
CREATE OR REPLACE FUNCTION public.enforce_organization_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF current_user NOT IN ('authenticated','anon') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.organization_id IS NOT NULL AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'organization_id cannot be changed' USING ERRCODE = '42501';
  END IF;
  IF NEW.organization_id IS NOT NULL AND NOT public.user_in_organization(NEW.organization_id) THEN
    RAISE EXCEPTION 'organization_id must be a company you belong to' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_organization_scope() FROM PUBLIC, anon, authenticated;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['leads','campaigns','phone_numbers','call_logs','dnc_list','dispositions','pipeline_boards','lead_pipeline_positions'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS forbid_organization_change ON public.%I', t);
    EXECUTE format('DROP TRIGGER IF EXISTS tenant_scope_guard ON public.%I', t);
    EXECUTE format('CREATE TRIGGER tenant_scope_guard BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_scope()', t);
  END LOOP;
END $$;

-- 7. Now that every row has a company and new rows default to one, require it on the four core tables.
ALTER TABLE public.leads         ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.campaigns     ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.phone_numbers ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.call_logs     ALTER COLUMN organization_id SET NOT NULL;
