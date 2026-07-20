import {
  authorizeCommand,
  OBSERVER_AUTHORITY,
} from "../_shared/control-plane/authorization.ts";
import { canonicalJson } from "../_shared/control-plane/canonical-json.ts";
import { parseWireCommandRequest } from "../_shared/control-plane/schemas.ts";
import type {
  AuthorizedCommandIdentity,
  ControlCommandName,
  JsonValue,
  ObserverControlResult,
  WireCommandRequestV1,
} from "../_shared/control-plane/types.ts";
import {
  BoundedJsonError,
  parseBoundedJsonObject,
} from "../_shared/bounded-json.ts";
import {
  extractZapierApiKeyCredential,
  normalizeResolvedZapierIdentity,
  ZapierObserverAuthError,
} from "./auth.ts";

export const ZAPIER_OBSERVER_MAX_BODY_BYTES = 16 * 1024;
export const ZAPIER_OBSERVER_MAX_RESULT_BYTES = 32 * 1024;

const JSON_HEADERS = Object.freeze({
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
});
const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const R0_OBSERVER_COMMANDS = new Set<ControlCommandName>([
  "operator.context",
  "system.status",
  "elite.solar_brief",
  "campaign.list",
  "campaign.inspect",
]);
const BODY_JSON_LIMITS = Object.freeze({
  maxDepth: 8,
  maxNodes: 256,
  maxObjectKeys: 32,
  maxArrayLength: 32,
  maxStringLength: 20_000,
});
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export interface ZapierObserverCommandSubmission {
  channel: "zapier";
  identity: AuthorizedCommandIdentity;
  raw_payload_sha256: string;
  request: WireCommandRequestV1;
}

export interface ZapierObserverHandlerDependencies {
  enabled: boolean;
  /** Resolves the API key to active installation, principal, user, and org. */
  resolveServerIdentity: (credential: string) => Promise<unknown | null>;
  submitObserverCommand: (
    submission: ZapierObserverCommandSubmission,
  ) => Promise<ObserverControlResult>;
}

class ZapierBodyError extends Error {
  readonly code: "body_too_large" | "invalid_body";

  constructor(code: "body_too_large" | "invalid_body") {
    super(code);
    this.name = "ZapierBodyError";
    this.code = code;
  }
}

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(
    JSON.stringify({ ...body, authority: OBSERVER_AUTHORITY }),
    {
      status,
      headers: { ...JSON_HEADERS, ...extraHeaders },
    },
  );
}

/** Hard-lock response used before request, secret, database, or network access. */
export function zapierObserverDisabledResponse(): Response {
  return jsonResponse(503, {
    ok: false,
    error_code: "ZAPIER_OBSERVER_LAUNCH_DISABLED",
    message:
      "Zapier observer control is launch-disabled until credential provisioning, tenant binding, and durable receipts are deployed and certified.",
  }, { "Retry-After": "3600" });
}

function acceptsStrictJson(contentType: string | null): boolean {
  if (contentType === null) return false;
  return /^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?$/i
    .test(contentType.trim());
}

function bodyMetadataError(request: Request): ZapierBodyError | null {
  const contentEncoding = request.headers.get("content-encoding");
  if (
    contentEncoding !== null && contentEncoding.toLowerCase() !== "identity"
  ) {
    return new ZapierBodyError("invalid_body");
  }
  const contentLength = request.headers.get("content-length");
  if (contentLength === null) return null;
  if (!/^(?:0|[1-9][0-9]*)$/.test(contentLength)) {
    return new ZapierBodyError("invalid_body");
  }
  return Number(contentLength) > ZAPIER_OBSERVER_MAX_BODY_BYTES
    ? new ZapierBodyError("body_too_large")
    : null;
}

async function readBoundedBody(request: Request): Promise<Uint8Array> {
  const metadataError = bodyMetadataError(request);
  if (metadataError) throw metadataError;
  if (request.body === null) throw new ZapierBodyError("invalid_body");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > ZAPIER_OBSERVER_MAX_BODY_BYTES) {
        await reader.cancel("body_too_large");
        throw new ZapierBodyError("body_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (total === 0) throw new ZapierBodyError("invalid_body");

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const owned = new Uint8Array(bytes.byteLength);
  owned.set(bytes);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", owned));
  return [...digest]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function parseBody(bytes: Uint8Array): WireCommandRequestV1 {
  let text: string;
  try {
    text = decoder.decode(bytes);
  } catch {
    throw new ZapierBodyError("invalid_body");
  }
  try {
    return parseWireCommandRequest(
      parseBoundedJsonObject(text, BODY_JSON_LIMITS),
    );
  } catch (error) {
    if (error instanceof BoundedJsonError) {
      throw new ZapierBodyError("invalid_body");
    }
    throw error;
  }
}

function cloneBoundedJson(
  value: unknown,
  state = { depth: 0, nodes: 0 },
  seen = new WeakSet<object>(),
): JsonValue {
  state.nodes += 1;
  if (state.nodes > 512 || state.depth > 8) {
    throw new Error("result_limit");
  }
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length <= 32_768) return value;
  if (!value || typeof value !== "object" || seen.has(value)) {
    throw new Error("invalid_result");
  }

  seen.add(value);
  state.depth += 1;
  try {
    if (Array.isArray(value)) {
      if (value.length > 256) throw new Error("result_limit");
      return value.map((item) => cloneBoundedJson(item, state, seen));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("invalid_result");
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.length > 128) throw new Error("result_limit");
    const clone: Record<string, JsonValue> = Object.create(null);
    for (const key of keys.sort()) {
      if (key.length === 0 || key.length > 256) {
        throw new Error("invalid_result");
      }
      clone[key] = cloneBoundedJson(record[key], state, seen);
    }
    return clone;
  } finally {
    state.depth -= 1;
    seen.delete(value);
  }
}

function normalizeObserverResult(
  result: unknown,
  expectedCommand: ControlCommandName,
): ObserverControlResult {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("invalid_result");
  }
  const record = result as Record<string, unknown>;
  const authority = record.authority;
  if (
    record.version !== "control.result.v1" ||
    record.profile !== "observer" ||
    !CANONICAL_UUID_PATTERN.test(String(record.command_id ?? "")) ||
    record.command_name !== expectedCommand ||
    !["completed", "held", "failed"].includes(String(record.status ?? "")) ||
    !authority || typeof authority !== "object" || Array.isArray(authority)
  ) {
    throw new Error("invalid_result");
  }
  const authorityRecord = authority as Record<string, unknown>;
  if (
    authorityRecord.contact_authorized !== false ||
    authorityRecord.launch_authorized !== false ||
    authorityRecord.queue_mutation_authorized !== false ||
    authorityRecord.crm_write_authorized !== false ||
    authorityRecord.spend_authorized !== false
  ) {
    throw new Error("invalid_authority");
  }
  const data = cloneBoundedJson(record.data);
  if (
    encoder.encode(canonicalJson(data)).byteLength >
      ZAPIER_OBSERVER_MAX_RESULT_BYTES
  ) {
    throw new Error("result_limit");
  }
  return {
    version: "control.result.v1",
    profile: "observer",
    command_id: String(record.command_id),
    command_name: expectedCommand,
    status: record.status as ObserverControlResult["status"],
    authority: OBSERVER_AUTHORITY,
    data,
  };
}

/**
 * Authenticate and translate one Zapier action into the shared R0 contract.
 * The only I/O is through the injected server identity resolver and durable
 * submitter. This function never calls a provider, CRM, queue, AI model, or
 * callback URL.
 */
export async function handleZapierObserverRequest(
  request: Request,
  deps: ZapierObserverHandlerDependencies,
): Promise<Response> {
  if (!deps.enabled) return zapierObserverDisabledResponse();

  if (request.method !== "POST") {
    return jsonResponse(405, {
      ok: false,
      error_code: "METHOD_NOT_ALLOWED",
    }, { Allow: "POST" });
  }
  const url = new URL(request.url);
  if (url.search !== "") {
    return jsonResponse(400, {
      ok: false,
      error_code: "QUERY_PARAMETERS_FORBIDDEN",
    });
  }
  if (!acceptsStrictJson(request.headers.get("content-type"))) {
    return jsonResponse(415, {
      ok: false,
      error_code: "JSON_CONTENT_TYPE_REQUIRED",
    });
  }
  const metadataError = bodyMetadataError(request);
  if (metadataError) {
    return jsonResponse(
      metadataError.code === "body_too_large" ? 413 : 400,
      { ok: false, error_code: "INVALID_REQUEST_BODY" },
    );
  }

  let credential: string;
  try {
    credential = extractZapierApiKeyCredential(
      request.headers.get("authorization"),
    );
  } catch (error) {
    if (!(error instanceof ZapierObserverAuthError)) throw error;
    return jsonResponse(401, {
      ok: false,
      error_code: "ZAPIER_AUTHENTICATION_FAILED",
    }, { "WWW-Authenticate": 'Bearer realm="dial-smart-zapier-observer"' });
  }

  let identity: AuthorizedCommandIdentity;
  try {
    const resolved = await deps.resolveServerIdentity(credential);
    if (resolved === null) {
      return jsonResponse(401, {
        ok: false,
        error_code: "ZAPIER_AUTHENTICATION_FAILED",
      }, { "WWW-Authenticate": 'Bearer realm="dial-smart-zapier-observer"' });
    }
    identity = normalizeResolvedZapierIdentity(resolved);
  } catch {
    return jsonResponse(503, {
      ok: false,
      error_code: "ZAPIER_IDENTITY_RESOLUTION_UNAVAILABLE",
    });
  }

  let rawBody: Uint8Array;
  let wireRequest: WireCommandRequestV1;
  try {
    rawBody = await readBoundedBody(request);
    wireRequest = parseBody(rawBody);
  } catch (error) {
    return jsonResponse(
      error instanceof ZapierBodyError && error.code === "body_too_large"
        ? 413
        : 400,
      { ok: false, error_code: "INVALID_REQUEST_BODY" },
    );
  }

  if (
    wireRequest.mode !== "plan" ||
    !R0_OBSERVER_COMMANDS.has(wireRequest.command.name)
  ) {
    return jsonResponse(403, {
      ok: false,
      error_code: "OBSERVER_COMMAND_FORBIDDEN",
    });
  }
  if (wireRequest.source_occurred_at === undefined) {
    return jsonResponse(400, {
      ok: false,
      error_code: "ZAPIER_SOURCE_TIME_REQUIRED",
    });
  }
  try {
    authorizeCommand(wireRequest.command.name, {
      profile: "observer",
      role: identity.organization_role,
      scopes: identity.granted_scopes,
    });
  } catch {
    return jsonResponse(403, {
      ok: false,
      error_code: "OBSERVER_COMMAND_FORBIDDEN",
    });
  }

  let submitted: ObserverControlResult;
  try {
    submitted = await deps.submitObserverCommand({
      channel: "zapier",
      identity,
      raw_payload_sha256: await sha256Hex(rawBody),
      request: wireRequest,
    });
  } catch {
    return jsonResponse(503, {
      ok: false,
      error_code: "OBSERVER_SUBMISSION_FAILED",
    });
  }

  try {
    const result = normalizeObserverResult(
      submitted,
      wireRequest.command.name,
    );
    return jsonResponse(200, { ok: true, result });
  } catch {
    return jsonResponse(502, {
      ok: false,
      error_code: "INVALID_OBSERVER_RESULT",
    });
  }
}
