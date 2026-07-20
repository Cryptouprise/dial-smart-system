import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson } from './lib/solar-exit-shadow-evaluator.mjs';
import { buildVerifiedDirectImportShadowBatch } from './lib/signed-direct-import.mjs';

function profile(publicKey) {
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

function unsignedEnvelope() {
  const lead = {
    lead_id: 'fictional-direct-import-lead-001',
    external_contact_id: 'fictional-direct-import-contact-001',
    organization_id: '00000000-0000-4000-8000-000000000099',
    source_system: 'elite-owned-export',
    phone_number: '+13035550123',
    seller: 'Elite Solar Recovery LLC',
    lead_source: 'elite-web-consented-v1',
    property_state: 'CO',
    calling_state: 'CO',
  };
  return {
    schema_version: '1.0.0',
    import: {
      export_id: 'fictional-direct-import-export-001',
      as_of: '2026-07-19T12:00:00.000Z',
      issued_at: '2026-07-19T11:55:00.000Z',
      expires_at: '2026-07-19T12:30:00.000Z',
      organization_id: lead.organization_id,
      source_system: lead.source_system,
      seller: lead.seller,
      lead_source: lead.lead_source,
      records: [{
        lead,
        consent_evidence: {
          consent_artifact_id: 'fictional-direct-import-consent-artifact-v1',
          lead_id: lead.lead_id,
          consumer_name: 'Fictional Direct Import Person',
          phone_number: lead.phone_number,
          dialed_phone_number: lead.phone_number,
          seller: lead.seller,
          lead_source: lead.lead_source,
          source_form_version: 'fictional-direct-import-form-v1',
          consent_disclosure_text: 'Fictional consent disclosure for direct-import adapter testing only.',
          consent_text_version: 'fictional-direct-import-consent-v1',
          signature_evidence: 'fictional-esign-event-001',
          not_condition_of_purchase_disclosure: true,
          ai_voice_calls_authorized: true,
          telemarketing_calls_authorized: true,
          captured_at: '2026-07-19T11:50:00.000Z',
          revoked: false,
          property_state: 'CO',
          calling_state: 'CO',
          suppression_checks: {},
        },
      }],
    },
  };
}

function signEnvelope(envelope, privateKey) {
  return {
    ...envelope,
    signature: {
      algorithm: 'ed25519',
      key_id: 'elite-direct-import-fixture-key-v1',
      signer_principal_id: 'elite-direct-import-fixture-principal',
      signature_base64: sign(null, Buffer.from(canonicalJson({ schema_version: envelope.schema_version, import: envelope.import }), 'utf8'), privateKey).toString('base64'),
    },
  };
}

test('a verified direct export becomes a zero-contact shadow batch with exact bindings', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const envelope = signEnvelope(unsignedEnvelope(), privateKey);
  const batch = buildVerifiedDirectImportShadowBatch(envelope, profile(publicKey), publicKey, {
    now: new Date('2026-07-19T12:00:00.000Z'),
  });

  assert.equal(batch.batch_id, 'direct-import:fictional-direct-import-export-001');
  assert.equal(batch.records.length, 1);
  assert.equal(batch.records[0].trusted_dispatch_context.trust_level, 'cryptographically_verified_direct_import');
  assert.equal(batch.records[0].trusted_dispatch_context.contact_authorized, false);
  assert.equal(batch.records[0].trusted_dispatch_context.authorization_scope, 'solar_exit_shadow_evaluate_only');
  assert.equal(JSON.stringify(batch).includes('signature_base64'), false);
});

test('direct-import verification fails closed for signature and source-profile drift', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const envelope = signEnvelope(unsignedEnvelope(), privateKey);
  const profileValue = profile(publicKey);

  envelope.import.records[0].lead.lead_source = 'wrong-source';
  assert.throws(() => buildVerifiedDirectImportShadowBatch(envelope, profileValue, publicKey, {
    now: new Date('2026-07-19T12:00:00.000Z'),
  }), /signature verification failed/i);

  const validEnvelope = signEnvelope(unsignedEnvelope(), privateKey);
  profileValue.source_system = 'different-source-system';
  assert.throws(() => buildVerifiedDirectImportShadowBatch(validEnvelope, profileValue, publicKey, {
    now: new Date('2026-07-19T12:00:00.000Z'),
  }), /scope does not match/i);
});

test('direct-import verification rejects an export that is not valid at the current time', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const envelope = signEnvelope(unsignedEnvelope(), privateKey);

  assert.throws(() => buildVerifiedDirectImportShadowBatch(envelope, profile(publicKey), publicKey, {
    now: new Date('2026-07-19T12:30:00.001Z'),
  }), /signature window is invalid or expired/i);
  assert.throws(() => buildVerifiedDirectImportShadowBatch(envelope, profile(publicKey), publicKey, {
    now: new Date('2026-07-19T11:54:59.999Z'),
  }), /signature window is invalid or expired/i);
});

test('direct-import CLI emits only a redacted zero-contact report', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'solar-direct-import-cli-'));
  try {
    const candidate = join(sandbox, 'candidate');
    const importPath = join(sandbox, 'signed-import.json');
    const publicKeyPath = join(sandbox, 'signing-public-key.pem');
    const phoneKeyPath = join(sandbox, 'phone-hmac-key.bin');
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const envelope = unsignedEnvelope();
    const issuedAt = new Date(Date.now() - 60_000);
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    envelope.import.issued_at = issuedAt.toISOString();
    envelope.import.as_of = new Date().toISOString();
    envelope.import.expires_at = expiresAt.toISOString();
    const signedEnvelope = signEnvelope(envelope, privateKey);
    const directProfile = profile(publicKey);
    cpSync('campaigns/solar-exit', candidate, { recursive: true });
    writeFileSync(join(candidate, 'direct-import-mapping.json'), `${JSON.stringify(directProfile, null, 2)}\n`);
    writeFileSync(importPath, `${JSON.stringify(signedEnvelope, null, 2)}\n`);
    writeFileSync(publicKeyPath, publicKey.export({ type: 'spki', format: 'pem' }));
    writeFileSync(phoneKeyPath, randomBytes(32));

    const result = spawnSync(process.execPath, [
      'scripts/evaluate-signed-direct-import-shadow.mjs',
      '--root', candidate,
      '--input', importPath,
      '--public-key-file', publicKeyPath,
      '--phone-hmac-key-file', phoneKeyPath,
      '--phone-hmac-key-id', 'elite-direct-import-cli-key-v1',
    ], { cwd: process.cwd(), encoding: 'utf8' });

    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stdout, /blocked_unresolved_policy/);
    assert.match(result.stdout, /contact_authorized/);
    assert.equal(result.stdout.includes('Fictional Direct Import Person'), false);
    assert.equal(result.stdout.includes('+13035550123'), false);
    assert.equal(result.stdout.includes('signature_base64'), false);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
