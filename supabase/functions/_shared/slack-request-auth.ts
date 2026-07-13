/**
 * Slack request authentication and slash-command decoding.
 *
 * Security order is deliberate: read the still-unparsed body with
 * `readSlackRequestBody`, authenticate those exact bytes with
 * `verifySlackRequestSignature`, and only then call
 * `parseSlackSlashCommandForm`. Never authenticate a re-encoded form body.
 *
 * Slack signing contract:
 * https://api.slack.com/docs/verifying-requests-from-slack
 */

export const SLACK_MAX_REQUEST_BODY_BYTES = 128 * 1024;
export const SLACK_MAX_SIGNATURE_AGE_SECONDS = 300;

export type SlackRequestAuthFailureReason =
  | "missing_signing_secret"
  | "invalid_now"
  | "invalid_timestamp"
  | "invalid_signature"
  | "timestamp_out_of_window"
  | "signature_mismatch";

export type SlackRequestAuthResult =
  | { ok: true; timestamp: number }
  | { ok: false; reason: SlackRequestAuthFailureReason };

export type SlackRequestBodyErrorCode =
  | "invalid_content_length"
  | "body_too_large"
  | "content_length_mismatch"
  | "body_read_failed";

export type SlackSlashCommandErrorCode =
  | "invalid_utf8"
  | "malformed_form_encoding"
  | "duplicate_security_field"
  | "missing_required_field"
  | "invalid_team_id"
  | "invalid_user_id"
  | "invalid_command"
  | "invalid_text"
  | "invalid_trigger_id"
  | "invalid_api_app_id";

export class SlackRequestBodyError extends Error {
  readonly code: SlackRequestBodyErrorCode;

  constructor(code: SlackRequestBodyErrorCode) {
    super(code);
    this.name = "SlackRequestBodyError";
    this.code = code;
  }
}

export class SlackSlashCommandError extends Error {
  readonly code: SlackSlashCommandErrorCode;

  constructor(code: SlackSlashCommandErrorCode) {
    super(code);
    this.name = "SlackSlashCommandError";
    this.code = code;
  }
}

export interface SlackSlashCommand {
  teamId: string;
  userId: string;
  command: string;
  text: string;
  triggerId?: string;
  apiAppId?: string;
}

const textEncoder = new TextEncoder();

function ownedBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const owned = new Uint8Array(bytes.byteLength);
  owned.set(bytes);
  return owned;
}

function asBytes(value: Uint8Array | string): Uint8Array<ArrayBuffer> {
  return typeof value === "string"
    ? textEncoder.encode(value)
    : ownedBytes(value);
}

function concatenate(
  left: Uint8Array,
  right: Uint8Array,
): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(left.byteLength + right.byteLength);
  result.set(left, 0);
  result.set(right, left.byteLength);
  return result;
}

function decodeLowercaseHex(value: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return bytes;
}

/**
 * Authenticate Slack's signature over the exact, unparsed request body.
 * WebCrypto performs the HMAC comparison rather than comparing MAC strings in
 * JavaScript, so the fixed-length signature comparison is constant-time in the
 * cryptographic implementation.
 */
export async function verifySlackRequestSignature(input: {
  rawBody: Uint8Array | string;
  timestampHeader: string | null;
  signatureHeader: string | null;
  signingSecret: string;
  nowEpochSeconds: number;
}): Promise<SlackRequestAuthResult> {
  if (
    typeof input.signingSecret !== "string" ||
    input.signingSecret.trim().length === 0
  ) {
    return { ok: false, reason: "missing_signing_secret" };
  }

  if (
    !Number.isSafeInteger(input.nowEpochSeconds) ||
    input.nowEpochSeconds < 0
  ) {
    return { ok: false, reason: "invalid_now" };
  }

  const timestampHeader = input.timestampHeader;
  if (
    timestampHeader === null ||
    !/^(?:0|[1-9][0-9]{0,15})$/.test(timestampHeader)
  ) {
    return { ok: false, reason: "invalid_timestamp" };
  }
  const timestamp = Number(timestampHeader);
  if (!Number.isSafeInteger(timestamp)) {
    return { ok: false, reason: "invalid_timestamp" };
  }

  const signatureHeader = input.signatureHeader;
  if (
    signatureHeader === null ||
    !/^v0=[0-9a-f]{64}$/.test(signatureHeader)
  ) {
    return { ok: false, reason: "invalid_signature" };
  }

  if (
    Math.abs(input.nowEpochSeconds - timestamp) >
      SLACK_MAX_SIGNATURE_AGE_SECONDS
  ) {
    return { ok: false, reason: "timestamp_out_of_window" };
  }

  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(input.signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signature = decodeLowercaseHex(signatureHeader.slice(3));
  const basePrefix = textEncoder.encode(`v0:${timestampHeader}:`);
  const baseString = concatenate(basePrefix, asBytes(input.rawBody));
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    baseString,
  );

  return valid
    ? { ok: true, timestamp }
    : { ok: false, reason: "signature_mismatch" };
}

function parseContentLength(value: string | null): number | null {
  if (value === null) return null;
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) {
    throw new SlackRequestBodyError("invalid_content_length");
  }
  const length = Number(value);
  if (!Number.isSafeInteger(length)) {
    throw new SlackRequestBodyError("invalid_content_length");
  }
  if (length > SLACK_MAX_REQUEST_BODY_BYTES) {
    throw new SlackRequestBodyError("body_too_large");
  }
  return length;
}

/**
 * Read at most 128 KiB from a Slack request without first parsing its body.
 * A supplied Content-Length must be canonical, in range, and equal the number
 * of bytes actually delivered. The streaming cap remains authoritative when
 * Content-Length is absent or dishonest.
 */
export async function readSlackRequestBody(
  request: Request,
): Promise<Uint8Array<ArrayBuffer>> {
  const declaredLength = parseContentLength(
    request.headers.get("content-length"),
  );
  if (request.body === null) {
    if (declaredLength !== null && declaredLength !== 0) {
      throw new SlackRequestBodyError("content_length_mismatch");
    }
    return new Uint8Array(0);
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  let completed = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        completed = true;
        break;
      }
      if (!(value instanceof Uint8Array)) {
        throw new SlackRequestBodyError("body_read_failed");
      }
      totalLength += value.byteLength;
      if (totalLength > SLACK_MAX_REQUEST_BODY_BYTES) {
        throw new SlackRequestBodyError("body_too_large");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof SlackRequestBodyError) throw error;
    throw new SlackRequestBodyError("body_read_failed");
  } finally {
    if (!completed) {
      try {
        await reader.cancel();
      } catch {
        // Preserve the original bounded-read failure.
      }
    }
    reader.releaseLock();
  }

  if (declaredLength !== null && declaredLength !== totalLength) {
    throw new SlackRequestBodyError("content_length_mismatch");
  }

  const body = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

const SECURITY_CRITICAL_FORM_FIELDS = new Set([
  "team_id",
  "user_id",
  "command",
  "text",
  "trigger_id",
  "api_app_id",
]);

function decodeFormComponent(value: string): string {
  if (/%(?![0-9A-Fa-f]{2})/.test(value)) {
    throw new SlackSlashCommandError("malformed_form_encoding");
  }
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    throw new SlackSlashCommandError("malformed_form_encoding");
  }
}

function decodeUtf8Strict(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new SlackSlashCommandError("invalid_utf8");
  }
}

function parseStrictForm(rawBody: Uint8Array | string): Map<string, string> {
  const body = typeof rawBody === "string"
    ? rawBody
    : decodeUtf8Strict(rawBody);
  const fields = new Map<string, string>();
  if (body.length === 0) return fields;

  for (const pair of body.split("&")) {
    if (pair.length === 0) {
      throw new SlackSlashCommandError("malformed_form_encoding");
    }
    const equalsAt = pair.indexOf("=");
    const rawKey = equalsAt === -1 ? pair : pair.slice(0, equalsAt);
    const rawValue = equalsAt === -1 ? "" : pair.slice(equalsAt + 1);
    const key = decodeFormComponent(rawKey);
    const value = decodeFormComponent(rawValue);
    if (SECURITY_CRITICAL_FORM_FIELDS.has(key) && fields.has(key)) {
      throw new SlackSlashCommandError("duplicate_security_field");
    }
    fields.set(key, value);
  }
  return fields;
}

function requireField(fields: Map<string, string>, key: string): string {
  const value = fields.get(key);
  if (value === undefined || value.length === 0) {
    throw new SlackSlashCommandError("missing_required_field");
  }
  return value;
}

function optionalNonemptyField(
  fields: Map<string, string>,
  key: string,
  errorCode: SlackSlashCommandErrorCode,
): string | undefined {
  const value = fields.get(key);
  if (value === undefined) return undefined;
  if (value.length === 0) throw new SlackSlashCommandError(errorCode);
  return value;
}

function containsForbiddenTextControl(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (
      code <= 0x08 || code === 0x0b || code === 0x0c ||
      (code >= 0x0e && code <= 0x1f) || code === 0x7f
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Decode an already-authenticated application/x-www-form-urlencoded slash
 * command. Unknown fields are ignored. In particular, `response_url` is never
 * returned and must never become an authenticated outbound destination.
 */
export function parseSlackSlashCommandForm(
  authenticatedRawBody: Uint8Array | string,
): SlackSlashCommand {
  const fields = parseStrictForm(authenticatedRawBody);
  const teamId = requireField(fields, "team_id");
  const userId = requireField(fields, "user_id");
  const command = requireField(fields, "command");
  const text = fields.get("text") ?? "";
  const triggerId = optionalNonemptyField(
    fields,
    "trigger_id",
    "invalid_trigger_id",
  );
  const apiAppId = optionalNonemptyField(
    fields,
    "api_app_id",
    "invalid_api_app_id",
  );

  if (!/^[A-Z][A-Z0-9]{1,63}$/.test(teamId)) {
    throw new SlackSlashCommandError("invalid_team_id");
  }
  if (!/^[A-Z][A-Z0-9]{1,63}$/.test(userId)) {
    throw new SlackSlashCommandError("invalid_user_id");
  }
  if (!/^\/[a-z0-9][a-z0-9_-]{0,63}$/.test(command)) {
    throw new SlackSlashCommandError("invalid_command");
  }
  if (
    text.length > 8_000 ||
    containsForbiddenTextControl(text)
  ) {
    throw new SlackSlashCommandError("invalid_text");
  }
  if (
    triggerId !== undefined &&
    !/^[A-Za-z0-9._:-]{1,255}$/.test(triggerId)
  ) {
    throw new SlackSlashCommandError("invalid_trigger_id");
  }
  if (
    apiAppId !== undefined &&
    !/^A[A-Z0-9]{1,63}$/.test(apiAppId)
  ) {
    throw new SlackSlashCommandError("invalid_api_app_id");
  }

  return {
    teamId,
    userId,
    command,
    text,
    ...(triggerId === undefined ? {} : { triggerId }),
    ...(apiAppId === undefined ? {} : { apiAppId }),
  };
}
