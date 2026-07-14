import { OBSERVER_AUTHORITY } from "../_shared/control-plane/authorization.ts";
import { parseConversationalCommand } from "../_shared/control-plane/registry.ts";
import { parseExactUtcInstant } from "../_shared/control-plane/schemas.ts";
import type { ObserverControlResult } from "../_shared/control-plane/types.ts";
import type { TeamsObserverSubmission } from "../_shared/control-plane/observer-runtime.ts";
import { parseBoundedJsonObject } from "../_shared/bounded-json.ts";
import {
  type ResolveTeamsBotPublicJwk,
  type VerifiedTeamsBotFrameworkRequest,
  verifyTeamsBotFrameworkRequest,
} from "../_shared/teams-bot-auth.ts";

export const TEAMS_OBSERVER_MAX_BODY_BYTES = 256 * 1024;

const JSON_HEADERS = Object.freeze({
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
});
const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SAFE_EXTERNAL_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const ACTIVITY_JSON_LIMITS = Object.freeze({
  maxDepth: 16,
  maxNodes: 1_024,
  maxObjectKeys: 128,
  maxArrayLength: 256,
  maxStringLength: 32_768,
});

export interface TeamsObserverHandlerDependencies {
  enabled: boolean;
  getMicrosoftAppId: () => string;
  nowEpochSeconds: () => number;
  resolvePublicJwk: ResolveTeamsBotPublicJwk;
  verifyInbound?: (input: {
    authorizationHeader: string | null;
    rawActivityBody: Uint8Array;
    microsoftAppId: string;
    nowEpochSeconds: number;
    resolvePublicJwk: ResolveTeamsBotPublicJwk;
  }) => Promise<VerifiedTeamsBotFrameworkRequest>;
  submitObserverCommand: (
    submission: TeamsObserverSubmission,
  ) => Promise<ObserverControlResult>;
}

type JsonRecord = Record<string, unknown>;

function jsonResponse(
  status: number,
  body: JsonRecord,
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

/** Hard-lock response used before request, configuration, or network access. */
export function teamsObserverDisabledResponse(): Response {
  return jsonResponse(503, {
    ok: false,
    error_code: "TEAMS_OBSERVER_LAUNCH_DISABLED",
    message:
      "Teams observer control is launch-disabled until bot registration, tenant binding, durable replies, and receipts are deployed and certified.",
  }, { "Retry-After": "3600" });
}

function acceptsStrictJson(contentType: string | null): boolean {
  return contentType !== null &&
    /^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?$/i
      .test(contentType.trim());
}

function isRecord(value: unknown): value is JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function safeIdentifier(value: unknown, maximum: number): string {
  if (
    typeof value !== "string" || value.length === 0 || value.length > maximum ||
    !SAFE_EXTERNAL_IDENTIFIER.test(value)
  ) {
    throw new Error("invalid_activity");
  }
  return value;
}

function safeText(value: unknown): string {
  if (
    typeof value !== "string" || value.length === 0 || value.length > 512 ||
    value.trim() !== value
  ) {
    throw new Error("invalid_activity");
  }
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (
      code <= 0x1f || (code >= 0x7f && code <= 0x9f) ||
      (code >= 0x200b && code <= 0x200f) ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2060 && code <= 0x206f) || code === 0xfeff
    ) {
      throw new Error("invalid_activity");
    }
  }
  return value;
}

function metadataId(
  record: JsonRecord,
  outerKey: string,
  innerKey: string,
): string {
  const outer = record[outerKey];
  if (!isRecord(outer)) throw new Error("invalid_activity");
  return safeIdentifier(outer[innerKey], 256);
}

function parseTeamsActivity(
  rawBody: Uint8Array,
  microsoftAppId: string,
): Omit<TeamsObserverSubmission, "raw_payload_sha256"> {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(rawBody);
  } catch {
    throw new Error("invalid_activity");
  }
  let activity: JsonRecord;
  try {
    activity = parseBoundedJsonObject(text, ACTIVITY_JSON_LIMITS);
  } catch {
    throw new Error("invalid_activity");
  }
  if (activity.type !== "message" || activity.channelId !== "msteams") {
    throw new Error("unsupported_activity");
  }
  if (metadataId(activity, "recipient", "id") !== microsoftAppId) {
    throw new Error("bot_app_mismatch");
  }
  const channelData = activity.channelData;
  if (!isRecord(channelData)) throw new Error("invalid_activity");
  const tenantId = metadataId(channelData, "tenant", "id");
  const parsedCommand = parseConversationalCommand(safeText(activity.text));
  return {
    tenant_id: tenantId,
    bot_app_id: microsoftAppId,
    user_id: metadataId(activity, "from", "id"),
    activity_id: safeIdentifier(activity.id, 256),
    source_occurred_at: parseExactUtcInstant(
      activity.timestamp,
      "$.timestamp",
    ),
    command: parsedCommand.command,
    mode: parsedCommand.mode,
  };
}

function requestMetadataError(request: Request): boolean {
  const contentEncoding = request.headers.get("content-encoding");
  if (
    contentEncoding !== null && contentEncoding.toLowerCase() !== "identity"
  ) {
    return true;
  }
  const contentLength = request.headers.get("content-length");
  return contentLength !== null &&
    (!/^(?:0|[1-9][0-9]*)$/.test(contentLength) ||
      Number(contentLength) > TEAMS_OBSERVER_MAX_BODY_BYTES);
}

async function readBoundedBody(request: Request): Promise<Uint8Array> {
  if (request.body === null || requestMetadataError(request)) {
    throw new Error("invalid_activity");
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > TEAMS_OBSERVER_MAX_BODY_BYTES) {
        await reader.cancel("teams_activity_too_large");
        throw new Error("invalid_activity");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (total === 0) throw new Error("invalid_activity");
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
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function summarizeResult(value: unknown, commandName: string): JsonRecord {
  if (
    !isRecord(value) || value.version !== "control.result.v1" ||
    value.profile !== "observer" || value.command_name !== commandName ||
    !CANONICAL_UUID_PATTERN.test(String(value.command_id ?? "")) ||
    !["completed", "held", "failed"].includes(String(value.status ?? "")) ||
    !isRecord(value.authority) ||
    value.authority.contact_authorized !== false ||
    value.authority.launch_authorized !== false ||
    value.authority.queue_mutation_authorized !== false ||
    value.authority.crm_write_authorized !== false ||
    value.authority.spend_authorized !== false
  ) {
    throw new Error("invalid_observer_result");
  }
  return {
    accepted: true,
    command_id: String(value.command_id),
    command_name: commandName,
    status: String(value.status),
  };
}

/**
 * Inbound Teams R0 adapter. It acknowledges a verified command delivery but
 * intentionally does not send a Bot Framework chat reply; a future durable
 * response outbox owns external delivery and retry semantics.
 */
export async function handleTeamsObserverRequest(
  request: Request,
  deps: TeamsObserverHandlerDependencies,
): Promise<Response> {
  if (!deps.enabled) return teamsObserverDisabledResponse();
  if (request.method !== "POST") {
    return jsonResponse(405, { ok: false, error_code: "METHOD_NOT_ALLOWED" }, {
      Allow: "POST",
    });
  }
  if (new URL(request.url).search !== "") {
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

  let rawBody: Uint8Array;
  try {
    rawBody = await readBoundedBody(request);
  } catch {
    return jsonResponse(400, { ok: false, error_code: "INVALID_REQUEST_BODY" });
  }

  let microsoftAppId: string;
  try {
    microsoftAppId = deps.getMicrosoftAppId();
  } catch {
    return jsonResponse(503, {
      ok: false,
      error_code: "TEAMS_AUTH_UNAVAILABLE",
    });
  }
  const verifyInbound = deps.verifyInbound ?? verifyTeamsBotFrameworkRequest;
  try {
    await verifyInbound({
      authorizationHeader: request.headers.get("authorization"),
      rawActivityBody: rawBody,
      microsoftAppId,
      nowEpochSeconds: deps.nowEpochSeconds(),
      resolvePublicJwk: deps.resolvePublicJwk,
    });
  } catch {
    return jsonResponse(401, {
      ok: false,
      error_code: "TEAMS_REQUEST_AUTH_FAILED",
    });
  }

  let submission: Omit<TeamsObserverSubmission, "raw_payload_sha256">;
  try {
    submission = parseTeamsActivity(rawBody, microsoftAppId);
  } catch (error) {
    return jsonResponse(
      error instanceof Error && error.message === "unsupported_activity"
        ? 422
        : 400,
      {
        ok: false,
        error_code:
          error instanceof Error && error.message === "unsupported_activity"
            ? "UNSUPPORTED_TEAMS_ACTIVITY"
            : "INVALID_TEAMS_ACTIVITY",
      },
    );
  }

  let result: ObserverControlResult;
  try {
    result = await deps.submitObserverCommand({
      ...submission,
      raw_payload_sha256: await sha256Hex(rawBody),
    });
  } catch {
    return jsonResponse(503, {
      ok: false,
      error_code: "OBSERVER_SUBMISSION_FAILED",
    });
  }
  try {
    return jsonResponse(200, {
      ok: true,
      result: summarizeResult(result, submission.command.name),
    });
  } catch {
    return jsonResponse(502, {
      ok: false,
      error_code: "INVALID_OBSERVER_RESULT",
    });
  }
}
