BEGIN;

-- The older Phase 2 migration filenames were not accepted consistently by
-- every Supabase migration runner. Re-assert the core tenant columns under a
-- canonical 14-digit version so staging and production converge.
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS organization_id uuid;

CREATE INDEX IF NOT EXISTS idx_campaigns_organization_id ON public.campaigns(organization_id);
CREATE INDEX IF NOT EXISTS idx_leads_organization_id ON public.leads(organization_id);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_organization_id ON public.phone_numbers(organization_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_organization_id ON public.call_logs(organization_id);

-- Only a single-membership user can be backfilled without guessing. Resources
-- owned by an existing multi-organization user deliberately remain unassigned
-- until an operator maps them to the correct company.
WITH unique_membership AS (
  SELECT user_id, min(organization_id::text)::uuid AS organization_id
  FROM public.organization_users
  GROUP BY user_id
  HAVING count(DISTINCT organization_id) = 1
)
UPDATE public.campaigns AS resource
SET organization_id = membership.organization_id
FROM unique_membership AS membership
WHERE resource.organization_id IS NULL
  AND resource.user_id = membership.user_id;

WITH unique_membership AS (
  SELECT user_id, min(organization_id::text)::uuid AS organization_id
  FROM public.organization_users
  GROUP BY user_id
  HAVING count(DISTINCT organization_id) = 1
)
UPDATE public.leads AS resource
SET organization_id = membership.organization_id
FROM unique_membership AS membership
WHERE resource.organization_id IS NULL
  AND resource.user_id = membership.user_id;

WITH unique_membership AS (
  SELECT user_id, min(organization_id::text)::uuid AS organization_id
  FROM public.organization_users
  GROUP BY user_id
  HAVING count(DISTINCT organization_id) = 1
)
UPDATE public.phone_numbers AS resource
SET organization_id = membership.organization_id
FROM unique_membership AS membership
WHERE resource.organization_id IS NULL
  AND resource.user_id = membership.user_id;

WITH unique_membership AS (
  SELECT user_id, min(organization_id::text)::uuid AS organization_id
  FROM public.organization_users
  GROUP BY user_id
  HAVING count(DISTINCT organization_id) = 1
)
UPDATE public.call_logs AS resource
SET organization_id = membership.organization_id
FROM unique_membership AS membership
WHERE resource.organization_id IS NULL
  AND resource.user_id = membership.user_id;

-- Never guess ownership for a multi-membership user's historical records. A
-- deployment with unresolved rows must stop here so an operator can map them
-- explicitly before this tenant boundary is installed.
DO $$
DECLARE
  unresolved_campaigns bigint;
  unresolved_leads bigint;
  unresolved_phone_numbers bigint;
  unresolved_call_logs bigint;
BEGIN
  SELECT count(*) INTO unresolved_campaigns FROM public.campaigns WHERE organization_id IS NULL;
  SELECT count(*) INTO unresolved_leads FROM public.leads WHERE organization_id IS NULL;
  SELECT count(*) INTO unresolved_phone_numbers FROM public.phone_numbers WHERE organization_id IS NULL;
  SELECT count(*) INTO unresolved_call_logs FROM public.call_logs WHERE organization_id IS NULL;

  IF unresolved_campaigns + unresolved_leads + unresolved_phone_numbers + unresolved_call_logs > 0 THEN
    RAISE EXCEPTION 'TENANT_BACKFILL_REQUIRED'
      USING DETAIL = format(
        'Explicit organization mapping is required before launch: campaigns=%s leads=%s phone_numbers=%s call_logs=%s',
        unresolved_campaigns,
        unresolved_leads,
        unresolved_phone_numbers,
        unresolved_call_logs
      ),
      HINT = 'Map every legacy row to an organization, then rerun this migration.';
  END IF;
END;
$$;

-- IF NOT EXISTS cannot repair an older ON DELETE CASCADE constraint. Remove
-- every organization_id FK on these tables and install one canonical RESTRICT
-- contract so skipped-vs-ran legacy Phase 2 installations converge.
DO $$
DECLARE
  tenant_fk record;
BEGIN
  FOR tenant_fk IN
    SELECT namespace.nspname AS schema_name,
           relation.relname AS table_name,
           constraint_row.conname AS constraint_name
    FROM pg_constraint AS constraint_row
    JOIN pg_class AS relation ON relation.oid = constraint_row.conrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE constraint_row.contype = 'f'
      AND namespace.nspname = 'public'
      AND relation.relname IN ('campaigns', 'leads', 'phone_numbers', 'call_logs')
      AND constraint_row.confrelid = 'public.organizations'::regclass
      AND constraint_row.conkey = ARRAY[
        (
          SELECT attribute.attnum
          FROM pg_attribute AS attribute
          WHERE attribute.attrelid = constraint_row.conrelid
            AND attribute.attname = 'organization_id'
            AND NOT attribute.attisdropped
        )
      ]::smallint[]
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I DROP CONSTRAINT %I',
      tenant_fk.schema_name,
      tenant_fk.table_name,
      tenant_fk.constraint_name
    );
  END LOOP;
END;
$$;

ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT,
  ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT,
  ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.phone_numbers
  ADD CONSTRAINT phone_numbers_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT,
  ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.call_logs
  ADD CONSTRAINT call_logs_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT,
  ALTER COLUMN organization_id SET NOT NULL;

-- Membership itself is part of each ownership key. Owned resources block a
-- membership removal until they are deliberately reassigned; credentials and
-- external identity mappings are removed when that membership is removed.
ALTER TABLE public.campaigns
  DROP CONSTRAINT IF EXISTS campaigns_organization_user_membership_fkey,
  ADD CONSTRAINT campaigns_organization_user_membership_fkey
  FOREIGN KEY (organization_id, user_id)
  REFERENCES public.organization_users(organization_id, user_id) ON DELETE RESTRICT;
ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_organization_user_membership_fkey,
  ADD CONSTRAINT leads_organization_user_membership_fkey
  FOREIGN KEY (organization_id, user_id)
  REFERENCES public.organization_users(organization_id, user_id) ON DELETE RESTRICT;
ALTER TABLE public.phone_numbers
  DROP CONSTRAINT IF EXISTS phone_numbers_organization_user_membership_fkey,
  ADD CONSTRAINT phone_numbers_organization_user_membership_fkey
  FOREIGN KEY (organization_id, user_id)
  REFERENCES public.organization_users(organization_id, user_id) ON DELETE RESTRICT;
ALTER TABLE public.call_logs
  DROP CONSTRAINT IF EXISTS call_logs_organization_user_membership_fkey,
  ADD CONSTRAINT call_logs_organization_user_membership_fkey
  FOREIGN KEY (organization_id, user_id)
  REFERENCES public.organization_users(organization_id, user_id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.user_in_organization(user_uuid uuid, org_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_users AS membership
    WHERE membership.user_id = user_uuid
      AND membership.organization_id = org_uuid
  );
$$;

REVOKE ALL ON FUNCTION public.user_in_organization(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_in_organization(uuid, uuid) TO authenticated, service_role;

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Users can insert their own campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Users can update their own campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Users can delete their own campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Users can view campaigns in their organization" ON public.campaigns;
DROP POLICY IF EXISTS "Users can insert campaigns in their organization" ON public.campaigns;
DROP POLICY IF EXISTS "Users can update campaigns in their organization" ON public.campaigns;
DROP POLICY IF EXISTS "Users can delete campaigns in their organization" ON public.campaigns;
DROP POLICY IF EXISTS "Tenant members can view campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Tenant owners can insert campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Tenant owners can update campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Tenant owners can delete campaigns" ON public.campaigns;

CREATE POLICY "Tenant members can view campaigns"
ON public.campaigns FOR SELECT TO authenticated
USING (public.user_in_organization(auth.uid(), organization_id));
CREATE POLICY "Tenant owners can insert campaigns"
ON public.campaigns FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND public.user_in_organization(auth.uid(), organization_id));
CREATE POLICY "Tenant owners can update campaigns"
ON public.campaigns FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND public.user_in_organization(auth.uid(), organization_id))
WITH CHECK (user_id = auth.uid() AND public.user_in_organization(auth.uid(), organization_id));
CREATE POLICY "Tenant owners can delete campaigns"
ON public.campaigns FOR DELETE TO authenticated
USING (user_id = auth.uid() AND public.user_in_organization(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Users can view their own leads" ON public.leads;
DROP POLICY IF EXISTS "Users can insert their own leads" ON public.leads;
DROP POLICY IF EXISTS "Users can update their own leads" ON public.leads;
DROP POLICY IF EXISTS "Users can delete their own leads" ON public.leads;
DROP POLICY IF EXISTS "Users can view leads in their organization" ON public.leads;
DROP POLICY IF EXISTS "Users can insert leads in their organization" ON public.leads;
DROP POLICY IF EXISTS "Users can update leads in their organization" ON public.leads;
DROP POLICY IF EXISTS "Users can delete leads in their organization" ON public.leads;
DROP POLICY IF EXISTS "Tenant members can view leads" ON public.leads;
DROP POLICY IF EXISTS "Tenant owners can insert leads" ON public.leads;
DROP POLICY IF EXISTS "Tenant owners can update leads" ON public.leads;
DROP POLICY IF EXISTS "Tenant owners can delete leads" ON public.leads;

CREATE POLICY "Tenant members can view leads"
ON public.leads FOR SELECT TO authenticated
USING (public.user_in_organization(auth.uid(), organization_id));
CREATE POLICY "Tenant owners can insert leads"
ON public.leads FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND public.user_in_organization(auth.uid(), organization_id));
CREATE POLICY "Tenant owners can update leads"
ON public.leads FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND public.user_in_organization(auth.uid(), organization_id))
WITH CHECK (user_id = auth.uid() AND public.user_in_organization(auth.uid(), organization_id));
CREATE POLICY "Tenant owners can delete leads"
ON public.leads FOR DELETE TO authenticated
USING (user_id = auth.uid() AND public.user_in_organization(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Authenticated users can view all phone numbers" ON public.phone_numbers;
DROP POLICY IF EXISTS "Authenticated users can update phone numbers" ON public.phone_numbers;
DROP POLICY IF EXISTS "Authenticated users can insert phone numbers" ON public.phone_numbers;
DROP POLICY IF EXISTS "Authenticated users can delete phone numbers" ON public.phone_numbers;
DROP POLICY IF EXISTS "Users can view their own phone numbers" ON public.phone_numbers;
DROP POLICY IF EXISTS "Users can insert their own phone numbers" ON public.phone_numbers;
DROP POLICY IF EXISTS "Users can update their own phone numbers" ON public.phone_numbers;
DROP POLICY IF EXISTS "Users can delete their own phone numbers" ON public.phone_numbers;
DROP POLICY IF EXISTS "Users can view phone numbers in their organization" ON public.phone_numbers;
DROP POLICY IF EXISTS "Users can insert phone numbers in their organization" ON public.phone_numbers;
DROP POLICY IF EXISTS "Users can update phone numbers in their organization" ON public.phone_numbers;
DROP POLICY IF EXISTS "Users can delete phone numbers in their organization" ON public.phone_numbers;
DROP POLICY IF EXISTS "Tenant members can view phone numbers" ON public.phone_numbers;
DROP POLICY IF EXISTS "Tenant owners can insert phone numbers" ON public.phone_numbers;
DROP POLICY IF EXISTS "Tenant owners can update phone numbers" ON public.phone_numbers;
DROP POLICY IF EXISTS "Tenant owners can delete phone numbers" ON public.phone_numbers;

CREATE POLICY "Tenant members can view phone numbers"
ON public.phone_numbers FOR SELECT TO authenticated
USING (public.user_in_organization(auth.uid(), organization_id));
CREATE POLICY "Tenant owners can insert phone numbers"
ON public.phone_numbers FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND public.user_in_organization(auth.uid(), organization_id));
CREATE POLICY "Tenant owners can update phone numbers"
ON public.phone_numbers FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND public.user_in_organization(auth.uid(), organization_id))
WITH CHECK (user_id = auth.uid() AND public.user_in_organization(auth.uid(), organization_id));
CREATE POLICY "Tenant owners can delete phone numbers"
ON public.phone_numbers FOR DELETE TO authenticated
USING (user_id = auth.uid() AND public.user_in_organization(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Users can view their own call logs" ON public.call_logs;
DROP POLICY IF EXISTS "Users can insert call logs" ON public.call_logs;
DROP POLICY IF EXISTS "Users can view call logs in their organization" ON public.call_logs;
DROP POLICY IF EXISTS "System can insert call logs" ON public.call_logs;
DROP POLICY IF EXISTS "Tenant members can view call logs" ON public.call_logs;
DROP POLICY IF EXISTS "Tenant owners can insert call logs" ON public.call_logs;
DROP POLICY IF EXISTS "Tenant owners can update call logs" ON public.call_logs;
DROP POLICY IF EXISTS "Tenant owners can delete call logs" ON public.call_logs;

CREATE POLICY "Tenant members can view call logs"
ON public.call_logs FOR SELECT TO authenticated
USING (public.user_in_organization(auth.uid(), organization_id));
CREATE POLICY "Tenant owners can insert call logs"
ON public.call_logs FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND public.user_in_organization(auth.uid(), organization_id));
CREATE POLICY "Tenant owners can update call logs"
ON public.call_logs FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND public.user_in_organization(auth.uid(), organization_id))
WITH CHECK (user_id = auth.uid() AND public.user_in_organization(auth.uid(), organization_id));
CREATE POLICY "Tenant owners can delete call logs"
ON public.call_logs FOR DELETE TO authenticated
USING (user_id = auth.uid() AND public.user_in_organization(auth.uid(), organization_id));

-- A core-resource owner can change only inside the certified transfer RPC. The
-- authorization row is transaction-bound, exact (organization/from/to), and
-- unavailable even to service_role directly; the SECURITY DEFINER RPC is the
-- sole writer. Completed rows remain as an immutable operator audit trail.
CREATE TABLE IF NOT EXISTS public.organization_membership_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id bigint NOT NULL,
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  from_user_id uuid NOT NULL,
  to_user_id uuid NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) >= 12),
  remove_membership boolean NOT NULL DEFAULT true,
  state text NOT NULL DEFAULT 'processing'
    CHECK (state IN ('processing', 'completed')),
  campaigns_transferred integer NOT NULL DEFAULT 0 CHECK (campaigns_transferred >= 0),
  leads_transferred integer NOT NULL DEFAULT 0 CHECK (leads_transferred >= 0),
  phone_numbers_transferred integer NOT NULL DEFAULT 0 CHECK (phone_numbers_transferred >= 0),
  call_logs_transferred integer NOT NULL DEFAULT 0 CHECK (call_logs_transferred >= 0),
  phone_pools_transferred integer NOT NULL DEFAULT 0 CHECK (phone_pools_transferred >= 0),
  membership_removed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK (from_user_id <> to_user_id),
  CHECK (
    (state = 'processing' AND completed_at IS NULL)
    OR (state = 'completed' AND completed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_membership_transfers_active_transaction
  ON public.organization_membership_transfers(transaction_id)
  WHERE state = 'processing';

ALTER TABLE public.organization_membership_transfers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.organization_membership_transfers
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_tenant_owned_core_resource()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION '% organization ownership is immutable', TG_TABLE_NAME
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.organization_membership_transfers AS transfer
      WHERE transfer.transaction_id = txid_current()
        AND transfer.state = 'processing'
        AND transfer.organization_id = OLD.organization_id
        AND transfer.organization_id = NEW.organization_id
        AND transfer.from_user_id = OLD.user_id
        AND transfer.to_user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION '% tenant owner is immutable outside the certified membership transfer RPC', TG_TABLE_NAME
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION '% requires an explicit organization_id', TG_TABLE_NAME
      USING ERRCODE = '23502';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_users AS membership
    WHERE membership.user_id = NEW.user_id
      AND membership.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'user % is not a member of organization % for %',
      NEW.user_id, NEW.organization_id, TG_TABLE_NAME
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS campaigns_require_authoritative_tenant ON public.campaigns;
CREATE TRIGGER campaigns_require_authoritative_tenant
BEFORE INSERT OR UPDATE OF user_id, organization_id ON public.campaigns
FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_owned_core_resource();

DROP TRIGGER IF EXISTS leads_require_authoritative_tenant ON public.leads;
CREATE TRIGGER leads_require_authoritative_tenant
BEFORE INSERT OR UPDATE OF user_id, organization_id ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_owned_core_resource();

DROP TRIGGER IF EXISTS phone_numbers_require_authoritative_tenant ON public.phone_numbers;
CREATE TRIGGER phone_numbers_require_authoritative_tenant
BEFORE INSERT OR UPDATE OF user_id, organization_id ON public.phone_numbers
FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_owned_core_resource();

DROP TRIGGER IF EXISTS call_logs_require_authoritative_tenant ON public.call_logs;
CREATE TRIGGER call_logs_require_authoritative_tenant
BEFORE INSERT OR UPDATE OF user_id, organization_id ON public.call_logs
FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_owned_core_resource();

CREATE OR REPLACE FUNCTION public.enforce_call_log_tenant_graph()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  campaign_org uuid;
  campaign_user uuid;
  lead_org uuid;
  lead_user uuid;
BEGIN
  IF NEW.campaign_id IS NOT NULL THEN
    SELECT organization_id, user_id INTO campaign_org, campaign_user
    FROM public.campaigns WHERE id = NEW.campaign_id;
    IF campaign_org IS NULL
      OR campaign_org IS DISTINCT FROM NEW.organization_id
      OR campaign_user IS DISTINCT FROM NEW.user_id
    THEN
      RAISE EXCEPTION 'call log campaign must have identical authoritative tenant ownership'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.lead_id IS NOT NULL THEN
    SELECT organization_id, user_id INTO lead_org, lead_user
    FROM public.leads WHERE id = NEW.lead_id;
    IF lead_org IS NULL
      OR lead_org IS DISTINCT FROM NEW.organization_id
      OR lead_user IS DISTINCT FROM NEW.user_id
    THEN
      RAISE EXCEPTION 'call log lead must have identical authoritative tenant ownership'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS call_logs_same_tenant_graph ON public.call_logs;
CREATE TRIGGER call_logs_same_tenant_graph
BEFORE INSERT OR UPDATE OF user_id, organization_id, campaign_id, lead_id ON public.call_logs
FOR EACH ROW EXECUTE FUNCTION public.enforce_call_log_tenant_graph();

CREATE OR REPLACE FUNCTION public.enforce_campaign_lead_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  campaign_org uuid;
  campaign_user uuid;
  lead_org uuid;
  lead_user uuid;
BEGIN
  IF NEW.campaign_id IS NULL OR NEW.lead_id IS NULL THEN
    RAISE EXCEPTION 'campaign_leads requires campaign_id and lead_id'
      USING ERRCODE = '23502';
  END IF;

  SELECT organization_id, user_id INTO campaign_org, campaign_user
  FROM public.campaigns WHERE id = NEW.campaign_id;
  SELECT organization_id, user_id INTO lead_org, lead_user
  FROM public.leads WHERE id = NEW.lead_id;

  IF campaign_org IS NULL OR lead_org IS NULL
    OR campaign_org IS DISTINCT FROM lead_org
    OR campaign_user IS DISTINCT FROM lead_user THEN
    RAISE EXCEPTION 'campaign and lead must have identical authoritative tenant ownership'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS campaign_leads_same_tenant ON public.campaign_leads;
CREATE TRIGGER campaign_leads_same_tenant
BEFORE INSERT OR UPDATE OF campaign_id, lead_id ON public.campaign_leads
FOR EACH ROW EXECUTE FUNCTION public.enforce_campaign_lead_tenant();

CREATE OR REPLACE FUNCTION public.enforce_campaign_phone_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  campaign_org uuid;
  campaign_user uuid;
  phone_org uuid;
  phone_user uuid;
BEGIN
  IF NEW.campaign_id IS NULL OR NEW.phone_number_id IS NULL THEN
    RAISE EXCEPTION 'campaign_phone_pools requires campaign_id and phone_number_id'
      USING ERRCODE = '23502';
  END IF;

  SELECT organization_id, user_id INTO campaign_org, campaign_user
  FROM public.campaigns WHERE id = NEW.campaign_id;
  SELECT organization_id, user_id INTO phone_org, phone_user
  FROM public.phone_numbers WHERE id = NEW.phone_number_id;

  IF campaign_org IS NULL OR phone_org IS NULL
    OR campaign_org IS DISTINCT FROM phone_org
    OR campaign_user IS DISTINCT FROM phone_user
    OR NEW.user_id IS DISTINCT FROM campaign_user THEN
    RAISE EXCEPTION 'campaign and phone number must have identical authoritative tenant ownership'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS campaign_phone_pools_same_tenant ON public.campaign_phone_pools;
CREATE TRIGGER campaign_phone_pools_same_tenant
BEFORE INSERT OR UPDATE OF campaign_id, phone_number_id, user_id ON public.campaign_phone_pools
FOR EACH ROW EXECUTE FUNCTION public.enforce_campaign_phone_tenant();

CREATE OR REPLACE FUNCTION public.enforce_dialing_queue_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  campaign_org uuid;
  campaign_user uuid;
  lead_org uuid;
  lead_user uuid;
BEGIN
  SELECT organization_id, user_id INTO campaign_org, campaign_user
  FROM public.campaigns WHERE id = NEW.campaign_id;
  SELECT organization_id, user_id INTO lead_org, lead_user
  FROM public.leads WHERE id = NEW.lead_id;

  IF campaign_org IS NULL OR lead_org IS NULL
    OR campaign_org IS DISTINCT FROM lead_org
    OR campaign_user IS DISTINCT FROM lead_user THEN
    RAISE EXCEPTION 'dialing queue campaign and lead must share one authoritative tenant'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dialing_queues_same_tenant ON public.dialing_queues;
CREATE TRIGGER dialing_queues_same_tenant
BEFORE INSERT OR UPDATE OF campaign_id, lead_id ON public.dialing_queues
FOR EACH ROW EXECUTE FUNCTION public.enforce_dialing_queue_tenant();

-- Validate every relationship that predates the triggers. A historical
-- mismatch is launch-blocking evidence and must never be silently grandfathered.
DO $$
DECLARE
  mismatched_campaign_leads bigint;
  mismatched_phone_pools bigint;
  mismatched_queues bigint;
  mismatched_call_logs bigint;
BEGIN
  SELECT count(*) INTO mismatched_campaign_leads
  FROM public.campaign_leads AS link
  LEFT JOIN public.campaigns AS campaign ON campaign.id = link.campaign_id
  LEFT JOIN public.leads AS lead ON lead.id = link.lead_id
  WHERE campaign.id IS NULL
     OR lead.id IS NULL
     OR campaign.organization_id IS DISTINCT FROM lead.organization_id
     OR campaign.user_id IS DISTINCT FROM lead.user_id;

  SELECT count(*) INTO mismatched_phone_pools
  FROM public.campaign_phone_pools AS pool
  LEFT JOIN public.campaigns AS campaign ON campaign.id = pool.campaign_id
  LEFT JOIN public.phone_numbers AS phone ON phone.id = pool.phone_number_id
  WHERE campaign.id IS NULL
     OR phone.id IS NULL
     OR campaign.organization_id IS DISTINCT FROM phone.organization_id
     OR campaign.user_id IS DISTINCT FROM phone.user_id
     OR pool.user_id IS DISTINCT FROM campaign.user_id;

  SELECT count(*) INTO mismatched_queues
  FROM public.dialing_queues AS queue
  LEFT JOIN public.campaigns AS campaign ON campaign.id = queue.campaign_id
  LEFT JOIN public.leads AS lead ON lead.id = queue.lead_id
  WHERE campaign.id IS NULL
     OR lead.id IS NULL
     OR campaign.organization_id IS DISTINCT FROM lead.organization_id
     OR campaign.user_id IS DISTINCT FROM lead.user_id;

  SELECT count(*) INTO mismatched_call_logs
  FROM public.call_logs AS call_log
  LEFT JOIN public.campaigns AS campaign ON campaign.id = call_log.campaign_id
  LEFT JOIN public.leads AS lead ON lead.id = call_log.lead_id
  WHERE call_log.organization_id IS NULL
     OR (call_log.campaign_id IS NOT NULL AND (
       campaign.id IS NULL
       OR campaign.organization_id IS DISTINCT FROM call_log.organization_id
       OR campaign.user_id IS DISTINCT FROM call_log.user_id
     ))
     OR (call_log.lead_id IS NOT NULL AND (
       lead.id IS NULL
       OR lead.organization_id IS DISTINCT FROM call_log.organization_id
       OR lead.user_id IS DISTINCT FROM call_log.user_id
     ));

  IF mismatched_campaign_leads + mismatched_phone_pools + mismatched_queues + mismatched_call_logs > 0 THEN
    RAISE EXCEPTION 'TENANT_RELATIONSHIP_REPAIR_REQUIRED'
      USING DETAIL = format(
        'Cross-tenant or orphaned relationships found: campaign_leads=%s phone_pools=%s queues=%s call_logs=%s',
        mismatched_campaign_leads,
        mismatched_phone_pools,
        mismatched_queues,
        mismatched_call_logs
      ),
      HINT = 'Repair every ownership graph before enabling outbound traffic.';
  END IF;
END;
$$;

-- A Slack identity is bound to one organization. Existing single-membership
-- mappings are upgraded deterministically; multi-membership mappings stay NULL
-- and the webhook refuses commands until an operator chooses a company.
ALTER TABLE public.slack_users
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;

WITH unique_membership AS (
  SELECT user_id, min(organization_id::text)::uuid AS organization_id
  FROM public.organization_users
  GROUP BY user_id
  HAVING count(DISTINCT organization_id) = 1
)
UPDATE public.slack_users AS mapping
SET organization_id = membership.organization_id
FROM unique_membership AS membership
WHERE mapping.organization_id IS NULL
  AND mapping.user_id = membership.user_id;

CREATE INDEX IF NOT EXISTS idx_slack_users_organization_id
  ON public.slack_users(organization_id);

ALTER TABLE public.slack_users
  DROP CONSTRAINT IF EXISTS slack_users_organization_user_membership_fkey,
  ADD CONSTRAINT slack_users_organization_user_membership_fkey
  FOREIGN KEY (organization_id, user_id)
  REFERENCES public.organization_users(organization_id, user_id) ON DELETE CASCADE;

WITH unique_membership AS (
  SELECT user_id, min(organization_id::text)::uuid AS organization_id
  FROM public.organization_users
  GROUP BY user_id
  HAVING count(DISTINCT organization_id) = 1
)
UPDATE public.api_keys AS api_key
SET organization_id = membership.organization_id
FROM unique_membership AS membership
WHERE api_key.organization_id IS NULL
  AND api_key.user_id = membership.user_id;

-- A key without one authoritative tenant is unusable. Revoke ambiguous legacy
-- keys and require their owner to mint a replacement for an explicit company.
UPDATE public.api_keys
SET revoked_at = COALESCE(revoked_at, now()),
    updated_at = now()
WHERE organization_id IS NULL;

ALTER TABLE public.api_keys
  DROP CONSTRAINT IF EXISTS api_keys_organization_user_membership_fkey,
  ADD CONSTRAINT api_keys_organization_user_membership_fkey
  FOREIGN KEY (organization_id, user_id)
  REFERENCES public.organization_users(organization_id, user_id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.enforce_integration_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.organization_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.organization_users AS membership
    WHERE membership.user_id = NEW.user_id
      AND membership.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION '% requires an explicit organization membership', TG_TABLE_NAME
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS slack_users_require_authoritative_tenant ON public.slack_users;
CREATE TRIGGER slack_users_require_authoritative_tenant
BEFORE INSERT OR UPDATE OF user_id, organization_id ON public.slack_users
FOR EACH ROW EXECUTE FUNCTION public.enforce_integration_tenant();

DROP TRIGGER IF EXISTS api_keys_require_authoritative_tenant ON public.api_keys;
CREATE TRIGGER api_keys_require_authoritative_tenant
BEFORE INSERT OR UPDATE OF user_id, organization_id ON public.api_keys
FOR EACH ROW EXECUTE FUNCTION public.enforce_integration_tenant();

-- Remove the legacy overload that had no organization argument and selected
-- an arbitrary membership with LIMIT 1. The surviving helper accepts an
-- explicit organization; omitting it is allowed only for a single-membership
-- user, preserving safe backward compatibility for one-company installs.
DROP FUNCTION IF EXISTS public.mint_api_key(uuid, text, text[], integer, interval);

CREATE OR REPLACE FUNCTION public.mint_api_key(
  p_user_id uuid,
  p_name text,
  p_scopes text[] DEFAULT ARRAY['read']::text[],
  p_organization_id uuid DEFAULT NULL,
  p_rate_limit integer DEFAULT 600,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  plaintext text,
  key_prefix text,
  scopes text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  selected_organization_id uuid;
  membership_count integer;
  alphabet constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  random_part text := '';
  random_byte integer;
  character_index integer;
  plaintext_key text;
  hashed_key text;
  prefix text;
  inserted_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;
  IF p_name IS NULL OR length(btrim(p_name)) = 0 THEN
    RAISE EXCEPTION 'p_name is required';
  END IF;
  IF p_rate_limit IS NULL OR p_rate_limit < 1 OR p_rate_limit > 10000 THEN
    RAISE EXCEPTION 'p_rate_limit must be between 1 and 10000';
  END IF;

  IF p_organization_id IS NULL THEN
    SELECT count(DISTINCT membership.organization_id), min(membership.organization_id::text)::uuid
    INTO membership_count, selected_organization_id
    FROM public.organization_users AS membership
    WHERE membership.user_id = p_user_id;

    IF membership_count <> 1 THEN
      RAISE EXCEPTION 'An explicit p_organization_id is required for a user with % memberships', membership_count;
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1
      FROM public.organization_users AS membership
      WHERE membership.user_id = p_user_id
        AND membership.organization_id = p_organization_id
    ) THEN
      RAISE EXCEPTION 'The user is not a member of the requested organization'
        USING ERRCODE = '42501';
    END IF;
    selected_organization_id := p_organization_id;
  END IF;

  FOR character_index IN 1..32 LOOP
    random_byte := get_byte(gen_random_bytes(1), 0);
    random_part := random_part || substr(alphabet, (random_byte % 62) + 1, 1);
  END LOOP;

  plaintext_key := 'dsk_live_' || random_part;
  hashed_key := encode(digest(plaintext_key, 'sha256'), 'hex');
  prefix := substring(plaintext_key FOR 12);

  INSERT INTO public.api_keys (
    user_id,
    organization_id,
    name,
    key_prefix,
    key_hash,
    scopes,
    rate_limit_per_minute,
    expires_at
  ) VALUES (
    p_user_id,
    selected_organization_id,
    btrim(p_name),
    prefix,
    hashed_key,
    COALESCE(p_scopes, ARRAY['read']::text[]),
    p_rate_limit,
    p_expires_at
  )
  RETURNING api_keys.id INTO inserted_id;

  RETURN QUERY
  SELECT inserted_id, plaintext_key, prefix, COALESCE(p_scopes, ARRAY['read']::text[]);
END;
$$;

REVOKE ALL ON FUNCTION public.mint_api_key(uuid, text, text[], uuid, integer, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mint_api_key(uuid, text, text[], uuid, integer, timestamptz)
  TO service_role;

-- Transfer the four certified routing resources to another current member of
-- the same organization, then optionally remove the old membership. Provider
-- identity is immutable after egress, so any physical/provider evidence blocks
-- transfer and requires a separate evidence-preserving archival workflow.
CREATE OR REPLACE FUNCTION public.transfer_organization_membership_resources(
  p_organization_id uuid,
  p_from_user_id uuid,
  p_to_user_id uuid,
  p_reason text,
  p_remove_membership boolean DEFAULT true
)
RETURNS TABLE (
  transfer_id uuid,
  campaigns_transferred integer,
  leads_transferred integer,
  phone_numbers_transferred integer,
  call_logs_transferred integer,
  phone_pools_transferred integer,
  membership_removed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  source_role text;
  target_role text;
  new_transfer_id uuid;
  moved_campaigns integer := 0;
  moved_leads integer := 0;
  moved_phone_numbers integer := 0;
  moved_call_logs integer := 0;
  moved_phone_pools integer := 0;
  removed_membership boolean := false;
BEGIN
  IF p_organization_id IS NULL OR p_from_user_id IS NULL OR p_to_user_id IS NULL THEN
    RAISE EXCEPTION 'organization, source user, and target user are required';
  END IF;
  IF p_from_user_id = p_to_user_id THEN
    RAISE EXCEPTION 'source and target users must be different';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 12 THEN
    RAISE EXCEPTION 'a meaningful transfer reason of at least 12 characters is required';
  END IF;
  IF p_remove_membership IS NULL THEN
    RAISE EXCEPTION 'p_remove_membership must be explicit';
  END IF;

  -- The organization lock prevents reciprocal A->B/B->A transfers from
  -- deadlocking and blocks new child memberships at their organization FK. Lock
  -- every existing membership as well so a concurrent role change/removal
  -- cannot invalidate the last-owner decision made below.
  PERFORM 1
  FROM public.organizations AS organization
  WHERE organization.id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization does not exist';
  END IF;

  PERFORM 1
  FROM public.organization_users AS membership
  WHERE membership.organization_id = p_organization_id
  ORDER BY membership.user_id
  FOR UPDATE;

  SELECT membership.role
  INTO source_role
  FROM public.organization_users AS membership
  WHERE membership.organization_id = p_organization_id
    AND membership.user_id = p_from_user_id
  FOR UPDATE;
  IF source_role IS NULL THEN
    RAISE EXCEPTION 'source user is not a current organization member';
  END IF;

  SELECT membership.role
  INTO target_role
  FROM public.organization_users AS membership
  WHERE membership.organization_id = p_organization_id
    AND membership.user_id = p_to_user_id
  FOR UPDATE;
  IF target_role IS NULL THEN
    RAISE EXCEPTION 'target user is not a current organization member';
  END IF;

  IF p_remove_membership
    AND source_role = 'owner'
    AND NOT EXISTS (
      SELECT 1
      FROM public.organization_users AS membership
      WHERE membership.organization_id = p_organization_id
        AND membership.user_id <> p_from_user_id
        AND membership.role = 'owner'
    )
  THEN
    RAISE EXCEPTION 'the last organization owner cannot be removed';
  END IF;

  -- Provider claim creation locks call_logs before it snapshots egress identity.
  -- Take those locks in the same order so a concurrent dispatcher either
  -- commits first and is caught by the evidence preflight, or resumes after the
  -- transfer and fails its now-stale source-user graph assertion.
  PERFORM 1
  FROM public.call_logs AS call_log
  WHERE call_log.organization_id = p_organization_id
    AND call_log.user_id = p_from_user_id
  ORDER BY call_log.id
  FOR UPDATE;

  -- Child routing tables can be inserted without an organization_id of their
  -- own. Strong parent locks serialize those FK inserts with this transfer so
  -- no late campaign/lead/phone relationship can retain the source owner.
  PERFORM 1
  FROM public.campaigns AS campaign
  WHERE campaign.organization_id = p_organization_id
    AND campaign.user_id = p_from_user_id
  ORDER BY campaign.id
  FOR UPDATE;

  PERFORM 1
  FROM public.leads AS lead
  WHERE lead.organization_id = p_organization_id
    AND lead.user_id = p_from_user_id
  ORDER BY lead.id
  FOR UPDATE;

  PERFORM 1
  FROM public.phone_numbers AS phone
  WHERE phone.organization_id = p_organization_id
    AND phone.user_id = p_from_user_id
  ORDER BY phone.id
  FOR UPDATE;

  PERFORM 1
  FROM public.dialing_queues AS queue
  JOIN public.campaigns AS campaign ON campaign.id = queue.campaign_id
  WHERE campaign.organization_id = p_organization_id
    AND campaign.user_id = p_from_user_id
  ORDER BY queue.id
  FOR UPDATE OF queue;

  IF EXISTS (
      SELECT 1
      FROM public.provider_dispatch_claims AS dispatch
      WHERE (
          dispatch.organization_id = p_organization_id
          AND dispatch.user_id = p_from_user_id
        )
        OR dispatch.call_log_id IN (
          SELECT call_log.id
          FROM public.call_logs AS call_log
          WHERE call_log.organization_id = p_organization_id
            AND call_log.user_id = p_from_user_id
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.provider_call_attempts AS attempt
      WHERE (
          attempt.organization_id = p_organization_id
          AND attempt.user_id = p_from_user_id
        )
        OR attempt.call_log_id IN (
          SELECT call_log.id
          FROM public.call_logs AS call_log
          WHERE call_log.organization_id = p_organization_id
            AND call_log.user_id = p_from_user_id
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.call_logs AS call_log
      WHERE call_log.organization_id = p_organization_id
        AND call_log.user_id = p_from_user_id
        AND (
          call_log.retell_call_id IS NOT NULL
          OR call_log.telnyx_call_control_id IS NOT NULL
          OR call_log.telnyx_call_session_id IS NOT NULL
          OR call_log.provider_reconciliation_required = true
          OR call_log.status IN ('initiated', 'ringing', 'in_progress')
        )
    )
  THEN
    RAISE EXCEPTION 'PROVIDER_EVIDENCE_TRANSFER_REQUIRED'
      USING ERRCODE = '55000',
      DETAIL = 'Provider-bound call identity cannot be reassigned by the core membership transfer RPC.',
      HINT = 'Resolve or archive immutable provider evidence with a dedicated audited workflow before offboarding.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.dialing_queues AS queue
    JOIN public.campaigns AS campaign ON campaign.id = queue.campaign_id
    WHERE campaign.organization_id = p_organization_id
      AND campaign.user_id = p_from_user_id
      AND queue.status = 'calling'
  ) THEN
    RAISE EXCEPTION 'ACTIVE_DISPATCH_TRANSFER_FORBIDDEN'
      USING ERRCODE = '55000',
      HINT = 'Wait for every calling queue lease to reach a terminal or quarantined state.';
  END IF;

  INSERT INTO public.organization_membership_transfers (
    transaction_id,
    organization_id,
    from_user_id,
    to_user_id,
    reason,
    remove_membership
  ) VALUES (
    txid_current(),
    p_organization_id,
    p_from_user_id,
    p_to_user_id,
    btrim(p_reason),
    p_remove_membership
  )
  RETURNING id INTO new_transfer_id;

  UPDATE public.campaigns
  SET user_id = p_to_user_id
  WHERE organization_id = p_organization_id
    AND user_id = p_from_user_id;
  GET DIAGNOSTICS moved_campaigns = ROW_COUNT;

  UPDATE public.leads
  SET user_id = p_to_user_id
  WHERE organization_id = p_organization_id
    AND user_id = p_from_user_id;
  GET DIAGNOSTICS moved_leads = ROW_COUNT;

  UPDATE public.phone_numbers
  SET user_id = p_to_user_id
  WHERE organization_id = p_organization_id
    AND user_id = p_from_user_id;
  GET DIAGNOSTICS moved_phone_numbers = ROW_COUNT;

  UPDATE public.call_logs
  SET user_id = p_to_user_id
  WHERE organization_id = p_organization_id
    AND user_id = p_from_user_id;
  GET DIAGNOSTICS moved_call_logs = ROW_COUNT;

  UPDATE public.campaign_phone_pools AS pool
  SET user_id = p_to_user_id,
      updated_at = now()
  FROM public.campaigns AS campaign,
       public.phone_numbers AS phone
  WHERE pool.campaign_id = campaign.id
    AND pool.phone_number_id = phone.id
    AND campaign.organization_id = p_organization_id
    AND campaign.user_id = p_to_user_id
    AND phone.organization_id = p_organization_id
    AND phone.user_id = p_to_user_id
    AND pool.user_id = p_from_user_id;
  GET DIAGNOSTICS moved_phone_pools = ROW_COUNT;

  IF EXISTS (
      SELECT 1 FROM public.campaigns
      WHERE organization_id = p_organization_id AND user_id = p_from_user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.leads
      WHERE organization_id = p_organization_id AND user_id = p_from_user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.phone_numbers
      WHERE organization_id = p_organization_id AND user_id = p_from_user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.call_logs
      WHERE organization_id = p_organization_id AND user_id = p_from_user_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.campaign_phone_pools AS pool
      JOIN public.campaigns AS campaign ON campaign.id = pool.campaign_id
      WHERE campaign.organization_id = p_organization_id
        AND pool.user_id = p_from_user_id
    )
  THEN
    RAISE EXCEPTION 'certified membership transfer left source-owned routing resources';
  END IF;

  IF EXISTS (
      SELECT 1
      FROM public.campaign_leads AS link
      JOIN public.campaigns AS campaign ON campaign.id = link.campaign_id
      JOIN public.leads AS lead ON lead.id = link.lead_id
      WHERE campaign.organization_id = p_organization_id
        AND (
          campaign.organization_id IS DISTINCT FROM lead.organization_id
          OR campaign.user_id IS DISTINCT FROM lead.user_id
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.campaign_phone_pools AS pool
      JOIN public.campaigns AS campaign ON campaign.id = pool.campaign_id
      JOIN public.phone_numbers AS phone ON phone.id = pool.phone_number_id
      WHERE campaign.organization_id = p_organization_id
        AND (
          campaign.organization_id IS DISTINCT FROM phone.organization_id
          OR campaign.user_id IS DISTINCT FROM phone.user_id
          OR pool.user_id IS DISTINCT FROM campaign.user_id
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.dialing_queues AS queue
      JOIN public.campaigns AS campaign ON campaign.id = queue.campaign_id
      JOIN public.leads AS lead ON lead.id = queue.lead_id
      WHERE campaign.organization_id = p_organization_id
        AND (
          campaign.organization_id IS DISTINCT FROM lead.organization_id
          OR campaign.user_id IS DISTINCT FROM lead.user_id
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.call_logs AS call_log
      LEFT JOIN public.campaigns AS campaign ON campaign.id = call_log.campaign_id
      LEFT JOIN public.leads AS lead ON lead.id = call_log.lead_id
      WHERE call_log.organization_id = p_organization_id
        AND (
          (call_log.campaign_id IS NOT NULL AND (
            campaign.id IS NULL
            OR campaign.organization_id IS DISTINCT FROM call_log.organization_id
            OR campaign.user_id IS DISTINCT FROM call_log.user_id
          ))
          OR (call_log.lead_id IS NOT NULL AND (
            lead.id IS NULL
            OR lead.organization_id IS DISTINCT FROM call_log.organization_id
            OR lead.user_id IS DISTINCT FROM call_log.user_id
          ))
        )
    )
  THEN
    RAISE EXCEPTION 'certified membership transfer violated a routing ownership graph';
  END IF;

  IF p_remove_membership THEN
    DELETE FROM public.organization_users
    WHERE organization_id = p_organization_id
      AND user_id = p_from_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'source membership changed before certified removal';
    END IF;
    removed_membership := true;
  END IF;

  UPDATE public.organization_membership_transfers
  SET state = 'completed',
      campaigns_transferred = moved_campaigns,
      leads_transferred = moved_leads,
      phone_numbers_transferred = moved_phone_numbers,
      call_logs_transferred = moved_call_logs,
      phone_pools_transferred = moved_phone_pools,
      membership_removed = removed_membership,
      completed_at = now()
  WHERE id = new_transfer_id
    AND transaction_id = txid_current()
    AND state = 'processing';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'certified membership transfer audit lease was lost';
  END IF;

  RETURN QUERY SELECT
    new_transfer_id,
    moved_campaigns,
    moved_leads,
    moved_phone_numbers,
    moved_call_logs,
    moved_phone_pools,
    removed_membership;
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_organization_membership_resources(
  uuid, uuid, uuid, text, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_organization_membership_resources(
  uuid, uuid, uuid, text, boolean
) TO service_role;

REVOKE ALL ON FUNCTION public.enforce_tenant_owned_core_resource() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_call_log_tenant_graph() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_campaign_lead_tenant() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_campaign_phone_tenant() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_dialing_queue_tenant() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_integration_tenant() FROM PUBLIC, anon, authenticated;

COMMENT ON COLUMN public.campaigns.organization_id IS
  'Authoritative organization selected explicitly by the operator or integration.';
COMMENT ON COLUMN public.leads.organization_id IS
  'Authoritative organization selected explicitly by the operator or integration.';
COMMENT ON COLUMN public.phone_numbers.organization_id IS
  'Authoritative organization selected explicitly by the operator or integration.';
COMMENT ON COLUMN public.call_logs.organization_id IS
  'Authoritative organization selected explicitly by the operator or integration.';
COMMENT ON COLUMN public.slack_users.organization_id IS
  'Organization to which this signed Slack identity is explicitly bound.';
COMMENT ON TABLE public.organization_membership_transfers IS
  'Transaction-bound audit and authorization records for service-only same-organization core ownership transfers.';

COMMIT;
