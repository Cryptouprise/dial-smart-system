import { sha256Hex } from "./ghl-webhook-signature.ts";

export const GHL_SHADOW_SCHEMA_VERSION = "1.0.0";

export const REQUIRED_SOLAR_CONSENT_FIELDS = Object.freeze(
  [
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
  ] as const,
);

export type SolarConsentField = typeof REQUIRED_SOLAR_CONSENT_FIELDS[number];

export type GhlShadowBinding = {
  id: string;
  organization_id: string;
  ghl_location_id: string;
  campaign_key: string;
  mapping_version: string;
  identifier_key_version: string;
  custom_field_mapping: Record<string, unknown>;
  custom_field_mapping_sha256: string;
  policy_version: string;
  policy_status: string;
  policy_snapshot: Record<string, unknown>;
  policy_snapshot_sha256: string;
  enabled: boolean;
  mode: string;
  outbound_writeback_enabled: boolean;
  workflow_triggering_enabled: boolean;
  contact_authorized: boolean;
  launch_authorized: boolean;
  external_trust_required: boolean;
};

export type GhlShadowDecision = "held" | "quarantined";

export type GhlShadowEvaluation = {
  decision: GhlShadowDecision;
  reason_codes: string[];
  source_contact_identifier_hmac: string | null;
  consent_phone_identifier_hmac: string | null;
  evidence: Record<string, unknown>;
  contact_authorized: false;
  launch_authorized: false;
  external_effects_created: false;
};

type PolicySnapshot = {
  seller_legal_name: string;
  approved_lead_sources: string[];
  approved_consent_text_versions: string[];
  approved_source_form_versions: string[];
  approved_consent_artifacts: Array<{
    artifact_id: string;
    disclosure_sha256: string;
  }>;
  approved_property_states: string[];
  approved_calling_states: string[];
  maximum_consent_age_days: number;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PLACEHOLDER_PATTERN = /^__.*__$/;

const US_STATE_CODES = new Set([
  "AK",
  "AL",
  "AR",
  "AS",
  "AZ",
  "CA",
  "CO",
  "CT",
  "DC",
  "DE",
  "FL",
  "GA",
  "GU",
  "HI",
  "IA",
  "ID",
  "IL",
  "IN",
  "KS",
  "KY",
  "LA",
  "MA",
  "MD",
  "ME",
  "MI",
  "MN",
  "MO",
  "MP",
  "MS",
  "MT",
  "NC",
  "ND",
  "NE",
  "NH",
  "NJ",
  "NM",
  "NV",
  "NY",
  "OH",
  "OK",
  "OR",
  "PA",
  "PR",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VA",
  "VI",
  "VT",
  "WA",
  "WI",
  "WV",
  "WY",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/** Strict UTC instant with explicit millisecond precision (0-3 digits). */
export function parseStrictUtcInstant(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/,
  );
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(
    Number,
  );
  const millisecond = Number((match[7] || "").padEnd(3, "0"));
  if (
    month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 ||
    minute > 59 || second > 59
  ) return null;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, millisecond);
  if (
    date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day || date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute || date.getUTCSeconds() !== second ||
    date.getUTCMilliseconds() !== millisecond
  ) return null;
  return date.getTime();
}

export function stableJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non_finite_json_number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${
      Object.keys(value).sort().map((key) =>
        `${JSON.stringify(key)}:${stableJson(value[key])}`
      ).join(",")
    }}`;
  }
  throw new Error("unsupported_json_value");
}

function exactStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 &&
    value.every((item) =>
      typeof item === "string" && item.length > 0 && item === item.trim() &&
      !PLACEHOLDER_PATTERN.test(item)
    ) && new Set(value).size === value.length;
}

function policySnapshotFrom(value: unknown): PolicySnapshot | null {
  if (!isRecord(value)) return null;
  const exactKeys = [
    "seller_legal_name",
    "approved_lead_sources",
    "approved_consent_text_versions",
    "approved_source_form_versions",
    "approved_consent_artifacts",
    "approved_property_states",
    "approved_calling_states",
    "maximum_consent_age_days",
  ];
  if (
    Object.keys(value).sort().join("\n") !== exactKeys.sort().join("\n") ||
    typeof value.seller_legal_name !== "string" ||
    !value.seller_legal_name.trim() ||
    value.seller_legal_name !== value.seller_legal_name.trim() ||
    PLACEHOLDER_PATTERN.test(value.seller_legal_name) ||
    !exactStringArray(value.approved_lead_sources) ||
    !exactStringArray(value.approved_consent_text_versions) ||
    !exactStringArray(value.approved_source_form_versions) ||
    !exactStringArray(value.approved_property_states) ||
    !exactStringArray(value.approved_calling_states) ||
    !Number.isInteger(value.maximum_consent_age_days) ||
    Number(value.maximum_consent_age_days) < 1 ||
    Number(value.maximum_consent_age_days) > 3_650 ||
    !value.approved_property_states.every((state) =>
      US_STATE_CODES.has(state)
    ) ||
    !value.approved_calling_states.every((state) =>
      US_STATE_CODES.has(state)
    ) ||
    !Array.isArray(value.approved_consent_artifacts) ||
    value.approved_consent_artifacts.length === 0
  ) return null;

  const artifacts: PolicySnapshot["approved_consent_artifacts"] = [];
  for (const candidate of value.approved_consent_artifacts) {
    if (
      !isRecord(candidate) ||
      Object.keys(candidate).sort().join("\n") !==
        "artifact_id\ndisclosure_sha256" ||
      typeof candidate.artifact_id !== "string" ||
      !candidate.artifact_id ||
      candidate.artifact_id !== candidate.artifact_id.trim() ||
      PLACEHOLDER_PATTERN.test(candidate.artifact_id) ||
      typeof candidate.disclosure_sha256 !== "string" ||
      !SHA256_PATTERN.test(candidate.disclosure_sha256)
    ) return null;
    artifacts.push({
      artifact_id: candidate.artifact_id,
      disclosure_sha256: candidate.disclosure_sha256,
    });
  }
  if (
    new Set(artifacts.map((artifact) => artifact.artifact_id)).size !==
      artifacts.length
  ) {
    return null;
  }

  return {
    seller_legal_name: value.seller_legal_name,
    approved_lead_sources: value.approved_lead_sources,
    approved_consent_text_versions: value.approved_consent_text_versions,
    approved_source_form_versions: value.approved_source_form_versions,
    approved_consent_artifacts: artifacts,
    approved_property_states: value.approved_property_states,
    approved_calling_states: value.approved_calling_states,
    maximum_consent_age_days: Number(value.maximum_consent_age_days),
  };
}

export async function validateGhlShadowBinding(
  binding: GhlShadowBinding,
): Promise<string[]> {
  const reasons: string[] = [];
  if (!UUID_PATTERN.test(binding.id || "")) reasons.push("INVALID_BINDING_ID");
  if (!UUID_PATTERN.test(binding.organization_id || "")) {
    reasons.push("INVALID_ORGANIZATION_ID");
  }
  if (!SAFE_ID_PATTERN.test(binding.ghl_location_id || "")) {
    reasons.push("INVALID_LOCATION_ID");
  }
  if (binding.campaign_key !== "solar-exit") {
    reasons.push("WRONG_CAMPAIGN_BINDING");
  }
  if (!binding.enabled) reasons.push("BINDING_DISABLED");
  if (binding.mode !== "shadow_read_only") {
    reasons.push("BINDING_NOT_SHADOW_ONLY");
  }
  if (
    binding.outbound_writeback_enabled || binding.workflow_triggering_enabled ||
    binding.contact_authorized || binding.launch_authorized ||
    !binding.external_trust_required
  ) reasons.push("BINDING_AUTHORITY_ESCALATION");
  if (!VERSION_PATTERN.test(binding.mapping_version || "")) {
    reasons.push("INVALID_MAPPING_VERSION");
  }
  if (!VERSION_PATTERN.test(binding.identifier_key_version || "")) {
    reasons.push("INVALID_IDENTIFIER_KEY_VERSION");
  }
  if (
    !VERSION_PATTERN.test(binding.policy_version || "") ||
    binding.policy_status !== "resolved"
  ) {
    reasons.push("UNRESOLVED_POLICY");
  }

  const mapping = binding.custom_field_mapping;
  if (!isRecord(mapping)) {
    reasons.push("INVALID_CUSTOM_FIELD_MAPPING");
  } else {
    const actualKeys = Object.keys(mapping).sort();
    const expectedKeys = [...REQUIRED_SOLAR_CONSENT_FIELDS].sort();
    if (actualKeys.join("\n") !== expectedKeys.join("\n")) {
      reasons.push("INEXACT_CUSTOM_FIELD_MAPPING");
    }
    const fieldIds: string[] = [];
    for (const key of REQUIRED_SOLAR_CONSENT_FIELDS) {
      const value = mapping[key];
      if (
        typeof value !== "string" || !SAFE_ID_PATTERN.test(value) ||
        PLACEHOLDER_PATTERN.test(value)
      ) {
        reasons.push("INVALID_CUSTOM_FIELD_ID");
      } else {
        fieldIds.push(value);
      }
    }
    if (new Set(fieldIds).size !== fieldIds.length) {
      reasons.push("DUPLICATE_CUSTOM_FIELD_ID_MAPPING");
    }
    if (!SHA256_PATTERN.test(binding.custom_field_mapping_sha256 || "")) {
      reasons.push("INVALID_MAPPING_HASH");
    } else if (
      await sha256Hex(stableJson(mapping)) !==
        binding.custom_field_mapping_sha256
    ) {
      reasons.push("CUSTOM_FIELD_MAPPING_HASH_MISMATCH");
    }
  }

  const policy = policySnapshotFrom(binding.policy_snapshot);
  if (!policy) reasons.push("INVALID_POLICY_SNAPSHOT");
  if (!SHA256_PATTERN.test(binding.policy_snapshot_sha256 || "")) {
    reasons.push("INVALID_POLICY_HASH");
  } else if (
    await sha256Hex(stableJson(binding.policy_snapshot)) !==
      binding.policy_snapshot_sha256
  ) {
    reasons.push("POLICY_HASH_MISMATCH");
  }
  return [...new Set(reasons)].sort();
}

export function decodeRandom32ByteSecret(
  secret: string,
  label: string,
): Uint8Array<ArrayBuffer> {
  // Exact encoding makes entropy auditable: generate 32 random bytes and store
  // them as 43-character, unpadded base64url after the literal prefix.
  const match = secret.match(/^base64url:([A-Za-z0-9_-]{43})$/);
  if (!match) throw new Error(`${label} must be base64url:<43 chars>`);
  const base64 = match[1].replace(/-/g, "+").replace(/_/g, "/").padEnd(44, "=");
  const decoded = atob(base64);
  if (decoded.length !== 32) {
    throw new Error(`${label} must decode to 32 bytes`);
  }
  const keyBytes = new Uint8Array(32);
  for (let index = 0; index < decoded.length; index += 1) {
    keyBytes[index] = decoded.charCodeAt(index);
  }
  const frequencies = new Map<number, number>();
  for (const byte of keyBytes) {
    frequencies.set(byte, (frequencies.get(byte) || 0) + 1);
  }
  const highestFrequency = Math.max(...frequencies.values());
  // This is not a statistical proof of randomness, but it rejects the common
  // catastrophic placeholders (all-zero/all-same/short repeating patterns).
  // Provisioning still requires a CSPRNG-generated 256-bit value.
  if (frequencies.size < 16 || highestFrequency > 4) {
    throw new Error(
      `${label} is structurally weak; generate 32 random bytes with a CSPRNG`,
    );
  }
  return keyBytes;
}

export function importShadowIdentifierKey(
  secret: string,
): Promise<CryptoKey> {
  let keyBytes: Uint8Array<ArrayBuffer>;
  try {
    keyBytes = decodeRandom32ByteSecret(
      secret,
      "GHL shadow identifier HMAC key",
    );
  } catch (error) {
    return Promise.reject(error);
  }
  return crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function hmacIdentifier(
  key: CryptoKey,
  scope: string,
  raw: string,
): Promise<string> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`ghl-shadow-identifier-v1\n${scope}\n${raw}`),
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeUsPhoneExact(value: unknown): string | null {
  if (typeof value !== "string" || value !== value.trim()) return null;
  // Exact E.164 plus conservative NANP NPA/NXX first-digit rules. Formatting,
  // extensions, letters, Unicode lookalikes, and implicit country codes are
  // never coerced into a consent identity.
  return /^\+1[2-9][0-9]{2}[2-9][0-9]{6}$/.test(value) ? value : null;
}

function exactNonEmptyString(value: unknown, maximum = 8_192): value is string {
  return typeof value === "string" && value.length > 0 &&
    value.length <= maximum &&
    value === value.trim();
}

function mappedFields(
  event: Record<string, unknown>,
  mapping: Record<string, unknown>,
): { values: Partial<Record<SolarConsentField, unknown>>; reasons: string[] } {
  const reasons: string[] = [];
  const values: Partial<Record<SolarConsentField, unknown>> = {};
  if (!Array.isArray(event.customFields)) {
    return { values, reasons: ["MISSING_CUSTOM_FIELDS"] };
  }
  const byId = new Map<string, unknown>();
  for (const entry of event.customFields) {
    if (
      !isRecord(entry) || typeof entry.id !== "string" ||
      !hasOwn(entry, "value")
    ) {
      reasons.push("INVALID_CUSTOM_FIELD_ENTRY");
      continue;
    }
    if (byId.has(entry.id)) reasons.push("DUPLICATE_CUSTOM_FIELD_ENTRY");
    else byId.set(entry.id, entry.value);
  }
  for (const logicalName of REQUIRED_SOLAR_CONSENT_FIELDS) {
    const fieldId = mapping[logicalName];
    if (typeof fieldId !== "string" || !byId.has(fieldId)) {
      reasons.push(`MISSING_${logicalName.toUpperCase()}`);
    } else {
      values[logicalName] = byId.get(fieldId);
    }
  }
  return { values, reasons: [...new Set(reasons)] };
}

export async function evaluateGhlSolarShadowEvent(input: {
  event: Record<string, unknown>;
  binding: GhlShadowBinding;
  payloadSha256: string;
  identifierKey: CryptoKey;
  now?: Date;
}): Promise<GhlShadowEvaluation> {
  const quarantineReasons = await validateGhlShadowBinding(input.binding);
  const holdReasons: string[] = [];
  const event = input.event;
  const eventType = event.type;
  if (
    !["ContactCreate", "ContactUpdate", "ContactDndUpdate"].includes(
      String(eventType),
    )
  ) {
    quarantineReasons.push("UNSUPPORTED_EVENT_TYPE");
  }
  if (event.locationId !== input.binding.ghl_location_id) {
    quarantineReasons.push("LOCATION_BINDING_MISMATCH");
  }
  if (!exactNonEmptyString(event.id, 256)) {
    quarantineReasons.push("MISSING_CONTACT_ID");
  }

  const nowMs = (input.now || new Date()).getTime();
  let sourceTimestampMs: number | null = null;
  let sourceTimestampFresh = false;
  const parsedSourceTimestamp = parseStrictUtcInstant(event.timestamp);
  if (typeof event.timestamp !== "string" || !event.timestamp) {
    holdReasons.push("SOURCE_TIMESTAMP_MISSING");
  } else if (parsedSourceTimestamp === null) {
    holdReasons.push("SOURCE_TIMESTAMP_INVALID");
  } else {
    sourceTimestampMs = parsedSourceTimestamp;
    if (sourceTimestampMs > nowMs + 5 * 60 * 1_000) {
      holdReasons.push("SOURCE_TIMESTAMP_IN_FUTURE");
    } else if (nowMs - sourceTimestampMs > 15 * 60 * 1_000) {
      holdReasons.push("SOURCE_TIMESTAMP_STALE");
    } else {
      sourceTimestampFresh = true;
    }
  }

  const fields = mappedFields(event, input.binding.custom_field_mapping);
  if (
    fields.reasons.some((reason) =>
      reason === "INVALID_CUSTOM_FIELD_ENTRY" ||
      reason === "DUPLICATE_CUSTOM_FIELD_ENTRY"
    )
  ) quarantineReasons.push(...fields.reasons);
  else holdReasons.push(...fields.reasons);

  const policy = policySnapshotFrom(input.binding.policy_snapshot);
  if (!policy) quarantineReasons.push("INVALID_POLICY_SNAPSHOT");

  const consentPhone = normalizeUsPhoneExact(fields.values.consent_phone);
  const currentContactPhone = normalizeUsPhoneExact(event.phone);
  if (!consentPhone) holdReasons.push("INVALID_CONSENT_PHONE");
  if (!currentContactPhone) holdReasons.push("CURRENT_CONTACT_PHONE_UNKNOWN");
  else if (consentPhone && currentContactPhone !== consentPhone) {
    holdReasons.push("CURRENT_PHONE_DOES_NOT_MATCH_CONSENT_PHONE");
  }

  if (!exactNonEmptyString(fields.values.consent_consumer_name, 256)) {
    holdReasons.push("INVALID_CONSENT_CONSUMER_NAME");
  }
  if (!exactNonEmptyString(fields.values.consent_lead_source, 256)) {
    holdReasons.push("INVALID_CONSENT_LEAD_SOURCE");
  } else if (
    policy &&
    !policy.approved_lead_sources.includes(fields.values.consent_lead_source)
  ) {
    holdReasons.push("UNAPPROVED_CONSENT_LEAD_SOURCE");
  }
  if (!exactNonEmptyString(fields.values.consent_seller, 256)) {
    holdReasons.push("INVALID_CONSENT_SELLER");
  } else if (
    policy && fields.values.consent_seller !== policy.seller_legal_name
  ) {
    holdReasons.push("CONSENT_SELLER_MISMATCH");
  }

  if (fields.values.ai_voice_calls_authorized !== true) {
    holdReasons.push(
      typeof fields.values.ai_voice_calls_authorized === "boolean"
        ? "AI_VOICE_CONSENT_NOT_GRANTED"
        : "AI_VOICE_CONSENT_AMBIGUOUS",
    );
  }
  if (fields.values.telemarketing_calls_authorized !== true) {
    holdReasons.push(
      typeof fields.values.telemarketing_calls_authorized === "boolean"
        ? "TELEMARKETING_CONSENT_NOT_GRANTED"
        : "TELEMARKETING_CONSENT_AMBIGUOUS",
    );
  }
  if (fields.values.not_condition_of_purchase_disclosure !== true) {
    holdReasons.push(
      typeof fields.values.not_condition_of_purchase_disclosure === "boolean"
        ? "NOT_CONDITION_DISCLOSURE_NOT_CONFIRMED"
        : "NOT_CONDITION_DISCLOSURE_AMBIGUOUS",
    );
  }
  if (fields.values.consent_revoked_at !== "") {
    holdReasons.push(
      typeof fields.values.consent_revoked_at === "string" &&
        fields.values.consent_revoked_at.length > 0
        ? "CONSENT_REVOKED"
        : "CONSENT_REVOCATION_AMBIGUOUS",
    );
  }

  if (!exactNonEmptyString(fields.values.source_form_version, 128)) {
    holdReasons.push("INVALID_SOURCE_FORM_VERSION");
  } else if (
    policy &&
    !policy.approved_source_form_versions.includes(
      fields.values.source_form_version,
    )
  ) {
    holdReasons.push("UNAPPROVED_SOURCE_FORM_VERSION");
  }
  if (!exactNonEmptyString(fields.values.consent_text_version, 128)) {
    holdReasons.push("INVALID_CONSENT_TEXT_VERSION");
  } else if (
    policy &&
    !policy.approved_consent_text_versions.includes(
      fields.values.consent_text_version,
    )
  ) holdReasons.push("UNAPPROVED_CONSENT_TEXT_VERSION");

  let capturedAtMs: number | null = null;
  const parsedCapturedAt = parseStrictUtcInstant(
    fields.values.consent_captured_at,
  );
  if (
    typeof fields.values.consent_captured_at !== "string" ||
    parsedCapturedAt === null
  ) {
    holdReasons.push("INVALID_CONSENT_CAPTURED_AT");
  } else {
    capturedAtMs = parsedCapturedAt;
    if (capturedAtMs > nowMs + 5 * 60 * 1_000) {
      holdReasons.push("CONSENT_CAPTURED_IN_FUTURE");
    }
    if (
      policy &&
      nowMs - capturedAtMs > policy.maximum_consent_age_days * 86_400_000
    ) holdReasons.push("CONSENT_EVIDENCE_EXPIRED");
  }

  const propertyState = fields.values.property_state;
  const callingState = fields.values.calling_state;
  if (typeof propertyState !== "string" || !US_STATE_CODES.has(propertyState)) {
    quarantineReasons.push("UNKNOWN_PROPERTY_STATE");
  } else if (
    policy && !policy.approved_property_states.includes(propertyState)
  ) {
    holdReasons.push("PROPERTY_STATE_NOT_APPROVED");
  }
  if (typeof callingState !== "string" || !US_STATE_CODES.has(callingState)) {
    quarantineReasons.push("UNKNOWN_CALLING_STATE");
  } else if (policy && !policy.approved_calling_states.includes(callingState)) {
    holdReasons.push("CALLING_STATE_NOT_APPROVED");
  }

  let artifactDisclosureSha256: string | null = null;
  if (!exactNonEmptyString(fields.values.consent_artifact_id, 256)) {
    holdReasons.push("INVALID_CONSENT_ARTIFACT_ID");
  }
  if (!exactNonEmptyString(fields.values.consent_disclosure_text, 32_768)) {
    holdReasons.push("INVALID_CONSENT_DISCLOSURE_TEXT");
  } else {
    artifactDisclosureSha256 = await sha256Hex(
      fields.values.consent_disclosure_text,
    );
  }
  if (policy && exactNonEmptyString(fields.values.consent_artifact_id, 256)) {
    const artifact = policy.approved_consent_artifacts.find((candidate) =>
      candidate.artifact_id === fields.values.consent_artifact_id
    );
    if (!artifact) holdReasons.push("UNAPPROVED_CONSENT_ARTIFACT");
    else if (artifactDisclosureSha256 !== artifact.disclosure_sha256) {
      holdReasons.push("CONSENT_DISCLOSURE_HASH_MISMATCH");
    }
  }
  if (!exactNonEmptyString(fields.values.signature_evidence, 8_192)) {
    holdReasons.push("MISSING_SIGNATURE_EVIDENCE");
  }

  // ContactCreate/ContactUpdate payloads do not prove current call-channel DND
  // state under HighLevel's documented event schemas. Even ContactDndUpdate
  // proves only HighLevel's current DND state; external/state/national/
  // reassigned-number suppression checks remain mandatory at the later
  // provider boundary.
  let ghlDndClear = false;
  if (eventType !== "ContactDndUpdate") {
    holdReasons.push("SUPPRESSION_STATE_UNKNOWN_FOR_EVENT");
  } else {
    const dndSettings = isRecord(event.dndSettings) ? event.dndSettings : null;
    const callDnd = dndSettings && isRecord(dndSettings.Call)
      ? dndSettings.Call
      : null;
    const callStatus = callDnd?.status;
    if (event.dnd !== false) {
      holdReasons.push(
        event.dnd === true
          ? "GHL_GLOBAL_DND_ACTIVE"
          : "GHL_GLOBAL_DND_AMBIGUOUS",
      );
    }
    if (callStatus !== "inactive") {
      holdReasons.push(
        callStatus === "active" || callStatus === "permanent"
          ? "GHL_CALL_DND_ACTIVE"
          : "GHL_CALL_DND_AMBIGUOUS",
      );
    }
    if (!sourceTimestampFresh) holdReasons.push("DND_ORDERING_EVIDENCE_UNSAFE");
    ghlDndClear = event.dnd === false && callStatus === "inactive" &&
      sourceTimestampFresh;
  }
  holdReasons.push("EXTERNAL_SUPPRESSION_EVIDENCE_REQUIRED");

  const organizationScope = `organization:${input.binding.organization_id}`;
  const sourceContactIdentifier = exactNonEmptyString(event.id, 256)
    ? await hmacIdentifier(
      input.identifierKey,
      `${organizationScope}:contact`,
      event.id,
    )
    : null;
  const consentPhoneIdentifier = consentPhone
    ? await hmacIdentifier(
      input.identifierKey,
      `${organizationScope}:consent-phone`,
      consentPhone,
    )
    : null;
  const consumerIdentifier =
    exactNonEmptyString(fields.values.consent_consumer_name, 256)
      ? await hmacIdentifier(
        input.identifierKey,
        `${organizationScope}:consent-consumer`,
        fields.values.consent_consumer_name,
      )
      : null;
  const signatureEvidenceIdentifier =
    exactNonEmptyString(fields.values.signature_evidence, 8_192)
      ? await hmacIdentifier(
        input.identifierKey,
        `${organizationScope}:consent-signature`,
        fields.values.signature_evidence,
      )
      : null;
  const artifactIdentifier =
    exactNonEmptyString(fields.values.consent_artifact_id, 256)
      ? await hmacIdentifier(
        input.identifierKey,
        `${organizationScope}:consent-artifact`,
        fields.values.consent_artifact_id,
      )
      : null;
  const sourceIdentifier =
    exactNonEmptyString(fields.values.consent_lead_source, 256)
      ? await hmacIdentifier(
        input.identifierKey,
        `${organizationScope}:consent-source`,
        fields.values.consent_lead_source,
      )
      : null;

  const uniqueQuarantine = [...new Set(quarantineReasons)].sort();
  const uniqueHold = [...new Set(holdReasons)].sort();
  const decision: GhlShadowDecision = uniqueQuarantine.length > 0
    ? "quarantined"
    : "held";
  const mappedFieldPresence = Object.fromEntries(
    REQUIRED_SOLAR_CONSENT_FIELDS.map((
      field,
    ) => [field, hasOwn(fields.values, field)]),
  );

  return {
    decision,
    reason_codes: [...uniqueQuarantine, ...uniqueHold],
    source_contact_identifier_hmac: sourceContactIdentifier,
    consent_phone_identifier_hmac: consentPhoneIdentifier,
    evidence: {
      schema_version: GHL_SHADOW_SCHEMA_VERSION,
      evidence_scope: "zero_contact_shadow_observation_only",
      payload_sha256: input.payloadSha256,
      event_type: typeof eventType === "string" ? eventType : "invalid",
      mapping_version: input.binding.mapping_version,
      identifier_key_version: input.binding.identifier_key_version,
      mapping_sha256: input.binding.custom_field_mapping_sha256,
      policy_version: input.binding.policy_version,
      policy_sha256: input.binding.policy_snapshot_sha256,
      mapped_field_presence: mappedFieldPresence,
      source_contact_identifier_hmac: sourceContactIdentifier,
      consent_phone_identifier_hmac: consentPhoneIdentifier,
      consent_consumer_identifier_hmac: consumerIdentifier,
      consent_signature_identifier_hmac: signatureEvidenceIdentifier,
      consent_artifact_identifier_hmac: artifactIdentifier,
      consent_source_identifier_hmac: sourceIdentifier,
      consent_disclosure_sha256: artifactDisclosureSha256,
      current_contact_phone_matches_consent_phone: Boolean(
        consentPhone && currentContactPhone &&
          consentPhone === currentContactPhone,
      ),
      current_contact_state_ignored: true,
      current_contact_source_ignored: true,
      exact_boolean_consent_types:
        fields.values.ai_voice_calls_authorized === true &&
        fields.values.telemarketing_calls_authorized === true &&
        fields.values.not_condition_of_purchase_disclosure === true,
      consent_captured_at_valid: capturedAtMs !== null,
      consent_not_revoked: fields.values.consent_revoked_at === "",
      source_timestamp_present: typeof event.timestamp === "string" &&
        event.timestamp.length > 0,
      source_timestamp_valid: sourceTimestampMs !== null,
      source_timestamp_fresh_for_ordering: sourceTimestampFresh,
      source_timestamp_sha256: sourceTimestampMs === null
        ? null
        : await sha256Hex(String(event.timestamp)),
      ghl_dnd_clear_from_contact_dnd_update: ghlDndClear,
      external_suppression_evidence_present: false,
      contact_authorized: false,
      launch_authorized: false,
      external_effects_created: false,
      external_trust_required: true,
    },
    contact_authorized: false,
    launch_authorized: false,
    external_effects_created: false,
  };
}
