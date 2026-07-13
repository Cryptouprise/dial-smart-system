#!/usr/bin/env node
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
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  assertDeterministicSchemaDumps,
  assertGeneratedTypesMatch,
  buildCertificationCommands,
  buildDatabaseContractCommand,
  buildMigrationLedgerCommand,
  createIsolatedSupabaseProject,
  readDatabaseCertificationConfig,
  reserveLocalPort,
  sanitizedCertificationEnv,
} from './lib/fresh-database-certification.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const certification = readDatabaseCertificationConfig(repoRoot);
const childEnv = sanitizedCertificationEnv();
const commandTimeoutMs = 20 * 60 * 1000;
const artifactRoot = process.env.DATABASE_CERTIFICATION_ARTIFACT_DIR
  ? resolve(process.env.DATABASE_CERTIFICATION_ARTIFACT_DIR)
  : null;

function persistDiagnosticArtifact(name, contents) {
  if (!artifactRoot) return;
  mkdirSync(artifactRoot, { recursive: true });
  writeFileSync(join(artifactRoot, name), contents, 'utf8');
}

function execute(
  command,
  args,
  { capture = false, allowFailure = false, timeoutMs = commandTimeoutMs } = {},
) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: childEnv,
    maxBuffer: 128 * 1024 * 1024,
    shell: false,
    stdio: capture ? 'pipe' : 'inherit',
    timeout: timeoutMs,
  });

  if (!allowFailure && (result.error || result.status !== 0)) {
    const detail = result.error?.message || result.stderr?.trim() || `exit ${result.status}`;
    throw new Error(`${command} ${args.join(' ')} failed: ${detail}`);
  }
  return result;
}

function resolveSupabaseInvocation() {
  if (process.env.SUPABASE_BIN) {
    return { command: process.env.SUPABASE_BIN, prefix: [] };
  }

  const installed = execute('supabase', ['--version'], { capture: true, allowFailure: true });
  if (!installed.error && installed.status === 0) {
    return { command: 'supabase', prefix: [] };
  }

  const npxCliCandidates = [
    process.env.npm_execpath?.replace(/npm-cli\.js$/, 'npx-cli.js'),
    resolve(dirname(process.execPath), 'node_modules/npm/bin/npx-cli.js'),
  ].filter(Boolean);
  const npxCli = npxCliCandidates.find((candidate) => {
    try {
      readFileSync(candidate);
      return true;
    } catch {
      return false;
    }
  });
  if (!npxCli) {
    throw new Error(
      'Supabase CLI is not installed and the pinned npx launcher could not be located. ' +
      'Install the pinned CLI or set SUPABASE_BIN to an executable path.',
    );
  }
  return {
    command: process.execPath,
    prefix: [npxCli, '--yes', `supabase@${certification.supabaseCliVersion}`],
  };
}

const invocation = resolveSupabaseInvocation();

function runSupabase(args, options) {
  return execute(invocation.command, [...invocation.prefix, ...args], options);
}

function assertPinnedCliVersion() {
  const result = runSupabase(['--version'], { capture: true });
  const actual = result.stdout.trim();
  if (actual !== certification.supabaseCliVersion) {
    throw new Error(
      `Supabase CLI version mismatch: expected ${certification.supabaseCliVersion}, got ${actual}.`,
    );
  }
}

function assertDockerReady() {
  const result = execute('docker', ['info', '--format', '{{.ServerVersion}}'], {
    capture: true,
    timeoutMs: 30 * 1000,
  });
  if (!result.stdout.trim()) throw new Error('Docker returned no server version.');
}

function migrationFiles() {
  const migrationDir = resolve(repoRoot, 'supabase/migrations');
  return readdirSync(migrationDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

function databaseContractFiles() {
  const testDir = resolve(repoRoot, 'supabase/tests');
  if (!existsSync(testDir)) return [];
  return readdirSync(testDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

async function main() {
  execute(process.execPath, [resolve(repoRoot, 'scripts/check-migration-versions.mjs')]);
  assertPinnedCliVersion();
  assertDockerReady();

  const sourceConfig = readFileSync(resolve(repoRoot, 'supabase/config.toml'), 'utf8');
  const configuredMajor = Number(sourceConfig.match(/^major_version\s*=\s*(\d+)$/m)?.[1]);
  if (configuredMajor !== certification.postgresMajorVersion) {
    throw new Error(
      `Postgres major mismatch: manifest=${certification.postgresMajorVersion}, config=${configuredMajor}.`,
    );
  }

  const files = migrationFiles();
  const contractFiles = databaseContractFiles();
  const databasePort = await reserveLocalPort();
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'dial-smart-db-cert-'));
  const { projectId, workdir } = createIsolatedSupabaseProject({
    repoRoot,
    temporaryRoot,
    databasePort,
  });
  const firstDumpPath = join(temporaryRoot, 'schema-first.sql');
  const secondDumpPath = join(temporaryRoot, 'schema-second.sql');
  const firstCommands = buildCertificationCommands({
    workdir,
    schema: certification.schema,
    dumpPath: firstDumpPath,
  });
  const secondCommands = buildCertificationCommands({
    workdir,
    schema: certification.schema,
    dumpPath: secondDumpPath,
  });
  const ledgerCommand = buildMigrationLedgerCommand({
    workdir,
    expectedCount: files.length,
  });
  const contractCommands = contractFiles.map((name) => buildDatabaseContractCommand({
    workdir,
    testPath: join(workdir, 'supabase', 'tests', name),
  }));
  const committedTypes = readFileSync(
    resolve(repoRoot, certification.committedTypesPath),
    'utf8',
  );

  let primaryError;
  try {
    console.log(
      `Starting isolated Supabase project ${projectId} on local database port ${databasePort}.`,
    );
    runSupabase(firstCommands.start);

    console.log(`Replay 1/2: rebuilding ${files.length} migrations from zero.`);
    runSupabase(firstCommands.reset);
    runSupabase(ledgerCommand);
    for (const command of contractCommands) runSupabase(command);
    runSupabase(firstCommands.lint);
    const firstTypes = runSupabase(firstCommands.types, { capture: true }).stdout;
    persistDiagnosticArtifact('generated-types-first.ts', firstTypes);
    assertGeneratedTypesMatch(firstTypes, committedTypes);
    runSupabase(firstCommands.dump);
    persistDiagnosticArtifact('schema-first.sql', readFileSync(firstDumpPath, 'utf8'));

    console.log(`Replay 2/2: proving the migration result is deterministic.`);
    runSupabase(secondCommands.reset);
    runSupabase(ledgerCommand);
    for (const command of contractCommands) runSupabase(command);
    const secondTypes = runSupabase(secondCommands.types, { capture: true }).stdout;
    persistDiagnosticArtifact('generated-types-second.ts', secondTypes);
    assertGeneratedTypesMatch(secondTypes, committedTypes);
    assertGeneratedTypesMatch(firstTypes, secondTypes);
    runSupabase(secondCommands.dump);
    persistDiagnosticArtifact('schema-second.sql', readFileSync(secondDumpPath, 'utf8'));

    const fingerprint = assertDeterministicSchemaDumps(
      readFileSync(firstDumpPath, 'utf8'),
      readFileSync(secondDumpPath, 'utf8'),
    );
    console.log(
      `Fresh database certification passed: ${files.length} migrations, ${contractFiles.length} SQL contracts, schema SHA-256 ${fingerprint}.`,
    );
  } catch (error) {
    primaryError = error;
  } finally {
    const stopped = runSupabase(firstCommands.stop, {
      allowFailure: true,
      capture: true,
      timeoutMs: 2 * 60 * 1000,
    });
    if (stopped.error || stopped.status !== 0) {
      const detail = stopped.error?.message || stopped.stderr?.trim() || `exit ${stopped.status}`;
      if (!primaryError) primaryError = new Error(`Could not remove certification database: ${detail}`);
      else console.error(`Cleanup warning: ${detail}`);
    }
    rmSync(temporaryRoot, { recursive: true, force: true });
  }

  if (primaryError) throw primaryError;
}

main().catch((error) => {
  console.error(`Fresh database certification failed: ${error.message}`);
  process.exit(1);
});
