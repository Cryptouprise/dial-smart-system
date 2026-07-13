import { createHash } from "node:crypto";

import {
  canonicalJson,
  sha256Canonical,
} from "./solar-exit-shadow-evaluator.mjs";

export const GHL_SHADOW_RECONCILIATION_SCHEMA_VERSION = "1.0.0";
export const GHL_SHADOW_RECONCILER_VERSION = "1.0.0";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const EVENT_TYPE = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;
const GHL_EVENT_TYPES = new Set([
  "ContactCreate",
  "ContactUpdate",
  "ContactDndUpdate",
  "invalid",
]);
const REASON = /^[A-Z][A-Z0-9_]{0,127}$/;
const SQL_UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const SELECTION_SEMANTICS =
  "receipts_or_delivery_attempts_active_in_window_with_receipt_attempt_history_before_window_end";

const MAPPED_FIELDS = Object.freeze([
  "ai_voice_calls_authorized",
  "telemarketing_calls_authorized",
  "consent_artifact_id",
  "consent_consumer_name",
  "consent_phone",
  "consent_lead_source",
  "consent_disclosure_text",
  "signature_evidence",
  "source_form_version",
  "not_condition_of_purchase_disclosure",
  "consent_text_version",
  "consent_captured_at",
  "consent_seller",
  "consent_revoked_at",
  "property_state",
  "calling_state",
]);

export const GHL_SHADOW_EXPORT_REASON_CODES = Object.freeze([
  ...new Set([
    "AI_VOICE_CONSENT_AMBIGUOUS",
    "AI_VOICE_CONSENT_NOT_GRANTED",
    "BINDING_AUTHORITY_ESCALATION",
    "BINDING_CHANGED_BEFORE_COMMIT",
    "BINDING_DISABLED",
    "BINDING_NOT_SHADOW_ONLY",
    "CALLING_STATE_NOT_APPROVED",
    "CONSENT_CAPTURED_IN_FUTURE",
    "CONSENT_DISCLOSURE_HASH_MISMATCH",
    "CONSENT_EVIDENCE_EXPIRED",
    "CONSENT_REVOCATION_AMBIGUOUS",
    "CONSENT_REVOKED",
    "CONSENT_SELLER_MISMATCH",
    "CURRENT_CONTACT_PHONE_UNKNOWN",
    "CURRENT_PHONE_DOES_NOT_MATCH_CONSENT_PHONE",
    "CUSTOM_FIELD_MAPPING_HASH_MISMATCH",
    "DND_ORDERING_EVIDENCE_UNSAFE",
    "DUPLICATE_CUSTOM_FIELD_ENTRY",
    "DUPLICATE_CUSTOM_FIELD_ID_MAPPING",
    "DUPLICATE_JSON_KEY",
    "EXTERNAL_SUPPRESSION_EVIDENCE_REQUIRED",
    "GHL_CALL_DND_ACTIVE",
    "GHL_CALL_DND_AMBIGUOUS",
    "GHL_GLOBAL_DND_ACTIVE",
    "GHL_GLOBAL_DND_AMBIGUOUS",
    "INEXACT_CUSTOM_FIELD_MAPPING",
    "INVALID_BINDING_ID",
    "INVALID_CONSENT_ARTIFACT_ID",
    "INVALID_CONSENT_CAPTURED_AT",
    "INVALID_CONSENT_CONSUMER_NAME",
    "INVALID_CONSENT_DISCLOSURE_TEXT",
    "INVALID_CONSENT_LEAD_SOURCE",
    "INVALID_CONSENT_PHONE",
    "INVALID_CONSENT_SELLER",
    "INVALID_CONSENT_TEXT_VERSION",
    "INVALID_CUSTOM_FIELD_ENTRY",
    "INVALID_CUSTOM_FIELD_ID",
    "INVALID_CUSTOM_FIELD_MAPPING",
    "INVALID_IDENTIFIER_KEY_VERSION",
    "INVALID_JSON",
    "INVALID_JSON_NUMBER",
    "INVALID_JSON_STRING",
    "INVALID_JSON_TRAILING_DATA",
    "INVALID_LOCATION_ID",
    "INVALID_MAPPING_HASH",
    "INVALID_MAPPING_VERSION",
    "INVALID_OR_MISSING_LOCATION_ID",
    "INVALID_ORGANIZATION_ID",
    "INVALID_POLICY_HASH",
    "INVALID_POLICY_SNAPSHOT",
    "INVALID_SOURCE_FORM_VERSION",
    "INVALID_UTF8_BODY",
    "INVALID_WEBHOOK_ID",
    "JSON_ARRAY_LIMIT",
    "JSON_DEPTH_LIMIT",
    "JSON_NODE_LIMIT",
    "JSON_OBJECT_KEY_LIMIT",
    "JSON_OBJECT_REQUIRED",
    "JSON_STRING_LIMIT",
    "LOCATION_BINDING_MISMATCH",
    "MISSING_CONTACT_ID",
    "MISSING_CUSTOM_FIELDS",
    "MISSING_SIGNATURE_EVIDENCE",
    "MISSING_WEBHOOK_ID",
    "NO_ENABLED_LOCATION_BINDING",
    "NOT_CONDITION_DISCLOSURE_AMBIGUOUS",
    "NOT_CONDITION_DISCLOSURE_NOT_CONFIRMED",
    "POLICY_HASH_MISMATCH",
    "PROPERTY_STATE_NOT_APPROVED",
    "SOURCE_TIMESTAMP_IN_FUTURE",
    "SOURCE_TIMESTAMP_INVALID",
    "SOURCE_TIMESTAMP_MISSING",
    "SOURCE_TIMESTAMP_STALE",
    "SUPPRESSION_STATE_UNKNOWN_FOR_EVENT",
    "TELEMARKETING_CONSENT_AMBIGUOUS",
    "TELEMARKETING_CONSENT_NOT_GRANTED",
    "UNAPPROVED_CONSENT_ARTIFACT",
    "UNAPPROVED_CONSENT_LEAD_SOURCE",
    "UNAPPROVED_CONSENT_TEXT_VERSION",
    "UNAPPROVED_SOURCE_FORM_VERSION",
    "UNKNOWN_CALLING_STATE",
    "UNKNOWN_PROPERTY_STATE",
    "UNRESOLVED_POLICY",
    "UNSUPPORTED_EVENT_TYPE",
    "WEBHOOK_ID_PAYLOAD_COLLISION",
    "WRONG_CAMPAIGN_BINDING",
    ...MAPPED_FIELDS.map((field) => `MISSING_${field.toUpperCase()}`),
  ]),
].sort());
const ALLOWED_REASON_CODES = new Set(GHL_SHADOW_EXPORT_REASON_CODES);

const EVIDENCE_KEYS = Object.freeze([
  "schema_version",
  "evidence_scope",
  "payload_sha256",
  "signature_scheme",
  "event_type",
  "mapping_version",
  "identifier_key_version",
  "mapping_sha256",
  "policy_version",
  "policy_sha256",
  "mapped_field_presence",
  "source_contact_identifier_hmac",
  "consent_phone_identifier_hmac",
  "consent_consumer_identifier_hmac",
  "consent_signature_identifier_hmac",
  "consent_artifact_identifier_hmac",
  "consent_source_identifier_hmac",
  "consent_disclosure_sha256",
  "current_contact_phone_matches_consent_phone",
  "current_contact_state_ignored",
  "current_contact_source_ignored",
  "exact_boolean_consent_types",
  "consent_captured_at_valid",
  "consent_not_revoked",
  "source_timestamp_present",
  "source_timestamp_valid",
  "source_timestamp_fresh_for_ordering",
  "source_timestamp_sha256",
  "ghl_dnd_clear_from_contact_dnd_update",
  "external_suppression_evidence_present",
  "contact_authorized",
  "launch_authorized",
  "external_effects_created",
  "external_trust_required",
]);

const EVIDENCE_BOOLEAN_KEYS = Object.freeze([
  "current_contact_phone_matches_consent_phone",
  "current_contact_state_ignored",
  "current_contact_source_ignored",
  "exact_boolean_consent_types",
  "consent_captured_at_valid",
  "consent_not_revoked",
  "source_timestamp_present",
  "source_timestamp_valid",
  "source_timestamp_fresh_for_ordering",
  "ghl_dnd_clear_from_contact_dnd_update",
  "external_suppression_evidence_present",
  "contact_authorized",
  "launch_authorized",
  "external_effects_created",
  "external_trust_required",
]);

const EVIDENCE_NULLABLE_HASH_KEYS = Object.freeze([
  "source_contact_identifier_hmac",
  "consent_phone_identifier_hmac",
  "consent_consumer_identifier_hmac",
  "consent_signature_identifier_hmac",
  "consent_artifact_identifier_hmac",
  "consent_source_identifier_hmac",
  "consent_disclosure_sha256",
  "source_timestamp_sha256",
]);

const EXPORT_KEYS = Object.freeze([
  "schema_version",
  "export_type",
  "evidence_scope",
  "organization_id",
  "campaign_key",
  "window",
  "selection_semantics",
  "row_counts",
  "receipts",
  "delivery_attempts",
  "webhook_id_ledger",
  "safety_invariants",
]);

const RECEIPT_KEYS = Object.freeze([
  "receipt_id",
  "binding_id",
  "organization_id",
  "installation_scope_sha256",
  "location_identifier_sha256",
  "payload_sha256",
  "webhook_id_sha256",
  "signature_scheme",
  "event_type",
  "source_occurred_at",
  "source_contact_identifier_hmac",
  "consent_phone_identifier_hmac",
  "decision",
  "reason_codes",
  "evidence",
  "webhook_id_collision",
  "received_at",
  "contact_authorized",
  "launch_authorized",
  "external_effects_created",
  "external_trust_required",
]);

const ATTEMPT_KEYS = Object.freeze([
  "attempt_id",
  "receipt_id",
  "binding_id",
  "organization_id",
  "installation_scope_sha256",
  "payload_sha256",
  "webhook_id_sha256",
  "commit_status",
  "decision",
  "reason_codes",
  "attempted_at",
  "contact_authorized",
  "launch_authorized",
  "provider_invocation_authorized",
  "queue_mutation_authorized",
  "crm_mutation_authorized",
  "external_effects_created",
  "external_trust_required",
]);

const LEDGER_KEYS = Object.freeze([
  "installation_scope_sha256",
  "webhook_id_sha256",
  "first_payload_sha256",
  "created_at",
]);

const SAFETY_KEYS = Object.freeze([
  "contact_authorized",
  "launch_authorized",
  "provider_invocation_authorized",
  "queue_mutation_authorized",
  "crm_mutation_authorized",
  "external_effects_created",
  "external_trust_required",
]);

const EVIDENCE_PROJECTION_KEYS = Object.freeze(
  EVIDENCE_KEYS.filter((key) =>
    ![
      "schema_version",
      "evidence_scope",
      "payload_sha256",
    ].includes(key)
  ),
);

const COMPARISON_KEYS = Object.freeze([
  "schema_version",
  "comparison_type",
  "evidence_scope",
  "organization_id",
  "campaign_key",
  "window",
  "source_system",
  "source_export_id",
  "source_export_evidence_id",
  "source_export_fingerprint",
  "normalizer",
  "normalizer_version",
  "rows",
  "safety_invariants",
]);

const COMPARISON_ROW_KEYS = Object.freeze([
  "comparison_id",
  "webhook_id_sha256",
  "organization_id",
  "location_identifier_sha256",
  "source_contact_identifier_hmac",
  "consent_phone_identifier_hmac",
  "decision",
  "reason_codes",
  "evidence_projection",
]);

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, expected, label) {
  if (!isPlainObject(value)) {
    throw new TypeError(`${label} must be a JSON object.`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    throw new TypeError(`${label} keys must be exactly: ${wanted.join(", ")}.`);
  }
}

function assertUuid(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return;
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new TypeError(`${label} must be a UUID.`);
  }
}

function assertHash(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return;
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new TypeError(`${label} must be a lowercase SHA-256 digest.`);
  }
}

function assertSqlTimestamp(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return;
  if (
    typeof value !== "string" || !SQL_UTC_INSTANT.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new TypeError(
      `${label} must be the canonical six-digit UTC timestamp emitted by the export RPC.`,
    );
  }
  const date = new Date(value);
  const millisecondPrefix = value.slice(0, 23);
  if (`${date.toISOString().slice(0, 23)}` !== millisecondPrefix) {
    throw new TypeError(`${label} is not a real calendar instant.`);
  }
}

function assertBoolean(value, label) {
  if (typeof value !== "boolean") {
    throw new TypeError(`${label} must be boolean.`);
  }
}

function assertReasonCodes(value, label) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 64) {
    throw new TypeError(`${label} must contain 1-64 reason codes.`);
  }
  for (const reason of value) {
    if (
      typeof reason !== "string" ||
      !REASON.test(reason) ||
      !ALLOWED_REASON_CODES.has(reason)
    ) throw new TypeError(`${label} contains a non-allowlisted reason code.`);
  }
}

function assertEvidence(value, label) {
  exactKeys(value, EVIDENCE_KEYS, label);
  if (
    value.schema_version !== "1.0.0" ||
    value.evidence_scope !== "zero_contact_shadow_observation_only"
  ) {
    throw new TypeError(`${label} has the wrong shadow evidence contract.`);
  }
  assertHash(value.payload_sha256, `${label}.payload_sha256`);
  assertEvidenceProjection(value, label);
}

function assertEvidenceProjection(value, label) {
  if (value.signature_scheme !== "x-ghl-signature-ed25519") {
    throw new TypeError(`${label} is not modern-signature evidence.`);
  }
  if (
    typeof value.event_type !== "string" ||
    !EVENT_TYPE.test(value.event_type) ||
    !GHL_EVENT_TYPES.has(value.event_type)
  ) throw new TypeError(`${label}.event_type is invalid.`);
  for (
    const key of ["mapping_version", "identifier_key_version", "policy_version"]
  ) {
    if (typeof value[key] !== "string" || !VERSION.test(value[key])) {
      throw new TypeError(`${label}.${key} is invalid.`);
    }
  }
  assertHash(value.mapping_sha256, `${label}.mapping_sha256`);
  assertHash(value.policy_sha256, `${label}.policy_sha256`);
  for (const key of EVIDENCE_NULLABLE_HASH_KEYS) {
    assertHash(value[key], `${label}.${key}`, { nullable: true });
  }
  for (const key of EVIDENCE_BOOLEAN_KEYS) {
    assertBoolean(value[key], `${label}.${key}`);
  }
  exactKeys(
    value.mapped_field_presence,
    MAPPED_FIELDS,
    `${label}.mapped_field_presence`,
  );
  for (const key of MAPPED_FIELDS) {
    assertBoolean(
      value.mapped_field_presence[key],
      `${label}.mapped_field_presence.${key}`,
    );
  }
}

function assertSafety(value, label) {
  exactKeys(value, SAFETY_KEYS, label);
  for (const key of SAFETY_KEYS) assertBoolean(value[key], `${label}.${key}`);
}

function assertReceipt(value, index, organizationId) {
  const label = `receipts[${index}]`;
  exactKeys(value, RECEIPT_KEYS, label);
  assertUuid(value.receipt_id, `${label}.receipt_id`);
  assertUuid(value.binding_id, `${label}.binding_id`, { nullable: true });
  assertUuid(value.organization_id, `${label}.organization_id`);
  if (value.organization_id !== organizationId) {
    throw new TypeError(`${label} crosses the requested tenant boundary.`);
  }
  for (
    const key of [
      "installation_scope_sha256",
      "location_identifier_sha256",
      "payload_sha256",
    ]
  ) {
    assertHash(value[key], `${label}.${key}`);
  }
  assertHash(value.webhook_id_sha256, `${label}.webhook_id_sha256`, {
    nullable: true,
  });
  assertHash(
    value.source_contact_identifier_hmac,
    `${label}.source_contact_identifier_hmac`,
    { nullable: true },
  );
  assertHash(
    value.consent_phone_identifier_hmac,
    `${label}.consent_phone_identifier_hmac`,
    { nullable: true },
  );
  if (value.signature_scheme !== "x-ghl-signature-ed25519") {
    throw new TypeError(`${label} is not modern-signature evidence.`);
  }
  if (
    value.event_type !== null &&
    (
      typeof value.event_type !== "string" ||
      !EVENT_TYPE.test(value.event_type) ||
      value.event_type === "invalid" ||
      !GHL_EVENT_TYPES.has(value.event_type)
    )
  ) {
    throw new TypeError(`${label}.event_type is invalid.`);
  }
  assertSqlTimestamp(value.source_occurred_at, `${label}.source_occurred_at`, {
    nullable: true,
  });
  assertSqlTimestamp(value.received_at, `${label}.received_at`);
  if (!["held", "quarantined"].includes(value.decision)) {
    throw new TypeError(`${label}.decision is invalid.`);
  }
  assertReasonCodes(value.reason_codes, `${label}.reason_codes`);
  assertEvidence(value.evidence, `${label}.evidence`);
  assertBoolean(value.webhook_id_collision, `${label}.webhook_id_collision`);
  for (
    const key of [
      "contact_authorized",
      "launch_authorized",
      "external_effects_created",
      "external_trust_required",
    ]
  ) {
    assertBoolean(value[key], `${label}.${key}`);
  }
}

function assertAttempt(value, index, organizationId) {
  const label = `delivery_attempts[${index}]`;
  exactKeys(value, ATTEMPT_KEYS, label);
  assertUuid(value.attempt_id, `${label}.attempt_id`);
  assertUuid(value.receipt_id, `${label}.receipt_id`);
  assertUuid(value.binding_id, `${label}.binding_id`, { nullable: true });
  assertUuid(value.organization_id, `${label}.organization_id`);
  if (value.organization_id !== organizationId) {
    throw new TypeError(`${label} crosses the requested tenant boundary.`);
  }
  assertHash(
    value.installation_scope_sha256,
    `${label}.installation_scope_sha256`,
  );
  assertHash(value.payload_sha256, `${label}.payload_sha256`);
  assertHash(value.webhook_id_sha256, `${label}.webhook_id_sha256`, {
    nullable: true,
  });
  if (
    !["committed", "duplicate", "webhook_id_collision"].includes(
      value.commit_status,
    )
  ) {
    throw new TypeError(`${label}.commit_status is invalid.`);
  }
  if (!["held", "quarantined"].includes(value.decision)) {
    throw new TypeError(`${label}.decision is invalid.`);
  }
  assertReasonCodes(value.reason_codes, `${label}.reason_codes`);
  assertSqlTimestamp(value.attempted_at, `${label}.attempted_at`);
  for (const key of SAFETY_KEYS) assertBoolean(value[key], `${label}.${key}`);
}

function assertLedgerEntry(value, index) {
  const label = `webhook_id_ledger[${index}]`;
  exactKeys(value, LEDGER_KEYS, label);
  assertHash(
    value.installation_scope_sha256,
    `${label}.installation_scope_sha256`,
  );
  assertHash(value.webhook_id_sha256, `${label}.webhook_id_sha256`);
  assertHash(value.first_payload_sha256, `${label}.first_payload_sha256`);
  assertSqlTimestamp(value.created_at, `${label}.created_at`);
}

function normalizedExport(document) {
  exactKeys(document, EXPORT_KEYS, "GHL shadow export");
  if (
    document.schema_version !== "1.0.0" ||
    document.export_type !== "ghl_solar_exit_shadow_reconciliation_evidence" ||
    document.evidence_scope !== "zero_contact_reconciliation_only" ||
    document.campaign_key !== "solar-exit" ||
    document.selection_semantics !== SELECTION_SEMANTICS
  ) {
    throw new TypeError(
      "GHL shadow export has the wrong immutable contract identity.",
    );
  }
  assertUuid(document.organization_id, "organization_id");
  exactKeys(document.window, ["start_inclusive", "end_exclusive"], "window");
  assertSqlTimestamp(document.window.start_inclusive, "window.start_inclusive");
  assertSqlTimestamp(document.window.end_exclusive, "window.end_exclusive");
  if (
    Date.parse(document.window.start_inclusive) >=
      Date.parse(document.window.end_exclusive)
  ) {
    throw new TypeError("GHL shadow export window must be increasing.");
  }
  exactKeys(document.row_counts, [
    "receipts",
    "delivery_attempts",
    "webhook_id_ledger_entries",
  ], "row_counts");
  for (const [key, value] of Object.entries(document.row_counts)) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 10_000) {
      throw new TypeError(`row_counts.${key} is invalid.`);
    }
  }
  for (const key of ["receipts", "delivery_attempts", "webhook_id_ledger"]) {
    if (!Array.isArray(document[key]) || document[key].length > 10_000) {
      throw new TypeError(`${key} must be a bounded array.`);
    }
  }
  if (
    document.receipts.length + document.delivery_attempts.length +
        document.webhook_id_ledger.length > 10_000
  ) {
    throw new TypeError(
      "GHL shadow export exceeds the 10,000-row reconciliation bound.",
    );
  }
  assertSafety(document.safety_invariants, "safety_invariants");
  document.receipts.forEach((value, index) =>
    assertReceipt(value, index, document.organization_id)
  );
  document.delivery_attempts.forEach((value, index) =>
    assertAttempt(value, index, document.organization_id)
  );
  document.webhook_id_ledger.forEach(assertLedgerEntry);
  return JSON.parse(canonicalJson(document));
}

function assertSafeIdentifier(value, label) {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(value)
  ) {
    throw new TypeError(`${label} must be a safe non-PII audit identifier.`);
  }
}

function normalizedComparison(document, organizationId) {
  exactKeys(document, COMPARISON_KEYS, "Independent GHL comparison");
  if (
    document.schema_version !== "1.0.0" ||
    document.comparison_type !== "independently_normalized_ghl_shadow_source" ||
    document.evidence_scope !== "zero_contact_independent_comparison_only" ||
    document.campaign_key !== "solar-exit" ||
    document.source_system !== "gohighlevel"
  ) {
    throw new TypeError(
      "Independent GHL comparison has the wrong immutable contract identity.",
    );
  }
  assertUuid(document.organization_id, "comparison.organization_id");
  if (document.organization_id !== organizationId) {
    throw new TypeError(
      "Independent GHL comparison crosses the requested tenant boundary.",
    );
  }
  exactKeys(
    document.window,
    ["start_inclusive", "end_exclusive"],
    "comparison.window",
  );
  assertSqlTimestamp(
    document.window.start_inclusive,
    "comparison.window.start_inclusive",
  );
  assertSqlTimestamp(
    document.window.end_exclusive,
    "comparison.window.end_exclusive",
  );
  if (
    Date.parse(document.window.start_inclusive) >=
      Date.parse(document.window.end_exclusive)
  ) {
    throw new TypeError("Independent comparison window must be increasing.");
  }
  assertUuid(document.source_export_id, "comparison.source_export_id");
  assertUuid(
    document.source_export_evidence_id,
    "comparison.source_export_evidence_id",
  );
  assertSafeIdentifier(document.normalizer, "comparison.normalizer");
  if (
    typeof document.normalizer_version !== "string" ||
    !VERSION.test(document.normalizer_version)
  ) {
    throw new TypeError("comparison.normalizer_version is invalid.");
  }
  exactKeys(
    document.source_export_fingerprint,
    ["scheme", "key_id", "scope", "synthetic_only", "value"],
    "comparison.source_export_fingerprint",
  );
  const fingerprint = document.source_export_fingerprint;
  if (
    fingerprint.scheme !== "hmac-sha256-v1" ||
    fingerprint.scope !== "independently_normalized_source_export" ||
    fingerprint.synthetic_only !== false
  ) {
    throw new TypeError(
      "comparison.source_export_fingerprint must declare a non-synthetic keyed-fingerprint contract; " +
        "this reconciler does not verify the key or fingerprint.",
    );
  }
  assertSafeIdentifier(
    fingerprint.key_id,
    "comparison.source_export_fingerprint.key_id",
  );
  if (/(^|[._:-])(synthetic|demo|test)([._:-]|$)/i.test(fingerprint.key_id)) {
    throw new TypeError(
      "comparison.source_export_fingerprint.key_id cannot be synthetic, demo, or test material.",
    );
  }
  assertHash(fingerprint.value, "comparison.source_export_fingerprint.value");
  if (!Array.isArray(document.rows) || document.rows.length > 10_000) {
    throw new TypeError("comparison.rows must be a bounded array.");
  }
  assertSafety(document.safety_invariants, "comparison.safety_invariants");
  document.rows.forEach((row, index) => {
    const label = `comparison.rows[${index}]`;
    exactKeys(row, COMPARISON_ROW_KEYS, label);
    assertUuid(row.comparison_id, `${label}.comparison_id`);
    assertHash(row.webhook_id_sha256, `${label}.webhook_id_sha256`);
    assertUuid(row.organization_id, `${label}.organization_id`);
    if (row.organization_id !== organizationId) {
      throw new TypeError(`${label} crosses the requested tenant boundary.`);
    }
    assertHash(
      row.location_identifier_sha256,
      `${label}.location_identifier_sha256`,
    );
    assertHash(
      row.source_contact_identifier_hmac,
      `${label}.source_contact_identifier_hmac`,
      { nullable: true },
    );
    assertHash(
      row.consent_phone_identifier_hmac,
      `${label}.consent_phone_identifier_hmac`,
      { nullable: true },
    );
    if (!["held", "quarantined"].includes(row.decision)) {
      throw new TypeError(`${label}.decision is invalid.`);
    }
    assertReasonCodes(row.reason_codes, `${label}.reason_codes`);
    exactKeys(
      row.evidence_projection,
      EVIDENCE_PROJECTION_KEYS,
      `${label}.evidence_projection`,
    );
    assertEvidenceProjection(
      row.evidence_projection,
      `${label}.evidence_projection`,
    );
  });
  return JSON.parse(canonicalJson(document));
}

class DuplicateJsonKeyError extends SyntaxError {
  constructor(key, path) {
    super(`Duplicate JSON object key ${JSON.stringify(key)} at ${path}.`);
    this.name = "DuplicateJsonKeyError";
  }
}

/** Reject duplicate object keys before JSON.parse can silently choose a value. */
export function parseStrictJsonDocument(value) {
  const text = String(value);
  let index = 0;
  const syntax = (message) => {
    throw new SyntaxError(`${message} at JSON offset ${index}.`);
  };
  const skipWhitespace = () => {
    while (/[\t\n\r ]/.test(text[index] ?? "")) index += 1;
  };
  const parseString = () => {
    if (text[index] !== '"') syntax("Expected a JSON string");
    index += 1;
    let decoded = "";
    while (index < text.length) {
      const character = text[index++];
      if (character === '"') return decoded;
      if (character === "\\") {
        if (index >= text.length) syntax("Unterminated JSON escape");
        const escape = text[index++];
        const simple = {
          '"': '"',
          "\\": "\\",
          "/": "/",
          b: "\b",
          f: "\f",
          n: "\n",
          r: "\r",
          t: "\t",
        };
        if (Object.hasOwn(simple, escape)) {
          decoded += simple[escape];
          continue;
        }
        if (escape !== "u") syntax(`Invalid JSON escape \\${escape}`);
        const hex = text.slice(index, index + 4);
        if (!/^[a-fA-F0-9]{4}$/.test(hex)) {
          syntax("Invalid JSON Unicode escape");
        }
        decoded += String.fromCharCode(Number.parseInt(hex, 16));
        index += 4;
        continue;
      }
      if (character.charCodeAt(0) <= 0x1f) {
        syntax("Unescaped JSON control character");
      }
      decoded += character;
    }
    syntax("Unterminated JSON string");
  };
  const parseNumber = () => {
    const match = text.slice(index).match(
      /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/,
    );
    if (!match) syntax("Invalid JSON number");
    index += match[0].length;
  };
  const parseLiteral = (literal) => {
    if (text.slice(index, index + literal.length) !== literal) {
      syntax(`Expected ${literal}`);
    }
    index += literal.length;
  };
  const parseValue = (path) => {
    skipWhitespace();
    const character = text[index];
    if (character === "{") return parseObject(path);
    if (character === "[") return parseArray(path);
    if (character === '"') return parseString();
    if (character === "t") return parseLiteral("true");
    if (character === "f") return parseLiteral("false");
    if (character === "n") return parseLiteral("null");
    if (character === "-" || /\d/.test(character ?? "")) return parseNumber();
    syntax("Expected a JSON value");
  };
  const parseObject = (path) => {
    index += 1;
    skipWhitespace();
    const keys = new Set();
    if (text[index] === "}") {
      index += 1;
      return;
    }
    while (index < text.length) {
      skipWhitespace();
      const key = parseString();
      if (keys.has(key)) throw new DuplicateJsonKeyError(key, path);
      keys.add(key);
      skipWhitespace();
      if (text[index] !== ":") syntax("Expected a colon after an object key");
      index += 1;
      parseValue(`${path}.${key}`);
      skipWhitespace();
      if (text[index] === "}") {
        index += 1;
        return;
      }
      if (text[index] !== ",") {
        syntax("Expected a comma between object members");
      }
      index += 1;
    }
    syntax("Unterminated JSON object");
  };
  const parseArray = (path) => {
    index += 1;
    skipWhitespace();
    if (text[index] === "]") {
      index += 1;
      return;
    }
    let item = 0;
    while (index < text.length) {
      parseValue(`${path}[${item}]`);
      item += 1;
      skipWhitespace();
      if (text[index] === "]") {
        index += 1;
        return;
      }
      if (text[index] !== ",") syntax("Expected a comma between array items");
      index += 1;
    }
    syntax("Unterminated JSON array");
  };
  skipWhitespace();
  parseValue("$");
  skipWhitespace();
  if (index !== text.length) syntax("Unexpected trailing JSON data");
  return JSON.parse(text);
}

function sortedCounts(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return Object.fromEntries(
    [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function safetyEscalated(value) {
  return (
    value.contact_authorized !== false ||
    value.launch_authorized !== false ||
    value.external_effects_created !== false ||
    value.external_trust_required !== true ||
    ("provider_invocation_authorized" in value &&
      value.provider_invocation_authorized !== false) ||
    ("queue_mutation_authorized" in value &&
      value.queue_mutation_authorized !== false) ||
    ("crm_mutation_authorized" in value &&
      value.crm_mutation_authorized !== false)
  );
}

function arrayEqual(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function rowChain(rowsByKind) {
  let chain = "0".repeat(64);
  for (const [kind, rows] of rowsByKind) {
    for (const row of rows) {
      chain = createHash("sha256")
        .update(`${chain}\n${kind}\n${sha256Canonical(row)}`, "utf8")
        .digest("hex");
    }
  }
  return chain;
}

function compareRows(left, right, timeKey, idKey) {
  return left[timeKey].localeCompare(right[timeKey]) ||
    left[idKey].localeCompare(right[idKey]);
}

function uniqueSortedFindings(findings) {
  const byCanonical = new Map(
    findings.map((finding) => [canonicalJson(finding), finding]),
  );
  return [...byCanonical.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, finding]) => finding);
}

function evidenceProjection(evidence) {
  return Object.fromEntries(
    EVIDENCE_PROJECTION_KEYS.map((key) => [key, evidence[key]]),
  );
}

function comparisonFieldsThatDiffer(receipt, expected) {
  const actual = {
    webhook_id_sha256: receipt.webhook_id_sha256,
    organization_id: receipt.organization_id,
    location_identifier_sha256: receipt.location_identifier_sha256,
    source_contact_identifier_hmac: receipt.source_contact_identifier_hmac,
    consent_phone_identifier_hmac: receipt.consent_phone_identifier_hmac,
    decision: receipt.decision,
    reason_codes: receipt.reason_codes,
    evidence_projection: evidenceProjection(receipt.evidence),
  };
  const fields = [];
  for (
    const key of [
      "webhook_id_sha256",
      "organization_id",
      "location_identifier_sha256",
      "source_contact_identifier_hmac",
      "consent_phone_identifier_hmac",
      "decision",
      "reason_codes",
    ]
  ) {
    if (canonicalJson(actual[key]) !== canonicalJson(expected[key])) {
      fields.push(key);
    }
  }
  for (const key of EVIDENCE_PROJECTION_KEYS) {
    if (
      canonicalJson(actual.evidence_projection[key]) !==
        canonicalJson(expected.evidence_projection[key])
    ) {
      fields.push(`evidence_projection.${key}`);
    }
  }
  return fields.sort();
}

export function buildGhlShadowReconciliationReport(
  exportDocument,
  comparisonDocument = null,
) {
  const source = normalizedExport(exportDocument);
  const comparison = comparisonDocument === null
    ? null
    : normalizedComparison(comparisonDocument, source.organization_id);
  const findings = [];
  const add = (code, detail = {}) => findings.push({ code, ...detail });
  const start = source.window.start_inclusive;
  const end = source.window.end_exclusive;

  if (safetyEscalated(source.safety_invariants)) {
    add("EXPORT_SAFETY_AUTHORITY_ESCALATION");
  }
  if (
    source.row_counts.receipts !== source.receipts.length ||
    source.row_counts.delivery_attempts !== source.delivery_attempts.length ||
    source.row_counts.webhook_id_ledger_entries !==
      source.webhook_id_ledger.length
  ) add("EXPORT_ROW_COUNT_MISMATCH");

  const sortedReceipts = [...source.receipts].sort((left, right) =>
    compareRows(left, right, "received_at", "receipt_id")
  );
  const sortedAttempts = [...source.delivery_attempts].sort((left, right) =>
    compareRows(left, right, "attempted_at", "attempt_id")
  );
  const sortedLedger = [...source.webhook_id_ledger].sort((left, right) =>
    left.installation_scope_sha256.localeCompare(
      right.installation_scope_sha256,
    ) ||
    left.webhook_id_sha256.localeCompare(right.webhook_id_sha256)
  );
  if (!arrayEqual(source.receipts, sortedReceipts)) {
    add("RECEIPT_ORDER_NONCANONICAL");
  }
  if (!arrayEqual(source.delivery_attempts, sortedAttempts)) {
    add("ATTEMPT_ORDER_NONCANONICAL");
  }
  if (!arrayEqual(source.webhook_id_ledger, sortedLedger)) {
    add("WEBHOOK_LEDGER_ORDER_NONCANONICAL");
  }

  const receiptById = new Map();
  for (const receipt of source.receipts) {
    if (receiptById.has(receipt.receipt_id)) {
      add("DUPLICATE_RECEIPT_ID", { receipt_id: receipt.receipt_id });
    } else receiptById.set(receipt.receipt_id, receipt);
    if (safetyEscalated(receipt)) {
      add("RECEIPT_SAFETY_AUTHORITY_ESCALATION", {
        receipt_id: receipt.receipt_id,
      });
    }
    if (receipt.binding_id === null) {
      add("TENANT_RECEIPT_MISSING_BINDING", { receipt_id: receipt.receipt_id });
    }
    if (
      !arrayEqual(
        receipt.reason_codes,
        [...new Set(receipt.reason_codes)].sort(),
      )
    ) {
      add("RECEIPT_REASONS_NONCANONICAL", { receipt_id: receipt.receipt_id });
    }
    const evidence = receipt.evidence;
    for (
      const [field, evidenceField = field] of [
        ["payload_sha256"],
        ["source_contact_identifier_hmac"],
        ["consent_phone_identifier_hmac"],
        ["signature_scheme"],
      ]
    ) {
      if (receipt[field] !== evidence[evidenceField]) {
        add("RECEIPT_EVIDENCE_BINDING_MISMATCH", {
          receipt_id: receipt.receipt_id,
          field,
        });
      }
    }
    if (receipt.event_type !== evidence.event_type) {
      add("RECEIPT_EVIDENCE_BINDING_MISMATCH", {
        receipt_id: receipt.receipt_id,
        field: "event_type",
      });
    }
    if (safetyEscalated(evidence)) {
      add("RECEIPT_EVIDENCE_AUTHORITY_ESCALATION", {
        receipt_id: receipt.receipt_id,
      });
    }
    if (
      evidence.current_contact_state_ignored !== true ||
      evidence.current_contact_source_ignored !== true
    ) {
      add("UNTRUSTED_MUTABLE_CONTACT_FIELDS_CONSUMED", {
        receipt_id: receipt.receipt_id,
      });
    }
    const collisionReason = receipt.reason_codes.includes(
      "WEBHOOK_ID_PAYLOAD_COLLISION",
    );
    if (receipt.webhook_id_collision !== collisionReason) {
      add("COLLISION_REASON_BINDING_MISMATCH", {
        receipt_id: receipt.receipt_id,
      });
    }
    if (receipt.webhook_id_collision) {
      add("WEBHOOK_ID_PAYLOAD_COLLISION_OBSERVED", {
        receipt_id: receipt.receipt_id,
      });
    }
  }

  const attemptById = new Map();
  const attemptsByReceipt = new Map();
  for (const attempt of source.delivery_attempts) {
    if (attemptById.has(attempt.attempt_id)) {
      add("DUPLICATE_ATTEMPT_ID", {
        attempt_id: attempt.attempt_id,
        receipt_id: attempt.receipt_id,
      });
    } else attemptById.set(attempt.attempt_id, attempt);
    if (!attemptsByReceipt.has(attempt.receipt_id)) {
      attemptsByReceipt.set(attempt.receipt_id, []);
    }
    attemptsByReceipt.get(attempt.receipt_id).push(attempt);
    const receipt = receiptById.get(attempt.receipt_id);
    if (!receipt) {
      add("ORPHAN_DELIVERY_ATTEMPT", {
        attempt_id: attempt.attempt_id,
        receipt_id: attempt.receipt_id,
      });
      continue;
    }
    if (safetyEscalated(attempt)) {
      add("ATTEMPT_SAFETY_AUTHORITY_ESCALATION", {
        attempt_id: attempt.attempt_id,
        receipt_id: attempt.receipt_id,
      });
    }
    if (
      !arrayEqual(
        attempt.reason_codes,
        [...new Set(attempt.reason_codes)].sort(),
      )
    ) {
      add("ATTEMPT_REASONS_NONCANONICAL", {
        attempt_id: attempt.attempt_id,
        receipt_id: attempt.receipt_id,
      });
    }
    for (
      const field of [
        "binding_id",
        "organization_id",
        "installation_scope_sha256",
        "payload_sha256",
        "webhook_id_sha256",
        "decision",
      ]
    ) {
      if (attempt[field] !== receipt[field]) {
        add("ATTEMPT_RECEIPT_BINDING_MISMATCH", {
          attempt_id: attempt.attempt_id,
          receipt_id: attempt.receipt_id,
          field,
        });
      }
    }
    if (!arrayEqual(attempt.reason_codes, receipt.reason_codes)) {
      add("ATTEMPT_RECEIPT_BINDING_MISMATCH", {
        attempt_id: attempt.attempt_id,
        receipt_id: attempt.receipt_id,
        field: "reason_codes",
      });
    }
    if (attempt.attempted_at < receipt.received_at) {
      add("ATTEMPT_PRECEDES_RECEIPT", {
        attempt_id: attempt.attempt_id,
        receipt_id: attempt.receipt_id,
      });
    }
    if (attempt.attempted_at >= end) {
      add("ATTEMPT_OUTSIDE_CLOSED_EXPORT_HISTORY", {
        attempt_id: attempt.attempt_id,
        receipt_id: attempt.receipt_id,
      });
    }
  }

  for (const receipt of source.receipts) {
    const attempts = attemptsByReceipt.get(receipt.receipt_id) || [];
    const initial = attempts.filter((attempt) =>
      attempt.commit_status !== "duplicate"
    );
    if (attempts.length === 0) {
      add("RECEIPT_MISSING_DELIVERY_ATTEMPT_EVIDENCE", {
        receipt_id: receipt.receipt_id,
      });
    }
    if (initial.length !== 1) {
      add("RECEIPT_INITIAL_ATTEMPT_CARDINALITY_MISMATCH", {
        receipt_id: receipt.receipt_id,
        observed: initial.length,
      });
    }
    if (initial.length === 1) {
      const expected = receipt.webhook_id_collision
        ? "webhook_id_collision"
        : "committed";
      if (initial[0].commit_status !== expected) {
        add("RECEIPT_INITIAL_ATTEMPT_STATUS_MISMATCH", {
          receipt_id: receipt.receipt_id,
        });
      }
    }
    const activeInWindow =
      (receipt.received_at >= start && receipt.received_at < end) ||
      attempts.some((attempt) =>
        attempt.attempted_at >= start && attempt.attempted_at < end
      );
    if (!activeInWindow || receipt.received_at >= end) {
      add("RECEIPT_SELECTION_WINDOW_MISMATCH", {
        receipt_id: receipt.receipt_id,
      });
    }
  }

  const ledgerByKey = new Map();
  for (const entry of source.webhook_id_ledger) {
    const key =
      `${entry.installation_scope_sha256}\0${entry.webhook_id_sha256}`;
    if (ledgerByKey.has(key)) {
      add("DUPLICATE_WEBHOOK_LEDGER_KEY", {
        ledger_key_sha256: sha256Canonical(key),
      });
    } else ledgerByKey.set(key, entry);
  }
  const usedLedgerKeys = new Set();
  for (const receipt of source.receipts) {
    if (receipt.webhook_id_sha256 === null) continue;
    const key =
      `${receipt.installation_scope_sha256}\0${receipt.webhook_id_sha256}`;
    const ledger = ledgerByKey.get(key);
    if (!ledger) {
      add("RECEIPT_MISSING_WEBHOOK_LEDGER_EVIDENCE", {
        receipt_id: receipt.receipt_id,
      });
      continue;
    }
    usedLedgerKeys.add(key);
    const payloadMatchesFirst =
      receipt.payload_sha256 === ledger.first_payload_sha256;
    if (receipt.webhook_id_collision === payloadMatchesFirst) {
      add("WEBHOOK_LEDGER_FIRST_PAYLOAD_MISMATCH", {
        receipt_id: receipt.receipt_id,
      });
    }
  }
  for (const key of ledgerByKey.keys()) {
    if (!usedLedgerKeys.has(key)) {
      add("ORPHAN_WEBHOOK_LEDGER_EVIDENCE", {
        ledger_key_sha256: sha256Canonical(key),
      });
    }
  }

  const matchedReceiptIds = new Set();
  const comparedReceiptIds = new Set();
  const comparisonContactIdentifiers = new Set();
  const comparisonWebhookKeys = new Set();
  if (comparison === null) {
    add("INDEPENDENT_SOURCE_COMPARISON_REQUIRED");
  } else {
    if (safetyEscalated(comparison.safety_invariants)) {
      add("INDEPENDENT_COMPARISON_AUTHORITY_ESCALATION");
    }
    if (!arrayEqual(comparison.window, source.window)) {
      add("INDEPENDENT_COMPARISON_WINDOW_MISMATCH");
    }
    const sortedComparisonRows = [...comparison.rows].sort((left, right) =>
      left.webhook_id_sha256.localeCompare(right.webhook_id_sha256) ||
      left.comparison_id.localeCompare(right.comparison_id)
    );
    if (!arrayEqual(comparison.rows, sortedComparisonRows)) {
      add("INDEPENDENT_COMPARISON_ORDER_NONCANONICAL");
    }

    const comparisonIds = new Set();
    const expectedByWebhook = new Map();
    for (const expected of comparison.rows) {
      if (comparisonIds.has(expected.comparison_id)) {
        add("DUPLICATE_INDEPENDENT_COMPARISON_ID", {
          comparison_id: expected.comparison_id,
        });
      }
      comparisonIds.add(expected.comparison_id);
      if (expectedByWebhook.has(expected.webhook_id_sha256)) {
        add("DUPLICATE_INDEPENDENT_WEBHOOK_ID", {
          webhook_id_sha256: expected.webhook_id_sha256,
        });
      } else {
        expectedByWebhook.set(expected.webhook_id_sha256, expected);
      }
      comparisonWebhookKeys.add(expected.webhook_id_sha256);
      if (expected.source_contact_identifier_hmac) {
        comparisonContactIdentifiers.add(
          expected.source_contact_identifier_hmac,
        );
      }
      if (
        !arrayEqual(
          expected.reason_codes,
          [...new Set(expected.reason_codes)].sort(),
        )
      ) {
        add("INDEPENDENT_COMPARISON_REASONS_NONCANONICAL", {
          comparison_id: expected.comparison_id,
        });
      }
      if (safetyEscalated(expected.evidence_projection)) {
        add("INDEPENDENT_COMPARISON_EVIDENCE_AUTHORITY_ESCALATION", {
          comparison_id: expected.comparison_id,
        });
      }
    }

    const consumedComparisonIds = new Set();
    for (const receipt of source.receipts) {
      if (receipt.webhook_id_sha256 === null) {
        comparisonWebhookKeys.add(`receipt:${receipt.receipt_id}`);
        add("RECEIPT_MISSING_INDEPENDENT_CORRELATION_KEY", {
          receipt_id: receipt.receipt_id,
        });
        continue;
      }
      comparisonWebhookKeys.add(receipt.webhook_id_sha256);
      const expected = expectedByWebhook.get(receipt.webhook_id_sha256);
      if (!expected) {
        add("RECEIPT_NOT_IN_INDEPENDENT_COMPARISON", {
          receipt_id: receipt.receipt_id,
        });
        continue;
      }
      comparedReceiptIds.add(receipt.receipt_id);
      consumedComparisonIds.add(expected.comparison_id);
      const differingFields = comparisonFieldsThatDiffer(receipt, expected);
      if (differingFields.length > 0) {
        add("INDEPENDENT_SOURCE_COMPARISON_MISMATCH", {
          receipt_id: receipt.receipt_id,
          comparison_id: expected.comparison_id,
          differing_fields: differingFields,
        });
      } else {
        matchedReceiptIds.add(receipt.receipt_id);
      }
    }
    for (const expected of comparison.rows) {
      if (!consumedComparisonIds.has(expected.comparison_id)) {
        add("INDEPENDENT_COMPARISON_ROW_WITHOUT_RECEIPT", {
          comparison_id: expected.comparison_id,
        });
      }
    }
  }

  if (source.receipts.length === 0) add("NO_SHADOW_EVIDENCE");
  const finalFindings = uniqueSortedFindings(findings);
  const globalMismatch = finalFindings.some((finding) =>
    !finding.receipt_id && finding.code !== "NO_SHADOW_EVIDENCE"
  );
  const mismatchedReceiptIds = new Set(
    globalMismatch
      ? source.receipts.map((receipt) => receipt.receipt_id)
      : finalFindings.map((finding) => finding.receipt_id).filter(Boolean),
  );
  const observedContacts = new Set(
    source.receipts.map((receipt) => receipt.source_contact_identifier_hmac)
      .filter(Boolean),
  );
  const comparisonContactUniverse = comparison === null
    ? new Set()
    : new Set([...observedContacts, ...comparisonContactIdentifiers]);
  const mismatchedContacts = new Set();
  for (const receiptId of mismatchedReceiptIds) {
    const identifier = receiptById.get(receiptId)
      ?.source_contact_identifier_hmac;
    if (identifier) mismatchedContacts.add(identifier);
  }
  if (globalMismatch) {
    for (const identifier of comparisonContactUniverse) {
      mismatchedContacts.add(identifier);
    }
  }
  if (comparison !== null) {
    const matchedComparisonContacts = new Set(
      [...matchedReceiptIds]
        .map((receiptId) =>
          receiptById.get(receiptId)?.source_contact_identifier_hmac
        )
        .filter(Boolean),
    );
    for (const identifier of comparisonContactUniverse) {
      if (!matchedComparisonContacts.has(identifier)) {
        mismatchedContacts.add(identifier);
      }
    }
  }
  const receiptMismatchRate = source.receipts.length === 0
    ? null
    : mismatchedReceiptIds.size / source.receipts.length;
  const contactMismatchRate = comparisonContactUniverse.size === 0
    ? null
    : mismatchedContacts.size / comparisonContactUniverse.size;
  const duplicateDeliveries =
    source.delivery_attempts.filter((attempt) =>
      attempt.commit_status === "duplicate"
    ).length;
  const collisionReceipts =
    source.receipts.filter((receipt) => receipt.webhook_id_collision).length;
  const status = source.receipts.length === 0
    ? "no_evidence"
    : comparison === null
    ? "comparison_required"
    : finalFindings.length === 0
    ? "reconciled"
    : "mismatch_detected";
  const expectedComparisonRecords = comparison === null
    ? 0
    : comparisonWebhookKeys.size;
  const comparisonMismatches = comparison === null
    ? 0
    : Math.max(0, expectedComparisonRecords - matchedReceiptIds.size);

  const reportWithoutHash = {
    schema_version: GHL_SHADOW_RECONCILIATION_SCHEMA_VERSION,
    report_type: "ghl_solar_exit_shadow_reconciliation_report",
    reconciler: "dial_smart_ghl_shadow_reconciliation",
    reconciler_version: GHL_SHADOW_RECONCILER_VERSION,
    evidence_scope: "zero_contact_reconciliation_only",
    report_status: status,
    organization_id: source.organization_id,
    campaign_key: "solar-exit",
    window: source.window,
    source_export_sha256: sha256Canonical(source),
    independent_comparison_sha256: comparison === null
      ? null
      : sha256Canonical(comparison),
    evidence_hashes: {
      receipts_sha256: sha256Canonical(source.receipts),
      delivery_attempts_sha256: sha256Canonical(source.delivery_attempts),
      webhook_id_ledger_sha256: sha256Canonical(source.webhook_id_ledger),
      independent_comparison_rows_sha256: comparison === null
        ? null
        : sha256Canonical(comparison.rows),
      evidence_chain_sha256: rowChain([
        ["receipt", source.receipts],
        ["delivery_attempt", source.delivery_attempts],
        ["webhook_id_ledger", source.webhook_id_ledger],
        ["independent_comparison", comparison?.rows || []],
      ]),
    },
    totals: {
      receipts: source.receipts.length,
      delivery_attempts: source.delivery_attempts.length,
      exact_retry_deliveries: duplicateDeliveries,
      webhook_id_collision_receipts: collisionReceipts,
      unique_contacts_observed: observedContacts.size,
      independent_comparison_rows: comparison?.rows.length || 0,
      independently_compared_receipts: comparedReceiptIds.size,
      independently_matched_receipts: matchedReceiptIds.size,
      held_receipts:
        source.receipts.filter((receipt) => receipt.decision === "held").length,
      quarantined_receipts:
        source.receipts.filter((receipt) => receipt.decision === "quarantined")
          .length,
      mismatched_receipts: mismatchedReceiptIds.size,
      mismatched_contacts: mismatchedContacts.size,
    },
    decision_counts: sortedCounts(
      source.receipts.map((receipt) => receipt.decision),
    ),
    event_type_counts: sortedCounts(
      source.receipts.map((receipt) => receipt.event_type ?? "null"),
    ),
    reason_counts: sortedCounts(
      source.receipts.flatMap((receipt) => receipt.reason_codes),
    ),
    replay_duplicate_accounting: {
      exact_payload_retries: duplicateDeliveries,
      unique_durable_receipts: source.receipts.length,
      webhook_id_payload_collisions: collisionReceipts,
      delivery_attempts_bound_to_receipts:
        source.delivery_attempts.filter((attempt) =>
          receiptById.has(attempt.receipt_id)
        ).length,
      delivery_attempts_without_receipts:
        source.delivery_attempts.filter((attempt) =>
          !receiptById.has(attempt.receipt_id)
        ).length,
    },
    integrity: {
      reconciliation_integrity_passed: status === "reconciled",
      finding_count: finalFindings.length,
      mismatched_receipt_count: mismatchedReceiptIds.size,
      receipt_integrity_mismatch_rate: receiptMismatchRate,
      findings_sha256: sha256Canonical(finalFindings),
      findings: finalFindings,
    },
    solar_exit_gate_evidence: {
      metric_scope:
        "signed_receipts_vs_independently_normalized_redacted_source_plus_attempt_and_webhook_lineage",
      independent_source_comparison_present: comparison !== null,
      ghl_shadow_records_expected: expectedComparisonRecords,
      ghl_shadow_records_matched: matchedReceiptIds.size,
      ghl_shadow_mismatches: comparisonMismatches,
      ghl_shadow_contacts_compared: comparisonContactUniverse.size,
      ghl_shadow_mismatch_rate: contactMismatchRate,
      suitable_for_external_certificate_review: status === "reconciled" &&
        comparisonContactUniverse.size > 0 && collisionReceipts === 0,
      reconciliation_integrity_passed: status === "reconciled",
      report_authority: "review_only_unattested",
      source_fingerprint_verified: false,
      external_attestation_verified: false,
      certificate_created: false,
      external_attestation_required: true,
      contact_authorized: false,
      launch_authorized: false,
    },
    side_effect_invariants: {
      lead_contacts: 0,
      provider_calls: 0,
      queue_mutations: 0,
      crm_mutations: 0,
      external_messages: 0,
      database_writes_by_reconciler: 0,
      network_requests_by_reconciler: 0,
      output_channel: "return_value_or_cli_stdout_only",
    },
    source_export: source,
    independent_comparison: comparison,
  };
  return {
    ...reportWithoutHash,
    report_sha256: sha256Canonical(reportWithoutHash),
  };
}

export function verifyGhlShadowReconciliationReport(report) {
  try {
    if (!isPlainObject(report) || !SHA256.test(report.report_sha256 || "")) {
      return false;
    }
    const rebuilt = buildGhlShadowReconciliationReport(
      report.source_export,
      report.independent_comparison,
    );
    return canonicalJson(rebuilt) === canonicalJson(report);
  } catch {
    return false;
  }
}
