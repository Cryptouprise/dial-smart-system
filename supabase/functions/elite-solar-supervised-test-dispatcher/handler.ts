import { parseBoundedJsonObject } from "../_shared/bounded-json.ts";
import {
  buildRetellCreatePhoneCallPayload,
} from "../_shared/retell-provider-contract.ts";
import {
  inspectEliteSolarRetell,
  type ProviderFetch,
} from "../_shared/elite-solar-provider-readiness.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const E164 = /^\+[1-9]\d{7,14}$/;
const PROVIDER_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;
const MAX_BODY_BYTES = 1024;

export type SupervisedDispatch = {
  dispatch_id: string;
  test_run_id: string;
  provider: "telnyx" | "retell";
  channel: "sms" | "voice";
  idempotency_key: string;
  from_e164: string;
  to_e164: string;
  message_body: string | null;
  retell_agent_id: string | null;
  retell_agent_version: number | null;
  retell_webhook_url: string | null;
};

export type ClaimResult =
  | { kind: "empty" }
  | { kind: "not_claimed" }
  | { kind: "claimed"; dispatch: SupervisedDispatch };

export type DispatchFinalization = {
  dispatchId: string;
  dispatcherInstanceId: string;
  status: "accepted" | "definite_failure" | "acceptance_unknown";
  providerObjectId: string | null;
  providerResponseSha256: string | null;
  errorCode: string | null;
};

export interface EliteSolarSupervisedTestDispatchStore {
  claim(input: {
    testRunId: string;
    dispatcherInstanceId: string;
  }): Promise<ClaimResult>;
  finalize(input: DispatchFinalization): Promise<boolean>;
}

export type RetellReadiness = {
  status: string;
};

export interface EliteSolarSupervisedTestDispatchDependencies {
  getEnvironment(name: string): string | undefined;
  store: EliteSolarSupervisedTestDispatchStore;
  fetchImpl?: ProviderFetch;
  inspectRetell?: (input: {
    apiKey: unknown;
    agentId: unknown;
    agentVersion: unknown;
    expectedWebhookUrl: unknown;
  }, fetchImpl: ProviderFetch) => Promise<RetellReadiness>;
  now?: () => Date;
  randomUuid?: () => string;
}

type RuntimeConfig = {
  serviceRoleKey: string;
  supabaseUrl: string;
  retellWebhookUrl: string;
};

type TelnyxConfig = {
  apiKey: string;
  messagingProfileId: string;
};

type RetellConfig = {
  apiKey: string;
  agentId: string;
  agentVersion: number;
  webhookUrl: string;
};

function noStoreResponse(
  status: number,
  body?: Record<string, unknown>,
): Response {
  return new Response(body ? JSON.stringify(body) : null, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function plainObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null
    ? value as Record<string, unknown>
    : null;
}

function exactKeys(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> | null {
  const record = plainObject(value);
  if (!record || Object.keys(record).length !== keys.length) return null;
  return keys.every((key) => Object.hasOwn(record, key)) ? record : null;
}

function uuid(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

function text(value: unknown, minimum: number, maximum: number): string | null {
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

function privateSecret(value: unknown): string | null {
  const candidate = text(value, 16, 512);
  return candidate && !/\s/.test(candidate) ? candidate : null;
}

function equalConstantTime(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

function serviceRoleBearer(
  authorization: string | null,
  serviceRoleKey: string,
): boolean {
  if (!authorization?.startsWith("Bearer ")) return false;
  const token = authorization.slice("Bearer ".length);
  return token.length > 0 && equalConstantTime(token, serviceRoleKey);
}

function canonicalHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 12 || value.length > 512) {
    return null;
  }
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" || parsed.username || parsed.password ||
      parsed.search || parsed.hash || value !== value.trim()
    ) return null;
    return parsed.href.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function configuration(
  getEnvironment:
    EliteSolarSupervisedTestDispatchDependencies["getEnvironment"],
): RuntimeConfig | null {
  if (
    getEnvironment("ELITE_SOLAR_SUPERVISED_TEST_ENABLED") !== "true" ||
    getEnvironment("ELITE_SOLAR_SUPERVISED_TEST_DISPATCH_ENABLED") !== "true" ||
    getEnvironment("ELITE_SOLAR_SUPERVISED_TEST_LIVE_EGRESS_ENABLED") !== "true"
  ) return null;
  const serviceRoleKey = privateSecret(
    getEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
  );
  const supabaseUrl = canonicalHttpsUrl(getEnvironment("SUPABASE_URL"));
  if (!serviceRoleKey || !supabaseUrl) return null;
  const retellWebhookUrl =
    `${supabaseUrl}/functions/v1/elite-solar-supervised-retell-webhook`;
  return Object.freeze({ serviceRoleKey, supabaseUrl, retellWebhookUrl });
}

function telnyxConfiguration(
  getEnvironment:
    EliteSolarSupervisedTestDispatchDependencies["getEnvironment"],
): TelnyxConfig | null {
  const apiKey = privateSecret(
    getEnvironment("ELITE_SOLAR_SUPERVISED_TEST_TELNYX_API_KEY"),
  );
  const messagingProfileId = text(
    getEnvironment("ELITE_SOLAR_SUPERVISED_TEST_TELNYX_MESSAGING_PROFILE_ID"),
    8,
    256,
  );
  return apiKey && messagingProfileId && PROVIDER_ID.test(messagingProfileId)
    ? Object.freeze({ apiKey, messagingProfileId })
    : null;
}

function retellConfiguration(
  getEnvironment:
    EliteSolarSupervisedTestDispatchDependencies["getEnvironment"],
  expectedWebhookUrl: string,
): RetellConfig | null {
  const apiKey = privateSecret(
    getEnvironment("ELITE_SOLAR_SUPERVISED_TEST_RETELL_API_KEY"),
  );
  const agentId = text(
    getEnvironment("ELITE_SOLAR_SUPERVISED_TEST_RETELL_AGENT_ID"),
    8,
    128,
  );
  const agentVersionValue = getEnvironment(
    "ELITE_SOLAR_SUPERVISED_TEST_RETELL_AGENT_VERSION",
  );
  const agentVersion =
    agentVersionValue && /^(?:0|[1-9]\d{0,6})$/.test(agentVersionValue)
      ? Number(agentVersionValue)
      : Number.NaN;
  const webhookUrl = canonicalHttpsUrl(
    getEnvironment("ELITE_SOLAR_SUPERVISED_TEST_RETELL_WEBHOOK_URL"),
  );
  if (
    !apiKey || !agentId || !PROVIDER_ID.test(agentId) ||
    !Number.isSafeInteger(agentVersion) || agentVersion < 0 ||
    webhookUrl !== expectedWebhookUrl
  ) return null;
  return Object.freeze({ apiKey, agentId, agentVersion, webhookUrl });
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
        await reader.cancel("elite_solar_supervised_dispatch_body_limit");
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

function parseRequest(raw: Uint8Array): string | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = parseBoundedJsonObject(
      new TextDecoder("utf-8", { fatal: true }).decode(raw),
    );
  } catch {
    return null;
  }
  const body = exactKeys(parsed, ["test_run_id"]);
  return body ? uuid(body.test_run_id) : null;
}

function validClaim(dispatch: SupervisedDispatch): boolean {
  if (
    !uuid(dispatch.dispatch_id) || !uuid(dispatch.test_run_id) ||
    !IDEMPOTENCY_KEY.test(dispatch.idempotency_key) ||
    !E164.test(dispatch.from_e164) || !E164.test(dispatch.to_e164)
  ) return false;
  if (dispatch.provider === "telnyx") {
    return dispatch.channel === "sms" &&
      typeof dispatch.message_body === "string" &&
      dispatch.message_body.length >= 1 &&
      dispatch.message_body.length <= 1600 &&
      dispatch.retell_agent_id === null &&
      dispatch.retell_agent_version === null &&
      dispatch.retell_webhook_url === null;
  }
  return dispatch.provider === "retell" && dispatch.channel === "voice" &&
    dispatch.message_body === null &&
    typeof dispatch.retell_agent_id === "string" &&
    PROVIDER_ID.test(dispatch.retell_agent_id) &&
    Number.isSafeInteger(dispatch.retell_agent_version) &&
    (dispatch.retell_agent_version || 0) >= 0 &&
    canonicalHttpsUrl(dispatch.retell_webhook_url) !== null;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function normalizedProviderId(value: unknown): string | null {
  const candidate = typeof value === "string" ? value : null;
  return candidate && PROVIDER_ID.test(candidate) ? candidate : null;
}

type ProviderAttempt = {
  status: DispatchFinalization["status"];
  providerObjectId: string | null;
  providerResponseSha256: string | null;
  errorCode: string | null;
};

async function sendTelnyxMessage(
  dispatch: SupervisedDispatch,
  config: TelnyxConfig,
  fetchImpl: ProviderFetch,
): Promise<ProviderAttempt> {
  const body = JSON.stringify({
    from: dispatch.from_e164,
    to: dispatch.to_e164,
    text: dispatch.message_body,
    messaging_profile_id: config.messagingProfileId,
  });
  try {
    const response = await fetchImpl(
      new URL("https://api.telnyx.com/v2/messages"),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          "Idempotency-Key": dispatch.idempotency_key,
        },
        body,
        signal: AbortSignal.timeout(15_000),
      },
    );
    const responseText = await response.text();
    const responseSha = await sha256Hex(responseText);
    if (!response.ok) {
      const definite = response.status >= 400 && response.status < 500 &&
        response.status !== 409 && response.status !== 429;
      return {
        status: definite ? "definite_failure" : "acceptance_unknown",
        providerObjectId: null,
        providerResponseSha256: responseSha,
        errorCode: definite ? "TELNYX_REJECTED" : "TELNYX_ACCEPTANCE_UNKNOWN",
      };
    }
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = plainObject(JSON.parse(responseText));
    } catch {
      parsed = null;
    }
    const data = parsed && plainObject(parsed.data);
    const providerMessageId = normalizedProviderId(
      data?.id ?? parsed?.id,
    );
    if (!providerMessageId) {
      return {
        status: "acceptance_unknown",
        providerObjectId: null,
        providerResponseSha256: responseSha,
        errorCode: "TELNYX_RESPONSE_UNRECONCILABLE",
      };
    }
    return {
      status: "accepted",
      providerObjectId: providerMessageId,
      providerResponseSha256: responseSha,
      errorCode: null,
    };
  } catch {
    return {
      status: "acceptance_unknown",
      providerObjectId: null,
      providerResponseSha256: null,
      errorCode: "TELNYX_TRANSPORT_UNCERTAIN",
    };
  }
}

async function createRetellCall(
  dispatch: SupervisedDispatch,
  config: RetellConfig,
  fetchImpl: ProviderFetch,
  inspectRetell: NonNullable<
    EliteSolarSupervisedTestDispatchDependencies["inspectRetell"]
  >,
): Promise<ProviderAttempt> {
  if (
    dispatch.retell_agent_id !== config.agentId ||
    dispatch.retell_agent_version !== config.agentVersion ||
    canonicalHttpsUrl(dispatch.retell_webhook_url) !== config.webhookUrl
  ) {
    return {
      status: "definite_failure",
      providerObjectId: null,
      providerResponseSha256: null,
      errorCode: "RETELL_CLAIM_BINDING_MISMATCH",
    };
  }
  let readiness: RetellReadiness;
  try {
    readiness = await inspectRetell({
      apiKey: config.apiKey,
      agentId: config.agentId,
      agentVersion: config.agentVersion,
      expectedWebhookUrl: config.webhookUrl,
    }, fetchImpl);
  } catch {
    return {
      status: "definite_failure",
      providerObjectId: null,
      providerResponseSha256: null,
      errorCode: "RETELL_AGENT_VERIFICATION_FAILED",
    };
  }
  if (readiness.status !== "verified") {
    return {
      status: "definite_failure",
      providerObjectId: null,
      providerResponseSha256: null,
      errorCode: "RETELL_AGENT_NOT_APPROVED",
    };
  }
  const body = JSON.stringify(buildRetellCreatePhoneCallPayload({
    fromNumber: dispatch.from_e164,
    toNumber: dispatch.to_e164,
    agentId: config.agentId,
    agentVersion: config.agentVersion,
    maxCallDurationMs: 360_000,
    webhookUrl: config.webhookUrl,
    dynamicVariables: {},
    metadata: {
      elite_solar_supervised_test_dispatch_id: dispatch.dispatch_id,
      elite_solar_supervised_test_run_id: dispatch.test_run_id,
      elite_solar_supervised_test_agent_id: config.agentId,
      elite_solar_supervised_test_agent_version: config.agentVersion,
      elite_solar_supervised_test_contract_version: 1,
    },
  }));
  try {
    const response = await fetchImpl(
      new URL("https://api.retellai.com/v2/create-phone-call"),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          "Idempotency-Key": dispatch.idempotency_key,
        },
        body,
        signal: AbortSignal.timeout(15_000),
      },
    );
    const responseText = await response.text();
    const responseSha = await sha256Hex(responseText);
    if (!response.ok) {
      const definite = response.status >= 400 && response.status < 500 &&
        response.status !== 409 && response.status !== 429;
      return {
        status: definite ? "definite_failure" : "acceptance_unknown",
        providerObjectId: null,
        providerResponseSha256: responseSha,
        errorCode: definite ? "RETELL_REJECTED" : "RETELL_ACCEPTANCE_UNKNOWN",
      };
    }
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = plainObject(JSON.parse(responseText));
    } catch {
      parsed = null;
    }
    const callId = normalizedProviderId(parsed?.call_id ?? parsed?.id);
    if (!callId) {
      return {
        status: "acceptance_unknown",
        providerObjectId: null,
        providerResponseSha256: responseSha,
        errorCode: "RETELL_RESPONSE_UNRECONCILABLE",
      };
    }
    return {
      status: "accepted",
      providerObjectId: callId,
      providerResponseSha256: responseSha,
      errorCode: null,
    };
  } catch {
    return {
      status: "acceptance_unknown",
      providerObjectId: null,
      providerResponseSha256: null,
      errorCode: "RETELL_TRANSPORT_UNCERTAIN",
    };
  }
}

/**
 * Service-role-only single-dispatch worker. The request supplies no recipient,
 * copy, provider, campaign, or agent input: the atomically claimed database
 * row owns all of that state. Every post-claim outcome is finalized exactly
 * once, and uncertain provider acceptance is never retried by this handler.
 */
export async function handleEliteSolarSupervisedTestDispatchRequest(
  request: Request,
  deps: EliteSolarSupervisedTestDispatchDependencies,
): Promise<Response> {
  const config = configuration(deps.getEnvironment);
  if (!config) {
    return noStoreResponse(503, {
      accepted: false,
      error_code: "ELITE_SOLAR_SUPERVISED_TEST_DISPATCH_NOT_PROVISIONED",
    });
  }
  if (request.method !== "POST") {
    return noStoreResponse(405, {
      accepted: false,
      error_code: "METHOD_NOT_ALLOWED",
    });
  }
  if (
    new URL(request.url).search ||
    !request.headers.get("content-type")?.toLowerCase().startsWith(
      "application/json",
    )
  ) {
    return noStoreResponse(400, {
      accepted: false,
      error_code: "INVALID_REQUEST",
    });
  }
  if (
    !serviceRoleBearer(
      request.headers.get("authorization"),
      config.serviceRoleKey,
    )
  ) {
    return noStoreResponse(401, {
      accepted: false,
      error_code: "SERVICE_ROLE_REQUIRED",
    });
  }
  let testRunId: string | null;
  try {
    testRunId = parseRequest(await readBoundedBody(request));
  } catch {
    return noStoreResponse(413, {
      accepted: false,
      error_code: "BODY_TOO_LARGE",
    });
  }
  if (!testRunId) {
    return noStoreResponse(400, {
      accepted: false,
      error_code: "INVALID_REQUEST",
    });
  }

  const dispatcherInstanceId = (deps.randomUuid || crypto.randomUUID)();
  if (!uuid(dispatcherInstanceId)) {
    return noStoreResponse(503, {
      accepted: false,
      error_code: "DISPATCHER_INSTANCE_INVALID",
    });
  }
  let claim: ClaimResult;
  try {
    claim = await deps.store.claim({ testRunId, dispatcherInstanceId });
  } catch {
    return noStoreResponse(503, {
      accepted: false,
      error_code: "DISPATCH_CLAIM_UNAVAILABLE",
    });
  }
  if (claim.kind === "empty") return noStoreResponse(204);
  if (claim.kind !== "claimed") {
    return noStoreResponse(409, {
      accepted: false,
      error_code: "DISPATCH_NOT_CLAIMED",
    });
  }

  if (!validClaim(claim.dispatch)) {
    const malformedDispatchId = uuid(claim.dispatch.dispatch_id);
    if (malformedDispatchId) {
      try {
        await deps.store.finalize({
          dispatchId: malformedDispatchId,
          dispatcherInstanceId,
          status: "definite_failure",
          providerObjectId: null,
          providerResponseSha256: null,
          errorCode: "DISPATCH_CLAIM_MALFORMED",
        });
      } catch {
        // The record remains leased for a human/reconciliation path. Never
        // attempt provider egress from malformed database output.
      }
    }
    return noStoreResponse(503, {
      accepted: false,
      error_code: "DISPATCH_CLAIM_INVALID",
    });
  }

  const dispatch = claim.dispatch;
  const fetchImpl = deps.fetchImpl || fetch;
  const inspectRetell = deps.inspectRetell || inspectEliteSolarRetell;
  let attempt: ProviderAttempt;
  if (dispatch.provider === "telnyx") {
    const telnyx = telnyxConfiguration(deps.getEnvironment);
    attempt = telnyx ? await sendTelnyxMessage(dispatch, telnyx, fetchImpl) : {
      status: "definite_failure",
      providerObjectId: null,
      providerResponseSha256: null,
      errorCode: "TELNYX_NOT_PROVISIONED",
    };
  } else {
    const retell = retellConfiguration(
      deps.getEnvironment,
      config.retellWebhookUrl,
    );
    attempt = retell
      ? await createRetellCall(dispatch, retell, fetchImpl, inspectRetell)
      : {
        status: "definite_failure",
        providerObjectId: null,
        providerResponseSha256: null,
        errorCode: "RETELL_NOT_PROVISIONED",
      };
  }

  try {
    const finalized = await deps.store.finalize({
      dispatchId: dispatch.dispatch_id,
      dispatcherInstanceId,
      status: attempt.status,
      providerObjectId: attempt.providerObjectId,
      providerResponseSha256: attempt.providerResponseSha256,
      errorCode: attempt.errorCode,
    });
    if (!finalized) throw new Error("DISPATCH_FINALIZATION_REJECTED");
  } catch {
    return noStoreResponse(503, {
      accepted: false,
      error_code: "DISPATCH_FINALIZATION_UNAVAILABLE",
    });
  }
  const status = attempt.status === "accepted"
    ? 202
    : attempt.status === "acceptance_unknown"
    ? 202
    : 409;
  return noStoreResponse(status, {
    accepted: attempt.status === "accepted",
    reconciliation_required: attempt.status === "acceptance_unknown",
    outcome: attempt.status,
  });
}
