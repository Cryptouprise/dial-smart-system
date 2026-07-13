import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import {
  normalizePhoneVariants,
  retellLifecycleStage,
  terminalQueueDecision,
  timezoneForUsState,
  verifyRetellWebhookSignature,
} from './contact-safety.ts';

Deno.test('normalizes safety lookup variants without duplicates', () => {
  assertEquals(normalizePhoneVariants('(303) 555-0123'), [
    '(303) 555-0123',
    '3035550123',
    '13035550123',
    '+13035550123',
    '+3035550123',
  ]);
});

Deno.test('maps Retell events to distinct idempotency stages', () => {
  assertEquals(retellLifecycleStage('call_started'), 'started');
  assertEquals(retellLifecycleStage('call_ended'), 'ended');
  assertEquals(retellLifecycleStage('call_analyzed'), 'analyzed');
  assertEquals(retellLifecycleStage('call_failed'), 'failed');
  assertEquals(retellLifecycleStage('agent_updated'), null);
});

Deno.test('resolves lead-local US timezones and fails closed for unknown state', () => {
  assertEquals(timezoneForUsState('CA'), 'America/Los_Angeles');
  assertEquals(timezoneForUsState(' tx '), 'America/Chicago');
  assertEquals(timezoneForUsState(null), null);
  assertEquals(timezoneForUsState('XX'), null);
});

Deno.test('terminal decision never increments attempts and retries only below max', () => {
  assertEquals(terminalQueueDecision({
    attempts: 1,
    maxAttempts: 3,
    outcome: 'no_answer',
    isCallback: false,
  }), { status: 'pending', shouldRetry: true, retryDelayMinutes: 30 });

  assertEquals(terminalQueueDecision({
    attempts: 3,
    maxAttempts: 3,
    outcome: 'failed',
    isCallback: false,
  }), { status: 'failed', shouldRetry: false, retryDelayMinutes: null });

  assertEquals(terminalQueueDecision({
    attempts: 1,
    maxAttempts: 3,
    outcome: 'appointment_set',
    isCallback: false,
  }), { status: 'completed', shouldRetry: false, retryDelayMinutes: null });
});

Deno.test('callback retry backoff is based on accepted physical-call count', () => {
  assertEquals(terminalQueueDecision({
    attempts: 1,
    maxAttempts: 3,
    outcome: 'busy',
    isCallback: true,
  }).retryDelayMinutes, 5);
  assertEquals(terminalQueueDecision({
    attempts: 2,
    maxAttempts: 3,
    outcome: 'busy',
    isCallback: true,
  }).retryDelayMinutes, 15);
});

Deno.test('verifies official Retell HMAC format and rejects tampering/replay', async () => {
  const rawBody = '{"event":"call_ended","call":{"call_id":"call_1"}}';
  const timestampMs = 1_750_000_000_000;
  const signingKey = 'test-signing-key';
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(signingKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signed = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${rawBody}${timestampMs}`),
  );
  const digest = [...new Uint8Array(signed)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  const signature = `v=${timestampMs},d=${digest}`;

  assert((await verifyRetellWebhookSignature({ rawBody, signature, signingKey, nowMs: timestampMs })).valid);
  assertEquals((await verifyRetellWebhookSignature({
    rawBody: `${rawBody} `,
    signature,
    signingKey,
    nowMs: timestampMs,
  })).valid, false);
  assertEquals((await verifyRetellWebhookSignature({
    rawBody,
    signature,
    signingKey,
    nowMs: timestampMs + (6 * 60 * 1000),
  })).valid, false);
});
