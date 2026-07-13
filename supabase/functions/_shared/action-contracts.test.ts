import {
  assertSuccessfulFunctionResult,
  buildAiSmsRequest,
  buildOutboundCallRequest,
  buildSmsRequest,
  getCanonicalActionParams,
  getPriorityScore,
  toLegacyPriority,
} from './action-contracts.ts';

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

Deno.test('canonical action params prefer action_params and adapt legacy payload', () => {
  assertEquals(getCanonicalActionParams({ action_params: { lead_id: 'new' }, action_payload: { lead_id: 'old' } }), { lead_id: 'new' });
  assertEquals(getCanonicalActionParams({ action_params: {}, action_payload: { lead_id: 'old' } }), { lead_id: 'old' });
});

Deno.test('priority adapter supports canonical scores and legacy labels', () => {
  assertEquals(getPriorityScore({ priority_score: 2, priority: 'low' }), 2);
  assertEquals(getPriorityScore({ priority: 'high' }), 1);
  assertEquals(getPriorityScore({ priority: 'medium' }), 5);
  assertEquals(toLegacyPriority(8), 'low');
});

Deno.test('outbound call contract exactly matches create_call fields', () => {
  assertEquals(buildOutboundCallRequest({
    userId: 'user', leadId: 'lead', campaignId: 'campaign', phoneNumber: '+13035550100',
    callerId: '+13035550101', provider: 'retell', agentId: 'agent', idempotencyKey: 'action:1',
  }), {
    action: 'create_call', userId: 'user', leadId: 'lead', campaignId: 'campaign',
    phoneNumber: '+13035550100', callerId: '+13035550101', provider: 'retell', agentId: 'agent',
    idempotencyKey: 'action:1',
  });
});

Deno.test('outbound call contract rejects a Retell call without an agent', () => {
  let message = '';
  try {
    buildOutboundCallRequest({
      userId: 'user', leadId: 'lead', campaignId: 'campaign', phoneNumber: '+13035550100',
      callerId: '+13035550101', provider: 'retell',
      idempotencyKey: 'action:1',
    });
  } catch (error) {
    message = (error as Error).message;
  }
  if (!message.includes('agentId')) throw new Error('Expected missing agentId rejection');
});

Deno.test('SMS contracts preserve downstream casing', () => {
  assertEquals(buildSmsRequest({
    userId: 'user', leadId: 'lead', to: '+1', from: '+2', body: 'hello', idempotencyKey: 'action:1',
  }), {
    action: 'send_sms', user_id: 'user', lead_id: 'lead', to: '+1', from: '+2', body: 'hello',
    idempotency_key: 'action:1',
  });
  assertEquals(buildAiSmsRequest({
    userId: 'user', leadId: 'lead', fromNumber: '+2', toNumber: '+1', prompt: 'hello', idempotencyKey: 'action:1',
  }), {
    action: 'generate_and_send', userId: 'user', leadId: 'lead', fromNumber: '+2', toNumber: '+1', prompt: 'hello',
    context: {}, idempotency_key: 'action:1',
  });
});

Deno.test('function result validator rejects transport and application errors', () => {
  for (const [ok, body] of [[false, {}], [true, null], [true, { error: 'nope' }], [true, { success: false }], [true, { success: true, skipped: true }]] as const) {
    let rejected = false;
    try { assertSuccessfulFunctionResult('test-function', ok, body); } catch { rejected = true; }
    if (!rejected) throw new Error(`Expected rejection for ${JSON.stringify(body)}`);
  }
  assertSuccessfulFunctionResult('test-function', true, { success: true });
});
