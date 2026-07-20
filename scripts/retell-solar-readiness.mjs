#!/usr/bin/env node
import { pathToFileURL } from "node:url";

/**
 * Performs exactly one redacted, read-only Retell voice-agent probe for the
 * Elite Solar candidate. It cannot create/edit an agent, place a call, change
 * a phone number, modify a webhook, or start a campaign.
 *
 * The returned object deliberately omits the agent ID, LLM ID, voice ID,
 * webhook URL, prompt, agent name, tags, and provider response body.
 */

const DEFAULT_BASE_URL = "https://api.retellai.com";
const SECRET_PATTERN = /^[^\s\x00-\x1f\x7f]{16,512}$/;
const AGENT_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

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

function agentReference(value) {
  if (typeof value !== "string" || !AGENT_ID_PATTERN.test(value)) {
    throw new RetellSolarReadinessError("CONFIGURATION_INVALID", "RETELL_AGENT_ID is missing or invalid");
  }
  return value;
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

function isNonemptyString(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 512;
}

function boundedVersion(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000
    ? value
    : null;
}

function summarizeAgent(body) {
  if (!isObject(body)) {
    throw new RetellSolarReadinessError("RETELL_RESPONSE_INVALID", "The Retell agent endpoint returned an invalid body");
  }
  const engine = isObject(body.response_engine) ? body.response_engine : null;
  const responseEngineConfigured = Boolean(engine && isNonemptyString(engine.type));
  const voiceConfigured = isNonemptyString(body.voice_id);
  const webhookConfigured = isNonemptyString(body.webhook_url);
  const webhookEventsConfigured = Array.isArray(body.webhook_events) && body.webhook_events.length > 0;
  const dataStoragePolicyConfigured = isNonemptyString(body.data_storage_setting);

  return Object.freeze({
    agent_version: boundedVersion(body.version),
    response_engine_configured: responseEngineConfigured,
    voice_configured: voiceConfigured,
    webhook_configured: webhookConfigured,
    webhook_events_configured: webhookEventsConfigured,
    data_storage_policy_configured: dataStoragePolicyConfigured,
    candidate_configuration_complete: responseEngineConfigured && voiceConfigured,
  });
}

/**
 * Performs one GET /get-agent/{agent_id}. The caller receives a redacted
 * aggregate only; a successful response is configuration evidence, not call
 * permission, test completion, or production launch authorization.
 */
export async function inspectRetellSolarReadiness({
  apiKey,
  agentId,
  baseUrl,
  fetchImpl = globalThis.fetch,
}) {
  const key = secret(apiKey);
  const candidate = agentReference(agentId);
  const root = normalizedBaseUrl(baseUrl);
  if (typeof fetchImpl !== "function") {
    throw new RetellSolarReadinessError("FETCH_UNAVAILABLE", "A fetch implementation is required");
  }

  const url = new URL(`/get-agent/${encodeURIComponent(candidate)}`, root);
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
    throw new RetellSolarReadinessError("RETELL_UNREACHABLE", "The Retell agent endpoint could not be reached");
  }
  if (!response || typeof response.status !== "number") {
    throw new RetellSolarReadinessError("RETELL_RESPONSE_INVALID", "The Retell agent endpoint returned an invalid response");
  }
  if (!response.ok) {
    throw new RetellSolarReadinessError("RETELL_READ_REJECTED", `The Retell agent read was rejected with HTTP ${response.status}`);
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new RetellSolarReadinessError("RETELL_RESPONSE_INVALID", "The Retell agent endpoint did not return JSON");
  }
  const summary = summarizeAgent(body);

  return Object.freeze({
    kind: "retell_solar_readiness_v1",
    reachable: true,
    agent_read_authorized: true,
    ...summary,
    provider_action: "none",
    authority: Object.freeze({
      contact_authorized: false,
      launch_authorized: false,
      queue_mutation_authorized: false,
      crm_write_authorized: false,
      provider_write_authorized: false,
      spend_authorized: false,
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
      baseUrl: process.env.RETELL_BASE_URL,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const code = error instanceof RetellSolarReadinessError
      ? error.code
      : "RETELL_READINESS_FAILED";
    process.stdout.write(`${JSON.stringify({
      kind: "retell_solar_readiness_v1",
      reachable: false,
      error_code: code,
      provider_action: "none",
      authority: {
        contact_authorized: false,
        launch_authorized: false,
        queue_mutation_authorized: false,
        crm_write_authorized: false,
        provider_write_authorized: false,
        spend_authorized: false,
      },
    })}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
