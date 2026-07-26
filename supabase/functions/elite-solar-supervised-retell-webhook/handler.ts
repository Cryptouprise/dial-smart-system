import { parseBoundedJsonObject } from "../_shared/bounded-json.ts";
import { verifyRetellWebhookSignature } from "../_shared/contact-safety.ts";

export const ELITE_SOLAR_SUPERVISED_RETELL_MAX_BODY_BYTES = 256 * 1024;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$/;
const EVENTS = new Set([
  "call_started",
  "call_ended",
  "call_analyzed",
  "call_failed",
]);

export type EliteSolarSupervisedRetellCallEvent = {
  providerEventKey: string;
  providerCallId: string;
  dispatchId: string;
  testRunId: string;
  event: "call_started" | "call_ended" | "call_analyzed" | "call_failed";
  occurredAt: string;
  payloadSha256: string;
  agentId: string;
  agentVersion: number;
};

export interface EliteSolarSupervisedRetellCallStore {
  recordCallEvent(input: EliteSolarSupervisedRetellCallEvent): Promise<{
    recorded: boolean;
    resultCode: string;
  }>;
}

export interface EliteSolarSupervisedRetellWebhookConfiguration {
  signingKey: string;
  agentId: string;
  agentVersion: number;
  expectedWebhookUrl: string;
  maxClockSkewMs: number;
}

export interface EliteSolarSupervisedRetellWebhookDependencies {
  configuration: EliteSolarSupervisedRetellWebhookConfiguration;
  store: EliteSolarSupervisedRetellCallStore;
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

function reference(value: unknown): string | null {
  const candidate = text(value, 8, 256);
  return candidate && REFERENCE.test(candidate) ? candidate : null;
}

function canonicalHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 12 || value.length > 512) {
    return null;
  }
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" || parsed.username || parsed.password ||
      parsed.search || parsed.hash || value !== value.trim()
    ) return null;
    return parsed.href.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

async function readBoundedBody(request: Request): Promise<Uint8Array> {
  const declared = request.headers.get("content-length");
  if (
    declared !== null &&
    (!/^(?:0|[1-9][0-9]*)$/.test(declared) ||
      Number(declared) > ELITE_SOLAR_SUPERVISED_RETELL_MAX_BODY_BYTES)
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
      if (length > ELITE_SOLAR_SUPERVISED_RETELL_MAX_BODY_BYTES) {
        await reader.cancel("elite_solar_retell_webhook_body_limit");
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

async function sha256Hex(value: Uint8Array): Promise<string> {
  const owned = new Uint8Array(value.byteLength) as Uint8Array<ArrayBuffer>;
  owned.set(value);
  const digest = await crypto.subtle.digest("SHA-256", owned);
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function normalizedEvent(
  rawBody: Uint8Array,
  verificationTimestampMs: number,
  configuration: EliteSolarSupervisedRetellWebhookConfiguration,
): Omit<EliteSolarSupervisedRetellCallEvent, "payloadSha256"> | null {
  let root: Record<string, unknown>;
  try {
    root = parseBoundedJsonObject(
      new TextDecoder("utf-8", { fatal: true }).decode(rawBody),
    );
  } catch {
    return null;
  }
  const event = text(root.event, 8, 32);
  const call = plainObject(root.call);
  const metadata = call && plainObject(call.metadata);
  if (!event || !EVENTS.has(event) || !call || !metadata) return null;
  const providerCallId = reference(call.call_id);
  const callbackAgentId = reference(call.agent_id);
  const dispatchId = uuid(metadata.elite_solar_supervised_test_dispatch_id);
  const testRunId = uuid(metadata.elite_solar_supervised_test_run_id);
  const metadataAgentId = reference(
    metadata.elite_solar_supervised_test_agent_id,
  );
  const metadataAgentVersion =
    typeof metadata.elite_solar_supervised_test_agent_version === "number" &&
      Number.isSafeInteger(metadata.elite_solar_supervised_test_agent_version)
      ? metadata.elite_solar_supervised_test_agent_version
      : null;
  if (
    !providerCallId || !callbackAgentId || !dispatchId || !testRunId ||
    !metadataAgentId || metadataAgentVersion === null ||
    metadata.elite_solar_supervised_test_contract_version !== 1 ||
    callbackAgentId !== configuration.agentId ||
    metadataAgentId !== configuration.agentId ||
    metadataAgentVersion !== configuration.agentVersion
  ) return null;
  const typedEvent = event as EliteSolarSupervisedRetellCallEvent["event"];
  return {
    providerEventKey: `retell:${providerCallId}:${typedEvent}`,
    providerCallId,
    dispatchId,
    testRunId,
    event: typedEvent,
    occurredAt: new Date(verificationTimestampMs).toISOString(),
    agentId: callbackAgentId,
    agentVersion: metadataAgentVersion,
  };
}

function duplicateOrReplay(resultCode: string): boolean {
  return resultCode === "SUPERVISED_TEST_CALL_EVENT_DUPLICATE_OR_REPLAY";
}

/**
 * Narrow Retell lifecycle ingress for calls made only by the supervised test
 * dispatcher. It accepts neither a general agent nor a general callback: the
 * signature, exact configured agent/version, and one dispatch metadata tuple
 * must all bind before one durable receipt RPC is called.
 */
export async function handleEliteSolarSupervisedRetellWebhookRequest(
  request: Request,
  deps: EliteSolarSupervisedRetellWebhookDependencies,
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
  let rawText: string;
  try {
    rawText = new TextDecoder("utf-8", { fatal: true }).decode(rawBody);
  } catch {
    return response(401, {
      accepted: false,
      error_code: "INVALID_RETELL_WEBHOOK",
    });
  }
  const now = (deps.now || (() => new Date()))();
  const verification = await verifyRetellWebhookSignature({
    rawBody: rawText,
    signature: request.headers.get("x-retell-signature"),
    signingKey: deps.configuration.signingKey,
    nowMs: now.getTime(),
    toleranceMs: deps.configuration.maxClockSkewMs,
  });
  if (!verification.valid) {
    return response(401, {
      accepted: false,
      error_code: "INVALID_RETELL_WEBHOOK",
    });
  }
  const event = normalizedEvent(
    rawBody,
    verification.timestampMs,
    deps.configuration,
  );
  if (!event) {
    return response(202, {
      accepted: false,
      error_code: "RETELL_EVENT_HELD",
    });
  }
  try {
    const outcome = await deps.store.recordCallEvent({
      ...event,
      payloadSha256: await sha256Hex(rawBody),
    });
    if (outcome.recorded || duplicateOrReplay(outcome.resultCode)) {
      return response(204);
    }
  } catch {
    // A non-acknowledgement tells Retell to resend a signed callback. Do not
    // log or return the transcript, number, call id, or database detail.
  }
  return response(503, {
    accepted: false,
    error_code: "SUPERVISED_TEST_CALL_RECEIPT_UNAVAILABLE",
  });
}

export function parseEliteSolarSupervisedRetellWebhookConfiguration(
  getEnvironment: (name: string) => string | undefined,
): EliteSolarSupervisedRetellWebhookConfiguration {
  if (
    getEnvironment("ELITE_SOLAR_SUPERVISED_TEST_ENABLED") !== "true" ||
    getEnvironment("ELITE_SOLAR_SUPERVISED_TEST_RETELL_WEBHOOK_ENABLED") !==
      "true"
  ) {
    throw new Error("ELITE_SOLAR_SUPERVISED_RETELL_WEBHOOK_DISABLED");
  }
  const signingKey = text(
    getEnvironment("ELITE_SOLAR_SUPERVISED_TEST_RETELL_WEBHOOK_SIGNING_KEY"),
    32,
    4_096,
  );
  const agentId = reference(
    getEnvironment("ELITE_SOLAR_SUPERVISED_TEST_RETELL_AGENT_ID"),
  );
  const rawVersion = getEnvironment(
    "ELITE_SOLAR_SUPERVISED_TEST_RETELL_AGENT_VERSION",
  );
  const agentVersion = rawVersion && /^(?:0|[1-9]\d{0,6})$/.test(rawVersion)
    ? Number(rawVersion)
    : Number.NaN;
  const supabaseUrl = canonicalHttpsUrl(getEnvironment("SUPABASE_URL"));
  const webhookUrl = canonicalHttpsUrl(
    getEnvironment("ELITE_SOLAR_SUPERVISED_TEST_RETELL_WEBHOOK_URL"),
  );
  const rawSkew = getEnvironment(
    "ELITE_SOLAR_SUPERVISED_TEST_RETELL_MAX_CLOCK_SKEW_SECONDS",
  ) || "300";
  const maxClockSkewSeconds = /^[1-9][0-9]{0,2}$/.test(rawSkew)
    ? Number(rawSkew)
    : Number.NaN;
  const expectedWebhookUrl = supabaseUrl
    ? `${supabaseUrl}/functions/v1/elite-solar-supervised-retell-webhook`
    : null;
  if (
    !signingKey || !agentId || !Number.isSafeInteger(agentVersion) ||
    agentVersion < 0 || !expectedWebhookUrl ||
    webhookUrl !== expectedWebhookUrl ||
    !Number.isSafeInteger(maxClockSkewSeconds) || maxClockSkewSeconds < 30 ||
    maxClockSkewSeconds > 600
  ) {
    throw new Error(
      "ELITE_SOLAR_SUPERVISED_RETELL_WEBHOOK_CONFIGURATION_INVALID",
    );
  }
  return Object.freeze({
    signingKey,
    agentId,
    agentVersion,
    expectedWebhookUrl,
    maxClockSkewMs: maxClockSkewSeconds * 1_000,
  });
}
