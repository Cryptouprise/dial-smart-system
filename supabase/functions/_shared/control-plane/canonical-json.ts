import { getCommandDefinition } from "./registry.ts";
import {
  CONTROL_CHANNELS,
  CONTROL_MODES,
  type IntentHashInput,
  type JsonObject,
  type JsonValue,
} from "./types.ts";

const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export class CanonicalJsonError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CanonicalJsonError";
    this.code = code;
  }
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Stable JSON with lexicographically sorted object keys and no coercion. */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new CanonicalJsonError(
        "NON_FINITE_NUMBER",
        "Canonical JSON cannot contain a non-finite number",
      );
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (isJsonObject(value)) {
    const entries = Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    );
    return `{${entries.join(",")}}`;
  }
  throw new CanonicalJsonError(
    "UNSUPPORTED_JSON_VALUE",
    "Canonical JSON accepts only JSON values and plain objects",
  );
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function requireCanonicalIdentityUuid(value: string, field: string): string {
  if (!CANONICAL_UUID_PATTERN.test(value)) {
    throw new CanonicalJsonError(
      "NON_CANONICAL_IDENTITY",
      `${field} must be a canonical lowercase UUID`,
    );
  }
  return value;
}

/**
 * Select the exact intent fields before hashing. approval_handle is accepted
 * on IntentHashInput for caller convenience but is intentionally omitted.
 */
export function canonicalIntentDocument(input: IntentHashInput): JsonObject {
  requireCanonicalIdentityUuid(input.organization_id, "organization_id");
  requireCanonicalIdentityUuid(input.user_id, "user_id");
  requireCanonicalIdentityUuid(input.installation_id, "installation_id");
  if (!CONTROL_CHANNELS.includes(input.channel)) {
    throw new CanonicalJsonError(
      "INVALID_CHANNEL",
      "Unsupported control channel",
    );
  }
  if (!CONTROL_MODES.includes(input.mode)) {
    throw new CanonicalJsonError("INVALID_MODE", "Unsupported control mode");
  }
  getCommandDefinition(input.command.name);

  // Validate that args are losslessly representable before constructing the
  // typed document. This catches undefined, class instances, and non-finite
  // numbers even if an unsafe caller bypasses the wire parser.
  canonicalJson(input.command.args);

  return {
    version: "control.intent.v1",
    organization_id: input.organization_id,
    user_id: input.user_id,
    channel: input.channel,
    installation_id: input.installation_id,
    command: {
      name: input.command.name,
      args: input.command.args as JsonValue,
    },
    mode: input.mode,
  };
}

export async function hashControlIntent(
  input: IntentHashInput,
): Promise<string> {
  return await sha256Hex(canonicalJson(canonicalIntentDocument(input)));
}
