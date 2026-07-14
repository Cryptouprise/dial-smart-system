import { createHash } from "node:crypto";

const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CANONICAL_E164_PATTERN = /^\+[1-9][0-9]{7,14}$/;
const CANONICAL_IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7e]{8,512}$/;
const MAX_REPLAY_BINDINGS = 10_000;

type ContactEgressOperation = "place_call" | "send_sms";

export interface PlaceCallInput {
  lead_id: string;
  campaign_id: string;
  idempotency_key: string;
  agent_id?: string;
  telnyx_assistant_id?: string;
  provider?: "retell" | "telnyx";
  from_number?: string;
}

export interface SendSmsInput {
  to_number: string;
  body: string;
  idempotency_key: string;
  from_number?: string;
  lead_id?: string;
}

/**
 * One MCP process is constructed with one immutable API key. The API gateway
 * derives the organization from that key; callers must never be able to
 * self-assert or override it in a tool payload.
 *
 * This bounded process-local registry is an additional replay guard. The
 * server remains authoritative, but an agent cannot accidentally reuse a key
 * for a different campaign, lead, recipient, or message during one session.
 */
const replayBindings = new Map<string, string>();

function requireExactObject(
  value: unknown,
  allowedKeys: ReadonlySet<string>,
  operation: ContactEgressOperation,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${operation} arguments must be a JSON object`);
  }

  const input = value as Record<string, unknown>;
  const unknownKeys = Object.keys(input).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length > 0) {
    throw new Error(
      `${operation} does not accept unknown fields: ${unknownKeys.sort().join(", ")}`,
    );
  }
  return input;
}

function requireCanonicalUuid(value: unknown, field: string): string {
  if (
    typeof value !== "string" ||
    !CANONICAL_UUID_PATTERN.test(value) ||
    value === "00000000-0000-0000-0000-000000000000"
  ) {
    throw new Error(`${field} must be a non-nil canonical lowercase UUID`);
  }
  return value;
}

function requireCanonicalIdempotencyKey(value: unknown): string {
  if (
    typeof value !== "string" ||
    !CANONICAL_IDEMPOTENCY_KEY_PATTERN.test(value)
  ) {
    throw new Error(
      "idempotency_key must be 8-512 printable ASCII characters with no whitespace",
    );
  }
  return value;
}

function requireCanonicalE164(value: unknown, field: string): string {
  if (typeof value !== "string" || !CANONICAL_E164_PATTERN.test(value)) {
    throw new Error(`${field} must be an exact E.164 number`);
  }
  return value;
}

function optionalCanonicalE164(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  return requireCanonicalE164(value, field);
}

function optionalOpaqueId(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 256 ||
    !/^[\x21-\x7e]+$/.test(value)
  ) {
    throw new Error(`${field} must be 1-256 printable ASCII characters with no whitespace`);
  }
  return value;
}

function bindReplay(
  operation: ContactEgressOperation,
  idempotencyKey: string,
  payload: PlaceCallInput | SendSmsInput,
): void {
  const scopedKey = createHash("sha256")
    .update(`${operation}\0${idempotencyKey}`, "utf8")
    .digest("hex");
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(payload), "utf8")
    .digest("hex");
  const previous = replayBindings.get(scopedKey);

  if (previous !== undefined && previous !== fingerprint) {
    throw new Error(
      `idempotency_key is already bound to a different ${operation} payload`,
    );
  }
  if (previous !== undefined) return;

  replayBindings.set(scopedKey, fingerprint);
  if (replayBindings.size > MAX_REPLAY_BINDINGS) {
    const oldest = replayBindings.keys().next().value;
    if (oldest !== undefined) replayBindings.delete(oldest);
  }
}

const PLACE_CALL_KEYS = new Set([
  "lead_id",
  "campaign_id",
  "idempotency_key",
  "agent_id",
  "telnyx_assistant_id",
  "provider",
  "from_number",
]);

export function parseAndBindPlaceCall(value: unknown): PlaceCallInput {
  const input = requireExactObject(value, PLACE_CALL_KEYS, "place_call");
  const leadId = requireCanonicalUuid(input.lead_id, "lead_id");
  const campaignId = requireCanonicalUuid(input.campaign_id, "campaign_id");
  const idempotencyKey = requireCanonicalIdempotencyKey(input.idempotency_key);
  const agentId = optionalOpaqueId(input.agent_id, "agent_id");
  const telnyxAssistantId = optionalOpaqueId(
    input.telnyx_assistant_id,
    "telnyx_assistant_id",
  );
  const fromNumber = optionalCanonicalE164(input.from_number, "from_number");

  if (agentId && telnyxAssistantId) {
    throw new Error("place_call accepts agent_id or telnyx_assistant_id, not both");
  }
  if (
    input.provider !== undefined &&
    input.provider !== "retell" &&
    input.provider !== "telnyx"
  ) {
    throw new Error("provider must be retell or telnyx");
  }
  if (input.provider === "retell" && telnyxAssistantId) {
    throw new Error("provider retell cannot be combined with telnyx_assistant_id");
  }
  if (input.provider === "telnyx" && agentId) {
    throw new Error("provider telnyx cannot be combined with agent_id");
  }

  const payload: PlaceCallInput = {
    lead_id: leadId,
    campaign_id: campaignId,
    idempotency_key: idempotencyKey,
  };
  if (agentId !== undefined) payload.agent_id = agentId;
  if (telnyxAssistantId !== undefined) {
    payload.telnyx_assistant_id = telnyxAssistantId;
  }
  if (input.provider !== undefined) payload.provider = input.provider;
  if (fromNumber !== undefined) payload.from_number = fromNumber;

  bindReplay("place_call", idempotencyKey, payload);
  return payload;
}

const SEND_SMS_KEYS = new Set([
  "to_number",
  "body",
  "idempotency_key",
  "from_number",
  "lead_id",
]);

export function parseAndBindSendSms(value: unknown): SendSmsInput {
  const input = requireExactObject(value, SEND_SMS_KEYS, "send_sms");
  const toNumber = requireCanonicalE164(input.to_number, "to_number");
  const idempotencyKey = requireCanonicalIdempotencyKey(input.idempotency_key);
  if (
    typeof input.body !== "string" ||
    input.body.trim().length === 0 ||
    input.body.length > 1_600 ||
    input.body.includes("\0")
  ) {
    throw new Error("body must be a non-empty SMS message of at most 1600 characters");
  }
  const fromNumber = optionalCanonicalE164(input.from_number, "from_number");
  const leadId =
    input.lead_id === undefined
      ? undefined
      : requireCanonicalUuid(input.lead_id, "lead_id");

  const payload: SendSmsInput = {
    to_number: toNumber,
    body: input.body,
    idempotency_key: idempotencyKey,
  };
  if (fromNumber !== undefined) payload.from_number = fromNumber;
  if (leadId !== undefined) payload.lead_id = leadId;

  bindReplay("send_sms", idempotencyKey, payload);
  return payload;
}
