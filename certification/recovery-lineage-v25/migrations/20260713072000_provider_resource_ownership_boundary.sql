BEGIN;

-- retell_agents exists in the connected production schema but its originating
-- DDL is missing from repo history. Refuse to create a guessed replacement;
-- the canonical production baseline must supply the complete relation.
DO $$
BEGIN
  IF to_regclass('public.retell_agents') IS NULL THEN
    RAISE EXCEPTION 'RETELL_AGENTS_BASELINE_REQUIRED'
      USING HINT = 'Install the certified production schema baseline before applying provider ownership hardening.';
  END IF;
END;
$$;

ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS organization_id uuid;

DO $$
DECLARE
  invalid_numbers bigint;
  duplicate_numbers bigint;
  duplicate_retell_phones bigint;
  duplicate_twilio_sids bigint;
  invalid_phone_owners bigint;
  invalid_agent_owners bigint;
  duplicate_retell_agents bigint;
BEGIN
  SELECT count(*) INTO invalid_numbers
  FROM public.phone_numbers
  WHERE public.normalize_contact_phone(number) IS NULL;

  SELECT count(*) INTO duplicate_numbers
  FROM (
    SELECT public.normalize_contact_phone(number)
    FROM public.phone_numbers
    GROUP BY public.normalize_contact_phone(number)
    HAVING count(*) > 1
  ) AS duplicate;

  SELECT count(*) INTO duplicate_retell_phones
  FROM (
    SELECT retell_phone_id
    FROM public.phone_numbers
    WHERE retell_phone_id IS NOT NULL
    GROUP BY retell_phone_id
    HAVING count(*) > 1
  ) AS duplicate;

  SELECT count(*) INTO duplicate_twilio_sids
  FROM (
    SELECT twilio_sid
    FROM public.phone_numbers
    WHERE twilio_sid IS NOT NULL
    GROUP BY twilio_sid
    HAVING count(*) > 1
  ) AS duplicate;

  SELECT count(*) INTO invalid_phone_owners
  FROM public.phone_numbers AS phone
  LEFT JOIN public.organization_users AS membership
    ON membership.organization_id = phone.organization_id
   AND membership.user_id = phone.user_id
  WHERE phone.organization_id IS NULL OR membership.user_id IS NULL;

  SELECT count(*) INTO invalid_agent_owners
  FROM public.retell_agents AS agent
  LEFT JOIN public.organization_users AS membership
    ON membership.organization_id = agent.organization_id
   AND membership.user_id = agent.user_id
  WHERE agent.organization_id IS NULL
    OR agent.retell_agent_id IS NULL
    OR btrim(agent.retell_agent_id) = ''
    OR membership.user_id IS NULL;

  SELECT count(*) INTO duplicate_retell_agents
  FROM (
    SELECT retell_agent_id
    FROM public.retell_agents
    WHERE retell_agent_id IS NOT NULL
    GROUP BY retell_agent_id
    HAVING count(*) > 1
  ) AS duplicate;

  IF invalid_numbers + duplicate_numbers + duplicate_retell_phones
      + duplicate_twilio_sids + invalid_phone_owners + invalid_agent_owners
      + duplicate_retell_agents > 0
  THEN
    RAISE EXCEPTION 'PROVIDER_RESOURCE_OWNERSHIP_REPAIR_REQUIRED'
      USING DETAIL = format(
        'invalid phones=%s duplicate numbers=%s duplicate Retell phones=%s duplicate Twilio SIDs=%s invalid phone owners=%s invalid agent owners=%s duplicate Retell agents=%s',
        invalid_numbers,
        duplicate_numbers,
        duplicate_retell_phones,
        duplicate_twilio_sids,
        invalid_phone_owners,
        invalid_agent_owners,
        duplicate_retell_agents
      ),
      HINT = 'Reconcile every provider identity to exactly one tenant before enabling outbound traffic.';
  END IF;
END;
$$;

UPDATE public.phone_numbers
SET number = public.normalize_contact_phone(number)
WHERE number IS DISTINCT FROM public.normalize_contact_phone(number);

ALTER TABLE public.phone_numbers
  DROP CONSTRAINT IF EXISTS phone_numbers_number_key,
  ADD CONSTRAINT phone_numbers_number_key UNIQUE (number);
DROP INDEX IF EXISTS public.phone_numbers_retell_phone_id_unique;
CREATE UNIQUE INDEX phone_numbers_retell_phone_id_unique
  ON public.phone_numbers(retell_phone_id)
  WHERE retell_phone_id IS NOT NULL;
DROP INDEX IF EXISTS public.phone_numbers_twilio_sid_unique;
CREATE UNIQUE INDEX phone_numbers_twilio_sid_unique
  ON public.phone_numbers(twilio_sid)
  WHERE twilio_sid IS NOT NULL;

ALTER TABLE public.retell_agents
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN retell_agent_id SET NOT NULL,
  DROP CONSTRAINT IF EXISTS retell_agents_organization_id_fkey,
  DROP CONSTRAINT IF EXISTS retell_agents_organization_user_membership_fkey,
  DROP CONSTRAINT IF EXISTS retell_agents_retell_agent_id_key,
  DROP CONSTRAINT IF EXISTS retell_agents_retell_agent_id_not_blank,
  ADD CONSTRAINT retell_agents_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT,
  ADD CONSTRAINT retell_agents_organization_user_membership_fkey
    FOREIGN KEY (organization_id, user_id)
    REFERENCES public.organization_users(organization_id, user_id) ON DELETE RESTRICT,
  ADD CONSTRAINT retell_agents_retell_agent_id_key UNIQUE (retell_agent_id),
  ADD CONSTRAINT retell_agents_retell_agent_id_not_blank
    CHECK (length(btrim(retell_agent_id)) BETWEEN 1 AND 256);

CREATE OR REPLACE FUNCTION public.enforce_provider_phone_number_contract()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.number := public.normalize_contact_phone(NEW.number);
  IF NEW.number IS NULL THEN
    RAISE EXCEPTION 'PROVIDER_PHONE_NUMBER_INVALID'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_provider_resource_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (NEW.organization_id IS DISTINCT FROM OLD.organization_id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.organization_membership_transfers AS transfer
      WHERE transfer.transaction_id = txid_current()
        AND transfer.state = 'processing'
        AND transfer.organization_id = OLD.organization_id
        AND transfer.organization_id = NEW.organization_id
        AND transfer.from_user_id = OLD.user_id
        AND transfer.to_user_id = NEW.user_id
    )
  THEN
    RAISE EXCEPTION 'PROVIDER_RESOURCE_TENANT_IDENTITY_IMMUTABLE'
      USING ERRCODE = '23514';
  END IF;

  IF TG_TABLE_NAME = 'phone_numbers' THEN
    IF NEW.number IS DISTINCT FROM OLD.number
      OR (OLD.retell_phone_id IS NOT NULL
        AND NEW.retell_phone_id IS DISTINCT FROM OLD.retell_phone_id)
      OR (OLD.twilio_sid IS NOT NULL
        AND NEW.twilio_sid IS DISTINCT FROM OLD.twilio_sid)
    THEN
      RAISE EXCEPTION 'PHONE_PROVIDER_IDENTITY_IMMUTABLE'
        USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'retell_agents' THEN
    IF NEW.retell_agent_id IS DISTINCT FROM OLD.retell_agent_id THEN
      RAISE EXCEPTION 'RETELL_AGENT_PROVIDER_IDENTITY_IMMUTABLE'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_provider_phone_number ON public.phone_numbers;
CREATE TRIGGER normalize_provider_phone_number
BEFORE INSERT OR UPDATE OF number ON public.phone_numbers
FOR EACH ROW EXECUTE FUNCTION public.enforce_provider_phone_number_contract();

DROP TRIGGER IF EXISTS provider_resource_identity_guard ON public.phone_numbers;
CREATE TRIGGER provider_resource_identity_guard
BEFORE UPDATE ON public.phone_numbers
FOR EACH ROW EXECUTE FUNCTION public.protect_provider_resource_identity();

DROP TRIGGER IF EXISTS provider_resource_identity_guard ON public.retell_agents;
CREATE TRIGGER provider_resource_identity_guard
BEFORE UPDATE ON public.retell_agents
FOR EACH ROW EXECUTE FUNCTION public.protect_provider_resource_identity();

ALTER TABLE public.phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retell_agents ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  relation_name text;
  policy_name text;
  column_list text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['phone_numbers', 'retell_agents']
  LOOP
    FOR policy_name IN
      SELECT policy.policyname
      FROM pg_policies AS policy
      WHERE policy.schemaname = 'public'
        AND policy.tablename = relation_name
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', policy_name, relation_name);
    END LOOP;

    SELECT string_agg(format('%I', attribute.attname), ', ' ORDER BY attribute.attnum)
    INTO column_list
    FROM pg_attribute AS attribute
    WHERE attribute.attrelid = format('public.%I', relation_name)::regclass
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped;

    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated',
      relation_name
    );
    IF column_list IS NOT NULL THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES (%s) ON TABLE public.%I FROM PUBLIC, anon, authenticated',
        column_list,
        relation_name
      );
    END IF;
  END LOOP;
END;
$$;

CREATE POLICY "Members view their tenant phone numbers"
  ON public.phone_numbers
  FOR SELECT
  TO authenticated
  USING (public.user_in_organization(auth.uid(), organization_id));

CREATE POLICY "Members view their tenant Retell agents"
  ON public.retell_agents
  FOR SELECT
  TO authenticated
  USING (public.user_in_organization(auth.uid(), organization_id));

GRANT SELECT ON TABLE public.phone_numbers TO authenticated;
GRANT SELECT ON TABLE public.retell_agents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.phone_numbers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.retell_agents TO service_role;

REVOKE ALL ON FUNCTION public.protect_provider_resource_identity()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_provider_phone_number_contract()
  FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.phone_numbers IS
  'Globally unique provider phone inventory. Browser clients are tenant-read-only; trusted service provisioning owns all mutations.';
COMMENT ON TABLE public.retell_agents IS
  'Globally unique Retell agent inventory bound to one tenant. Browser clients are tenant-read-only; trusted service synchronization owns all mutations.';
COMMENT ON FUNCTION public.protect_provider_resource_identity() IS
  'Prevents tenant rebinding outside certified transfer and prevents established provider identifiers from being overwritten.';

COMMIT;
