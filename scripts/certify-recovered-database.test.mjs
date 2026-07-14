import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  canonicalJson,
  prettyCanonicalJson,
  sha256,
} from './lib/database-recovery-candidate.mjs';
import {
  ALL_REMOTE_CREDENTIAL_ENV_KEYS,
  DOCKER_OVERRIDE_ENV_KEYS,
  assertBaselineRestoreMatchesLockedSource,
  assertCertificateOutputPath,
  assertContractsDidNotMutateSchema,
  assertDockerInfoResult,
  assertLocalDockerContextResults,
  assertNoDockerOverrideEnvironment,
  assertNoRemoteCredentialEnvironment,
  assertOsTemporaryRoot,
  assertRecoveredFinalSchemasMatch,
  assertRecoveredRepositoryConfigurationUnchanged,
  assertRollbackOnlySqlContract,
  buildRecoveredCertificationCommands,
  buildRecoveredDatabaseCertificate,
  buildRecoveredLocalQueryCommand,
  captureRecoveredRepositoryConfiguration,
  createRecoveredSupabaseProject,
  exactMigrationLedgerAssertion,
  expectedMigrationLedgerRows,
  expectedRecoveryCandidateReadme,
  installVerifiedForwardMigrations,
  normalizeRecoveredPublicSchema,
  parseRecoveredCertificationArgs,
  postgresMajorAssertion,
  readCurrentSqlContracts,
  recoveredCertificationEnv,
  verifyRecoveryCandidate,
  verifyTemporaryEvidenceTree,
  verifyCurrentRepositoryMigrationInventory,
  withRecoveredTemporaryRoot,
  writeCertificateExclusive,
} from './lib/recovered-database-certification.mjs';

const repoRoot = resolve('.');

function withTemporaryRoot(callback) {
  const root = mkdtempSync(join(tmpdir(), 'recovered-cert-test-'));
  try {
    return callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function fixtureRecoveryConfig({ baselineSha256, forwardSha256, remoteRowsSha256 }) {
  return {
    format_version: 1,
    source_snapshot: {
      filename: 'pinned-public-schema.sql',
      sha256: 'a'.repeat(64),
      bytes: 12345,
      postgres_database_version: '15.8',
      pg_dump_version: '15.18',
      postgres_major_version: 15,
      inventory: { tables: 1, functions: 0, policies: 0 },
    },
    remote_ledger: {
      format_version: 1,
      filename: 'remote-ledger.json',
      expected_rows: 1,
      expected_project_ref: 'abcdefghijklmnopqrst',
      expected_empty_names: 1,
      expected_canonical_rows_sha256: remoteRowsSha256,
      expected_raw_sha256: 'b'.repeat(64),
      expected_captured_at: '2026-07-13T00:00:00.000Z',
    },
    remote_ledger_provenance: {
      format_version: 1,
      filename: 'remote-ledger.provenance.json',
      expected_raw_sha256: 'c'.repeat(64),
      expected_evidence_class: 'read_only_remote_migration_ledger',
      expected_sources: [
        {
          provider: 'supabase',
          interface: 'management_api_read_only_sql',
          method: 'POST',
          endpoint_path: '/v1/projects/{project_ref}/database/query/read-only',
          read_only: true,
          response_sha256: 'd'.repeat(64),
        },
        {
          provider: 'supabase',
          interface: 'management_api_migration_history',
          method: 'GET',
          endpoint_path: '/v1/projects/{project_ref}/database/migrations',
          read_only: true,
          response_sha256: 'e'.repeat(64),
        },
      ],
    },
    baseline: {
      version: '20260712000000',
      filename: '20260712000000_live_public_schema_baseline.sql',
      sha256: baselineSha256,
    },
    forward_migrations: [{
      filename: '20260712010000_forward_safety.sql',
      sha256: forwardSha256,
    }],
  };
}

function createCandidateFixture(root) {
  const candidateDir = join(root, 'candidate');
  const migrationsDir = join(candidateDir, 'migrations');
  mkdirSync(migrationsDir, { recursive: true });
  const baselineSql = [
    '-- DIAL SMART OFFLINE DATABASE RECOVERY BASELINE CANDIDATE',
    `-- Source schema SHA-256: ${'a'.repeat(64)}`,
    '-- This file is for a new disposable/staging lineage only.',
    '-- Never apply this baseline to the existing production database.',
    '',
    '-- PostgreSQL database dump',
    'CREATE SCHEMA IF NOT EXISTS "public";',
    'CREATE TABLE "public"."fixture" ("id" integer NOT NULL);',
    '',
  ].join('\n');
  const forwardSql = 'ALTER TABLE "public"."fixture" ADD COLUMN "safe" boolean DEFAULT false NOT NULL;\n';
  const legacySql = 'SELECT 1;\n';
  const baselineSha256 = sha256(baselineSql);
  const forwardSha256 = sha256(forwardSql);
  const legacySha256 = sha256(legacySql);
  const remoteRows = [{ version: '20250101000000', name: '' }];
  const remoteRowsSha256 = sha256(canonicalJson(remoteRows));
  const recoveryConfig = fixtureRecoveryConfig({ baselineSha256, forwardSha256, remoteRowsSha256 });
  const lockPayload = {
    format_version: 1,
    status: 'offline_recovery_candidate_unexecuted',
    source_snapshot: {
      filename: recoveryConfig.source_snapshot.filename,
      sha256: recoveryConfig.source_snapshot.sha256,
      bytes: recoveryConfig.source_snapshot.bytes,
      database_version: recoveryConfig.source_snapshot.postgres_database_version,
      pg_dump_version: recoveryConfig.source_snapshot.pg_dump_version,
      inventory: { tables: 1, functions: 0, policies: 0, triggers: 0, views: 0 },
    },
    remote_ledger: {
      captured_at: '2026-07-13T00:00:00.000Z',
      source_project_ref_sha256: sha256(recoveryConfig.remote_ledger.expected_project_ref),
      raw_sha256: 'b'.repeat(64),
      canonical_rows_sha256: remoteRowsSha256,
      rows: [{
        version: remoteRows[0].version,
        name: remoteRows[0].name,
        classification: 'remote_version_with_local_match_replaced_by_snapshot_baseline',
      }],
    },
    remote_ledger_provenance: {
      filename: recoveryConfig.remote_ledger_provenance.filename,
      raw_sha256: recoveryConfig.remote_ledger_provenance.expected_raw_sha256,
      evidence_class: recoveryConfig.remote_ledger_provenance.expected_evidence_class,
      sources: [...recoveryConfig.remote_ledger_provenance.expected_sources]
        .sort((left, right) => left.interface.localeCompare(right.interface)),
      cross_source: {
        canonical_rows_identical: true,
        canonical_rows_sha256: remoteRowsSha256,
      },
      production_mutation_performed: false,
    },
    baseline_transform: {
      filename: recoveryConfig.baseline.filename,
      sha256: baselineSha256,
      rules: [
        { id: 'normalize_line_endings', replacements: 0 },
        { id: 'remove_pg_dump_restrict_guards', replacements: 2 },
        { id: 'make_public_schema_create_idempotent', replacements: 1 },
        { id: 'remove_unavailable_supabase_admin_default_privileges', replacements: 0 },
        { id: 'restore_pg_cron_extension_prerequisite', replacements: 1 },
        { id: 'prepend_offline_safety_header', replacements: 1 },
      ],
    },
    lineage: {
      counts: {
        local_files: 2,
        local_unique_versions: 2,
        collision_groups: 0,
        remote_rows: 1,
        forward_included: 1,
        legacy_excluded: 1,
      },
      collisions: {},
      local_files: [
        {
          filename: '20250101000000_legacy.sql',
          version: '20250101000000',
          sha256: legacySha256,
          bytes: Buffer.byteLength(legacySql),
          classification: 'legacy_version_match_excluded_snapshot_is_authoritative',
          included_in_candidate: false,
        },
        {
          filename: recoveryConfig.forward_migrations[0].filename,
          version: '20260712010000',
          sha256: forwardSha256,
          bytes: Buffer.byteLength(forwardSql),
          classification: 'forward_hardening_included',
          included_in_candidate: true,
        },
      ],
    },
    candidate_chain: {
      migration_files: [
        {
          filename: recoveryConfig.baseline.filename,
          sha256: baselineSha256,
          source: 'transformed_pinned_snapshot',
        },
        {
          filename: recoveryConfig.forward_migrations[0].filename,
          sha256: forwardSha256,
          source: 'pinned_forward_hardening',
        },
      ],
      migration_count: 2,
    },
    certification_required_next: [
      'restore_baseline_and_compare_normalized_source_schema',
      'replay_candidate_chain_twice_in_disposable_supabase',
      'run_all_sql_contracts',
      'run_database_lint',
      'match_generated_types',
      'match_two_final_schema_dumps',
    ],
    safety: {
      remote_access_performed: false,
      database_execution_performed: false,
      production_write_authorized: false,
      candidate_is_not_a_launch_certificate: true,
    },
  };
  const lock = {
    ...lockPayload,
    content_sha256: sha256(canonicalJson(lockPayload)),
  };
  const lockText = prettyCanonicalJson(lock);
  writeFileSync(join(candidateDir, 'lineage-lock.json'), lockText, 'utf8');
  writeFileSync(join(candidateDir, 'README.md'), expectedRecoveryCandidateReadme(lock.content_sha256), 'utf8');
  writeFileSync(join(migrationsDir, recoveryConfig.baseline.filename), baselineSql, 'utf8');
  writeFileSync(join(migrationsDir, recoveryConfig.forward_migrations[0].filename), forwardSql, 'utf8');
  return {
    candidateDir,
    recoveryConfig,
    lock,
    lockFileSha256: sha256(lockText),
    baselineSql,
    forwardSql,
    legacySql,
  };
}

function verifyFixture(fixture) {
  return verifyRecoveryCandidate({
    candidateDir: fixture.candidateDir,
    expectedLineageContentSha256: fixture.lock.content_sha256,
    expectedLineageFileSha256: fixture.lockFileSha256,
    recoveryConfig: fixture.recoveryConfig,
  });
}

function rewriteCandidateLock(fixture, mutate) {
  const lockPath = join(fixture.candidateDir, 'lineage-lock.json');
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  mutate(lock);
  const { content_sha256: ignored, ...payload } = lock;
  lock.content_sha256 = sha256(canonicalJson(payload));
  const text = prettyCanonicalJson(lock);
  writeFileSync(lockPath, text, 'utf8');
  writeFileSync(join(fixture.candidateDir, 'README.md'), expectedRecoveryCandidateReadme(lock.content_sha256), 'utf8');
  return { lock, lockFileSha256: sha256(text) };
}

test('CLI requires explicit candidate and an external exact lineage-lock file digest', () => {
  assert.throws(() => parseRecoveredCertificationArgs([]), /candidate-dir is required/);
  assert.throws(
    () => parseRecoveredCertificationArgs(['--candidate-dir', 'candidate']),
    /expected-lineage-file-sha256 is required/,
  );
  const parsed = parseRecoveredCertificationArgs([
    '--candidate-dir=./candidate',
    `--expected-lineage-file-sha256=${'a'.repeat(64)}`,
    `--expected-lineage-content-sha256=${'b'.repeat(64)}`,
    '--certificate-out',
    './certificate.json',
  ]);
  assert.equal(parsed.candidateDir, './candidate');
  assert.equal(parsed.expectedLineageFileSha256, 'a'.repeat(64));
  assert.equal(parsed.expectedLineageContentSha256, 'b'.repeat(64));
});

test('remote targeting flags, unknown switches, positional args, and duplicate options fail closed', () => {
  const trust = 'a'.repeat(64);
  for (const args of [
    ['--candidate-dir', 'x', '--expected-lineage-file-sha256', trust, '--linked'],
    ['--candidate-dir', 'x', '--expected-lineage-file-sha256', trust, '--db-url=postgres://remote/db'],
    ['--candidate-dir', 'x', '--expected-lineage-file-sha256', trust, '--project-id', 'prod'],
    ['--candidate-dir', 'x', '--candidate-dir', 'y', '--expected-lineage-file-sha256', trust],
    ['--candidate-dir', 'x', '--expected-lineage-file-sha256', trust, '--surprise', 'yes'],
    ['candidate', '--expected-lineage-file-sha256', trust],
  ]) {
    assert.throws(() => parseRecoveredCertificationArgs(args));
  }
});

test('all known database and Supabase credentials are rejected, then absent from local children', () => {
  for (const key of ALL_REMOTE_CREDENTIAL_ENV_KEYS) {
    assert.throws(
      () => assertNoRemoteCredentialEnvironment({ PATH: '/bin', [key]: 'set' }),
      new RegExp(key),
    );
  }
  const env = recoveredCertificationEnv({ PATH: '/bin', EMPTY_DATABASE_URL: '' });
  assert.equal(env.PATH, '/bin');
  for (const key of ALL_REMOTE_CREDENTIAL_ENV_KEYS) assert.equal(env[key], undefined);
});

test('Docker overrides and remote contexts fail closed while unix and npipe endpoints are accepted', () => {
  for (const key of DOCKER_OVERRIDE_ENV_KEYS) {
    assert.throws(() => assertNoDockerOverrideEnvironment({ PATH: '/bin', [key]: 'set' }), new RegExp(key));
  }
  const env = recoveredCertificationEnv({ PATH: '/bin' });
  for (const key of DOCKER_OVERRIDE_ENV_KEYS) assert.equal(env[key], undefined);
  const ok = (stdout) => ({ status: 0, stdout: `${stdout}\n`, stderr: '' });
  assert.deepEqual(assertLocalDockerContextResults(ok('default'), ok('unix:///var/run/docker.sock')), {
    context: 'default', endpoint: 'unix:///var/run/docker.sock', transport: 'unix',
  });
  assert.equal(
    assertLocalDockerContextResults(ok('desktop-linux'), ok('npipe:////./pipe/dockerDesktopLinuxEngine')).transport,
    'npipe',
  );
  for (const endpoint of ['tcp://db.example:2376', 'ssh://docker.example', 'https://docker.example']) {
    assert.throws(() => assertLocalDockerContextResults(ok('remote'), ok(endpoint)), /requires a local/);
  }
});

test('a canonical emitted candidate verifies every locked file and exposes buffered bytes', () => withTemporaryRoot((root) => {
  const fixture = createCandidateFixture(root);
  const verified = verifyFixture(fixture);
  assert.equal(verified.migrations.length, 2);
  assert.equal(verified.lockFileSha256, fixture.lockFileSha256);
  assert.match(verified.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(verified.migrations[0].contents.toString('utf8'), fixture.baselineSql);
  assert.equal(verified.migrations[1].contents.toString('utf8'), fixture.forwardSql);
}));

test('migration tampering, missing files, and untracked paths fail before execution', () => withTemporaryRoot((root) => {
  const fixture = createCandidateFixture(root);
  const baselinePath = join(fixture.candidateDir, 'migrations', fixture.recoveryConfig.baseline.filename);
  writeFileSync(baselinePath, `${fixture.baselineSql}-- tampered\n`, 'utf8');
  assert.throws(() => verifyFixture(fixture), /migration hash mismatch/);
  writeFileSync(baselinePath, fixture.baselineSql, 'utf8');
  writeFileSync(join(fixture.candidateDir, 'untracked.txt'), 'not locked', 'utf8');
  assert.throws(() => verifyFixture(fixture), /root entries must be exactly/);
  rmSync(join(fixture.candidateDir, 'untracked.txt'));
  rmSync(join(fixture.candidateDir, 'migrations', fixture.recoveryConfig.forward_migrations[0].filename));
  assert.throws(() => verifyFixture(fixture), /paths\/count/);
}));

test('rewriting both a migration and the self-hashed lock still fails the external lock-file trust root', () => withTemporaryRoot((root) => {
  const fixture = createCandidateFixture(root);
  const lockPath = join(fixture.candidateDir, 'lineage-lock.json');
  const baselinePath = join(fixture.candidateDir, 'migrations', fixture.recoveryConfig.baseline.filename);
  const maliciousSql = `${fixture.baselineSql}SELECT 'malicious but self-consistent';\n`;
  const maliciousHash = sha256(maliciousSql);
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  lock.baseline_transform.sha256 = maliciousHash;
  lock.candidate_chain.migration_files[0].sha256 = maliciousHash;
  const { content_sha256: ignored, ...payload } = lock;
  lock.content_sha256 = sha256(canonicalJson(payload));
  writeFileSync(lockPath, prettyCanonicalJson(lock), 'utf8');
  writeFileSync(join(fixture.candidateDir, 'README.md'), expectedRecoveryCandidateReadme(lock.content_sha256), 'utf8');
  writeFileSync(baselinePath, maliciousSql, 'utf8');
  assert.throws(() => verifyFixture(fixture), /independently supplied expected file SHA-256/);
}));

test('raw ledger, capture time, and independent provenance remain pinned even under a newly supplied lock-file hash', () => {
  for (const [mutate, pattern] of [
    [(lock) => { lock.remote_ledger.raw_sha256 = 'f'.repeat(64); }, /exact ledger artifact digest/],
    [(lock) => { lock.remote_ledger.captured_at = '2026-07-14T00:00:00.000Z'; }, /exact pinned capture/],
    [(lock) => { lock.remote_ledger_provenance.raw_sha256 = 'f'.repeat(64); }, /exact provenance digest/],
    [(lock) => { lock.remote_ledger_provenance.production_mutation_performed = true; }, /deny production mutation/],
  ]) {
    withTemporaryRoot((root) => {
      const fixture = createCandidateFixture(root);
      const rewritten = rewriteCandidateLock(fixture, mutate);
      assert.throws(() => verifyRecoveryCandidate({
        candidateDir: fixture.candidateDir,
        expectedLineageFileSha256: rewritten.lockFileSha256,
        expectedLineageContentSha256: rewritten.lock.content_sha256,
        recoveryConfig: fixture.recoveryConfig,
      }), pattern);
    });
  }
});

test('noncanonical lineage JSON is rejected even when the caller supplies its exact raw hash', () => withTemporaryRoot((root) => {
  const fixture = createCandidateFixture(root);
  const lockPath = join(fixture.candidateDir, 'lineage-lock.json');
  const noncanonical = ` ${readFileSync(lockPath, 'utf8')}`;
  writeFileSync(lockPath, noncanonical, 'utf8');
  assert.throws(() => verifyRecoveryCandidate({
    candidateDir: fixture.candidateDir,
    expectedLineageFileSha256: sha256(noncanonical),
    recoveryConfig: fixture.recoveryConfig,
  }), /exact canonical UTF-8 document/);
}));

test('the real emitted recovery candidate satisfies its two independently recorded digests when present', (context) => {
  const candidateDir = resolve('../../outputs/dial-smart-database-recovery-candidate-2026-07-13-v4');
  if (!existsSync(candidateDir)) {
    context.skip('Workspace recovery candidate is intentionally an external output artifact.');
    return;
  }
  const emittedLock = JSON.parse(readFileSync(join(candidateDir, 'lineage-lock.json'), 'utf8'));
  if (!emittedLock.remote_ledger_provenance) {
    context.skip('Workspace recovery candidate predates the required independent provenance lock; a new candidate is required.');
    return;
  }
  const recoveryConfig = JSON.parse(readFileSync('certification/database-recovery-candidate.json', 'utf8'));
  const verified = verifyRecoveryCandidate({
    candidateDir,
    expectedLineageFileSha256: '9fcd181ac2021f067b41258ba2eb7750854ba93aef051842632346cf49480e19',
    expectedLineageContentSha256: 'd5db7177c73829aba322bda66ae8f622c14f039a22e08648a3760551187ca2b0',
    recoveryConfig,
  });
  assert.equal(verified.migrations.length, 22);
});

test('candidate bytes and current SQL contracts clone only into a new OS-temp project', () => withTemporaryRoot((root) => {
  const fixture = createCandidateFixture(root);
  const candidate = verifyFixture(fixture);
  const contracts = readCurrentSqlContracts(repoRoot);
  assert.ok(contracts.length > 0);
  const projectRoot = mkdtempSync(join(tmpdir(), 'recovered-project-test-'));
  try {
    const project = createRecoveredSupabaseProject({
      sourceConfig: readFileSync('supabase/config.toml', 'utf8'),
      temporaryRoot: projectRoot,
      databasePort: 65431,
      candidate,
      contracts,
      postgresMajorVersion: 15,
    });
    assert.equal(readdirSync(project.migrationsRoot).length, 1);
    assert.equal(readdirSync(project.testsRoot).length, contracts.length);
    assert.match(readFileSync(join(project.workdir, 'supabase/config.toml'), 'utf8'), /^project_id = "dial-smart-recovered-cert-/m);
    assert.match(readFileSync(join(project.workdir, 'supabase/config.toml'), 'utf8'), /\[db\][\s\S]*?^port = 65431$/m);
    assert.match(verifyTemporaryEvidenceTree({
      project,
      candidate,
      contracts,
      includeForwardMigrations: false,
      phase: 'baseline',
    }).fingerprint_sha256, /^[a-f0-9]{64}$/);
    installVerifiedForwardMigrations(project, candidate);
    assert.match(verifyTemporaryEvidenceTree({
      project,
      candidate,
      contracts,
      includeForwardMigrations: true,
      phase: 'full',
    }).fingerprint_sha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(
      readdirSync(project.migrationsRoot).sort(),
      candidate.migrations.map((migration) => migration.filename).sort(),
    );
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
  assert.throws(() => assertOsTemporaryRoot(repoRoot), /only in a new descendant/);
}));

test('SQL contracts are statically constrained to one top-level rollback-only transaction', () => {
  assert.doesNotThrow(() => assertRollbackOnlySqlContract([
    '-- contract',
    'BEGIN;',
    "DO $body$ BEGIN RAISE NOTICE 'COMMIT;'; END $body$;",
    'ROLLBACK;',
  ].join('\n'), 'safe.sql'));
  for (const sql of [
    'SELECT 1;',
    'BEGIN; SELECT 1; COMMIT;',
    'BEGIN; SELECT 1;',
    'BEGIN; ROLLBACK; ROLLBACK;',
    'BEGIN; \\include other.sql\nROLLBACK;',
  ]) {
    assert.throws(() => assertRollbackOnlySqlContract(sql, 'unsafe.sql'));
  }
});

test('temporary execution-tree verification rejects migration, contract, config, and entry drift', () => withTemporaryRoot((root) => {
  const fixture = createCandidateFixture(root);
  const candidate = verifyFixture(fixture);
  const contractSql = Buffer.from('BEGIN;\nSELECT 1;\nROLLBACK;\n');
  const contracts = [{
    filename: 'fixture_contract.sql',
    bytes: contractSql.length,
    sha256: sha256(contractSql),
    contents: contractSql,
  }];
  const projectRoot = mkdtempSync(join(tmpdir(), 'recovered-tree-test-'));
  try {
    const project = createRecoveredSupabaseProject({
      sourceConfig: readFileSync('supabase/config.toml', 'utf8'),
      temporaryRoot: projectRoot,
      databasePort: 65430,
      candidate,
      contracts,
      postgresMajorVersion: 15,
    });
    const verify = (includeForwardMigrations = false) => verifyTemporaryEvidenceTree({
      project,
      candidate,
      contracts,
      includeForwardMigrations,
      phase: 'test',
    });
    assert.doesNotThrow(() => verify(false));

    const contractPath = join(project.testsRoot, contracts[0].filename);
    writeFileSync(contractPath, 'BEGIN;\nROLLBACK;\n');
    assert.throws(() => verify(false), /SQL-contract tree hash\/byte mismatch/);
    writeFileSync(contractPath, contractSql);

    const baselinePath = join(project.migrationsRoot, candidate.migrations[0].filename);
    writeFileSync(baselinePath, `${fixture.baselineSql}-- drift\n`);
    assert.throws(() => verify(false), /migration tree hash\/byte mismatch/i);
    writeFileSync(baselinePath, fixture.baselineSql);

    const isolatedConfig = readFileSync(project.configPath, 'utf8');
    writeFileSync(project.configPath, `${isolatedConfig}\n# drift\n`);
    assert.throws(() => verify(false), /config\.toml changed/);
    writeFileSync(project.configPath, isolatedConfig);

    writeFileSync(join(project.testsRoot, 'extra.sql'), 'BEGIN; ROLLBACK;');
    assert.throws(() => verify(false), /entries do not exactly match/);
    rmSync(join(project.testsRoot, 'extra.sql'));

    installVerifiedForwardMigrations(project, candidate);
    const forwardPath = join(project.migrationsRoot, candidate.migrations[1].filename);
    writeFileSync(forwardPath, `${fixture.forwardSql}-- drift\n`);
    assert.throws(() => verify(true), /migration tree hash\/byte mismatch/i);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
}));

test('every post-mkdtemp failure removes the recovered temporary root', async () => {
  let created;
  await assert.rejects(() => withRecoveredTemporaryRoot(async (root) => {
    created = root;
    writeFileSync(join(root, 'partial-clone.sql'), 'sensitive schema bytes');
    throw new Error('setup failed');
  }), /setup failed/);
  assert.equal(existsSync(created), false);
});

test('a candidate becomes uncertifiable when any repository migration is added, removed, or changed', () => withTemporaryRoot((root) => {
  const fixture = createCandidateFixture(root);
  const candidate = verifyFixture(fixture);
  const fakeRepo = join(root, 'repo');
  const migrations = join(fakeRepo, 'supabase', 'migrations');
  mkdirSync(migrations, { recursive: true });
  writeFileSync(join(migrations, '20250101000000_legacy.sql'), fixture.legacySql, 'utf8');
  writeFileSync(
    join(migrations, fixture.recoveryConfig.forward_migrations[0].filename),
    fixture.forwardSql,
    'utf8',
  );
  const inventory = verifyCurrentRepositoryMigrationInventory({ repoRoot: fakeRepo, candidate });
  assert.equal(inventory.count, 2);
  assert.match(inventory.fingerprint_sha256, /^[a-f0-9]{64}$/);

  const added = join(migrations, '20260712020000_unreviewed.sql');
  writeFileSync(added, 'SELECT 1;\n', 'utf8');
  assert.throws(
    () => verifyCurrentRepositoryMigrationInventory({ repoRoot: fakeRepo, candidate }),
    /Added: 20260712020000_unreviewed.sql/,
  );
  rmSync(added);
  writeFileSync(
    join(migrations, fixture.recoveryConfig.forward_migrations[0].filename),
    `${fixture.forwardSql}-- drift\n`,
    'utf8',
  );
  assert.throws(
    () => verifyCurrentRepositoryMigrationInventory({ repoRoot: fakeRepo, candidate }),
    /differs from the emitted lineage lock/,
  );
}));

test('recovery policy, database runtime manifest, and Supabase config are hash-locked across execution', () => withTemporaryRoot((root) => {
  for (const relativePath of [
    'certification/database-certification.json',
    'certification/database-recovery-candidate.json',
    'supabase/config.toml',
  ]) {
    const path = join(root, ...relativePath.split('/'));
    mkdirSync(resolve(path, '..'), { recursive: true });
    writeFileSync(path, `${relativePath}\n`);
  }
  const snapshot = captureRecoveredRepositoryConfiguration(root);
  assert.match(snapshot.fingerprint_sha256, /^[a-f0-9]{64}$/);
  assert.doesNotThrow(() => assertRecoveredRepositoryConfigurationUnchanged(root, snapshot));
  writeFileSync(join(root, 'supabase', 'config.toml'), 'changed\n');
  assert.throws(
    () => assertRecoveredRepositoryConfigurationUnchanged(root, snapshot),
    /configuration changed while certification was running/,
  );
}));

test('exact ledger assertions bind every ordered version and name, not only a row count', () => {
  const migrations = [
    { filename: '20260712000000_live_public_schema_baseline.sql' },
    { filename: '20260712010000_forward_safety.sql' },
  ];
  assert.deepEqual(expectedMigrationLedgerRows(migrations), [
    { version: '20260712000000', name: 'live_public_schema_baseline' },
    { version: '20260712010000', name: 'forward_safety' },
  ]);
  const sql = exactMigrationLedgerAssertion(migrations);
  assert.match(sql, /exact recovered migration ledger mismatch/);
  assert.match(sql, /20260712010000/);
  assert.match(sql, /forward_safety/);
  assert.match(postgresMajorAssertion(15), /server_version_num/);
});

test('every database command is local-only and bound to the isolated workdir', () => {
  const workdir = join(tmpdir(), 'isolated-recovered-cert');
  const commands = buildRecoveredCertificationCommands({
    workdir,
    schema: 'public',
    dumpPath: join(workdir, 'schema.sql'),
  });
  for (const args of Object.values(commands)) {
    assert.deepEqual(args.slice(0, 2), ['--workdir', workdir]);
    assert.equal(args.includes('--linked'), false);
    assert.equal(args.some((arg) => arg.startsWith('--db-url')), false);
  }
  const query = buildRecoveredLocalQueryCommand({ workdir, sql: 'SELECT 1;' });
  const contract = buildRecoveredLocalQueryCommand({ workdir, file: join(workdir, 'contract.sql') });
  assert.ok(query.includes('--local'));
  assert.ok(contract.includes('--local'));
  assert.throws(
    () => buildRecoveredLocalQueryCommand({ workdir, sql: 'SELECT 1;', file: 'also.sql' }),
    /Exactly one/,
  );
});

test('baseline and final schema comparisons remove transport metadata but reject schema drift', () => {
  const baseline = [
    '-- DIAL SMART OFFLINE DATABASE RECOVERY BASELINE CANDIDATE',
    `-- Source schema SHA-256: ${'a'.repeat(64)}`,
    '-- This file is for a new disposable/staging lineage only.',
    '-- Never apply this baseline to the existing production database.',
    '',
    'CREATE SCHEMA IF NOT EXISTS "public";',
    'CREATE TABLE "public"."x" ("id" integer);',
  ].join('\n');
  const restored = [
    '-- PostgreSQL database dump',
    'SET statement_timeout = 0;',
    'CREATE SCHEMA "public";',
    'CREATE TABLE "public"."x" ("id" integer);',
  ].join('\r\n');
  assert.equal(normalizeRecoveredPublicSchema(baseline), normalizeRecoveredPublicSchema(restored));
  assert.match(assertBaselineRestoreMatchesLockedSource(baseline, restored), /^[a-f0-9]{64}$/);
  assert.match(assertRecoveredFinalSchemasMatch(restored, `${restored}\n`), /^[a-f0-9]{64}$/);
  assert.match(assertContractsDidNotMutateSchema(restored, `${restored}\n`), /^[a-f0-9]{64}$/);
  assert.throws(
    () => assertRecoveredFinalSchemasMatch(restored, restored.replace('integer', 'bigint')),
    /different normalized public schemas/,
  );
  assert.throws(
    () => assertContractsDidNotMutateSchema(restored, restored.replace('integer', 'bigint')),
    /contracts changed/,
  );
});

test('the final certificate is deterministic, exhaustive, and explicitly non-authorizing', () => withTemporaryRoot((root) => {
  const fixture = createCandidateFixture(root);
  const candidate = verifyFixture(fixture);
  const contracts = [{ filename: 'contract.sql', bytes: 10, sha256: sha256('SELECT 1;'), contents: Buffer.from('SELECT 1;') }];
  const types = 'export type Database = { public: unknown };\n';
  const finalDump = `${fixture.baselineSql}${fixture.forwardSql}`;
  const input = {
    candidate,
    databaseCertificationConfig: {
      supabaseCliVersion: '2.109.1',
      postgresMajorVersion: 15,
      schema: 'public',
      committedTypesPath: 'src/integrations/supabase/types.ts',
    },
    recoveryConfig: fixture.recoveryConfig,
    repositoryConfigurationEvidence: {
      files: {
        database_certification: { relative_path: 'certification/database-certification.json', bytes: 10, sha256: '1'.repeat(64) },
        database_recovery: { relative_path: 'certification/database-recovery-candidate.json', bytes: 10, sha256: '2'.repeat(64) },
        supabase_config: { relative_path: 'supabase/config.toml', bytes: 10, sha256: '3'.repeat(64) },
      },
      fingerprint_sha256: '4'.repeat(64),
    },
    dockerEvidence: {
      version: '27.5.1',
      context: 'desktop-linux',
      endpoint: 'npipe:////./pipe/dockerDesktopLinuxEngine',
      transport: 'npipe',
    },
    temporaryTreeChecks: [
      { phase: 'baseline_before_replay', fingerprint_sha256: '5'.repeat(64) },
      { phase: 'full_after_replay_2', fingerprint_sha256: '6'.repeat(64) },
    ],
    contracts,
    committedTypes: types,
    baselineDump: fixture.baselineSql,
    firstBeforeContractsDump: finalDump,
    firstDump: finalDump,
    secondBeforeContractsDump: finalDump,
    secondDump: finalDump,
    firstGeneratedTypes: types,
    secondGeneratedTypes: types,
  };
  const first = buildRecoveredDatabaseCertificate(input);
  const second = buildRecoveredDatabaseCertificate(input);
  assert.deepEqual(first, second);
  assert.match(first.content_sha256, /^[a-f0-9]{64}$/);
  assert.equal(first.full_chain_replays.clean_replay_count, 2);
  assert.equal(first.sql_contracts.count, 1);
  assert.equal(first.safety.launch_authorized, false);
  assert.equal(first.safety.staging_deploy_authorized, false);
  assert.equal(first.safety.production_write_authorized, false);
  assert.equal(first.safety.remote_database_access_performed, false);
  assert.equal(first.safety.known_remote_database_credential_environment_variables_present, false);
  assert.equal(first.safety.active_docker_endpoint_verified_local, true);
  assert.equal(first.container_runtime.endpoint_transport, 'npipe');
  assert.equal(first.temporary_execution_copy.verification_count, 2);
  assert.equal(first.candidate.remote_ledger_provenance.production_mutation_performed, false);
  assert.equal(first.safety.external_package_or_container_image_network_access, 'not_attested');
  assert.equal(first.safety.database_execution_scope, 'disposable_local_only');
  assert.throws(
    () => buildRecoveredDatabaseCertificate({ ...input, secondGeneratedTypes: 'export type Drift = true;' }),
    /do not match/,
  );
}));

test('certificate output is exclusive, cannot mutate the candidate, and remains canonical', () => withTemporaryRoot((root) => {
  const fixture = createCandidateFixture(root);
  const output = join(root, 'certificate.json');
  const certificate = { format_version: 1, content_sha256: 'a'.repeat(64) };
  assert.equal(assertCertificateOutputPath(output, fixture.candidateDir), output);
  writeCertificateExclusive(output, certificate, fixture.candidateDir);
  assert.equal(readFileSync(output, 'utf8'), prettyCanonicalJson(certificate));
  assert.throws(() => writeCertificateExclusive(output, certificate), /overwrite/);
  assert.throws(
    () => assertCertificateOutputPath(join(fixture.candidateDir, 'certificate.json'), fixture.candidateDir),
    /may not mutate/,
  );
}));

test('Docker failure is truthful: it says no replay and no certificate occurred', () => {
  for (const result of [
    { error: new Error('ENOENT'), status: null, stdout: '', stderr: '' },
    { status: 1, stdout: '', stderr: 'engine stopped' },
    { status: 0, stdout: '', stderr: '' },
  ]) {
    assert.throws(
      () => assertDockerInfoResult(result),
      /execution did not start and no certificate was created.*verification alone is not certification/i,
    );
  }
  assert.equal(assertDockerInfoResult({ status: 0, stdout: '27.5.1\n' }), '27.5.1');
});

test('the executable rejects remote flags before checking Docker or writing a certificate', () => withTemporaryRoot((root) => {
  const output = join(root, 'must-not-exist.json');
  const result = spawnSync(process.execPath, [
    resolve('scripts/certify-recovered-database.mjs'),
    '--candidate-dir', root,
    '--expected-lineage-file-sha256', 'a'.repeat(64),
    '--db-url', 'postgres://production.example/db',
    '--certificate-out', output,
  ], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /database target flag is forbidden/);
  assert.equal(existsSync(output), false);
}));
