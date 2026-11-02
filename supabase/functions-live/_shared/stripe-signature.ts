export const STRIPE_SIGNATURE_MAX_AGE_SECONDS = 300;
export const STRIPE_SIGNATURE_MAX_FUTURE_SKEW_SECONDS = 60;

function decodeHex(value: string): Uint8Array | null {
  if (
    value.length === 0 || value.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(value)
  ) {
    return null;
  }
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

// Compare every position even when lengths differ. This avoids leaking which
// prefix of an HMAC matched through an early-return string comparison.
export function constantTimeEqualBytes(
  left: Uint8Array,
  right: Uint8Array,
): boolean {
  const comparisonLength = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < comparisonLength; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

export async function verifyStripeSignature(
  payload: string,
  signatureHeader: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!secret || !Number.isSafeInteger(nowSeconds) || nowSeconds <= 0) {
    return false;
  }

  const parts = signatureHeader.split(",").map((part) => part.trim());
  const timestampValues = parts
    .filter((part) => part.startsWith("t="))
    .map((part) => part.slice(2));
  const signatureValues = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3));

  if (
    timestampValues.length !== 1 ||
    !/^\d+$/.test(timestampValues[0]) ||
    signatureValues.length === 0
  ) {
    return false;
  }

  const timestamp = Number(timestampValues[0]);
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) return false;
  if (nowSeconds - timestamp > STRIPE_SIGNATURE_MAX_AGE_SECONDS) return false;
  if (timestamp - nowSeconds > STRIPE_SIGNATURE_MAX_FUTURE_SKEW_SECONDS) {
    return false;
  }

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const expected = new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(`${timestamp}.${payload}`),
      ),
    );

    let matched = false;
    for (const signatureValue of signatureValues) {
      const supplied = decodeHex(signatureValue);
      if (supplied) {
        matched = constantTimeEqualBytes(expected, supplied) ? true : matched;
      }
    }
    return matched;
  } catch {
    return false;
  }
}
