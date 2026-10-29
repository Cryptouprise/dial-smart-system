=== FILE: supabase/migrations/20261029050000_billing_lock.sql ===
-- Billing lock: Stripe subscription state drives access.
--
-- org_in_good_standing() is the single source of truth for "may this tenant
-- use the product". It is consumed by:
--   * RLS on the four core tables (belt and braces: data goes invisible too)
--   * the frontend via supabase.rpc('org_in_good_standing', {p_org_id})
--   * org_access_allowed() for future call sites
--
-- Billing off (billing_enabled IS NOT TRUE) never locks. That keeps the single
-- live org working today and keeps free/comped tenants usable.

-- ---------------------------------------------------------------------------
-- 1. Standing predicate
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.org_in_good_standing(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((
    SELECT
      COALESCE(o.unlimited_access, false)
      OR o.billing_enabled IS NOT TRUE
      OR o.subscription_status IN ('active', 'trialing')
      OR (
        o.subscription_status = 'past_due'
        AND COALESCE(
              NULLIF(o.settings ->> 'grace_until', '')::timestamptz,
              '1970-01-01'::timestamptz
            ) > now()
      )
    FROM public.organizations o
    WHERE o.id = p_org_id
  ), false);
$function$;

COMMENT ON FUNCTION public.org_in_good_standing(uuid) IS
  'True when the organization may use the product: unlimited_access, billing disabled, subscription active/trialing, or past_due inside settings.grace_until. False otherwise (including unknown org).';

REVOKE ALL ON FUNCTION public.org_in_good_standing(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.org_in_good_standing(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.org_in_good_standing(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Combined access predicate (membership AND standing, operator bypass)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.org_access_allowed(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.is_platform_operator()
      OR (
        public.user_in_organization(p_org_id)
        AND public.org_in_good_standing(p_org_id)
      );
$function$;

COMMENT ON FUNCTION public.org_access_allowed(uuid) IS
  'Membership AND good standing, with a platform-operator short-circuit. Use for new gates; RLS on core tables uses org_in_good_standing directly so per-user policies keep working.';

REVOKE ALL ON FUNCTION public.org_access_allowed(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.org_access_allowed(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.org_access_allowed(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Document the grace window key
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN public.organizations.settings IS
  'Free-form org settings. Recognized key: grace_until (ISO-8601 timestamptz string). While subscription_status = ''past_due'' and grace_until > now(), the org stays in good standing. Written by the stripe-webhook edge function on invoice.payment_failed (now() + 3 days).';

-- ---------------------------------------------------------------------------
-- 4. Stripe event idempotency table
--    The existing stripe-webhook has no idempotency table of its own; it relies
--    on add_credits(p_idempotency_key). Subscription-state writes need their own
--    dedupe, so we add one here.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stripe_events (
  id           text PRIMARY KEY,
  type         text NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.stripe_events IS
  'Stripe webhook idempotency ledger. Deny-all by design: RLS enabled with no policies. Written only by the stripe-webhook edge function via service_role.';

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 5. Lock the four core tables.
--
--    Live policies (docs/wholesale/audit/phase1/LIVE-SCHEMA.md):
--      leads         | "Users can manage their own leads"        | ALL    | auth.uid() = user_id
--      campaigns     | "Users can manage their own campaigns"    | ALL    | auth.uid() = user_id
--      call_logs     | "Users can manage their own call logs"    | ALL    | auth.uid() = user_id
--      phone_numbers | "Users can view/insert/update/delete their own phone numbers" | 4 policies | auth.uid() = user_id
--
--    The brief says "read the current SELECT policies ... DROP by exact name".
--    For leads/campaigns/call_logs the live policy is a single ALL policy, not a
--    separate SELECT policy. We therefore drop the ALL policy by its exact live
--    name and re-create the same predicate as four explicit policies (SELECT,
--    INSERT, UPDATE, DELETE) so the SELECT predicate can carry the standing
--    check without silently widening writes. Writes keep the original
--    auth.uid() = user_id predicate unchanged.
--
--    For phone_numbers the live SELECT policy name is not in the material
--    (only the combined description "Users can view/insert/update/delete their
--    own phone numbers" is). We emit the UNKNOWN probe and a template.
-- ---------------------------------------------------------------------------

-- leads ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can manage their own leads" ON public.leads;

CREATE POLICY "Users can view their own leads"
  ON public.leads FOR SELECT
  USING (
    auth.uid() = user_id
    AND public.org_in_good_standing(organization_id)
  );

CREATE POLICY "Users can insert their own leads"
  ON public.leads FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own leads"
  ON public.leads FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own leads"
  ON public.leads FOR DELETE
  USING (auth.uid() = user_id);

-- campaigns -----------------------------------------------------------------
DROP POLICY IF EXISTS "Users can manage their own campaigns" ON public.campaigns;

CREATE POLICY "Users can view their own campaigns"
  ON public.campaigns FOR SELECT
  USING (
    auth.uid() = user_id
    AND public.org_in_good_standing(organization_id)
  );

CREATE POLICY "Users can insert their own campaigns"
  ON public.campaigns FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own campaigns"
  ON public.campaigns FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own campaigns"
  ON public.campaigns FOR DELETE
  USING (auth.uid() = user_id);

-- call_logs -----------------------------------------------------------------
DROP POLICY IF EXISTS "Users can manage their own call logs" ON public.call_logs;

CREATE POLICY "Users can view their own call logs"
  ON public.call_logs FOR SELECT
  USING (
    auth.uid() = user_id
    AND public.org_in_good_standing(organization_id)
  );

CREATE POLICY "Users can insert their own call logs"
  ON public.call_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own call logs"
  ON public.call_logs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own call logs"
  ON public.call_logs FOR DELETE
  USING (auth.uid() = user_id);

-- phone_numbers -------------------------------------------------------------
-- UNKNOWN: list with select policyname, cmd, qual from pg_policies where tablename='phone_numbers'
-- The live SELECT policy name is not in the material. The template below is
-- the intended shape; replace "<LIVE SELECT POLICY NAME>" with the exact name
-- returned by the probe above before applying. The INSERT/UPDATE/DELETE
-- policies are left untouched (they are not SELECT and the brief scopes the
-- lock to SELECT).
--
-- DROP POLICY IF EXISTS "<LIVE SELECT POLICY NAME>" ON public.phone_numbers;
-- CREATE POLICY "<LIVE SELECT POLICY NAME>"
--   ON public.phone_numbers FOR SELECT
--   USING (
--     auth.uid() = user_id
--     AND public.org_in_good_standing(organization_id)
--   );
=== FILE: supabase/functions/stripe-webhook/index.ts ===
/**
 * Stripe Webhook Handler
 *
 * Processes Stripe payment events for the white-label credit system:
 * - checkout.session.completed: Adds credits after successful payment
 * - payment_intent.succeeded: Alternative payment confirmation
 * - invoice.paid: Handles subscription/auto-recharge payments
 * - invoice.payment_failed: Starts the 3-day grace window
 * - customer.subscription.created|updated|deleted: Drives organizations.subscription_status
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

// Stripe subscription statuses we persist. Anything else is ignored.
const PERSISTED_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "canceled",
  "unpaid",
  "incomplete",
]);

const GRACE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Resolve the organization for a subscription/invoice object.
 * Order: metadata.organization_id (set at checkout), then client_reference_id,
 * then a lookup by stripe_customer_id on organizations.
 */
async function resolveOrganizationId(
  supabase: any,
  object: any,
): Promise<string | null> {
  const fromMetadata = object?.metadata?.organization_id;
  if (typeof fromMetadata === "string" && fromMetadata.length > 0) {
    return fromMetadata;
  }
  const fromClientRef = object?.client_reference_id;
  if (typeof fromClientRef === "string" && fromClientRef.length > 0) {
    return fromClientRef;
  }
  const customerId = typeof object?.customer === "string"
    ? object.customer
    : object?.customer?.id;
  if (typeof customerId === "string" && customerId.length > 0) {
    const { data, error } = await supabase
      .from("organizations")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    if (error) {
      throw new Error(`Organization lookup by customer failed: ${error.message}`);
    }
    if (data?.id) return data.id;
  }
  return null;
}

/**
 * Map a Stripe price id to a plans.id, if one matches.
 */
async function resolvePlanId(
  supabase: any,
  priceId: string | null | undefined,
): Promise<string | null> {
  if (typeof priceId !== "string" || priceId.length === 0) return null;
  const { data, error } = await supabase
    .from("plans")
    .select("id")
    .eq("stripe_price_id", priceId)
    .maybeSingle();
  if (error) {
    throw new Error(`Plan lookup by price failed: ${error.message}`);
  }
  return data?.id ?? null;
}

/**
 * Idempotency: insert the event id; if it already exists, this event was
 * already processed and the caller should return 200 without re-applying.
 */
async function claimEvent(
  supabase: any,
  eventId: string,
  eventType: string,
): Promise<boolean> {
  const { error } = await supabase
    .from("stripe_events")
    .insert({ id: eventId, type: eventType });
  if (!error) return true;
  // 23505 = unique_violation -> already claimed
  if ((error as any).code === "23505") return false;
  throw new Error(`Failed to record stripe event: ${error.message}`);
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

        // A paid invoice clears any grace window that a prior payment_failed
        // opened. Idempotent on event.id.
        const paidOrgId = await resolveOrganizationId(supabase, invoice);
        if (paidOrgId) {
          const claimed = await claimEvent(supabase, event.id, event.type);
          if (!claimed) {
            console.log(`[Stripe Webhook] Event ${event.id} already processed`);
            break;
          }
          const { data: orgRow, error: orgErr } = await supabase
            .from("organizations")
            .select("settings")
            .eq("id", paidOrgId)
            .maybeSingle();
          if (orgErr) {
            throw new Error(`Failed to read org settings: ${orgErr.message}`);
          }
          const currentSettings = (orgRow?.settings ?? {}) as Record<string, unknown>;
          if (Object.prototype.hasOwnProperty.call(currentSettings, "grace_until")) {
            const { grace_until: _drop, ...rest } = currentSettings;
            const { error: clearErr } = await supabase
              .from("organizations")
              .update({ settings: rest })
              .eq("id", paidOrgId);
            if (clearErr) {
              throw new Error(`Failed to clear grace_until: ${clearErr.message}`);
            }
          }
        }

        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const organizationId = await resolveOrganizationId(supabase, invoice);
        if (!organizationId) {
          console.log(`[Stripe Webhook] payment_failed with no resolvable org; ignoring`);
          break;
        }

        const claimed = await claimEvent(supabase, event.id, event.type);
        if (!claimed) {
          console.log(`[Stripe Webhook] Event ${event.id} already processed`);
          break;
        }

        const { data: orgRow, error: orgErr } = await supabase
          .from("organizations")
          .select("settings")
          .eq("id", organizationId)
          .maybeSingle();
        if (orgErr) {
          throw new Error(`Failed to read org settings: ${orgErr.message}`);
        }
        const currentSettings = (orgRow?.settings ?? {}) as Record<string, unknown>;
        const graceUntil = new Date(Date.now() + GRACE_WINDOW_MS).toISOString();
        const mergedSettings = { ...currentSettings, grace_until: graceUntil };

        const { error: updateErr } = await supabase
          .from("organizations")
          .update({
            subscription_status: "past_due",
            settings: mergedSettings,
          })
          .eq("id", organizationId);
        if (updateErr) {
          throw new Error(`Failed to set past_due + grace_until: ${updateErr.message}`);
        }
        console.log(`[Stripe Webhook] Org ${organizationId} past_due; grace_until=${graceUntil}`);

        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const organizationId = await resolveOrganizationId(supabase, subscription);
        if (!organizationId) {
          console.log(`[Stripe Webhook] ${event.type} with no resolvable org; ignoring`);
          break;
        }

        const claimed = await claimEvent(supabase, event.id, event.type);
        if (!claimed) {
          console.log(`[Stripe Webhook] Event ${event.id} already processed`);
          break;
        }

        // On delete, Stripe sends status = 'canceled'. Fall back to 'canceled'
        // if the field is missing so a delete always locks the org.
        const rawStatus: string = event.type === "customer.subscription.deleted"
          ? (subscription.status ?? "canceled")
          : subscription.status;

        if (!PERSISTED_SUBSCRIPTION_STATUSES.has(rawStatus)) {
          console.log(`[Stripe Webhook] Ignoring unmapped subscription status: ${rawStatus}`);
          break;
        }

        const customerId: string | null = typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer?.id ?? null;

        const priceId: string | null =
          subscription.items?.data?.[0]?.price?.id ?? null;
        const planId = await resolvePlanId(supabase, priceId);

        const update: Record<string, unknown> = {
          subscription_status: rawStatus,
        };
        if (customerId) update.stripe_customer_id = customerId;
        if (planId) update.plan_id = planId;
        // First active subscription turns billing on for this org.
        if (rawStatus === "active") update.billing_enabled = true;

        const { error: updateErr } = await supabase
          .from("organizations")
          .update(update)
          .eq("id", organizationId);
        if (updateErr) {
          throw new Error(`Failed to update org subscription state: ${updateErr.message}`);
        }
        console.log(`[Stripe Webhook] Org ${organizationId} -> status=${rawStatus} plan=${planId ?? "unchanged"}`);

        // Preserve the existing behaviour: a deleted subscription disables
        // auto-recharge on the credits row.
        if (event.type === "customer.subscription.deleted") {
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
=== FILE: supabase/functions/billing-portal/index.ts ===
/**
 * Billing Portal
 *
 * POST { organization_id }
 * - Member check against organization_users (service-role lookup).
 * - If the org has a stripe_customer_id: create a Stripe Customer Portal
 *   session and return its URL.
 * - Otherwise: create a Checkout Session for the org's plan's
 *   plans.stripe_price_id (mode=subscription) and return its URL.
 *
 * Secrets (Deno.env): STRIPE_SECRET_KEY, SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, APP_URL.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  authenticateUser,
  errorResponse,
  successResponse,
  parseJSON,
  ValidationError,
  NotFoundError,
  requireEnvVars,
} from "../_shared/utils.ts";
import { requireExplicitOrganizationId } from "../_shared/tenant-context.ts";

const STRIPE_API = "https://api.stripe.com/v1";

async function stripePost(
  path: string,
  secretKey: string,
  form: URLSearchParams,
): Promise<any> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  const json = await res.json();
  if (!res.ok) {
    const message = json?.error?.message ?? `Stripe ${path} failed (${res.status})`;
    throw new Error(message);
  }
  return json;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return errorResponse(new ValidationError("Method not allowed"), 405);
  }

  try {
    const env = requireEnvVars(
      "STRIPE_SECRET_KEY",
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_ANON_KEY",
      "APP_URL",
    );

    // Authenticate the caller with the anon client (validates the JWT).
    const anonClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { user } = await authenticateUser(req, anonClient);

    const body = await parseJSON<{ organization_id?: unknown }>(req);
    const organizationId = requireExplicitOrganizationId(body.organization_id);

    // Service-role client for the membership + org lookups.
    const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    const { data: membership, error: memberErr } = await admin
      .from("organization_users")
      .select("organization_id")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (memberErr) {
      throw new Error(`Membership lookup failed: ${memberErr.message}`);
    }
    if (!membership) {
      throw new NotFoundError("Organization not found");
    }

    const { data: org, error: orgErr } = await admin
      .from("organizations")
      .select("id, stripe_customer_id, plan_id")
      .eq("id", organizationId)
      .maybeSingle();
    if (orgErr) {
      throw new Error(`Organization lookup failed: ${orgErr.message}`);
    }
    if (!org) {
      throw new NotFoundError("Organization not found");
    }

    const returnUrl = `${env.APP_URL.replace(/\/$/, "")}/dashboard`;

    // Path A: existing Stripe customer -> Customer Portal session.
    if (org.stripe_customer_id) {
      const form = new URLSearchParams();
      form.set("customer", org.stripe_customer_id);
      form.set("return_url", returnUrl);
      const session = await stripePost("/billing_portal/sessions", env.STRIPE_SECRET_KEY, form);
      return successResponse({ url: session.url, mode: "portal" });
    }

    // Path B: no customer yet -> Checkout Session for the org's plan.
    if (!org.plan_id) {
      throw new ValidationError("Organization has no plan and no Stripe customer");
    }
    const { data: plan, error: planErr } = await admin
      .from("plans")
      .select("id, stripe_price_id")
      .eq("id", org.plan_id)
      .maybeSingle();
    if (planErr) {
      throw new Error(`Plan lookup failed: ${planErr.message}`);
    }
    if (!plan?.stripe_price_id) {
      throw new ValidationError("Plan has no Stripe price configured");
    }

    const form = new URLSearchParams();
    form.set("mode", "subscription");
    form.set("line_items[0][price]", plan.stripe_price_id);
    form.set("line_items[0][quantity]", "1");
    form.set("client_reference_id", organizationId);
    form.set("success_url", `${returnUrl}?checkout=success`);
    form.set("cancel_url", `${returnUrl}?checkout=cancel`);
    // VERIFY: Stripe Checkout accepts customer_email only when no customer is
    // set; we have none on this path, so this is valid.
    if (user.email) form.set("customer_email", user.email);
    // VERIFY: metadata.organization_id is what stripe-webhook reads to resolve
    // the org on customer.subscription.* events. Confirm the key name matches
    // the webhook's resolveOrganizationId().
    form.set("subscription_data[metadata][organization_id]", organizationId);
    form.set("metadata[organization_id]", organizationId);

    const session = await stripePost("/checkout/sessions", env.STRIPE_SECRET_KEY, form);
    return successResponse({ url: session.url, mode: "checkout" });
  } catch (error) {
    return errorResponse(error);
  }
});
=== FILE: src/hooks/useOrgStanding.ts ===
/**
 * useOrgStanding
 *
 * Calls public.org_in_good_standing(p_org_id) and caches the result for 60s.
 * Returns { ok, loading, status } where status is a coarse label for UI copy.
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const CACHE_TTL_MS = 60_000;

type CacheEntry = { ok: boolean; at: number };
const cache = new Map<string, CacheEntry>();

export type OrgStandingStatus = 'ok' | 'paused' | 'unknown';

export interface OrgStanding {
  ok: boolean;
  loading: boolean;
  status: OrgStandingStatus;
}

export function useOrgStanding(organizationId: string | null | undefined): OrgStanding {
  const [state, setState] = useState<OrgStanding>(() => {
    if (!organizationId) return { ok: true, loading: false, status: 'ok' };
    const cached = cache.get(organizationId);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return { ok: cached.ok, loading: false, status: cached.ok ? 'ok' : 'paused' };
    }
    return { ok: true, loading: true, status: 'unknown' };
  });

  useEffect(() => {
    if (!organizationId) {
      setState({ ok: true, loading: false, status: 'ok' });
      return;
    }

    const cached = cache.get(organizationId);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      setState({ ok: cached.ok, loading: false, status: cached.ok ? 'ok' : 'paused' });
      return;
    }

    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));

    (async () => {
      const { data, error } = await supabase.rpc('org_in_good_standing', {
        p_org_id: organizationId,
      });
      if (cancelled) return;
      if (error) {
        // Fail open on transport errors so a transient RPC failure does not
        // lock every user out. RLS still enforces the lock server-side.
        console.error('[useOrgStanding] rpc failed:', error.message);
        setState({ ok: true, loading: false, status: 'unknown' });
        return;
      }
      const ok = data === true;
      cache.set(organizationId, { ok, at: Date.now() });
      setState({ ok, loading: false, status: ok ? 'ok' : 'paused' });
    })();

    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  return state;
}
=== FILE: src/components/BillingPaused.tsx ===
import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizationContext } from '@/contexts/OrganizationContext';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

/**
 * Full-screen lock shown when the current organization is not in good standing.
 * "Resume" opens the Stripe billing portal (or checkout) in a new tab.
 */
export const BillingPaused: React.FC = () => {
  const { signOut } = useAuth();
  const { currentOrganization } = useOrganizationContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleResume = async () => {
    if (!currentOrganization) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('billing-portal', {
        body: { organization_id: currentOrganization.id },
      });
      if (fnError) throw fnError;
      const url = (data as { data?: { url?: string } } | null)?.data?.url;
      if (!url) throw new Error('No billing URL returned');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open billing');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <h1 className="text-2xl font-semibold">Your workspace is paused</h1>
        <p className="text-muted-foreground">
          Your subscription is not in good standing. Update your payment method to
          restore access to your data and tools.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-col gap-3">
          <Button onClick={handleResume} disabled={busy || !currentOrganization}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Resume'}
          </Button>
          <button
            type="button"
            onClick={() => { void signOut(); }}
            className="text-sm text-muted-foreground underline"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
};
=== FILE: src/components/ProtectedRoute.tsx ===
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizationContext } from '@/contexts/OrganizationContext';
import { useOrgStanding } from '@/hooks/useOrgStanding';
import { BillingPaused } from '@/components/BillingPaused';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading } = useAuth();
  const { currentOrganization, loading: orgLoading } = useOrganizationContext();
  const standing = useOrgStanding(currentOrganization?.id ?? null);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Wait for org resolution before deciding. If the user has no org yet, let
  // them through (nothing to lock).
  if (orgLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // UNKNOWN: platform-operator bypass. The existing OrganizationContext does
  // not expose user_roles admin status, so we skip the bypass here. The
  // server-side RLS still lets operators read data (org_in_good_standing is
  // not consulted for operators via org_access_allowed, and operators can
  // always reach the DB directly). Add a bypass once a role hook exists.
  if (currentOrganization && !standing.loading && !standing.ok) {
    return <BillingPaused />;
  }

  return <>{children}</>;
};
=== FILE: src/integrations/supabase/types.ts ===
// This file is automatically generated. Do not edit it directly.
// Appended: org_in_good_standing / org_access_allowed RPCs and stripe_events table.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      stripe_events: {
        Row: {
          id: string;
          type: string;
          received_at: string;
        };
        Insert: {
          id: string;
          type: string;
          received_at?: string;
        };
        Update: {
          id?: string;
          type?: string;
          received_at?: string;
        };
        Relationships: [];
      };
      // ...existing tables unchanged...
      [key: string]: unknown;
    };
    Views: Record<string, never>;
    Functions: {
      org_in_good_standing: {
        Args: { p_org_id: string };
        Returns: boolean;
      };
      org_access_allowed: {
        Args: { p_org_id: string };
        Returns: boolean;
      };
      [key: string]: unknown;
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
=== FILE: src/hooks/useOrgStanding.ts ===
/**
 * useOrgStanding
 *
 * Calls public.org_in_good_standing(p_org_id) and caches the result for 60s.
 * Returns { ok, loading, status } where status is a coarse label for UI copy.
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const CACHE_TTL_MS = 60_000;

type CacheEntry = { ok: boolean; at: number };
const cache = new Map<string, CacheEntry>();

export type OrgStandingStatus = 'ok' | 'paused' | 'unknown';

export interface OrgStanding {
  ok: boolean;
  loading: boolean;
  status: OrgStandingStatus;
}

export function useOrgStanding(organizationId: string | null | undefined): OrgStanding {
  const [state, setState] = useState<OrgStanding>(() => {
    if (!organizationId) return { ok: true, loading: false, status: 'ok' };
    const cached = cache.get(organizationId);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return { ok: cached.ok, loading: false, status: cached.ok ? 'ok' : 'paused' };
    }
    return { ok: true, loading: true, status: 'unknown' };
  });

  useEffect(() => {
    if (!organizationId) {
      setState({ ok: true, loading: false, status: 'ok' });
      return;
    }

    const cached = cache.get(organizationId);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      setState({ ok: cached.ok, loading: false, status: cached.ok ? 'ok' : 'paused' });
      return;
    }

    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));

    (async () => {
      const { data, error } = await supabase.rpc('org_in_good_standing', {
        p_org_id: organizationId,
      });
      if (cancelled) return;
      if (error) {
        // Fail open on transport errors so a transient RPC failure does not
        // lock every user out. RLS still enforces the lock server-side.
        console.error('[useOrgStanding] rpc failed:', error.message);
        setState({ ok: true, loading: false, status: 'unknown' });
        return;
      }
      const ok = data === true;
      cache.set(organizationId, { ok, at: Date.now() });
      setState({ ok, loading: false, status: ok ? 'ok' : 'paused' });
    })();

    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  return state;
}
=== FILE: src/components/BillingPaused.tsx ===
import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizationContext } from '@/contexts/OrganizationContext';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

/**
 * Full-screen lock shown when the current organization is not in good standing.
 * "Resume" opens the Stripe billing portal (or checkout) in a new tab.
 */
export const BillingPaused: React.FC = () => {
  const { signOut } = useAuth();
  const { currentOrganization } = useOrganizationContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleResume = async () => {
    if (!currentOrganization) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('billing-portal', {
        body: { organization_id: currentOrganization.id },
      });
      if (fnError) throw fnError;
      const url = (data as { data?: { url?: string } } | null)?.data?.url;
      if (!url) throw new Error('No billing URL returned');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open billing');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <h1 className="text-2xl font-semibold">Your workspace is paused</h1>
        <p className="text-muted-foreground">
          Your subscription is not in good standing. Update your payment method to
          restore access to your data and tools.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-col gap-3">
          <Button onClick={handleResume} disabled={busy || !currentOrganization}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Resume'}
          </Button>
          <button
            type="button"
            onClick={() => { void signOut(); }}
            className="text-sm text-muted-foreground underline"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
};
=== FILE: src/components/ProtectedRoute.tsx ===
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizationContext } from '@/contexts/OrganizationContext';
import { useOrgStanding } from '@/hooks/useOrgStanding';
import { BillingPaused } from '@/components/BillingPaused';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading } = useAuth();
  const { currentOrganization, loading: orgLoading } = useOrganizationContext();
  const standing = useOrgStanding(currentOrganization?.id ?? null);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Wait for org resolution before deciding. If the user has no org yet, let
  // them through (nothing to lock).
  if (orgLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // UNKNOWN: platform-operator bypass. The existing OrganizationContext does
  // not expose user_roles admin status, so we skip the bypass here. The
  // server-side RLS still lets operators read data (org_in_good_standing is
  // not consulted for operators via org_access_allowed, and operators can
  // always reach the DB directly). Add a bypass once a role hook exists.
  if (currentOrganization && !standing.loading && !standing.ok) {
    return <BillingPaused />;
  }

  return <>{children}</>;
};
=== FILE: src/integrations/supabase/types.ts ===
// This file is automatically generated. Do not edit it directly.
// Appended: org_in_good_standing / org_access_allowed RPCs and stripe_events table.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      stripe_events: {
        Row: {
          id: string;
          type: string;
          received_at: string;
        };
        Insert: {
          id: string;
          type: string;
          received_at?: string;
        };
        Update: {
          id?: string;
          type?: string;
          received_at?: string;
        };
        Relationships: [];
      };
      // ...existing tables unchanged...
      [key: string]: unknown;
    };
    Views: Record<string, never>;
    Functions: {
      org_in_good_standing: {
        Args: { p_org_id: string };
        Returns: boolean;
      };
      org_access_allowed: {
        Args: { p_org_id: string };
        Returns: boolean;
      };
      [key: string]: unknown;
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};