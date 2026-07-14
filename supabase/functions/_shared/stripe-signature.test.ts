import {
  constantTimeEqualBytes,
  STRIPE_SIGNATURE_MAX_AGE_SECONDS,
  STRIPE_SIGNATURE_MAX_FUTURE_SKEW_SECONDS,
  verifyStripeSignature,
} from "./stripe-signature.ts";

const PAYLOAD = '{"id":"evt_secure","type":"checkout.session.completed"}';
const SECRET = "whsec_test_secure";
const NOW_SECONDS = 1_750_000_000;

async function sign(
  timestamp: number,
  payload = PAYLOAD,
  secret = SECRET,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(`${timestamp}.${payload}`),
    ),
  );
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, got ${actual}`);
  }
}

Deno.test("Stripe verifier accepts a current valid v1 signature", async () => {
  const signature = await sign(NOW_SECONDS);
  assertEquals(
    await verifyStripeSignature(
      PAYLOAD,
      `t=${NOW_SECONDS},v1=${signature}`,
      SECRET,
      NOW_SECONDS,
    ),
    true,
  );
});

Deno.test("Stripe verifier accepts any matching v1 during key rotation", async () => {
  const signature = await sign(NOW_SECONDS);
  const invalid = "00".repeat(32);
  assertEquals(
    await verifyStripeSignature(
      PAYLOAD,
      `t=${NOW_SECONDS},v1=${invalid},v0=${invalid},v1=${signature}`,
      SECRET,
      NOW_SECONDS,
    ),
    true,
  );
});

Deno.test("Stripe verifier rejects malformed, stale, and future timestamps", async () => {
  const staleTimestamp = NOW_SECONDS - STRIPE_SIGNATURE_MAX_AGE_SECONDS - 1;
  const futureTimestamp = NOW_SECONDS +
    STRIPE_SIGNATURE_MAX_FUTURE_SKEW_SECONDS + 1;
  assertEquals(
    await verifyStripeSignature(
      PAYLOAD,
      `t=1.5,v1=${await sign(NOW_SECONDS)}`,
      SECRET,
      NOW_SECONDS,
    ),
    false,
  );
  assertEquals(
    await verifyStripeSignature(
      PAYLOAD,
      `t=${staleTimestamp},v1=${await sign(staleTimestamp)}`,
      SECRET,
      NOW_SECONDS,
    ),
    false,
  );
  assertEquals(
    await verifyStripeSignature(
      PAYLOAD,
      `t=${futureTimestamp},v1=${await sign(futureTimestamp)}`,
      SECRET,
      NOW_SECONDS,
    ),
    false,
  );
});

Deno.test("Stripe verifier rejects tampered payloads and signatures", async () => {
  const signature = await sign(NOW_SECONDS);
  assertEquals(
    await verifyStripeSignature(
      `${PAYLOAD} `,
      `t=${NOW_SECONDS},v1=${signature}`,
      SECRET,
      NOW_SECONDS,
    ),
    false,
  );
  assertEquals(
    await verifyStripeSignature(
      PAYLOAD,
      `t=${NOW_SECONDS},v1=${"ff".repeat(32)}`,
      SECRET,
      NOW_SECONDS,
    ),
    false,
  );
});

Deno.test("constant-time byte comparison handles equal, unequal, and different lengths", () => {
  assertEquals(
    constantTimeEqualBytes(new Uint8Array([1, 2]), new Uint8Array([1, 2])),
    true,
  );
  assertEquals(
    constantTimeEqualBytes(new Uint8Array([1, 2]), new Uint8Array([1, 3])),
    false,
  );
  assertEquals(
    constantTimeEqualBytes(new Uint8Array([1, 2]), new Uint8Array([1, 2, 0])),
    false,
  );
});
