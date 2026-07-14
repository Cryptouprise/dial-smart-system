import { createHash } from 'node:crypto';

import {
  authenticatedSolarExitTrustRootSha256,
  computeLaunchBundleDigest,
  validateSolarExitBundleData,
} from './solar-exit-bundle.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[a-f0-9]{64}$/;
const MAX_CANARY_5_LIFETIME_MS = 24 * 60 * 60 * 1000;
const MIN_CANARY_5_LIFETIME_MS = 10 * 60 * 1000;

const CERTIFICATE_FIELDS = Object.freeze({
  canonical_staging_database_certificate: 'database_certificate_sha256',
  retell_owned_phone_e2e_certificate: 'provider_owned_phone_certificate_sha256',
  global_stop_drill_certificate: 'global_stop_drill_sha256',
  seller_dnc_drill_certificate: 'seller_dnc_drill_sha256',
  voice_opt_out_e2e_certificate: 'voice_opt_out_drill_sha256',
  conversation_suite_certificate: 'conversation_suite_sha256',
  ghl_shadow_reconciliation_certificate: 'ghl_shadow_certificate_sha256',
});

const APPROVAL_ROLES = Object.freeze([
  'product_owner',
  'operations',
  'compliance_or_counsel',
  'finance',
  'engineering_release_owner',
]);

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function sha256Canonical(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value)), 'utf8').digest('hex');
}

function requireUuid(value, field) {
  if (typeof value !== 'string' || !UUID_RE.test(value)) throw new Error(`${field} must be an RFC 4122 UUID.`);
  return value.toLowerCase();
}

function requireExactKeys(value, field, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${field} must be an object.`);
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`${field}.${key} is not allowed.`);
  }
}

function normalizedExpiry(value, now) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    throw new Error('expires_at must be an ISO-8601 UTC timestamp with a Z suffix.');
  }
  const expiresAt = new Date(value);
  if (Number.isNaN(expiresAt.getTime())) throw new Error('expires_at is not a valid timestamp.');
  const lifetimeMs = expiresAt.getTime() - now.getTime();
  if (lifetimeMs < MIN_CANARY_5_LIFETIME_MS || lifetimeMs > MAX_CANARY_5_LIFETIME_MS) {
    throw new Error('A canary_5 proposal must expire between 10 minutes and 24 hours after compilation.');
  }
  return expiresAt.toISOString();
}

function normalizeCanary5Request(request, now) {
  const allowed = [
    'schema_version',
    'release_id',
    'organization_id',
    'user_id',
    'campaign_id',
    'caller_number_id',
    'release_stage',
    'expires_at',
    'cohort_lead_ids',
  ];
  requireExactKeys(request, 'request', allowed);
  if (request.schema_version !== '1.0.0') throw new Error('request.schema_version must be 1.0.0.');
  if (request.release_stage !== 'canary_5') {
    throw new Error('This compiler intentionally supports only the first canary_5 release stage.');
  }
  if (!Array.isArray(request.cohort_lead_ids) || request.cohort_lead_ids.length !== 5) {
    throw new Error('A canary_5 proposal must contain exactly five lead UUIDs.');
  }
  const cohortLeadIds = request.cohort_lead_ids.map((id, index) => requireUuid(id, `cohort_lead_ids[${index}]`));
  if (new Set(cohortLeadIds).size !== cohortLeadIds.length) throw new Error('A canary_5 proposal cannot contain duplicate leads.');

  return {
    schema_version: '1.0.0',
    release_id: requireUuid(request.release_id, 'release_id'),
    organization_id: requireUuid(request.organization_id, 'organization_id'),
    user_id: requireUuid(request.user_id, 'user_id'),
    campaign_id: requireUuid(request.campaign_id, 'campaign_id'),
    caller_number_id: requireUuid(request.caller_number_id, 'caller_number_id'),
    release_stage: 'canary_5',
    cohort_limit: 5,
    expires_at: normalizedExpiry(request.expires_at, now),
    cohort_lead_ids: cohortLeadIds.sort(),
  };
}

function evidenceFingerprints(bundle, trustRoot) {
  const evidence = bundle.manifest.certification_evidence || {};
  const result = {
    campaign_bundle_sha256: computeLaunchBundleDigest(bundle),
    approval_chain_sha256: sha256Canonical(Object.fromEntries(
      APPROVAL_ROLES.map((role) => [role, bundle.manifest.launch_approvals?.[role]]),
    )),
    external_trust_root_sha256: authenticatedSolarExitTrustRootSha256(trustRoot),
  };
  for (const [certificateKey, databaseField] of Object.entries(CERTIFICATE_FIELDS)) {
    const digest = evidence[certificateKey]?.sha256;
    if (typeof digest !== 'string' || !SHA256_RE.test(digest)) {
      throw new Error(`Validated launch evidence is missing ${certificateKey}.`);
    }
    result[databaseField] = digest.toLowerCase();
  }
  return result;
}

/**
 * Compiles a reviewed, immutable first-canary proposal. It deliberately has
 * no database or provider client and therefore cannot grant contact authority.
 */
export function buildCanary5CampaignContactReleaseProposal(bundle, { trustRoot, request, now = new Date() } = {}) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error('now must be a valid Date.');
  const launchReport = validateSolarExitBundleData(bundle, { mode: 'launch', trustRoot });
  if (!launchReport.valid) {
    throw new Error(`Cannot compile a contact-release proposal: Solar Exit launch validation has ${launchReport.error_count} error(s).`);
  }

  const normalizedRequest = normalizeCanary5Request(request, now);
  const bindings = bundle.manifest.installation_bindings || {};
  if (bindings.organization_id !== normalizedRequest.organization_id || bindings.owner_user_id !== normalizedRequest.user_id) {
    throw new Error('Proposal organization_id and user_id must exactly match the validated Solar Exit installation bindings.');
  }

  const releaseRow = {
    id: normalizedRequest.release_id,
    organization_id: normalizedRequest.organization_id,
    user_id: normalizedRequest.user_id,
    campaign_id: normalizedRequest.campaign_id,
    provider: 'retell',
    retell_agent_id: bundle.retell.agent.agent_id,
    retell_agent_version: bundle.retell.agent.version,
    retell_llm_id: bundle.retell.llm.llm_id,
    retell_llm_version: bundle.retell.llm.version,
    caller_number_id: normalizedRequest.caller_number_id,
    release_stage: 'canary_5',
    cohort_limit: 5,
    ...evidenceFingerprints(bundle, trustRoot),
    expires_at: normalizedRequest.expires_at,
  };
  const releaseMembers = normalizedRequest.cohort_lead_ids.map((leadId) => ({
    release_id: normalizedRequest.release_id,
    organization_id: normalizedRequest.organization_id,
    user_id: normalizedRequest.user_id,
    campaign_id: normalizedRequest.campaign_id,
    lead_id: leadId,
  }));
  const proposal = {
    schema_version: '1.0.0',
    artifact_kind: 'campaign_contact_release_proposal',
    operation: 'review_only_no_mutations',
    compiled_at: now.toISOString(),
    campaign_bundle_id: bundle.manifest.bundle_id,
    campaign_bundle_version: bundle.manifest.bundle_version,
    release_row: releaseRow,
    release_members: releaseMembers,
    database_write_performed: false,
    provider_write_performed: false,
    contact_authorized: false,
    launch_certified: false,
    independent_service_review_required: true,
    final_call_boundary_evaluation_required: true,
  };
  return {
    ...proposal,
    proposal_sha256: sha256Canonical(proposal),
  };
}
