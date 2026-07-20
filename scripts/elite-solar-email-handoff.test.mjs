import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  EliteSolarEmailHandoffError,
  buildEliteSolarEmailHandoffProposal,
} from './lib/elite-solar-email-handoff.mjs';

const IDS = Object.freeze({
  organization: '123e4567-e89b-42d3-a456-426614174000',
  campaign: '223e4567-e89b-42d3-a456-426614174000',
});

function draftInput() {
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
  };
}

function releaseRequest(overrides = {}) {
  return {
    version: 'elite.solar.email.handoff.v1',
    organization_id: IDS.organization,
    campaign_id: IDS.campaign,
    provider_account_reference: 'instantly-elite-account-v1',
    recipient_manifest_sha256: 'a'.repeat(64),
    recipient_count: 25,
    source_release_reference: 'elite-signed-recipient-release-v1',
    suppression_snapshot_sha256: 'b'.repeat(64),
    copy_approval_reference: 'elite-copy-approval-v1',
    compliance_approval_reference: 'elite-compliance-approval-v1',
    owner_approval_reference: 'elite-owner-approval-v1',
    expires_at: '2026-07-20T12:30:00.000Z',
    ...overrides,
  };
}

test('builds a bounded Elite email handoff proposal without provider authority', () => {
  const proposal = buildEliteSolarEmailHandoffProposal({
    draftInput: draftInput(),
    releaseRequest: releaseRequest(),
    now: new Date('2026-07-20T12:00:00.000Z'),
  });

  assert.equal(proposal.status, 'awaiting_separate_human_provider_execution');
  assert.equal(proposal.provider, 'instantly');
  assert.equal(proposal.recipient_count, 25);
  assert.equal(proposal.recipient_data_included, false);
  assert.equal(proposal.provider_action, 'none');
  assert.equal(proposal.authority.contact_authorized, false);
  assert.equal(proposal.side_effect_invariants.provider_calls, 0);
  assert.match(proposal.proposal_sha256, /^[a-f0-9]{64}$/);
});

test('refuses held, non-reactivation, mismatched, oversized, and recipient-bearing requests', () => {
  const now = new Date('2026-07-20T12:00:00.000Z');
  const held = draftInput();
  held.sender.domain_verified = false;
  assert.throws(
    () => buildEliteSolarEmailHandoffProposal({ draftInput: held, releaseRequest: releaseRequest(), now }),
    (error) => error instanceof EliteSolarEmailHandoffError && error.code === 'DRAFT_HELD',
  );

  const prospecting = draftInput();
  prospecting.source.kind = 'prospecting_list';
  assert.throws(
    () => buildEliteSolarEmailHandoffProposal({ draftInput: prospecting, releaseRequest: releaseRequest(), now }),
    (error) => error instanceof EliteSolarEmailHandoffError && error.code === 'ELITE_SOURCE_SCOPE',
  );
  assert.throws(
    () => buildEliteSolarEmailHandoffProposal({ draftInput: draftInput(), releaseRequest: releaseRequest({ recipient_count: 26 }), now }),
    (error) => error instanceof EliteSolarEmailHandoffError && error.code === 'INTEGER_INVALID',
  );
  assert.throws(
    () => buildEliteSolarEmailHandoffProposal({ draftInput: draftInput(), releaseRequest: releaseRequest({ recipients: ['person@example.com'] }), now }),
    (error) => error instanceof EliteSolarEmailHandoffError && error.code === 'UNKNOWN_FIELD',
  );
});

test('CLI emits a non-PII template and refuses unsupported flags', () => {
  const template = spawnSync(process.execPath, ['scripts/build-elite-solar-email-handoff.mjs', '--template'], { encoding: 'utf8' });
  assert.equal(template.status, 0, template.stderr);
  const parsed = JSON.parse(template.stdout);
  assert.equal(parsed.recipient_count, 25);
  assert.equal(Object.hasOwn(parsed, 'recipients'), false);

  const rejected = spawnSync(process.execPath, ['scripts/build-elite-solar-email-handoff.mjs', '--send'], { encoding: 'utf8' });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /ELITE_SOLAR_EMAIL_HANDOFF_FAILED/);
});
