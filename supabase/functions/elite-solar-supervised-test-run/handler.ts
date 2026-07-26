import { parseBoundedJsonObject } from "../_shared/bounded-json.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SAFE_CODE = /^[A-Z][A-Z0-9_]{2,79}$/;
const SAFE_RUN_STATE = /^[a-z][a-z0-9_]{2,79}$/;
const MAX_BODY_BYTES = 1_024;

/**
 * This is deliberately a server-defined plan, not a campaign authoring API.
 * The dispatcher must resolve its copy from these opaque template references
 * and must reject a run whose plan version or sequence is different.
 */
export const ELITE_SOLAR_SUPERVISED_TEST_PLAN = Object.freeze({
  id: "elite_solar_self_test_v1",
  version: "2026-07-26",
  stop_on_first_inbound_reply: true,
  inbound_reply_outcome: "halt_and_human_handoff",
  steps: Object.freeze([
    Object.freeze({
      ordinal: 1,
      channel: "sms",
      simulated_elapsed_minutes: 0,
      template_ref: "elite_solar_self_test_sms_1_v1",
    }),
    Object.freeze({
      ordinal: 2,
      channel: "sms",
      simulated_elapsed_minutes: 240,
      template_ref: "elite_solar_self_test_sms_2_v1",
    }),
    Object.freeze({
      ordinal: 3,
      channel: "sms",
      simulated_elapsed_minutes: 480,
      template_ref: "elite_solar_self_test_sms_3_v1",
    }),
    Object.freeze({
      ordinal: 4,
      channel: "call",
      simulated_elapsed_minutes: 1_440,
      template_ref: "elite_solar_self_test_call_1_v1",
    }),
  ]),
});

type Authority = {
  contact_authorized: boolean;
  launch_authorized: boolean;
  queue_mutation_authorized: boolean;
  crm_write_authorized: boolean;
  provider_write_authorized: boolean;
  spend_authorized: boolean;
  supervised_test_dispatch_authorized: boolean;
};

const AUTHORITY: Readonly<Authority> = Object.freeze({
  contact_authorized: false,
  launch_authorized: false,
  queue_mutation_authorized: false,
  crm_write_authorized: false,
  provider_write_authorized: false,
  spend_authorized: false,
  supervised_test_dispatch_authorized: false,
});

type Action =
  | { kind: "arm" }
  | { kind: "status"; runId: string }
  | { kind: "cancel"; runId: string }
  | { kind: "advance"; runId: string }
  | { kind: "complete"; runId: string };

type Configuration = {
  ownerUserId: string;
  organizationId: string;
  campaignId: string;
  allowedOrigin: string;
};

export type EliteSolarSupervisedTestRunInput = {
  owner_user_id: string;
  organization_id: string;
  campaign_id: string;
  plan_id: string;
  plan_version: string;
  stop_on_first_inbound_reply: boolean;
  inbound_reply_outcome: string;
  run_id?: string;
};

export type EliteSolarSupervisedTestRunResult = {
  run_id: string;
  run_state: string;
  reason_code: string;
  dispatch_authorized: boolean;
  dispatch_id: string | null;
};

export interface EliteSolarSupervisedTestRunStore {
  arm(
    input: EliteSolarSupervisedTestRunInput,
  ): Promise<EliteSolarSupervisedTestRunResult>;
  status(
    input: EliteSolarSupervisedTestRunInput,
  ): Promise<EliteSolarSupervisedTestRunResult>;
  cancel(
    input: EliteSolarSupervisedTestRunInput,
  ): Promise<EliteSolarSupervisedTestRunResult>;
  advance(
    input: EliteSolarSupervisedTestRunInput,
  ): Promise<EliteSolarSupervisedTestRunResult>;
  complete(
    input: EliteSolarSupervisedTestRunInput,
  ): Promise<EliteSolarSupervisedTestRunResult>;
}

export interface EliteSolarSupervisedTestDispatcher {
  dispatch(input: {
    test_run_id: string;
  }): Promise<{ accepted: boolean; reason_code: string }>;
}

export interface EliteSolarSupervisedTestRunDependencies {
  getEnvironment: (name: string) => string | undefined;
  authenticate: (jwt: string) => Promise<string | null>;
  store: EliteSolarSupervisedTestRunStore;
  dispatcher: EliteSolarSupervisedTestDispatcher;
}

function canonicalUuid(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

function canonicalOrigin(value: string | undefined): string | null {
  if (!value || value.length > 512) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.origin === value &&
        parsed.pathname === "/" && !parsed.search && !parsed.hash &&
        !parsed.username && !parsed.password
      ? value
      : null;
  } catch {
    return null;
  }
}

function configuration(
  getEnvironment: EliteSolarSupervisedTestRunDependencies["getEnvironment"],
): Configuration | null {
  if (getEnvironment("ELITE_SOLAR_SUPERVISED_TEST_ENABLED") !== "true") {
    return null;
  }
  const ownerUserId = canonicalUuid(
    getEnvironment("ELITE_SOLAR_SUPERVISED_TEST_OWNER_USER_ID"),
  );
  const organizationId = canonicalUuid(
    getEnvironment("ELITE_SOLAR_SUPERVISED_TEST_ORGANIZATION_ID"),
  );
  const campaignId = canonicalUuid(
    getEnvironment("ELITE_SOLAR_SUPERVISED_TEST_CAMPAIGN_ID"),
  );
  const allowedOrigin = canonicalOrigin(
    getEnvironment("ELITE_SOLAR_SUPERVISED_TEST_ALLOWED_ORIGIN"),
  );
  return ownerUserId && organizationId && campaignId && allowedOrigin
    ? { ownerUserId, organizationId, campaignId, allowedOrigin }
    : null;
}

function bearer(value: string | null): string | null {
  if (!value?.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length);
  return token.length >= 100 && token.length <= 8_192 && !/\s/.test(token)
    ? token
    : null;
}

function response(
  status: number,
  body: Record<string, unknown>,
  origin: string | null,
  settings: Configuration | null,
  authority: Readonly<Authority> = AUTHORITY,
): Response {
  const headers = new Headers({
    "Cache-Control": "no-store, max-age=0",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
  });
  if (origin !== null && settings?.allowedOrigin === origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set(
      "Access-Control-Allow-Headers",
      "authorization, content-type, x-client-info, apikey",
    );
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  }
  return new Response(
    status === 204 ? null : JSON.stringify({ ...body, authority }),
    { status, headers },
  );
}

async function readBoundedBody(
  request: Request,
): Promise<Record<string, unknown>> {
  const declared = request.headers.get("content-length");
  if (
    declared !== null &&
    (!/^(?:0|[1-9][0-9]*)$/.test(declared) ||
      Number(declared) > MAX_BODY_BYTES)
  ) throw new Error("INVALID_BODY");
  const raw = new Uint8Array(await request.arrayBuffer());
  if (raw.byteLength > MAX_BODY_BYTES) throw new Error("INVALID_BODY");
  return parseBoundedJsonObject(
    new TextDecoder("utf-8", { fatal: true }).decode(raw),
    {
      maxDepth: 2,
      maxNodes: 8,
      maxObjectKeys: 2,
      maxArrayLength: 0,
      maxStringLength: 64,
    },
  );
}

function exactAction(
  value: Record<string, unknown>,
  action: string,
  keys: readonly string[],
): boolean {
  return value.action === action && Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key));
}

function parseAction(value: Record<string, unknown>): Action | null {
  if (exactAction(value, "arm", ["action"])) return { kind: "arm" };
  const runId = canonicalUuid(value.run_id);
  if (!runId) return null;
  if (exactAction(value, "status", ["action", "run_id"])) {
    return { kind: "status", runId };
  }
  if (exactAction(value, "cancel", ["action", "run_id"])) {
    return { kind: "cancel", runId };
  }
  if (exactAction(value, "advance", ["action", "run_id"])) {
    return { kind: "advance", runId };
  }
  if (exactAction(value, "complete", ["action", "run_id"])) {
    return { kind: "complete", runId };
  }
  return null;
}

function inputFor(
  settings: Configuration,
  action: Action,
): EliteSolarSupervisedTestRunInput {
  return {
    owner_user_id: settings.ownerUserId,
    organization_id: settings.organizationId,
    campaign_id: settings.campaignId,
    plan_id: ELITE_SOLAR_SUPERVISED_TEST_PLAN.id,
    plan_version: ELITE_SOLAR_SUPERVISED_TEST_PLAN.version,
    stop_on_first_inbound_reply:
      ELITE_SOLAR_SUPERVISED_TEST_PLAN.stop_on_first_inbound_reply,
    inbound_reply_outcome:
      ELITE_SOLAR_SUPERVISED_TEST_PLAN.inbound_reply_outcome,
    ...("runId" in action ? { run_id: action.runId } : {}),
  };
}

function validResult(
  result: EliteSolarSupervisedTestRunResult,
): result is EliteSolarSupervisedTestRunResult {
  return canonicalUuid(result?.run_id) !== null &&
    typeof result?.run_state === "string" &&
    SAFE_RUN_STATE.test(result.run_state) &&
    typeof result?.reason_code === "string" &&
    SAFE_CODE.test(result.reason_code) &&
    typeof result?.dispatch_authorized === "boolean" &&
    (result.dispatch_id === null ||
      canonicalUuid(result.dispatch_id) !== null) &&
    (result.dispatch_authorized
      ? canonicalUuid(result.dispatch_id) !== null
      : result.dispatch_id === null);
}

function output(
  action: Action,
  result: EliteSolarSupervisedTestRunResult,
  dispatcherInvocations: number,
  dispatchOutcome: "not_requested" | "accepted" | "unknown",
) {
  return {
    ok: dispatchOutcome !== "unknown",
    kind: "elite_solar_supervised_test_run_v1",
    action: action.kind,
    run_id: result.run_id,
    run_state: result.run_state,
    reason_code: result.reason_code,
    plan: {
      id: ELITE_SOLAR_SUPERVISED_TEST_PLAN.id,
      version: ELITE_SOLAR_SUPERVISED_TEST_PLAN.version,
      step_count: ELITE_SOLAR_SUPERVISED_TEST_PLAN.steps.length,
      stop_on_first_inbound_reply:
        ELITE_SOLAR_SUPERVISED_TEST_PLAN.stop_on_first_inbound_reply,
      inbound_reply_outcome:
        ELITE_SOLAR_SUPERVISED_TEST_PLAN.inbound_reply_outcome,
    },
    provider_action: dispatcherInvocations === 1
      ? "supervised_dispatch_requested"
      : "none",
    dispatch_outcome: dispatchOutcome,
    side_effect_invariants: {
      service_role_rpc_calls: 1,
      handler_provider_calls: 0,
      dispatcher_invocations: dispatcherInvocations,
      arbitrary_contact_data_accepted: false,
      arbitrary_copy_accepted: false,
      arbitrary_timing_accepted: false,
    },
    statement:
      "The fixed self-test plan has no caller-supplied recipient, copy, timing, provider, or campaign. A dispatcher may be invoked only after the server-side advance RPC authorizes this exact run. The dispatcher must halt on the first inbound reply and create the server-defined human handoff.",
  };
}

/**
 * Exact-owner supervised self-test controller. It has no direct provider code:
 * arming, state, cancellation, human-handoff completion, and advance
 * authorization are delegated to service-only RPCs; the fixed dispatcher
 * receives only an approved run.
 */
export async function handleEliteSolarSupervisedTestRunRequest(
  request: Request,
  deps: EliteSolarSupervisedTestRunDependencies,
): Promise<Response> {
  const settings = configuration(deps.getEnvironment);
  const origin = request.headers.get("origin");
  if (!settings) {
    return response(
      503,
      {
        ok: false,
        error_code: "ELITE_SOLAR_SUPERVISED_TEST_NOT_PROVISIONED",
      },
      origin,
      null,
    );
  }
  if (origin !== settings.allowedOrigin) {
    return response(
      403,
      { ok: false, error_code: "ORIGIN_FORBIDDEN" },
      origin,
      settings,
    );
  }
  if (request.method === "OPTIONS") {
    return response(204, {}, origin, settings);
  }
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
  if (!token) {
    return response(
      401,
      { ok: false, error_code: "AUTHENTICATION_REQUIRED" },
      origin,
      settings,
    );
  }
  let userId: string | null;
  try {
    userId = await deps.authenticate(token);
  } catch {
    userId = null;
  }
  if (userId !== settings.ownerUserId) {
    return response(
      403,
      { ok: false, error_code: "OWNER_FORBIDDEN" },
      origin,
      settings,
    );
  }
  let action: Action | null;
  try {
    action = parseAction(await readBoundedBody(request));
  } catch {
    action = null;
  }
  if (!action) {
    return response(
      400,
      { ok: false, error_code: "INVALID_ACTION" },
      origin,
      settings,
    );
  }

  let result: EliteSolarSupervisedTestRunResult;
  try {
    const input = inputFor(settings, action);
    result = await deps.store[action.kind](input);
    if (!validResult(result)) throw new Error("INVALID_RPC_RESULT");
  } catch {
    return response(
      503,
      { ok: false, error_code: "ELITE_SOLAR_SUPERVISED_TEST_UNAVAILABLE" },
      origin,
      settings,
    );
  }

  if (action.kind !== "advance" || !result.dispatch_authorized) {
    return response(
      200,
      output(action, result, 0, "not_requested"),
      origin,
      settings,
    );
  }

  try {
    const dispatch = await deps.dispatcher.dispatch({
      test_run_id: result.run_id,
    });
    if (!dispatch.accepted || !SAFE_CODE.test(dispatch.reason_code)) {
      throw new Error("DISPATCH_REJECTED");
    }
    const authority = {
      ...AUTHORITY,
      supervised_test_dispatch_authorized: true,
    };
    return response(
      202,
      output(action, result, 1, "accepted"),
      origin,
      settings,
      authority,
    );
  } catch {
    return response(
      502,
      output(action, result, 1, "unknown"),
      origin,
      settings,
    );
  }
}
