// deno-lint-ignore-file no-explicit-any no-import-prefix
import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ELITE_SOLAR_SUPERVISED_TEST_PLAN,
  type EliteSolarSupervisedTestRunDependencies,
  handleEliteSolarSupervisedTestRunRequest,
} from "./handler.ts";

const OWNER = "11111111-1111-4111-8111-111111111111";
const ORGANIZATION = "22222222-2222-4222-8222-222222222222";
const CAMPAIGN = "33333333-3333-4333-8333-333333333333";
const RUN = "44444444-4444-4444-8444-444444444444";
const DISPATCH = "55555555-5555-4555-8555-555555555555";
const OTHER = "66666666-6666-4666-8666-666666666666";
const ORIGIN = "https://app.elitesolar.example";
const TOKEN = `eyJ${"a".repeat(120)}`;

function request(
  body: unknown,
  options: {
    method?: string;
    origin?: string | null;
    authorization?: string;
    url?: string;
    contentType?: string;
  } = {},
) {
  const headers = new Headers({
    authorization: options.authorization ?? `Bearer ${TOKEN}`,
    "content-type": options.contentType ?? "application/json",
  });
  if (options.origin !== null) headers.set("origin", options.origin ?? ORIGIN);
  return new Request(
    options.url ??
      "https://project.example/functions/v1/elite-solar-supervised-test-run",
    {
      method: options.method ?? "POST",
      headers,
      ...(options.method === "OPTIONS" || options.method === "GET"
        ? {}
        : { body: typeof body === "string" ? body : JSON.stringify(body) }),
    },
  );
}

function environment(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    ELITE_SOLAR_SUPERVISED_TEST_ENABLED: "true",
    ELITE_SOLAR_SUPERVISED_TEST_OWNER_USER_ID: OWNER,
    ELITE_SOLAR_SUPERVISED_TEST_ORGANIZATION_ID: ORGANIZATION,
    ELITE_SOLAR_SUPERVISED_TEST_CAMPAIGN_ID: CAMPAIGN,
    ELITE_SOLAR_SUPERVISED_TEST_ALLOWED_ORIGIN: ORIGIN,
    ...overrides,
  };
  return (name: string) => values[name];
}

function result(overrides: Record<string, unknown> = {}) {
  return {
    run_id: RUN,
    run_state: "armed",
    reason_code: "SUPERVISED_TEST_ARMED",
    dispatch_authorized: false,
    dispatch_id: null,
    ...overrides,
  };
}

function dependencies(
  overrides: Partial<EliteSolarSupervisedTestRunDependencies> = {},
): EliteSolarSupervisedTestRunDependencies {
  return {
    getEnvironment: environment(),
    authenticate: () => Promise.resolve(OWNER),
    store: {
      arm: () => Promise.resolve(result()),
      status: () => Promise.resolve(result({ run_state: "awaiting_reply" })),
      cancel: () => Promise.resolve(result({ run_state: "cancelled" })),
      advance: () => Promise.resolve(result({ run_state: "ready_to_advance" })),
      complete: () => Promise.resolve(result({ run_state: "completed" })),
    },
    dispatcher: {
      dispatch: () =>
        Promise.resolve({
          accepted: true,
          reason_code: "DISPATCH_REQUEST_ACCEPTED",
        }),
    },
    ...overrides,
  };
}

async function json(response: Response): Promise<Record<string, any>> {
  return await response.json() as Record<string, any>;
}

Deno.test("supervised test hard-locks before authentication, database, or dispatcher work", async () => {
  let authenticates = 0;
  let rpcCalls = 0;
  let dispatches = 0;
  const response = await handleEliteSolarSupervisedTestRunRequest(
    request({ action: "arm" }),
    dependencies({
      getEnvironment: environment({
        ELITE_SOLAR_SUPERVISED_TEST_ENABLED: "TRUE",
      }),
      authenticate: () => {
        authenticates += 1;
        return Promise.resolve(OWNER);
      },
      store: {
        arm: () => {
          rpcCalls += 1;
          return Promise.resolve(result());
        },
        status: () => {
          rpcCalls += 1;
          return Promise.resolve(result());
        },
        cancel: () => {
          rpcCalls += 1;
          return Promise.resolve(result());
        },
        advance: () => {
          rpcCalls += 1;
          return Promise.resolve(result());
        },
        complete: () => {
          rpcCalls += 1;
          return Promise.resolve(result());
        },
      },
      dispatcher: {
        dispatch: () => {
          dispatches += 1;
          return Promise.resolve({ accepted: true, reason_code: "OKAY" });
        },
      },
    }),
  );
  assertEquals(response.status, 503);
  assertEquals(
    (await json(response)).error_code,
    "ELITE_SOLAR_SUPERVISED_TEST_NOT_PROVISIONED",
  );
  assertEquals(authenticates, 0);
  assertEquals(rpcCalls, 0);
  assertEquals(dispatches, 0);
});

Deno.test("supervised test requires an exact canonical dashboard origin", async () => {
  let rpcCalls = 0;
  const deps = dependencies({
    store: {
      arm: () => {
        rpcCalls += 1;
        return Promise.resolve(result());
      },
      status: () => Promise.resolve(result()),
      cancel: () => Promise.resolve(result()),
      advance: () => Promise.resolve(result()),
      complete: () => Promise.resolve(result()),
    },
  });
  assertEquals(
    (await handleEliteSolarSupervisedTestRunRequest(
      request({ action: "arm" }, { origin: "https://evil.example" }),
      deps,
    )).status,
    403,
  );
  assertEquals(
    (await handleEliteSolarSupervisedTestRunRequest(
      request({ action: "arm" }, { origin: null }),
      deps,
    )).status,
    403,
  );
  assertEquals(rpcCalls, 0);
});

Deno.test("supervised test rejects bad auth, owner, methods, query strings, and malformed action before RPC", async () => {
  let rpcCalls = 0;
  const store = {
    arm: () => {
      rpcCalls += 1;
      return Promise.resolve(result());
    },
    status: () => {
      rpcCalls += 1;
      return Promise.resolve(result());
    },
    cancel: () => {
      rpcCalls += 1;
      return Promise.resolve(result());
    },
    advance: () => {
      rpcCalls += 1;
      return Promise.resolve(result());
    },
    complete: () => {
      rpcCalls += 1;
      return Promise.resolve(result());
    },
  };
  assertEquals(
    (await handleEliteSolarSupervisedTestRunRequest(
      request({ action: "arm" }, { authorization: "Bearer short" }),
      dependencies({ store }),
    )).status,
    401,
  );
  assertEquals(
    (await handleEliteSolarSupervisedTestRunRequest(
      request({ action: "arm" }),
      dependencies({ store, authenticate: () => Promise.resolve(OTHER) }),
    )).status,
    403,
  );
  assertEquals(
    (await handleEliteSolarSupervisedTestRunRequest(
      request({ action: "arm" }, { method: "GET" }),
      dependencies({ store }),
    )).status,
    405,
  );
  assertEquals(
    (await handleEliteSolarSupervisedTestRunRequest(
      request({ action: "arm" }, {
        url:
          "https://project.example/functions/v1/elite-solar-supervised-test-run?target=forged",
      }),
      dependencies({ store }),
    )).status,
    400,
  );
  assertEquals(
    (await handleEliteSolarSupervisedTestRunRequest(
      request({ action: "arm", copy: "forged", delay: 1 }),
      dependencies({ store }),
    )).status,
    400,
  );
  assertEquals(
    (await handleEliteSolarSupervisedTestRunRequest(
      request({ action: "advance", run_id: RUN, step: 4 }),
      dependencies({ store }),
    )).status,
    400,
  );
  assertEquals(
    (await handleEliteSolarSupervisedTestRunRequest(
      request({ action: "complete", run_id: RUN, completed_by: "forged" }),
      dependencies({ store }),
    )).status,
    400,
  );
  assertEquals(
    (await handleEliteSolarSupervisedTestRunRequest(
      request(`{"action":"arm","action":"advance","run_id":"${RUN}"}`),
      dependencies({ store }),
    )).status,
    400,
  );
  assertEquals(rpcCalls, 0);
});

Deno.test("arm sends only the fixed server-owned plan to its service RPC", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const response = await handleEliteSolarSupervisedTestRunRequest(
    request({ action: "arm" }),
    dependencies({
      store: {
        arm: (input) => {
          calls.push(input);
          return Promise.resolve(result());
        },
        status: () => Promise.resolve(result()),
        cancel: () => Promise.resolve(result()),
        advance: () => Promise.resolve(result()),
        complete: () => Promise.resolve(result()),
      },
    }),
  );
  assertEquals(response.status, 200);
  assertEquals(calls.length, 1);
  assertEquals(calls[0], {
    owner_user_id: OWNER,
    organization_id: ORGANIZATION,
    campaign_id: CAMPAIGN,
    plan_id: ELITE_SOLAR_SUPERVISED_TEST_PLAN.id,
    plan_version: ELITE_SOLAR_SUPERVISED_TEST_PLAN.version,
    stop_on_first_inbound_reply: true,
    inbound_reply_outcome: "halt_and_human_handoff",
  });
  const body = await json(response);
  assertEquals(body.provider_action, "none");
  assertEquals(body.side_effect_invariants.dispatcher_invocations, 0);
  assertEquals(body.authority.supervised_test_dispatch_authorized, false);
});

Deno.test("status and cancel require a canonical run id and never invoke the dispatcher", async () => {
  const calls: string[] = [];
  let dispatches = 0;
  const response = await handleEliteSolarSupervisedTestRunRequest(
    request({ action: "status", run_id: RUN }),
    dependencies({
      store: {
        arm: () => Promise.resolve(result()),
        status: (input) => {
          calls.push(`status:${input.run_id}`);
          return Promise.resolve(result({ run_state: "awaiting_reply" }));
        },
        cancel: (input) => {
          calls.push(`cancel:${input.run_id}`);
          return Promise.resolve(result({ run_state: "cancelled" }));
        },
        advance: () => Promise.resolve(result()),
        complete: () => Promise.resolve(result()),
      },
      dispatcher: {
        dispatch: () => {
          dispatches += 1;
          return Promise.resolve({ accepted: true, reason_code: "OKAY" });
        },
      },
    }),
  );
  assertEquals(response.status, 200);
  const cancel = await handleEliteSolarSupervisedTestRunRequest(
    request({ action: "cancel", run_id: RUN }),
    dependencies({
      store: {
        arm: () => Promise.resolve(result()),
        status: () => Promise.resolve(result()),
        cancel: (input) => {
          calls.push(`cancel:${input.run_id}`);
          return Promise.resolve(result({ run_state: "cancelled" }));
        },
        advance: () => Promise.resolve(result()),
        complete: () => Promise.resolve(result()),
      },
      dispatcher: {
        dispatch: () => {
          dispatches += 1;
          return Promise.resolve({ accepted: true, reason_code: "OKAY" });
        },
      },
    }),
  );
  assertEquals(cancel.status, 200);
  assertEquals(calls, [`status:${RUN}`, `cancel:${RUN}`]);
  assertEquals(dispatches, 0);
});

Deno.test("complete uses only the fixed run contract and never invokes the dispatcher", async () => {
  const calls: Array<Record<string, unknown>> = [];
  let dispatches = 0;
  const response = await handleEliteSolarSupervisedTestRunRequest(
    request({ action: "complete", run_id: RUN }),
    dependencies({
      store: {
        arm: () => Promise.resolve(result()),
        status: () => Promise.resolve(result()),
        cancel: () => Promise.resolve(result()),
        advance: () => Promise.resolve(result()),
        complete: (input) => {
          calls.push(input);
          return Promise.resolve(result({
            run_state: "completed",
            reason_code: "SUPERVISED_TEST_HANDOFF_COMPLETED",
          }));
        },
      },
      dispatcher: {
        dispatch: () => {
          dispatches += 1;
          return Promise.resolve({ accepted: true, reason_code: "OKAY" });
        },
      },
    }),
  );
  assertEquals(response.status, 200);
  assertEquals(calls, [{
    owner_user_id: OWNER,
    organization_id: ORGANIZATION,
    campaign_id: CAMPAIGN,
    plan_id: ELITE_SOLAR_SUPERVISED_TEST_PLAN.id,
    plan_version: ELITE_SOLAR_SUPERVISED_TEST_PLAN.version,
    stop_on_first_inbound_reply: true,
    inbound_reply_outcome: "halt_and_human_handoff",
    run_id: RUN,
  }]);
  assertEquals(dispatches, 0);
  const body = await json(response);
  assertEquals(body.action, "complete");
  assertEquals(body.provider_action, "none");
  assertEquals(body.side_effect_invariants.dispatcher_invocations, 0);
  assertEquals(body.authority.supervised_test_dispatch_authorized, false);
});

Deno.test("advance invokes the dispatcher only after an exact server authorization", async () => {
  const dispatched: Array<Record<string, string>> = [];
  const response = await handleEliteSolarSupervisedTestRunRequest(
    request({ action: "advance", run_id: RUN }),
    dependencies({
      store: {
        arm: () => Promise.resolve(result()),
        status: () => Promise.resolve(result()),
        cancel: () => Promise.resolve(result()),
        advance: () =>
          Promise.resolve(result({
            run_state: "dispatching",
            reason_code: "SUPERVISED_TEST_ADVANCE_AUTHORIZED",
            dispatch_authorized: true,
            dispatch_id: DISPATCH,
          })),
        complete: () => Promise.resolve(result()),
      },
      dispatcher: {
        dispatch: (input) => {
          dispatched.push(input);
          return Promise.resolve({
            accepted: true,
            reason_code: "DISPATCH_REQUEST_ACCEPTED",
          });
        },
      },
    }),
  );
  assertEquals(response.status, 202);
  assertEquals(dispatched, [{
    test_run_id: RUN,
  }]);
  const body = await json(response);
  assertEquals(body.provider_action, "supervised_dispatch_requested");
  assertEquals(body.dispatch_outcome, "accepted");
  assertEquals(body.authority.supervised_test_dispatch_authorized, true);
});

Deno.test("advance without service authorization cannot dispatch, and a dispatch failure is explicitly uncertain", async () => {
  let dispatches = 0;
  const unauthorized = await handleEliteSolarSupervisedTestRunRequest(
    request({ action: "advance", run_id: RUN }),
    dependencies({
      store: {
        arm: () => Promise.resolve(result()),
        status: () => Promise.resolve(result()),
        cancel: () => Promise.resolve(result()),
        advance: () => Promise.resolve(result({ run_state: "blocked" })),
        complete: () => Promise.resolve(result()),
      },
      dispatcher: {
        dispatch: () => {
          dispatches += 1;
          return Promise.resolve({ accepted: true, reason_code: "OKAY" });
        },
      },
    }),
  );
  assertEquals(unauthorized.status, 200);
  assertEquals(dispatches, 0);

  const unavailable = await handleEliteSolarSupervisedTestRunRequest(
    request({ action: "advance", run_id: RUN }),
    dependencies({
      store: {
        arm: () => Promise.resolve(result()),
        status: () => Promise.resolve(result()),
        cancel: () => Promise.resolve(result()),
        advance: () =>
          Promise.resolve(result({
            run_state: "dispatching",
            dispatch_authorized: true,
            dispatch_id: DISPATCH,
          })),
        complete: () => Promise.resolve(result()),
      },
      dispatcher: {
        dispatch: () => {
          dispatches += 1;
          return Promise.resolve({
            accepted: false,
            reason_code: "DISPATCH_ACCEPTANCE_UNKNOWN",
          });
        },
      },
    }),
  );
  assertEquals(unavailable.status, 502);
  const body = await json(unavailable);
  assertEquals(body.dispatch_outcome, "unknown");
  assertEquals(body.authority.supervised_test_dispatch_authorized, false);
  assertStringIncludes(body.statement, "halt on the first inbound reply");
  assertEquals(dispatches, 1);
});
