// deno-lint-ignore-file no-import-prefix -- repository Edge tests pin Deno std modules.
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type EliteSolarSupervisedRetellCallEvent,
  handleEliteSolarSupervisedRetellWebhookRequest,
  parseEliteSolarSupervisedRetellWebhookConfiguration,
} from "./handler.ts";

const IDS = Object.freeze({
  testRun: "123e4567-e89b-42d3-a456-426614174000",
  dispatch: "223e4567-e89b-42d3-a456-426614174000",
});
const SIGNING_KEY = "retell-supervised-test-webhook-signing-key-000001";
const AGENT = "agent_00000001";
const RECORDING_URL = "https://cdn.example.com/recordings/call-abc-123";
const WEBHOOK =
  "https://project.example/functions/v1/elite-solar-supervised-retell-webhook";
const NOW = new Date("2026-07-26T12:00:00Z");

async function sign(body: string, timestamp = NOW.getTime()): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SIGNING_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${body}${timestamp}`),
  );
  return `v=${timestamp},d=${
    [...new Uint8Array(digest)].map((byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("")
  }`;
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    event: "call_ended",
    call: {
      call_id: "call_00000001",
      agent_id: AGENT,
      recording_url: RECORDING_URL,
      transcript_object: [
        { role: "assistant", content: "Hi there, this is a quick call." },
        {
          role: "customer",
          content: "I received your message and interested.",
        },
      ],
      transcript: "this raw transcript must never enter the receipt RPC",
      metadata: {
        elite_solar_supervised_test_dispatch_id: IDS.dispatch,
        elite_solar_supervised_test_run_id: IDS.testRun,
        elite_solar_supervised_test_agent_id: AGENT,
        elite_solar_supervised_test_agent_version: 7,
        elite_solar_supervised_test_contract_version: 1,
      },
    },
    ...overrides,
  };
}

async function request(body: string, signature?: string): Promise<Request> {
  return new Request(
    "https://project.example/functions/v1/elite-solar-supervised-retell-webhook",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-retell-signature": signature || await sign(body),
      },
      body,
    },
  );
}

function fixture() {
  const records: EliteSolarSupervisedRetellCallEvent[] = [];
  return {
    records,
    deps: {
      configuration: {
        signingKey: SIGNING_KEY,
        agentId: AGENT,
        agentVersion: 7,
        expectedWebhookUrl: WEBHOOK,
        maxClockSkewMs: 300_000,
      },
      store: {
        recordCallEvent: (input: EliteSolarSupervisedRetellCallEvent) => {
          records.push(input);
          return Promise.resolve({
            recorded: true,
            resultCode: "SUPERVISED_TEST_CALL_EVENT_RECORDED",
          });
        },
      },
      now: () => NOW,
    },
  };
}

Deno.test("a signed, exactly bound Retell callback records a redacted lifecycle receipt", async () => {
  const { records, deps } = fixture();
  const body = JSON.stringify(payload());
  const response = await handleEliteSolarSupervisedRetellWebhookRequest(
    await request(body),
    deps,
  );
  assertEquals(response.status, 204);
  assertEquals(records.length, 1);
  assertEquals(records[0].providerEventKey, "retell:call_00000001:call_ended");
  assertEquals(records[0].agentId, AGENT);
  assertEquals(records[0].dispatchId, IDS.dispatch);
  assertEquals(records[0].callRecordingUrl, RECORDING_URL);
  assertEquals(
    records[0].callTranscript,
    "agent: Hi there, this is a quick call.\ncustomer: I received your message and interested.",
  );
});

Deno.test("bad signatures, stale callbacks, and wrong agent binding cannot write receipts", async () => {
  const { records, deps } = fixture();
  const body = JSON.stringify(payload());
  let response = await handleEliteSolarSupervisedRetellWebhookRequest(
    await request(body, "v=1785009600000,d=0".padEnd(82, "0")),
    deps,
  );
  assertEquals(response.status, 401);
  const staleBody = body;
  response = await handleEliteSolarSupervisedRetellWebhookRequest(
    await request(staleBody, await sign(staleBody, 1700000000000)),
    deps,
  );
  assertEquals(response.status, 401);
  response = await handleEliteSolarSupervisedRetellWebhookRequest(
    await request(JSON.stringify(payload({
      call: { ...payload().call, agent_id: "agent_other0001" },
    }))),
    deps,
  );
  assertEquals(response.status, 202);
  assertEquals(records.length, 0);
});

Deno.test("a durable Retell event replay is acknowledged without another lifecycle transition", async () => {
  const { records, deps } = fixture();
  deps.store.recordCallEvent = () =>
    Promise.resolve({
      recorded: false,
      resultCode: "SUPERVISED_TEST_CALL_EVENT_DUPLICATE_OR_REPLAY",
    });
  const body = JSON.stringify(payload());
  const response = await handleEliteSolarSupervisedRetellWebhookRequest(
    await request(body),
    deps,
  );
  assertEquals(response.status, 204);
  assertEquals(records.length, 0);
});

Deno.test("Retell runtime configuration is disabled by default and pins its own callback URL", () => {
  let disabled = false;
  try {
    parseEliteSolarSupervisedRetellWebhookConfiguration(() => undefined);
  } catch {
    disabled = true;
  }
  assert(disabled);
  const values = new Map<string, string>([
    ["ELITE_SOLAR_SUPERVISED_TEST_ENABLED", "true"],
    ["ELITE_SOLAR_SUPERVISED_TEST_RETELL_WEBHOOK_ENABLED", "true"],
    ["ELITE_SOLAR_SUPERVISED_TEST_RETELL_WEBHOOK_SIGNING_KEY", SIGNING_KEY],
    ["ELITE_SOLAR_SUPERVISED_TEST_RETELL_AGENT_ID", AGENT],
    ["ELITE_SOLAR_SUPERVISED_TEST_RETELL_AGENT_VERSION", "7"],
    ["SUPABASE_URL", "https://project.example"],
    ["ELITE_SOLAR_SUPERVISED_TEST_RETELL_WEBHOOK_URL", WEBHOOK],
  ]);
  const configuration = parseEliteSolarSupervisedRetellWebhookConfiguration(
    (name) => values.get(name),
  );
  assertEquals(configuration.expectedWebhookUrl, WEBHOOK);
});
