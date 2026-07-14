export type RetellCallStatus = 'registered' | 'not_connected' | 'ongoing' | 'ended' | 'error';

export interface RetellCallSnapshot {
  call_id?: string;
  call_type?: string;
  call_status?: string;
  direction?: string;
  from_number?: string;
  to_number?: string;
  agent_id?: string;
  disconnection_reason?: string;
  start_timestamp?: number;
  end_timestamp?: number;
  metadata?: Record<string, unknown>;
  call_analysis?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface ExpectedRetellIdentity {
  callLogId: string;
  userId: string;
  organizationId: string;
  campaignId: string | null;
  leadId: string | null;
  queueId: string | null;
  dispatchGeneration: string | null;
  dispatchClaimId: string;
  contractVersion: number;
  phoneNumber: string;
  callerId: string;
  agentId: string | null;
}

export type IdentityValidation =
  | { valid: true }
  | { valid: false; reason: string };

export interface TerminalPlan {
  terminal: true;
  terminalEvent: 'call_ended' | 'call_failed';
  analysisEvent: boolean;
  waitForAnalysis: boolean;
  providerStatus: RetellCallStatus;
}

export interface WaitingPlan {
  terminal: false;
  waitForAnalysis: false;
  providerStatus: RetellCallStatus;
  nextDelaySeconds: number;
}

export type SnapshotPlan = TerminalPlan | WaitingPlan;

const TERMINAL_STATUSES = new Set<RetellCallStatus>(['not_connected', 'ended', 'error']);
const ACTIVE_STATUSES = new Set<RetellCallStatus>(['registered', 'ongoing']);

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

function normalizedPhone(value: unknown): string {
  return String(value || '').replace(/\D/g, '');
}

function metadataMismatch(
  metadata: Record<string, unknown>,
  key: string,
  expected: string | null,
): string | null {
  const actual = nullableString(metadata[key]);
  return actual === expected ? null : `${key} mismatch (expected ${expected ?? 'null'}, received ${actual ?? 'null'})`;
}

/**
 * Provider data is evidence, not tenant authority. A reconciler may only bind
 * a Retell call when its immutable create metadata agrees with every local
 * dispatch identity field. Optional newer metadata is checked when present so
 * calls created just before this contract was deployed remain recoverable.
 */
export function validateRetellCallIdentity(
  call: RetellCallSnapshot,
  expected: ExpectedRetellIdentity,
): IdentityValidation {
  if (!call.call_id || typeof call.call_id !== 'string') {
    return { valid: false, reason: 'Retell call is missing call_id' };
  }
  const strictIdentity = expected.contractVersion >= 1;
  if ((strictIdentity || call.call_type) && call.call_type !== 'phone_call') {
    return { valid: false, reason: `Retell asset is ${call.call_type}, not an outbound phone call` };
  }
  if (String(call.direction || '').toLowerCase() === 'inbound') {
    return { valid: false, reason: 'Retell call direction is inbound' };
  }
  if (strictIdentity && String(call.direction || '').toLowerCase() !== 'outbound') {
    return { valid: false, reason: 'Retell call is missing an explicit outbound direction' };
  }

  const metadata = call.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return { valid: false, reason: 'Retell call is missing immutable dispatch metadata' };
  }

  const requiredChecks: Array<[string, string | null]> = [
    ['call_log_id', expected.callLogId],
    ['user_id', expected.userId],
    ['organization_id', expected.organizationId],
    ['campaign_id', expected.campaignId],
    ['lead_id', expected.leadId],
    ['queue_id', expected.queueId],
  ];
  for (const [key, value] of requiredChecks) {
    const mismatch = metadataMismatch(metadata, key, value);
    if (mismatch) return { valid: false, reason: mismatch };
  }

  // These fields were added with the reconciler. Check them whenever Retell
  // returns them, while still allowing a bounded drain of pre-deploy calls.
  if (strictIdentity) {
    const strictChecks: Array<[string, string | null]> = [
      ['dispatch_generation', expected.dispatchGeneration],
      ['dispatch_claim_id', expected.dispatchClaimId],
      ['reconciliation_contract_version', String(expected.contractVersion)],
    ];
    for (const [key, value] of strictChecks) {
      const mismatch = metadataMismatch(metadata, key, value);
      if (mismatch) return { valid: false, reason: mismatch };
    }
  } else if ('dispatch_generation' in metadata) {
    const mismatch = metadataMismatch(metadata, 'dispatch_generation', expected.dispatchGeneration);
    if (mismatch) return { valid: false, reason: mismatch };
  }
  if (!strictIdentity && 'dispatch_claim_id' in metadata) {
    const mismatch = metadataMismatch(metadata, 'dispatch_claim_id', expected.dispatchClaimId);
    if (mismatch) return { valid: false, reason: mismatch };
  }

  if (strictIdentity && !call.to_number) {
    return { valid: false, reason: 'Retell destination is missing' };
  }
  if (call.to_number && normalizedPhone(call.to_number) !== normalizedPhone(expected.phoneNumber)) {
    return { valid: false, reason: 'Retell destination does not match the owned call log' };
  }
  if (strictIdentity && !call.from_number) {
    return { valid: false, reason: 'Retell caller ID is missing' };
  }
  if (call.from_number && normalizedPhone(call.from_number) !== normalizedPhone(expected.callerId)) {
    return { valid: false, reason: 'Retell caller ID does not match the owned call log' };
  }
  if (strictIdentity && expected.agentId && !call.agent_id) {
    return { valid: false, reason: 'Retell agent identity is missing' };
  }
  if (expected.agentId && call.agent_id && call.agent_id !== expected.agentId) {
    return { valid: false, reason: 'Retell agent does not match the owned call log' };
  }

  return { valid: true };
}

export function parseRetellStatus(value: unknown): RetellCallStatus | null {
  const status = String(value || '').toLowerCase() as RetellCallStatus;
  return ACTIVE_STATUSES.has(status) || TERMINAL_STATUSES.has(status) ? status : null;
}

/**
 * Reconciliation never ends or retries a live provider call. It only waits for
 * active states, or replays the already-observed terminal lifecycle through
 * the idempotent signed webhook boundary.
 */
export function planRetellSnapshot(
  call: RetellCallSnapshot,
  nowMs = Date.now(),
  analysisGraceMs = 30 * 60 * 1000,
): SnapshotPlan {
  const providerStatus = parseRetellStatus(call.call_status);
  if (!providerStatus) throw new Error(`Unsupported Retell call status: ${String(call.call_status || 'missing')}`);

  if (ACTIVE_STATUSES.has(providerStatus)) {
    return {
      terminal: false,
      waitForAnalysis: false,
      providerStatus,
      nextDelaySeconds: providerStatus === 'registered' ? 60 : 120,
    };
  }

  if (!Number.isFinite(call.end_timestamp) || Number(call.end_timestamp) <= 0) {
    throw new Error(`Terminal Retell call ${call.call_id || '(missing id)'} has no valid end_timestamp`);
  }
  const hasAnalysis = !!call.call_analysis && typeof call.call_analysis === 'object';
  const waitForAnalysis = !hasAnalysis && nowMs - Number(call.end_timestamp) < analysisGraceMs;
  return {
    terminal: true,
    terminalEvent: providerStatus === 'error' ? 'call_failed' : 'call_ended',
    analysisEvent: hasAnalysis,
    waitForAnalysis,
    providerStatus,
  };
}

export function retryDelaySeconds(attemptCount: number): number {
  const safeAttempt = Math.max(1, Math.floor(attemptCount || 1));
  return Math.min(15 * 60, 30 * (2 ** Math.min(5, safeAttempt - 1)));
}

/** A missing/failed lookup never proves that no physical call exists. */
export function shouldEscalateUnresolvedLookup(input: {
  attemptCount: number;
  firstDetectedAt: string;
  nowMs?: number;
}): boolean {
  const firstDetectedMs = Date.parse(input.firstDetectedAt);
  const ageMs = Number.isFinite(firstDetectedMs) ? (input.nowMs ?? Date.now()) - firstDetectedMs : Infinity;
  return input.attemptCount >= 12 || ageMs >= 2 * 60 * 60 * 1000;
}

export function canonicalWebhookCall(
  call: RetellCallSnapshot,
  expected: ExpectedRetellIdentity,
): RetellCallSnapshot {
  const status = parseRetellStatus(call.call_status);
  return {
    ...call,
    call_status: status === 'not_connected' ? 'ended' : call.call_status,
    disconnection_reason: status === 'not_connected'
      ? (call.disconnection_reason || 'dial_failed')
      : call.disconnection_reason,
    direction: 'outbound',
    from_number: expected.callerId,
    to_number: expected.phoneNumber,
    agent_id: call.agent_id || expected.agentId || undefined,
    metadata: {
      ...(call.metadata || {}),
      call_log_id: expected.callLogId,
      user_id: expected.userId,
      organization_id: expected.organizationId,
      campaign_id: expected.campaignId,
      lead_id: expected.leadId,
      queue_id: expected.queueId,
      dispatch_generation: expected.dispatchGeneration,
      dispatch_claim_id: expected.dispatchClaimId,
      reconciliation_contract_version: expected.contractVersion,
    },
  };
}

export async function signRetellWebhook(
  rawBody: string,
  signingKey: string,
  timestampMs = Date.now(),
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(signingKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${rawBody}${timestampMs}`),
  );
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `v=${timestampMs},d=${hex}`;
}
