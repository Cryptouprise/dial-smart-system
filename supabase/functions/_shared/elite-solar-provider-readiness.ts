/**
 * Server-only, redacted provider readiness probes for the first Elite Solar
 * pilot. This module never accepts a provider URL, recipient, campaign, lead,
 * or provider action. It is intentionally separate from provider-admin code.
 */

const RETELL_BASE_URL = "https://api.retellai.com";
const INSTANTLY_BASE_URL = "https://api.instantly.ai";
const MAILGUN_BASE_URL = "https://api.mailgun.net";
const MAILGUN_EU_BASE_URL = "https://api.eu.mailgun.net";
const PROVIDER_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const DOMAIN_PATTERN =
  /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const MAX_VERSION = 1_000_000;
const REQUIRED_WEBHOOK_EVENTS = new Set([
  "call_started",
  "call_ended",
  "call_analyzed",
]);

export const ELITE_SOLAR_NO_AUTHORITY = Object.freeze({
  contact_authorized: false,
  launch_authorized: false,
  queue_mutation_authorized: false,
  crm_write_authorized: false,
  provider_write_authorized: false,
  spend_authorized: false,
});

export class EliteSolarProviderReadinessError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "EliteSolarProviderReadinessError";
    this.code = code;
  }
}

type RecordValue = Record<string, unknown>;
export type ProviderFetch = (
  input: URL,
  init: RequestInit,
) => Promise<Response>;

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredSecret(value: unknown): string {
  if (
    typeof value !== "string" || value.length < 16 || value.length > 512 ||
    /\s/.test(value) || [...value].some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code <= 0x1f || code === 0x7f;
    })
  ) {
    throw new EliteSolarProviderReadinessError("CONFIGURATION_INVALID");
  }
  return value;
}

function providerReference(value: unknown): string {
  if (typeof value !== "string" || !PROVIDER_ID_PATTERN.test(value)) {
    throw new EliteSolarProviderReadinessError("CONFIGURATION_INVALID");
  }
  return value;
}

function version(value: unknown): number {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && /^(?:0|[1-9]\d{0,6})$/.test(value)
    ? Number(value)
    : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > MAX_VERSION) {
    throw new EliteSolarProviderReadinessError("CONFIGURATION_INVALID");
  }
  return parsed;
}

function positiveVersion(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) &&
      value >= 0 && value <= MAX_VERSION
    ? value
    : null;
}

function canonicalHttpsUrl(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) {
    throw new EliteSolarProviderReadinessError("CONFIGURATION_INVALID");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new EliteSolarProviderReadinessError("CONFIGURATION_INVALID");
  }
  if (
    url.protocol !== "https:" || url.username || url.password || url.search ||
    url.hash || value !== value.trim()
  ) {
    throw new EliteSolarProviderReadinessError("CONFIGURATION_INVALID");
  }
  return url.href.replace(/\/+$/, "");
}

function senderDomain(value: unknown): string {
  if (typeof value !== "string" || value !== value.trim()) {
    throw new EliteSolarProviderReadinessError("CONFIGURATION_INVALID");
  }
  const candidate = value.toLowerCase();
  if (!DOMAIN_PATTERN.test(candidate)) {
    throw new EliteSolarProviderReadinessError("CONFIGURATION_INVALID");
  }
  return candidate;
}

function optionalArray(value: unknown): unknown[] | null {
  return value === undefined || value === null
    ? []
    : Array.isArray(value)
    ? value
    : null;
}

function summaryResponse(
  value: unknown,
  expectedAgentId: string,
  expectedAgentVersion: number,
  expectedWebhookUrl: string,
) {
  if (!isRecord(value)) {
    throw new EliteSolarProviderReadinessError("RETELL_RESPONSE_INVALID");
  }
  const engine = isRecord(value.response_engine) ? value.response_engine : null;
  const llmId = engine && typeof engine.llm_id === "string" &&
      PROVIDER_ID_PATTERN.test(engine.llm_id)
    ? engine.llm_id
    : null;
  const llmVersion = engine ? positiveVersion(engine.version) : null;
  const eventList = optionalArray(value.webhook_events);
  const events =
    eventList && eventList.every((entry) => typeof entry === "string")
      ? new Set(eventList)
      : null;
  let webhookMatches = false;
  try {
    webhookMatches =
      canonicalHttpsUrl(value.webhook_url) === expectedWebhookUrl;
  } catch {
    webhookMatches = false;
  }
  return Object.freeze({
    private_llm_id: llmId,
    private_llm_version: llmVersion,
    agent_id_matches: value.agent_id === expectedAgentId,
    agent_version: positiveVersion(value.version),
    agent_version_pinned:
      positiveVersion(value.version) === expectedAgentVersion,
    response_engine_configured: Boolean(
      engine && engine.type === "retell-llm" && llmId && llmVersion !== null,
    ),
    voice_configured: typeof value.voice_id === "string" &&
      value.voice_id.length > 0,
    agent_published: value.is_published === true,
    canonical_webhook_configured: webhookMatches,
    required_webhook_events_configured: Boolean(
      events && events.size === REQUIRED_WEBHOOK_EVENTS.size &&
        [...REQUIRED_WEBHOOK_EVENTS].every((event) => events.has(event)),
    ),
    signed_recording_links_configured: value.opt_in_signed_url === true,
    pii_minimization_configured:
      value.data_storage_setting === "everything_except_pii",
    retention_configured: value.data_storage_retention_days === 30,
    max_call_duration_configured: value.max_call_duration_ms === 360_000,
  });
}

function isEndCallTool(value: unknown): boolean {
  return isRecord(value) && value.type === "end_call";
}

function summarizeLlm(
  value: unknown,
  expectedLlmId: string,
  expectedLlmVersion: number,
) {
  if (!isRecord(value)) {
    throw new EliteSolarProviderReadinessError("RETELL_RESPONSE_INVALID");
  }
  const allTools: unknown[] = [];
  let structureValid = true;
  for (const field of ["general_tools", "tools", "tool_functions"]) {
    const tools = optionalArray(value[field]);
    if (!tools) structureValid = false;
    else allTools.push(...tools);
  }
  const states = optionalArray(value.states);
  if (!states) {
    structureValid = false;
  } else {
    for (const state of states) {
      if (!isRecord(state)) {
        structureValid = false;
        continue;
      }
      const tools = optionalArray(state.tools);
      if (!tools) structureValid = false;
      else allTools.push(...tools);
    }
  }
  const mcps = optionalArray(value.mcps);
  const knowledgeBaseIds = optionalArray(value.knowledge_base_ids);
  return Object.freeze({
    llm_id_matches_agent: value.llm_id === expectedLlmId,
    llm_version_matches_agent:
      positiveVersion(value.version) === expectedLlmVersion,
    llm_published: value.is_published === true,
    strict_tool_mode_configured: value.tool_call_strict_mode === true,
    deterministic_model_configured: value.model_temperature === 0,
    start_speaker_configured: value.start_speaker === "agent",
    end_call_tool_configured: allTools.some(isEndCallTool),
    only_end_call_tools_configured: structureValid && allTools.length > 0 &&
      allTools.every(isEndCallTool),
    mcp_tools_absent: Boolean(mcps && mcps.length === 0),
    knowledge_base_absent: Boolean(
      knowledgeBaseIds && knowledgeBaseIds.length === 0,
    ),
  });
}

async function providerGet(
  fetchImpl: ProviderFetch,
  url: URL,
  key: string,
  provider: "RETELL" | "INSTANTLY" | "MAILGUN",
  authorization: string = `Bearer ${key}`,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { Authorization: authorization, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new EliteSolarProviderReadinessError(`${provider}_UNREACHABLE`);
  }
  if (!response.ok) {
    throw new EliteSolarProviderReadinessError(`${provider}_READ_REJECTED`);
  }
  try {
    return await response.json();
  } catch {
    throw new EliteSolarProviderReadinessError(`${provider}_RESPONSE_INVALID`);
  }
}

function attentionCodes(
  agent: ReturnType<typeof summaryResponse>,
  llm: ReturnType<typeof summarizeLlm> | null,
): readonly string[] {
  const codes: string[] = [];
  if (!agent.agent_id_matches) codes.push("AGENT_ID_MISMATCH");
  if (!agent.agent_version_pinned) codes.push("AGENT_VERSION_MISMATCH");
  if (!agent.response_engine_configured) codes.push("RESPONSE_ENGINE_INVALID");
  if (!agent.voice_configured) codes.push("VOICE_UNCONFIGURED");
  if (!agent.agent_published) codes.push("AGENT_NOT_PUBLISHED");
  if (!agent.canonical_webhook_configured) {
    codes.push("CANONICAL_WEBHOOK_MISMATCH");
  }
  if (!agent.required_webhook_events_configured) {
    codes.push("WEBHOOK_EVENTS_INCOMPLETE");
  }
  if (!agent.signed_recording_links_configured) {
    codes.push("SIGNED_RECORDING_URLS_DISABLED");
  }
  if (!agent.pii_minimization_configured) {
    codes.push("PII_MINIMIZATION_INVALID");
  }
  if (!agent.retention_configured) codes.push("RETENTION_POLICY_INVALID");
  if (!agent.max_call_duration_configured) {
    codes.push("MAX_CALL_DURATION_INVALID");
  }
  if (!llm) return Object.freeze([...codes, "LLM_READ_SKIPPED"]);
  if (!llm.llm_id_matches_agent || !llm.llm_version_matches_agent) {
    codes.push("LLM_BINDING_MISMATCH");
  }
  if (!llm.llm_published) codes.push("LLM_NOT_PUBLISHED");
  if (!llm.strict_tool_mode_configured) codes.push("STRICT_TOOL_MODE_DISABLED");
  if (!llm.deterministic_model_configured) {
    codes.push("MODEL_TEMPERATURE_INVALID");
  }
  if (!llm.start_speaker_configured) codes.push("START_SPEAKER_INVALID");
  if (!llm.end_call_tool_configured) codes.push("END_CALL_TOOL_MISSING");
  if (!llm.only_end_call_tools_configured) {
    codes.push("UNAPPROVED_TOOL_SURFACE");
  }
  if (!llm.mcp_tools_absent) codes.push("MCP_TOOLS_PRESENT");
  if (!llm.knowledge_base_absent) codes.push("KNOWLEDGE_BASE_PRESENT");
  return Object.freeze(codes);
}

export async function inspectEliteSolarRetell(
  input: {
    apiKey: unknown;
    agentId: unknown;
    agentVersion: unknown;
    expectedWebhookUrl: unknown;
  },
  fetchImpl: ProviderFetch = fetch,
) {
  const apiKey = requiredSecret(input.apiKey);
  const agentId = providerReference(input.agentId);
  const agentVersion = version(input.agentVersion);
  const webhook = canonicalHttpsUrl(input.expectedWebhookUrl);
  const agentUrl = new URL(
    `/get-agent/${encodeURIComponent(agentId)}`,
    RETELL_BASE_URL,
  );
  agentUrl.searchParams.set("version", String(agentVersion));
  const agent = summaryResponse(
    await providerGet(fetchImpl, agentUrl, apiKey, "RETELL"),
    agentId,
    agentVersion,
    webhook,
  );
  let llm: ReturnType<typeof summarizeLlm> | null = null;
  let probes = 1;
  if (
    agent.agent_id_matches && agent.agent_version_pinned &&
    agent.response_engine_configured && agent.private_llm_id &&
    agent.private_llm_version !== null
  ) {
    const llmUrl = new URL(
      `/get-retell-llm/${encodeURIComponent(agent.private_llm_id)}`,
      RETELL_BASE_URL,
    );
    llmUrl.searchParams.set("version", String(agent.private_llm_version));
    llm = summarizeLlm(
      await providerGet(fetchImpl, llmUrl, apiKey, "RETELL"),
      agent.private_llm_id,
      agent.private_llm_version,
    );
    probes += 1;
  }
  const attention = attentionCodes(agent, llm);
  return Object.freeze({
    kind: "retell_solar_readiness_v2",
    status: attention.length === 0 ? "verified" : "attention_required",
    agent_version_pinned: agent.agent_version_pinned,
    response_engine_configured: agent.response_engine_configured,
    voice_configured: agent.voice_configured,
    agent_published: agent.agent_published,
    canonical_webhook_configured: agent.canonical_webhook_configured,
    required_webhook_events_configured:
      agent.required_webhook_events_configured,
    signed_recording_links_configured: agent.signed_recording_links_configured,
    pii_minimization_configured: agent.pii_minimization_configured,
    retention_configured: agent.retention_configured,
    max_call_duration_configured: agent.max_call_duration_configured,
    llm_published: llm?.llm_published ?? false,
    strict_tool_mode_configured: llm?.strict_tool_mode_configured ?? false,
    deterministic_model_configured: llm?.deterministic_model_configured ??
      false,
    start_speaker_configured: llm?.start_speaker_configured ?? false,
    end_call_tool_configured: llm?.end_call_tool_configured ?? false,
    only_end_call_tools_configured: llm?.only_end_call_tools_configured ??
      false,
    mcp_tools_absent: llm?.mcp_tools_absent ?? false,
    knowledge_base_absent: llm?.knowledge_base_absent ?? false,
    attention_codes: attention,
    provider_action: "none",
    authority: ELITE_SOLAR_NO_AUTHORITY,
    provider_read_probe_calls: probes,
  });
}

function sampleAccounts(value: unknown): RecordValue[] {
  const source = Array.isArray(value)
    ? value
    : isRecord(value)
    ? [value.items, value.data, value.accounts].find(Array.isArray) ?? []
    : [];
  return source.slice(0, 1).filter(isRecord);
}

export async function inspectEliteSolarInstantly(
  apiKey: unknown,
  fetchImpl: ProviderFetch = fetch,
) {
  const key = requiredSecret(apiKey);
  const url = new URL("/api/v2/accounts", INSTANTLY_BASE_URL);
  url.searchParams.set("limit", "1");
  const accounts = sampleAccounts(
    await providerGet(fetchImpl, url, key, "INSTANTLY"),
  );
  const summary = Object.freeze({
    sampled_account_count: accounts.length,
    sampled_setup_complete_count: accounts.filter((account) =>
      account.setup_pending === false
    ).length,
    sampled_warmup_active_count:
      accounts.filter((account) => account.warmup_status === 1).length,
    sampled_tracking_domain_active_count:
      accounts.filter((account) => account.tracking_domain_status === "active")
        .length,
  });
  const healthy = summary.sampled_account_count === 1 &&
    summary.sampled_setup_complete_count === 1 &&
    summary.sampled_warmup_active_count === 1 &&
    summary.sampled_tracking_domain_active_count === 1;
  return Object.freeze({
    kind: "instantly_email_readiness_v1",
    status: healthy ? "verified" : "attention_required",
    ...summary,
    provider_action: "none",
    authority: ELITE_SOLAR_NO_AUTHORITY,
    provider_read_probe_calls: 1,
  });
}

function mailgunSummary(value: unknown) {
  const data = isRecord(value) && isRecord(value.domain) ? value.domain : value;
  if (!isRecord(data)) {
    return {
      sender_domain_state: "unknown",
      receiving_dns_record_count: 0,
      sending_dns_record_count: 0,
    };
  }
  const state =
    typeof data.state === "string" && /^[a-z_-]{1,32}$/i.test(data.state)
      ? data.state.toLowerCase()
      : "unknown";
  return {
    sender_domain_state: state,
    receiving_dns_record_count: Array.isArray(data.receiving_dns_records)
      ? data.receiving_dns_records.length
      : 0,
    sending_dns_record_count: Array.isArray(data.sending_dns_records)
      ? data.sending_dns_records.length
      : 0,
  };
}

export async function inspectEliteSolarMailgun(
  input: { apiKey: unknown; domain: unknown; useEuBase: boolean },
  fetchImpl: ProviderFetch = fetch,
) {
  const key = requiredSecret(input.apiKey);
  const domain = senderDomain(input.domain);
  const base = input.useEuBase ? MAILGUN_EU_BASE_URL : MAILGUN_BASE_URL;
  const url = new URL(`/v3/domains/${encodeURIComponent(domain)}`, base);
  const summary = mailgunSummary(
    await providerGet(
      fetchImpl,
      url,
      key,
      "MAILGUN",
      `Basic ${btoa(`api:${key}`)}`,
    ),
  );
  return Object.freeze({
    kind: "mailgun_email_readiness_v1",
    status: summary.sender_domain_state === "active"
      ? "verified"
      : "attention_required",
    sender_domain_active: summary.sender_domain_state === "active",
    ...summary,
    provider_action: "none",
    authority: ELITE_SOLAR_NO_AUTHORITY,
    provider_read_probe_calls: 1,
  });
}
