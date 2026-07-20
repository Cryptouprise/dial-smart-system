import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { buildCanary5CampaignContactReleaseProposal } from './lib/campaign-contact-release-proposal.mjs';
import {
  computeLaunchBundleDigest,
  computeLaunchManifestDigest,
  loadSolarExitBundle,
  loadSolarExitTrustRoot,
  validateSolarExitBundleData,
} from './lib/solar-exit-bundle.mjs';

const IDS = Object.freeze({
  organization: '11111111-1111-4111-8111-111111111111',
  owner: '22222222-2222-4222-8222-222222222222',
  campaign: '33333333-3333-4333-8333-333333333333',
  caller: '44444444-4444-4444-8444-444444444444',
  release: '55555555-5555-4555-8555-555555555555',
  lead1: '66666666-6666-4666-8666-666666666661',
  lead2: '66666666-6666-4666-8666-666666666662',
  lead3: '66666666-6666-4666-8666-666666666663',
  lead4: '66666666-6666-4666-8666-666666666664',
  lead5: '66666666-6666-4666-8666-666666666665',
});

function replaceTokens(value, tokens) {
  if (Array.isArray(value)) return value.map((entry) => replaceTokens(entry, tokens));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, replaceTokens(entry, tokens)]));
  if (typeof value !== 'string') return value;
  return Object.entries(tokens).reduce((result, [token, replacement]) => result.replaceAll(token, replacement), value);
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function makeLaunchReadyCandidate({ sourceAdapter = 'ghl' } = {}) {
  assert.ok(['ghl', 'direct_import'].includes(sourceAdapter));
  const sandbox = mkdtempSync(join(tmpdir(), 'solar-exit-release-proposal-'));
  const candidateRoot = join(sandbox, 'candidate');
  const trustRootPath = join(sandbox, 'external-trust-root.json');
  cpSync('campaigns/solar-exit', candidateRoot, { recursive: true });
  const bundle = loadSolarExitBundle(candidateRoot);
  const tokens = {
    '__REQUIRED_LEGAL_ENTITY__': 'Elite Solar Recovery LLC',
    '__REQUIRED_PUBLIC_PHONE__': '+13035550100',
    '__REQUIRED_OWNER_USER_ID__': IDS.owner,
    '__REQUIRED_DIALSMART_ORGANIZATION_ID__': IDS.organization,
    '__REQUIRED_RETELL_AGENT_ID__': 'agent_release_001',
    '__REQUIRED_RETELL_LLM_ID__': 'llm_release_001',
    '__REQUIRED_RETELL_VOICE_ID__': 'voice_release_001',
    '__REQUIRED_APPROVED_RETELL_MODEL__': 'gpt-4.1-mini',
    '__REQUIRED_OWNED_FROM_NUMBER__': '+13035550123',
    '__REQUIRED_CANONICAL_WEBHOOK_URL__': 'https://example.invalid/retell-webhook',
    '__REQUIRED_GHL_LOCATION_ID__': 'ghl-location-release-001',
    '__REQUIRED_GHL_REACTIVATION_SOURCE_ID__': 'ghl-reactivation-source-release-001',
    '__REQUIRED_GHL_REACTIVATION_STATUS_ID__': 'ghl-reactivation-status-release-001',
    '__REQUIRED_GHL_CONSENT_FIELD_ID__': 'ghl-ai-consent-field',
    '__REQUIRED_GHL_CONSENT_VERSION_FIELD_ID__': 'ghl-consent-version-field',
    '__REQUIRED_GHL_CONSENT_TIMESTAMP_FIELD_ID__': 'ghl-consent-time-field',
    '__REQUIRED_GHL_CONSENT_SELLER_FIELD_ID__': 'ghl-consent-seller-field',
    '__REQUIRED_GHL_CONSENT_REVOKED_FIELD_ID__': 'ghl-consent-revoked-field',
    '__REQUIRED_GHL_CONSENT_ARTIFACT_ID_FIELD_ID__': 'ghl-consent-artifact-field',
    '__REQUIRED_GHL_CONSENT_CONSUMER_NAME_FIELD_ID__': 'ghl-consumer-name-field',
    '__REQUIRED_GHL_CONSENT_PHONE_FIELD_ID__': 'ghl-consent-phone-field',
    '__REQUIRED_GHL_CONSENT_LEAD_SOURCE_FIELD_ID__': 'ghl-lead-source-field',
    '__REQUIRED_GHL_CONSENT_DISCLOSURE_FIELD_ID__': 'ghl-disclosure-field',
    '__REQUIRED_GHL_CONSENT_SIGNATURE_FIELD_ID__': 'ghl-signature-field',
    '__REQUIRED_GHL_CONSENT_SOURCE_FORM_FIELD_ID__': 'ghl-source-form-field',
    '__REQUIRED_GHL_CONSENT_NOT_CONDITION_FIELD_ID__': 'ghl-not-condition-field',
    '__REQUIRED_GHL_TELEMARKETING_CONSENT_FIELD_ID__': 'ghl-telemarketing-field',
    '__REQUIRED_GHL_PROPERTY_STATE_FIELD_ID__': 'ghl-property-state-field',
    '__REQUIRED_GHL_CALLING_STATE_FIELD_ID__': 'ghl-calling-state-field',
    '__REQUIRED_DIRECT_IMPORT_SOURCE_SYSTEM__': 'elite-owned-export',
    '__REQUIRED_DIRECT_IMPORT_LEAD_SOURCE__': 'elite-solar-web-v1',
    '__REQUIRED_DIRECT_IMPORT_SIGNING_KEY_ID__': 'elite-direct-import-key-v1',
    '__REQUIRED_DIRECT_IMPORT_SIGNER_PRINCIPAL_ID__': 'direct-import-signer-principal',
    '__REQUIRED_DIRECT_IMPORT_PUBLIC_KEY_SHA256__': 'c'.repeat(64),
    '__REQUIRED_COUNSEL_POLICY_VERSION__': 'counsel-policy-v1',
    '__REQUIRED_COUNSEL_SERVICE_CLASSIFICATION__': 'reviewed-service-classification-v1',
    '__REQUIRED_FEE_MODEL_APPROVAL_ID__': 'fee-model-approval-v1',
    '__REQUIRED_CUSTOMER_AGREEMENT_VERSION__': 'customer-agreement-v1',
    '__REQUIRED_PRIVACY_NOTICE_VERSION__': 'privacy-notice-v1',
    '__REQUIRED_CLAIMS_SUBSTANTIATION_VERSION__': 'claims-substantiation-v1',
    '__REQUIRED_RECORDING_MATRIX_VERSION__': 'recording-matrix-v1',
    '__REQUIRED_DNC_PROCESS_VERSION__': 'dnc-process-v1',
    '__REQUIRED_REASSIGNED_NUMBER_PROCESS_VERSION__': 'reassigned-number-process-v1',
    '__REQUIRED_HUMAN_ESCALATION_SLA__': 'human-escalation-sla-v1',
  };
  bundle.manifest = replaceTokens(bundle.manifest, tokens);
  bundle.retell = replaceTokens(bundle.retell, tokens);
  bundle.eligibility = replaceTokens(bundle.eligibility, tokens);
  bundle.ghl = replaceTokens(bundle.ghl, tokens);
  bundle.directImport = replaceTokens(bundle.directImport, tokens);
  bundle.reactivation = replaceTokens(bundle.reactivation, tokens);
  bundle.prompt = replaceTokens(bundle.prompt, tokens);
  bundle.manifest.environment = 'production_candidate';
  bundle.manifest.bundle_status = 'launch_approved';
  bundle.manifest.production_launch_allowed = true;
  bundle.manifest.release_provenance.source_parent = {
    bundle_id: bundle.manifest.bundle_id,
    bundle_version: bundle.manifest.bundle_version,
    sha256: bundle.manifest.release_provenance.canonical_source_sha256,
  };
  bundle.manifest.release_provenance.release_candidate_id = 'solar-exit-release-proposal-test';
  bundle.manifest.release_provenance.created_at = '2020-01-01T00:00:00Z';
  bundle.retell.agent.version = 9;
  bundle.retell.agent.is_published = true;
  bundle.retell.agent.response_engine.version = 4;
  bundle.retell.llm.version = 4;
  bundle.retell.llm.is_published = true;
  bundle.retell.outbound_call_defaults.agent_version = 9;
  bundle.ghl.inbound_enabled = sourceAdapter === 'ghl';
  bundle.eligibility.consent.synthetic_offline_override.enabled = false;
  bundle.eligibility.consent.approved_lead_sources = ['elite-solar-web-v1'];
  bundle.eligibility.consent.approved_consent_text_versions = ['elite-ai-consent-v1'];
  bundle.eligibility.consent.approved_consent_artifacts = [{
    consent_artifact_id: 'consent-artifact-release-v1',
    seller: 'Elite Solar Recovery LLC',
    lead_source: 'elite-solar-web-v1',
    source_form_version: 'solar-form-v1',
    consent_text_version: 'elite-ai-consent-v1',
    disclosure_sha256: 'a'.repeat(64),
    ai_voice_calls_authorized: true,
    telemarketing_calls_authorized: true,
    not_condition_of_purchase: true,
    effective_from: '2020-01-01T00:00:00Z',
    effective_to: null,
    approver: 'compliance-reviewer',
    approved_at: '2020-01-01T00:00:00Z',
  }];
  bundle.eligibility.jurisdiction.approved_property_states = ['CO'];
  bundle.eligibility.jurisdiction.approved_calling_states = ['CO'];
  bundle.eligibility.jurisdiction.recording_disclosure_by_state = { CO: 'This call may be recorded.' };
  bundle.eligibility.jurisdiction.state_rule_sources = {
    CO: {
      policy_id: 'co-recording-policy-v1',
      approver: 'compliance-reviewer',
      approved_at: '2020-01-01T00:00:00Z',
      sha256: 'b'.repeat(64),
      source_urls: ['https://example.invalid/co-recording-policy'],
    },
  };
  bundle.manifest.certification_evidence.owned_phone_consecutive_passes = 20;
  bundle.manifest.certification_evidence.conversation_contract_pass_rate = 1;
  if (sourceAdapter === 'ghl') {
    bundle.manifest.certification_evidence.ghl_shadow_contacts_compared = 25;
    bundle.manifest.certification_evidence.ghl_shadow_mismatch_rate = 0;
  } else {
    bundle.manifest.certification_evidence.direct_import_shadow_contacts_compared = 25;
    bundle.manifest.certification_evidence.direct_import_shadow_mismatch_rate = 0;
  }

  const evidenceRoot = join(candidateRoot, 'evidence');
  mkdirSync(join(evidenceRoot, 'approvals'), { recursive: true });
  mkdirSync(join(evidenceRoot, 'certificates'), { recursive: true });
  const providerBinding = {
    provider: 'retell',
    agent_id: bundle.retell.agent.agent_id,
    agent_version: bundle.retell.agent.version,
    llm_id: bundle.retell.llm.llm_id,
    llm_version: bundle.retell.llm.version,
    from_number: bundle.retell.outbound_call_defaults.from_number,
    webhook_url: bundle.retell.agent.webhook_url,
  };
  const common = {
    bundle_id: bundle.manifest.bundle_id,
    bundle_version: bundle.manifest.bundle_version,
    manifest_sha256: computeLaunchManifestDigest(bundle.manifest),
    bundle_sha256: computeLaunchBundleDigest(bundle),
    provider_binding: providerBinding,
  };
  const roles = ['product_owner', 'operations', 'compliance_or_counsel', 'finance', 'engineering_release_owner'];
  const principals = roles.map((role, index) => ({
    principal_id: `principal-${role}`,
    display_name: `Approver ${index + 1}`,
    roles: [role],
  }));
  principals.push({ principal_id: 'principal-certificate-issuer', display_name: 'Independent Test Issuer', roles: ['certificate_issuer'] });
  const approvalAttestations = {};
  for (const [index, role] of roles.entries()) {
    const artifactPath = `approvals/${role}.txt`;
    const artifact = `independent approval artifact for ${role}`;
    writeFileSync(join(evidenceRoot, artifactPath), artifact);
    const evidenceSha256 = sha256(artifact);
    bundle.manifest.launch_approvals[role] = {
      ...common,
      role,
      approved: true,
      approver: `Approver ${index + 1}`,
      principal_id: `principal-${role}`,
      approved_at: '2020-01-01T00:00:00Z',
      evidence_id: `approval-evidence-${role}`,
      artifact_path: artifactPath,
      evidence_sha256: evidenceSha256,
    };
    approvalAttestations[role] = {
      principal_id: `principal-${role}`,
      evidence_id: `approval-evidence-${role}`,
      artifact_path: artifactPath,
      evidence_sha256: evidenceSha256,
    };
  }
  const certificateTypes = [
    'canonical_staging_database_certificate',
    'retell_owned_phone_e2e_certificate',
    'global_stop_drill_certificate',
    'seller_dnc_drill_certificate',
    'voice_opt_out_e2e_certificate',
    'conversation_suite_certificate',
    sourceAdapter === 'ghl'
      ? 'ghl_shadow_reconciliation_certificate'
      : 'direct_import_shadow_reconciliation_certificate',
  ];
  const certificateAttestations = {};
  for (const certificateType of certificateTypes) {
    const artifactPath = `certificates/${certificateType}.txt`;
    const artifact = `independent certificate artifact for ${certificateType}`;
    writeFileSync(join(evidenceRoot, artifactPath), artifact);
    const certificateSha256 = sha256(artifact);
    bundle.manifest.certification_evidence[certificateType] = {
      ...common,
      certificate_type: certificateType,
      certificate_id: `certificate-${certificateType}`,
      issuer: 'Independent Test Issuer',
      issuer_principal_id: 'principal-certificate-issuer',
      issued_at: '2020-01-01T00:00:00Z',
      result: 'pass',
      subject_version: bundle.manifest.bundle_version,
      artifact_path: artifactPath,
      sha256: certificateSha256,
    };
    certificateAttestations[certificateType] = {
      issuer_principal_id: 'principal-certificate-issuer',
      certificate_id: `certificate-${certificateType}`,
      artifact_path: artifactPath,
      sha256: certificateSha256,
    };
  }
  const trustRootData = {
    schema_version: '1.0.0',
    trust_root_id: 'externally-controlled-release-trust-root',
    ...common,
    principals,
    approval_attestations: approvalAttestations,
    certificate_attestations: certificateAttestations,
  };
  const trustJson = JSON.stringify(trustRootData);
  writeFileSync(trustRootPath, trustJson);
  const trustRoot = loadSolarExitTrustRoot(trustRootPath, {
    candidateRoot,
    expectedSha256: sha256(trustJson),
  });
  return { sandbox, bundle, trustRoot };
}

function releaseRequest(overrides = {}) {
  return {
    schema_version: '1.0.0',
    release_id: IDS.release,
    organization_id: IDS.organization,
    user_id: IDS.owner,
    campaign_id: IDS.campaign,
    caller_number_id: IDS.caller,
    release_stage: 'canary_5',
    expires_at: '2026-07-13T12:30:00Z',
    cohort_lead_ids: [IDS.lead5, IDS.lead2, IDS.lead1, IDS.lead4, IDS.lead3],
    ...overrides,
  };
}

test('canary_5 proposal compiler accepts a direct-import source without requiring GHL', () => {
  const fixture = makeLaunchReadyCandidate({ sourceAdapter: 'direct_import' });
  try {
    const report = validateSolarExitBundleData(fixture.bundle, { mode: 'launch', trustRoot: fixture.trustRoot });
    assert.equal(report.valid, true, JSON.stringify(report.issues, null, 2));
    const proposal = buildCanary5CampaignContactReleaseProposal(fixture.bundle, {
      trustRoot: fixture.trustRoot,
      request: releaseRequest(),
      now: new Date('2026-07-13T12:00:00Z'),
    });

    assert.equal(proposal.operation, 'review_only_no_mutations');
    assert.equal(proposal.database_write_performed, false);
    assert.equal(proposal.provider_write_performed, false);
    assert.equal(proposal.contact_authorized, false);
    assert.equal(proposal.launch_certified, false);
    assert.equal(proposal.independent_service_review_required, true);
    assert.equal(proposal.release_row.release_stage, 'canary_5');
    assert.equal(proposal.release_row.cohort_limit, 5);
    assert.equal(proposal.release_row.source_shadow_adapter, 'signed_direct_import');
    assert.match(proposal.release_row.source_shadow_certificate_sha256, /^[a-f0-9]{64}$/);
    assert.equal(proposal.release_row.ghl_shadow_certificate_sha256, undefined);
    assert.equal(proposal.release_members.length, 5);
    assert.deepEqual(proposal.release_members.map((member) => member.lead_id), [IDS.lead1, IDS.lead2, IDS.lead3, IDS.lead4, IDS.lead5]);
    assert.match(proposal.proposal_sha256, /^[a-f0-9]{64}$/);
  } finally {
    rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test('canary_5 proposal compiler fails closed for release escalation, duplicate leads, and tenant drift', () => {
  const fixture = makeLaunchReadyCandidate();
  try {
    const options = { trustRoot: fixture.trustRoot, now: new Date('2026-07-13T12:00:00Z') };
    const legacyProposal = buildCanary5CampaignContactReleaseProposal(fixture.bundle, {
      ...options,
      request: releaseRequest(),
    });
    assert.equal(legacyProposal.release_row.source_shadow_adapter, 'signed_ghl_shadow');
    assert.equal(
      legacyProposal.release_row.ghl_shadow_certificate_sha256,
      legacyProposal.release_row.source_shadow_certificate_sha256,
    );
    assert.throws(
      () => buildCanary5CampaignContactReleaseProposal(fixture.bundle, { ...options, request: releaseRequest({ release_stage: 'canary_20' }) }),
      /only the first canary_5/i,
    );
    assert.throws(
      () => buildCanary5CampaignContactReleaseProposal(fixture.bundle, { ...options, request: releaseRequest({ cohort_lead_ids: [IDS.lead1, IDS.lead1, IDS.lead2, IDS.lead3, IDS.lead4] }) }),
      /duplicate leads/i,
    );
    assert.throws(
      () => buildCanary5CampaignContactReleaseProposal(fixture.bundle, { ...options, request: releaseRequest({ organization_id: '77777777-7777-4777-8777-777777777777' }) }),
      /must exactly match/i,
    );
  } finally {
    rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test('CLI emits a non-authorizing canary_5 request template without any provider or database access', () => {
  const result = spawnSync(process.execPath, ['scripts/build-campaign-contact-release-proposal.mjs', '--template'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const template = JSON.parse(result.stdout);
  assert.equal(template.release_stage, 'canary_5');
  assert.equal(template.cohort_lead_ids.length, 5);
  assert.match(template.release_id, /^__REQUIRED_/);
});
