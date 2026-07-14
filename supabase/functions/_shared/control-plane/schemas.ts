import { getCommandDefinition } from "./registry.ts";
import type {
  ControlCommandName,
  ControlMode,
  JsonObject,
  JsonValue,
  WireCommandRequestV1,
} from "./types.ts";

const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SAFE_EXTERNAL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const SAFE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SAFE_IDEMPOTENCY_PATTERN = /^[\x21-\x7e]+$/;
const SAFE_SOURCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const IANA_TIMEZONE_PATTERN =
  /^[A-Za-z][A-Za-z0-9._+-]*(?:\/[A-Za-z0-9._+-]+)+$/;

const US_STATES = new Set([
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

const FORBIDDEN_AUTHORITY_KEYS = new Set([
  "userid",
  "organizationid",
  "tenantalias",
  "role",
  "scopes",
  "internal",
  "isservicerole",
  "servicerole",
  "effect",
  "effects",
  "effectid",
  "effectauthority",
  "contactauthorized",
  "launchauthorized",
  "queuemutationauthorized",
  "crmwriteauthorized",
  "spendauthorized",
]);

export const COMMAND_ARG_LIMITS = Object.freeze({
  max_depth: 6,
  max_nodes: 256,
  max_object_keys: 32,
  max_array_length: 32,
  max_key_length: 64,
  max_string_length: 20_000,
});

export class ControlPlaneSchemaError extends Error {
  readonly code: string;
  readonly path: string;

  constructor(code: string, path: string, message: string) {
    super(message);
    this.name = "ControlPlaneSchemaError";
    this.code = code;
    this.path = path;
  }
}

function fail(code: string, path: string, message: string): never {
  throw new ControlPlaneSchemaError(code, path, message);
}

function normalizedAuthorityKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, "");
}

function assertKeyIsNotAuthority(key: string, path: string): void {
  if (FORBIDDEN_AUTHORITY_KEYS.has(normalizedAuthorityKey(key))) {
    fail(
      "WIRE_AUTHORITY_FORBIDDEN",
      path,
      "Wire commands cannot assert identity, tenant, role, scopes, internal state, or effect authority",
    );
  }
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fail("OBJECT_REQUIRED", path, `${path} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return fail(
      "PLAIN_OBJECT_REQUIRED",
      path,
      `${path} must be a plain object`,
    );
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(
  value: Record<string, unknown>,
  path: string,
  allowed: readonly string[],
  required: readonly string[] = [],
): void {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      fail("STRING_KEY_REQUIRED", path, `${path} contains a non-string key`);
    }
    assertKeyIsNotAuthority(key, `${path}.${key}`);
    if (!allowed.includes(key)) {
      fail(
        "UNKNOWN_FIELD",
        `${path}.${key}`,
        `${path} contains an unknown field`,
      );
    }
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      fail("REQUIRED_FIELD", `${path}.${key}`, `${path}.${key} is required`);
    }
  }
}

function assertSafeText(value: string, path: string): void {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (
      code <= 0x1f || (code >= 0x7f && code <= 0x9f) ||
      (code >= 0x200b && code <= 0x200f) ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2060 && code <= 0x206f) || code === 0xfeff
    ) {
      fail(
        "UNSAFE_TEXT",
        path,
        `${path} contains a control, bidirectional, or invisible formatting character`,
      );
    }
  }
}

function cleanString(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
): string {
  if (typeof value !== "string") {
    return fail("STRING_REQUIRED", path, `${path} must be a string`);
  }
  assertSafeText(value, path);
  if (
    value.length < minimum || value.length > maximum || value !== value.trim()
  ) {
    return fail(
      "STRING_BOUNDS",
      path,
      `${path} must be trimmed and contain ${minimum}-${maximum} characters`,
    );
  }
  return value;
}

function integer(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
): number {
  if (
    !Number.isSafeInteger(value) || Number(value) < minimum ||
    Number(value) > maximum
  ) {
    return fail(
      "INTEGER_BOUNDS",
      path,
      `${path} must be an integer between ${minimum} and ${maximum}`,
    );
  }
  return Number(value);
}

function canonicalUuid(value: unknown, path: string): string {
  const uuid = cleanString(value, path, 36, 36);
  if (!CANONICAL_UUID_PATTERN.test(uuid)) {
    return fail(
      "CANONICAL_UUID_REQUIRED",
      path,
      `${path} must be a canonical lowercase UUID`,
    );
  }
  return uuid;
}

function optionalCleanString(
  record: Record<string, unknown>,
  key: string,
  path: string,
  minimum: number,
  maximum: number,
): string | undefined {
  return Object.prototype.hasOwnProperty.call(record, key)
    ? cleanString(record[key], `${path}.${key}`, minimum, maximum)
    : undefined;
}

function optionalCanonicalUuid(
  record: Record<string, unknown>,
  key: string,
  path: string,
): string | undefined {
  return Object.prototype.hasOwnProperty.call(record, key)
    ? canonicalUuid(record[key], `${path}.${key}`)
    : undefined;
}

function exactEnum<T extends string>(
  value: unknown,
  path: string,
  allowed: readonly T[],
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    return fail("ENUM_REQUIRED", path, `${path} is not an allowed value`);
  }
  return value as T;
}

export function parseExactUtcInstant(value: unknown, path: string): string {
  const instant = cleanString(value, path, 20, 24);
  const match = instant.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/,
  );
  if (!match) {
    return fail(
      "UTC_INSTANT_REQUIRED",
      path,
      `${path} must be an exact UTC instant`,
    );
  }
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(
    Number,
  );
  const millisecond = Number((match[7] ?? "").padEnd(3, "0"));
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, millisecond);
  if (
    date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day || date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute || date.getUTCSeconds() !== second ||
    date.getUTCMilliseconds() !== millisecond
  ) {
    return fail(
      "UTC_INSTANT_REQUIRED",
      path,
      `${path} is not a valid UTC instant`,
    );
  }
  return instant;
}

function timezone(value: unknown, path: string): string {
  const result = cleanString(value, path, 3, 128);
  if (!IANA_TIMEZONE_PATTERN.test(result)) {
    return fail(
      "IANA_TIMEZONE_REQUIRED",
      path,
      `${path} must be an IANA timezone`,
    );
  }
  return result;
}

function phone(value: unknown, path: string): string {
  const result = cleanString(value, path, 9, 16);
  if (!/^\+[1-9][0-9]{7,14}$/.test(result)) {
    return fail("E164_REQUIRED", path, `${path} must be exact E.164`);
  }
  return result;
}

function safeSourceId(value: unknown, path: string): string {
  const result = cleanString(value, path, 1, 256);
  if (!SAFE_SOURCE_ID_PATTERN.test(result)) {
    return fail(
      "SAFE_SOURCE_ID_REQUIRED",
      path,
      `${path} contains unsafe characters`,
    );
  }
  return result;
}

/**
 * Apply transport-independent resource limits before command-specific schema
 * validation. This is defense in depth after the raw bounded JSON parser.
 */
export function assertBoundedCommandArgs(
  value: unknown,
): asserts value is JsonObject {
  let nodes = 0;

  const visit = (candidate: unknown, path: string, depth: number): void => {
    if (depth > COMMAND_ARG_LIMITS.max_depth) {
      fail("ARG_DEPTH_LIMIT", path, "Command arguments exceed the depth limit");
    }
    nodes += 1;
    if (nodes > COMMAND_ARG_LIMITS.max_nodes) {
      fail("ARG_NODE_LIMIT", path, "Command arguments exceed the node limit");
    }
    if (candidate === null || typeof candidate === "boolean") return;
    if (typeof candidate === "number") {
      if (!Number.isFinite(candidate)) {
        fail(
          "ARG_NUMBER_INVALID",
          path,
          "Command arguments contain a non-finite number",
        );
      }
      return;
    }
    if (typeof candidate === "string") {
      if (candidate.length > COMMAND_ARG_LIMITS.max_string_length) {
        fail(
          "ARG_STRING_LIMIT",
          path,
          "Command argument string exceeds the limit",
        );
      }
      assertSafeText(candidate, path);
      return;
    }
    if (Array.isArray(candidate)) {
      if (candidate.length > COMMAND_ARG_LIMITS.max_array_length) {
        fail(
          "ARG_ARRAY_LIMIT",
          path,
          "Command argument array exceeds the limit",
        );
      }
      candidate.forEach((item, index) =>
        visit(item, `${path}[${index}]`, depth + 1)
      );
      return;
    }
    const record = asRecord(candidate, path);
    const keys = Reflect.ownKeys(record);
    if (keys.length > COMMAND_ARG_LIMITS.max_object_keys) {
      fail(
        "ARG_OBJECT_LIMIT",
        path,
        "Command argument object exceeds the key limit",
      );
    }
    for (const key of keys) {
      if (typeof key !== "string") {
        fail(
          "STRING_KEY_REQUIRED",
          path,
          "Command arguments contain a non-string key",
        );
      }
      if (key.length === 0 || key.length > COMMAND_ARG_LIMITS.max_key_length) {
        fail(
          "ARG_KEY_LIMIT",
          `${path}.${key}`,
          "Command argument key exceeds the limit",
        );
      }
      assertSafeText(key, `${path}.${key}`);
      assertKeyIsNotAuthority(key, `${path}.${key}`);
      visit(record[key], `${path}.${key}`, depth + 1);
    }
  };

  asRecord(value, "$.command.args");
  visit(value, "$.command.args", 0);
}

function emptyArgs(value: unknown): JsonObject {
  const record = asRecord(value, "$.command.args");
  assertExactKeys(record, "$.command.args", []);
  return {};
}

function systemStatusArgs(value: unknown): JsonObject {
  const record = asRecord(value, "$.command.args");
  assertExactKeys(record, "$.command.args", ["window_hours"]);
  return Object.prototype.hasOwnProperty.call(record, "window_hours")
    ? {
      window_hours: integer(
        record.window_hours,
        "$.command.args.window_hours",
        1,
        168,
      ),
    }
    : {};
}

function campaignListArgs(value: unknown): JsonObject {
  const record = asRecord(value, "$.command.args");
  assertExactKeys(record, "$.command.args", ["status", "limit", "cursor"]);
  const result: JsonObject = {};
  if (Object.prototype.hasOwnProperty.call(record, "status")) {
    result.status = exactEnum(
      record.status,
      "$.command.args.status",
      [
        "draft",
        "active",
        "paused",
        "completed",
      ] as const,
    );
  }
  if (Object.prototype.hasOwnProperty.call(record, "limit")) {
    result.limit = integer(record.limit, "$.command.args.limit", 1, 100);
  }
  if (Object.prototype.hasOwnProperty.call(record, "cursor")) {
    const cursor = cleanString(record.cursor, "$.command.args.cursor", 1, 256);
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) {
      fail(
        "CURSOR_INVALID",
        "$.command.args.cursor",
        "cursor must be base64url-safe",
      );
    }
    result.cursor = cursor;
  }
  return result;
}

function campaignInspectArgs(value: unknown): JsonObject {
  const record = asRecord(value, "$.command.args");
  assertExactKeys(
    record,
    "$.command.args",
    ["campaign_id", "include"],
    ["campaign_id"],
  );
  const result: JsonObject = {
    campaign_id: canonicalUuid(
      record.campaign_id,
      "$.command.args.campaign_id",
    ),
  };
  if (Object.prototype.hasOwnProperty.call(record, "include")) {
    if (!Array.isArray(record.include) || record.include.length > 3) {
      fail(
        "INCLUDE_INVALID",
        "$.command.args.include",
        "include must be a bounded array",
      );
    }
    const include = record.include.map((item, index) =>
      exactEnum(
        item,
        `$.command.args.include[${index}]`,
        [
          "validation",
          "live_stats",
          "dispositions",
        ] as const,
      )
    );
    if (new Set(include).size !== include.length) {
      fail(
        "INCLUDE_DUPLICATE",
        "$.command.args.include",
        "include values must be unique",
      );
    }
    result.include = include;
  }
  return result;
}

function campaignUpsertDraftArgs(value: unknown): JsonObject {
  const record = asRecord(value, "$.command.args");
  const allowed = [
    "campaign_id",
    "name",
    "provider",
    "agent_id",
    "script",
    "calls_per_minute",
    "max_attempts",
    "calling_hours_start",
    "calling_hours_end",
    "timezone",
  ] as const;
  assertExactKeys(record, "$.command.args", allowed, allowed.slice(1));
  const campaignId = optionalCanonicalUuid(
    record,
    "campaign_id",
    "$.command.args",
  );
  const provider = exactEnum(
    record.provider,
    "$.command.args.provider",
    ["retell"] as const,
  );
  const agentId = safeSourceId(record.agent_id, "$.command.args.agent_id");
  const start = cleanString(
    record.calling_hours_start,
    "$.command.args.calling_hours_start",
    5,
    5,
  );
  const end = cleanString(
    record.calling_hours_end,
    "$.command.args.calling_hours_end",
    5,
    5,
  );
  if (
    !/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(start) ||
    !/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(end) || start >= end
  ) {
    fail(
      "CALLING_WINDOW_INVALID",
      "$.command.args.calling_hours_start",
      "calling hours must be a valid same-day start before end",
    );
  }
  return {
    ...(campaignId ? { campaign_id: campaignId } : {}),
    name: cleanString(record.name, "$.command.args.name", 1, 120),
    provider,
    agent_id: agentId,
    script: cleanString(record.script, "$.command.args.script", 1, 20_000),
    calls_per_minute: integer(
      record.calls_per_minute,
      "$.command.args.calls_per_minute",
      1,
      15,
    ),
    max_attempts: integer(
      record.max_attempts,
      "$.command.args.max_attempts",
      1,
      5,
    ),
    calling_hours_start: start,
    calling_hours_end: end,
    timezone: timezone(record.timezone, "$.command.args.timezone"),
  };
}

function leadUpsertArgs(value: unknown): JsonObject {
  const record = asRecord(value, "$.command.args");
  assertExactKeys(
    record,
    "$.command.args",
    [
      "external_source",
      "external_lead_id",
      "phone_e164",
      "first_name",
      "last_name",
      "email",
      "timezone",
      "state",
      "consent_artifact_id",
    ],
    ["external_source", "external_lead_id", "phone_e164"],
  );
  const result: JsonObject = {
    external_source: exactEnum(
      record.external_source,
      "$.command.args.external_source",
      [
        "ghl",
        "zapier",
        "manual",
      ] as const,
    ),
    external_lead_id: safeSourceId(
      record.external_lead_id,
      "$.command.args.external_lead_id",
    ),
    phone_e164: phone(record.phone_e164, "$.command.args.phone_e164"),
  };
  for (const key of ["first_name", "last_name"] as const) {
    const candidate = optionalCleanString(
      record,
      key,
      "$.command.args",
      1,
      120,
    );
    if (candidate !== undefined) result[key] = candidate;
  }
  const email = optionalCleanString(record, "email", "$.command.args", 3, 320);
  if (email !== undefined) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      fail("EMAIL_INVALID", "$.command.args.email", "email is not valid");
    }
    result.email = email;
  }
  if (Object.prototype.hasOwnProperty.call(record, "timezone")) {
    result.timezone = timezone(record.timezone, "$.command.args.timezone");
  }
  if (Object.prototype.hasOwnProperty.call(record, "state")) {
    const state = cleanString(record.state, "$.command.args.state", 2, 2);
    if (!US_STATES.has(state)) {
      fail(
        "STATE_INVALID",
        "$.command.args.state",
        "state must be an uppercase US code",
      );
    }
    result.state = state;
  }
  if (Object.prototype.hasOwnProperty.call(record, "consent_artifact_id")) {
    result.consent_artifact_id = safeSourceId(
      record.consent_artifact_id,
      "$.command.args.consent_artifact_id",
    );
  }
  return result;
}

function campaignPauseArgs(value: unknown): JsonObject {
  const record = asRecord(value, "$.command.args");
  assertExactKeys(record, "$.command.args", ["campaign_id", "reason"], [
    "campaign_id",
    "reason",
  ]);
  return {
    campaign_id: canonicalUuid(
      record.campaign_id,
      "$.command.args.campaign_id",
    ),
    reason: cleanString(record.reason, "$.command.args.reason", 1, 500),
  };
}

function markDncArgs(value: unknown): JsonObject {
  const record = asRecord(value, "$.command.args");
  assertExactKeys(
    record,
    "$.command.args",
    ["lead_id", "reason", "source_event_id"],
    ["lead_id", "reason", "source_event_id"],
  );
  return {
    lead_id: canonicalUuid(record.lead_id, "$.command.args.lead_id"),
    reason: cleanString(record.reason, "$.command.args.reason", 1, 500),
    source_event_id: safeSourceId(
      record.source_event_id,
      "$.command.args.source_event_id",
    ),
  };
}

function stageLeadArgs(value: unknown): JsonObject {
  const record = asRecord(value, "$.command.args");
  assertExactKeys(
    record,
    "$.command.args",
    ["campaign_id", "lead_id", "scheduled_at", "priority"],
    ["campaign_id", "lead_id", "scheduled_at", "priority"],
  );
  return {
    campaign_id: canonicalUuid(
      record.campaign_id,
      "$.command.args.campaign_id",
    ),
    lead_id: canonicalUuid(record.lead_id, "$.command.args.lead_id"),
    scheduled_at: parseExactUtcInstant(
      record.scheduled_at,
      "$.command.args.scheduled_at",
    ),
    priority: integer(record.priority, "$.command.args.priority", 1, 100),
  };
}

function campaignSelectorArgs(value: unknown): JsonObject {
  const record = asRecord(value, "$.command.args");
  assertExactKeys(record, "$.command.args", ["campaign_id"], ["campaign_id"]);
  return {
    campaign_id: canonicalUuid(
      record.campaign_id,
      "$.command.args.campaign_id",
    ),
  };
}

function campaignDispatchArgs(value: unknown): JsonObject {
  const record = asRecord(value, "$.command.args");
  assertExactKeys(record, "$.command.args", ["campaign_id", "max_calls"], [
    "campaign_id",
    "max_calls",
  ]);
  return {
    campaign_id: canonicalUuid(
      record.campaign_id,
      "$.command.args.campaign_id",
    ),
    max_calls: integer(record.max_calls, "$.command.args.max_calls", 1, 5),
  };
}

export function parseCommandArgs(
  name: ControlCommandName,
  value: unknown,
): JsonObject {
  assertBoundedCommandArgs(value);
  switch (name) {
    case "operator.context":
      return emptyArgs(value);
    case "system.status":
      return systemStatusArgs(value);
    case "campaign.list":
      return campaignListArgs(value);
    case "campaign.inspect":
      return campaignInspectArgs(value);
    case "campaign.upsert_draft":
      return campaignUpsertDraftArgs(value);
    case "lead.upsert":
      return leadUpsertArgs(value);
    case "campaign.pause":
      return campaignPauseArgs(value);
    case "lead.mark_dnc":
      return markDncArgs(value);
    case "campaign.stage_lead":
      return stageLeadArgs(value);
    case "campaign.activate":
      return campaignSelectorArgs(value);
    case "campaign.dispatch":
      return campaignDispatchArgs(value);
  }
}

function externalRequestId(value: unknown): string {
  const result = cleanString(value, "$.external_request_id", 8, 256);
  if (!SAFE_EXTERNAL_ID_PATTERN.test(result)) {
    return fail(
      "EXTERNAL_REQUEST_ID_INVALID",
      "$.external_request_id",
      "external_request_id contains unsafe characters",
    );
  }
  return result;
}

function idempotencyKey(value: unknown): string {
  const result = cleanString(value, "$.idempotency_key", 8, 512);
  if (!SAFE_IDEMPOTENCY_PATTERN.test(result)) {
    return fail(
      "IDEMPOTENCY_KEY_INVALID",
      "$.idempotency_key",
      "idempotency_key must use non-space printable ASCII",
    );
  }
  return result;
}

function approvalHandle(value: unknown): string {
  const result = cleanString(value, "$.approval_handle", 43, 43);
  if (!SAFE_TOKEN_PATTERN.test(result)) {
    return fail(
      "APPROVAL_HANDLE_INVALID",
      "$.approval_handle",
      "approval_handle must be a 256-bit unpadded base64url value",
    );
  }
  return result;
}

export function parseWireCommandRequest(value: unknown): WireCommandRequestV1 {
  const record = asRecord(value, "$");
  assertExactKeys(
    record,
    "$",
    [
      "version",
      "external_request_id",
      "source_occurred_at",
      "command",
      "mode",
      "idempotency_key",
      "approval_handle",
    ],
    ["version", "external_request_id", "command", "mode"],
  );
  if (record.version !== "control.command.v1") {
    fail(
      "VERSION_UNSUPPORTED",
      "$.version",
      "Unsupported control command version",
    );
  }

  const commandRecord = asRecord(record.command, "$.command");
  assertExactKeys(commandRecord, "$.command", ["name", "args"], [
    "name",
    "args",
  ]);
  const definition = getCommandDefinition(commandRecord.name);
  const args = parseCommandArgs(definition.name, commandRecord.args);
  const mode = exactEnum(record.mode, "$.mode", ["plan", "execute"] as const);

  const idempotency =
    Object.prototype.hasOwnProperty.call(record, "idempotency_key")
      ? idempotencyKey(record.idempotency_key)
      : undefined;
  const approval =
    Object.prototype.hasOwnProperty.call(record, "approval_handle")
      ? approvalHandle(record.approval_handle)
      : undefined;
  const sourceOccurredAt =
    Object.prototype.hasOwnProperty.call(record, "source_occurred_at")
      ? parseExactUtcInstant(record.source_occurred_at, "$.source_occurred_at")
      : undefined;

  if (definition.risk === "R0" && idempotency !== undefined) {
    fail(
      "R0_IDEMPOTENCY_FORBIDDEN",
      "$.idempotency_key",
      "R0 read commands do not accept mutation idempotency keys",
    );
  }
  if (definition.risk !== "R0" && idempotency === undefined) {
    fail(
      "IDEMPOTENCY_KEY_REQUIRED",
      "$.idempotency_key",
      "Every non-R0 command requires an idempotency_key",
    );
  }
  if (mode === "plan" && approval !== undefined) {
    fail(
      "PLAN_APPROVAL_FORBIDDEN",
      "$.approval_handle",
      "A plan cannot consume an approval handle",
    );
  }
  if (!definition.requires_approval && approval !== undefined) {
    fail(
      "APPROVAL_NOT_ACCEPTED",
      "$.approval_handle",
      "This command does not accept an approval handle",
    );
  }
  if (
    mode === "execute" && definition.requires_approval && approval === undefined
  ) {
    fail(
      "APPROVAL_HANDLE_REQUIRED",
      "$.approval_handle",
      "Execution of this command requires an approval handle",
    );
  }

  const parsed: WireCommandRequestV1 = {
    version: "control.command.v1",
    external_request_id: externalRequestId(record.external_request_id),
    command: { name: definition.name, args },
    mode: mode as ControlMode,
  };
  if (sourceOccurredAt !== undefined) {
    parsed.source_occurred_at = sourceOccurredAt;
  }
  if (idempotency !== undefined) parsed.idempotency_key = idempotency;
  if (approval !== undefined) parsed.approval_handle = approval;
  return parsed;
}

/** Compile-time and runtime reminder that command args remain JSON-only. */
export function asJsonValue(value: JsonValue): JsonValue {
  return value;
}
