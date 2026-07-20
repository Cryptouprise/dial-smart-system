import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { verifyEliteEmailSourceAttestation } from './lib/elite-email-source-attestation.mjs';

const ORGANIZATION_ID = '1c9f70c6-3de3-4c93-bbd9-0e2fd39f95a4';
const CAMPAIGN_ID = 'fd774844-a4e7-4c93-b690-19c5d2c5042a';

function sourceSnapshot(now) {
  return {
    version: 'elite.solar.email.source-snapshot.v1',
    organization_id: ORGANIZATION_ID,
    campaign_id: CAMPAIGN_ID,
    source_system: 'elite-crm-v1',
    source_release_reference: 'source-release-20260720-a',
    evidence_as_of: new Date(now.getTime() - 60_000).toISOString(),
    issued_at: now.toISOString(),
    expires_at: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    records: [{
      recipient_email: 'qa-person@example.test',
      source_contact_reference: 'contact-ref-0001',
      email_permission_status: 'explicit_opt_in',
      email_permission_evidence_reference: 'permission-ref-0001',
      suppression: {
        global_suppressed: false,
        tenant_suppressed: false,
        campaign_suppressed: false,
        provider_suppressed: false,
        unsubscribed: false,
        spam_complaint: false,
        permanent_bounce: false,
      },
    }],
  };
}

test('CLI writes only an external signed no-PII source proof', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'elite-email-source-proof-'));
  try {
    const now = new Date();
    const source = join(sandbox, 'permissioned-source.json');
    const hmac = join(sandbox, 'recipient-hmac.bin');
    const privateKey = join(sandbox, 'source-attestation-private.pem');
    const output = join(sandbox, 'source-proof.json');
    const pair = generateKeyPairSync('ed25519');
    writeFileSync(source, JSON.stringify(sourceSnapshot(now)));
    writeFileSync(hmac, Buffer.from([...Array(32).keys()]));
    writeFileSync(privateKey, pair.privateKey.export({ type: 'pkcs8', format: 'pem' }));
    const result = spawnSync(process.execPath, [
      'scripts/create-elite-email-source-attestation.mjs',
      '--source', source,
      '--recipient-hmac-key-file', hmac,
      '--signing-private-key-file', privateKey,
      '--signing-key-id', 'elite-source-signing-key-01',
      '--signer-reference', 'elite-source-attestor-01',
      '--output', output,
    ], { cwd: process.cwd(), encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.includes('@example.test'), false);
    assert.equal(result.stdout.includes('contact-ref-0001'), false);
    const proof = JSON.parse(readFileSync(output, 'utf8'));
    assert.equal(JSON.stringify(proof).includes('@example.test'), false);
    assert.equal(proof.provider_action, 'none');
    assert.equal(verifyEliteEmailSourceAttestation({ attestation: proof, publicKey: pair.publicKey }).valid, true);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
