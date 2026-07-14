#!/usr/bin/env node

import { readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSolarExitBundle } from './lib/solar-exit-bundle.mjs';
import {
  evaluateSolarExitShadowBatch,
  MAXIMUM_PRODUCTION_PHONE_HMAC_KEY_BYTES,
  MINIMUM_PRODUCTION_PHONE_HMAC_KEY_BYTES,
} from './lib/solar-exit-shadow-evaluator.mjs';

const REPOSITORY_ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));

function usage() {
  return [
    'Zero-contact Solar Exit shadow evaluator',
    '',
    'Usage:',
    '  node scripts/evaluate-solar-exit-shadow.mjs --mode offline --input <batch.json> [--root <campaign-root>] [--compact]',
    '  node scripts/evaluate-solar-exit-shadow.mjs --mode production --input <batch.json> --root <resolved-candidate-root> --phone-hmac-key-file <external-binary-key-file> --phone-hmac-key-id <non-secret-key-id> [--compact]',
    '',
    'This command reads local JSON and writes the audit report to stdout only.',
    'It has no provider, database, contact, messaging, or network capability.',
    'Production key material must be 32+ cryptographically random binary bytes in a file outside this repository.',
    'Only the non-secret key ID is emitted; key bytes are never printed or passed as a CLI argument.',
    'Production exits 2 when the selected policy is unresolved.',
  ].join('\n');
}

function parseArguments(argv) {
  const args = { root: 'campaigns/solar-exit', compact: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') args.help = true;
    else if (argument === '--compact') args.compact = true;
    else if (
      argument === '--mode' ||
      argument === '--input' ||
      argument === '--root' ||
      argument === '--phone-hmac-key-file' ||
      argument === '--phone-hmac-key-id'
    ) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`);
      args[argument.slice(2)] = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return args;
}

function normalizedRealPath(path) {
  const realPath = realpathSync(path);
  return process.platform === 'win32' ? realPath.toLowerCase() : realPath;
}

function isPathInside(parent, child) {
  const pathFromParent = relative(parent, child);
  return pathFromParent === '' || (
    !isAbsolute(pathFromParent) &&
    pathFromParent !== '..' &&
    !pathFromParent.startsWith(`..${sep}`)
  );
}

function readExternalPhoneHmacKey(path) {
  let keyPath;
  try {
    keyPath = normalizedRealPath(resolve(path));
  } catch {
    throw new Error('Production phone HMAC key file could not be resolved.');
  }
  const normalizedRepositoryRoot = process.platform === 'win32' ? REPOSITORY_ROOT.toLowerCase() : REPOSITORY_ROOT;
  if (isPathInside(normalizedRepositoryRoot, keyPath)) {
    throw new Error('Production phone HMAC key file must be stored outside the repository.');
  }

  let metadata;
  try {
    metadata = statSync(keyPath);
  } catch {
    throw new Error('Production phone HMAC key file could not be inspected.');
  }
  if (!metadata.isFile()) throw new Error('Production phone HMAC key path must identify a regular file.');
  if (
    metadata.size < MINIMUM_PRODUCTION_PHONE_HMAC_KEY_BYTES ||
    metadata.size > MAXIMUM_PRODUCTION_PHONE_HMAC_KEY_BYTES
  ) {
    throw new Error(`Production phone HMAC key file must contain ${MINIMUM_PRODUCTION_PHONE_HMAC_KEY_BYTES}-${MAXIMUM_PRODUCTION_PHONE_HMAC_KEY_BYTES} raw bytes.`);
  }
  if (process.platform !== 'win32' && (metadata.mode & 0o077) !== 0) {
    throw new Error('Production phone HMAC key file must not be accessible by group or other users.');
  }
  try {
    return readFileSync(keyPath);
  } catch {
    throw new Error('Production phone HMAC key file could not be read.');
  }
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`${label} could not be read as JSON: ${error.message}`);
  }
}

function main() {
  const args = parseArguments(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (!args.mode) throw new Error('--mode is required; choose offline or production explicitly.');
  if (!args.input) throw new Error('--input is required.');
  if (args.mode === 'production') {
    if (!args['phone-hmac-key-file'] || !args['phone-hmac-key-id']) {
      throw new Error('Production mode requires --phone-hmac-key-file and --phone-hmac-key-id.');
    }
  } else if (args['phone-hmac-key-file'] || args['phone-hmac-key-id']) {
    throw new Error('Phone HMAC key options are production-only; offline mode uses its synthetic-only pseudonym.');
  }

  const inputPath = resolve(args.input);
  const bundleRoot = resolve(args.root);
  const input = readJson(inputPath, 'Shadow input');
  const bundle = loadSolarExitBundle(bundleRoot);
  const phoneHmacKey = args.mode === 'production'
    ? readExternalPhoneHmacKey(args['phone-hmac-key-file'])
    : undefined;
  try {
    const report = evaluateSolarExitShadowBatch(input, bundle.eligibility, {
      mode: args.mode,
      phoneHmacKey,
      phoneHmacKeyId: args['phone-hmac-key-id'],
    });
    process.stdout.write(`${JSON.stringify(report, null, args.compact ? 0 : 2)}\n`);
    if (report.batch_status === 'blocked_unresolved_policy') process.exitCode = 2;
  } finally {
    phoneHmacKey?.fill(0);
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`Solar Exit shadow evaluation failed: ${error.message}\n`);
  process.exitCode = 1;
}
