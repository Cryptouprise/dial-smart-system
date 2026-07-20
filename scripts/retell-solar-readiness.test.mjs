import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  RetellSolarReadinessError,
  inspectRetellSolarReadiness,
} from "./retell-solar-readiness.mjs";

const apiKey = "test-retell-key-0123456789";
const agentId = "agent_1234567890abcdef";
const agentVersion = 7;
const llmId = "llm_1234567890abcdef";
const llmVersion = 4;
const webhookUrl = "https://project.example.test/functions/v1/retell-call-webhook";

function safeAgent(overrides = {}) {
  return {
    agent_id: agentId,
    version: agentVersion,
    agent_name: "Private Elite Solar candidate",
    is_published: true,
    response_engine: { type: "retell-llm", llm_id: llmId, version: llmVersion },
    voice_id: "voice_private_123456",
    webhook_url: `${webhookUrl}/`,
    webhook_events: ["call_started", "call_ended", "call_analyzed"],
    opt_in_signed_url: true,
    data_storage_setting: "everything_except_pii",
    data_storage_retention_days: 30,
    max_call_duration_ms: 360_000,
    prompt: "Private provider prompt",
    ...overrides,
  };
}

function safeLlm(overrides = {}) {
  return {
    llm_id: llmId,
    version: llmVersion,
    is_published: true,
    model_temperature: 0,
    tool_call_strict_mode: true,
    start_speaker: "agent",
    general_prompt: "Private LLM prompt",
    general_tools: [{ type: "end_call", name: "end_call" }],
    tools: [],
    tool_functions: [],
    states: [],
    mcps: [],
    knowledge_base_ids: [],
    ...overrides,
  };
}

function readinessInput(overrides = {}) {
  return {
    apiKey,
    agentId,
    agentVersion,
    expectedWebhookUrl: webhookUrl,
    ...overrides,
  };
}

test("Retell Solar readiness verifies a redacted exact agent and LLM configuration", async () => {
  const calls = [];
  const result = await inspectRetellSolarReadiness({
    ...readinessInput(),
    fetchImpl: async (url, init) => {
      calls.push({ url: url.toString(), init });
      return new Response(JSON.stringify(url.pathname.startsWith("/get-agent/") ? safeAgent() : safeLlm()), { status: 200 });
    },
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, `https://api.retellai.com/get-agent/${agentId}?version=${agentVersion}`);
  assert.equal(calls[1].url, `https://api.retellai.com/get-retell-llm/${llmId}?version=${llmVersion}`);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${apiKey}`);
  assert.deepEqual(result, {
    kind: "retell_solar_readiness_v2",
    readiness_profile: "exact_published_agent_and_llm_read_only",
    reachable: true,
    agent_read_authorized: true,
    llm_read_authorized: true,
    agent_version: 7,
    llm_version: 4,
    agent_version_pinned: true,
    response_engine_configured: true,
    voice_configured: true,
    agent_published: true,
    canonical_webhook_configured: true,
    required_webhook_events_configured: true,
    signed_recording_links_configured: true,
    pii_minimization_configured: true,
    retention_configured: true,
    max_call_duration_configured: true,
    llm_published: true,
    strict_tool_mode_configured: true,
    deterministic_model_configured: true,
    start_speaker_configured: true,
    end_call_tool_configured: true,
    only_end_call_tools_configured: true,
    mcp_tools_absent: true,
    knowledge_base_absent: true,
    candidate_configuration_verified: true,
    attention_codes: [],
    provider_action: "none",
    authority: {
      contact_authorized: false,
      launch_authorized: false,
      queue_mutation_authorized: false,
      crm_write_authorized: false,
      provider_write_authorized: false,
      spend_authorized: false,
    },
    side_effect_invariants: {
      database_reads: 0,
      database_writes: 0,
      provider_read_probe_calls: 2,
      provider_writes: 0,
      external_messages: 0,
    },
  });
  const serialized = JSON.stringify(result);
  for (const privateValue of [apiKey, agentId, llmId, "Private Elite Solar candidate", "voice_private_123456", "project.example.test", "Private provider prompt", "Private LLM prompt"]) {
    assert.equal(serialized.includes(privateValue), false);
  }
});

test("Retell Solar readiness exposes only finite attention codes for unsafe agent or LLM configuration", async () => {
  const calls = [];
  const result = await inspectRetellSolarReadiness({
    ...readinessInput(),
    fetchImpl: async (url) => {
      calls.push(url.toString());
      return new Response(JSON.stringify(url.pathname.startsWith("/get-agent/")
        ? safeAgent({ webhook_events: ["call_started"], data_storage_setting: "everything" })
        : safeLlm({ general_tools: [{ type: "transfer_call", destination: "private destination" }], mcps: [{ url: "https://private.example.test" }] })), { status: 200 });
    },
  });

  assert.equal(calls.length, 2);
  assert.equal(result.candidate_configuration_verified, false);
  assert.deepEqual(result.attention_codes, [
    "WEBHOOK_EVENTS_INCOMPLETE",
    "PII_MINIMIZATION_INVALID",
    "END_CALL_TOOL_MISSING",
    "UNAPPROVED_TOOL_SURFACE",
    "MCP_TOOLS_PRESENT",
  ]);
  assert.equal(JSON.stringify(result).includes("private destination"), false);
  assert.equal(JSON.stringify(result).includes("private.example.test"), false);
});

test("Retell Solar readiness never follows a malformed agent response into an LLM read", async () => {
  const calls = [];
  const result = await inspectRetellSolarReadiness({
    ...readinessInput(),
    fetchImpl: async (url) => {
      calls.push(url.toString());
      return new Response(JSON.stringify(safeAgent({
        agent_id: "agent_unexpected_987654321",
        response_engine: { type: "custom-llm", llm_id: "llm_private_123456", version: llmVersion },
      })), { status: 200 });
    },
  });

  assert.deepEqual(calls, [`https://api.retellai.com/get-agent/${agentId}?version=${agentVersion}`]);
  assert.equal(result.llm_read_authorized, false);
  assert.equal(result.side_effect_invariants.provider_read_probe_calls, 1);
  assert.deepEqual(result.attention_codes, [
    "AGENT_ID_MISMATCH",
    "RESPONSE_ENGINE_INVALID",
    "LLM_READ_SKIPPED",
  ]);
  assert.equal(JSON.stringify(result).includes("agent_unexpected_987654321"), false);
});

test("Retell Solar readiness rejects a nonofficial base URL before making a request", async () => {
  let calls = 0;
  await assert.rejects(
    () => inspectRetellSolarReadiness({
      ...readinessInput({ baseUrl: "https://example.invalid" }),
      fetchImpl: async () => {
        calls += 1;
        return new Response("{}", { status: 200 });
      },
    }),
    (error) => error instanceof RetellSolarReadinessError && error.code === "BASE_URL_FORBIDDEN",
  );
  assert.equal(calls, 0);
});

test("Retell Solar readiness rejects an unsafe expected webhook before making a request", async () => {
  let calls = 0;
  await assert.rejects(
    () => inspectRetellSolarReadiness({
      ...readinessInput({ expectedWebhookUrl: "https://project.example.test/retell?token=not-allowed" }),
      fetchImpl: async () => {
        calls += 1;
        return new Response("{}", { status: 200 });
      },
    }),
    (error) => error instanceof RetellSolarReadinessError && error.code === "CONFIGURATION_INVALID",
  );
  assert.equal(calls, 0);
});

test("Retell Solar readiness fails closed on rejected reads without exposing response data", async () => {
  await assert.rejects(
    () => inspectRetellSolarReadiness({
      ...readinessInput(),
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
  delete env.RETELL_AGENT_VERSION;
  delete env.RETELL_EXPECTED_WEBHOOK_URL;
  const result = spawnSync(process.execPath, ["scripts/retell-solar-readiness.mjs"], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout), {
    kind: "retell_solar_readiness_v2",
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
