import { parseBoundedJsonObject } from "../_shared/bounded-json.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_BODY_BYTES = 256;
const RELEASE_STATES = new Set([
  "no_release",
  "pending_adapter_provisioning",
  "prepared",
  "claimed",
  "provider_accepted",
  "reconciliation_required",
  "completed",
  "held",
  "revoked",
  "expired",
]);
const AUTHORITY = Object.freeze({
  contact_authorized: false,
  launch_authorized: false,
  queue_mutation_authorized: false,
  crm_write_authorized: false,
  provider_write_authorized: false,
  spend_authorized: false,
});
const EFFECTS = Object.freeze({
  database_reads: 1,
  database_writes: 0,
  network_requests: 0,
  provider_calls: 0,
  external_messages: 0,
});

export type EliteEmailReleaseStatus = {
  release_state: string;
  recipient_count: number;
  expires_at: string | null;
};
export interface EliteEmailReleaseStatusStore {
  read(
    input: { organization_id: string; user_id: string; campaign_id: string },
  ): Promise<EliteEmailReleaseStatus>;
}
export interface EliteEmailReleaseStatusDependencies {
  getEnvironment(name: string): string | undefined;
  authenticate(jwt: string): Promise<string | null>;
  store: EliteEmailReleaseStatusStore;
}
type Configuration = {
  owner: string;
  organization: string;
  campaign: string;
  origin: string;
};

function uuid(value: string | undefined): string | null {
  return value && UUID.test(value) ? value : null;
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
  configuration: Configuration | null,
): Response {
  const headers = new Headers({
    "Cache-Control": "no-store, max-age=0",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
  });
  if (origin && configuration?.origin === origin) {
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
function configuration(
  getEnvironment: EliteEmailReleaseStatusDependencies["getEnvironment"],
): Configuration | null {
  if (getEnvironment("ELITE_EMAIL_RELEASE_STATUS_ENABLED") !== "true") {
    return null;
  }
  const owner = uuid(
    getEnvironment("ELITE_EMAIL_RELEASE_STATUS_OWNER_USER_ID"),
  );
  const organization = uuid(
    getEnvironment("ELITE_EMAIL_RELEASE_STATUS_ORGANIZATION_ID"),
  );
  const campaign = uuid(
    getEnvironment("ELITE_EMAIL_RELEASE_STATUS_CAMPAIGN_ID"),
  );
  const origin = getEnvironment("ELITE_EMAIL_RELEASE_STATUS_ALLOWED_ORIGIN");
  if (!owner || !organization || !campaign || !origin) return null;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "https:" && parsed.origin === origin &&
        parsed.pathname === "/" && !parsed.search && !parsed.hash &&
        !parsed.username && !parsed.password
      ? { owner, organization, campaign, origin }
      : null;
  } catch {
    return null;
  }
}
async function exactEmptyBody(request: Request): Promise<boolean> {
  const declared = request.headers.get("content-length");
  if (
    declared &&
    (!/^(?:0|[1-9][0-9]*)$/.test(declared) || Number(declared) > MAX_BODY_BYTES)
  ) return false;
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_BODY_BYTES) return false;
  try {
    const parsed = parseBoundedJsonObject(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
    return Object.keys(parsed).length === 0;
  } catch {
    return false;
  }
}
function validStatus(value: EliteEmailReleaseStatus): boolean {
  return RELEASE_STATES.has(value.release_state) &&
    Number.isInteger(value.recipient_count) && value.recipient_count >= 0 &&
    value.recipient_count <= 25 &&
    (value.expires_at === null ||
      Number.isFinite(Date.parse(value.expires_at)));
}

/** Exact-owner, summary-only status read. It cannot mutate a release or call a provider. */
export async function handleEliteEmailReleaseStatusRequest(
  request: Request,
  deps: EliteEmailReleaseStatusDependencies,
): Promise<Response> {
  const settings = configuration(deps.getEnvironment);
  const origin = request.headers.get("origin");
  if (!settings) {
    return response(
      503,
      { ok: false, error_code: "ELITE_EMAIL_RELEASE_STATUS_NOT_PROVISIONED" },
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
    ) || new URL(request.url).search || !await exactEmptyBody(request)
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
  try {
    const status = await deps.store.read({
      organization_id: settings.organization,
      user_id: settings.owner,
      campaign_id: settings.campaign,
    });
    if (!validStatus(status)) throw new Error("STATUS_INVALID");
    return response(
      200,
      {
        ok: true,
        kind: "elite_email_release_status_v1",
        release_state: status.release_state,
        recipient_count: status.recipient_count,
        expires_at: status.expires_at,
        provider_action: "none",
        side_effect_invariants: EFFECTS,
        statement:
          "This is a summary-only read. It does not prepare, claim, send, import, or invoke a provider.",
      },
      origin,
      settings,
    );
  } catch {
    return response(
      503,
      { ok: false, error_code: "ELITE_EMAIL_RELEASE_STATUS_UNAVAILABLE" },
      origin,
      settings,
    );
  }
}
