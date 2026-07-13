import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  buildConversationResultTemplate,
  compileSolarExitDraft,
  computeLaunchBundleDigest,
  computeLaunchManifestDigest,
  evaluateConsentEvidence,
  loadSolarExitBundle,
  loadSolarExitTrustRoot,
  requiredPlaceholderOccurrences,
  scoreConversationResults,
  validateSolarExitBundleData,
} from './lib/solar-exit-bundle.mjs';

function markAsIsolatedCandidate(bundle) {
  bundle.root = mkdtempSync(join(tmpdir(), 'solar-exit-candidate-'));
  bundle.manifest.release_provenance.source_parent = {
    bundle_id: bundle.manifest.bundle_id,
    bundle_version: bundle.manifest.bundle_version,
    sha256: bundle.manifest.release_provenance.canonical_source_sha256,
  };
  bundle.manifest.release_provenance.release_candidate_id = 'solar-exit-test-candidate';
  bundle.manifest.release_provenance.created_at = '2020-01-01T00:00:00Z';
  return bundle;
}

test('Solar Exit bundle is structurally ready as a locked offline artifact', () => {
  const bundle = loadSolarExitBundle();
  const report = validateSolarExitBundleData(bundle, { mode: 'offline' });

  assert.equal(report.valid, true, JSON.stringify(report.issues, null, 2));
  assert.equal(report.error_count, 0);
  assert.ok(report.launch_blockers.length > 0);
  assert.equal(bundle.manifest.production_launch_allowed, false);
  assert.equal(bundle.manifest.campaign.status, 'draft');
  assert.equal(bundle.manifest.environment, 'offline_only');
});

test('production launch gate fails closed and explains unresolved evidence', () => {
  const bundle = loadSolarExitBundle();
  const report = validateSolarExitBundleData(bundle, { mode: 'launch' });

  assert.equal(report.valid, false);
  assert.ok(report.error_count > 0);
  assert.ok(report.issues.some((issue) => issue.code === 'LAUNCH_BLOCKER'));
  assert.ok(report.launch_blockers.some((blocker) => /database certificate/i.test(blocker)));
  assert.ok(report.launch_blockers.some((blocker) => /Retell agent version/i.test(blocker)));
  assert.ok(report.launch_blockers.some((blocker) => /consent disclosure version/i.test(blocker)));
});

test('dry-run compiler emits only a conservative draft and performs no writes', () => {
  const compiled = compileSolarExitDraft();

  assert.equal(compiled.operation, 'dry_run_only');
  assert.equal(compiled.database_write_performed, false);
  assert.equal(compiled.provider_write_performed, false);
  assert.equal(compiled.production_launch_allowed, false);
  assert.equal(compiled.campaign_row.status, 'draft');
  assert.equal(compiled.campaign_row.provider, 'retell');
  assert.equal(compiled.campaign_row.calls_per_minute, 1);
  assert.equal(compiled.campaign_row.max_calls_per_day, 5);
  assert.equal(compiled.campaign_row.max_attempts, 1);
  assert.equal(compiled.campaign_row.workflow_id, null);
  assert.equal(compiled.campaign_row.sms_from_number, null);
  assert.equal(compiled.campaign_row.telnyx_assistant_id, null);
  assert.equal(compiled.campaign_row.metadata.voicemail_enabled, false);
  assert.equal(compiled.ghl_target.inbound_enabled, false);
  assert.equal(compiled.ghl_target.outbound_writeback_enabled, false);
  assert.equal(compiled.retell_target.provider_payload_ready, false);
  assert.equal(compiled.retell_target.provider_agent_payload, null);
  assert.equal(compiled.retell_target.provider_llm_payload, null);
});

test('isolated installation candidate supports two-phase Retell payload generation without authorizing calls', () => {
  const bundle = markAsIsolatedCandidate(structuredClone(loadSolarExitBundle()));
  bundle.manifest.environment = 'installation_candidate';
  bundle.manifest.bundle_status = 'installation_pending';
  bundle.eligibility.consent.synthetic_offline_override.enabled = false;
  bundle.manifest.company.legal_entity = 'Elite Solar Recovery LLC';
  bundle.manifest.company.public_phone = '+13035550100';
  bundle.eligibility.consent.required_seller = 'Elite Solar Recovery LLC';
  bundle.retell.publish_time_static_substitutions.registered_seller_name = 'Elite Solar Recovery LLC';
  bundle.retell.publish_time_static_substitutions.approved_customer_service_number = '+13035550100';
  bundle.retell.llm.model = 'gpt-4.1-mini';

  const llmPlan = compileSolarExitDraft(bundle);
  assert.equal(llmPlan.production_launch_allowed, false);
  assert.equal(llmPlan.provider_write_performed, false);
  assert.equal(llmPlan.retell_target.llm_payload_ready, true);
  assert.equal(llmPlan.retell_target.agent_payload_ready, false);
  assert.equal(llmPlan.retell_target.provider_llm_payload.general_prompt.includes('{{registered_seller_name}}'), false);
  assert.equal(llmPlan.retell_target.provider_agent_payload, null);

  bundle.retell.llm.llm_id = 'llm_installation_fixture';
  bundle.retell.llm.version = 0;
  bundle.retell.agent.response_engine.llm_id = 'llm_installation_fixture';
  bundle.retell.agent.response_engine.version = 0;
  bundle.retell.agent.voice_id = 'retell-approved-fixture-voice';
  bundle.retell.agent.webhook_url = 'https://example.invalid/functions/v1/retell-call-webhook';

  const agentPlan = compileSolarExitDraft(bundle);
  assert.equal(agentPlan.retell_target.llm_payload_ready, true);
  assert.equal(agentPlan.retell_target.agent_payload_ready, true);
  assert.equal(agentPlan.retell_target.provider_payload_ready, true);
  assert.equal(agentPlan.retell_target.provider_agent_payload.voicemail_option.action.type, 'hangup');
  assert.ok(agentPlan.retell_target.provider_agent_payload.post_call_analysis_data.length > 0);
});

test('all test contacts are unmistakably synthetic and non-production', () => {
  const bundle = loadSolarExitBundle();

  assert.equal(bundle.consentFixtures.fixture_only, true);
  assert.equal(bundle.consentFixtures.production_allowed, false);
  assert.ok(bundle.syntheticLeads.rows.length >= 10);
  for (const lead of bundle.syntheticLeads.rows) {
    assert.match(lead.phone_number, /^\+120255501[0-9]{2}$/);
    assert.match(lead.email, /\.invalid$/);
    assert.equal(lead.lead_source, 'codex_synthetic');
  }
});

test('consent evaluator allows only the exact synthetic offline contract', () => {
  const bundle = loadSolarExitBundle();
  for (const record of bundle.consentFixtures.records) {
    assert.equal(
      evaluateConsentEvidence(record, bundle.eligibility, { mode: 'offline' }),
      record.expected_eligibility,
      record.lead_id,
    );
  }
  assert.notEqual(
    evaluateConsentEvidence(bundle.consentFixtures.records[0], bundle.eligibility, { mode: 'production' }),
    'production_eligible',
  );
});

test('production consent cannot pass with sparse or malformed evidence', () => {
  const bundle = loadSolarExitBundle();
  const sparse = {
    phone_number: '+13035550123',
    seller: bundle.eligibility.consent.required_seller,
    lead_source: 'claimed-source',
    consent_text_version: 'claimed-version',
    ai_voice_calls_authorized: true,
    captured_at: 'garbage',
    revoked: false,
  };

  const decision = evaluateConsentEvidence(sparse, bundle.eligibility, { mode: 'production' });
  assert.notEqual(decision, 'production_eligible');
  assert.equal(decision, 'deny_missing_trusted_context');
});

test('production consent passes only a complete approved artifact and suppression contract', () => {
  const bundle = loadSolarExitBundle();
  const policy = structuredClone(bundle.eligibility);
  const disclosure = 'Elite Solar Recovery may call this number using an artificial or AI voice for telemarketing. Consent is not a condition of purchase.';
  const disclosureHash = createHash('sha256').update(disclosure, 'utf8').digest('hex');
  policy.consent.required_seller = 'Elite Solar Recovery LLC';
  policy.consent.approved_lead_sources = ['elite-solar-web-v1'];
  policy.consent.approved_consent_text_versions = ['elite-ai-consent-v1'];
  policy.consent.approved_consent_artifacts = [{
    consent_artifact_id: 'consent-artifact-v1',
    seller: 'Elite Solar Recovery LLC',
    lead_source: 'elite-solar-web-v1',
    source_form_version: 'solar-form-v1',
    consent_text_version: 'elite-ai-consent-v1',
    disclosure_sha256: disclosureHash,
    ai_voice_calls_authorized: true,
    telemarketing_calls_authorized: true,
    not_condition_of_purchase: true,
    effective_from: '2026-07-01T00:00:00Z',
    effective_to: null,
    approver: 'compliance-reviewer',
    approved_at: '2026-07-01T00:00:00Z',
  }];
  policy.jurisdiction.approved_property_states = ['CO'];
  policy.jurisdiction.approved_calling_states = ['CO'];
  const suppressionChecks = Object.fromEntries(Object.keys(policy.suppression_gates).map((gate) => [gate, {
    clear: true,
    evidence_id: `evidence-${gate}`,
    checked_at: '2026-07-13T12:00:00Z',
  }]));
  const record = {
    consent_artifact_id: 'consent-artifact-v1',
    lead_id: 'elite-lead-001',
    consumer_name: 'Synthetic Consumer',
    phone_number: '+13035550123',
    dialed_phone_number: '+13035550123',
    seller: 'Elite Solar Recovery LLC',
    lead_source: 'elite-solar-web-v1',
    source_form_version: 'solar-form-v1',
    consent_disclosure_text: disclosure,
    consent_text_version: 'elite-ai-consent-v1',
    signature_evidence: 'immutable-esign-event-001',
    not_condition_of_purchase_disclosure: true,
    ai_voice_calls_authorized: true,
    telemarketing_calls_authorized: true,
    captured_at: '2026-07-13T11:59:00Z',
    revoked: false,
    property_state: 'CO',
    calling_state: 'CO',
    suppression_checks: suppressionChecks,
  };
  const trustedDispatchContext = {
    authorization_id: 'server-dispatch-authorization-001',
    lead_id: record.lead_id,
    destination_phone_number: record.phone_number,
    seller: record.seller,
    lead_source: record.lead_source,
    consent_artifact_id: record.consent_artifact_id,
    source_form_version: record.source_form_version,
    consent_text_version: record.consent_text_version,
  };

  assert.equal(
    evaluateConsentEvidence(record, policy, { mode: 'production', now: new Date('2026-07-13T13:00:00Z'), trustedDispatchContext }),
    'production_eligible',
  );
  assert.equal(
    evaluateConsentEvidence({ ...record, dialed_phone_number: '+13035550124' }, policy, { mode: 'production', now: new Date('2026-07-13T13:00:00Z'), trustedDispatchContext }),
    'deny_phone_mismatch',
  );
  assert.equal(
    evaluateConsentEvidence(record, policy, { mode: 'production', now: new Date('2026-07-13T13:00:00Z'), trustedDispatchContext: { ...trustedDispatchContext, lead_id: 'different-lead' } }),
    'deny_lead_mismatch',
  );
  assert.equal(
    evaluateConsentEvidence(record, policy, { mode: 'production', now: new Date('2026-07-13T13:00:00Z'), trustedDispatchContext: { ...trustedDispatchContext, consent_artifact_id: 'different-artifact' } }),
    'deny_trusted_consent_binding_mismatch',
  );
});

test('required suppression gates cannot be removed from the policy', () => {
  const bundle = structuredClone(loadSolarExitBundle());
  bundle.eligibility.suppression_gates = {};

  const report = validateSolarExitBundleData(bundle, { mode: 'offline' });
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((issue) => issue.code === 'SUPPRESSION_GATE'));
});

test('launch approvals and certificates reject trivial self-attestation', () => {
  const bundle = structuredClone(loadSolarExitBundle());
  bundle.manifest.launch_approvals = { product_owner: true };
  for (const key of Object.keys(bundle.manifest.certification_evidence)) {
    if (key.endsWith('_certificate')) bundle.manifest.certification_evidence[key] = 'x';
  }

  const report = validateSolarExitBundleData(bundle, { mode: 'launch' });
  assert.equal(report.valid, false);
  assert.ok(report.launch_blockers.some((blocker) => /approvals are incomplete/i.test(blocker)));
  assert.ok(report.launch_blockers.some((blocker) => /certificate is missing or invalid/i.test(blocker)));
  assert.ok(report.issues.some((issue) => issue.code === 'LAUNCH_TRUST_ROOT'));
});

test('launch evidence requires confined files, exact version bindings, and an externally pinned trust root', () => {
  const bundle = markAsIsolatedCandidate(structuredClone(loadSolarExitBundle()));
  bundle.manifest.environment = 'production_candidate';
  bundle.retell.agent.agent_id = 'agent_release_001';
  bundle.retell.agent.version = 9;
  bundle.retell.agent.response_engine.llm_id = 'llm_release_001';
  bundle.retell.agent.response_engine.version = 4;
  bundle.retell.llm.llm_id = 'llm_release_001';
  bundle.retell.llm.version = 4;
  bundle.retell.outbound_call_defaults.from_number = '+13035550123';
  bundle.retell.agent.webhook_url = 'https://example.invalid/retell-webhook';
  const evidenceRoot = join(bundle.root, 'evidence');
  mkdirSync(join(evidenceRoot, 'approvals'), { recursive: true });
  mkdirSync(join(evidenceRoot, 'certificates'), { recursive: true });
  const roles = ['product_owner', 'operations', 'compliance_or_counsel', 'finance', 'engineering_release_owner'];
  const certificates = [
    'canonical_staging_database_certificate',
    'retell_owned_phone_e2e_certificate',
    'global_stop_drill_certificate',
    'seller_dnc_drill_certificate',
    'voice_opt_out_e2e_certificate',
    'conversation_suite_certificate',
    'ghl_shadow_reconciliation_certificate',
  ];
  const providerBinding = {
    provider: 'retell',
    agent_id: 'agent_release_001',
    agent_version: 9,
    llm_id: 'llm_release_001',
    llm_version: 4,
    from_number: '+13035550123',
    webhook_url: 'https://example.invalid/retell-webhook',
  };
  const common = {
    bundle_id: bundle.manifest.bundle_id,
    bundle_version: bundle.manifest.bundle_version,
    manifest_sha256: computeLaunchManifestDigest(bundle.manifest),
    bundle_sha256: computeLaunchBundleDigest(bundle),
    provider_binding: providerBinding,
  };
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
    const evidenceSha256 = createHash('sha256').update(artifact).digest('hex');
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
  const certificateAttestations = {};
  for (const certificateType of certificates) {
    const artifactPath = `certificates/${certificateType}.txt`;
    const artifact = `independent certificate artifact for ${certificateType}`;
    writeFileSync(join(evidenceRoot, artifactPath), artifact);
    const certificateSha256 = createHash('sha256').update(artifact).digest('hex');
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
  const trustDirectory = mkdtempSync(join(tmpdir(), 'solar-exit-trust-'));
  const trustPath = join(trustDirectory, 'trust-root.json');
  const trustJson = JSON.stringify(trustRootData);
  writeFileSync(trustPath, trustJson);
  const localOnly = validateSolarExitBundleData(bundle, { mode: 'launch' });
  assert.ok(localOnly.issues.some((issue) => issue.code === 'LAUNCH_TRUST_ROOT'));
  assert.ok(localOnly.issues.some((issue) => issue.code === 'LAUNCH_APPROVAL'));
  const trustRoot = loadSolarExitTrustRoot(trustPath, {
    candidateRoot: bundle.root,
    expectedSha256: createHash('sha256').update(trustJson).digest('hex'),
  });

  const authenticated = validateSolarExitBundleData(bundle, { mode: 'launch', trustRoot });
  assert.equal(authenticated.issues.some((issue) => ['LAUNCH_TRUST_ROOT', 'LAUNCH_APPROVAL', 'LAUNCH_CERTIFICATE', 'LAUNCH_APPROVER_SEPARATION', 'LAUNCH_PRINCIPAL_SEPARATION'].includes(issue.code)), false, JSON.stringify(authenticated.issues, null, 2));

  writeFileSync(join(evidenceRoot, 'approvals', 'product_owner.txt'), 'tampered after external attestation');
  const tampered = validateSolarExitBundleData(bundle, { mode: 'launch', trustRoot });
  assert.ok(tampered.issues.some((issue) => issue.code === 'LAUNCH_APPROVAL' && issue.path.endsWith('.product_owner')));
});

test('consent seller must match the exact disclosed legal seller', () => {
  const bundle = structuredClone(loadSolarExitBundle());
  bundle.eligibility.consent.required_seller = 'Different Seller LLC';

  const report = validateSolarExitBundleData(bundle, { mode: 'offline' });
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((issue) => issue.code === 'CONSENT_SELLER_BINDING'));
});

test('Retell target exposes only end_call and disables autonomous channels', () => {
  const bundle = loadSolarExitBundle();
  const allTools = [
    ...bundle.retell.llm.general_tools,
    ...(bundle.retell.llm.tools || []),
    ...(bundle.retell.llm.tool_functions || []),
  ];

  assert.deepEqual(allTools.map((tool) => tool.type), ['end_call']);
  assert.deepEqual(bundle.retell.llm.mcps, []);
  assert.equal(bundle.retell.agent.voicemail_option.action.type, 'hangup');
  assert.ok(bundle.retell.agent.post_call_analysis_data.length > 0);
  assert.equal(bundle.retell.post_call_analysis, undefined);
  assert.equal(bundle.manifest.campaign.sms_enabled, false);
  assert.equal(bundle.manifest.campaign.live_transfer_enabled, false);
  assert.equal(bundle.manifest.campaign.booking_enabled, false);
  assert.equal(bundle.manifest.campaign.cold_calling_enabled, false);
});

test('conversation contracts resolve to known, non-automating dispositions', () => {
  const bundle = loadSolarExitBundle();
  const dispositionKeys = new Set(bundle.dispositions.dispositions.map((entry) => entry.key));

  assert.ok(bundle.conversationTests.tests.length >= 25);
  for (const scenario of bundle.conversationTests.tests) {
    const disposition = scenario.expected?.disposition;
    if (disposition) assert.ok(dispositionKeys.has(disposition), `${scenario.id} references ${disposition}`);
  }
  assert.equal(bundle.dispositions.external_actions_enabled, false);
  for (const disposition of bundle.dispositions.dispositions) assert.deepEqual(disposition.auto_actions, []);
});

test('every configured production placeholder is declared', () => {
  const bundle = loadSolarExitBundle();
  const configured = new Set(requiredPlaceholderOccurrences(bundle).map((entry) => entry.placeholder));
  const declared = new Set(bundle.manifest.required_launch_placeholders);

  assert.ok([...configured].every((placeholder) => declared.has(placeholder)));
  assert.deepEqual([...configured].sort(), [...declared].sort());
});

test('unsafe mutations are rejected by the structural validator', () => {
  const original = loadSolarExitBundle();
  const bundle = structuredClone(original);
  bundle.manifest.campaign.status = 'active';
  bundle.manifest.campaign.cold_calling_enabled = true;
  bundle.retell.llm.general_tools.push({ type: 'transfer_call' });
  bundle.ghl.outbound_writeback_enabled = true;
  bundle.eligibility.default_decision = 'allow';

  const report = validateSolarExitBundleData(bundle, { mode: 'offline' });
  const codes = new Set(report.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.code));
  assert.equal(report.valid, false);
  for (const code of ['DRAFT_ONLY', 'FEATURE_DISABLED', 'UNSAFE_TOOL', 'GHL_WRITEBACK', 'FAIL_CLOSED']) {
    assert.ok(codes.has(code), `expected ${code}`);
  }
});

test('conversation scorer requires complete evidence, 100% passes, and zero hard failures', () => {
  const bundle = structuredClone(loadSolarExitBundle());
  bundle.retell.agent.agent_id = 'agent_owned_phone_fixture';
  bundle.retell.agent.version = 7;
  bundle.retell.agent.response_engine.llm_id = 'llm_owned_phone_fixture';
  bundle.retell.agent.response_engine.version = 4;
  bundle.retell.llm.llm_id = 'llm_owned_phone_fixture';
  bundle.retell.llm.version = 4;
  bundle.retell.outbound_call_defaults.from_number = '+13035550123';
  bundle.retell.agent.webhook_url = 'https://example.invalid/retell-webhook';
  bundle.manifest.installation_bindings.organization_id = '11111111-1111-4111-8111-111111111111';
  const incomplete = buildConversationResultTemplate(bundle);
  assert.equal(scoreConversationResults(bundle, incomplete).valid, false);

  const complete = buildConversationResultTemplate(bundle);
  Object.assign(complete, {
    environment: 'owned_phone',
    executed_at: '2026-07-13T18:00:00Z',
    executor: 'synthetic-test-runner',
    agent_id: 'agent_owned_phone_fixture',
    agent_version: 7,
    llm_id: 'llm_owned_phone_fixture',
    llm_version: 4,
    calls_owned_or_sandbox: true,
    execution_evidence_sha256: 'a'.repeat(64),
  });
  complete.results = complete.results.map((result, index) => {
    const expected = bundle.conversationTests.tests.find((scenario) => scenario.id === result.test_id)?.expected || {};
    return {
      ...result,
      passed: true,
      hard_failure: false,
      observed_disposition: result.expected_disposition,
      call_id: `call_synthetic_${String(index + 1).padStart(3, '0')}`,
      lead_id: `owned-test-lead-${String(index + 1).padStart(3, '0')}`,
      organization_id: bundle.manifest.installation_bindings.organization_id,
      destination_phone_number: '+12025550199',
      evidence_id: `synthetic-evidence-${String(index + 1).padStart(3, '0')}`,
      transcript_sha256: 'b'.repeat(64),
      provider_log_sha256: 'c'.repeat(64),
      reviewer: 'independent-test-reviewer',
      reviewed_at: '2026-07-13T19:00:00Z',
      assertion_results: Object.fromEntries(Object.entries(expected).filter(([key]) => key !== 'disposition')),
    };
  });
  const trustedExecutionContext = {
    authorization_id: 'provider-reconciliation-001',
    bundle_id: complete.bundle_id,
    bundle_version: complete.bundle_version,
    manifest_sha256: complete.manifest_sha256,
    bundle_sha256: complete.bundle_sha256,
    provider_binding: complete.provider_binding,
    execution_evidence_sha256: complete.execution_evidence_sha256,
    calls: complete.results.map((result) => ({
      test_id: result.test_id,
      call_id: result.call_id,
      lead_id: result.lead_id,
      organization_id: result.organization_id,
      provider: 'retell',
      destination_phone_number: result.destination_phone_number,
      destination_authorization: 'owned_company_phone',
      agent_id: complete.agent_id,
      agent_version: complete.agent_version,
      llm_id: complete.llm_id,
      llm_version: complete.llm_version,
      provider_log_sha256: result.provider_log_sha256,
    })),
  };

  assert.equal(scoreConversationResults(bundle, complete).valid, false);
  const passingScore = scoreConversationResults(bundle, complete, { trustedExecutionContext });
  assert.equal(passingScore.valid, true, JSON.stringify(passingScore.issues, null, 2));
  assert.equal(passingScore.pass_rate, 1);
  assert.equal(passingScore.hard_failures, 0);
  assert.equal(passingScore.semantic_execution_certified, false);
  assert.equal(passingScore.launch_certificate_created, false);
  const withExtraTrustedCall = structuredClone(trustedExecutionContext);
  withExtraTrustedCall.calls.push({ ...withExtraTrustedCall.calls[0], test_id: 'extra-test', call_id: 'extra-provider-call' });
  const extraCallScore = scoreConversationResults(bundle, complete, { trustedExecutionContext: withExtraTrustedCall });
  assert.ok(extraCallScore.issues.some((issue) => issue.code === 'TRUSTED_CALL_SET'));

  complete.results[0].hard_failure = true;
  complete.results[0].passed = false;
  const failingScore = scoreConversationResults(bundle, complete, { trustedExecutionContext });
  assert.equal(failingScore.valid, false);
  assert.ok(failingScore.issues.some((issue) => issue.code === 'HARD_FAILURE'));
});

test('frontend has no direct browser write that activates a campaign', () => {
  const sourceFiles = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(?:ts|tsx)$/.test(entry.name)) sourceFiles.push(path);
    }
  };
  walk('src');

  const directActivation = /\.from\(\s*['"]campaigns['"]\s*\)[\s\S]{0,240}?\.update\(\s*\{\s*status:\s*['"]active['"]/;
  const offenders = sourceFiles.filter((path) => directActivation.test(readFileSync(path, 'utf8')));
  assert.deepEqual(offenders, []);
});
