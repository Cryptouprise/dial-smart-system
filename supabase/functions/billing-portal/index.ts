/**
 * Billing Portal
 *
 * POST { organization_id }
 * - Caller must be signed in (Supabase JWT) and a member of the organization (organization_users).
 * - If the org has a stripe_customer_id: create a Stripe Customer Portal session and return its URL.
 *   (Requires a Customer Portal configuration saved once in the Stripe Dashboard:
 *    Settings -> Billing -> Customer portal -> Save. Without it Stripe returns
 *    "No configuration provided and your ... default configuration has not been created".)
 * - Otherwise: create a Checkout Session (mode=subscription) for the org's plan's plans.stripe_price_id
 *   and return its URL. client_reference_id, metadata.organization_id and
 *   subscription_data.metadata.organization_id all carry the org id so stripe-webhook can resolve it on
 *   checkout.session.completed, customer.subscription.* and invoice.* events.
 *
 * Response (successResponse): { success: true, data: { url, mode: "portal" | "checkout" }, timestamp }
 *
 * Secrets (Deno.env): STRIPE_SECRET_KEY, APP_URL (public app origin, e.g. https://app.example.com),
 * plus the Supabase-provided SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 * Deploy with the default verify_jwt = true.
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
const STRIPE_TIMEOUT_MS = 10_000;

async function stripePost(
  path: string,
  secretKey: string,
  form: URLSearchParams,
  idempotencyKey?: string,
): Promise<any> {
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${secretKey}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  const res = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers,
    body: form.toString(),
    signal: AbortSignal.timeout(STRIPE_TIMEOUT_MS),
  });

  let json: any = null;
  try {
    json = await res.json();
  } catch {
    // fall through; handled below
  }
  if (!res.ok) {
    const message = json?.error?.message ?? `Stripe ${path} failed (${res.status})`;
    // Stripe's message is safe to surface (no secrets) and tells the operator what to configure.
    throw new Error(`Stripe error: ${message}`);
  }
  if (!json || typeof json.url !== "string" || json.url.length === 0) {
    throw new Error(`Stripe ${path} returned no url`);
  }
  return json;
}

/** APP_URL may carry a path (e.g. https://host/app). Resolve relative to it so that path survives. */
function appUrl(base: string, relativePath: string): URL {
  const normalized = base.endsWith("/") ? base : `${base}/`;
  return new URL(relativePath, normalized);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    // Plain Error so errorResponse honours the explicit status (ValidationError would force 400).
    return errorResponse(new Error("Method not allowed"), 405);
  }

  try {
    const env = requireEnvVars(
      "STRIPE_SECRET_KEY",
      "APP_URL",
      "SUPABASE_URL",
      "SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    );

    // authenticateUser(req, client) -> { user, userId }; it calls client.auth.getUser(<bearer token>)
    // (_shared/utils.ts:148-166), so the anon client is enough to validate the JWT.
    const anonClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
    const { user, userId } = await authenticateUser(req, anonClient);

    const body = await parseJSON<{ organization_id?: unknown }>(req);
    let organizationId: string;
    try {
      // requireExplicitOrganizationId(unknown) -> lowercase uuid string, throws plain Error
      // (_shared/tenant-context.ts:16-22); convert to a 400.
      organizationId = requireExplicitOrganizationId(body?.organization_id);
    } catch {
      throw new ValidationError("organization_id (uuid) is required");
    }

    // Service-role client for the membership + org + plan lookups (organizations billing columns are
    // readable by members anyway, but the lookup must not depend on the caller's RLS view).
    const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    const { data: membership, error: memberErr } = await admin
      .from("organization_users")
      .select("organization_id, role")
      .eq("user_id", userId)
      .eq("organization_id", organizationId)
      .in("role", ["owner", "admin"]) // billing is an admin action
      .maybeSingle();
    if (memberErr) {
      throw new Error(`Membership lookup failed: ${memberErr.message}`);
    }
    if (!membership) {
      // Do not reveal whether the org exists to a non-member.
      throw new NotFoundError("Organization not found");
    }

    const { data: org, error: orgErr } = await admin
      .from("organizations")
      .select("id, name, billing_email, stripe_customer_id, plan_id")
      .eq("id", organizationId)
      .maybeSingle();
    if (orgErr) {
      throw new Error(`Organization lookup failed: ${orgErr.message}`);
    }
    if (!org) {
      throw new NotFoundError("Organization not found");
    }

    const returnUrl = appUrl(env.APP_URL, "dashboard");

    // Path A: existing Stripe customer -> Customer Portal session.
    if (org.stripe_customer_id) {
      const form = new URLSearchParams();
      form.set("customer", org.stripe_customer_id);
      form.set("return_url", returnUrl.toString());
      const session = await stripePost("/billing_portal/sessions", env.STRIPE_SECRET_KEY, form);
      return successResponse({ url: session.url, mode: "portal" });
    }

    // Path B: no customer yet -> Checkout Session for the org's plan.
    if (!org.plan_id) {
      throw new ValidationError("Organization has no plan and no Stripe customer");
    }
    const { data: plan, error: planErr } = await admin
      .from("plans")
      .select("id, stripe_price_id, is_active")
      .eq("id", org.plan_id)
      .maybeSingle();
    if (planErr) {
      throw new Error(`Plan lookup failed: ${planErr.message}`);
    }
    if (!plan?.stripe_price_id) {
      throw new ValidationError(`Plan "${org.plan_id}" has no Stripe price configured (plans.stripe_price_id)`);
    }

    const successUrl = appUrl(env.APP_URL, "dashboard");
    successUrl.searchParams.set("checkout", "success");
    const cancelUrl = appUrl(env.APP_URL, "dashboard");
    cancelUrl.searchParams.set("checkout", "cancel");

    const form = new URLSearchParams();
    form.set("mode", "subscription");
    form.set("line_items[0][price]", plan.stripe_price_id);
    form.set("line_items[0][quantity]", "1");
    form.set("client_reference_id", organizationId);
    form.set("success_url", successUrl.toString());
    form.set("cancel_url", cancelUrl.toString());
    // customer_email is only accepted when no `customer` is passed; this path has none.
    // Prefer the org's billing email so the Stripe customer matches the company, else the caller.
    const email = (typeof org.billing_email === "string" && org.billing_email.includes("@"))
      ? org.billing_email
      : (typeof user?.email === "string" ? user.email : null);
    if (email) form.set("customer_email", email);
    // session.metadata -> read by stripe-webhook on checkout.session.completed
    form.set("metadata[organization_id]", organizationId);
    // subscription.metadata -> read by stripe-webhook on customer.subscription.* and (via
    // subscription_details.metadata) on invoice.* events. Key name matches resolveOrganizationId().
    form.set("subscription_data[metadata][organization_id]", organizationId);

    // One checkout per org per minute from this path; a double-click reuses the same session.
    const idempotencyKey = `checkout_${organizationId}_${Math.floor(Date.now() / 60_000)}`;
    const session = await stripePost("/checkout/sessions", env.STRIPE_SECRET_KEY, form, idempotencyKey);
    return successResponse({ url: session.url, mode: "checkout" });
  } catch (error) {
    return errorResponse(error);
  }
});
