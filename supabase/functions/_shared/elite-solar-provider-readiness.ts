import {
  assertRetellLaunchAgentConfiguration,
  retellGetAgentUrl,
  retellGetLlmUrl,
} from "./retell-provider-contract.ts";

export type ProviderFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type RetellReadiness = {
  status: string;
};

type AgentEnvelope = Record<string, unknown>;
type LlmEnvelope = Record<string, unknown>;

function plainObject(value: unknown): AgentEnvelope | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizedUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asPositiveInt(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  const raw = await response.text();
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function readinessFailure(): RetellReadiness {
  return { status: "attention_required" };
}

async function readProviderAgent(
  fetchImpl: ProviderFetch,
  apiKey: string,
  agentId: string,
  expectedWebhookUrl: string,
  expectedAgentVersion: number,
): Promise<RetellReadiness> {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  const agentResponse = await fetchImpl(new URL(retellGetAgentUrl(agentId)), {
    method: "GET",
    headers,
  });
  if (!agentResponse.ok) return readinessFailure();

  const agent = plainObject(await parseJson(agentResponse)) || {};
  const responseEngine = plainObject(agent.response_engine) || {};
  const llmId = normalizedUrl(responseEngine.llm_id) || normalizedUrl(agent.llm_id);

  if (!llmId) return readinessFailure();

  const responseEngineVersion = asPositiveInt(responseEngine.version) ??
    asPositiveInt(agent.version);
  if (responseEngineVersion === null) return readinessFailure();

  if (responseEngineVersion !== expectedAgentVersion) return readinessFailure();

  const llmResponse = await fetchImpl(new URL(retellGetLlmUrl(llmId)), {
    method: "GET",
    headers,
  });
  if (!llmResponse.ok) return readinessFailure();

  const llm = plainObject(await parseJson(llmResponse)) || {};
  try {
    assertRetellLaunchAgentConfiguration({
      agent,
      llm,
      expectedWebhookUrl,
    });
    return { status: "verified" };
  } catch {
    return readinessFailure();
  }
}

export async function inspectEliteSolarRetell(
  input: {
    apiKey: unknown;
    agentId: unknown;
    agentVersion: unknown;
    expectedWebhookUrl: unknown;
  },
  fetchImpl: ProviderFetch,
): Promise<RetellReadiness> {
  try {
    if (typeof input.apiKey !== "string" || input.apiKey.length < 16) {
      return readinessFailure();
    }
    if (typeof input.agentId !== "string" || input.agentId.length < 8) {
      return readinessFailure();
    }
    const expectedAgentVersion = asPositiveInt(input.agentVersion);
    if (expectedAgentVersion === null) return readinessFailure();
    const expectedWebhookUrl = normalizedUrl(input.expectedWebhookUrl);
    if (!expectedWebhookUrl) return readinessFailure();

    return await readProviderAgent(
      fetchImpl,
      input.apiKey,
      input.agentId,
      expectedWebhookUrl,
      expectedAgentVersion,
    );
  } catch {
    return readinessFailure();
  }
}
