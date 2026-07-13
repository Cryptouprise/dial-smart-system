export const CREDIT_PURCHASE_POLICY_VERSION = "credit-packages-v1";
export const CREDIT_PURCHASE_CURRENCY = "usd";

export interface CreditPurchasePackage {
  paidAmountCents: number;
  bonusCents: number;
}

// This is the authoritative server-side purchase catalog. Checkout is
// intentionally restricted to these exact packages so a browser cannot mint a
// caller-selected bonus or invent an unreviewed paid-to-credit conversion.
export const CREDIT_PURCHASE_CATALOG: readonly CreditPurchasePackage[] = Object
  .freeze([
    { paidAmountCents: 2_500, bonusCents: 0 },
    { paidAmountCents: 5_000, bonusCents: 250 },
    { paidAmountCents: 10_000, bonusCents: 750 },
    { paidAmountCents: 25_000, bonusCents: 2_500 },
    { paidAmountCents: 50_000, bonusCents: 7_500 },
    { paidAmountCents: 100_000, bonusCents: 20_000 },
  ]);

export interface CreditPurchasePlan extends CreditPurchasePackage {
  currency: typeof CREDIT_PURCHASE_CURRENCY;
  creditAmountCents: number;
  policyVersion: typeof CREDIT_PURCHASE_POLICY_VERSION;
}

export interface CheckoutCreditDecision extends CreditPurchasePlan {
  organizationId: string;
  stripePaymentId: string;
}

export interface AutoRechargeCreditDecision {
  organizationId: string;
  stripePaymentId: string;
  paidAmountCents: number;
  creditAmountCents: number;
  currency: typeof CREDIT_PURCHASE_CURRENCY;
}

export type ServiceControlledCreditAction =
  | "add_credits"
  | "reserve_credits"
  | "finalize_cost";

export interface BillingSettingsUpdate {
  auto_recharge_enabled?: boolean;
  auto_recharge_amount_cents?: number;
  auto_recharge_trigger_cents?: number;
  low_balance_threshold_cents?: number;
}

export interface CurrentBillingSettings {
  auto_recharge_amount_cents: unknown;
  auto_recharge_trigger_cents: unknown;
}

export interface CheckoutRedirectUrls {
  successUrl: string;
  cancelUrl: string;
}

const MIN_BILLING_THRESHOLD_CENTS = 100;
const MAX_BILLING_THRESHOLD_CENTS = 100_000;

export class CreditAuthorizationError extends Error {
  constructor(
    message =
      "Forbidden: direct credit adjustments require the platform service role",
  ) {
    super(message);
    this.name = "CreditAuthorizationError";
  }
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requirePositiveIntegerCents(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer number of cents`);
  }
  return value;
}

function requireMetadataInteger(
  metadata: Record<string, unknown>,
  key: string,
): number {
  const raw = metadata[key];
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) {
    throw new Error(`Stripe metadata ${key} is missing or invalid`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Stripe metadata ${key} is outside the supported range`);
  }
  return value;
}

function requireOrganizationId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value)
  ) {
    throw new Error("Stripe metadata organization_id is missing or invalid");
  }
  return value;
}

function requireStripeId(
  value: unknown,
  prefix: string,
  label: string,
): string {
  const candidate = typeof value === "string"
    ? value
    : value && typeof value === "object" &&
        typeof (value as Record<string, unknown>).id === "string"
    ? String((value as Record<string, unknown>).id)
    : "";
  if (!candidate.startsWith(prefix)) {
    throw new Error(`${label} is missing or invalid`);
  }
  return candidate;
}

export function assertServiceControlledCreditAction(
  action: ServiceControlledCreditAction,
  isServiceRole: boolean,
): void {
  if (!isServiceRole) {
    throw new CreditAuthorizationError(
      `Forbidden: ${action} requires the platform service role`,
    );
  }
}

export function assertBillingSettingsController(
  isServiceRole: boolean,
  membershipRole: unknown,
): void {
  if (
    !isServiceRole && membershipRole !== "owner" && membershipRole !== "admin"
  ) {
    throw new CreditAuthorizationError(
      "Forbidden: billing settings require an organization owner or admin",
    );
  }
}

function requireBoundedIntegerCents(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" || !Number.isSafeInteger(value) ||
    value < minimum || value > maximum
  ) {
    throw new Error(
      `${label} must be an integer between ${minimum} and ${maximum} cents`,
    );
  }
  return value;
}

export function resolveBillingSettingsUpdate(
  request: Record<string, unknown>,
  current: CurrentBillingSettings,
): BillingSettingsUpdate {
  const updates: BillingSettingsUpdate = {};

  if (request.auto_recharge_enabled !== undefined) {
    if (typeof request.auto_recharge_enabled !== "boolean") {
      throw new Error("auto_recharge_enabled must be a boolean");
    }
    if (request.auto_recharge_enabled) {
      throw new Error(
        "Auto-recharge is launch-disabled until verified payment-method capture is certified",
      );
    }
    updates.auto_recharge_enabled = request.auto_recharge_enabled;
  }

  if (request.auto_recharge_amount_cents !== undefined) {
    updates.auto_recharge_amount_cents = resolveCreditPurchasePlan(
      request.auto_recharge_amount_cents,
    ).paidAmountCents;
  }

  if (request.auto_recharge_trigger_cents !== undefined) {
    updates.auto_recharge_trigger_cents = requireBoundedIntegerCents(
      request.auto_recharge_trigger_cents,
      "auto_recharge_trigger_cents",
      MIN_BILLING_THRESHOLD_CENTS,
      MAX_BILLING_THRESHOLD_CENTS,
    );
  }

  if (request.low_balance_threshold_cents !== undefined) {
    updates.low_balance_threshold_cents = requireBoundedIntegerCents(
      request.low_balance_threshold_cents,
      "low_balance_threshold_cents",
      MIN_BILLING_THRESHOLD_CENTS,
      MAX_BILLING_THRESHOLD_CENTS,
    );
  }

  const touchesRecharge = updates.auto_recharge_amount_cents !== undefined ||
    updates.auto_recharge_trigger_cents !== undefined;
  if (touchesRecharge) {
    const effectiveAmount = resolveCreditPurchasePlan(
      updates.auto_recharge_amount_cents ?? current.auto_recharge_amount_cents,
    ).paidAmountCents;
    const effectiveTrigger = requireBoundedIntegerCents(
      updates.auto_recharge_trigger_cents ??
        current.auto_recharge_trigger_cents,
      "auto_recharge_trigger_cents",
      MIN_BILLING_THRESHOLD_CENTS,
      MAX_BILLING_THRESHOLD_CENTS,
    );
    if (effectiveTrigger >= effectiveAmount) {
      throw new Error(
        "auto_recharge_trigger_cents must be lower than auto_recharge_amount_cents",
      );
    }
  }

  return updates;
}

export function resolveCreditPurchasePlan(
  paidAmountCents: unknown,
): CreditPurchasePlan {
  const amount = requirePositiveIntegerCents(paidAmountCents, "amount_cents");
  const selectedPackage = CREDIT_PURCHASE_CATALOG.find((entry) =>
    entry.paidAmountCents === amount
  );
  if (!selectedPackage) {
    throw new Error(
      "Unsupported credit package; checkout requires an exact server-defined package",
    );
  }
  return {
    ...selectedPackage,
    creditAmountCents: selectedPackage.paidAmountCents +
      selectedPackage.bonusCents,
    currency: CREDIT_PURCHASE_CURRENCY,
    policyVersion: CREDIT_PURCHASE_POLICY_VERSION,
  };
}

export function resolveCheckoutRequest(
  request: Record<string, unknown>,
): CreditPurchasePlan {
  if (Object.prototype.hasOwnProperty.call(request, "bonus_cents")) {
    throw new Error(
      "bonus_cents is server-controlled and must not be supplied by the caller",
    );
  }
  return resolveCreditPurchasePlan(request.amount_cents);
}

export function resolveCheckoutRedirectUrls(
  configuredAppUrl: unknown,
  request: Record<string, unknown>,
): CheckoutRedirectUrls {
  if (
    Object.prototype.hasOwnProperty.call(request, "success_url") ||
    Object.prototype.hasOwnProperty.call(request, "cancel_url")
  ) {
    throw new Error(
      "Checkout redirect URLs are server-controlled and must not be supplied by the caller",
    );
  }
  if (typeof configuredAppUrl !== "string" || configuredAppUrl.trim() === "") {
    throw new Error(
      "PUBLIC_APP_URL or APP_URL must configure the checkout origin",
    );
  }

  let configured: URL;
  try {
    configured = new URL(configuredAppUrl);
  } catch {
    throw new Error("Configured checkout origin is not a valid absolute URL");
  }
  const localHostname = configured.hostname === "localhost" ||
    configured.hostname === "127.0.0.1" || configured.hostname === "[::1]";
  if (
    configured.protocol !== "https:" &&
    !(localHostname && configured.protocol === "http:")
  ) {
    throw new Error("Configured checkout origin must use HTTPS");
  }
  if (
    configured.username || configured.password || configured.pathname !== "/" ||
    configured.search || configured.hash
  ) {
    throw new Error(
      "Configured checkout URL must contain only an application origin",
    );
  }

  return {
    successUrl: `${configured.origin}/?credit_checkout=success`,
    cancelUrl: `${configured.origin}/?credit_checkout=cancelled`,
  };
}

export function resolvePaidCheckoutSession(
  sessionValue: unknown,
): CheckoutCreditDecision {
  const session = requireRecord(sessionValue, "Stripe checkout session");
  const metadata = requireRecord(session.metadata, "Stripe checkout metadata");

  if (
    session.mode !== "payment" || session.status !== "complete" ||
    session.payment_status !== "paid"
  ) {
    throw new Error("Stripe checkout session is not a completed paid payment");
  }
  if (session.currency !== CREDIT_PURCHASE_CURRENCY) {
    throw new Error(
      `Stripe checkout currency must be ${CREDIT_PURCHASE_CURRENCY}`,
    );
  }
  if (metadata.credit_policy_version !== CREDIT_PURCHASE_POLICY_VERSION) {
    throw new Error("Stripe checkout uses an unknown or legacy credit policy");
  }

  const paidAmountCents = requirePositiveIntegerCents(
    session.amount_total,
    "Stripe amount_total",
  );
  const plan = resolveCreditPurchasePlan(paidAmountCents);
  const expectedPaidAmount = requireMetadataInteger(
    metadata,
    "paid_amount_cents",
  );
  const expectedCreditAmount = requireMetadataInteger(
    metadata,
    "credit_amount_cents",
  );
  if (
    expectedPaidAmount !== plan.paidAmountCents ||
    expectedCreditAmount !== plan.creditAmountCents
  ) {
    throw new Error(
      "Stripe checkout amount does not match the server credit policy",
    );
  }

  return {
    ...plan,
    organizationId: requireOrganizationId(metadata.organization_id),
    stripePaymentId: requireStripeId(
      session.payment_intent,
      "pi_",
      "Stripe payment_intent",
    ),
  };
}

export function resolveSucceededAutoRecharge(
  paymentIntentValue: unknown,
): AutoRechargeCreditDecision | null {
  const paymentIntent = requireRecord(
    paymentIntentValue,
    "Stripe payment intent",
  );
  // Stripe sends this event for every successful PaymentIntent on the account.
  // Ignore unrelated payments instead of retrying them forever just because
  // they do not carry this application's auto-recharge metadata.
  if (
    !paymentIntent.metadata ||
    typeof paymentIntent.metadata !== "object" ||
    Array.isArray(paymentIntent.metadata)
  ) {
    return null;
  }
  const metadata = paymentIntent.metadata as Record<string, unknown>;
  if (metadata.auto_recharge !== "true") return null;
  if (paymentIntent.status !== "succeeded") {
    throw new Error("Auto-recharge payment intent has not succeeded");
  }
  if (paymentIntent.currency !== CREDIT_PURCHASE_CURRENCY) {
    throw new Error(
      `Auto-recharge currency must be ${CREDIT_PURCHASE_CURRENCY}`,
    );
  }

  const paidAmountCents = requirePositiveIntegerCents(
    paymentIntent.amount_received,
    "Stripe amount_received",
  );
  return {
    organizationId: requireOrganizationId(metadata.organization_id),
    stripePaymentId: requireStripeId(
      paymentIntent.id,
      "pi_",
      "Stripe payment intent id",
    ),
    paidAmountCents,
    creditAmountCents: paidAmountCents,
    currency: CREDIT_PURCHASE_CURRENCY,
  };
}
