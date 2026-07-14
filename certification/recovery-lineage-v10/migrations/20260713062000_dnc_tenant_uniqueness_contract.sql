BEGIN;

ALTER TABLE public.dnc_list
  ADD COLUMN IF NOT EXISTS organization_id uuid
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS phone_number_normalized text;

-- Remove every drifted uniqueness definition that can collapse the same user
-- across tenants, plus any prior canonical candidate so the exact named
-- contract below is deterministic.
DO $$
DECLARE
  object_name text;
  key_columns text[];
BEGIN
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
    WHERE constraint_record.conrelid = 'public.dnc_list'::regclass
      AND constraint_record.contype = 'u'
  LOOP
    IF key_columns = ARRAY['phone_number', 'user_id']::text[]
      OR key_columns = ARRAY['phone_number_normalized', 'user_id']::text[]
      OR key_columns = ARRAY['organization_id', 'phone_number_normalized']::text[]
    THEN
      EXECUTE format('ALTER TABLE public.dnc_list DROP CONSTRAINT %I', object_name);
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
    WHERE index_record.indrelid = 'public.dnc_list'::regclass
      AND index_record.indisunique
      AND NOT index_record.indisprimary
      AND backing_constraint.oid IS NULL
  LOOP
    IF key_columns = ARRAY['phone_number', 'user_id']::text[]
      OR key_columns = ARRAY['phone_number_normalized', 'user_id']::text[]
      OR key_columns = ARRAY['organization_id', 'phone_number_normalized']::text[]
    THEN
      EXECUTE format('DROP INDEX public.%I', object_name);
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.repair_dnc_tenant_scope()
RETURNS TABLE (
  fanned_out_rows bigint,
  removed_legacy_rows bigint,
  removed_duplicate_rows bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  invalid_phone_count bigint;
  ownerless_legacy_count bigint;
BEGIN
  -- Serialize operational repair with all DNC writers. Presence is a safety
  -- control, so any ambiguous row stops the repair instead of being discarded.
  LOCK TABLE public.dnc_list IN SHARE ROW EXCLUSIVE MODE;

  UPDATE public.dnc_list
  SET phone_number_normalized = public.normalize_contact_phone(phone_number)
  WHERE phone_number_normalized IS DISTINCT FROM public.normalize_contact_phone(phone_number);

  SELECT count(*) INTO invalid_phone_count
  FROM public.dnc_list
  WHERE phone_number_normalized IS NULL;
  IF invalid_phone_count > 0 THEN
    RAISE EXCEPTION 'DNC_PHONE_REPAIR_REQUIRED'
      USING DETAIL = format('%s DNC suppressions do not have a valid normalized phone', invalid_phone_count),
      HINT = 'Repair every invalid phone before applying tenant DNC uniqueness.';
  END IF;

  SELECT count(*) INTO ownerless_legacy_count
  FROM public.dnc_list AS dnc
  WHERE dnc.organization_id IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.organization_users AS membership
      WHERE membership.user_id = dnc.user_id
    );
  IF ownerless_legacy_count > 0 THEN
    RAISE EXCEPTION 'DNC_TENANT_REPAIR_REQUIRED'
      USING DETAIL = format('%s legacy DNC suppressions have no current organization membership', ownerless_legacy_count),
      HINT = 'Restore an authoritative membership or assign every suppression explicitly; rows will not be hidden or deleted.';
  END IF;

  -- A legacy null-tenant suppression applies to every organization the owner
  -- currently belongs to. Clone the complete row shape so optional historical
  -- provenance columns are retained even when repo/live schemas differ.
  WITH fanout_target AS (
    SELECT DISTINCT ON (membership.organization_id, dnc.phone_number_normalized)
      dnc.id AS source_id,
      membership.organization_id AS target_organization_id
    FROM public.dnc_list AS dnc
    JOIN public.organization_users AS membership
      ON membership.user_id = dnc.user_id
    WHERE dnc.organization_id IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.dnc_list AS existing
        WHERE existing.organization_id = membership.organization_id
          AND existing.phone_number_normalized = dnc.phone_number_normalized
      )
    ORDER BY membership.organization_id,
      dnc.phone_number_normalized,
      dnc.added_at NULLS LAST,
      dnc.id
  )
  INSERT INTO public.dnc_list
  SELECT (
    jsonb_populate_record(
      NULL::public.dnc_list,
      (to_jsonb(source_row) - 'id' - 'organization_id')
        || jsonb_build_object(
          'id', gen_random_uuid(),
          'organization_id', fanout_target.target_organization_id
        )
    )
  ).*
  FROM fanout_target
  JOIN public.dnc_list AS source_row ON source_row.id = fanout_target.source_id;
  GET DIAGNOSTICS fanned_out_rows = ROW_COUNT;

  DELETE FROM public.dnc_list WHERE organization_id IS NULL;
  GET DIAGNOSTICS removed_legacy_rows = ROW_COUNT;

  WITH duplicate AS (
    SELECT id,
      row_number() OVER (
        PARTITION BY organization_id, phone_number_normalized
        ORDER BY added_at NULLS LAST, id
      ) AS duplicate_ordinal
    FROM public.dnc_list
  )
  DELETE FROM public.dnc_list AS dnc
  USING duplicate
  WHERE dnc.id = duplicate.id
    AND duplicate.duplicate_ordinal > 1;
  GET DIAGNOSTICS removed_duplicate_rows = ROW_COUNT;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.repair_dnc_tenant_scope()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.repair_dnc_tenant_scope() TO service_role;

SELECT * FROM public.repair_dnc_tenant_scope();

ALTER TABLE public.dnc_list
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN phone_number_normalized SET NOT NULL,
  ADD CONSTRAINT dnc_list_organization_phone_normalized_key
    UNIQUE (organization_id, phone_number_normalized);

CREATE OR REPLACE FUNCTION public.enforce_dnc_tenant_contract()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.phone_number_normalized := public.normalize_contact_phone(NEW.phone_number);
  IF NEW.phone_number_normalized IS NULL THEN
    RAISE EXCEPTION 'DNC phone cannot be normalized' USING ERRCODE = '22023';
  END IF;
  IF NEW.organization_id IS NULL OR NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'DNC organization and owner are required' USING ERRCODE = '23502';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_users AS membership
    WHERE membership.organization_id = NEW.organization_id
      AND membership.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'DNC owner is not a member of the target organization'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_dnc_normalized_phone ON public.dnc_list;
DROP TRIGGER IF EXISTS enforce_dnc_tenant_contract ON public.dnc_list;
CREATE TRIGGER enforce_dnc_tenant_contract
BEFORE INSERT OR UPDATE OF phone_number, phone_number_normalized, organization_id, user_id ON public.dnc_list
FOR EACH ROW EXECUTE FUNCTION public.enforce_dnc_tenant_contract();

COMMENT ON CONSTRAINT dnc_list_organization_phone_normalized_key ON public.dnc_list IS
  'One durable suppression per tenant and normalized destination; the same phone may be suppressed independently in another tenant.';
COMMENT ON FUNCTION public.repair_dnc_tenant_scope() IS
  'Service-only fail-closed repair: fans null-tenant legacy suppressions to every current membership and deduplicates tenant phone presence.';

COMMIT;
