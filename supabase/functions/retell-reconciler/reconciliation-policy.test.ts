import {
  assert,
  assertEquals,
  assertThrows,
} from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { verifyRetellWebhookSignature } from '../_shared/contact-safety.ts';
import {
  canonicalWebhookCall,
  planRetellSnapshot,
  retryDelaySeconds,
  shouldEscalateUnresolvedLookup,
  signRetellWebhook,
  validateRetellCallIdentity,
  type ExpectedRetellIdentity,
  type RetellCallSnapshot,
} from './reconciliation-policy.ts';

const expected: ExpectedRetellIdentity = {
  callLogId: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  organizationId: '33333333-3333-4333-8333-333333333333',
  campaignId: '44444444-4444-4444-8444-444444444444',
  leadId: '55555555-5555-4555-8555-555555555555',
  queueId: '66666666-6666-4666-8666-666666666666',
  dispatchGeneration: '77777777-7777-4777-8777-777777777777',
  dispatchClaimId: '88888888-8888-4888-8888-888888888888',
  contractVersion: 1,
  phoneNumber: '+13035550123',
  callerId: '+19705550123',
  agentId: 'agent-owned',
};

function call(overrides: Partial<RetellCallSnapshot> = {}): RetellCallSnapshot {
  return {
    call_id: 'retell-call-1',
    call_type: 'phone_call',
    call_status: 'ongoing',
    direction: 'outbound',
    from_number: '+19705550123',
    to_number: '+13035550123',
    agent_id: 'agent-owned',
    metadata: {
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
    ...overrides,
  };
}

Deno.test('Retell identity validation requires exact tenant and dispatch metadata', () => {
  assert(validateRetellCallIdentity(call(), expected).valid);

  const wrongTenant = call({
    metadata: { ...call().metadata, organization_id: '99999999-9999-4999-8999-999999999999' },
  });
  assertEquals(validateRetellCallIdentity(wrongTenant, expected), {
    valid: false,
    reason: 'organization_id mismatch (expected 33333333-3333-4333-8333-333333333333, received 99999999-9999-4999-8999-999999999999)',
  });

  assertEquals(validateRetellCallIdentity(call({ direction: 'inbound' }), expected), {
    valid: false,
    reason: 'Retell call direction is inbound',
  });
  assertEquals(validateRetellCallIdentity(call({ to_number: '+13035550999' }), expected), {
    valid: false,
    reason: 'Retell destination does not match the owned call log',
  });
});

Deno.test('legacy calls may omit only the versioned dispatch metadata fields', () => {
  const legacyExpected = { ...expected, contractVersion: 0 };
  const metadata = { ...call().metadata };
  delete metadata.dispatch_generation;
  delete metadata.dispatch_claim_id;
  delete metadata.reconciliation_contract_version;
  assert(validateRetellCallIdentity(call({ metadata }), legacyExpected).valid);

  delete metadata.call_log_id;
  assertEquals(validateRetellCallIdentity(call({ metadata }), legacyExpected).valid, false);
});

Deno.test('current identity contract requires all official phone-call identity fields', () => {
  assertEquals(validateRetellCallIdentity(call({ call_type: undefined }), expected).valid, false);
  assertEquals(validateRetellCallIdentity(call({ direction: undefined }), expected).valid, false);
  assertEquals(validateRetellCallIdentity(call({ from_number: undefined }), expected).valid, false);
  assertEquals(validateRetellCallIdentity(call({ to_number: undefined }), expected).valid, false);
  assertEquals(validateRetellCallIdentity(call({ agent_id: undefined }), expected).valid, false);

  const metadata = { ...call().metadata };
  delete metadata.dispatch_claim_id;
  assertEquals(validateRetellCallIdentity(call({ metadata }), expected).valid, false);
});

Deno.test('active calls wait while terminal calls replay bounded lifecycle events', () => {
  assertEquals(planRetellSnapshot(call({ call_status: 'registered' }), 2_000), {
    terminal: false,
    waitForAnalysis: false,
    providerStatus: 'registered',
    nextDelaySeconds: 60,
  });
  assertEquals(planRetellSnapshot(call({ call_status: 'ongoing' }), 2_000), {
    terminal: false,
    waitForAnalysis: false,
    providerStatus: 'ongoing',
    nextDelaySeconds: 120,
  });
  assertEquals(planRetellSnapshot(call({
    call_status: 'not_connected',
    end_timestamp: 1_000,
  }), 2_000, 30_000), {
    terminal: true,
    terminalEvent: 'call_ended',
    analysisEvent: false,
    waitForAnalysis: true,
    providerStatus: 'not_connected',
  });
  assertEquals(planRetellSnapshot(call({
    call_status: 'error',
    end_timestamp: 1_000,
    call_analysis: { call_successful: false },
  }), 2_000), {
    terminal: true,
    terminalEvent: 'call_failed',
    analysisEvent: true,
    waitForAnalysis: false,
    providerStatus: 'error',
  });
});

Deno.test('terminal snapshots without billing time or with unknown statuses fail closed', () => {
  assertThrows(
    () => planRetellSnapshot(call({ call_status: 'ended', end_timestamp: undefined })),
    Error,
    'no valid end_timestamp',
  );
  assertThrows(
    () => planRetellSnapshot(call({ call_status: 'mystery' })),
    Error,
    'Unsupported Retell call status',
  );
});

Deno.test('unresolved lookup backoff is bounded and never implies safe redial', () => {
  assertEquals(retryDelaySeconds(1), 30);
  assertEquals(retryDelaySeconds(4), 240);
  assertEquals(retryDelaySeconds(100), 900);
  assertEquals(shouldEscalateUnresolvedLookup({
    attemptCount: 11,
    firstDetectedAt: new Date(1_000).toISOString(),
    nowMs: 1_000 + (60 * 60 * 1000),
  }), false);
  assertEquals(shouldEscalateUnresolvedLookup({
    attemptCount: 12,
    firstDetectedAt: new Date(1_000).toISOString(),
    nowMs: 2_000,
  }), true);
  assertEquals(shouldEscalateUnresolvedLookup({
    attemptCount: 1,
    firstDetectedAt: new Date(1_000).toISOString(),
    nowMs: 1_000 + (2 * 60 * 60 * 1000),
  }), true);
});

Deno.test('canonical replay uses local ownership and official Retell HMAC format', async () => {
  const canonical = canonicalWebhookCall(call({
    call_status: 'not_connected',
    direction: undefined,
  }), expected);
  assertEquals(canonical.call_status, 'ended');
  assertEquals(canonical.disconnection_reason, 'dial_failed');
  assertEquals(canonical.direction, 'outbound');
  assertEquals(canonical.metadata?.call_log_id, expected.callLogId);

  const rawBody = JSON.stringify({ event: 'call_ended', call: canonical });
  const timestampMs = 1_750_000_000_000;
  const signingKey = 'reconciler-test-key';
  const signature = await signRetellWebhook(rawBody, signingKey, timestampMs);
  assert((await verifyRetellWebhookSignature({
    rawBody,
    signature,
    signingKey,
    nowMs: timestampMs,
  })).valid);
});
