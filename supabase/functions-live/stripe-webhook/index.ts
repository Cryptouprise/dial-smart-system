/**
 * Stripe Webhook Handler
 *
 * Built on the LIVE deployed function (supabase/functions-live/stripe-webhook/index.ts, byte-exact 205-line
 * bundled source). Every event the live function handles today keeps working with the same semantics:
 * - checkout.session.completed (mode=payment): adds credits via add_credits (idempotent on event.id)
 * - payment_intent.succeeded (metadata.auto_recharge=true): adds auto-recharge credits
 * - customer.subscription.deleted: disables auto-recharge on organization_credits
 *
 * P6 additions (subscription state drives access; see migration 20261029160000_billing_lock.sql):
 * - checkout.session.completed (mode=subscription): stores stripe_customer_id on the org, no credits
 * - customer.subscription.created|updated|deleted: maps Stripe status -> organizations.subscription_status,
 *   sets stripe_customer_id, sets plan_id from plans.stripe_price_id, turns billing_enabled on for
 *   active/trialing, clears billing_grace_until when the subscription is healthy again;
 *   deleted ALWAYS writes 'canceled'
 * - invoice.payment_failed (subscription invoices only): subscription_status = 'past_due' and
 *   billing_grace_until = now() + 3 days, written once per dunning cycle (never extended while set);
 *   never loosens an org that is already canceled/unpaid
 * - invoice.paid (subscription invoices only): restores 'active' only when the org is past_due/unpaid,
 *   and clears billing_grace_until
 *
 * The grace window is the dedicated column organizations.billing_grace_until (guarded by
 * trg_guard_organization_billing_columns), NOT a key in organizations.settings: org admins can update
 * settings and could otherwise unlock themselves.
 *
 * Idempotency for the P6 writes: INSERT event.id into public.stripe_events FIRST; 23505 means already
 * processed (return 200); if the business update fails afterwards the claim row is DELETED so Stripe's
 * retry can reprocess (the function returns 500 so Stripe does retry).
 *
 * All organizations writes use the service-role client: the guard trigger
 * trg_guard_organization_billing_columns lets service_role through.
 *
 * Signature verification uses _shared/stripe-signature.ts (constant-time compare, 5-minute replay window)
 * instead of the live inline HMAC compare.
 *
 * Setup:
 * 1. Set STRIPE_SECRET_KEY in Supabase secrets (used by billing-portal; not needed here)
 * 2. Set STRIPE_WEBHOOK_SECRET in Supabase secrets (signing secret of the Dashboard endpoint)
 * 3. Configure webhook endpoint in Stripe dashboard:
 *    https://[project].supabase.co/functions/v1/stripe-webhook
 *    Events: checkout.session.completed, payment_intent.succeeded, invoice.paid, invoice.payment_failed,
 *            customer.subscription.created, customer.subscription.updated, customer.subscription.deleted
 * 4. Deploy with verify_jwt = false (supabase/config.toml already has [functions.stripe-webhook] verify_jwt = false)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyStripeSignature } from "../_shared/stripe-signature.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

// Stripe event types we handle
type StripeEventType =
  | "checkout.session.completed"
  | "payment_intent.succeeded"
  | "invoice.paid"
  | "invoice.payment_failed"
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

type PersistedSubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete";

const GRACE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

// Statuses that may legitimately move to past_due on a failed invoice. canceled/unpaid are terminal
// for access purposes and must never be loosened by a later payment_failed event.
const PAST_DUE_ELIGIBLE = new Set(["active", "trialing", "past_due"]);
// Statuses that invoice.paid may restore to active.
const RESTORE_ELIGIBLE = new Set(["past_due", "unpaid"]);

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Stripe expands some references to objects; accept both string ids and { id } objects. */
function stripeId(ref: unknown): string | null {
  if (typeof ref === "string" && ref.length > 0) return ref;
  if (ref && typeof ref === "object" && typeof (ref as any).id === "string" && (ref as any).id.length > 0) {
    return (ref as any).id;
  }
  return null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Subscription id carried by an invoice.
 * Pre-2025-03-31 API versions: invoice.subscription (string or object).
 * 2025-03-31.basil and later: invoice.parent.subscription_details.subscription.
 * VERIFY: which shape your account's API version sends; both are handled.
 */
function invoiceSubscriptionId(invoice: any): string | null {
  return stripeId(invoice?.subscription)
    ?? stripeId(invoice?.parent?.subscription_details?.subscription)
    ?? null;
}

/**
 * organization_id metadata carried by an invoice: subscription metadata (both API shapes, matching what the
 * live function read) then the invoice's own metadata.
 */
function invoiceOrganizationMetadata(invoice: any): string | null {
  return nonEmptyString(invoice?.subscription_details?.metadata?.organization_id)
    ?? nonEmptyString(invoice?.parent?.subscription_details?.metadata?.organization_id)
    ?? nonEmptyString(invoice?.metadata?.organization_id)
    ?? null;
}

/**
 * Resolve the organization for a Stripe object: explicit metadata first (set by billing-portal on
 * checkout: subscription_data[metadata][organization_id] / metadata[organization_id]), then a lookup by
 * stripe_customer_id on organizations.
 */
async function resolveOrganizationId(
  supabase: any,
  metadataOrganizationId: string | null,
  customerRef: unknown,
): Promise<string | null> {
  if (metadataOrganizationId) return metadataOrganizationId;

  const customerId = stripeId(customerRef);
  if (!customerId) return null;

  const { data, error } = await supabase
    .from("organizations")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (error) {
    throw new Error(`Organization lookup by customer failed: ${error.message}`);
  }
  return data?.id ?? null;
}

/**
 * Map the subscription's price ids to a plans.id. Multi-item subscriptions: the first item (in Stripe's
 * order) whose price matches a plan wins; add-on prices that are not plans are skipped.
 */
async function resolvePlanId(supabase: any, subscription: any): Promise<string | null> {
  const items: any[] = Array.isArray(subscription?.items?.data) ? subscription.items.data : [];
  const priceIds = items
    .map((item) => stripeId(item?.price) ?? nonEmptyString(item?.plan?.id))
    .filter((id): id is string => !!id);
  if (priceIds.length === 0) return null;
  if (priceIds.length > 1) {
    console.log(`[Stripe Webhook] Subscription has ${priceIds.length} prices; first plan match wins`);
  }

  const { data, error } = await supabase
    .from("plans")
    .select("id, stripe_price_id")
    .in("stripe_price_id", priceIds);
  if (error) {
    throw new Error(`Plan lookup by price failed: ${error.message}`);
  }
  const rows: Array<{ id: string; stripe_price_id: string }> = data ?? [];
  for (const priceId of priceIds) {
    const match = rows.find((row) => row.stripe_price_id === priceId);
    if (match) return match.id;
  }
  return null;
}

/**
 * Stripe subscription status -> what we persist. Returns null for statuses we ignore.
 * - deleted events always mean 'canceled' (Stripe may still carry the pre-delete status on the object)
 * - incomplete_expired is terminal -> 'canceled'
 * - paused (trial ended without a payment method) is not paying -> 'unpaid'
 */
function mapSubscriptionStatus(eventType: StripeEventType, rawStatus: unknown): PersistedSubscriptionStatus | null {
  if (eventType === "customer.subscription.deleted") return "canceled";
  switch (rawStatus) {
    case "active":
    case "trialing":
    case "past_due":
    case "canceled":
    case "unpaid":
    case "incomplete":
      return rawStatus;
    case "incomplete_expired":
      return "canceled";
    case "paused":
      return "unpaid";
    default:
      return null;
  }
}

async function readOrganization(supabase: any, organizationId: string): Promise<{
  subscription_status: string | null;
  billing_enabled: boolean | null;
  stripe_customer_id: string | null;
  /** ISO timestamp or null; the past_due grace window (platform-managed column). */
  billing_grace_until: string | null;
}> {
  const { data, error } = await supabase
    .from("organizations")
    .select("subscription_status, billing_enabled, stripe_customer_id, billing_grace_until")
    .eq("id", organizationId)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to read organization ${organizationId}: ${error.message}`);
  }
  if (!data) {
    throw new Error(`Organization ${organizationId} not found`);
  }
  return {
    subscription_status: data.subscription_status ?? null,
    billing_enabled: data.billing_enabled ?? null,
    stripe_customer_id: data.stripe_customer_id ?? null,
    billing_grace_until: nonEmptyString(data.billing_grace_until),
  };
}

async function updateOrganization(
  supabase: any,
  organizationId: string,
  update: Record<string, unknown>,
  label: string,
): Promise<void> {
  const { error } = await supabase
    .from("organizations")
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq("id", organizationId);
  if (error) {
    throw new Error(`Failed to ${label} for org ${organizationId}: ${error.message}`);
  }
}

/**
 * Idempotency: claim the event id FIRST. Returns "duplicate" when another delivery already processed it
 * (unique violation 23505). If the work throws, the claim is released so Stripe's retry can reprocess,
 * then the error is rethrown (the caller answers 500, which makes Stripe retry).
 */
async function withEventClaim(
  supabase: any,
  event: StripeEvent,
  work: () => Promise<void>,
): Promise<"applied" | "duplicate"> {
  try {
    const { error } = await supabase
      .from("stripe_events")
      .insert({ id: event.id, type: event.type });
    if (error) {
      if ((error as any).code === "23505") return "duplicate";
      throw new Error(`Failed to claim stripe event ${event.id}: ${error.message}`);
    }
  } catch (claimError) {
    // A failed claim means nothing was written; let Stripe retry.
    throw claimError instanceof Error ? claimError : new Error(String(claimError));
  }

  try {
    await work();
    return "applied";
  } catch (workError) {
    const { error: releaseError } = await supabase
      .from("stripe_events")
      .delete()
      .eq("id", event.id);
    if (releaseError) {
      console.error(`[Stripe Webhook] Failed to release claim ${event.id}: ${releaseError.message}`);
    }
    throw workError;
  }
}

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

    // Get the raw body for signature verification
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    // Verify webhook signature (mandatory) before touching the database
    if (!STRIPE_WEBHOOK_SECRET) {
      console.error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET not configured");
      return jsonResponse({ error: "Webhook not configured" }, 500);
    }
    if (!signature) {
      return jsonResponse({ error: "Missing signature" }, 400);
    }
    const isValid = await verifyStripeSignature(body, signature, STRIPE_WEBHOOK_SECRET);
    if (!isValid) {
      return jsonResponse({ error: "Invalid signature" }, 401);
    }

    let event: StripeEvent;
    try {
      event = JSON.parse(body);
    } catch {
      // Malformed JSON will never become valid; do not make Stripe retry it.
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }
    if (!event || typeof event.id !== "string" || typeof event.type !== "string") {
      return jsonResponse({ error: "Malformed event" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    console.log(`[Stripe Webhook] Received event: ${event.type} (${event.id})`);

    let duplicate = false;

    // Process based on event type
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;

        // P6: subscription checkout created by billing-portal. Store the Stripe customer so later
        // subscription/invoice events resolve the org even without metadata. No credits are involved;
        // the live credit path below must not run for this session (it would try to add 0 cents).
        if (session?.mode === "subscription") {
          const organizationId = nonEmptyString(session.metadata?.organization_id)
            ?? nonEmptyString(session.client_reference_id);
          const customerId = stripeId(session.customer);
          if (!organizationId || !customerId) {
            console.log("[Stripe Webhook] Subscription checkout without organization_id/customer; ignoring");
            break;
          }
          const outcome = await withEventClaim(supabase, event, async () => {
            const org = await readOrganization(supabase, organizationId);
            if (org.stripe_customer_id === customerId) return;
            await updateOrganization(supabase, organizationId, { stripe_customer_id: customerId }, "set stripe_customer_id");
            console.log(`[Stripe Webhook] Org ${organizationId} stripe_customer_id=${customerId} (subscription checkout)`);
          });
          duplicate = outcome === "duplicate";
          break;
        }

        // LIVE behaviour (unchanged): one-off credit purchase.
        // Extract metadata we set during checkout creation
        const organizationId = session.metadata?.organization_id;
        const amountCents = parseInt(session.metadata?.amount_cents || "0");
        const bonusCents = parseInt(session.metadata?.bonus_cents || "0");

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

        // Note: add_credits RPC already creates the credit_transactions audit log entry
        // No manual insert needed here — that would create a duplicate transaction

        break;
      }

      case "payment_intent.succeeded": {
        // LIVE behaviour (unchanged).
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

        // Only subscription invoices drive access. A one-off invoice must never un-pause an org.
        const subscriptionId = invoiceSubscriptionId(invoice);
        if (!subscriptionId) {
          console.log(`[Stripe Webhook] invoice.paid ${invoice?.id ?? ""} has no subscription; ignoring`);
          break;
        }

        const organizationId = await resolveOrganizationId(
          supabase,
          invoiceOrganizationMetadata(invoice),
          invoice.customer,
        );
        if (!organizationId) {
          console.log("[Stripe Webhook] invoice.paid with no resolvable org; ignoring");
          break;
        }

        const outcome = await withEventClaim(supabase, event, async () => {
          const org = await readOrganization(supabase, organizationId);
          const restore = RESTORE_ELIGIBLE.has(org.subscription_status ?? "");
          const hasGrace = org.billing_grace_until !== null;

          if (!restore && !hasGrace) {
            console.log(`[Stripe Webhook] Org ${organizationId} invoice.paid: status=${org.subscription_status}, nothing to restore`);
            return;
          }

          const update: Record<string, unknown> = {};
          if (restore) update.subscription_status = "active";
          if (hasGrace) update.billing_grace_until = null;
          await updateOrganization(supabase, organizationId, update, "restore after invoice.paid");
          console.log(
            `[Stripe Webhook] Org ${organizationId} invoice.paid -> ${restore ? "active" : "status unchanged"}${hasGrace ? ", grace cleared" : ""}`,
          );
        });
        duplicate = outcome === "duplicate";
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;

        const subscriptionId = invoiceSubscriptionId(invoice);
        if (!subscriptionId) {
          console.log(`[Stripe Webhook] invoice.payment_failed ${invoice?.id ?? ""} has no subscription; ignoring`);
          break;
        }

        const organizationId = await resolveOrganizationId(
          supabase,
          invoiceOrganizationMetadata(invoice),
          invoice.customer,
        );
        if (!organizationId) {
          console.log("[Stripe Webhook] invoice.payment_failed with no resolvable org; ignoring");
          break;
        }

        const outcome = await withEventClaim(supabase, event, async () => {
          const org = await readOrganization(supabase, organizationId);

          // Never loosen a canceled/unpaid org back to past_due (which would re-open a grace window).
          if (!PAST_DUE_ELIGIBLE.has(org.subscription_status ?? "")) {
            console.log(`[Stripe Webhook] Org ${organizationId} payment_failed while ${org.subscription_status}; status left unchanged`);
            return;
          }

          // One grace window per dunning cycle: set it only when absent. Stripe retries the same invoice
          // for weeks and emits payment_failed on each attempt; re-stamping would extend grace forever.
          const existingGrace = org.billing_grace_until;
          const graceUntil = existingGrace ?? new Date(Date.now() + GRACE_WINDOW_MS).toISOString();

          await updateOrganization(
            supabase,
            organizationId,
            { subscription_status: "past_due", billing_grace_until: graceUntil },
            "set past_due + billing_grace_until",
          );
          console.log(
            `[Stripe Webhook] Org ${organizationId} past_due; billing_grace_until=${graceUntil}${existingGrace ? " (kept)" : " (new)"}`,
          );
        });
        duplicate = outcome === "duplicate";
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object;

        const organizationId = await resolveOrganizationId(
          supabase,
          nonEmptyString(subscription?.metadata?.organization_id),
          subscription?.customer,
        );
        if (!organizationId) {
          console.log(`[Stripe Webhook] ${event.type} with no resolvable org; ignoring`);
          break;
        }

        const eventType = event.type;
        const outcome = await withEventClaim(supabase, event, async () => {
          const status = mapSubscriptionStatus(eventType, subscription?.status);
          if (!status) {
            console.log(`[Stripe Webhook] Ignoring unmapped subscription status: ${String(subscription?.status)}`);
            return;
          }

          const org = await readOrganization(supabase, organizationId);
          const customerId = stripeId(subscription?.customer);
          const planId = await resolvePlanId(supabase, subscription);

          const update: Record<string, unknown> = { subscription_status: status };
          if (customerId && customerId !== org.stripe_customer_id) update.stripe_customer_id = customerId;
          if (planId) update.plan_id = planId;

          if (status === "active" || status === "trialing") {
            // A paying (or trialing) subscription turns billing on. Trialing is included so that a
            // trial that later fails payment can actually lock; billing off would never lock.
            if (org.billing_enabled !== true) update.billing_enabled = true;
            // Healthy again: the grace window belongs to the previous dunning cycle.
            if (org.billing_grace_until !== null) update.billing_grace_until = null;
          }

          await updateOrganization(supabase, organizationId, update, `apply ${eventType}`);

          // LIVE behaviour (kept): a deleted subscription disables auto-recharge on the credits row.
          if (eventType === "customer.subscription.deleted") {
            console.log(`[Stripe Webhook] Subscription cancelled for org ${organizationId}`);
            const { error: disableError } = await supabase
              .from("organization_credits")
              .update({ auto_recharge_enabled: false })
              .eq("organization_id", organizationId);
            if (disableError) {
              throw new Error(`Failed to disable auto-recharge for org ${organizationId}: ${disableError.message}`);
            }
          }

          console.log(
            `[Stripe Webhook] Org ${organizationId} -> status=${status} plan=${planId ?? "unchanged"}${update.billing_enabled ? " billing_enabled=true" : ""}`,
          );
        });
        duplicate = outcome === "duplicate";
        break;
      }

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    if (duplicate) {
      console.log(`[Stripe Webhook] Event ${event.id} already processed`);
      return jsonResponse({ received: true, duplicate: true }, 200);
    }
    return jsonResponse({ received: true }, 200);
  } catch (error: any) {
    console.error("[Stripe Webhook] Error:", error);
    return jsonResponse({ error: error?.message ?? "Unexpected error" }, 500);
  }
});
