import { parseBoundedJsonObject } from "../_shared/bounded-json.ts";

export const ELITE_EMAIL_MAILGUN_MAX_BODY_BYTES = 128 * 1_024;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{7,255}$/;
const DOMAIN =
  /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[A-Za-z]{2,63}$/;
const HMAC_HEX = /^[a-f0-9]{64}$/;
const MAILGUN_TOKEN = /^[a-f0-9]{50}$/;
const EVENT_KINDS: Readonly<
  Record<string, readonly [string, boolean, boolean, boolean]>
> = Object.freeze({
  accepted: ["email_accepted", false, false, false],
  delivered: ["email_delivered", false, false, false],
  opened: ["email_opened", false, false, false],
  clicked: ["link_clicked", false, false, false],
  unsubscribed: ["unsubscribe", true, true, true],
  complained: ["spam_complaint", true, true, true],
});

export type EliteEmailMailgunEventInput = {
  release_id: string;
  organization_id: string;
  user_id: string;
  campaign_id: string;
  provider_account_reference: string;
  sender_domain: string;
  receipt_fingerprint: string;
  recipient_fingerprint: string | null;
  provider_token_fingerprint: string;
  event_kind: string;
  occurred_at: string;
  correlation_status: "recipient_hmac_bound" | "recipient_redacted_or_absent";
  operator_attention_required: boolean;
  suppression_review_required: boolean;
  human_review_required: boolean;
};

export interface EliteEmailMailgunEventStore {
  record(input: EliteEmailMailgunEventInput): Promise<{
    recorded: boolean;
    result_code: string;
  }>;
}

export interface EliteEmailMailgunEventDependencies {
  store: EliteEmailMailgunEventStore;
  signingKey: CryptoKey;
  identifierKey: CryptoKey;
  configuration: {
    releaseId: string;
    organizationId: string;
    userId: string;
    campaignId: string;
    providerAccountReference: string;
    senderDomain: string;
    maxClockSkewSeconds: number;
  };
  now?: () => Date;
}

function noStoreResponse(
  status: number,
  body?: Record<string, unknown>,
): Response {
  if (!body) {
    return new Response(null, {
      status,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function plainObject(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null
    ? value as Record<string, unknown>
    : null;
}

function exactKeys(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> | null {
  const record = plainObject(value);
  if (!record || Object.keys(record).length !== keys.length) return null;
  return keys.every((key) => Object.hasOwn(record, key)) ? record : null;
}

function text(value: unknown, minimum: number, maximum: number): string | null {
  if (
    typeof value !== "string" || value !== value.trim() ||
    value.length < minimum || value.length > maximum
  ) return null;
  for (const character of value) {
    const code = character.codePointAt(0) || 0;
    if (
      code <= 0x1f || (code >= 0x7f && code <= 0x9f) ||
      (code >= 0x200b && code <= 0x200f) ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2060 && code <= 0x206f) || code === 0xfeff
    ) return null;
  }
  return value;
}

function uuid(value: unknown): string | null {
  const candidate = text(value, 36, 36);
  return candidate && UUID.test(candidate) ? candidate : null;
}

function domain(value: unknown): string | null {
  const candidate = text(value, 4, 253)?.toLowerCase();
  return candidate && DOMAIN.test(candidate) ? candidate : null;
}

function reference(value: unknown): string | null {
  const candidate = text(value, 8, 256);
  return candidate && REFERENCE.test(candidate) ? candidate : null;
}

function optionalEmail(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === "[REDACTED]") {
    return null;
  }
  const candidate = text(value, 3, 320)?.toLowerCase();
  return candidate && EMAIL.test(candidate) ? candidate : undefined;
}

function constantTimeHexEqual(left: string, right: string): boolean {
  if (
    !HMAC_HEX.test(left) || !HMAC_HEX.test(right) ||
    left.length !== right.length
  ) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function hmacHex(key: CryptoKey, material: string): Promise<string> {
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(material),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function readBoundedBody(request: Request): Promise<Uint8Array> {
  const declared = request.headers.get("content-length");
  if (
    declared !== null &&
    (!/^(?:0|[1-9][0-9]*)$/.test(declared) ||
      Number(declared) > ELITE_EMAIL_MAILGUN_MAX_BODY_BYTES)
  ) {
    throw new Error("BODY_TOO_LARGE");
  }
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > ELITE_EMAIL_MAILGUN_MAX_BODY_BYTES) {
        await reader.cancel("mailgun_event_body_limit");
        throw new Error("BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

type ParsedMailgunEvent = {
  token: string;
  event: Record<string, unknown>;
};

type NormalizedMailgunEvent =
  & Omit<
    EliteEmailMailgunEventInput,
    | "receipt_fingerprint"
    | "recipient_fingerprint"
    | "provider_token_fingerprint"
  >
  & {
    recipient: string | null;
    eventId: string;
  };

async function parseAndVerifyMailgunEvent(
  rawBody: Uint8Array,
  signingKey: CryptoKey,
  now: Date,
  maxClockSkewSeconds: number,
): Promise<ParsedMailgunEvent | null> {
  let parsed: Record<string, unknown>;
  try {
    parsed = parseBoundedJsonObject(
      new TextDecoder("utf-8", { fatal: true }).decode(rawBody),
    );
  } catch (error) {
    void error;
    return null;
  }
  const envelope = exactKeys(parsed, ["signature", "event-data"]);
  const signature = envelope && plainObject(envelope.signature);
  const event = envelope && plainObject(envelope["event-data"]);
  const signatureKeys = signature && Object.keys(signature);
  const signatureShapeValid = !!signature && !!signatureKeys &&
    signatureKeys.length >= 3 && signatureKeys.length <= 4 &&
    signatureKeys.every((key) =>
      ["timestamp", "token", "signature", "parent-signature"].includes(key)
    ) &&
    ["timestamp", "token", "signature"].every((key) =>
      Object.hasOwn(signature, key)
    );
  const timestamp = signatureShapeValid && signature &&
    text(signature.timestamp, 1, 12);
  const token = signatureShapeValid && signature &&
    text(signature.token, 50, 50)?.toLowerCase();
  const suppliedSignature = signature &&
    text(signature.signature, 64, 64)?.toLowerCase();
  const parentSignature =
    signature && signature["parent-signature"] === undefined
      ? null
      : signature && text(signature["parent-signature"], 64, 64)?.toLowerCase();
  if (
    !event || !timestamp || !/^[0-9]{1,12}$/.test(timestamp) || !token ||
    !MAILGUN_TOKEN.test(token) || !suppliedSignature ||
    !HMAC_HEX.test(suppliedSignature) ||
    (parentSignature !== null &&
      (!parentSignature || !HMAC_HEX.test(parentSignature)))
  ) return null;
  const timestampSeconds = Number(timestamp);
  if (
    !Number.isSafeInteger(timestampSeconds) ||
    Math.abs(now.getTime() / 1_000 - timestampSeconds) > maxClockSkewSeconds
  ) return null;
  const expectedSignature = await hmacHex(signingKey, `${timestamp}${token}`);
  return constantTimeHexEqual(expectedSignature, suppliedSignature)
    ? { token, event }
    : null;
}

function normalizeMailgunEvent(
  event: Record<string, unknown>,
  configuration: EliteEmailMailgunEventDependencies["configuration"],
): NormalizedMailgunEvent | null {
  const account = plainObject(event.account);
  const eventDomain = plainObject(event.domain);
  const accountId = account && reference(account.id);
  const receivedDomain = eventDomain && domain(eventDomain.name);
  const eventType = text(event.event, 3, 32);
  const id = reference(event.id);
  const timestamp = event.timestamp;
  const recipient = optionalEmail(event.recipient);
  if (
    !accountId || !receivedDomain ||
    accountId !== configuration.providerAccountReference ||
    receivedDomain !== configuration.senderDomain || !eventType || !id ||
    typeof timestamp !== "number" || !Number.isFinite(timestamp) ||
    timestamp <= 0 || recipient === undefined
  ) return null;
  let kind = EVENT_KINDS[eventType];
  if (eventType === "failed") {
    const severity = text(event.severity, 7, 9);
    if (severity === "permanent") kind = ["permanent_bounce", true, true, true];
    if (severity === "temporary") {
      kind = ["temporary_delivery_failure", true, false, true];
    }
  }
  if (!kind) return null;
  const occurredAt = new Date(Math.round(timestamp * 1_000));
  if (Number.isNaN(occurredAt.getTime())) return null;
  const correlationStatus = recipient === null
    ? "recipient_redacted_or_absent" as const
    : "recipient_hmac_bound" as const;
  const [eventKind, attention, suppression, review] = kind;
  return {
    release_id: configuration.releaseId,
    organization_id: configuration.organizationId,
    user_id: configuration.userId,
    campaign_id: configuration.campaignId,
    provider_account_reference: configuration.providerAccountReference,
    sender_domain: configuration.senderDomain,
    event_kind: eventKind,
    occurred_at: occurredAt.toISOString(),
    correlation_status: correlationStatus,
    operator_attention_required: attention || recipient === null,
    suppression_review_required: suppression,
    human_review_required: review || recipient === null,
    recipient,
    eventId: id,
  };
}

/**
 * Public Mailgun event ingress. It validates the provider HMAC over timestamp
 * and token, constrains the request to one server-owned release/account/domain,
 * hashes identifiers in memory, and records only the redacted receipt. It does
 * not send, import, mutate suppressions, or expose provider data.
 */
export async function handleEliteEmailMailgunEventRequest(
  request: Request,
  deps: EliteEmailMailgunEventDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return noStoreResponse(405, {
      accepted: false,
      error_code: "METHOD_NOT_ALLOWED",
    });
  }
  if (
    !request.headers.get("content-type")?.toLowerCase().startsWith(
      "application/json",
    )
  ) {
    return noStoreResponse(415, {
      accepted: false,
      error_code: "APPLICATION_JSON_REQUIRED",
    });
  }
  let rawBody: Uint8Array;
  try {
    rawBody = await readBoundedBody(request);
  } catch {
    return noStoreResponse(413, {
      accepted: false,
      error_code: "BODY_TOO_LARGE",
    });
  }
  const verified = await parseAndVerifyMailgunEvent(
    rawBody,
    deps.signingKey,
    (deps.now || (() => new Date()))(),
    deps.configuration.maxClockSkewSeconds,
  );
  if (!verified) {
    return noStoreResponse(401, {
      accepted: false,
      error_code: "INVALID_MAILGUN_WEBHOOK",
    });
  }
  const normalized = normalizeMailgunEvent(verified.event, deps.configuration);
  if (!normalized) {
    return noStoreResponse(202, {
      accepted: false,
      error_code: "MAILGUN_EVENT_HELD",
    });
  }
  const { recipient, eventId, ...input } = normalized;
  const receiptFingerprint = `hmac-sha256:${await hmacHex(
    deps.identifierKey,
    `receipt|mailgun|${deps.configuration.organizationId}|${deps.configuration.campaignId}|${eventId}`,
  )}`;
  const providerTokenFingerprint = `hmac-sha256:${await hmacHex(
    deps.identifierKey,
    `mailgun-token|${deps.configuration.organizationId}|${verified.token}`,
  )}`;
  const recipientFingerprint = recipient === null
    ? null
    : `hmac-sha256:${await hmacHex(
      deps.identifierKey,
      `recipient|${deps.configuration.organizationId}|${recipient}`,
    )}`;
  try {
    const outcome = await deps.store.record({
      ...input,
      receipt_fingerprint: receiptFingerprint,
      recipient_fingerprint: recipientFingerprint,
      provider_token_fingerprint: providerTokenFingerprint,
    });
    // A duplicate/replay is already durably rejected by the database unique
    // constraints; acknowledge it to prevent a provider retry loop.
    if (
      outcome.recorded ||
      outcome.result_code === "EMAIL_EVENT_DUPLICATE_OR_REPLAY"
    ) return noStoreResponse(204);
    return noStoreResponse(503, {
      accepted: false,
      error_code: "EMAIL_EVENT_RECEIPT_HELD",
    });
  } catch {
    return noStoreResponse(503, {
      accepted: false,
      error_code: "EMAIL_EVENT_RECEIPT_COMMIT_FAILED",
    });
  }
}

export function importEliteEmailMailgunHmacKey(
  value: string,
): Promise<CryptoKey> {
  if (
    typeof value !== "string" || value.length < 32 || value.length > 4_096 ||
    [...value].some((character) => {
      const code = character.codePointAt(0) || 0;
      return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
    })
  ) {
    throw new Error("ELITE_EMAIL_MAILGUN_HMAC_KEY_INVALID");
  }
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(value),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

export function parseEliteEmailMailgunEventConfiguration(
  getEnvironment: (name: string) => string | undefined,
): EliteEmailMailgunEventDependencies["configuration"] {
  if (getEnvironment("ELITE_EMAIL_MAILGUN_EVENTS_ENABLED") !== "true") {
    throw new Error("ELITE_EMAIL_MAILGUN_EVENTS_DISABLED");
  }
  const releaseId = uuid(
    getEnvironment("ELITE_EMAIL_MAILGUN_EVENTS_RELEASE_ID"),
  );
  const organizationId = uuid(
    getEnvironment("ELITE_EMAIL_MAILGUN_EVENTS_ORGANIZATION_ID"),
  );
  const userId = uuid(getEnvironment("ELITE_EMAIL_MAILGUN_EVENTS_USER_ID"));
  const campaignId = uuid(
    getEnvironment("ELITE_EMAIL_MAILGUN_EVENTS_CAMPAIGN_ID"),
  );
  const providerAccountReference = reference(
    getEnvironment("ELITE_EMAIL_MAILGUN_EVENTS_ACCOUNT_REFERENCE"),
  );
  const senderDomain = domain(
    getEnvironment("ELITE_EMAIL_MAILGUN_EVENTS_SENDER_DOMAIN"),
  );
  const skew =
    getEnvironment("ELITE_EMAIL_MAILGUN_EVENTS_MAX_CLOCK_SKEW_SECONDS") ||
    "86400";
  const maxClockSkewSeconds = /^[0-9]{2,7}$/.test(skew) ? Number(skew) : NaN;
  if (
    !releaseId || !organizationId || !userId || !campaignId ||
    !providerAccountReference || !senderDomain ||
    !Number.isSafeInteger(maxClockSkewSeconds) || maxClockSkewSeconds < 60 ||
    maxClockSkewSeconds > 604_800
  ) {
    throw new Error("ELITE_EMAIL_MAILGUN_EVENTS_CONFIGURATION_INVALID");
  }
  return Object.freeze({
    releaseId,
    organizationId,
    userId,
    campaignId,
    providerAccountReference,
    senderDomain,
    maxClockSkewSeconds,
  });
}
