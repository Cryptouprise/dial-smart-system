import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export const DEFAULT_SOLAR_EXIT_BUNDLE_ROOT = resolve('campaigns/solar-exit');
const AUTHENTICATED_TRUST_ROOT = Symbol('authenticated-solar-exit-trust-root');

const CERTIFIED_DYNAMIC_VARIABLES = new Set([
  'lead_id',
  'current_time',
  'current_time_iso',
  'current_timezone',
  'current_date_ymd',
  'current_day_of_week',
  'first_name',
  'last_name',
  'full_name',
  'name',
  'company',
  'timezone',
  'city',
  'state',
  'is_callback',
  'contact.first_name',
  'contact.last_name',
  'contact.full_name',
  'contact.company',
  'contact.timezone',
  'contact.city',
  'contact.state',
  'contact.is_callback',
]);

const REQUIRED_CONVERSATION_TAGS = new Set([
  'ai_disclosure',
  'callback',
  'complaint',
  'consent_denied',
  'fraud_or_vulnerability',
  'no_guarantee',
  'no_legal_advice',
  'opt_out',
  'recording',
  'safety_emergency',
  'sensitive_data',
  'urgent_timing',
  'voicemail',
  'wrong_number',
]);

const REQUIRED_DISPOSITIONS = new Set([
  'ai_declined',
  'callback_requested',
  'company_complaint_escalated',
  'consent_not_verified',
  'do_not_call',
  'financial_advice_declined',
  'fraud_or_vulnerability_review',
  'invalid_or_disconnected',
  'jurisdiction_not_enabled',
  'legal_review_required',
  'needs_human',
  'no_answer',
  'not_interested',
  'provider_or_audio_failure',
  'qualified_review_requested',
  'recording_declined',
  'safety_emergency_ended',
  'urgent_human_review_requested',
  'voicemail_disabled',
  'wrong_number',
]);

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

const REQUIRED_APPROVAL_ROLES = Object.freeze([
  'product_owner',
  'operations',
  'compliance_or_counsel',
  'finance',
  'engineering_release_owner',
]);

const REQUIRED_CERTIFICATES = Object.freeze([
  ['canonical_staging_database_certificate', 'Canonical staging database certificate is missing or invalid.'],
  ['retell_owned_phone_e2e_certificate', 'Owned-phone Retell E2E certificate is missing or invalid.'],
  ['global_stop_drill_certificate', 'Global-stop drill certificate is missing or invalid.'],
  ['seller_dnc_drill_certificate', 'Seller-wide DNC drill certificate is missing or invalid.'],
  ['voice_opt_out_e2e_certificate', 'Spoken opt-out end-to-end certificate is missing or invalid.'],
  ['conversation_suite_certificate', 'Conversation-suite evidence certificate is missing or invalid.'],
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

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function parseCsvLine(line) {
  const cells = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      cells.push(value);
      value = '';
    } else {
      value += character;
    }
  }
  cells.push(value);
  return cells;
}

export function parseCsv(csv) {
  const lines = String(csv).replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
  return { headers, rows };
}

function normalizedRealPath(path) {
  const normalized = realpathSync(path);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function isPathInside(parent, child, { allowSame = false } = {}) {
  const pathFromParent = relative(parent, child);
  if (pathFromParent === '') return allowSame;
  return !isAbsolute(pathFromParent) && pathFromParent !== '..' && !pathFromParent.startsWith(`..${sep}`);
}

function isSafeRelativePath(value) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) return false;
  if (isAbsolute(value) || /^[a-z]:[\\/]/i.test(value) || /^[\\/]{2}/.test(value)) return false;
  const segments = value.split(/[\\/]+/);
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

function resolveConfinedFile(root, relativePath, label) {
  if (!isSafeRelativePath(relativePath)) throw new Error(`${label} must be a safe relative path.`);
  const rootReal = normalizedRealPath(root);
  const candidate = resolve(rootReal, relativePath);
  if (!existsSync(candidate)) throw new Error(`${label} does not exist: ${candidate}`);
  const candidateReal = normalizedRealPath(candidate);
  if (!isPathInside(rootReal, candidateReal)) throw new Error(`${label} escapes the campaign bundle root.`);
  if (!statSync(candidateReal).isFile()) throw new Error(`${label} is not a regular file.`);
  return candidateReal;
}

export function loadSolarExitBundle(root = DEFAULT_SOLAR_EXIT_BUNDLE_ROOT) {
  const bundleRoot = resolve(root);
  if (!existsSync(bundleRoot) || !statSync(bundleRoot).isDirectory()) {
    throw new Error(`Campaign bundle root does not exist: ${bundleRoot}`);
  }
  const manifestPath = resolveConfinedFile(bundleRoot, 'manifest.json', 'Campaign manifest');
  const manifest = readJson(manifestPath);
  const artifactPaths = {};
  const artifactPath = (key) => {
    const relative = manifest.artifacts?.[key];
    if (!relative) throw new Error(`Manifest is missing artifact path: ${key}`);
    const path = resolveConfinedFile(bundleRoot, relative, `Campaign artifact ${key}`);
    artifactPaths[key] = path;
    return path;
  };

  const syntheticLeadsCsv = readFileSync(artifactPath('synthetic_leads'), 'utf8');
  return {
    root: normalizedRealPath(bundleRoot),
    artifactPaths,
    manifest,
    prompt: readFileSync(artifactPath('agent_prompt'), 'utf8'),
    retell: readJson(artifactPath('retell_agent')),
    dispositions: readJson(artifactPath('dispositions')),
    eligibility: readJson(artifactPath('eligibility_policy')),
    ghl: readJson(artifactPath('ghl_mapping')),
    directImport: readJson(artifactPath('direct_import_mapping')),
    reactivation: readJson(artifactPath('reactivation_policy')),
    conversationTests: readJson(artifactPath('conversation_tests')),
    consentFixtures: readJson(artifactPath('synthetic_consent')),
    syntheticLeadsCsv,
    syntheticLeads: parseCsv(syntheticLeadsCsv),
  };
}

function placeholderOccurrences(value, path = '$', occurrences = []) {
  if (typeof value === 'string') {
    for (const match of value.matchAll(/__REQUIRED_[A-Z0-9_]+__/g)) {
      occurrences.push({ placeholder: match[0], path });
    }
  } else if (Array.isArray(value)) {
    value.forEach((entry, index) => placeholderOccurrences(entry, `${path}[${index}]`, occurrences));
  } else if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      placeholderOccurrences(entry, `${path}.${key}`, occurrences);
    }
  }
  return occurrences;
}

export function requiredPlaceholderOccurrences(bundle) {
  const { required_launch_placeholders: _declared, ...manifestRuntime } = bundle.manifest;
  return placeholderOccurrences({
    manifest: manifestRuntime,
    retell: bundle.retell,
    eligibility: bundle.eligibility,
    ghl: bundle.ghl,
    direct_import: bundle.directImport,
    reactivation: bundle.reactivation,
  }).filter((entry) => !(bundle.manifest.optional_adapter_placeholders || []).includes(entry.placeholder));
}

function allRetellTools(llm = {}) {
  const stateTools = Array.isArray(llm.states)
    ? llm.states.flatMap((state) => Array.isArray(state?.tools) ? state.tools : [])
    : [];
  return [
    ...(Array.isArray(llm.general_tools) ? llm.general_tools : []),
    ...(Array.isArray(llm.tools) ? llm.tools : []),
    ...(Array.isArray(llm.tool_functions) ? llm.tool_functions : []),
    ...stateTools,
  ];
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRequiredPlaceholder(value) {
  return typeof value === 'string' && /__REQUIRED_[A-Z0-9_]+__/.test(value);
}

function isResolvedText(value) {
  return hasText(value) && !isRequiredPlaceholder(value);
}

function isDirectImportProfileReady(profile, manifest, eligibility) {
  const signing = profile?.signing || {};
  return Boolean(
    profile?.schema_version === '1.0.0' &&
    profile?.mode === 'signed_direct_import' &&
    profile?.enabled === true &&
    profile?.gohighlevel_required === false &&
    profile?.network_access_allowed === false &&
    profile?.output_mode === 'redacted_zero_contact_shadow_report_only' &&
    profile?.organization_id === manifest.installation_bindings?.organization_id &&
    profile?.legal_seller === manifest.company?.legal_entity &&
    isResolvedText(profile?.source_system) &&
    isResolvedText(profile?.allowed_lead_source) &&
    (eligibility.consent?.approved_lead_sources || []).includes(profile.allowed_lead_source) &&
    signing.algorithm === 'ed25519' &&
    isResolvedText(signing.signing_key_id) &&
    isResolvedText(signing.signer_principal_id) &&
    isSha256(signing.public_key_spki_sha256) &&
    signing.signature_required === true &&
    Number.isInteger(signing.maximum_signature_window_hours) &&
    signing.maximum_signature_window_hours >= 1 &&
    signing.maximum_signature_window_hours <= 24 &&
    profile?.record_contract?.exact_lead_and_consent_bindings_required === true &&
    profile?.record_contract?.per_lead_suppression_evidence_required === true &&
    profile?.record_contract?.historical_interest_alone_authorizes_contact === false &&
    profile?.record_contract?.historical_appointment_alone_authorizes_contact === false &&
    profile?.record_contract?.contact_authorized_by_adapter === false &&
    profile?.record_contract?.provider_invocation_authorized_by_adapter === false,
  );
}

function sourceShadowPath(bundle, trustRoot) {
  const evidence = bundle.manifest.certification_evidence || {};
  const directImportReady = isDirectImportProfileReady(bundle.directImport, bundle.manifest, bundle.eligibility);
  const ghlReady = bundle.ghl?.inbound_enabled === true && isResolvedText(bundle.ghl?.location_id);
  if (
    directImportReady &&
    isValidCertificate(evidence.direct_import_shadow_reconciliation_certificate, bundle, 'direct_import_shadow_reconciliation_certificate', trustRoot) &&
    Number(evidence.direct_import_shadow_contacts_compared || 0) >= 25 &&
    evidence.direct_import_shadow_mismatch_rate === 0
  ) return 'direct_import';
  if (
    ghlReady &&
    isValidCertificate(evidence.ghl_shadow_reconciliation_certificate, bundle, 'ghl_shadow_reconciliation_certificate', trustRoot) &&
    Number(evidence.ghl_shadow_contacts_compared || 0) >= 25 &&
    evidence.ghl_shadow_mismatch_rate === 0
  ) return 'ghl';
  return null;
}

function unique(values) {
  return [...new Set(values)];
}

function isValidTimestamp(value) {
  return hasText(value) && !Number.isNaN(Date.parse(value));
}

function isValidPastOrPresentTimestamp(value) {
  return isValidTimestamp(value) && Date.parse(value) <= Date.now() + 300000;
}

function isSha256(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

function sha256(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function sha256Bytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalText(value) {
  const text = Buffer.isBuffer(value) ? value.toString('utf8') : String(value);
  return text.replace(/\r\n?/g, '\n');
}

function sha256CanonicalText(value) {
  return sha256(canonicalText(value));
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

export function computeLaunchManifestDigest(manifest) {
  const normalized = structuredClone(manifest);
  delete normalized.launch_approvals;
  delete normalized.certification_evidence;
  return sha256(canonicalJson(normalized));
}

export function computeSolarExitArtifactDigestMap(bundle) {
  return {
    agent_prompt: sha256CanonicalText(bundle.prompt),
    retell_agent: sha256(canonicalJson(bundle.retell)),
    dispositions: sha256(canonicalJson(bundle.dispositions)),
    eligibility_policy: sha256(canonicalJson(bundle.eligibility)),
    ghl_mapping: sha256(canonicalJson(bundle.ghl)),
    direct_import_mapping: sha256(canonicalJson(bundle.directImport)),
    reactivation_policy: sha256(canonicalJson(bundle.reactivation)),
    conversation_tests: sha256(canonicalJson(bundle.conversationTests)),
    synthetic_consent: sha256(canonicalJson(bundle.consentFixtures)),
    synthetic_leads: sha256CanonicalText(bundle.syntheticLeadsCsv),
  };
}

export function computeLaunchBundleDigest(bundle) {
  return sha256(canonicalJson({
    bundle_id: bundle.manifest.bundle_id,
    bundle_version: bundle.manifest.bundle_version,
    manifest_sha256: computeLaunchManifestDigest(bundle.manifest),
    artifact_sha256: computeSolarExitArtifactDigestMap(bundle),
  }));
}

export function computeCanonicalSourceDigest(bundle) {
  const manifest = structuredClone(bundle.manifest);
  if (manifest.release_provenance) manifest.release_provenance.canonical_source_sha256 = null;
  const knownFiles = new Set([
    normalizedRealPath(resolve(bundle.root, 'manifest.json')),
    ...Object.values(bundle.artifactPaths || {}).map(normalizedRealPath),
  ]);
  const evidenceRelative = manifest.release_provenance?.allowed_evidence_root;
  const evidenceRoot = isSafeRelativePath(evidenceRelative) ? resolve(bundle.root, evidenceRelative) : null;
  return sha256(canonicalJson({
    manifest,
    artifact_sha256: computeSolarExitArtifactDigestMap(bundle),
    // The trust root covers the executable manifest and structured artifacts.
    // Narrative/evidence files are validated separately and are intentionally
    // excluded so checkout transport and filesystem locale cannot alter it.
    supplemental_files: [],
  }));
}

export function loadSolarExitTrustRoot(path, { expectedSha256, candidateRoot } = {}) {
  if (!isSha256(expectedSha256)) throw new Error('An externally pinned SOLAR_EXIT_TRUST_ROOT_SHA256 is required.');
  const trustPath = resolve(path);
  if (!existsSync(trustPath) || !statSync(trustPath).isFile()) throw new Error(`Trust root does not exist: ${trustPath}`);
  const trustReal = normalizedRealPath(trustPath);
  const candidateReal = candidateRoot && existsSync(candidateRoot) ? normalizedRealPath(candidateRoot) : null;
  const canonicalReal = existsSync(DEFAULT_SOLAR_EXIT_BUNDLE_ROOT) ? normalizedRealPath(DEFAULT_SOLAR_EXIT_BUNDLE_ROOT) : null;
  if (candidateReal && (trustReal === candidateReal || isPathInside(candidateReal, trustReal))) {
    throw new Error('Trust root must be stored outside the release-candidate directory.');
  }
  if (canonicalReal && (trustReal === canonicalReal || isPathInside(canonicalReal, trustReal))) {
    throw new Error('Trust root must be stored outside the canonical source template.');
  }
  const bytes = readFileSync(trustReal);
  const actualSha256 = sha256Bytes(bytes);
  if (actualSha256.toLowerCase() !== expectedSha256.toLowerCase()) {
    throw new Error('Trust-root SHA-256 does not match the externally pinned value.');
  }
  const trustRoot = JSON.parse(bytes.toString('utf8'));
  Object.defineProperty(trustRoot, AUTHENTICATED_TRUST_ROOT, {
    configurable: false,
    enumerable: false,
    value: { path: trustReal, sha256: actualSha256 },
    writable: false,
  });
  return trustRoot;
}

// The digest is deliberately available only after loadSolarExitTrustRoot has
// verified the file against the separately controlled environment value.  A
// release compiler must never accept an arbitrary trust-root hash from a CLI
// request or browser payload.
export function authenticatedSolarExitTrustRootSha256(trustRoot) {
  const digest = trustRoot?.[AUTHENTICATED_TRUST_ROOT]?.sha256;
  if (!isSha256(digest)) throw new Error('A verified external Solar Exit trust root is required.');
  return digest.toLowerCase();
}

function expectedProviderBinding(bundle) {
  return {
    provider: bundle.retell.provider,
    agent_id: bundle.retell.agent?.agent_id,
    agent_version: bundle.retell.agent?.version,
    llm_id: bundle.retell.llm?.llm_id,
    llm_version: bundle.retell.llm?.version,
    from_number: bundle.retell.outbound_call_defaults?.from_number,
    webhook_url: bundle.retell.agent?.webhook_url,
  };
}

function isResolvedProviderBinding(value) {
  return Boolean(
    value &&
    value.provider === 'retell' &&
    hasText(value.agent_id) &&
    !isRequiredPlaceholder(value.agent_id) &&
    Number.isSafeInteger(value.agent_version) &&
    value.agent_version >= 0 &&
    hasText(value.llm_id) &&
    !isRequiredPlaceholder(value.llm_id) &&
    Number.isSafeInteger(value.llm_version) &&
    value.llm_version >= 0 &&
    /^\+[1-9]\d{7,14}$/.test(value.from_number || '') &&
    !isRequiredPlaceholder(value.from_number) &&
    /^https:\/\//i.test(value.webhook_url || '') &&
    !isRequiredPlaceholder(value.webhook_url)
  );
}

function evidenceBindingMatches(value, bundle) {
  const expectedProvider = expectedProviderBinding(bundle);
  return Boolean(
    value.bundle_id === bundle.manifest.bundle_id &&
    value.bundle_version === bundle.manifest.bundle_version &&
    value.manifest_sha256 === computeLaunchManifestDigest(bundle.manifest) &&
    value.bundle_sha256 === computeLaunchBundleDigest(bundle) &&
    isResolvedProviderBinding(expectedProvider) &&
    canonicalJson(value.provider_binding) === canonicalJson(expectedProvider)
  );
}

function evidenceArtifactHashMatches(bundle, artifactPath, expectedSha256) {
  try {
    if (!isSha256(expectedSha256) || !isSafeRelativePath(artifactPath)) return false;
    const evidenceRelative = bundle.manifest.release_provenance?.allowed_evidence_root;
    if (!isSafeRelativePath(evidenceRelative)) return false;
    const bundleReal = normalizedRealPath(bundle.root);
    const evidenceLexical = resolve(bundleReal, evidenceRelative);
    if (!existsSync(evidenceLexical) || !statSync(evidenceLexical).isDirectory()) return false;
    const evidenceReal = normalizedRealPath(evidenceLexical);
    if (!isPathInside(bundleReal, evidenceReal)) return false;
    const artifactLexical = resolve(evidenceReal, artifactPath);
    if (!existsSync(artifactLexical) || !statSync(artifactLexical).isFile()) return false;
    const artifactReal = normalizedRealPath(artifactLexical);
    if (!isPathInside(evidenceReal, artifactReal)) return false;
    return sha256Bytes(readFileSync(artifactReal)).toLowerCase() === expectedSha256.toLowerCase();
  } catch {
    return false;
  }
}

function trustRootMatchesBundle(trustRoot, bundle) {
  return Boolean(
    trustRoot?.[AUTHENTICATED_TRUST_ROOT] &&
    trustRoot.schema_version === '1.0.0' &&
    hasText(trustRoot.trust_root_id) &&
    trustRoot.bundle_id === bundle.manifest.bundle_id &&
    trustRoot.bundle_version === bundle.manifest.bundle_version &&
    trustRoot.manifest_sha256 === computeLaunchManifestDigest(bundle.manifest) &&
    trustRoot.bundle_sha256 === computeLaunchBundleDigest(bundle) &&
    canonicalJson(trustRoot.provider_binding) === canonicalJson(expectedProviderBinding(bundle)) &&
    Array.isArray(trustRoot.principals)
  );
}

function trustPrincipal(trustRoot, principalId) {
  return trustRoot.principals.find((principal) => principal?.principal_id === principalId);
}

function isValidApproval(value, bundle, role, trustRoot) {
  const principal = trustRootMatchesBundle(trustRoot, bundle) ? trustPrincipal(trustRoot, value?.principal_id) : null;
  const attestation = trustRoot?.approval_attestations?.[role];
  return Boolean(
    value &&
    typeof value === 'object' &&
    value.role === role &&
    value.approved === true &&
    hasText(value.approver) &&
    hasText(value.principal_id) &&
    isValidPastOrPresentTimestamp(value.approved_at) &&
    hasText(value.evidence_id) &&
    value.evidence_id.trim().length >= 8 &&
    hasText(value.artifact_path) &&
    isSha256(value.evidence_sha256) &&
    evidenceBindingMatches(value, bundle) &&
    evidenceArtifactHashMatches(bundle, value.artifact_path, value.evidence_sha256) &&
    principal?.display_name === value.approver &&
    Array.isArray(principal?.roles) &&
    principal.roles.includes(role) &&
    attestation?.principal_id === value.principal_id &&
    attestation?.evidence_id === value.evidence_id &&
    attestation?.artifact_path === value.artifact_path &&
    attestation?.evidence_sha256 === value.evidence_sha256
  );
}

function isValidCertificate(value, bundle, certificateType, trustRoot) {
  const principal = trustRootMatchesBundle(trustRoot, bundle) ? trustPrincipal(trustRoot, value?.issuer_principal_id) : null;
  const attestation = trustRoot?.certificate_attestations?.[certificateType];
  return Boolean(
    value &&
    typeof value === 'object' &&
    value.certificate_type === certificateType &&
    hasText(value.certificate_id) &&
    value.certificate_id.trim().length >= 8 &&
    hasText(value.issuer) &&
    hasText(value.issuer_principal_id) &&
    isValidPastOrPresentTimestamp(value.issued_at) &&
    value.result === 'pass' &&
    value.subject_version === bundle.manifest.bundle_version &&
    hasText(value.artifact_path) &&
    isSha256(value.sha256) &&
    evidenceBindingMatches(value, bundle) &&
    evidenceArtifactHashMatches(bundle, value.artifact_path, value.sha256) &&
    principal?.display_name === value.issuer &&
    Array.isArray(principal?.roles) &&
    principal.roles.includes('certificate_issuer') &&
    attestation?.issuer_principal_id === value.issuer_principal_id &&
    attestation?.certificate_id === value.certificate_id &&
    attestation?.artifact_path === value.artifact_path &&
    attestation?.sha256 === value.sha256
  );
}

function isValidStateRuleSource(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    hasText(value.policy_id) &&
    hasText(value.approver) &&
    isValidPastOrPresentTimestamp(value.approved_at) &&
    isSha256(value.sha256) &&
    Array.isArray(value.source_urls) &&
    value.source_urls.length > 0 &&
    value.source_urls.every((url) => /^https:\/\//i.test(url))
  );
}

function isValidConsentArtifact(value, expectedSeller) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    hasText(value.consent_artifact_id) &&
    value.seller === expectedSeller &&
    hasText(value.lead_source) &&
    hasText(value.source_form_version) &&
    hasText(value.consent_text_version) &&
    isSha256(value.disclosure_sha256) &&
    value.ai_voice_calls_authorized === true &&
    value.telemarketing_calls_authorized === true &&
    value.not_condition_of_purchase === true &&
    isValidPastOrPresentTimestamp(value.effective_from) &&
    (!value.effective_to || (isValidTimestamp(value.effective_to) && Date.parse(value.effective_to) >= Date.now())) &&
    hasText(value.approver) &&
    isValidPastOrPresentTimestamp(value.approved_at)
  );
}

function launchBlockers(bundle, placeholders, trustRoot) {
  const blockers = [];
  const { manifest, eligibility, retell, ghl, directImport } = bundle;
  const evidence = manifest.certification_evidence || {};
  const approvals = manifest.launch_approvals || {};

  if (manifest.production_launch_allowed !== true) blockers.push('Production launch flag is false.');
  if (manifest.bundle_status !== 'launch_approved') blockers.push('Bundle status is not launch_approved.');
  if (placeholders.length > 0) {
    blockers.push(`${unique(placeholders.map((entry) => entry.placeholder)).length} required launch value(s) remain unresolved.`);
  }
  if ((eligibility.consent?.approved_lead_sources || []).length === 0) blockers.push('No production lead source is approved.');
  if ((eligibility.consent?.approved_consent_text_versions || []).length === 0) blockers.push('No production consent disclosure version is approved.');
  if ((eligibility.consent?.approved_consent_artifacts || []).length === 0) blockers.push('No structured production consent artifact is approved.');
  if ((eligibility.jurisdiction?.approved_property_states || []).length === 0) blockers.push('No property state is approved.');
  if ((eligibility.jurisdiction?.approved_calling_states || []).length === 0) blockers.push('No calling state is approved.');
  if (eligibility.consent?.required_seller !== manifest.company?.legal_entity) blockers.push('Consent seller does not exactly match the disclosed legal seller.');
  if (!Number.isSafeInteger(retell.agent?.version) || retell.agent.version < 0 || retell.agent?.is_published !== true) {
    blockers.push('The exact published Retell agent version is not certified.');
  }
  if (!Number.isSafeInteger(retell.llm?.version) || retell.llm.version < 0 || retell.llm?.is_published !== true) {
    blockers.push('The exact published Retell LLM version is not certified.');
  }
  const directImportReady = isDirectImportProfileReady(directImport, manifest, eligibility);
  const ghlReady = ghl.inbound_enabled === true && isResolvedText(ghl.location_id);
  if (!directImportReady && !ghlReady) blockers.push('No resolved source adapter is ready: configure signed direct import or signed GHL shadow ingestion.');
  if (!trustRootMatchesBundle(trustRoot, bundle)) {
    blockers.push('An externally pinned, authenticated launch trust root is missing or does not match this exact bundle and provider target.');
  }
  if (REQUIRED_APPROVAL_ROLES.some((role) => !isValidApproval(approvals[role], bundle, role, trustRoot))) {
    blockers.push('Product, operations, compliance, finance, and engineering approvals are incomplete.');
  }
  for (const [key, label] of REQUIRED_CERTIFICATES) {
    if (!isValidCertificate(evidence[key], bundle, key, trustRoot)) blockers.push(label);
  }
  if (!sourceShadowPath(bundle, trustRoot)) {
    blockers.push('No valid source-shadow evidence path: a signed direct-import or GHL reconciliation certificate must prove 25 clean records with zero mismatches.');
  }
  if (Number(evidence.owned_phone_consecutive_passes || 0) < 20) blockers.push('Fewer than 20 consecutive owned-phone calls passed.');
  if (evidence.conversation_contract_pass_rate !== 1) blockers.push('Conversation contract pass rate is not 100%.');
  return unique(blockers);
}

export function validateSolarExitBundleData(bundle, { mode = 'offline', trustRoot = null } = {}) {
  if (!['offline', 'installation', 'launch'].includes(mode)) throw new Error(`Unsupported validation mode: ${mode}`);
  const issues = [];
  const add = (severity, code, message, path) => issues.push({ severity, code, message, path });
  const check = (condition, code, message, path, severity = 'error') => {
    if (!condition) add(severity, code, message, path);
  };
  const { manifest, prompt, retell, dispositions, eligibility, ghl, directImport, reactivation, conversationTests, consentFixtures, syntheticLeads } = bundle;

  check(manifest.schema_version === '1.0.0', 'MANIFEST_SCHEMA', 'Manifest schema_version must be 1.0.0.', 'manifest.schema_version');
  check(manifest.bundle_id === 'elite-solar-recovery-solar-exit-database-reactivation', 'BUNDLE_ID', 'Unexpected Solar Exit bundle ID.', 'manifest.bundle_id');
  check(manifest.campaign?.provider === retell.provider && retell.provider === 'retell', 'PROVIDER_BINDING', 'Manifest and provider artifact must both bind to Retell.', 'manifest.campaign.provider');
  const provenance = manifest.release_provenance || {};
  check(isSha256(provenance.canonical_source_sha256), 'SOURCE_DIGEST', 'A canonical source SHA-256 declaration is required.', 'manifest.release_provenance.canonical_source_sha256');
  check(isSafeRelativePath(provenance.allowed_evidence_root), 'EVIDENCE_ROOT', 'Evidence root must be a confined relative directory.', 'manifest.release_provenance.allowed_evidence_root');
  const canonicalRoot = normalizedRealPath(DEFAULT_SOLAR_EXIT_BUNDLE_ROOT);
  const currentRoot = normalizedRealPath(bundle.root);
  if (mode === 'offline') {
    check(currentRoot === canonicalRoot, 'CANONICAL_SOURCE_ROOT', 'Offline source validation is permitted only for the canonical Solar Exit template root.', 'bundle.root');
    check(provenance.source_parent === null, 'SOURCE_PARENT', 'Canonical source must not claim a release-candidate parent.', 'manifest.release_provenance.source_parent');
    check(provenance.release_candidate_id === null && provenance.created_at === null, 'SOURCE_RELEASE_ID', 'Canonical source must not carry release-candidate identity.', 'manifest.release_provenance');
    try {
      check(computeCanonicalSourceDigest(bundle) === provenance.canonical_source_sha256, 'SOURCE_TEMPLATE_DRIFT', 'Canonical Solar Exit source content no longer matches its pinned digest.', 'manifest.release_provenance.canonical_source_sha256');
    } catch (error) {
      add('error', 'SOURCE_TEMPLATE_DRIFT', `Canonical source digest could not be verified: ${error instanceof Error ? error.message : String(error)}`, 'manifest.release_provenance.canonical_source_sha256');
    }
  } else {
    check(currentRoot !== canonicalRoot, 'RELEASE_ISOLATION', 'Installation and launch candidates must be an isolated copy, never the canonical source directory.', 'bundle.root');
    try {
      const canonicalBundle = loadSolarExitBundle(DEFAULT_SOLAR_EXIT_BUNDLE_ROOT);
      const canonicalDigest = computeCanonicalSourceDigest(canonicalBundle);
      const declaredCanonicalDigest = canonicalBundle.manifest.release_provenance?.canonical_source_sha256;
      check(isSha256(declaredCanonicalDigest) && canonicalDigest === declaredCanonicalDigest, 'SOURCE_TEMPLATE_DRIFT', 'Canonical source template does not match its pinned digest.', 'canonical.manifest.release_provenance.canonical_source_sha256');
      check(provenance.canonical_source_sha256 === declaredCanonicalDigest, 'RELEASE_SOURCE_DIGEST', 'Release candidate does not bind to the current canonical source digest.', 'manifest.release_provenance.canonical_source_sha256');
      check(
        provenance.source_parent?.bundle_id === canonicalBundle.manifest.bundle_id &&
        provenance.source_parent?.bundle_version === canonicalBundle.manifest.bundle_version &&
        provenance.source_parent?.sha256 === declaredCanonicalDigest,
        'RELEASE_SOURCE_PARENT',
        'Release candidate lacks an exact canonical source-parent binding.',
        'manifest.release_provenance.source_parent',
      );
    } catch (error) {
      add('error', 'SOURCE_TEMPLATE_DRIFT', `Canonical source provenance could not be verified: ${error instanceof Error ? error.message : String(error)}`, 'manifest.release_provenance');
    }
    check(hasText(provenance.release_candidate_id) && provenance.release_candidate_id.length >= 8, 'RELEASE_ID', 'An immutable release-candidate ID is required.', 'manifest.release_provenance.release_candidate_id');
    check(isValidPastOrPresentTimestamp(provenance.created_at), 'RELEASE_CREATED_AT', 'Release-candidate creation timestamp is required.', 'manifest.release_provenance.created_at');
  }
  check(manifest.campaign?.status === 'draft', 'DRAFT_ONLY', 'Campaign target state must remain draft.', 'manifest.campaign.status');
  check(manifest.campaign?.campaign_type === 'database_reactivation', 'REACTIVATION_CAMPAIGN_TYPE', 'The Elite pilot must be a database-reactivation campaign.', 'manifest.campaign.campaign_type');
  check(manifest.campaign?.provider === 'retell', 'RETELL_ONLY', 'The first pilot must use Retell only.', 'manifest.campaign.provider');
  check(manifest.campaign?.calls_per_minute === 1, 'RATE_LIMIT', 'First pilot is limited to one call per minute.', 'manifest.campaign.calls_per_minute');
  check(manifest.campaign?.max_calls_per_day === 5, 'DAILY_LIMIT', 'First pilot is limited to five calls per day.', 'manifest.campaign.max_calls_per_day');
  check(manifest.campaign?.max_attempts === 1, 'ATTEMPT_LIMIT', 'First pilot permits one attempt per lead.', 'manifest.campaign.max_attempts');
  check(manifest.campaign?.calling_hours_start === '10:00' && manifest.campaign?.calling_hours_end === '17:00', 'CALLING_WINDOW', 'First pilot calling window must be 10:00-17:00 lead-local.', 'manifest.campaign');
  check(hasText(manifest.campaign?.timezone), 'CAMPAIGN_TIMEZONE', 'A valid conservative campaign timezone is required.', 'manifest.campaign.timezone');
  check(manifest.campaign?.timezone_strategy === 'lead_local_at_provider_boundary', 'LEAD_LOCAL_TIME', 'Provider boundary must enforce lead-local time.', 'manifest.campaign.timezone_strategy');
  check(manifest.campaign?.workflow_id === null, 'NO_WORKFLOW', 'Workflow fanout must remain disabled.', 'manifest.campaign.workflow_id');
  for (const flag of ['sms_enabled', 'voicemail_enabled', 'live_transfer_enabled', 'booking_enabled', 'cold_calling_enabled']) {
    check(manifest.campaign?.[flag] === false, 'FEATURE_DISABLED', `${flag} must be false.`, `manifest.campaign.${flag}`);
  }
  for (const flag of ['manual_batch_approval_required', 'human_supervision_required', 'global_stop_required']) {
    check(manifest.launch_profile?.[flag] === true, 'PILOT_CONTROL', `${flag} must be true.`, `manifest.launch_profile.${flag}`);
  }
  check(manifest.launch_profile?.initial_batch_size === 5, 'CANARY_SIZE', 'Initial real-lead batch must contain five leads.', 'manifest.launch_profile.initial_batch_size');
  check(manifest.launch_profile?.source_mode === 'signed_direct_import_primary', 'SOURCE_MODE', 'The Elite pilot must support signed direct import as its primary source path.', 'manifest.launch_profile.source_mode');
  check(manifest.launch_profile?.ghl_mode === 'optional_shadow_adapter', 'GHL_OPTIONAL', 'GHL must remain an optional shadow adapter, never the required intake source.', 'manifest.launch_profile.ghl_mode');
  check(manifest.launch_profile?.cohort === 'consented_database_reactivation_only', 'REACTIVATION_COHORT', 'The first cohort must be consented database reactivation only.', 'manifest.launch_profile.cohort');

  check(directImport?.schema_version === '1.0.0', 'DIRECT_IMPORT_SCHEMA', 'Signed direct-import mapping schema_version must be 1.0.0.', 'direct-import-mapping.json.schema_version');
  check(directImport?.mode === 'signed_direct_import', 'DIRECT_IMPORT_MODE', 'Elite must support signed direct import.', 'direct-import-mapping.json.mode');
  check(directImport?.enabled === true, 'DIRECT_IMPORT_ENABLED', 'Signed direct import must be enabled for the Elite pilot.', 'direct-import-mapping.json.enabled');
  check(directImport?.gohighlevel_required === false, 'DIRECT_IMPORT_GHL_OPTIONAL', 'Signed direct import must not require GHL.', 'direct-import-mapping.json.gohighlevel_required');
  check(directImport?.network_access_allowed === false && directImport?.output_mode === 'redacted_zero_contact_shadow_report_only', 'DIRECT_IMPORT_NO_EGRESS', 'Direct import may only create a redacted zero-contact report.', 'direct-import-mapping.json');
  check(directImport?.signing?.algorithm === 'ed25519' && directImport?.signing?.signature_required === true, 'DIRECT_IMPORT_SIGNATURE', 'Direct import requires an Ed25519 signature.', 'direct-import-mapping.json.signing');
  check(Number.isInteger(directImport?.signing?.maximum_signature_window_hours) && directImport.signing.maximum_signature_window_hours >= 1 && directImport.signing.maximum_signature_window_hours <= 24, 'DIRECT_IMPORT_SIGNATURE_WINDOW', 'Direct-import signatures must expire within 24 hours.', 'direct-import-mapping.json.signing.maximum_signature_window_hours');
  for (const [field, expected] of Object.entries({
    exact_lead_and_consent_bindings_required: true,
    per_lead_suppression_evidence_required: true,
    historical_interest_alone_authorizes_contact: false,
    historical_appointment_alone_authorizes_contact: false,
    contact_authorized_by_adapter: false,
    provider_invocation_authorized_by_adapter: false,
  })) {
    check(directImport?.record_contract?.[field] === expected, 'DIRECT_IMPORT_CONTRACT', `Direct-import ${field} has an unsafe value.`, `direct-import-mapping.json.record_contract.${field}`);
  }

  check(reactivation?.schema_version === '1.0.0', 'REACTIVATION_SCHEMA', 'Reactivation policy schema_version must be 1.0.0.', 'reactivation-policy.json.schema_version');
  check(reactivation?.mode === 'consented_database_reactivation', 'REACTIVATION_MODE', 'Reactivation policy must use the consented database-reactivation mode.', 'reactivation-policy.json.mode');
  check(reactivation?.default_decision === 'deny', 'REACTIVATION_FAIL_CLOSED', 'Reactivation policy must deny by default.', 'reactivation-policy.json.default_decision');
  check(reactivation?.historical_interest_alone_authorizes_contact === false, 'REACTIVATION_NO_INFERRED_CONSENT', 'Historical interest cannot authorize a reactivation call.', 'reactivation-policy.json.historical_interest_alone_authorizes_contact');
  check(reactivation?.historical_appointment_alone_authorizes_contact === false, 'REACTIVATION_NO_INFERRED_CONSENT', 'Historical appointments cannot authorize a reactivation call.', 'reactivation-policy.json.historical_appointment_alone_authorizes_contact');
  check(reactivation?.read_only_shadow_first === true, 'REACTIVATION_SHADOW_FIRST', 'Reactivation must begin with a read-only shadow.', 'reactivation-policy.json.read_only_shadow_first');
  check(reactivation?.source_scope?.must_match_approved_consent_artifact === true, 'REACTIVATION_CONSENT_BINDING', 'Reactivation requires an approved consent artifact.', 'reactivation-policy.json.source_scope.must_match_approved_consent_artifact');
  check(reactivation?.source_scope?.must_match_exact_seller === true && reactivation?.source_scope?.must_match_exact_phone === true, 'REACTIVATION_IDENTITY_BINDING', 'Reactivation requires exact seller and phone bindings.', 'reactivation-policy.json.source_scope');
  for (const flag of ['automatic_retry_enabled', 'sms_enabled', 'voicemail_enabled', 'booking_enabled', 'live_transfer_enabled', 'crm_writeback_enabled', 'workflow_triggering_enabled']) {
    check(reactivation?.selection_controls?.[flag] === false, 'REACTIVATION_FEATURE_DISABLED', `${flag} must be false for the Elite pilot.`, `reactivation-policy.json.selection_controls.${flag}`);
  }
  check(reactivation?.selection_controls?.maximum_attempts_per_lead === 1, 'REACTIVATION_ATTEMPT_LIMIT', 'Reactivation pilot permits one attempt per lead.', 'reactivation-policy.json.selection_controls.maximum_attempts_per_lead');

  check(retell.provider === 'retell', 'RETELL_CONFIG', 'Retell target file must name the Retell provider.', 'retell.provider');
  check(retell.agent?.opt_in_signed_url === true, 'SIGNED_URLS', 'Provider recording and log URLs must be signed.', 'retell.agent.opt_in_signed_url');
  check(retell.agent?.data_storage_setting === 'everything_except_pii', 'RETENTION_MODE', 'Retell data storage must exclude PII.', 'retell.agent.data_storage_setting');
  check(retell.agent?.data_storage_retention_days === 30, 'RETENTION_DAYS', 'Retell retention must be 30 days.', 'retell.agent.data_storage_retention_days');
  check(Number.isSafeInteger(retell.agent?.max_call_duration_ms) && retell.agent.max_call_duration_ms <= 360000, 'MAX_DURATION', 'Retell maximum duration must be an integer no greater than six minutes.', 'retell.agent.max_call_duration_ms');
  check(retell.outbound_call_defaults?.max_call_duration_ms === retell.agent?.max_call_duration_ms, 'CALL_DURATION_PIN', 'Per-call maximum duration must match the certified agent target.', 'retell.outbound_call_defaults.max_call_duration_ms');
  check(retell.agent?.voicemail_option?.action?.type === 'hangup', 'VOICEMAIL_HANGUP', 'Retell voicemail detection must hang up without leaving a message.', 'retell.agent.voicemail_option');
  check(retell.policy_controls?.voicemail_policy === 'provider_detect_and_hangup_without_message', 'VOICEMAIL_POLICY', 'Internal voicemail policy must require provider hangup without a message.', 'retell.policy_controls.voicemail_policy');
  check(retell.policy_controls?.recording_consent_required_before_intake === true, 'RECORDING_CONSENT', 'Affirmative recording consent must precede intake.', 'retell.policy_controls.recording_consent_required_before_intake');
  check(!Object.prototype.hasOwnProperty.call(retell.agent || {}, 'voicemail_enabled'), 'RETELL_PROVIDER_SCHEMA', 'Custom voicemail_enabled is not a Retell Voice Agent field.', 'retell.agent.voicemail_enabled');
  check(!Object.prototype.hasOwnProperty.call(retell, 'post_call_analysis'), 'RETELL_PROVIDER_SCHEMA', 'Post-call analysis must be nested under agent.post_call_analysis_data.', 'retell.post_call_analysis');
  check(Array.isArray(retell.agent?.post_call_analysis_data) && retell.agent.post_call_analysis_data.length > 0, 'POST_CALL_ANALYSIS', 'Retell provider post-call analysis fields are required.', 'retell.agent.post_call_analysis_data');
  for (const [index, field] of (retell.agent?.post_call_analysis_data || []).entries()) {
    check(['string', 'boolean', 'number'].includes(field?.type), 'POST_CALL_ANALYSIS_TYPE', `Post-call analysis field ${index + 1} uses an unsupported type.`, `retell.agent.post_call_analysis_data[${index}].type`);
    check(hasText(field?.name) && hasText(field?.description) && field?.required === true, 'POST_CALL_ANALYSIS_FIELD', `Post-call analysis field ${index + 1} must have a name, description, and required=true.`, `retell.agent.post_call_analysis_data[${index}]`);
  }
  check(hasText(retell.agent?.post_call_analysis_model), 'POST_CALL_ANALYSIS_MODEL', 'A Retell post-call analysis model is required.', 'retell.agent.post_call_analysis_model');
  for (const event of ['call_started', 'call_ended', 'call_analyzed']) {
    check(retell.agent?.webhook_events?.includes(event), 'WEBHOOK_EVENT', `Missing required Retell webhook event: ${event}.`, 'retell.agent.webhook_events');
  }
  const tools = allRetellTools(retell.llm);
  check(tools.length > 0, 'END_CALL_TOOL', 'The certified agent must retain an end_call tool.', 'retell.llm');
  for (const [index, tool] of tools.entries()) {
    check(tool?.type === 'end_call', 'UNSAFE_TOOL', `Only end_call is permitted, found ${tool?.type || 'unknown'}.`, `retell.llm.tools[${index}]`);
  }
  check(Array.isArray(retell.llm?.mcps) && retell.llm.mcps.length === 0, 'NO_MCP', 'MCP tools must remain disabled.', 'retell.llm.mcps');
  for (const variable of retell.dynamic_variable_allowlist || []) {
    check(CERTIFIED_DYNAMIC_VARIABLES.has(variable), 'DYNAMIC_VARIABLE', `Dynamic variable is outside the certified allowlist: ${variable}.`, 'retell.dynamic_variable_allowlist');
  }
  check(/AI assistant/i.test(retell.llm?.begin_message || ''), 'AI_DISCLOSURE', 'Retell LLM begin message must disclose AI.', 'retell.llm.begin_message');
  check(/stop calling/i.test(retell.llm?.begin_message || ''), 'SPOKEN_OPT_OUT', 'Begin message must make spoken opt-out available.', 'retell.llm.begin_message');
  check(retell.llm?.start_speaker === 'agent', 'START_SPEAKER', 'The disclosed AI introduction must start the call.', 'retell.llm.start_speaker');
  check(retell.llm?.model_temperature === 0, 'LLM_TEMPERATURE', 'The certification target must use deterministic temperature zero.', 'retell.llm.model_temperature');
  check(retell.llm?.tool_call_strict_mode === true, 'STRICT_TOOLS', 'Retell tool strict mode must be enabled.', 'retell.llm.tool_call_strict_mode');
  check(retell.publish_time_static_substitutions?.registered_seller_name === manifest.company?.legal_entity, 'SELLER_SUBSTITUTION', 'Prompt seller must bind to the manifest legal entity.', 'retell.publish_time_static_substitutions.registered_seller_name');
  check(retell.publish_time_static_substitutions?.approved_customer_service_number === manifest.company?.public_phone, 'PHONE_SUBSTITUTION', 'Prompt callback number must bind to the manifest public phone.', 'retell.publish_time_static_substitutions.approved_customer_service_number');

  for (const [pattern, code, message] of [
    [/This is a sales call/i, 'SALES_PURPOSE_COPY', 'Prompt must disclose the sales purpose.'],
    [/may be recorded/i, 'RECORDING_COPY', 'Prompt must disclose recording.'],
    [/Only an affirmative, unambiguous/i, 'AFFIRMATIVE_CONSENT_COPY', 'Prompt must require affirmative AI/recording consent.'],
    [/not legal or financial advice/i, 'ADVICE_BOUNDARY_COPY', 'Prompt must state the advice boundary.'],
    [/Voicemail is disabled/i, 'VOICEMAIL_COPY', 'Prompt must disable voicemail.'],
    [/Never say or imply/i, 'CLAIMS_BOUNDARY_COPY', 'Prompt must contain prohibited-claims rules.'],
    [/stop or delay payments/i, 'PAYMENT_BOUNDARY_COPY', 'Prompt must prohibit stop-payment advice.'],
  ]) {
    check(pattern.test(prompt), code, message, 'agent-prompt.md');
  }

  check(dispositions.external_actions_enabled === false, 'DISPOSITION_ACTIONS', 'Disposition external actions must be disabled.', 'dispositions.external_actions_enabled');
  const dispositionList = Array.isArray(dispositions.dispositions) ? dispositions.dispositions : [];
  const dispositionKeys = dispositionList.map((entry) => entry.key);
  check(dispositionKeys.length === unique(dispositionKeys).length, 'DISPOSITION_DUPLICATE', 'Disposition keys must be unique.', 'dispositions.dispositions');
  for (const key of REQUIRED_DISPOSITIONS) {
    check(dispositionKeys.includes(key), 'DISPOSITION_REQUIRED', `Missing required disposition: ${key}.`, 'dispositions.dispositions');
  }
  check(!dispositionKeys.includes('voicemail'), 'VOICEMAIL_DISPOSITION', 'An enabled voicemail disposition is forbidden.', 'dispositions.dispositions');
  for (const [index, disposition] of dispositionList.entries()) {
    check(Array.isArray(disposition.auto_actions) && disposition.auto_actions.length === 0, 'AUTO_ACTION', `Disposition ${disposition.key} cannot trigger an external action.`, `dispositions.dispositions[${index}].auto_actions`);
    check(disposition.terminal === true, 'TERMINAL_DISPOSITION', `Disposition ${disposition.key} must be terminal in the one-attempt pilot.`, `dispositions.dispositions[${index}].terminal`);
  }
  const dnc = dispositionList.find((entry) => entry.key === 'do_not_call');
  check(dnc?.suppress_future_contact === true, 'DNC_SUPPRESSION', 'DNC disposition must suppress future contact.', 'dispositions.dispositions.do_not_call');
  for (const key of ['ai_declined', 'recording_declined']) {
    const refusal = dispositionList.find((entry) => entry.key === key);
    check(refusal?.suppress_future_ai_contact === true, 'AI_CONTACT_SUPPRESSION', `${key} must suppress all future AI contact.`, `dispositions.dispositions.${key}.suppress_future_ai_contact`);
    check(refusal?.human_contact_requires_explicit_request === true, 'HUMAN_CONTACT_PERMISSION', `${key} may permit human contact only after an explicit request.`, `dispositions.dispositions.${key}.human_contact_requires_explicit_request`);
  }

  check(eligibility.default_decision === 'deny', 'FAIL_CLOSED', 'Eligibility must deny by default.', 'eligibility.default_decision');
  check(eligibility.cold_calling_enabled === false, 'NO_COLD_CALLS', 'AI cold calling must be disabled.', 'eligibility.cold_calling_enabled');
  check(eligibility.historical_appointment_implies_consent === false, 'NO_INFERRED_CONSENT', 'Historical appointments cannot imply consent.', 'eligibility.historical_appointment_implies_consent');
  check(eligibility.seller_specific_consent_required === true, 'SELLER_CONSENT', 'Seller-specific consent is required.', 'eligibility.seller_specific_consent_required');
  check(eligibility.artificial_or_prerecorded_voice_consent_required === true, 'AI_VOICE_CONSENT', 'Artificial/AI voice consent is required.', 'eligibility.artificial_or_prerecorded_voice_consent_required');
  check(eligibility.consent?.required_seller === manifest.company?.legal_entity, 'CONSENT_SELLER_BINDING', 'Consent seller must exactly match the manifest legal entity.', 'eligibility.consent.required_seller');
  for (const field of REQUIRED_CONSENT_EVIDENCE_FIELDS) {
    check(eligibility.consent?.required_evidence_fields?.includes(field), 'CONSENT_EVIDENCE', `Consent evidence must include ${field}.`, 'eligibility.consent.required_evidence_fields');
  }
  for (const key of REQUIRED_SUPPRESSION_GATES) {
    check(eligibility.suppression_gates?.[key] === true, 'SUPPRESSION_GATE', `Suppression gate ${key} must be required.`, `eligibility.suppression_gates.${key}`);
  }
  check(Number(eligibility.registry_evidence?.national_dnc_registry_version_max_age_days) <= 31, 'DNC_REGISTRY_AGE', 'National DNC registry evidence may be no more than 31 days old.', 'eligibility.registry_evidence.national_dnc_registry_version_max_age_days');
  for (const key of ['seller_specific_dnc_checked_at_provider_boundary', 'state_dnc_version_required', 'reassigned_number_check_version_required']) {
    check(eligibility.registry_evidence?.[key] === true, 'REGISTRY_EVIDENCE', `${key} must be required.`, `eligibility.registry_evidence.${key}`);
  }
  check(eligibility.jurisdiction?.unknown_state_decision === 'deny', 'UNKNOWN_STATE', 'Unknown state must deny.', 'eligibility.jurisdiction.unknown_state_decision');
  check(eligibility.time_and_frequency?.automatic_retry_enabled === false, 'NO_RETRY', 'Automatic retries must be disabled.', 'eligibility.time_and_frequency.automatic_retry_enabled');
  check(eligibility.time_and_frequency?.maximum_attempts_per_lead === 1, 'POLICY_ATTEMPTS', 'Eligibility policy must allow one attempt.', 'eligibility.time_and_frequency.maximum_attempts_per_lead');
  check(eligibility.voicemail?.enabled === false, 'POLICY_VOICEMAIL', 'Eligibility policy must disable voicemail.', 'eligibility.voicemail.enabled');
  check(eligibility.consent?.synthetic_offline_override?.production_allowed === false, 'SYNTHETIC_PRODUCTION', 'Synthetic override can never authorize production.', 'eligibility.consent.synthetic_offline_override.production_allowed');

  check(ghl.mode === 'shadow_read_only', 'GHL_MODE', 'GHL must remain shadow/read-only.', 'ghl.mode');
  check(ghl.outbound_writeback_enabled === false, 'GHL_WRITEBACK', 'GHL writeback must be disabled.', 'ghl.outbound_writeback_enabled');
  check(ghl.workflow_triggering_enabled === false, 'GHL_WORKFLOW', 'GHL workflow triggering must be disabled.', 'ghl.workflow_triggering_enabled');
  check(ghl.tenant_binding?.signed_ingest_required === true && ghl.tenant_binding?.location_must_match_organization === true && ghl.tenant_binding?.replay_protection_required === true, 'GHL_TENANT_BINDING', 'GHL ingress must be signed, tenant-bound, and replay protected.', 'ghl.tenant_binding');
  check(ghl.proposed_writeback_mapping?.enabled === false, 'GHL_PROPOSED_WRITEBACK', 'Proposed GHL writeback must remain disabled.', 'ghl.proposed_writeback_mapping.enabled');

  const requiredHeaders = ['phone_number', 'first_name', 'last_name', 'email', 'company', 'notes', 'lead_source', 'timezone'];
  for (const header of requiredHeaders) check(syntheticLeads.headers.includes(header), 'FIXTURE_HEADER', `Synthetic CSV is missing ${header}.`, 'test-fixtures/synthetic-leads.csv');
  check(syntheticLeads.rows.length >= 10, 'FIXTURE_COUNT', 'At least ten synthetic leads are required.', 'test-fixtures/synthetic-leads.csv');
  const fixturePhones = syntheticLeads.rows.map((lead) => lead.phone_number);
  check(fixturePhones.length === unique(fixturePhones).length, 'FIXTURE_DUPLICATE', 'Synthetic phones must be unique.', 'test-fixtures/synthetic-leads.csv');
  for (const [index, lead] of syntheticLeads.rows.entries()) {
    check(/^\+120255501[0-9]{2}$/.test(lead.phone_number), 'FIXTURE_PHONE', `Synthetic lead ${index + 1} must use a reserved +1 202-555-01xx number.`, `test-fixtures/synthetic-leads.csv:${index + 2}`);
    check(lead.email.endsWith('.invalid'), 'FIXTURE_EMAIL', `Synthetic lead ${index + 1} must use a .invalid email.`, `test-fixtures/synthetic-leads.csv:${index + 2}`);
    check(lead.lead_source === 'codex_synthetic', 'FIXTURE_SOURCE', `Synthetic lead ${index + 1} must use codex_synthetic.`, `test-fixtures/synthetic-leads.csv:${index + 2}`);
  }
  check(consentFixtures.fixture_only === true && consentFixtures.production_allowed === false, 'CONSENT_FIXTURE_LOCK', 'Consent fixtures must be explicitly non-production.', 'test-fixtures/consent-evidence.json');
  const consentRecords = Array.isArray(consentFixtures.records) ? consentFixtures.records : [];
  check(consentRecords.length === syntheticLeads.rows.length, 'CONSENT_FIXTURE_COUNT', 'Every synthetic lead needs one consent fixture.', 'test-fixtures/consent-evidence.json');
  for (const [index, record] of consentRecords.entries()) {
    check(fixturePhones.includes(record.phone_number), 'CONSENT_FIXTURE_PHONE', `Consent fixture ${index + 1} does not match a synthetic lead.`, `consentFixtures.records[${index}].phone_number`);
    check(/^\+120255501[0-9]{2}$/.test(record.phone_number), 'CONSENT_FIXTURE_RESERVED', 'Consent fixtures must use reserved numbers.', `consentFixtures.records[${index}].phone_number`);
  }
  const fixtureDecisions = new Set(consentRecords.map((record) => record.expected_eligibility));
  for (const decision of ['offline_allow', 'deny_missing_ai_voice_consent', 'deny_wrong_seller', 'deny_revoked']) {
    check(fixtureDecisions.has(decision), 'CONSENT_NEGATIVE_CASE', `Consent fixtures must cover ${decision}.`, 'consentFixtures.records');
  }

  check(conversationTests.minimum_required_pass_rate === 1, 'TEST_PASS_RATE', 'Conversation suite requires a 100% pass rate.', 'conversationTests.minimum_required_pass_rate');
  check(conversationTests.execution_mode === 'retell_sandbox_or_owned_phone_only', 'TEST_EXECUTION_MODE', 'Conversation tests may run only in sandbox or on owned phones.', 'conversationTests.execution_mode');
  const tests = Array.isArray(conversationTests.tests) ? conversationTests.tests : [];
  check(tests.length >= 25, 'TEST_COUNT', 'At least 25 conversation contracts are required.', 'conversationTests.tests');
  const testIds = tests.map((test) => test.id);
  check(testIds.length === unique(testIds).length, 'TEST_DUPLICATE', 'Conversation test IDs must be unique.', 'conversationTests.tests');
  const tags = new Set(tests.flatMap((test) => Array.isArray(test.tags) ? test.tags : []));
  for (const tag of REQUIRED_CONVERSATION_TAGS) check(tags.has(tag), 'TEST_COVERAGE', `Conversation suite is missing ${tag} coverage.`, 'conversationTests.tests');
  for (const [index, test] of tests.entries()) {
    const expectedDisposition = test.expected?.disposition;
    if (expectedDisposition) check(dispositionKeys.includes(expectedDisposition), 'TEST_DISPOSITION', `Conversation test references unknown disposition: ${expectedDisposition}.`, `conversationTests.tests[${index}]`);
  }

  const allConfiguredPlaceholders = placeholderOccurrences({
    manifest: (() => {
      const { required_launch_placeholders: _required, optional_adapter_placeholders: _optional, ...runtime } = manifest;
      return runtime;
    })(),
    retell,
    eligibility,
    ghl,
    direct_import: directImport,
    reactivation,
  });
  const placeholders = requiredPlaceholderOccurrences(bundle);
  const declaredPlaceholders = new Set(manifest.required_launch_placeholders || []);
  const configuredPlaceholders = new Set(placeholders.map((entry) => entry.placeholder));
  const optionalAdapterPlaceholders = new Set(manifest.optional_adapter_placeholders || []);
  if (mode === 'offline') {
    for (const placeholder of optionalAdapterPlaceholders) {
      check(!declaredPlaceholders.has(placeholder), 'OPTIONAL_PLACEHOLDER_DECLARED_REQUIRED', `Optional adapter placeholder must not be declared as required: ${placeholder}.`, 'manifest.optional_adapter_placeholders');
      check(allConfiguredPlaceholders.some((entry) => entry.placeholder === placeholder), 'OPTIONAL_PLACEHOLDER_TEMPLATE_DRIFT', `Optional adapter placeholder is missing from its adapter template: ${placeholder}.`, 'manifest.optional_adapter_placeholders');
    }
  }
  for (const placeholder of configuredPlaceholders) {
    check(declaredPlaceholders.has(placeholder), 'PLACEHOLDER_UNDECLARED', `Required placeholder is not declared in the manifest: ${placeholder}.`, 'manifest.required_launch_placeholders');
  }
  if (mode === 'offline') {
    for (const placeholder of declaredPlaceholders) {
      check(configuredPlaceholders.has(placeholder), 'PLACEHOLDER_TEMPLATE_DRIFT', `Offline source no longer contains declared placeholder: ${placeholder}.`, 'manifest.required_launch_placeholders');
    }
  }

  const blockers = launchBlockers(bundle, placeholders, trustRoot);
  if (mode === 'offline') {
    check(manifest.environment === 'offline_only', 'OFFLINE_ENVIRONMENT', 'Source bundle must identify itself as offline_only.', 'manifest.environment');
    check(manifest.production_launch_allowed === false, 'OFFLINE_LAUNCH_LOCK', 'Offline bundle must keep production launch disabled.', 'manifest.production_launch_allowed');
    check(manifest.bundle_status === 'offline_ready', 'OFFLINE_STATUS', 'Source bundle must have offline_ready status.', 'manifest.bundle_status');
    check(eligibility.consent?.synthetic_offline_override?.enabled === true, 'SYNTHETIC_OFFLINE', 'Offline bundle must explicitly enable only the synthetic override.', 'eligibility.consent.synthetic_offline_override.enabled');
    if (blockers.length > 0) add('warning', 'LAUNCH_LOCKED', `${blockers.length} production launch blocker(s) remain by design.`, 'launch');
  } else if (mode === 'installation') {
    check(manifest.environment === 'installation_candidate', 'INSTALLATION_ENVIRONMENT', 'Provider installation copy must identify itself as installation_candidate.', 'manifest.environment');
    check(manifest.production_launch_allowed === false, 'INSTALLATION_LAUNCH_LOCK', 'Provider installation must keep production launch disabled.', 'manifest.production_launch_allowed');
    check(manifest.bundle_status === 'installation_pending', 'INSTALLATION_STATUS', 'Provider installation copy must have installation_pending status.', 'manifest.bundle_status');
    check(eligibility.consent?.synthetic_offline_override?.enabled === false, 'INSTALLATION_SYNTHETIC_LOCK', 'Synthetic offline authorization must be disabled in an installation candidate.', 'eligibility.consent.synthetic_offline_override.enabled');
    if (blockers.length > 0) add('warning', 'LAUNCH_LOCKED', `${blockers.length} production launch blocker(s) remain; provider installation never authorizes calling.`, 'launch');
  } else {
    check(trustRootMatchesBundle(trustRoot, bundle), 'LAUNCH_TRUST_ROOT', 'Launch requires an authenticated external trust root pinned outside the candidate directory.', 'launch.trust_root');
    for (const blocker of blockers) add('error', 'LAUNCH_BLOCKER', blocker, 'launch');
    check(manifest.environment === 'production_candidate', 'LAUNCH_ENVIRONMENT', 'Launch-approved bundle must be a production_candidate.', 'manifest.environment');
    check(placeholders.length === 0, 'LAUNCH_PLACEHOLDERS', 'No required launch placeholders may remain.', 'launch');
    check((eligibility.consent?.approved_lead_sources || []).length > 0, 'LAUNCH_SOURCE', 'At least one lead source must be approved.', 'eligibility.consent.approved_lead_sources');
    check((eligibility.consent?.approved_consent_text_versions || []).length > 0, 'LAUNCH_CONSENT_VERSION', 'At least one consent version must be approved.', 'eligibility.consent.approved_consent_text_versions');
    const approvedArtifacts = eligibility.consent?.approved_consent_artifacts || [];
    check(approvedArtifacts.length > 0, 'LAUNCH_CONSENT_ARTIFACT', 'At least one structured consent artifact must be approved.', 'eligibility.consent.approved_consent_artifacts');
    for (const [index, artifact] of approvedArtifacts.entries()) {
      check(isValidConsentArtifact(artifact, manifest.company?.legal_entity), 'LAUNCH_CONSENT_ARTIFACT', `Consent artifact ${index + 1} is incomplete or names a different seller.`, `eligibility.consent.approved_consent_artifacts[${index}]`);
      check((eligibility.consent?.approved_lead_sources || []).includes(artifact?.lead_source), 'LAUNCH_CONSENT_SOURCE_BINDING', `Consent artifact ${index + 1} uses an unapproved lead source.`, `eligibility.consent.approved_consent_artifacts[${index}].lead_source`);
      check((eligibility.consent?.approved_consent_text_versions || []).includes(artifact?.consent_text_version), 'LAUNCH_CONSENT_VERSION_BINDING', `Consent artifact ${index + 1} uses an unapproved consent version.`, `eligibility.consent.approved_consent_artifacts[${index}].consent_text_version`);
    }
    for (const source of eligibility.consent?.approved_lead_sources || []) {
      check(approvedArtifacts.some((artifact) => artifact?.lead_source === source), 'LAUNCH_SOURCE_ARTIFACT', `Approved lead source ${source} has no approved consent artifact.`, 'eligibility.consent.approved_lead_sources');
    }
    for (const version of eligibility.consent?.approved_consent_text_versions || []) {
      check(approvedArtifacts.some((artifact) => artifact?.consent_text_version === version), 'LAUNCH_VERSION_ARTIFACT', `Approved consent version ${version} has no approved consent artifact.`, 'eligibility.consent.approved_consent_text_versions');
    }
    const approvedPropertyStates = eligibility.jurisdiction?.approved_property_states || [];
    const approvedCallingStates = eligibility.jurisdiction?.approved_calling_states || [];
    check(approvedPropertyStates.length > 0, 'LAUNCH_PROPERTY_STATE', 'At least one property state must be approved.', 'eligibility.jurisdiction.approved_property_states');
    check(approvedCallingStates.length > 0, 'LAUNCH_CALLING_STATE', 'At least one calling state must be approved.', 'eligibility.jurisdiction.approved_calling_states');
    check(approvedPropertyStates.length === unique(approvedPropertyStates).length && approvedPropertyStates.every((state) => /^[A-Z]{2}$/.test(state)), 'LAUNCH_PROPERTY_STATE_FORMAT', 'Property states must be unique uppercase two-letter codes.', 'eligibility.jurisdiction.approved_property_states');
    check(approvedCallingStates.length === unique(approvedCallingStates).length && approvedCallingStates.every((state) => /^[A-Z]{2}$/.test(state)), 'LAUNCH_CALLING_STATE_FORMAT', 'Calling states must be unique uppercase two-letter codes.', 'eligibility.jurisdiction.approved_calling_states');
    for (const state of approvedCallingStates) {
      check(hasText(eligibility.jurisdiction?.recording_disclosure_by_state?.[state]), 'LAUNCH_RECORDING_DISCLOSURE', `Calling state ${state} needs an approved recording disclosure.`, `eligibility.jurisdiction.recording_disclosure_by_state.${state}`);
      check(isValidStateRuleSource(eligibility.jurisdiction?.state_rule_sources?.[state]), 'LAUNCH_STATE_RULE_SOURCE', `Calling state ${state} needs structured, approved rule evidence.`, `eligibility.jurisdiction.state_rule_sources.${state}`);
    }
    for (const state of approvedPropertyStates) {
      check(isValidStateRuleSource(eligibility.jurisdiction?.state_rule_sources?.[state]), 'LAUNCH_STATE_RULE_SOURCE', `Property state ${state} needs structured, approved rule evidence.`, `eligibility.jurisdiction.state_rule_sources.${state}`);
    }
    check(hasText(manifest.company?.legal_entity) && !isRequiredPlaceholder(manifest.company.legal_entity), 'LAUNCH_LEGAL_ENTITY', 'A resolved legal seller identity is required.', 'manifest.company.legal_entity');
    check(/^\+[1-9]\d{7,14}$/.test(manifest.company?.public_phone || ''), 'LAUNCH_PUBLIC_PHONE', 'Customer-service phone must be resolved E.164.', 'manifest.company.public_phone');
    check(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(manifest.installation_bindings?.owner_user_id || ''), 'LAUNCH_OWNER_ID', 'Owner user ID must be a resolved UUID.', 'manifest.installation_bindings.owner_user_id');
    check(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(manifest.installation_bindings?.organization_id || ''), 'LAUNCH_ORGANIZATION_ID', 'Organization ID must be a resolved UUID.', 'manifest.installation_bindings.organization_id');
    for (const [key, value] of Object.entries(manifest.legal_and_operations || {})) {
      check(hasText(value) && !isRequiredPlaceholder(value), 'LAUNCH_LEGAL_OPERATION', `${key} must be resolved and approved.`, `manifest.legal_and_operations.${key}`);
    }
    check(!/staging/i.test(manifest.campaign?.name || ''), 'LAUNCH_CAMPAIGN_NAME', 'Production-candidate campaign name must not say staging.', 'manifest.campaign.name');
    check(hasText(retell.agent?.agent_id) && !isRequiredPlaceholder(retell.agent.agent_id), 'LAUNCH_AGENT_ID', 'Retell agent ID must be resolved.', 'retell.agent.agent_id');
    check(hasText(retell.agent?.voice_id) && !isRequiredPlaceholder(retell.agent.voice_id), 'LAUNCH_VOICE_ID', 'Retell voice ID must be resolved.', 'retell.agent.voice_id');
    check(hasText(retell.llm?.llm_id) && !isRequiredPlaceholder(retell.llm.llm_id), 'LAUNCH_LLM_RESOLVED', 'Retell LLM ID must be resolved.', 'retell.llm.llm_id');
    check(hasText(retell.llm?.model) && !isRequiredPlaceholder(retell.llm.model), 'LAUNCH_MODEL', 'Approved Retell model must be resolved.', 'retell.llm.model');
    check(retell.agent?.response_engine?.llm_id === retell.llm?.llm_id, 'LAUNCH_LLM_ID', 'Retell agent and LLM IDs must match.', 'retell.agent.response_engine.llm_id');
    check(retell.agent?.response_engine?.version === retell.llm?.version, 'LAUNCH_LLM_VERSION', 'Retell agent response-engine and LLM versions must match.', 'retell.agent.response_engine.version');
    check(retell.outbound_call_defaults?.agent_version === retell.agent?.version, 'LAUNCH_CALL_AGENT_VERSION', 'Outbound calls must pin the certified agent version.', 'retell.outbound_call_defaults.agent_version');
    check(/^https:\/\//i.test(retell.agent?.webhook_url || '') && !isRequiredPlaceholder(retell.agent?.webhook_url), 'LAUNCH_WEBHOOK', 'Launch webhook must be a resolved HTTPS URL.', 'retell.agent.webhook_url');
    check(/^\+[1-9]\d{7,14}$/.test(retell.outbound_call_defaults?.from_number || ''), 'LAUNCH_FROM_NUMBER', 'Launch from-number must be resolved E.164.', 'retell.outbound_call_defaults.from_number');
    const directImportReady = isDirectImportProfileReady(directImport, manifest, eligibility);
    const ghlReady = ghl.inbound_enabled === true && isResolvedText(ghl.location_id);
    check(directImportReady || ghlReady, 'LAUNCH_SOURCE_ADAPTER', 'Launch requires either a resolved signed direct-import adapter or a resolved signed GHL shadow adapter.', 'source_adapter');
    if (ghl.inbound_enabled === true) check(isResolvedText(ghl.location_id), 'LAUNCH_GHL_LOCATION', 'An enabled GHL adapter requires a resolved location ID.', 'ghl.location_id');
    for (const role of REQUIRED_APPROVAL_ROLES) {
      check(isValidApproval(manifest.launch_approvals?.[role], bundle, role, trustRoot), 'LAUNCH_APPROVAL', `${role} approval must be file-backed, exact-version-bound, and authenticated by the external trust root.`, `manifest.launch_approvals.${role}`);
    }
    const approvalNames = REQUIRED_APPROVAL_ROLES.map((role) => manifest.launch_approvals?.[role]?.approver).filter(hasText).map((name) => name.trim().toLowerCase());
    const approvalPrincipals = REQUIRED_APPROVAL_ROLES.map((role) => manifest.launch_approvals?.[role]?.principal_id).filter(hasText).map((principalId) => principalId.trim().toLowerCase());
    check(approvalNames.length === REQUIRED_APPROVAL_ROLES.length && unique(approvalNames).length === REQUIRED_APPROVAL_ROLES.length, 'LAUNCH_APPROVER_SEPARATION', 'Every required approval role must use a distinct named person.', 'manifest.launch_approvals');
    check(approvalPrincipals.length === REQUIRED_APPROVAL_ROLES.length && unique(approvalPrincipals).length === REQUIRED_APPROVAL_ROLES.length, 'LAUNCH_PRINCIPAL_SEPARATION', 'Every required approval role must use a distinct trusted principal.', 'manifest.launch_approvals');
  for (const [key] of REQUIRED_CERTIFICATES) {
      check(isValidCertificate(manifest.certification_evidence?.[key], bundle, key, trustRoot), 'LAUNCH_CERTIFICATE', `${key} must be file-backed, exact-version-bound, and authenticated by the external trust root.`, `manifest.certification_evidence.${key}`);
    }
    check(sourceShadowPath(bundle, trustRoot) !== null, 'LAUNCH_SOURCE_SHADOW', 'Launch requires a valid signed direct-import or GHL shadow certificate with 25 clean records and zero mismatches.', 'manifest.certification_evidence');
  }

  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');
  return {
    mode,
    valid: errors.length === 0,
    error_count: errors.length,
    warning_count: warnings.length,
    issues,
    required_placeholders: unique(placeholders.map((entry) => entry.placeholder)),
    launch_blockers: blockers,
    counts: {
      dispositions: dispositionList.length,
      conversation_tests: tests.length,
      synthetic_leads: syntheticLeads.rows.length,
      consent_fixtures: consentRecords.length,
    },
  };
}

export function validateSolarExitBundle(options = {}) {
  const bundle = loadSolarExitBundle(options.root || DEFAULT_SOLAR_EXIT_BUNDLE_ROOT);
  return validateSolarExitBundleData(bundle, options);
}

export function evaluateConsentEvidence(record, eligibility, { mode = 'offline', now = new Date(), trustedDispatchContext = null } = {}) {
  const consent = eligibility.consent || {};
  if (!record || typeof record !== 'object') return 'deny_missing_evidence';
  if (!/^\+[1-9]\d{7,14}$/.test(String(record.phone_number || ''))) return 'deny_invalid_phone';

  const synthetic = consent.synthetic_offline_override || {};
  const isSyntheticCandidate =
    mode === 'offline' &&
    synthetic.enabled === true &&
    synthetic.production_allowed === false &&
    record.lead_source === synthetic.lead_source &&
    record.consent_text_version === synthetic.consent_text_version &&
    hasText(synthetic.allowed_phone_pattern) &&
    new RegExp(synthetic.allowed_phone_pattern).test(record.phone_number);

  if (isSyntheticCandidate) {
    if (record.seller !== synthetic.seller) return 'deny_wrong_seller';
    if (record.ai_voice_calls_authorized !== true) return 'deny_missing_ai_voice_consent';
    if (record.revoked !== false) return 'deny_revoked';
    if (!isValidTimestamp(record.captured_at)) return 'deny_invalid_timestamp';
    return 'offline_allow';
  }

  const trustedFields = [
    'authorization_id',
    'lead_id',
    'destination_phone_number',
    'seller',
    'lead_source',
    'consent_artifact_id',
    'source_form_version',
    'consent_text_version',
  ];
  if (
    !trustedDispatchContext ||
    typeof trustedDispatchContext !== 'object' ||
    trustedFields.some((field) => !hasText(trustedDispatchContext[field]))
  ) {
    return 'deny_missing_trusted_context';
  }
  if (!/^\+[1-9]\d{7,14}$/.test(trustedDispatchContext.destination_phone_number)) return 'deny_invalid_trusted_destination';
  if (trustedDispatchContext.seller !== consent.required_seller) return 'deny_wrong_seller';
  if (record.lead_id !== trustedDispatchContext.lead_id) return 'deny_lead_mismatch';
  if (
    record.phone_number !== trustedDispatchContext.destination_phone_number ||
    record.dialed_phone_number !== trustedDispatchContext.destination_phone_number
  ) {
    return 'deny_phone_mismatch';
  }
  if (
    record.seller !== trustedDispatchContext.seller ||
    record.lead_source !== trustedDispatchContext.lead_source ||
    record.consent_artifact_id !== trustedDispatchContext.consent_artifact_id ||
    record.source_form_version !== trustedDispatchContext.source_form_version ||
    record.consent_text_version !== trustedDispatchContext.consent_text_version
  ) {
    return 'deny_trusted_consent_binding_mismatch';
  }
  if (record.seller !== consent.required_seller) return 'deny_wrong_seller';
  const evidenceFields = Array.isArray(consent.required_evidence_fields) ? consent.required_evidence_fields : [];
  for (const field of evidenceFields) {
    if (!Object.prototype.hasOwnProperty.call(record, field)) return 'deny_missing_evidence';
    const value = record[field];
    if (value === null || value === undefined || (typeof value === 'string' && !hasText(value))) return 'deny_missing_evidence';
  }
  if (record.ai_voice_calls_authorized !== true) return 'deny_missing_ai_voice_consent';
  if (record.telemarketing_calls_authorized !== true) return 'deny_missing_telemarketing_consent';
  if (record.not_condition_of_purchase_disclosure !== true) return 'deny_missing_not_condition_disclosure';
  if (record.revoked !== false) return 'deny_revoked';
  if (!isValidTimestamp(record.captured_at)) return 'deny_invalid_timestamp';

  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  const capturedAtMs = Date.parse(record.captured_at);
  if (!Number.isFinite(nowMs) || capturedAtMs > nowMs) return 'deny_invalid_timestamp';
  if (consent.phone_must_match_evidence === true && record.dialed_phone_number !== record.phone_number) return 'deny_phone_mismatch';
  if (!(consent.approved_lead_sources || []).includes(record.lead_source)) return 'deny_unapproved_lead_source';
  if (!(consent.approved_consent_text_versions || []).includes(record.consent_text_version)) return 'deny_unapproved_consent_version';

  const artifact = (consent.approved_consent_artifacts || []).find(
    (candidate) => candidate?.consent_artifact_id === record.consent_artifact_id,
  );
  if (!artifact || !isValidConsentArtifact(artifact, consent.required_seller)) return 'deny_unapproved_consent_artifact';
  if (
    artifact.lead_source !== record.lead_source ||
    artifact.source_form_version !== record.source_form_version ||
    artifact.consent_text_version !== record.consent_text_version ||
    artifact.disclosure_sha256.toLowerCase() !== sha256(record.consent_disclosure_text)
  ) {
    return 'deny_consent_artifact_mismatch';
  }
  const effectiveFromMs = Date.parse(artifact.effective_from);
  const effectiveToMs = artifact.effective_to ? Date.parse(artifact.effective_to) : null;
  if (capturedAtMs < effectiveFromMs || (effectiveToMs !== null && capturedAtMs > effectiveToMs)) {
    return 'deny_consent_artifact_not_effective';
  }

  const propertyState = String(record.property_state || '').toUpperCase();
  const callingState = String(record.calling_state || '').toUpperCase();
  if (!(eligibility.jurisdiction?.approved_property_states || []).includes(propertyState)) return 'deny_property_state';
  if (!(eligibility.jurisdiction?.approved_calling_states || []).includes(callingState)) return 'deny_calling_state';

  for (const gate of REQUIRED_SUPPRESSION_GATES) {
    const gateEvidence = record.suppression_checks?.[gate];
    if (
      !gateEvidence ||
      gateEvidence.clear !== true ||
      !hasText(gateEvidence.evidence_id) ||
      !isValidTimestamp(gateEvidence.checked_at) ||
      Date.parse(gateEvidence.checked_at) > nowMs
    ) {
      return 'deny_suppression_gate';
    }
  }
  const nationalCheckedAt = Date.parse(record.suppression_checks.national_do_not_call_clear_required.checked_at);
  const maxAgeDays = Number(eligibility.registry_evidence?.national_dnc_registry_version_max_age_days);
  if (!Number.isFinite(maxAgeDays) || nowMs - nationalCheckedAt > maxAgeDays * 86400000) {
    return 'deny_stale_national_dnc_evidence';
  }
  return 'production_eligible';
}

export function buildConversationResultTemplate(bundle = loadSolarExitBundle()) {
  return {
    schema_version: '1.0.0',
    bundle_id: bundle.manifest.bundle_id,
    bundle_version: bundle.manifest.bundle_version,
    manifest_sha256: computeLaunchManifestDigest(bundle.manifest),
    bundle_sha256: computeLaunchBundleDigest(bundle),
    provider: bundle.retell.provider,
    provider_binding: expectedProviderBinding(bundle),
    suite_id: bundle.conversationTests.suite_id,
    test_plan_sha256: sha256(JSON.stringify(bundle.conversationTests)),
    environment: null,
    executed_at: null,
    executor: null,
    agent_id: null,
    agent_version: null,
    llm_id: null,
    llm_version: null,
    calls_owned_or_sandbox: null,
    execution_evidence_sha256: null,
    results: bundle.conversationTests.tests.map((scenario) => ({
      test_id: scenario.id,
      passed: null,
      hard_failure: null,
      observed_disposition: null,
      expected_disposition: scenario.expected?.disposition || null,
      call_id: null,
      lead_id: null,
      organization_id: null,
      destination_phone_number: null,
      evidence_id: null,
      transcript_sha256: null,
      provider_log_sha256: null,
      reviewer: null,
      reviewed_at: null,
      review_method: 'human_transcript_and_recording_review',
      assertion_results: Object.fromEntries(
        Object.keys(scenario.expected || {}).filter((key) => key !== 'disposition').map((key) => [key, null]),
      ),
      notes: null,
    })),
  };
}

export function scoreConversationResults(bundle, execution, { trustedExecutionContext = null } = {}) {
  const issues = [];
  const add = (code, message, testId = null) => issues.push({ code, message, test_id: testId });
  const expectedTests = new Map(bundle.conversationTests.tests.map((scenario) => [scenario.id, scenario]));
  const results = Array.isArray(execution?.results) ? execution.results : [];
  const resultIds = results.map((result) => result.test_id);

  if (execution?.bundle_id !== bundle.manifest.bundle_id || execution?.bundle_version !== bundle.manifest.bundle_version) {
    add('BUNDLE_BINDING', 'Execution evidence does not match this bundle ID and version.');
  }
  if (execution?.manifest_sha256 !== computeLaunchManifestDigest(bundle.manifest) || execution?.bundle_sha256 !== computeLaunchBundleDigest(bundle)) {
    add('BUNDLE_DIGEST_BINDING', 'Execution evidence does not match the exact manifest and artifact digest map.');
  }
  if (execution?.provider !== 'retell' || canonicalJson(execution?.provider_binding) !== canonicalJson(expectedProviderBinding(bundle))) {
    add('PROVIDER_BINDING', 'Execution evidence does not match the exact Retell provider target.');
  }
  if (execution?.suite_id !== bundle.conversationTests.suite_id) add('SUITE_ID', 'Execution suite_id does not match the campaign contract.');
  if (execution?.test_plan_sha256 !== sha256(JSON.stringify(bundle.conversationTests))) add('TEST_PLAN_HASH', 'Execution test-plan hash does not match this conversation suite.');
  if (!['retell_sandbox', 'owned_phone'].includes(execution?.environment)) add('ENVIRONMENT', 'Environment must be retell_sandbox or owned_phone.');
  if (execution?.calls_owned_or_sandbox !== true) add('TEST_DESTINATION_ATTESTATION', 'The submitted execution form must attest that every call was sandboxed or used a company-owned test phone.');
  if (!isSha256(execution?.execution_evidence_sha256)) add('EXECUTION_EVIDENCE_HASH', 'A SHA-256 for the immutable execution evidence manifest is required.');
  if (!hasText(execution?.executed_at) || Number.isNaN(Date.parse(execution.executed_at))) add('EXECUTED_AT', 'A valid execution timestamp is required.');
  if (!hasText(execution?.executor)) add('EXECUTOR', 'The test executor must be recorded.');
  if (!hasText(execution?.agent_id) || !Number.isSafeInteger(execution?.agent_version) || execution.agent_version < 0) add('AGENT_VERSION', 'A resolved, non-negative Retell agent version is required.');
  if (!hasText(execution?.llm_id) || !Number.isSafeInteger(execution?.llm_version) || execution.llm_version < 0) add('LLM_VERSION', 'A resolved, non-negative Retell LLM version is required.');
  if (!isResolvedProviderBinding(expectedProviderBinding(bundle))) add('PROVIDER_TARGET_UNRESOLVED', 'Conversation scoring requires a bundle with exact resolved Retell agent and LLM IDs and versions.');
  if (!isRequiredPlaceholder(bundle.retell.agent?.agent_id) && hasText(bundle.retell.agent?.agent_id) && execution?.agent_id !== bundle.retell.agent.agent_id) {
    add('AGENT_ID_MISMATCH', 'Execution agent ID does not match the certified bundle target.');
  }
  if (Number.isSafeInteger(bundle.retell.agent?.version) && execution?.agent_version !== bundle.retell.agent.version) {
    add('AGENT_VERSION_MISMATCH', 'Execution agent version does not match the certified bundle target.');
  }
  if (!isRequiredPlaceholder(bundle.retell.llm?.llm_id) && hasText(bundle.retell.llm?.llm_id) && execution?.llm_id !== bundle.retell.llm.llm_id) {
    add('LLM_ID_MISMATCH', 'Execution LLM ID does not match the certified bundle target.');
  }
  if (Number.isSafeInteger(bundle.retell.llm?.version) && execution?.llm_version !== bundle.retell.llm.version) {
    add('LLM_VERSION_MISMATCH', 'Execution LLM version does not match the certified bundle target.');
  }
  if (resultIds.length !== unique(resultIds).length) add('DUPLICATE_RESULT', 'Each conversation test may appear exactly once.');
  const callIds = results.map((result) => result.call_id).filter(hasText);
  if (callIds.length !== unique(callIds).length) add('DUPLICATE_CALL', 'Each conversation test must bind to a unique provider call.');

  const trustedCalls = Array.isArray(trustedExecutionContext?.calls) ? trustedExecutionContext.calls : [];
  const trustedContextMatches = Boolean(
    trustedExecutionContext &&
    hasText(trustedExecutionContext.authorization_id) &&
    trustedExecutionContext.bundle_id === bundle.manifest.bundle_id &&
    trustedExecutionContext.bundle_version === bundle.manifest.bundle_version &&
    trustedExecutionContext.manifest_sha256 === computeLaunchManifestDigest(bundle.manifest) &&
    trustedExecutionContext.bundle_sha256 === computeLaunchBundleDigest(bundle) &&
    canonicalJson(trustedExecutionContext.provider_binding) === canonicalJson(expectedProviderBinding(bundle)) &&
    trustedExecutionContext.execution_evidence_sha256 === execution?.execution_evidence_sha256
  );
  if (!trustedContextMatches) add('TRUSTED_EXECUTION_CONTEXT', 'An independently supplied execution context bound to this bundle, provider, and evidence manifest is required.');
  const trustedCallIds = trustedCalls.map((call) => call?.call_id).filter(hasText);
  const trustedTestIds = trustedCalls.map((call) => call?.test_id).filter(hasText);
  if (
    trustedCalls.length !== results.length ||
    trustedCallIds.length !== unique(trustedCallIds).length ||
    trustedTestIds.length !== unique(trustedTestIds).length
  ) {
    add('TRUSTED_CALL_SET', 'Trusted provider evidence must contain exactly one unique call for every submitted test and no extra calls.');
  }

  for (const testId of expectedTests.keys()) {
    if (!resultIds.includes(testId)) add('MISSING_RESULT', 'Conversation result is missing.', testId);
  }
  for (const result of results) {
    const scenario = expectedTests.get(result.test_id);
    if (!scenario) {
      add('UNKNOWN_RESULT', 'Conversation result is not part of this suite.', result.test_id);
      continue;
    }
    if (result.passed !== true) add('FAILED_TEST', 'Conversation contract did not pass.', result.test_id);
    if (result.hard_failure !== false) add('HARD_FAILURE', 'Hard failure is present or was not explicitly ruled out.', result.test_id);
    if (!hasText(result.call_id) || result.call_id.trim().length < 8) add('MISSING_CALL_ID', 'A provider call identifier is required.', result.test_id);
    if (!hasText(result.evidence_id) || result.evidence_id.trim().length < 8) add('MISSING_EVIDENCE', 'Transcript/call evidence identifier is required.', result.test_id);
    if (!isSha256(result.transcript_sha256)) add('TRANSCRIPT_HASH', 'A transcript SHA-256 is required.', result.test_id);
    if (!isSha256(result.provider_log_sha256)) add('PROVIDER_LOG_HASH', 'A provider log or recording-metadata SHA-256 is required.', result.test_id);
    const trustedCall = trustedCalls.find((candidate) => candidate?.call_id === result.call_id && candidate?.test_id === result.test_id);
    if (
      !trustedContextMatches ||
      !trustedCall ||
      trustedCall.provider !== 'retell' ||
      !hasText(result.lead_id) ||
      trustedCall.lead_id !== result.lead_id ||
      !hasText(result.organization_id) ||
      isRequiredPlaceholder(result.organization_id) ||
      result.organization_id !== bundle.manifest.installation_bindings?.organization_id ||
      trustedCall.organization_id !== result.organization_id ||
      !/^\+[1-9]\d{7,14}$/.test(result.destination_phone_number || '') ||
      trustedCall.destination_phone_number !== result.destination_phone_number ||
      !['owned_company_phone', 'retell_sandbox'].includes(trustedCall.destination_authorization) ||
      trustedCall.agent_id !== bundle.retell.agent?.agent_id ||
      trustedCall.agent_version !== bundle.retell.agent?.version ||
      trustedCall.llm_id !== bundle.retell.llm?.llm_id ||
      trustedCall.llm_version !== bundle.retell.llm?.version ||
      trustedCall.provider_log_sha256 !== result.provider_log_sha256
    ) {
      add('TRUSTED_CALL_EVIDENCE', 'Test, lead, tenant, call ID, destination, exact provider versions, and provider-log hash must match independent trusted evidence.', result.test_id);
    }
    if (!hasText(result.reviewer)) add('REVIEWER', 'The human evidence reviewer is required.', result.test_id);
    if (!isValidTimestamp(result.reviewed_at)) add('REVIEWED_AT', 'A valid human-review timestamp is required.', result.test_id);
    if (result.review_method !== 'human_transcript_and_recording_review') add('REVIEW_METHOD', 'The required transcript-and-recording review method was not attested.', result.test_id);
    const expectedDisposition = scenario.expected?.disposition;
    if (expectedDisposition && result.observed_disposition !== expectedDisposition) {
      add('DISPOSITION_MISMATCH', `Expected ${expectedDisposition}, observed ${result.observed_disposition || 'none'}.`, result.test_id);
    }
    for (const [assertion, expectedValue] of Object.entries(scenario.expected || {})) {
      if (assertion === 'disposition') continue;
      if (result.assertion_results?.[assertion] !== expectedValue) {
        add('ASSERTION_NOT_ATTESTED', `Expected assertion ${assertion} was not attested with its required value.`, result.test_id);
      }
    }
  }

  const passed = results.filter((result) => result.passed === true && result.hard_failure === false).length;
  const denominator = expectedTests.size;
  const passRate = denominator > 0 ? passed / denominator : 0;
  if (passRate !== bundle.conversationTests.minimum_required_pass_rate) {
    add('PASS_RATE', `Pass rate ${(passRate * 100).toFixed(2)}% is below the required 100%.`);
  }

  return {
    valid: issues.length === 0,
    evidence_manifest_complete: issues.length === 0,
    human_review_attestation_only: true,
    semantic_execution_certified: false,
    launch_certificate_created: false,
    suite_id: bundle.conversationTests.suite_id,
    required_tests: denominator,
    submitted_results: results.length,
    passed_results: passed,
    pass_rate: passRate,
    hard_failures: results.filter((result) => result.hard_failure === true).length,
    issues,
  };
}

function substituteStaticPrompt(text, substitutions) {
  let resolved = String(text);
  for (const [name, value] of Object.entries(substitutions)) {
    resolved = resolved.replaceAll(`{{${name}}}`, String(value));
  }
  resolved = resolved
    .replaceAll('__REQUIRED_LEGAL_ENTITY__', String(substitutions.registered_seller_name))
    .replaceAll('__REQUIRED_PUBLIC_PHONE__', String(substitutions.approved_customer_service_number));
  return resolved;
}

function buildRetellProviderPayloads(bundle, resolvedPrompt, resolvedBeginMessage) {
  const { retell } = bundle;
  const responseEngine = {
    type: retell.agent.response_engine.type,
    llm_id: retell.agent.response_engine.llm_id,
    version: retell.agent.response_engine.version,
  };
  return {
    llm_create_or_update_payload: {
      model: retell.llm.model,
      model_temperature: retell.llm.model_temperature,
      tool_call_strict_mode: retell.llm.tool_call_strict_mode,
      start_speaker: retell.llm.start_speaker,
      begin_message: resolvedBeginMessage,
      general_prompt: resolvedPrompt,
      general_tools: retell.llm.general_tools,
      states: retell.llm.states,
      mcps: retell.llm.mcps,
    },
    agent_create_or_update_payload: {
      response_engine: responseEngine,
      voice_id: retell.agent.voice_id,
      agent_name: retell.agent.agent_name,
      language: retell.agent.language,
      webhook_url: retell.agent.webhook_url,
      webhook_events: retell.agent.webhook_events,
      opt_in_signed_url: retell.agent.opt_in_signed_url,
      data_storage_setting: retell.agent.data_storage_setting,
      data_storage_retention_days: retell.agent.data_storage_retention_days,
      pii_config: retell.agent.pii_config,
      max_call_duration_ms: retell.agent.max_call_duration_ms,
      voicemail_option: retell.agent.voicemail_option,
      post_call_analysis_model: retell.agent.post_call_analysis_model,
      post_call_analysis_data: retell.agent.post_call_analysis_data,
    },
  };
}

export function compileSolarExitDraft(bundle = loadSolarExitBundle(), { trustRoot = null } = {}) {
  const validationMode = bundle.manifest.environment === 'production_candidate'
    ? 'launch'
    : bundle.manifest.environment === 'installation_candidate'
      ? 'installation'
      : 'offline';
  const validation = validateSolarExitBundleData(bundle, { mode: validationMode, trustRoot });
  if (!validation.valid) {
    throw new Error(`Solar Exit bundle is structurally invalid: ${validation.error_count} error(s)`);
  }
  const { manifest, retell, eligibility, ghl, directImport, reactivation, dispositions } = bundle;
  const substitutions = retell.publish_time_static_substitutions || {};
  const staticBindingsResolved =
    hasText(substitutions.registered_seller_name) &&
    !isRequiredPlaceholder(substitutions.registered_seller_name) &&
    hasText(substitutions.approved_customer_service_number) &&
    !isRequiredPlaceholder(substitutions.approved_customer_service_number);
  const resolvedPrompt = staticBindingsResolved ? substituteStaticPrompt(bundle.prompt, substitutions) : null;
  const resolvedBeginMessage = staticBindingsResolved ? substituteStaticPrompt(retell.llm.begin_message, substitutions) : null;
  const llmPayloadBlockers = [];
  if (validationMode === 'offline') llmPayloadBlockers.push('Copy the immutable source bundle and set environment to installation_candidate.');
  if (!staticBindingsResolved || resolvedPrompt === null || resolvedBeginMessage === null) llmPayloadBlockers.push('Resolve the exact legal seller and public customer-service number.');
  if (!hasText(retell.llm.model) || isRequiredPlaceholder(retell.llm.model)) llmPayloadBlockers.push('Resolve an approved Retell text model.');
  const llmPayloadReady = llmPayloadBlockers.length === 0;

  const agentPayloadBlockers = [...llmPayloadBlockers];
  if (!hasText(retell.llm.llm_id) || isRequiredPlaceholder(retell.llm.llm_id)) agentPayloadBlockers.push('Create the Retell LLM and bind its returned ID.');
  if (!Number.isSafeInteger(retell.llm.version) || retell.llm.version < 0) agentPayloadBlockers.push('Bind the exact non-negative Retell LLM version.');
  if (!hasText(retell.agent.voice_id) || isRequiredPlaceholder(retell.agent.voice_id)) agentPayloadBlockers.push('Resolve an approved Retell voice ID.');
  if (!/^https:\/\//i.test(retell.agent.webhook_url || '') || isRequiredPlaceholder(retell.agent.webhook_url)) agentPayloadBlockers.push('Resolve the canonical HTTPS webhook URL.');
  if (retell.agent.response_engine?.llm_id !== retell.llm.llm_id || retell.agent.response_engine?.version !== retell.llm.version) {
    agentPayloadBlockers.push('Bind the Voice Agent response engine to the exact LLM ID and version.');
  }
  const agentPayloadReady = agentPayloadBlockers.length === 0;
  const providerPayloads = llmPayloadReady
    ? buildRetellProviderPayloads(bundle, resolvedPrompt, resolvedBeginMessage)
    : { llm_create_or_update_payload: null, agent_create_or_update_payload: null };
  return {
    operation: 'dry_run_only',
    database_write_performed: false,
    provider_write_performed: false,
    production_launch_allowed: false,
    campaign_row: {
      user_id: manifest.installation_bindings.owner_user_id,
      organization_id: manifest.installation_bindings.organization_id,
      name: manifest.campaign.name,
      description: manifest.campaign.description,
      status: 'draft',
      provider: 'retell',
      agent_id: retell.agent.agent_id,
      telnyx_assistant_id: null,
      workflow_id: null,
      sms_from_number: null,
      calls_per_minute: manifest.campaign.calls_per_minute,
      max_calls_per_day: manifest.campaign.max_calls_per_day,
      max_attempts: manifest.campaign.max_attempts,
      retry_delay_minutes: manifest.campaign.retry_delay_minutes,
      calling_hours_start: manifest.campaign.calling_hours_start,
      calling_hours_end: manifest.campaign.calling_hours_end,
      timezone: manifest.campaign.timezone,
      script: resolvedPrompt || bundle.prompt,
      metadata: {
        bundle_id: manifest.bundle_id,
        bundle_version: manifest.bundle_version,
        production_launch_allowed: false,
        cohort: manifest.launch_profile.cohort,
        timezone_strategy: manifest.campaign.timezone_strategy,
        eligibility_policy_id: eligibility.policy_id,
        reactivation_policy_id: reactivation.policy_id,
        reactivation_mode: reactivation.mode,
        voicemail_enabled: false,
        sms_enabled: false,
        booking_enabled: false,
        live_transfer_enabled: false,
        provider_fallback_enabled: false,
        legacy_aliases: manifest.legacy_aliases,
      },
    },
    retell_target: {
      artifact_kind: 'offline_spec_until_launch_gate_passes',
      provider_payload_ready: llmPayloadReady && agentPayloadReady,
      llm_payload_ready: llmPayloadReady,
      agent_payload_ready: agentPayloadReady,
      provider_write_performed: false,
      llm_payload_blockers: llmPayloadBlockers,
      agent_payload_blockers: agentPayloadBlockers,
      prompt_template_sha256: sha256(bundle.prompt),
      static_substitutions: substitutions,
      resolved_prompt: resolvedPrompt,
      resolved_begin_message: resolvedBeginMessage,
      provider_llm_payload: llmPayloadReady ? providerPayloads.llm_create_or_update_payload : null,
      provider_agent_payload: agentPayloadReady ? providerPayloads.agent_create_or_update_payload : null,
      certification_target: {
        agent_id: retell.agent.agent_id,
        agent_version: retell.agent.version,
        agent_is_published: retell.agent.is_published,
        llm_id: retell.llm.llm_id,
        llm_version: retell.llm.version,
        llm_is_published: retell.llm.is_published,
        dynamic_variable_allowlist: retell.dynamic_variable_allowlist,
        outbound_call_defaults: retell.outbound_call_defaults,
        post_call_analysis_data: retell.agent.post_call_analysis_data,
      },
    },
    disposition_targets: dispositions.dispositions,
    ghl_target: {
      optional_adapter: true,
      mode: ghl.mode,
      inbound_enabled: ghl.inbound_enabled,
      outbound_writeback_enabled: ghl.outbound_writeback_enabled,
      location_id: ghl.location_id,
    },
    direct_import_target: {
      primary_adapter: true,
      mode: directImport.mode,
      enabled: directImport.enabled,
      gohighlevel_required: directImport.gohighlevel_required,
      network_access_allowed: directImport.network_access_allowed,
      output_mode: directImport.output_mode,
      source_system: directImport.source_system,
      allowed_lead_source: directImport.allowed_lead_source,
      signing_key_id: directImport.signing?.signing_key_id,
      signer_principal_id: directImport.signing?.signer_principal_id,
      public_key_spki_sha256: directImport.signing?.public_key_spki_sha256,
    },
    launch_gate: {
      required_placeholders: validation.required_placeholders,
      blockers: validation.launch_blockers,
    },
  };
}
