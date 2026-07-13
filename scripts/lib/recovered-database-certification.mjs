import { randomUUID } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import {
  REMOTE_CREDENTIAL_ENV_KEYS,
  assertGeneratedTypesMatch,
  assertLocalOnlySupabaseArgs,
  isolateSupabaseConfig,
  normalizeGeneratedTypes,
  normalizeSchemaDump,
  sanitizedCertificationEnv,
} from './fresh-database-certification.mjs';
import {
  canonicalJson,
  prettyCanonicalJson,
  sha256,
} from './database-recovery-candidate.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const MIGRATION_FILENAME = /^(\d{14})_([a-z0-9_]+)\.sql$/;
const URI_OR_UNC = /^(?:[a-z][a-z0-9+.-]*:\/\/|\\\\|\/\/)/i;
const EXACT_CERTIFICATION_NEXT = [
  'restore_baseline_and_compare_normalized_source_schema',
  'replay_candidate_chain_twice_in_disposable_supabase',
  'run_all_sql_contracts',
  'run_database_lint',
  'match_generated_types',
  'match_two_final_schema_dumps',
];
const EXACT_BASELINE_RULES = [
  'normalize_line_endings',
  'remove_pg_dump_restrict_guards',
  'make_public_schema_create_idempotent',
  'prepend_offline_safety_header',
];
const ROOT_ENTRIES = ['README.md', 'lineage-lock.json', 'migrations'];

export const RECOVERED_CERTIFICATE_TYPE = 'dial_smart_recovered_database_disposable_replay';
export const RECOVERED_CERTIFICATE_SCOPE = 'disposable_recovery_lineage_evidence_only';

export const ADDITIONAL_REMOTE_CREDENTIAL_ENV_KEYS = [
  'DB_URL',
  'DIRECT_URL',
  'PGPASSFILE',
  'PGSERVICE',
  'PGSERVICEFILE',
  'POSTGRES_PRISMA_URL',
  'POSTGRES_URL_NON_POOLING',
  'PRISMA_DATABASE_URL',
  'SUPABASE_DATABASE_URL',
  'SUPABASE_DB_URL',
  'SUPABASE_PROJECT_REF',
];

export const ALL_REMOTE_CREDENTIAL_ENV_KEYS = [
  ...new Set([...REMOTE_CREDENTIAL_ENV_KEYS, ...ADDITIONAL_REMOTE_CREDENTIAL_ENV_KEYS]),
].sort();

export const DOCKER_OVERRIDE_ENV_KEYS = [
  'DOCKER_CERT_PATH',
  'DOCKER_CONFIG',
  'DOCKER_CONTEXT',
  'DOCKER_HOST',
  'DOCKER_TLS_VERIFY',
];

const RECOVERED_REPOSITORY_CONFIGURATION_FILES = [
  ['database_certification', 'certification/database-certification.json'],
  ['database_recovery', 'certification/database-recovery-candidate.json'],
  ['supabase_config', 'supabase/config.toml'],
];

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
}

function assertExactKeys(value, expected, label) {
  assertPlainObject(value, label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (canonicalJson(actual) !== canonicalJson(wanted)) {
    throw new Error(`${label} fields must be exactly ${wanted.join(', ')}; got ${actual.join(', ')}.`);
  }
}

function assertSha(value, label) {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest.`);
  }
}

function samePath(left, right) {
  const normalize = (value) => process.platform === 'win32' ? value.toLowerCase() : value;
  return normalize(resolve(left)) === normalize(resolve(right));
}

function isWithin(parent, child) {
  const pathFromParent = relative(resolve(parent), resolve(child));
  return pathFromParent === '' || (
    pathFromParent !== '..'
    && !pathFromParent.startsWith(`..${sep}`)
    && !isAbsolute(pathFromParent)
  );
}

function assertRegularFileNoLink(path, label) {
  const info = lstatSync(path);
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new Error(`${label} must be a regular, non-linked file.`);
  }
  return info;
}

function assertDirectoryNoLink(path, label) {
  const info = lstatSync(path);
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new Error(`${label} must be a regular, non-linked directory.`);
  }
  return info;
}

export function resolveExplicitLocalDirectory(value, label = 'Candidate directory') {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    throw new Error(`${label} must be supplied as an explicit non-empty filesystem path.`);
  }
  if (value.includes('\0') || URI_OR_UNC.test(value)) {
    throw new Error(`${label} must be a local filesystem path, not a URI or UNC path.`);
  }
  const absolute = resolve(value);
  assertDirectoryNoLink(absolute, label);
  const real = realpathSync.native(absolute);
  if (!samePath(absolute, real)) {
    throw new Error(`${label} and all of its ancestors must not traverse filesystem links.`);
  }
  return absolute;
}

function readRepositoryFileNoLink(repoRoot, relativePath, label) {
  if (
    typeof relativePath !== 'string'
    || relativePath.length === 0
    || relativePath.trim() !== relativePath
    || isAbsolute(relativePath)
    || URI_OR_UNC.test(relativePath)
  ) {
    throw new Error(`${label} must be a safe repository-relative path.`);
  }
  const root = resolve(repoRoot);
  const target = resolve(root, relativePath);
  if (!isWithin(root, target) || samePath(root, target)) {
    throw new Error(`${label} escapes the repository root.`);
  }
  const info = assertRegularFileNoLink(target, label);
  if (!samePath(realpathSync.native(target), target)) {
    throw new Error(`${label} must not traverse filesystem links.`);
  }
  const contents = readFileSync(target);
  return {
    relative_path: relativePath.replaceAll('\\', '/'),
    bytes: info.size,
    sha256: sha256(contents),
    contents,
  };
}

function publicRepositoryConfiguration(snapshot) {
  const files = Object.fromEntries(Object.entries(snapshot.files).map(([key, file]) => [key, {
    relative_path: file.relative_path,
    bytes: file.bytes,
    sha256: file.sha256,
  }]));
  return {
    files,
    fingerprint_sha256: sha256(canonicalJson(files)),
  };
}

export function captureRecoveredRepositoryConfiguration(repoRoot) {
  const files = Object.fromEntries(RECOVERED_REPOSITORY_CONFIGURATION_FILES.map(([key, relativePath]) => [
    key,
    readRepositoryFileNoLink(repoRoot, relativePath, `Repository configuration ${relativePath}`),
  ]));
  return {
    repoRoot: resolve(repoRoot),
    files,
    ...publicRepositoryConfiguration({ files }),
  };
}

export function assertRecoveredRepositoryConfigurationUnchanged(repoRoot, snapshot) {
  const current = captureRecoveredRepositoryConfiguration(repoRoot);
  if (canonicalJson(publicRepositoryConfiguration(current)) !== canonicalJson(publicRepositoryConfiguration(snapshot))) {
    throw new Error(
      'Recovered database certification policy/runtime configuration changed while certification was running; no certificate was created.',
    );
  }
  return publicRepositoryConfiguration(current);
}

export function readRecoveredCommittedTypes(repoRoot, relativePath) {
  return readRepositoryFileNoLink(repoRoot, relativePath, 'Committed Supabase types');
}

export function assertNoRemoteCredentialEnvironment(source = process.env) {
  const present = ALL_REMOTE_CREDENTIAL_ENV_KEYS.filter((key) => (
    Object.hasOwn(source, key)
    && source[key] !== undefined
    && String(source[key]).trim().length > 0
  ));
  if (present.length > 0) {
    throw new Error(
      `Recovered database certification refuses remote/database credential environment variables: ${present.join(', ')}. `
      + 'Run from a clean local-only shell; credentials are never needed for this gate.',
    );
  }
}

export function assertNoDockerOverrideEnvironment(source = process.env) {
  const present = DOCKER_OVERRIDE_ENV_KEYS.filter((key) => (
    Object.hasOwn(source, key)
    && source[key] !== undefined
    && String(source[key]).trim().length > 0
  ));
  if (present.length > 0) {
    throw new Error(
      `Recovered database certification refuses Docker target/configuration overrides: ${present.join(', ')}. `
      + 'Use the reviewed active local Docker context with no environment override.',
    );
  }
}

export function recoveredCertificationEnv(source = process.env) {
  assertNoRemoteCredentialEnvironment(source);
  assertNoDockerOverrideEnvironment(source);
  const sanitized = sanitizedCertificationEnv(source);
  for (const key of ALL_REMOTE_CREDENTIAL_ENV_KEYS) delete sanitized[key];
  for (const key of DOCKER_OVERRIDE_ENV_KEYS) delete sanitized[key];
  return sanitized;
}

export function assertLocalDockerContextResults(contextResult, endpointResult) {
  const commandFailure = (result, label) => {
    if (result?.error || result?.status !== 0) {
      const detail = result?.error?.message || String(result?.stderr ?? '').trim() || `exit ${result?.status ?? 'unknown'}`;
      throw new Error(`Could not verify ${label}: ${detail}`);
    }
    const value = String(result?.stdout ?? '').trim();
    if (!value || /[\r\n]/.test(value)) {
      throw new Error(`${label} must be one non-empty line.`);
    }
    return value;
  };
  const context = commandFailure(contextResult, 'the active Docker context');
  const endpoint = commandFailure(endpointResult, 'the active Docker endpoint');
  const transport = endpoint.startsWith('unix://')
    ? 'unix'
    : endpoint.startsWith('npipe://')
      ? 'npipe'
      : null;
  if (!transport) {
    throw new Error(
      `Recovered database certification requires a local unix:// or npipe:// Docker endpoint; active context ${context} uses ${endpoint}.`,
    );
  }
  if (
    (transport === 'unix' && !/^unix:\/\/\/.+/.test(endpoint))
    || (transport === 'npipe' && !/^npipe:\/\/\/.+/.test(endpoint))
  ) {
    throw new Error(`Active Docker endpoint is not a canonical local ${transport} endpoint: ${endpoint}.`);
  }
  return { context, endpoint, transport };
}

function parseFlagToken(token) {
  const equals = token.indexOf('=');
  return equals === -1
    ? { flag: token, inlineValue: null }
    : { flag: token.slice(0, equals), inlineValue: token.slice(equals + 1) };
}

export function parseRecoveredCertificationArgs(argv) {
  const allowed = new Set([
    '--candidate-dir',
    '--certificate-out',
    '--expected-lineage-content-sha256',
    '--expected-lineage-file-sha256',
  ]);
  const forbidden = new Set([
    '--db-url',
    '--linked',
    '--password',
    '--project-id',
    '--project-ref',
    '--remote',
    '--workdir',
  ]);
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (typeof token !== 'string' || !token.startsWith('--')) {
      throw new Error(`Unexpected positional argument: ${String(token)}.`);
    }
    const { flag, inlineValue } = parseFlagToken(token);
    if (forbidden.has(flag)) {
      throw new Error(`Remote or caller-selected database target flag is forbidden: ${flag}.`);
    }
    if (!allowed.has(flag)) throw new Error(`Unknown recovered-certification option: ${flag}.`);
    if (Object.hasOwn(parsed, flag)) throw new Error(`Duplicate option: ${flag}.`);
    const value = inlineValue ?? argv[++index];
    if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) {
      throw new Error(`${flag} requires a value.`);
    }
    parsed[flag] = value;
  }
  if (!parsed['--candidate-dir']) {
    throw new Error('--candidate-dir is required; recovery candidates are never auto-discovered.');
  }
  if (!parsed['--expected-lineage-file-sha256']) {
    throw new Error(
      '--expected-lineage-file-sha256 is required as an external trust root; the digest inside the candidate is not sufficient.',
    );
  }
  assertSha(parsed['--expected-lineage-file-sha256'], '--expected-lineage-file-sha256');
  if (parsed['--expected-lineage-content-sha256']) {
    assertSha(parsed['--expected-lineage-content-sha256'], '--expected-lineage-content-sha256');
  }
  return {
    candidateDir: parsed['--candidate-dir'],
    certificateOut: parsed['--certificate-out'] ?? null,
    expectedLineageContentSha256: parsed['--expected-lineage-content-sha256'] ?? null,
    expectedLineageFileSha256: parsed['--expected-lineage-file-sha256'],
  };
}

export function expectedRecoveryCandidateReadme(contentSha256) {
  assertSha(contentSha256, 'Lineage lock content SHA-256');
  return [
    '# Offline database recovery candidate',
    '',
    'This directory was compiled from a pinned schema-only snapshot and a separately captured read-only migration ledger.',
    'It has not been executed against any database and is not a production migration, deployment artifact, or launch certificate.',
    '',
    `Lineage lock content SHA-256: ${contentSha256}`,
    '',
    'Next: use a separate disposable-only certifier to replay this exact chain twice and run every SQL contract, lint, type, and schema-determinism gate.',
    'Never apply the baseline migration to the existing production database.',
    '',
  ].join('\n');
}

function validatePinnedSource(lock, recoveryConfig) {
  assertExactKeys(
    lock.source_snapshot,
    ['bytes', 'database_version', 'filename', 'inventory', 'pg_dump_version', 'sha256'],
    'lineage-lock source_snapshot',
  );
  assertExactKeys(
    lock.source_snapshot.inventory,
    ['functions', 'policies', 'tables', 'triggers', 'views'],
    'lineage-lock source_snapshot.inventory',
  );
  const expected = recoveryConfig.source_snapshot;
  for (const [lockKey, configKey] of [
    ['filename', 'filename'],
    ['sha256', 'sha256'],
    ['bytes', 'bytes'],
    ['database_version', 'postgres_database_version'],
    ['pg_dump_version', 'pg_dump_version'],
  ]) {
    if (lock.source_snapshot[lockKey] !== expected[configKey]) {
      throw new Error(`lineage-lock source_snapshot.${lockKey} does not match the pinned recovery config.`);
    }
  }
  for (const key of ['tables', 'functions', 'policies']) {
    if (lock.source_snapshot.inventory[key] !== expected.inventory[key]) {
      throw new Error(`lineage-lock source inventory ${key} does not match the pinned recovery config.`);
    }
  }
  for (const key of ['triggers', 'views']) {
    if (!Number.isInteger(lock.source_snapshot.inventory[key]) || lock.source_snapshot.inventory[key] < 0) {
      throw new Error(`lineage-lock source inventory ${key} must be a non-negative integer.`);
    }
  }
}

function validateRemoteLineage(lock, recoveryConfig) {
  assertExactKeys(
    lock.remote_ledger,
    ['canonical_rows_sha256', 'captured_at', 'raw_sha256', 'rows', 'source_project_ref_sha256'],
    'lineage-lock remote_ledger',
  );
  assertSha(lock.remote_ledger.raw_sha256, 'lineage-lock remote_ledger.raw_sha256');
  assertSha(lock.remote_ledger.canonical_rows_sha256, 'lineage-lock remote_ledger.canonical_rows_sha256');
  assertSha(lock.remote_ledger.source_project_ref_sha256, 'lineage-lock remote_ledger.source_project_ref_sha256');
  if (lock.remote_ledger.raw_sha256 !== recoveryConfig.remote_ledger.expected_raw_sha256) {
    throw new Error('lineage-lock raw remote ledger does not match the pinned exact ledger artifact digest.');
  }
  if (lock.remote_ledger.canonical_rows_sha256 !== recoveryConfig.remote_ledger.expected_canonical_rows_sha256) {
    throw new Error('lineage-lock remote ledger rows do not match the pinned canonical digest.');
  }
  if (lock.remote_ledger.source_project_ref_sha256 !== sha256(recoveryConfig.remote_ledger.expected_project_ref)) {
    throw new Error('lineage-lock project-reference digest does not match the pinned project.');
  }
  if (
    typeof lock.remote_ledger.captured_at !== 'string'
    || !Number.isFinite(Date.parse(lock.remote_ledger.captured_at))
  ) {
    throw new Error('lineage-lock remote_ledger.captured_at must be an ISO-8601 timestamp.');
  }
  if (lock.remote_ledger.captured_at !== recoveryConfig.remote_ledger.expected_captured_at) {
    throw new Error('lineage-lock remote ledger capture time does not match the exact pinned capture.');
  }
  if (!Array.isArray(lock.remote_ledger.rows)) {
    throw new Error('lineage-lock remote_ledger.rows must be an array.');
  }
  if (lock.remote_ledger.rows.length !== recoveryConfig.remote_ledger.expected_rows) {
    throw new Error('lineage-lock remote ledger row count does not match the pinned recovery config.');
  }
  const versions = new Set();
  let emptyNames = 0;
  for (const [index, row] of lock.remote_ledger.rows.entries()) {
    assertExactKeys(row, ['classification', 'name', 'version'], `lineage-lock remote row ${index}`);
    if (!/^\d{8,14}$/.test(row.version) || versions.has(row.version)) {
      throw new Error(`lineage-lock remote row ${index} has an invalid or duplicate version.`);
    }
    if (
      typeof row.name !== 'string'
      || row.name !== row.name.trim()
      || /[\r\n]/.test(row.name)
      || (row.name.length > 0 && row.name.trim().length === 0)
    ) {
      throw new Error(`lineage-lock remote row ${index} has an invalid name.`);
    }
    if (![
      'remote_only_version_replaced_by_snapshot_baseline',
      'remote_version_with_local_match_replaced_by_snapshot_baseline',
    ].includes(row.classification)) {
      throw new Error(`lineage-lock remote row ${index} has an invalid classification.`);
    }
    versions.add(row.version);
    if (row.name === '') emptyNames += 1;
  }
  if (emptyNames !== recoveryConfig.remote_ledger.expected_empty_names) {
    throw new Error('lineage-lock remote ledger empty-name count does not match the pinned recovery config.');
  }
  const canonicalRows = lock.remote_ledger.rows
    .map(({ version, name }) => ({ version, name }))
    .sort((left, right) => left.version.localeCompare(right.version) || left.name.localeCompare(right.name));
  if (sha256(canonicalJson(canonicalRows)) !== lock.remote_ledger.canonical_rows_sha256) {
    throw new Error('lineage-lock remote ledger classifications do not reproduce the pinned row digest.');
  }
}

function validateRemoteLedgerProvenance(lock, recoveryConfig) {
  const provenance = lock.remote_ledger_provenance;
  const expected = recoveryConfig.remote_ledger_provenance;
  assertExactKeys(
    provenance,
    ['cross_source', 'evidence_class', 'filename', 'production_mutation_performed', 'raw_sha256', 'sources'],
    'lineage-lock remote_ledger_provenance',
  );
  if (provenance.filename !== expected.filename) {
    throw new Error('lineage-lock provenance filename does not match the pinned provenance artifact.');
  }
  assertSha(provenance.raw_sha256, 'lineage-lock remote_ledger_provenance.raw_sha256');
  if (provenance.raw_sha256 !== expected.expected_raw_sha256) {
    throw new Error('lineage-lock remote-ledger provenance does not match the pinned exact provenance digest.');
  }
  if (provenance.evidence_class !== expected.expected_evidence_class) {
    throw new Error('lineage-lock remote-ledger provenance evidence class is invalid.');
  }
  if (!Array.isArray(provenance.sources) || provenance.sources.length !== 2) {
    throw new Error('lineage-lock remote-ledger provenance must contain exactly two read-only sources.');
  }
  for (const [index, source] of provenance.sources.entries()) {
    assertExactKeys(
      source,
      ['endpoint_path', 'interface', 'method', 'provider', 'read_only', 'response_sha256'],
      `lineage-lock remote-ledger provenance source ${index}`,
    );
    assertSha(source.response_sha256, `lineage-lock remote-ledger provenance source ${index} response_sha256`);
  }
  const expectedSources = [...expected.expected_sources]
    .sort((left, right) => left.interface.localeCompare(right.interface));
  if (canonicalJson(provenance.sources) !== canonicalJson(expectedSources)) {
    throw new Error('lineage-lock remote-ledger provenance routes do not match the two pinned read-only sources.');
  }
  assertExactKeys(
    provenance.cross_source,
    ['canonical_rows_identical', 'canonical_rows_sha256'],
    'lineage-lock remote_ledger_provenance.cross_source',
  );
  if (
    provenance.cross_source.canonical_rows_identical !== true
    || provenance.cross_source.canonical_rows_sha256 !== lock.remote_ledger.canonical_rows_sha256
  ) {
    throw new Error('lineage-lock remote-ledger provenance does not attest identical canonical rows.');
  }
  if (provenance.production_mutation_performed !== false) {
    throw new Error('lineage-lock remote-ledger provenance must deny production mutation.');
  }
}

function validateBaselineTransform(lock, recoveryConfig) {
  assertExactKeys(lock.baseline_transform, ['filename', 'rules', 'sha256'], 'lineage-lock baseline_transform');
  if (lock.baseline_transform.filename !== recoveryConfig.baseline.filename) {
    throw new Error('lineage-lock baseline filename does not match the pinned recovery config.');
  }
  assertSha(lock.baseline_transform.sha256, 'lineage-lock baseline_transform.sha256');
  if (!Array.isArray(lock.baseline_transform.rules) || lock.baseline_transform.rules.length !== EXACT_BASELINE_RULES.length) {
    throw new Error('lineage-lock baseline transform must contain the exact reviewed rule set.');
  }
  for (const [index, rule] of lock.baseline_transform.rules.entries()) {
    assertExactKeys(rule, ['id', 'replacements'], `lineage-lock baseline transform rule ${index}`);
    if (rule.id !== EXACT_BASELINE_RULES[index] || !Number.isInteger(rule.replacements) || rule.replacements < 0) {
      throw new Error(`lineage-lock baseline transform rule ${index} is invalid.`);
    }
  }
  if (
    lock.baseline_transform.rules[2].replacements !== 1
    || lock.baseline_transform.rules[3].replacements !== 1
  ) {
    throw new Error('lineage-lock baseline transform must replace one public-schema create and prepend one safety header.');
  }
}

function validateLineageInventory(lock, recoveryConfig) {
  assertExactKeys(lock.lineage, ['collisions', 'counts', 'local_files'], 'lineage-lock lineage');
  assertExactKeys(
    lock.lineage.counts,
    ['collision_groups', 'forward_included', 'legacy_excluded', 'local_files', 'local_unique_versions', 'remote_rows'],
    'lineage-lock lineage.counts',
  );
  const counts = lock.lineage.counts;
  for (const [key, value] of Object.entries(counts)) {
    if (!Number.isInteger(value) || value < 0) throw new Error(`lineage-lock count ${key} must be non-negative.`);
  }
  if (!Array.isArray(lock.lineage.local_files) || lock.lineage.local_files.length !== counts.local_files) {
    throw new Error('lineage-lock local file count is inconsistent.');
  }
  if (counts.remote_rows !== lock.remote_ledger.rows.length) {
    throw new Error('lineage-lock remote row counts are inconsistent.');
  }
  const allowedClassifications = new Set([
    'forward_hardening_included',
    'legacy_collision_excluded_snapshot_is_authoritative',
    'legacy_local_only_excluded_from_recovered_chain',
    'legacy_version_match_excluded_snapshot_is_authoritative',
  ]);
  const filenames = new Set();
  const versions = new Set();
  let included = 0;
  for (const [index, file] of lock.lineage.local_files.entries()) {
    assertExactKeys(
      file,
      ['bytes', 'classification', 'filename', 'included_in_candidate', 'sha256', 'version'],
      `lineage-lock local file ${index}`,
    );
    const match = typeof file.filename === 'string' ? file.filename.match(/^(\d{8,14})[_-][A-Za-z0-9_.-]+\.sql$/) : null;
    if (!match || file.version !== match[1] || filenames.has(file.filename)) {
      throw new Error(`lineage-lock local file ${index} has an invalid or duplicate filename/version.`);
    }
    assertSha(file.sha256, `lineage-lock local file ${index} sha256`);
    if (!Number.isInteger(file.bytes) || file.bytes < 1) {
      throw new Error(`lineage-lock local file ${index} bytes must be positive.`);
    }
    if (!allowedClassifications.has(file.classification) || typeof file.included_in_candidate !== 'boolean') {
      throw new Error(`lineage-lock local file ${index} has an invalid classification.`);
    }
    if (file.included_in_candidate !== (file.classification === 'forward_hardening_included')) {
      throw new Error(`lineage-lock local file ${index} inclusion disagrees with its classification.`);
    }
    filenames.add(file.filename);
    versions.add(file.version);
    if (file.included_in_candidate) included += 1;
  }
  if (
    versions.size !== counts.local_unique_versions
    || included !== counts.forward_included
    || counts.local_files - included !== counts.legacy_excluded
    || included !== recoveryConfig.forward_migrations.length
  ) {
    throw new Error('lineage-lock local lineage counts are inconsistent.');
  }
  assertPlainObject(lock.lineage.collisions, 'lineage-lock collisions');
  if (Object.keys(lock.lineage.collisions).length !== counts.collision_groups) {
    throw new Error('lineage-lock collision count is inconsistent.');
  }
  for (const [version, names] of Object.entries(lock.lineage.collisions)) {
    if (!/^\d{8,14}$/.test(version) || !Array.isArray(names) || names.length < 2) {
      throw new Error(`lineage-lock collision ${version} is invalid.`);
    }
    const exact = lock.lineage.local_files
      .filter((file) => file.version === version)
      .map((file) => file.filename)
      .sort();
    if (canonicalJson(names) !== canonicalJson(exact)) {
      throw new Error(`lineage-lock collision ${version} does not enumerate its exact local files.`);
    }
  }
  return new Map(lock.lineage.local_files.map((file) => [file.filename, file]));
}

function validateCandidateChain(lock, recoveryConfig, localFiles) {
  assertExactKeys(lock.candidate_chain, ['migration_count', 'migration_files'], 'lineage-lock candidate_chain');
  if (!Array.isArray(lock.candidate_chain.migration_files)) {
    throw new Error('lineage-lock candidate_chain.migration_files must be an array.');
  }
  const expectedCount = 1 + recoveryConfig.forward_migrations.length;
  if (
    lock.candidate_chain.migration_count !== expectedCount
    || lock.candidate_chain.migration_files.length !== expectedCount
  ) {
    throw new Error('lineage-lock candidate migration count does not match the pinned recovery config.');
  }
  const expected = [
    {
      filename: recoveryConfig.baseline.filename,
      sha256: lock.baseline_transform.sha256,
      source: 'transformed_pinned_snapshot',
    },
    ...recoveryConfig.forward_migrations.map((migration) => ({
      filename: migration.filename,
      sha256: migration.sha256,
      source: 'pinned_forward_hardening',
    })),
  ];
  const versions = new Set();
  let previous = '';
  for (const [index, file] of lock.candidate_chain.migration_files.entries()) {
    assertExactKeys(file, ['filename', 'sha256', 'source'], `lineage-lock candidate migration ${index}`);
    const match = typeof file.filename === 'string' ? file.filename.match(MIGRATION_FILENAME) : null;
    if (!match || versions.has(match[1]) || (previous && file.filename <= previous)) {
      throw new Error(`lineage-lock candidate migration ${index} has an unsafe, duplicate, or unordered path.`);
    }
    assertSha(file.sha256, `lineage-lock candidate migration ${index} sha256`);
    if (canonicalJson(file) !== canonicalJson(expected[index])) {
      throw new Error(`lineage-lock candidate migration ${index} does not match the pinned chain.`);
    }
    if (index > 0) {
      const local = localFiles.get(file.filename);
      if (!local || !local.included_in_candidate || local.sha256 !== file.sha256) {
        throw new Error(`lineage-lock candidate migration ${file.filename} is not bound to the included local lineage.`);
      }
    }
    versions.add(match[1]);
    previous = file.filename;
  }
  return expected;
}

function validateLineageLock(lock, expectedContentSha256, recoveryConfig) {
  assertExactKeys(
    lock,
    [
      'baseline_transform',
      'candidate_chain',
      'certification_required_next',
      'content_sha256',
      'format_version',
      'lineage',
      'remote_ledger',
      'remote_ledger_provenance',
      'safety',
      'source_snapshot',
      'status',
    ],
    'lineage-lock',
  );
  if (lock.format_version !== 1 || lock.status !== 'offline_recovery_candidate_unexecuted') {
    throw new Error('lineage-lock is not an unexecuted format-version-1 recovery candidate.');
  }
  assertSha(lock.content_sha256, 'lineage-lock content_sha256');
  const { content_sha256: ignored, ...payload } = lock;
  const recomputed = sha256(canonicalJson(payload));
  if (recomputed !== lock.content_sha256) throw new Error('lineage-lock self-digest does not match its canonical payload.');
  if (expectedContentSha256 !== null && lock.content_sha256 !== expectedContentSha256) {
    throw new Error('lineage-lock does not match the independently supplied expected content SHA-256.');
  }
  validatePinnedSource(lock, recoveryConfig);
  validateRemoteLineage(lock, recoveryConfig);
  validateRemoteLedgerProvenance(lock, recoveryConfig);
  validateBaselineTransform(lock, recoveryConfig);
  const localFiles = validateLineageInventory(lock, recoveryConfig);
  const migrationFiles = validateCandidateChain(lock, recoveryConfig, localFiles);
  if (canonicalJson(lock.certification_required_next) !== canonicalJson(EXACT_CERTIFICATION_NEXT)) {
    throw new Error('lineage-lock certification_required_next does not contain the exact required gate sequence.');
  }
  assertExactKeys(
    lock.safety,
    ['candidate_is_not_a_launch_certificate', 'database_execution_performed', 'production_write_authorized', 'remote_access_performed'],
    'lineage-lock safety',
  );
  if (
    lock.safety.candidate_is_not_a_launch_certificate !== true
    || lock.safety.database_execution_performed !== false
    || lock.safety.production_write_authorized !== false
    || lock.safety.remote_access_performed !== false
  ) {
    throw new Error('lineage-lock safety state must remain unexecuted, local-only, and non-authorizing.');
  }
  return migrationFiles;
}

export function verifyRecoveryCandidate({
  candidateDir,
  expectedLineageContentSha256 = null,
  expectedLineageFileSha256,
  recoveryConfig,
}) {
  assertSha(expectedLineageFileSha256, 'Expected lineage file SHA-256');
  if (expectedLineageContentSha256 !== null) {
    assertSha(expectedLineageContentSha256, 'Expected lineage content SHA-256');
  }
  const root = resolveExplicitLocalDirectory(candidateDir);
  const rootEntries = readdirSync(root).sort();
  if (canonicalJson(rootEntries) !== canonicalJson(ROOT_ENTRIES)) {
    throw new Error(`Recovery candidate root entries must be exactly ${ROOT_ENTRIES.join(', ')}.`);
  }
  const lockPath = join(root, 'lineage-lock.json');
  const readmePath = join(root, 'README.md');
  const migrationsPath = join(root, 'migrations');
  assertRegularFileNoLink(lockPath, 'lineage-lock.json');
  assertRegularFileNoLink(readmePath, 'README.md');
  assertDirectoryNoLink(migrationsPath, 'migrations');
  if (!samePath(realpathSync.native(migrationsPath), migrationsPath)) {
    throw new Error('Recovery candidate migrations directory must not traverse filesystem links.');
  }

  const lockBytes = readFileSync(lockPath);
  const lockFileSha256 = sha256(lockBytes);
  if (lockFileSha256 !== expectedLineageFileSha256) {
    throw new Error('lineage-lock.json does not match the independently supplied expected file SHA-256.');
  }
  let lock;
  try {
    lock = JSON.parse(lockBytes.toString('utf8'));
  } catch (error) {
    throw new Error(`lineage-lock.json is invalid JSON: ${error.message}`);
  }
  const migrationManifest = validateLineageLock(lock, expectedLineageContentSha256, recoveryConfig);
  if (lockBytes.toString('utf8') !== prettyCanonicalJson(lock)) {
    throw new Error('lineage-lock.json must be the exact canonical UTF-8 document emitted by the recovery compiler.');
  }
  const readmeBytes = readFileSync(readmePath);
  if (readmeBytes.toString('utf8') !== expectedRecoveryCandidateReadme(lock.content_sha256)) {
    throw new Error('Recovery candidate README does not match the lineage lock and safety warning.');
  }

  const actualMigrationNames = readdirSync(migrationsPath).sort();
  const expectedMigrationNames = migrationManifest.map((file) => file.filename).sort();
  if (canonicalJson(actualMigrationNames) !== canonicalJson(expectedMigrationNames)) {
    throw new Error('Recovery candidate migration paths/count do not exactly match the lineage lock.');
  }
  const migrations = migrationManifest.map((expected) => {
    const path = join(migrationsPath, expected.filename);
    if (!isWithin(migrationsPath, path)) throw new Error(`Migration path escapes candidate root: ${expected.filename}.`);
    const info = assertRegularFileNoLink(path, `Migration ${expected.filename}`);
    const contents = readFileSync(path);
    const digest = sha256(contents);
    if (digest !== expected.sha256) {
      throw new Error(`Recovery candidate migration hash mismatch: ${expected.filename}.`);
    }
    return {
      ...expected,
      bytes: info.size,
      contents,
    };
  });
  const publicMigrations = migrations.map(({ contents: ignored, ...migration }) => migration);
  const fingerprint = sha256(canonicalJson({
    lineage_content_sha256: lock.content_sha256,
    lineage_lock_file_sha256: sha256(lockBytes),
    readme_sha256: sha256(readmeBytes),
    migrations: publicMigrations,
  }));
  return {
    root,
    lock,
    lockBytes,
    lockFileSha256,
    readmeSha256: sha256(readmeBytes),
    migrations,
    fingerprint,
  };
}

function maskSqlCommentsAndBodies(sql) {
  const output = [...sql];
  const mask = (start, end) => {
    for (let index = start; index < end; index += 1) {
      if (output[index] !== '\n' && output[index] !== '\r') output[index] = ' ';
    }
  };
  let index = 0;
  while (index < sql.length) {
    if (sql.startsWith('--', index)) {
      const end = sql.indexOf('\n', index + 2);
      const stop = end === -1 ? sql.length : end;
      mask(index, stop);
      index = stop;
      continue;
    }
    if (sql.startsWith('/*', index)) {
      let depth = 1;
      let cursor = index + 2;
      while (cursor < sql.length && depth > 0) {
        if (sql.startsWith('/*', cursor)) {
          depth += 1;
          cursor += 2;
        } else if (sql.startsWith('*/', cursor)) {
          depth -= 1;
          cursor += 2;
        } else {
          cursor += 1;
        }
      }
      if (depth !== 0) throw new Error('SQL contract contains an unterminated block comment.');
      mask(index, cursor);
      index = cursor;
      continue;
    }
    if (sql[index] === "'" || sql[index] === '"') {
      const quote = sql[index];
      let cursor = index + 1;
      while (cursor < sql.length) {
        if (sql[cursor] === quote && sql[cursor + 1] === quote) {
          cursor += 2;
        } else if (sql[cursor] === quote) {
          cursor += 1;
          break;
        } else {
          cursor += 1;
        }
      }
      if (cursor > sql.length || sql[cursor - 1] !== quote) {
        throw new Error('SQL contract contains an unterminated quoted value.');
      }
      mask(index, cursor);
      index = cursor;
      continue;
    }
    if (sql[index] === '$') {
      const tag = sql.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)?.[0];
      if (tag) {
        const end = sql.indexOf(tag, index + tag.length);
        if (end === -1) throw new Error('SQL contract contains an unterminated dollar-quoted body.');
        const stop = end + tag.length;
        mask(index, stop);
        index = stop;
        continue;
      }
    }
    index += 1;
  }
  return output.join('');
}

export function assertRollbackOnlySqlContract(contents, filename = 'SQL contract') {
  const sql = Buffer.isBuffer(contents) ? contents.toString('utf8') : String(contents);
  const masked = maskSqlCommentsAndBodies(sql.replaceAll('\r\n', '\n').replace(/^\uFEFF/, '')).trim();
  if (!/^BEGIN(?:\s+(?:WORK|TRANSACTION))?\s*;/i.test(masked)) {
    throw new Error(`${filename} must begin with an explicit rollback-only transaction.`);
  }
  if (!/ROLLBACK(?:\s+(?:WORK|TRANSACTION))?\s*;\s*$/i.test(masked)) {
    throw new Error(`${filename} must end with an explicit ROLLBACK.`);
  }
  if (/\bCOMMIT\b/i.test(masked)) {
    throw new Error(`${filename} may not contain a top-level COMMIT.`);
  }
  const beginCount = [...masked.matchAll(/\bBEGIN(?:\s+(?:WORK|TRANSACTION))?\s*;/gi)].length;
  const rollbackCount = [...masked.matchAll(/\bROLLBACK(?:\s+(?:WORK|TRANSACTION))?\s*;/gi)].length;
  if (beginCount !== 1 || rollbackCount !== 1) {
    throw new Error(`${filename} must contain exactly one top-level BEGIN and one final ROLLBACK.`);
  }
  if (masked.includes('\\')) {
    throw new Error(`${filename} may not contain psql meta-commands.`);
  }
}

export function readCurrentSqlContracts(repoRoot) {
  const directory = resolve(repoRoot, 'supabase/tests');
  assertDirectoryNoLink(directory, 'supabase/tests');
  const entries = readdirSync(directory).sort();
  const unexpected = entries.filter((name) => !/^[a-z0-9_-]+\.sql$/.test(name));
  if (unexpected.length > 0) {
    throw new Error(`supabase/tests contains non-contract entries: ${unexpected.join(', ')}.`);
  }
  if (entries.length === 0) throw new Error('At least one current supabase/tests SQL contract is required.');
  return entries.map((filename) => {
    const path = join(directory, filename);
    const info = assertRegularFileNoLink(path, `SQL contract ${filename}`);
    const contents = readFileSync(path);
    assertRollbackOnlySqlContract(contents, `SQL contract ${filename}`);
    return { filename, bytes: info.size, sha256: sha256(contents), contents };
  });
}

export function verifyCurrentRepositoryMigrationInventory({ repoRoot, candidate }) {
  const directory = resolve(repoRoot, 'supabase/migrations');
  assertDirectoryNoLink(directory, 'supabase/migrations');
  const actualNames = readdirSync(directory)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const locked = candidate.lock.lineage.local_files;
  const expectedNames = locked.map((file) => file.filename).sort();
  if (canonicalJson(actualNames) !== canonicalJson(expectedNames)) {
    const actual = new Set(actualNames);
    const expected = new Set(expectedNames);
    const added = actualNames.filter((name) => !expected.has(name));
    const missing = expectedNames.filter((name) => !actual.has(name));
    throw new Error(
      'Current repository migration inventory differs from the emitted candidate lineage lock. '
      + `Added: ${added.join(', ') || 'none'}. Missing: ${missing.join(', ') || 'none'}. `
      + 'Rerun the offline recovery compiler and review a new external lock-file digest before certification.',
    );
  }
  const lockedByName = new Map(locked.map((file) => [file.filename, file]));
  const current = actualNames.map((filename) => {
    const path = join(directory, filename);
    const info = assertRegularFileNoLink(path, `Repository migration ${filename}`);
    const digest = sha256(readFileSync(path));
    const expected = lockedByName.get(filename);
    if (digest !== expected.sha256 || info.size !== expected.bytes) {
      throw new Error(
        `Current repository migration differs from the emitted lineage lock: ${filename}. `
        + 'Rerun the offline recovery compiler and review a new external lock-file digest before certification.',
      );
    }
    return { filename, bytes: info.size, sha256: digest };
  });
  return {
    count: current.length,
    files: current,
    fingerprint_sha256: sha256(canonicalJson(current)),
  };
}

export function assertOsTemporaryRoot(path) {
  const absolute = resolve(path);
  assertDirectoryNoLink(absolute, 'Recovered certification temporary root');
  const osTemporary = realpathSync.native(tmpdir());
  const actual = realpathSync.native(absolute);
  if (!isWithin(osTemporary, actual) || samePath(osTemporary, actual)) {
    throw new Error('Recovered certification projects may be created only in a new descendant of the OS temporary directory.');
  }
  return actual;
}

export async function withRecoveredTemporaryRoot(callback) {
  if (typeof callback !== 'function') throw new Error('Recovered temporary-root callback is required.');
  const root = mkdtempSync(join(tmpdir(), 'dial-smart-recovered-cert-'));
  try {
    return await callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function postgresMajorFromConfig(config) {
  const major = Number(config.match(/^major_version\s*=\s*(\d+)$/m)?.[1]);
  if (!Number.isInteger(major)) throw new Error('Supabase config is missing db.major_version.');
  return major;
}

export function createRecoveredSupabaseProject({
  sourceConfig,
  temporaryRoot,
  databasePort,
  candidate,
  contracts,
  postgresMajorVersion,
}) {
  const safeTemporaryRoot = assertOsTemporaryRoot(temporaryRoot);
  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('Recovered certification database port must be an unprivileged local TCP port.');
  }
  if (typeof sourceConfig !== 'string' || sourceConfig.length === 0) {
    throw new Error('Buffered Supabase config.toml contents are required.');
  }
  if (postgresMajorFromConfig(sourceConfig) !== postgresMajorVersion) {
    throw new Error('Pinned Postgres major does not match supabase/config.toml.');
  }
  const projectId = `dial-smart-recovered-cert-${randomUUID().slice(0, 12)}`;
  const supabaseRoot = join(safeTemporaryRoot, 'supabase');
  const migrationsRoot = join(supabaseRoot, 'migrations');
  const testsRoot = join(supabaseRoot, 'tests');
  mkdirSync(migrationsRoot, { recursive: true });
  mkdirSync(testsRoot, { recursive: true });
  const isolatedConfig = isolateSupabaseConfig(sourceConfig, { projectId, databasePort });
  const configPath = join(supabaseRoot, 'config.toml');
  writeFileSync(configPath, isolatedConfig, { flag: 'wx' });
  const baseline = candidate.migrations[0];
  if (baseline.source !== 'transformed_pinned_snapshot') {
    throw new Error('Verified candidate does not begin with the transformed source baseline.');
  }
  writeFileSync(join(migrationsRoot, baseline.filename), baseline.contents, { flag: 'wx' });
  for (const contract of contracts) {
    writeFileSync(join(testsRoot, contract.filename), contract.contents, { flag: 'wx' });
  }
  return {
    projectId,
    workdir: safeTemporaryRoot,
    configPath,
    configSha256: sha256(Buffer.from(isolatedConfig, 'utf8')),
    migrationsRoot,
    testsRoot,
  };
}

export function installVerifiedForwardMigrations(project, candidate) {
  assertOsTemporaryRoot(project.workdir);
  for (const migration of candidate.migrations.slice(1)) {
    const target = join(project.migrationsRoot, migration.filename);
    if (!isWithin(project.migrationsRoot, target) || existsSync(target)) {
      throw new Error(`Refusing unsafe or duplicate forward migration target: ${migration.filename}.`);
    }
    writeFileSync(target, migration.contents, { flag: 'wx' });
    if (sha256(readFileSync(target)) !== migration.sha256) {
      throw new Error(`Temporary forward migration copy failed hash verification: ${migration.filename}.`);
    }
  }
  const actual = readdirSync(project.migrationsRoot).sort();
  const expected = candidate.migrations.map((migration) => migration.filename).sort();
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error('Temporary migration chain does not exactly match the verified candidate.');
  }
}

function verifyExactTemporaryFiles(directory, expectedFiles, label) {
  assertDirectoryNoLink(directory, label);
  if (!samePath(realpathSync.native(directory), directory)) {
    throw new Error(`${label} must not traverse filesystem links.`);
  }
  const actualNames = readdirSync(directory).sort();
  const expectedNames = expectedFiles.map((file) => file.filename).sort();
  if (canonicalJson(actualNames) !== canonicalJson(expectedNames)) {
    throw new Error(`${label} entries do not exactly match the verified evidence set.`);
  }
  const expectedByName = new Map(expectedFiles.map((file) => [file.filename, file]));
  return actualNames.map((filename) => {
    const path = join(directory, filename);
    if (!isWithin(directory, path)) throw new Error(`${label} path escapes its directory: ${filename}.`);
    const info = assertRegularFileNoLink(path, `${label} ${filename}`);
    const digest = sha256(readFileSync(path));
    const expected = expectedByName.get(filename);
    if (info.size !== expected.bytes || digest !== expected.sha256) {
      throw new Error(`${label} hash/byte mismatch: ${filename}.`);
    }
    return { filename, bytes: info.size, sha256: digest };
  });
}

export function verifyTemporaryEvidenceTree({
  project,
  candidate,
  contracts,
  includeForwardMigrations,
  phase,
}) {
  assertOsTemporaryRoot(project.workdir);
  const configInfo = assertRegularFileNoLink(project.configPath, 'Temporary Supabase config.toml');
  if (!samePath(realpathSync.native(project.configPath), project.configPath)) {
    throw new Error('Temporary Supabase config.toml must not traverse filesystem links.');
  }
  const configSha256 = sha256(readFileSync(project.configPath));
  if (configSha256 !== project.configSha256) {
    throw new Error('Temporary Supabase config.toml changed after isolated project creation.');
  }
  const migrations = verifyExactTemporaryFiles(
    project.migrationsRoot,
    includeForwardMigrations ? candidate.migrations : candidate.migrations.slice(0, 1),
    'Temporary migration tree',
  );
  const sqlContracts = verifyExactTemporaryFiles(project.testsRoot, contracts, 'Temporary SQL-contract tree');
  const payload = {
    config: { bytes: configInfo.size, sha256: configSha256 },
    migrations,
    sql_contracts: sqlContracts,
  };
  return {
    phase,
    ...payload,
    fingerprint_sha256: sha256(canonicalJson(payload)),
  };
}

export function expectedMigrationLedgerRows(migrationFiles) {
  return migrationFiles.map((migration) => {
    const match = migration.filename.match(MIGRATION_FILENAME);
    if (!match) throw new Error(`Cannot derive ledger row from migration filename: ${migration.filename}.`);
    return { version: match[1], name: match[2] };
  });
}

export function exactMigrationLedgerAssertion(migrationFiles) {
  const rows = expectedMigrationLedgerRows(migrationFiles);
  const expectedJson = JSON.stringify(rows).replaceAll("'", "''");
  return `DO $recovered_certification$\nDECLARE\n  actual jsonb;\n  expected constant jsonb := '${expectedJson}'::jsonb;\nBEGIN\n  SELECT COALESCE(\n    jsonb_agg(\n      jsonb_build_object('version', version::text, 'name', name::text)\n      ORDER BY version::text\n    ),\n    '[]'::jsonb\n  ) INTO actual\n  FROM supabase_migrations.schema_migrations;\n\n  IF actual IS DISTINCT FROM expected THEN\n    RAISE EXCEPTION 'exact recovered migration ledger mismatch: expected %, got %', expected, actual;\n  END IF;\nEND\n$recovered_certification$;`;
}

export function postgresMajorAssertion(postgresMajorVersion) {
  if (!Number.isInteger(postgresMajorVersion) || postgresMajorVersion < 10) {
    throw new Error('Pinned Postgres major version must be an integer of at least 10.');
  }
  return `DO $recovered_certification$\nBEGIN\n  IF current_setting('server_version_num')::integer / 10000 <> ${postgresMajorVersion} THEN\n    RAISE EXCEPTION 'Postgres major mismatch: expected ${postgresMajorVersion}, got %', current_setting('server_version');\n  END IF;\nEND\n$recovered_certification$;`;
}

export function buildRecoveredLocalQueryCommand({ workdir, sql = null, file = null }) {
  if ((sql === null) === (file === null)) throw new Error('Exactly one of sql or file is required.');
  const args = ['--workdir', workdir, 'db', 'query', '--local'];
  if (sql !== null) args.push(sql);
  else args.push('--file', file);
  assertLocalOnlySupabaseArgs(args);
  return args;
}

export function buildRecoveredCertificationCommands({ workdir, schema, dumpPath }) {
  const global = ['--workdir', workdir];
  const commands = {
    start: [...global, 'db', 'start'],
    reset: [...global, 'db', 'reset', '--local', '--no-seed'],
    lint: [...global, 'db', 'lint', '--local', '--schema', schema, '--level', 'error', '--fail-on', 'error'],
    types: [...global, 'gen', 'types', '--local', '--schema', schema],
    dump: [...global, 'db', 'dump', '--local', '--schema', schema, '--file', dumpPath],
    stop: [...global, 'stop', '--no-backup'],
  };
  for (const args of Object.values(commands)) assertLocalOnlySupabaseArgs(args);
  return commands;
}

export function normalizeRecoveredPublicSchema(value) {
  return normalizeSchemaDump(value)
    .split('\n')
    .filter((line) => !/^-- DIAL SMART OFFLINE DATABASE RECOVERY BASELINE CANDIDATE$/.test(line))
    .filter((line) => !/^-- Source schema SHA-256: [a-f0-9]{64}$/.test(line))
    .filter((line) => !/^-- This file is for a new disposable\/staging lineage only\.$/.test(line))
    .filter((line) => !/^-- Never apply this baseline to the existing production database\.$/.test(line))
    .filter((line) => !/^--(?: Dumped from database version| Dumped by pg_dump version| PostgreSQL database dump| PostgreSQL database dump complete)/.test(line))
    .filter((line) => !/^--\s*$/.test(line))
    .filter((line) => !/^SET (?:statement_timeout|lock_timeout|idle_in_transaction_session_timeout|transaction_timeout|client_encoding|standard_conforming_strings|check_function_bodies|xmloption|client_min_messages|row_security) =/.test(line))
    .filter((line) => !/^SELECT pg_catalog\.set_config\('search_path', '', false\);$/.test(line))
    .map((line) => line.replace(
      /^CREATE SCHEMA IF NOT EXISTS "public";$/,
      'CREATE SCHEMA "public";',
    ).trimEnd())
    .filter((line, index, lines) => line !== '' || (index > 0 && lines[index - 1] !== ''))
    .join('\n')
    .trim();
}

export function assertBaselineRestoreMatchesLockedSource(baselineSql, restoredDump) {
  const expected = normalizeRecoveredPublicSchema(baselineSql);
  const actual = normalizeRecoveredPublicSchema(restoredDump);
  if (expected !== actual) {
    throw new Error('Baseline-only restore does not match the normalized locked source-schema baseline.');
  }
  return sha256(expected);
}

export function assertRecoveredFinalSchemasMatch(firstDump, secondDump) {
  const first = normalizeRecoveredPublicSchema(firstDump);
  const second = normalizeRecoveredPublicSchema(secondDump);
  if (first !== second) {
    throw new Error('Two recovered candidate replays produced different normalized public schemas.');
  }
  return sha256(first);
}

export function assertContractsDidNotMutateSchema(beforeContractsDump, afterContractsDump) {
  const before = normalizeRecoveredPublicSchema(beforeContractsDump);
  const after = normalizeRecoveredPublicSchema(afterContractsDump);
  if (before !== after) {
    throw new Error('Rollback-only SQL contracts changed the recovered public schema.');
  }
  return sha256(before);
}

function publicFileEvidence(files) {
  return files.map(({ filename, sha256: digest, bytes }) => ({ filename, sha256: digest, bytes }));
}

export function buildRecoveredDatabaseCertificate({
  candidate,
  databaseCertificationConfig,
  recoveryConfig,
  repositoryConfigurationEvidence,
  dockerEvidence,
  temporaryTreeChecks,
  contracts,
  committedTypes,
  baselineDump,
  firstBeforeContractsDump,
  firstDump,
  secondBeforeContractsDump,
  secondDump,
  firstGeneratedTypes,
  secondGeneratedTypes,
}) {
  assertGeneratedTypesMatch(firstGeneratedTypes, committedTypes);
  assertGeneratedTypesMatch(secondGeneratedTypes, committedTypes);
  assertGeneratedTypesMatch(firstGeneratedTypes, secondGeneratedTypes);
  const baselineFingerprint = assertBaselineRestoreMatchesLockedSource(
    candidate.migrations[0].contents.toString('utf8'),
    baselineDump,
  );
  const firstPreContractFingerprint = assertContractsDidNotMutateSchema(firstBeforeContractsDump, firstDump);
  const secondPreContractFingerprint = assertContractsDidNotMutateSchema(secondBeforeContractsDump, secondDump);
  const finalFingerprint = assertRecoveredFinalSchemasMatch(firstDump, secondDump);
  if (firstPreContractFingerprint !== secondPreContractFingerprint || firstPreContractFingerprint !== finalFingerprint) {
    throw new Error('Pre-contract and post-contract recovered schema fingerprints are inconsistent.');
  }
  const normalizedTypes = normalizeGeneratedTypes(firstGeneratedTypes);
  const ledgerRows = expectedMigrationLedgerRows(candidate.migrations);
  const payload = {
    format_version: 1,
    certificate_type: RECOVERED_CERTIFICATE_TYPE,
    status: 'certified_disposable_recovery_lineage',
    authorization_scope: RECOVERED_CERTIFICATE_SCOPE,
    candidate: {
      fingerprint_sha256: candidate.fingerprint,
      lineage_content_sha256: candidate.lock.content_sha256,
      lineage_lock_file_sha256: candidate.lockFileSha256,
      source_snapshot_sha256: candidate.lock.source_snapshot.sha256,
      remote_ledger_raw_sha256: candidate.lock.remote_ledger.raw_sha256,
      remote_ledger_canonical_rows_sha256: candidate.lock.remote_ledger.canonical_rows_sha256,
      remote_ledger_provenance: {
        filename: candidate.lock.remote_ledger_provenance.filename,
        raw_sha256: candidate.lock.remote_ledger_provenance.raw_sha256,
        evidence_class: candidate.lock.remote_ledger_provenance.evidence_class,
        source_count: candidate.lock.remote_ledger_provenance.sources.length,
        canonical_rows_identical: candidate.lock.remote_ledger_provenance.cross_source.canonical_rows_identical,
        production_mutation_performed: candidate.lock.remote_ledger_provenance.production_mutation_performed,
      },
      migration_count: candidate.migrations.length,
      migration_files: publicFileEvidence(candidate.migrations),
      repository_migration_inventory: {
        count: candidate.lock.lineage.local_files.length,
        fingerprint_sha256: sha256(canonicalJson(
          candidate.lock.lineage.local_files.map(({ filename, bytes, sha256: digest }) => ({
            filename,
            bytes,
            sha256: digest,
          })).sort((left, right) => left.filename.localeCompare(right.filename)),
        )),
        matched_emission_lineage_before_and_after_replay: true,
      },
    },
    repository_configuration: repositoryConfigurationEvidence,
    container_runtime: {
      docker_server_version: dockerEvidence.version,
      active_context: dockerEvidence.context,
      endpoint: dockerEvidence.endpoint,
      endpoint_transport: dockerEvidence.transport,
      endpoint_verified_local: true,
    },
    temporary_execution_copy: {
      verification_count: temporaryTreeChecks.length,
      checks: temporaryTreeChecks.map((check) => ({
        phase: check.phase,
        fingerprint_sha256: check.fingerprint_sha256,
      })),
      exact_hashes_and_nonlinks_verified_before_and_after_each_replay: true,
    },
    pinned_runtime: {
      supabase_cli_version: databaseCertificationConfig.supabaseCliVersion,
      postgres_major_version: databaseCertificationConfig.postgresMajorVersion,
      schema: databaseCertificationConfig.schema,
    },
    source_restore: {
      baseline_only_replayed_from_zero: true,
      normalized_schema_sha256: baselineFingerprint,
      matches_hash_locked_source_baseline: true,
      source_snapshot_sha256: recoveryConfig.source_snapshot.sha256,
    },
    full_chain_replays: {
      clean_replay_count: 2,
      exact_migration_ledger_rows_sha256: sha256(canonicalJson(ledgerRows)),
      exact_migration_ledger_verified_each_replay: true,
      database_lint_zero_errors_each_replay: true,
      sql_contracts_passed_each_replay: true,
      rollback_only_contract_framing_verified: true,
      schema_unchanged_by_contracts_each_replay: true,
      normalized_final_schema_sha256: finalFingerprint,
      final_schemas_deterministic: true,
    },
    sql_contracts: {
      count: contracts.length,
      files: publicFileEvidence(contracts),
    },
    generated_public_types: {
      committed_path: databaseCertificationConfig.committedTypesPath,
      committed_sha256: sha256(normalizeGeneratedTypes(committedTypes)),
      generated_sha256: sha256(normalizedTypes),
      matched_committed_each_replay: true,
      deterministic_between_replays: true,
    },
    safety: {
      candidate_source_mutated: false,
      candidate_emission_was_not_certification: true,
      candidate_cloned_only_to_os_temp: true,
      database_execution_performed: true,
      database_execution_scope: 'disposable_local_only',
      external_package_or_container_image_network_access: 'not_attested',
      external_lineage_trust_root_required: true,
      active_docker_endpoint_verified_local: true,
      docker_override_environment_variables_present: false,
      known_remote_database_credential_environment_variables_present: false,
      launch_authorized: false,
      production_database_target_supplied_to_children: false,
      production_write_authorized: false,
      remote_database_access_performed: false,
      staging_deploy_authorized: false,
      temporary_project_removed: true,
    },
  };
  return {
    ...payload,
    content_sha256: sha256(canonicalJson(payload)),
  };
}

export function assertCertificateOutputPath(path, candidateRoot) {
  if (typeof path !== 'string' || path.trim() !== path || path.length === 0 || path.includes('\0') || URI_OR_UNC.test(path)) {
    throw new Error('Certificate output must be an explicit local filesystem path.');
  }
  const output = resolve(path);
  if (existsSync(output)) throw new Error(`Refusing to overwrite existing certificate output: ${output}.`);
  const parent = dirname(output);
  assertDirectoryNoLink(parent, 'Certificate output parent');
  if (candidateRoot && isWithin(candidateRoot, output)) {
    throw new Error('Certificate output may not mutate the recovery candidate directory.');
  }
  const realParent = realpathSync.native(parent);
  if (!samePath(parent, realParent)) throw new Error('Certificate output parent must not traverse filesystem links.');
  return output;
}

export function writeCertificateExclusive(path, certificate, candidateRoot = null) {
  const output = assertCertificateOutputPath(path, candidateRoot);
  writeFileSync(output, prettyCanonicalJson(certificate), { encoding: 'utf8', flag: 'wx' });
  return output;
}

export function dockerUnavailableMessage(detail = '') {
  const suffix = detail ? ` Docker reported: ${detail}` : '';
  return 'Docker is unavailable, so recovered database execution did not start and no certificate was created. '
    + 'Candidate verification alone is not certification. Start Docker Desktop, wait for the engine to be healthy, and rerun the exact command.'
    + suffix;
}

export function assertDockerInfoResult(result) {
  if (result?.error || result?.status !== 0 || !String(result?.stdout ?? '').trim()) {
    const detail = result?.error?.message || String(result?.stderr ?? '').trim() || `exit ${result?.status ?? 'unknown'}`;
    throw new Error(dockerUnavailableMessage(detail));
  }
  return String(result.stdout).trim();
}
