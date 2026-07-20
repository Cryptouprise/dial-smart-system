import {
  ELITE_SOLAR_NO_AUTHORITY,
  EliteSolarProviderReadinessError,
  inspectEliteSolarInstantly,
  inspectEliteSolarMailgun,
  inspectEliteSolarRetell,
  type ProviderFetch,
} from "../_shared/elite-solar-provider-readiness.ts";

const CANONICAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]{2,79}$/;
const MAX_BODY_BYTES = 1_024;

export interface EliteSolarPreflightDependencies {
  getEnvironment: (name: string) => string | undefined;
  authenticate: (jwt: string) => Promise<string | null>;
  fetchImpl?: ProviderFetch;
}

type PreflightConfiguration = Readonly<{
  ownerUserId: string;
  allowedOrigin: string;
}>;

function response(
  status: number,
  body: Record<string, unknown>,
  origin: string | null,
  configuration: PreflightConfiguration | null,
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
  return new Response(
    JSON.stringify({ ...body, authority: ELITE_SOLAR_NO_AUTHORITY }),
    {
      status,
      headers,
    },
  );
}

function parseConfiguration(
  getEnvironment: EliteSolarPreflightDependencies["getEnvironment"],
): PreflightConfiguration | null {
  if (getEnvironment("ELITE_SOLAR_PREFLIGHT_ENABLED") !== "true") return null;
  const ownerUserId = getEnvironment("ELITE_SOLAR_PREFLIGHT_OWNER_USER_ID");
  const allowedOrigin = getEnvironment("ELITE_SOLAR_PREFLIGHT_ALLOWED_ORIGIN");
  if (
    !ownerUserId || !CANONICAL_UUID.test(ownerUserId) || !allowedOrigin ||
    allowedOrigin.length > 512
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
  return Object.freeze({ ownerUserId, allowedOrigin });
}

function validBearer(value: string | null): string | null {
  if (!value || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length);
  return token.length >= 100 && token.length <= 8_192 && !/\s/.test(token)
    ? token
    : null;
}

function safeErrorCode(error: unknown): string {
  return error instanceof EliteSolarProviderReadinessError &&
      SAFE_ERROR_CODE.test(error.code)
    ? error.code
    : "PROVIDER_READINESS_FAILED";
}

async function readExactEmptyObject(request: Request): Promise<boolean> {
  const contentLength = request.headers.get("content-length");
  if (
    contentLength !== null &&
    (!/^(?:0|[1-9][0-9]*)$/.test(contentLength) ||
      Number(contentLength) > MAX_BODY_BYTES)
  ) return false;
  const reader = request.body?.getReader();
  if (!reader) return true;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel("elite_solar_preflight_body_too_large");
        return false;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (size === 0) return true;
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body).trim() ===
      "{}";
  } catch {
    return false;
  }
}

function configured(values: readonly (string | undefined)[]): boolean {
  return values.every((value) => typeof value === "string" && value.length > 0);
}

function configurationRequired(provider: string, variables: readonly string[]) {
  return Object.freeze({
    provider,
    status: "configuration_required",
    required_environment: [...variables],
    provider_action: "none",
    provider_read_probe_calls: 0,
  });
}

async function inspectConfigured(
  provider: string,
  variables: readonly string[],
  values: readonly (string | undefined)[],
  inspect: () => Promise<Record<string, unknown>>,
) {
  if (!configured(values)) return configurationRequired(provider, variables);
  try {
    const result = await inspect();
    return Object.freeze({
      provider,
      status: result.status === "verified" ? "verified" : "attention_required",
      readiness: result,
      provider_action: "none",
      provider_read_probe_calls:
        typeof result.provider_read_probe_calls === "number"
          ? result.provider_read_probe_calls
          : 0,
    });
  } catch (error) {
    return Object.freeze({
      provider,
      status: "readiness_blocked",
      error_code: safeErrorCode(error),
      provider_action: "none",
      provider_read_probe_calls: 0,
    });
  }
}

function laneProbeCalls(lane: Record<string, unknown>): number {
  const count = lane.provider_read_probe_calls;
  return typeof count === "number" && Number.isSafeInteger(count) && count >= 0
    ? count
    : 0;
}

function overallStatus(lanes: readonly Record<string, unknown>[]): string {
  const statuses = lanes.map((lane) => lane.status);
  if (
    statuses.some((status) =>
      status === "readiness_blocked" || status === "attention_required"
    )
  ) {
    return "offline_bundle_ready_readiness_blocked";
  }
  if (statuses.some((status) => status === "configuration_required")) {
    return "offline_bundle_ready_configuration_required";
  }
  return "offline_bundle_ready_readiness_observed";
}

/**
 * Authenticated R0 provider preflight. This function only reads provider
 * configuration after an exact owner match; it neither accepts nor returns any
 * provider/customer record and has no effectful route or dependency.
 */
export async function handleEliteSolarPreflightRequest(
  request: Request,
  deps: EliteSolarPreflightDependencies,
): Promise<Response> {
  const configuration = parseConfiguration(deps.getEnvironment);
  const origin = request.headers.get("origin");
  if (!configuration) {
    return response(
      503,
      {
        ok: false,
        error_code: "ELITE_SOLAR_PREFLIGHT_NOT_PROVISIONED",
        message: "Elite Solar server preflight is not provisioned.",
      },
      origin,
      null,
    );
  }
  if (origin !== null && origin !== configuration.allowedOrigin) {
    return response(
      403,
      { ok: false, error_code: "ORIGIN_FORBIDDEN" },
      origin,
      configuration,
    );
  }
  if (request.method === "OPTIONS") {
    return response(204, {}, origin, configuration);
  }
  if (request.method !== "POST") {
    return response(
      405,
      { ok: false, error_code: "METHOD_NOT_ALLOWED" },
      origin,
      configuration,
    );
  }
  if (
    new URL(request.url).search !== "" || !await readExactEmptyObject(request)
  ) {
    return response(
      400,
      { ok: false, error_code: "INVALID_REQUEST" },
      origin,
      configuration,
    );
  }
  const jwt = validBearer(request.headers.get("authorization"));
  if (!jwt) {
    return response(
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
    return response(
      403,
      { ok: false, error_code: "OWNER_FORBIDDEN" },
      origin,
      configuration,
    );
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const retell = await inspectConfigured(
    "retell",
    [
      "RETELL_API_KEY",
      "RETELL_AGENT_ID",
      "RETELL_AGENT_VERSION",
      "RETELL_EXPECTED_WEBHOOK_URL",
    ],
    [
      deps.getEnvironment("RETELL_API_KEY") ??
        deps.getEnvironment("RETELL_AI_API_KEY"),
      deps.getEnvironment("RETELL_AGENT_ID"),
      deps.getEnvironment("RETELL_AGENT_VERSION"),
      deps.getEnvironment("RETELL_EXPECTED_WEBHOOK_URL"),
    ],
    () =>
      inspectEliteSolarRetell({
        apiKey: deps.getEnvironment("RETELL_API_KEY") ??
          deps.getEnvironment("RETELL_AI_API_KEY"),
        agentId: deps.getEnvironment("RETELL_AGENT_ID"),
        agentVersion: deps.getEnvironment("RETELL_AGENT_VERSION"),
        expectedWebhookUrl: deps.getEnvironment("RETELL_EXPECTED_WEBHOOK_URL"),
      }, fetchImpl),
  );
  const instantly = await inspectConfigured(
    "instantly",
    ["INSTANTLY_API_KEY"],
    [deps.getEnvironment("INSTANTLY_API_KEY")],
    () =>
      inspectEliteSolarInstantly(
        deps.getEnvironment("INSTANTLY_API_KEY"),
        fetchImpl,
      ),
  );
  const mailgun = await inspectConfigured(
    "mailgun",
    ["MAILGUN_API_KEY", "MAILGUN_DOMAIN"],
    [
      deps.getEnvironment("MAILGUN_API_KEY"),
      deps.getEnvironment("MAILGUN_DOMAIN"),
    ],
    () =>
      inspectEliteSolarMailgun({
        apiKey: deps.getEnvironment("MAILGUN_API_KEY"),
        domain: deps.getEnvironment("MAILGUN_DOMAIN"),
        useEuBase: deps.getEnvironment("MAILGUN_REGION") === "eu",
      }, fetchImpl),
  );
  const providerReadProbeCalls = laneProbeCalls(retell) +
    laneProbeCalls(instantly) + laneProbeCalls(mailgun);
  const status = overallStatus([retell, instantly, mailgun]);
  return response(
    200,
    {
      ok: true,
      kind: "elite_solar_server_preflight_v1",
      status,
      statement:
        "This is a redacted read-only posture check. Provider health never establishes source consent, a contact release, or authority to call, text, email, import, queue, write a CRM, or spend.",
      provider_lanes: {
        retell,
        email: { instantly, mailgun },
      },
      authority: ELITE_SOLAR_NO_AUTHORITY,
      side_effect_invariants: {
        database_reads: 0,
        database_writes: 0,
        provider_read_probe_calls: providerReadProbeCalls,
        provider_writes: 0,
        external_messages: 0,
      },
    },
    origin,
    configuration,
  );
}
