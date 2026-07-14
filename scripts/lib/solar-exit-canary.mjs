import { createHash } from 'node:crypto';

export const SOLAR_EXIT_CANARY_SCHEMA_VERSION = '1.0.0';
export const SOLAR_EXIT_CANARY_EVALUATOR_VERSION = '1.0.0';

export const SOLAR_EXIT_CANARY_TEMPLATE_STAGES = Object.freeze({
  owned_phone_20: 'owned_phone',
  live_5: 'canary_5',
  live_20: 'canary_20',
  live_50: 'canary_50',
});

export const SOLAR_EXIT_CANARY_POLICY = Object.freeze({
  stages: Object.freeze({
    owned_phone: Object.freeze({ sample_size: 20, population: 'owned_phone', previous: null, next: 'canary_5' }),
    canary_5: Object.freeze({ sample_size: 5, population: 'consented_real_lead', previous: 'owned_phone', next: 'canary_20' }),
    canary_20: Object.freeze({ sample_size: 20, population: 'consented_real_lead', previous: 'canary_5', next: 'canary_50' }),
    canary_50: Object.freeze({ sample_size: 50, population: 'consented_real_lead', previous: 'canary_20', next: 'normal' }),
  }),
  thresholds: Object.freeze({
    webhook_match_rate_min: 1,
    webhook_mismatch_rate_max: 0,
    webhook_terminal_latency_p100_max_ms: 60_000,
    reconciliation_match_rate_min: 1,
    reconciliation_mismatch_rate_max: 0,
    reconciliation_latency_p100_max_ms: 300_000,
    billing_match_rate_min: 1,
    billing_total_absolute_variance_microunits_max: 0,
    ghl_shadow_match_rate_min: 1,
    ghl_shadow_mismatch_rate_max: 0,
  }),
});

const ROOT_KEYS = ['schema_version', 'evaluator_version', 'campaign_binding', 'cohort', 'prior_stage_certificate', 'review', 'results'];
const BINDING_KEYS = [
  'bundle_id', 'bundle_version', 'manifest_sha256', 'bundle_sha256', 'organization_id', 'ghl_location_id',
  'provider', 'provider_agent_id', 'provider_agent_version', 'provider_llm_id', 'provider_llm_version',
  'prompt_sha256', 'eligibility_policy_sha256', 'disposition_policy_sha256',
];
const COHORT_KEYS = ['stage', 'run_id', 'expected_sample_size', 'operator_principal_id', 'started_at', 'completed_at'];
const REVIEW_KEYS = [
  'principal_id', 'display_name', 'role', 'reviewed_at', 'decision', 'evidence_id', 'evidence_sha256',
  'bound_evidence_sha256', 'campaign_binding',
];
const RESULT_KEYS = [
  'ordinal', 'call_id', 'lead_id', 'provider_call_id', 'population', 'started_at', 'completed_at',
  'campaign_binding', 'observed_identity', 'preflight', 'hard_failures', 'metrics', 'evidence',
];
const IDENTITY_KEYS = [
  'provider', 'provider_agent_id', 'provider_agent_version', 'provider_llm_id', 'provider_llm_version',
  'organization_id', 'ghl_location_id',
];
const PREFLIGHT_KEYS = [
  'exact_consent_verified', 'consent_unrevoked', 'company_dnc_clear', 'national_dnc_clear',
  'state_dnc_clear', 'reassigned_number_clear', 'phone_ownership_clear', 'prior_opt_out_clear',
  'wrong_number_clear', 'complaint_quarantine_clear', 'global_stop_clear', 'jurisdiction_clear',
  'calling_window_clear',
];
const HARD_FAILURE_KEYS = [
  'dnc_violation', 'consent_violation', 'wrong_tenant', 'duplicate_call',
  'provider_identity_mismatch', 'global_stop_violation',
];
const METRIC_KEYS = [
  'webhook_events_expected', 'webhook_events_matched', 'webhook_mismatches', 'webhook_terminal_latency_ms',
  'reconciliation_records_expected', 'reconciliation_records_matched', 'reconciliation_mismatches',
  'reconciliation_latency_ms', 'billing_expected_microunits', 'billing_observed_microunits',
  'ghl_shadow_records_expected', 'ghl_shadow_records_matched', 'ghl_shadow_mismatches',
];
const EVIDENCE_KEYS = [
  'call_evidence_id', 'call_evidence_sha256', 'consent_evidence_id', 'consent_evidence_sha256',
  'suppression_evidence_id', 'suppression_evidence_sha256', 'webhook_evidence_id', 'webhook_evidence_sha256',
  'reconciliation_evidence_id', 'reconciliation_evidence_sha256', 'billing_evidence_id',
  'billing_evidence_sha256', 'ghl_evidence_id', 'ghl_evidence_sha256',
];
const CERTIFICATE_KEYS = [
  'schema_version', 'certificate_type', 'evaluator_version', 'certificate_id', 'decision', 'stage', 'next_stage',
  'run_id', 'sample_size', 'issued_at', 'input_sha256', 'evidence_sha256', 'bound_evidence_sha256',
  'reviewer_principal_id', 'campaign_binding', 'authorization_scope', 'contact_authorized',
  'launch_authorized', 'external_trust_required',
];
const REVIEW_ROLES = new Set(['quality_assurance', 'operations_release_owner', 'compliance_or_counsel']);
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{2,127}$/;
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function canonicalJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Canonical JSON cannot encode a non-finite number.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (!isPlainObject(value)) throw new TypeError('Canonical JSON accepts only JSON objects, arrays, and primitives.');
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function sha256(value) {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

const TEMPLATE_HASH = '0'.repeat(64);
const TEMPLATE_STARTED_AT = '2000-01-01T00:00:00.000Z';
const TEMPLATE_COMPLETED_AT = '2000-01-02T00:00:00.000Z';
const TEMPLATE_REVIEWED_AT = '2000-01-03T00:00:00.000Z';

function buildTemplateBinding() {
  return {
    bundle_id: 'replace-bundle-id',
    bundle_version: 'replace-bundle-version',
    manifest_sha256: TEMPLATE_HASH,
    bundle_sha256: TEMPLATE_HASH,
    organization_id: 'replace-organization-id',
    ghl_location_id: 'replace-ghl-location-id',
    provider: 'retell',
    provider_agent_id: 'replace-retell-agent-id',
    provider_agent_version: 0,
    provider_llm_id: 'replace-retell-llm-id',
    provider_llm_version: 0,
    prompt_sha256: TEMPLATE_HASH,
    eligibility_policy_sha256: TEMPLATE_HASH,
    disposition_policy_sha256: TEMPLATE_HASH,
  };
}

function buildTemplatePriorCertificate(stage, binding) {
  const previous = SOLAR_EXIT_CANARY_POLICY.stages[stage].previous;
  if (previous === null) return null;
  const inputDigest = sha256({ template_only: true, stage: previous, campaign_binding: binding });
  return {
    schema_version: SOLAR_EXIT_CANARY_SCHEMA_VERSION,
    certificate_type: 'solar_exit_canary_promotion',
    evaluator_version: SOLAR_EXIT_CANARY_EVALUATOR_VERSION,
    certificate_id: `solar-exit-${previous}-${inputDigest.slice(0, 24)}`,
    decision: 'promote',
    stage: previous,
    next_stage: stage,
    run_id: `replace-prior-${previous}-run-id`,
    sample_size: SOLAR_EXIT_CANARY_POLICY.stages[previous].sample_size,
    issued_at: TEMPLATE_STARTED_AT,
    input_sha256: inputDigest,
    evidence_sha256: TEMPLATE_HASH,
    bound_evidence_sha256: TEMPLATE_HASH,
    reviewer_principal_id: 'replace-prior-reviewer-principal-id',
    campaign_binding: structuredClone(binding),
    authorization_scope: 'evidence_chain_only',
    contact_authorized: false,
    launch_authorized: false,
    external_trust_required: true,
  };
}

function buildTemplateResult(stage, binding, index) {
  const suffix = String(index + 1).padStart(3, '0');
  const population = SOLAR_EXIT_CANARY_POLICY.stages[stage].population;
  return {
    ordinal: index + 1,
    call_id: `replace-call-${suffix}`,
    lead_id: `replace-lead-${suffix}`,
    provider_call_id: `replace-provider-call-${suffix}`,
    population,
    started_at: TEMPLATE_STARTED_AT,
    completed_at: TEMPLATE_COMPLETED_AT,
    campaign_binding: structuredClone(binding),
    observed_identity: {
      provider: binding.provider,
      provider_agent_id: binding.provider_agent_id,
      provider_agent_version: binding.provider_agent_version,
      provider_llm_id: binding.provider_llm_id,
      provider_llm_version: binding.provider_llm_version,
      organization_id: binding.organization_id,
      ghl_location_id: binding.ghl_location_id,
    },
    preflight: Object.fromEntries(PREFLIGHT_KEYS.map((key) => [key, false])),
    hard_failures: Object.fromEntries(HARD_FAILURE_KEYS.map((key) => [key, false])),
    metrics: {
      webhook_events_expected: 1,
      webhook_events_matched: 0,
      webhook_mismatches: 0,
      webhook_terminal_latency_ms: 0,
      reconciliation_records_expected: 1,
      reconciliation_records_matched: 0,
      reconciliation_mismatches: 0,
      reconciliation_latency_ms: 0,
      billing_expected_microunits: 0,
      billing_observed_microunits: 0,
      ghl_shadow_records_expected: 1,
      ghl_shadow_records_matched: 0,
      ghl_shadow_mismatches: 0,
    },
    evidence: Object.fromEntries(EVIDENCE_KEYS.map((key) => [
      key,
      key.endsWith('_sha256') ? TEMPLATE_HASH : `replace-${key.replaceAll('_', '-')}-${suffix}`,
    ])),
  };
}

/**
 * Returns a complete, deterministic, schema-valid evidence form. Every template is intentionally
 * held: preflight facts are false, evidence hashes are placeholders, metrics are unmatched, and
 * the reviewer decision is hold. Generating a template cannot authorize contact or launch.
 */
export function buildSolarExitCanaryTemplate(templateName) {
  const stage = SOLAR_EXIT_CANARY_TEMPLATE_STAGES[templateName];
  if (!stage) {
    throw new TypeError(`Unknown template ${String(templateName)}. Expected one of: ${Object.keys(SOLAR_EXIT_CANARY_TEMPLATE_STAGES).join(', ')}.`);
  }
  const policy = SOLAR_EXIT_CANARY_POLICY.stages[stage];
  const binding = buildTemplateBinding();
  const input = {
    schema_version: SOLAR_EXIT_CANARY_SCHEMA_VERSION,
    evaluator_version: SOLAR_EXIT_CANARY_EVALUATOR_VERSION,
    campaign_binding: binding,
    cohort: {
      stage,
      run_id: `replace-${stage}-run-id`,
      expected_sample_size: policy.sample_size,
      operator_principal_id: 'replace-operator-principal-id',
      started_at: TEMPLATE_STARTED_AT,
      completed_at: TEMPLATE_COMPLETED_AT,
    },
    prior_stage_certificate: buildTemplatePriorCertificate(stage, binding),
    review: {
      principal_id: 'replace-reviewer-principal-id',
      display_name: 'Replace With Accountable Reviewer',
      role: 'quality_assurance',
      reviewed_at: TEMPLATE_REVIEWED_AT,
      decision: 'hold',
      evidence_id: `replace-${stage}-review-evidence-id`,
      evidence_sha256: TEMPLATE_HASH,
      bound_evidence_sha256: TEMPLATE_HASH,
      campaign_binding: structuredClone(binding),
    },
    results: Array.from({ length: policy.sample_size }, (_, index) => buildTemplateResult(stage, binding, index)),
  };
  input.review.bound_evidence_sha256 = computeCanaryEvidenceDigest(input);
  return input;
}

export function computeCanaryEvidenceDigest(input) {
  if (!isPlainObject(input)) throw new TypeError('Canary input must be an object.');
  return sha256({
    schema_version: input.schema_version,
    evaluator_version: input.evaluator_version,
    campaign_binding: input.campaign_binding,
    cohort: input.cohort,
    prior_stage_certificate: input.prior_stage_certificate,
    results: input.results,
  });
}

export function computeCanaryInputDigest(input) {
  return sha256(input);
}

function addIssue(issues, category, code, path, message) {
  issues.push({ category, code, path, message });
}

function exactObject(value, path, keys, issues) {
  if (!isPlainObject(value)) {
    addIssue(issues, 'schema', 'OBJECT_REQUIRED', path, 'An exact JSON object is required.');
    return false;
  }
  const allowed = new Set(keys);
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) addIssue(issues, 'schema', 'MISSING_FIELD', `${path}.${key}`, 'Required field is missing.');
  }
  for (const key of Object.keys(value).sort()) {
    if (!allowed.has(key)) addIssue(issues, 'schema', 'EXTRA_FIELD', `${path}.${key}`, 'Unknown fields are rejected.');
  }
  return true;
}

function validId(value) {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

function validHash(value) {
  return typeof value === 'string' && HASH_PATTERN.test(value);
}

function validIso(value) {
  return typeof value === 'string' && ISO_PATTERN.test(value) && !Number.isNaN(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function requireId(value, path, issues) {
  if (!validId(value)) addIssue(issues, 'schema', 'INVALID_ID', path, 'Expected a stable 3-128 character identifier.');
}

function requireHash(value, path, issues) {
  if (!validHash(value)) addIssue(issues, 'schema', 'INVALID_SHA256', path, 'Expected a lowercase 64-character SHA-256 digest.');
}

function requireIso(value, path, issues) {
  if (!validIso(value)) addIssue(issues, 'schema', 'INVALID_TIMESTAMP', path, 'Expected canonical UTC ISO-8601 with milliseconds.');
}

function requireNonNegativeInteger(value, path, issues) {
  if (!Number.isSafeInteger(value) || value < 0) addIssue(issues, 'schema', 'INVALID_INTEGER', path, 'Expected a non-negative safe integer.');
}

function sameJson(left, right) {
  try { return canonicalJson(left) === canonicalJson(right); } catch { return false; }
}

function validateCampaignBinding(binding, path, issues) {
  if (!exactObject(binding, path, BINDING_KEYS, issues)) return;
  for (const key of ['bundle_id', 'bundle_version', 'organization_id', 'ghl_location_id', 'provider_agent_id', 'provider_llm_id']) {
    requireId(binding[key], `${path}.${key}`, issues);
  }
  for (const key of ['manifest_sha256', 'bundle_sha256', 'prompt_sha256', 'eligibility_policy_sha256', 'disposition_policy_sha256']) {
    requireHash(binding[key], `${path}.${key}`, issues);
  }
  if (binding.provider !== 'retell') addIssue(issues, 'schema', 'INVALID_PROVIDER', `${path}.provider`, 'Only the certified Retell lane is accepted.');
  requireNonNegativeInteger(binding.provider_agent_version, `${path}.provider_agent_version`, issues);
  requireNonNegativeInteger(binding.provider_llm_version, `${path}.provider_llm_version`, issues);
}

function validatePriorCertificate(certificate, stage, binding, issues) {
  const policy = SOLAR_EXIT_CANARY_POLICY.stages[stage];
  if (!policy) return;
  if (policy.previous === null) {
    if (certificate !== null) addIssue(issues, 'schema', 'UNEXPECTED_PRIOR_CERTIFICATE', '$.prior_stage_certificate', 'Owned-phone certification starts the chain and requires null.');
    return;
  }
  if (!exactObject(certificate, '$.prior_stage_certificate', CERTIFICATE_KEYS, issues)) return;
  const path = '$.prior_stage_certificate';
  if (certificate.schema_version !== SOLAR_EXIT_CANARY_SCHEMA_VERSION) addIssue(issues, 'schema', 'CERTIFICATE_SCHEMA_MISMATCH', `${path}.schema_version`, 'Prior certificate schema is not supported.');
  if (certificate.certificate_type !== 'solar_exit_canary_promotion') addIssue(issues, 'schema', 'CERTIFICATE_TYPE_MISMATCH', `${path}.certificate_type`, 'Prior certificate type is invalid.');
  if (
    certificate.authorization_scope !== 'evidence_chain_only' ||
    certificate.contact_authorized !== false ||
    certificate.launch_authorized !== false ||
    certificate.external_trust_required !== true
  ) {
    addIssue(issues, 'schema', 'CERTIFICATE_AUTHORITY_MISMATCH', path, 'A canary certificate is evidence-chain input only and can never authorize contact or launch.');
  }
  if (certificate.evaluator_version !== SOLAR_EXIT_CANARY_EVALUATOR_VERSION) addIssue(issues, 'schema', 'CERTIFICATE_EVALUATOR_MISMATCH', `${path}.evaluator_version`, 'Prior certificate evaluator version is not pinned to this evaluator.');
  if (certificate.stage !== policy.previous || certificate.next_stage !== stage || certificate.decision !== 'promote') {
    addIssue(issues, 'schema', 'BROKEN_PROMOTION_CHAIN', path, `Expected a promote certificate from ${policy.previous} to ${stage}.`);
  }
  if (certificate.sample_size !== SOLAR_EXIT_CANARY_POLICY.stages[policy.previous].sample_size) addIssue(issues, 'schema', 'PRIOR_SAMPLE_SIZE_MISMATCH', `${path}.sample_size`, 'Prior certificate sample size is not exact.');
  for (const key of ['certificate_id', 'run_id', 'reviewer_principal_id']) requireId(certificate[key], `${path}.${key}`, issues);
  for (const key of ['input_sha256', 'evidence_sha256', 'bound_evidence_sha256']) requireHash(certificate[key], `${path}.${key}`, issues);
  requireIso(certificate.issued_at, `${path}.issued_at`, issues);
  validateCampaignBinding(certificate.campaign_binding, `${path}.campaign_binding`, issues);
  if (!sameJson(certificate.campaign_binding, binding)) addIssue(issues, 'schema', 'PRIOR_VERSION_BINDING_MISMATCH', `${path}.campaign_binding`, 'Prior certificate is bound to a different campaign/provider version.');
  if (validHash(certificate.input_sha256)) {
    const expectedId = `solar-exit-${certificate.stage}-${certificate.input_sha256.slice(0, 24)}`;
    if (certificate.certificate_id !== expectedId) addIssue(issues, 'schema', 'CERTIFICATE_ID_MISMATCH', `${path}.certificate_id`, 'Prior certificate ID does not match its input digest.');
  }
}

function validateInput(input) {
  const issues = [];
  if (!exactObject(input, '$', ROOT_KEYS, issues)) return issues;
  if (input.schema_version !== SOLAR_EXIT_CANARY_SCHEMA_VERSION) addIssue(issues, 'schema', 'SCHEMA_VERSION_MISMATCH', '$.schema_version', 'Unsupported canary results schema.');
  if (input.evaluator_version !== SOLAR_EXIT_CANARY_EVALUATOR_VERSION) addIssue(issues, 'schema', 'EVALUATOR_VERSION_MISMATCH', '$.evaluator_version', 'Input must pin the exact evaluator version.');
  validateCampaignBinding(input.campaign_binding, '$.campaign_binding', issues);

  const cohortIsObject = exactObject(input.cohort, '$.cohort', COHORT_KEYS, issues);
  const stage = cohortIsObject && typeof input.cohort.stage === 'string' ? input.cohort.stage : null;
  const stagePolicy = SOLAR_EXIT_CANARY_POLICY.stages[stage];
  if (!stagePolicy) addIssue(issues, 'schema', 'UNKNOWN_STAGE', '$.cohort.stage', 'Stage must be owned_phone, canary_5, canary_20, or canary_50.');
  if (cohortIsObject) {
    requireId(input.cohort.run_id, '$.cohort.run_id', issues);
    requireId(input.cohort.operator_principal_id, '$.cohort.operator_principal_id', issues);
    requireIso(input.cohort.started_at, '$.cohort.started_at', issues);
    requireIso(input.cohort.completed_at, '$.cohort.completed_at', issues);
    requireNonNegativeInteger(input.cohort.expected_sample_size, '$.cohort.expected_sample_size', issues);
    if (stagePolicy && input.cohort.expected_sample_size !== stagePolicy.sample_size) addIssue(issues, 'schema', 'EXPECTED_SAMPLE_SIZE_MISMATCH', '$.cohort.expected_sample_size', `Stage ${stage} requires exactly ${stagePolicy.sample_size} results.`);
    if (validIso(input.cohort.started_at) && validIso(input.cohort.completed_at) && input.cohort.started_at > input.cohort.completed_at) addIssue(issues, 'schema', 'INVALID_RUN_WINDOW', '$.cohort', 'Run completion must not precede its start.');
  }
  validatePriorCertificate(input.prior_stage_certificate, stage, input.campaign_binding, issues);

  if (!Array.isArray(input.results)) {
    addIssue(issues, 'schema', 'ARRAY_REQUIRED', '$.results', 'Results must be an array.');
  } else {
    if (stagePolicy && input.results.length !== stagePolicy.sample_size) addIssue(issues, 'schema', 'ACTUAL_SAMPLE_SIZE_MISMATCH', '$.results', `Exactly ${stagePolicy.sample_size} results are required; received ${input.results.length}.`);
    input.results.forEach((result, index) => {
      const path = `$.results[${index}]`;
      if (!exactObject(result, path, RESULT_KEYS, issues)) return;
      if (result.ordinal !== index + 1) addIssue(issues, 'schema', 'INVALID_ORDINAL', `${path}.ordinal`, 'Ordinals must be contiguous, unique, and in array order starting at 1.');
      for (const key of ['call_id', 'lead_id', 'provider_call_id']) requireId(result[key], `${path}.${key}`, issues);
      if (stagePolicy && result.population !== stagePolicy.population) addIssue(issues, 'schema', 'POPULATION_MISMATCH', `${path}.population`, `Stage ${stage} requires ${stagePolicy.population}.`);
      requireIso(result.started_at, `${path}.started_at`, issues);
      requireIso(result.completed_at, `${path}.completed_at`, issues);
      if (validIso(result.started_at) && validIso(result.completed_at) && result.started_at > result.completed_at) addIssue(issues, 'schema', 'INVALID_CALL_WINDOW', path, 'Call completion must not precede its start.');
      if (cohortIsObject && validIso(result.started_at) && validIso(input.cohort.started_at) && result.started_at < input.cohort.started_at) addIssue(issues, 'schema', 'CALL_OUTSIDE_RUN', `${path}.started_at`, 'Call started before the cohort window.');
      if (cohortIsObject && validIso(result.completed_at) && validIso(input.cohort.completed_at) && result.completed_at > input.cohort.completed_at) addIssue(issues, 'schema', 'CALL_OUTSIDE_RUN', `${path}.completed_at`, 'Call completed after the cohort window.');
      validateCampaignBinding(result.campaign_binding, `${path}.campaign_binding`, issues);
      if (!sameJson(result.campaign_binding, input.campaign_binding)) addIssue(issues, 'schema', 'RESULT_VERSION_BINDING_MISMATCH', `${path}.campaign_binding`, 'Result is bound to a different campaign/provider version.');

      if (exactObject(result.observed_identity, `${path}.observed_identity`, IDENTITY_KEYS, issues)) {
        for (const key of ['provider', 'provider_agent_id', 'provider_llm_id', 'organization_id', 'ghl_location_id']) requireId(result.observed_identity[key], `${path}.observed_identity.${key}`, issues);
        requireNonNegativeInteger(result.observed_identity.provider_agent_version, `${path}.observed_identity.provider_agent_version`, issues);
        requireNonNegativeInteger(result.observed_identity.provider_llm_version, `${path}.observed_identity.provider_llm_version`, issues);
      }
      if (exactObject(result.preflight, `${path}.preflight`, PREFLIGHT_KEYS, issues)) {
        for (const key of PREFLIGHT_KEYS) if (typeof result.preflight[key] !== 'boolean') addIssue(issues, 'schema', 'BOOLEAN_REQUIRED', `${path}.preflight.${key}`, 'Expected a boolean.');
      }
      if (exactObject(result.hard_failures, `${path}.hard_failures`, HARD_FAILURE_KEYS, issues)) {
        for (const key of HARD_FAILURE_KEYS) if (typeof result.hard_failures[key] !== 'boolean') addIssue(issues, 'schema', 'BOOLEAN_REQUIRED', `${path}.hard_failures.${key}`, 'Expected a boolean.');
      }
      if (exactObject(result.metrics, `${path}.metrics`, METRIC_KEYS, issues)) {
        for (const key of METRIC_KEYS) requireNonNegativeInteger(result.metrics[key], `${path}.metrics.${key}`, issues);
        for (const prefix of ['webhook_events', 'reconciliation_records', 'ghl_shadow_records']) {
          if (result.metrics[`${prefix}_expected`] !== 1) addIssue(issues, 'schema', 'INVALID_EXPECTED_METRIC_COUNT', `${path}.metrics.${prefix}_expected`, 'Every call must have exactly one canonical comparison target.');
          if (Number.isSafeInteger(result.metrics[`${prefix}_matched`]) && result.metrics[`${prefix}_matched`] > 1) addIssue(issues, 'schema', 'MATCH_COUNT_EXCEEDS_EXPECTED', `${path}.metrics.${prefix}_matched`, 'Matched count cannot exceed the one expected target.');
        }
      }
      if (exactObject(result.evidence, `${path}.evidence`, EVIDENCE_KEYS, issues)) {
        for (const key of EVIDENCE_KEYS) key.endsWith('_sha256')
          ? requireHash(result.evidence[key], `${path}.evidence.${key}`, issues)
          : requireId(result.evidence[key], `${path}.evidence.${key}`, issues);
      }
    });
  }

  if (exactObject(input.review, '$.review', REVIEW_KEYS, issues)) {
    requireId(input.review.principal_id, '$.review.principal_id', issues);
    if (typeof input.review.display_name !== 'string' || input.review.display_name.trim().length < 2) addIssue(issues, 'schema', 'INVALID_REVIEWER_NAME', '$.review.display_name', 'A named accountable reviewer is required.');
    if (!REVIEW_ROLES.has(input.review.role)) addIssue(issues, 'schema', 'INVALID_REVIEWER_ROLE', '$.review.role', 'Reviewer role is not approved for canary promotion.');
    requireIso(input.review.reviewed_at, '$.review.reviewed_at', issues);
    if (!['approve', 'hold'].includes(input.review.decision)) addIssue(issues, 'schema', 'INVALID_REVIEW_DECISION', '$.review.decision', 'Review decision must be approve or hold.');
    requireId(input.review.evidence_id, '$.review.evidence_id', issues);
    requireHash(input.review.evidence_sha256, '$.review.evidence_sha256', issues);
    requireHash(input.review.bound_evidence_sha256, '$.review.bound_evidence_sha256', issues);
    validateCampaignBinding(input.review.campaign_binding, '$.review.campaign_binding', issues);
    if (!sameJson(input.review.campaign_binding, input.campaign_binding)) addIssue(issues, 'schema', 'REVIEW_VERSION_BINDING_MISMATCH', '$.review.campaign_binding', 'Review is bound to a different campaign/provider version.');
    if (cohortIsObject && input.review.principal_id === input.cohort.operator_principal_id) addIssue(issues, 'schema', 'REVIEWER_NOT_INDEPENDENT', '$.review.principal_id', 'The cohort operator cannot approve their own run.');
    if (cohortIsObject && validIso(input.review.reviewed_at) && validIso(input.cohort.completed_at) && input.review.reviewed_at < input.cohort.completed_at) addIssue(issues, 'schema', 'REVIEW_BEFORE_COMPLETION', '$.review.reviewed_at', 'Review must occur after cohort completion.');
    try {
      const expectedDigest = computeCanaryEvidenceDigest(input);
      if (input.review.bound_evidence_sha256 !== expectedDigest) addIssue(issues, 'schema', 'REVIEW_EVIDENCE_BINDING_MISMATCH', '$.review.bound_evidence_sha256', 'Review does not bind the exact cohort results and version chain.');
    } catch {
      addIssue(issues, 'schema', 'UNHASHABLE_EVIDENCE', '$', 'Evidence cannot be canonically hashed.');
    }
  }
  return issues;
}

function hardFailureSets(input) {
  const sets = Object.fromEntries(['dnc', 'consent', 'wrong_tenant', 'duplicate', 'provider_identity', 'global_stop'].map((key) => [key, new Set()]));
  const results = Array.isArray(input?.results) ? input.results : [];
  const seen = { call_id: new Map(), lead_id: new Map(), provider_call_id: new Map() };
  results.forEach((result, index) => {
    const preflight = isPlainObject(result?.preflight) ? result.preflight : {};
    const flags = isPlainObject(result?.hard_failures) ? result.hard_failures : {};
    const observed = isPlainObject(result?.observed_identity) ? result.observed_identity : {};
    const binding = isPlainObject(input?.campaign_binding) ? input.campaign_binding : {};
    if (flags.dnc_violation === true || ['company_dnc_clear', 'national_dnc_clear', 'state_dnc_clear', 'reassigned_number_clear', 'phone_ownership_clear', 'prior_opt_out_clear', 'wrong_number_clear', 'complaint_quarantine_clear', 'jurisdiction_clear', 'calling_window_clear'].some((key) => preflight[key] !== true)) sets.dnc.add(index);
    if (flags.consent_violation === true || preflight.exact_consent_verified !== true || preflight.consent_unrevoked !== true) sets.consent.add(index);
    if (flags.wrong_tenant === true || observed.organization_id !== binding.organization_id || observed.ghl_location_id !== binding.ghl_location_id) sets.wrong_tenant.add(index);
    if (flags.provider_identity_mismatch === true || ['provider', 'provider_agent_id', 'provider_agent_version', 'provider_llm_id', 'provider_llm_version'].some((key) => observed[key] !== binding[key])) sets.provider_identity.add(index);
    if (flags.global_stop_violation === true || preflight.global_stop_clear !== true) sets.global_stop.add(index);
    if (flags.duplicate_call === true) sets.duplicate.add(index);
    for (const key of Object.keys(seen)) {
      const value = result?.[key];
      if (typeof value !== 'string') continue;
      if (seen[key].has(value)) {
        sets.duplicate.add(seen[key].get(value));
        sets.duplicate.add(index);
      } else seen[key].set(value, index);
    }
  });
  return Object.fromEntries(Object.entries(sets).map(([key, value]) => [key, value.size]));
}

function calculateMetrics(input) {
  const results = Array.isArray(input?.results) ? input.results : [];
  const number = (value) => Number.isSafeInteger(value) && value >= 0 ? value : 0;
  const sum = (key) => results.reduce((total, result) => total + number(result?.metrics?.[key]), 0);
  const count = results.length;
  const webhookExpected = sum('webhook_events_expected');
  const reconciliationExpected = sum('reconciliation_records_expected');
  const ghlExpected = sum('ghl_shadow_records_expected');
  const billingMatches = results.filter((result) => Number.isSafeInteger(result?.metrics?.billing_expected_microunits)
    && result.metrics.billing_expected_microunits === result.metrics.billing_observed_microunits).length;
  const billingVariance = results.reduce((total, result) => {
    const expected = number(result?.metrics?.billing_expected_microunits);
    const observed = number(result?.metrics?.billing_observed_microunits);
    return total + Math.abs(expected - observed);
  }, 0);
  const p100 = (key) => count === 0 ? null : Math.max(...results.map((result) => number(result?.metrics?.[key])));
  return {
    webhook_match_rate: webhookExpected === 0 ? null : sum('webhook_events_matched') / webhookExpected,
    webhook_mismatch_rate: webhookExpected === 0 ? null : sum('webhook_mismatches') / webhookExpected,
    webhook_terminal_latency_p100_ms: p100('webhook_terminal_latency_ms'),
    reconciliation_match_rate: reconciliationExpected === 0 ? null : sum('reconciliation_records_matched') / reconciliationExpected,
    reconciliation_mismatch_rate: reconciliationExpected === 0 ? null : sum('reconciliation_mismatches') / reconciliationExpected,
    reconciliation_latency_p100_ms: p100('reconciliation_latency_ms'),
    billing_match_rate: count === 0 ? null : billingMatches / count,
    billing_total_absolute_variance_microunits: billingVariance,
    ghl_shadow_match_rate: ghlExpected === 0 ? null : sum('ghl_shadow_records_matched') / ghlExpected,
    ghl_shadow_mismatch_rate: ghlExpected === 0 ? null : sum('ghl_shadow_mismatches') / ghlExpected,
  };
}

function evaluateThresholds(metrics, issues) {
  const t = SOLAR_EXIT_CANARY_POLICY.thresholds;
  const checks = [
    ['webhook_match_rate', 'min', t.webhook_match_rate_min],
    ['webhook_mismatch_rate', 'max', t.webhook_mismatch_rate_max],
    ['webhook_terminal_latency_p100_ms', 'max', t.webhook_terminal_latency_p100_max_ms],
    ['reconciliation_match_rate', 'min', t.reconciliation_match_rate_min],
    ['reconciliation_mismatch_rate', 'max', t.reconciliation_mismatch_rate_max],
    ['reconciliation_latency_p100_ms', 'max', t.reconciliation_latency_p100_max_ms],
    ['billing_match_rate', 'min', t.billing_match_rate_min],
    ['billing_total_absolute_variance_microunits', 'max', t.billing_total_absolute_variance_microunits_max],
    ['ghl_shadow_match_rate', 'min', t.ghl_shadow_match_rate_min],
    ['ghl_shadow_mismatch_rate', 'max', t.ghl_shadow_mismatch_rate_max],
  ];
  for (const [key, direction, threshold] of checks) {
    const value = metrics[key];
    if (typeof value !== 'number' || (direction === 'min' ? value < threshold : value > threshold)) addIssue(issues, 'threshold', 'THRESHOLD_FAILED', `$.metrics.${key}`, `${key}=${value ?? 'null'} failed ${direction} threshold ${threshold}.`);
  }
}

function certificateFor(input, inputDigest, evidenceDigest, decision, nextStage) {
  return {
    schema_version: SOLAR_EXIT_CANARY_SCHEMA_VERSION,
    certificate_type: 'solar_exit_canary_promotion',
    evaluator_version: SOLAR_EXIT_CANARY_EVALUATOR_VERSION,
    certificate_id: `solar-exit-${input.cohort.stage}-${inputDigest.slice(0, 24)}`,
    decision,
    stage: input.cohort.stage,
    next_stage: nextStage,
    run_id: input.cohort.run_id,
    sample_size: input.results.length,
    issued_at: input.review.reviewed_at,
    input_sha256: inputDigest,
    evidence_sha256: input.review.evidence_sha256,
    bound_evidence_sha256: evidenceDigest,
    reviewer_principal_id: input.review.principal_id,
    campaign_binding: input.campaign_binding,
    authorization_scope: 'evidence_chain_only',
    contact_authorized: false,
    launch_authorized: false,
    external_trust_required: true,
  };
}

export function evaluateSolarExitCanary(input) {
  const issues = validateInput(input);
  const hardFailureCounts = hardFailureSets(input);
  for (const [key, count] of Object.entries(hardFailureCounts)) {
    if (count > 0) addIssue(issues, 'hard_failure', `HARD_FAILURE_${key.toUpperCase()}`, '$.results', `${count} result(s) triggered the zero-tolerance ${key} gate.`);
  }
  const metrics = calculateMetrics(input);
  evaluateThresholds(metrics, issues);
  if (input?.review?.decision === 'hold') addIssue(issues, 'review', 'REVIEWER_HOLD', '$.review.decision', 'The accountable reviewer held this cohort.');

  let inputDigest = null;
  let evidenceDigest = null;
  try { inputDigest = computeCanaryInputDigest(input); } catch { /* schema issue already fails closed */ }
  try { evidenceDigest = computeCanaryEvidenceDigest(input); } catch { /* schema issue already fails closed */ }
  const stage = typeof input?.cohort?.stage === 'string' ? input.cohort.stage : null;
  const stagePolicy = SOLAR_EXIT_CANARY_POLICY.stages[stage];
  const passed = issues.length === 0;
  const terminal = passed && stagePolicy?.next === 'normal';
  const decision = passed ? (terminal ? 'normal' : 'promote') : 'hold';
  const nextStage = passed ? stagePolicy.next : null;
  const certificate = passed ? certificateFor(input, inputDigest, evidenceDigest, decision, nextStage) : null;

  return {
    schema_version: SOLAR_EXIT_CANARY_SCHEMA_VERSION,
    evaluator_version: SOLAR_EXIT_CANARY_EVALUATOR_VERSION,
    input_valid: !issues.some((issue) => issue.category === 'schema'),
    passed,
    decision,
    stage,
    next_stage: nextStage,
    expected_sample_size: stagePolicy?.sample_size ?? null,
    observed_sample_size: Array.isArray(input?.results) ? input.results.length : null,
    hard_failure_counts: hardFailureCounts,
    thresholds: SOLAR_EXIT_CANARY_POLICY.thresholds,
    metrics,
    input_sha256: inputDigest,
    bound_evidence_sha256: evidenceDigest,
    certificate,
    recommendation_scope: 'cohort_evidence_review_only',
    contact_authorization_created: false,
    launch_authorization_created: false,
    external_trust_required: true,
    side_effects: {
      database_writes_performed: false,
      provider_writes_performed: false,
      network_requests_performed: false,
      calls_authorized_by_this_evaluation: false,
    },
    issues,
  };
}
