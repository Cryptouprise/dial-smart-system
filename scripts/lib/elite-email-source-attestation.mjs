import {
  createHash,
  createHmac,
  createPublicKey,
  sign as signEd25519,
  verify as verifyEd25519,
} from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{7,255}$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[A-Za-z]{2,63}$/;
const SHA256 = /^[a-f0-9]{64}$/;
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
const ATTESTATION_FIELDS = Object.freeze([
  'kind', 'status', 'organization_id', 'campaign_id', 'source_system', 'source_release_reference',
  'recipient_manifest_sha256', 'suppression_snapshot_sha256', 'recipient_count',
  'email_permission_policy', 'suppression_policy', 'evidence_as_of', 'issued_at', 'expires_at',
  'signing_key_id', 'signer_principal_reference', 'public_key_spki_sha256',
]);

export class EliteEmailSourceAttestationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'EliteEmailSourceAttestationError';
    this.code = code;
  }
}

function plainObject(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new EliteEmailSourceAttestationError('OBJECT_REQUIRED', `${path} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new EliteEmailSourceAttestationError('OBJECT_REQUIRED', `${path} must be a plain object`);
  }
  return value;
}

function exact(value, path, fields) {
  const record = plainObject(value, path);
  if (Object.keys(record).length !== fields.length || fields.some((field) => !Object.hasOwn(record, field))) {
    throw new EliteEmailSourceAttestationError('SHAPE_INVALID', `${path} has an unexpected shape`);
  }
  return record;
}

function text(value, path, minimum, maximum) {
  if (typeof value !== 'string' || value !== value.trim() || value.length < minimum || value.length > maximum) {
    throw new EliteEmailSourceAttestationError('TEXT_INVALID', `${path} must be a trimmed ${minimum}-${maximum} character string`);
  }
  if (/[\x00-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/.test(value)) {
    throw new EliteEmailSourceAttestationError('TEXT_UNSAFE', `${path} contains unsafe formatting characters`);
  }
  return value;
}

function uuid(value, path) {
  const candidate = text(value, path, 36, 36);
  if (!UUID.test(candidate)) throw new EliteEmailSourceAttestationError('UUID_INVALID', `${path} must be a canonical lowercase UUID`);
  return candidate;
}

function reference(value, path) {
  const candidate = text(value, path, 8, 256);
  if (!REFERENCE.test(candidate)) throw new EliteEmailSourceAttestationError('REFERENCE_INVALID', `${path} must be a safe non-PII reference`);
  return candidate;
}

function timestamp(value, path) {
  const candidate = text(value, path, 20, 40);
  const parsed = Date.parse(candidate);
  if (Number.isNaN(parsed)) throw new EliteEmailSourceAttestationError('TIMESTAMP_INVALID', `${path} must be ISO-8601`);
  return new Date(parsed).toISOString();
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

function digest(value) {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function hmac(key, material) {
  return createHmac('sha256', key).update(material, 'utf8').digest('hex');
}

function key(value) {
  if (!(value instanceof Uint8Array) || value.byteLength < 32 || value.byteLength > 4096) {
    throw new EliteEmailSourceAttestationError('HMAC_KEY_INVALID', 'recipient_hmac_key must contain 32-4096 bytes');
  }
  const owned = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (new Set(owned).size < 16) {
    throw new EliteEmailSourceAttestationError('HMAC_KEY_WEAK', 'recipient_hmac_key must contain sufficient entropy');
  }
  return owned;
}

function email(value, path) {
  const candidate = text(value, path, 3, 320).toLowerCase();
  if (!EMAIL.test(candidate)) throw new EliteEmailSourceAttestationError('EMAIL_INVALID', `${path} must be an email address`);
  return candidate;
}

function attestationBody(input) {
  const source = exact(input, '$.source', [
    'version', 'organization_id', 'campaign_id', 'source_system', 'source_release_reference',
    'evidence_as_of', 'issued_at', 'expires_at', 'records',
  ]);
  if (source.version !== 'elite.solar.email.source-snapshot.v1') {
    throw new EliteEmailSourceAttestationError('VERSION_UNSUPPORTED', '$.source.version is unsupported');
  }
  const issuedAt = timestamp(source.issued_at, '$.source.issued_at');
  const expiresAt = timestamp(source.expires_at, '$.source.expires_at');
  const evidenceAsOf = timestamp(source.evidence_as_of, '$.source.evidence_as_of');
  const issuedMs = Date.parse(issuedAt);
  const expiresMs = Date.parse(expiresAt);
  const evidenceMs = Date.parse(evidenceAsOf);
  if (
    expiresMs <= issuedMs || evidenceMs > issuedMs ||
    issuedMs - evidenceMs > 5 * 60 * 1000 ||
    expiresMs - evidenceMs > 24 * 60 * 60 * 1000
  ) {
    throw new EliteEmailSourceAttestationError('WINDOW_INVALID', 'Source evidence must be current at issuance and expire within 24 hours');
  }
  if (!Array.isArray(source.records) || source.records.length < 1 || source.records.length > 25) {
    throw new EliteEmailSourceAttestationError('COHORT_INVALID', '$.source.records must contain 1-25 records');
  }
  const records = source.records.map((record, index) => {
    const item = exact(record, `$.source.records[${index}]`, [
      'recipient_email', 'source_contact_reference', 'email_permission_status',
      'email_permission_evidence_reference', 'suppression',
    ]);
    if (item.email_permission_status !== 'explicit_opt_in') {
      throw new EliteEmailSourceAttestationError('EMAIL_PERMISSION_REQUIRED', `$.source.records[${index}] lacks explicit email permission`);
    }
    const suppression = exact(item.suppression, `$.source.records[${index}].suppression`, [
      'global_suppressed', 'tenant_suppressed', 'campaign_suppressed', 'provider_suppressed',
      'unsubscribed', 'spam_complaint', 'permanent_bounce',
    ]);
    for (const [name, value] of Object.entries(suppression)) {
      if (typeof value !== 'boolean') throw new EliteEmailSourceAttestationError('SUPPRESSION_INVALID', `$.source.records[${index}].suppression.${name} must be boolean`);
      if (value) throw new EliteEmailSourceAttestationError('SUPPRESSION_ACTIVE', `$.source.records[${index}] has an active suppression`);
    }
    return Object.freeze({
      recipient_email: email(item.recipient_email, `$.source.records[${index}].recipient_email`),
      source_contact_reference: reference(item.source_contact_reference, `$.source.records[${index}].source_contact_reference`),
      email_permission_evidence_reference: reference(item.email_permission_evidence_reference, `$.source.records[${index}].email_permission_evidence_reference`),
    });
  });
  const contacts = new Set(records.map((record) => record.source_contact_reference));
  const recipients = new Set(records.map((record) => record.recipient_email));
  if (contacts.size !== records.length || recipients.size !== records.length) {
    throw new EliteEmailSourceAttestationError('DUPLICATE_RECIPIENT', 'Source contact and recipient email must be unique within the cohort');
  }
  return Object.freeze({
    organization_id: uuid(source.organization_id, '$.source.organization_id'),
    campaign_id: uuid(source.campaign_id, '$.source.campaign_id'),
    source_system: reference(source.source_system, '$.source.source_system'),
    source_release_reference: reference(source.source_release_reference, '$.source.source_release_reference'),
    evidence_as_of: evidenceAsOf,
    issued_at: issuedAt,
    expires_at: expiresAt,
    records,
  });
}

/**
 * Creates a signed, no-PII source/suppression proof from an external raw
 * reactivation cohort. It has no network, database, CRM, or provider client.
 */
export function buildEliteEmailSourceAttestation({ sourceSnapshot, recipientHmacKey, signingKey, signingKeyId, signerPrincipalReference, now = new Date() }) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new EliteEmailSourceAttestationError('NOW_INVALID', 'now must be a valid Date');
  const source = attestationBody(sourceSnapshot);
  if (Date.parse(source.issued_at) > now.getTime() || Date.parse(source.expires_at) <= now.getTime()) {
    throw new EliteEmailSourceAttestationError('EXPIRED', 'Source snapshot is not currently valid');
  }
  if (!signingKey || signingKey.asymmetricKeyType !== 'ed25519') {
    throw new EliteEmailSourceAttestationError('SIGNING_KEY_INVALID', 'signingKey must be Ed25519');
  }
  const hmacKey = key(recipientHmacKey);
  const recipientEntries = source.records.map((record) => Object.freeze({
    recipient_hmac: hmac(hmacKey, `elite-email-recipient-v1\n${source.organization_id}\n${record.recipient_email}`),
    source_contact_reference: record.source_contact_reference,
    email_permission_evidence_reference: record.email_permission_evidence_reference,
  })).sort((left, right) => left.recipient_hmac.localeCompare(right.recipient_hmac));
  const recipientManifestSha256 = digest({
    kind: 'elite_email_recipient_manifest_v1',
    organization_id: source.organization_id,
    campaign_id: source.campaign_id,
    source_release_reference: source.source_release_reference,
    recipients: recipientEntries.map((item) => item.recipient_hmac),
  });
  const suppressionSnapshotSha256 = digest({
    kind: 'elite_email_suppression_snapshot_v1',
    organization_id: source.organization_id,
    campaign_id: source.campaign_id,
    source_release_reference: source.source_release_reference,
    recipients: recipientEntries,
    all_current_suppression_checks_clear: true,
  });
  const signingPublicKey = createPublicKey(signingKey);
  const body = Object.freeze({
    kind: 'elite_email_source_suppression_attestation_v1',
    status: 'current_source_and_suppression_verified',
    organization_id: source.organization_id,
    campaign_id: source.campaign_id,
    source_system: source.source_system,
    source_release_reference: source.source_release_reference,
    recipient_manifest_sha256: recipientManifestSha256,
    suppression_snapshot_sha256: suppressionSnapshotSha256,
    recipient_count: source.records.length,
    email_permission_policy: 'explicit_opt_in_per_recipient',
    suppression_policy: 'all_current_negative_checks',
    evidence_as_of: source.evidence_as_of,
    issued_at: source.issued_at,
    expires_at: source.expires_at,
    signing_key_id: reference(signingKeyId, '$.signing_key_id'),
    signer_principal_reference: reference(signerPrincipalReference, '$.signer_principal_reference'),
    public_key_spki_sha256: createHash('sha256').update(signingPublicKey.export({ type: 'spki', format: 'der' })).digest('hex'),
  });
  return Object.freeze({
    ...body,
    signature_base64: signEd25519(null, Buffer.from(canonicalJson(body), 'utf8'), signingKey).toString('base64'),
    recipient_data_included: false,
    provider_action: 'none',
    authority: NO_AUTHORITY,
    side_effect_invariants: NO_SIDE_EFFECTS,
  });
}

/** Verifies only a no-PII attestation; it does not prepare or contact anyone. */
export function verifyEliteEmailSourceAttestation({ attestation, publicKey, now = new Date() }) {
  if (!publicKey || publicKey.asymmetricKeyType !== 'ed25519') {
    throw new EliteEmailSourceAttestationError('PUBLIC_KEY_INVALID', 'publicKey must be Ed25519');
  }
  const root = exact(attestation, '$.attestation', [
    ...ATTESTATION_FIELDS, 'signature_base64', 'recipient_data_included', 'provider_action', 'authority', 'side_effect_invariants',
  ]);
  const body = exact(Object.fromEntries(ATTESTATION_FIELDS.map((field) => [field, root[field]])), '$.attestation.body', ATTESTATION_FIELDS);
  if (
    body.kind !== 'elite_email_source_suppression_attestation_v1' ||
    body.status !== 'current_source_and_suppression_verified' ||
    body.email_permission_policy !== 'explicit_opt_in_per_recipient' ||
    body.suppression_policy !== 'all_current_negative_checks' ||
    root.recipient_data_included !== false || root.provider_action !== 'none' ||
    canonicalJson(root.authority) !== canonicalJson(NO_AUTHORITY) ||
    canonicalJson(root.side_effect_invariants) !== canonicalJson(NO_SIDE_EFFECTS)
  ) throw new EliteEmailSourceAttestationError('ATTESTATION_STATE_INVALID', 'Attestation violates its no-authority contract');
  const signature = text(root.signature_base64, '$.attestation.signature_base64', 88, 88);
  if (!/^(?:[A-Za-z0-9+/]{86}==)$/.test(signature)) throw new EliteEmailSourceAttestationError('SIGNATURE_INVALID', 'Attestation signature is malformed');
  const publicKeySha = createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex');
  if (text(body.public_key_spki_sha256, '$.attestation.public_key_spki_sha256', 64, 64).toLowerCase() !== publicKeySha) {
    throw new EliteEmailSourceAttestationError('PUBLIC_KEY_MISMATCH', 'Attestation key fingerprint is not configured');
  }
  for (const field of ['organization_id', 'campaign_id']) uuid(body[field], `$.attestation.${field}`);
  for (const field of ['source_system', 'source_release_reference', 'signing_key_id', 'signer_principal_reference']) reference(body[field], `$.attestation.${field}`);
  for (const field of ['recipient_manifest_sha256', 'suppression_snapshot_sha256']) {
    if (!SHA256.test(text(body[field], `$.attestation.${field}`, 64, 64).toLowerCase())) throw new EliteEmailSourceAttestationError('SHA256_INVALID', `$.attestation.${field} must be a digest`);
  }
  if (!Number.isInteger(body.recipient_count) || body.recipient_count < 1 || body.recipient_count > 25) throw new EliteEmailSourceAttestationError('COHORT_INVALID', 'recipient_count must be 1-25');
  const issued = Date.parse(timestamp(body.issued_at, '$.attestation.issued_at'));
  const expires = Date.parse(timestamp(body.expires_at, '$.attestation.expires_at'));
  const evidence = Date.parse(timestamp(body.evidence_as_of, '$.attestation.evidence_as_of'));
  if (
    expires <= issued || evidence > issued ||
    issued - evidence > 5 * 60 * 1000 ||
    expires - evidence > 24 * 60 * 60 * 1000 ||
    now.getTime() < issued || now.getTime() > expires
  ) {
    throw new EliteEmailSourceAttestationError('WINDOW_INVALID', 'Attestation is outside its valid evidence window');
  }
  const valid = verifyEd25519(null, Buffer.from(canonicalJson(body), 'utf8'), publicKey, Buffer.from(signature, 'base64'));
  return Object.freeze({
    valid,
    verification_status: valid ? 'current_source_and_suppression_verified' : 'signature_invalid',
    organization_id: body.organization_id,
    campaign_id: body.campaign_id,
    recipient_manifest_sha256: body.recipient_manifest_sha256,
    suppression_snapshot_sha256: body.suppression_snapshot_sha256,
    recipient_count: body.recipient_count,
    provider_action: 'none',
    authority: NO_AUTHORITY,
    side_effect_invariants: NO_SIDE_EFFECTS,
  });
}
