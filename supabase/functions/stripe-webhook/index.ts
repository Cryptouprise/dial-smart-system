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

// Simple signature verification (production should use Stripe's SDK)
const verifySignature = async (
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> => {
  try {
    const elements = signature.split(",");
    const timestampStr = elements.find((e) => e.startsWith("t="))?.slice(2);
    const signatureHash = elements.find((e) => e.startsWith("v1="))?.slice(3);

    if (!timestampStr || !signatureHash) return false;

    const signedPayload = `${timestampStr}.${payload}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureBytes = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(signedPayload)
    );

    const expectedSignature = Array.from(new Uint8Array(signatureBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return expectedSignature === signatureHash;
  } catch (error) {
    console.error("[Stripe Webhook] Signature verification error:", error);
    return false;
  }
};

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get the raw body for signature verification
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    // Verify webhook signature (if configured)
    if (STRIPE_WEBHOOK_SECRET && signature) {
      const isValid = await verifySignature(body, signature, STRIPE_WEBHOOK_SECRET);
      if (!isValid) {
        console.error("[Stripe Webhook] Invalid signature");
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const event: StripeEvent = JSON.parse(body);
    console.log(`[Stripe Webhook] Received event: ${event.type} (${event.id})`);

    // Process based on event type
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;

        // Extract metadata we set during checkout creation
        const organizationId = session.metadata?.organization_id;
        const amountCents = parseInt(session.metadata?.amount_cents || "0");
        const bonusCents = parseInt(session.metadata?.bonus_cents || "0");
        const userId = session.metadata?.user_id;

        if (!organizationId) {
          console.error("[Stripe Webhook] Missing organization_id in session metadata");
          break;
        }

        console.log(`[Stripe Webhook] Processing checkout for org ${organizationId}`);
        console.log(`[Stripe Webhook] Amount: $${amountCents / 100}, Bonus: $${bonusCents / 100}`);

        // Add credits to organization
        const totalCredits = amountCents + bonusCents;

        const { error: creditError } = await supabase.rpc("add_credits", {
          p_organization_id: organizationId,
          p_amount_cents: totalCredits,
          p_transaction_type: "deposit",
          p_description: `Credit purchase: $${amountCents / 100}${bonusCents > 0 ? ` + $${bonusCents / 100} bonus` : ""}`,
          p_stripe_payment_id: session.payment_intent || session.id,
          p_idempotency_key: `stripe_${event.id}`,
        });

        if (creditError) {
          console.error("[Stripe Webhook] Failed to add credits:", creditError);
          // Don't throw - Stripe would retry and might double-credit
        } else {
          console.log(`[Stripe Webhook] Successfully added ${totalCredits} cents to org ${organizationId}`);
        }

        // Log the transaction for audit
        await supabase.from("credit_transactions").insert({
          organization_id: organizationId,
          type: "deposit",
          amount_cents: totalCredits,
          description: `Stripe payment: ${session.payment_intent || session.id}`,
          stripe_payment_id: session.payment_intent || session.id,
          idempotency_key: `stripe_${event.id}`,
          created_by: userId || null,
        }).single();

        break;
      }

      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object;

        // Check if this is an auto-recharge payment
        const organizationId = paymentIntent.metadata?.organization_id;
        const isAutoRecharge = paymentIntent.metadata?.auto_recharge === "true";

        if (organizationId && isAutoRecharge) {
          const amountCents = paymentIntent.amount;

          console.log(`[Stripe Webhook] Auto-recharge payment for org ${organizationId}: $${amountCents / 100}`);

          const { error: creditError } = await supabase.rpc("add_credits", {
            p_organization_id: organizationId,
            p_amount_cents: amountCents,
            p_transaction_type: "auto_recharge",
            p_description: `Auto-recharge: $${amountCents / 100}`,
            p_stripe_payment_id: paymentIntent.id,
            p_idempotency_key: `stripe_${event.id}`,
          });

          if (creditError) {
            console.error("[Stripe Webhook] Failed to add auto-recharge credits:", creditError);
          } else {
            console.log(`[Stripe Webhook] Auto-recharge successful: ${amountCents} cents`);
          }
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
          await supabase
            .from("organization_credits")
            .update({ auto_recharge_enabled: false })
            .eq("organization_id", organizationId);
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
