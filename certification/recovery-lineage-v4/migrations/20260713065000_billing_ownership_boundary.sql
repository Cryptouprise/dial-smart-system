BEGIN;

-- Billing state is platform-owned. Tenant JWTs may read their own account and
-- ledger, but must never mint balance, release holds, delete audit rows, or
-- disable billing through the generic REST table API.
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_summaries ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  relation_name text;
  policy_name text;
  column_list text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'organizations',
    'organization_credits',
    'credit_transactions',
    'usage_summaries'
  ]
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

CREATE POLICY "Members view their organization"
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (public.user_in_organization(auth.uid(), id));

CREATE POLICY "Members view their organization credits"
  ON public.organization_credits
  FOR SELECT
  TO authenticated
  USING (public.user_in_organization(auth.uid(), organization_id));

CREATE POLICY "Members view their organization credit ledger"
  ON public.credit_transactions
  FOR SELECT
  TO authenticated
  USING (public.user_in_organization(auth.uid(), organization_id));

CREATE POLICY "Members view their organization usage"
  ON public.usage_summaries
  FOR SELECT
  TO authenticated
  USING (public.user_in_organization(auth.uid(), organization_id));

GRANT SELECT ON TABLE public.organizations TO authenticated;
GRANT SELECT ON TABLE public.organization_credits TO authenticated;
GRANT SELECT ON TABLE public.credit_transactions TO authenticated;
GRANT SELECT ON TABLE public.usage_summaries TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organizations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organization_credits TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.credit_transactions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.usage_summaries TO service_role;

-- The status view previously ran with its owner's privileges, which can bypass
-- base-table RLS. Force invoker semantics and expose it only to authenticated
-- tenant reads and trusted service workers.
ALTER VIEW public.organization_credit_status SET (security_invoker = true);
REVOKE ALL PRIVILEGES ON TABLE public.organization_credit_status
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.organization_credit_status
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.protect_organization_credit_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  ledger_writer boolean := current_setting('app.credit_ledger_writer', true)
    = 'credit-ledger-v1';
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (
      COALESCE(NEW.balance_cents, 0) <> 0
      OR COALESCE(NEW.reserved_balance_cents, 0) <> 0
    ) AND NOT ledger_writer THEN
      RAISE EXCEPTION 'CREDIT_BALANCE_LEDGER_OWNERSHIP_REQUIRED'
        USING ERRCODE = '42501',
        HINT = 'Initialize at zero and use a service-only canonical ledger RPC.';
    END IF;
    RETURN NEW;
  END IF;

  IF (
    NEW.balance_cents IS DISTINCT FROM OLD.balance_cents
    OR NEW.reserved_balance_cents IS DISTINCT FROM OLD.reserved_balance_cents
  ) AND NOT ledger_writer THEN
    RAISE EXCEPTION 'CREDIT_BALANCE_LEDGER_OWNERSHIP_REQUIRED'
      USING ERRCODE = '42501',
      DETAIL = format(
        'organization %s balance/hold changed outside a canonical ledger RPC',
        OLD.organization_id
      );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organization_credit_balance_owner
  ON public.organization_credits;
CREATE TRIGGER organization_credit_balance_owner
BEFORE INSERT OR UPDATE OF balance_cents, reserved_balance_cents
ON public.organization_credits
FOR EACH ROW EXECUTE FUNCTION public.protect_organization_credit_balance();

REVOKE ALL ON FUNCTION public.protect_organization_credit_balance()
  FROM PUBLIC, anon, authenticated;

COMMENT ON COLUMN public.organizations.billing_enabled IS
  'Platform-owned billing switch. Browser roles are read-only; only trusted service provisioning may change it.';
COMMENT ON COLUMN public.organization_credits.balance_cents IS
  'Canonical ledger-owned balance. Mutations outside service-only ledger RPCs are rejected by trigger.';
COMMENT ON COLUMN public.organization_credits.reserved_balance_cents IS
  'Canonical ledger-owned active exposure. Mutations outside reservation/finalization RPCs are rejected by trigger.';
COMMENT ON VIEW public.organization_credit_status IS
  'Tenant RLS-invoker billing status view; never executes with the view owner''s cross-tenant privileges.';

COMMIT;
