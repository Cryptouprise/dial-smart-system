-- Executed only against the isolated fresh-database certification project.
-- Every fixture and assertion is rolled back.

BEGIN;

DO $catalog_contract$
DECLARE
  object_count integer;
  definition text;
BEGIN
  SELECT count(*) INTO object_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'credit_transactions'
    AND column_name = 'transaction_type'
    AND is_nullable = 'NO';
  IF object_count <> 1 THEN
    RAISE EXCEPTION 'credit_transactions.transaction_type must be the canonical non-null discriminator';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'credit_transactions'
      AND column_name = 'type'
  ) THEN
    RAISE EXCEPTION 'legacy credit_transactions.type survived convergence';
  END IF;

  SELECT count(*) INTO object_count
  FROM pg_index AS index
  JOIN pg_attribute AS attribute
    ON attribute.attrelid = index.indrelid
   AND attribute.attnum = ANY(index.indkey)
  WHERE index.indrelid = 'public.credit_transactions'::regclass
    AND index.indisunique
    AND attribute.attname = 'stripe_payment_id';
  IF object_count <> 1 THEN
    RAISE EXCEPTION 'Stripe payment identity must have exactly one unique ledger index';
  END IF;

  SELECT pg_get_function_arguments(
    'public.add_credits(uuid,integer,text,text,text,text)'::regprocedure
  ) INTO definition;
  IF definition NOT LIKE '%p_stripe_payment_id text DEFAULT NULL::text%' THEN
    RAISE EXCEPTION 'canonical add_credits does not expose optional p_stripe_payment_id: %', definition;
  END IF;

  IF has_function_privilege('anon',
      'public.add_credits(uuid,integer,text,text,text,text)', 'EXECUTE')
    OR has_function_privilege('authenticated',
      'public.add_credits(uuid,integer,text,text,text,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role',
      'public.add_credits(uuid,integer,text,text,text,text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'add_credits is not service-role-only';
  END IF;

  SELECT pg_get_function_arguments(
    'public.reserve_credits(uuid,integer,uuid,text,text,integer,text)'::regprocedure
  ) INTO definition;
  IF definition NOT LIKE '%p_customer_rate_cents integer DEFAULT NULL::integer%'
    OR definition NOT LIKE '%p_agent_id text DEFAULT NULL::text%'
    OR has_function_privilege('anon',
      'public.reserve_credits(uuid,integer,uuid,text,text,integer,text)', 'EXECUTE')
    OR has_function_privilege('authenticated',
      'public.reserve_credits(uuid,integer,uuid,text,text,integer,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role',
      'public.reserve_credits(uuid,integer,uuid,text,text,integer,text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'canonical reservation pricing snapshot signature/grants are missing: %', definition;
  END IF;

  SELECT pg_get_functiondef(
    'public.finalize_call_cost(uuid,uuid,text,numeric,integer,text,text)'::regprocedure
  ) INTO definition;
  IF definition NOT LIKE '%reservation is the immutable dispatch-time billing decision%'
    OR definition NOT LIKE '%CREDIT_SETTLEMENT_RECONCILIATION_REQUIRED required_cents=%'
    OR definition NOT LIKE '%reservation.metadata->>''customer_rate_cents''%'
    OR definition LIKE '%credits.cost_per_minute_cents%'
    OR definition LIKE '%public.agent_pricing%'
    OR definition LIKE '%GREATEST(0, credits.balance_cents - deduction)%'
  THEN
    RAISE EXCEPTION 'finalize_call_cost lacks the dispatch snapshot / conserving settlement contract';
  END IF;
END;
$catalog_contract$;

INSERT INTO public.organizations (id, name, slug, billing_enabled) VALUES
  ('61000000-0000-0000-0000-000000000001', 'Credit Toggle Contract', 'credit-toggle-contract', true),
  ('61000000-0000-0000-0000-000000000002', 'Credit Overage Contract', 'credit-overage-contract', true),
  ('61000000-0000-0000-0000-000000000003', 'Stripe Funding Contract', 'stripe-funding-contract', true);

-- Isolated fixture setup stands in for a canonical funding event. Production
-- writes cannot set this transaction-local ledger ownership marker directly.
SELECT set_config('app.credit_ledger_writer', 'credit-ledger-v1', true);
INSERT INTO public.organization_credits (
  organization_id,
  balance_cents,
  reserved_balance_cents,
  cost_per_minute_cents,
  retell_cost_per_minute_cents
) VALUES
  ('61000000-0000-0000-0000-000000000001', 100, 0, 15, 7),
  ('61000000-0000-0000-0000-000000000002', 15, 0, 150, 7),
  ('61000000-0000-0000-0000-000000000003', 0, 0, 15, 7);
SELECT set_config('app.credit_ledger_writer', '', true);

DO $behavior_contract$
DECLARE
  result record;
  first_funding record;
  replayed_funding record;
  balance integer;
  held integer;
  transaction_count integer;
  arithmetic_mismatches integer;
BEGIN
  -- Billed at dispatch, then billing is disabled before the callback: the
  -- persisted reservation still settles and is always released.
  SELECT * INTO result
  FROM public.reserve_credits(
    '61000000-0000-0000-0000-000000000001',
    15,
    NULL,
    'retell-toggle-off',
    'reserve-toggle-off'
  );
  IF result.success IS DISTINCT FROM true OR result.reserved_balance_cents <> 15 THEN
    RAISE EXCEPTION 'toggle-off fixture did not establish its dispatch-time reservation: %', row_to_json(result);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.credit_transactions
    WHERE organization_id = '61000000-0000-0000-0000-000000000001'
      AND transaction_type = 'reservation'
      AND retell_call_id = 'retell-toggle-off'
      AND metadata @> jsonb_build_object(
        'customer_rate_cents', 15,
        'provider_rate_cents', 7,
        'max_exposure_cents', 15,
        'pricing_policy_version', 'credit-reservation-v1'
      )
  ) THEN
    RAISE EXCEPTION 'reservation did not freeze the complete dispatch-time pricing snapshot';
  END IF;

  UPDATE public.organizations
  SET billing_enabled = false
  WHERE id = '61000000-0000-0000-0000-000000000001';
  UPDATE public.organization_credits
  SET cost_per_minute_cents = 99,
      retell_cost_per_minute_cents = 44
  WHERE organization_id = '61000000-0000-0000-0000-000000000001';

  SELECT * INTO result
  FROM public.finalize_call_cost(
    '61000000-0000-0000-0000-000000000001',
    NULL,
    'retell-toggle-off',
    1,
    NULL,
    'finalize-toggle-off',
    NULL
  );
  IF result.success IS DISTINCT FROM true
    OR result.amount_deducted_cents <> 15
    OR result.new_balance_cents <> 85
    OR result.reservation_released_cents <> 15
  THEN
    RAISE EXCEPTION 'disabling billing after dispatch stranded or skipped the reserved settlement: %', row_to_json(result);
  END IF;

  SELECT balance_cents, reserved_balance_cents
  INTO balance, held
  FROM public.organization_credits
  WHERE organization_id = '61000000-0000-0000-0000-000000000001';
  IF balance <> 85 OR held <> 0 THEN
    RAISE EXCEPTION 'toggle-off settlement balance/hold mismatch: balance %, held %', balance, held;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.credit_transactions
    WHERE organization_id = '61000000-0000-0000-0000-000000000001'
      AND transaction_type = 'deduction'
      AND amount_cents = -15
      AND retell_cost_cents = 7
      AND metadata @> jsonb_build_object(
        'customer_rate_cents', 15,
        'provider_rate_cents', 7,
        'pricing_policy_version', 'credit-reservation-v1'
      )
  ) THEN
    RAISE EXCEPTION 'settlement reread mutable customer/provider pricing instead of the reservation snapshot';
  END IF;

  -- Unbilled at dispatch, then billing is enabled before the callback: absence
  -- of a reservation is the dispatch snapshot and must not create a charge.
  UPDATE public.organizations
  SET billing_enabled = true
  WHERE id = '61000000-0000-0000-0000-000000000001';

  SELECT * INTO result
  FROM public.finalize_call_cost(
    '61000000-0000-0000-0000-000000000001',
    NULL,
    'retell-toggle-on-after-unbilled-dispatch',
    1,
    7,
    'finalize-toggle-on-after-unbilled-dispatch',
    NULL
  );
  IF result.success IS DISTINCT FROM true
    OR result.amount_deducted_cents <> 0
    OR result.new_balance_cents <> 85
    OR result.reservation_released_cents <> 0
  THEN
    RAISE EXCEPTION 'enabling billing after an unbilled dispatch manufactured a charge: %', row_to_json(result);
  END IF;

  -- Actual usage exceeds all permissible capacity. This must return a manual
  -- reconciliation result without releasing the hold, debiting, or settling.
  SELECT * INTO result
  FROM public.reserve_credits(
    '61000000-0000-0000-0000-000000000002',
    15,
    NULL,
    'retell-overage',
    'reserve-overage'
  );
  IF result.success IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'overage fixture could not reserve its dispatch hold: %', row_to_json(result);
  END IF;

  SELECT * INTO result
  FROM public.finalize_call_cost(
    '61000000-0000-0000-0000-000000000002',
    NULL,
    'retell-overage',
    1,
    7,
    'finalize-overage',
    NULL
  );
  IF result.success IS DISTINCT FROM false
    OR result.amount_deducted_cents <> 0
    OR result.new_balance_cents <> 15
    OR result.reservation_released_cents <> 0
    OR result.error_message NOT LIKE '%required_cents=150%reserved_exposure_cents=15%available_cents=15%'
  THEN
    RAISE EXCEPTION 'overage was not rejected with exact conserving evidence: %', row_to_json(result);
  END IF;

  SELECT balance_cents, reserved_balance_cents
  INTO balance, held
  FROM public.organization_credits
  WHERE organization_id = '61000000-0000-0000-0000-000000000002';
  IF balance <> 15 OR held <> 15 THEN
    RAISE EXCEPTION 'failed overage mutated balance or released its hold: balance %, held %', balance, held;
  END IF;
  SELECT count(*) INTO transaction_count
  FROM public.credit_transactions
  WHERE organization_id = '61000000-0000-0000-0000-000000000002'
    AND transaction_type IN ('deduction', 'reservation_release');
  IF transaction_count <> 0 THEN
    RAISE EXCEPTION 'failed overage wrote a settlement ledger entry';
  END IF;

  -- A verified Stripe payment may arrive through different webhook event IDs.
  -- Provider payment identity, not the event/idempotency key, mints exactly once.
  SELECT * INTO first_funding
  FROM public.add_credits(
    '61000000-0000-0000-0000-000000000003',
    1000,
    'stripe_payment',
    'first delivery',
    'stripe-event-a',
    'pi_same_provider_payment'
  );
  SELECT * INTO replayed_funding
  FROM public.add_credits(
    '61000000-0000-0000-0000-000000000003',
    1000,
    'stripe_payment',
    'second delivery',
    'stripe-event-b',
    'pi_same_provider_payment'
  );
  IF first_funding.success IS DISTINCT FROM true
    OR replayed_funding.success IS DISTINCT FROM true
    OR first_funding.transaction_id IS DISTINCT FROM replayed_funding.transaction_id
    OR first_funding.new_balance_cents <> 1000
    OR replayed_funding.new_balance_cents <> 1000
  THEN
    RAISE EXCEPTION 'same Stripe payment identity was not idempotent across event keys: first %, replay %',
      row_to_json(first_funding), row_to_json(replayed_funding);
  END IF;

  SELECT balance_cents INTO balance
  FROM public.organization_credits
  WHERE organization_id = '61000000-0000-0000-0000-000000000003';
  SELECT count(*) INTO transaction_count
  FROM public.credit_transactions
  WHERE stripe_payment_id = 'pi_same_provider_payment';
  IF balance <> 1000 OR transaction_count <> 1 THEN
    RAISE EXCEPTION 'same Stripe payment minted more than once: balance %, rows %', balance, transaction_count;
  END IF;

  SELECT count(*) INTO arithmetic_mismatches
  FROM public.credit_transactions
  WHERE transaction_type = 'deduction'
    AND balance_after_cents <> balance_before_cents + amount_cents;
  IF arithmetic_mismatches <> 0 THEN
    RAISE EXCEPTION 'deduction ledger arithmetic diverges from stored balances';
  END IF;
END;
$behavior_contract$;

ROLLBACK;
