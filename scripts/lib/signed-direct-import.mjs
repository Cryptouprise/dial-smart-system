import { createHash, verify as verifySignature } from 'node:crypto';

import { canonicalJson } from './solar-exit-shadow-evaluator.mjs';

const ENVELOPE_SCHEMA_VERSION = '1.0.0';
const LEAD_FIELDS = Object.freeze([
  'lead_id', 'external_contact_id', 'organization_id', 'source_system', 'phone_number',
  'seller', 'lead_source', 'property_state', 'calling_state',
]);
const CONSENT_FIELDS = Object.freeze([
  'consent_artifact_id', 'lead_id', 'consumer_name', 'phone_number', 'dialed_phone_number',
  'seller', 'lead_source', 'source_form_version', 'consent_disclosure_text',
  'consent_text_version', 'signature_evidence', 'not_condition_of_purchase_disclosure',
  'ai_voice_calls_authorized', 'telemarketing_calls_authorized', 'captured_at', 'revoked',
  'property_state', 'calling_state', 'suppression_checks',
]);

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasText(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0;
}

function isResolvedText(value) {
  return hasText(value) && !/^__.*__$/.test(value);
}

function isTimestamp(value) {
  return hasText(value) && Number.isFinite(Date.parse(value));
}

function exactKeys(value, keys) {
  return isPlainObject(value) && Object.keys(value).every((key) => keys.includes(key)) && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function strictBase64(value) {
  if (!hasText(value) || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return null;
  const decoded = Buffer.from(value, 'base64');
  return decoded.toString('base64') === value ? decoded : null;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function assertProfile(profile) {
  const signing = profile?.signing || {};
  if (
    profile?.schema_version !== '1.0.0' ||
    profile?.mode !== 'signed_direct_import' ||
    profile?.enabled !== true ||
    profile?.gohighlevel_required !== false ||
    profile?.network_access_allowed !== false ||
    profile?.output_mode !== 'redacted_zero_contact_shadow_report_only' ||
    !isResolvedText(profile?.organization_id) ||
    !isResolvedText(profile?.legal_seller) ||
    !isResolvedText(profile?.source_system) ||
    !isResolvedText(profile?.allowed_lead_source) ||
    signing.algorithm !== 'ed25519' ||
    !isResolvedText(signing.signing_key_id) ||
    !isResolvedText(signing.signer_principal_id) ||
    !/^[a-f0-9]{64}$/i.test(signing.public_key_spki_sha256 || '') ||
    signing.signature_required !== true ||
    !Number.isInteger(signing.maximum_signature_window_hours) ||
    signing.maximum_signature_window_hours < 1 ||
    signing.maximum_signature_window_hours > 24 ||
    profile?.record_contract?.exact_lead_and_consent_bindings_required !== true ||
    profile?.record_contract?.per_lead_suppression_evidence_required !== true ||
    profile?.record_contract?.historical_interest_alone_authorizes_contact !== false ||
    profile?.record_contract?.historical_appointment_alone_authorizes_contact !== false ||
    profile?.record_contract?.contact_authorized_by_adapter !== false ||
    profile?.record_contract?.provider_invocation_authorized_by_adapter !== false
  ) throw new TypeError('Direct-import profile is unresolved or violates the zero-contact contract.');
}

function assertEnvelopeShape(envelope) {
  if (!exactKeys(envelope, ['schema_version', 'import', 'signature']) || envelope.schema_version !== ENVELOPE_SCHEMA_VERSION) {
    throw new TypeError(`Signed direct-import envelope schema_version must be ${ENVELOPE_SCHEMA_VERSION}.`);
  }
  const imported = envelope.import;
  if (!exactKeys(imported, ['export_id', 'as_of', 'issued_at', 'expires_at', 'organization_id', 'source_system', 'seller', 'lead_source', 'records'])) {
    throw new TypeError('Signed direct-import payload has an invalid shape.');
  }
  if (
    !hasText(imported.export_id) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(imported.export_id) ||
    !isTimestamp(imported.as_of) || !isTimestamp(imported.issued_at) || !isTimestamp(imported.expires_at) ||
    !hasText(imported.organization_id) || !hasText(imported.source_system) || !hasText(imported.seller) || !hasText(imported.lead_source) ||
    !Array.isArray(imported.records) || imported.records.length === 0 || imported.records.length > 10_000
  ) throw new TypeError('Signed direct-import payload has invalid identifiers or records.');
  if (!exactKeys(envelope.signature, ['algorithm', 'key_id', 'signer_principal_id', 'signature_base64'])) {
    throw new TypeError('Signed direct-import signature has an invalid shape.');
  }
  return imported;
}

function assertRecord(record, imported, index) {
  if (!exactKeys(record, ['lead', 'consent_evidence']) || !exactKeys(record.lead, LEAD_FIELDS) || !exactKeys(record.consent_evidence, CONSENT_FIELDS)) {
    throw new TypeError(`Signed direct-import record ${index + 1} has an invalid shape.`);
  }
  const lead = record.lead;
  const evidence = record.consent_evidence;
  if (
    lead.organization_id !== imported.organization_id ||
    lead.source_system !== imported.source_system ||
    lead.seller !== imported.seller ||
    lead.lead_source !== imported.lead_source ||
    evidence.seller !== imported.seller ||
    evidence.lead_source !== imported.lead_source
  ) throw new TypeError(`Signed direct-import record ${index + 1} does not match the signed export scope.`);
}

/**
 * Verifies a user-owned Ed25519 export and builds an in-memory ShadowBatch.
 * It has no network, provider, database, process, or file-write dependency.
 */
export function buildVerifiedDirectImportShadowBatch(envelope, profile, publicKey, { now = new Date() } = {}) {
  assertProfile(profile);
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new TypeError('Direct-import verification requires a valid current time.');
  const imported = assertEnvelopeShape(envelope);
  if (!publicKey || publicKey.asymmetricKeyType !== 'ed25519') throw new TypeError('Direct-import public key must be Ed25519.');
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  if (sha256(spki) !== profile.signing.public_key_spki_sha256.toLowerCase()) {
    throw new TypeError('Direct-import public key does not match the candidate-bound SPKI SHA-256.');
  }
  if (
    envelope.signature.algorithm !== 'ed25519' ||
    envelope.signature.key_id !== profile.signing.signing_key_id ||
    envelope.signature.signer_principal_id !== profile.signing.signer_principal_id
  ) throw new TypeError('Direct-import signer identity does not match the candidate-bound mapping.');
  const signature = strictBase64(envelope.signature.signature_base64);
  if (!signature || signature.length !== 64) throw new TypeError('Direct-import Ed25519 signature is invalid.');
  const signedPayload = Buffer.from(canonicalJson({ schema_version: envelope.schema_version, import: envelope.import }), 'utf8');
  if (!verifySignature(null, signedPayload, publicKey, signature)) throw new TypeError('Direct-import signature verification failed.');

  const issuedAt = Date.parse(imported.issued_at);
  const expiresAt = Date.parse(imported.expires_at);
  const asOf = Date.parse(imported.as_of);
  const nowMs = now.getTime();
  if (
    expiresAt <= issuedAt ||
    asOf < issuedAt ||
    asOf > expiresAt ||
    nowMs < issuedAt ||
    nowMs > expiresAt ||
    expiresAt - issuedAt > profile.signing.maximum_signature_window_hours * 60 * 60 * 1000
  ) {
    throw new TypeError('Direct-import signature window is invalid or expired for the explicit audit time.');
  }
  if (
    imported.organization_id !== profile.organization_id ||
    imported.source_system !== profile.source_system ||
    imported.seller !== profile.legal_seller ||
    imported.lead_source !== profile.allowed_lead_source
  ) throw new TypeError('Signed direct-import export scope does not match the candidate-bound mapping.');

  const trustEvidenceId = `signed-direct-import:${imported.export_id}:${profile.signing.signing_key_id}`;
  return {
    schema_version: ENVELOPE_SCHEMA_VERSION,
    batch_id: `direct-import:${imported.export_id}`,
    as_of: new Date(asOf).toISOString(),
    records: imported.records.map((record, index) => {
      assertRecord(record, imported, index);
      const lead = record.lead;
      const evidence = record.consent_evidence;
      return {
        lead,
        consent_evidence: evidence,
        trusted_dispatch_context: {
          authorization_id: `direct-shadow:${imported.export_id}:${index + 1}`,
          authorization_scope: 'solar_exit_shadow_evaluate_only',
          trust_evidence_id: trustEvidenceId,
          trust_level: 'cryptographically_verified_direct_import',
          issued_at: new Date(issuedAt).toISOString(),
          expires_at: new Date(expiresAt).toISOString(),
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
          consent_artifact_id: evidence.consent_artifact_id,
          source_form_version: evidence.source_form_version,
          consent_text_version: evidence.consent_text_version,
        },
      };
    }),
  };
}
