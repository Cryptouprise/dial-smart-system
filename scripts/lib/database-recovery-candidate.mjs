import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import {
  REMOTE_CREDENTIAL_ENV_KEYS,
  sanitizedCertificationEnv,
} from './fresh-database-certification.mjs';

const HEX_SHA256 = /^[a-f0-9]{64}$/;
const MIGRATION_VERSION = /^([0-9]+)[_-]/;
const CANONICAL_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const PROVENANCE_ROUTE_CONTRACTS = {
  management_api_read_only_sql: {
    provider: 'supabase',
    interface: 'management_api_read_only_sql',
    method: 'POST',
    endpoint_path: '/v1/projects/{project_ref}/database/query/read-only',
    read_only: true,
  },
  management_api_migration_history: {
    provider: 'supabase',
    interface: 'management_api_migration_history',
    method: 'GET',
    endpoint_path: '/v1/projects/{project_ref}/database/migrations',
    read_only: true,
  },
};

const PROHIBITED_TOP_LEVEL_SQL = [
  ['TOP_LEVEL_COPY', /^\s*COPY\b/im],
  ['TOP_LEVEL_INSERT', /^\s*INSERT\s+INTO\b/im],
  ['TOP_LEVEL_UPDATE', /^\s*UPDATE\b/im],
  ['TOP_LEVEL_DELETE', /^\s*DELETE\s+FROM\b/im],
  ['TOP_LEVEL_MERGE', /^\s*MERGE\s+INTO\b/im],
  ['TOP_LEVEL_TRUNCATE', /^\s*TRUNCATE\b/im],
  ['ROLE_MUTATION', /^\s*(?:CREATE|ALTER|DROP)\s+(?:ROLE|USER)\b/im],
  ['DATABASE_MUTATION', /^\s*(?:CREATE|ALTER|DROP)\s+(?:DATABASE|TABLESPACE)\b/im],
  ['SYSTEM_MUTATION', /^\s*ALTER\s+SYSTEM\b/im],
  ['SCHEMA_DROP', /^\s*DROP\s+SCHEMA\b/im],
  ['EXTENSION_INSTALL', /^\s*CREATE\s+EXTENSION\b/im],
  ['PSQL_CONNECT', /^\s*\\connect\b/im],
  ['PSQL_COPY', /^\s*\\copy\b/im],
  ['PSQL_SHELL', /^\s*\\!/im],
  [
    'TOP_LEVEL_EXTERNAL_OR_FILE_CALL',
    /^\s*SELECT\s+(?!pg_catalog\.set_config\b).*\b(?:dblink|lo_import|lo_export|pg_read_file|pg_write_file|pg_read_binary_file|pg_ls_dir|http_get|http_post|net\.http)\b/im,
  ],
];

const SECRET_PATTERNS = [
  ['PRIVATE_KEY', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i],
  ['JWT', /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{8,}\b/],
  ['OPENAI_OR_STRIPE_SECRET', /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b|\bsk-[A-Za-z0-9_-]{20,}\b/],
  ['GITHUB_TOKEN', /\bgh[pousr]_[A-Za-z0-9]{20,}\b/],
  ['SLACK_TOKEN', /\bxox[baprs]-[A-Za-z0-9-]{16,}\b/],
  ['TWILIO_SECRET', /\bSK[a-fA-F0-9]{32}\b/],
  ['CREDENTIAL_URL', /\b(?:postgres(?:ql)?|mysql|redis):\/\/[^\s:'"/]+:[^\s@'"/]+@/i],
  [
    'ASSIGNED_SECRET_LITERAL',
    /\b(?:api[_-]?key|password|secret|service[_-]?role[_-]?key|token)\b\s*(?::=|=>|=|:)\s*['"][^'"\r\n]{12,}['"]/i,
  ],
];

function asBuffer(value) {
  return Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
}

export function sha256(value) {
  return createHash('sha256').update(asBuffer(value)).digest('hex');
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function prettyCanonicalJson(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function error(code, message) {
  return { code, message };
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
}

function collectExactObjectKeyError(value, expectedKeys, label, code, errors) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(error(code, `${label} must be a JSON object.`));
    return false;
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    errors.push(error(
      code,
      `${label} keys must be exactly ${expected.join(', ')}; got ${actual.join(', ') || 'none'}.`,
    ));
    return false;
  }
  return true;
}

function isCanonicalUtcTimestamp(value) {
  if (typeof value !== 'string' || !CANONICAL_UTC_TIMESTAMP.test(value)) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

class DuplicateJsonKeyError extends SyntaxError {
  constructor(key, path) {
    super(`Duplicate JSON object key ${JSON.stringify(key)} at ${path}.`);
    this.name = 'DuplicateJsonKeyError';
  }
}

// JSON.parse silently keeps the last occurrence of a duplicate object key.
// This small validation-only parser walks the complete JSON grammar first so
// evidence with parser-dependent meaning is rejected before JSON.parse runs.
export function assertNoDuplicateJsonObjectKeys(value) {
  const text = String(value);
  let index = 0;

  const syntax = (message) => {
    throw new SyntaxError(`${message} at JSON offset ${index}.`);
  };
  const skipWhitespace = () => {
    while (/[\t\n\r ]/.test(text[index] ?? '')) index += 1;
  };
  const parseString = () => {
    if (text[index] !== '"') syntax('Expected a JSON string');
    index += 1;
    let decoded = '';
    while (index < text.length) {
      const character = text[index++];
      if (character === '"') return decoded;
      if (character === '\\') {
        if (index >= text.length) syntax('Unterminated JSON escape');
        const escape = text[index++];
        const simple = {
          '"': '"',
          '\\': '\\',
          '/': '/',
          b: '\b',
          f: '\f',
          n: '\n',
          r: '\r',
          t: '\t',
        };
        if (Object.hasOwn(simple, escape)) {
          decoded += simple[escape];
          continue;
        }
        if (escape !== 'u') syntax(`Invalid JSON escape \\${escape}`);
        const hex = text.slice(index, index + 4);
        if (!/^[a-fA-F0-9]{4}$/.test(hex)) syntax('Invalid JSON Unicode escape');
        decoded += String.fromCharCode(Number.parseInt(hex, 16));
        index += 4;
        continue;
      }
      if (character.charCodeAt(0) <= 0x1f) syntax('Unescaped JSON control character');
      decoded += character;
    }
    syntax('Unterminated JSON string');
  };
  const parseNumber = () => {
    const match = text.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!match) syntax('Invalid JSON number');
    index += match[0].length;
  };
  const parseLiteral = (literal) => {
    if (text.slice(index, index + literal.length) !== literal) syntax(`Expected ${literal}`);
    index += literal.length;
  };
  const parseValue = (path) => {
    skipWhitespace();
    const character = text[index];
    if (character === '{') return parseObject(path);
    if (character === '[') return parseArray(path);
    if (character === '"') return parseString();
    if (character === 't') return parseLiteral('true');
    if (character === 'f') return parseLiteral('false');
    if (character === 'n') return parseLiteral('null');
    if (character === '-' || /\d/.test(character ?? '')) return parseNumber();
    syntax('Expected a JSON value');
  };
  const parseObject = (path) => {
    index += 1;
    skipWhitespace();
    const keys = new Set();
    if (text[index] === '}') {
      index += 1;
      return;
    }
    while (index < text.length) {
      skipWhitespace();
      const key = parseString();
      if (keys.has(key)) throw new DuplicateJsonKeyError(key, path);
      keys.add(key);
      skipWhitespace();
      if (text[index] !== ':') syntax('Expected a colon after an object key');
      index += 1;
      parseValue(`${path}.${key}`);
      skipWhitespace();
      if (text[index] === '}') {
        index += 1;
        return;
      }
      if (text[index] !== ',') syntax('Expected a comma between object members');
      index += 1;
    }
    syntax('Unterminated JSON object');
  };
  const parseArray = (path) => {
    index += 1;
    skipWhitespace();
    if (text[index] === ']') {
      index += 1;
      return;
    }
    let item = 0;
    while (index < text.length) {
      parseValue(`${path}[${item}]`);
      item += 1;
      skipWhitespace();
      if (text[index] === ']') {
        index += 1;
        return;
      }
      if (text[index] !== ',') syntax('Expected a comma between array items');
      index += 1;
    }
    syntax('Unterminated JSON array');
  };

  skipWhitespace();
  parseValue('$');
  skipWhitespace();
  if (index !== text.length) syntax('Unexpected trailing JSON data');
}

export function readRecoveryConfig(path) {
  const contents = readFileSync(path, 'utf8');
  assertNoDuplicateJsonObjectKeys(contents);
  const config = JSON.parse(contents);
  assertPlainObject(config, 'Recovery config');
  assertPlainObject(config.source_snapshot, 'source_snapshot');
  assertPlainObject(config.remote_ledger, 'remote_ledger');
  assertPlainObject(config.remote_ledger_provenance, 'remote_ledger_provenance');
  assertPlainObject(config.baseline, 'baseline');

  if (config.format_version !== 1) throw new Error('Recovery config format_version must be 1.');
  if (!HEX_SHA256.test(config.source_snapshot.sha256)) {
    throw new Error('source_snapshot.sha256 must be a lowercase SHA-256 digest.');
  }
  if (!Number.isInteger(config.source_snapshot.bytes) || config.source_snapshot.bytes < 1) {
    throw new Error('source_snapshot.bytes must be a positive integer.');
  }
  if (!Number.isInteger(config.source_snapshot.postgres_major_version)) {
    throw new Error('source_snapshot.postgres_major_version must be an integer.');
  }
  for (const key of ['tables', 'functions', 'policies']) {
    if (!Number.isInteger(config.source_snapshot.inventory?.[key])) {
      throw new Error(`source_snapshot.inventory.${key} must be an integer.`);
    }
  }
  if (config.remote_ledger.format_version !== 1) {
    throw new Error('remote_ledger.format_version must be 1.');
  }
  if (!/^[a-z0-9][a-z0-9._-]{0,127}\.json$/i.test(config.remote_ledger.filename)) {
    throw new Error('remote_ledger.filename must be a safe JSON basename.');
  }
  if (!Number.isInteger(config.remote_ledger.expected_rows) || config.remote_ledger.expected_rows < 1) {
    throw new Error('remote_ledger.expected_rows must be a positive integer.');
  }
  if (!/^[a-z]{20}$/.test(config.remote_ledger.expected_project_ref)) {
    throw new Error('remote_ledger.expected_project_ref must be a 20-letter Supabase project ref.');
  }
  if (
    !Number.isInteger(config.remote_ledger.expected_empty_names)
    || config.remote_ledger.expected_empty_names < 0
    || config.remote_ledger.expected_empty_names > config.remote_ledger.expected_rows
  ) {
    throw new Error('remote_ledger.expected_empty_names must be an integer between zero and expected_rows.');
  }
  if (!HEX_SHA256.test(config.remote_ledger.expected_canonical_rows_sha256)) {
    throw new Error('remote_ledger.expected_canonical_rows_sha256 must be a lowercase SHA-256 digest.');
  }
  if (!HEX_SHA256.test(config.remote_ledger.expected_raw_sha256)) {
    throw new Error('remote_ledger.expected_raw_sha256 must be a lowercase SHA-256 digest.');
  }
  if (!isCanonicalUtcTimestamp(config.remote_ledger.expected_captured_at)) {
    throw new Error('remote_ledger.expected_captured_at must be an exact canonical UTC timestamp.');
  }
  if (config.remote_ledger_provenance.format_version !== 1) {
    throw new Error('remote_ledger_provenance.format_version must be 1.');
  }
  if (!/^[a-z0-9][a-z0-9._-]{0,127}\.json$/i.test(config.remote_ledger_provenance.filename)) {
    throw new Error('remote_ledger_provenance.filename must be a safe JSON basename.');
  }
  if (!HEX_SHA256.test(config.remote_ledger_provenance.expected_raw_sha256)) {
    throw new Error('remote_ledger_provenance.expected_raw_sha256 must be a lowercase SHA-256 digest.');
  }
  if (config.remote_ledger_provenance.expected_evidence_class !== 'read_only_remote_migration_ledger') {
    throw new Error('remote_ledger_provenance.expected_evidence_class is invalid.');
  }
  if (
    !Array.isArray(config.remote_ledger_provenance.expected_sources)
    || config.remote_ledger_provenance.expected_sources.length !== 2
  ) {
    throw new Error('remote_ledger_provenance.expected_sources must contain exactly two routes.');
  }
  const sourceInterfaces = new Set();
  for (const source of config.remote_ledger_provenance.expected_sources) {
    assertPlainObject(source, 'remote_ledger_provenance expected source');
    const routeContract = PROVENANCE_ROUTE_CONTRACTS[source.interface];
    if (
      !routeContract
      || source.provider !== routeContract.provider
      || source.method !== routeContract.method
      || source.endpoint_path !== routeContract.endpoint_path
      || source.read_only !== routeContract.read_only
      || !HEX_SHA256.test(source.response_sha256)
    ) {
      throw new Error('remote_ledger_provenance expected source is invalid.');
    }
    if (sourceInterfaces.has(source.interface)) {
      throw new Error(`Duplicate provenance source interface: ${source.interface}.`);
    }
    sourceInterfaces.add(source.interface);
  }
  if (!/^\d{14}$/.test(config.baseline.version)) {
    throw new Error('baseline.version must be a 14-digit UTC migration version.');
  }
  if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(config.baseline.filename)) {
    throw new Error('baseline.filename must be a canonical migration filename.');
  }
  if (!Array.isArray(config.forward_migrations) || config.forward_migrations.length < 1) {
    throw new Error('forward_migrations must be a non-empty array.');
  }

  const seen = new Set();
  let previous = '';
  for (const migration of config.forward_migrations) {
    if (!migration || typeof migration.filename !== 'string' || !HEX_SHA256.test(migration.sha256)) {
      throw new Error('Every forward migration must have filename and lowercase SHA-256 fields.');
    }
    const match = migration.filename.match(MIGRATION_VERSION);
    if (!match || match[1].length !== 14 || match[1] <= config.baseline.version) {
      throw new Error(`Forward migration must be after the baseline: ${migration.filename}`);
    }
    if (seen.has(migration.filename)) throw new Error(`Duplicate forward migration: ${migration.filename}`);
    if (previous && migration.filename <= previous) {
      throw new Error('forward_migrations must be in strict filename order.');
    }
    seen.add(migration.filename);
    previous = migration.filename;
  }
  return config;
}

// Replace comments, string literals, and dollar-quoted bodies with spaces while
// preserving newlines and quoted identifiers. Top-level SQL scanners can then
// ignore DML inside function bodies without treating it as dump row data.
export function maskSqlBodiesAndLiterals(sql) {
  const chars = [...sql];
  let index = 0;
  const blank = (position) => {
    if (chars[position] !== '\n' && chars[position] !== '\r') chars[position] = ' ';
  };

  while (index < chars.length) {
    if (chars[index] === '-' && chars[index + 1] === '-') {
      blank(index++);
      blank(index++);
      while (index < chars.length && chars[index] !== '\n') blank(index++);
      continue;
    }
    if (chars[index] === '/' && chars[index + 1] === '*') {
      let depth = 1;
      blank(index++);
      blank(index++);
      while (index < chars.length && depth > 0) {
        if (chars[index] === '/' && chars[index + 1] === '*') {
          depth += 1;
          blank(index++);
          blank(index++);
        } else if (chars[index] === '*' && chars[index + 1] === '/') {
          depth -= 1;
          blank(index++);
          blank(index++);
        } else {
          blank(index++);
        }
      }
      continue;
    }
    if (chars[index] === "'") {
      blank(index++);
      while (index < chars.length) {
        if (chars[index] === "'" && chars[index + 1] === "'") {
          blank(index++);
          blank(index++);
          continue;
        }
        if (chars[index] === "'") {
          blank(index++);
          break;
        }
        blank(index++);
      }
      continue;
    }
    if (chars[index] === '$') {
      const remainder = chars.slice(index).join('');
      const delimiter = remainder.match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
      if (delimiter) {
        for (let offset = 0; offset < delimiter.length; offset += 1) blank(index + offset);
        index += delimiter.length;
        while (index < chars.length) {
          if (chars.slice(index, index + delimiter.length).join('') === delimiter) {
            for (let offset = 0; offset < delimiter.length; offset += 1) blank(index + offset);
            index += delimiter.length;
            break;
          }
          blank(index++);
        }
        continue;
      }
    }
    index += 1;
  }
  return chars.join('');
}

function countMatches(value, pattern) {
  return [...value.matchAll(pattern)].length;
}

export function scanSchemaDump(contents, config) {
  const buffer = asBuffer(contents);
  const sql = buffer.toString('utf8').replaceAll('\r\n', '\n');
  const masked = maskSqlBodiesAndLiterals(sql);
  const errors = [];
  const actualSha256 = sha256(buffer);
  const databaseVersion = sql.match(/^-- Dumped from database version ([^\s]+)$/m)?.[1] ?? null;
  const pgDumpVersion = sql.match(/^-- Dumped by pg_dump version ([^\s]+)$/m)?.[1] ?? null;
  const inventory = {
    tables: countMatches(sql, /^CREATE TABLE /gm),
    functions: countMatches(sql, /^CREATE FUNCTION /gm),
    policies: countMatches(sql, /^CREATE POLICY /gm),
    triggers: countMatches(sql, /^CREATE TRIGGER /gm),
    views: countMatches(sql, /^CREATE VIEW /gm),
  };

  if (actualSha256 !== config.source_snapshot.sha256) {
    errors.push(error('SOURCE_SHA256_MISMATCH', `Expected ${config.source_snapshot.sha256}, got ${actualSha256}.`));
  }
  if (buffer.length !== config.source_snapshot.bytes) {
    errors.push(error('SOURCE_BYTE_COUNT_MISMATCH', `Expected ${config.source_snapshot.bytes} bytes, got ${buffer.length}.`));
  }
  if (databaseVersion !== config.source_snapshot.postgres_database_version) {
    errors.push(error('DATABASE_VERSION_MISMATCH', `Expected database version ${config.source_snapshot.postgres_database_version}, got ${databaseVersion ?? 'missing'}.`));
  }
  if (pgDumpVersion !== config.source_snapshot.pg_dump_version) {
    errors.push(error('PG_DUMP_VERSION_MISMATCH', `Expected pg_dump version ${config.source_snapshot.pg_dump_version}, got ${pgDumpVersion ?? 'missing'}.`));
  }
  const actualMajor = Number(databaseVersion?.split('.')[0]);
  if (actualMajor !== config.source_snapshot.postgres_major_version) {
    errors.push(error('POSTGRES_MAJOR_MISMATCH', `Expected PostgreSQL major ${config.source_snapshot.postgres_major_version}, got ${Number.isFinite(actualMajor) ? actualMajor : 'missing'}.`));
  }
  for (const key of ['tables', 'functions', 'policies']) {
    const expected = config.source_snapshot.inventory[key];
    if (inventory[key] !== expected) {
      errors.push(error('SOURCE_INVENTORY_MISMATCH', `${key}: expected ${expected}, got ${inventory[key]}.`));
    }
  }

  for (const [code, pattern] of PROHIBITED_TOP_LEVEL_SQL) {
    if (pattern.test(masked)) errors.push(error(code, `Schema dump contains prohibited top-level construct ${code}.`));
  }
  for (const [code, pattern] of SECRET_PATTERNS) {
    if (pattern.test(sql)) errors.push(error(`POSSIBLE_SECRET_${code}`, `Schema dump matched secret scanner ${code}.`));
  }

  const createdSchemas = [...masked.matchAll(/^\s*CREATE\s+SCHEMA\s+"([^"]+)"/gim)]
    .map((match) => match[1]);
  if (createdSchemas.length !== 1 || createdSchemas[0] !== 'public') {
    errors.push(error('SCHEMA_SCOPE_MISMATCH', `Expected exactly one created schema named public; got ${createdSchemas.join(', ') || 'none'}.`));
  }
  const createdObjectSchemas = new Set();
  const objectPattern = /^\s*CREATE\s+(?:UNLOGGED\s+)?(?:TABLE|FUNCTION|TYPE|VIEW|MATERIALIZED\s+VIEW|SEQUENCE)\s+"([^"]+)"\./gim;
  for (const match of masked.matchAll(objectPattern)) createdObjectSchemas.add(match[1]);
  const nonPublicSchemas = [...createdObjectSchemas].filter((schema) => schema !== 'public').sort();
  if (nonPublicSchemas.length > 0) {
    errors.push(error('NON_PUBLIC_OBJECT_CREATION', `Dump creates objects in non-public schemas: ${nonPublicSchemas.join(', ')}.`));
  }

  return {
    ok: errors.length === 0,
    errors,
    sha256: actualSha256,
    bytes: buffer.length,
    database_version: databaseVersion,
    pg_dump_version: pgDumpVersion,
    inventory,
    created_schemas: createdSchemas,
    no_top_level_row_data: !errors.some((item) => item.code.startsWith('TOP_LEVEL_')),
    no_possible_secrets: !errors.some((item) => item.code.startsWith('POSSIBLE_SECRET_')),
  };
}

export function transformSchemaDump(contents, sourceSha256) {
  let sql = asBuffer(contents).toString('utf8').replace(/\r\n?/g, '\n');
  const restrictGuards = [...sql.matchAll(/^\\(?:un)?restrict[^\n]*(?:\n|$)/gm)].length;
  sql = sql.replace(/^\\(?:un)?restrict[^\n]*(?:\n|$)/gm, '');
  const supabaseAdminDefaultAcl = [...sql.matchAll(/^ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin"[^\n]*(?:\n|$)/gm)].length;
  sql = sql.replace(/^ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin"[^\n]*(?:\n|$)/gm, '');
  const unavailableCronReferences = [...sql.matchAll(/(?:IF )?EXISTS \(SELECT 1 FROM cron\.job WHERE jobname = 'retell-provider-reconciler'(?: AND active)?\)/g)].length;
  sql = sql.replace(/IF EXISTS \(SELECT 1 FROM cron\.job WHERE jobname = 'retell-provider-reconciler'(?: AND active)?\) THEN/g, 'IF FALSE THEN');
  sql = sql.replace(/EXISTS \(SELECT 1 FROM cron\.job WHERE jobname = 'retell-provider-reconciler'(?: AND active)?\)/g, 'FALSE');

  const schemaCreatePattern = /^CREATE SCHEMA "public";$/gm;
  const schemaCreateCount = [...sql.matchAll(schemaCreatePattern)].length;
  if (schemaCreateCount !== 1) {
    throw new Error(`Expected exactly one CREATE SCHEMA public statement, got ${schemaCreateCount}.`);
  }
  sql = sql.replace(schemaCreatePattern, 'CREATE SCHEMA IF NOT EXISTS "public";');
  const prefix = [
    '-- DIAL SMART OFFLINE DATABASE RECOVERY BASELINE CANDIDATE',
    `-- Source schema SHA-256: ${sourceSha256}`,
    '-- This file is for a new disposable/staging lineage only.',
    '-- Never apply this baseline to the existing production database.',
    '',
  ].join('\n');
  const transformed = `${prefix}${sql.endsWith('\n') ? sql : `${sql}\n`}`;
  return {
    sql: transformed,
    sha256: sha256(transformed),
    rules: [
      { id: 'normalize_line_endings', replacements: asBuffer(contents).toString('utf8').includes('\r') ? 1 : 0 },
      { id: 'remove_pg_dump_restrict_guards', replacements: restrictGuards },
      { id: 'make_public_schema_create_idempotent', replacements: schemaCreateCount },
      { id: 'remove_unavailable_supabase_admin_default_privileges', replacements: supabaseAdminDefaultAcl },
      { id: 'replace_unavailable_cron_job_guards', replacements: unavailableCronReferences },
      { id: 'prepend_offline_safety_header', replacements: 1 },
    ],
  };
}

export function validateRemoteLedger(contents, config, sourceSha256) {
  const errors = [];
  const buffer = asBuffer(contents);
  const rawSha256 = sha256(buffer);
  if (rawSha256 !== config.remote_ledger.expected_raw_sha256) {
    errors.push(error(
      'REMOTE_LEDGER_RAW_SHA256_MISMATCH',
      `Expected exact ledger bytes ${config.remote_ledger.expected_raw_sha256}, got ${rawSha256}.`,
    ));
  }
  let document;
  try {
    assertNoDuplicateJsonObjectKeys(buffer.toString('utf8'));
    document = JSON.parse(buffer.toString('utf8'));
    assertPlainObject(document, 'Remote ledger');
  } catch (caught) {
    const code = caught instanceof DuplicateJsonKeyError
      ? 'REMOTE_LEDGER_DUPLICATE_JSON_KEY'
      : 'REMOTE_LEDGER_INVALID_JSON';
    return {
      ok: false,
      errors: [...errors, error(code, caught.message)],
      raw_sha256: rawSha256,
      rows: [],
    };
  }

  const allowedTopLevel = new Set([
    'format_version',
    'capture_mode',
    'source_project_ref',
    'captured_at',
    'schema_dump_sha256',
    'rows',
  ]);
  const unexpectedTopLevel = Object.keys(document).filter((key) => !allowedTopLevel.has(key));
  if (unexpectedTopLevel.length > 0) {
    errors.push(error('REMOTE_LEDGER_UNEXPECTED_FIELDS', `Unexpected top-level fields: ${unexpectedTopLevel.sort().join(', ')}.`));
  }
  if (document.format_version !== config.remote_ledger.format_version) {
    errors.push(error('REMOTE_LEDGER_FORMAT_MISMATCH', `Expected format_version ${config.remote_ledger.format_version}.`));
  }
  if (document.capture_mode !== 'read_only') {
    errors.push(error('REMOTE_LEDGER_NOT_READ_ONLY', 'capture_mode must be exactly read_only.'));
  }
  if (typeof document.source_project_ref !== 'string' || !/^[a-z0-9_-]{6,128}$/i.test(document.source_project_ref)) {
    errors.push(error('REMOTE_LEDGER_PROJECT_REF_INVALID', 'source_project_ref is missing or malformed.'));
  }
  if (
    typeof config.remote_ledger.expected_project_ref === 'string'
    && document.source_project_ref !== config.remote_ledger.expected_project_ref
  ) {
    errors.push(error('REMOTE_LEDGER_PROJECT_REF_MISMATCH', 'source_project_ref does not match the pinned production project.'));
  }
  if (!isCanonicalUtcTimestamp(document.captured_at)) {
    errors.push(error(
      'REMOTE_LEDGER_CAPTURE_TIME_INVALID',
      'captured_at must be an exact canonical UTC timestamp with millisecond precision.',
    ));
  } else if (document.captured_at !== config.remote_ledger.expected_captured_at) {
    errors.push(error(
      'REMOTE_LEDGER_CAPTURE_TIME_MISMATCH',
      `captured_at does not match the pinned capture ${config.remote_ledger.expected_captured_at}.`,
    ));
  }
  if (document.schema_dump_sha256 !== sourceSha256) {
    errors.push(error('REMOTE_LEDGER_SOURCE_BINDING_MISMATCH', 'schema_dump_sha256 does not bind the ledger to the pinned schema dump.'));
  }
  if (!Array.isArray(document.rows)) {
    errors.push(error('REMOTE_LEDGER_ROWS_INVALID', 'rows must be an array.'));
  }

  const rows = [];
  const seenVersions = new Set();
  if (Array.isArray(document.rows)) {
    for (const [index, row] of document.rows.entries()) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        errors.push(error('REMOTE_LEDGER_ROW_INVALID', `Row ${index} is not an object.`));
        continue;
      }
      const unexpected = Object.keys(row).filter((key) => !['version', 'name'].includes(key));
      if (unexpected.length > 0) {
        errors.push(error('REMOTE_LEDGER_ROW_UNEXPECTED_FIELDS', `Row ${index} contains unexpected fields: ${unexpected.sort().join(', ')}.`));
      }
      const versionIsString = typeof row.version === 'string';
      const version = versionIsString ? row.version : '';
      const hasName = Object.prototype.hasOwnProperty.call(row, 'name');
      const nameIsString = typeof row.name === 'string';
      const name = nameIsString ? row.name : '';
      if (!versionIsString || !/^\d{8,14}$/.test(version)) {
        errors.push(error('REMOTE_LEDGER_VERSION_INVALID', `Row ${index} has malformed version ${version || '<empty>'}.`));
      }
      if (
        !hasName
        || !nameIsString
        || name.length > 256
        || /[\r\n]/.test(name)
        || (name.length > 0 && name.trim().length === 0)
        || name !== name.trim()
      ) {
        errors.push(error(
          'REMOTE_LEDGER_NAME_INVALID',
          `Row ${index} must contain an exact string name; the empty string is permitted, but null, missing, or surrounding-only whitespace is not.`,
        ));
      }
      if (seenVersions.has(version)) {
        errors.push(error('REMOTE_LEDGER_DUPLICATE_VERSION', `Duplicate remote migration version ${version}.`));
      }
      seenVersions.add(version);
      rows.push({ version, name });
    }
  }
  rows.sort((left, right) => left.version.localeCompare(right.version) || left.name.localeCompare(right.name));
  if (rows.length !== config.remote_ledger.expected_rows) {
    errors.push(error('REMOTE_LEDGER_ROW_COUNT_MISMATCH', `Expected ${config.remote_ledger.expected_rows} rows, got ${rows.length}.`));
  }
  const emptyNameCount = rows.filter((row) => row.name === '').length;
  if (
    Number.isInteger(config.remote_ledger.expected_empty_names)
    && emptyNameCount !== config.remote_ledger.expected_empty_names
  ) {
    errors.push(error(
      'REMOTE_LEDGER_EMPTY_NAME_COUNT_MISMATCH',
      `Expected ${config.remote_ledger.expected_empty_names} exact empty-string names, got ${emptyNameCount}.`,
    ));
  }
  const canonicalRowsSha256 = sha256(canonicalJson(rows));
  if (
    typeof config.remote_ledger.expected_canonical_rows_sha256 === 'string'
    && canonicalRowsSha256 !== config.remote_ledger.expected_canonical_rows_sha256
  ) {
    errors.push(error(
      'REMOTE_LEDGER_CANONICAL_ROWS_MISMATCH',
      `Remote migration rows do not match the pinned canonical digest ${config.remote_ledger.expected_canonical_rows_sha256}.`,
    ));
  }

  return {
    ok: errors.length === 0,
    errors,
    raw_sha256: rawSha256,
    canonical_rows_sha256: canonicalRowsSha256,
    empty_name_count: emptyNameCount,
    captured_at: document.captured_at ?? null,
    source_project_ref_sha256: typeof document.source_project_ref === 'string'
      ? sha256(document.source_project_ref)
      : null,
    rows,
  };
}

export function validateRemoteLedgerProvenance(contents, config, sourceSha256, ledger) {
  const errors = [];
  const buffer = asBuffer(contents);
  const rawSha256 = sha256(buffer);
  if (rawSha256 !== config.remote_ledger_provenance.expected_raw_sha256) {
    errors.push(error(
      'REMOTE_LEDGER_PROVENANCE_RAW_SHA256_MISMATCH',
      `Expected exact provenance bytes ${config.remote_ledger_provenance.expected_raw_sha256}, got ${rawSha256}.`,
    ));
  }

  let document;
  try {
    assertNoDuplicateJsonObjectKeys(buffer.toString('utf8'));
    document = JSON.parse(buffer.toString('utf8'));
    assertPlainObject(document, 'Remote ledger provenance');
  } catch (caught) {
    const code = caught instanceof DuplicateJsonKeyError
      ? 'REMOTE_LEDGER_PROVENANCE_DUPLICATE_JSON_KEY'
      : 'REMOTE_LEDGER_PROVENANCE_INVALID_JSON';
    return {
      ok: false,
      errors: [...errors, error(code, caught.message)],
      raw_sha256: rawSha256,
      source_response_sha256s: {},
      evidence: null,
    };
  }

  collectExactObjectKeyError(document, [
    'format_version',
    'evidence_class',
    'source_project_ref',
    'captured_at',
    'schema_dump_sha256',
    'ledger',
    'sources',
    'cross_source',
    'snapshot_catalog_binding',
    'credential_handling',
    'production_mutation_performed',
  ], 'Remote ledger provenance', 'REMOTE_LEDGER_PROVENANCE_SHAPE_INVALID', errors);

  if (document.format_version !== config.remote_ledger_provenance.format_version) {
    errors.push(error('REMOTE_LEDGER_PROVENANCE_FORMAT_MISMATCH', 'Provenance format_version is not pinned.'));
  }
  if (document.evidence_class !== config.remote_ledger_provenance.expected_evidence_class) {
    errors.push(error('REMOTE_LEDGER_PROVENANCE_CLASS_MISMATCH', 'Provenance evidence_class is not pinned.'));
  }
  if (document.source_project_ref !== config.remote_ledger.expected_project_ref) {
    errors.push(error('REMOTE_LEDGER_PROVENANCE_PROJECT_MISMATCH', 'Provenance project does not match the pinned production project.'));
  }
  if (
    !isCanonicalUtcTimestamp(document.captured_at)
    || document.captured_at !== config.remote_ledger.expected_captured_at
    || document.captured_at !== ledger.captured_at
  ) {
    errors.push(error('REMOTE_LEDGER_PROVENANCE_CAPTURE_TIME_MISMATCH', 'Provenance capture time does not exactly bind the pinned ledger capture.'));
  }
  if (document.schema_dump_sha256 !== sourceSha256) {
    errors.push(error('REMOTE_LEDGER_PROVENANCE_SOURCE_MISMATCH', 'Provenance does not bind the pinned schema dump.'));
  }

  const ledgerBlockOk = collectExactObjectKeyError(document.ledger, [
    'filename',
    'raw_sha256',
    'row_count',
    'unique_versions',
    'empty_string_names',
    'nonempty_names',
    'null_names',
    'malformed_versions',
    'canonical_rows_sha256',
  ], 'Remote ledger provenance ledger', 'REMOTE_LEDGER_PROVENANCE_LEDGER_INVALID', errors);
  const metrics = {
    row_count: ledger.rows.length,
    unique_versions: new Set(ledger.rows.map((row) => row.version)).size,
    empty_string_names: ledger.rows.filter((row) => row.name === '').length,
    nonempty_names: ledger.rows.filter((row) => row.name !== '').length,
    null_names: 0,
    malformed_versions: 0,
    canonical_rows_sha256: ledger.canonical_rows_sha256,
  };
  if (ledgerBlockOk) {
    const expectedLedgerBlock = {
      filename: config.remote_ledger.filename,
      raw_sha256: ledger.raw_sha256,
      ...metrics,
    };
    if (canonicalJson(document.ledger) !== canonicalJson(expectedLedgerBlock)) {
      errors.push(error('REMOTE_LEDGER_PROVENANCE_LEDGER_MISMATCH', 'Provenance ledger summary does not exactly reproduce the validated ledger.'));
    }
  }

  const expectedSources = new Map(
    config.remote_ledger_provenance.expected_sources.map((source) => [source.interface, source]),
  );
  const observedInterfaces = new Set();
  const responseSha256s = {};
  if (!Array.isArray(document.sources) || document.sources.length !== expectedSources.size) {
    errors.push(error('REMOTE_LEDGER_PROVENANCE_SOURCES_INVALID', 'Provenance must contain exactly the two pinned source routes.'));
  } else {
    for (const [index, source] of document.sources.entries()) {
      const sourceOk = collectExactObjectKeyError(source, [
        'provider',
        'interface',
        'method',
        'endpoint_path',
        'read_only',
        'response_sha256',
        'row_count',
        'unique_versions',
        'empty_string_names',
        'nonempty_names',
        'null_names',
        'malformed_versions',
        'canonical_rows_sha256',
      ], `Remote ledger provenance source ${index}`, 'REMOTE_LEDGER_PROVENANCE_SOURCE_INVALID', errors);
      if (!sourceOk) continue;
      const expected = expectedSources.get(source.interface);
      if (!expected || observedInterfaces.has(source.interface)) {
        errors.push(error('REMOTE_LEDGER_PROVENANCE_SOURCE_ROUTE_MISMATCH', `Unexpected or duplicate provenance source ${source.interface}.`));
        continue;
      }
      observedInterfaces.add(source.interface);
      const expectedSource = { ...expected, ...metrics };
      if (canonicalJson(source) !== canonicalJson(expectedSource)) {
        errors.push(error('REMOTE_LEDGER_PROVENANCE_SOURCE_ROUTE_MISMATCH', `Provenance source ${source.interface} does not match its exact route, response, read-only, and ledger pins.`));
      }
      responseSha256s[source.interface] = source.response_sha256;
    }
    for (const interfaceName of expectedSources.keys()) {
      if (!observedInterfaces.has(interfaceName)) {
        errors.push(error('REMOTE_LEDGER_PROVENANCE_SOURCE_ROUTE_MISMATCH', `Pinned provenance source ${interfaceName} is missing.`));
      }
    }
  }

  const crossSourceOk = collectExactObjectKeyError(document.cross_source, [
    'canonical_rows_identical',
    'canonical_rows_sha256',
  ], 'Remote ledger provenance cross_source', 'REMOTE_LEDGER_PROVENANCE_CROSS_SOURCE_INVALID', errors);
  if (
    crossSourceOk
    && (
      document.cross_source.canonical_rows_identical !== true
      || document.cross_source.canonical_rows_sha256 !== ledger.canonical_rows_sha256
    )
  ) {
    errors.push(error('REMOTE_LEDGER_PROVENANCE_CROSS_SOURCE_MISMATCH', 'The two provenance routes do not attest to identical pinned rows.'));
  }

  const snapshotOk = collectExactObjectKeyError(document.snapshot_catalog_binding, [
    'observed_in_same_authenticated_read_only_session',
    'postgres_server_version',
    'public_tables',
    'public_functions',
    'public_policies',
  ], 'Remote ledger provenance snapshot_catalog_binding', 'REMOTE_LEDGER_PROVENANCE_SNAPSHOT_INVALID', errors);
  if (snapshotOk) {
    const expectedSnapshot = {
      observed_in_same_authenticated_read_only_session: true,
      postgres_server_version: config.source_snapshot.postgres_database_version,
      public_tables: config.source_snapshot.inventory.tables,
      public_functions: config.source_snapshot.inventory.functions,
      public_policies: config.source_snapshot.inventory.policies,
    };
    if (canonicalJson(document.snapshot_catalog_binding) !== canonicalJson(expectedSnapshot)) {
      errors.push(error('REMOTE_LEDGER_PROVENANCE_SNAPSHOT_MISMATCH', 'Provenance catalog evidence does not match the pinned snapshot inventory.'));
    }
  }

  const credentialOk = collectExactObjectKeyError(document.credential_handling, [
    'existing_cli_session_used_in_memory',
    'credential_written_to_artifact',
    'database_password_used',
    'connection_string_used',
    'project_link_changed',
  ], 'Remote ledger provenance credential_handling', 'REMOTE_LEDGER_PROVENANCE_CREDENTIAL_INVALID', errors);
  if (credentialOk) {
    const expectedCredentialHandling = {
      existing_cli_session_used_in_memory: true,
      credential_written_to_artifact: false,
      database_password_used: false,
      connection_string_used: false,
      project_link_changed: false,
    };
    if (canonicalJson(document.credential_handling) !== canonicalJson(expectedCredentialHandling)) {
      errors.push(error('REMOTE_LEDGER_PROVENANCE_CREDENTIAL_MISMATCH', 'Provenance credential handling is not the reviewed read-only posture.'));
    }
  }
  if (document.production_mutation_performed !== false) {
    errors.push(error('REMOTE_LEDGER_PROVENANCE_MUTATION_REPORTED', 'Provenance reports or omits a production mutation denial.'));
  }

  return {
    ok: errors.length === 0,
    errors,
    raw_sha256: rawSha256,
    captured_at: document.captured_at ?? null,
    source_response_sha256s: responseSha256s,
    evidence: {
      filename: config.remote_ledger_provenance.filename,
      raw_sha256: rawSha256,
      evidence_class: config.remote_ledger_provenance.expected_evidence_class,
      sources: [...config.remote_ledger_provenance.expected_sources]
        .sort((left, right) => left.interface.localeCompare(right.interface))
        .map((source) => ({ ...source })),
      cross_source: {
        canonical_rows_identical: true,
        canonical_rows_sha256: ledger.canonical_rows_sha256,
      },
      production_mutation_performed: false,
    },
  };
}

function validateCollisionGroups(collisions, collisionBaseline) {
  const errors = [];
  const allowed = collisionBaseline?.allowedLegacyCollisions ?? {};
  for (const [version, files] of Object.entries(collisions)) {
    const expected = [...(allowed[version] ?? [])].sort();
    if (canonicalJson(files) !== canonicalJson(expected)) {
      errors.push(error('UNAPPROVED_MIGRATION_COLLISION', `${version}: ${files.join(', ')}.`));
    }
  }
  for (const [version, files] of Object.entries(allowed)) {
    if (files.length > 1 && !collisions[version]) {
      errors.push(error('MISSING_EXPECTED_MIGRATION_COLLISION', `${version} collision no longer matches the reviewed baseline.`));
    }
  }
  return errors;
}

export function inventoryLocalMigrations({
  migrationsDir,
  config,
  remoteLedger = null,
  collisionBaseline,
}) {
  const errors = [];
  const forwardByName = new Map(config.forward_migrations.map((migration) => [migration.filename, migration]));
  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((filename) => {
      const match = filename.match(MIGRATION_VERSION);
      if (!match) {
        errors.push(error('LOCAL_MIGRATION_VERSION_INVALID', `Migration does not start with a numeric version: ${filename}.`));
      }
      const contents = readFileSync(join(migrationsDir, filename));
      return {
        filename,
        version: match?.[1] ?? null,
        sha256: sha256(contents),
        bytes: contents.length,
        contents,
      };
    });

  const localByName = new Map(files.map((file) => [file.filename, file]));
  const versions = new Map();
  for (const file of files) {
    if (!file.version) continue;
    const names = versions.get(file.version) ?? [];
    names.push(file.filename);
    versions.set(file.version, names);
  }
  const collisions = Object.fromEntries(
    [...versions.entries()]
      .filter(([, names]) => names.length > 1)
      .map(([version, names]) => [version, [...names].sort()]),
  );
  errors.push(...validateCollisionGroups(collisions, collisionBaseline));

  for (const approved of config.forward_migrations) {
    const file = localByName.get(approved.filename);
    if (!file) {
      errors.push(error('FORWARD_MIGRATION_MISSING', `Approved forward migration is missing: ${approved.filename}.`));
      continue;
    }
    if (file.sha256 !== approved.sha256) {
      errors.push(error('FORWARD_MIGRATION_HASH_MISMATCH', `${approved.filename}: expected ${approved.sha256}, got ${file.sha256}.`));
    }
  }
  for (const file of files) {
    if (file.version && file.version > config.baseline.version && !forwardByName.has(file.filename)) {
      errors.push(error('UNAPPROVED_POST_SNAPSHOT_MIGRATION', `Post-snapshot migration is not allowlisted: ${file.filename}.`));
    }
  }

  const remoteVersions = new Set(remoteLedger?.rows.map((row) => row.version) ?? []);
  if (remoteLedger) {
    for (const approved of config.forward_migrations) {
      const version = approved.filename.match(MIGRATION_VERSION)?.[1];
      if (version && remoteVersions.has(version)) {
        errors.push(error('FORWARD_MIGRATION_ALREADY_REMOTE', `Forward version ${version} is already present in the captured remote ledger.`));
      }
    }
    if (remoteVersions.has(config.baseline.version)) {
      errors.push(error('BASELINE_VERSION_ALREADY_REMOTE', `Baseline version ${config.baseline.version} is already present in the captured remote ledger.`));
    }
  }

  const local = files.map((file) => {
    let classification;
    let included = false;
    if (forwardByName.has(file.filename)) {
      classification = 'forward_hardening_included';
      included = true;
    } else if (!remoteLedger) {
      classification = 'unresolved_without_remote_ledger';
    } else if (file.version && collisions[file.version]) {
      classification = 'legacy_collision_excluded_snapshot_is_authoritative';
    } else if (file.version && remoteVersions.has(file.version)) {
      classification = 'legacy_version_match_excluded_snapshot_is_authoritative';
    } else {
      classification = 'legacy_local_only_excluded_from_recovered_chain';
    }
    return {
      filename: file.filename,
      version: file.version,
      sha256: file.sha256,
      bytes: file.bytes,
      classification,
      included_in_candidate: included,
    };
  });

  const localVersionSet = new Set(files.map((file) => file.version).filter(Boolean));
  const remote = (remoteLedger?.rows ?? []).map((row) => ({
    version: row.version,
    name: row.name,
    classification: localVersionSet.has(row.version)
      ? 'remote_version_with_local_match_replaced_by_snapshot_baseline'
      : 'remote_only_version_replaced_by_snapshot_baseline',
  }));

  return {
    ok: errors.length === 0,
    errors,
    files,
    local,
    remote,
    collisions,
    counts: {
      local_files: files.length,
      local_unique_versions: versions.size,
      collision_groups: Object.keys(collisions).length,
      remote_rows: remote.length,
      forward_included: local.filter((item) => item.included_in_candidate).length,
      legacy_excluded: local.filter((item) => !item.included_in_candidate).length,
    },
  };
}

function sortErrors(errors) {
  return [...errors].sort((left, right) => left.code.localeCompare(right.code) || left.message.localeCompare(right.message));
}

export function sanitizedRecoveryEnv(source = process.env) {
  const sanitized = sanitizedCertificationEnv(source);
  for (const key of REMOTE_CREDENTIAL_ENV_KEYS) {
    if (Object.hasOwn(sanitized, key)) throw new Error(`Remote credential survived sanitization: ${key}.`);
  }
  return sanitized;
}

export function buildRecoveryCandidate({
  config,
  schemaDump,
  remoteLedgerContents = null,
  remoteLedgerProvenanceContents = null,
  migrationsDir,
  collisionBaseline,
}) {
  // Build and verify the same credential-stripped environment that any later
  // disposable replay process must receive. This foundation launches no child.
  sanitizedRecoveryEnv();

  const schema = scanSchemaDump(schemaDump, config);
  let transform = null;
  try {
    transform = transformSchemaDump(schemaDump, schema.sha256);
  } catch (caught) {
    schema.errors.push(error('BASELINE_TRANSFORM_FAILED', caught.message));
    schema.ok = false;
  }

  const ledger = remoteLedgerContents === null
    ? {
      ok: false,
      errors: [error('REMOTE_LEDGER_REQUIRED', 'A separate read-only remote migration-ledger JSON export is required.')],
      rows: [],
      raw_sha256: null,
      canonical_rows_sha256: null,
      captured_at: null,
      source_project_ref_sha256: null,
    }
    : validateRemoteLedger(remoteLedgerContents, config, schema.sha256);

  const provenance = remoteLedgerProvenanceContents === null
    ? {
      ok: false,
      errors: [error(
        'REMOTE_LEDGER_PROVENANCE_REQUIRED',
        'The exact hash-pinned read-only remote-ledger provenance JSON artifact is required.',
      )],
      raw_sha256: null,
      captured_at: null,
      source_response_sha256s: {},
      evidence: null,
    }
    : remoteLedgerContents === null
      ? {
        ok: false,
        errors: [],
        raw_sha256: sha256(remoteLedgerProvenanceContents),
        captured_at: null,
        source_response_sha256s: {},
        evidence: null,
      }
      : validateRemoteLedgerProvenance(
        remoteLedgerProvenanceContents,
        config,
        schema.sha256,
        ledger,
      );

  const lineage = inventoryLocalMigrations({
    migrationsDir,
    config,
    remoteLedger: ledger.ok ? ledger : null,
    collisionBaseline,
  });
  const errors = sortErrors([
    ...schema.errors,
    ...ledger.errors,
    ...provenance.errors,
    ...lineage.errors,
  ]);

  const report = {
    format_version: 1,
    status: errors.length === 0 ? 'ready_dry_run' : 'blocked',
    ready_to_emit: errors.length === 0,
    write_performed: false,
    remote_access_performed: false,
    database_execution_performed: false,
    source_snapshot: {
      filename: config.source_snapshot.filename,
      sha256: schema.sha256,
      bytes: schema.bytes,
      database_version: schema.database_version,
      pg_dump_version: schema.pg_dump_version,
      inventory: schema.inventory,
      no_top_level_row_data: schema.no_top_level_row_data,
      no_possible_secrets: schema.no_possible_secrets,
    },
    remote_ledger: {
      supplied: remoteLedgerContents !== null,
      valid: ledger.ok,
      expected_rows: config.remote_ledger.expected_rows,
      actual_rows: ledger.rows.length,
      expected_empty_names: config.remote_ledger.expected_empty_names,
      actual_empty_names: ledger.empty_name_count ?? null,
      expected_canonical_rows_sha256: config.remote_ledger.expected_canonical_rows_sha256,
      raw_sha256: ledger.raw_sha256,
      canonical_rows_sha256: ledger.canonical_rows_sha256,
    },
    remote_ledger_provenance: {
      supplied: remoteLedgerProvenanceContents !== null,
      valid: provenance.ok,
      filename: config.remote_ledger_provenance.filename,
      expected_raw_sha256: config.remote_ledger_provenance.expected_raw_sha256,
      raw_sha256: provenance.raw_sha256,
      captured_at: provenance.captured_at,
      source_response_sha256s: provenance.source_response_sha256s,
    },
    local_migrations: lineage.counts,
    candidate_chain: {
      baseline: config.baseline.filename,
      forward_migrations: config.forward_migrations.map((item) => item.filename),
      total_migrations: 1 + config.forward_migrations.length,
    },
    safety: {
      output_requires_explicit_path: true,
      existing_output_is_never_overwritten: true,
      remote_credentials_stripped_for_future_children: true,
      remote_target_arguments_supported: false,
      production_baseline_application_forbidden: true,
    },
    errors,
  };

  if (errors.length > 0 || !transform) return { report, candidate: null };

  const forwardContents = config.forward_migrations.map((approved) => {
    const file = lineage.files.find((candidate) => candidate.filename === approved.filename);
    return { filename: approved.filename, sha256: approved.sha256, contents: file.contents };
  });
  const migrationFiles = [
    { filename: config.baseline.filename, sha256: transform.sha256, source: 'transformed_pinned_snapshot' },
    ...forwardContents.map((item) => ({ filename: item.filename, sha256: item.sha256, source: 'pinned_forward_hardening' })),
  ];
  const lockPayload = {
    format_version: 1,
    status: 'offline_recovery_candidate_unexecuted',
    source_snapshot: {
      filename: config.source_snapshot.filename,
      sha256: schema.sha256,
      bytes: schema.bytes,
      database_version: schema.database_version,
      pg_dump_version: schema.pg_dump_version,
      inventory: schema.inventory,
    },
    remote_ledger: {
      captured_at: ledger.captured_at,
      source_project_ref_sha256: ledger.source_project_ref_sha256,
      raw_sha256: ledger.raw_sha256,
      canonical_rows_sha256: ledger.canonical_rows_sha256,
      rows: lineage.remote,
    },
    remote_ledger_provenance: provenance.evidence,
    baseline_transform: {
      filename: config.baseline.filename,
      sha256: transform.sha256,
      rules: transform.rules,
    },
    lineage: {
      counts: lineage.counts,
      collisions: lineage.collisions,
      local_files: lineage.local,
    },
    candidate_chain: {
      migration_files: migrationFiles,
      migration_count: migrationFiles.length,
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

  return {
    report,
    candidate: {
      baselineSql: transform.sql,
      forwardContents,
      lock,
    },
  };
}

function candidateReadme(lock) {
  return [
    '# Offline database recovery candidate',
    '',
    'This directory was compiled from a pinned schema-only snapshot and a separately captured read-only migration ledger.',
    'It has not been executed against any database and is not a production migration, deployment artifact, or launch certificate.',
    '',
    `Lineage lock content SHA-256: ${lock.content_sha256}`,
    '',
    'Next: use a separate disposable-only certifier to replay this exact chain twice and run every SQL contract, lint, type, and schema-determinism gate.',
    'Never apply the baseline migration to the existing production database.',
    '',
  ].join('\n');
}

export function emitRecoveryCandidate(candidate, outputDirectory) {
  if (!candidate) throw new Error('A valid recovery candidate is required before emission.');
  if (typeof outputDirectory !== 'string' || !outputDirectory.trim()) {
    throw new Error('An explicit output directory is required.');
  }
  const output = resolve(outputDirectory);
  if (existsSync(output)) throw new Error(`Refusing to overwrite existing output path: ${output}`);

  const parent = dirname(output);
  mkdirSync(parent, { recursive: true });
  const temporary = mkdtempSync(join(parent, `.dial-smart-db-recovery-${randomUUID().slice(0, 8)}-`));
  const verifyDirectory = (directory) => {
    const emittedFiles = readdirSync(join(directory, 'migrations')).sort();
    if (emittedFiles.length !== candidate.lock.candidate_chain.migration_count) {
      throw new Error('Emitted migration count does not match the locked candidate chain.');
    }
    const expectedNames = candidate.lock.candidate_chain.migration_files
      .map((item) => item.filename)
      .sort();
    if (canonicalJson(emittedFiles) !== canonicalJson(expectedNames)) {
      throw new Error('Emitted migration filenames do not match the locked candidate chain.');
    }
    for (const expected of candidate.lock.candidate_chain.migration_files) {
      const path = join(directory, 'migrations', expected.filename);
      if (!existsSync(path) || !statSync(path).isFile() || sha256(readFileSync(path)) !== expected.sha256) {
        throw new Error(`Emitted migration failed hash verification: ${basename(path)}.`);
      }
    }
    const lockPath = join(directory, 'lineage-lock.json');
    const readmePath = join(directory, 'README.md');
    if (
      !existsSync(lockPath)
      || !statSync(lockPath).isFile()
      || readFileSync(lockPath, 'utf8') !== prettyCanonicalJson(candidate.lock)
      || !existsSync(readmePath)
      || !statSync(readmePath).isFile()
    ) {
      throw new Error('Emitted candidate metadata failed exact verification.');
    }
    return emittedFiles;
  };
  let published = false;
  let emittedFiles;
  try {
    const migrations = join(temporary, 'migrations');
    mkdirSync(migrations);
    writeFileSync(join(migrations, candidate.lock.baseline_transform.filename), candidate.baselineSql, 'utf8');
    for (const migration of candidate.forwardContents) {
      writeFileSync(join(migrations, migration.filename), migration.contents);
    }
    writeFileSync(join(temporary, 'lineage-lock.json'), prettyCanonicalJson(candidate.lock), 'utf8');
    writeFileSync(join(temporary, 'README.md'), candidateReadme(candidate.lock), 'utf8');
    verifyDirectory(temporary);
    renameSync(temporary, output);
    published = true;
    emittedFiles = verifyDirectory(output);
  } catch (caught) {
    rmSync(published ? output : temporary, { recursive: true, force: true });
    throw caught;
  }
  return {
    output_directory: output,
    lineage_lock: join(output, 'lineage-lock.json'),
    migration_count: emittedFiles.length,
  };
}
