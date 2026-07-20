import { createHash, createHmac } from 'node:crypto';

import { evaluateConsentEvidence } from './solar-exit-bundle.mjs';

export const SOLAR_EXIT_SHADOW_SCHEMA_VERSION = '1.0.0';
export const SOLAR_EXIT_SHADOW_EVALUATOR_VERSION = '1.1.0';

export const MINIMUM_PRODUCTION_PHONE_HMAC_KEY_BYTES = 32;
export const MAXIMUM_PRODUCTION_PHONE_HMAC_KEY_BYTES = 4096;
const PRODUCTION_PHONE_PSEUDONYM_SCHEME = 'hmac-sha256-v1';
const SYNTHETIC_PHONE_PSEUDONYM_SCHEME = 'synthetic-fixture-only-hmac-sha256-v1';
const SYNTHETIC_PHONE_PSEUDONYM_KEY_ID = 'synthetic-public-demo-key-v1';
const SYNTHETIC_PHONE_PSEUDONYM_KEY = createHash('sha256')
  .update('DIAL_SMART_SOLAR_EXIT_SYNTHETIC_PHONE_PSEUDONYM_PUBLIC_DEMO_KEY_V1', 'utf8')
  .digest();

const MODES = new Set(['offline', 'production']);
const ALLOW_REASONS = new Set(['offline_allow', 'production_eligible']);
const REQUIRED_SUPPRESSION_GATES = Object.freeze([
  'company_do_not_call_clear_required',
  'national_do_not_call_clear_required',
  'state_do_not_call_clear_required',
  'reassigned_number_clear_required',
  'phone_ownership_clear_required',
  'prior_opt_out_clear_required',
  'wrong_number_clear_required',
  'complaint_quarantine_clear_required',
  'global_stop_clear_required',
]);
const REQUIRED_CONSENT_EVIDENCE_FIELDS = Object.freeze([
  'consent_artifact_id',
  'lead_id',
  'consumer_name',
  'phone_number',
  'dialed_phone_number',
  'seller',
  'lead_source',
  'source_form_version',
  'consent_disclosure_text',
  'consent_text_version',
  'signature_evidence',
  'not_condition_of_purchase_disclosure',
  'ai_voice_calls_authorized',
  'telemarketing_calls_authorized',
  'captured_at',
  'revoked',
  'property_state',
  'calling_state',
  'suppression_checks',
]);
const REQUIRED_LEAD_FIELDS = Object.freeze([
  'lead_id',
  'external_contact_id',
  'organization_id',
  'source_system',
  'phone_number',
  'seller',
  'lead_source',
  'property_state',
  'calling_state',
]);
const REQUIRED_TRUSTED_CONTEXT_FIELDS = Object.freeze([
  'authorization_id',
  'authorization_scope',
  'trust_evidence_id',
  'trust_level',
  'issued_at',
  'expires_at',
  'organization_id',
  'external_contact_id',
  'source_system',
  'lead_id',
  'destination_phone_number',
  'seller',
  'lead_source',
  'consent_artifact_id',
  'source_form_version',
  'consent_text_version',
]);
const TRUSTED_CONTEXT_CONTROL_FIELDS = Object.freeze([
  'integrity_verified',
  'tenant_binding_verified',
  'replay_check_clear',
  'contact_authorized',
]);
const TRUST_LEVELS = new Set(['server_verified', 'cryptographically_verified_direct_import']);

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasText(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0;
}

function isPlaceholder(value) {
  return !hasText(value) || /^__.*__$/.test(value) || /\brequired\b/i.test(value);
}

function isTimestamp(value) {
  return hasText(value) && Number.isFinite(Date.parse(value));
}

function isE164(value) {
  return typeof value === 'string' && /^\+[1-9]\d{7,14}$/.test(value);
}

function isUpperState(value) {
  return typeof value === 'string' && /^[A-Z]{2}$/.test(value);
}

function unique(values) {
  return [...new Set(values)];
}

/**
 * RFC-8785-inspired canonical JSON for the JSON-only values accepted here.
 * It deliberately rejects values that JSON.stringify would silently erase.
 */
export function canonicalJson(value) {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Canonical JSON does not support non-finite numbers.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  if (isPlainObject(value)) {
    const entries = Object.keys(value)
      .sort()
      .map((key) => {
        if (value[key] === undefined) throw new TypeError(`Canonical JSON does not support undefined at ${key}.`);
        return `${JSON.stringify(key)}:${canonicalJson(value[key])}`;
      });
    return `{${entries.join(',')}}`;
  }
  throw new TypeError('Shadow evaluator inputs must contain JSON-only values.');
}

export function sha256Canonical(value) {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function estimatedShannonBits(bytes) {
  const counts = new Map();
  for (const byte of bytes) counts.set(byte, (counts.get(byte) || 0) + 1);
  let bitsPerByte = 0;
  for (const count of counts.values()) {
    const probability = count / bytes.length;
    bitsPerByte -= probability * Math.log2(probability);
  }
  return bitsPerByte * bytes.length;
}

function normalizePhonePseudonymization(mode, phoneHmacKey, phoneHmacKeyId) {
  if (mode === 'offline') {
    if (phoneHmacKey !== undefined || phoneHmacKeyId !== undefined) {
      throw new TypeError('Offline mode uses its fixed synthetic-only pseudonym and does not accept production key material.');
    }
    return {
      key: SYNTHETIC_PHONE_PSEUDONYM_KEY,
      key_id: SYNTHETIC_PHONE_PSEUDONYM_KEY_ID,
      scheme: SYNTHETIC_PHONE_PSEUDONYM_SCHEME,
      synthetic_only: true,
    };
  }

  if (!(Buffer.isBuffer(phoneHmacKey) || phoneHmacKey instanceof Uint8Array)) {
    throw new TypeError('Production mode requires phone HMAC key bytes loaded from an external secret source.');
  }
  const key = Buffer.isBuffer(phoneHmacKey)
    ? phoneHmacKey
    : Buffer.from(phoneHmacKey.buffer, phoneHmacKey.byteOffset, phoneHmacKey.byteLength);
  if (key.length < MINIMUM_PRODUCTION_PHONE_HMAC_KEY_BYTES || key.length > MAXIMUM_PRODUCTION_PHONE_HMAC_KEY_BYTES) {
    throw new TypeError(`Production phone HMAC key material must be ${MINIMUM_PRODUCTION_PHONE_HMAC_KEY_BYTES}-${MAXIMUM_PRODUCTION_PHONE_HMAC_KEY_BYTES} bytes.`);
  }
  const distinctBytes = new Set(key).size;
  const printableBytes = [...key].filter((byte) => byte >= 0x20 && byte <= 0x7e).length;
  if (distinctBytes < 16 || estimatedShannonBits(key) < 128 || printableBytes / key.length > 0.75) {
    throw new TypeError('Production phone HMAC key material fails the binary entropy sanity check; use cryptographically random bytes.');
  }
  if (!hasText(phoneHmacKeyId) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(phoneHmacKeyId)) {
    throw new TypeError('Production phone HMAC key ID must be a non-secret 3-128 character identifier.');
  }
  if (/(^|[._:-])(synthetic|demo|test)([._:-]|$)/i.test(phoneHmacKeyId)) {
    throw new TypeError('Production phone HMAC key ID must not be labeled synthetic, demo, or test.');
  }
  return {
    key,
    key_id: phoneHmacKeyId,
    scheme: PRODUCTION_PHONE_PSEUDONYM_SCHEME,
    synthetic_only: false,
  };
}

function pseudonymizePhone(phoneNumber, organizationId, pseudonymization) {
  if (typeof phoneNumber !== 'string') return null;
  const value = createHmac('sha256', pseudonymization.key)
    .update('dial-smart:solar-exit:phone-pseudonym:v1\0', 'utf8')
    .update(String(pseudonymization.key_id), 'utf8')
    .update('\0', 'utf8')
    .update(typeof organizationId === 'string' ? organizationId : '', 'utf8')
    .update('\0', 'utf8')
    .update(phoneNumber, 'utf8')
    .digest('hex');
  return {
    scheme: pseudonymization.scheme,
    key_id: pseudonymization.key_id,
    scope: 'organization_and_e164_phone',
    synthetic_only: pseudonymization.synthetic_only,
    value,
  };
}

function keyedSensitiveFingerprint(value, domain, pseudonymization) {
  if (value === null || value === undefined) return null;
  return {
    scheme: pseudonymization.scheme,
    key_id: pseudonymization.key_id,
    synthetic_only: pseudonymization.synthetic_only,
    value: createHmac('sha256', pseudonymization.key)
      .update(`dial-smart:solar-exit:${domain}:v1\0`, 'utf8')
      .update(canonicalJson(value), 'utf8')
      .digest('hex'),
  };
}

function resolvedText(value) {
  return hasText(value) && !isPlaceholder(value);
}

function validatePolicyArtifact(artifact, requiredSeller) {
  return (
    isPlainObject(artifact) &&
    resolvedText(artifact.consent_artifact_id) &&
    artifact.seller === requiredSeller &&
    resolvedText(artifact.lead_source) &&
    resolvedText(artifact.source_form_version) &&
    resolvedText(artifact.consent_text_version) &&
    /^[0-9a-f]{64}$/i.test(artifact.disclosure_sha256 || '') &&
    artifact.ai_voice_calls_authorized === true &&
    artifact.telemarketing_calls_authorized === true &&
    artifact.not_condition_of_purchase === true &&
    isTimestamp(artifact.effective_from) &&
    (artifact.effective_to === null || isTimestamp(artifact.effective_to)) &&
    resolvedText(artifact.approver) &&
    isTimestamp(artifact.approved_at)
  );
}

function validateStateRuleSource(source) {
  return (
    isPlainObject(source) &&
    resolvedText(source.policy_id) &&
    resolvedText(source.approver) &&
    isTimestamp(source.approved_at) &&
    /^[0-9a-f]{64}$/i.test(source.sha256 || '') &&
    Array.isArray(source.source_urls) &&
    source.source_urls.length > 0 &&
    source.source_urls.every((url) => typeof url === 'string' && /^https:\/\//i.test(url))
  );
}

/**
 * Returns every reason a policy is unsafe to use for production shadow decisions.
 * Offline synthetic fixtures intentionally do not need a resolved production policy.
 */
export function productionPolicyBlockers(eligibility, { asOf = null } = {}) {
  const blockers = [];
  const policy = isPlainObject(eligibility) ? eligibility : {};
  const consent = isPlainObject(policy.consent) ? policy.consent : {};
  const jurisdiction = isPlainObject(policy.jurisdiction) ? policy.jurisdiction : {};
  const timeAndFrequency = isPlainObject(policy.time_and_frequency) ? policy.time_and_frequency : {};
  const provider = isPlainObject(policy.number_and_provider) ? policy.number_and_provider : {};

  if (!resolvedText(policy.policy_id)) blockers.push('policy_id_unresolved');
  if (!resolvedText(policy.policy_version)) blockers.push('policy_version_unresolved');
  if (policy.default_decision !== 'deny') blockers.push('default_decision_not_deny');
  if (policy.cold_calling_enabled !== false) blockers.push('cold_calling_not_disabled');
  if (policy.seller_specific_consent_required !== true) blockers.push('seller_specific_consent_not_required');
  if (policy.artificial_or_prerecorded_voice_consent_required !== true) blockers.push('ai_voice_consent_not_required');
  if (!resolvedText(consent.required_seller)) blockers.push('required_seller_unresolved');

  const requiredFields = Array.isArray(consent.required_evidence_fields) ? consent.required_evidence_fields : [];
  if (
    requiredFields.length !== REQUIRED_CONSENT_EVIDENCE_FIELDS.length ||
    REQUIRED_CONSENT_EVIDENCE_FIELDS.some((field) => !requiredFields.includes(field))
  ) {
    blockers.push('required_consent_evidence_contract_incomplete');
  }

  const approvedSources = Array.isArray(consent.approved_lead_sources) ? consent.approved_lead_sources : [];
  const approvedVersions = Array.isArray(consent.approved_consent_text_versions) ? consent.approved_consent_text_versions : [];
  const approvedArtifacts = Array.isArray(consent.approved_consent_artifacts) ? consent.approved_consent_artifacts : [];
  if (approvedSources.length === 0 || approvedSources.some((value) => !resolvedText(value))) blockers.push('approved_lead_sources_unresolved');
  if (unique(approvedSources).length !== approvedSources.length) blockers.push('approved_lead_sources_duplicated');
  if (approvedVersions.length === 0 || approvedVersions.some((value) => !resolvedText(value))) blockers.push('approved_consent_versions_unresolved');
  if (unique(approvedVersions).length !== approvedVersions.length) blockers.push('approved_consent_versions_duplicated');
  if (approvedArtifacts.length === 0 || approvedArtifacts.some((artifact) => !validatePolicyArtifact(artifact, consent.required_seller))) {
    blockers.push('approved_consent_artifacts_unresolved');
  }
  const artifactIds = approvedArtifacts.map((artifact) => artifact?.consent_artifact_id).filter(hasText);
  if (unique(artifactIds).length !== artifactIds.length) blockers.push('approved_consent_artifacts_duplicated');
  if (asOf !== null) {
    const asOfMs = Date.parse(asOf);
    if (!Number.isFinite(asOfMs)) blockers.push('policy_as_of_invalid');
    else {
      for (const artifact of approvedArtifacts) {
        if (!validatePolicyArtifact(artifact, consent.required_seller)) continue;
        if (Date.parse(artifact.approved_at) > asOfMs || Date.parse(artifact.effective_from) > asOfMs) {
          blockers.push(`approved_consent_artifact_not_active:${artifact.consent_artifact_id}`);
        }
        if (artifact.effective_to !== null && Date.parse(artifact.effective_to) < asOfMs) {
          blockers.push(`approved_consent_artifact_expired:${artifact.consent_artifact_id}`);
        }
      }
    }
  }
  if (consent.phone_must_match_evidence !== true) blockers.push('phone_match_not_required');
  if (consent.synthetic_offline_override?.production_allowed !== false) blockers.push('synthetic_override_not_production_locked');

  const suppression = isPlainObject(policy.suppression_gates) ? policy.suppression_gates : {};
  if (
    Object.keys(suppression).length !== REQUIRED_SUPPRESSION_GATES.length ||
    REQUIRED_SUPPRESSION_GATES.some((gate) => suppression[gate] !== true)
  ) {
    blockers.push('suppression_gate_contract_incomplete');
  }
  const dncAge = Number(policy.registry_evidence?.national_dnc_registry_version_max_age_days);
  if (!Number.isFinite(dncAge) || dncAge <= 0 || dncAge > 31) blockers.push('national_dnc_freshness_unresolved');

  const propertyStates = Array.isArray(jurisdiction.approved_property_states) ? jurisdiction.approved_property_states : [];
  const callingStates = Array.isArray(jurisdiction.approved_calling_states) ? jurisdiction.approved_calling_states : [];
  if (propertyStates.length === 0 || propertyStates.some((state) => !isUpperState(state))) blockers.push('approved_property_states_unresolved');
  if (unique(propertyStates).length !== propertyStates.length) blockers.push('approved_property_states_duplicated');
  if (callingStates.length === 0 || callingStates.some((state) => !isUpperState(state))) blockers.push('approved_calling_states_unresolved');
  if (unique(callingStates).length !== callingStates.length) blockers.push('approved_calling_states_duplicated');
  for (const state of unique([...propertyStates, ...callingStates])) {
    if (!validateStateRuleSource(jurisdiction.state_rule_sources?.[state])) blockers.push(`state_rule_source_unresolved:${state}`);
  }
  for (const state of unique(callingStates)) {
    if (!resolvedText(jurisdiction.recording_disclosure_by_state?.[state])) blockers.push(`recording_disclosure_unresolved:${state}`);
  }
  if (jurisdiction.unknown_state_decision !== 'deny') blockers.push('unknown_state_not_denied');

  if (!resolvedText(timeAndFrequency.timezone_source)) blockers.push('timezone_source_unresolved');
  if (timeAndFrequency.fallback_when_timezone_unknown !== 'deny') blockers.push('unknown_timezone_not_denied');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(timeAndFrequency.earliest_local_time || '')) blockers.push('earliest_call_time_unresolved');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(timeAndFrequency.latest_local_time || '')) blockers.push('latest_call_time_unresolved');
  if (timeAndFrequency.weekends_enabled !== false) blockers.push('weekends_not_disabled');
  if (timeAndFrequency.maximum_attempts_per_lead !== 1) blockers.push('attempt_limit_not_one');
  if (timeAndFrequency.maximum_calls_per_minute !== 1) blockers.push('rate_limit_not_one_per_minute');
  if (!Number.isInteger(timeAndFrequency.maximum_calls_per_day) || timeAndFrequency.maximum_calls_per_day < 1 || timeAndFrequency.maximum_calls_per_day > 5) {
    blockers.push('daily_limit_not_conservative');
  }
  if (timeAndFrequency.automatic_retry_enabled !== false) blockers.push('automatic_retry_not_disabled');

  if (provider.provider !== 'retell') blockers.push('provider_not_retell');
  if (provider.e164_required !== true) blockers.push('e164_not_required');
  if (provider.line_type_validation_required !== true) blockers.push('line_type_validation_not_required');
  if (provider.owned_from_number_required !== true) blockers.push('owned_from_number_not_required');
  if (provider.pinned_agent_version_required !== true) blockers.push('pinned_agent_not_required');
  if (provider.pinned_llm_version_required !== true) blockers.push('pinned_llm_not_required');
  if (provider.signed_webhook_required !== true) blockers.push('signed_webhook_not_required');

  return unique(blockers).sort();
}

function validateLead(lead) {
  if (!isPlainObject(lead)) return 'deny_invalid_normalized_lead';
  if (REQUIRED_LEAD_FIELDS.some((field) => !Object.prototype.hasOwnProperty.call(lead, field))) return 'deny_invalid_normalized_lead';
  if (Object.keys(lead).some((field) => !REQUIRED_LEAD_FIELDS.includes(field))) return 'deny_invalid_normalized_lead';
  if (
    !hasText(lead.lead_id) ||
    !hasText(lead.external_contact_id) ||
    !hasText(lead.organization_id) ||
    !hasText(lead.source_system) ||
    !isE164(lead.phone_number) ||
    !hasText(lead.seller) ||
    !hasText(lead.lead_source) ||
    !isUpperState(lead.property_state) ||
    !isUpperState(lead.calling_state)
  ) {
    return 'deny_invalid_normalized_lead';
  }
  return null;
}

function validateConsentEvidenceShape(evidence) {
  if (!isPlainObject(evidence)) return 'deny_missing_evidence';
  if (REQUIRED_CONSENT_EVIDENCE_FIELDS.some((field) => !Object.prototype.hasOwnProperty.call(evidence, field))) {
    return 'deny_invalid_normalized_consent';
  }
  if (Object.keys(evidence).some((field) => !REQUIRED_CONSENT_EVIDENCE_FIELDS.includes(field))) {
    return 'deny_invalid_normalized_consent';
  }
  return null;
}

function validateLeadConsentBinding(lead, evidence) {
  const bindings = [
    ['lead_id', 'lead_id'],
    ['phone_number', 'phone_number'],
    ['seller', 'seller'],
    ['lead_source', 'lead_source'],
    ['property_state', 'property_state'],
    ['calling_state', 'calling_state'],
  ];
  for (const [leadField, evidenceField] of bindings) {
    if (lead[leadField] !== evidence[evidenceField]) return 'deny_lead_consent_binding_mismatch';
  }
  if (evidence.dialed_phone_number !== evidence.phone_number) return 'deny_phone_mismatch';
  return null;
}

function validateOriginalConsentArtifactWindow(evidence, eligibility) {
  if (!isTimestamp(evidence?.captured_at)) return null;
  const artifact = eligibility.consent?.approved_consent_artifacts?.find(
    (candidate) => candidate?.consent_artifact_id === evidence.consent_artifact_id,
  );
  if (!artifact || !isTimestamp(artifact.effective_from)) return null;
  const capturedAtMs = Date.parse(evidence.captured_at);
  const effectiveFromMs = Date.parse(artifact.effective_from);
  const effectiveToMs = artifact.effective_to === null ? null : Date.parse(artifact.effective_to);
  if (capturedAtMs < effectiveFromMs || (Number.isFinite(effectiveToMs) && capturedAtMs > effectiveToMs)) {
    return 'deny_consent_artifact_not_effective';
  }
  return null;
}

function validateTrustedContext(lead, evidence, trustedContext, asOfMs) {
  if (!isPlainObject(trustedContext)) return 'deny_missing_trusted_context';
  if (REQUIRED_TRUSTED_CONTEXT_FIELDS.some((field) => !hasText(trustedContext[field]))) return 'deny_missing_trusted_context';
  const allowedFields = [...REQUIRED_TRUSTED_CONTEXT_FIELDS, ...TRUSTED_CONTEXT_CONTROL_FIELDS];
  if (Object.keys(trustedContext).some((field) => !allowedFields.includes(field))) return 'deny_untrusted_context';
  if (
    trustedContext.authorization_scope !== 'solar_exit_shadow_evaluate_only' ||
    !TRUST_LEVELS.has(trustedContext.trust_level) ||
    trustedContext.integrity_verified !== true ||
    trustedContext.tenant_binding_verified !== true ||
    trustedContext.replay_check_clear !== true ||
    trustedContext.contact_authorized !== false
  ) {
    return 'deny_untrusted_context';
  }
  if (!isTimestamp(trustedContext.issued_at) || !isTimestamp(trustedContext.expires_at)) return 'deny_invalid_trusted_context_window';
  const issuedAtMs = Date.parse(trustedContext.issued_at);
  const expiresAtMs = Date.parse(trustedContext.expires_at);
  if (issuedAtMs > asOfMs || expiresAtMs < asOfMs || expiresAtMs <= issuedAtMs) return 'deny_invalid_trusted_context_window';

  const leadBindings = [
    ['organization_id', 'organization_id'],
    ['external_contact_id', 'external_contact_id'],
    ['source_system', 'source_system'],
    ['lead_id', 'lead_id'],
    ['phone_number', 'destination_phone_number'],
    ['seller', 'seller'],
    ['lead_source', 'lead_source'],
  ];
  for (const [leadField, contextField] of leadBindings) {
    if (lead[leadField] !== trustedContext[contextField]) return 'deny_trusted_lead_binding_mismatch';
  }
  const consentBindings = [
    ['consent_artifact_id', 'consent_artifact_id'],
    ['source_form_version', 'source_form_version'],
    ['consent_text_version', 'consent_text_version'],
  ];
  for (const [evidenceField, contextField] of consentBindings) {
    if (evidence[evidenceField] !== trustedContext[contextField]) return 'deny_trusted_consent_binding_mismatch';
  }
  return null;
}

function buildReasonCounts(decisions) {
  const counts = new Map();
  for (const decision of decisions) counts.set(decision.reason_code, (counts.get(decision.reason_code) || 0) + 1);
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function safeLeadIdentity(record, index, pseudonymization) {
  const lead = isPlainObject(record?.lead) ? record.lead : {};
  return {
    record_index: index,
    lead_id: hasText(lead.lead_id) ? lead.lead_id : null,
    external_contact_id: hasText(lead.external_contact_id) ? lead.external_contact_id : null,
    organization_id: hasText(lead.organization_id) ? lead.organization_id : null,
    phone_pseudonym: pseudonymizePhone(lead.phone_number, lead.organization_id, pseudonymization),
  };
}

function decisionFor({ batch, record, index, mode, asOf, asOfMs, policySha256, policyBlocked, duplicateKeys, duplicateAuthorizationIds, pseudonymization }) {
  const lead = isPlainObject(record?.lead) ? record.lead : null;
  const evidence = isPlainObject(record?.consent_evidence) ? record.consent_evidence : null;
  const trustedContext = isPlainObject(record?.trusted_dispatch_context) ? record.trusted_dispatch_context : null;
  const identity = safeLeadIdentity(record, index, pseudonymization);
  let reasonCode = null;

  if (policyBlocked) {
    reasonCode = 'deny_unresolved_policy';
  } else {
    reasonCode = validateLead(lead);
    if (!reasonCode) {
      const duplicateKey = `${lead.organization_id}\u0000${lead.lead_id}\u0000${lead.phone_number}`;
      if (duplicateKeys.has(duplicateKey)) reasonCode = 'deny_duplicate_batch_identity';
    }
    if (!reasonCode) reasonCode = validateConsentEvidenceShape(evidence);
    if (!reasonCode) reasonCode = validateLeadConsentBinding(lead, evidence);
    if (!reasonCode && mode === 'production' && duplicateAuthorizationIds.has(trustedContext?.authorization_id)) {
      reasonCode = 'deny_duplicate_authorization';
    }
    if (!reasonCode && mode === 'production') reasonCode = validateTrustedContext(lead, evidence, trustedContext, asOfMs);
    if (!reasonCode && mode === 'production') reasonCode = validateOriginalConsentArtifactWindow(evidence, batch.eligibility);
    if (!reasonCode) {
      const deterministicEligibility = mode === 'production'
        ? {
            ...batch.eligibility,
            consent: {
              ...batch.eligibility.consent,
              approved_consent_artifacts: batch.eligibility.consent.approved_consent_artifacts.map((artifact) => ({
                ...artifact,
                approved_at: '1970-01-01T00:00:00.000Z',
                effective_from: '1970-01-01T00:00:00.000Z',
                effective_to: null,
              })),
            },
          }
        : batch.eligibility;
      reasonCode = evaluateConsentEvidence(evidence, deterministicEligibility, {
        mode,
        now: new Date(asOf),
        trustedDispatchContext: mode === 'production' ? trustedContext : null,
      });
    }
  }

  const decision = ALLOW_REASONS.has(reasonCode) ? 'would_call' : 'blocked';
  const decisionCore = {
    ...identity,
    decision,
    reason_code: reasonCode,
    decision_scope: 'shadow_eligibility_only',
    contact_authorized: false,
    provider_invocation_authorized: false,
    source_record_fingerprint: keyedSensitiveFingerprint(record, 'source-record-fingerprint', pseudonymization),
    trusted_context_fingerprint: keyedSensitiveFingerprint(trustedContext, 'trusted-context-fingerprint', pseudonymization),
    policy_sha256: policySha256,
  };
  return {
    ...decisionCore,
    decision_id: sha256Canonical({
      evaluator_version: SOLAR_EXIT_SHADOW_EVALUATOR_VERSION,
      batch_id: batch.batch_id,
      as_of: asOf,
      ...decisionCore,
    }),
  };
}

function validateBatchInput(batch) {
  if (!isPlainObject(batch)) throw new TypeError('Shadow input must be a JSON object.');
  if (batch.schema_version !== SOLAR_EXIT_SHADOW_SCHEMA_VERSION) throw new TypeError(`schema_version must be ${SOLAR_EXIT_SHADOW_SCHEMA_VERSION}.`);
  if (!hasText(batch.batch_id) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(batch.batch_id)) {
    throw new TypeError('batch_id must be a stable 3-128 character audit identifier.');
  }
  if (!isTimestamp(batch.as_of)) throw new TypeError('as_of must be an explicit, parseable timestamp.');
  if (!Array.isArray(batch.records) || batch.records.length === 0) throw new TypeError('records must be a non-empty array.');
  if (batch.records.length > 10_000) throw new TypeError('A shadow batch cannot contain more than 10,000 records.');
  for (const [index, record] of batch.records.entries()) {
    if (!isPlainObject(record)) throw new TypeError(`records[${index}] must be a JSON object.`);
    const keys = Object.keys(record).sort();
    const allowed = ['consent_evidence', 'lead', 'trusted_dispatch_context'];
    if (keys.some((key) => !allowed.includes(key))) throw new TypeError(`records[${index}] contains an unknown field.`);
  }
}

/**
 * Pure, zero-contact shadow evaluation.
 *
 * This function has no provider, database, network, environment, or file-write
 * dependency and receives its audit timestamp explicitly. The CLI that wraps it only
 * reads JSON and emits the returned report to stdout. A `would_call` result is never a
 * dispatch authorization.
 */
export function evaluateSolarExitShadowBatch(input, eligibility, { mode, phoneHmacKey, phoneHmacKeyId } = {}) {
  if (!MODES.has(mode)) throw new TypeError('mode must be explicitly set to offline or production.');
  validateBatchInput(input);
  if (!isPlainObject(eligibility)) throw new TypeError('eligibility must be a policy object.');
  const pseudonymization = normalizePhonePseudonymization(mode, phoneHmacKey, phoneHmacKeyId);

  const batch = {
    schema_version: input.schema_version,
    batch_id: input.batch_id,
    as_of: new Date(input.as_of).toISOString(),
    records: input.records,
    eligibility,
  };
  const asOfMs = Date.parse(batch.as_of);
  const policySha256 = sha256Canonical(eligibility);
  const productionBlockers = productionPolicyBlockers(eligibility, { asOf: batch.as_of });
  const policyBlockers = mode === 'production' ? productionBlockers : [];
  const policyBlocked = policyBlockers.length > 0;

  const keyCounts = new Map();
  for (const record of batch.records) {
    const lead = isPlainObject(record.lead) ? record.lead : {};
    if (!hasText(lead.organization_id) || !hasText(lead.lead_id) || typeof lead.phone_number !== 'string') continue;
    const key = `${lead.organization_id}\u0000${lead.lead_id}\u0000${lead.phone_number}`;
    keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
  }
  const duplicateKeys = new Set([...keyCounts.entries()].filter(([, count]) => count > 1).map(([key]) => key));
  const authorizationCounts = new Map();
  if (mode === 'production') {
    for (const record of batch.records) {
      const authorizationId = record.trusted_dispatch_context?.authorization_id;
      if (!hasText(authorizationId)) continue;
      authorizationCounts.set(authorizationId, (authorizationCounts.get(authorizationId) || 0) + 1);
    }
  }
  const duplicateAuthorizationIds = new Set(
    [...authorizationCounts.entries()].filter(([, count]) => count > 1).map(([authorizationId]) => authorizationId),
  );

  const decisions = batch.records.map((record, index) => decisionFor({
    batch,
    record,
    index,
    mode,
    asOf: batch.as_of,
    asOfMs,
    policySha256,
    policyBlocked,
    duplicateKeys,
    duplicateAuthorizationIds,
    pseudonymization,
  }));
  const wouldCall = decisions.filter((decision) => decision.decision === 'would_call').length;
  const blocked = decisions.length - wouldCall;
  const batchStatus = policyBlocked ? 'blocked_unresolved_policy' : 'evaluated';
  const reportWithoutHash = {
    schema_version: SOLAR_EXIT_SHADOW_SCHEMA_VERSION,
    evaluator: 'solar_exit_zero_contact_shadow',
    evaluator_version: SOLAR_EXIT_SHADOW_EVALUATOR_VERSION,
    mode,
    batch_id: batch.batch_id,
    as_of: batch.as_of,
    batch_status: batchStatus,
    phone_pseudonymization: {
      scheme: pseudonymization.scheme,
      key_id: pseudonymization.key_id,
      scope: 'organization_and_e164_phone',
      synthetic_only: pseudonymization.synthetic_only,
    },
    batch_input_fingerprint: keyedSensitiveFingerprint(input, 'batch-input-fingerprint', pseudonymization),
    policy_sha256: policySha256,
    policy_resolved_for_production: mode === 'production' ? !policyBlocked : false,
    policy_blockers: policyBlockers,
    production_policy_blockers: productionBlockers,
    production_policy_blockers_sha256: sha256Canonical(productionBlockers),
    decision_semantics: {
      would_call: 'Passed normalized lead binding and consent eligibility for shadow comparison only.',
      blocked: 'Failed at least one fail-closed shadow eligibility gate.',
      contact_authorized: false,
      launch_certificate_created: false,
    },
    side_effect_invariants: {
      lead_contacts: 0,
      provider_calls: 0,
      database_reads: 0,
      database_writes: 0,
      network_requests: 0,
      external_messages: 0,
      output_channel: 'return_value_or_cli_stdout_only',
    },
    totals: {
      records: decisions.length,
      would_call: wouldCall,
      blocked,
    },
    reason_counts: buildReasonCounts(decisions),
    decisions_sha256: sha256Canonical(decisions),
    decisions,
  };
  return {
    ...reportWithoutHash,
    report_sha256: sha256Canonical(reportWithoutHash),
  };
}

export function verifySolarExitShadowReport(report) {
  try {
    if (!isPlainObject(report) || !/^[0-9a-f]{64}$/i.test(report.report_sha256 || '')) return false;
    if (!Array.isArray(report.policy_blockers) || !Array.isArray(report.production_policy_blockers)) return false;
    if (!/^[0-9a-f]{64}$/i.test(report.production_policy_blockers_sha256 || '')) return false;
    if (sha256Canonical(report.production_policy_blockers) !== report.production_policy_blockers_sha256.toLowerCase()) return false;
    if (
      report.production_policy_blockers.some((blocker) => !hasText(blocker)) ||
      unique(report.production_policy_blockers).length !== report.production_policy_blockers.length ||
      [...report.production_policy_blockers].sort().some((blocker, index) => blocker !== report.production_policy_blockers[index])
    ) {
      return false;
    }
    if (report.mode === 'production') {
      if (canonicalJson(report.policy_blockers) !== canonicalJson(report.production_policy_blockers)) return false;
      const policyBlocked = report.production_policy_blockers.length > 0;
      if (report.policy_resolved_for_production !== !policyBlocked) return false;
      if (report.batch_status !== (policyBlocked ? 'blocked_unresolved_policy' : 'evaluated')) return false;
    } else if (report.mode === 'offline') {
      if (report.policy_blockers.length !== 0 || report.policy_resolved_for_production !== false || report.batch_status !== 'evaluated') return false;
    } else {
      return false;
    }

    const pseudonymization = report.phone_pseudonymization;
    if (
      !isPlainObject(pseudonymization) ||
      !hasText(pseudonymization.key_id) ||
      pseudonymization.scope !== 'organization_and_e164_phone'
    ) {
      return false;
    }
    if (report.mode === 'production') {
      if (
        pseudonymization.scheme !== PRODUCTION_PHONE_PSEUDONYM_SCHEME ||
        pseudonymization.synthetic_only !== false ||
        /(^|[._:-])(synthetic|demo|test)([._:-]|$)/i.test(pseudonymization.key_id)
      ) {
        return false;
      }
    } else if (
      pseudonymization.scheme !== SYNTHETIC_PHONE_PSEUDONYM_SCHEME ||
      pseudonymization.key_id !== SYNTHETIC_PHONE_PSEUDONYM_KEY_ID ||
      pseudonymization.synthetic_only !== true
    ) {
      return false;
    }
    const validSensitiveFingerprint = (fingerprint, { nullable = false } = {}) => {
      if (fingerprint === null) return nullable;
      return (
        isPlainObject(fingerprint) &&
        fingerprint.scheme === pseudonymization.scheme &&
        fingerprint.key_id === pseudonymization.key_id &&
        fingerprint.synthetic_only === pseudonymization.synthetic_only &&
        /^[0-9a-f]{64}$/.test(fingerprint.value || '')
      );
    };
    if (!validSensitiveFingerprint(report.batch_input_fingerprint)) return false;
    if (Object.prototype.hasOwnProperty.call(report, 'batch_input_sha256')) return false;

    const reportWithoutHash = { ...report };
    delete reportWithoutHash.report_sha256;
    if (sha256Canonical(reportWithoutHash) !== report.report_sha256.toLowerCase()) return false;
    if (!Array.isArray(report.decisions) || sha256Canonical(report.decisions) !== report.decisions_sha256) return false;
    return report.decisions.every((decision) => {
      if (
        !isPlainObject(decision) ||
        Object.prototype.hasOwnProperty.call(decision, 'phone_sha256') ||
        Object.prototype.hasOwnProperty.call(decision, 'source_record_sha256') ||
        Object.prototype.hasOwnProperty.call(decision, 'trusted_context_sha256') ||
        decision.contact_authorized !== false ||
        decision.provider_invocation_authorized !== false ||
        !validSensitiveFingerprint(decision.source_record_fingerprint) ||
        !validSensitiveFingerprint(decision.trusted_context_fingerprint, { nullable: true })
      ) {
        return false;
      }
      const pseudonym = decision.phone_pseudonym;
      if (pseudonym === null) return true;
      return (
        isPlainObject(pseudonym) &&
        pseudonym.scheme === pseudonymization.scheme &&
        pseudonym.key_id === pseudonymization.key_id &&
        pseudonym.scope === pseudonymization.scope &&
        pseudonym.synthetic_only === pseudonymization.synthetic_only &&
        /^[0-9a-f]{64}$/.test(pseudonym.value || '')
      );
    });
  } catch {
    return false;
  }
}
