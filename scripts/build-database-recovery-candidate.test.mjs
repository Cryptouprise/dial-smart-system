import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  buildRecoveryCandidate,
  canonicalJson,
  emitRecoveryCandidate,
  inventoryLocalMigrations,
  readRecoveryConfig,
  sanitizedRecoveryEnv,
  scanSchemaDump,
  sha256,
  transformSchemaDump,
  validateRemoteLedger,
  validateRemoteLedgerProvenance,
} from './lib/database-recovery-candidate.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const liveSnapshot = resolve(repoRoot, '..', '..', 'outputs', 'dialer-live-public-schema-2026-07-12.sql');
const liveRemoteLedger = resolve(
  repoRoot,
  '..',
  '..',
  'outputs',
  'dial-smart-remote-ledger-2026-07-13.json',
);
const liveRemoteLedgerProvenance = resolve(
  repoRoot,
  '..',
  '..',
  'outputs',
  'dial-smart-remote-ledger-2026-07-13.provenance.json',
);
const liveMigrations = resolve(repoRoot, 'supabase/migrations');
const liveCollisionBaseline = resolve(repoRoot, 'certification/migration-version-baseline.json');
const expectedTemporarilyUnpinnedMigrations = [];

function sampleDump(extra = '') {
  return `-- PostgreSQL database dump
-- Dumped from database version 15.8
-- Dumped by pg_dump version 15.18
\\restrict random-token
CREATE SCHEMA "public";
CREATE TABLE "public"."items" ("id" integer);
CREATE FUNCTION "public"."write_item"() RETURNS void
  LANGUAGE plpgsql
  AS $body$
BEGIN
  INSERT INTO public.items(id) VALUES (1);
END
$body$;
CREATE POLICY "read items" ON "public"."items" FOR SELECT USING (true);
${extra}\\unrestrict random-token
`;
}

function configFor(dump, forwardMigrations = [], expectedRows = 1) {
  const buffer = Buffer.from(dump);
  return {
    format_version: 1,
    source_snapshot: {
      filename: 'snapshot.sql',
      sha256: sha256(buffer),
      bytes: buffer.length,
      postgres_database_version: '15.8',
      pg_dump_version: '15.18',
      postgres_major_version: 15,
      inventory: { tables: 1, functions: 1, policies: 1 },
    },
    remote_ledger: {
      format_version: 1,
      filename: 'remote-ledger.json',
      expected_rows: expectedRows,
      expected_project_ref: 'source-project-ref',
      expected_empty_names: 0,
      expected_canonical_rows_sha256: '0'.repeat(64),
      expected_raw_sha256: '0'.repeat(64),
      expected_captured_at: '2026-07-12T00:00:00.000Z',
    },
    remote_ledger_provenance: {
      format_version: 1,
      filename: 'remote-ledger.provenance.json',
      expected_raw_sha256: '0'.repeat(64),
      expected_evidence_class: 'read_only_remote_migration_ledger',
      expected_sources: [
        {
          provider: 'supabase',
          interface: 'management_api_read_only_sql',
          method: 'POST',
          endpoint_path: '/v1/projects/{project_ref}/database/query/read-only',
          read_only: true,
          response_sha256: '1'.repeat(64),
        },
        {
          provider: 'supabase',
          interface: 'management_api_migration_history',
          method: 'GET',
          endpoint_path: '/v1/projects/{project_ref}/database/migrations',
          read_only: true,
          response_sha256: '2'.repeat(64),
        },
      ],
    },
    baseline: {
      version: '20260712000000',
      filename: '20260712000000_live_public_schema_baseline.sql',
    },
    forward_migrations: forwardMigrations,
  };
}

function ledgerFor(config, rows, { pin = true, document = {} } = {}) {
  const contents = Buffer.from(JSON.stringify({
    format_version: 1,
    capture_mode: 'read_only',
    source_project_ref: 'source-project-ref',
    captured_at: '2026-07-12T00:00:00.000Z',
    schema_dump_sha256: config.source_snapshot.sha256,
    rows,
    ...document,
  }));
  if (pin) {
    const normalizedRows = [...rows]
      .map((row) => ({ version: String(row.version), name: typeof row.name === 'string' ? row.name : '' }))
      .sort((left, right) => left.version.localeCompare(right.version) || left.name.localeCompare(right.name));
    config.remote_ledger.expected_raw_sha256 = sha256(contents);
    config.remote_ledger.expected_empty_names = normalizedRows.filter((row) => row.name === '').length;
    config.remote_ledger.expected_canonical_rows_sha256 = sha256(canonicalJson(normalizedRows));
  }
  return contents;
}

function provenanceFor(config, ledgerContents, { pin = true, mutate = null } = {}) {
  const ledger = JSON.parse(ledgerContents.toString('utf8'));
  const rows = [...ledger.rows]
    .sort((left, right) => left.version.localeCompare(right.version) || left.name.localeCompare(right.name));
  const metrics = {
    row_count: rows.length,
    unique_versions: new Set(rows.map((row) => row.version)).size,
    empty_string_names: rows.filter((row) => row.name === '').length,
    nonempty_names: rows.filter((row) => row.name !== '').length,
    null_names: 0,
    malformed_versions: 0,
    canonical_rows_sha256: sha256(canonicalJson(rows)),
  };
  const document = {
    format_version: 1,
    evidence_class: 'read_only_remote_migration_ledger',
    source_project_ref: ledger.source_project_ref,
    captured_at: ledger.captured_at,
    schema_dump_sha256: ledger.schema_dump_sha256,
    ledger: {
      filename: config.remote_ledger.filename,
      raw_sha256: sha256(ledgerContents),
      ...metrics,
    },
    sources: config.remote_ledger_provenance.expected_sources.map((source) => ({
      ...source,
      ...metrics,
    })),
    cross_source: {
      canonical_rows_identical: true,
      canonical_rows_sha256: metrics.canonical_rows_sha256,
    },
    snapshot_catalog_binding: {
      observed_in_same_authenticated_read_only_session: true,
      postgres_server_version: config.source_snapshot.postgres_database_version,
      public_tables: config.source_snapshot.inventory.tables,
      public_functions: config.source_snapshot.inventory.functions,
      public_policies: config.source_snapshot.inventory.policies,
    },
    credential_handling: {
      existing_cli_session_used_in_memory: true,
      credential_written_to_artifact: false,
      database_password_used: false,
      connection_string_used: false,
      project_link_changed: false,
    },
    production_mutation_performed: false,
  };
  if (mutate) mutate(document);
  const contents = Buffer.from(JSON.stringify(document));
  if (pin) config.remote_ledger_provenance.expected_raw_sha256 = sha256(contents);
  return contents;
}

function withTempDirectory(callback) {
  const root = mkdtempSync(join(tmpdir(), 'dial-smart-recovery-test-'));
  try {
    return callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('the pinned live schema export passes hash, inventory, no-data, and secret gates', {
  skip: !existsSync(liveSnapshot),
}, () => {
  const config = readRecoveryConfig(resolve(repoRoot, 'certification/database-recovery-candidate.json'));
  const result = scanSchemaDump(readFileSync(liveSnapshot), config);
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
  assert.equal(result.no_top_level_row_data, true);
  assert.equal(result.no_possible_secrets, true);
  assert.deepEqual(
    { tables: result.inventory.tables, functions: result.inventory.functions, policies: result.inventory.policies },
    { tables: 134, functions: 56, policies: 257 },
  );
});

test('the authenticated live ledger matches its project, snapshot, row, empty-name, and canonical pins', {
  skip: !existsSync(liveRemoteLedger),
}, () => {
  const config = readRecoveryConfig(resolve(repoRoot, 'certification/database-recovery-candidate.json'));
  const contents = readFileSync(liveRemoteLedger);
  const document = JSON.parse(contents.toString('utf8'));
  const result = validateRemoteLedger(contents, config, config.source_snapshot.sha256);
  assert.equal(result.ok, true);
  assert.equal(document.source_project_ref, config.remote_ledger.expected_project_ref);
  assert.equal(result.rows.length, 145);
  assert.equal(result.empty_name_count, 119);
  assert.equal(
    result.canonical_rows_sha256,
    '910028442f95b41e5e4a12631b973f66ab9916ab93a46f5a85589938f3fc15ee',
  );
});

test('the pinned two-route provenance exactly binds the live ledger and schema evidence', {
  skip: !existsSync(liveRemoteLedger) || !existsSync(liveRemoteLedgerProvenance),
}, () => {
  const config = readRecoveryConfig(resolve(repoRoot, 'certification/database-recovery-candidate.json'));
  const ledgerContents = readFileSync(liveRemoteLedger);
  const ledger = validateRemoteLedger(ledgerContents, config, config.source_snapshot.sha256);
  const provenance = validateRemoteLedgerProvenance(
    readFileSync(liveRemoteLedgerProvenance),
    config,
    config.source_snapshot.sha256,
    ledger,
  );
  assert.equal(ledger.ok, true);
  assert.equal(provenance.ok, true);
  assert.equal(provenance.raw_sha256, config.remote_ledger_provenance.expected_raw_sha256);
  assert.deepEqual(Object.keys(provenance.source_response_sha256s).sort(), [
    'management_api_migration_history',
    'management_api_read_only_sql',
  ]);
});

test('the live migration inventory has no unpinned post-snapshot migrations or other errors', () => {
  const config = readRecoveryConfig(resolve(repoRoot, 'certification/database-recovery-candidate.json'));
  const collisionBaseline = JSON.parse(readFileSync(liveCollisionBaseline, 'utf8'));
  const inventory = inventoryLocalMigrations({
    migrationsDir: liveMigrations,
    config,
    remoteLedger: null,
    collisionBaseline,
  });
  const unpinned = inventory.errors
    .filter((item) => item.code === 'UNAPPROVED_POST_SNAPSHOT_MIGRATION')
    .map((item) => item.message.match(/: ([^.]+\.sql)\.$/)?.[1])
    .filter(Boolean)
    .sort();
  assert.deepEqual(unpinned, expectedTemporarilyUnpinnedMigrations);
  assert.deepEqual(
    inventory.errors.filter((item) => item.code !== 'UNAPPROVED_POST_SNAPSHOT_MIGRATION'),
    [],
  );
});

test('function-body DML is allowed but top-level row data and embedded secrets are rejected', () => {
  const safe = sampleDump();
  assert.equal(scanSchemaDump(safe, configFor(safe)).ok, true);

  const copy = sampleDump('COPY "public"."items" ("id") FROM stdin;\n1\n\\.\n');
  assert.ok(scanSchemaDump(copy, configFor(copy)).errors.some((item) => item.code === 'TOP_LEVEL_COPY'));

  const secret = sampleDump("SELECT 'token' = 'sk-live-this-is-a-very-long-secret-value';\n");
  assert.ok(scanSchemaDump(secret, configFor(secret)).errors.some((item) => item.code.startsWith('POSSIBLE_SECRET_')));
});

test('the schema transform is deterministic and limited to the documented rules', () => {
  const dump = sampleDump();
  const first = transformSchemaDump(dump, sha256(dump));
  const second = transformSchemaDump(dump, sha256(dump));
  assert.equal(first.sql, second.sql);
  assert.equal(first.sha256, second.sha256);
  assert.match(first.sql, /CREATE SCHEMA IF NOT EXISTS "public";/);
  assert.doesNotMatch(first.sql, /\\restrict|\\unrestrict/);
  assert.match(first.sql, /INSERT INTO public\.items/);
});

test('recovery config requires exact ledger bytes, capture time, and provenance pins', () => withTempDirectory((root) => {
  const dump = sampleDump();
  const forwardName = '20260712010000_forward_hardening.sql';
  const config = configFor(dump, [{ filename: forwardName, sha256: sha256('SELECT 1;\n') }]);
  config.remote_ledger.expected_project_ref = 'abcdefghijklmnopqrst';
  const cases = [
    {
      message: /expected_raw_sha256/,
      mutate: (value) => { delete value.remote_ledger.expected_raw_sha256; },
    },
    {
      message: /expected_captured_at/,
      mutate: (value) => { value.remote_ledger.expected_captured_at = 'July 12, 2026'; },
    },
    {
      message: /remote_ledger_provenance\.expected_raw_sha256/,
      mutate: (value) => { delete value.remote_ledger_provenance.expected_raw_sha256; },
    },
  ];
  for (const [index, { message, mutate }] of cases.entries()) {
    const changed = structuredClone(config);
    mutate(changed);
    const path = join(root, `invalid-config-${index}.json`);
    writeFileSync(path, JSON.stringify(changed));
    assert.throws(() => readRecoveryConfig(path), message);
  }
}));

test('remote ledger must be separately supplied, snapshot-bound, unique, and exact-count', () => {
  const dump = sampleDump();
  const config = configFor(dump, [], 2);
  const valid = ledgerFor(config, [
    { version: '20250101000000', name: 'one' },
    { version: '20250201000000', name: 'two' },
  ]);
  assert.equal(validateRemoteLedger(valid, config, config.source_snapshot.sha256).ok, true);

  const duplicate = ledgerFor(config, [
    { version: '20250101000000', name: 'one' },
    { version: '20250101000000', name: 'two' },
  ]);
  const invalid = validateRemoteLedger(duplicate, config, config.source_snapshot.sha256);
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.some((item) => item.code === 'REMOTE_LEDGER_DUPLICATE_VERSION'));
});

test('remote ledger permits only the pinned count of authentic empty names and rejects name or source drift', () => {
  const dump = sampleDump();
  const config = configFor(dump, [], 2);
  const rows = [
    { version: '20250101000000', name: '' },
    { version: '20250201000000', name: 'named_migration' },
  ];
  config.remote_ledger.expected_project_ref = 'source-project-ref';
  config.remote_ledger.expected_empty_names = 1;
  config.remote_ledger.expected_canonical_rows_sha256 = sha256(canonicalJson(rows));

  const valid = validateRemoteLedger(ledgerFor(config, rows), config, config.source_snapshot.sha256);
  assert.equal(valid.ok, true);
  assert.equal(valid.empty_name_count, 1);
  assert.equal(valid.canonical_rows_sha256, config.remote_ledger.expected_canonical_rows_sha256);

  for (const invalidName of [null, '   ', ' padded']) {
    const invalidRows = [
      { version: '20250101000000', name: invalidName },
      rows[1],
    ];
    const invalid = validateRemoteLedger(
      ledgerFor(config, invalidRows),
      config,
      config.source_snapshot.sha256,
    );
    assert.equal(invalid.ok, false);
    assert.ok(invalid.errors.some((item) => item.code === 'REMOTE_LEDGER_NAME_INVALID'));
  }

  const missingNameDocument = JSON.parse(ledgerFor(config, rows).toString('utf8'));
  delete missingNameDocument.rows[0].name;
  const missing = validateRemoteLedger(
    Buffer.from(JSON.stringify(missingNameDocument)),
    config,
    config.source_snapshot.sha256,
  );
  assert.equal(missing.ok, false);
  assert.ok(missing.errors.some((item) => item.code === 'REMOTE_LEDGER_NAME_INVALID'));

  const wrongProjectDocument = JSON.parse(ledgerFor(config, rows).toString('utf8'));
  wrongProjectDocument.source_project_ref = 'different-project-ref';
  const wrongProject = validateRemoteLedger(
    Buffer.from(JSON.stringify(wrongProjectDocument)),
    config,
    config.source_snapshot.sha256,
  );
  assert.equal(wrongProject.ok, false);
  assert.ok(wrongProject.errors.some((item) => item.code === 'REMOTE_LEDGER_PROJECT_REF_MISMATCH'));

  const nameDrift = validateRemoteLedger(
    ledgerFor(config, [rows[0], { ...rows[1], name: 'changed_name' }], { pin: false }),
    config,
    config.source_snapshot.sha256,
  );
  assert.equal(nameDrift.ok, false);
  assert.ok(nameDrift.errors.some((item) => item.code === 'REMOTE_LEDGER_CANONICAL_ROWS_MISMATCH'));
});

test('remote ledger rejects numeric versions, duplicate JSON keys, noncanonical timestamps, and raw-byte drift', () => {
  const dump = sampleDump();
  const config = configFor(dump, [], 1);
  const validContents = ledgerFor(config, [{ version: '20250101000000', name: 'one' }]);
  assert.equal(validateRemoteLedger(validContents, config, config.source_snapshot.sha256).ok, true);

  const numericDocument = JSON.parse(validContents.toString('utf8'));
  numericDocument.rows[0].version = Number(numericDocument.rows[0].version);
  const numericContents = Buffer.from(JSON.stringify(numericDocument));
  const numericConfig = structuredClone(config);
  numericConfig.remote_ledger.expected_raw_sha256 = sha256(numericContents);
  const numeric = validateRemoteLedger(numericContents, numericConfig, config.source_snapshot.sha256);
  assert.equal(numeric.ok, false);
  assert.ok(numeric.errors.some((item) => item.code === 'REMOTE_LEDGER_VERSION_INVALID'));

  const duplicateContents = Buffer.from(validContents.toString('utf8').replace(
    /"version":"([0-9]+)"/,
    '"version":"00000000","version":"$1"',
  ));
  const duplicateConfig = structuredClone(config);
  duplicateConfig.remote_ledger.expected_raw_sha256 = sha256(duplicateContents);
  const duplicate = validateRemoteLedger(duplicateContents, duplicateConfig, config.source_snapshot.sha256);
  assert.equal(duplicate.ok, false);
  assert.ok(duplicate.errors.some((item) => item.code === 'REMOTE_LEDGER_DUPLICATE_JSON_KEY'));

  const timestampDocument = JSON.parse(validContents.toString('utf8'));
  timestampDocument.captured_at = 'July 12, 2026 00:00:00 UTC';
  const timestampContents = Buffer.from(JSON.stringify(timestampDocument));
  const timestampConfig = structuredClone(config);
  timestampConfig.remote_ledger.expected_raw_sha256 = sha256(timestampContents);
  const timestamp = validateRemoteLedger(timestampContents, timestampConfig, config.source_snapshot.sha256);
  assert.equal(timestamp.ok, false);
  assert.ok(timestamp.errors.some((item) => item.code === 'REMOTE_LEDGER_CAPTURE_TIME_INVALID'));

  const rawDrift = validateRemoteLedger(
    Buffer.concat([validContents, Buffer.from('\n')]),
    config,
    config.source_snapshot.sha256,
  );
  assert.equal(rawDrift.ok, false);
  assert.ok(rawDrift.errors.some((item) => item.code === 'REMOTE_LEDGER_RAW_SHA256_MISMATCH'));
});

test('provenance rejects raw drift, route drift, cross-source disagreement, and mutation claims', () => {
  const dump = sampleDump();
  const config = configFor(dump, [], 1);
  const ledgerContents = ledgerFor(config, [{ version: '20250101000000', name: 'one' }]);
  const ledger = validateRemoteLedger(ledgerContents, config, config.source_snapshot.sha256);
  const validProvenance = provenanceFor(config, ledgerContents);
  assert.equal(
    validateRemoteLedgerProvenance(validProvenance, config, config.source_snapshot.sha256, ledger).ok,
    true,
  );

  const rawDrift = validateRemoteLedgerProvenance(
    Buffer.concat([validProvenance, Buffer.from('\n')]),
    config,
    config.source_snapshot.sha256,
    ledger,
  );
  assert.equal(rawDrift.ok, false);
  assert.ok(rawDrift.errors.some((item) => item.code === 'REMOTE_LEDGER_PROVENANCE_RAW_SHA256_MISMATCH'));

  const semanticCases = [
    {
      code: 'REMOTE_LEDGER_PROVENANCE_SOURCE_ROUTE_MISMATCH',
      mutate: (document) => { document.sources[0].read_only = false; },
    },
    {
      code: 'REMOTE_LEDGER_PROVENANCE_SOURCE_ROUTE_MISMATCH',
      mutate: (document) => { document.sources[1].response_sha256 = 'f'.repeat(64); },
    },
    {
      code: 'REMOTE_LEDGER_PROVENANCE_CROSS_SOURCE_MISMATCH',
      mutate: (document) => { document.cross_source.canonical_rows_identical = false; },
    },
    {
      code: 'REMOTE_LEDGER_PROVENANCE_MUTATION_REPORTED',
      mutate: (document) => { document.production_mutation_performed = true; },
    },
  ];
  for (const { code, mutate } of semanticCases) {
    const changed = JSON.parse(validProvenance.toString('utf8'));
    mutate(changed);
    const contents = Buffer.from(JSON.stringify(changed));
    const changedConfig = structuredClone(config);
    changedConfig.remote_ledger_provenance.expected_raw_sha256 = sha256(contents);
    const result = validateRemoteLedgerProvenance(
      contents,
      changedConfig,
      config.source_snapshot.sha256,
      ledger,
    );
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((item) => item.code === code));
  }
});

test('candidate classifies every local file, includes only the pinned forward migration, and requires the ledger', () => withTempDirectory((root) => {
  const migrations = join(root, 'migrations');
  mkdirSync(migrations);
  writeFileSync(join(migrations, '20250101000000_legacy.sql'), 'SELECT 1;\n');
  const forwardName = '20260712010000_forward_hardening.sql';
  const forwardContents = 'SELECT 2;\n';
  writeFileSync(join(migrations, forwardName), forwardContents);
  const dump = sampleDump();
  const config = configFor(dump, [{ filename: forwardName, sha256: sha256(forwardContents) }]);
  const common = {
    config,
    schemaDump: Buffer.from(dump),
    migrationsDir: migrations,
    collisionBaseline: { allowedLegacyCollisions: {} },
  };

  const blocked = buildRecoveryCandidate(common);
  assert.equal(blocked.candidate, null);
  assert.ok(blocked.report.errors.some((item) => item.code === 'REMOTE_LEDGER_REQUIRED'));

  const ledgerContents = ledgerFor(config, [{ version: '20250101000000', name: 'legacy' }]);
  const ready = buildRecoveryCandidate({
    ...common,
    remoteLedgerContents: ledgerContents,
    remoteLedgerProvenanceContents: provenanceFor(config, ledgerContents),
  });
  assert.equal(ready.report.ready_to_emit, true);
  assert.equal(ready.report.write_performed, false);
  assert.equal(ready.candidate.lock.lineage.local_files.length, 2);
  assert.deepEqual(
    ready.candidate.lock.candidate_chain.migration_files.map((item) => item.filename),
    [config.baseline.filename, forwardName],
  );
  assert.deepEqual(ready.candidate.lock.remote_ledger_provenance, {
    filename: config.remote_ledger_provenance.filename,
    raw_sha256: config.remote_ledger_provenance.expected_raw_sha256,
    evidence_class: 'read_only_remote_migration_ledger',
    sources: [...config.remote_ledger_provenance.expected_sources]
      .sort((left, right) => left.interface.localeCompare(right.interface)),
    cross_source: {
      canonical_rows_identical: true,
      canonical_rows_sha256: config.remote_ledger.expected_canonical_rows_sha256,
    },
    production_mutation_performed: false,
  });
  const tamperedLock = structuredClone(ready.candidate.lock);
  const declaredContentSha256 = tamperedLock.content_sha256;
  tamperedLock.remote_ledger_provenance.sources[0].response_sha256 = 'f'.repeat(64);
  delete tamperedLock.content_sha256;
  assert.notEqual(sha256(canonicalJson(tamperedLock)), declaredContentSha256);
}));

test('unapproved post-snapshot migrations and changed forward hashes fail closed', () => withTempDirectory((root) => {
  const migrations = join(root, 'migrations');
  mkdirSync(migrations);
  writeFileSync(join(migrations, '20260712010000_unapproved.sql'), 'SELECT 1;\n');
  const dump = sampleDump();
  const config = configFor(dump, [{
    filename: '20260712020000_expected.sql',
    sha256: sha256('expected\n'),
  }]);
  writeFileSync(join(migrations, '20260712020000_expected.sql'), 'changed\n');
  const ledgerContents = ledgerFor(config, [{ version: '20250101000000', name: 'legacy' }]);
  const result = buildRecoveryCandidate({
    config,
    schemaDump: Buffer.from(dump),
    remoteLedgerContents: ledgerContents,
    remoteLedgerProvenanceContents: provenanceFor(config, ledgerContents),
    migrationsDir: migrations,
    collisionBaseline: { allowedLegacyCollisions: {} },
  });
  assert.equal(result.candidate, null);
  assert.ok(result.report.errors.some((item) => item.code === 'UNAPPROVED_POST_SNAPSHOT_MIGRATION'));
  assert.ok(result.report.errors.some((item) => item.code === 'FORWARD_MIGRATION_HASH_MISMATCH'));
}));

test('emission requires an explicit new path and verifies every emitted migration hash', () => withTempDirectory((root) => {
  const migrations = join(root, 'migrations');
  mkdirSync(migrations);
  writeFileSync(join(migrations, '20250101000000_legacy.sql'), 'SELECT 1;\n');
  const forwardName = '20260712010000_forward_hardening.sql';
  const forwardContents = 'SELECT 2;\n';
  writeFileSync(join(migrations, forwardName), forwardContents);
  const dump = sampleDump();
  const config = configFor(dump, [{ filename: forwardName, sha256: sha256(forwardContents) }]);
  const ledgerContents = ledgerFor(config, [{ version: '20250101000000', name: 'legacy' }]);
  const { candidate } = buildRecoveryCandidate({
    config,
    schemaDump: Buffer.from(dump),
    remoteLedgerContents: ledgerContents,
    remoteLedgerProvenanceContents: provenanceFor(config, ledgerContents),
    migrationsDir: migrations,
    collisionBaseline: { allowedLegacyCollisions: {} },
  });
  assert.throws(() => emitRecoveryCandidate(candidate), /explicit output/);
  const output = join(root, 'candidate');
  const emission = emitRecoveryCandidate(candidate, output);
  assert.equal(emission.migration_count, 2);
  assert.equal(existsSync(join(output, 'lineage-lock.json')), true);
  assert.throws(() => emitRecoveryCandidate(candidate, output), /overwrite/);
  candidate.forwardContents[0].contents = Buffer.from('tampered before emission\n');
  const rejectedOutput = join(root, 'rejected-candidate');
  assert.throws(() => emitRecoveryCandidate(candidate, rejectedOutput), /hash verification/);
  assert.equal(existsSync(rejectedOutput), false);
}));

test('CLI with --output still writes nothing when the remote ledger is absent', () => withTempDirectory((root) => {
  const migrations = join(root, 'migrations');
  mkdirSync(migrations);
  const forwardName = '20260712010000_forward_hardening.sql';
  const forwardContents = 'SELECT 2;\n';
  writeFileSync(join(migrations, forwardName), forwardContents);
  const dump = sampleDump();
  const config = configFor(dump, [{ filename: forwardName, sha256: sha256(forwardContents) }]);
  config.remote_ledger.expected_project_ref = 'abcdefghijklmnopqrst';
  config.remote_ledger.expected_empty_names = 0;
  config.remote_ledger.expected_canonical_rows_sha256 = '0'.repeat(64);
  const dumpPath = join(root, 'snapshot.sql');
  const configPath = join(root, 'config.json');
  const collisionPath = join(root, 'collisions.json');
  const output = join(root, 'must-not-exist');
  writeFileSync(dumpPath, dump);
  writeFileSync(configPath, JSON.stringify(config));
  writeFileSync(collisionPath, JSON.stringify({ allowedLegacyCollisions: {} }));

  const result = spawnSync(process.execPath, [
    resolve(repoRoot, 'scripts/build-database-recovery-candidate.mjs'),
    '--schema-dump', dumpPath,
    '--config', configPath,
    '--migrations-dir', migrations,
    '--collision-baseline', collisionPath,
    '--output', output,
  ], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.equal(existsSync(output), false);
  const report = JSON.parse(result.stdout);
  assert.equal(report.write_performed, false);
  assert.ok(report.errors.some((item) => item.code === 'REMOTE_LEDGER_REQUIRED'));
}));

test('recovery child environment strips every remote credential', () => {
  const sanitized = sanitizedRecoveryEnv({
    PATH: '/bin',
    DATABASE_URL: 'postgres://production.example/db',
    SUPABASE_ACCESS_TOKEN: 'secret',
    SUPABASE_SERVICE_ROLE_KEY: 'secret',
  });
  assert.equal(sanitized.PATH, '/bin');
  assert.equal(sanitized.DATABASE_URL, undefined);
  assert.equal(sanitized.SUPABASE_ACCESS_TOKEN, undefined);
  assert.equal(sanitized.SUPABASE_SERVICE_ROLE_KEY, undefined);
});
