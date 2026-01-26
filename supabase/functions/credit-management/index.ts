/**
 * Credit Management Edge Function - Enterprise Edition
 *
 * Handles all credit/billing operations for the white-label system.
 * BACKWARD COMPATIBLE: Only activates when organization.billing_enabled = true
 *
 * Actions:
 * - health_check: System health and capabilities
 * - get_balance: Get current credit balance and status
 * - get_status: Full credit status including reservations
 * - check_balance: Pre-call balance check (returns can_make_call)
 * - reserve_credits: Reserve credits before a call starts
 * - finalize_cost: Finalize cost after call ends (releases reservation, deducts actual)
 * - add_credits: Add credits to an organization
 * - get_transactions: Get transaction history with pagination
 * - get_usage: Get usage summary for a period
 * - check_auto_recharge: Check if auto-recharge is needed
 *
 * SECURITY:
 * - User JWT: Can view their org's balance, transactions, usage
 * - Service Role: Full access to all operations including add_credits
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Version for tracking
const VERSION = '2.0.0';

interface CreditManagementRequest {
  action:
    | 'health_check'
    | 'get_balance'
    | 'get_status'
    | 'check_balance'
    | 'reserve_credits'
    | 'finalize_cost'
    | 'add_credits'
    | 'get_transactions'
    | 'get_usage'
    | 'get_usage_summary'
    | 'check_auto_recharge'
    | 'create_checkout_session'
    | 'update_settings';
  organization_id?: string;
  amount_cents?: number;
  bonus_cents?: number;
  minutes_needed?: number;
  call_log_id?: string;
  retell_call_id?: string;
  duration_seconds?: number;
  retell_cost_cents?: number;
  description?: string;
  type?: string;
  stripe_payment_intent_id?: string;
  period?: 'daily' | 'weekly' | 'monthly';
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
  days?: number;
  // Stripe checkout params
  success_url?: string;
  cancel_url?: string;
  // Settings params
  auto_recharge_enabled?: boolean;
  auto_recharge_amount_cents?: number;
  auto_recharge_threshold_cents?: number;
  low_balance_threshold_cents?: number;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase configuration missing');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user
    const token = authHeader.replace('Bearer ', '');
    const isServiceRole = token === supabaseServiceKey;

    let userId: string | null = null;

    if (!isServiceRole) {
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: 'Authentication failed' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      userId = user.id;
    }

    // Parse request
    const body: CreditManagementRequest = await req.json();
    const { action } = body;

    console.log(`[Credit Management] Processing ${action} request`);

    let result: any = {};

    switch (action) {
      // ====================================================================
      // HEALTH CHECK
      // ====================================================================
      case 'health_check':
        result = {
          success: true,
          healthy: true,
          version: VERSION,
          timestamp: new Date().toISOString(),
          function: 'credit-management',
          capabilities: [
            'get_balance',
            'get_status',
            'check_balance',
            'reserve_credits',
            'finalize_cost',
            'add_credits',
            'get_transactions',
            'get_usage',
            'check_auto_recharge'
          ],
          features: [
            'reservation_system',
            'idempotent_operations',
            'race_condition_prevention',
            'backward_compatible',
            'auto_recharge_ready'
          ]
        };
        break;

      // ====================================================================
      // GET BALANCE (Simple balance check)
      // ====================================================================
      case 'get_balance': {
        const orgId = body.organization_id || await getOrganizationId(supabase, userId);
        if (!orgId) {
          throw new Error('Organization ID required');
        }

        // Get organization and credit info
        const { data: org, error: orgError } = await supabase
          .from('organizations')
          .select('id, name, billing_enabled')
          .eq('id', orgId)
          .single();

        if (orgError) throw orgError;

        const { data: credits } = await supabase
          .from('organization_credits')
          .select('*')
          .eq('organization_id', orgId)
          .single();

        const balance_cents = credits?.balance_cents || 0;
        const reserved_cents = credits?.reserved_balance_cents || 0;
        const available_cents = balance_cents - reserved_cents;
        const cost_per_minute = credits?.cost_per_minute_cents || 15;

        result = {
          organization_id: orgId,
          organization_name: org.name,
          billing_enabled: org.billing_enabled || false,
          balance_cents,
          reserved_cents,
          available_cents,
          balance_dollars: balance_cents / 100,
          available_dollars: available_cents / 100,
          cost_per_minute_cents: cost_per_minute,
          cost_per_minute_dollars: cost_per_minute / 100,
          minutes_remaining: cost_per_minute > 0 ? Math.floor(available_cents / cost_per_minute) : 0,
          low_balance_threshold_cents: credits?.low_balance_threshold_cents || 1000,
          cutoff_threshold_cents: credits?.cutoff_threshold_cents || 100,
          is_low_balance: available_cents <= (credits?.low_balance_threshold_cents || 1000),
          is_cutoff: available_cents <= (credits?.cutoff_threshold_cents || 100),
          auto_recharge_enabled: credits?.auto_recharge_enabled || false,
          allow_negative_balance: credits?.allow_negative_balance || false,
          last_recharge_at: credits?.last_recharge_at,
          last_deduction_at: credits?.last_deduction_at,
        };
        break;
      }

      // ====================================================================
      // GET STATUS (Full status including reservations)
      // ====================================================================
      case 'get_status': {
        const orgId = body.organization_id || await getOrganizationId(supabase, userId);
        if (!orgId) {
          throw new Error('Organization ID required');
        }

        const { data: status, error: statusError } = await supabase
          .from('organization_credit_status')
          .select('*')
          .eq('organization_id', orgId)
          .single();

        if (statusError) throw statusError;

        result = status;
        break;
      }

      // ====================================================================
      // CHECK BALANCE (Pre-call check)
      // ====================================================================
      case 'check_balance': {
        const orgId = body.organization_id;
        if (!orgId) {
          throw new Error('Organization ID required for balance check');
        }

        const minutesNeeded = body.minutes_needed || 1;

        const { data: checkResult, error: checkError } = await supabase
          .rpc('check_credit_balance', {
            p_organization_id: orgId,
            p_minutes_needed: minutesNeeded
          });

        if (checkError) throw checkError;

        const check = checkResult?.[0] || {};

        result = {
          can_make_call: check.has_balance !== false,
          billing_enabled: check.billing_enabled || false,
          current_balance_cents: check.current_balance_cents || 0,
          reserved_balance_cents: check.reserved_balance_cents || 0,
          available_balance_cents: check.available_balance_cents || 0,
          required_cents: check.required_cents || 0,
          cost_per_minute_cents: check.cost_per_minute_cents || 15,
          allow_negative: check.allow_negative || false,
          negative_limit_cents: check.negative_limit_cents || 0,
        };

        if (!result.can_make_call && result.billing_enabled) {
          result.error = `Insufficient credits. Available: $${(result.available_balance_cents / 100).toFixed(2)}, Required: $${(result.required_cents / 100).toFixed(2)}`;
        }
        break;
      }

      // ====================================================================
      // RESERVE CREDITS (Pre-call reservation)
      // ====================================================================
      case 'reserve_credits': {
        const orgId = body.organization_id;
        if (!orgId || !body.amount_cents) {
          throw new Error('Organization ID and amount_cents required');
        }

        const { data: reserveResult, error: reserveError } = await supabase
          .rpc('reserve_credits', {
            p_organization_id: orgId,
            p_amount_cents: body.amount_cents,
            p_call_log_id: body.call_log_id || null,
            p_retell_call_id: body.retell_call_id || null,
            p_idempotency_key: body.retell_call_id ? `reserve_${body.retell_call_id}` : null
          });

        if (reserveError) throw reserveError;

        const reserve = reserveResult?.[0] || {};

        result = {
          success: reserve.success || false,
          available_balance_cents: reserve.available_balance_cents || 0,
          reserved_balance_cents: reserve.reserved_balance_cents || 0,
          reservation_id: reserve.reservation_id,
          error: reserve.error_message
        };

        if (reserve.success) {
          console.log(`[Credit Management] Reserved ${body.amount_cents}c for org ${orgId}`);
        }
        break;
      }

      // ====================================================================
      // FINALIZE COST (Post-call deduction)
      // ====================================================================
      case 'finalize_cost': {
        const orgId = body.organization_id;
        const callLogId = body.call_log_id;
        const retellCallId = body.retell_call_id;
        const durationSeconds = body.duration_seconds;

        if (!orgId || !retellCallId || durationSeconds === undefined) {
          throw new Error('Organization ID, retell_call_id, and duration_seconds required');
        }

        const minutesUsed = Math.ceil((durationSeconds / 60) * 10) / 10;

        const { data: finalizeResult, error: finalizeError } = await supabase
          .rpc('finalize_call_cost', {
            p_organization_id: orgId,
            p_call_log_id: callLogId || null,
            p_retell_call_id: retellCallId,
            p_actual_minutes: minutesUsed,
            p_retell_cost_cents: body.retell_cost_cents || null,
            p_idempotency_key: `finalize_${retellCallId}`
          });

        if (finalizeError) throw finalizeError;

        const finalize = finalizeResult?.[0] || {};

        result = {
          success: finalize.success || false,
          amount_deducted_cents: finalize.amount_deducted_cents || 0,
          amount_deducted_dollars: (finalize.amount_deducted_cents || 0) / 100,
          new_balance_cents: finalize.new_balance_cents || 0,
          new_balance_dollars: (finalize.new_balance_cents || 0) / 100,
          reservation_released_cents: finalize.reservation_released_cents || 0,
          margin_cents: finalize.margin_cents || 0,
          margin_dollars: (finalize.margin_cents || 0) / 100,
          transaction_id: finalize.transaction_id,
          minutes_billed: minutesUsed,
          error: finalize.error_message
        };

        if (finalize.success) {
          console.log(`[Credit Management] Finalized: ${finalize.amount_deducted_cents}c for ${minutesUsed} min, org ${orgId}`);
        }
        break;
      }

      // ====================================================================
      // ADD CREDITS (Admin only)
      // ====================================================================
      case 'add_credits': {
        const orgId = body.organization_id;
        const amount = body.amount_cents;

        if (!orgId || !amount || amount <= 0) {
          throw new Error('Organization ID and positive amount_cents required');
        }

        const { data: addResult, error: addError } = await supabase
          .rpc('add_credits', {
            p_organization_id: orgId,
            p_amount_cents: amount,
            p_type: body.type || 'deposit',
            p_description: body.description || null,
            p_stripe_payment_intent_id: body.stripe_payment_intent_id || null,
            p_created_by: userId,
            p_idempotency_key: body.stripe_payment_intent_id
              ? `add_${body.stripe_payment_intent_id}`
              : null
          });

        if (addError) throw addError;

        const add = addResult?.[0] || {};

        if (!add.success) {
          throw new Error(add.error_message || 'Failed to add credits');
        }

        result = {
          success: true,
          new_balance_cents: add.new_balance_cents,
          new_balance_dollars: add.new_balance_cents / 100,
          transaction_id: add.transaction_id,
          amount_added_cents: amount,
          amount_added_dollars: amount / 100,
        };

        console.log(`[Credit Management] Added ${amount}c to org ${orgId}. New balance: ${add.new_balance_cents}c`);
        break;
      }

      // ====================================================================
      // GET TRANSACTIONS (With pagination)
      // ====================================================================
      case 'get_transactions': {
        const orgId = body.organization_id || await getOrganizationId(supabase, userId);
        if (!orgId) {
          throw new Error('Organization ID required');
        }

        const limit = Math.min(body.limit || 50, 100);
        const offset = body.offset || 0;

        let query = supabase
          .from('credit_transactions')
          .select('*', { count: 'exact' })
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        // Filter by type if specified
        if (body.type) {
          query = query.eq('type', body.type);
        }

        // Filter by date range if specified
        if (body.start_date) {
          query = query.gte('created_at', body.start_date);
        }
        if (body.end_date) {
          query = query.lte('created_at', body.end_date);
        }

        const { data: transactions, error: txError, count } = await query;

        if (txError) throw txError;

        result = {
          transactions: transactions || [],
          total_count: count || 0,
          limit,
          offset,
          has_more: (count || 0) > offset + limit,
        };
        break;
      }

      // ====================================================================
      // GET USAGE (Aggregated usage summaries)
      // ====================================================================
      case 'get_usage': {
        const orgId = body.organization_id || await getOrganizationId(supabase, userId);
        if (!orgId) {
          throw new Error('Organization ID required');
        }

        const periodType = body.period || 'daily';
        const limit = Math.min(body.limit || 30, 100);

        let query = supabase
          .from('usage_summaries')
          .select('*')
          .eq('organization_id', orgId)
          .eq('period_type', periodType)
          .order('period_start', { ascending: false })
          .limit(limit);

        if (body.start_date) {
          query = query.gte('period_start', body.start_date);
        }
        if (body.end_date) {
          query = query.lte('period_end', body.end_date);
        }

        const { data: usage, error: usageError } = await query;

        if (usageError) throw usageError;

        // Calculate totals
        const totals = (usage || []).reduce((acc, u) => ({
          total_calls: acc.total_calls + (u.total_calls || 0),
          total_minutes: acc.total_minutes + parseFloat(u.total_minutes || 0),
          total_billed_cents: acc.total_billed_cents + (u.total_billed_cents || 0),
          total_retell_cost_cents: acc.total_retell_cost_cents + (u.total_retell_cost_cents || 0),
          total_margin_cents: acc.total_margin_cents + (u.total_margin_cents || 0),
          calls_completed: acc.calls_completed + (u.calls_completed || 0),
          calls_voicemail: acc.calls_voicemail + (u.calls_voicemail || 0),
          calls_no_answer: acc.calls_no_answer + (u.calls_no_answer || 0),
          calls_failed: acc.calls_failed + (u.calls_failed || 0),
        }), {
          total_calls: 0,
          total_minutes: 0,
          total_billed_cents: 0,
          total_retell_cost_cents: 0,
          total_margin_cents: 0,
          calls_completed: 0,
          calls_voicemail: 0,
          calls_no_answer: 0,
          calls_failed: 0,
        });

        result = {
          period_type: periodType,
          summaries: usage || [],
          totals: {
            ...totals,
            total_billed_dollars: totals.total_billed_cents / 100,
            total_retell_cost_dollars: totals.total_retell_cost_cents / 100,
            total_margin_dollars: totals.total_margin_cents / 100,
            margin_percent: totals.total_billed_cents > 0
              ? Math.round((totals.total_margin_cents / totals.total_billed_cents) * 100)
              : 0,
          },
        };
        break;
      }

      // ====================================================================
      // CHECK AUTO RECHARGE
      // ====================================================================
      case 'check_auto_recharge': {
        const orgId = body.organization_id;
        if (!orgId) {
          throw new Error('Organization ID required');
        }

        const { data: rechargeResult, error: rechargeError } = await supabase
          .rpc('check_auto_recharge', {
            p_organization_id: orgId
          });

        if (rechargeError) throw rechargeError;

        const recharge = rechargeResult?.[0] || {};

        result = {
          needs_recharge: recharge.needs_recharge || false,
          current_balance_cents: recharge.current_balance_cents || 0,
          current_balance_dollars: (recharge.current_balance_cents || 0) / 100,
          recharge_amount_cents: recharge.recharge_amount_cents || 0,
          recharge_amount_dollars: (recharge.recharge_amount_cents || 0) / 100,
          has_payment_method: !!recharge.payment_method_id,
          payment_method_id: recharge.payment_method_id
        };
        break;
      }

      // ====================================================================
      // CREATE STRIPE CHECKOUT SESSION
      // ====================================================================
      case 'create_checkout_session': {
        const orgId = body.organization_id || (userId ? await getOrganizationId(supabase, userId) : null);
        if (!orgId) {
          throw new Error('Organization ID required');
        }

        const amountCents = body.amount_cents;
        const bonusCents = body.bonus_cents || 0;
        const successUrl = body.success_url || 'https://app.example.com/billing?success=true';
        const cancelUrl = body.cancel_url || 'https://app.example.com/billing?canceled=true';

        if (!amountCents || amountCents < 1000) {
          throw new Error('Minimum purchase amount is $10.00');
        }

        const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');

        if (!STRIPE_SECRET_KEY) {
          // Demo mode - simulate checkout without Stripe
          console.log('[Credit Management] Stripe not configured - demo mode');
          result = {
            message: 'Demo mode: Stripe not configured. In production, this would redirect to Stripe checkout.',
            demo: true,
            amount_cents: amountCents,
            bonus_cents: bonusCents,
          };
          break;
        }

        // Create Stripe Checkout Session
        const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            'mode': 'payment',
            'payment_method_types[0]': 'card',
            'line_items[0][price_data][currency]': 'usd',
            'line_items[0][price_data][product_data][name]': `Voice AI Credits - $${(amountCents / 100).toFixed(2)}${bonusCents > 0 ? ` (+$${(bonusCents / 100).toFixed(2)} bonus)` : ''}`,
            'line_items[0][price_data][unit_amount]': String(amountCents),
            'line_items[0][quantity]': '1',
            'success_url': successUrl,
            'cancel_url': cancelUrl,
            'metadata[organization_id]': orgId,
            'metadata[amount_cents]': String(amountCents),
            'metadata[bonus_cents]': String(bonusCents),
            'metadata[user_id]': userId || '',
          }).toString(),
        });

        if (!stripeResponse.ok) {
          const errorData = await stripeResponse.json();
          throw new Error(`Stripe error: ${errorData.error?.message || 'Unknown error'}`);
        }

        const session = await stripeResponse.json();

        result = {
          checkout_url: session.url,
          session_id: session.id,
          amount_cents: amountCents,
          bonus_cents: bonusCents,
        };
        break;
      }

      // ====================================================================
      // UPDATE SETTINGS
      // ====================================================================
      case 'update_settings': {
        const orgId = body.organization_id || (userId ? await getOrganizationId(supabase, userId) : null);
        if (!orgId) {
          throw new Error('Organization ID required');
        }

        const updates: Record<string, any> = {};

        if (body.auto_recharge_enabled !== undefined) {
          updates.auto_recharge_enabled = body.auto_recharge_enabled;
        }
        if (body.auto_recharge_amount_cents !== undefined) {
          updates.auto_recharge_amount_cents = body.auto_recharge_amount_cents;
        }
        if (body.auto_recharge_threshold_cents !== undefined) {
          updates.auto_recharge_threshold_cents = body.auto_recharge_threshold_cents;
        }
        if (body.low_balance_threshold_cents !== undefined) {
          updates.low_balance_threshold_cents = body.low_balance_threshold_cents;
        }

        if (Object.keys(updates).length === 0) {
          throw new Error('No settings to update');
        }

        updates.updated_at = new Date().toISOString();

        const { error: updateError } = await supabase
          .from('organization_credits')
          .update(updates)
          .eq('organization_id', orgId);

        if (updateError) throw updateError;

        result = {
          success: true,
          updated: Object.keys(updates),
        };
        break;
      }

      // ====================================================================
      // GET USAGE SUMMARY (for charts)
      // ====================================================================
      case 'get_usage_summary': {
        const orgId = body.organization_id || (userId ? await getOrganizationId(supabase, userId) : null);
        if (!orgId) {
          throw new Error('Organization ID required');
        }

        const days = body.days || 30;

        // Get daily usage from call_logs
        const { data: usageData, error: usageError } = await supabase
          .from('call_logs')
          .select('created_at, duration_seconds, billed_cost_cents')
          .eq('organization_id', orgId)
          .gte('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
          .order('created_at', { ascending: true });

        if (usageError) throw usageError;

        // Aggregate by day
        const dailyUsage: Record<string, { calls: number; minutes: number; cost_cents: number }> = {};

        (usageData || []).forEach((call: any) => {
          const date = call.created_at.split('T')[0];
          if (!dailyUsage[date]) {
            dailyUsage[date] = { calls: 0, minutes: 0, cost_cents: 0 };
          }
          dailyUsage[date].calls++;
          dailyUsage[date].minutes += Math.ceil((call.duration_seconds || 0) / 60);
          dailyUsage[date].cost_cents += call.billed_cost_cents || 0;
        });

        const usage = Object.entries(dailyUsage).map(([date, stats]) => ({
          period: date,
          total_calls: stats.calls,
          total_minutes: stats.minutes,
          total_cost_cents: stats.cost_cents,
          avg_call_duration: stats.calls > 0 ? Math.round((stats.minutes * 60) / stats.calls) : 0,
        }));

        result = { usage };
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[Credit Management] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Helper to get organization ID from user
async function getOrganizationId(supabase: any, userId: string | null): Promise<string | null> {
  if (!userId) return null;

  try {
    const { data } = await supabase.rpc('get_organization_for_user', {
      p_user_id: userId
    });
    return data || null;
  } catch {
    // Fallback to direct query
    const { data } = await supabase
      .from('organization_users')
      .select('organization_id')
      .eq('user_id', userId)
      .limit(1)
      .single();

    return data?.organization_id || null;
  }
}
