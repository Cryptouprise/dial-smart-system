import { createHash, randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';

const REMOTE_TARGET_FLAGS = new Set([
  '--db-url',
  '--linked',
  '--password',
  '--project-id',
]);

export const REMOTE_CREDENTIAL_ENV_KEYS = [
  'DATABASE_URL',
  'PGDATABASE',
  'PGHOST',
  'PGPASSWORD',
  'PGPORT',
  'PGUSER',
  'POSTGRES_URL',
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_ANON_KEY',
  'SUPABASE_DB_PASSWORD',
  'SUPABASE_PROJECT_ID',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_URL',
];

export function assertLocalOnlySupabaseArgs(args) {
  for (const arg of args) {
    const flag = arg.split('=', 1)[0];
    if (REMOTE_TARGET_FLAGS.has(flag)) {
      throw new Error(`Remote Supabase target flag is forbidden during database certification: ${flag}`);
    }
  }
}

export function sanitizedCertificationEnv(source = process.env) {
  const sanitized = { ...source };
  for (const key of REMOTE_CREDENTIAL_ENV_KEYS) delete sanitized[key];
  return sanitized;
}

function replaceTomlKey(config, section, key, value) {
  const escapedSection = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sectionHeader = new RegExp(`^\\[${escapedSection}\\]\\s*$`, 'm');
  const headerMatch = sectionHeader.exec(config);
  if (!headerMatch) throw new Error(`Supabase config is missing [${section}].`);

  const sectionStart = headerMatch.index;
  const afterHeader = headerMatch.index + headerMatch[0].length;
  const nextHeaderOffset = config.slice(afterHeader).search(/^\[[^\]]+\]\s*$/m);
  const sectionEnd = nextHeaderOffset === -1 ? config.length : afterHeader + nextHeaderOffset;
  const sectionValue = config.slice(sectionStart, sectionEnd);

  const keyPattern = new RegExp(`^${key}\\s*=.*$`, 'm');
  if (!keyPattern.test(sectionValue)) {
    throw new Error(`Supabase config [${section}] is missing ${key}.`);
  }

  const updatedSection = sectionValue.replace(keyPattern, `${key} = ${value}`);
  return config.slice(0, sectionStart) + updatedSection + config.slice(sectionEnd);
}

export function isolateSupabaseConfig(config, { projectId, databasePort }) {
  if (!/^project_id\s*=.*$/m.test(config)) {
    throw new Error('Supabase config is missing project_id.');
  }

  let isolated = config.replace(/^project_id\s*=.*$/m, `project_id = "${projectId}"`);
  isolated = replaceTomlKey(isolated, 'db', 'port', String(databasePort));
  return isolated;
}

export function readDatabaseCertificationConfig(repoRoot) {
  const path = resolve(repoRoot, 'certification/database-certification.json');
  const config = JSON.parse(readFileSync(path, 'utf8'));

  if (!/^\d+\.\d+\.\d+$/.test(config.supabaseCliVersion)) {
    throw new Error('database-certification.json must pin an exact Supabase CLI version.');
  }
  if (!Number.isInteger(config.postgresMajorVersion)) {
    throw new Error('database-certification.json must declare an integer Postgres major version.');
  }
  if (!config.schema || !config.committedTypesPath) {
    throw new Error('database-certification.json must declare schema and committedTypesPath.');
  }

  return config;
}

export async function reserveLocalPort() {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not reserve a local TCP port.'));
        return;
      }
      const { port } = address;
      server.close((error) => error ? reject(error) : resolvePort(port));
    });
  });
}

export function createIsolatedSupabaseProject({ repoRoot, temporaryRoot, databasePort, migrationSourceDir }) {
  const projectId = `dial-smart-db-cert-${randomUUID().slice(0, 12)}`;
  const targetSupabase = join(temporaryRoot, 'supabase');
  mkdirSync(targetSupabase, { recursive: true });

  const sourceConfigPath = resolve(repoRoot, 'supabase/config.toml');
  const sourceConfig = readFileSync(sourceConfigPath, 'utf8');
  const isolatedConfig = isolateSupabaseConfig(sourceConfig, { projectId, databasePort });
  writeFileSync(join(targetSupabase, 'config.toml'), isolatedConfig);
  cpSync(migrationSourceDir || resolve(repoRoot, 'supabase/migrations'), join(targetSupabase, 'migrations'), {
    recursive: true,
  });
  const sourceTests = resolve(repoRoot, 'supabase/tests');
  if (existsSync(sourceTests)) {
    cpSync(sourceTests, join(targetSupabase, 'tests'), { recursive: true });
  }

  return { projectId, workdir: temporaryRoot };
}

export function appliedMigrationCountAssertion(expectedCount) {
  if (!Number.isInteger(expectedCount) || expectedCount < 1) {
    throw new Error('Expected migration count must be a positive integer.');
  }

  return `DO $certification$\nDECLARE\n  actual_count integer;\nBEGIN\n  SELECT count(*) INTO actual_count\n  FROM supabase_migrations.schema_migrations;\n\n  IF actual_count <> ${expectedCount} THEN\n    RAISE EXCEPTION 'migration ledger count mismatch: expected ${expectedCount}, got %', actual_count;\n  END IF;\nEND\n$certification$;`;
}

export function buildCertificationCommands({ workdir, schema, dumpPath }) {
  const global = ['--workdir', workdir];
  const commands = {
    start: [...global, 'db', 'start'],
    reset: [...global, 'db', 'reset', '--local', '--no-seed'],
    lint: [
      ...global,
      'db',
      'lint',
      '--local',
      '--schema',
      schema,
      '--level',
      'error',
      '--fail-on',
      'error',
    ],
    types: [...global, 'gen', 'types', '--local', '--schema', schema],
    dump: [
      ...global,
      'db',
      'dump',
      '--local',
      '--schema',
      schema,
      '--file',
      dumpPath,
    ],
    stop: [...global, 'stop', '--no-backup'],
  };

  for (const args of Object.values(commands)) assertLocalOnlySupabaseArgs(args);
  return commands;
}

export function buildMigrationLedgerCommand({ workdir, expectedCount }) {
  const args = [
    '--workdir',
    workdir,
    'db',
    'query',
    '--local',
    appliedMigrationCountAssertion(expectedCount),
  ];
  assertLocalOnlySupabaseArgs(args);
  return args;
}

export function buildDatabaseContractCommand({ workdir, testPath }) {
  const args = [
    '--workdir',
    workdir,
    'db',
    'query',
    '--local',
    '--file',
    testPath,
  ];
  assertLocalOnlySupabaseArgs(args);
  return args;
}

export function normalizeGeneratedTypes(value) {
  return value.replaceAll('\r\n', '\n').trimEnd();
}

export function assertGeneratedTypesMatch(generated, committed) {
  if (normalizeGeneratedTypes(generated) !== normalizeGeneratedTypes(committed)) {
    throw new Error(
      'Committed Supabase TypeScript types do not match the schema rebuilt from migrations.',
    );
  }
}

export function normalizeSchemaDump(value) {
  return value
    .replaceAll('\r\n', '\n')
    .split('\n')
    .filter((line) => !/^\\(un)?restrict\s/.test(line))
    .join('\n')
    .trimEnd();
}

export function schemaDumpFingerprint(value) {
  return createHash('sha256').update(normalizeSchemaDump(value)).digest('hex');
}

export function assertDeterministicSchemaDumps(first, second) {
  const firstNormalized = normalizeSchemaDump(first);
  const secondNormalized = normalizeSchemaDump(second);
  if (firstNormalized !== secondNormalized) {
    throw new Error('Two clean migration replays produced different public-schema dumps.');
  }
  return schemaDumpFingerprint(firstNormalized);
}
