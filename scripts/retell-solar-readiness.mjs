#!/usr/bin/env node
import { pathToFileURL } from "node:url";

/**
 * Performs a redacted, read-only verification of the exact Elite Solar Retell
 * agent and its attached LLM. It makes at most two official GET requests and
 * cannot create/edit an agent, place a call, change a phone number, modify a
 * webhook, or start a campaign.
 *
 * The returned object deliberately omits agent/LLM/voice IDs, webhook URLs,
 * prompts, agent names, tools, tags, API keys, and provider response bodies.
 */

const DEFAULT_BASE_URL = "https://api.retellai.com";
const SECRET_PATTERN = /^[^\s\x00-\x1f\x7f]{16,512}$/;
const PROVIDER_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const MAX_VERSION = 1_000_000;
const REQUIRED_WEBHOOK_EVENTS = new Set(["call_started", "call_ended", "call_analyzed"]);
const REQUIRED_RETENTION_DAYS = 30;
const REQUIRED_MAX_CALL_DURATION_MS = 360_000;

const NO_AUTHORITY = Object.freeze({
  contact_authorized: false,
  launch_authorized: false,
  queue_mutation_authorized: false,
  crm_write_authorized: false,
  provider_write_authorized: false,
  spend_authorized: false,
});

export class RetellSolarReadinessError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RetellSolarReadinessError";
    this.code = code;
  }
}

function secret(value) {
  if (typeof value !== "string" || !SECRET_PATTERN.test(value)) {
    throw new RetellSolarReadinessError("CONFIGURATION_INVALID", "RETELL_API_KEY is missing or invalid");
  }
  return value;
}

function providerReference(value, name) {
  if (typeof value !== "string" || !PROVIDER_ID_PATTERN.test(value)) {
    throw new RetellSolarReadinessError("CONFIGURATION_INVALID", `${name} is missing or invalid`);
  }
  return value;
}

function exactVersion(value, name) {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && /^(?:0|[1-9]\d{0,6})$/.test(value)
      ? Number(value)
      : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > MAX_VERSION) {
    throw new RetellSolarReadinessError("CONFIGURATION_INVALID", `${name} is missing or invalid`);
  }
  return parsed;
}

function normalizedHttpsUrl(value, name) {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) {
    throw new RetellSolarReadinessError("CONFIGURATION_INVALID", `${name} is missing or invalid`);
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new RetellSolarReadinessError("CONFIGURATION_INVALID", `${name} is missing or invalid`);
  }
  if (
    url.protocol !== "https:" || url.username || url.password || url.search || url.hash
    || value !== value.trim()
  ) {
    throw new RetellSolarReadinessError("CONFIGURATION_INVALID", `${name} is missing or invalid`);
  }
  return url.href.replace(/\/+$/, "");
}

function normalizedBaseUrl(value) {
  const candidate = value ?? DEFAULT_BASE_URL;
  if (candidate !== DEFAULT_BASE_URL) {
    throw new RetellSolarReadinessError(
      "BASE_URL_FORBIDDEN",
      "The Retell readiness check permits only the official API base URL",
    );
  }
  return candidate;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function positiveVersion(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_VERSION
    ? value
    : null;
}

function optionalArray(value) {
  return value === undefined || value === null ? [] : Array.isArray(value) ? value : null;
}

function isEndCallTool(value) {
  return isObject(value) && value.type === "end_call";
}

function evaluateToolPolicy(llm) {
  const directToolFields = ["general_tools", "tools", "tool_functions"];
  const tools = [];
  let structurallyValid = true;
  for (const field of directToolFields) {
    const entries = optionalArray(llm[field]);
    if (!entries) {
      structurallyValid = false;
      continue;
    }
    tools.push(...entries);
  }

  const states = optionalArray(llm.states);
  if (!states) {
    structurallyValid = false;
  } else {
    for (const state of states) {
      if (!isObject(state)) {
        structurallyValid = false;
        continue;
      }
      const stateTools = optionalArray(state.tools);
      if (!stateTools) {
        structurallyValid = false;
        continue;
      }
      tools.push(...stateTools);
    }
  }

  const mcps = optionalArray(llm.mcps);
  const knowledgeBaseIds = optionalArray(llm.knowledge_base_ids);
  return Object.freeze({
    end_call_tool_configured: tools.some(isEndCallTool),
    only_end_call_tools_configured: structurallyValid && tools.length > 0 && tools.every(isEndCallTool),
    mcp_tools_absent: Boolean(mcps && mcps.length === 0),
    knowledge_base_absent: Boolean(knowledgeBaseIds && knowledgeBaseIds.length === 0),
  });
}

function summarizeAgent({ agent, expectedAgentId, expectedAgentVersion, expectedWebhookUrl }) {
  if (!isObject(agent)) {
    throw new RetellSolarReadinessError("RETELL_RESPONSE_INVALID", "The Retell agent endpoint returned an invalid body");
  }
  const engine = isObject(agent.response_engine) ? agent.response_engine : null;
  const llmId = engine && typeof engine.llm_id === "string" && PROVIDER_ID_PATTERN.test(engine.llm_id)
    ? engine.llm_id
    : null;
  const llmVersion = engine ? positiveVersion(engine.version) : null;
  const agentVersion = positiveVersion(agent.version);
  const events = optionalArray(agent.webhook_events);
  const eventNames = events && events.every((event) => typeof event === "string")
    ? new Set(events)
    : null;
  const requiredWebhookEventsConfigured = Boolean(
    eventNames
      && eventNames.size === REQUIRED_WEBHOOK_EVENTS.size
      && [...REQUIRED_WEBHOOK_EVENTS].every((event) => eventNames.has(event)),
  );

  let canonicalWebhookConfigured = false;
  if (typeof agent.webhook_url === "string") {
    try {
      canonicalWebhookConfigured = normalizedHttpsUrl(agent.webhook_url, "provider webhook") === expectedWebhookUrl;
    } catch {
      canonicalWebhookConfigured = false;
    }
  }

  return Object.freeze({
    private_llm_id: llmId,
    private_llm_version: llmVersion,
    agent_id_matches: agent.agent_id === expectedAgentId,
    agent_version: agentVersion,
    agent_version_pinned: agentVersion === expectedAgentVersion,
    response_engine_configured: Boolean(engine && engine.type === "retell-llm" && llmId && llmVersion !== null),
    voice_configured: typeof agent.voice_id === "string" && agent.voice_id.length > 0,
    agent_published: agent.is_published === true,
    canonical_webhook_configured: canonicalWebhookConfigured,
    required_webhook_events_configured: requiredWebhookEventsConfigured,
    signed_recording_links_configured: agent.opt_in_signed_url === true,
    pii_minimization_configured: agent.data_storage_setting === "everything_except_pii",
    retention_configured: agent.data_storage_retention_days === REQUIRED_RETENTION_DAYS,
    max_call_duration_configured: agent.max_call_duration_ms === REQUIRED_MAX_CALL_DURATION_MS,
  });
}

function summarizeLlm({ llm, expectedLlmId, expectedLlmVersion }) {
  if (!isObject(llm)) {
    throw new RetellSolarReadinessError("RETELL_RESPONSE_INVALID", "The Retell LLM endpoint returned an invalid body");
  }
  const tools = evaluateToolPolicy(llm);
  return Object.freeze({
    llm_id_matches_agent: llm.llm_id === expectedLlmId,
    llm_version_matches_agent: positiveVersion(llm.version) === expectedLlmVersion,
    llm_published: llm.is_published === true,
    strict_tool_mode_configured: llm.tool_call_strict_mode === true,
    deterministic_model_configured: llm.model_temperature === 0,
    start_speaker_configured: llm.start_speaker === "agent",
    ...tools,
  });
}

function attentionCodes(agent, llm) {
  const codes = [];
  if (!agent.agent_id_matches) codes.push("AGENT_ID_MISMATCH");
  if (!agent.agent_version_pinned) codes.push("AGENT_VERSION_MISMATCH");
  if (!agent.response_engine_configured) codes.push("RESPONSE_ENGINE_INVALID");
  if (!agent.voice_configured) codes.push("VOICE_UNCONFIGURED");
  if (!agent.agent_published) codes.push("AGENT_NOT_PUBLISHED");
  if (!agent.canonical_webhook_configured) codes.push("CANONICAL_WEBHOOK_MISMATCH");
  if (!agent.required_webhook_events_configured) codes.push("WEBHOOK_EVENTS_INCOMPLETE");
  if (!agent.signed_recording_links_configured) codes.push("SIGNED_RECORDING_URLS_DISABLED");
  if (!agent.pii_minimization_configured) codes.push("PII_MINIMIZATION_INVALID");
  if (!agent.retention_configured) codes.push("RETENTION_POLICY_INVALID");
  if (!agent.max_call_duration_configured) codes.push("MAX_CALL_DURATION_INVALID");
  if (!llm) {
    codes.push("LLM_READ_SKIPPED");
    return Object.freeze(codes);
  }
  if (!llm.llm_id_matches_agent || !llm.llm_version_matches_agent) codes.push("LLM_BINDING_MISMATCH");
  if (!llm.llm_published) codes.push("LLM_NOT_PUBLISHED");
  if (!llm.strict_tool_mode_configured) codes.push("STRICT_TOOL_MODE_DISABLED");
  if (!llm.deterministic_model_configured) codes.push("MODEL_TEMPERATURE_INVALID");
  if (!llm.start_speaker_configured) codes.push("START_SPEAKER_INVALID");
  if (!llm.end_call_tool_configured) codes.push("END_CALL_TOOL_MISSING");
  if (!llm.only_end_call_tools_configured) codes.push("UNAPPROVED_TOOL_SURFACE");
  if (!llm.mcp_tools_absent) codes.push("MCP_TOOLS_PRESENT");
  if (!llm.knowledge_base_absent) codes.push("KNOWLEDGE_BASE_PRESENT");
  return Object.freeze(codes);
}

async function providerGet({ fetchImpl, url, key, endpoint }) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
    });
  } catch {
    throw new RetellSolarReadinessError("RETELL_UNREACHABLE", `The Retell ${endpoint} endpoint could not be reached`);
  }
  if (!response || typeof response.status !== "number") {
    throw new RetellSolarReadinessError("RETELL_RESPONSE_INVALID", `The Retell ${endpoint} endpoint returned an invalid response`);
  }
  if (!response.ok) {
    throw new RetellSolarReadinessError("RETELL_READ_REJECTED", `The Retell ${endpoint} read was rejected with HTTP ${response.status}`);
  }
  try {
    return await response.json();
  } catch {
    throw new RetellSolarReadinessError("RETELL_RESPONSE_INVALID", `The Retell ${endpoint} endpoint did not return JSON`);
  }
}

/**
 * Performs one exact-version GET for an agent and, only when the returned
 * response engine is a valid Retell LLM binding, one exact-version GET for
 * that LLM. It returns no provider object and has no provider write path.
 */
export async function inspectRetellSolarReadiness({
  apiKey,
  agentId,
  agentVersion,
  expectedWebhookUrl,
  baseUrl,
  fetchImpl = globalThis.fetch,
}) {
  const key = secret(apiKey);
  const candidate = providerReference(agentId, "RETELL_AGENT_ID");
  const candidateVersion = exactVersion(agentVersion, "RETELL_AGENT_VERSION");
  const webhook = normalizedHttpsUrl(expectedWebhookUrl, "RETELL_EXPECTED_WEBHOOK_URL");
  const root = normalizedBaseUrl(baseUrl);
  if (typeof fetchImpl !== "function") {
    throw new RetellSolarReadinessError("FETCH_UNAVAILABLE", "A fetch implementation is required");
  }

  const agentUrl = new URL(`/get-agent/${encodeURIComponent(candidate)}`, root);
  agentUrl.searchParams.set("version", String(candidateVersion));
  const agentBody = await providerGet({ fetchImpl, url: agentUrl, key, endpoint: "agent" });
  const agent = summarizeAgent({
    agent: agentBody,
    expectedAgentId: candidate,
    expectedAgentVersion: candidateVersion,
    expectedWebhookUrl: webhook,
  });

  let llm = null;
  let llmReadAuthorized = false;
  // Never use a provider-supplied LLM reference unless the exact requested
  // agent and version were returned. This keeps the second read bound to the
  // stated candidate even if an upstream response is malformed or unexpected.
  if (agent.agent_id_matches && agent.agent_version_pinned && agent.response_engine_configured) {
    const llmUrl = new URL(`/get-retell-llm/${encodeURIComponent(agent.private_llm_id)}`, root);
    llmUrl.searchParams.set("version", String(agent.private_llm_version));
    const llmBody = await providerGet({ fetchImpl, url: llmUrl, key, endpoint: "LLM" });
    llm = summarizeLlm({
      llm: llmBody,
      expectedLlmId: agent.private_llm_id,
      expectedLlmVersion: agent.private_llm_version,
    });
    llmReadAuthorized = true;
  }

  const attention = attentionCodes(agent, llm);
  const candidateConfigurationVerified = attention.length === 0;
  return Object.freeze({
    kind: "retell_solar_readiness_v2",
    readiness_profile: "exact_published_agent_and_llm_read_only",
    reachable: true,
    agent_read_authorized: true,
    llm_read_authorized: llmReadAuthorized,
    agent_version: agent.agent_version,
    llm_version: agent.private_llm_version,
    agent_version_pinned: agent.agent_version_pinned,
    response_engine_configured: agent.response_engine_configured,
    voice_configured: agent.voice_configured,
    agent_published: agent.agent_published,
    canonical_webhook_configured: agent.canonical_webhook_configured,
    required_webhook_events_configured: agent.required_webhook_events_configured,
    signed_recording_links_configured: agent.signed_recording_links_configured,
    pii_minimization_configured: agent.pii_minimization_configured,
    retention_configured: agent.retention_configured,
    max_call_duration_configured: agent.max_call_duration_configured,
    llm_published: llm?.llm_published ?? false,
    strict_tool_mode_configured: llm?.strict_tool_mode_configured ?? false,
    deterministic_model_configured: llm?.deterministic_model_configured ?? false,
    start_speaker_configured: llm?.start_speaker_configured ?? false,
    end_call_tool_configured: llm?.end_call_tool_configured ?? false,
    only_end_call_tools_configured: llm?.only_end_call_tools_configured ?? false,
    mcp_tools_absent: llm?.mcp_tools_absent ?? false,
    knowledge_base_absent: llm?.knowledge_base_absent ?? false,
    candidate_configuration_verified: candidateConfigurationVerified,
    attention_codes: attention,
    provider_action: "none",
    authority: NO_AUTHORITY,
    side_effect_invariants: Object.freeze({
      database_reads: 0,
      database_writes: 0,
      provider_read_probe_calls: llmReadAuthorized ? 2 : 1,
      provider_writes: 0,
      external_messages: 0,
    }),
  });
}

async function main() {
  try {
    const result = await inspectRetellSolarReadiness({
      // RETELL_API_KEY matches Retell's current documentation. The legacy
      // alias preserves compatibility with this codebase's server-only setup.
      apiKey: process.env.RETELL_API_KEY ?? process.env.RETELL_AI_API_KEY,
      agentId: process.env.RETELL_AGENT_ID,
      agentVersion: process.env.RETELL_AGENT_VERSION,
      expectedWebhookUrl: process.env.RETELL_EXPECTED_WEBHOOK_URL,
      baseUrl: process.env.RETELL_BASE_URL,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (!result.candidate_configuration_verified) process.exitCode = 2;
  } catch (error) {
    const code = error instanceof RetellSolarReadinessError
      ? error.code
      : "RETELL_READINESS_FAILED";
    process.stdout.write(`${JSON.stringify({
      kind: "retell_solar_readiness_v2",
      reachable: false,
      error_code: code,
      provider_action: "none",
      authority: NO_AUTHORITY,
    })}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
