-- ============================================================================
-- WHITE-LABEL CREDIT SYSTEM V2 - ENTERPRISE ENHANCEMENTS
-- Created: January 24, 2026
-- Purpose: Add reservation system, idempotency, race condition prevention
--
-- This migration ENHANCES the base credit system with:
-- 1. Credit reservation for in-progress calls
-- 2. Idempotency keys to prevent duplicate transactions
-- 3. Allow negative balance for enterprise accounts
-- 4. FOR UPDATE row locking for atomic operations
-- 5. Enhanced functions with reservation flow
--
-- BACKWARD COMPATIBLE: All changes are additive
-- ============================================================================

-- ============================================================================
-- STEP 1: Add enhanced columns to organization_credits
-- ============================================================================

-- Reserved balance for in-progress calls (prevents overspending)
ALTER TABLE organization_credits
  ADD COLUMN IF NOT EXISTS reserved_balance_cents INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN organization_credits.reserved_balance_cents IS
  'Credits reserved for in-progress calls. Available balance = balance_cents - reserved_balance_cents';

-- Allow negative balance for enterprise/trusted accounts
ALTER TABLE organization_credits
  ADD COLUMN IF NOT EXISTS allow_negative_balance BOOLEAN DEFAULT false;

ALTER TABLE organization_credits
  ADD COLUMN IF NOT EXISTS negative_balance_limit_cents INTEGER DEFAULT 0;

COMMENT ON COLUMN organization_credits.allow_negative_balance IS
  'Enterprise accounts can go negative up to the limit';
COMMENT ON COLUMN organization_credits.negative_balance_limit_cents IS
  'Maximum negative balance allowed (e.g., 10000 = -$100 limit)';

-- Stripe payment method for auto-recharge
ALTER TABLE organization_credits
  ADD COLUMN IF NOT EXISTS stripe_payment_method_id TEXT;

COMMENT ON COLUMN organization_credits.stripe_payment_method_id IS
  'Saved Stripe payment method for auto-recharge';

-- ============================================================================
-- STEP 2: Add idempotency key to credit_transactions
-- ============================================================================

-- Idempotency key prevents duplicate transactions
ALTER TABLE credit_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Unique index on idempotency_key (allows NULL for legacy transactions)
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_tx_idempotency
  ON credit_transactions(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN credit_transactions.idempotency_key IS
  'Unique key to prevent duplicate transactions. Format: {type}_{reference}';

-- Add reservation type to transactions
DO $$
BEGIN
  -- Only add if the constraint doesn't already include 'reservation'
  ALTER TABLE credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_type_check;
  ALTER TABLE credit_transactions ADD CONSTRAINT credit_transactions_type_check
    CHECK (type IN (
      'deposit',
      'deduction',
      'refund',
      'adjustment',
      'auto_recharge',
      'stripe_payment',
      'reservation',
      'reservation_release'
    ));
EXCEPTION WHEN others THEN
  NULL; -- Ignore if constraint doesn't exist or already correct
END $$;

-- ============================================================================
-- STEP 3: Create enhanced check_credit_balance with available balance calc
-- ============================================================================

CREATE OR REPLACE FUNCTION check_credit_balance(
  p_organization_id UUID,
  p_minutes_needed DECIMAL DEFAULT 1
) RETURNS TABLE (
  has_balance BOOLEAN,
  current_balance_cents INTEGER,
  reserved_balance_cents INTEGER,
  available_balance_cents INTEGER,
  cost_per_minute_cents INTEGER,
  required_cents INTEGER,
  billing_enabled BOOLEAN,
  allow_negative BOOLEAN,
  negative_limit_cents INTEGER
) AS $$
DECLARE
  v_org RECORD;
  v_credits RECORD;
  v_required_cents INTEGER;
  v_available_cents INTEGER;
BEGIN
  -- Get organization billing status
  SELECT billing_enabled INTO v_org FROM organizations WHERE id = p_organization_id;

  -- If billing not enabled, always return true (backward compatible)
  IF NOT COALESCE(v_org.billing_enabled, false) THEN
    RETURN QUERY SELECT
      true AS has_balance,
      0 AS current_balance_cents,
      0 AS reserved_balance_cents,
      0 AS available_balance_cents,
      0 AS cost_per_minute_cents,
      0 AS required_cents,
      false AS billing_enabled,
      false AS allow_negative,
      0 AS negative_limit_cents;
    RETURN;
  END IF;

  -- Get credit info
  SELECT * INTO v_credits FROM organization_credits WHERE organization_id = p_organization_id;

  -- If no credit record, treat as zero balance
  IF v_credits IS NULL THEN
    RETURN QUERY SELECT
      false AS has_balance,
      0 AS current_balance_cents,
      0 AS reserved_balance_cents,
      0 AS available_balance_cents,
      15 AS cost_per_minute_cents,
      CEIL(p_minutes_needed * 15)::INTEGER AS required_cents,
      true AS billing_enabled,
      false AS allow_negative,
      0 AS negative_limit_cents;
    RETURN;
  END IF;

  -- Calculate available balance (current - reserved)
  v_available_cents := v_credits.balance_cents - COALESCE(v_credits.reserved_balance_cents, 0);

  -- Calculate required amount
  v_required_cents := CEIL(p_minutes_needed * v_credits.cost_per_minute_cents);

  -- Determine if has sufficient balance
  -- If allow_negative, check against negative limit
  -- Otherwise, check available >= required and above cutoff
  RETURN QUERY SELECT
    CASE
      WHEN v_credits.allow_negative THEN
        (v_available_cents - v_required_cents) >= -COALESCE(v_credits.negative_balance_limit_cents, 0)
      ELSE
        v_available_cents >= GREATEST(v_required_cents, v_credits.cutoff_threshold_cents)
    END AS has_balance,
    v_credits.balance_cents AS current_balance_cents,
    COALESCE(v_credits.reserved_balance_cents, 0) AS reserved_balance_cents,
    v_available_cents AS available_balance_cents,
    v_credits.cost_per_minute_cents,
    v_required_cents AS required_cents,
    true AS billing_enabled,
    COALESCE(v_credits.allow_negative_balance, false) AS allow_negative,
    COALESCE(v_credits.negative_balance_limit_cents, 0) AS negative_limit_cents;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION check_credit_balance IS
  'Check if organization has sufficient credits. Returns available balance (balance - reserved).';

-- ============================================================================
-- STEP 4: Create reserve_credits function (pre-call reservation)
-- ============================================================================

CREATE OR REPLACE FUNCTION reserve_credits(
  p_organization_id UUID,
  p_amount_cents INTEGER,
  p_call_log_id UUID DEFAULT NULL,
  p_retell_call_id TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
) RETURNS TABLE (
  success BOOLEAN,
  available_balance_cents INTEGER,
  reserved_balance_cents INTEGER,
  reservation_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_org RECORD;
  v_credits RECORD;
  v_available_cents INTEGER;
  v_idem_key TEXT;
  v_tx_id UUID;
BEGIN
  -- Generate idempotency key if not provided
  v_idem_key := COALESCE(p_idempotency_key, 'reserve_' || COALESCE(p_retell_call_id, gen_random_uuid()::TEXT));

  -- Check for existing reservation with same idempotency key
  SELECT id INTO v_tx_id FROM credit_transactions
  WHERE idempotency_key = v_idem_key
  LIMIT 1;

  IF v_tx_id IS NOT NULL THEN
    -- Already processed, return success with existing data
    SELECT * INTO v_credits FROM organization_credits WHERE organization_id = p_organization_id;
    RETURN QUERY SELECT
      true AS success,
      COALESCE(v_credits.balance_cents, 0) - COALESCE(v_credits.reserved_balance_cents, 0) AS available_balance_cents,
      COALESCE(v_credits.reserved_balance_cents, 0) AS reserved_balance_cents,
      v_tx_id AS reservation_id,
      'Already reserved (idempotent)'::TEXT AS error_message;
    RETURN;
  END IF;

  -- Get organization billing status
  SELECT billing_enabled INTO v_org FROM organizations WHERE id = p_organization_id;

  -- If billing not enabled, return success without reservation
  IF NOT COALESCE(v_org.billing_enabled, false) THEN
    RETURN QUERY SELECT
      true AS success,
      0 AS available_balance_cents,
      0 AS reserved_balance_cents,
      NULL::UUID AS reservation_id,
      'Billing not enabled - no reservation needed'::TEXT AS error_message;
    RETURN;
  END IF;

  -- Lock the credit record for atomic update (FOR UPDATE prevents race conditions)
  SELECT * INTO v_credits
  FROM organization_credits
  WHERE organization_id = p_organization_id
  FOR UPDATE;

  IF v_credits IS NULL THEN
    RETURN QUERY SELECT
      false AS success,
      0 AS available_balance_cents,
      0 AS reserved_balance_cents,
      NULL::UUID AS reservation_id,
      'No credit record found for organization'::TEXT AS error_message;
    RETURN;
  END IF;

  -- Calculate available balance
  v_available_cents := v_credits.balance_cents - COALESCE(v_credits.reserved_balance_cents, 0);

  -- Check if reservation is allowed
  IF NOT v_credits.allow_negative_balance THEN
    IF v_available_cents < p_amount_cents THEN
      RETURN QUERY SELECT
        false AS success,
        v_available_cents AS available_balance_cents,
        COALESCE(v_credits.reserved_balance_cents, 0) AS reserved_balance_cents,
        NULL::UUID AS reservation_id,
        format('Insufficient credits. Available: $%.2f, Required: $%.2f',
               v_available_cents / 100.0, p_amount_cents / 100.0)::TEXT AS error_message;
      RETURN;
    END IF;
  ELSE
    -- Check against negative limit
    IF (v_available_cents - p_amount_cents) < -v_credits.negative_balance_limit_cents THEN
      RETURN QUERY SELECT
        false AS success,
        v_available_cents AS available_balance_cents,
        COALESCE(v_credits.reserved_balance_cents, 0) AS reserved_balance_cents,
        NULL::UUID AS reservation_id,
        'Would exceed negative balance limit'::TEXT AS error_message;
      RETURN;
    END IF;
  END IF;

  -- Make the reservation
  UPDATE organization_credits
  SET
    reserved_balance_cents = COALESCE(reserved_balance_cents, 0) + p_amount_cents,
    updated_at = NOW()
  WHERE organization_id = p_organization_id;

  -- Log the reservation transaction
  INSERT INTO credit_transactions (
    organization_id,
    type,
    amount_cents,
    balance_before_cents,
    balance_after_cents,
    call_log_id,
    description,
    idempotency_key,
    metadata
  ) VALUES (
    p_organization_id,
    'reservation',
    -p_amount_cents,
    v_credits.balance_cents,
    v_credits.balance_cents, -- Balance unchanged, just reserved
    p_call_log_id,
    format('Credit reserved for call (est. $%.2f)', p_amount_cents / 100.0),
    v_idem_key,
    jsonb_build_object(
      'retell_call_id', p_retell_call_id,
      'reserved_cents', p_amount_cents
    )
  ) RETURNING id INTO v_tx_id;

  RETURN QUERY SELECT
    true AS success,
    (v_available_cents - p_amount_cents) AS available_balance_cents,
    (COALESCE(v_credits.reserved_balance_cents, 0) + p_amount_cents) AS reserved_balance_cents,
    v_tx_id AS reservation_id,
    NULL::TEXT AS error_message;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION reserve_credits IS
  'Reserve credits BEFORE a call starts. Uses FOR UPDATE locking to prevent race conditions.
   Idempotent - safe to call multiple times with same key.';

-- ============================================================================
-- STEP 5: Create finalize_call_cost function (post-call settlement)
-- ============================================================================

CREATE OR REPLACE FUNCTION finalize_call_cost(
  p_organization_id UUID,
  p_call_log_id UUID,
  p_retell_call_id TEXT,
  p_actual_minutes DECIMAL,
  p_retell_cost_cents INTEGER DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
) RETURNS TABLE (
  success BOOLEAN,
  amount_deducted_cents INTEGER,
  new_balance_cents INTEGER,
  reservation_released_cents INTEGER,
  margin_cents INTEGER,
  transaction_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_org RECORD;
  v_credits RECORD;
  v_deduction_cents INTEGER;
  v_margin_cents INTEGER;
  v_balance_before INTEGER;
  v_balance_after INTEGER;
  v_reservation_amount INTEGER DEFAULT 0;
  v_idem_key TEXT;
  v_tx_id UUID;
BEGIN
  -- Generate idempotency key if not provided
  v_idem_key := COALESCE(p_idempotency_key, 'finalize_' || COALESCE(p_retell_call_id, p_call_log_id::TEXT));

  -- Check for existing finalization with same idempotency key
  SELECT id, ABS(amount_cents)::INTEGER INTO v_tx_id, v_deduction_cents
  FROM credit_transactions
  WHERE idempotency_key = v_idem_key
    AND type = 'deduction'
  LIMIT 1;

  IF v_tx_id IS NOT NULL THEN
    -- Already processed, return existing data
    SELECT balance_cents INTO v_balance_after FROM organization_credits WHERE organization_id = p_organization_id;
    RETURN QUERY SELECT
      true AS success,
      v_deduction_cents AS amount_deducted_cents,
      COALESCE(v_balance_after, 0) AS new_balance_cents,
      0 AS reservation_released_cents,
      0 AS margin_cents,
      v_tx_id AS transaction_id,
      'Already finalized (idempotent)'::TEXT AS error_message;
    RETURN;
  END IF;

  -- Get organization billing status
  SELECT billing_enabled INTO v_org FROM organizations WHERE id = p_organization_id;

  -- If billing not enabled, skip deduction (backward compatible)
  IF NOT COALESCE(v_org.billing_enabled, false) THEN
    -- Still mark the call as processed
    UPDATE call_logs SET credit_deducted = true WHERE id = p_call_log_id;

    RETURN QUERY SELECT
      true AS success,
      0 AS amount_deducted_cents,
      0 AS new_balance_cents,
      0 AS reservation_released_cents,
      0 AS margin_cents,
      NULL::UUID AS transaction_id,
      'Billing not enabled - no deduction'::TEXT AS error_message;
    RETURN;
  END IF;

  -- Lock the credit record for atomic update
  SELECT * INTO v_credits
  FROM organization_credits
  WHERE organization_id = p_organization_id
  FOR UPDATE;

  IF v_credits IS NULL THEN
    RETURN QUERY SELECT
      false AS success,
      0 AS amount_deducted_cents,
      0 AS new_balance_cents,
      0 AS reservation_released_cents,
      0 AS margin_cents,
      NULL::UUID AS transaction_id,
      'No credit record found'::TEXT AS error_message;
    RETURN;
  END IF;

  -- Find any existing reservation for this call
  SELECT ABS(amount_cents)::INTEGER INTO v_reservation_amount
  FROM credit_transactions
  WHERE organization_id = p_organization_id
    AND (call_log_id = p_call_log_id OR metadata->>'retell_call_id' = p_retell_call_id)
    AND type = 'reservation'
  ORDER BY created_at DESC
  LIMIT 1;

  v_reservation_amount := COALESCE(v_reservation_amount, 0);

  -- Calculate actual deduction based on minutes used
  v_deduction_cents := CEIL(p_actual_minutes * v_credits.cost_per_minute_cents);
  v_balance_before := v_credits.balance_cents;

  -- Calculate new balance (can go negative if allow_negative_balance)
  IF v_credits.allow_negative_balance THEN
    v_balance_after := v_credits.balance_cents - v_deduction_cents;
  ELSE
    v_balance_after := GREATEST(0, v_credits.balance_cents - v_deduction_cents);
  END IF;

  -- Calculate margin
  IF p_retell_cost_cents IS NOT NULL THEN
    v_margin_cents := v_deduction_cents - p_retell_cost_cents;
  ELSE
    v_margin_cents := v_deduction_cents - CEIL(p_actual_minutes * v_credits.retell_cost_per_minute_cents);
  END IF;

  -- Update balance: release reservation AND deduct actual cost
  UPDATE organization_credits
  SET
    balance_cents = v_balance_after,
    reserved_balance_cents = GREATEST(0, COALESCE(reserved_balance_cents, 0) - v_reservation_amount),
    last_deduction_at = NOW(),
    updated_at = NOW()
  WHERE organization_id = p_organization_id;

  -- If there was a reservation, log the release
  IF v_reservation_amount > 0 THEN
    INSERT INTO credit_transactions (
      organization_id,
      type,
      amount_cents,
      balance_before_cents,
      balance_after_cents,
      call_log_id,
      description,
      idempotency_key
    ) VALUES (
      p_organization_id,
      'reservation_release',
      v_reservation_amount,
      v_balance_before,
      v_balance_before, -- Release doesn't change balance
      p_call_log_id,
      format('Reservation released: $%.2f', v_reservation_amount / 100.0),
      'release_' || COALESCE(p_retell_call_id, p_call_log_id::TEXT)
    );
  END IF;

  -- Record the actual deduction
  INSERT INTO credit_transactions (
    organization_id,
    type,
    amount_cents,
    balance_before_cents,
    balance_after_cents,
    call_log_id,
    minutes_used,
    retell_cost_cents,
    margin_cents,
    description,
    idempotency_key,
    metadata
  ) VALUES (
    p_organization_id,
    'deduction',
    -v_deduction_cents,
    v_balance_before,
    v_balance_after,
    p_call_log_id,
    p_actual_minutes,
    COALESCE(p_retell_cost_cents, CEIL(p_actual_minutes * v_credits.retell_cost_per_minute_cents)),
    v_margin_cents,
    format('Call usage: %.2f min @ $%.2f/min = $%.2f',
           p_actual_minutes,
           v_credits.cost_per_minute_cents / 100.0,
           v_deduction_cents / 100.0),
    v_idem_key,
    jsonb_build_object(
      'retell_call_id', p_retell_call_id,
      'actual_cost_cents', COALESCE(p_retell_cost_cents, CEIL(p_actual_minutes * v_credits.retell_cost_per_minute_cents)),
      'billed_cost_cents', v_deduction_cents,
      'cost_per_minute_cents', v_credits.cost_per_minute_cents,
      'margin_percent', CASE WHEN v_deduction_cents > 0 THEN ROUND((v_margin_cents::DECIMAL / v_deduction_cents) * 100, 2) ELSE 0 END
    )
  ) RETURNING id INTO v_tx_id;

  -- Update call_logs with cost data
  UPDATE call_logs
  SET
    credit_deducted = true,
    billed_cost_cents = v_deduction_cents,
    retell_cost_cents = COALESCE(p_retell_cost_cents, CEIL(p_actual_minutes * v_credits.retell_cost_per_minute_cents))
  WHERE id = p_call_log_id;

  RETURN QUERY SELECT
    true AS success,
    v_deduction_cents AS amount_deducted_cents,
    v_balance_after AS new_balance_cents,
    v_reservation_amount AS reservation_released_cents,
    v_margin_cents AS margin_cents,
    v_tx_id AS transaction_id,
    NULL::TEXT AS error_message;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION finalize_call_cost IS
  'Finalize cost after call ends. Releases reservation and deducts actual cost.
   Idempotent - safe to call multiple times.';

-- ============================================================================
-- STEP 6: Create helper function to get organization_id from user
-- ============================================================================

CREATE OR REPLACE FUNCTION get_organization_for_user(p_user_id UUID)
RETURNS UUID AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM organization_users
  WHERE user_id = p_user_id
  ORDER BY created_at ASC
  LIMIT 1;

  RETURN v_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION get_organization_for_user IS
  'Get the primary organization_id for a user.';

-- ============================================================================
-- STEP 7: Create helper function to get organization_id from lead
-- ============================================================================

CREATE OR REPLACE FUNCTION get_organization_for_lead(p_lead_id UUID)
RETURNS UUID AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM leads
  WHERE id = p_lead_id;

  RETURN v_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION get_organization_for_lead IS
  'Get the organization_id for a lead.';

-- ============================================================================
-- STEP 8: Create function to check and trigger auto-recharge
-- ============================================================================

CREATE OR REPLACE FUNCTION check_auto_recharge(p_organization_id UUID)
RETURNS TABLE (
  needs_recharge BOOLEAN,
  current_balance_cents INTEGER,
  recharge_amount_cents INTEGER,
  payment_method_id TEXT
) AS $$
DECLARE
  v_credits RECORD;
BEGIN
  SELECT * INTO v_credits
  FROM organization_credits
  WHERE organization_id = p_organization_id;

  IF v_credits IS NULL OR NOT v_credits.auto_recharge_enabled THEN
    RETURN QUERY SELECT
      false AS needs_recharge,
      COALESCE(v_credits.balance_cents, 0) AS current_balance_cents,
      0 AS recharge_amount_cents,
      NULL::TEXT AS payment_method_id;
    RETURN;
  END IF;

  -- Check if balance is below trigger threshold
  IF v_credits.balance_cents <= v_credits.auto_recharge_trigger_cents THEN
    RETURN QUERY SELECT
      true AS needs_recharge,
      v_credits.balance_cents AS current_balance_cents,
      v_credits.auto_recharge_amount_cents AS recharge_amount_cents,
      v_credits.stripe_payment_method_id AS payment_method_id;
  ELSE
    RETURN QUERY SELECT
      false AS needs_recharge,
      v_credits.balance_cents AS current_balance_cents,
      0 AS recharge_amount_cents,
      v_credits.stripe_payment_method_id AS payment_method_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION check_auto_recharge IS
  'Check if organization needs auto-recharge. Returns payment method for processing.';

-- ============================================================================
-- STEP 9: Update the add_credits function with idempotency
-- ============================================================================

CREATE OR REPLACE FUNCTION add_credits(
  p_organization_id UUID,
  p_amount_cents INTEGER,
  p_type TEXT DEFAULT 'deposit',
  p_description TEXT DEFAULT NULL,
  p_stripe_payment_intent_id TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
) RETURNS TABLE (
  success BOOLEAN,
  new_balance_cents INTEGER,
  transaction_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_credits RECORD;
  v_balance_before INTEGER;
  v_balance_after INTEGER;
  v_tx_id UUID;
  v_idem_key TEXT;
BEGIN
  -- Generate idempotency key if not provided
  v_idem_key := COALESCE(
    p_idempotency_key,
    'add_' || COALESCE(p_stripe_payment_intent_id, gen_random_uuid()::TEXT)
  );

  -- Check for existing transaction with same idempotency key
  SELECT id INTO v_tx_id FROM credit_transactions
  WHERE idempotency_key = v_idem_key
  LIMIT 1;

  IF v_tx_id IS NOT NULL THEN
    -- Already processed, return existing data
    SELECT balance_cents INTO v_balance_after FROM organization_credits WHERE organization_id = p_organization_id;
    RETURN QUERY SELECT
      true AS success,
      COALESCE(v_balance_after, 0) AS new_balance_cents,
      v_tx_id AS transaction_id,
      'Already processed (idempotent)'::TEXT AS error_message;
    RETURN;
  END IF;

  -- Lock and get current credits
  SELECT * INTO v_credits
  FROM organization_credits
  WHERE organization_id = p_organization_id
  FOR UPDATE;

  -- Create credit record if doesn't exist
  IF v_credits IS NULL THEN
    INSERT INTO organization_credits (organization_id, balance_cents)
    VALUES (p_organization_id, 0)
    RETURNING * INTO v_credits;
  END IF;

  v_balance_before := v_credits.balance_cents;
  v_balance_after := v_credits.balance_cents + p_amount_cents;

  -- Update balance
  UPDATE organization_credits
  SET
    balance_cents = v_balance_after,
    last_recharge_at = NOW(),
    updated_at = NOW()
  WHERE organization_id = p_organization_id;

  -- Create transaction record
  INSERT INTO credit_transactions (
    organization_id,
    type,
    amount_cents,
    balance_before_cents,
    balance_after_cents,
    stripe_payment_intent_id,
    description,
    created_by,
    idempotency_key
  ) VALUES (
    p_organization_id,
    p_type,
    p_amount_cents,
    v_balance_before,
    v_balance_after,
    p_stripe_payment_intent_id,
    COALESCE(p_description, format('Credit %s: $%.2f', p_type, p_amount_cents / 100.0)),
    p_created_by,
    v_idem_key
  ) RETURNING id INTO v_tx_id;

  RETURN QUERY SELECT
    true AS success,
    v_balance_after AS new_balance_cents,
    v_tx_id AS transaction_id,
    NULL::TEXT AS error_message;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 10: Create view for organization credit status with reservations
-- ============================================================================

CREATE OR REPLACE VIEW organization_credit_status AS
SELECT
  o.id AS organization_id,
  o.name AS organization_name,
  o.billing_enabled,
  COALESCE(c.balance_cents, 0) AS balance_cents,
  COALESCE(c.reserved_balance_cents, 0) AS reserved_balance_cents,
  COALESCE(c.balance_cents, 0) - COALESCE(c.reserved_balance_cents, 0) AS available_balance_cents,
  COALESCE(c.balance_cents, 0) / 100.0 AS balance_dollars,
  (COALESCE(c.balance_cents, 0) - COALESCE(c.reserved_balance_cents, 0)) / 100.0 AS available_balance_dollars,
  COALESCE(c.cost_per_minute_cents, 15) AS cost_per_minute_cents,
  COALESCE(c.cost_per_minute_cents, 15) / 100.0 AS cost_per_minute_dollars,
  CASE
    WHEN c.cost_per_minute_cents > 0 THEN
      (COALESCE(c.balance_cents, 0) - COALESCE(c.reserved_balance_cents, 0)) / c.cost_per_minute_cents
    ELSE 0
  END AS minutes_remaining,
  c.low_balance_threshold_cents,
  c.cutoff_threshold_cents,
  c.auto_recharge_enabled,
  c.auto_recharge_trigger_cents,
  c.auto_recharge_amount_cents,
  c.allow_negative_balance,
  c.negative_balance_limit_cents,
  COALESCE(c.balance_cents, 0) <= COALESCE(c.low_balance_threshold_cents, 1000) AS is_low_balance,
  (COALESCE(c.balance_cents, 0) - COALESCE(c.reserved_balance_cents, 0)) <= COALESCE(c.cutoff_threshold_cents, 100) AS is_cutoff,
  c.last_recharge_at,
  c.last_deduction_at,
  c.stripe_payment_method_id IS NOT NULL AS has_payment_method
FROM organizations o
LEFT JOIN organization_credits c ON o.id = c.organization_id;

-- ============================================================================
-- STEP 11: Create indexes for performance
-- ============================================================================

-- Index for finding low balance orgs that need alerts
CREATE INDEX IF NOT EXISTS idx_org_credits_alert_needed
  ON organization_credits(organization_id, balance_cents, low_balance_threshold_cents, last_low_balance_alert_at)
  WHERE balance_cents <= low_balance_threshold_cents;

-- Index for finding orgs needing auto-recharge
CREATE INDEX IF NOT EXISTS idx_org_credits_auto_recharge_needed
  ON organization_credits(organization_id, balance_cents, auto_recharge_trigger_cents)
  WHERE auto_recharge_enabled = true;

-- Index for reservation lookups by call
CREATE INDEX IF NOT EXISTS idx_credit_tx_reservation_lookup
  ON credit_transactions(organization_id, call_log_id, type)
  WHERE type = 'reservation';

-- ============================================================================
-- DONE - Enterprise credit system enhancements complete
-- ============================================================================

COMMENT ON TABLE organization_credits IS
  'Enterprise prepaid credit system with reservation support, negative balance for trusted accounts, and auto-recharge.';

COMMENT ON TABLE credit_transactions IS
  'Immutable audit log of all credit operations with idempotency keys to prevent duplicates.';
