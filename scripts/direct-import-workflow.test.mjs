import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const PROVISION = 'scripts/provision-solar-exit-direct-import-keys.mjs';
const SIGN = 'scripts/sign-solar-exit-direct-import.mjs';
const EVALUATE = 'scripts/evaluate-signed-direct-import-shadow.mjs';

function run(script, args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
}

function unsignedImport() {
  const now = Date.now();
  const lead = {
    lead_id: 'fictional-workflow-lead-001',
    external_contact_id: 'fictional-workflow-contact-001',
    organization_id: '00000000-0000-4000-8000-000000000099',
    source_system: 'elite-owned-export',
    phone_number: '+13035550125',
    seller: 'Elite Solar Recovery LLC',
    lead_source: 'elite-web-consented-v1',
    property_state: 'CO',
    calling_state: 'CO',
  };
  return {
    export_id: 'fictional-direct-import-workflow-001',
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
        consent_artifact_id: 'fictional-workflow-consent-artifact-v1',
        lead_id: lead.lead_id,
        consumer_name: 'Fictional Workflow Person',
        phone_number: lead.phone_number,
        dialed_phone_number: lead.phone_number,
        seller: lead.seller,
        lead_source: lead.lead_source,
        source_form_version: 'fictional-workflow-form-v1',
        consent_disclosure_text: 'Fictional consent disclosure for workflow tests only.',
        consent_text_version: 'fictional-workflow-consent-v1',
        signature_evidence: 'fictional-workflow-esign-event-001',
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

test('key provision, signing, and zero-contact shadow work together without provider or CRM access', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'solar-direct-import-workflow-'));
  try {
    const keyDirectory = join(sandbox, 'keys');
    const candidate = join(sandbox, 'candidate');
    const unsignedPath = join(sandbox, 'unsigned-import.json');
    const signedPath = join(sandbox, 'signed-import.json');
    cpSync('campaigns/solar-exit', candidate, { recursive: true });

    const provision = run(PROVISION, [
      '--destination', keyDirectory,
      '--signing-key-id', 'elite-workflow-key-v1',
      '--signer-principal-id', 'elite-workflow-principal',
      '--phone-hmac-key-id', 'elite-workflow-phone-hmac-v1',
    ]);
    assert.equal(provision.status, 0, provision.stderr);
    const provisioned = JSON.parse(provision.stdout);
    const profilePath = join(candidate, 'direct-import-mapping.json');
    const profile = JSON.parse(readFileSync(profilePath, 'utf8'));
    Object.assign(profile, {
      organization_id: '00000000-0000-4000-8000-000000000099',
      legal_seller: 'Elite Solar Recovery LLC',
      source_system: 'elite-owned-export',
      allowed_lead_source: 'elite-web-consented-v1',
      signing: provisioned.signing,
    });
    writeFileSync(profilePath, `${JSON.stringify(profile, null, 2)}\n`);
    writeFileSync(unsignedPath, `${JSON.stringify(unsignedImport(), null, 2)}\n`);

    const signing = run(SIGN, [
      '--root', candidate,
      '--input', unsignedPath,
      '--private-key-file', join(keyDirectory, 'elite-solar-direct-import-ed25519-private.pem'),
      '--output', signedPath,
    ]);
    assert.equal(signing.status, 0, signing.stderr);
    assert.equal(JSON.parse(signing.stdout).signed_record_count, 1);

    const evaluation = run(EVALUATE, [
      '--root', candidate,
      '--input', signedPath,
      '--public-key-file', provisioned.public_key_file,
      '--phone-hmac-key-file', join(keyDirectory, 'elite-solar-shadow-phone-hmac-v1.bin'),
      '--phone-hmac-key-id', provisioned.phone_hmac_key_id,
    ]);
    // The copied source is intentionally unresolved for production policy, so
    // this proves the signed handoff but cannot accidentally become a call.
    assert.equal(evaluation.status, 2, evaluation.stderr);
    const report = JSON.parse(evaluation.stdout);
    assert.equal(report.batch_status, 'blocked_unresolved_policy');
    assert.equal(report.decision_semantics.contact_authorized, false);
    assert.equal(report.side_effect_invariants.provider_calls, 0);
    assert.equal(report.side_effect_invariants.database_writes, 0);
    assert.equal(report.side_effect_invariants.network_requests, 0);
    assert.equal(evaluation.stdout.includes('Fictional Workflow Person'), false);
    assert.equal(evaluation.stdout.includes('+13035550125'), false);
    assert.equal(evaluation.stdout.includes('signature_base64'), false);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
