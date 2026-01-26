-- ============================================================================
-- WHITE-LABEL CREDIT SYSTEM MIGRATION
-- Created: January 24, 2026
-- Purpose: Add prepaid credit system for white-label reselling
--
-- BACKWARD COMPATIBLE: All changes are additive. Existing functionality
-- is preserved. Features activate only when organization.billing_enabled = true
-- ============================================================================

-- ============================================================================
-- STEP 1: Add billing fields to organizations table
-- ============================================================================

-- Add billing configuration to organizations (nullable, backward compatible)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_enabled BOOLEAN DEFAULT false;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_email TEXT;

COMMENT ON COLUMN organizations.billing_enabled IS 'When true, credit balance is checked before calls and deducted after';
COMMENT ON COLUMN organizations.stripe_customer_id IS 'Stripe customer ID for payment processing';
COMMENT ON COLUMN organizations.billing_email IS 'Email for billing notifications';

-- ============================================================================
-- STEP 2: Create organization_credits table
-- ============================================================================

CREATE TABLE IF NOT EXISTS organization_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Balance tracking (in cents to avoid floating point issues)
  balance_cents INTEGER NOT NULL DEFAULT 0,

  -- Pricing configuration (cents per minute)
  cost_per_minute_cents INTEGER NOT NULL DEFAULT 15,        -- What we charge client ($0.15/min default)
  retell_cost_per_minute_cents INTEGER NOT NULL DEFAULT 7,  -- Our cost from Retell ($0.07/min default)

  -- Thresholds (in cents)
  low_balance_threshold_cents INTEGER DEFAULT 1000,         -- Alert when below $10
  cutoff_threshold_cents INTEGER DEFAULT 100,               -- Block calls when below $1

  -- Auto-recharge settings
  auto_recharge_enabled BOOLEAN DEFAULT false,
  auto_recharge_amount_cents INTEGER DEFAULT 5000,          -- Add $50 when triggered
  auto_recharge_trigger_cents INTEGER DEFAULT 500,          -- Trigger when balance hits $5

  -- Timestamps
  last_recharge_at TIMESTAMPTZ,
  last_deduction_at TIMESTAMPTZ,
  last_low_balance_alert_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_org_credits UNIQUE (organization_id),
  CONSTRAINT positive_balance CHECK (balance_cents >= 0),
  CONSTRAINT positive_cost CHECK (cost_per_minute_cents > 0),
  CONSTRAINT valid_thresholds CHECK (low_balance_threshold_cents >= cutoff_threshold_cents)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_org_credits_org_id ON organization_credits(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_credits_balance ON organization_credits(balance_cents);
CREATE INDEX IF NOT EXISTS idx_org_credits_low_balance ON organization_credits(balance_cents)
  WHERE balance_cents <= low_balance_threshold_cents;

-- Enable RLS
ALTER TABLE organization_credits ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users view their org credits"
  ON organization_credits FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "Admins update their org credits"
  ON organization_credits FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM organization_users
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

-- Service role can do everything (for edge functions)
CREATE POLICY "Service role full access to credits"
  ON organization_credits FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- STEP 3: Create credit_transactions table (audit log)
-- ============================================================================

CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Transaction type
  type TEXT NOT NULL CHECK (type IN (
    'deposit',        -- Manual credit addition
    'deduction',      -- Call usage deduction
    'refund',         -- Refund for failed calls
    'adjustment',     -- Manual adjustment
    'auto_recharge',  -- Automatic Stripe charge
    'stripe_payment'  -- Stripe payment received
  )),

  -- Amount (positive for deposits, negative for deductions)
  amount_cents INTEGER NOT NULL,

  -- Balance snapshot for audit trail
  balance_before_cents INTEGER NOT NULL,
  balance_after_cents INTEGER NOT NULL,

  -- Reference data
  call_log_id UUID REFERENCES call_logs(id),
  stripe_payment_intent_id TEXT,
  stripe_invoice_id TEXT,
  description TEXT,

  -- Cost breakdown for deductions
  minutes_used DECIMAL(10,4),
  retell_cost_cents INTEGER,
  margin_cents INTEGER,

  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_credit_tx_org_id ON credit_transactions(organization_id);
CREATE INDEX IF NOT EXISTS idx_credit_tx_type ON credit_transactions(type);
CREATE INDEX IF NOT EXISTS idx_credit_tx_created ON credit_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_tx_call ON credit_transactions(call_log_id) WHERE call_log_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_credit_tx_stripe ON credit_transactions(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;

-- Enable RLS
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies (read-only for users, full for service role)
CREATE POLICY "Users view their org transactions"
  ON credit_transactions FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "Service role full access to transactions"
  ON credit_transactions FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- STEP 4: Create usage_summaries table (aggregated reporting)
-- ============================================================================

CREATE TABLE IF NOT EXISTS usage_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Period definition
  period_type TEXT NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Call metrics
  total_calls INTEGER DEFAULT 0,
  total_minutes DECIMAL(10,2) DEFAULT 0,

  -- Cost metrics (cents)
  total_billed_cents INTEGER DEFAULT 0,       -- What client paid
  total_retell_cost_cents INTEGER DEFAULT 0,  -- Our actual cost
  total_margin_cents INTEGER DEFAULT 0,       -- Our profit

  -- Call outcome breakdown
  calls_completed INTEGER DEFAULT 0,
  calls_voicemail INTEGER DEFAULT 0,
  calls_no_answer INTEGER DEFAULT 0,
  calls_failed INTEGER DEFAULT 0,
  calls_busy INTEGER DEFAULT 0,

  -- Averages
  avg_call_duration_seconds DECIMAL(10,2),
  avg_cost_per_call_cents DECIMAL(10,2),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_usage_period UNIQUE (organization_id, period_type, period_start)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_usage_org ON usage_summaries(organization_id);
CREATE INDEX IF NOT EXISTS idx_usage_period ON usage_summaries(period_start DESC);
CREATE INDEX IF NOT EXISTS idx_usage_type_period ON usage_summaries(organization_id, period_type, period_start DESC);

-- Enable RLS
ALTER TABLE usage_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their org usage"
  ON usage_summaries FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "Service role full access to usage"
  ON usage_summaries FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- STEP 5: Add cost tracking columns to call_logs (nullable, backward compatible)
-- ============================================================================

ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS retell_cost_cents INTEGER;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS billed_cost_cents INTEGER;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS cost_breakdown JSONB;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS token_usage JSONB;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS credit_deducted BOOLEAN DEFAULT false;

COMMENT ON COLUMN call_logs.retell_cost_cents IS 'Actual cost from Retell API (in cents)';
COMMENT ON COLUMN call_logs.billed_cost_cents IS 'Amount billed to client (in cents)';
COMMENT ON COLUMN call_logs.cost_breakdown IS 'Detailed cost breakdown from Retell';
COMMENT ON COLUMN call_logs.token_usage IS 'LLM token usage data from Retell';
COMMENT ON COLUMN call_logs.credit_deducted IS 'Whether credits have been deducted for this call';

-- Index for finding calls that need credit deduction
CREATE INDEX IF NOT EXISTS idx_call_logs_credit_pending
  ON call_logs(organization_id, created_at)
  WHERE credit_deducted = false AND status = 'completed';

-- ============================================================================
-- STEP 6: Helper functions for credit management
-- ============================================================================

-- Function to check if organization has sufficient credits
CREATE OR REPLACE FUNCTION check_credit_balance(
  p_organization_id UUID,
  p_minutes_needed DECIMAL DEFAULT 1
) RETURNS TABLE (
  has_balance BOOLEAN,
  current_balance_cents INTEGER,
  cost_per_minute_cents INTEGER,
  required_cents INTEGER,
  billing_enabled BOOLEAN
) AS $$
DECLARE
  v_org RECORD;
  v_credits RECORD;
  v_required_cents INTEGER;
BEGIN
  -- Get organization billing status
  SELECT billing_enabled INTO v_org FROM organizations WHERE id = p_organization_id;

  -- If billing not enabled, always return true
  IF NOT COALESCE(v_org.billing_enabled, false) THEN
    RETURN QUERY SELECT
      true AS has_balance,
      0 AS current_balance_cents,
      0 AS cost_per_minute_cents,
      0 AS required_cents,
      false AS billing_enabled;
    RETURN;
  END IF;

  -- Get credit info
  SELECT * INTO v_credits FROM organization_credits WHERE organization_id = p_organization_id;

  -- If no credit record, treat as zero balance
  IF v_credits IS NULL THEN
    RETURN QUERY SELECT
      false AS has_balance,
      0 AS current_balance_cents,
      15 AS cost_per_minute_cents, -- default rate
      CEIL(p_minutes_needed * 15)::INTEGER AS required_cents,
      true AS billing_enabled;
    RETURN;
  END IF;

  -- Calculate required amount
  v_required_cents := CEIL(p_minutes_needed * v_credits.cost_per_minute_cents);

  RETURN QUERY SELECT
    (v_credits.balance_cents >= GREATEST(v_required_cents, v_credits.cutoff_threshold_cents)) AS has_balance,
    v_credits.balance_cents AS current_balance_cents,
    v_credits.cost_per_minute_cents,
    v_required_cents AS required_cents,
    true AS billing_enabled;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to deduct credits after a call
CREATE OR REPLACE FUNCTION deduct_call_credits(
  p_organization_id UUID,
  p_call_log_id UUID,
  p_minutes_used DECIMAL,
  p_retell_cost_cents INTEGER DEFAULT NULL
) RETURNS TABLE (
  success BOOLEAN,
  amount_deducted_cents INTEGER,
  new_balance_cents INTEGER,
  transaction_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_credits RECORD;
  v_org RECORD;
  v_deduction_cents INTEGER;
  v_margin_cents INTEGER;
  v_balance_before INTEGER;
  v_balance_after INTEGER;
  v_tx_id UUID;
BEGIN
  -- Get organization
  SELECT billing_enabled INTO v_org FROM organizations WHERE id = p_organization_id;

  -- If billing not enabled, skip deduction
  IF NOT COALESCE(v_org.billing_enabled, false) THEN
    RETURN QUERY SELECT
      true AS success,
      0 AS amount_deducted_cents,
      0 AS new_balance_cents,
      NULL::UUID AS transaction_id,
      'Billing not enabled' AS error_message;
    RETURN;
  END IF;

  -- Lock the credit record for update
  SELECT * INTO v_credits
  FROM organization_credits
  WHERE organization_id = p_organization_id
  FOR UPDATE;

  IF v_credits IS NULL THEN
    RETURN QUERY SELECT
      false AS success,
      0 AS amount_deducted_cents,
      0 AS new_balance_cents,
      NULL::UUID AS transaction_id,
      'No credit record found' AS error_message;
    RETURN;
  END IF;

  -- Calculate deduction
  v_deduction_cents := CEIL(p_minutes_used * v_credits.cost_per_minute_cents);
  v_balance_before := v_credits.balance_cents;
  v_balance_after := GREATEST(0, v_credits.balance_cents - v_deduction_cents);

  -- Calculate margin if we know Retell cost
  IF p_retell_cost_cents IS NOT NULL THEN
    v_margin_cents := v_deduction_cents - p_retell_cost_cents;
  ELSE
    v_margin_cents := v_deduction_cents - CEIL(p_minutes_used * v_credits.retell_cost_per_minute_cents);
  END IF;

  -- Update balance
  UPDATE organization_credits
  SET
    balance_cents = v_balance_after,
    last_deduction_at = NOW(),
    updated_at = NOW()
  WHERE organization_id = p_organization_id;

  -- Create transaction record
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
    description
  ) VALUES (
    p_organization_id,
    'deduction',
    -v_deduction_cents,
    v_balance_before,
    v_balance_after,
    p_call_log_id,
    p_minutes_used,
    COALESCE(p_retell_cost_cents, CEIL(p_minutes_used * v_credits.retell_cost_per_minute_cents)),
    v_margin_cents,
    format('Call usage: %.2f minutes', p_minutes_used)
  ) RETURNING id INTO v_tx_id;

  -- Mark call as credit deducted
  UPDATE call_logs
  SET
    credit_deducted = true,
    billed_cost_cents = v_deduction_cents
  WHERE id = p_call_log_id;

  RETURN QUERY SELECT
    true AS success,
    v_deduction_cents AS amount_deducted_cents,
    v_balance_after AS new_balance_cents,
    v_tx_id AS transaction_id,
    NULL::TEXT AS error_message;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to add credits (deposit)
CREATE OR REPLACE FUNCTION add_credits(
  p_organization_id UUID,
  p_amount_cents INTEGER,
  p_type TEXT DEFAULT 'deposit',
  p_description TEXT DEFAULT NULL,
  p_stripe_payment_intent_id TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
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
BEGIN
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
    created_by
  ) VALUES (
    p_organization_id,
    p_type,
    p_amount_cents,
    v_balance_before,
    v_balance_after,
    p_stripe_payment_intent_id,
    COALESCE(p_description, format('Credit %s: $%.2f', p_type, p_amount_cents / 100.0)),
    p_created_by
  ) RETURNING id INTO v_tx_id;

  RETURN QUERY SELECT
    true AS success,
    v_balance_after AS new_balance_cents,
    v_tx_id AS transaction_id,
    NULL::TEXT AS error_message;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 7: Trigger for updating usage_summaries
-- ============================================================================

CREATE OR REPLACE FUNCTION update_daily_usage_summary() RETURNS TRIGGER AS $$
DECLARE
  v_period_start DATE;
  v_org_id UUID;
BEGIN
  -- Only process completed calls with organization
  IF NEW.status NOT IN ('completed', 'failed') OR NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_org_id := NEW.organization_id;
  v_period_start := DATE(NEW.created_at);

  -- Upsert daily summary
  INSERT INTO usage_summaries (
    organization_id,
    period_type,
    period_start,
    period_end,
    total_calls,
    total_minutes,
    total_billed_cents,
    total_retell_cost_cents,
    total_margin_cents,
    calls_completed,
    calls_voicemail,
    calls_no_answer,
    calls_failed,
    calls_busy
  ) VALUES (
    v_org_id,
    'daily',
    v_period_start,
    v_period_start,
    1,
    COALESCE(NEW.duration_seconds, 0) / 60.0,
    COALESCE(NEW.billed_cost_cents, 0),
    COALESCE(NEW.retell_cost_cents, 0),
    COALESCE(NEW.billed_cost_cents, 0) - COALESCE(NEW.retell_cost_cents, 0),
    CASE WHEN NEW.outcome IN ('completed', 'contacted', 'interested', 'appointment_set') THEN 1 ELSE 0 END,
    CASE WHEN NEW.outcome = 'voicemail' THEN 1 ELSE 0 END,
    CASE WHEN NEW.outcome = 'no_answer' THEN 1 ELSE 0 END,
    CASE WHEN NEW.outcome = 'failed' THEN 1 ELSE 0 END,
    CASE WHEN NEW.outcome = 'busy' THEN 1 ELSE 0 END
  )
  ON CONFLICT (organization_id, period_type, period_start)
  DO UPDATE SET
    total_calls = usage_summaries.total_calls + 1,
    total_minutes = usage_summaries.total_minutes + COALESCE(NEW.duration_seconds, 0) / 60.0,
    total_billed_cents = usage_summaries.total_billed_cents + COALESCE(NEW.billed_cost_cents, 0),
    total_retell_cost_cents = usage_summaries.total_retell_cost_cents + COALESCE(NEW.retell_cost_cents, 0),
    total_margin_cents = usage_summaries.total_margin_cents + (COALESCE(NEW.billed_cost_cents, 0) - COALESCE(NEW.retell_cost_cents, 0)),
    calls_completed = usage_summaries.calls_completed + CASE WHEN NEW.outcome IN ('completed', 'contacted', 'interested', 'appointment_set') THEN 1 ELSE 0 END,
    calls_voicemail = usage_summaries.calls_voicemail + CASE WHEN NEW.outcome = 'voicemail' THEN 1 ELSE 0 END,
    calls_no_answer = usage_summaries.calls_no_answer + CASE WHEN NEW.outcome = 'no_answer' THEN 1 ELSE 0 END,
    calls_failed = usage_summaries.calls_failed + CASE WHEN NEW.outcome = 'failed' THEN 1 ELSE 0 END,
    calls_busy = usage_summaries.calls_busy + CASE WHEN NEW.outcome = 'busy' THEN 1 ELSE 0 END,
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (only if doesn't exist)
DROP TRIGGER IF EXISTS trigger_update_usage_summary ON call_logs;
CREATE TRIGGER trigger_update_usage_summary
  AFTER INSERT OR UPDATE OF status, outcome, duration_seconds, billed_cost_cents
  ON call_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_daily_usage_summary();

-- ============================================================================
-- STEP 8: Views for easy querying
-- ============================================================================

-- Organization credit status view
CREATE OR REPLACE VIEW organization_credit_status AS
SELECT
  o.id AS organization_id,
  o.name AS organization_name,
  o.billing_enabled,
  COALESCE(c.balance_cents, 0) AS balance_cents,
  COALESCE(c.balance_cents, 0) / 100.0 AS balance_dollars,
  COALESCE(c.cost_per_minute_cents, 15) AS cost_per_minute_cents,
  COALESCE(c.cost_per_minute_cents, 15) / 100.0 AS cost_per_minute_dollars,
  COALESCE(c.balance_cents, 0) / NULLIF(c.cost_per_minute_cents, 0) AS minutes_remaining,
  c.low_balance_threshold_cents,
  c.cutoff_threshold_cents,
  c.auto_recharge_enabled,
  COALESCE(c.balance_cents, 0) <= COALESCE(c.low_balance_threshold_cents, 1000) AS is_low_balance,
  COALESCE(c.balance_cents, 0) <= COALESCE(c.cutoff_threshold_cents, 100) AS is_cutoff,
  c.last_recharge_at,
  c.last_deduction_at
FROM organizations o
LEFT JOIN organization_credits c ON o.id = c.organization_id;

-- ============================================================================
-- DONE
-- ============================================================================

COMMENT ON TABLE organization_credits IS 'Tracks prepaid credit balance for white-label billing';
COMMENT ON TABLE credit_transactions IS 'Audit log of all credit additions and deductions';
COMMENT ON TABLE usage_summaries IS 'Aggregated usage metrics by organization and time period';
