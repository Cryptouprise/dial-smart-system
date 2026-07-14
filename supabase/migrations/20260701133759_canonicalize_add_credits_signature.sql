-- Resolve add_credits repo<->live drift: the live function uses
-- (p_transaction_type, p_description, p_idempotency_key); older repo migrations
-- defined (p_type, p_stripe_payment_intent_id, p_created_by). The edge function
-- (credit-management) and AdminSettings target the live signature. This
-- migration makes any DB (incl. a fresh rebuild) match live, and re-locks the
-- grants so a newly created function never regains default PUBLIC EXECUTE.
--
-- Applied to production via MCP on 2026-07-01 (version 20260701133759).

-- Drop drifted variants if present (no-op on the live DB).
DROP FUNCTION IF EXISTS public.add_credits(uuid, integer, text, text, text, uuid);
DROP FUNCTION IF EXISTS public.add_credits(uuid, integer, text, text, text, uuid, text);

CREATE OR REPLACE FUNCTION public.add_credits(
  p_organization_id uuid,
  p_amount_cents integer,
  p_transaction_type text DEFAULT 'manual_add'::text,
  p_description text DEFAULT NULL::text,
  p_idempotency_key text DEFAULT NULL::text
)
RETURNS TABLE(success boolean, new_balance_cents integer, transaction_id uuid, error_message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_current_balance INTEGER;
  v_new_balance INTEGER;
  v_transaction_id UUID;
  v_transaction_type_column TEXT;
BEGIN
  -- Check idempotency
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_transaction_id
    FROM credit_transactions
    WHERE idempotency_key = p_idempotency_key;

    IF v_transaction_id IS NOT NULL THEN
      SELECT ct.balance_after_cents INTO v_new_balance
      FROM credit_transactions ct WHERE ct.id = v_transaction_id;

      RETURN QUERY SELECT true, v_new_balance, v_transaction_id, NULL::TEXT;
      RETURN;
    END IF;
  END IF;

  -- Lock and get current balance
  SELECT balance_cents INTO v_current_balance
  FROM organization_credits
  WHERE organization_id = p_organization_id
  FOR UPDATE;

  -- If no record exists, create one
  IF v_current_balance IS NULL THEN
    INSERT INTO organization_credits (organization_id, balance_cents)
    VALUES (p_organization_id, 0)
    ON CONFLICT (organization_id) DO NOTHING;
    v_current_balance := 0;
  END IF;

  v_new_balance := v_current_balance + p_amount_cents;

  UPDATE organization_credits
  SET balance_cents = v_new_balance,
      updated_at = now(),
      last_recharge_at = CASE WHEN p_amount_cents > 0 THEN now() ELSE last_recharge_at END
  WHERE organization_id = p_organization_id;

  -- Fresh history still has the legacy `type` column at this point, while the
  -- already-upgraded live database has `transaction_type`. Use the column that
  -- actually exists so a fresh replay can reach the later convergence repair.
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'credit_transactions'
        AND column_name = 'transaction_type'
    ) THEN 'transaction_type'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'credit_transactions'
        AND column_name = 'type'
    ) THEN 'type'
  END
  INTO v_transaction_type_column;

  IF v_transaction_type_column IS NULL THEN
    RAISE EXCEPTION 'credit transaction type column is missing';
  END IF;

  EXECUTE format(
    'INSERT INTO public.credit_transactions (
       organization_id, %I, amount_cents,
       balance_before_cents, balance_after_cents, description, idempotency_key
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id',
    v_transaction_type_column
  )
  INTO v_transaction_id
  USING p_organization_id, p_transaction_type, p_amount_cents,
    v_current_balance, v_new_balance, p_description, p_idempotency_key;

  RETURN QUERY SELECT true, v_new_balance, v_transaction_id, NULL::TEXT;
END;
$function$;

-- Re-lock: never client-callable; only the service role (edge functions).
REVOKE EXECUTE ON FUNCTION public.add_credits(uuid, integer, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_credits(uuid, integer, text, text, text) TO service_role;
