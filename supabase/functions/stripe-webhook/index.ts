/**
 * Stripe Webhook Handler
 *
 * Processes Stripe payment events for the white-label credit system:
 * - checkout.session.completed: Adds credits after successful payment
 * - payment_intent.succeeded: Alternative payment confirmation
 * - invoice.paid: Handles subscription/auto-recharge payments
 *
 * Setup:
 * 1. Set STRIPE_SECRET_KEY in Supabase secrets
 * 2. Set STRIPE_WEBHOOK_SECRET in Supabase secrets
 * 3. Configure webhook endpoint in Stripe dashboard:
 *    https://[project].supabase.co/functions/v1/stripe-webhook
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  resolvePaidCheckoutSession,
  resolveSucceededAutoRecharge,
} from '../_shared/credit-purchase-policy.ts';
import { verifyStripeSignature } from '../_shared/stripe-signature.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

// Stripe event types we handle
type StripeEventType =
  | "checkout.session.completed"
  | "payment_intent.succeeded"
  | "invoice.paid"
  | "customer.subscription.created"
  | "customer.subscription.updated"
  | "customer.subscription.deleted";

interface StripeEvent {
  id: string;
  type: StripeEventType;
  data: {
    object: any;
  };
}

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    // Get the raw body for signature verification
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    // Verify webhook signature (mandatory)
    if (!STRIPE_WEBHOOK_SECRET) {
      console.error('[Stripe Webhook] STRIPE_WEBHOOK_SECRET not configured');
      return new Response(JSON.stringify({ error: 'Webhook not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!signature) {
      return new Response(JSON.stringify({ error: 'Missing signature' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const isValid = await verifyStripeSignature(body, signature, STRIPE_WEBHOOK_SECRET);
    if (!isValid) {
      return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Do not construct a privileged database client until Stripe origin and
    // freshness have both been authenticated.
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase configuration");
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const event: StripeEvent = JSON.parse(body);
    console.log(`[Stripe Webhook] Received event: ${event.type} (${event.id})`);

    // Process based on event type
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;

        // The signed event proves origin, but metadata is not the source of
        // truth for money. Require a completed paid session, derive the paid
        // amount from Stripe amount_total, and recompute the credit amount from
        // the exact server-owned package policy used to create the checkout.
        const purchase = resolvePaidCheckoutSession(session);

        console.log(`[Stripe Webhook] Processing checkout for org ${purchase.organizationId}`);
        console.log(`[Stripe Webhook] Paid: $${purchase.paidAmountCents / 100}, Bonus: $${purchase.bonusCents / 100}`);

        const { error: creditError } = await supabase.rpc("add_credits", {
          p_organization_id: purchase.organizationId,
          p_amount_cents: purchase.creditAmountCents,
          p_transaction_type: "deposit",
          p_description: `Credit purchase: $${purchase.paidAmountCents / 100}${purchase.bonusCents > 0 ? ` + $${purchase.bonusCents / 100} bonus` : ""}; Stripe ${purchase.stripePaymentId}`,
          p_idempotency_key: `stripe_${event.id}`,
          p_stripe_payment_id: purchase.stripePaymentId,
        });

        if (creditError) {
          // The RPC is idempotent by event ID, so a non-2xx response is safe and
          // necessary: Stripe must retry a transient database failure instead
          // of acknowledging a payment that never received credits.
          throw new Error(`Failed to add checkout credits: ${creditError.message}`);
        }
        console.log(`[Stripe Webhook] Successfully added ${purchase.creditAmountCents} cents to org ${purchase.organizationId}`);

        // Note: add_credits RPC already creates the credit_transactions audit log entry
        // No manual insert needed here — that would create a duplicate transaction

        break;
      }

      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object;

        // Auto-recharge credits exactly the amount Stripe reports received;
        // the requested PaymentIntent amount is never treated as proof of
        // funds and no bonus is applied on this path.
        const recharge = resolveSucceededAutoRecharge(paymentIntent);

        if (recharge) {
          console.log(`[Stripe Webhook] Auto-recharge payment for org ${recharge.organizationId}: $${recharge.paidAmountCents / 100}`);

          const { error: creditError } = await supabase.rpc("add_credits", {
            p_organization_id: recharge.organizationId,
            p_amount_cents: recharge.creditAmountCents,
            p_transaction_type: "auto_recharge",
            p_description: `Auto-recharge: $${recharge.paidAmountCents / 100}; Stripe ${recharge.stripePaymentId}`,
            p_idempotency_key: `stripe_${event.id}`,
            p_stripe_payment_id: recharge.stripePaymentId,
          });

          if (creditError) {
            throw new Error(`Failed to add auto-recharge credits: ${creditError.message}`);
          }
          console.log(`[Stripe Webhook] Auto-recharge successful: ${recharge.creditAmountCents} cents`);
        }

        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object;

        // Handle subscription payments if we add subscription billing
        const organizationId = invoice.subscription_details?.metadata?.organization_id
          || invoice.metadata?.organization_id;

        if (organizationId) {
          console.log(`[Stripe Webhook] Invoice paid for org ${organizationId}`);
          // Add any subscription-based credits here
        }

        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const organizationId = subscription.metadata?.organization_id;

        if (organizationId) {
          console.log(`[Stripe Webhook] Subscription cancelled for org ${organizationId}`);

          // Disable auto-recharge
          const { error: disableError } = await supabase
            .from("organization_credits")
            .update({ auto_recharge_enabled: false })
            .eq("organization_id", organizationId);
          if (disableError) {
            throw new Error(`Failed to disable auto-recharge: ${disableError.message}`);
          }
        }

        break;
      }

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[Stripe Webhook] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
