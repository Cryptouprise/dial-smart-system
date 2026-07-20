import { parseBoundedJsonObject } from "../_shared/bounded-json.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{7,255}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const SIGNATURE = /^(?:[A-Za-z0-9+/]{86}==)$/;
const MAX_BODY_BYTES = 16 * 1024;
const AUTHORITY = Object.freeze({
  contact_authorized: false,
  launch_authorized: false,
  queue_mutation_authorized: false,
  crm_write_authorized: false,
  provider_write_authorized: false,
  spend_authorized: false,
});
const EFFECTS = Object.freeze({
  database_reads: 0,
  database_writes: 1,
  network_requests: 0,
  provider_calls: 0,
  external_messages: 0,
});
const FIELDS = [
  "kind",
  "status",
  "organization_id",
  "campaign_id",
  "source_system",
  "source_release_reference",
  "recipient_manifest_sha256",
  "suppression_snapshot_sha256",
  "recipient_count",
  "email_permission_policy",
  "suppression_policy",
  "evidence_as_of",
  "issued_at",
  "expires_at",
  "signing_key_id",
  "signer_principal_reference",
  "public_key_spki_sha256",
] as const;
const ROOT_FIELDS = ["release_id", "attestation"] as const;
const ATTESTATION_FIELDS = [
  ...FIELDS,
  "signature_base64",
  "recipient_data_included",
  "provider_action",
  "authority",
  "side_effect_invariants",
] as const;

type Verified = {
  release_id: string;
  organization_id: string;
  campaign_id: string;
  attestation_fingerprint: string;
  source_system: string;
  source_release_reference: string;
  recipient_manifest_sha256: string;
  suppression_snapshot_sha256: string;
  recipient_count: number;
  signing_key_id: string;
  signer_principal_reference: string;
  public_key_spki_sha256: string;
  evidence_as_of: string;
  issued_at: string;
  expires_at: string;
};
export interface EliteEmailReleasePreparationStore {
  prepare(
    input: Verified & { user_id: string },
  ): Promise<
    {
      prepared: boolean;
      release_id: string | null;
      release_state: string | null;
      reason_code: string;
    }
  >;
}
export interface EliteEmailReleasePreparationDependencies {
  getEnvironment(name: string): string | undefined;
  authenticate(jwt: string): Promise<string | null>;
  store: EliteEmailReleasePreparationStore;
  now?: () => Date;
}
type Config = {
  owner: string;
  organization: string;
  campaign: string;
  origin: string;
  keyId: string;
  signer: string;
  spkiSha: string;
  key: CryptoKey;
};

function object(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const p = Object.getPrototypeOf(value);
  return p === Object.prototype || p === null
    ? value as Record<string, unknown>
    : null;
}
function exact(
  value: unknown,
  fields: readonly string[],
): Record<string, unknown> | null {
  const record = object(value);
  return record && Object.keys(record).length === fields.length &&
      fields.every((field) => Object.hasOwn(record, field))
    ? record
    : null;
}
function text(value: unknown, min: number, max: number): string | null {
  if (
    typeof value !== "string" || value !== value.trim() || value.length < min ||
    value.length > max
  ) return null;
  for (const char of value) {
    const n = char.codePointAt(0) || 0;
    if (
      n <= 0x1f || (n >= 0x7f && n <= 0x9f) || (n >= 0x200b && n <= 0x200f) ||
      (n >= 0x202a && n <= 0x202e) || (n >= 0x2060 && n <= 0x206f) ||
      n === 0xfeff
    ) return null;
  }
  return value;
}
function uuid(value: unknown): string | null {
  const x = text(value, 36, 36);
  return x && UUID.test(x) ? x : null;
}
function ref(value: unknown): string | null {
  const x = text(value, 8, 256);
  return x && REFERENCE.test(x) ? x : null;
}
function sha(value: unknown): string | null {
  const x = text(value, 64, 64)?.toLowerCase();
  return x && SHA256.test(x) ? x : null;
}
function time(value: unknown): string | null {
  const x = text(value, 20, 40);
  const n = x ? Date.parse(x) : Number.NaN;
  return Number.isFinite(n) ? new Date(n).toISOString() : null;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  const record = object(value);
  return record
    ? Object.fromEntries(
      Object.keys(record).sort().map((key) => [key, canonical(record[key])]),
    )
    : value;
}
function json(value: unknown): string {
  return JSON.stringify(canonical(value));
}
function bytes(value: string): Uint8Array | null {
  try {
    const raw = atob(value);
    const result = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) result[i] = raw.charCodeAt(i);
    return result;
  } catch {
    return null;
  }
}
function ownedBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const owned = new Uint8Array(value.byteLength) as Uint8Array<ArrayBuffer>;
  owned.set(value);
  return owned;
}
async function fingerprint(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(json(value)),
  );
  return `sha256:${
    [...new Uint8Array(digest)].map((byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("")
  }`;
}
async function sha256Bytes(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", ownedBytes(value));
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}
function bearer(value: string | null): string | null {
  if (!value?.startsWith("Bearer ")) return null;
  const token = value.slice(7);
  return token.length >= 100 && token.length <= 8192 && !/\s/.test(token)
    ? token
    : null;
}
function response(
  status: number,
  body: Record<string, unknown>,
  origin: string | null,
  config: Config | null,
): Response {
  const headers = new Headers({
    "Cache-Control": "no-store, max-age=0",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
  });
  if (origin && config?.origin === origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set(
      "Access-Control-Allow-Headers",
      "authorization, content-type, x-client-info, apikey",
    );
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  }
  return new Response(
    status === 204 ? null : JSON.stringify({ ...body, authority: AUTHORITY }),
    { status, headers },
  );
}

async function config(
  get: EliteEmailReleasePreparationDependencies["getEnvironment"],
): Promise<Config | null> {
  if (get("ELITE_EMAIL_RELEASE_PREPARATION_ENABLED") !== "true") return null;
  const owner = uuid(get("ELITE_EMAIL_RELEASE_PREPARATION_OWNER_USER_ID"));
  const organization = uuid(
    get("ELITE_EMAIL_RELEASE_PREPARATION_ORGANIZATION_ID"),
  );
  const campaign = uuid(get("ELITE_EMAIL_RELEASE_PREPARATION_CAMPAIGN_ID"));
  const keyId = ref(get("ELITE_EMAIL_RELEASE_PREPARATION_SIGNING_KEY_ID"));
  const signer = ref(
    get("ELITE_EMAIL_RELEASE_PREPARATION_SIGNER_PRINCIPAL_REFERENCE"),
  );
  const spkiSha = sha(
    get("ELITE_EMAIL_RELEASE_PREPARATION_PUBLIC_KEY_SPKI_SHA256"),
  );
  const origin = get("ELITE_EMAIL_RELEASE_PREPARATION_ALLOWED_ORIGIN");
  const encoded = get("ELITE_EMAIL_RELEASE_PREPARATION_PUBLIC_KEY_SPKI_BASE64");
  if (
    !owner || !organization || !campaign || !keyId || !signer || !spkiSha ||
    !origin || !encoded?.startsWith("base64:")
  ) return null;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== "https:" || parsed.origin !== origin ||
    parsed.pathname !== "/" || parsed.search || parsed.hash ||
    parsed.username || parsed.password
  ) return null;
  const raw = bytes(encoded.slice(7));
  if (!raw || raw.byteLength < 32 || raw.byteLength > 1024) return null;
  const actual = await sha256Bytes(raw);
  if (actual !== spkiSha) return null;
  try {
    return {
      owner,
      organization,
      campaign,
      keyId,
      signer,
      spkiSha,
      origin,
      key: await crypto.subtle.importKey(
        "spki",
        ownedBytes(raw),
        { name: "Ed25519" },
        false,
        ["verify"],
      ),
    };
  } catch {
    return null;
  }
}
async function body(request: Request): Promise<Uint8Array> {
  const declared = request.headers.get("content-length");
  if (
    declared &&
    (!/^(?:0|[1-9][0-9]*)$/.test(declared) || Number(declared) > MAX_BODY_BYTES)
  ) throw new Error("BODY_TOO_LARGE");
  const raw = new Uint8Array(await request.arrayBuffer());
  if (raw.byteLength > MAX_BODY_BYTES) throw new Error("BODY_TOO_LARGE");
  return raw;
}

async function verify(
  raw: Uint8Array,
  config: Config,
  now: Date,
): Promise<Verified | null> {
  let input: Record<string, unknown>;
  try {
    input = parseBoundedJsonObject(
      new TextDecoder("utf-8", { fatal: true }).decode(raw),
    );
  } catch {
    return null;
  }
  const root = exact(input, ROOT_FIELDS);
  const releaseId = root && uuid(root.release_id);
  const attestation = root && exact(root.attestation, ATTESTATION_FIELDS);
  if (
    !releaseId || !attestation ||
    attestation.kind !== "elite_email_source_suppression_attestation_v1" ||
    attestation.status !== "current_source_and_suppression_verified" ||
    attestation.email_permission_policy !== "explicit_opt_in_per_recipient" ||
    attestation.suppression_policy !== "all_current_negative_checks" ||
    attestation.recipient_data_included !== false ||
    attestation.provider_action !== "none" ||
    json(attestation.authority) !== json(AUTHORITY) ||
    json(attestation.side_effect_invariants) !==
      json({ ...EFFECTS, database_writes: 0 })
  ) return null;
  const signed = Object.fromEntries(
    FIELDS.map((field) => [field, attestation[field]]),
  );
  const organization_id = uuid(signed.organization_id);
  const campaign_id = uuid(signed.campaign_id);
  const source_system = ref(signed.source_system);
  const source_release_reference = ref(signed.source_release_reference);
  const recipient_manifest_sha256 = sha(signed.recipient_manifest_sha256);
  const suppression_snapshot_sha256 = sha(signed.suppression_snapshot_sha256);
  const signing_key_id = ref(signed.signing_key_id);
  const signer_principal_reference = ref(signed.signer_principal_reference);
  const public_key_spki_sha256 = sha(signed.public_key_spki_sha256);
  const evidence_as_of = time(signed.evidence_as_of);
  const issued_at = time(signed.issued_at);
  const expires_at = time(signed.expires_at);
  const signature = text(attestation.signature_base64, 88, 88);
  const recipient_count = typeof signed.recipient_count === "number" &&
      Number.isInteger(signed.recipient_count) &&
      signed.recipient_count >= 1 && signed.recipient_count <= 25
    ? signed.recipient_count
    : null;
  if (
    !organization_id || organization_id !== config.organization ||
    !campaign_id || campaign_id !== config.campaign || !source_system ||
    !source_release_reference || !recipient_manifest_sha256 ||
    !suppression_snapshot_sha256 || !signing_key_id ||
    signing_key_id !== config.keyId || !signer_principal_reference ||
    signer_principal_reference !== config.signer || !public_key_spki_sha256 ||
    public_key_spki_sha256 !== config.spkiSha || !evidence_as_of ||
    !issued_at || !expires_at || !signature || !SIGNATURE.test(signature) ||
    recipient_count === null
  ) return null;
  const evidence = Date.parse(evidence_as_of);
  const issued = Date.parse(issued_at);
  const expires = Date.parse(expires_at);
  if (
    evidence > issued || issued - evidence > 300000 || expires <= issued ||
    expires - evidence > 86400000 || issued > now.getTime() ||
    expires <= now.getTime()
  ) return null;
  const sig = bytes(signature);
  if (
    !sig ||
    !await crypto.subtle.verify(
      "Ed25519",
      config.key,
      ownedBytes(sig),
      new TextEncoder().encode(json(signed)),
    )
  ) return null;
  return {
    release_id: releaseId,
    organization_id,
    campaign_id,
    attestation_fingerprint: await fingerprint(attestation),
    source_system,
    source_release_reference,
    recipient_manifest_sha256,
    suppression_snapshot_sha256,
    recipient_count,
    signing_key_id,
    signer_principal_reference,
    public_key_spki_sha256,
    evidence_as_of,
    issued_at,
    expires_at,
  };
}

/** Authenticated preparation endpoint. It verifies a bounded no-PII proof and may only prepare an already-registered release; it cannot claim, send, import, or call a provider. */
export async function handleEliteEmailReleasePreparationRequest(
  request: Request,
  deps: EliteEmailReleasePreparationDependencies,
): Promise<Response> {
  const settings = await config(deps.getEnvironment);
  const origin = request.headers.get("origin");
  if (!settings) {
    return response(
      503,
      {
        ok: false,
        error_code: "ELITE_EMAIL_RELEASE_PREPARATION_NOT_PROVISIONED",
      },
      origin,
      null,
    );
  }
  if (origin && origin !== settings.origin) {
    return response(
      403,
      { ok: false, error_code: "ORIGIN_FORBIDDEN" },
      origin,
      settings,
    );
  }
  if (request.method === "OPTIONS") return response(204, {}, origin, settings);
  if (request.method !== "POST") {
    return response(
      405,
      { ok: false, error_code: "METHOD_NOT_ALLOWED" },
      origin,
      settings,
    );
  }
  if (
    !request.headers.get("content-type")?.toLowerCase().startsWith(
      "application/json",
    ) || new URL(request.url).search
  ) {
    return response(
      400,
      { ok: false, error_code: "INVALID_REQUEST" },
      origin,
      settings,
    );
  }
  const token = bearer(request.headers.get("authorization"));
  if (!token || await deps.authenticate(token) !== settings.owner) {
    return response(
      401,
      { ok: false, error_code: "AUTHENTICATION_REQUIRED" },
      origin,
      settings,
    );
  }
  let verified: Verified | null;
  try {
    verified = await verify(
      await body(request),
      settings,
      deps.now?.() || new Date(),
    );
  } catch {
    verified = null;
  }
  if (!verified) {
    return response(
      422,
      { ok: false, error_code: "SOURCE_ATTESTATION_REJECTED" },
      origin,
      settings,
    );
  }
  try {
    const result = await deps.store.prepare({
      ...verified,
      user_id: settings.owner,
    });
    if (
      result.release_state !== "prepared" &&
      result.release_state !== "pending_adapter_provisioning"
    ) throw new Error("PREPARATION_RPC_INVALID");
    return response(
      200,
      {
        ok: result.prepared,
        kind: "elite_email_release_preparation_v1",
        prepared: result.prepared,
        release_id: result.release_id,
        release_state: result.release_state,
        reason_code: result.reason_code,
        provider_action: "none",
        side_effect_invariants: EFFECTS,
        statement:
          "Preparation records a verified no-PII source proof only. It does not claim, send, import, or invoke a provider.",
      },
      origin,
      settings,
    );
  } catch {
    return response(
      503,
      { ok: false, error_code: "ELITE_EMAIL_RELEASE_PREPARATION_UNAVAILABLE" },
      origin,
      settings,
    );
  }
}
