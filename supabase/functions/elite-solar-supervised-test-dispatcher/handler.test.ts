// deno-lint-ignore-file no-import-prefix -- repository Edge tests pin Deno std modules.
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type ClaimResult,
  type DispatchFinalization,
  type EliteSolarSupervisedTestDispatchStore,
  handleEliteSolarSupervisedTestDispatchRequest,
  type SupervisedDispatch,
} from "./handler.ts";

const IDS = Object.freeze({
  testRun: "123e4567-e89b-42d3-a456-426614174000",
  dispatch: "223e4567-e89b-42d3-a456-426614174000",
  instance: "323e4567-e89b-42d3-a456-426614174000",
});
const SERVICE_ROLE = "service-role-token-for-supervised-test-only";
const TELNYX_KEY = "telnyx-test-secret-not-a-real-key";
const RETELL_KEY = "retell-test-secret-not-a-real-key";
const TELNYX_PROFILE = "profile_00000001";
const RETELL_AGENT = "agent_00000001";
const RETELL_WEBHOOK =
  "https://project.example/functions/v1/elite-solar-supervised-retell-webhook";

function smsDispatch(
  overrides: Partial<SupervisedDispatch> = {},
): SupervisedDispatch {
  return {
    dispatch_id: IDS.dispatch,
    test_run_id: IDS.testRun,
    provider: "telnyx",
    channel: "sms",
    idempotency_key: "supervised-test-message-000001",
    from_e164: "+15555550101",
    to_e164: "+15555550102",
    message_body: "SIMULATED T+0 — reply to stop this supervised test.",
    retell_agent_id: null,
    retell_agent_version: null,
    retell_webhook_url: null,
    ...overrides,
  };
}

function retellDispatch(
  overrides: Partial<SupervisedDispatch> = {},
): SupervisedDispatch {
  return {
    dispatch_id: IDS.dispatch,
    test_run_id: IDS.testRun,
    provider: "retell",
    channel: "voice",
    idempotency_key: "supervised-test-retell-000001",
    from_e164: "+15555550101",
    to_e164: "+15555550102",
    message_body: null,
    retell_agent_id: RETELL_AGENT,
    retell_agent_version: 7,
    retell_webhook_url: RETELL_WEBHOOK,
    ...overrides,
  };
}

function request(
  options: {
    authorization?: string;
    body?: string;
    contentType?: string;
    url?: string;
  } = {},
): Request {
  return new Request(
    options.url ||
      "https://project.example/functions/v1/elite-solar-supervised-test-dispatcher",
    {
      method: "POST",
      headers: {
        authorization: options.authorization || `Bearer ${SERVICE_ROLE}`,
        "content-type": options.contentType || "application/json",
      },
      body: options.body || JSON.stringify({ test_run_id: IDS.testRun }),
    },
  );
}

function environment(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    SUPABASE_URL: "https://project.example",
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE,
    ELITE_SOLAR_SUPERVISED_TEST_ENABLED: "true",
    ELITE_SOLAR_SUPERVISED_TEST_DISPATCH_ENABLED: "true",
    ELITE_SOLAR_SUPERVISED_TEST_LIVE_EGRESS_ENABLED: "true",
    ELITE_SOLAR_SUPERVISED_TEST_TELNYX_API_KEY: TELNYX_KEY,
    ELITE_SOLAR_SUPERVISED_TEST_TELNYX_MESSAGING_PROFILE_ID: TELNYX_PROFILE,
    ELITE_SOLAR_SUPERVISED_TEST_RETELL_API_KEY: RETELL_KEY,
    ELITE_SOLAR_SUPERVISED_TEST_RETELL_AGENT_ID: RETELL_AGENT,
    ELITE_SOLAR_SUPERVISED_TEST_RETELL_AGENT_VERSION: "7",
    ELITE_SOLAR_SUPERVISED_TEST_RETELL_WEBHOOK_URL: RETELL_WEBHOOK,
    ...overrides,
  };
  return (name: string) => values[name];
}

function store(claimResult: ClaimResult) {
  const finalizations: DispatchFinalization[] = [];
  let claims = 0;
  const value: EliteSolarSupervisedTestDispatchStore = {
    claim: () => {
      claims += 1;
      return Promise.resolve(claimResult);
    },
    finalize: (input) => {
      finalizations.push(input);
      return Promise.resolve(true);
    },
  };
  return { value, finalizations, claims: () => claims };
}

Deno.test("the dispatcher is service-role-only and never claims from a bad bearer", async () => {
  const fixture = store({ kind: "claimed", dispatch: smsDispatch() });
  const response = await handleEliteSolarSupervisedTestDispatchRequest(
    request({ authorization: "Bearer not-the-service-role" }),
    {
      getEnvironment: environment(),
      store: fixture.value,
      randomUuid: () => IDS.instance,
      fetchImpl: () => Promise.reject(new Error("must not fetch")),
    },
  );
  assertEquals(response.status, 401);
  assertEquals(fixture.claims(), 0);
  assertEquals(fixture.finalizations.length, 0);
});

Deno.test("the dispatcher claims at most one Telnyx SMS, uses its immutable idempotency key, and finalizes acceptance", async () => {
  const fixture = store({ kind: "claimed", dispatch: smsDispatch() });
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const response = await handleEliteSolarSupervisedTestDispatchRequest(
    request(),
    {
      getEnvironment: environment(),
      store: fixture.value,
      randomUuid: () => IDS.instance,
      fetchImpl: (url, init) => {
        const requestUrl = url instanceof URL
          ? url.href
          : url instanceof Request
          ? url.url
          : url;
        calls.push({ url: requestUrl, init: init ?? ({} as RequestInit) });
        return Promise.resolve(
          Response.json({ data: { id: "message_00000001" } }),
        );
      },
    },
  );
  assertEquals(response.status, 202);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].url, "https://api.telnyx.com/v2/messages");
  assertEquals(calls[0].init.headers, {
    Authorization: `Bearer ${TELNYX_KEY}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    "Idempotency-Key": "supervised-test-message-000001",
  });
  assertEquals(fixture.finalizations, [{
    dispatchId: IDS.dispatch,
    dispatcherInstanceId: IDS.instance,
    status: "accepted",
    providerObjectId: "message_00000001",
    providerResponseSha256: fixture.finalizations[0].providerResponseSha256,
    errorCode: null,
  }]);
  const serialized = await response.text();
  assertEquals(serialized.includes("+15555550102"), false);
  assertEquals(serialized.includes(TELNYX_KEY), false);
});

Deno.test("a Telnyx transport failure becomes acceptance_unknown and is never retried", async () => {
  const fixture = store({ kind: "claimed", dispatch: smsDispatch() });
  let calls = 0;
  const response = await handleEliteSolarSupervisedTestDispatchRequest(
    request(),
    {
      getEnvironment: environment(),
      store: fixture.value,
      randomUuid: () => IDS.instance,
      fetchImpl: () => {
        calls += 1;
        return Promise.reject(new Error("timeout"));
      },
    },
  );
  assertEquals(response.status, 202);
  assertEquals(calls, 1);
  assertEquals(fixture.finalizations[0].status, "acceptance_unknown");
  assertEquals(
    fixture.finalizations[0].errorCode,
    "TELNYX_TRANSPORT_UNCERTAIN",
  );
});

Deno.test("an unapproved Retell agent is finalized without creating a physical call", async () => {
  const fixture = store({ kind: "claimed", dispatch: retellDispatch() });
  let creates = 0;
  const response = await handleEliteSolarSupervisedTestDispatchRequest(
    request(),
    {
      getEnvironment: environment(),
      store: fixture.value,
      randomUuid: () => IDS.instance,
      inspectRetell: () => Promise.resolve({ status: "attention_required" }),
      fetchImpl: () => {
        creates += 1;
        return Promise.reject(new Error("must not create"));
      },
    },
  );
  assertEquals(response.status, 409);
  assertEquals(creates, 0);
  assertEquals(fixture.finalizations[0].status, "definite_failure");
  assertEquals(fixture.finalizations[0].errorCode, "RETELL_AGENT_NOT_APPROVED");
});

Deno.test("a verified Retell agent may create one call only after an exact callback binding", async () => {
  const fixture = store({ kind: "claimed", dispatch: retellDispatch() });
  const calls: Array<{ url: string; body: string }> = [];
  const response = await handleEliteSolarSupervisedTestDispatchRequest(
    request(),
    {
      getEnvironment: environment(),
      store: fixture.value,
      randomUuid: () => IDS.instance,
      inspectRetell: () => Promise.resolve({ status: "verified" }),
      fetchImpl: (url, init) => {
        const requestUrl = url instanceof URL
          ? url.href
          : url instanceof Request
          ? url.url
          : url;
        calls.push({ url: requestUrl, body: String(init?.body ?? "") });
        return Promise.resolve(Response.json({ call_id: "call_00000001" }));
      },
    },
  );
  assertEquals(response.status, 202);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].url, "https://api.retellai.com/v2/create-phone-call");
  const body = JSON.parse(calls[0].body);
  assertEquals(
    body.metadata.elite_solar_supervised_test_dispatch_id,
    IDS.dispatch,
  );
  assertEquals(body.agent_override.agent.webhook_url, RETELL_WEBHOOK);
  assertEquals(fixture.finalizations[0].status, "accepted");
  assertEquals(fixture.finalizations[0].providerObjectId, "call_00000001");
});

Deno.test("a malformed claimed row is finalized safely without provider egress", async () => {
  const fixture = store({
    kind: "claimed",
    dispatch: smsDispatch({ message_body: "" }),
  });
  let calls = 0;
  const response = await handleEliteSolarSupervisedTestDispatchRequest(
    request(),
    {
      getEnvironment: environment(),
      store: fixture.value,
      randomUuid: () => IDS.instance,
      fetchImpl: () => {
        calls += 1;
        return Promise.reject(new Error("must not fetch"));
      },
    },
  );
  assertEquals(response.status, 503);
  assertEquals(calls, 0);
  assertEquals(fixture.finalizations[0].errorCode, "DISPATCH_CLAIM_MALFORMED");
});

Deno.test("an empty claim ends without provider work", async () => {
  const fixture = store({ kind: "empty" });
  const response = await handleEliteSolarSupervisedTestDispatchRequest(
    request(),
    {
      getEnvironment: environment(),
      store: fixture.value,
      randomUuid: () => IDS.instance,
      fetchImpl: () => Promise.reject(new Error("must not fetch")),
    },
  );
  assertEquals(response.status, 204);
  assertEquals(fixture.finalizations.length, 0);
  assert(fixture.claims() === 1);
});
