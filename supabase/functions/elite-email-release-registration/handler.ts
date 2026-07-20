import { parseBoundedJsonObject } from "../_shared/bounded-json.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{7,255}$/;
const IDEMPOTENCY = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const SIGNATURE = /^hmac-sha256:[a-f0-9]{64}$/;
const DOMAIN =
  /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const MAX_BODY_BYTES = 16 * 1_024;
const NO_AUTHORITY = Object.freeze({
  contact_authorized: false,
  launch_authorized: false,
  queue_mutation_authorized: false,
  crm_write_authorized: false,
  provider_write_authorized: false,
  spend_authorized: false,
});
const NO_SIDE_EFFECTS = Object.freeze({
  database_reads: 0,
  database_writes: 0,
  network_requests: 0,
  provider_calls: 0,
  external_messages: 0,
});
const BODY_FIELDS = Object.freeze(
  [
    "kind",
    "status",
    "organization_id",
    "campaign_id",
    "provider",
    "sender_domain",
    "provider_account_reference",
    "recipient_manifest_sha256",
    "recipient_count",
    "source_release_reference",
    "suppression_snapshot_sha256",
    "approvals",
    "handoff_proposal_sha256",
    "execution_key_id",
    "signer_principal_reference",
    "idempotency_key",
    "issued_at",
    "expires_at",
  ] as const,
);
const RELEASE_FIELDS = Object.freeze(
  [
    ...BODY_FIELDS,
    "signature",
    "recipient_data_included",
    "provider_action",
    "authority",
    "side_effect_invariants",
  ] as const,
);

export type EliteEmailReleaseRegistrationInput = {
  organization_id: string;
  user_id: string;
  campaign_id: string;
  provider: "instantly" | "mailgun";
  release_fingerprint: string;
  handoff_proposal_sha256: string;
  provider_account_reference: string;
  sender_domain: string;
  recipient_manifest_sha256: string;
  recipient_count: number;
  source_release_reference: string;
  suppression_snapshot_sha256: string;
  copy_approval_reference: string;
  compliance_approval_reference: string;
  owner_approval_reference: string;
  execution_key_id: string;
  signer_principal_reference: string;
  idempotency_key: string;
  expires_at: string;
};

export interface EliteEmailReleaseRegistrationStore {
  register(input: EliteEmailReleaseRegistrationInput): Promise<{
    registered: boolean;
    release_id: string | null;
    release_state: string | null;
    reason_code: string;
  }>;
}

export interface EliteEmailReleaseRegistrationDependencies {
  getEnvironment: (name: string) => string | undefined;
  authenticate: (jwt: string) => Promise<string | null>;
  store: EliteEmailReleaseRegistrationStore;
  now?: () => Date;
}

type Configuration = {
  ownerUserId: string;
  allowedOrigin: string;
  organizationId: string;
  campaignId: string;
  signingKeyId: string;
  signingKey: CryptoKey;
};

type VerifiedRelease = Omit<EliteEmailReleaseRegistrationInput, "user_id">;

function noStoreResponse(
  status: number,
  body: Record<string, unknown>,
  origin: string | null,
  configuration: Configuration | null,
): Response {
  const headers = new Headers({
    "Cache-Control": "no-store, max-age=0",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
  });
  if (origin !== null && configuration?.allowedOrigin === origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set(
      "Access-Control-Allow-Headers",
      "authorization, content-type, x-client-info, apikey",
    );
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  }
  if (status === 204) return new Response(null, { status, headers });
  return new Response(JSON.stringify({ ...body, authority: NO_AUTHORITY }), {
    status,
    headers,
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
  fields: readonly string[],
): Record<string, unknown> | null {
  const record = plainObject(value);
  if (!record || Object.keys(record).length !== fields.length) return null;
  return fields.every((field) => Object.hasOwn(record, field)) ? record : null;
}

function safeText(
  value: unknown,
  minimum: number,
  maximum: number,
): string | null {
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
  const candidate = safeText(value, 36, 36);
  return candidate && UUID.test(candidate) ? candidate : null;
}

function reference(value: unknown): string | null {
  const candidate = safeText(value, 8, 256);
  return candidate && REFERENCE.test(candidate) ? candidate : null;
}

function digest(value: unknown): string | null {
  const candidate = safeText(value, 64, 64)?.toLowerCase();
  return candidate && SHA256.test(candidate) ? candidate : null;
}

function domain(value: unknown): string | null {
  const candidate = safeText(value, 4, 253)?.toLowerCase();
  return candidate && DOMAIN.test(candidate) ? candidate : null;
}

function timestamp(value: unknown): string | null {
  const candidate = safeText(value, 20, 40);
  const parsed = candidate ? Date.parse(candidate) : Number.NaN;
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  const record = plainObject(value);
  if (record) {
    return Object.fromEntries(
      Object.keys(record).sort().map((key) => [key, canonicalize(record[key])]),
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function constantTimeHexEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function bytesFromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  const match = value.match(/^base64url:([A-Za-z0-9_-]{43})$/);
  if (!match) return null;
  let decoded: string;
  try {
    decoded = atob(match[1].replace(/-/g, "+").replace(/_/g, "/") + "=");
  } catch {
    return null;
  }
  if (decoded.length !== 32) return null;
  const bytes = new Uint8Array(32) as Uint8Array<ArrayBuffer>;
  const values = new Set<number>();
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
    values.add(bytes[index]);
  }
  return values.size >= 16 ? bytes : null;
}

function ownedBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const owned = new Uint8Array(bytes.byteLength) as Uint8Array<ArrayBuffer>;
  owned.set(bytes);
  return owned;
}

async function hmacHex(key: CryptoKey, material: string): Promise<string> {
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(material),
  );
  return [...new Uint8Array(signed)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(material: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(material),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function validBearer(value: string | null): string | null {
  if (!value || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length);
  return token.length >= 100 && token.length <= 8_192 && !/\s/.test(token)
    ? token
    : null;
}

async function parseConfiguration(
  getEnvironment: EliteEmailReleaseRegistrationDependencies["getEnvironment"],
): Promise<Configuration | null> {
  if (getEnvironment("ELITE_EMAIL_RELEASE_REGISTRATION_ENABLED") !== "true") {
    return null;
  }
  const ownerUserId = uuid(
    getEnvironment("ELITE_EMAIL_RELEASE_REGISTRATION_OWNER_USER_ID"),
  );
  const organizationId = uuid(
    getEnvironment("ELITE_EMAIL_RELEASE_REGISTRATION_ORGANIZATION_ID"),
  );
  const campaignId = uuid(
    getEnvironment("ELITE_EMAIL_RELEASE_REGISTRATION_CAMPAIGN_ID"),
  );
  const signingKeyId = reference(
    getEnvironment("ELITE_EMAIL_RELEASE_REGISTRATION_SIGNING_KEY_ID"),
  );
  const allowedOrigin = getEnvironment(
    "ELITE_EMAIL_RELEASE_REGISTRATION_ALLOWED_ORIGIN",
  );
  const keyBytes = bytesFromBase64Url(
    getEnvironment("ELITE_EMAIL_RELEASE_REGISTRATION_SIGNING_HMAC_KEY") || "",
  );
  if (
    !ownerUserId || !organizationId || !campaignId || !signingKeyId ||
    !allowedOrigin || !keyBytes || allowedOrigin.length > 512
  ) return null;
  let origin: URL;
  try {
    origin = new URL(allowedOrigin);
  } catch {
    return null;
  }
  if (
    origin.protocol !== "https:" || origin.username || origin.password ||
    origin.pathname !== "/" || origin.search || origin.hash ||
    origin.origin !== allowedOrigin
  ) return null;
  const signingKey = await crypto.subtle.importKey(
    "raw",
    ownedBytes(keyBytes),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return Object.freeze({
    ownerUserId,
    organizationId,
    campaignId,
    signingKeyId,
    allowedOrigin,
    signingKey,
  });
}

async function readBoundedBody(request: Request): Promise<Uint8Array> {
  const declared = request.headers.get("content-length");
  if (
    declared !== null &&
    (!/^(?:0|[1-9][0-9]*)$/.test(declared) ||
      Number(declared) > MAX_BODY_BYTES)
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
      if (length > MAX_BODY_BYTES) {
        await reader.cancel("elite_email_release_body_limit");
        throw new Error("BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function verifyRelease(
  rawBody: Uint8Array,
  configuration: Configuration,
  now: Date,
): Promise<VerifiedRelease | null> {
  let parsed: Record<string, unknown>;
  try {
    parsed = parseBoundedJsonObject(
      new TextDecoder("utf-8", { fatal: true }).decode(rawBody),
    );
  } catch {
    return null;
  }
  const release = exactKeys(parsed, RELEASE_FIELDS);
  if (
    !release ||
    release.kind !== "elite_solar_email_execution_release_candidate_v1" ||
    release.status !== "pending_future_server_adapter_verification" ||
    release.recipient_data_included !== false ||
    release.provider_action !== "none" ||
    canonicalJson(release.authority) !== canonicalJson(NO_AUTHORITY) ||
    canonicalJson(release.side_effect_invariants) !==
      canonicalJson(NO_SIDE_EFFECTS)
  ) return null;

  const body = Object.fromEntries(
    BODY_FIELDS.map((field) => [field, release[field]]),
  );
  const organizationId = uuid(body.organization_id);
  const campaignId = uuid(body.campaign_id);
  const provider = safeText(body.provider, 7, 16);
  const senderDomain = domain(body.sender_domain);
  const providerAccountReference = reference(body.provider_account_reference);
  const recipientManifestSha256 = digest(body.recipient_manifest_sha256);
  const sourceReleaseReference = reference(body.source_release_reference);
  const suppressionSnapshotSha256 = digest(body.suppression_snapshot_sha256);
  const handoffProposalSha256 = digest(body.handoff_proposal_sha256);
  const executionKeyId = reference(body.execution_key_id);
  const signerPrincipalReference = reference(body.signer_principal_reference);
  const idempotencyKey = safeText(body.idempotency_key, 16, 128);
  const recipientCount = typeof body.recipient_count === "number" &&
      Number.isInteger(body.recipient_count) &&
      body.recipient_count >= 1 && body.recipient_count <= 25
    ? body.recipient_count
    : null;
  const issuedAt = timestamp(body.issued_at);
  const expiresAt = timestamp(body.expires_at);
  const approvals = exactKeys(body.approvals, ["copy", "compliance", "owner"]);
  const signature = safeText(release.signature, 76, 76)?.toLowerCase();
  if (
    !organizationId || organizationId !== configuration.organizationId ||
    !campaignId || campaignId !== configuration.campaignId ||
    (provider !== "instantly" && provider !== "mailgun") || !senderDomain ||
    !providerAccountReference || !recipientManifestSha256 ||
    recipientCount === null || !sourceReleaseReference ||
    !suppressionSnapshotSha256 || !handoffProposalSha256 ||
    !executionKeyId || executionKeyId !== configuration.signingKeyId ||
    !signerPrincipalReference || !idempotencyKey ||
    !IDEMPOTENCY.test(idempotencyKey) ||
    !issuedAt || !expiresAt || !approvals || !signature ||
    !SIGNATURE.test(signature)
  ) return null;
  const copyApprovalReference = reference(approvals.copy);
  const complianceApprovalReference = reference(approvals.compliance);
  const ownerApprovalReference = reference(approvals.owner);
  const issuedMs = Date.parse(issuedAt);
  const expiresMs = Date.parse(expiresAt);
  if (
    !copyApprovalReference || !complianceApprovalReference ||
    !ownerApprovalReference || issuedMs > now.getTime() ||
    now.getTime() - issuedMs > 24 * 60 * 60 * 1_000 ||
    expiresMs <= now.getTime() || expiresMs > issuedMs + 24 * 60 * 60 * 1_000
  ) return null;
  const expectedSignature = `hmac-sha256:${await hmacHex(
    configuration.signingKey,
    canonicalJson(body),
  )}`;
  if (!constantTimeHexEqual(expectedSignature, signature)) return null;
  return Object.freeze({
    organization_id: organizationId,
    campaign_id: campaignId,
    provider,
    release_fingerprint: `sha256:${await sha256Hex(canonicalJson(body))}`,
    handoff_proposal_sha256: handoffProposalSha256,
    provider_account_reference: providerAccountReference,
    sender_domain: senderDomain,
    recipient_manifest_sha256: recipientManifestSha256,
    recipient_count: recipientCount,
    source_release_reference: sourceReleaseReference,
    suppression_snapshot_sha256: suppressionSnapshotSha256,
    copy_approval_reference: copyApprovalReference,
    compliance_approval_reference: complianceApprovalReference,
    owner_approval_reference: ownerApprovalReference,
    execution_key_id: executionKeyId,
    signer_principal_reference: signerPrincipalReference,
    idempotency_key: idempotencyKey,
    expires_at: expiresAt,
  });
}

/**
 * Authenticated R0 signed-release registration. This accepts only a bounded
 * no-PII artifact for one configured Elite Solar tenant/campaign, verifies its
 * HMAC server-side, and leaves the result pending adapter verification. It
 * cannot prepare, claim, send, import, or invoke a provider.
 */
export async function handleEliteEmailReleaseRegistrationRequest(
  request: Request,
  deps: EliteEmailReleaseRegistrationDependencies,
): Promise<Response> {
  const configuration = await parseConfiguration(deps.getEnvironment);
  const origin = request.headers.get("origin");
  if (!configuration) {
    return noStoreResponse(
      503,
      {
        ok: false,
        error_code: "ELITE_EMAIL_RELEASE_REGISTRATION_NOT_PROVISIONED",
      },
      origin,
      null,
    );
  }
  if (origin !== null && origin !== configuration.allowedOrigin) {
    return noStoreResponse(
      403,
      { ok: false, error_code: "ORIGIN_FORBIDDEN" },
      origin,
      configuration,
    );
  }
  if (request.method === "OPTIONS") {
    return noStoreResponse(204, {}, origin, configuration);
  }
  if (request.method !== "POST") {
    return noStoreResponse(
      405,
      { ok: false, error_code: "METHOD_NOT_ALLOWED" },
      origin,
      configuration,
    );
  }
  if (
    !request.headers.get("content-type")?.toLowerCase().startsWith(
      "application/json",
    )
  ) {
    return noStoreResponse(
      415,
      { ok: false, error_code: "APPLICATION_JSON_REQUIRED" },
      origin,
      configuration,
    );
  }
  if (new URL(request.url).search !== "") {
    return noStoreResponse(
      400,
      { ok: false, error_code: "INVALID_REQUEST" },
      origin,
      configuration,
    );
  }
  const jwt = validBearer(request.headers.get("authorization"));
  if (!jwt) {
    return noStoreResponse(
      401,
      { ok: false, error_code: "AUTH_REQUIRED" },
      origin,
      configuration,
    );
  }
  let userId: string | null;
  try {
    userId = await deps.authenticate(jwt);
  } catch {
    userId = null;
  }
  if (userId !== configuration.ownerUserId) {
    return noStoreResponse(
      403,
      { ok: false, error_code: "OWNER_FORBIDDEN" },
      origin,
      configuration,
    );
  }
  let rawBody: Uint8Array;
  try {
    rawBody = await readBoundedBody(request);
  } catch {
    return noStoreResponse(
      400,
      { ok: false, error_code: "INVALID_REQUEST" },
      origin,
      configuration,
    );
  }
  const verified = await verifyRelease(
    rawBody,
    configuration,
    (deps.now || (() => new Date()))(),
  );
  if (!verified) {
    return noStoreResponse(
      422,
      { ok: false, error_code: "SIGNED_RELEASE_HELD" },
      origin,
      configuration,
    );
  }
  try {
    const recorded = await deps.store.register({
      ...verified,
      user_id: configuration.ownerUserId,
    });
    if (
      !recorded.registered &&
      recorded.reason_code !== "EMAIL_RELEASE_ALREADY_REGISTERED"
    ) {
      return noStoreResponse(
        503,
        { ok: false, error_code: "RELEASE_REGISTRATION_HELD" },
        origin,
        configuration,
      );
    }
    return noStoreResponse(
      200,
      {
        ok: true,
        kind: "elite_email_release_registration_v1",
        registered: recorded.registered,
        release_id: recorded.release_id,
        release_state: recorded.release_state,
        statement:
          "The signed release is durable but remains pending adapter verification. This does not prepare, claim, send, import, or invoke a provider.",
        provider_action: "none",
        side_effect_invariants: {
          database_writes: recorded.registered ? 1 : 0,
          provider_calls: 0,
          external_messages: 0,
        },
      },
      origin,
      configuration,
    );
  } catch {
    return noStoreResponse(
      503,
      { ok: false, error_code: "RELEASE_REGISTRATION_COMMIT_FAILED" },
      origin,
      configuration,
    );
  }
}
