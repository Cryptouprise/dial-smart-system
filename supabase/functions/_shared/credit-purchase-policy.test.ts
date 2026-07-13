import {
  assertBillingSettingsController,
  assertServiceControlledCreditAction,
  CREDIT_PURCHASE_POLICY_VERSION,
  CreditAuthorizationError,
  resolveBillingSettingsUpdate,
  resolveCheckoutRedirectUrls,
  resolveCheckoutRequest,
  resolveCreditPurchasePlan,
  resolvePaidCheckoutSession,
  resolveSucceededAutoRecharge,
} from "./credit-purchase-policy.ts";

const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function assertThrows(fn: () => unknown, messagePart: string): Error {
  try {
    fn();
  } catch (error) {
    const caught = error as Error;
    if (!caught.message.includes(messagePart)) {
      throw new Error(
        `Expected error containing ${JSON.stringify(messagePart)}, got ${
          JSON.stringify(caught.message)
        }`,
      );
    }
    return caught;
  }
  throw new Error(`Expected error containing ${JSON.stringify(messagePart)}`);
}

function validCheckoutSession(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const base = {
    id: "cs_test_secure",
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    currency: "usd",
    amount_total: 5_000,
    payment_intent: "pi_secure_paid",
    metadata: {
      organization_id: ORGANIZATION_ID,
      credit_policy_version: CREDIT_PURCHASE_POLICY_VERSION,
      paid_amount_cents: "5000",
      credit_amount_cents: "5250",
    },
  };
  return { ...base, ...overrides };
}

Deno.test("all direct balance and reservation mutations are platform service-role only", () => {
  for (
    const action of ["add_credits", "reserve_credits", "finalize_cost"] as const
  ) {
    const error = assertThrows(
      () => assertServiceControlledCreditAction(action, false),
      "platform service role",
    );
    if (!(error instanceof CreditAuthorizationError)) {
      throw new Error("Expected a CreditAuthorizationError for a user JWT");
    }
    assertServiceControlledCreditAction(action, true);
  }
});

Deno.test("billing settings require owner/admin and validated server amounts", () => {
  assertThrows(
    () => assertBillingSettingsController(false, "member"),
    "owner or admin",
  );
  assertThrows(
    () => assertBillingSettingsController(false, "manager"),
    "owner or admin",
  );
  assertBillingSettingsController(false, "admin");
  assertBillingSettingsController(false, "owner");
  assertBillingSettingsController(true, null);

  const current = {
    auto_recharge_amount_cents: 5_000,
    auto_recharge_trigger_cents: 500,
  };
  assertEquals(
    resolveBillingSettingsUpdate({
      auto_recharge_enabled: false,
      auto_recharge_amount_cents: 10_000,
      auto_recharge_trigger_cents: 1_000,
      low_balance_threshold_cents: 2_000,
    }, current),
    {
      auto_recharge_enabled: false,
      auto_recharge_amount_cents: 10_000,
      auto_recharge_trigger_cents: 1_000,
      low_balance_threshold_cents: 2_000,
    },
  );
  assertThrows(
    () =>
      resolveBillingSettingsUpdate({
        auto_recharge_enabled: true,
      }, current),
    "launch-disabled",
  );
  assertThrows(
    () =>
      resolveBillingSettingsUpdate({
        auto_recharge_amount_cents: 5_001,
      }, current),
    "server-defined package",
  );
  assertThrows(
    () =>
      resolveBillingSettingsUpdate({
        auto_recharge_trigger_cents: 5_000,
      }, current),
    "must be lower",
  );
  assertThrows(
    () =>
      resolveBillingSettingsUpdate({
        auto_recharge_trigger_cents: 99.5,
      }, current),
    "must be an integer",
  );
});

Deno.test("checkout rejects a caller-supplied bonus, including zero", () => {
  assertThrows(
    () => resolveCheckoutRequest({ amount_cents: 5_000, bonus_cents: 999_999 }),
    "server-controlled",
  );
  assertThrows(
    () => resolveCheckoutRequest({ amount_cents: 5_000, bonus_cents: 0 }),
    "server-controlled",
  );
});

Deno.test("checkout redirects derive only from the configured app origin", () => {
  assertEquals(
    resolveCheckoutRedirectUrls("https://dialer.example.com/", {}),
    {
      successUrl: "https://dialer.example.com/?credit_checkout=success",
      cancelUrl: "https://dialer.example.com/?credit_checkout=cancelled",
    },
  );
  assertThrows(
    () => resolveCheckoutRedirectUrls(undefined, {}),
    "must configure",
  );
  assertThrows(
    () =>
      resolveCheckoutRedirectUrls("https://dialer.example.com/", {
        success_url: "https://attacker.example/phish",
      }),
    "server-controlled",
  );
  assertThrows(
    () => resolveCheckoutRedirectUrls("http://dialer.example.com/", {}),
    "HTTPS",
  );
  assertThrows(
    () => resolveCheckoutRedirectUrls("https://dialer.example.com/app", {}),
    "only an application origin",
  );
});

Deno.test("checkout accepts only the exact server package catalog", () => {
  assertEquals(resolveCreditPurchasePlan(5_000), {
    paidAmountCents: 5_000,
    bonusCents: 250,
    creditAmountCents: 5_250,
    currency: "usd",
    policyVersion: CREDIT_PURCHASE_POLICY_VERSION,
  });
  assertThrows(
    () => resolveCreditPurchasePlan(5_001),
    "server-defined package",
  );
  assertThrows(
    () => resolveCreditPurchasePlan(5_000.5),
    "integer number of cents",
  );
});

Deno.test("paid checkout credits Stripe amount_total through the server policy", () => {
  const decision = resolvePaidCheckoutSession(validCheckoutSession({
    metadata: {
      organization_id: ORGANIZATION_ID,
      credit_policy_version: CREDIT_PURCHASE_POLICY_VERSION,
      paid_amount_cents: "5000",
      credit_amount_cents: "5250",
      // A legacy/malicious bonus field cannot influence the decision.
      bonus_cents: "999999999",
    },
  }));
  assertEquals(decision, {
    paidAmountCents: 5_000,
    bonusCents: 250,
    creditAmountCents: 5_250,
    currency: "usd",
    policyVersion: CREDIT_PURCHASE_POLICY_VERSION,
    organizationId: ORGANIZATION_ID,
    stripePaymentId: "pi_secure_paid",
  });
});

Deno.test("checkout fails closed for unpaid, legacy, or mismatched sessions", () => {
  assertThrows(
    () =>
      resolvePaidCheckoutSession(
        validCheckoutSession({ payment_status: "unpaid" }),
      ),
    "completed paid payment",
  );
  assertThrows(
    () =>
      resolvePaidCheckoutSession(validCheckoutSession({
        metadata: {
          organization_id: ORGANIZATION_ID,
          paid_amount_cents: "5000",
          credit_amount_cents: "5250",
        },
      })),
    "unknown or legacy credit policy",
  );
  assertThrows(
    () =>
      resolvePaidCheckoutSession(validCheckoutSession({
        metadata: {
          organization_id: ORGANIZATION_ID,
          credit_policy_version: CREDIT_PURCHASE_POLICY_VERSION,
          paid_amount_cents: "5000",
          credit_amount_cents: "999999",
        },
      })),
    "does not match",
  );
});

Deno.test("auto-recharge credits amount_received, not caller/requested amount", () => {
  const decision = resolveSucceededAutoRecharge({
    id: "pi_auto_paid",
    status: "succeeded",
    currency: "usd",
    amount: 999_999,
    amount_received: 5_000,
    metadata: {
      organization_id: ORGANIZATION_ID,
      auto_recharge: "true",
    },
  });
  assertEquals(decision, {
    organizationId: ORGANIZATION_ID,
    stripePaymentId: "pi_auto_paid",
    paidAmountCents: 5_000,
    creditAmountCents: 5_000,
    currency: "usd",
  });
  assertEquals(resolveSucceededAutoRecharge({ metadata: {} }), null);
  assertEquals(
    resolveSucceededAutoRecharge({ id: "pi_unrelated", metadata: null }),
    null,
  );
});

Deno.test("auto-recharge fails closed on non-USD or missing received funds", () => {
  const base = {
    id: "pi_auto_paid",
    status: "succeeded",
    currency: "usd",
    amount_received: 5_000,
    metadata: { organization_id: ORGANIZATION_ID, auto_recharge: "true" },
  };
  assertThrows(
    () => resolveSucceededAutoRecharge({ ...base, currency: "eur" }),
    "currency",
  );
  assertThrows(
    () => resolveSucceededAutoRecharge({ ...base, amount_received: 0 }),
    "amount_received",
  );
});
