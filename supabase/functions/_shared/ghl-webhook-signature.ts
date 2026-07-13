/**
 * HighLevel webhook signature verification.
 *
 * The current HighLevel contract signs the exact request-body bytes with
 * Ed25519 in X-GHL-Signature. X-WH-Signature is the legacy RSA-SHA256
 * transition header. If both are present, the Ed25519 result is authoritative:
 * an invalid modern signature is never allowed to downgrade to legacy RSA.
 *
 * Official source (checked 2026-07-13):
 * https://marketplace.gohighlevel.com/docs/2021-07-28/webhook/WebhookIntegrationGuide/
 */

export const HIGHLEVEL_ED25519_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAi2HR1srL4o18O8BRa7gVJY7G7bupbN3H9AwJrHCDiOg=
-----END PUBLIC KEY-----`;

// SHA-256 over the DER SubjectPublicKeyInfo bytes above. Pinning the SPKI
// prevents a configuration/environment override from silently changing the
// HighLevel trust root.
export const HIGHLEVEL_ED25519_SPKI_SHA256 =
  "5a2c1b2749d3efcc233fb27d4ab43d56b8d20818c42cd226f6c9a3ff20d3097c";

export const HIGHLEVEL_LEGACY_RSA_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAokvo/r9tVgcfZ5DysOSC
Frm602qYV0MaAiNnX9O8KxMbiyRKWeL9JpCpVpt4XHIcBOK4u3cLSqJGOLaPuXw6
dO0t6Q/ZVdAV5Phz+ZtzPL16iCGeK9po6D6JHBpbi989mmzMryUnQJezlYJ3DVfB
csedpinheNnyYeFXolrJvcsjDtfAeRx5ByHQmTnSdFUzuAnC9/GepgLT9SM4nCpv
uxmZMxrJt5Rw+VUaQ9B8JSvbMPpez4peKaJPZHBbU3OdeCVx5klVXXZQGNHOs8gF
3kvoV5rTnXV0IknLBXlcKKAQLZcY/Q9rG6Ifi9c+5vqlvHPCUJFT5XUGG5RKgOKU
J062fRtN+rLYZUV+BjafxQauvC8wSWeYja63VSUruvmNj8xkx2zE/Juc+yjLjTXp
IocmaiFeAO6fUtNjDeFVkhf5LNb59vECyrHD2SQIrhgXpO4Q3dVNA5rw576PwTzN
h/AMfHKIjE4xQA1SZuYJmNnmVZLIZBlQAF9Ntd03rfadZ+yDiOXCCs9FkHibELhC
HULgCsnuDJHcrGNd5/Ddm5hxGQ0ASitgHeMZ0kcIOwKDOzOU53lDza6/Y09T7sYJ
PQe7z0cvj7aE4B+Ax1ZoZGPzpJlZtGXCsu9aTEGEnKzmsFqwcSsnw3JB31IGKAyk
T1hhTiaCeIY/OwwwNUY2yvcCAwEAAQ==
-----END PUBLIC KEY-----`;

export type HighLevelSignatureScheme =
  | "x-ghl-signature-ed25519"
  | "x-wh-signature-rsa-sha256";

export type HighLevelSignatureResult =
  | { valid: true; scheme: HighLevelSignatureScheme }
  | { valid: false; reason: string; scheme?: HighLevelSignatureScheme };

function ownedBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const owned = new Uint8Array(bytes.byteLength);
  owned.set(bytes);
  return owned;
}

function decodeBase64Strict(value: string): Uint8Array<ArrayBuffer> {
  if (value.length === 0 || value.length > 16_384) {
    throw new Error("invalid_base64_length");
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 === 1) {
    throw new Error("invalid_base64_alphabet");
  }
  const withoutPadding = value.replace(/=+$/, "");
  const padded = withoutPadding.padEnd(
    Math.ceil(withoutPadding.length / 4) * 4,
    "=",
  );
  const decoded = atob(padded);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

function pemSpkiBytes(pem: string): Uint8Array<ArrayBuffer> {
  const match = pem.trim().match(
    /^-----BEGIN PUBLIC KEY-----\s+([A-Za-z0-9+/=\s]+?)\s+-----END PUBLIC KEY-----$/,
  );
  if (!match) throw new Error("invalid_public_key_pem");
  return decodeBase64Strict(match[1].replace(/\s/g, ""));
}

async function verifyEd25519(input: {
  rawBody: Uint8Array;
  signature: string;
  publicKeyPem: string;
  expectedSpkiSha256: string;
}): Promise<boolean> {
  const signatureBytes = decodeBase64Strict(input.signature);
  if (signatureBytes.byteLength !== 64) return false;
  const spkiBytes = pemSpkiBytes(input.publicKeyPem);
  const actualFingerprint = await sha256Hex(spkiBytes);
  if (actualFingerprint !== input.expectedSpkiSha256.toLowerCase()) {
    throw new Error("public_key_fingerprint_mismatch");
  }
  const key = await crypto.subtle.importKey(
    "spki",
    spkiBytes,
    { name: "Ed25519" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    { name: "Ed25519" },
    key,
    signatureBytes,
    ownedBytes(input.rawBody),
  );
}

async function verifyLegacyRsa(input: {
  rawBody: Uint8Array;
  signature: string;
  publicKeyPem: string;
}): Promise<boolean> {
  const signatureBytes = decodeBase64Strict(input.signature);
  const key = await crypto.subtle.importKey(
    "spki",
    pemSpkiBytes(input.publicKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    signatureBytes,
    ownedBytes(input.rawBody),
  );
}

export async function verifyHighLevelWebhookSignature(input: {
  rawBody: Uint8Array;
  ghlSignature: string | null;
  legacySignature: string | null;
  ed25519PublicKeyPem?: string;
  ed25519SpkiSha256?: string;
  legacyRsaPublicKeyPem?: string;
}): Promise<HighLevelSignatureResult> {
  if (!(input.rawBody instanceof Uint8Array)) {
    return { valid: false, reason: "raw_body_required" };
  }

  // Header presence, not truthiness, controls precedence. An empty or invalid
  // X-GHL-Signature must not fall through to a valid legacy signature.
  if (input.ghlSignature !== null) {
    const scheme = "x-ghl-signature-ed25519" as const;
    if (!input.ghlSignature || input.ghlSignature === "N/A") {
      return {
        valid: false,
        reason: "missing_or_placeholder_signature",
        scheme,
      };
    }
    try {
      const valid = await verifyEd25519({
        rawBody: input.rawBody,
        signature: input.ghlSignature,
        publicKeyPem: input.ed25519PublicKeyPem ||
          HIGHLEVEL_ED25519_PUBLIC_KEY_PEM,
        expectedSpkiSha256: input.ed25519SpkiSha256 ||
          HIGHLEVEL_ED25519_SPKI_SHA256,
      });
      return valid
        ? { valid: true, scheme }
        : { valid: false, reason: "signature_mismatch", scheme };
    } catch {
      return { valid: false, reason: "malformed_signature_or_key", scheme };
    }
  }

  if (input.legacySignature !== null) {
    const scheme = "x-wh-signature-rsa-sha256" as const;
    if (!input.legacySignature || input.legacySignature === "N/A") {
      return {
        valid: false,
        reason: "missing_or_placeholder_signature",
        scheme,
      };
    }
    try {
      const valid = await verifyLegacyRsa({
        rawBody: input.rawBody,
        signature: input.legacySignature,
        publicKeyPem: input.legacyRsaPublicKeyPem ||
          HIGHLEVEL_LEGACY_RSA_PUBLIC_KEY_PEM,
      });
      return valid
        ? { valid: true, scheme }
        : { valid: false, reason: "signature_mismatch", scheme };
    } catch {
      return { valid: false, reason: "malformed_signature_or_key", scheme };
    }
  }

  return { valid: false, reason: "missing_signature" };
}

export async function sha256Hex(value: Uint8Array | string): Promise<string> {
  const bytes = typeof value === "string"
    ? new TextEncoder().encode(value)
    : value;
  const digest = await crypto.subtle.digest("SHA-256", ownedBytes(bytes));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
