import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { buildVerifiedDirectImportShadowBatch } from './lib/signed-direct-import.mjs';

const SCRIPT = 'scripts/sign-solar-exit-direct-import.mjs';

function directProfile(publicKey) {
  return {
    schema_version: '1.0.0',
    mode: 'signed_direct_import',
    enabled: true,
    gohighlevel_required: false,
    network_access_allowed: false,
    output_mode: 'redacted_zero_contact_shadow_report_only',
    organization_id: '00000000-0000-4000-8000-000000000099',
    legal_seller: 'Elite Solar Recovery LLC',
    source_system: 'elite-owned-export',
    allowed_lead_source: 'elite-web-consented-v1',
    signing: {
      algorithm: 'ed25519',
      signing_key_id: 'elite-direct-import-fixture-key-v1',
      signer_principal_id: 'elite-direct-import-fixture-principal',
      public_key_spki_sha256: createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex'),
      signature_required: true,
      maximum_signature_window_hours: 24,
    },
    record_contract: {
      exact_lead_and_consent_bindings_required: true,
      per_lead_suppression_evidence_required: true,
      historical_interest_alone_authorizes_contact: false,
      historical_appointment_alone_authorizes_contact: false,
      contact_authorized_by_adapter: false,
      provider_invocation_authorized_by_adapter: false,
    },
  };
}

function unsignedImport() {
  const now = Date.now();
  const lead = {
    lead_id: 'fictional-signing-lead-001',
    external_contact_id: 'fictional-signing-contact-001',
    organization_id: '00000000-0000-4000-8000-000000000099',
    source_system: 'elite-owned-export',
    phone_number: '+13035550124',
    seller: 'Elite Solar Recovery LLC',
    lead_source: 'elite-web-consented-v1',
    property_state: 'CO',
    calling_state: 'CO',
  };
  return {
    export_id: 'fictional-direct-import-signing-001',
    as_of: new Date(now).toISOString(),
    issued_at: new Date(now - 60_000).toISOString(),
    expires_at: new Date(now + 10 * 60_000).toISOString(),
    organization_id: lead.organization_id,
    source_system: lead.source_system,
    seller: lead.seller,
    lead_source: lead.lead_source,
    records: [{
      lead,
      consent_evidence: {
        consent_artifact_id: 'fictional-signing-consent-artifact-v1',
        lead_id: lead.lead_id,
        consumer_name: 'Fictional Signing Person',
        phone_number: lead.phone_number,
        dialed_phone_number: lead.phone_number,
        seller: lead.seller,
        lead_source: lead.lead_source,
        source_form_version: 'fictional-signing-form-v1',
        consent_disclosure_text: 'Fictional consent disclosure for signing tests only.',
        consent_text_version: 'fictional-signing-consent-v1',
        signature_evidence: 'fictional-esign-event-001',
        not_condition_of_purchase_disclosure: true,
        ai_voice_calls_authorized: true,
        telemarketing_calls_authorized: true,
        captured_at: new Date(now - 120_000).toISOString(),
        revoked: false,
        property_state: 'CO',
        calling_state: 'CO',
        suppression_checks: {},
      },
    }],
  };
}

test('direct-import signer creates a verified external envelope without printing contact data', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'solar-direct-import-signing-'));
  try {
    const candidate = join(sandbox, 'candidate');
    const input = join(sandbox, 'unsigned-import.json');
    const privateKeyPath = join(sandbox, 'private-key.pem');
    const output = join(sandbox, 'signed-import.json');
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const profile = directProfile(publicKey);
    cpSync('campaigns/solar-exit', candidate, { recursive: true });
    writeFileSync(join(candidate, 'direct-import-mapping.json'), `${JSON.stringify(profile, null, 2)}\n`);
    writeFileSync(input, `${JSON.stringify(unsignedImport(), null, 2)}\n`);
    writeFileSync(privateKeyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }));

    const result = spawnSync(process.execPath, [
      SCRIPT,
      '--root', candidate,
      '--input', input,
      '--private-key-file', privateKeyPath,
      '--output', output,
    ], { cwd: process.cwd(), encoding: 'utf8' });

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.operation, 'sign_direct_import_only');
    assert.equal(report.signed_record_count, 1);
    assert.equal(report.contact_data_printed, false);
    assert.equal(report.provider_write_performed, false);
    assert.equal(result.stdout.includes('Fictional Signing Person'), false);
    assert.equal(result.stdout.includes('+13035550124'), false);
    const envelope = JSON.parse(readFileSync(output, 'utf8'));
    const batch = buildVerifiedDirectImportShadowBatch(envelope, profile, publicKey);
    assert.equal(batch.records.length, 1);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test('direct-import signer refuses repository outputs and a mismatched private key', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'solar-direct-import-signing-fail-'));
  try {
    const candidate = join(sandbox, 'candidate');
    const input = join(sandbox, 'unsigned-import.json');
    const privateKeyPath = join(sandbox, 'private-key.pem');
    const { publicKey } = generateKeyPairSync('ed25519');
    const wrong = generateKeyPairSync('ed25519');
    cpSync('campaigns/solar-exit', candidate, { recursive: true });
    writeFileSync(join(candidate, 'direct-import-mapping.json'), `${JSON.stringify(directProfile(publicKey), null, 2)}\n`);
    writeFileSync(input, `${JSON.stringify(unsignedImport(), null, 2)}\n`);
    writeFileSync(privateKeyPath, wrong.privateKey.export({ type: 'pkcs8', format: 'pem' }));

    const mismatch = spawnSync(process.execPath, [
      SCRIPT,
      '--root', candidate,
      '--input', input,
      '--private-key-file', privateKeyPath,
      '--output', join(sandbox, 'mismatch-output.json'),
    ], { cwd: process.cwd(), encoding: 'utf8' });
    assert.notEqual(mismatch.status, 0);
    assert.match(mismatch.stderr, /does not match the candidate-pinned public-key fingerprint/i);

    const valid = generateKeyPairSync('ed25519');
    writeFileSync(privateKeyPath, valid.privateKey.export({ type: 'pkcs8', format: 'pem' }));
    const repositoryOutput = join(process.cwd(), 'temporary-signed-import.json');
    const repository = spawnSync(process.execPath, [
      SCRIPT,
      '--root', candidate,
      '--input', input,
      '--private-key-file', privateKeyPath,
      '--output', repositoryOutput,
    ], { cwd: process.cwd(), encoding: 'utf8' });
    assert.notEqual(repository.status, 0);
    assert.match(repository.stderr, /outside the repository/i);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
