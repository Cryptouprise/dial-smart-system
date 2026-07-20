// deno-lint-ignore-file no-import-prefix -- repository Edge tests pin the deployed Deno std version.
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { handleEliteEmailReleasePreparationRequest } from "./handler.ts";

const owner = "1c9f70c6-3de3-4c93-bbd9-0e2fd39f95a4";
const organization = "2c9f70c6-3de3-4c93-bbd9-0e2fd39f95a4";
const campaign = "3c9f70c6-3de3-4c93-bbd9-0e2fd39f95a4";
const release = "4c9f70c6-3de3-4c93-bbd9-0e2fd39f95a4";
const now = new Date("2026-07-20T12:00:00.000Z");
const authority = {
  contact_authorized: false,
  launch_authorized: false,
  queue_mutation_authorized: false,
  crm_write_authorized: false,
  provider_write_authorized: false,
  spend_authorized: false,
};
const noEffects = {
  database_reads: 0,
  database_writes: 0,
  network_requests: 0,
  provider_calls: 0,
  external_messages: 0,
};

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record).sort().map((key) => [key, canonical(record[key])]),
    );
  }
  return value;
}
function json(value: unknown) {
  return JSON.stringify(canonical(value));
}
function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((item) =>
    item.toString(16).padStart(2, "0")
  ).join("");
}
function base64(bytes: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

async function fixture() {
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ]) as CryptoKeyPair;
  const spki = await crypto.subtle.exportKey("spki", pair.publicKey);
  const keySha = hex(await crypto.subtle.digest("SHA-256", spki));
  const body = {
    kind: "elite_email_source_suppression_attestation_v1",
    status: "current_source_and_suppression_verified",
    organization_id: organization,
    campaign_id: campaign,
    source_system: "elite-crm-v1",
    source_release_reference: "source-release-20260720-a",
    recipient_manifest_sha256: "a".repeat(64),
    suppression_snapshot_sha256: "b".repeat(64),
    recipient_count: 2,
    email_permission_policy: "explicit_opt_in_per_recipient",
    suppression_policy: "all_current_negative_checks",
    evidence_as_of: "2026-07-20T11:59:00.000Z",
    issued_at: "2026-07-20T12:00:00.000Z",
    expires_at: "2026-07-20T18:00:00.000Z",
    signing_key_id: "elite-source-signing-key-01",
    signer_principal_reference: "elite-source-attestor-01",
    public_key_spki_sha256: keySha,
  };
  const signature = await crypto.subtle.sign(
    "Ed25519",
    pair.privateKey,
    new TextEncoder().encode(json(body)),
  );
  const attestation = {
    ...body,
    signature_base64: base64(signature),
    recipient_data_included: false,
    provider_action: "none",
    authority,
    side_effect_invariants: noEffects,
  };
  const environment: Record<string, string> = {
    ELITE_EMAIL_RELEASE_PREPARATION_ENABLED: "true",
    ELITE_EMAIL_RELEASE_PREPARATION_OWNER_USER_ID: owner,
    ELITE_EMAIL_RELEASE_PREPARATION_ORGANIZATION_ID: organization,
    ELITE_EMAIL_RELEASE_PREPARATION_CAMPAIGN_ID: campaign,
    ELITE_EMAIL_RELEASE_PREPARATION_SIGNING_KEY_ID:
      "elite-source-signing-key-01",
    ELITE_EMAIL_RELEASE_PREPARATION_SIGNER_PRINCIPAL_REFERENCE:
      "elite-source-attestor-01",
    ELITE_EMAIL_RELEASE_PREPARATION_PUBLIC_KEY_SPKI_SHA256: keySha,
    ELITE_EMAIL_RELEASE_PREPARATION_PUBLIC_KEY_SPKI_BASE64: `base64:${
      base64(spki)
    }`,
    ELITE_EMAIL_RELEASE_PREPARATION_ALLOWED_ORIGIN: "https://app.example.test",
  };
  return { environment, payload: { release_id: release, attestation } };
}
function request(body: unknown) {
  return new Request(
    "https://edge.example.test/functions/v1/elite-email-release-preparation",
    {
      method: "POST",
      headers: {
        origin: "https://app.example.test",
        authorization: `Bearer ${"t".repeat(100)}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
}

Deno.test("disabled preparation has no database or provider path", async () => {
  const response = await handleEliteEmailReleasePreparationRequest(
    request({}),
    {
      getEnvironment: () => undefined,
      authenticate: () => Promise.resolve(owner),
      store: {
        prepare: () => {
          throw new Error("must not call");
        },
      },
      now: () => now,
    },
  );
  assertEquals(response.status, 503);
});

Deno.test("valid no-PII source proof can only prepare the exact registered release", async () => {
  const { environment, payload } = await fixture();
  const calls: unknown[] = [];
  const response = await handleEliteEmailReleasePreparationRequest(
    request(payload),
    {
      getEnvironment: (name) => environment[name],
      authenticate: () => Promise.resolve(owner),
      store: {
        prepare: (input) => {
          calls.push(input);
          return Promise.resolve({
            prepared: true,
            release_id: release,
            release_state: "prepared",
            reason_code: "EMAIL_RELEASE_PREPARED_NO_PROVIDER_ACTION",
          });
        },
      },
      now: () => now,
    },
  );
  assertEquals(response.status, 200);
  assertEquals(calls.length, 1);
  const output = await response.json();
  assertEquals(output.provider_action, "none");
  assertEquals(output.authority.provider_write_authorized, false);
});

Deno.test("an altered proof is rejected before the store can be called", async () => {
  const { environment, payload } = await fixture();
  payload.attestation.recipient_count = 3;
  const response = await handleEliteEmailReleasePreparationRequest(
    request(payload),
    {
      getEnvironment: (name) => environment[name],
      authenticate: () => Promise.resolve(owner),
      store: {
        prepare: () => {
          throw new Error("must not call");
        },
      },
      now: () => now,
    },
  );
  assertEquals(response.status, 422);
});
