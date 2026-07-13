/**
 * Pure safety helpers shared by the provider boundary and callback handlers.
 * Keep this module free of database/network dependencies so the invariants can
 * be tested without a running Supabase project.
 */

export type RetellWebhookVerifyResult =
  | { valid: true; timestampMs: number }
  | { valid: false; reason: string; timestampMs?: number };

export type RetellLifecycleStage = 'started' | 'ended' | 'analyzed' | 'failed' | null;

export type TerminalQueueDecision = {
  status: 'pending' | 'completed' | 'failed';
  shouldRetry: boolean;
  retryDelayMinutes: number | null;
};

const RETRY_ELIGIBLE_OUTCOMES = new Set([
  'no_answer',
  'voicemail',
  'busy',
  'failed',
  'unknown',
]);

const US_STATE_TIMEZONES: Record<string, string> = {
  CT: 'America/New_York', DE: 'America/New_York', FL: 'America/New_York', GA: 'America/New_York',
  IN: 'America/Indiana/Indianapolis', KY: 'America/New_York', ME: 'America/New_York', MD: 'America/New_York',
  MA: 'America/New_York', MI: 'America/New_York', NH: 'America/New_York', NJ: 'America/New_York',
  NY: 'America/New_York', NC: 'America/New_York', OH: 'America/New_York', PA: 'America/New_York',
  RI: 'America/New_York', SC: 'America/New_York', VT: 'America/New_York', VA: 'America/New_York',
  WV: 'America/New_York', DC: 'America/New_York', AL: 'America/Chicago', AR: 'America/Chicago',
  IL: 'America/Chicago', IA: 'America/Chicago', KS: 'America/Chicago', LA: 'America/Chicago',
  MN: 'America/Chicago', MS: 'America/Chicago', MO: 'America/Chicago', NE: 'America/Chicago',
  ND: 'America/Chicago', OK: 'America/Chicago', SD: 'America/Chicago', TN: 'America/Chicago',
  TX: 'America/Chicago', WI: 'America/Chicago', AZ: 'America/Phoenix', CO: 'America/Denver',
  ID: 'America/Boise', MT: 'America/Denver', NM: 'America/Denver', UT: 'America/Denver',
  WY: 'America/Denver', CA: 'America/Los_Angeles', NV: 'America/Los_Angeles',
  OR: 'America/Los_Angeles', WA: 'America/Los_Angeles', AK: 'America/Anchorage',
  HI: 'Pacific/Honolulu', PR: 'America/Puerto_Rico', VI: 'America/Virgin', GU: 'Pacific/Guam',
  AS: 'Pacific/Pago_Pago', MP: 'Pacific/Guam',
};

export function timezoneForUsState(state: string | null | undefined): string | null {
  if (!state) return null;
  return US_STATE_TIMEZONES[state.trim().toUpperCase()] || null;
}

export function normalizePhoneVariants(phone: string): string[] {
  const raw = String(phone || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return [];
  const last10 = digits.slice(-10);
  return [...new Set([
    raw,
    digits,
    last10,
    last10.length === 10 ? `1${last10}` : '',
    last10.length === 10 ? `+1${last10}` : '',
    `+${digits}`,
  ].filter(Boolean))];
}

export function retellLifecycleStage(event: string): RetellLifecycleStage {
  if (event === 'call_started') return 'started';
  if (event === 'call_ended') return 'ended';
  if (event === 'call_analyzed') return 'analyzed';
  if (event === 'call_failed') return 'failed';
  return null;
}

/**
 * Attempts is the number of provider-accepted physical calls. It is never
 * incremented here: record_physical_call_attempt owns that single increment.
 */
export function terminalQueueDecision(input: {
  attempts: number | null | undefined;
  maxAttempts: number | null | undefined;
  outcome: string;
  isCallback: boolean;
}): TerminalQueueDecision {
  const attempts = Math.max(0, Number(input.attempts || 0));
  const maxAttempts = Math.max(1, Number(input.maxAttempts || 3));
  const retryEligible = RETRY_ELIGIBLE_OUTCOMES.has(input.outcome);

  if (!retryEligible) {
    return { status: 'completed', shouldRetry: false, retryDelayMinutes: null };
  }

  if (attempts >= maxAttempts) {
    return { status: 'failed', shouldRetry: false, retryDelayMinutes: null };
  }

  const retryDelayMinutes = input.isCallback
    ? (attempts <= 1 ? 5 : 15)
    : 30;
  return { status: 'pending', shouldRetry: true, retryDelayMinutes };
}

function parseRetellSignature(signature: string): { timestampMs: number; digest: string } | null {
  const pieces = Object.fromEntries(
    signature.split(',').map((part) => {
      const [key, ...value] = part.trim().split('=');
      return [key, value.join('=')];
    }),
  );
  const timestampMs = Number(pieces.v);
  const digest = String(pieces.d || '').toLowerCase();
  if (!Number.isFinite(timestampMs) || !/^[a-f0-9]{64}$/.test(digest)) return null;
  return { timestampMs, digest };
}

function constantTimeEqualHex(actual: string, expected: string): boolean {
  // Always walk the longest string. Do not return early on a mismatched byte.
  const length = Math.max(actual.length, expected.length);
  let mismatch = actual.length ^ expected.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (actual.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Retell secure-webhook format:
 * X-Retell-Signature: v={timestamp_ms},d={hmac_sha256_hex}
 * digest input: raw request body followed immediately by the timestamp.
 */
export async function verifyRetellWebhookSignature(input: {
  rawBody: string;
  signature: string | null;
  signingKey: string;
  nowMs?: number;
  toleranceMs?: number;
}): Promise<RetellWebhookVerifyResult> {
  if (!input.signature) return { valid: false, reason: 'missing_signature' };
  if (!input.signingKey) return { valid: false, reason: 'missing_signing_key' };

  const parsed = parseRetellSignature(input.signature);
  if (!parsed) return { valid: false, reason: 'malformed_signature' };

  const nowMs = input.nowMs ?? Date.now();
  const toleranceMs = input.toleranceMs ?? 5 * 60 * 1000;
  if (Math.abs(nowMs - parsed.timestampMs) > toleranceMs) {
    return { valid: false, reason: 'timestamp_outside_tolerance', timestampMs: parsed.timestampMs };
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(input.signingKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signed = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${input.rawBody}${parsed.timestampMs}`),
  );
  const expected = toHex(signed);
  if (!constantTimeEqualHex(parsed.digest, expected)) {
    return { valid: false, reason: 'digest_mismatch', timestampMs: parsed.timestampMs };
  }
  return { valid: true, timestampMs: parsed.timestampMs };
}
