import { OBSERVER_AUTHORITY } from "../_shared/control-plane/authorization.ts";
import {
  parseConversationalCommand,
} from "../_shared/control-plane/registry.ts";
import type {
  ControlCommand,
  JsonValue,
  ObserverControlResult,
} from "../_shared/control-plane/types.ts";
import {
  parseSlackSlashCommandForm,
  readSlackRequestBody,
  SlackRequestBodyError,
  verifySlackRequestSignature,
} from "../_shared/slack-request-auth.ts";

export const SLACK_OBSERVER_SLASH_COMMAND = "/dial-smart";
export const SLACK_OBSERVER_MAX_RESULT_DATA_BYTES = 4 * 1024;
export const SLACK_OBSERVER_MAX_RESPONSE_BYTES = 8 * 1024;

const JSON_HEADERS = Object.freeze({
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
});
const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const textEncoder = new TextEncoder();

export interface SlackObserverCommandSubmission {
  channel: "slack";
  team_id: string;
  user_id: string;
  api_app_id?: string;
  trigger_id?: string;
  signature_timestamp: number;
  raw_payload_sha256: string;
  command: ControlCommand;
  mode: "plan";
}

export interface SlackObserverHandlerDependencies {
  enabled: boolean;
  getSigningSecret: () => string;
  nowEpochSeconds: () => number;
  submitObserverCommand: (
    submission: SlackObserverCommandSubmission,
  ) => Promise<ObserverControlResult>;
}

type JsonRecord = Record<string, unknown>;

function ephemeralBody(
  text: string,
  extra: JsonRecord = {},
): JsonRecord {
  return {
    response_type: "ephemeral",
    text,
    authority: OBSERVER_AUTHORITY,
    ...extra,
  };
}

function jsonResponse(
  status: number,
  body: JsonRecord,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

/** The production entry point uses this before reading the body or secrets. */
export function slackObserverDisabledResponse(): Response {
  return jsonResponse(
    503,
    ephemeralBody(
      "Slack observer control is launch-disabled until its tenant binding and durable receipt path are deployed and certified.",
      { error_code: "SLACK_OBSERVER_LAUNCH_DISABLED" },
    ),
    { "Retry-After": "3600" },
  );
}

function acceptsStrictSlashForm(contentType: string | null): boolean {
  if (contentType === null) return false;
  return /^application\/x-www-form-urlencoded(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?$/i
    .test(contentType.trim());
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const ownedBytes = new Uint8Array(bytes.byteLength);
  ownedBytes.set(bytes);
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", ownedBytes),
  );
  return [...digest]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneJsonValue(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): JsonValue {
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.length > SLACK_OBSERVER_MAX_RESULT_DATA_BYTES) {
      throw new Error("result_data_limit");
    }
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (depth >= 6 || typeof value !== "object") {
    throw new Error("invalid_result_data");
  }
  if (seen.has(value)) throw new Error("invalid_result_data");
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (value.length > 128) throw new Error("result_data_limit");
      return value.map((item) => cloneJsonValue(item, depth + 1, seen));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("invalid_result_data");
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.length > 64) throw new Error("result_data_limit");
    const clone: Record<string, JsonValue> = Object.create(null);
    for (const key of keys.sort()) {
      if (key.length === 0 || key.length > 128) {
        throw new Error("invalid_result_data");
      }
      clone[key] = cloneJsonValue(record[key], depth + 1, seen);
    }
    return clone;
  } finally {
    seen.delete(value);
  }
}

function normalizeObserverResult(
  value: unknown,
  expectedCommand: ControlCommand["name"],
): ObserverControlResult {
  if (!isRecord(value)) throw new Error("invalid_observer_result");
  if (
    value.version !== "control.result.v1" || value.profile !== "observer" ||
    value.command_name !== expectedCommand ||
    !CANONICAL_UUID_PATTERN.test(String(value.command_id ?? "")) ||
    !["completed", "held", "failed"].includes(String(value.status ?? ""))
  ) {
    throw new Error("invalid_observer_result");
  }
  const authority = value.authority;
  if (
    !isRecord(authority) ||
    authority.contact_authorized !== false ||
    authority.launch_authorized !== false ||
    authority.queue_mutation_authorized !== false ||
    authority.crm_write_authorized !== false ||
    authority.spend_authorized !== false
  ) {
    throw new Error("invalid_observer_authority");
  }
  const data = cloneJsonValue(value.data);
  if (
    textEncoder.encode(JSON.stringify(data)).byteLength >
      SLACK_OBSERVER_MAX_RESULT_DATA_BYTES
  ) {
    throw new Error("result_data_limit");
  }
  return {
    version: "control.result.v1",
    profile: "observer",
    command_id: String(value.command_id),
    command_name: expectedCommand,
    status: value.status as ObserverControlResult["status"],
    authority: OBSERVER_AUTHORITY,
    data,
  };
}

function boundedSlackDataPreview(data: JsonValue): string {
  const serialized = JSON.stringify(data);
  // Slack mrkdwn treats angle-bracket forms as links/mentions and backticks as
  // code delimiters. Replace those metacharacters before placing the preview
  // inside our own static code fence.
  const neutralized = serialized
    .replaceAll("&", "＆")
    .replaceAll("<", "‹")
    .replaceAll(">", "›")
    .replaceAll("`", "ˋ");
  const maxPreviewBytes = 3_000;
  let preview = "";
  let byteLength = 0;
  let truncated = false;
  for (const character of neutralized) {
    const characterBytes = textEncoder.encode(character).byteLength;
    if (byteLength + characterBytes > maxPreviewBytes) {
      truncated = true;
      break;
    }
    preview += character;
    byteLength += characterBytes;
  }
  return truncated ? `${preview}\n[bounded preview truncated]` : preview;
}

function safeEliteBeatText(value: unknown, maximum: number): string | null {
  if (
    typeof value !== "string" || value.length === 0 || value.length > maximum
  ) {
    return null;
  }
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return null;
  }
  return value
    .replaceAll("&", "＆")
    .replaceAll("<", "‹")
    .replaceAll(">", "›")
    .replaceAll("`", "ˋ");
}

function safeEliteBeatCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) &&
      value >= 0 && value <= 1_000
    ? value
    : null;
}

/**
 * Turn the server-owned, non-PII Elite pulse into the operator's one-screen
 * morning beat. Anything outside the exact bounded shape falls back to the
 * generic serialized preview rather than becoming conversational text.
 */
function eliteSolarMorningBeat(data: JsonValue): string | null {
  if (!isRecord(data) || !isRecord(data.operator_beat)) return null;
  const beat = data.operator_beat;
  if (
    beat.kind !== "elite_solar_operator_morning_beat_v1" ||
    beat.direct_import_primary !== true ||
    beat.gohighlevel_required !== false ||
    beat.contact_authorized !== false || beat.launch_authorized !== false
  ) {
    return null;
  }
  const headline = safeEliteBeatText(beat.headline, 360);
  const focus = safeEliteBeatText(beat.recommended_focus, 480);
  const campaigns = safeEliteBeatCount(beat.campaign_records_observed);
  const currentReleases = safeEliteBeatCount(
    beat.current_release_records_observed,
  );
  const invalidReleases = safeEliteBeatCount(
    beat.invalid_or_expired_release_records_observed,
  );
  const stages = beat.release_stages_visible;
  const knownStages = new Set(["canary_5", "canary_20", "canary_50", "normal"]);
  if (
    headline === null || focus === null || campaigns === null ||
    currentReleases === null || invalidReleases === null ||
    !Array.isArray(stages) ||
    stages.length > 4 ||
    stages.some((stage) => typeof stage !== "string" || !knownStages.has(stage))
  ) {
    return null;
  }
  const visibleStages = stages.length === 0 ? "none" : stages.join(", ");
  return [
    "Elite Solar morning beat (read-only)",
    headline,
    `Next focus: ${focus}`,
    `Observed campaigns: ${campaigns}; current releases: ${currentReleases}; invalid or expired: ${invalidReleases}.`,
    `Visible release stages: ${visibleStages}.`,
    "Source lane: signed direct import is primary; GoHighLevel is optional.",
    "Authority: contact=false, launch=false, queue_mutation=false, crm_write=false, spend=false.",
  ].join("\n");
}

function successResponse(result: ObserverControlResult): Response {
  const operatorBeat = result.command_name === "elite.solar_pulse"
    ? eliteSolarMorningBeat(result.data)
    : null;
  const bodyText = operatorBeat ??
    `Result data (bounded preview):\n\`\`\`\n${
      boundedSlackDataPreview(result.data)
    }\n\`\`\``;
  const body = ephemeralBody(
    `Observer ${result.command_name}: ${result.status}\n` +
      `Command: ${result.command_id}\n` +
      "Authority: contact=false, launch=false, queue_mutation=false, " +
      `crm_write=false, spend=false\n${bodyText}`,
  );
  const encoded = JSON.stringify(body);
  if (
    textEncoder.encode(encoded).byteLength > SLACK_OBSERVER_MAX_RESPONSE_BYTES
  ) {
    return jsonResponse(
      502,
      ephemeralBody(
        "The observer result could not be returned safely.",
        { error_code: "INVALID_OBSERVER_RESULT" },
      ),
    );
  }
  return new Response(encoded, { status: 200, headers: JSON_HEADERS });
}

/**
 * Authenticate and translate one Slack slash request into the shared R0
 * observer command contract. This adapter never performs I/O beyond invoking
 * its injected durable submitter.
 */
export async function handleSlackObserverRequest(
  request: Request,
  deps: SlackObserverHandlerDependencies,
): Promise<Response> {
  if (!deps.enabled) return slackObserverDisabledResponse();

  if (request.method !== "POST") {
    return jsonResponse(
      405,
      ephemeralBody("Only POST is accepted.", {
        error_code: "METHOD_NOT_ALLOWED",
      }),
      { Allow: "POST" },
    );
  }
  if (!acceptsStrictSlashForm(request.headers.get("content-type"))) {
    return jsonResponse(
      415,
      ephemeralBody("Slack slash form content is required.", {
        error_code: "SLACK_FORM_CONTENT_TYPE_REQUIRED",
      }),
    );
  }

  let rawBody: Uint8Array;
  try {
    rawBody = await readSlackRequestBody(request);
  } catch (error) {
    return jsonResponse(
      error instanceof SlackRequestBodyError &&
        error.code === "body_too_large"
        ? 413
        : 400,
      ephemeralBody("The Slack request body was rejected.", {
        error_code: "INVALID_SLACK_REQUEST_BODY",
      }),
    );
  }

  let signingSecret: string;
  let nowEpochSeconds: number;
  try {
    signingSecret = deps.getSigningSecret();
    nowEpochSeconds = deps.nowEpochSeconds();
  } catch {
    return jsonResponse(
      503,
      ephemeralBody("Slack request authentication is unavailable.", {
        error_code: "SLACK_AUTH_UNAVAILABLE",
      }),
    );
  }
  const authenticated = await verifySlackRequestSignature({
    rawBody,
    timestampHeader: request.headers.get("x-slack-request-timestamp"),
    signatureHeader: request.headers.get("x-slack-signature"),
    signingSecret,
    nowEpochSeconds,
  });
  if (!authenticated.ok) {
    return jsonResponse(
      401,
      ephemeralBody("Slack request authentication failed.", {
        error_code: "SLACK_REQUEST_AUTH_FAILED",
      }),
    );
  }

  let slashCommand;
  try {
    // Parsing happens only after the exact raw bytes pass Slack HMAC auth.
    slashCommand = parseSlackSlashCommandForm(rawBody);
  } catch {
    return jsonResponse(
      400,
      ephemeralBody("The signed Slack slash command was invalid.", {
        error_code: "INVALID_SLACK_SLASH_COMMAND",
      }),
    );
  }
  if (slashCommand.command !== SLACK_OBSERVER_SLASH_COMMAND) {
    return jsonResponse(
      422,
      ephemeralBody("Only the exact /dial-smart slash command is accepted.", {
        error_code: "UNSUPPORTED_SLASH_COMMAND",
      }),
    );
  }

  let parsed;
  try {
    parsed = parseConversationalCommand(slashCommand.text);
  } catch {
    return jsonResponse(
      422,
      ephemeralBody(
        "Unsupported observer command. Use an exact read-only command: whoami, elite brief, status, campaigns, or campaign <UUID>.",
        { error_code: "UNSUPPORTED_OBSERVER_COMMAND" },
      ),
    );
  }

  let submitted: ObserverControlResult;
  try {
    submitted = await deps.submitObserverCommand({
      channel: "slack",
      team_id: slashCommand.teamId,
      user_id: slashCommand.userId,
      ...(slashCommand.apiAppId === undefined
        ? {}
        : { api_app_id: slashCommand.apiAppId }),
      ...(slashCommand.triggerId === undefined
        ? {}
        : { trigger_id: slashCommand.triggerId }),
      signature_timestamp: authenticated.timestamp,
      raw_payload_sha256: await sha256Hex(rawBody),
      command: parsed.command,
      mode: parsed.mode,
    });
  } catch {
    return jsonResponse(
      503,
      ephemeralBody("The observer command could not be submitted.", {
        error_code: "OBSERVER_SUBMISSION_FAILED",
      }),
    );
  }

  try {
    return successResponse(
      normalizeObserverResult(submitted, parsed.command.name),
    );
  } catch {
    return jsonResponse(
      502,
      ephemeralBody("The observer result could not be returned safely.", {
        error_code: "INVALID_OBSERVER_RESULT",
      }),
    );
  }
}
