#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  readFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readDatabaseCertificationConfig,
  reserveLocalPort,
} from './lib/fresh-database-certification.mjs';
import {
  readRecoveryConfig,
  sha256,
} from './lib/database-recovery-candidate.mjs';
import {
  assertBaselineRestoreMatchesLockedSource,
  assertCertificateOutputPath,
  assertContractsDidNotMutateSchema,
  assertDockerInfoResult,
  assertLocalDockerContextResults,
  assertRecoveredFinalSchemasMatch,
  assertRecoveredRepositoryConfigurationUnchanged,
  buildRecoveredCertificationCommands,
  buildRecoveredDatabaseCertificate,
  buildRecoveredLocalQueryCommand,
  captureRecoveredRepositoryConfiguration,
  createRecoveredSupabaseProject,
  exactMigrationLedgerAssertion,
  installVerifiedForwardMigrations,
  parseRecoveredCertificationArgs,
  postgresMajorAssertion,
  readCurrentSqlContracts,
  readRecoveredCommittedTypes,
  recoveredCertificationEnv,
  verifyTemporaryEvidenceTree,
  verifyRecoveryCandidate,
  verifyCurrentRepositoryMigrationInventory,
  withRecoveredTemporaryRoot,
  writeCertificateExclusive,
} from './lib/recovered-database-certification.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const commandTimeoutMs = 20 * 60 * 1000;

function execute(
  command,
  args,
  {
    allowFailure = false,
    capture = false,
    childEnv,
    timeoutMs = commandTimeoutMs,
  } = {},
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

function assertDockerReady(childEnv) {
  const contextResult = execute('docker', ['context', 'show'], {
    allowFailure: true,
    capture: true,
    childEnv,
    timeoutMs: 30 * 1000,
  });
  const endpointResult = execute('docker', [
    'context',
    'inspect',
    '--format',
    '{{(index .Endpoints "docker").Host}}',
  ], {
    allowFailure: true,
    capture: true,
    childEnv,
    timeoutMs: 30 * 1000,
  });
  const locality = assertLocalDockerContextResults(contextResult, endpointResult);
  const version = assertDockerInfoResult(execute('docker', ['info', '--format', '{{.ServerVersion}}'], {
    allowFailure: true,
    capture: true,
    childEnv,
    timeoutMs: 30 * 1000,
  }));
  return { ...locality, version };
}

function resolveSupabaseInvocation(certification, childEnv) {
  const installed = execute('supabase', ['--version'], {
    allowFailure: true,
    capture: true,
    childEnv,
    timeoutMs: 30 * 1000,
  });
  if (!installed.error && installed.status === 0) {
    if (installed.stdout.trim() !== certification.supabaseCliVersion) {
      throw new Error(
        `Installed Supabase CLI version ${installed.stdout.trim()} does not match pinned ${certification.supabaseCliVersion}. `
        + 'Remove it from PATH or install the exact pinned version.',
      );
    }
    return { command: 'supabase', prefix: [] };
  }

  const npxCandidates = [
    process.env.npm_execpath?.replace(/npm-cli\.js$/, 'npx-cli.js'),
    resolve(dirname(process.execPath), 'node_modules/npm/bin/npx-cli.js'),
  ].filter(Boolean);
  const npxCli = npxCandidates.find((candidate) => existsSync(candidate));
  if (!npxCli) {
    throw new Error(
      `Supabase CLI ${certification.supabaseCliVersion} is required, but no exact CLI or pinned npx launcher is available.`,
    );
  }
  return {
    command: process.execPath,
    prefix: [npxCli, '--yes', `supabase@${certification.supabaseCliVersion}`],
  };
}

function assertPinnedCli(invocation, certification, childEnv) {
  const result = execute(invocation.command, [...invocation.prefix, '--version'], {
    capture: true,
    childEnv,
    timeoutMs: 5 * 60 * 1000,
  });
  const actual = result.stdout.trim();
  if (actual !== certification.supabaseCliVersion) {
    throw new Error(
      `Supabase CLI version mismatch: expected ${certification.supabaseCliVersion}, got ${actual || '<empty>'}.`,
    );
  }
}

function assertRepositoryEvidenceUnchanged({
  certification,
  contracts,
  committedTypes,
  candidate,
  repositoryConfiguration,
}) {
  verifyCurrentRepositoryMigrationInventory({ repoRoot, candidate });
  const configurationEvidence = assertRecoveredRepositoryConfigurationUnchanged(repoRoot, repositoryConfiguration);
  const currentContracts = readCurrentSqlContracts(repoRoot);
  const expectedContracts = contracts.map(({ filename, bytes, sha256: digest }) => ({ filename, bytes, sha256: digest }));
  const actualContracts = currentContracts.map(({ filename, bytes, sha256: digest }) => ({ filename, bytes, sha256: digest }));
  if (JSON.stringify(actualContracts) !== JSON.stringify(expectedContracts)) {
    throw new Error('supabase/tests changed while recovered database certification was running; no certificate was created.');
  }
  const currentTypes = readRecoveredCommittedTypes(repoRoot, certification.committedTypesPath);
  if (currentTypes.sha256 !== sha256(committedTypes)) {
    throw new Error('Committed Supabase types changed while recovered database certification was running; no certificate was created.');
  }
  return configurationEvidence;
}

async function main() {
  const options = parseRecoveredCertificationArgs(process.argv.slice(2));
  const childEnv = recoveredCertificationEnv();
  const repositoryConfiguration = captureRecoveredRepositoryConfiguration(repoRoot);
  const certification = readDatabaseCertificationConfig(repoRoot);
  const recoveryConfig = readRecoveryConfig(resolve(repoRoot, 'certification/database-recovery-candidate.json'));
  assertRecoveredRepositoryConfigurationUnchanged(repoRoot, repositoryConfiguration);
  if (certification.postgresMajorVersion !== recoveryConfig.source_snapshot.postgres_major_version) {
    throw new Error('Fresh-certification and recovery manifests disagree on the pinned Postgres major version.');
  }

  const candidate = verifyRecoveryCandidate({
    candidateDir: options.candidateDir,
    expectedLineageContentSha256: options.expectedLineageContentSha256,
    expectedLineageFileSha256: options.expectedLineageFileSha256,
    recoveryConfig,
  });
  const contracts = readCurrentSqlContracts(repoRoot);
  const repositoryMigrations = verifyCurrentRepositoryMigrationInventory({ repoRoot, candidate });
  const committedTypes = readRecoveredCommittedTypes(repoRoot, certification.committedTypesPath).contents.toString('utf8');
  const certificateOut = options.certificateOut
    ? assertCertificateOutputPath(options.certificateOut, candidate.root)
    : null;
  console.log(
    `Verified recovery candidate ${candidate.lock.content_sha256}: ${candidate.migrations.length} exact candidate migrations, ${repositoryMigrations.count} locked repository migrations, ${contracts.length} current SQL contracts.`,
  );

  const dockerEvidence = assertDockerReady(childEnv);
  const invocation = resolveSupabaseInvocation(certification, childEnv);
  assertPinnedCli(invocation, certification, childEnv);
  const runSupabase = (args, runOptions = {}) => execute(
    invocation.command,
    [...invocation.prefix, ...args],
    { ...runOptions, childEnv },
  );

  const databasePort = await reserveLocalPort();
  const evidence = await withRecoveredTemporaryRoot(async (temporaryRoot) => {
    let primaryError = null;
    let replayEvidence = null;
    let baselineCommands = null;
    let startAttempted = false;
    try {
      const project = createRecoveredSupabaseProject({
        sourceConfig: repositoryConfiguration.files.supabase_config.contents.toString('utf8'),
        temporaryRoot,
        databasePort,
        candidate,
        contracts,
        postgresMajorVersion: certification.postgresMajorVersion,
      });
      const dumpPaths = {
        baseline: join(temporaryRoot, 'baseline-restored.sql'),
        firstBefore: join(temporaryRoot, 'full-replay-first-before-contracts.sql'),
        firstAfter: join(temporaryRoot, 'full-replay-first-after-contracts.sql'),
        secondBefore: join(temporaryRoot, 'full-replay-second-before-contracts.sql'),
        secondAfter: join(temporaryRoot, 'full-replay-second-after-contracts.sql'),
      };
      const commandsForDump = (dumpPath) => buildRecoveredCertificationCommands({
        workdir: project.workdir,
        schema: certification.schema,
        dumpPath,
      });
      baselineCommands = commandsForDump(dumpPaths.baseline);
      const firstBeforeCommands = commandsForDump(dumpPaths.firstBefore);
      const firstAfterCommands = commandsForDump(dumpPaths.firstAfter);
      const secondBeforeCommands = commandsForDump(dumpPaths.secondBefore);
      const secondAfterCommands = commandsForDump(dumpPaths.secondAfter);
      const postgresCommand = buildRecoveredLocalQueryCommand({
        workdir: project.workdir,
        sql: postgresMajorAssertion(certification.postgresMajorVersion),
      });
      const baselineLedgerCommand = buildRecoveredLocalQueryCommand({
        workdir: project.workdir,
        sql: exactMigrationLedgerAssertion(candidate.migrations.slice(0, 1)),
      });
      const fullLedgerCommand = buildRecoveredLocalQueryCommand({
        workdir: project.workdir,
        sql: exactMigrationLedgerAssertion(candidate.migrations),
      });
      const contractCommands = contracts.map((contract) => buildRecoveredLocalQueryCommand({
        workdir: project.workdir,
        file: join(project.testsRoot, contract.filename),
      }));
      const temporaryTreeChecks = [];
      const verifyTree = (phase, includeForwardMigrations) => {
        temporaryTreeChecks.push(verifyTemporaryEvidenceTree({
          project,
          candidate,
          contracts,
          includeForwardMigrations,
          phase,
        }));
      };

      verifyTree('baseline_before_replay', false);
      console.log(
        `Starting disposable local Supabase ${certification.supabaseCliVersion} / PostgreSQL ${certification.postgresMajorVersion} project ${project.projectId} on 127.0.0.1:${databasePort} (Docker ${dockerEvidence.version}, ${dockerEvidence.transport} context ${dockerEvidence.context}).`,
      );
      startAttempted = true;
      runSupabase(baselineCommands.start);

      console.log('Baseline proof: restoring only the hash-locked production snapshot into a clean local database.');
      runSupabase(baselineCommands.reset);
      runSupabase(postgresCommand);
      runSupabase(baselineLedgerCommand);
      runSupabase(baselineCommands.dump);
      const baselineDump = readFileSync(dumpPaths.baseline, 'utf8');
      assertBaselineRestoreMatchesLockedSource(candidate.migrations[0].contents.toString('utf8'), baselineDump);
      verifyTree('baseline_after_replay', false);

      installVerifiedForwardMigrations(project, candidate);
      verifyTree('full_before_replay_1', true);
      console.log(`Full replay 1/2: applying all ${candidate.migrations.length} hash-locked migrations from zero.`);
      runSupabase(firstBeforeCommands.reset);
      runSupabase(postgresCommand);
      runSupabase(fullLedgerCommand);
      runSupabase(firstBeforeCommands.dump);
      const firstBeforeContractsDump = readFileSync(dumpPaths.firstBefore, 'utf8');
      verifyTree('full_before_contracts_1', true);
      for (const command of contractCommands) runSupabase(command);
      verifyTree('full_after_contracts_1', true);
      runSupabase(firstAfterCommands.dump);
      const firstDump = readFileSync(dumpPaths.firstAfter, 'utf8');
      assertContractsDidNotMutateSchema(firstBeforeContractsDump, firstDump);
      runSupabase(firstAfterCommands.lint);
      const firstGeneratedTypes = runSupabase(firstAfterCommands.types, { capture: true }).stdout;
      verifyTree('full_after_replay_1', true);

      verifyTree('full_before_replay_2', true);
      console.log('Full replay 2/2: repeating ledger, contract, lint, types, and schema evidence from zero.');
      runSupabase(secondBeforeCommands.reset);
      runSupabase(postgresCommand);
      runSupabase(fullLedgerCommand);
      runSupabase(secondBeforeCommands.dump);
      const secondBeforeContractsDump = readFileSync(dumpPaths.secondBefore, 'utf8');
      verifyTree('full_before_contracts_2', true);
      for (const command of contractCommands) runSupabase(command);
      verifyTree('full_after_contracts_2', true);
      runSupabase(secondAfterCommands.dump);
      const secondDump = readFileSync(dumpPaths.secondAfter, 'utf8');
      assertContractsDidNotMutateSchema(secondBeforeContractsDump, secondDump);
      runSupabase(secondAfterCommands.lint);
      const secondGeneratedTypes = runSupabase(secondAfterCommands.types, { capture: true }).stdout;
      assertRecoveredFinalSchemasMatch(firstDump, secondDump);
      verifyTree('full_after_replay_2', true);

      replayEvidence = {
        baselineDump,
        firstBeforeContractsDump,
        firstDump,
        secondBeforeContractsDump,
        secondDump,
        firstGeneratedTypes,
        secondGeneratedTypes,
        temporaryTreeChecks,
      };
    } catch (error) {
      primaryError = error;
    } finally {
      if (startAttempted && baselineCommands) {
        const stopped = runSupabase(baselineCommands.stop, {
          allowFailure: true,
          capture: true,
          timeoutMs: 2 * 60 * 1000,
        });
        if (stopped.error || stopped.status !== 0) {
          const detail = stopped.error?.message || stopped.stderr?.trim() || `exit ${stopped.status}`;
          if (!primaryError) primaryError = new Error(`Could not remove the disposable recovered-certification database: ${detail}`);
          else console.error(`Cleanup warning: ${detail}`);
        }
      }
    }
    if (primaryError) throw primaryError;
    return replayEvidence;
  });

  const candidateAfterReplay = verifyRecoveryCandidate({
    candidateDir: candidate.root,
    expectedLineageContentSha256: options.expectedLineageContentSha256,
    expectedLineageFileSha256: options.expectedLineageFileSha256,
    recoveryConfig,
  });
  if (candidateAfterReplay.fingerprint !== candidate.fingerprint) {
    throw new Error('Recovery candidate changed while certification was running; no certificate was created.');
  }
  const repositoryConfigurationEvidence = assertRepositoryEvidenceUnchanged({
    certification,
    contracts,
    committedTypes,
    candidate,
    repositoryConfiguration,
  });

  const certificate = buildRecoveredDatabaseCertificate({
    candidate,
    databaseCertificationConfig: certification,
    recoveryConfig,
    repositoryConfigurationEvidence,
    dockerEvidence,
    temporaryTreeChecks: evidence.temporaryTreeChecks,
    contracts,
    committedTypes,
    ...evidence,
  });
  if (certificateOut) {
    writeCertificateExclusive(certificateOut, certificate, candidate.root);
    console.log(`Recovered database certificate written to ${certificateOut}.`);
  } else {
    console.log(JSON.stringify(certificate, null, 2));
  }
  console.log(
    `Recovered database certification passed locally: schema SHA-256 ${certificate.full_chain_replays.normalized_final_schema_sha256}. No production or staging launch was authorized.`,
  );
}

main().catch((error) => {
  console.error(`Recovered database certification failed: ${error.message}`);
  process.exit(1);
});
