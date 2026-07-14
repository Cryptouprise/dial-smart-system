import {
  checkAutoRecharge,
  checkBatchCredits,
  checkCreditBalance,
  finalizeCallCost,
} from "./credit-helpers.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function rpcClient(handler: () => unknown): any {
  return { rpc: handler };
}

Deno.test("balance RPC errors fail closed for calls and batches", async () => {
  const client = rpcClient(async () => ({
    data: null,
    error: { message: "ledger unavailable" },
  }));
  const balance = await checkCreditBalance(client, "org-test");
  assertEquals(balance.canMakeCall, false);
  assertEquals(balance.billingEnabled, true);
  assertEquals(balance.error, "ledger unavailable");

  const batch = await checkBatchCredits(client, "org-test", 10);
  assertEquals(batch.canProceed, false);
  assertEquals(batch.error, "ledger unavailable");
});

Deno.test("balance exceptions and malformed results fail closed", async () => {
  const throwing = rpcClient(async () => {
    throw new Error("network down");
  });
  assertEquals(
    (await checkCreditBalance(throwing, "org-test")).canMakeCall,
    false,
  );

  const malformed = rpcClient(async () => ({ data: [], error: null }));
  const result = await checkCreditBalance(malformed, "org-test");
  assertEquals(result.canMakeCall, false);
  assertEquals(result.error, "Credit balance check returned an invalid result");
});

Deno.test("explicit billing-disabled RPC result may proceed", async () => {
  const client = rpcClient(async () => ({
    data: [{ has_balance: true, billing_enabled: false }],
    error: null,
  }));
  const result = await checkCreditBalance(client, "org-test");
  assertEquals(result.canMakeCall, true);
  assertEquals(result.billingEnabled, false);
});

Deno.test("auto-recharge is launch-disabled with an explicit safe result", async () => {
  let rpcCalled = false;
  const client = rpcClient(async () => {
    rpcCalled = true;
    return { data: [{ needs_recharge: true }], error: null };
  });
  assertEquals(await checkAutoRecharge(client, "org-test"), {
    needsRecharge: false,
    currentBalanceCents: 0,
    rechargeAmountCents: 0,
    paymentMethodId: null,
    error:
      "Auto-recharge is launch-disabled until verified payment-method capture is certified",
  });
  assertEquals(rpcCalled, false);
});

Deno.test("short-call finalization fails closed when the ledger RPC fails", async () => {
  const client = rpcClient(async () => ({
    data: null,
    error: { message: "settlement unavailable" },
  }));

  const result = await finalizeCallCost(
    client,
    "org-test",
    "call-log-test",
    "retell-test",
    5,
  );

  assertEquals(result.success, false);
  assertEquals(result.error, "settlement unavailable");
});

Deno.test("short-call finalization reports the ledger settlement result", async () => {
  const client = rpcClient(async () => ({
    data: [{
      success: true,
      amount_deducted_cents: 0,
      new_balance_cents: 875,
      reservation_released_cents: 15,
      margin_cents: 0,
      transaction_id: "transaction-test",
      error_message: null,
    }],
    error: null,
  }));

  const result = await finalizeCallCost(
    client,
    "org-test",
    "call-log-test",
    "retell-test",
    5,
  );

  assertEquals(result.success, true);
  assertEquals(result.newBalanceCents, 875);
  assertEquals(result.reservationReleasedCents, 15);
  assertEquals(result.transactionId, "transaction-test");
});
