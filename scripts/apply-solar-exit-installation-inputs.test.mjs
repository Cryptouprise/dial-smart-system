import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { loadSolarExitBundle } from './lib/solar-exit-bundle.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const createCandidate = resolve(repoRoot, 'scripts/create-solar-exit-installation-candidate.mjs');
const applyInputs = resolve(repoRoot, 'scripts/apply-solar-exit-installation-inputs.mjs');

function input() {
  return {
    schema_version: '1.0.0',
    company: { legal_entity: 'Elite Solar Recovery LLC', public_phone: '+13035550100' },
    installation: {
      owner_user_id: '11111111-1111-4111-8111-111111111111',
      organization_id: '22222222-2222-4222-8222-222222222222',
    },
    direct_import: {
      source_system: 'elite-controlled-export',
      allowed_lead_source: 'elite-solar-web-v1',
      signing_key_id: 'elite-direct-import-key-v1',
      signer_principal_id: 'elite-compliance-signer',
      public_key_spki_sha256: 'a'.repeat(64),
    },
    legal_and_operations: {
      counsel_policy_version: 'elite-counsel-policy-v1',
      counsel_service_classification: 'elite-service-review-v1',
      fee_model_approval_id: 'elite-fee-approval-v1',
      customer_agreement_version: 'elite-agreement-v1',
      privacy_notice_version: 'elite-privacy-v1',
      claims_substantiation_version: 'elite-claims-v1',
      recording_matrix_version: 'elite-recording-v1',
      national_and_state_dnc_process_version: 'elite-dnc-v1',
      reassigned_number_process_version: 'elite-rn-v1',
      human_escalation_sla: 'elite-human-sla-v1',
    },
    retell: {
      approved_model: 'gpt-4.1-mini',
      voice_id: 'voice_elite_001',
      owned_from_number: '+13035550123',
      canonical_webhook_url: 'https://example.invalid/retell-webhook',
      llm: { llm_id: 'llm_elite_001', version: 4 },
      agent: { agent_id: 'agent_elite_001', version: 9 },
    },
  };
}

function run(script, args) {
  return spawnSync(process.execPath, [script, ...args], { cwd: repoRoot, encoding: 'utf8' });
}

function withCandidate(callback) {
  const sandbox = mkdtempSync(join(tmpdir(), 'elite-installation-inputs-'));
  try {
    const candidate = join(sandbox, 'candidate');
    const created = run(createCandidate, [
      '--destination', candidate,
      '--release-id', 'elite-inputs-test-candidate',
      '--created-at', '2026-07-19T12:00:00.000Z',
    ]);
    assert.equal(created.status, 0, created.stderr);
    return callback({ sandbox, candidate });
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

test('applies reviewed non-secret Elite inputs only to an isolated, launch-disabled candidate', () => withCandidate(({ sandbox, candidate }) => {
  const externalInput = join(sandbox, 'elite-installation-input.json');
  writeFileSync(externalInput, `${JSON.stringify(input(), null, 2)}\n`);

  const result = run(applyInputs, ['--root', candidate, '--input', externalInput]);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.operation, 'apply_installation_inputs');
  assert.equal(output.production_launch_allowed, false);
  assert.equal(output.provider_write_performed, false);
  assert.equal(output.crm_or_database_write_performed, false);
  assert.equal(output.contact_created, false);
  assert.equal(output.secrets_accepted, false);
  assert.equal(result.stdout.includes('+13035550100'), false);
  assert.equal(result.stdout.includes('Elite Solar Recovery LLC'), false);

  const bundle = loadSolarExitBundle(candidate);
  assert.equal(bundle.manifest.environment, 'installation_candidate');
  assert.equal(bundle.manifest.bundle_status, 'installation_pending');
  assert.equal(bundle.manifest.production_launch_allowed, false);
  assert.equal(bundle.manifest.company.legal_entity, 'Elite Solar Recovery LLC');
  assert.equal(bundle.manifest.installation_bindings.organization_id, input().installation.organization_id);
  assert.equal(bundle.directImport.source_system, 'elite-controlled-export');
  assert.equal(bundle.directImport.signing.public_key_spki_sha256, 'a'.repeat(64));
  assert.equal(bundle.reactivation.source_scope.primary_source_mode, 'signed_direct_import');
  assert.equal(bundle.reactivation.source_scope.ghl_reconciliation_required, false);
  assert.equal(bundle.eligibility.consent.synthetic_offline_override.enabled, false);
  assert.equal(bundle.retell.llm.llm_id, 'llm_elite_001');
  assert.equal(bundle.retell.agent.response_engine.version, 4);
  assert.equal(bundle.retell.agent.agent_id, 'agent_elite_001');
  assert.equal(bundle.retell.outbound_call_defaults.agent_version, 9);
}));

test('rejects a secret-shaped field before mutating the candidate', () => withCandidate(({ sandbox, candidate }) => {
  const externalInput = join(sandbox, 'elite-installation-input.json');
  const before = readFileSync(join(candidate, 'manifest.json'), 'utf8');
  writeFileSync(externalInput, JSON.stringify({ ...input(), retell: { ...input().retell, api_key: 'not-allowed' } }));

  const result = run(applyInputs, ['--root', candidate, '--input', externalInput]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /retell\.api_key is not allowed/i);
  assert.equal(readFileSync(join(candidate, 'manifest.json'), 'utf8'), before);
}));

test('dry run proves the same bounded compilation without writing the candidate', () => withCandidate(({ sandbox, candidate }) => {
  const externalInput = join(sandbox, 'elite-installation-input.json');
  const before = readFileSync(join(candidate, 'direct-import-mapping.json'), 'utf8');
  writeFileSync(externalInput, JSON.stringify(input()));

  const result = run(applyInputs, ['--root', candidate, '--input', externalInput, '--dry-run']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).operation, 'dry_run_apply_installation_inputs');
  assert.equal(readFileSync(join(candidate, 'direct-import-mapping.json'), 'utf8'), before);
}));
