// deno-lint-ignore-file no-import-prefix -- repository Edge tests pin the deployed Deno std version.
import {
  assert,
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  evaluateGhlSolarShadowEvent,
  type GhlShadowBinding,
  importShadowIdentifierKey,
  parseStrictUtcInstant,
  REQUIRED_SOLAR_CONSENT_FIELDS,
  stableJson,
  validateGhlShadowBinding,
} from "./ghl-shadow-contract.ts";
import { sha256Hex } from "./ghl-webhook-signature.ts";

function encodedSecret(bytes: Uint8Array): string {
  return `base64url:${
    btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  }`;
}

async function fixture() {
  const mapping = Object.fromEntries(
    REQUIRED_SOLAR_CONSENT_FIELDS.map((
      field,
      index,
    ) => [field, `cf_${index}_${field}`]),
  );
  const disclosure =
    "I authorize Elite Solar Recovery to use an artificial voice for this request.";
  const policy = {
    seller_legal_name: "Elite Solar Recovery LLC",
    approved_lead_sources: ["elite-solar-exit-form-v1"],
    approved_consent_text_versions: ["solar-consent-v1"],
    approved_source_form_versions: ["solar-exit-form-v1"],
    approved_consent_artifacts: [{
      artifact_id: "solar-consent-artifact-v1",
      disclosure_sha256: await sha256Hex(disclosure),
    }],
    approved_property_states: ["CO"],
    approved_calling_states: ["CO"],
    maximum_consent_age_days: 365,
  };
  const binding: GhlShadowBinding = {
    id: "11111111-1111-4111-8111-111111111111",
    organization_id: "22222222-2222-4222-8222-222222222222",
    ghl_location_id: "location_solar_001",
    campaign_key: "solar-exit",
    mapping_version: "solar-ghl-map-v1",
    identifier_key_version: "shadow-hmac-v1",
    custom_field_mapping: mapping,
    custom_field_mapping_sha256: await sha256Hex(stableJson(mapping)),
    policy_version: "counsel-approved-v1",
    policy_status: "resolved",
    policy_snapshot: policy,
    policy_snapshot_sha256: await sha256Hex(stableJson(policy)),
    enabled: true,
    mode: "shadow_read_only",
    outbound_writeback_enabled: false,
    workflow_triggering_enabled: false,
    contact_authorized: false,
    launch_authorized: false,
    external_trust_required: true,
  };
  const values: Record<string, unknown> = {
    ai_voice_calls_authorized: true,
    telemarketing_calls_authorized: true,
    consent_artifact_id: "solar-consent-artifact-v1",
    consent_consumer_name: "Synthetic Consumer",
    consent_phone: "+13035550123",
    consent_lead_source: "elite-solar-exit-form-v1",
    consent_disclosure_text: disclosure,
    signature_evidence: "signed-artifact-reference-001",
    source_form_version: "solar-exit-form-v1",
    not_condition_of_purchase_disclosure: true,
    consent_text_version: "solar-consent-v1",
    consent_captured_at: "2026-07-01T12:00:00Z",
    consent_seller: "Elite Solar Recovery LLC",
    consent_revoked_at: "",
    property_state: "CO",
    calling_state: "CO",
  };
  const event: Record<string, unknown> = {
    type: "ContactDndUpdate",
    locationId: binding.ghl_location_id,
    id: "contact_001",
    webhookId: "webhook-001",
    timestamp: "2026-07-13T16:00:00Z",
    phone: "+13035550123",
    name: "Ignored Current Display Name",
    tags: ["ignored-tag"],
    state: "CA",
    source: "ignored-current-source",
    dnd: false,
    dndSettings: { Call: { status: "inactive" } },
    customFields: REQUIRED_SOLAR_CONSENT_FIELDS.map((field) => ({
      id: mapping[field],
      value: values[field],
    })),
  };
  const identifierKey = await importShadowIdentifierKey(encodedSecret(
    Uint8Array.from({ length: 32 }, (_, index) => index),
  ));
  return { binding, event, values, identifierKey };
}

Deno.test("validates an exact, hash-bound, zero-authority location contract", async () => {
  const { binding } = await fixture();
  assertEquals(await validateGhlShadowBinding(binding), []);
  assert(
    (binding.custom_field_mapping as Record<string, unknown>).consent_phone,
  );
  assert(
    (binding.custom_field_mapping as Record<string, unknown>).property_state,
  );
  assert(
    (binding.custom_field_mapping as Record<string, unknown>).calling_state,
  );
});

Deno.test("strict UTC parser rejects impossible or ambiguous instants", () => {
  assertEquals(parseStrictUtcInstant("2026-02-31T00:00:00Z"), null);
  assertEquals(parseStrictUtcInstant("2026-01-01T24:00:00Z"), null);
  assertEquals(parseStrictUtcInstant("2026-01-01T00:00:00.1234Z"), null);
  assertEquals(parseStrictUtcInstant("2026-01-01T00:00:00+00:00"), null);
  assertEquals(
    parseStrictUtcInstant("2024-02-29T12:34:56Z"),
    Date.UTC(2024, 1, 29, 12, 34, 56),
  );
  assertEquals(
    parseStrictUtcInstant("2026-01-01T00:00:00.1Z"),
    Date.UTC(2026, 0, 1, 0, 0, 0, 100),
  );
  assertEquals(
    parseStrictUtcInstant("2026-01-01T00:00:00.12Z"),
    Date.UTC(2026, 0, 1, 0, 0, 0, 120),
  );
  assertEquals(
    parseStrictUtcInstant("2026-01-01T00:00:00.123Z"),
    Date.UTC(2026, 0, 1, 0, 0, 0, 123),
  );
});

Deno.test("complete DND event remains held for external suppression evidence and grants no authority", async () => {
  const { binding, event, identifierKey } = await fixture();
  const result = await evaluateGhlSolarShadowEvent({
    binding,
    event,
    payloadSha256: "a".repeat(64),
    identifierKey,
    now: new Date("2026-07-13T16:05:00Z"),
  });
  assertEquals(result.decision, "held");
  assertEquals(result.reason_codes, ["EXTERNAL_SUPPRESSION_EVIDENCE_REQUIRED"]);
  assertEquals(result.contact_authorized, false);
  assertEquals(result.launch_authorized, false);
  assertEquals(result.external_effects_created, false);
  assertEquals(result.evidence.current_contact_state_ignored, true);
  assertEquals(result.evidence.current_contact_source_ignored, true);
  assertEquals(result.evidence.ghl_dnd_clear_from_contact_dnd_update, true);
});

Deno.test("ContactCreate never clears DND even if it happens to include DND-shaped fields", async () => {
  const { binding, event, identifierKey } = await fixture();
  event.type = "ContactCreate";
  const result = await evaluateGhlSolarShadowEvent({
    binding,
    event,
    payloadSha256: "b".repeat(64),
    identifierKey,
    now: new Date("2026-07-13T16:05:00Z"),
  });
  assert(result.reason_codes.includes("SUPPRESSION_STATE_UNKNOWN_FOR_EVENT"));
  assertEquals(result.evidence.ghl_dnd_clear_from_contact_dnd_update, false);
});

Deno.test("missing or stale source timestamps cannot clear DND ordering", async () => {
  const { binding, event, identifierKey } = await fixture();
  delete event.timestamp;
  let result = await evaluateGhlSolarShadowEvent({
    binding,
    event,
    payloadSha256: "c".repeat(64),
    identifierKey,
    now: new Date("2026-07-13T16:05:00Z"),
  });
  assert(result.reason_codes.includes("SOURCE_TIMESTAMP_MISSING"));
  assert(result.reason_codes.includes("DND_ORDERING_EVIDENCE_UNSAFE"));
  assertEquals(result.evidence.ghl_dnd_clear_from_contact_dnd_update, false);

  event.timestamp = "2026-07-13T15:00:00Z";
  result = await evaluateGhlSolarShadowEvent({
    binding,
    event,
    payloadSha256: "d".repeat(64),
    identifierKey,
    now: new Date("2026-07-13T16:05:00Z"),
  });
  assert(result.reason_codes.includes("SOURCE_TIMESTAMP_STALE"));
  assertEquals(result.evidence.source_timestamp_fresh_for_ordering, false);
});

Deno.test("stale active DND remains durable safety evidence but can never clear ordering", async () => {
  const { binding, event, identifierKey } = await fixture();
  event.timestamp = "2026-07-13T15:00:00Z";
  event.dnd = true;
  event.dndSettings = { Call: { status: "permanent" } };
  const result = await evaluateGhlSolarShadowEvent({
    binding,
    event,
    payloadSha256: "4".repeat(64),
    identifierKey,
    now: new Date("2026-07-13T16:05:00Z"),
  });
  assert(result.reason_codes.includes("SOURCE_TIMESTAMP_STALE"));
  assert(result.reason_codes.includes("DND_ORDERING_EVIDENCE_UNSAFE"));
  assert(result.reason_codes.includes("GHL_GLOBAL_DND_ACTIVE"));
  assert(result.reason_codes.includes("GHL_CALL_DND_ACTIVE"));
  assertEquals(result.evidence.ghl_dnd_clear_from_contact_dnd_update, false);
});

Deno.test("consent identity accepts only exact E.164 and exact boolean types", async () => {
  const { binding, event, identifierKey } = await fixture();
  const customFields = event.customFields as Array<Record<string, unknown>>;
  const mapping = binding.custom_field_mapping;
  customFields.find((field) => field.id === mapping.consent_phone)!.value =
    "(303) 555-0123";
  customFields.find((field) => field.id === mapping.ai_voice_calls_authorized)!
    .value = "true";
  const result = await evaluateGhlSolarShadowEvent({
    binding,
    event,
    payloadSha256: "e".repeat(64),
    identifierKey,
    now: new Date("2026-07-13T16:05:00Z"),
  });
  assert(result.reason_codes.includes("INVALID_CONSENT_PHONE"));
  assert(result.reason_codes.includes("AI_VOICE_CONSENT_AMBIGUOUS"));
  assertEquals(result.consent_phone_identifier_hmac, null);
});

Deno.test("persisted phone identity is derived from immutable consent_phone, never current contact phone", async () => {
  const { binding, event, identifierKey } = await fixture();
  const first = await evaluateGhlSolarShadowEvent({
    binding,
    event,
    payloadSha256: "f".repeat(64),
    identifierKey,
    now: new Date("2026-07-13T16:05:00Z"),
  });
  event.phone = "+13035550124";
  const second = await evaluateGhlSolarShadowEvent({
    binding,
    event,
    payloadSha256: "0".repeat(64),
    identifierKey,
    now: new Date("2026-07-13T16:05:00Z"),
  });
  assertEquals(
    first.consent_phone_identifier_hmac,
    second.consent_phone_identifier_hmac,
  );
  assert(
    second.reason_codes.includes("CURRENT_PHONE_DOES_NOT_MATCH_CONSENT_PHONE"),
  );
});

Deno.test("mapping drift, unresolved policy, and authority flags quarantine", async () => {
  const { binding, event, identifierKey } = await fixture();
  binding.policy_status = "unresolved";
  binding.launch_authorized = true;
  binding.custom_field_mapping_sha256 = "1".repeat(64);
  const result = await evaluateGhlSolarShadowEvent({
    binding,
    event,
    payloadSha256: "1".repeat(64),
    identifierKey,
    now: new Date("2026-07-13T16:05:00Z"),
  });
  assertEquals(result.decision, "quarantined");
  assert(result.reason_codes.includes("UNRESOLVED_POLICY"));
  assert(result.reason_codes.includes("BINDING_AUTHORITY_ESCALATION"));
  assert(result.reason_codes.includes("CUSTOM_FIELD_MAPPING_HASH_MISMATCH"));
});

Deno.test("rejects formatted-but-weak 256-bit secret placeholders", async () => {
  await assertRejects(() =>
    importShadowIdentifierKey(encodedSecret(new Uint8Array(32)))
  );
  await assertRejects(() =>
    importShadowIdentifierKey(encodedSecret(
      Uint8Array.from({ length: 32 }, (_, index) => index % 2),
    ))
  );
  await importShadowIdentifierKey(encodedSecret(
    Uint8Array.from({ length: 32 }, (_, index) => index + 1),
  ));
});
