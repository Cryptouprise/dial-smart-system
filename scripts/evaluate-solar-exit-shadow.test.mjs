import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadSolarExitBundle } from './lib/solar-exit-bundle.mjs';
import {
  canonicalJson,
  evaluateSolarExitShadowBatch,
  productionPolicyBlockers,
  sha256Canonical,
  verifySolarExitShadowReport,
} from './lib/solar-exit-shadow-evaluator.mjs';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CAMPAIGN_ROOT = resolve(REPOSITORY_ROOT, 'campaigns/solar-exit');
const DEMO_INPUT_PATH = resolve(REPOSITORY_ROOT, 'scripts/test-fixtures/solar-exit-shadow-demo-input.json');
const PRODUCTION_PHONE_HMAC_KEY = createHash('sha256')
  .update('solar-exit-shadow-private-fixture-key-material-v1', 'utf8')
  .digest();
const PRODUCTION_PHONE_HMAC_KEY_ID = 'shadow-fixture-key-v1';

function productionOptions(overrides = {}) {
  return {
    mode: 'production',
    phoneHmacKey: PRODUCTION_PHONE_HMAC_KEY,
    phoneHmacKeyId: PRODUCTION_PHONE_HMAC_KEY_ID,
    ...overrides,
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function productionFixture({ includeTrustedContext = true } = {}) {
  const policy = structuredClone(loadSolarExitBundle(CAMPAIGN_ROOT).eligibility);
  const disclosure = 'Elite Solar Recovery LLC may call this number using an artificial or AI voice for telemarketing. Consent is not a condition of purchase.';
  const seller = 'Elite Solar Recovery LLC';
  policy.policy_version = 'counsel-approved-shadow-policy-2026-07-13-v1';
  policy.consent.required_seller = seller;
  policy.consent.approved_lead_sources = ['elite-solar-web-v1'];
  policy.consent.approved_consent_text_versions = ['elite-ai-consent-v1'];
  policy.consent.approved_consent_artifacts = [{
    consent_artifact_id: 'elite-consent-artifact-v1',
    seller,
    lead_source: 'elite-solar-web-v1',
    source_form_version: 'elite-solar-form-v1',
    consent_text_version: 'elite-ai-consent-v1',
    disclosure_sha256: sha256(disclosure),
    ai_voice_calls_authorized: true,
    telemarketing_calls_authorized: true,
    not_condition_of_purchase: true,
    effective_from: '2026-07-01T00:00:00.000Z',
    effective_to: null,
    approver: 'Fictional Compliance Reviewer',
    approved_at: '2026-07-01T00:00:00.000Z',
  }];
  policy.jurisdiction.approved_property_states = ['CO'];
  policy.jurisdiction.approved_calling_states = ['CO'];
  policy.jurisdiction.recording_disclosure_by_state = {
    CO: 'Fictional approved recording disclosure for evaluator testing only.',
  };
  policy.jurisdiction.state_rule_sources = {
    CO: {
      policy_id: 'fictional-co-shadow-policy-source-v1',
      approver: 'Fictional Compliance Reviewer',
      approved_at: '2026-07-01T00:00:00.000Z',
      sha256: 'a'.repeat(64),
      source_urls: ['https://example.invalid/fictional-co-policy-source'],
    },
  };

  const suppressionChecks = Object.fromEntries(Object.keys(policy.suppression_gates).map((gate) => [gate, {
    clear: true,
    evidence_id: `fictional-evidence-${gate}`,
    checked_at: '2026-07-13T12:00:00.000Z',
  }]));
  const lead = {
    lead_id: 'fictional-production-shadow-lead-001',
    external_contact_id: 'fictional-ghl-contact-production-001',
    organization_id: '00000000-0000-4000-8000-000000000099',
    source_system: 'gohighlevel',
    phone_number: '+13035550123',
    seller,
    lead_source: 'elite-solar-web-v1',
    property_state: 'CO',
    calling_state: 'CO',
  };
  const consentEvidence = {
    consent_artifact_id: 'elite-consent-artifact-v1',
    lead_id: lead.lead_id,
    consumer_name: 'Fictional Production Test Person',
    phone_number: lead.phone_number,
    dialed_phone_number: lead.phone_number,
    seller,
    lead_source: lead.lead_source,
    source_form_version: 'elite-solar-form-v1',
    consent_disclosure_text: disclosure,
    consent_text_version: 'elite-ai-consent-v1',
    signature_evidence: 'fictional-immutable-esign-event-001',
    not_condition_of_purchase_disclosure: true,
    ai_voice_calls_authorized: true,
    telemarketing_calls_authorized: true,
    captured_at: '2026-07-13T11:59:00.000Z',
    revoked: false,
    property_state: lead.property_state,
    calling_state: lead.calling_state,
    suppression_checks: suppressionChecks,
  };
  const trustedDispatchContext = includeTrustedContext ? {
    authorization_id: 'fictional-server-shadow-authorization-001',
    authorization_scope: 'solar_exit_shadow_evaluate_only',
    trust_evidence_id: 'fictional-signed-ingest-evidence-001',
    trust_level: 'server_verified',
    issued_at: '2026-07-13T12:55:00.000Z',
    expires_at: '2026-07-13T13:05:00.000Z',
    integrity_verified: true,
    tenant_binding_verified: true,
    replay_check_clear: true,
    contact_authorized: false,
    organization_id: lead.organization_id,
    external_contact_id: lead.external_contact_id,
    source_system: lead.source_system,
    lead_id: lead.lead_id,
    destination_phone_number: lead.phone_number,
    seller: lead.seller,
    lead_source: lead.lead_source,
    consent_artifact_id: consentEvidence.consent_artifact_id,
    source_form_version: consentEvidence.source_form_version,
    consent_text_version: consentEvidence.consent_text_version,
  } : null;
  return {
    policy,
    input: {
      schema_version: '1.0.0',
      batch_id: 'fictional-production-shadow-batch-001',
      as_of: '2026-07-13T13:00:00.000Z',
      records: [{
        lead,
        consent_evidence: consentEvidence,
        trusted_dispatch_context: trustedDispatchContext,
      }],
    },
  };
}

test('canonical JSON and SHA-256 are stable across object key order', () => {
  const left = { z: 3, a: { y: true, x: ['value', 2] } };
  const right = { a: { x: ['value', 2], y: true }, z: 3 };
  assert.equal(canonicalJson(left), canonicalJson(right));
  assert.equal(sha256Canonical(left), sha256Canonical(right));
});

test('fictional offline demo is deterministic, auditable, and exactly 3 allow / 3 block', () => {
  const bundle = loadSolarExitBundle(CAMPAIGN_ROOT);
  const input = readJson(DEMO_INPUT_PATH);
  const first = evaluateSolarExitShadowBatch(input, bundle.eligibility, { mode: 'offline' });
  const second = evaluateSolarExitShadowBatch(structuredClone(input), structuredClone(bundle.eligibility), { mode: 'offline' });

  assert.deepEqual(first, second);
  assert.equal(first.batch_status, 'evaluated');
  assert.deepEqual(first.totals, { records: 6, would_call: 3, blocked: 3 });
  assert.deepEqual(
    first.production_policy_blockers,
    productionPolicyBlockers(bundle.eligibility, { asOf: input.as_of }),
  );
  assert.ok(first.production_policy_blockers.length > 0);
  assert.equal(first.production_policy_blockers_sha256, sha256Canonical(first.production_policy_blockers));
  assert.deepEqual(first.phone_pseudonymization, {
    scheme: 'synthetic-fixture-only-hmac-sha256-v1',
    key_id: 'synthetic-public-demo-key-v1',
    scope: 'organization_and_e164_phone',
    synthetic_only: true,
  });
  assert.deepEqual(first.reason_counts, {
    deny_missing_ai_voice_consent: 1,
    deny_revoked: 1,
    deny_wrong_seller: 1,
    offline_allow: 3,
  });
  assert.equal(verifySolarExitShadowReport(first), true);
  assert.ok(first.decisions.every((decision) => decision.contact_authorized === false));
  assert.ok(first.decisions.every((decision) => decision.provider_invocation_authorized === false));
  assert.ok(first.decisions.every((decision) => !Object.prototype.hasOwnProperty.call(decision, 'phone_sha256')));
  assert.ok(first.decisions.every((decision) => decision.phone_pseudonym?.synthetic_only === true));
});

test('report redacts raw contact and consent payload values', () => {
  const bundle = loadSolarExitBundle(CAMPAIGN_ROOT);
  const input = readJson(DEMO_INPUT_PATH);
  const reportText = JSON.stringify(evaluateSolarExitShadowBatch(input, bundle.eligibility, { mode: 'offline' }));

  assert.equal(reportText.includes('phone_sha256'), false);
  assert.equal(reportText.includes('batch_input_sha256'), false);
  assert.equal(reportText.includes('source_record_sha256'), false);
  assert.equal(reportText.includes('trusted_context_sha256'), false);

  for (const record of input.records) {
    assert.doesNotMatch(reportText, new RegExp(record.lead.phone_number.replace('+', '\\+')));
    assert.equal(reportText.includes(record.consent_evidence.consumer_name), false);
    assert.equal(reportText.includes(record.consent_evidence.consent_disclosure_text), false);
    assert.equal(reportText.includes(record.consent_evidence.signature_evidence), false);
  }
});

test('production fails the whole batch closed against the unresolved source policy', () => {
  const bundle = loadSolarExitBundle(CAMPAIGN_ROOT);
  const { input } = productionFixture();
  const report = evaluateSolarExitShadowBatch(input, bundle.eligibility, productionOptions());

  assert.equal(report.batch_status, 'blocked_unresolved_policy');
  assert.equal(report.policy_resolved_for_production, false);
  assert.ok(report.policy_blockers.includes('policy_version_unresolved'));
  assert.deepEqual(report.policy_blockers, report.production_policy_blockers);
  assert.equal(report.production_policy_blockers_sha256, sha256Canonical(report.production_policy_blockers));
  assert.deepEqual(report.totals, { records: 1, would_call: 0, blocked: 1 });
  assert.equal(report.decisions[0].reason_code, 'deny_unresolved_policy');
});

test('resolved production policy still fails closed without trusted dispatch context', () => {
  const { policy, input } = productionFixture({ includeTrustedContext: false });
  assert.deepEqual(productionPolicyBlockers(policy), []);
  const report = evaluateSolarExitShadowBatch(input, policy, productionOptions());

  assert.equal(report.batch_status, 'evaluated');
  assert.equal(report.decisions[0].decision, 'blocked');
  assert.equal(report.decisions[0].reason_code, 'deny_missing_trusted_context');
});

test('resolved policy plus exact trusted tenant/consent binding emits would_call but never authorizes contact', () => {
  const { policy, input } = productionFixture();
  const report = evaluateSolarExitShadowBatch(input, policy, productionOptions());

  assert.equal(report.policy_resolved_for_production, true);
  assert.deepEqual(report.production_policy_blockers, []);
  assert.deepEqual(report.policy_blockers, []);
  assert.equal(report.production_policy_blockers_sha256, sha256Canonical([]));
  assert.deepEqual(report.totals, { records: 1, would_call: 1, blocked: 0 });
  assert.equal(report.decisions[0].decision, 'would_call');
  assert.equal(report.decisions[0].reason_code, 'production_eligible');
  assert.equal(report.decisions[0].contact_authorized, false);
  assert.equal(report.decisions[0].provider_invocation_authorized, false);
  assert.deepEqual(report.phone_pseudonymization, {
    scheme: 'hmac-sha256-v1',
    key_id: PRODUCTION_PHONE_HMAC_KEY_ID,
    scope: 'organization_and_e164_phone',
    synthetic_only: false,
  });
  assert.equal(report.decisions[0].phone_pseudonym.key_id, PRODUCTION_PHONE_HMAC_KEY_ID);
  assert.equal(report.decisions[0].phone_pseudonym.scheme, 'hmac-sha256-v1');
  assert.match(report.decisions[0].phone_pseudonym.value, /^[0-9a-f]{64}$/);
  const expectedPhonePseudonym = createHmac('sha256', PRODUCTION_PHONE_HMAC_KEY)
    .update('dial-smart:solar-exit:phone-pseudonym:v1\0', 'utf8')
    .update(PRODUCTION_PHONE_HMAC_KEY_ID, 'utf8')
    .update('\0', 'utf8')
    .update(input.records[0].lead.organization_id, 'utf8')
    .update('\0', 'utf8')
    .update(input.records[0].lead.phone_number, 'utf8')
    .digest('hex');
  assert.equal(report.decisions[0].phone_pseudonym.value, expectedPhonePseudonym);
  assert.notEqual(report.decisions[0].phone_pseudonym.value, sha256Canonical(input.records[0].lead.phone_number));
  assert.equal(Object.prototype.hasOwnProperty.call(report.decisions[0], 'phone_sha256'), false);
  assert.equal(report.batch_input_fingerprint.key_id, PRODUCTION_PHONE_HMAC_KEY_ID);
  assert.equal(report.decisions[0].source_record_fingerprint.key_id, PRODUCTION_PHONE_HMAC_KEY_ID);
  assert.equal(report.decisions[0].trusted_context_fingerprint.key_id, PRODUCTION_PHONE_HMAC_KEY_ID);
  assert.equal(Object.prototype.hasOwnProperty.call(report, 'batch_input_sha256'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(report.decisions[0], 'source_record_sha256'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(report.decisions[0], 'trusted_context_sha256'), false);
  assert.equal(JSON.stringify(report).includes(PRODUCTION_PHONE_HMAC_KEY.toString('hex')), false);
  assert.equal(JSON.stringify(report).includes(PRODUCTION_PHONE_HMAC_KEY.toString('base64')), false);
  assert.equal(verifySolarExitShadowReport(report), true);
});

test('production phone pseudonyms require strong external key bytes and are tenant/key scoped', () => {
  const { policy, input } = productionFixture();
  assert.throws(
    () => evaluateSolarExitShadowBatch(input, policy, { mode: 'production' }),
    /requires phone HMAC key bytes/,
  );
  assert.throws(
    () => evaluateSolarExitShadowBatch(input, policy, productionOptions({ phoneHmacKey: Buffer.alloc(32, 0) })),
    /entropy sanity check/,
  );
  assert.throws(
    () => evaluateSolarExitShadowBatch(input, policy, productionOptions({ phoneHmacKeyId: 'demo-key-v1' })),
    /must not be labeled synthetic, demo, or test/,
  );
  assert.throws(
    () => evaluateSolarExitShadowBatch(input, policy, { mode: 'offline', phoneHmacKey: PRODUCTION_PHONE_HMAC_KEY }),
    /does not accept production key material/,
  );

  const first = evaluateSolarExitShadowBatch(input, policy, productionOptions());
  const otherTenantInput = structuredClone(input);
  otherTenantInput.records[0].lead.organization_id = '00000000-0000-4000-8000-000000000100';
  otherTenantInput.records[0].trusted_dispatch_context.organization_id = otherTenantInput.records[0].lead.organization_id;
  const otherTenant = evaluateSolarExitShadowBatch(otherTenantInput, policy, productionOptions());
  assert.notEqual(first.decisions[0].phone_pseudonym.value, otherTenant.decisions[0].phone_pseudonym.value);

  const rotatedKey = createHash('sha256').update('rotated-private-fixture-key-material-v2', 'utf8').digest();
  const rotated = evaluateSolarExitShadowBatch(input, policy, productionOptions({
    phoneHmacKey: rotatedKey,
    phoneHmacKeyId: 'shadow-key-rotation-v2',
  }));
  assert.notEqual(first.decisions[0].phone_pseudonym.value, rotated.decisions[0].phone_pseudonym.value);
});

test('self-asserted contact permission, tenant drift, and consent drift are denied', () => {
  const base = productionFixture();
  const contactAuthorized = structuredClone(base.input);
  contactAuthorized.records[0].trusted_dispatch_context.contact_authorized = true;
  assert.equal(
    evaluateSolarExitShadowBatch(contactAuthorized, base.policy, productionOptions()).decisions[0].reason_code,
    'deny_untrusted_context',
  );

  const tenantDrift = structuredClone(base.input);
  tenantDrift.records[0].trusted_dispatch_context.organization_id = '00000000-0000-4000-8000-000000000100';
  assert.equal(
    evaluateSolarExitShadowBatch(tenantDrift, base.policy, productionOptions()).decisions[0].reason_code,
    'deny_trusted_lead_binding_mismatch',
  );

  const consentDrift = structuredClone(base.input);
  consentDrift.records[0].consent_evidence.consent_text_version = 'different-version';
  assert.equal(
    evaluateSolarExitShadowBatch(consentDrift, base.policy, productionOptions()).decisions[0].reason_code,
    'deny_trusted_consent_binding_mismatch',
  );
});

test('duplicate lead identity in one batch blocks every duplicate deterministically', () => {
  const { policy, input } = productionFixture();
  input.records.push(structuredClone(input.records[0]));
  const report = evaluateSolarExitShadowBatch(input, policy, productionOptions());

  assert.deepEqual(report.totals, { records: 2, would_call: 0, blocked: 2 });
  assert.ok(report.decisions.every((decision) => decision.reason_code === 'deny_duplicate_batch_identity'));
  assert.notEqual(report.decisions[0].decision_id, report.decisions[1].decision_id);
});

test('whole-report and decision hashes detect tampering', () => {
  const bundle = loadSolarExitBundle(CAMPAIGN_ROOT);
  const report = evaluateSolarExitShadowBatch(readJson(DEMO_INPUT_PATH), bundle.eligibility, { mode: 'offline' });
  assert.equal(verifySolarExitShadowReport(report), true);

  const changedDecision = structuredClone(report);
  changedDecision.decisions[0].decision = 'blocked';
  assert.equal(verifySolarExitShadowReport(changedDecision), false);

  const changedAggregate = structuredClone(report);
  changedAggregate.totals.would_call = 999;
  assert.equal(verifySolarExitShadowReport(changedAggregate), false);

  const changedProductionBlocker = structuredClone(report);
  changedProductionBlocker.production_policy_blockers.push('tampered_policy_blocker');
  const changedProductionBlockerWithoutHash = { ...changedProductionBlocker };
  delete changedProductionBlockerWithoutHash.report_sha256;
  changedProductionBlocker.report_sha256 = sha256Canonical(changedProductionBlockerWithoutHash);
  assert.equal(verifySolarExitShadowReport(changedProductionBlocker), false);

  assert.doesNotThrow(() => verifySolarExitShadowReport({ ...report, decisions: [undefined] }));
  assert.equal(verifySolarExitShadowReport({ ...report, decisions: [undefined] }), false);

  const legacyPhoneHash = structuredClone(report);
  legacyPhoneHash.decisions[0].phone_sha256 = 'a'.repeat(64);
  legacyPhoneHash.decisions_sha256 = sha256Canonical(legacyPhoneHash.decisions);
  const legacyWithoutReportHash = { ...legacyPhoneHash };
  delete legacyWithoutReportHash.report_sha256;
  legacyPhoneHash.report_sha256 = sha256Canonical(legacyWithoutReportHash);
  assert.equal(verifySolarExitShadowReport(legacyPhoneHash), false);

  const mismatchedPseudonymKeyId = structuredClone(report);
  mismatchedPseudonymKeyId.decisions[0].phone_pseudonym.key_id = 'different-key-id';
  mismatchedPseudonymKeyId.decisions_sha256 = sha256Canonical(mismatchedPseudonymKeyId.decisions);
  const mismatchWithoutReportHash = { ...mismatchedPseudonymKeyId };
  delete mismatchWithoutReportHash.report_sha256;
  mismatchedPseudonymKeyId.report_sha256 = sha256Canonical(mismatchWithoutReportHash);
  assert.equal(verifySolarExitShadowReport(mismatchedPseudonymKeyId), false);
});

test('library and CLI capability graph excludes provider, database, network, and file-write APIs', () => {
  const files = [
    resolve(REPOSITORY_ROOT, 'scripts/lib/solar-exit-shadow-evaluator.mjs'),
    resolve(REPOSITORY_ROOT, 'scripts/evaluate-solar-exit-shadow.mjs'),
    resolve(REPOSITORY_ROOT, 'scripts/lib/solar-exit-bundle.mjs'),
  ];
  const forbidden = /node:(?:http|https|net|tls)|@supabase|\bfetch\s*\(|XMLHttpRequest|WebSocket|writeFile(?:Sync)?|appendFile(?:Sync)?|createWriteStream|Deno\./;
  for (const file of files) assert.doesNotMatch(readFileSync(file, 'utf8'), forbidden, file);
});

test('offline CLI emits only JSON on stdout and performs the fictional demo', () => {
  const result = spawnSync(process.execPath, [
    'scripts/evaluate-solar-exit-shadow.mjs',
    '--mode', 'offline',
    '--input', 'scripts/test-fixtures/solar-exit-shadow-demo-input.json',
    '--compact',
  ], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    env: {},
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.totals, { records: 6, would_call: 3, blocked: 3 });
  assert.equal(verifySolarExitShadowReport(report), true);
});

test('production CLI against immutable source policy emits a blocked report and exits 2', () => {
  const { input } = productionFixture();
  const tempInputPath = resolve(REPOSITORY_ROOT, 'scripts/test-fixtures/solar-exit-shadow-demo-input.json');
  const secretDirectory = mkdtempSync(resolve(tmpdir(), 'solar-exit-shadow-hmac-'));
  const secretPath = resolve(secretDirectory, 'phone-hmac-key.bin');
  writeFileSync(secretPath, PRODUCTION_PHONE_HMAC_KEY, { mode: 0o600 });
  assert.ok(input.records.length > 0);
  try {
    const result = spawnSync(process.execPath, [
      'scripts/evaluate-solar-exit-shadow.mjs',
      '--mode', 'production',
      '--input', tempInputPath,
      '--phone-hmac-key-file', secretPath,
      '--phone-hmac-key-id', PRODUCTION_PHONE_HMAC_KEY_ID,
      '--compact',
    ], {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
      env: {},
    });

    assert.equal(result.status, 2, result.stderr);
    assert.equal(result.stderr, '');
    assert.equal(result.stdout.includes(PRODUCTION_PHONE_HMAC_KEY.toString('hex')), false);
    assert.equal(result.stdout.includes(PRODUCTION_PHONE_HMAC_KEY.toString('base64')), false);
    const report = JSON.parse(result.stdout);
    assert.equal(report.batch_status, 'blocked_unresolved_policy');
    assert.equal(report.phone_pseudonymization.key_id, PRODUCTION_PHONE_HMAC_KEY_ID);
    assert.equal(report.totals.would_call, 0);
    assert.ok(report.decisions.every((decision) => decision.reason_code === 'deny_unresolved_policy'));
    assert.ok(report.decisions.every((decision) => !Object.prototype.hasOwnProperty.call(decision, 'phone_sha256')));
  } finally {
    rmSync(secretDirectory, { recursive: true, force: true });
  }
});

test('production CLI fails before evaluation without an external key file and rejects key bytes as an argument', () => {
  const missingKey = spawnSync(process.execPath, [
    'scripts/evaluate-solar-exit-shadow.mjs',
    '--mode', 'production',
    '--input', 'scripts/test-fixtures/solar-exit-shadow-demo-input.json',
    '--compact',
  ], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    env: {},
  });
  assert.equal(missingKey.status, 1);
  assert.equal(missingKey.stdout, '');
  assert.match(missingKey.stderr, /requires --phone-hmac-key-file and --phone-hmac-key-id/);

  const rawKeyArgument = spawnSync(process.execPath, [
    'scripts/evaluate-solar-exit-shadow.mjs',
    '--mode', 'production',
    '--input', 'scripts/test-fixtures/solar-exit-shadow-demo-input.json',
    '--phone-hmac-key', 'must-not-be-accepted',
  ], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    env: {},
  });
  assert.equal(rawKeyArgument.status, 1);
  assert.equal(rawKeyArgument.stdout, '');
  assert.match(rawKeyArgument.stderr, /Unknown argument: --phone-hmac-key/);

  const repositoryKeyFile = spawnSync(process.execPath, [
    'scripts/evaluate-solar-exit-shadow.mjs',
    '--mode', 'production',
    '--input', 'scripts/test-fixtures/solar-exit-shadow-demo-input.json',
    '--phone-hmac-key-file', 'scripts/test-fixtures/solar-exit-shadow-demo-input.json',
    '--phone-hmac-key-id', PRODUCTION_PHONE_HMAC_KEY_ID,
  ], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    env: {},
  });
  assert.equal(repositoryKeyFile.status, 1);
  assert.equal(repositoryKeyFile.stdout, '');
  assert.match(repositoryKeyFile.stderr, /must be stored outside the repository/);
});

test('mode and explicit audit timestamp are mandatory', () => {
  const bundle = loadSolarExitBundle(CAMPAIGN_ROOT);
  const input = readJson(DEMO_INPUT_PATH);
  assert.throws(() => evaluateSolarExitShadowBatch(input, bundle.eligibility), /mode must be explicitly set/);
  delete input.as_of;
  assert.throws(() => evaluateSolarExitShadowBatch(input, bundle.eligibility, { mode: 'offline' }), /as_of/);
});
