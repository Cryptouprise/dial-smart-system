BEGIN;

-- Repo history originally created credit_transactions.type while the live
-- ledger and every current caller use transaction_type. Converge either shape
-- without guessing or discarding audit evidence.
DO $$
DECLARE
  has_legacy_type boolean;
  has_transaction_type boolean;
  conflict_count bigint;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'credit_transactions'
      AND column_name = 'type'
  ) INTO has_legacy_type;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'credit_transactions'
      AND column_name = 'transaction_type'
  ) INTO has_transaction_type;

  IF has_legacy_type AND NOT has_transaction_type THEN
    ALTER TABLE public.credit_transactions RENAME COLUMN type TO transaction_type;
  ELSIF has_legacy_type AND has_transaction_type THEN
    SELECT count(*) INTO conflict_count
    FROM public.credit_transactions
    WHERE type IS NOT NULL
      AND transaction_type IS NOT NULL
      AND type IS DISTINCT FROM transaction_type;
    IF conflict_count > 0 THEN
      RAISE EXCEPTION 'CREDIT_TRANSACTION_TYPE_REPAIR_REQUIRED'
        USING DETAIL = format('%s ledger rows have conflicting type and transaction_type values', conflict_count),
        HINT = 'Resolve every conflicting audit row before rerunning this migration.';
    END IF;

    UPDATE public.credit_transactions
    SET transaction_type = COALESCE(transaction_type, type)
    WHERE transaction_type IS NULL;
    ALTER TABLE public.credit_transactions DROP COLUMN type;
  ELSIF NOT has_transaction_type THEN
    RAISE EXCEPTION 'CREDIT_TRANSACTION_TYPE_REPAIR_REQUIRED'
      USING DETAIL = 'credit_transactions has neither type nor transaction_type',
      HINT = 'Restore the ledger discriminator before applying the billing contract.';
  END IF;
END;
$$;

ALTER TABLE public.credit_transactions
  ADD COLUMN IF NOT EXISTS retell_call_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_id text,
  ADD COLUMN IF NOT EXISTS stripe_invoice_id text,
  ADD COLUMN IF NOT EXISTS minutes_used numeric(10,4),
  ADD COLUMN IF NOT EXISTS retell_cost_cents integer,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- Preserve old Stripe intent provenance before removing the drifted column.
DO $$
DECLARE
  provenance_conflicts bigint;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'credit_transactions'
      AND column_name = 'stripe_payment_intent_id'
  ) THEN
    SELECT count(*) INTO provenance_conflicts
    FROM public.credit_transactions
    WHERE stripe_payment_intent_id IS NOT NULL
      AND stripe_payment_id IS NOT NULL
      AND stripe_payment_intent_id IS DISTINCT FROM stripe_payment_id;
    IF provenance_conflicts > 0 THEN
      RAISE EXCEPTION 'CREDIT_PAYMENT_PROVENANCE_REPAIR_REQUIRED'
        USING DETAIL = format('%s ledger rows have conflicting Stripe payment identities', provenance_conflicts);
    END IF;

    UPDATE public.credit_transactions
    SET stripe_payment_id = COALESCE(stripe_payment_id, stripe_payment_intent_id)
    WHERE stripe_payment_intent_id IS NOT NULL;
    ALTER TABLE public.credit_transactions DROP COLUMN stripe_payment_intent_id;
  END IF;
END;
$$;

-- Lift Retell identity out of legacy metadata while retaining the complete
-- metadata object for audit and future pricing evidence.
UPDATE public.credit_transactions
SET retell_call_id = NULLIF(metadata->>'retell_call_id', '')
WHERE retell_call_id IS NULL
  AND metadata IS NOT NULL
  AND NULLIF(metadata->>'retell_call_id', '') IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.credit_transactions
    WHERE transaction_type IS NULL OR btrim(transaction_type) = ''
  ) THEN
    RAISE EXCEPTION 'CREDIT_TRANSACTION_TYPE_REPAIR_REQUIRED'
      USING HINT = 'Every immutable ledger row needs a non-empty transaction_type.';
  END IF;
END;
$$;

DO $$
DECLARE
  cross_tenant_call_transactions bigint;
BEGIN
  SELECT count(*) INTO cross_tenant_call_transactions
  FROM public.credit_transactions AS transaction
  JOIN public.call_logs AS call_log ON call_log.id = transaction.call_log_id
  WHERE transaction.organization_id IS DISTINCT FROM call_log.organization_id;
  IF cross_tenant_call_transactions > 0 THEN
    RAISE EXCEPTION 'CREDIT_CALL_TENANT_REPAIR_REQUIRED'
      USING DETAIL = format(
        '%s ledger rows point at a call log in another organization',
        cross_tenant_call_transactions
      );
  END IF;
END;
$$;

ALTER TABLE public.credit_transactions
  DROP CONSTRAINT IF EXISTS credit_transactions_call_log_id_fkey,
  ADD CONSTRAINT credit_transactions_call_log_id_fkey
    FOREIGN KEY (call_log_id) REFERENCES public.call_logs(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.enforce_credit_transaction_call_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  call_organization_id uuid;
BEGIN
  IF NEW.call_log_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT call_log.organization_id INTO call_organization_id
  FROM public.call_logs AS call_log
  WHERE call_log.id = NEW.call_log_id;
  IF call_organization_id IS NULL
    OR call_organization_id IS DISTINCT FROM NEW.organization_id
  THEN
    RAISE EXCEPTION 'credit transaction and call log must share one organization'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS credit_transaction_call_same_tenant
  ON public.credit_transactions;
CREATE TRIGGER credit_transaction_call_same_tenant
BEFORE INSERT OR UPDATE OF organization_id, call_log_id
ON public.credit_transactions
FOR EACH ROW EXECUTE FUNCTION public.enforce_credit_transaction_call_tenant();

ALTER TABLE public.credit_transactions
  ALTER COLUMN transaction_type SET NOT NULL,
  DROP CONSTRAINT IF EXISTS credit_transactions_type_check,
  DROP CONSTRAINT IF EXISTS credit_transactions_transaction_type_check,
  ADD CONSTRAINT credit_transactions_transaction_type_check
    CHECK (length(btrim(transaction_type)) BETWEEN 1 AND 64);

DROP INDEX IF EXISTS public.idx_credit_tx_type;
CREATE INDEX IF NOT EXISTS idx_credit_tx_transaction_type
  ON public.credit_transactions(transaction_type);
DROP INDEX IF EXISTS public.idx_credit_tx_reservation_lookup;
CREATE INDEX IF NOT EXISTS idx_credit_tx_reservation_lookup
  ON public.credit_transactions(organization_id, call_log_id, transaction_type)
  WHERE transaction_type = 'reservation';
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_tx_idempotency
  ON public.credit_transactions(idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_tx_stripe_payment_id
  ON public.credit_transactions(stripe_payment_id)
  WHERE stripe_payment_id IS NOT NULL;

-- Never guess dispatch-time price for an already in-flight reservation. A
-- deployment with an ambiguous active hold must stop so the operator can drain
-- or explicitly reconcile it before the canonical finalizer is installed.
DO $$
DECLARE
  ambiguous_active_reservations bigint;
BEGIN
  SELECT count(*) INTO ambiguous_active_reservations
  FROM public.credit_transactions AS reservation
  WHERE reservation.transaction_type = 'reservation'
    AND NOT EXISTS (
      SELECT 1
      FROM public.credit_transactions AS release
      WHERE release.organization_id = reservation.organization_id
        AND release.transaction_type = 'reservation_release'
        AND release.metadata->>'reservation_id' = reservation.id::text
    )
    AND (
      COALESCE(reservation.metadata->>'customer_rate_cents', '') !~ '^[1-9][0-9]*$'
      OR COALESCE(reservation.metadata->>'provider_rate_cents', '') !~ '^[0-9]+$'
      OR CASE
        WHEN COALESCE(reservation.metadata->>'max_exposure_cents', '') ~ '^[1-9][0-9]*$'
          THEN (reservation.metadata->>'max_exposure_cents')::bigint <> abs(reservation.amount_cents)::bigint
        ELSE true
      END
      OR NULLIF(reservation.metadata->>'pricing_policy_version', '') IS NULL
    );
  IF ambiguous_active_reservations > 0 THEN
    RAISE EXCEPTION 'CREDIT_RESERVATION_SNAPSHOT_REPAIR_REQUIRED'
      USING DETAIL = format('%s active credit reservations lack immutable dispatch-time pricing evidence', ambiguous_active_reservations),
      HINT = 'Drain or explicitly reconcile every active legacy reservation before applying this migration.';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.credit_transactions'::regclass
      AND conname = 'credit_transactions_created_by_fkey'
  ) THEN
    ALTER TABLE public.credit_transactions
      ADD CONSTRAINT credit_transactions_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END;
$$;

-- Reassert the reservation columns that exist in repo history but were absent
-- from the live-generated shape. The balance constraint now actually honors
-- the explicit negative-balance configuration.
ALTER TABLE public.organization_credits
  ADD COLUMN IF NOT EXISTS reserved_balance_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS allow_negative_balance boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS negative_balance_limit_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_payment_method_id text;

ALTER TABLE public.organization_credits
  DROP CONSTRAINT IF EXISTS positive_balance,
  DROP CONSTRAINT IF EXISTS organization_credits_balance_contract,
  DROP CONSTRAINT IF EXISTS organization_credits_reserved_balance_check,
  DROP CONSTRAINT IF EXISTS organization_credits_negative_limit_check,
  ADD CONSTRAINT organization_credits_balance_contract CHECK (
    balance_cents >= CASE
      WHEN allow_negative_balance THEN -negative_balance_limit_cents
      ELSE 0
    END
  ),
  ADD CONSTRAINT organization_credits_reserved_balance_check
    CHECK (reserved_balance_cents >= 0),
  ADD CONSTRAINT organization_credits_negative_limit_check
    CHECK (negative_balance_limit_cents >= 0);

-- Live drift also omitted the call-level settlement markers used by the
-- canonical finalizer. Reassert them before compiling that function.
ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS billed_cost_cents integer,
  ADD COLUMN IF NOT EXISTS credit_deducted boolean NOT NULL DEFAULT false;

-- Return contracts drifted between live and repo functions, so replace each
-- identity explicitly instead of relying on CREATE OR REPLACE to change it.
DROP FUNCTION IF EXISTS public.check_credit_balance(uuid, numeric);
DROP FUNCTION IF EXISTS public.reserve_credits(uuid, integer, uuid, text);
DROP FUNCTION IF EXISTS public.reserve_credits(uuid, integer, uuid, text, text);
DROP FUNCTION IF EXISTS public.reserve_credits(uuid, integer, uuid, text, text, integer);
DROP FUNCTION IF EXISTS public.reserve_credits(uuid, integer, uuid, text, text, text);
DROP FUNCTION IF EXISTS public.reserve_credits(uuid, integer, uuid, text, text, integer, text);
DROP FUNCTION IF EXISTS public.finalize_call_cost(uuid, uuid, text, numeric, integer, text);
DROP FUNCTION IF EXISTS public.finalize_call_cost(uuid, uuid, text, numeric, integer, text, text);
DROP FUNCTION IF EXISTS public.add_credits(uuid, integer, text, text, text);
DROP FUNCTION IF EXISTS public.add_credits(uuid, integer, text, text, text, uuid);
DROP FUNCTION IF EXISTS public.add_credits(uuid, integer, text, text, text, uuid, text);
DROP FUNCTION IF EXISTS public.add_credits(uuid, integer, text, text, text, text);

CREATE FUNCTION public.check_credit_balance(
  p_organization_id uuid,
  p_minutes_needed numeric DEFAULT 1
)
RETURNS TABLE (
  has_balance boolean,
  current_balance_cents integer,
  reserved_balance_cents integer,
  available_balance_cents integer,
  cost_per_minute_cents integer,
  required_cents integer,
  billing_enabled boolean,
  allow_negative boolean,
  negative_limit_cents integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  billing_active boolean;
  credits public.organization_credits%ROWTYPE;
  required_amount integer;
  available_amount integer;
BEGIN
  IF p_organization_id IS NULL OR p_minutes_needed IS NULL OR p_minutes_needed < 0 THEN
    RAISE EXCEPTION 'organization and a non-negative minutes estimate are required';
  END IF;

  SELECT organization.billing_enabled
  INTO billing_active
  FROM public.organizations AS organization
  WHERE organization.id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization does not exist';
  END IF;

  IF NOT COALESCE(billing_active, false) THEN
    RETURN QUERY SELECT true, 0, 0, 0, 15, 0, false, false, 0;
    RETURN;
  END IF;

  SELECT * INTO credits
  FROM public.organization_credits
  WHERE organization_id = p_organization_id;
  IF credits.id IS NULL THEN
    RETURN QUERY SELECT false, 0, 0, 0, 15, 0, true, false, 0;
    RETURN;
  END IF;

  required_amount := ceil(p_minutes_needed * credits.cost_per_minute_cents)::integer;
  available_amount := credits.balance_cents - credits.reserved_balance_cents;
  RETURN QUERY SELECT
    available_amount - required_amount >= CASE
      WHEN credits.allow_negative_balance THEN -credits.negative_balance_limit_cents
      ELSE 0
    END,
    credits.balance_cents,
    credits.reserved_balance_cents,
    available_amount,
    credits.cost_per_minute_cents,
    required_amount,
    true,
    credits.allow_negative_balance,
    credits.negative_balance_limit_cents;
END;
$$;

CREATE FUNCTION public.reserve_credits(
  p_organization_id uuid,
  p_amount_cents integer,
  p_call_log_id uuid DEFAULT NULL,
  p_retell_call_id text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_customer_rate_cents integer DEFAULT NULL,
  p_agent_id text DEFAULT NULL
)
RETURNS TABLE (
  success boolean,
  available_balance_cents integer,
  reserved_balance_cents integer,
  reservation_id uuid,
  error_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  billing_active boolean;
  credits public.organization_credits%ROWTYPE;
  existing public.credit_transactions%ROWTYPE;
  available_amount integer;
  v_idempotency_key text;
  inserted_id uuid;
  customer_rate integer;
  provider_rate integer;
  v_agent_id text;
  pricing_policy_version constant text := 'credit-reservation-v1';
BEGIN
  PERFORM set_config('app.credit_ledger_writer', 'credit-ledger-v1', true);
  IF p_organization_id IS NULL OR p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'organization and a positive integer reservation are required';
  END IF;
  IF p_call_log_id IS NULL AND NULLIF(btrim(p_retell_call_id), '') IS NULL
    AND NULLIF(btrim(p_idempotency_key), '') IS NULL
  THEN
    RAISE EXCEPTION 'reservation requires a call log, Retell call, or explicit idempotency key';
  END IF;
  IF p_customer_rate_cents IS NOT NULL AND p_customer_rate_cents <= 0 THEN
    RAISE EXCEPTION 'explicit customer rate must be a positive integer';
  END IF;
  v_agent_id := NULLIF(btrim(p_agent_id), '');

  IF p_call_log_id IS NOT NULL THEN
    PERFORM 1
    FROM public.call_logs AS call_log
    WHERE call_log.id = p_call_log_id
      AND call_log.organization_id = p_organization_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'credit reservation call log belongs to a different organization';
    END IF;
  END IF;

  SELECT organization.billing_enabled
  INTO billing_active
  FROM public.organizations AS organization
  WHERE organization.id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization does not exist';
  END IF;
  IF NOT COALESCE(billing_active, false) THEN
    RETURN QUERY SELECT true, 0, 0, NULL::uuid, 'Billing is disabled; no reservation required'::text;
    RETURN;
  END IF;

  SELECT * INTO credits
  FROM public.organization_credits
  WHERE organization_id = p_organization_id
  FOR UPDATE;
  IF credits.id IS NULL THEN
    RETURN QUERY SELECT false, 0, 0, NULL::uuid, 'No credit account exists for the organization'::text;
    RETURN;
  END IF;

  v_idempotency_key := COALESCE(
    NULLIF(btrim(p_idempotency_key), ''),
    CASE WHEN NULLIF(btrim(p_retell_call_id), '') IS NOT NULL
      THEN 'reserve:retell:' || btrim(p_retell_call_id) END,
    CASE WHEN p_call_log_id IS NOT NULL THEN 'reserve:call:' || p_call_log_id::text END
  );

  SELECT * INTO existing
  FROM public.credit_transactions
  WHERE credit_transactions.idempotency_key = v_idempotency_key;
  IF existing.id IS NOT NULL THEN
    IF existing.organization_id IS DISTINCT FROM p_organization_id
      OR existing.transaction_type <> 'reservation'
      OR existing.amount_cents <> -p_amount_cents
      OR existing.call_log_id IS DISTINCT FROM p_call_log_id
      OR existing.retell_call_id IS DISTINCT FROM NULLIF(btrim(p_retell_call_id), '')
      OR (
        p_customer_rate_cents IS NOT NULL
        AND COALESCE(existing.metadata->>'customer_rate_cents', '') <> p_customer_rate_cents::text
      )
      OR (
        v_agent_id IS NOT NULL
        AND existing.metadata->>'agent_id' IS DISTINCT FROM v_agent_id
      )
    THEN
      RAISE EXCEPTION 'CREDIT_IDEMPOTENCY_PAYLOAD_MISMATCH' USING ERRCODE = '23505';
    END IF;
    available_amount := credits.balance_cents - credits.reserved_balance_cents;
    RETURN QUERY SELECT true, available_amount, credits.reserved_balance_cents,
      existing.id, 'Already reserved (idempotent)'::text;
    RETURN;
  END IF;

  customer_rate := p_customer_rate_cents;
  IF customer_rate IS NULL
    AND v_agent_id IS NOT NULL
    AND to_regclass('public.agent_pricing') IS NOT NULL
  THEN
    EXECUTE $pricing$
      SELECT customer_price_per_min_cents::integer
      FROM public.agent_pricing
      WHERE organization_id = $1
        AND retell_agent_id = $2
        AND is_active = true
      ORDER BY updated_at DESC NULLS LAST, id
      LIMIT 1
    $pricing$
    INTO customer_rate
    USING p_organization_id, v_agent_id;
  END IF;
  customer_rate := COALESCE(customer_rate, credits.cost_per_minute_cents);
  provider_rate := credits.retell_cost_per_minute_cents;
  IF customer_rate <= 0 OR provider_rate < 0 THEN
    RAISE EXCEPTION 'dispatch-time customer/provider pricing is invalid';
  END IF;

  available_amount := credits.balance_cents - credits.reserved_balance_cents;
  IF available_amount - p_amount_cents < (CASE
      WHEN credits.allow_negative_balance THEN -credits.negative_balance_limit_cents
      ELSE 0
    END
  )
  THEN
    RETURN QUERY SELECT false, available_amount, credits.reserved_balance_cents,
      NULL::uuid, 'Insufficient available credits'::text;
    RETURN;
  END IF;

  UPDATE public.organization_credits
  SET reserved_balance_cents = public.organization_credits.reserved_balance_cents + p_amount_cents,
      updated_at = now()
  WHERE id = credits.id;

  INSERT INTO public.credit_transactions (
    organization_id, transaction_type, amount_cents,
    balance_before_cents, balance_after_cents,
    call_log_id, retell_call_id, description, idempotency_key, metadata
  ) VALUES (
    p_organization_id, 'reservation', -p_amount_cents,
    credits.balance_cents, credits.balance_cents,
    p_call_log_id, NULLIF(btrim(p_retell_call_id), ''),
    format('Credit reservation: %s cents', p_amount_cents),
    v_idempotency_key,
    jsonb_build_object(
      'reserved_cents', p_amount_cents,
      'max_exposure_cents', p_amount_cents,
      'customer_rate_cents', customer_rate,
      'provider_rate_cents', provider_rate,
      'pricing_policy_version', pricing_policy_version,
      'agent_id', v_agent_id
    )
  ) RETURNING id INTO inserted_id;

  RETURN QUERY SELECT true,
    available_amount - p_amount_cents,
    credits.reserved_balance_cents + p_amount_cents,
    inserted_id,
    NULL::text;
END;
$$;

CREATE FUNCTION public.finalize_call_cost(
  p_organization_id uuid,
  p_call_log_id uuid DEFAULT NULL,
  p_retell_call_id text DEFAULT NULL,
  p_actual_minutes numeric DEFAULT 0,
  p_retell_cost_cents integer DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_agent_id text DEFAULT NULL
)
RETURNS TABLE (
  success boolean,
  amount_deducted_cents integer,
  new_balance_cents integer,
  reservation_released_cents integer,
  margin_cents integer,
  transaction_id uuid,
  error_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  call_retell_id text;
  credits public.organization_credits%ROWTYPE;
  reservation public.credit_transactions%ROWTYPE;
  existing public.credit_transactions%ROWTYPE;
  customer_rate integer;
  provider_rate integer;
  provider_cost integer;
  deduction integer;
  margin integer;
  reservation_amount integer := 0;
  balance_after integer;
  v_idempotency_key text;
  release_only boolean;
  release_id uuid;
  deduction_id uuid;
  minimum_balance integer;
  other_reserved integer;
  settlement_available integer;
  snapshot_agent_id text;
  snapshot_policy_version text;
BEGIN
  PERFORM set_config('app.credit_ledger_writer', 'credit-ledger-v1', true);
  IF p_organization_id IS NULL OR p_actual_minutes IS NULL OR p_actual_minutes < 0 THEN
    RAISE EXCEPTION 'organization and non-negative actual minutes are required';
  END IF;
  IF p_retell_cost_cents IS NOT NULL AND p_retell_cost_cents < 0 THEN
    RAISE EXCEPTION 'provider cost cannot be negative';
  END IF;
  IF p_call_log_id IS NULL AND NULLIF(btrim(p_retell_call_id), '') IS NULL THEN
    RAISE EXCEPTION 'finalization requires a call log or Retell call identity';
  END IF;

  IF p_call_log_id IS NOT NULL THEN
    SELECT call_log.retell_call_id
    INTO call_retell_id
    FROM public.call_logs AS call_log
    WHERE call_log.id = p_call_log_id
      AND call_log.organization_id = p_organization_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'credit finalization call log belongs to a different organization';
    END IF;
    IF call_retell_id IS NOT NULL
      AND NULLIF(btrim(p_retell_call_id), '') IS NOT NULL
      AND call_retell_id IS DISTINCT FROM btrim(p_retell_call_id)
    THEN
      RAISE EXCEPTION 'credit finalization Retell identity conflicts with the call log';
    END IF;
  END IF;

  PERFORM 1
  FROM public.organizations AS organization
  WHERE organization.id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization does not exist';
  END IF;

  -- A reservation is the immutable dispatch-time billing decision. The
  -- current organizations.billing_enabled toggle is intentionally ignored:
  -- turning billing off after dispatch must not strand the hold, and turning
  -- it on after an unbilled dispatch must not manufacture a charge.
  release_only := p_actual_minutes = 0;
  v_idempotency_key := COALESCE(
    NULLIF(btrim(p_idempotency_key), ''),
    CASE WHEN NULLIF(btrim(p_retell_call_id), '') IS NOT NULL
      THEN (CASE WHEN release_only THEN 'release:retell:' ELSE 'finalize:retell:' END)
        || btrim(p_retell_call_id) END,
    CASE WHEN p_call_log_id IS NOT NULL
      THEN (CASE WHEN release_only THEN 'release:call:' ELSE 'finalize:call:' END)
        || p_call_log_id::text END
  );

  SELECT * INTO credits
  FROM public.organization_credits
  WHERE organization_id = p_organization_id
  FOR UPDATE;

  SELECT transaction.* INTO reservation
  FROM public.credit_transactions AS transaction
  WHERE transaction.organization_id = p_organization_id
    AND transaction.transaction_type = 'reservation'
    AND (
      (p_call_log_id IS NOT NULL AND transaction.call_log_id = p_call_log_id)
      OR (
        NULLIF(btrim(p_retell_call_id), '') IS NOT NULL
        AND transaction.retell_call_id = btrim(p_retell_call_id)
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.credit_transactions AS release
      WHERE release.organization_id = p_organization_id
        AND release.transaction_type = 'reservation_release'
        AND release.metadata->>'reservation_id' = transaction.id::text
    )
  ORDER BY transaction.created_at DESC, transaction.id DESC
  LIMIT 1;
  IF reservation.id IS NOT NULL THEN
    reservation_amount := abs(reservation.amount_cents);
  END IF;

  SELECT * INTO existing
  FROM public.credit_transactions
  WHERE credit_transactions.idempotency_key = v_idempotency_key;

  IF credits.id IS NULL THEN
    IF existing.id IS NOT NULL THEN
      RETURN QUERY SELECT false, 0, 0, 0, 0, NULL::uuid,
        'CREDIT_SETTLEMENT_RECONCILIATION_REQUIRED prior settlement has no credit account'::text;
    ELSIF reservation.id IS NOT NULL THEN
      RETURN QUERY SELECT false, 0, 0, 0, 0, NULL::uuid,
        'CREDIT_SETTLEMENT_RECONCILIATION_REQUIRED active reservation has no credit account'::text;
    ELSE
      RETURN QUERY SELECT true, 0, 0, 0, 0, NULL::uuid,
        'No dispatch-time billing reservation; no charge applied'::text;
    END IF;
    RETURN;
  END IF;

  IF existing.id IS NOT NULL THEN
    IF existing.organization_id IS DISTINCT FROM p_organization_id
      OR existing.transaction_type <> (CASE WHEN release_only THEN 'reservation_release' ELSE 'deduction' END)
      OR existing.call_log_id IS DISTINCT FROM p_call_log_id
      OR existing.retell_call_id IS DISTINCT FROM NULLIF(btrim(p_retell_call_id), '')
      OR (NOT release_only AND existing.minutes_used IS DISTINCT FROM p_actual_minutes)
      OR (
        NOT release_only
        AND p_retell_cost_cents IS NOT NULL
        AND existing.retell_cost_cents IS DISTINCT FROM p_retell_cost_cents
      )
      OR (
        NOT release_only
        AND NULLIF(btrim(p_agent_id), '') IS NOT NULL
        AND NULLIF(existing.metadata->>'agent_id', '') IS NOT NULL
        AND existing.metadata->>'agent_id' IS DISTINCT FROM btrim(p_agent_id)
      )
    THEN
      RAISE EXCEPTION 'CREDIT_IDEMPOTENCY_PAYLOAD_MISMATCH' USING ERRCODE = '23505';
    END IF;
    RETURN QUERY SELECT true,
      CASE WHEN release_only THEN 0 ELSE abs(existing.amount_cents) END,
      existing.balance_after_cents,
      COALESCE((existing.metadata->>'released_cents')::integer, 0),
      COALESCE(existing.margin_cents, 0),
      existing.id,
      'Already finalized (idempotent)'::text;
    RETURN;
  END IF;

  IF reservation.id IS NULL THEN
    RETURN QUERY SELECT true, 0, credits.balance_cents, 0, 0, NULL::uuid,
      'No dispatch-time billing reservation; no charge applied'::text;
    RETURN;
  END IF;

  -- Settlement price comes only from the immutable dispatch reservation. A
  -- current organization/agent rate is mutable configuration, never evidence
  -- of what the customer authorized when the provider call started.
  IF COALESCE(reservation.metadata->>'customer_rate_cents', '') !~ '^[1-9][0-9]*$'
    OR COALESCE(reservation.metadata->>'provider_rate_cents', '') !~ '^[0-9]+$'
    OR COALESCE(reservation.metadata->>'max_exposure_cents', '') !~ '^[1-9][0-9]*$'
    OR NULLIF(reservation.metadata->>'pricing_policy_version', '') IS NULL
  THEN
    RETURN QUERY SELECT false, 0, credits.balance_cents, 0, 0, NULL::uuid,
      'CREDIT_SETTLEMENT_RECONCILIATION_REQUIRED reservation pricing snapshot is missing or invalid'::text;
    RETURN;
  END IF;

  customer_rate := (reservation.metadata->>'customer_rate_cents')::integer;
  provider_rate := (reservation.metadata->>'provider_rate_cents')::integer;
  snapshot_agent_id := NULLIF(reservation.metadata->>'agent_id', '');
  snapshot_policy_version := reservation.metadata->>'pricing_policy_version';
  IF (reservation.metadata->>'max_exposure_cents')::bigint <> reservation_amount::bigint THEN
    RETURN QUERY SELECT false, 0, credits.balance_cents, 0, 0, NULL::uuid,
      format(
        'CREDIT_SETTLEMENT_RECONCILIATION_REQUIRED reservation_cents=%s snapshot_exposure_cents=%s',
        reservation_amount,
        reservation.metadata->>'max_exposure_cents'
      );
    RETURN;
  END IF;
  IF snapshot_agent_id IS NOT NULL
    AND NULLIF(btrim(p_agent_id), '') IS NOT NULL
    AND snapshot_agent_id IS DISTINCT FROM btrim(p_agent_id)
  THEN
    RETURN QUERY SELECT false, 0, credits.balance_cents, 0, 0, NULL::uuid,
      format(
        'CREDIT_SETTLEMENT_RECONCILIATION_REQUIRED reservation_agent_id=%s callback_agent_id=%s',
        snapshot_agent_id,
        btrim(p_agent_id)
      );
    RETURN;
  END IF;

  deduction := ceil(p_actual_minutes * customer_rate)::integer;
  provider_cost := COALESCE(
    p_retell_cost_cents,
    ceil(p_actual_minutes * provider_rate)::integer
  );
  margin := deduction - provider_cost;

  IF credits.reserved_balance_cents < reservation_amount THEN
    RETURN QUERY SELECT false, 0, credits.balance_cents, 0, margin, NULL::uuid,
      format(
        'CREDIT_SETTLEMENT_RECONCILIATION_REQUIRED reservation_cents=%s held_cents=%s',
        reservation_amount,
        credits.reserved_balance_cents
      );
    RETURN;
  END IF;

  minimum_balance := CASE
    WHEN credits.allow_negative_balance THEN -credits.negative_balance_limit_cents
    ELSE 0
  END;
  other_reserved := credits.reserved_balance_cents - reservation_amount;
  settlement_available := GREATEST(
    0,
    credits.balance_cents - other_reserved - minimum_balance
  );

  IF NOT release_only AND deduction > reservation_amount THEN
    RETURN QUERY SELECT false, 0, credits.balance_cents, 0, margin, NULL::uuid,
      format(
        'CREDIT_SETTLEMENT_RECONCILIATION_REQUIRED required_cents=%s reserved_exposure_cents=%s available_cents=%s',
        deduction,
        reservation_amount,
        settlement_available
      );
    RETURN;
  END IF;

  -- Never cap the balance while recording a larger debit. If actual usage is
  -- greater than the dispatch-time hold plus currently unreserved capacity,
  -- preserve the reservation and return a machine-readable reconciliation
  -- failure with the exact required and available cents.
  IF NOT release_only AND deduction > settlement_available THEN
    RETURN QUERY SELECT false, 0, credits.balance_cents, 0, margin, NULL::uuid,
      format(
        'CREDIT_SETTLEMENT_RECONCILIATION_REQUIRED required_cents=%s available_cents=%s balance_cents=%s other_reserved_cents=%s minimum_balance_cents=%s',
        deduction,
        settlement_available,
        credits.balance_cents,
        other_reserved,
        minimum_balance
      );
    RETURN;
  END IF;

  balance_after := credits.balance_cents - deduction;

  UPDATE public.organization_credits
  SET balance_cents = balance_after,
      reserved_balance_cents = public.organization_credits.reserved_balance_cents - reservation_amount,
      last_deduction_at = CASE WHEN deduction > 0 THEN now() ELSE last_deduction_at END,
      updated_at = now()
  WHERE id = credits.id;

  IF reservation.id IS NOT NULL THEN
    INSERT INTO public.credit_transactions (
      organization_id, transaction_type, amount_cents,
      balance_before_cents, balance_after_cents,
      call_log_id, retell_call_id, description, idempotency_key, metadata
    ) VALUES (
      p_organization_id, 'reservation_release', reservation_amount,
      credits.balance_cents, credits.balance_cents,
      p_call_log_id, NULLIF(btrim(p_retell_call_id), ''),
      format('Credit reservation released: %s cents', reservation_amount),
      CASE WHEN release_only THEN v_idempotency_key ELSE 'release:' || reservation.id::text END,
       jsonb_build_object(
         'reservation_id', reservation.id,
         'released_cents', reservation_amount,
         'release_only', release_only,
         'customer_rate_cents', customer_rate,
         'provider_rate_cents', provider_rate,
         'max_exposure_cents', reservation_amount,
         'pricing_policy_version', snapshot_policy_version,
         'agent_id', snapshot_agent_id
       )
    ) RETURNING id INTO release_id;
  END IF;

  IF release_only THEN
    RETURN QUERY SELECT true, 0, balance_after, reservation_amount, 0,
      release_id, NULL::text;
    RETURN;
  END IF;

  INSERT INTO public.credit_transactions (
    organization_id, transaction_type, amount_cents,
    balance_before_cents, balance_after_cents,
    call_log_id, retell_call_id, minutes_used,
    retell_cost_cents, margin_cents, description, idempotency_key, metadata
  ) VALUES (
    p_organization_id, 'deduction', -deduction,
    credits.balance_cents, balance_after,
    p_call_log_id, NULLIF(btrim(p_retell_call_id), ''), p_actual_minutes,
    provider_cost, margin,
    format('Call usage: %s minutes at %s cents/minute', p_actual_minutes, customer_rate),
    v_idempotency_key,
    jsonb_build_object(
      'agent_id', snapshot_agent_id,
      'customer_rate_cents', customer_rate,
      'provider_rate_cents', provider_rate,
      'max_exposure_cents', reservation_amount,
      'pricing_policy_version', snapshot_policy_version,
      'reservation_id', reservation.id,
      'released_cents', reservation_amount
    )
  ) RETURNING id INTO deduction_id;

  IF p_call_log_id IS NOT NULL THEN
    UPDATE public.call_logs
    SET credit_deducted = true,
        billed_cost_cents = deduction,
        retell_cost_cents = provider_cost
    WHERE id = p_call_log_id
      AND organization_id = p_organization_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'settlement lost its authoritative call log';
    END IF;
  END IF;

  RETURN QUERY SELECT true, deduction, balance_after, reservation_amount,
    margin, deduction_id, NULL::text;
END;
$$;

CREATE FUNCTION public.add_credits(
  p_organization_id uuid,
  p_amount_cents integer,
  p_transaction_type text DEFAULT 'manual_add',
  p_description text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_stripe_payment_id text DEFAULT NULL
)
RETURNS TABLE (
  success boolean,
  new_balance_cents integer,
  transaction_id uuid,
  error_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  credits public.organization_credits%ROWTYPE;
  by_idempotency public.credit_transactions%ROWTYPE;
  by_payment public.credit_transactions%ROWTYPE;
  existing public.credit_transactions%ROWTYPE;
  v_transaction_type text;
  v_idempotency_key text;
  v_payment_id text;
  balance_after integer;
  inserted_id uuid;
BEGIN
  PERFORM set_config('app.credit_ledger_writer', 'credit-ledger-v1', true);
  v_transaction_type := NULLIF(btrim(p_transaction_type), '');
  v_idempotency_key := NULLIF(btrim(p_idempotency_key), '');
  v_payment_id := NULLIF(btrim(p_stripe_payment_id), '');
  IF p_organization_id IS NULL OR p_amount_cents IS NULL OR p_amount_cents = 0 THEN
    RAISE EXCEPTION 'organization and a non-zero integer credit amount are required';
  END IF;
  IF v_transaction_type IS NULL OR length(v_transaction_type) > 64 THEN
    RAISE EXCEPTION 'transaction type must contain 1 to 64 characters';
  END IF;
  IF v_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'add_credits requires an explicit idempotency key';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organizations WHERE id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'organization does not exist';
  END IF;

  INSERT INTO public.organization_credits (organization_id, balance_cents)
  VALUES (p_organization_id, 0)
  ON CONFLICT (organization_id) DO NOTHING;

  SELECT * INTO credits
  FROM public.organization_credits
  WHERE organization_id = p_organization_id
  FOR UPDATE;

  SELECT * INTO by_idempotency
  FROM public.credit_transactions
  WHERE credit_transactions.idempotency_key = v_idempotency_key;
  IF v_payment_id IS NOT NULL THEN
    SELECT * INTO by_payment
    FROM public.credit_transactions
    WHERE stripe_payment_id = v_payment_id;
  END IF;
  IF by_idempotency.id IS NOT NULL AND by_payment.id IS NOT NULL
    AND by_idempotency.id <> by_payment.id
  THEN
    RAISE EXCEPTION 'CREDIT_PAYMENT_PROVENANCE_CONFLICT' USING ERRCODE = '23505';
  END IF;
  IF by_idempotency.id IS NOT NULL THEN
    existing := by_idempotency;
  ELSE
    existing := by_payment;
  END IF;

  IF existing.id IS NOT NULL THEN
    IF existing.organization_id IS DISTINCT FROM p_organization_id
      OR existing.transaction_type IS DISTINCT FROM v_transaction_type
      OR existing.amount_cents IS DISTINCT FROM p_amount_cents
      OR existing.stripe_payment_id IS DISTINCT FROM v_payment_id
    THEN
      RAISE EXCEPTION 'CREDIT_IDEMPOTENCY_PAYLOAD_MISMATCH' USING ERRCODE = '23505';
    END IF;
    RETURN QUERY SELECT true, existing.balance_after_cents, existing.id,
      'Already added (idempotent)'::text;
    RETURN;
  END IF;

  balance_after := credits.balance_cents + p_amount_cents;
  IF balance_after < (CASE
      WHEN credits.allow_negative_balance THEN -credits.negative_balance_limit_cents
      ELSE 0
    END
  )
  THEN
    RAISE EXCEPTION 'credit adjustment would exceed the configured negative balance limit';
  END IF;

  UPDATE public.organization_credits
  SET balance_cents = balance_after,
      last_recharge_at = CASE WHEN p_amount_cents > 0 THEN now() ELSE last_recharge_at END,
      updated_at = now()
  WHERE id = credits.id;

  INSERT INTO public.credit_transactions (
    organization_id, transaction_type, amount_cents,
    balance_before_cents, balance_after_cents,
    stripe_payment_id, description, idempotency_key
  ) VALUES (
    p_organization_id, v_transaction_type, p_amount_cents,
    credits.balance_cents, balance_after,
    v_payment_id, COALESCE(p_description, format('Credit transaction: %s', v_transaction_type)),
    v_idempotency_key
  ) RETURNING id INTO inserted_id;

  RETURN QUERY SELECT true, balance_after, inserted_id, NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.check_credit_balance(uuid, numeric)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_credits(uuid, integer, uuid, text, text, integer, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_call_cost(uuid, uuid, text, numeric, integer, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_credits(uuid, integer, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_credit_transaction_call_tenant()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.check_credit_balance(uuid, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_credits(uuid, integer, uuid, text, text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_call_cost(uuid, uuid, text, numeric, integer, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_credits(uuid, integer, text, text, text, text) TO service_role;

COMMENT ON COLUMN public.credit_transactions.transaction_type IS
  'Canonical immutable credit-ledger discriminator; replaces the legacy type column.';
COMMENT ON COLUMN public.credit_transactions.stripe_payment_id IS
  'Unique provider payment identity proving the external funding event behind a deposit.';
COMMENT ON FUNCTION public.reserve_credits(uuid, integer, uuid, text, text, integer, text) IS
  'Service-only dispatch authorization that freezes customer/provider rates, maximum exposure, pricing policy, and agent identity.';
COMMENT ON FUNCTION public.finalize_call_cost(uuid, uuid, text, numeric, integer, text, text) IS
  'Service-only idempotent settlement using only immutable dispatch reservation pricing. Zero actual minutes releases without charging.';

COMMIT;
