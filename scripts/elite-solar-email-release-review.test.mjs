import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { buildEliteSolarEmailHandoffProposal } from './lib/elite-solar-email-handoff.mjs';
import { buildEliteSolarEmailExecutionRelease } from './lib/elite-solar-email-execution-release.mjs';
import {
  EliteSolarEmailReleaseReviewError,
  reviewEliteSolarEmailRelease,
} from './lib/elite-solar-email-release-review.mjs';

const NOW = new Date('2026-07-20T12:00:00.000Z');
const KEY = Buffer.from([...Array(32).keys()]);
const IDS = Object.freeze({
  organization: '123e4567-e89b-42d3-a456-426614174000',
  campaign: '223e4567-e89b-42d3-a456-426614174000',
});

function draftInput(overrides = {}) {
  return {
    version: 'outbound.email.draft.v1',
    organization_id: IDS.organization,
    campaign_id: IDS.campaign,
    campaign_name: 'Elite Solar reviewed reactivation',
    provider: 'instantly',
    source: {
      kind: 'consented_database',
      evidence_reference: 'elite-consent-source-review-v1',
      recipient_data_included: false,
      list_hygiene_verified: true,
    },
    sender: {
      domain: 'mail.elitesolar.example',
      mailbox_reference: 'instantly-elite-sender-v1',
      domain_verified: true,
      reply_handling_verified: true,
      provider_binding_verified: true,
    },
    message: {
      subject_reference: 'elite-copy-subject-v1',
      body_reference: 'elite-copy-body-v1',
      claim_review_verified: true,
      unsubscribe_marker_present: true,
    },
    compliance: {
      sender_identity_reference: 'elite-sender-identity-v1',
      postal_address_reference: 'elite-postal-address-v1',
      unsubscribe_url: 'https://mail.elitesolar.example/unsubscribe',
      suppression_sync_verified: true,
      jurisdiction_review_reference: 'elite-email-compliance-v1',
    },
    review: {
      copy_approval_reference: 'elite-copy-approval-v1',
      owner_approval_reference: 'elite-owner-approval-v1',
      provider_health_reference: 'instantly-readiness-v1',
    },
    ...overrides,
  };
}

function artifacts(now = NOW) {
  const draft = draftInput();
  const handoff = buildEliteSolarEmailHandoffProposal({
    draftInput: draft,
    releaseRequest: {
      version: 'elite.solar.email.handoff.v1',
      organization_id: IDS.organization,
      campaign_id: IDS.campaign,
      provider_account_reference: 'instantly-elite-account-v1',
      recipient_manifest_sha256: 'a'.repeat(64),
      recipient_count: 2,
      source_release_reference: 'elite-signed-recipient-release-v1',
      suppression_snapshot_sha256: 'b'.repeat(64),
      copy_approval_reference: 'elite-copy-approval-v1',
      compliance_approval_reference: 'elite-compliance-approval-v1',
      owner_approval_reference: 'elite-owner-approval-v1',
      expires_at: new Date(now.getTime() + 2 * 60 * 60 * 1_000).toISOString(),
    },
    now,
  });
  const release = buildEliteSolarEmailExecutionRelease({
    handoffProposal: handoff,
    request: {
      version: 'elite.solar.email.execution.release.v1',
      execution_key_id: 'elite-email-release-key-v1',
      signer_principal_reference: 'elite-owner-approval-v1',
      idempotency_key: 'elite-email-release-20260720-001',
      expires_at: new Date(now.getTime() + 60 * 60 * 1_000).toISOString(),
    },
    executionHmacKey: KEY,
    now,
  });
  return { draft, handoff, release };
}

test('reviews the full Elite reactivation email chain without provider authority', () => {
  const { draft, handoff, release } = artifacts();
  const result = reviewEliteSolarEmailRelease({
    draftInput: draft,
    handoffProposal: handoff,
    executionRelease: release,
    executionHmacKey: KEY,
    now: new Date('2026-07-20T12:30:00.000Z'),
  });

  assert.equal(result.status, 'ready_for_future_adapter_review');
  assert.equal(result.provider, 'instantly');
  assert.equal(result.recipient_count, 2);
  assert.equal(result.recipient_data_included, false);
  assert.equal(result.provider_action, 'none');
  assert.equal(result.authority.provider_write_authorized, false);
  assert.deepEqual(result.side_effect_invariants, {
    database_reads: 0,
    database_writes: 0,
    network_requests: 0,
    provider_calls: 0,
    external_messages: 0,
  });
  assert.equal(JSON.stringify(result).includes('instantly-elite-account-v1'), false);
});

test('rejects a draft mismatch, an altered handoff, and an expired signed release', () => {
  const { draft, handoff, release } = artifacts();
  const mismatchedDraft = draftInput({ provider: 'mailgun' });
  assert.throws(
    () => reviewEliteSolarEmailRelease({ draftInput: mismatchedDraft, handoffProposal: handoff, executionRelease: release, executionHmacKey: KEY, now: new Date('2026-07-20T12:30:00.000Z') }),
    (error) => error instanceof EliteSolarEmailReleaseReviewError && error.code === 'DRAFT_RELEASE_BINDING_MISMATCH',
  );
  assert.throws(
    () => reviewEliteSolarEmailRelease({ draftInput: draft, handoffProposal: { ...handoff, recipient_count: 3 }, executionRelease: release, executionHmacKey: KEY, now: new Date('2026-07-20T12:30:00.000Z') }),
    (error) => error instanceof EliteSolarEmailReleaseReviewError && error.code === 'HANDOFF_RELEASE_INVALID',
  );
  assert.throws(
    () => reviewEliteSolarEmailRelease({ draftInput: draft, handoffProposal: handoff, executionRelease: release, executionHmacKey: KEY, now: new Date('2026-07-20T13:01:00.000Z') }),
    (error) => error instanceof EliteSolarEmailReleaseReviewError && error.code === 'RELEASE_INVALID',
  );
});

test('CLI accepts only external artifacts and prints a redacted no-send review', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'elite-email-review-'));
  try {
    const { draft, handoff, release } = artifacts(new Date());
    const paths = {
      draft: join(sandbox, 'draft.json'),
      handoff: join(sandbox, 'handoff.json'),
      release: join(sandbox, 'release.json'),
      key: join(sandbox, 'key.bin'),
    };
    writeFileSync(paths.draft, JSON.stringify(draft));
    writeFileSync(paths.handoff, JSON.stringify(handoff));
    writeFileSync(paths.release, JSON.stringify(release));
    writeFileSync(paths.key, KEY);
    const result = spawnSync(process.execPath, [
      'scripts/review-elite-solar-email-release.mjs',
      '--draft', paths.draft,
      '--handoff', paths.handoff,
      '--release', paths.release,
      '--hmac-key-file', paths.key,
    ], { cwd: process.cwd(), encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const review = JSON.parse(result.stdout);
    assert.equal(review.status, 'ready_for_future_adapter_review');
    assert.equal(review.provider_action, 'none');
    assert.equal(review.authority.contact_authorized, false);
    assert.equal(result.stdout.includes('instantly-elite-account-v1'), false);

    const repositoryFile = spawnSync(process.execPath, [
      'scripts/review-elite-solar-email-release.mjs',
      '--draft', paths.draft,
      '--handoff', paths.handoff,
      '--release', paths.release,
      '--hmac-key-file', join(process.cwd(), 'package.json'),
    ], { cwd: process.cwd(), encoding: 'utf8' });
    assert.notEqual(repositoryFile.status, 0);
    assert.match(repositoryFile.stderr, /ELITE_SOLAR_EMAIL_RELEASE_REVIEW_FAILED/);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
