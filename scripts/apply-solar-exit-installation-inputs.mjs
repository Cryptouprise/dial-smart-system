#!/usr/bin/env node

/**
 * Applies non-secret, reviewed installation values to an isolated Elite Solar
 * candidate. This is deliberately a configuration compiler, not a provider
 * installer: it cannot contact Retell, GHL, Supabase, a CRM, or a person.
 */

import { existsSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  computeCanonicalSourceDigest,
  DEFAULT_SOLAR_EXIT_BUNDLE_ROOT,
  loadSolarExitBundle,
  requiredPlaceholderOccurrences,
} from './lib/solar-exit-bundle.mjs';
import { parseStrictJsonDocument } from './lib/ghl-shadow-reconciliation.mjs';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const EXTERNAL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function usage() {
  return [
    'Usage:',
    '  node scripts/apply-solar-exit-installation-inputs.mjs --root <isolated-candidate-directory> --input <external-installation-input.json> [--dry-run]',
    '',
    'The input file must be outside the repository and candidate directories.',
    'It may contain reviewed public identifiers, versions, and direct-import public-key fingerprint data only.',
    'It must never contain an API key, private key, secret, password, token, raw lead, or consent record.',
    'The command leaves the candidate installation-only and never contacts a provider, CRM, database, or lead.',
  ].join('\n');
}

function option(name) {
  const exact = process.argv.find((argument) => argument.startsWith(`--${name}=`));
  if (exact) return exact.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
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

function object(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new TypeError(`${path} must be a plain object.`);
  }
  return value;
}

function exactKeys(value, path, allowed, required = allowed) {
  const record = object(value, path);
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) throw new TypeError(`${path}.${key} is not allowed.`);
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) throw new TypeError(`${path}.${key} is required.`);
  }
  return record;
}

function text(value, path, { pattern = EXTERNAL_ID_PATTERN, maximum = 256 } = {}) {
  if (typeof value !== 'string' || value.trim() !== value || value.length < 1 || value.length > maximum || !pattern.test(value)) {
    throw new TypeError(`${path} has an invalid value.`);
  }
  return value;
}

function humanText(value, path, maximum = 200) {
  if (typeof value !== 'string' || value.trim() !== value || value.length < 1 || value.length > maximum || /[\x00-\x1f\x7f]/.test(value)) {
    throw new TypeError(`${path} has an invalid value.`);
  }
  return value;
}

function uuid(value, path) {
  return text(value, path, { pattern: UUID_PATTERN, maximum: 36 });
}

function phone(value, path) {
  return text(value, path, { pattern: E164_PATTERN, maximum: 16 });
}

function version(value, path) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000) throw new TypeError(`${path} must be a non-negative integer.`);
  return value;
}

function httpsUrl(value, path) {
  const raw = text(value, path, { pattern: /^https:\/\/[^\s]{1,240}$/, maximum: 256 });
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new TypeError(`${path} must be an HTTPS URL.`);
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) {
    throw new TypeError(`${path} must be a credential-free HTTPS URL without a fragment.`);
  }
  return raw;
}

function pair(value, path, idKey) {
  const record = exactKeys(value, path, [idKey, 'version']);
  return {
    [idKey]: text(record[idKey], `${path}.${idKey}`),
    version: version(record.version, `${path}.version`),
  };
}

function parseInput(contents) {
  const root = exactKeys(parseStrictJsonDocument(contents), '$', [
    'schema_version', 'company', 'installation', 'direct_import', 'legal_and_operations', 'retell',
  ], ['schema_version', 'company', 'installation', 'direct_import', 'legal_and_operations']);
  if (root.schema_version !== '1.0.0') throw new TypeError('$.schema_version must be 1.0.0.');

  const company = exactKeys(root.company, '$.company', ['legal_entity', 'public_phone']);
  const installation = exactKeys(root.installation, '$.installation', ['owner_user_id', 'organization_id']);
  const directImport = exactKeys(root.direct_import, '$.direct_import', [
    'source_system', 'allowed_lead_source', 'signing_key_id', 'signer_principal_id', 'public_key_spki_sha256',
  ]);
  const legal = exactKeys(root.legal_and_operations, '$.legal_and_operations', [
    'counsel_policy_version', 'counsel_service_classification', 'fee_model_approval_id',
    'customer_agreement_version', 'privacy_notice_version', 'claims_substantiation_version',
    'recording_matrix_version', 'national_and_state_dnc_process_version',
    'reassigned_number_process_version', 'human_escalation_sla',
  ]);

  let retell;
  if (root.retell !== undefined) {
    const raw = exactKeys(root.retell, '$.retell', [
      'approved_model', 'voice_id', 'owned_from_number', 'canonical_webhook_url', 'llm', 'agent',
    ], []);
    retell = {};
    if (raw.approved_model !== undefined) retell.approved_model = text(raw.approved_model, '$.retell.approved_model', { pattern: MODEL_PATTERN, maximum: 128 });
    if (raw.voice_id !== undefined) retell.voice_id = text(raw.voice_id, '$.retell.voice_id');
    if (raw.owned_from_number !== undefined) retell.owned_from_number = phone(raw.owned_from_number, '$.retell.owned_from_number');
    if (raw.canonical_webhook_url !== undefined) retell.canonical_webhook_url = httpsUrl(raw.canonical_webhook_url, '$.retell.canonical_webhook_url');
    if (raw.llm !== undefined) retell.llm = pair(raw.llm, '$.retell.llm', 'llm_id');
    if (raw.agent !== undefined) retell.agent = pair(raw.agent, '$.retell.agent', 'agent_id');
    if (retell.agent && !retell.llm) throw new TypeError('$.retell.agent requires $.retell.llm in the same reviewed input.');
  }

  return {
    company: {
      legal_entity: humanText(company.legal_entity, '$.company.legal_entity'),
      public_phone: phone(company.public_phone, '$.company.public_phone'),
    },
    installation: {
      owner_user_id: uuid(installation.owner_user_id, '$.installation.owner_user_id'),
      organization_id: uuid(installation.organization_id, '$.installation.organization_id'),
    },
    direct_import: {
      source_system: text(directImport.source_system, '$.direct_import.source_system'),
      allowed_lead_source: text(directImport.allowed_lead_source, '$.direct_import.allowed_lead_source'),
      signing_key_id: text(directImport.signing_key_id, '$.direct_import.signing_key_id'),
      signer_principal_id: text(directImport.signer_principal_id, '$.direct_import.signer_principal_id'),
      public_key_spki_sha256: text(directImport.public_key_spki_sha256, '$.direct_import.public_key_spki_sha256', { pattern: SHA256_PATTERN, maximum: 64 }),
    },
    legal_and_operations: Object.fromEntries(Object.entries(legal).map(([key, value]) => [key, text(value, `$.legal_and_operations.${key}`)])),
    retell,
  };
}

function assertCandidate(bundle, candidateRoot) {
  const canonicalRoot = normalizedRealPath(DEFAULT_SOLAR_EXIT_BUNDLE_ROOT);
  if (candidateRoot === canonicalRoot || isPathInside(canonicalRoot, candidateRoot)) {
    throw new Error('Candidate root must be an isolated copy outside the immutable source template.');
  }
  const canonical = loadSolarExitBundle(DEFAULT_SOLAR_EXIT_BUNDLE_ROOT);
  const canonicalDigest = computeCanonicalSourceDigest(canonical);
  const sourceDigest = canonical.manifest.release_provenance?.canonical_source_sha256;
  if (canonicalDigest !== sourceDigest) throw new Error('Canonical Solar Exit source digest is not pinned.');
  const manifest = bundle.manifest;
  const provenance = manifest.release_provenance || {};
  if (
    manifest.environment !== 'installation_candidate' ||
    manifest.bundle_status !== 'installation_pending' ||
    manifest.production_launch_allowed !== false ||
    provenance.canonical_source_sha256 !== sourceDigest ||
    provenance.source_parent?.bundle_id !== canonical.manifest.bundle_id ||
    provenance.source_parent?.bundle_version !== canonical.manifest.bundle_version ||
    provenance.source_parent?.sha256 !== sourceDigest ||
    typeof provenance.release_candidate_id !== 'string' || provenance.release_candidate_id.length < 8
  ) throw new Error('Candidate must be an untouched, isolated, launch-disabled Solar Exit installation candidate.');
}

function applyInput(bundle, input) {
  const { manifest, directImport, reactivation, eligibility, retell } = bundle;
  manifest.company.legal_entity = input.company.legal_entity;
  manifest.company.public_phone = input.company.public_phone;
  manifest.installation_bindings.owner_user_id = input.installation.owner_user_id;
  manifest.installation_bindings.organization_id = input.installation.organization_id;
  manifest.legal_and_operations.counsel_service_classification = input.legal_and_operations.counsel_service_classification;
  manifest.legal_and_operations.fee_model_approval_id = input.legal_and_operations.fee_model_approval_id;
  manifest.legal_and_operations.customer_agreement_version = input.legal_and_operations.customer_agreement_version;
  manifest.legal_and_operations.privacy_notice_version = input.legal_and_operations.privacy_notice_version;
  manifest.legal_and_operations.claims_substantiation_version = input.legal_and_operations.claims_substantiation_version;
  manifest.legal_and_operations.recording_matrix_version = input.legal_and_operations.recording_matrix_version;
  manifest.legal_and_operations.national_and_state_dnc_process_version = input.legal_and_operations.national_and_state_dnc_process_version;
  manifest.legal_and_operations.reassigned_number_process_version = input.legal_and_operations.reassigned_number_process_version;
  manifest.legal_and_operations.human_escalation_sla = input.legal_and_operations.human_escalation_sla;

  directImport.organization_id = input.installation.organization_id;
  directImport.legal_seller = input.company.legal_entity;
  directImport.source_system = input.direct_import.source_system;
  directImport.allowed_lead_source = input.direct_import.allowed_lead_source;
  directImport.signing.signing_key_id = input.direct_import.signing_key_id;
  directImport.signing.signer_principal_id = input.direct_import.signer_principal_id;
  directImport.signing.public_key_spki_sha256 = input.direct_import.public_key_spki_sha256;

  reactivation.source_scope.primary_source_mode = 'signed_direct_import';
  reactivation.source_scope.source_system = input.direct_import.source_system;
  reactivation.source_scope.approved_lead_source = input.direct_import.allowed_lead_source;
  reactivation.source_scope.ghl_reconciliation_required = false;
  eligibility.policy_version = input.legal_and_operations.counsel_policy_version;
  eligibility.consent.required_seller = input.company.legal_entity;

  if (input.retell) {
    if (input.retell.approved_model) retell.llm.model = input.retell.approved_model;
    if (input.retell.voice_id) retell.agent.voice_id = input.retell.voice_id;
    if (input.retell.owned_from_number) retell.outbound_call_defaults.from_number = input.retell.owned_from_number;
    if (input.retell.canonical_webhook_url) retell.agent.webhook_url = input.retell.canonical_webhook_url;
    if (input.retell.llm) {
      retell.llm.llm_id = input.retell.llm.llm_id;
      retell.llm.version = input.retell.llm.version;
      retell.agent.response_engine.llm_id = input.retell.llm.llm_id;
      retell.agent.response_engine.version = input.retell.llm.version;
    }
    if (input.retell.agent) {
      retell.agent.agent_id = input.retell.agent.agent_id;
      retell.agent.version = input.retell.agent.version;
      retell.outbound_call_defaults.agent_version = input.retell.agent.version;
    }
  }

  // This compiler can resolve configuration, never authority.
  manifest.environment = 'installation_candidate';
  manifest.bundle_status = 'installation_pending';
  manifest.production_launch_allowed = false;
  eligibility.consent.synthetic_offline_override.enabled = false;
}

function writeJson(path, value) {
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  renameSync(temporary, path);
}

try {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }
  const allowed = new Set(['--root', '--input', '--dry-run']);
  for (let index = 2; index < process.argv.length; index += 1) {
    const argument = process.argv[index];
    if (argument.startsWith('--') && ![...allowed].some((name) => argument === name || argument.startsWith(`${name}=`))) throw new Error(`Unsupported option: ${argument}`);
    if (argument === '--root' || argument === '--input') index += 1;
  }
  const rootInput = option('root');
  const inputPath = option('input');
  const dryRun = process.argv.includes('--dry-run');
  if (!rootInput || !inputPath) throw new Error('--root and --input are required.');
  if (!existsSync(rootInput) || !existsSync(inputPath)) throw new Error('--root and --input must both exist.');

  const candidateRoot = normalizedRealPath(rootInput);
  const inputRealPath = normalizedRealPath(inputPath);
  const repositoryRoot = normalizedRealPath(REPO_ROOT);
  if (isPathInside(repositoryRoot, candidateRoot, { allowSame: true })) throw new Error('Candidate root must be outside the repository.');
  if (isPathInside(repositoryRoot, inputRealPath, { allowSame: true }) || isPathInside(candidateRoot, inputRealPath, { allowSame: true })) {
    throw new Error('Installation input must be stored outside both repository and candidate directories.');
  }

  const input = parseInput(readFileSync(inputRealPath, 'utf8'));
  const bundle = loadSolarExitBundle(candidateRoot);
  assertCandidate(bundle, candidateRoot);
  applyInput(bundle, input);

  const unresolved = [...new Set(requiredPlaceholderOccurrences(bundle).map((entry) => entry.placeholder))].sort();
  const artifactPaths = bundle.artifactPaths;
  if (!dryRun) {
    writeJson(resolve(candidateRoot, 'manifest.json'), bundle.manifest);
    writeJson(artifactPaths.direct_import_mapping, bundle.directImport);
    writeJson(artifactPaths.reactivation_policy, bundle.reactivation);
    writeJson(artifactPaths.eligibility_policy, bundle.eligibility);
    writeJson(artifactPaths.retell_agent, bundle.retell);
  }
  process.stdout.write(`${JSON.stringify({
    operation: dryRun ? 'dry_run_apply_installation_inputs' : 'apply_installation_inputs',
    candidate_id: bundle.manifest.release_provenance.release_candidate_id,
    candidate_root: candidateRoot,
    fields_applied: [
      'company_and_tenant_binding', 'legal_and_operations_references', 'signed_direct_import_profile',
      'reactivation_source_scope', 'counsel_policy_reference', ...(input.retell ? ['provided_retell_nonsecret_bindings'] : []),
    ],
    unresolved_required_placeholders: unresolved,
    production_launch_allowed: false,
    provider_write_performed: false,
    crm_or_database_write_performed: false,
    contact_created: false,
    secrets_accepted: false,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Solar Exit installation inputs were not applied: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
