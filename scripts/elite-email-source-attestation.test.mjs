import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import test from 'node:test';
import {
  buildEliteEmailSourceAttestation,
  EliteEmailSourceAttestationError,
  verifyEliteEmailSourceAttestation,
} from './lib/elite-email-source-attestation.mjs';

const NOW = new Date('2026-07-20T12:00:00.000Z');
const ORGANIZATION_ID = '1c9f70c6-3de3-4c93-bbd9-0e2fd39f95a4';
const CAMPAIGN_ID = 'fd774844-a4e7-4c93-b690-19c5d2c5042a';
const { privateKey, publicKey } = generateKeyPairSync('ed25519');

function sourceSnapshot(overrides = {}) {
  const source = {
    version: 'elite.solar.email.source-snapshot.v1',
    organization_id: ORGANIZATION_ID,
    campaign_id: CAMPAIGN_ID,
    source_system: 'elite-crm-v1',
    source_release_reference: 'source-release-20260720-a',
    evidence_as_of: '2026-07-20T11:59:00.000Z',
    issued_at: '2026-07-20T12:00:00.000Z',
    expires_at: '2026-07-20T18:00:00.000Z',
    records: [
      {
        recipient_email: 'qa-one@example.test',
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
      },
      {
        recipient_email: 'qa-two@example.test',
        source_contact_reference: 'contact-ref-0002',
        email_permission_status: 'explicit_opt_in',
        email_permission_evidence_reference: 'permission-ref-0002',
        suppression: {
          global_suppressed: false,
          tenant_suppressed: false,
          campaign_suppressed: false,
          provider_suppressed: false,
          unsubscribed: false,
          spam_complaint: false,
          permanent_bounce: false,
        },
      },
    ],
  };
  return { ...source, ...overrides };
}

function build(snapshot = sourceSnapshot(), overrides = {}) {
  return buildEliteEmailSourceAttestation({
    sourceSnapshot: snapshot,
    recipientHmacKey: randomBytes(32),
    signingKey: privateKey,
    signingKeyId: 'elite-source-signing-key-01',
    signerPrincipalReference: 'elite-source-attestor-01',
    now: NOW,
    ...overrides,
  });
}

test('signed source/suppression attestation is no-PII, non-executing, and verifiable', () => {
  const attestation = build();
  const serialized = JSON.stringify(attestation);

  assert.equal(attestation.kind, 'elite_email_source_suppression_attestation_v1');
  assert.equal(attestation.status, 'current_source_and_suppression_verified');
  assert.equal(attestation.recipient_count, 2);
  assert.equal(attestation.recipient_data_included, false);
  assert.equal(attestation.provider_action, 'none');
  assert.deepEqual(attestation.authority, {
    contact_authorized: false,
    launch_authorized: false,
    queue_mutation_authorized: false,
    crm_write_authorized: false,
    provider_write_authorized: false,
    spend_authorized: false,
  });
  assert.equal(serialized.includes('@example.test'), false);
  assert.equal(serialized.includes('contact-ref-0001'), false);
  assert.equal(serialized.includes('permission-ref-0001'), false);

  const result = verifyEliteEmailSourceAttestation({ attestation, publicKey, now: NOW });
  assert.equal(result.valid, true);
  assert.equal(result.verification_status, 'current_source_and_suppression_verified');
  assert.equal(result.recipient_count, 2);
  assert.equal(result.provider_action, 'none');
});

test('source proof refuses email without affirmative consent or with any current suppression', () => {
  const noConsent = sourceSnapshot();
  noConsent.records[0].email_permission_status = 'unknown';
  assert.throws(
    () => build(noConsent),
    (error) => error instanceof EliteEmailSourceAttestationError && error.code === 'EMAIL_PERMISSION_REQUIRED',
  );

  const suppressed = sourceSnapshot();
  suppressed.records[0].suppression.unsubscribed = true;
  assert.throws(
    () => build(suppressed),
    (error) => error instanceof EliteEmailSourceAttestationError && error.code === 'SUPPRESSION_ACTIVE',
  );
});

test('source proof rejects stale evidence, duplicate audience members, and weak recipient HMAC keys', () => {
  const stale = sourceSnapshot({ evidence_as_of: '2026-07-20T11:45:00.000Z' });
  assert.throws(
    () => build(stale),
    (error) => error instanceof EliteEmailSourceAttestationError && error.code === 'WINDOW_INVALID',
  );

  const duplicate = sourceSnapshot();
  duplicate.records[1].recipient_email = duplicate.records[0].recipient_email;
  assert.throws(
    () => build(duplicate),
    (error) => error instanceof EliteEmailSourceAttestationError && error.code === 'DUPLICATE_RECIPIENT',
  );

  assert.throws(
    () => build(sourceSnapshot(), { recipientHmacKey: new Uint8Array(32) }),
    (error) => error instanceof EliteEmailSourceAttestationError && error.code === 'HMAC_KEY_WEAK',
  );
});

test('altered attestation cannot verify and does not acquire authority', () => {
  const attestation = build();
  const altered = { ...attestation, recipient_count: 3 };
  const result = verifyEliteEmailSourceAttestation({ attestation: altered, publicKey, now: NOW });
  assert.equal(result.valid, false);
  assert.equal(result.verification_status, 'signature_invalid');
  assert.equal(result.provider_action, 'none');
  assert.equal(result.authority.provider_write_authorized, false);
});
