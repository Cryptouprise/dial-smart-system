import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  SOLAR_EXIT_CANARY_EVALUATOR_VERSION,
  SOLAR_EXIT_CANARY_SCHEMA_VERSION,
  SOLAR_EXIT_CANARY_TEMPLATE_STAGES,
  buildSolarExitCanaryTemplate,
  computeCanaryEvidenceDigest,
  evaluateSolarExitCanary,
} from './lib/solar-exit-canary.mjs';

const HASH = (character) => character.repeat(64);
const binding = Object.freeze({
  bundle_id: 'elite-solar-recovery-solar-exit-database-reactivation',
  bundle_version: '2026.07.19.1',
  manifest_sha256: HASH('a'),
  bundle_sha256: HASH('b'),
  organization_id: 'org_elite_solar',
  ghl_location_id: 'ghl_elite_solar',
  provider: 'retell',
  provider_agent_id: 'agent_solar_exit',
  provider_agent_version: 7,
  provider_llm_id: 'llm_solar_exit',
  provider_llm_version: 11,
  prompt_sha256: HASH('c'),
  eligibility_policy_sha256: HASH('d'),
  disposition_policy_sha256: HASH('e'),
});

const sampleSizes = { owned_phone: 20, canary_5: 5, canary_20: 20, canary_50: 50 };

function result(stage, index) {
  const suffix = String(index + 1).padStart(3, '0');
  return {
    ordinal: index + 1,
    call_id: `call-${stage}-${suffix}`,
    lead_id: `lead-${stage}-${suffix}`,
    provider_call_id: `retell-${stage}-${suffix}`,
    population: stage === 'owned_phone' ? 'owned_phone' : 'consented_real_lead',
    started_at: '2026-07-13T10:00:00.000Z',
    completed_at: '2026-07-13T10:01:00.000Z',
    campaign_binding: structuredClone(binding),
    observed_identity: {
      provider: binding.provider,
      provider_agent_id: binding.provider_agent_id,
      provider_agent_version: binding.provider_agent_version,
      provider_llm_id: binding.provider_llm_id,
      provider_llm_version: binding.provider_llm_version,
      organization_id: binding.organization_id,
      ghl_location_id: binding.ghl_location_id,
    },
    preflight: {
      exact_consent_verified: true,
      consent_unrevoked: true,
      company_dnc_clear: true,
      national_dnc_clear: true,
      state_dnc_clear: true,
      reassigned_number_clear: true,
      phone_ownership_clear: true,
      prior_opt_out_clear: true,
      wrong_number_clear: true,
      complaint_quarantine_clear: true,
      global_stop_clear: true,
      jurisdiction_clear: true,
      calling_window_clear: true,
    },
    hard_failures: {
      dnc_violation: false,
      consent_violation: false,
      wrong_tenant: false,
      duplicate_call: false,
      provider_identity_mismatch: false,
      global_stop_violation: false,
    },
    metrics: {
      webhook_events_expected: 1,
      webhook_events_matched: 1,
      webhook_mismatches: 0,
      webhook_terminal_latency_ms: 10_000,
      reconciliation_records_expected: 1,
      reconciliation_records_matched: 1,
      reconciliation_mismatches: 0,
      reconciliation_latency_ms: 30_000,
      billing_expected_microunits: 25_000,
      billing_observed_microunits: 25_000,
      ghl_shadow_records_expected: 1,
      ghl_shadow_records_matched: 1,
      ghl_shadow_mismatches: 0,
    },
    evidence: {
      call_evidence_id: `call-evidence-${stage}-${suffix}`,
      call_evidence_sha256: HASH('1'),
      consent_evidence_id: `consent-evidence-${stage}-${suffix}`,
      consent_evidence_sha256: HASH('2'),
      suppression_evidence_id: `suppression-evidence-${stage}-${suffix}`,
      suppression_evidence_sha256: HASH('3'),
      webhook_evidence_id: `webhook-evidence-${stage}-${suffix}`,
      webhook_evidence_sha256: HASH('4'),
      reconciliation_evidence_id: `recon-evidence-${stage}-${suffix}`,
      reconciliation_evidence_sha256: HASH('5'),
      billing_evidence_id: `billing-evidence-${stage}-${suffix}`,
      billing_evidence_sha256: HASH('6'),
      ghl_evidence_id: `ghl-evidence-${stage}-${suffix}`,
      ghl_evidence_sha256: HASH('7'),
    },
  };
}

function inputFor(stage, priorStageCertificate = null) {
  const input = {
    schema_version: SOLAR_EXIT_CANARY_SCHEMA_VERSION,
    evaluator_version: SOLAR_EXIT_CANARY_EVALUATOR_VERSION,
    campaign_binding: structuredClone(binding),
    cohort: {
      stage,
      run_id: `run-${stage}-001`,
      expected_sample_size: sampleSizes[stage],
      operator_principal_id: 'operator-principal-001',
      started_at: '2026-07-13T09:59:00.000Z',
      completed_at: '2026-07-13T12:00:00.000Z',
    },
    prior_stage_certificate: priorStageCertificate,
    review: {
      principal_id: 'reviewer-principal-001',
      display_name: 'Accountable QA Reviewer',
      role: 'quality_assurance',
      reviewed_at: '2026-07-13T12:01:00.000Z',
      decision: 'approve',
      evidence_id: `review-evidence-${stage}-001`,
      evidence_sha256: HASH('8'),
      bound_evidence_sha256: HASH('0'),
      campaign_binding: structuredClone(binding),
    },
    results: Array.from({ length: sampleSizes[stage] }, (_, index) => result(stage, index)),
  };
  input.review.bound_evidence_sha256 = computeCanaryEvidenceDigest(input);
  return input;
}

function rebind(input) {
  input.review.bound_evidence_sha256 = computeCanaryEvidenceDigest(input);
  return input;
}

test('owned-phone certification requires exactly 20 clean calls and promotes to five', () => {
  const report = evaluateSolarExitCanary(inputFor('owned_phone'));
  assert.equal(report.passed, true, JSON.stringify(report.issues, null, 2));
  assert.equal(report.decision, 'promote');
  assert.equal(report.next_stage, 'canary_5');
  assert.equal(report.observed_sample_size, 20);
  assert.equal(report.certificate.sample_size, 20);
  assert.equal(report.certificate.authorization_scope, 'evidence_chain_only');
  assert.equal(report.certificate.contact_authorized, false);
  assert.equal(report.certificate.launch_authorized, false);
  assert.equal(report.certificate.external_trust_required, true);
  assert.equal(report.contact_authorization_created, false);
  assert.equal(report.launch_authorization_created, false);
  assert.deepEqual(report.side_effects, {
    database_writes_performed: false,
    provider_writes_performed: false,
    network_requests_performed: false,
    calls_authorized_by_this_evaluation: false,
  });
});

test('promotion chain is owned phone -> 5 -> 20 -> 50 -> normal', () => {
  const owned = evaluateSolarExitCanary(inputFor('owned_phone'));
  const five = evaluateSolarExitCanary(inputFor('canary_5', owned.certificate));
  const twenty = evaluateSolarExitCanary(inputFor('canary_20', five.certificate));
  const fifty = evaluateSolarExitCanary(inputFor('canary_50', twenty.certificate));
  assert.equal(five.next_stage, 'canary_20');
  assert.equal(twenty.next_stage, 'canary_50');
  assert.equal(fifty.passed, true, JSON.stringify(fifty.issues, null, 2));
  assert.equal(fifty.decision, 'normal');
  assert.equal(fifty.next_stage, 'normal');
});

test('missing or extra samples fail closed', () => {
  for (const length of [4, 6]) {
    const input = inputFor('canary_5', evaluateSolarExitCanary(inputFor('owned_phone')).certificate);
    input.results = input.results.slice(0, length);
    if (length === 6) input.results.push(result('canary_5', 5));
    const report = evaluateSolarExitCanary(rebind(input));
    assert.equal(report.decision, 'hold');
    assert.ok(report.issues.some((issue) => issue.code === 'ACTUAL_SAMPLE_SIZE_MISMATCH'));
  }
});

test('every named safety hard failure independently holds the cohort', () => {
  for (const key of ['dnc_violation', 'consent_violation', 'wrong_tenant', 'duplicate_call', 'provider_identity_mismatch', 'global_stop_violation']) {
    const input = inputFor('owned_phone');
    input.results[0].hard_failures[key] = true;
    const report = evaluateSolarExitCanary(rebind(input));
    assert.equal(report.decision, 'hold', key);
    assert.ok(Object.values(report.hard_failure_counts).some((count) => count > 0), key);
  }
});

test('identity mismatches and duplicate IDs are derived even when flags lie', () => {
  const wrongTenant = inputFor('owned_phone');
  wrongTenant.results[0].observed_identity.organization_id = 'org_wrong_tenant';
  assert.ok(evaluateSolarExitCanary(rebind(wrongTenant)).hard_failure_counts.wrong_tenant > 0);

  const wrongProvider = inputFor('owned_phone');
  wrongProvider.results[0].observed_identity.provider_agent_version += 1;
  assert.ok(evaluateSolarExitCanary(rebind(wrongProvider)).hard_failure_counts.provider_identity > 0);

  const duplicate = inputFor('owned_phone');
  duplicate.results[1].provider_call_id = duplicate.results[0].provider_call_id;
  assert.ok(evaluateSolarExitCanary(rebind(duplicate)).hard_failure_counts.duplicate > 0);
});

test('webhook, reconciliation, billing, and GHL thresholds each fail closed', () => {
  const mutations = [
    (metrics) => { metrics.webhook_events_matched = 0; },
    (metrics) => { metrics.webhook_mismatches = 1; },
    (metrics) => { metrics.webhook_terminal_latency_ms = 60_001; },
    (metrics) => { metrics.reconciliation_records_matched = 0; },
    (metrics) => { metrics.reconciliation_mismatches = 1; },
    (metrics) => { metrics.reconciliation_latency_ms = 300_001; },
    (metrics) => { metrics.billing_observed_microunits += 1; },
    (metrics) => { metrics.ghl_shadow_records_matched = 0; },
    (metrics) => { metrics.ghl_shadow_mismatches = 1; },
  ];
  for (const mutate of mutations) {
    const input = inputFor('owned_phone');
    mutate(input.results[0].metrics);
    const report = evaluateSolarExitCanary(rebind(input));
    assert.equal(report.decision, 'hold');
    assert.ok(report.issues.some((issue) => issue.category === 'threshold'));
  }
});

test('missing, extra, and malformed fields fail closed at every nesting level', () => {
  const cases = [
    (input) => { delete input.cohort.run_id; },
    (input) => { input.untrusted_override = true; },
    (input) => { input.results[0].metrics.extra_metric = 0; },
    (input) => { input.results[0].hard_failures.dnc_violation = 'false'; },
    (input) => { input.results[0].evidence.call_evidence_sha256 = 'not-a-hash'; },
  ];
  for (const mutate of cases) {
    const input = inputFor('owned_phone');
    mutate(input);
    const report = evaluateSolarExitCanary(input);
    assert.equal(report.input_valid, false);
    assert.equal(report.decision, 'hold');
  }
});

test('review and version evidence must bind the exact results and predecessor', () => {
  const staleReview = inputFor('owned_phone');
  staleReview.results[0].metrics.billing_expected_microunits += 1;
  assert.ok(evaluateSolarExitCanary(staleReview).issues.some((issue) => issue.code === 'REVIEW_EVIDENCE_BINDING_MISMATCH'));

  const wrongVersion = inputFor('owned_phone');
  wrongVersion.results[0].campaign_binding.bundle_version = 'tampered-version';
  assert.ok(evaluateSolarExitCanary(rebind(wrongVersion)).issues.some((issue) => issue.code === 'RESULT_VERSION_BINDING_MISMATCH'));

  const owned = evaluateSolarExitCanary(inputFor('owned_phone'));
  const brokenChain = inputFor('canary_5', { ...owned.certificate, next_stage: 'canary_20' });
  assert.ok(evaluateSolarExitCanary(rebind(brokenChain)).issues.some((issue) => issue.code === 'BROKEN_PROMOTION_CHAIN'));

  const forgedAuthority = inputFor('canary_5', { ...owned.certificate, launch_authorized: true });
  assert.ok(evaluateSolarExitCanary(rebind(forgedAuthority)).issues.some((issue) => issue.code === 'CERTIFICATE_AUTHORITY_MISMATCH'));
});

test('evaluation is deterministic and does not mutate input', () => {
  const input = inputFor('owned_phone');
  const before = structuredClone(input);
  const first = evaluateSolarExitCanary(input);
  const second = evaluateSolarExitCanary(input);
  assert.deepEqual(first, second);
  assert.deepEqual(input, before);
});

test('all four deterministic templates have exact stage sizes and are schema-valid holds', () => {
  const expected = {
    owned_phone_20: ['owned_phone', 20],
    live_5: ['canary_5', 5],
    live_20: ['canary_20', 20],
    live_50: ['canary_50', 50],
  };
  assert.deepEqual(Object.keys(SOLAR_EXIT_CANARY_TEMPLATE_STAGES), Object.keys(expected));
  for (const [name, [stage, size]] of Object.entries(expected)) {
    const template = buildSolarExitCanaryTemplate(name);
    const report = evaluateSolarExitCanary(template);
    assert.equal(template.cohort.stage, stage);
    assert.equal(template.cohort.expected_sample_size, size);
    assert.equal(template.results.length, size);
    assert.equal(new Set(template.results.map((result) => result.call_id)).size, size);
    assert.equal(report.input_valid, true, JSON.stringify(report.issues, null, 2));
    assert.equal(report.decision, 'hold');
    assert.equal(report.certificate, null);
    assert.equal(report.contact_authorization_created, false);
    assert.equal(report.launch_authorization_created, false);
    assert.deepEqual(buildSolarExitCanaryTemplate(name), template);
  }
});

test('template generator rejects unknown names', () => {
  assert.throws(() => buildSolarExitCanaryTemplate('canary_500'), /Unknown template/);
});

test('CLI returns JSON and uses exit 0 for promote, exit 2 for hold', () => {
  const directory = mkdtempSync(join(tmpdir(), 'solar-exit-canary-'));
  const cli = join(dirname(fileURLToPath(import.meta.url)), 'evaluate-solar-exit-canary.mjs');
  const passingPath = join(directory, 'passing.json');
  writeFileSync(passingPath, JSON.stringify(inputFor('owned_phone')));
  const passing = spawnSync(process.execPath, [cli, '--input', passingPath], { encoding: 'utf8' });
  assert.equal(passing.status, 0, passing.stderr);
  assert.equal(JSON.parse(passing.stdout).decision, 'promote');

  const heldInput = inputFor('owned_phone');
  heldInput.results[0].hard_failures.dnc_violation = true;
  const heldPath = join(directory, 'held.json');
  writeFileSync(heldPath, JSON.stringify(rebind(heldInput)));
  const held = spawnSync(process.execPath, [cli, '--input', heldPath], { encoding: 'utf8' });
  assert.equal(held.status, 2, held.stderr);
  assert.equal(JSON.parse(held.stdout).decision, 'hold');
});

test('CLI prints templates to stdout and rejects conflicting modes', () => {
  const cli = join(dirname(fileURLToPath(import.meta.url)), 'evaluate-solar-exit-canary.mjs');
  for (const name of Object.keys(SOLAR_EXIT_CANARY_TEMPLATE_STAGES)) {
    const generated = spawnSync(process.execPath, [cli, '--template', name], { encoding: 'utf8' });
    assert.equal(generated.status, 0, generated.stderr);
    const template = JSON.parse(generated.stdout);
    assert.deepEqual(template, buildSolarExitCanaryTemplate(name));
    assert.equal(evaluateSolarExitCanary(template).decision, 'hold');
  }
  const conflict = spawnSync(process.execPath, [cli, '--template', 'live_5', '--input', 'unused.json'], { encoding: 'utf8' });
  assert.equal(conflict.status, 1);
  assert.match(conflict.stderr, /exactly one/);
});
