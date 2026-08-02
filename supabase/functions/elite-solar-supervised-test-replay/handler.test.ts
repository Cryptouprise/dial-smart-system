// deno-lint-ignore-file no-explicit-any no-import-prefix
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  handleEliteSolarSupervisedTestReplayRequest,
} from "./handler.ts";

const OWNER = "11111111-1111-4111-8111-111111111111";
const FOREIGN = "11111111-1111-4111-8111-111111111112";
const ORG = "22222222-2222-4222-8222-222222222222";
const CAMPAIGN = "33333333-3333-4333-8333-333333333333";
const PLAN_ID = "elite_solar_self_test_v1";
const PLAN_VERSION = "2026-07-26";
const RUN_ID = "44444444-4444-4444-8444-444444444444";
const TOKEN = `eyJ${"a".repeat(120)}`;

type ReplayConfig = {
  ownerUserId: string;
  organizationId: string;
  campaignId: string;
};

function request(
  body: unknown,
  options: {
    method?: string;
    authorization?: string;
    contentType?: string;
  } = {},
) {
  const headers = new Headers({
    authorization: options.authorization ?? `Bearer ${TOKEN}`,
    "content-type": options.contentType ?? "application/json",
  });

  return new Request(
    "https://project.example/functions/v1/elite-solar-supervised-test-replay",
    {
      method: options.method ?? "POST",
      headers,
      ...(options.method === "GET" || options.method === "DELETE"
        ? {}
        : { body: typeof body === "string" ? body : JSON.stringify(body) }),
    },
  );
}

function configuration(overrides: Partial<ReplayConfig> = {}): ReplayConfig {
  return {
    ownerUserId: OWNER,
    organizationId: ORG,
    campaignId: CAMPAIGN,
    ...overrides,
  };
}

function dependencies(
  overrides: {
    authenticate?: (jwt: string) => Promise<string | null>;
    getReplay?: () => Promise<unknown>;
  } = {},
) {
  return {
    store: {
      getReplay: () => overrides.getReplay?.() ?? Promise.resolve({ ok: true }),
    },
    authenticate: overrides.authenticate ??
      ((jwt: string) => Promise.resolve(jwt === TOKEN ? OWNER : null)),
    expectedPlanId: PLAN_ID,
    expectedPlanVersion: PLAN_VERSION,
  };
}

function getBody(response: Response): Promise<Record<string, any>> {
  return response.json() as Promise<Record<string, any>>;
}

Deno.test("supervised test replay validates method, auth, and owner before RPC", async () => {
  const deps = dependencies();
  const response = await handleEliteSolarSupervisedTestReplayRequest(
    request({ action: "get", run_id: RUN_ID }, { method: "GET" }),
    configuration(),
    deps,
  );
  assertEquals(response.status, 405);
  assertEquals((await getBody(response)).error_code, "METHOD_NOT_ALLOWED");

  const unauthorized = await handleEliteSolarSupervisedTestReplayRequest(
    request({ action: "get", run_id: RUN_ID }, {
      authorization: "Bearer short",
    }),
    configuration(),
    deps,
  );
  assertEquals(unauthorized.status, 401);

  const forbiddenOwner = await handleEliteSolarSupervisedTestReplayRequest(
    request({ action: "get", run_id: RUN_ID }),
    configuration(),
    dependencies({
      authenticate: () => Promise.resolve(FOREIGN),
    }),
  );
  assertEquals(forbiddenOwner.status, 403);
});

Deno.test("supervised test replay rejects invalid payloads before store calls", async () => {
  let called = false;

  const response = await handleEliteSolarSupervisedTestReplayRequest(
    request({ action: "get", run_id: "not-a-uuid" }),
    configuration(),
    dependencies({
      getReplay: () => {
        called = true;
        return Promise.resolve({});
      },
    }),
  );
  assertEquals(response.status, 400);
  assertEquals(called, false);

  const invalidKeys = await handleEliteSolarSupervisedTestReplayRequest(
    request({ action: "get", run_id: RUN_ID, extra: "x" }),
    configuration(),
    dependencies({
      getReplay: () => {
        called = true;
        return Promise.resolve({});
      },
    }),
  );
  assertEquals(invalidKeys.status, 400);
  assertEquals(called, false);
});

Deno.test("supervised test replay returns 200 with replay payload on valid request", async () => {
  const sample = {
    ok: true,
    run: {
      run_id: RUN_ID,
      status: "armed",
      plan_id: PLAN_ID,
      plan_version: PLAN_VERSION,
      stop_on_first_inbound_reply: true,
      inbound_reply_outcome: "halt_and_human_handoff",
      current_step_ordinal: 2,
      stop_requested: false,
      provider_reconciliation_required: false,
      terminal_reason_code: null,
      armed_at: null,
      completed_at: null,
      cancelled_at: null,
      from_e164: "+15550000001",
      to_e164: "+15550000002",
    },
    target: {
      target_id: "55555555-5555-4555-8555-555555555555",
      sms_step_1_body: "Hi 1",
      sms_step_2_body: "Hi 2",
      sms_step_3_body: "Hi 3",
      retell_agent_id: null,
      retell_agent_version: null,
    },
    steps: [],
    inbound_sms: [],
    call_events: [],
    handoff: null,
  };

  const response = await handleEliteSolarSupervisedTestReplayRequest(
    request({ action: "get", run_id: RUN_ID }),
    configuration(),
    dependencies({
      getReplay: () => Promise.resolve(sample),
    }),
  );

  assertEquals(response.status, 200);
  const body = await getBody(response);
  assertEquals(body.ok, true);
  assertEquals(body.replay.run.run_id, RUN_ID);
});

Deno.test("supervised test replay returns not found when store fails", async () => {
  const response = await handleEliteSolarSupervisedTestReplayRequest(
    request({ action: "get", run_id: RUN_ID }),
    configuration(),
    dependencies({
      getReplay: () => Promise.reject(new Error("missing")),
    }),
  );
  assertEquals(response.status, 404);
  assertEquals((await getBody(response)).error_code, "REPLAY_NOT_FOUND");
});
