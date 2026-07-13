export type JsonObject = Record<string, unknown>;

export interface ActionQueueRow {
  action_params?: unknown;
  action_payload?: unknown;
  priority_score?: unknown;
  priority?: unknown;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Canonical queue payload reader. Rows created before the canonical schema used
 * action_payload, so the executor keeps a read-only fallback during migration.
 */
export function getCanonicalActionParams(action: ActionQueueRow): JsonObject {
  if (isJsonObject(action.action_params) && Object.keys(action.action_params).length > 0) {
    return action.action_params;
  }
  if (isJsonObject(action.action_payload)) return action.action_payload;
  return {};
}

export function getPriorityScore(action: ActionQueueRow): number {
  const canonical = Number(action.priority_score);
  if (Number.isFinite(canonical)) return Math.min(100, Math.max(1, Math.round(canonical)));

  const numericLegacy = Number(action.priority);
  if (Number.isFinite(numericLegacy)) return Math.min(100, Math.max(1, Math.round(numericLegacy)));

  switch (String(action.priority || '').toLowerCase()) {
    case 'urgent':
    case 'critical':
    case 'high':
      return 1;
    case 'medium':
    case 'normal':
      return 5;
    case 'low':
      return 9;
    default:
      return 5;
  }
}

export function toLegacyPriority(priorityScore: number): 'high' | 'medium' | 'low' {
  const score = getPriorityScore({ priority_score: priorityScore });
  if (score <= 3) return 'high';
  if (score <= 6) return 'medium';
  return 'low';
}

export interface OutboundCallContractInput {
  userId: string;
  leadId: string;
  campaignId: string;
  phoneNumber: string;
  callerId: string;
  provider: 'retell' | 'telnyx';
  agentId?: string | null;
  telnyxAssistantId?: string | null;
  queueId?: string | null;
  dispatchGeneration?: string | null;
  idempotencyKey?: string | null;
}

export function buildOutboundCallRequest(input: OutboundCallContractInput): JsonObject {
  const required: Array<[string, unknown]> = [
    ['userId', input.userId],
    ['leadId', input.leadId],
    ['campaignId', input.campaignId],
    ['phoneNumber', input.phoneNumber],
    ['callerId', input.callerId],
  ];
  for (const [field, value] of required) {
    if (!value) throw new Error(`outbound-calling contract missing ${field}`);
  }
  if (input.provider === 'retell' && !input.agentId) {
    throw new Error('outbound-calling Retell contract missing agentId');
  }
  if (input.provider === 'telnyx' && !input.telnyxAssistantId) {
    throw new Error('outbound-calling Telnyx contract missing telnyxAssistantId');
  }
  if (input.queueId ? !input.dispatchGeneration : !input.idempotencyKey) {
    throw new Error('outbound-calling contract requires queue generation or idempotencyKey');
  }

  return {
    action: 'create_call',
    userId: input.userId,
    leadId: input.leadId,
    campaignId: input.campaignId,
    phoneNumber: input.phoneNumber,
    callerId: input.callerId,
    provider: input.provider,
    ...(input.agentId ? { agentId: input.agentId } : {}),
    ...(input.telnyxAssistantId ? { telnyxAssistantId: input.telnyxAssistantId } : {}),
    ...(input.queueId ? { queueId: input.queueId, dispatchGeneration: input.dispatchGeneration } : {}),
    ...(!input.queueId && input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
  };
}

export function buildSmsRequest(input: {
  userId: string;
  leadId: string;
  to: string;
  from: string;
  body: string;
  idempotencyKey: string;
  campaignId?: string | null;
}): JsonObject {
  if (!input.userId || !input.leadId || !input.to || !input.from || !input.body || !input.idempotencyKey) {
    throw new Error('sms-messaging contract requires userId, leadId, to, from, body, and idempotencyKey');
  }
  return {
    action: 'send_sms',
    user_id: input.userId,
    lead_id: input.leadId,
    to: input.to,
    from: input.from,
    body: input.body,
    ...(input.campaignId ? { campaign_id: input.campaignId } : {}),
    idempotency_key: input.idempotencyKey,
  };
}

export function buildAiSmsRequest(input: {
  userId: string;
  leadId: string;
  fromNumber: string;
  toNumber: string;
  prompt: string;
  idempotencyKey: string;
  context?: JsonObject;
}): JsonObject {
  if (!input.userId || !input.leadId || !input.fromNumber || !input.toNumber || !input.prompt || !input.idempotencyKey) {
    throw new Error('ai-sms-processor contract requires userId, leadId, fromNumber, toNumber, prompt, and idempotencyKey');
  }
  return {
    action: 'generate_and_send',
    userId: input.userId,
    leadId: input.leadId,
    fromNumber: input.fromNumber,
    toNumber: input.toNumber,
    prompt: input.prompt,
    context: input.context || {},
    idempotency_key: input.idempotencyKey,
  };
}

/** Fail closed on HTTP errors and application-level error envelopes. */
export function assertSuccessfulFunctionResult(
  functionName: string,
  transportOk: boolean,
  data: unknown,
): asserts data is JsonObject {
  if (!isJsonObject(data)) throw new Error(`${functionName} failed: response body was not a JSON object`);
  const body = data;
  if (!transportOk || body.error || body.success === false || body.skipped === true) {
    const detail = body.error || body.message || (body.skipped ? 'operation was skipped' : 'HTTP request failed');
    throw new Error(`${functionName} failed: ${String(detail)}`);
  }
}
