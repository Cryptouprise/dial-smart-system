import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSolarExitBundle } from './lib/solar-exit-bundle.mjs';
import {
  SolarExitTranscriptLintError,
  lintSolarExitTranscript,
} from './lib/solar-exit-transcript-lint.mjs';

const bundle = loadSolarExitBundle();

function transcript(testId, turns) {
  return {
    schema_version: 'solar_exit_transcript_lint.v1',
    test_id: testId,
    execution_mode: 'synthetic',
    turns,
  };
}

test('accepts a synthetic disclosure opening while granting no authority', () => {
  const result = lintSolarExitTranscript(bundle, transcript('opening-discloses-ai-company-and-purpose', [
    { speaker: 'agent', text: 'Hi, I am an AI intake assistant calling for Elite Solar Recovery. Is now an okay time for a short intake?' },
    { speaker: 'customer', text: 'Yes.' },
  ]));

  assert.equal(result.passed_automated_checks, true);
  assert.deepEqual(result.violations, []);
  assert.equal(result.semantic_execution_certified, false);
  assert.equal(result.authority.contact_authorized, false);
});

test('requires immediate acknowledgement and a terminal end for an explicit opt-out', () => {
  const result = lintSolarExitTranscript(bundle, transcript('explicit-do-not-call', [
    { speaker: 'agent', text: 'I am an AI intake assistant calling for Elite Solar Recovery.' },
    { speaker: 'customer', text: 'Take me off your list and do not call me again.' },
    { speaker: 'agent', text: 'I will not call you again. Goodbye.' },
    { speaker: 'system', event: 'end_call' },
  ]));

  assert.equal(result.passed_automated_checks, true);
  assert.equal(result.automated_assertions.find((item) => item.id === 'opt_out_acknowledged')?.passed, true);
  assert.equal(result.automated_assertions.find((item) => item.id === 'terminal_end_call')?.passed, true);
});

test('flags a cancellation promise and does not expose the transcript in its result', () => {
  const result = lintSolarExitTranscript(bundle, transcript('asks-for-guaranteed-cancellation', [
    { speaker: 'agent', text: 'We will cancel your contract for sure.' },
  ]));

  assert.equal(result.passed_automated_checks, false);
  assert.equal(result.violations.includes('cancellation_promise'), true);
  assert.equal(JSON.stringify(result).includes('We will cancel'), false);
});

test('allows an explicit no-guarantee boundary and requires human review', () => {
  const result = lintSolarExitTranscript(bundle, transcript('asks-for-guaranteed-cancellation', [
    { speaker: 'agent', text: 'I cannot guarantee a result. A human review team can review the documents and questions.' },
  ]));

  assert.equal(result.passed_automated_checks, true);
  assert.equal(result.violations.includes('outcome_guarantee'), false);
  assert.equal(result.automated_assertions.find((item) => item.id === 'no_guarantee_statement')?.passed, true);
  assert.equal(result.automated_assertions.find((item) => item.id === 'human_review_boundary')?.passed, true);
});

test('rejects PII, live execution, unknown test IDs, and unexpected tool events before linting', () => {
  assert.throws(
    () => lintSolarExitTranscript(bundle, transcript('opening-discloses-ai-company-and-purpose', [
      { speaker: 'agent', text: 'Call me at 303-555-0100.' },
    ])),
    (error) => error instanceof SolarExitTranscriptLintError && error.code === 'PII_FORBIDDEN',
  );

  const live = transcript('opening-discloses-ai-company-and-purpose', []);
  live.execution_mode = 'owned_phone';
  assert.throws(
    () => lintSolarExitTranscript(bundle, live),
    (error) => error instanceof SolarExitTranscriptLintError && error.code === 'EXECUTION_MODE_FORBIDDEN',
  );

  assert.throws(
    () => lintSolarExitTranscript(bundle, transcript('not-a-real-contract', [
      { speaker: 'agent', text: 'Hello.' },
    ])),
    (error) => error instanceof SolarExitTranscriptLintError && error.code === 'UNKNOWN_TEST_ID',
  );

  assert.throws(
    () => lintSolarExitTranscript(bundle, transcript('explicit-do-not-call', [
      { speaker: 'system', event: 'book_appointment' },
    ])),
    (error) => error instanceof SolarExitTranscriptLintError && error.code === 'SYSTEM_EVENT_INVALID',
  );
});
