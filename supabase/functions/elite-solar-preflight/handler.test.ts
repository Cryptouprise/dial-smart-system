// deno-lint-ignore-file no-explicit-any no-import-prefix
import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type EliteSolarPreflightDependencies,
  handleEliteSolarPreflightRequest,
} from "./handler.ts";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ORIGIN = "https://app.elitesolar.example";
const TOKEN = `eyJ${"a".repeat(120)}`;

function request(
  body = "{}",
  options: {
    method?: string;
    origin?: string;
    authorization?: string;
    url?: string;
  } = {},
) {
  return new Request(
    options.url ?? "https://project.example/functions/v1/elite-solar-preflight",
    {
      method: options.method ?? "POST",
      headers: {
        origin: options.origin ?? ORIGIN,
        authorization: options.authorization ?? `Bearer ${TOKEN}`,
        "content-type": "application/json",
      },
      ...(options.method === "OPTIONS" || options.method === "GET"
        ? {}
        : { body }),
    },
  );
}

function environment(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    ELITE_SOLAR_PREFLIGHT_ENABLED: "true",
    ELITE_SOLAR_PREFLIGHT_OWNER_USER_ID: OWNER,
    ELITE_SOLAR_PREFLIGHT_ALLOWED_ORIGIN: ORIGIN,
    ...overrides,
  };
  return (name: string) => values[name];
}

function dependencies(
  overrides: Partial<EliteSolarPreflightDependencies> = {},
): EliteSolarPreflightDependencies {
  return {
    getEnvironment: environment(),
    authenticate: () => Promise.resolve(OWNER),
    fetchImpl: () => Promise.reject(new Error("unexpected provider fetch")),
    ...overrides,
  };
}

async function json(response: Response): Promise<Record<string, any>> {
  return await response.json() as Record<string, any>;
}

Deno.test("server preflight hard-locks before auth or provider work when not provisioned", async () => {
  let authenticates = 0;
  let reads = 0;
  const result = await handleEliteSolarPreflightRequest(
    request(),
    dependencies({
      getEnvironment: environment({ ELITE_SOLAR_PREFLIGHT_ENABLED: "false" }),
      authenticate: () => {
        authenticates += 1;
        return Promise.resolve(OWNER);
      },
      fetchImpl: () => {
        reads += 1;
        return Promise.reject(new Error("must not read"));
      },
    }),
  );
  assertEquals(result.status, 503);
  assertEquals(
    (await json(result)).error_code,
    "ELITE_SOLAR_PREFLIGHT_NOT_PROVISIONED",
  );
  assertEquals(authenticates, 0);
  assertEquals(reads, 0);
});

Deno.test("server preflight rejects origin, request shape, and non-owner before provider reads", async () => {
  let reads = 0;
  const deps = dependencies({
    fetchImpl: () => {
      reads += 1;
      return Promise.reject(new Error("must not read"));
    },
  });
  assertEquals(
    (await handleEliteSolarPreflightRequest(
      request("{}", { origin: "https://evil.example" }),
      deps,
    )).status,
    403,
  );
  assertEquals(
    (await handleEliteSolarPreflightRequest(
      request('{"provider":"retell"}'),
      deps,
    )).status,
    400,
  );
  assertEquals(
    (await handleEliteSolarPreflightRequest(
      request("{}", { method: "GET" }),
      deps,
    )).status,
    405,
  );
  assertEquals(
    (await handleEliteSolarPreflightRequest(
      request("{}", {
        url:
          "https://project.example/functions/v1/elite-solar-preflight?tenant=forged",
      }),
      deps,
    )).status,
    400,
  );
  assertEquals(
    (await handleEliteSolarPreflightRequest(
      request("{}"),
      dependencies({
        authenticate: () => Promise.resolve(OTHER),
        fetchImpl: deps.fetchImpl,
      }),
    )).status,
    403,
  );
  assertEquals(reads, 0);
});

Deno.test("server preflight returns a zero-probe configuration handoff without provider secrets", async () => {
  let reads = 0;
  const result = await handleEliteSolarPreflightRequest(
    request(),
    dependencies({
      fetchImpl: () => {
        reads += 1;
        return Promise.reject(new Error("must not read"));
      },
    }),
  );
  assertEquals(result.status, 200);
  const body = await json(result);
  assertEquals(body.status, "offline_bundle_ready_configuration_required");
  assertEquals(body.side_effect_invariants.provider_read_probe_calls, 0);
  assertEquals(body.side_effect_invariants.provider_writes, 0);
  assertEquals(body.authority.contact_authorized, false);
  assertEquals(body.provider_lanes.retell.status, "configuration_required");
  assertEquals(
    body.provider_lanes.email.instantly.status,
    "configuration_required",
  );
  assertEquals(
    body.provider_lanes.email.mailgun.status,
    "configuration_required",
  );
  assertEquals(reads, 0);
});

Deno.test("server preflight makes bounded official reads and emits no provider objects or secrets", async () => {
  const privateRetellKey = "retell-secret-key-1234567890";
  const privateInstantlyKey = "instantly-secret-key-1234567890";
  const privateMailgunKey = "mailgun-secret-key-1234567890";
  const calls: Array<{ url: string; method: string }> = [];
  const fetchImpl = (url: URL, init: RequestInit) => {
    calls.push({ url: url.href, method: String(init.method) });
    if (url.pathname.startsWith("/get-agent/")) {
      return Promise.resolve(Response.json({
        agent_id: "agent_12345678",
        version: 7,
        response_engine: {
          type: "retell-llm",
          llm_id: "llm_12345678",
          version: 3,
        },
        voice_id: "voice_12345678",
        is_published: true,
        webhook_url: "https://app.elitesolar.example/retell-webhook",
        webhook_events: ["call_started", "call_ended", "call_analyzed"],
        opt_in_signed_url: true,
        data_storage_setting: "everything_except_pii",
        data_storage_retention_days: 30,
        max_call_duration_ms: 360000,
        agent_prompt: "must never leave provider response",
      }));
    }
    if (url.pathname.startsWith("/get-retell-llm/")) {
      return Promise.resolve(Response.json({
        llm_id: "llm_12345678",
        version: 3,
        is_published: true,
        tool_call_strict_mode: true,
        model_temperature: 0,
        start_speaker: "agent",
        general_tools: [],
        tools: [{ type: "end_call" }],
        tool_functions: [],
        states: [{ tools: [] }],
        mcps: [],
        knowledge_base_ids: [],
        general_prompt: "must never leave provider response",
      }));
    }
    if (url.hostname === "api.instantly.ai") {
      return Promise.resolve(Response.json({
        items: [{
          setup_pending: false,
          warmup_status: 1,
          tracking_domain_status: "active",
          email: "hidden@example.test",
        }],
      }));
    }
    return Promise.resolve(Response.json({
      domain: {
        state: "active",
        receiving_dns_records: [],
        sending_dns_records: [],
        name: "hidden.example.test",
      },
    }));
  };
  const result = await handleEliteSolarPreflightRequest(
    request(),
    dependencies({
      getEnvironment: environment({
        RETELL_API_KEY: privateRetellKey,
        RETELL_AGENT_ID: "agent_12345678",
        RETELL_AGENT_VERSION: "7",
        RETELL_EXPECTED_WEBHOOK_URL:
          "https://app.elitesolar.example/retell-webhook",
        INSTANTLY_API_KEY: privateInstantlyKey,
        MAILGUN_API_KEY: privateMailgunKey,
        MAILGUN_DOMAIN: "mail.elitesolar.example",
      }),
      fetchImpl,
    }),
  );
  assertEquals(result.status, 200);
  const body = await json(result);
  assertEquals(body.status, "offline_bundle_ready_readiness_observed");
  assertEquals(body.side_effect_invariants.provider_read_probe_calls, 4);
  assertEquals(body.provider_lanes.retell.status, "verified");
  assertEquals(body.provider_lanes.email.instantly.status, "verified");
  assertEquals(body.provider_lanes.email.mailgun.status, "verified");
  assertEquals(calls.map((call) => call.method), ["GET", "GET", "GET", "GET"]);
  assertEquals(calls.map((call) => call.url), [
    "https://api.retellai.com/get-agent/agent_12345678?version=7",
    "https://api.retellai.com/get-retell-llm/llm_12345678?version=3",
    "https://api.instantly.ai/api/v2/accounts?limit=1",
    "https://api.mailgun.net/v3/domains/mail.elitesolar.example",
  ]);
  const serialized = JSON.stringify(body);
  for (
    const forbidden of [
      privateRetellKey,
      privateInstantlyKey,
      privateMailgunKey,
      "agent_12345678",
      "llm_12345678",
      "hidden@example.test",
      "hidden.example.test",
      "must never leave provider response",
    ]
  ) assertEquals(serialized.includes(forbidden), false);
});

Deno.test("server preflight holds a rejected provider read without exposing its body", async () => {
  const responseBody = "provider response with private details";
  const result = await handleEliteSolarPreflightRequest(
    request(),
    dependencies({
      getEnvironment: environment({
        RETELL_API_KEY: "retell-secret-key-1234567890",
        RETELL_AGENT_ID: "agent_12345678",
        RETELL_AGENT_VERSION: "7",
        RETELL_EXPECTED_WEBHOOK_URL:
          "https://app.elitesolar.example/retell-webhook",
      }),
      fetchImpl: () =>
        Promise.resolve(new Response(responseBody, { status: 401 })),
    }),
  );
  assertEquals(result.status, 200);
  const body = await json(result);
  assertEquals(body.status, "offline_bundle_ready_readiness_blocked");
  assertEquals(body.provider_lanes.retell.status, "readiness_blocked");
  assertEquals(body.provider_lanes.retell.error_code, "RETELL_READ_REJECTED");
  assertEquals(JSON.stringify(body).includes(responseBody), false);
  assertStringIncludes(body.statement, "redacted read-only posture check");
  assert(body.authority.launch_authorized === false);
});
