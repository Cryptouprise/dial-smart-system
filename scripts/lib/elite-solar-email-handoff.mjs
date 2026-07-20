import { createHash } from 'node:crypto';
import {
  OutboundEmailDraftError,
  compileOutboundEmailDraft,
} from './outbound-email-draft.mjs';

const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const SAFE_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{7,255}$/;

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

export class EliteSolarEmailHandoffError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'EliteSolarEmailHandoffError';
    this.code = code;
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function exactRecord(value, path, allowed, required = allowed) {
  if (!isRecord(value)) throw new EliteSolarEmailHandoffError('OBJECT_REQUIRED', `${path} must be an object`);
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new EliteSolarEmailHandoffError('UNKNOWN_FIELD', `${path}.${key} is not allowed`);
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      throw new EliteSolarEmailHandoffError('REQUIRED_FIELD', `${path}.${key} is required`);
    }
  }
  return value;
}

function text(value, path, minimum, maximum) {
  if (typeof value !== 'string' || value !== value.trim() || value.length < minimum || value.length > maximum) {
    throw new EliteSolarEmailHandoffError('TEXT_INVALID', `${path} must be a trimmed ${minimum}-${maximum} character string`);
  }
  if (/[\x00-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/.test(value)) {
    throw new EliteSolarEmailHandoffError('TEXT_UNSAFE', `${path} contains unsafe formatting characters`);
  }
  return value;
}

function uuid(value, path) {
  const candidate = text(value, path, 36, 36);
  if (!CANONICAL_UUID_PATTERN.test(candidate)) {
    throw new EliteSolarEmailHandoffError('UUID_INVALID', `${path} must be a canonical lowercase UUID`);
  }
  return candidate;
}

function reference(value, path) {
  const candidate = text(value, path, 8, 256);
  if (!SAFE_REFERENCE_PATTERN.test(candidate)) {
    throw new EliteSolarEmailHandoffError('REFERENCE_INVALID', `${path} must be a safe non-PII reference`);
  }
  return candidate;
}

function sha256(value, path) {
  const candidate = text(value, path, 64, 64);
  if (!SHA256_PATTERN.test(candidate)) {
    throw new EliteSolarEmailHandoffError('SHA256_INVALID', `${path} must be a SHA-256 hex digest`);
  }
  return candidate.toLowerCase();
}

function timestamp(value, path, now) {
  const candidate = text(value, path, 20, 40);
  const parsed = Date.parse(candidate);
  if (Number.isNaN(parsed)) throw new EliteSolarEmailHandoffError('TIMESTAMP_INVALID', `${path} must be an ISO-8601 timestamp`);
  const minimum = now.getTime() + 10 * 60 * 1000;
  const maximum = now.getTime() + 24 * 60 * 60 * 1000;
  if (parsed < minimum || parsed > maximum) {
    throw new EliteSolarEmailHandoffError('EXPIRY_INVALID', `${path} must be 10 minutes through 24 hours in the future`);
  }
  return new Date(parsed).toISOString();
}

function integer(value, path, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new EliteSolarEmailHandoffError('INTEGER_INVALID', `${path} must be an integer from ${minimum} through ${maximum}`);
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

function proposalDigest(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value)), 'utf8').digest('hex');
}

/**
 * Compiles a non-PII request for a human to carry an Elite reactivation cohort
 * into an already configured Instantly or Mailgun account. This is not an API
 * client: it cannot read, create, import, schedule, activate, or send through
 * either provider. The recipient manifest stays outside this process; only its
 * digest and a small count are accepted.
 */
export function buildEliteSolarEmailHandoffProposal({
  draftInput,
  releaseRequest,
  now = new Date(),
}) {
  let draft;
  try {
    draft = compileOutboundEmailDraft(draftInput);
  } catch (error) {
    if (error instanceof OutboundEmailDraftError) {
      throw new EliteSolarEmailHandoffError('DRAFT_INVALID', error.message);
    }
    throw error;
  }
  if (draft.status !== 'draft_ready_for_human_provider_review') {
    throw new EliteSolarEmailHandoffError('DRAFT_HELD', 'The email draft must pass every draft gate before a human provider handoff can be proposed');
  }
  if (draft.source_kind !== 'consented_database') {
    throw new EliteSolarEmailHandoffError('ELITE_SOURCE_SCOPE', 'Elite Solar reactivation handoff requires a reviewed consented_database source');
  }
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new EliteSolarEmailHandoffError('NOW_INVALID', 'now must be a valid Date');
  }

  const release = exactRecord(releaseRequest, '$.release', [
    'version',
    'organization_id',
    'campaign_id',
    'provider_account_reference',
    'recipient_manifest_sha256',
    'recipient_count',
    'source_release_reference',
    'suppression_snapshot_sha256',
    'copy_approval_reference',
    'compliance_approval_reference',
    'owner_approval_reference',
    'expires_at',
  ]);
  if (release.version !== 'elite.solar.email.handoff.v1') {
    throw new EliteSolarEmailHandoffError('VERSION_UNSUPPORTED', '$.release.version must be elite.solar.email.handoff.v1');
  }
  const organizationId = uuid(release.organization_id, '$.release.organization_id');
  const campaignId = uuid(release.campaign_id, '$.release.campaign_id');
  if (organizationId !== draft.organization_id || campaignId !== draft.campaign_id) {
    throw new EliteSolarEmailHandoffError('DRAFT_BINDING_MISMATCH', 'Release organization_id and campaign_id must exactly match the reviewed draft');
  }

  const core = {
    kind: 'elite_solar_email_provider_handoff_proposal_v1',
    organization_id: organizationId,
    campaign_id: campaignId,
    campaign_name: draft.campaign_name,
    provider: draft.provider,
    sender_domain: draft.sender_domain,
    provider_account_reference: reference(release.provider_account_reference, '$.release.provider_account_reference'),
    recipient_manifest_sha256: sha256(release.recipient_manifest_sha256, '$.release.recipient_manifest_sha256'),
    recipient_count: integer(release.recipient_count, '$.release.recipient_count', 1, 25),
    source_release_reference: reference(release.source_release_reference, '$.release.source_release_reference'),
    suppression_snapshot_sha256: sha256(release.suppression_snapshot_sha256, '$.release.suppression_snapshot_sha256'),
    approvals: {
      copy: reference(release.copy_approval_reference, '$.release.copy_approval_reference'),
      compliance: reference(release.compliance_approval_reference, '$.release.compliance_approval_reference'),
      owner: reference(release.owner_approval_reference, '$.release.owner_approval_reference'),
    },
    expires_at: timestamp(release.expires_at, '$.release.expires_at', now),
  };

  return Object.freeze({
    operation: 'review_only_no_provider_action',
    status: 'awaiting_separate_human_provider_execution',
    ...core,
    recipient_data_included: false,
    provider_action: 'none',
    next_human_action: 'A named reviewer must verify the recipient manifest, suppression snapshot, provider account, and exact approved copy outside this process before any provider-side import or send.',
    authority: NO_AUTHORITY,
    side_effect_invariants: NO_SIDE_EFFECTS,
    proposal_sha256: proposalDigest(core),
  });
}
