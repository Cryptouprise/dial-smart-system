import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  REMOTE_CREDENTIAL_ENV_KEYS,
  appliedMigrationCountAssertion,
  assertDeterministicSchemaDumps,
  assertGeneratedTypesMatch,
  assertLocalOnlySupabaseArgs,
  buildCertificationCommands,
  buildDatabaseContractCommand,
  buildMigrationLedgerCommand,
  isolateSupabaseConfig,
  sanitizedCertificationEnv,
} from './lib/fresh-database-certification.mjs';

test('certification commands cannot target a linked or URL-selected database', () => {
  for (const args of [
    ['db', 'reset', '--linked'],
    ['db', 'query', '--db-url=postgres://production.example/db'],
    ['gen', 'types', '--project-id', 'production-project'],
  ]) {
    assert.throws(() => assertLocalOnlySupabaseArgs(args), /forbidden/);
  }

  const commands = buildCertificationCommands({
    workdir: '/tmp/isolated-certification-project',
    schema: 'public',
    dumpPath: '/tmp/isolated-certification-project/schema.sql',
  });
  for (const args of Object.values(commands)) {
    assert.doesNotThrow(() => assertLocalOnlySupabaseArgs(args));
    assert.deepEqual(args.slice(0, 2), ['--workdir', '/tmp/isolated-certification-project']);
  }
});

test('remote Supabase credentials are stripped from certification children', () => {
  const source = {
    DATABASE_URL: 'postgres://production.example/db',
    PATH: '/bin',
    SUPABASE_ACCESS_TOKEN: 'secret-token',
    SUPABASE_DB_PASSWORD: 'secret-password',
    SUPABASE_PROJECT_ID: 'production-project',
  };
  const sanitized = sanitizedCertificationEnv(source);
  assert.equal(sanitized.PATH, '/bin');
  for (const key of REMOTE_CREDENTIAL_ENV_KEYS) assert.equal(sanitized[key], undefined);
});

test('the cloned config has an isolated identity and database port', () => {
  const source = readFileSync(resolve('supabase/config.toml'), 'utf8');
  const isolated = isolateSupabaseConfig(source, {
    projectId: 'dial-smart-db-cert-test',
    databasePort: 65432,
  });
  assert.match(isolated, /^project_id = "dial-smart-db-cert-test"$/m);
  assert.match(isolated, /\[db\][\s\S]*?^port = 65432$/m);
  assert.doesNotMatch(isolated, /^project_id = "emonjusymdripmkvtttc"$/m);
});

test('migration ledger assertion requires every migration file to be recorded', () => {
  const migrationCount = readdirSync(resolve('supabase/migrations'))
    .filter((name) => name.endsWith('.sql'))
    .length;
  const sql = appliedMigrationCountAssertion(migrationCount);
  assert.match(sql, new RegExp(`actual_count <> ${migrationCount}`));
  const args = buildMigrationLedgerCommand({
    workdir: '/tmp/cert',
    expectedCount: migrationCount,
  });
  assert.ok(args.includes('--local'));
  assert.doesNotThrow(() => assertLocalOnlySupabaseArgs(args));
});

test('database contract tests stream only to the isolated local database container', () => {
  const args = buildDatabaseContractCommand({
    projectId: 'dial-smart-db-cert-test',
  });
  assert.deepEqual(args, [
    'exec',
    '-i',
    'supabase_db_dial-smart-db-cert-test',
    'psql',
    '-X',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'postgres',
    '-d',
    'postgres',
  ]);
  assert.throws(
    () => buildDatabaseContractCommand({ projectId: 'production-project' }),
    /isolated certification project id/,
  );
});

test('type and schema comparisons normalize transport noise but reject drift', () => {
  assert.doesNotThrow(() => assertGeneratedTypesMatch('type A = 1;\r\n', 'type A = 1;\n'));
  assert.throws(() => assertGeneratedTypesMatch('type A = 1;', 'type A = 2;'), /do not match/);

  const first = '\\restrict random-one\nCREATE TABLE public.a();\n\\unrestrict random-one\n';
  const second = '\\restrict random-two\r\nCREATE TABLE public.a();\r\n\\unrestrict random-two\r\n';
  assert.match(assertDeterministicSchemaDumps(first, second), /^[a-f0-9]{64}$/);
  assert.throws(
    () => assertDeterministicSchemaDumps(first, 'CREATE TABLE public.b();'),
    /different public-schema dumps/,
  );
});
