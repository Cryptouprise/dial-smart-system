#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertNoDuplicateJsonObjectKeys,
  buildRecoveryCandidate,
  emitRecoveryCandidate,
  readRecoveryConfig,
  sanitizedRecoveryEnv,
} from './lib/database-recovery-candidate.mjs';
import { assertLocalOnlySupabaseArgs } from './lib/fresh-database-certification.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function usage() {
  return [
    'Build an offline database recovery candidate without database or network access.',
    '',
    'Usage:',
    '  node scripts/build-database-recovery-candidate.mjs [options]',
    '',
    'Options:',
    '  --schema-dump <path>          Pinned public-schema-only dump.',
    '  --remote-ledger <path>        Required read-only migration-ledger JSON export.',
    '  --remote-ledger-provenance <path>',
    '                                Exact hash-pinned two-route provenance JSON.',
    '  --config <path>               Recovery pin/allowlist config.',
    '  --migrations-dir <path>       Local migration directory.',
    '  --collision-baseline <path>   Reviewed legacy collision baseline.',
    '  --output <new-directory>      Emit only to this explicit, nonexistent path.',
    '  --help                        Show this help.',
    '',
    'Without --output, the command is a dry run and writes nothing.',
    'Without --remote-ledger, it fails closed after reporting the available local evidence.',
  ].join('\n');
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help') {
      options.help = true;
      continue;
    }
    const keyByFlag = {
      '--schema-dump': 'schemaDump',
      '--remote-ledger': 'remoteLedger',
      '--remote-ledger-provenance': 'remoteLedgerProvenance',
      '--config': 'config',
      '--migrations-dir': 'migrationsDir',
      '--collision-baseline': 'collisionBaseline',
      '--output': 'output',
    };
    const key = keyByFlag[arg];
    if (!key) throw new Error(`Unknown argument: ${arg}`);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${arg} requires a path.`);
    options[key] = value;
    index += 1;
  }
  return options;
}

function failureReport(code, message) {
  return {
    format_version: 1,
    status: 'blocked',
    ready_to_emit: false,
    write_performed: false,
    remote_access_performed: false,
    database_execution_performed: false,
    errors: [{ code, message }],
  };
}

function readRequired(path, label) {
  if (!existsSync(path)) throw new Error(`${label} does not exist: ${path}`);
  return readFileSync(path);
}

function main() {
  try {
    assertLocalOnlySupabaseArgs(process.argv.slice(2));
    sanitizedRecoveryEnv();
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      return;
    }

    const configPath = resolve(options.config ?? resolve(repoRoot, 'certification/database-recovery-candidate.json'));
    const config = readRecoveryConfig(configPath);
    const schemaDumpPath = resolve(
      options.schemaDump
        ?? resolve(repoRoot, '..', '..', 'outputs', config.source_snapshot.filename),
    );
    const migrationsDir = resolve(options.migrationsDir ?? resolve(repoRoot, 'supabase/migrations'));
    const collisionBaselinePath = resolve(
      options.collisionBaseline
        ?? resolve(repoRoot, 'certification/migration-version-baseline.json'),
    );
    const schemaDump = readRequired(schemaDumpPath, 'Schema dump');
    const remoteLedgerContents = options.remoteLedger
      ? readRequired(resolve(options.remoteLedger), 'Remote ledger')
      : null;
    const defaultProvenancePath = resolve(
      repoRoot,
      '..',
      '..',
      'outputs',
      config.remote_ledger_provenance.filename,
    );
    const remoteLedgerProvenanceContents = options.remoteLedgerProvenance
      ? readRequired(resolve(options.remoteLedgerProvenance), 'Remote ledger provenance')
      : existsSync(defaultProvenancePath)
        ? readFileSync(defaultProvenancePath)
        : null;
    const collisionBaselineContents = readRequired(collisionBaselinePath, 'Collision baseline').toString('utf8');
    assertNoDuplicateJsonObjectKeys(collisionBaselineContents);
    const collisionBaseline = JSON.parse(collisionBaselineContents);

    const { report, candidate } = buildRecoveryCandidate({
      config,
      schemaDump,
      remoteLedgerContents,
      remoteLedgerProvenanceContents,
      migrationsDir,
      collisionBaseline,
    });

    if (report.ready_to_emit && options.output) {
      const emission = emitRecoveryCandidate(candidate, resolve(options.output));
      report.status = 'candidate_emitted';
      report.write_performed = true;
      report.emission = emission;
    }
    console.log(JSON.stringify(report, null, 2));
    if (!report.ready_to_emit) process.exitCode = 1;
  } catch (caught) {
    console.log(JSON.stringify(failureReport('RECOVERY_COMPILER_FAILED', caught.message), null, 2));
    process.exitCode = 1;
  }
}

main();
