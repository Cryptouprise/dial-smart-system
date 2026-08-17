BEGIN;

-- The application and dispatch billing path both depend on these relations,
-- but they were previously present only in the live-generated TypeScript
-- shape.  Make the pricing graph reproducible on a fresh database and keep
-- customer-facing price decisions behind trusted service writes.
CREATE TABLE IF NOT EXISTS public.pricing_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_type text NOT NULL,
  tier_name text NOT NULL,
  display_name text NOT NULL,
  base_cost_per_min_cents numeric(12, 4) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  retell_agent_id text NOT NULL,
  agent_name text,
  llm_model text,
  voice_provider text,
  has_knowledge_base boolean,
  base_cost_per_min_cents numeric(12, 4),
  markup_cents numeric(12, 4),
  markup_percentage numeric(12, 4),
  markup_type text,
  customer_price_per_min_cents numeric(12, 4),
  is_active boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Converge a live table that predates the repo contract without silently
-- inventing price data. Existing invalid or ambiguous rows stop deployment.
ALTER TABLE public.pricing_tiers
  ADD COLUMN IF NOT EXISTS tier_type text,
  ADD COLUMN IF NOT EXISTS tier_name text,
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS base_cost_per_min_cents numeric(12, 4),
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.agent_pricing
  ADD COLUMN IF NOT EXISTS organization_id uuid,
  ADD COLUMN IF NOT EXISTS retell_agent_id text,
  ADD COLUMN IF NOT EXISTS agent_name text,
  ADD COLUMN IF NOT EXISTS llm_model text,
  ADD COLUMN IF NOT EXISTS voice_provider text,
  ADD COLUMN IF NOT EXISTS has_knowledge_base boolean,
  ADD COLUMN IF NOT EXISTS base_cost_per_min_cents numeric(12, 4),
  ADD COLUMN IF NOT EXISTS markup_cents numeric(12, 4),
  ADD COLUMN IF NOT EXISTS markup_percentage numeric(12, 4),
  ADD COLUMN IF NOT EXISTS markup_type text,
  ADD COLUMN IF NOT EXISTS customer_price_per_min_cents numeric(12, 4),
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE public.pricing_tiers
SET is_active = COALESCE(is_active, true),
    created_at = COALESCE(created_at, now()),
    updated_at = COALESCE(updated_at, created_at, now())
WHERE is_active IS NULL OR created_at IS NULL OR updated_at IS NULL;

UPDATE public.agent_pricing
SET is_active = COALESCE(is_active, true),
    created_at = COALESCE(created_at, now()),
    updated_at = COALESCE(updated_at, created_at, now())
WHERE is_active IS NULL OR created_at IS NULL OR updated_at IS NULL;

DO $$
DECLARE
  invalid_tier_count bigint;
  invalid_agent_count bigint;
  duplicate_count bigint;
BEGIN
  SELECT count(*) INTO invalid_tier_count
  FROM public.pricing_tiers
  WHERE tier_type IS NULL OR btrim(tier_type) = ''
    OR tier_name IS NULL OR btrim(tier_name) = ''
    OR display_name IS NULL OR btrim(display_name) = ''
    OR base_cost_per_min_cents IS NULL
    OR base_cost_per_min_cents < 0;
  IF invalid_tier_count > 0 THEN
    RAISE EXCEPTION 'PRICING_TIER_REPAIR_REQUIRED'
      USING DETAIL = format('%s pricing tier rows have missing or invalid price identity', invalid_tier_count);
  END IF;

  SELECT count(*) INTO duplicate_count
  FROM (
    SELECT tier_type, tier_name
    FROM public.pricing_tiers
    GROUP BY tier_type, tier_name
    HAVING count(*) > 1
  ) AS duplicate;
  IF duplicate_count > 0 THEN
    RAISE EXCEPTION 'PRICING_TIER_REPAIR_REQUIRED'
      USING DETAIL = format('%s duplicated pricing tier identities require explicit reconciliation', duplicate_count);
  END IF;

  SELECT count(*) INTO invalid_agent_count
  FROM public.agent_pricing AS pricing
  LEFT JOIN public.organizations AS organization
    ON organization.id = pricing.organization_id
  WHERE pricing.organization_id IS NULL
    OR organization.id IS NULL
    OR pricing.retell_agent_id IS NULL
    OR btrim(pricing.retell_agent_id) = ''
    OR (pricing.base_cost_per_min_cents IS NOT NULL AND pricing.base_cost_per_min_cents < 0)
    OR (pricing.markup_cents IS NOT NULL AND pricing.markup_cents < 0)
    OR (pricing.markup_percentage IS NOT NULL AND pricing.markup_percentage < 0)
    OR (pricing.customer_price_per_min_cents IS NOT NULL AND pricing.customer_price_per_min_cents <= 0)
    OR (pricing.is_active AND pricing.customer_price_per_min_cents IS NULL)
    OR (
      pricing.customer_price_per_min_cents IS NOT NULL
      AND pricing.base_cost_per_min_cents IS NOT NULL
      AND pricing.customer_price_per_min_cents < pricing.base_cost_per_min_cents
    );
  IF invalid_agent_count > 0 THEN
    RAISE EXCEPTION 'AGENT_PRICING_REPAIR_REQUIRED'
      USING DETAIL = format('%s agent pricing rows are unsafe or have no authoritative tenant', invalid_agent_count);
  END IF;

  SELECT count(*) INTO duplicate_count
  FROM (
    SELECT organization_id, retell_agent_id
    FROM public.agent_pricing
    GROUP BY organization_id, retell_agent_id
    HAVING count(*) > 1
  ) AS duplicate;
  IF duplicate_count > 0 THEN
    RAISE EXCEPTION 'AGENT_PRICING_REPAIR_REQUIRED'
      USING DETAIL = format('%s duplicated tenant/agent prices require explicit reconciliation', duplicate_count);
  END IF;
END;
$$;

-- Remove drifted uniqueness definitions before installing the canonical
-- tenant keys. In particular, a globally unique Retell agent identifier would
-- incorrectly couple otherwise independent organizations.
DO $$
DECLARE
  relation_name text;
  object_name text;
  key_columns text[];
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['pricing_tiers', 'agent_pricing']
  LOOP
    FOR object_name, key_columns IN
      SELECT constraint_record.conname,
        (
          SELECT array_agg(attribute.attname ORDER BY attribute.attname)
          FROM unnest(constraint_record.conkey) AS key(attnum)
          JOIN pg_attribute AS attribute
            ON attribute.attrelid = constraint_record.conrelid
           AND attribute.attnum = key.attnum
        )
      FROM pg_constraint AS constraint_record
      WHERE constraint_record.conrelid = format('public.%I', relation_name)::regclass
        AND constraint_record.contype = 'u'
    LOOP
      IF (relation_name = 'pricing_tiers'
          AND key_columns = ARRAY['tier_name', 'tier_type']::text[])
        OR (relation_name = 'agent_pricing'
          AND key_columns IN (
            ARRAY['retell_agent_id']::text[],
            ARRAY['organization_id', 'retell_agent_id']::text[]
          ))
      THEN
        EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', relation_name, object_name);
      END IF;
    END LOOP;

    FOR object_name, key_columns IN
      SELECT index_relation.relname,
        (
          SELECT array_agg(attribute.attname ORDER BY attribute.attname)
          FROM unnest(index_record.indkey::smallint[]) AS key(attnum)
          JOIN pg_attribute AS attribute
            ON attribute.attrelid = index_record.indrelid
           AND attribute.attnum = key.attnum
        )
      FROM pg_index AS index_record
      JOIN pg_class AS index_relation ON index_relation.oid = index_record.indexrelid
      LEFT JOIN pg_constraint AS backing_constraint
        ON backing_constraint.conindid = index_record.indexrelid
      WHERE index_record.indrelid = format('public.%I', relation_name)::regclass
        AND index_record.indisunique
        AND NOT index_record.indisprimary
        AND backing_constraint.oid IS NULL
    LOOP
      IF (relation_name = 'pricing_tiers'
          AND key_columns = ARRAY['tier_name', 'tier_type']::text[])
        OR (relation_name = 'agent_pricing'
          AND key_columns IN (
            ARRAY['retell_agent_id']::text[],
            ARRAY['organization_id', 'retell_agent_id']::text[]
          ))
      THEN
        EXECUTE format('DROP INDEX public.%I', object_name);
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

ALTER TABLE public.pricing_tiers
  ALTER COLUMN tier_type SET NOT NULL,
  ALTER COLUMN tier_name SET NOT NULL,
  ALTER COLUMN display_name SET NOT NULL,
  ALTER COLUMN base_cost_per_min_cents SET NOT NULL,
  ALTER COLUMN is_active SET DEFAULT true,
  ALTER COLUMN is_active SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL,
  DROP CONSTRAINT IF EXISTS pricing_tiers_tier_type_name_key,
  DROP CONSTRAINT IF EXISTS pricing_tiers_identity_check,
  DROP CONSTRAINT IF EXISTS pricing_tiers_cost_check,
  ADD CONSTRAINT pricing_tiers_tier_type_name_key UNIQUE (tier_type, tier_name),
  ADD CONSTRAINT pricing_tiers_identity_check CHECK (
    length(btrim(tier_type)) BETWEEN 1 AND 64
    AND length(btrim(tier_name)) BETWEEN 1 AND 128
    AND length(btrim(display_name)) BETWEEN 1 AND 256
  ),
  ADD CONSTRAINT pricing_tiers_cost_check CHECK (base_cost_per_min_cents >= 0);

ALTER TABLE public.agent_pricing
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN retell_agent_id SET NOT NULL,
  ALTER COLUMN is_active SET DEFAULT true,
  ALTER COLUMN is_active SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL,
  DROP CONSTRAINT IF EXISTS agent_pricing_organization_id_fkey,
  DROP CONSTRAINT IF EXISTS agent_pricing_organization_retell_agent_key,
  DROP CONSTRAINT IF EXISTS agent_pricing_identity_check,
  DROP CONSTRAINT IF EXISTS agent_pricing_cost_check,
  DROP CONSTRAINT IF EXISTS agent_pricing_active_price_check,
  DROP CONSTRAINT IF EXISTS agent_pricing_nonnegative_margin_check,
  ADD CONSTRAINT agent_pricing_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD CONSTRAINT agent_pricing_organization_retell_agent_key
    UNIQUE (organization_id, retell_agent_id),
  ADD CONSTRAINT agent_pricing_identity_check CHECK (
    length(btrim(retell_agent_id)) BETWEEN 1 AND 256
  ),
  ADD CONSTRAINT agent_pricing_cost_check CHECK (
    (base_cost_per_min_cents IS NULL OR base_cost_per_min_cents >= 0)
    AND (markup_cents IS NULL OR markup_cents >= 0)
    AND (markup_percentage IS NULL OR markup_percentage >= 0)
    AND (customer_price_per_min_cents IS NULL OR customer_price_per_min_cents > 0)
  ),
  ADD CONSTRAINT agent_pricing_active_price_check CHECK (
    NOT is_active OR customer_price_per_min_cents IS NOT NULL
  ),
  ADD CONSTRAINT agent_pricing_nonnegative_margin_check CHECK (
    customer_price_per_min_cents IS NULL
    OR base_cost_per_min_cents IS NULL
    OR customer_price_per_min_cents >= base_cost_per_min_cents
  );

DROP TRIGGER IF EXISTS set_pricing_tiers_updated_at ON public.pricing_tiers;
CREATE TRIGGER set_pricing_tiers_updated_at
BEFORE UPDATE ON public.pricing_tiers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_agent_pricing_updated_at ON public.agent_pricing;
CREATE TRIGGER set_agent_pricing_updated_at
BEFORE UPDATE ON public.agent_pricing
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.pricing_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_pricing ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  relation_name text;
  policy_name text;
  column_list text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['pricing_tiers', 'agent_pricing']
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

CREATE POLICY "Authenticated users view active pricing tiers"
  ON public.pricing_tiers
  FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Members view their tenant agent pricing"
  ON public.agent_pricing
  FOR SELECT
  TO authenticated
  USING (public.user_in_organization(auth.uid(), organization_id));

GRANT SELECT ON TABLE public.pricing_tiers TO authenticated;
GRANT SELECT ON TABLE public.agent_pricing TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pricing_tiers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.agent_pricing TO service_role;

COMMENT ON TABLE public.pricing_tiers IS
  'Platform-owned global provider-cost catalog. Authenticated clients may read active tiers; only trusted service provisioning may write them.';
COMMENT ON TABLE public.agent_pricing IS
  'Tenant-bound dispatch-time customer pricing. Browser clients are read-only because these rows directly control billable reservations.';
COMMENT ON CONSTRAINT agent_pricing_organization_retell_agent_key ON public.agent_pricing IS
  'A Retell agent has one active pricing identity per tenant; the same provider agent identifier may exist in independent tenants.';

COMMIT;
