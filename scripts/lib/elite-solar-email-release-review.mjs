import {
  OutboundEmailDraftError,
  compileOutboundEmailDraft,
} from './outbound-email-draft.mjs';
import {
  EliteSolarEmailExecutionReleaseError,
  buildEliteSolarEmailExecutionRelease,
  verifyEliteSolarEmailExecutionRelease,
} from './elite-solar-email-execution-release.mjs';
import {
  EliteEmailSourceAttestationError,
  verifyEliteEmailSourceAttestation,
} from './elite-email-source-attestation.mjs';

const NO_AUTHORITY = Object.freeze({
  contact_authorized: false,
  launch_authorized: false,
  queue_mutation_authorized: false,
  crm_write_authorized: false,
  provider_write_authorized: false,
  spend_authorized: false,
});

const NO_SIDE_EFFECTS = Object.freeze({
  database_reads: 0,
  database_writes: 0,
  network_requests: 0,
  provider_calls: 0,
  external_messages: 0,
});

export class EliteSolarEmailReleaseReviewError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'EliteSolarEmailReleaseReviewError';
    this.code = code;
  }
}

function record(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new EliteSolarEmailReleaseReviewError('OBJECT_REQUIRED', `${path} must be an object`);
  }
  return value;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function text(value, path) {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    throw new EliteSolarEmailReleaseReviewError('TEXT_INVALID', `${path} must be a non-empty trimmed string`);
  }
  return value;
}

function executionRequestFromRelease(release) {
  const item = record(release, '$.release');
  return Object.freeze({
    version: 'elite.solar.email.execution.release.v1',
    execution_key_id: text(item.execution_key_id, '$.release.execution_key_id'),
    signer_principal_reference: text(item.signer_principal_reference, '$.release.signer_principal_reference'),
    idempotency_key: text(item.idempotency_key, '$.release.idempotency_key'),
    expires_at: text(item.expires_at, '$.release.expires_at'),
  });
}

function issuedAt(release) {
  const value = text(record(release, '$.release').issued_at, '$.release.issued_at');
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new EliteSolarEmailReleaseReviewError('ISSUED_AT_INVALID', '$.release.issued_at must be canonical ISO-8601');
  }
  return parsed;
}

function assertDraftBinding(draft, release) {
  const item = record(release, '$.release');
  const expected = {
    organization_id: draft.organization_id,
    campaign_id: draft.campaign_id,
    provider: draft.provider,
    sender_domain: draft.sender_domain,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (item[field] !== value) {
      throw new EliteSolarEmailReleaseReviewError(
        'DRAFT_RELEASE_BINDING_MISMATCH',
        `The signed release ${field} does not match the reviewed draft`,
      );
    }
  }
}

function assertSourceProofBinding(release, sourceAttestation, sourceAttestationPublicKey, now) {
  let proof;
  try {
    proof = verifyEliteEmailSourceAttestation({
      attestation: sourceAttestation,
      publicKey: sourceAttestationPublicKey,
      now,
    });
  } catch (error) {
    if (error instanceof EliteEmailSourceAttestationError) {
      throw new EliteSolarEmailReleaseReviewError('SOURCE_PROOF_INVALID', error.message);
    }
    throw error;
  }
  if (!proof.valid) {
    throw new EliteSolarEmailReleaseReviewError('SOURCE_PROOF_INVALID', 'The source/suppression proof signature is invalid');
  }
  const sourceReference = text(record(sourceAttestation, '$.source_attestation').source_release_reference, '$.source_attestation.source_release_reference');
  const expected = {
    organization_id: proof.organization_id,
    campaign_id: proof.campaign_id,
    recipient_manifest_sha256: proof.recipient_manifest_sha256,
    suppression_snapshot_sha256: proof.suppression_snapshot_sha256,
    recipient_count: proof.recipient_count,
    source_release_reference: sourceReference,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (release[field] !== value) {
      throw new EliteSolarEmailReleaseReviewError(
        'SOURCE_PROOF_RELEASE_BINDING_MISMATCH',
        `The source/suppression proof ${field} does not match the signed release`,
      );
    }
  }
  if (Date.parse(sourceAttestation.expires_at) < Date.parse(release.expires_at)) {
    throw new EliteSolarEmailReleaseReviewError(
      'SOURCE_PROOF_EXPIRES_BEFORE_RELEASE',
      'The source/suppression proof expires before the signed release',
    );
  }
  return true;
}

/**
 * Verifies the complete no-send Solar email chain in one place: the reviewed
 * non-PII draft, human handoff, and signed execution-release candidate. This
 * deliberately does not claim an idempotency key, query a provider, load a
 * recipient manifest, create a campaign, or send a message. It is the final
 * offline review immediately before a future tenant-bound server adapter does
 * its independent live checks.
 */
export function reviewEliteSolarEmailRelease({
  draftInput,
  handoffProposal,
  executionRelease,
  executionHmacKey,
  sourceAttestation,
  sourceAttestationPublicKey,
  now = new Date(),
}) {
  let draft;
  try {
    draft = compileOutboundEmailDraft(draftInput);
  } catch (error) {
    if (error instanceof OutboundEmailDraftError) {
      throw new EliteSolarEmailReleaseReviewError('DRAFT_INVALID', error.message);
    }
    throw error;
  }
  if (draft.status !== 'draft_ready_for_human_provider_review' || draft.source_kind !== 'consented_database') {
    throw new EliteSolarEmailReleaseReviewError(
      'DRAFT_NOT_ELIGIBLE',
      'The reviewed draft must be a green Elite consented-database reactivation plan',
    );
  }
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new EliteSolarEmailReleaseReviewError('NOW_INVALID', 'now must be a valid Date');
  }

  const verification = verifyEliteSolarEmailExecutionRelease({
    release: executionRelease,
    executionHmacKey,
    now,
  });
  if (!verification.valid) {
    throw new EliteSolarEmailReleaseReviewError(
      'RELEASE_INVALID',
      `The signed execution release is ${verification.verification_status}`,
    );
  }
  assertDraftBinding(draft, executionRelease);

  let expectedRelease;
  try {
    expectedRelease = buildEliteSolarEmailExecutionRelease({
      handoffProposal,
      request: executionRequestFromRelease(executionRelease),
      executionHmacKey,
      now: issuedAt(executionRelease),
    });
  } catch (error) {
    if (error instanceof EliteSolarEmailExecutionReleaseError) {
      throw new EliteSolarEmailReleaseReviewError('HANDOFF_RELEASE_INVALID', error.message);
    }
    throw error;
  }
  if (canonicalJson(expectedRelease) !== canonicalJson(executionRelease)) {
    throw new EliteSolarEmailReleaseReviewError(
      'HANDOFF_RELEASE_BINDING_MISMATCH',
      'The supplied handoff proposal is not the exact proposal used for the signed release',
    );
  }
  if ((sourceAttestation === undefined) !== (sourceAttestationPublicKey === undefined)) {
    throw new EliteSolarEmailReleaseReviewError(
      'SOURCE_PROOF_CONFIGURATION_INVALID',
      'sourceAttestation and sourceAttestationPublicKey must be supplied together',
    );
  }
  const sourceProofReviewed = sourceAttestation === undefined
    ? false
    : assertSourceProofBinding(executionRelease, sourceAttestation, sourceAttestationPublicKey, now);

  return Object.freeze({
    kind: 'elite_solar_email_release_review_v1',
    status: 'ready_for_future_adapter_review',
    provider: draft.provider,
    recipient_count: verification.recipient_count,
    release_fingerprint: verification.release_fingerprint,
    expires_at: verification.expires_at,
    source_proof_reviewed: sourceProofReviewed,
    recipient_data_included: false,
    provider_action: 'none',
    next_required_actions: Object.freeze([
      'A tenant-bound server adapter must durably claim the idempotency key exactly once.',
      'A named human must independently verify the current recipient manifest and suppression snapshot against their signed digests.',
      'The adapter must verify the exact provider account, sender, approved copy, and a small-cohort authorization before any provider request.',
      'Provider acceptance, bounce, unsubscribe, complaint, and reply receipts must be reconciled before expanding a cohort.',
    ]),
    authority: NO_AUTHORITY,
    side_effect_invariants: NO_SIDE_EFFECTS,
  });
}
