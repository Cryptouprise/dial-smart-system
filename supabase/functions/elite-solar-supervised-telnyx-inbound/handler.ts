import { parseBoundedJsonObject } from "../_shared/bounded-json.ts";

export const ELITE_SOLAR_SUPERVISED_TELNYX_MAX_BODY_BYTES = 64 * 1024;

const E164 = /^\+[1-9]\d{7,14}$/;
const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$/;
const BASE64 =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export type EliteSolarSupervisedTelnyxReply = {
  providerEventId: string;
  providerMessageId: string;
  payloadSha256: string;
  occurredAt: string;
  fromE164: string;
  toE164: string;
  messageText: string;
  messagingProfileId: string;
};

export interface EliteSolarSupervisedTelnyxReplyStore {
  recordReply(input: EliteSolarSupervisedTelnyxReply): Promise<{
    recorded: boolean;
    resultCode: string;
  }>;
}

export interface EliteSolarSupervisedTelnyxInboundConfiguration {
  publicKey: CryptoKey;
  messagingProfileId: string;
  maxClockSkewSeconds: number;
}

export interface EliteSolarSupervisedTelnyxInboundDependencies {
  configuration: EliteSolarSupervisedTelnyxInboundConfiguration;
  store: EliteSolarSupervisedTelnyxReplyStore;
  now?: () => Date;
}

function response(
  status: number,
  body?: Record<string, unknown>,
): Response {
  return new Response(body ? JSON.stringify(body) : null, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function plainObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown, minimum: number, maximum: number): string | null {
  if (
    typeof value !== "string" || value !== value.trim() ||
    value.length < minimum || value.length > maximum
  ) return null;
  for (const character of value) {
    const code = character.codePointAt(0) || 0;
    if (
      code === 0 || (code >= 0x7f && code <= 0x9f) ||
      (code >= 0x200b && code <= 0x200f) ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2060 && code <= 0x206f) || code === 0xfeff
    ) return null;
  }
  return value;
}

function reference(value: unknown): string | null {
  const candidate = text(value, 8, 256);
  return candidate && REFERENCE.test(candidate) ? candidate : null;
}

function phone(value: unknown): string | null {
  const candidate = text(value, 8, 16);
  return candidate && E164.test(candidate) ? candidate : null;
}

function endpointPhone(value: unknown): string | null {
  const direct = phone(value);
  if (direct) return direct;
  const record = plainObject(value);
  return record ? phone(record.phone_number) : null;
}

function inboundDestination(value: unknown): string | null {
  if (Array.isArray(value)) {
    return value.length === 1 ? endpointPhone(value[0]) : null;
  }
  return endpointPhone(value);
}

function isoTime(value: unknown): string | null {
  const candidate = text(value, 20, 40);
  const parsed = candidate ? Date.parse(candidate) : Number.NaN;
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function replyText(value: unknown, media: unknown): string | null {
  if (typeof value === "string" && value.length >= 1 && value.length <= 4_096) {
    // A human reply such as " yes " must still stop the sequence. Preserve
    // its original text for the handoff, but reject unsafe control values.
    if (value.trim().length > 0) {
      for (const character of value) {
        const code = character.codePointAt(0) || 0;
        if (
          code === 0 || (code >= 0x7f && code <= 0x9f) ||
          (code >= 0x200b && code <= 0x200f) ||
          (code >= 0x202a && code <= 0x202e) ||
          (code >= 0x2060 && code <= 0x206f) || code === 0xfeff
        ) return null;
      }
      return value;
    }
  }
  // A media-only inbound MMS is still a reply. Keep the binary/media URL out
  // of the receipt, but use a fixed marker so it stops the sequence and opens
  // the human handoff instead of silently allowing another outbound step.
  return Array.isArray(media) && media.length > 0 ? "[MEDIA_ONLY_REPLY]" : null;
}

function base64Bytes(value: string): Uint8Array | null {
  if (!BASE64.test(value)) return null;
  try {
    const decoded = atob(value);
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index += 1) {
      bytes[index] = decoded.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

function ownedBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const owned = new Uint8Array(value.byteLength) as Uint8Array<ArrayBuffer>;
  owned.set(value);
  return owned;
}

function joinedBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const result = new Uint8Array(left.byteLength + right.byteLength);
  result.set(left, 0);
  result.set(right, left.byteLength);
  return result;
}

async function readBoundedBody(request: Request): Promise<Uint8Array> {
  const declared = request.headers.get("content-length");
  if (
    declared !== null &&
    (!/^(?:0|[1-9][0-9]*)$/.test(declared) ||
      Number(declared) > ELITE_SOLAR_SUPERVISED_TELNYX_MAX_BODY_BYTES)
  ) throw new Error("BODY_TOO_LARGE");
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > ELITE_SOLAR_SUPERVISED_TELNYX_MAX_BODY_BYTES) {
        await reader.cancel("elite_solar_telnyx_inbound_body_limit");
        throw new Error("BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const raw = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    raw.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return raw;
}

function timestampSeconds(
  value: string | null,
  now: Date,
  maxClockSkewSeconds: number,
): number | null {
  if (!value || !/^[0-9]{10}$/.test(value)) return null;
  const seconds = Number(value);
  if (!Number.isSafeInteger(seconds)) return null;
  const nowSeconds = Math.floor(now.getTime() / 1_000);
  return Math.abs(nowSeconds - seconds) <= maxClockSkewSeconds ? seconds : null;
}

async function verifyTelnyxSignature(
  rawBody: Uint8Array,
  timestamp: string,
  signature: string | null,
  publicKey: CryptoKey,
): Promise<boolean> {
  const signatureBytes = signature ? base64Bytes(signature) : null;
  if (!signatureBytes || signatureBytes.byteLength !== 64) return false;
  const signed = joinedBytes(
    new TextEncoder().encode(`${timestamp}|`),
    rawBody,
  );
  try {
    return await crypto.subtle.verify(
      "Ed25519",
      publicKey,
      ownedBytes(signatureBytes),
      ownedBytes(signed),
    );
  } catch {
    return false;
  }
}

async function sha256Hex(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", ownedBytes(value));
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function normalizeInboundReply(
  rawBody: Uint8Array,
  expectedMessagingProfileId: string,
): Omit<EliteSolarSupervisedTelnyxReply, "payloadSha256"> | null {
  let root: Record<string, unknown>;
  try {
    root = parseBoundedJsonObject(
      new TextDecoder("utf-8", { fatal: true }).decode(rawBody),
    );
  } catch {
    return null;
  }
  const data = plainObject(root.data);
  const payload = data && plainObject(data.payload);
  if (
    !data || !payload || data.event_type !== "message.received" ||
    payload.direction !== "inbound"
  ) return null;
  const providerEventId = reference(data.id);
  const providerMessageId = reference(payload.id);
  const fromE164 = endpointPhone(payload.from);
  const toE164 = inboundDestination(payload.to);
  const messageText = replyText(payload.text, payload.media);
  const messagingProfileId = reference(payload.messaging_profile_id);
  const eventOccurredAt = isoTime(data.occurred_at);
  if (
    !providerEventId || !providerMessageId || !fromE164 || !toE164 ||
    !messageText || !messagingProfileId || !eventOccurredAt ||
    messagingProfileId !== expectedMessagingProfileId
  ) return null;
  return {
    providerEventId,
    providerMessageId,
    // Telnyx event time orders deliveries; the independently signed request
    // timestamp remains the narrow replay fence above.
    occurredAt: eventOccurredAt,
    fromE164,
    toE164,
    messageText,
    messagingProfileId,
  };
}

function duplicateOrReplay(resultCode: string): boolean {
  return resultCode === "SUPERVISED_TEST_REPLY_DUPLICATE_OR_REPLAY";
}

/**
 * Public Telnyx ingress for one server-armed supervised test only. It verifies
 * an Ed25519 signature over the exact raw bytes before parsing JSON, then
 * delegates receipt dedupe, test-sequence cancellation, and human handoff to
 * a single transactional RPC. It never calls a provider or sends a message.
 */
export async function handleEliteSolarSupervisedTelnyxInboundRequest(
  request: Request,
  deps: EliteSolarSupervisedTelnyxInboundDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return response(405, { accepted: false, error_code: "METHOD_NOT_ALLOWED" });
  }
  if (
    new URL(request.url).search ||
    !request.headers.get("content-type")?.toLowerCase().startsWith(
      "application/json",
    )
  ) {
    return response(400, { accepted: false, error_code: "INVALID_REQUEST" });
  }
  let rawBody: Uint8Array;
  try {
    rawBody = await readBoundedBody(request);
  } catch {
    return response(413, { accepted: false, error_code: "BODY_TOO_LARGE" });
  }
  const now = (deps.now || (() => new Date()))();
  const timestamp = timestampSeconds(
    request.headers.get("telnyx-timestamp"),
    now,
    deps.configuration.maxClockSkewSeconds,
  );
  if (
    timestamp === null || !await verifyTelnyxSignature(
      rawBody,
      String(request.headers.get("telnyx-timestamp")),
      request.headers.get("telnyx-signature-ed25519"),
      deps.configuration.publicKey,
    )
  ) {
    return response(401, {
      accepted: false,
      error_code: "INVALID_TELNYX_WEBHOOK",
    });
  }
  const reply = normalizeInboundReply(
    rawBody,
    deps.configuration.messagingProfileId,
  );
  if (!reply) {
    return response(202, {
      accepted: false,
      error_code: "TELNYX_EVENT_HELD",
    });
  }
  try {
    const outcome = await deps.store.recordReply({
      ...reply,
      payloadSha256: await sha256Hex(rawBody),
    });
    if (outcome.recorded || duplicateOrReplay(outcome.resultCode)) {
      return response(204);
    }
  } catch {
    // A non-acknowledgement lets Telnyx retry a signed delivery; do not report
    // any contact, provider, or database detail to the caller.
  }
  return response(503, {
    accepted: false,
    error_code: "SUPERVISED_TEST_REPLY_RECEIPT_UNAVAILABLE",
  });
}

export async function importEliteSolarSupervisedTelnyxPublicKey(
  value: string,
): Promise<CryptoKey> {
  const decoded = typeof value === "string" ? base64Bytes(value) : null;
  if (!decoded || decoded.byteLength !== 32) {
    throw new Error("ELITE_SOLAR_SUPERVISED_TELNYX_PUBLIC_KEY_INVALID");
  }
  try {
    return await crypto.subtle.importKey(
      "raw",
      ownedBytes(decoded),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
  } catch {
    throw new Error("ELITE_SOLAR_SUPERVISED_TELNYX_PUBLIC_KEY_INVALID");
  }
}

export async function parseEliteSolarSupervisedTelnyxInboundConfiguration(
  getEnvironment: (name: string) => string | undefined,
): Promise<EliteSolarSupervisedTelnyxInboundConfiguration> {
  if (
    getEnvironment("ELITE_SOLAR_SUPERVISED_TEST_ENABLED") !== "true" ||
    getEnvironment("ELITE_SOLAR_SUPERVISED_TEST_TELNYX_INBOUND_ENABLED") !==
      "true"
  ) {
    throw new Error("ELITE_SOLAR_SUPERVISED_TELNYX_INBOUND_DISABLED");
  }
  const profile = reference(
    getEnvironment("ELITE_SOLAR_SUPERVISED_TEST_TELNYX_MESSAGING_PROFILE_ID"),
  );
  const publicKey = getEnvironment(
    "ELITE_SOLAR_SUPERVISED_TEST_TELNYX_PUBLIC_KEY_BASE64",
  );
  const rawSkew = getEnvironment(
    "ELITE_SOLAR_SUPERVISED_TEST_TELNYX_MAX_CLOCK_SKEW_SECONDS",
  ) || "300";
  const maxClockSkewSeconds = /^[1-9][0-9]{0,2}$/.test(rawSkew)
    ? Number(rawSkew)
    : Number.NaN;
  if (
    !profile || !publicKey || !Number.isSafeInteger(maxClockSkewSeconds) ||
    maxClockSkewSeconds < 30 || maxClockSkewSeconds > 600
  ) {
    throw new Error(
      "ELITE_SOLAR_SUPERVISED_TELNYX_INBOUND_CONFIGURATION_INVALID",
    );
  }
  return Object.freeze({
    publicKey: await importEliteSolarSupervisedTelnyxPublicKey(publicKey),
    messagingProfileId: profile,
    maxClockSkewSeconds,
  });
}
