BEGIN;

-- A durable opt-out is a safety record, not ordinary tenant CRUD. Browsers
-- may add suppressions but cannot edit or remove them. Trusted provider
-- callbacks may upsert metadata while the suppression identity remains fixed.
ALTER TABLE public.dnc_list ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  policy_name text;
  column_list text;
BEGIN
  FOR policy_name IN
    SELECT policy.policyname
    FROM pg_policies AS policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename = 'dnc_list'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.dnc_list', policy_name);
  END LOOP;

  SELECT string_agg(format('%I', attribute.attname), ', ' ORDER BY attribute.attnum)
  INTO column_list
  FROM pg_attribute AS attribute
  WHERE attribute.attrelid = 'public.dnc_list'::regclass
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped;

  REVOKE ALL PRIVILEGES ON TABLE public.dnc_list
    FROM PUBLIC, anon, authenticated;
  IF column_list IS NOT NULL THEN
    EXECUTE format(
      'REVOKE ALL PRIVILEGES (%s) ON TABLE public.dnc_list FROM PUBLIC, anon, authenticated',
      column_list
    );
  END IF;
END;
$$;

CREATE POLICY "Members view tenant DNC suppressions"
  ON public.dnc_list
  FOR SELECT
  TO authenticated
  USING (public.user_in_organization(auth.uid(), organization_id));

CREATE POLICY "Members add tenant DNC suppressions"
  ON public.dnc_list
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.user_in_organization(auth.uid(), organization_id)
  );

GRANT SELECT, INSERT ON TABLE public.dnc_list TO authenticated;
REVOKE DELETE ON TABLE public.dnc_list FROM service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.dnc_list TO service_role;

CREATE OR REPLACE FUNCTION public.protect_dnc_suppression_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'DNC_SUPPRESSION_IRREVERSIBLE'
      USING ERRCODE = '23514',
      DETAIL = format('DNC suppression %s requires a future audited legal-release workflow', OLD.id);
  END IF;

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.phone_number IS DISTINCT FROM OLD.phone_number
    OR NEW.phone_number_normalized IS DISTINCT FROM OLD.phone_number_normalized
  THEN
    RAISE EXCEPTION 'DNC_SUPPRESSION_IDENTITY_IMMUTABLE'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dnc_suppression_identity_guard ON public.dnc_list;
CREATE TRIGGER dnc_suppression_identity_guard
BEFORE UPDATE OR DELETE ON public.dnc_list
FOR EACH ROW EXECUTE FUNCTION public.protect_dnc_suppression_identity();

REVOKE ALL ON FUNCTION public.protect_dnc_suppression_identity()
  FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.dnc_list IS
  'Durable tenant opt-out presence. Browsers may read and add suppressions, but update/delete is forbidden; trusted callbacks may update non-identity metadata only.';
COMMENT ON FUNCTION public.protect_dnc_suppression_identity() IS
  'Makes DNC presence irreversible at launch and prevents an upsert from moving an existing suppression to another phone, owner, or tenant.';

COMMIT;
