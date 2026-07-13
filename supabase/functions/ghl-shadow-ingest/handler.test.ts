// deno-lint-ignore-file no-import-prefix -- repository Edge tests pin the deployed Deno std version.
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { importShadowIdentifierKey } from "../_shared/ghl-shadow-contract.ts";
import {
  GHL_SHADOW_MAX_BODY_BYTES,
  type GhlShadowReceiptInput,
  type GhlShadowStore,
  handleGhlShadowIngestRequest,
} from "./handler.ts";

function encodedSecret(): string {
  return `base64url:${
    btoa(String.fromCharCode(...Uint8Array.from(
      { length: 32 },
      (_, index) => index + 7,
    ))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  }`;
}

function request(body: string, headers: Record<string, string> = {}): Request {
  return new Request("https://example.invalid/functions/v1/ghl-shadow-ingest", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ghl-signature": "test-modern-signature",
      ...headers,
    },
    body,
  });
}

async function dependencies(overrides: Partial<GhlShadowStore> = {}) {
  const receipts: GhlShadowReceiptInput[] = [];
  const store: GhlShadowStore = {
    getEnabledContract: () => Promise.resolve(null),
    commitReceipt: (receipt) => {
      receipts.push(receipt);
      return Promise.resolve({
        receipt_id: "11111111-1111-4111-8111-111111111111",
        commit_status: "committed",
        decision: receipt.decision,
        reason_codes: receipt.reason_codes,
      });
    },
    ...overrides,
  };
  const deps: Parameters<typeof handleGhlShadowIngestRequest>[1] = {
    store,
    identifierKey: await importShadowIdentifierKey(encodedSecret()),
    now: () => new Date("2026-07-13T16:05:00Z"),
    verifySignature: () =>
      Promise.resolve({
        valid: true as const,
        scheme: "x-ghl-signature-ed25519" as const,
      }),
  };
  return { receipts, deps };
}

Deno.test("returns privacy-preserving 204 only after a durable quarantine commit", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => release = resolve);
  let committed = false;
  const { deps } = await dependencies({
    commitReceipt: async (receipt) => {
      await gate;
      committed = true;
      return {
        receipt_id: "11111111-1111-4111-8111-111111111111",
        commit_status: "committed",
        decision: receipt.decision,
        reason_codes: receipt.reason_codes,
      };
    },
  });
  const pending = handleGhlShadowIngestRequest(
    request(JSON.stringify({
      type: "ContactCreate",
      locationId: "unknown_location",
      webhookId: "webhook-1",
      timestamp: "2026-07-13T16:00:00Z",
    })),
    deps,
  );
  await Promise.resolve();
  assertEquals(committed, false);
  release();
  const response = await pending;
  assertEquals(committed, true);
  assertEquals(response.status, 204);
  assertEquals(await response.text(), "");
});

Deno.test("signed duplicate JSON keys are durably quarantined without parsing ambiguity", async () => {
  const { deps, receipts } = await dependencies();
  const response = await handleGhlShadowIngestRequest(
    request(
      '{"type":"ContactCreate","type":"ContactUpdate","locationId":"location_1"}',
    ),
    deps,
  );
  assertEquals(response.status, 204);
  assertEquals(receipts.length, 1);
  assertEquals(receipts[0].decision, "quarantined");
  assertEquals(receipts[0].reason_codes, ["DUPLICATE_JSON_KEY"]);
  assertEquals(receipts[0].source_contact_identifier_hmac, null);
  assertEquals(receipts[0].consent_phone_identifier_hmac, null);
});

Deno.test("missing webhook id and source timestamp are explicit durable quarantine evidence", async () => {
  const { deps, receipts } = await dependencies();
  const response = await handleGhlShadowIngestRequest(
    request(JSON.stringify({
      type: "ContactCreate",
      locationId: "unknown_location",
    })),
    deps,
  );
  assertEquals(response.status, 204);
  assert(receipts[0].reason_codes.includes("MISSING_WEBHOOK_ID"));
  assert(receipts[0].reason_codes.includes("SOURCE_TIMESTAMP_MISSING"));
  assertEquals(receipts[0].source_occurred_at, null);
});

Deno.test("valid signed source timestamp is preserved for future event ordering", async () => {
  const { deps, receipts } = await dependencies();
  await handleGhlShadowIngestRequest(
    request(JSON.stringify({
      type: "ContactCreate",
      locationId: "unknown_location",
      webhookId: "webhook-2",
      timestamp: "2026-07-13T16:00:00Z",
    })),
    deps,
  );
  assertEquals(receipts[0].source_occurred_at, "2026-07-13T16:00:00Z");
});

Deno.test("impossible signed source timestamp is quarantined and never stored as an instant", async () => {
  const { deps, receipts } = await dependencies();
  const response = await handleGhlShadowIngestRequest(
    request(JSON.stringify({
      type: "ContactCreate",
      locationId: "unknown_location",
      webhookId: "webhook-impossible-date",
      timestamp: "2026-02-31T00:00:00Z",
    })),
    deps,
  );
  assertEquals(response.status, 204);
  assertEquals(receipts[0].source_occurred_at, null);
  assert(receipts[0].reason_codes.includes("SOURCE_TIMESTAMP_INVALID"));
});

Deno.test("invalid signature, legacy-only delivery, and wrong modern scheme never touch storage", async () => {
  let calls = 0;
  const { deps } = await dependencies({
    getEnabledContract: () => {
      calls += 1;
      return Promise.resolve(null);
    },
    commitReceipt: () => {
      calls += 1;
      return Promise.reject(new Error("must not be called"));
    },
  });
  deps.verifySignature = () =>
    Promise.resolve({
      valid: false,
      reason: "signature_mismatch",
    });
  let response = await handleGhlShadowIngestRequest(request("{}"), deps);
  assertEquals(response.status, 401);
  assertEquals(calls, 0);

  response = await handleGhlShadowIngestRequest(
    request("{}", {
      "x-ghl-signature": "",
      "x-wh-signature": "legacy",
    }),
    deps,
  );
  assertEquals(response.status, 401);
  assertEquals(calls, 0);

  deps.verifySignature = () =>
    Promise.resolve({
      valid: true,
      scheme: "x-wh-signature-rsa-sha256",
    });
  response = await handleGhlShadowIngestRequest(request("{}"), deps);
  assertEquals(response.status, 401);
  assertEquals(calls, 0);
});

Deno.test("body and media-type bounds reject before durable acceptance", async () => {
  let calls = 0;
  const { deps } = await dependencies({
    commitReceipt: () => {
      calls += 1;
      return Promise.reject(new Error("must not be called"));
    },
  });
  let response = await handleGhlShadowIngestRequest(
    new Request("https://example.invalid", {
      method: "POST",
      headers: {
        "content-type": "text/plain",
        "x-ghl-signature": "x",
      },
      body: "{}",
    }),
    deps,
  );
  assertEquals(response.status, 415);

  response = await handleGhlShadowIngestRequest(
    request(
      "x".repeat(GHL_SHADOW_MAX_BODY_BYTES + 1),
    ),
    deps,
  );
  assertEquals(response.status, 413);
  assertEquals(calls, 0);
});

Deno.test("database failure never receives a 2xx acknowledgement", async () => {
  const { deps } = await dependencies({
    commitReceipt: () => Promise.reject(new Error("database unavailable")),
  });
  const response = await handleGhlShadowIngestRequest(
    request(JSON.stringify({
      type: "ContactCreate",
      locationId: "unknown_location",
      webhookId: "webhook-3",
      timestamp: "2026-07-13T16:00:00Z",
    })),
    deps,
  );
  assertEquals(response.status, 503);
});
