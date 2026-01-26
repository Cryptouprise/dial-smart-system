/**
 * Credit System Helpers - Enterprise Edition
 *
 * Shared functions for credit balance checking, reservation, and deduction.
 * Used by outbound-calling, retell-call-webhook, and voice-broadcast-engine.
 *
 * FEATURES:
 * - Pre-call credit reservation (prevents overspending during concurrent calls)
 * - Post-call cost finalization (releases reservation, deducts actual)
 * - Idempotent operations (safe to retry)
 * - Race condition prevention via FOR UPDATE locking
 * - Backward compatible (no-op when billing_enabled = false)
 *
 * FLOW:
 * 1. Before call: checkCreditBalance() → reserveCredits()
 * 2. After call: finalizeCallCost()
 * 3. On failure: releaseReservation() (optional, auto-released on finalize)
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ============================================================================
// INTERFACES
// ============================================================================

export interface BalanceCheckResult {
  canMakeCall: boolean;
  billingEnabled: boolean;
  currentBalanceCents: number;
  reservedBalanceCents: number;
  availableBalanceCents: number;
  requiredCents: number;
  costPerMinuteCents: number;
  allowNegative: boolean;
  negativeLimitCents: number;
  error?: string;
}

export interface ReservationResult {
  success: boolean;
  availableBalanceCents: number;
  reservedBalanceCents: number;
  reservationId?: string;
  error?: string;
}

export interface FinalizationResult {
  success: boolean;
  amountDeductedCents: number;
  newBalanceCents: number;
  reservationReleasedCents: number;
  marginCents: number;
  transactionId?: string;
  lowBalanceAlert: boolean;
  autoRechargeNeeded: boolean;
  error?: string;
}

export interface CreditStatusResult {
  organizationId: string;
  billingEnabled: boolean;
  balanceCents: number;
  reservedCents: number;
  availableCents: number;
  costPerMinuteCents: number;
  minutesRemaining: number;
  isLowBalance: boolean;
  isCutoff: boolean;
  autoRechargeEnabled: boolean;
  hasPaymentMethod: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Default estimated call cost for reservations (1 minute at default rate)
const DEFAULT_RESERVATION_CENTS = 15;

// Minimum seconds before we consider charging (avoid micro-charges for instant hangups)
const MIN_BILLABLE_SECONDS = 6;

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Check if organization has sufficient credits to make a call.
 *
 * Returns canMakeCall: true if:
 * - Billing is not enabled (backward compatible), OR
 * - Billing is enabled AND available balance >= required amount
 *
 * @param supabase - Supabase client (should be service role)
 * @param organizationId - Organization UUID
 * @param minutesNeeded - Estimated minutes for the call (default: 1)
 */
export async function checkCreditBalance(
  supabase: SupabaseClient,
  organizationId: string,
  minutesNeeded: number = 1
): Promise<BalanceCheckResult> {
  try {
    const { data, error } = await supabase.rpc('check_credit_balance', {
      p_organization_id: organizationId,
      p_minutes_needed: minutesNeeded
    });

    if (error) {
      console.error('[Credit Helpers] Balance check error:', error);
      // Fail open for backward compatibility
      return {
        canMakeCall: true,
        billingEnabled: false,
        currentBalanceCents: 0,
        reservedBalanceCents: 0,
        availableBalanceCents: 0,
        requiredCents: 0,
        costPerMinuteCents: 0,
        allowNegative: false,
        negativeLimitCents: 0,
        error: error.message
      };
    }

    const result = data?.[0] || {};

    return {
      canMakeCall: result.has_balance !== false,
      billingEnabled: result.billing_enabled || false,
      currentBalanceCents: result.current_balance_cents || 0,
      reservedBalanceCents: result.reserved_balance_cents || 0,
      availableBalanceCents: result.available_balance_cents || 0,
      requiredCents: result.required_cents || 0,
      costPerMinuteCents: result.cost_per_minute_cents || 15,
      allowNegative: result.allow_negative || false,
      negativeLimitCents: result.negative_limit_cents || 0,
      error: result.has_balance === false
        ? `Insufficient credits. Available: $${((result.available_balance_cents || 0) / 100).toFixed(2)}, Required: $${((result.required_cents || 0) / 100).toFixed(2)}`
        : undefined
    };
  } catch (err: any) {
    console.error('[Credit Helpers] Balance check exception:', err);
    // Fail open on exception
    return {
      canMakeCall: true,
      billingEnabled: false,
      currentBalanceCents: 0,
      reservedBalanceCents: 0,
      availableBalanceCents: 0,
      requiredCents: 0,
      costPerMinuteCents: 0,
      allowNegative: false,
      negativeLimitCents: 0,
      error: err.message
    };
  }
}

/**
 * Reserve credits BEFORE a call starts.
 *
 * This prevents overspending when multiple calls happen concurrently.
 * The reservation is released and actual cost deducted when finalizeCallCost() is called.
 *
 * IDEMPOTENT: Safe to call multiple times with the same retellCallId.
 *
 * @param supabase - Supabase client (should be service role)
 * @param organizationId - Organization UUID
 * @param estimatedCents - Estimated call cost in cents (default: 15 = $0.15)
 * @param callLogId - Optional call_log UUID for reference
 * @param retellCallId - Optional Retell call ID (used as idempotency key)
 */
export async function reserveCredits(
  supabase: SupabaseClient,
  organizationId: string,
  estimatedCents: number = DEFAULT_RESERVATION_CENTS,
  callLogId?: string,
  retellCallId?: string
): Promise<ReservationResult> {
  try {
    const { data, error } = await supabase.rpc('reserve_credits', {
      p_organization_id: organizationId,
      p_amount_cents: estimatedCents,
      p_call_log_id: callLogId || null,
      p_retell_call_id: retellCallId || null,
      p_idempotency_key: retellCallId ? `reserve_${retellCallId}` : null
    });

    if (error) {
      console.error('[Credit Helpers] Reservation error:', error);
      return {
        success: false,
        availableBalanceCents: 0,
        reservedBalanceCents: 0,
        error: error.message
      };
    }

    const result = data?.[0] || {};

    if (!result.success) {
      console.warn('[Credit Helpers] Reservation denied:', result.error_message);
    } else {
      console.log(`[Credit Helpers] Reserved ${estimatedCents} cents. Available: ${result.available_balance_cents}`);
    }

    return {
      success: result.success || false,
      availableBalanceCents: result.available_balance_cents || 0,
      reservedBalanceCents: result.reserved_balance_cents || 0,
      reservationId: result.reservation_id,
      error: result.error_message
    };
  } catch (err: any) {
    console.error('[Credit Helpers] Reservation exception:', err);
    return {
      success: false,
      availableBalanceCents: 0,
      reservedBalanceCents: 0,
      error: err.message
    };
  }
}

/**
 * Finalize call cost after a call completes.
 *
 * This function:
 * 1. Releases any reservation made for this call
 * 2. Deducts the actual cost based on minutes used
 * 3. Records the transaction with margin calculation
 * 4. Checks if low balance alert or auto-recharge is needed
 *
 * IDEMPOTENT: Safe to call multiple times for the same call.
 *
 * @param supabase - Supabase client (should be service role)
 * @param organizationId - Organization UUID
 * @param callLogId - Call log UUID
 * @param retellCallId - Retell call ID
 * @param durationSeconds - Call duration in seconds
 * @param retellCostCents - Optional actual Retell cost (if known from API)
 */
export async function finalizeCallCost(
  supabase: SupabaseClient,
  organizationId: string,
  callLogId: string,
  retellCallId: string,
  durationSeconds: number,
  retellCostCents?: number
): Promise<FinalizationResult> {
  try {
    // Skip very short calls (likely hangups/failures)
    if (durationSeconds < MIN_BILLABLE_SECONDS) {
      console.log(`[Credit Helpers] Call too short (${durationSeconds}s), skipping charge`);

      // Still release any reservation
      await supabase.rpc('finalize_call_cost', {
        p_organization_id: organizationId,
        p_call_log_id: callLogId,
        p_retell_call_id: retellCallId,
        p_actual_minutes: 0,
        p_retell_cost_cents: 0,
        p_idempotency_key: `finalize_${retellCallId}`
      });

      return {
        success: true,
        amountDeductedCents: 0,
        newBalanceCents: 0,
        reservationReleasedCents: 0,
        marginCents: 0,
        lowBalanceAlert: false,
        autoRechargeNeeded: false
      };
    }

    // Convert seconds to minutes (rounded up to nearest 0.1 min for fair billing)
    const minutesUsed = Math.ceil((durationSeconds / 60) * 10) / 10;

    const { data, error } = await supabase.rpc('finalize_call_cost', {
      p_organization_id: organizationId,
      p_call_log_id: callLogId,
      p_retell_call_id: retellCallId,
      p_actual_minutes: minutesUsed,
      p_retell_cost_cents: retellCostCents || null,
      p_idempotency_key: `finalize_${retellCallId}`
    });

    if (error) {
      console.error('[Credit Helpers] Finalization error:', error);
      return {
        success: false,
        amountDeductedCents: 0,
        newBalanceCents: 0,
        reservationReleasedCents: 0,
        marginCents: 0,
        lowBalanceAlert: false,
        autoRechargeNeeded: false,
        error: error.message
      };
    }

    const result = data?.[0] || {};

    if (!result.success && result.error_message && !result.error_message.includes('idempotent')) {
      console.error('[Credit Helpers] Finalization failed:', result.error_message);
    } else if (result.success) {
      console.log(`[Credit Helpers] Finalized: ${result.amount_deducted_cents}c deducted (${minutesUsed} min). New balance: ${result.new_balance_cents}c`);
    }

    // Check if we need low balance alert or auto-recharge
    let lowBalanceAlert = false;
    let autoRechargeNeeded = false;

    if (result.success && result.new_balance_cents !== undefined) {
      const { data: credits } = await supabase
        .from('organization_credits')
        .select('low_balance_threshold_cents, auto_recharge_enabled, auto_recharge_trigger_cents, last_low_balance_alert_at')
        .eq('organization_id', organizationId)
        .single();

      if (credits) {
        lowBalanceAlert = result.new_balance_cents <= (credits.low_balance_threshold_cents || 1000);
        autoRechargeNeeded = credits.auto_recharge_enabled &&
          result.new_balance_cents <= (credits.auto_recharge_trigger_cents || 500);

        // Only alert once per 24 hours
        if (lowBalanceAlert && credits.last_low_balance_alert_at) {
          const hoursSinceAlert = (Date.now() - new Date(credits.last_low_balance_alert_at).getTime()) / (1000 * 60 * 60);
          if (hoursSinceAlert < 24) {
            lowBalanceAlert = false;
          }
        }
      }
    }

    return {
      success: result.success || false,
      amountDeductedCents: result.amount_deducted_cents || 0,
      newBalanceCents: result.new_balance_cents || 0,
      reservationReleasedCents: result.reservation_released_cents || 0,
      marginCents: result.margin_cents || 0,
      transactionId: result.transaction_id,
      lowBalanceAlert,
      autoRechargeNeeded,
      error: result.error_message
    };
  } catch (err: any) {
    console.error('[Credit Helpers] Finalization exception:', err);
    return {
      success: false,
      amountDeductedCents: 0,
      newBalanceCents: 0,
      reservationReleasedCents: 0,
      marginCents: 0,
      lowBalanceAlert: false,
      autoRechargeNeeded: false,
      error: err.message
    };
  }
}

/**
 * Legacy function for backward compatibility.
 * Use finalizeCallCost() for new code.
 */
export async function deductCallCredits(
  supabase: SupabaseClient,
  organizationId: string,
  callLogId: string,
  minutesUsed: number,
  retellCostCents?: number
): Promise<{
  success: boolean;
  amountDeductedCents: number;
  newBalanceCents: number;
  transactionId?: string;
  lowBalanceAlert: boolean;
  error?: string;
}> {
  // Get retell_call_id from call_logs
  const { data: callLog } = await supabase
    .from('call_logs')
    .select('retell_call_id, duration_seconds')
    .eq('id', callLogId)
    .single();

  const result = await finalizeCallCost(
    supabase,
    organizationId,
    callLogId,
    callLog?.retell_call_id || callLogId,
    (callLog?.duration_seconds || minutesUsed * 60),
    retellCostCents
  );

  return {
    success: result.success,
    amountDeductedCents: result.amountDeductedCents,
    newBalanceCents: result.newBalanceCents,
    transactionId: result.transactionId,
    lowBalanceAlert: result.lowBalanceAlert,
    error: result.error
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get organization ID from user ID via organization_users table.
 */
export async function getOrganizationIdForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  try {
    const { data } = await supabase.rpc('get_organization_for_user', {
      p_user_id: userId
    });

    return data || null;
  } catch {
    // Fallback to direct query if function doesn't exist
    const { data } = await supabase
      .from('organization_users')
      .select('organization_id')
      .eq('user_id', userId)
      .limit(1)
      .single();

    return data?.organization_id || null;
  }
}

/**
 * Get organization ID from lead ID.
 */
export async function getOrganizationIdForLead(
  supabase: SupabaseClient,
  leadId: string
): Promise<string | null> {
  try {
    const { data } = await supabase.rpc('get_organization_for_lead', {
      p_lead_id: leadId
    });

    return data || null;
  } catch {
    // Fallback to direct query if function doesn't exist
    const { data } = await supabase
      .from('leads')
      .select('organization_id')
      .eq('id', leadId)
      .single();

    return data?.organization_id || null;
  }
}

/**
 * Get full credit status for an organization.
 */
export async function getCreditStatus(
  supabase: SupabaseClient,
  organizationId: string
): Promise<CreditStatusResult | null> {
  const { data, error } = await supabase
    .from('organization_credit_status')
    .select('*')
    .eq('organization_id', organizationId)
    .single();

  if (error || !data) {
    console.error('[Credit Helpers] Status fetch error:', error);
    return null;
  }

  return {
    organizationId: data.organization_id,
    billingEnabled: data.billing_enabled || false,
    balanceCents: data.balance_cents || 0,
    reservedCents: data.reserved_balance_cents || 0,
    availableCents: data.available_balance_cents || 0,
    costPerMinuteCents: data.cost_per_minute_cents || 15,
    minutesRemaining: data.minutes_remaining || 0,
    isLowBalance: data.is_low_balance || false,
    isCutoff: data.is_cutoff || false,
    autoRechargeEnabled: data.auto_recharge_enabled || false,
    hasPaymentMethod: data.has_payment_method || false
  };
}

/**
 * Update low balance alert timestamp.
 */
export async function markLowBalanceAlertSent(
  supabase: SupabaseClient,
  organizationId: string
): Promise<void> {
  await supabase
    .from('organization_credits')
    .update({ last_low_balance_alert_at: new Date().toISOString() })
    .eq('organization_id', organizationId);
}

/**
 * Check if auto-recharge is needed and return payment info.
 */
export async function checkAutoRecharge(
  supabase: SupabaseClient,
  organizationId: string
): Promise<{
  needsRecharge: boolean;
  currentBalanceCents: number;
  rechargeAmountCents: number;
  paymentMethodId: string | null;
}> {
  const { data, error } = await supabase.rpc('check_auto_recharge', {
    p_organization_id: organizationId
  });

  if (error || !data?.[0]) {
    return {
      needsRecharge: false,
      currentBalanceCents: 0,
      rechargeAmountCents: 0,
      paymentMethodId: null
    };
  }

  const result = data[0];
  return {
    needsRecharge: result.needs_recharge || false,
    currentBalanceCents: result.current_balance_cents || 0,
    rechargeAmountCents: result.recharge_amount_cents || 0,
    paymentMethodId: result.payment_method_id || null
  };
}

// ============================================================================
// BROADCAST/CAMPAIGN HELPERS
// ============================================================================

/**
 * Check if organization has sufficient credits for a batch of calls.
 * Used by voice-broadcast-engine before dispatching a batch.
 *
 * @param supabase - Supabase client
 * @param organizationId - Organization UUID
 * @param callCount - Number of calls in the batch
 * @param estimatedMinutesPerCall - Estimated minutes per call (default: 2)
 */
export async function checkBatchCredits(
  supabase: SupabaseClient,
  organizationId: string,
  callCount: number,
  estimatedMinutesPerCall: number = 2
): Promise<{
  canProceed: boolean;
  availableBalanceCents: number;
  estimatedCostCents: number;
  callsAffordable: number;
  error?: string;
}> {
  const totalMinutes = callCount * estimatedMinutesPerCall;
  const check = await checkCreditBalance(supabase, organizationId, totalMinutes);

  if (!check.billingEnabled) {
    // Billing not enabled, always proceed
    return {
      canProceed: true,
      availableBalanceCents: 0,
      estimatedCostCents: 0,
      callsAffordable: callCount
    };
  }

  const estimatedCostCents = totalMinutes * check.costPerMinuteCents;
  const callsAffordable = Math.floor(check.availableBalanceCents / (estimatedMinutesPerCall * check.costPerMinuteCents));

  return {
    canProceed: check.canMakeCall,
    availableBalanceCents: check.availableBalanceCents,
    estimatedCostCents,
    callsAffordable,
    error: check.error
  };
}
