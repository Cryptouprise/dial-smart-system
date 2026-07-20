import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  RetellSolarReadinessError,
  inspectRetellSolarReadiness,
} from "./retell-solar-readiness.mjs";

const apiKey = "test-retell-key-0123456789";
const agentId = "agent_1234567890abcdef";

test("Retell Solar readiness performs one redacted, read-only agent check", async () => {
  const calls = [];
  const result = await inspectRetellSolarReadiness({
    apiKey,
    agentId,
    fetchImpl: async (url, init) => {
      calls.push({ url: url.toString(), init });
      return new Response(JSON.stringify({
        agent_id: agentId,
        version: 7,
        agent_name: "Private Elite Solar candidate",
        response_engine: {
          type: "retell-llm",
          llm_id: "llm_private_123456",
          version: 4,
        },
        voice_id: "voice_private_123456",
        webhook_url: "https://private.example.test/retell",
        webhook_events: ["call_started", "call_ended"],
        data_storage_setting: "everything",
        prompt: "Private provider prompt",
      }), { status: 200 });
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `https://api.retellai.com/get-agent/${agentId}`);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${apiKey}`);
  assert.deepEqual(result, {
    kind: "retell_solar_readiness_v1",
    reachable: true,
    agent_read_authorized: true,
    agent_version: 7,
    response_engine_configured: true,
    voice_configured: true,
    webhook_configured: true,
    webhook_events_configured: true,
    data_storage_policy_configured: true,
    candidate_configuration_complete: true,
    provider_action: "none",
    authority: {
      contact_authorized: false,
      launch_authorized: false,
      queue_mutation_authorized: false,
      crm_write_authorized: false,
      provider_write_authorized: false,
      spend_authorized: false,
    },
  });
  const serialized = JSON.stringify(result);
  for (const privateValue of [apiKey, agentId, "Private Elite Solar candidate", "llm_private_123456", "voice_private_123456", "private.example.test", "Private provider prompt"]) {
    assert.equal(serialized.includes(privateValue), false);
  }
});

test("Retell Solar readiness rejects a nonofficial base URL before making a request", async () => {
  let calls = 0;
  await assert.rejects(
    () => inspectRetellSolarReadiness({
      apiKey,
      agentId,
      baseUrl: "https://example.invalid",
      fetchImpl: async () => {
        calls += 1;
        return new Response("{}", { status: 200 });
      },
    }),
    (error) => error instanceof RetellSolarReadinessError && error.code === "BASE_URL_FORBIDDEN",
  );
  assert.equal(calls, 0);
});

test("Retell Solar readiness fails closed on rejected reads without exposing response data", async () => {
  await assert.rejects(
    () => inspectRetellSolarReadiness({
      apiKey,
      agentId,
      fetchImpl: async () => new Response(JSON.stringify({ detail: "private upstream error" }), { status: 401 }),
    }),
    (error) => error instanceof RetellSolarReadinessError && error.code === "RETELL_READ_REJECTED",
  );
});

test("Retell Solar readiness CLI executes its main routine and fails closed without configuration", () => {
  const env = { ...process.env };
  delete env.RETELL_API_KEY;
  delete env.RETELL_AI_API_KEY;
  delete env.RETELL_AGENT_ID;
  const result = spawnSync(process.execPath, ["scripts/retell-solar-readiness.mjs"], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout), {
    kind: "retell_solar_readiness_v1",
    reachable: false,
    error_code: "CONFIGURATION_INVALID",
    provider_action: "none",
    authority: {
      contact_authorized: false,
      launch_authorized: false,
      queue_mutation_authorized: false,
      crm_write_authorized: false,
      provider_write_authorized: false,
      spend_authorized: false,
    },
  });
});
