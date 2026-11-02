-- Door to Door pack (Dial Smart native) - slice 1: territories, properties, knocks.
-- A faithful, org-scoped port of the DoorBoss data model (specs/schema.sql) into Dial Smart's
-- own Supabase, so the pack is a real screen inside Dial Smart rather than a link to DoorBoss.
--
-- Differences from DoorBoss, on purpose:
--   * text ids  -> uuid, so ids are DB-generated and never collide across companies
--   * every row carries organization_id and is protected by the same company policies the
--     Phase 1 org-scope migration added to the core tables (user_in_organization / is_org_admin)
--   * properties.status is maintained by a trigger on knocks, not by an edge worker
--
-- Applied to the live project emonjusymdripmkvtttc on 2026-11-02 (version 20261102234500
-- recorded in supabase_migrations.schema_migrations; see the session ledger, Tier 4).

-- 1. Territories -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.d2d_territories (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name              text NOT NULL,
  color             text NOT NULL DEFAULT '#2b7fff',
  polygon           jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [[lat,lng], ...] closed ring, >= 3 points
  assigned_user_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  reknock_days      int  NOT NULL DEFAULT 3 CHECK (reknock_days BETWEEN 1 AND 90),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS d2d_territories_org_idx ON public.d2d_territories (organization_id);

-- 2. Properties (the knock list) -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.d2d_properties (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lat                double precision,
  lng                double precision,
  address            text NOT NULL,
  city               text,
  state              text DEFAULT 'CO',
  zip                text,
  owner_name         text,
  owner_phone        text,
  owner_email        text,
  installer          text,
  installer_status   text NOT NULL DEFAULT 'unknown'
                     CHECK (installer_status IN ('bankrupt','closed','active','unknown')),
  installer_closed   text,
  tier               text NOT NULL DEFAULT 'none'
                     CHECK (tier IN ('verified_installed','verified_uninstalled','permit_only','none')),
  permit_year        text,
  system_kw          text,
  finance_co         text,
  source             text,
  territory_id       uuid REFERENCES public.d2d_territories(id) ON DELETE SET NULL,
  status             text NOT NULL DEFAULT 'unknocked'
                     CHECK (status IN ('unknocked','not_home','callback','interested','appointment','signed','not_interested','do_not_knock')),
  last_knock_at      timestamptz,
  last_knock_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  callback_at        timestamptz,
  appointment_at     timestamptz,
  text_ok            boolean NOT NULL DEFAULT false,   -- homeowner agreed to be texted
  ghl_contact_id     text,
  ghl_opportunity_id text,
  dnc                boolean NOT NULL DEFAULT false,   -- vendor do-not-contact flag
  geocode_status     text NOT NULL DEFAULT 'ok' CHECK (geocode_status IN ('ok','queued','failed')),
  deleted_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS d2d_properties_org_idx       ON public.d2d_properties (organization_id);
CREATE INDEX IF NOT EXISTS d2d_properties_status_idx    ON public.d2d_properties (organization_id, status);
CREATE INDEX IF NOT EXISTS d2d_properties_territory_idx ON public.d2d_properties (territory_id);
CREATE INDEX IF NOT EXISTS d2d_properties_last_knock_idx ON public.d2d_properties (organization_id, last_knock_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS d2d_properties_addr_idx
  ON public.d2d_properties (organization_id, lower(address), coalesce(zip, ''))
  WHERE deleted_at IS NULL;

-- 3. Knocks (one row per door) ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.d2d_knocks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id       text UNIQUE,                       -- generated on the phone; makes offline replays idempotent
  property_id     uuid NOT NULL REFERENCES public.d2d_properties(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status          text NOT NULL
                  CHECK (status IN ('not_home','callback','interested','appointment','signed','not_interested','do_not_knock')),
  note            text,
  callback_at     timestamptz,
  appointment_at  timestamptz,
  text_ok         boolean NOT NULL DEFAULT false,
  lat             double precision,                  -- where the rep was standing
  lng             double precision,
  accuracy_m      int,
  photo_urls      jsonb NOT NULL DEFAULT '[]'::jsonb,
  source          text NOT NULL DEFAULT 'door' CHECK (source IN ('door','phone','text','portal')),
  occurred_at     timestamptz NOT NULL DEFAULT now(),-- phone time of the knock
  received_at     timestamptz NOT NULL DEFAULT now(),
  synced_at       timestamptz,                        -- set when GHL accepted it
  sync_error      text
);
CREATE INDEX IF NOT EXISTS d2d_knocks_org_idx      ON public.d2d_knocks (organization_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS d2d_knocks_property_idx ON public.d2d_knocks (property_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS d2d_knocks_user_day_idx ON public.d2d_knocks (user_id, occurred_at DESC);

-- 4. Triggers ---------------------------------------------------------------------------------

-- 4a. updated_at
CREATE OR REPLACE FUNCTION public.d2d_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.d2d_touch_updated_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS d2d_touch_updated_at ON public.d2d_territories;
CREATE TRIGGER d2d_touch_updated_at BEFORE UPDATE ON public.d2d_territories
  FOR EACH ROW EXECUTE FUNCTION public.d2d_touch_updated_at();
DROP TRIGGER IF EXISTS d2d_touch_updated_at ON public.d2d_properties;
CREATE TRIGGER d2d_touch_updated_at BEFORE UPDATE ON public.d2d_properties
  FOR EACH ROW EXECUTE FUNCTION public.d2d_touch_updated_at();

-- 4b. A knock always belongs to its property's company, and it can never point across companies.
CREATE OR REPLACE FUNCTION public.d2d_scope_knock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_org uuid;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.d2d_properties p WHERE p.id = NEW.property_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'd2d_knocks.property_id does not exist' USING ERRCODE = '23503';
  END IF;
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := v_org;
  ELSIF NEW.organization_id IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'knock organization must match the property company' USING ERRCODE = '42501';
  END IF;
  IF NEW.client_id IS NULL THEN
    NEW.client_id := gen_random_uuid()::text;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.d2d_scope_knock() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS d2d_scope_knock ON public.d2d_knocks;
CREATE TRIGGER d2d_scope_knock BEFORE INSERT ON public.d2d_knocks
  FOR EACH ROW EXECUTE FUNCTION public.d2d_scope_knock();

-- 4c. Keep the property's denormalized state in step with its newest knock (DoorBoss does this
--     in its sync worker; doing it in the DB means the knock list is never stale).
CREATE OR REPLACE FUNCTION public.d2d_apply_knock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  UPDATE public.d2d_properties p
     SET status         = NEW.status,
         last_knock_at  = NEW.occurred_at,
         last_knock_by  = NEW.user_id,
         callback_at    = CASE WHEN NEW.status = 'callback'    THEN NEW.callback_at    ELSE NULL END,
         appointment_at = CASE WHEN NEW.status = 'appointment' THEN NEW.appointment_at ELSE NULL END,
         text_ok        = CASE WHEN NEW.status IN ('callback','interested','appointment','signed')
                               THEN (p.text_ok OR NEW.text_ok) ELSE p.text_ok END,
         updated_at     = now()
   WHERE p.id = NEW.property_id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.d2d_apply_knock() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS d2d_apply_knock ON public.d2d_knocks;
CREATE TRIGGER d2d_apply_knock AFTER INSERT ON public.d2d_knocks
  FOR EACH ROW EXECUTE FUNCTION public.d2d_apply_knock();

-- 5. Row level security: same company policies as the Phase 1 org-scope migration --------------
ALTER TABLE public.d2d_territories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.d2d_properties  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.d2d_knocks      ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['d2d_territories','d2d_properties','d2d_knocks'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Company members can view" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Company members can insert" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Company members can update" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Company admins can delete" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Company members can view"   ON public.%I FOR SELECT USING (organization_id IS NOT NULL AND public.user_in_organization(organization_id))', t);
    EXECUTE format('CREATE POLICY "Company members can insert" ON public.%I FOR INSERT WITH CHECK (organization_id IS NOT NULL AND public.user_in_organization(organization_id))', t);
    EXECUTE format('CREATE POLICY "Company members can update" ON public.%I FOR UPDATE USING (organization_id IS NOT NULL AND public.user_in_organization(organization_id)) WITH CHECK (organization_id IS NOT NULL AND public.user_in_organization(organization_id))', t);
    EXECUTE format('CREATE POLICY "Company admins can delete"  ON public.%I FOR DELETE USING (organization_id IS NOT NULL AND public.is_org_admin(organization_id))', t);
    EXECUTE format('DROP TRIGGER IF EXISTS tenant_scope_guard ON public.%I', t);
    EXECUTE format('CREATE TRIGGER tenant_scope_guard BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_scope()', t);
  END LOOP;
END $$;

-- 6. PostgREST picks the tables up on the next schema reload; nudge it.
NOTIFY pgrst, 'reload schema';
