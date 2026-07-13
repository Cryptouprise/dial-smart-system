import {
  BoundedJsonError,
  type JsonLimits,
  parseBoundedJsonObject,
} from "./bounded-json.ts";

/**
 * Pure inbound authentication for future Microsoft Teams/Bot Framework
 * adapters. This helper deliberately does not fetch OpenID metadata, perform
 * activity authorization, infer tenant/user identity, or send a response.
 *
 * Microsoft Bot Connector authentication contract:
 * https://learn.microsoft.com/en-us/azure/bot-service/rest-api/bot-framework-rest-connector-authentication?view=azure-bot-service-4.0
 */

export const TEAMS_BOT_EXPECTED_ISSUER = "https://api.botframework.com";
export const TEAMS_BOT_MAX_AUTHORIZATION_BYTES = 32 * 1024;
export const TEAMS_BOT_MAX_ACTIVITY_BYTES = 256 * 1024;
export const TEAMS_BOT_MAX_CLOCK_SKEW_SECONDS = 300;

const MAX_JWT_BYTES = 24 * 1024;
const MAX_HEADER_BYTES = 4 * 1024;
const MAX_PAYLOAD_BYTES = 16 * 1024;
const MAX_SIGNATURE_BYTES = 1024;
const MIN_SIGNATURE_BYTES = 64;
const MAX_KEY_ID_LENGTH = 256;
const MAX_APP_ID_LENGTH = 256;
const MAX_SERVICE_URL_LENGTH = 2_048;

const HEADER_JSON_LIMITS: JsonLimits = Object.freeze({
  maxDepth: 4,
  maxNodes: 64,
  maxObjectKeys: 32,
  maxArrayLength: 16,
  maxStringLength: 1_024,
});

const PAYLOAD_JSON_LIMITS: JsonLimits = Object.freeze({
  maxDepth: 8,
  maxNodes: 256,
  maxObjectKeys: 64,
  maxArrayLength: 32,
  maxStringLength: 4_096,
});

const ACTIVITY_JSON_LIMITS: JsonLimits = Object.freeze({
  maxDepth: 16,
  maxNodes: 1_024,
  maxObjectKeys: 128,
  maxArrayLength: 256,
  maxStringLength: 32_768,
});

export type TeamsBotAuthErrorCode =
  | "missing_authorization"
  | "authorization_too_large"
  | "invalid_authorization"
  | "token_too_large"
  | "malformed_token"
  | "invalid_base64url"
  | "jwt_segment_too_large"
  | "invalid_jwt_utf8"
  | "invalid_jwt_json"
  | "invalid_alg"
  | "invalid_kid"
  | "invalid_typ"
  | "unsupported_critical_header"
  | "invalid_app_id"
  | "invalid_issuer"
  | "invalid_audience"
  | "invalid_exp"
  | "invalid_nbf"
  | "invalid_now"
  | "invalid_clock_skew"
  | "token_expired"
  | "token_not_yet_valid"
  | "activity_body_too_large"
  | "invalid_activity_utf8"
  | "invalid_activity_json"
  | "invalid_activity_service_url"
  | "invalid_token_service_url"
  | "service_url_mismatch"
  | "key_resolution_failed"
  | "invalid_public_key"
  | "invalid_signature";

export class TeamsBotAuthError extends Error {
  readonly code: TeamsBotAuthErrorCode;

  constructor(code: TeamsBotAuthErrorCode) {
    super(code);
    this.name = "TeamsBotAuthError";
    this.code = code;
  }
}

export type ResolveTeamsBotPublicJwk = (
  keyId: string,
) => JsonWebKey | null | Promise<JsonWebKey | null>;

export interface VerifyTeamsBotFrameworkRequestInput {
  authorizationHeader: string | null;
  rawActivityBody: string | Uint8Array;
  microsoftAppId: string;
  nowEpochSeconds: number;
  clockSkewSeconds?: number;
  resolvePublicJwk: ResolveTeamsBotPublicJwk;
}

/**
 * Only authentication evidence is returned. Tenant, conversation, user, and
 * activity identifiers remain untrusted and must be authorized separately.
 */
export interface VerifiedTeamsBotFrameworkRequest {
  issuer: typeof TEAMS_BOT_EXPECTED_ISSUER;
  audience: string;
  keyId: string;
  serviceUrl: string;
  expiresAt: number;
  notBefore: number;
}

const encoder = new TextEncoder();
const strictDecoder = new TextDecoder("utf-8", { fatal: true });

function fail(code: TeamsBotAuthErrorCode): never {
  throw new TeamsBotAuthError(code);
}

function byteLength(value: string): number {
  return encoder.encode(value).byteLength;
}

function decodeBase64UrlCanonical(
  segment: string,
  maxDecodedBytes: number,
): Uint8Array<ArrayBuffer> {
  if (
    segment.length === 0 ||
    !/^[A-Za-z0-9_-]+$/.test(segment) ||
    segment.length % 4 === 1
  ) {
    fail("invalid_base64url");
  }

  const paddingLength = (4 - segment.length % 4) % 4;
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat(paddingLength);
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    return fail("invalid_base64url");
  }
  if (binary.length > maxDecodedBytes) fail("jwt_segment_too_large");

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  let canonicalBase64 = "";
  for (const byte of bytes) canonicalBase64 += String.fromCharCode(byte);
  const canonical = btoa(canonicalBase64)
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  if (canonical !== segment) fail("invalid_base64url");
  return bytes;
}

function decodeJsonSegment(
  segment: string,
  maxDecodedBytes: number,
  limits: JsonLimits,
): Record<string, unknown> {
  const bytes = decodeBase64UrlCanonical(segment, maxDecodedBytes);
  let text: string;
  try {
    text = strictDecoder.decode(bytes);
  } catch {
    return fail("invalid_jwt_utf8");
  }
  try {
    return parseBoundedJsonObject(text, limits);
  } catch (error) {
    if (error instanceof BoundedJsonError) fail("invalid_jwt_json");
    throw error;
  }
}

function parseActivityBody(
  rawBody: string | Uint8Array,
): Record<string, unknown> {
  let text: string;
  if (typeof rawBody === "string") {
    if (byteLength(rawBody) > TEAMS_BOT_MAX_ACTIVITY_BYTES) {
      fail("activity_body_too_large");
    }
    text = rawBody;
  } else {
    if (rawBody.byteLength > TEAMS_BOT_MAX_ACTIVITY_BYTES) {
      fail("activity_body_too_large");
    }
    try {
      text = strictDecoder.decode(rawBody);
    } catch {
      return fail("invalid_activity_utf8");
    }
  }

  try {
    return parseBoundedJsonObject(text, ACTIVITY_JSON_LIMITS);
  } catch (error) {
    if (error instanceof BoundedJsonError) fail("invalid_activity_json");
    throw error;
  }
}

function parseSafeServiceUrl(
  value: unknown,
  errorCode:
    | "invalid_activity_service_url"
    | "invalid_token_service_url",
): URL {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_SERVICE_URL_LENGTH ||
    containsUnsafeUrlCharacter(value)
  ) {
    fail(errorCode);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail(errorCode);
  }

  const hostname = url.hostname.toLowerCase();
  const unsafeHostname = hostname.length === 0 ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".home") ||
    hostname.endsWith(".lan") ||
    hostname.endsWith(".") ||
    !hostname.includes(".") ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) ||
    hostname.startsWith("[");

  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    unsafeHostname ||
    !url.pathname.startsWith("/") ||
    /%(?:00|2f|5c)/i.test(url.pathname)
  ) {
    fail(errorCode);
  }

  return url;
}

function containsUnsafeUrlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x20 || code === 0x7f || code === 0x5c) return true;
  }
  return false;
}

function requireSafeInteger(
  value: unknown,
  code: "invalid_exp" | "invalid_nbf",
): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail(code);
  return value as number;
}

function isCanonicalBoundedBase64Url(
  value: unknown,
  maxCharacters: number,
): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maxCharacters ||
    value.length % 4 === 1 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    return false;
  }
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") +
      "=".repeat((4 - value.length % 4) % 4);
    const decoded = atob(padded);
    const canonical = btoa(decoded)
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    return canonical === value;
  } catch {
    return false;
  }
}

function isUsablePublicRsaJwk(
  value: unknown,
  expectedKeyId: string,
): value is JsonWebKey {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const jwk = value as JsonWebKey & { kid?: unknown };
  if (
    jwk.kty !== "RSA" ||
    !isCanonicalBoundedBase64Url(jwk.n, 4_096) ||
    !isCanonicalBoundedBase64Url(jwk.e, 16) ||
    (jwk.kid !== undefined &&
      (typeof jwk.kid !== "string" || jwk.kid !== expectedKeyId)) ||
    (jwk.alg !== undefined && jwk.alg !== "RS256") ||
    (jwk.use !== undefined && jwk.use !== "sig") ||
    jwk.d !== undefined ||
    jwk.p !== undefined ||
    jwk.q !== undefined ||
    jwk.dp !== undefined ||
    jwk.dq !== undefined ||
    jwk.qi !== undefined ||
    jwk.oth !== undefined
  ) {
    return false;
  }
  if (
    jwk.key_ops !== undefined &&
    (!Array.isArray(jwk.key_ops) ||
      jwk.key_ops.length !== 1 ||
      jwk.key_ops[0] !== "verify")
  ) {
    return false;
  }
  return true;
}

/**
 * Verify an inbound Bot Framework JWT and bind its signed `serviceurl` claim
 * to the exact HTTPS origin and path in the bounded activity JSON.
 */
export async function verifyTeamsBotFrameworkRequest(
  input: VerifyTeamsBotFrameworkRequestInput,
): Promise<VerifiedTeamsBotFrameworkRequest> {
  const authorization = input.authorizationHeader;
  if (authorization === null || authorization.length === 0) {
    fail("missing_authorization");
  }
  if (byteLength(authorization) > TEAMS_BOT_MAX_AUTHORIZATION_BYTES) {
    fail("authorization_too_large");
  }

  const authorizationMatch = authorization.match(
    /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/,
  );
  if (!authorizationMatch) fail("invalid_authorization");
  const token = authorizationMatch[1];
  if (byteLength(token) > MAX_JWT_BYTES) fail("token_too_large");
  const segments = token.split(".");
  if (
    segments.length !== 3 || segments.some((segment) => segment.length === 0)
  ) {
    fail("malformed_token");
  }
  const [headerSegment, payloadSegment, signatureSegment] = segments;

  const header = decodeJsonSegment(
    headerSegment,
    MAX_HEADER_BYTES,
    HEADER_JSON_LIMITS,
  );
  const payload = decodeJsonSegment(
    payloadSegment,
    MAX_PAYLOAD_BYTES,
    PAYLOAD_JSON_LIMITS,
  );
  const signature = decodeBase64UrlCanonical(
    signatureSegment,
    MAX_SIGNATURE_BYTES,
  );
  if (signature.byteLength < MIN_SIGNATURE_BYTES) fail("invalid_signature");

  if (header.alg !== "RS256") fail("invalid_alg");
  if (
    typeof header.kid !== "string" ||
    header.kid.length === 0 ||
    header.kid.length > MAX_KEY_ID_LENGTH ||
    !/^[A-Za-z0-9._~:/+=-]+$/.test(header.kid)
  ) {
    fail("invalid_kid");
  }
  if (header.typ !== undefined && header.typ !== "JWT") fail("invalid_typ");
  if (header.crit !== undefined || header.b64 !== undefined) {
    fail("unsupported_critical_header");
  }

  if (
    typeof input.microsoftAppId !== "string" ||
    input.microsoftAppId.length === 0 ||
    input.microsoftAppId.length > MAX_APP_ID_LENGTH ||
    !/^[A-Za-z0-9._:-]+$/.test(input.microsoftAppId)
  ) {
    fail("invalid_app_id");
  }
  if (payload.iss !== TEAMS_BOT_EXPECTED_ISSUER) fail("invalid_issuer");
  if (
    typeof payload.aud !== "string" ||
    payload.aud !== input.microsoftAppId
  ) {
    fail("invalid_audience");
  }

  if (
    !Number.isSafeInteger(input.nowEpochSeconds) ||
    input.nowEpochSeconds < 0
  ) {
    fail("invalid_now");
  }
  const clockSkew = input.clockSkewSeconds ??
    TEAMS_BOT_MAX_CLOCK_SKEW_SECONDS;
  if (
    !Number.isSafeInteger(clockSkew) ||
    clockSkew < 0 ||
    clockSkew > TEAMS_BOT_MAX_CLOCK_SKEW_SECONDS
  ) {
    fail("invalid_clock_skew");
  }
  const expiresAt = requireSafeInteger(payload.exp, "invalid_exp");
  const notBefore = requireSafeInteger(payload.nbf, "invalid_nbf");
  if (expiresAt <= notBefore) fail("invalid_exp");
  if (input.nowEpochSeconds >= expiresAt + clockSkew) {
    fail("token_expired");
  }
  if (notBefore > input.nowEpochSeconds + clockSkew) {
    fail("token_not_yet_valid");
  }

  const activity = parseActivityBody(input.rawActivityBody);
  const activityServiceUrl = parseSafeServiceUrl(
    activity.serviceUrl,
    "invalid_activity_service_url",
  );
  const tokenServiceUrl = parseSafeServiceUrl(
    payload.serviceurl,
    "invalid_token_service_url",
  );
  if (
    tokenServiceUrl.origin !== activityServiceUrl.origin ||
    tokenServiceUrl.pathname !== activityServiceUrl.pathname
  ) {
    fail("service_url_mismatch");
  }

  // All bounded structural and claim checks intentionally precede key lookup.
  let jwk: JsonWebKey | null;
  try {
    jwk = await input.resolvePublicJwk(header.kid);
  } catch {
    return fail("key_resolution_failed");
  }
  if (!isUsablePublicRsaJwk(jwk, header.kid)) fail("invalid_public_key");

  let publicKey: CryptoKey;
  try {
    publicKey = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  } catch {
    return fail("invalid_public_key");
  }

  let validSignature = false;
  try {
    validSignature = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      signature,
      encoder.encode(`${headerSegment}.${payloadSegment}`),
    );
  } catch {
    return fail("invalid_signature");
  }
  if (!validSignature) fail("invalid_signature");

  return {
    issuer: TEAMS_BOT_EXPECTED_ISSUER,
    audience: input.microsoftAppId,
    keyId: header.kid,
    serviceUrl: `${tokenServiceUrl.origin}${tokenServiceUrl.pathname}`,
    expiresAt,
    notBefore,
  };
}
