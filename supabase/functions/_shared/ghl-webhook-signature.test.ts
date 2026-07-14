// deno-lint-ignore-file no-import-prefix -- repository Edge tests pin the deployed Deno std version.
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  HIGHLEVEL_ED25519_PUBLIC_KEY_PEM,
  HIGHLEVEL_ED25519_SPKI_SHA256,
  sha256Hex,
  verifyHighLevelWebhookSignature,
} from "./ghl-webhook-signature.ts";

function base64(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function pem(bytes: ArrayBuffer): string {
  const encoded = base64(bytes);
  const lines = encoded.match(/.{1,64}/g)?.join("\n") || encoded;
  return `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----`;
}

Deno.test("pins the official HighLevel Ed25519 SPKI fingerprint", async () => {
  const encoded = HIGHLEVEL_ED25519_PUBLIC_KEY_PEM
    .replace(/-----[^-]+-----/g, "")
    .replace(/\s/g, "");
  const der = Uint8Array.from(
    atob(encoded),
    (character) => character.charCodeAt(0),
  );
  assertEquals(await sha256Hex(der), HIGHLEVEL_ED25519_SPKI_SHA256);
});

Deno.test("verifies Ed25519 over exact raw bytes and rejects mutation or wrong pin", async () => {
  const keyPair = await crypto.subtle.generateKey(
    { name: "Ed25519" },
    true,
    ["sign", "verify"],
  ) as CryptoKeyPair;
  const publicSpki = await crypto.subtle.exportKey("spki", keyPair.publicKey);
  const publicPem = pem(publicSpki);
  const fingerprint = await sha256Hex(new Uint8Array(publicSpki));
  const rawBody = new TextEncoder().encode('{"type":"ContactCreate", "x":1}');
  const signature = base64(
    await crypto.subtle.sign("Ed25519", keyPair.privateKey, rawBody),
  );

  assert(
    (await verifyHighLevelWebhookSignature({
      rawBody,
      ghlSignature: signature,
      legacySignature: null,
      ed25519PublicKeyPem: publicPem,
      ed25519SpkiSha256: fingerprint,
    })).valid,
  );
  assertEquals(
    (await verifyHighLevelWebhookSignature({
      rawBody: new TextEncoder().encode('{"type":"ContactCreate","x":1}'),
      ghlSignature: signature,
      legacySignature: null,
      ed25519PublicKeyPem: publicPem,
      ed25519SpkiSha256: fingerprint,
    })).valid,
    false,
  );
  assertEquals(
    (await verifyHighLevelWebhookSignature({
      rawBody,
      ghlSignature: signature,
      legacySignature: null,
      ed25519PublicKeyPem: publicPem,
      ed25519SpkiSha256: "0".repeat(64),
    })).valid,
    false,
  );
});

Deno.test("modern signature presence prevents downgrade to valid legacy RSA", async () => {
  const rsa = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  ) as CryptoKeyPair;
  const rawBody = new TextEncoder().encode('{"type":"ContactUpdate"}');
  const legacySignature = base64(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      rsa.privateKey,
      rawBody,
    ),
  );
  const legacyPem = pem(await crypto.subtle.exportKey("spki", rsa.publicKey));

  const noDowngrade = await verifyHighLevelWebhookSignature({
    rawBody,
    ghlSignature: base64(new Uint8Array(64).buffer),
    legacySignature,
    legacyRsaPublicKeyPem: legacyPem,
  });
  assertEquals(noDowngrade.valid, false);
  assertEquals(noDowngrade.scheme, "x-ghl-signature-ed25519");

  const legacyDiagnostic = await verifyHighLevelWebhookSignature({
    rawBody,
    ghlSignature: null,
    legacySignature,
    legacyRsaPublicKeyPem: legacyPem,
  });
  assert(legacyDiagnostic.valid);
  assertEquals(legacyDiagnostic.scheme, "x-wh-signature-rsa-sha256");
});

Deno.test("rejects missing, placeholder, malformed, and non-64-byte Ed25519 signatures", async () => {
  const rawBody = new TextEncoder().encode("{}");
  for (const signature of [null, "", "N/A", "***", btoa("too-short")]) {
    const result = await verifyHighLevelWebhookSignature({
      rawBody,
      ghlSignature: signature,
      legacySignature: null,
    });
    assertEquals(result.valid, false);
  }
});
