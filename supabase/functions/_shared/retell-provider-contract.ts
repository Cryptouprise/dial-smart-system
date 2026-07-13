export const RETELL_API_ROOT = 'https://api.retellai.com';
export const RETELL_V2_API_BASE = `${RETELL_API_ROOT}/v2`;
export const RETELL_LAUNCH_RETENTION_DAYS = 30;

const RETELL_LAUNCH_PII_CATEGORIES = [
  'person_name',
  'address',
  'email',
  'phone_number',
  'ssn',
  'passport',
  'driver_license',
  'credit_card',
  'bank_account',
  'password',
  'pin',
  'medical_id',
  'date_of_birth',
  'customer_account_number',
] as const;

const LAUNCH_DYNAMIC_VARIABLE_KEYS = new Set([
  'lead_id',
  'current_time',
  'current_time_iso',
  'current_timezone',
  'current_date_ymd',
  'current_day_of_week',
  'first_name',
  'last_name',
  'full_name',
  'name',
  'company',
  'timezone',
  'city',
  'state',
  'is_callback',
  'contact.first_name',
  'contact.last_name',
  'contact.full_name',
  'contact.company',
  'contact.timezone',
  'contact.city',
  'contact.state',
  'contact.is_callback',
]);

function normalizedUrl(value: unknown): string {
  return String(value || '').trim().replace(/\/+$/, '');
}

/**
 * The first launch profile deliberately excludes arbitrary notes, email,
 * addresses, tags, and custom fields. Each company can expand this allowlist
 * only after approving a purpose-specific data contract.
 */
export function launchRetellDynamicVariables(
  input: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input).flatMap(([key, rawValue]) => {
      if (!LAUNCH_DYNAMIC_VARIABLE_KEYS.has(key)) return [];
      const value = Array.from(String(rawValue ?? ''))
        .filter((character) => {
          const code = character.charCodeAt(0);
          return !(
            code <= 0x08 ||
            code === 0x0b ||
            code === 0x0c ||
            (code >= 0x0e && code <= 0x1f) ||
            code === 0x7f
          );
        })
        .join('')
        .slice(0, 512);
      return [[key, value]];
    }),
  );
}

/**
 * Tool-bearing or externally wired agents are a separate autonomous product.
 * The initial certified dialer may converse and end its own call, but may not
 * transfer, book, invoke HTTP/MCP tools, or depend on an unverified webhook.
 */
export function assertRetellLaunchAgentConfiguration(input: {
  agent: Record<string, unknown>;
  llm: Record<string, unknown>;
  expectedWebhookUrl: string;
}): void {
  const responseEngine = input.agent?.response_engine as Record<string, unknown> | undefined;
  if (responseEngine?.type !== 'retell-llm' || typeof responseEngine?.llm_id !== 'string') {
    throw new Error('RETELL_AGENT_NOT_CERTIFIED: response engine must be retell-llm');
  }
  if (!Number.isSafeInteger(input.agent?.version) || Number(input.agent.version) < 0) {
    throw new Error('RETELL_AGENT_NOT_CERTIFIED: agent version must be a non-negative integer');
  }
  if (!Number.isSafeInteger(responseEngine?.version) || Number(responseEngine.version) < 0) {
    throw new Error('RETELL_AGENT_NOT_CERTIFIED: response engine version must be pinned');
  }
  if (input.llm?.llm_id !== responseEngine.llm_id) {
    throw new Error('RETELL_AGENT_NOT_CERTIFIED: live LLM does not match the agent response engine');
  }
  if (input.llm?.version !== responseEngine.version) {
    throw new Error('RETELL_AGENT_NOT_CERTIFIED: live LLM version does not match the agent response engine');
  }
  if (input.agent?.is_published !== true) {
    throw new Error('RETELL_AGENT_NOT_CERTIFIED: agent version must be published');
  }
  if (input.llm?.is_published !== true) {
    throw new Error('RETELL_AGENT_NOT_CERTIFIED: LLM version must be published');
  }
  if (input.agent?.opt_in_signed_url !== true) {
    throw new Error('RETELL_AGENT_NOT_CERTIFIED: recording and log URLs must be signed');
  }
  if (
    !normalizedUrl(input.expectedWebhookUrl) ||
    normalizedUrl(input.agent?.webhook_url) !== normalizedUrl(input.expectedWebhookUrl)
  ) {
    throw new Error('RETELL_AGENT_NOT_CERTIFIED: agent webhook must be the canonical signed webhook');
  }

  const events = Array.isArray(input.agent?.webhook_events)
    ? input.agent.webhook_events.map(String)
    : [];
  for (const requiredEvent of ['call_started', 'call_ended', 'call_analyzed']) {
    if (!events.includes(requiredEvent)) {
      throw new Error(`RETELL_AGENT_NOT_CERTIFIED: missing webhook event ${requiredEvent}`);
    }
  }

  const llm = input.llm as Record<string, unknown>;
  const tools: unknown[] = [
    ...(Array.isArray(llm.general_tools) ? llm.general_tools : []),
    ...(Array.isArray(llm.tools) ? llm.tools : []),
    ...(Array.isArray(llm.tool_functions) ? llm.tool_functions : []),
    ...(Array.isArray(llm.states)
      ? llm.states.flatMap((state) => {
        const stateRecord = state as Record<string, unknown>;
        return Array.isArray(stateRecord?.tools) ? stateRecord.tools : [];
      })
      : []),
  ];
  for (const tool of tools) {
    const type = String((tool as Record<string, unknown>)?.type || '');
    if (type !== 'end_call') {
      throw new Error(`RETELL_AGENT_NOT_CERTIFIED: tool type ${type || 'unknown'} is not launch-approved`);
    }
  }
  if (Array.isArray(llm.mcps) && llm.mcps.length > 0) {
    throw new Error('RETELL_AGENT_NOT_CERTIFIED: MCP tools are not launch-approved');
  }
}

function requireProviderId(value: string, kind: string): string {
  const normalized = String(value || '').trim();
  if (!normalized) throw new Error(`${kind} is required`);
  return encodeURIComponent(normalized);
}

export function retellGetAgentUrl(agentId: string): string {
  return `${RETELL_API_ROOT}/get-agent/${requireProviderId(agentId, 'agentId')}`;
}

export function retellGetLlmUrl(llmId: string, version?: number): string {
  const url = `${RETELL_API_ROOT}/get-retell-llm/${requireProviderId(llmId, 'llmId')}`;
  if (version === undefined) return url;
  if (!Number.isSafeInteger(version) || version < 0) {
    throw new Error('llmVersion must be a non-negative integer');
  }
  return `${url}?version=${version}`;
}

/**
 * Retell's call_cost fields are denominated in cents. Keep the conversion at
 * the provider boundary so callers never multiply the value as though it were
 * dollars and corrupt cost/margin reporting by 100x.
 */
export function retellCombinedCostCents(callCost: unknown): number | null {
  if (!callCost || typeof callCost !== 'object') return null;
  const raw = (callCost as Record<string, unknown>).combined_cost;
  if (raw === null || raw === undefined || raw === '') return null;
  const cents = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(cents) || cents < 0) return null;
  return Math.round(cents);
}

export interface RetellCreatePhoneCallInput {
  fromNumber: string;
  toNumber: string;
  agentId: string;
  agentVersion: number;
  maxCallDurationMs: number;
  webhookUrl: string;
  dynamicVariables: Record<string, string>;
  metadata: Record<string, unknown>;
}

export function buildRetellCreatePhoneCallPayload(
  input: RetellCreatePhoneCallInput,
): Record<string, unknown> {
  if (!Number.isSafeInteger(input.agentVersion) || input.agentVersion < 0) {
    throw new Error('agentVersion must be a non-negative integer');
  }
  if (!Number.isSafeInteger(input.maxCallDurationMs) || input.maxCallDurationMs < 60_000) {
    throw new Error('maxCallDurationMs must be at least 60 seconds');
  }
  const webhookUrl = normalizedUrl(input.webhookUrl);
  if (!webhookUrl) throw new Error('webhookUrl is required');

  return {
    from_number: input.fromNumber,
    to_number: input.toNumber,
    // Retell's create-call contract uses override_agent_id. Mutating a shared
    // phone number's outbound_agent_id per call races concurrent campaigns.
    override_agent_id: input.agentId,
    // The exact published version and per-call safety overrides eliminate the
    // gap where a dashboard edit could otherwise change the certified agent,
    // callback destination, signed-URL policy, or maximum exposure after the
    // provider read but before the physical call is created.
    override_agent_version: input.agentVersion,
    agent_override: {
      agent: {
        webhook_url: webhookUrl,
        webhook_events: ['call_started', 'call_ended', 'call_analyzed'],
        opt_in_signed_url: true,
        // Retell otherwise retains transcripts, recordings, and logs forever.
        // Keep enough evidence for a supervised pilot while preventing the
        // provider from becoming an indefinite store of consumer PII.
        data_storage_setting: 'everything_except_pii',
        data_storage_retention_days: RETELL_LAUNCH_RETENTION_DAYS,
        pii_config: {
          mode: 'post_call',
          categories: [...RETELL_LAUNCH_PII_CATEGORIES],
        },
        max_call_duration_ms: input.maxCallDurationMs,
      },
    },
    retell_llm_dynamic_variables: input.dynamicVariables,
    metadata: input.metadata,
  };
}
