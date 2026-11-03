-- Door to Door workspace: the rest of the canvassing app's entities.
--
-- 20261102234500_door_to_door_core.sql brought over the three tables that hold the
-- canvassing data itself (territories, properties, knocks). The app that runs on top of
-- them needs six more things, and until now they had no home:
--
--   d2d_settings      one row per company: the app's settings, goals and per-user AI config
--   d2d_positions     where each rep is, and the breadcrumb trail behind them
--   d2d_messages      rep <-> office messages, optionally about one house
--   d2d_appointments  a booked appointment, so it can be worked as its own thing
--   d2d_api_keys      keys a company issues to pull its knock data out
--   d2d_webhooks      outbound webhooks for the same purpose
--
-- Same company-scoped policies and same tenant guard as the core migration, so a rep
-- can only ever see their own company's rows.

-- 1. Tables ------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.d2d_settings (
  organization_id  uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  settings         jsonb NOT NULL DEFAULT '{}'::jsonb,
  goals            jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai               jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- One row per rep: a heartbeat overwrites it, so the table stays the size of the team
-- rather than growing with every GPS ping.
CREATE TABLE IF NOT EXISTS public.d2d_positions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lat              double precision,
  lng              double precision,
  accuracy_m       double precision,
  fix_at           timestamptz,
  trail            jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT d2d_positions_one_per_rep UNIQUE (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.d2d_messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id      uuid REFERENCES public.d2d_properties(id) ON DELETE CASCADE,
  user_id          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  to_user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body             text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.d2d_appointments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id      uuid NOT NULL REFERENCES public.d2d_properties(id) ON DELETE CASCADE,
  user_id          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  at               timestamptz NOT NULL,
  status           text NOT NULL DEFAULT 'scheduled',
  note             text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.d2d_api_keys (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  label            text NOT NULL DEFAULT 'Key',
  prefix           text NOT NULL,
  token_hash       text NOT NULL,
  last_used_at     timestamptz,
  revoked_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.d2d_webhooks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  url              text NOT NULL,
  events           jsonb NOT NULL DEFAULT '[]'::jsonb,
  active           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- 2. Indexes -----------------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS d2d_positions_org_idx      ON public.d2d_positions (organization_id);
CREATE INDEX IF NOT EXISTS d2d_messages_property_idx  ON public.d2d_messages (property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS d2d_messages_org_idx       ON public.d2d_messages (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS d2d_appointments_at_idx    ON public.d2d_appointments (organization_id, at DESC);
CREATE INDEX IF NOT EXISTS d2d_appointments_prop_idx  ON public.d2d_appointments (property_id);
CREATE INDEX IF NOT EXISTS d2d_api_keys_org_idx       ON public.d2d_api_keys (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS d2d_webhooks_org_idx       ON public.d2d_webhooks (organization_id, created_at DESC);

-- 3. updated_at, reusing the core migration's function -----------------------------------------

DROP TRIGGER IF EXISTS d2d_touch_updated_at ON public.d2d_settings;
CREATE TRIGGER d2d_touch_updated_at BEFORE UPDATE ON public.d2d_settings
  FOR EACH ROW EXECUTE FUNCTION public.d2d_touch_updated_at();

DROP TRIGGER IF EXISTS d2d_touch_updated_at ON public.d2d_positions;
CREATE TRIGGER d2d_touch_updated_at BEFORE UPDATE ON public.d2d_positions
  FOR EACH ROW EXECUTE FUNCTION public.d2d_touch_updated_at();

DROP TRIGGER IF EXISTS d2d_touch_updated_at ON public.d2d_appointments;
CREATE TRIGGER d2d_touch_updated_at BEFORE UPDATE ON public.d2d_appointments
  FOR EACH ROW EXECUTE FUNCTION public.d2d_touch_updated_at();

-- 4. Row level security: identical to the core migration ----------------------------------------

ALTER TABLE public.d2d_settings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.d2d_positions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.d2d_messages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.d2d_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.d2d_api_keys     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.d2d_webhooks     ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['d2d_settings','d2d_positions','d2d_messages','d2d_appointments','d2d_api_keys','d2d_webhooks'] LOOP
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

-- 5. A booked appointment is born from the knock that booked it --------------------------------
-- The rep's phone posts the knock; this turns it into a workable appointment row. Written as a
-- trigger so it holds even when a knock arrives from the API rather than the app.

CREATE OR REPLACE FUNCTION public.d2d_knock_books_appointment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'appointment' AND NEW.appointment_at IS NOT NULL THEN
    INSERT INTO public.d2d_appointments (organization_id, property_id, user_id, at, status, note, created_at)
    VALUES (NEW.organization_id, NEW.property_id, NEW.user_id, NEW.appointment_at, 'scheduled', NEW.note, NEW.occurred_at)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.d2d_knock_books_appointment() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS d2d_knock_books_appointment ON public.d2d_knocks;
CREATE TRIGGER d2d_knock_books_appointment AFTER INSERT ON public.d2d_knocks
  FOR EACH ROW EXECUTE FUNCTION public.d2d_knock_books_appointment();

-- 6. PostgREST picks the tables up on the next schema reload; nudge it.
NOTIFY pgrst, 'reload schema';
