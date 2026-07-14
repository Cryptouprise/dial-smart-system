import {
  buildWorkflowEffectIdentity,
  manualReconciliationResult,
  unrelatedLeadCallDeferral,
  validateWorkflowEffectResolution,
} from './effect-ledger.ts';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const progress = {
  id: 'progress-1',
  workflow_id: 'workflow-1',
  current_step_id: 'step-1',
  lead_id: 'lead-1',
  campaign_id: 'campaign-1',
  loop_count: 2,
  started_at: '2026-07-12T12:00:00.000Z',
  external_effect_generation: '11111111-1111-4111-8111-111111111111',
};

Deno.test('workflow effect identity is stable for a retry of the same execution', () => {
  assertEquals(
    buildWorkflowEffectIdentity(progress, 'sms'),
    buildWorkflowEffectIdentity({ ...progress }, 'sms'),
  );
  assertEquals(
    buildWorkflowEffectIdentity(progress, 'sms').executionGeneration,
    buildWorkflowEffectIdentity({ ...progress, started_at: 'changed' }, 'sms').executionGeneration,
  );
});

Deno.test('workflow effect identity uses the persisted step-attempt generation', () => {
  const first = buildWorkflowEffectIdentity(progress, 'sms');
  const authorizedFreshAttempt = buildWorkflowEffectIdentity({
    ...progress,
    external_effect_generation: '22222222-2222-4222-8222-222222222222',
  }, 'sms');
  assert(first.executionGeneration !== authorizedFreshAttempt.executionGeneration, 'rotated persisted generation must create a fresh identity');
});

Deno.test('workflow effect identity changes for a legitimate loop iteration', () => {
  const first = buildWorkflowEffectIdentity({ ...progress, loop_count: 1 }, 'call');
  const second = buildWorkflowEffectIdentity({ ...progress, loop_count: 2 }, 'call');
  assert(first.loopIteration !== second.loopIteration, 'loop iterations must have distinct effect identities');
});

Deno.test('workflow effect identity rejects incomplete or invalid executions before claim', () => {
  let missingStepThrew = false;
  let invalidLoopThrew = false;
  try {
    buildWorkflowEffectIdentity({ ...progress, current_step_id: null }, 'webhook');
  } catch {
    missingStepThrew = true;
  }
  try {
    buildWorkflowEffectIdentity({ ...progress, loop_count: -1 }, 'webhook');
  } catch {
    invalidLoopThrew = true;
  }
  assert(missingStepThrew, 'missing step must fail before a claim');
  assert(invalidLoopThrew, 'invalid loop iteration must fail before a claim');
  let missingGenerationThrew = false;
  try {
    buildWorkflowEffectIdentity({ ...progress, external_effect_generation: null }, 'webhook');
  } catch {
    missingGenerationThrew = true;
  }
  assert(missingGenerationThrew, 'missing persisted generation must fail before a claim');
});

Deno.test('manual reconciliation result is explicitly fail-closed', () => {
  const result = manualReconciliationResult('effect-1', 'sms', 'processing', 'Ambiguous outcome');
  assertEquals(result.success, false);
  assertEquals(result.completed, false);
  assertEquals(result.manual_reconciliation_required, true);
  assertEquals(result.effect_id, 'effect-1');
  assertEquals(result.effect_status, 'processing');
  assert(Boolean(result.recovery), 'operator recovery instructions are required');
});

Deno.test('resolution validation permits only explicit audited decisions', () => {
  assertEquals(validateWorkflowEffectResolution('confirmed_accepted', ' Provider dashboard verified '), {
    decision: 'confirmed_accepted',
    notes: 'Provider dashboard verified',
  });
  let invalidDecisionThrew = false;
  let missingNotesThrew = false;
  try {
    validateWorkflowEffectResolution('retry', 'guessing');
  } catch {
    invalidDecisionThrew = true;
  }
  try {
    validateWorkflowEffectResolution('confirmed_not_accepted', '   ');
  } catch {
    missingNotesThrew = true;
  }
  assert(invalidDecisionThrew, 'ambiguous retry decision must be rejected');
  assert(missingNotesThrew, 'audited resolution notes must be required');
});

Deno.test('unrelated lead calls never satisfy or advance a workflow call effect', () => {
  const pending = unrelatedLeadCallDeferral('pending', 'call-pending');
  const recent = unrelatedLeadCallDeferral('recent_contact', 'call-recent');
  assertEquals(pending.success, false);
  assertEquals(recent.success, false);
  assert(pending.action.includes('deferred'), 'pending unrelated call must defer');
  assert(recent.action.includes('deferred'), 'recent unrelated call must defer');
});
