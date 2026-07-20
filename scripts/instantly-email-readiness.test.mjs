import assert from "node:assert/strict";
import test from "node:test";

import {
  InstantlyEmailReadinessError,
  inspectInstantlyEmailReadiness,
} from "./instantly-email-readiness.mjs";

const apiKey = "test-instantly-key-0123456789";

test("Instantly readiness performs one read-only redacted account sample", async () => {
  const calls = [];
  const result = await inspectInstantlyEmailReadiness({
    apiKey,
    fetchImpl: async (url, init) => {
      calls.push({ url: url.toString(), init });
      return new Response(JSON.stringify({ items: [{
        email: "private-mailbox@example.test",
        first_name: "Private",
        setup_pending: false,
        warmup_status: 1,
        tracking_domain_status: "active",
      }] }), { status: 200 });
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.instantly.ai/api/v2/accounts?limit=1");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${apiKey}`);
  assert.deepEqual(result, {
    kind: "instantly_email_readiness_v1",
    reachable: true,
    accounts_read_authorized: true,
    sampled_account_count: 1,
    sampled_setup_complete_count: 1,
    sampled_warmup_active_count: 1,
    sampled_tracking_domain_active_count: 1,
    provider_action: "none",
    authority: {
      contact_authorized: false,
      launch_authorized: false,
      queue_mutation_authorized: false,
      crm_write_authorized: false,
      spend_authorized: false,
    },
  });
  assert.equal(JSON.stringify(result).includes("private-mailbox@example.test"), false);
  assert.equal(JSON.stringify(result).includes(apiKey), false);
});

test("Instantly readiness rejects a nonofficial base URL before making a request", async () => {
  let calls = 0;
  await assert.rejects(
    () => inspectInstantlyEmailReadiness({
      apiKey,
      baseUrl: "https://example.test",
      fetchImpl: async () => {
        calls += 1;
        return new Response("{}", { status: 200 });
      },
    }),
    (error) => error instanceof InstantlyEmailReadinessError && error.code === "BASE_URL_FORBIDDEN",
  );
  assert.equal(calls, 0);
});

test("Instantly readiness fails closed on rejected reads without exposing response data", async () => {
  await assert.rejects(
    () => inspectInstantlyEmailReadiness({
      apiKey,
      fetchImpl: async () => new Response(JSON.stringify({ detail: "private upstream error" }), { status: 401 }),
    }),
    (error) => error instanceof InstantlyEmailReadinessError && error.code === "INSTANTLY_READ_REJECTED",
  );
});
