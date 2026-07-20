#!/usr/bin/env node

import { createPublicKey } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import { loadSolarExitBundle } from './lib/solar-exit-bundle.mjs';
import {
  evaluateSolarExitShadowBatch,
  MAXIMUM_PRODUCTION_PHONE_HMAC_KEY_BYTES,
  MINIMUM_PRODUCTION_PHONE_HMAC_KEY_BYTES,
} from './lib/solar-exit-shadow-evaluator.mjs';
import { buildVerifiedDirectImportShadowBatch } from './lib/signed-direct-import.mjs';

const REPOSITORY_ROOT = realpathSync(resolve('.'));

function usage() {
  return [
    'Usage:',
    '  node scripts/evaluate-signed-direct-import-shadow.mjs --root <resolved-candidate> --input <signed-import.json> --public-key-file <external-ed25519-public-key> --phone-hmac-key-file <external-random-key> --phone-hmac-key-id <rotation-id>',
    '',
    'Verifies a signed direct export, evaluates it in memory, and writes only a redacted zero-contact shadow report to stdout.',
  ].join('\n');
}

function parseArguments(argv) {
  const args = { compact: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') args.help = true;
    else if (argument === '--compact') args.compact = true;
    else if (['--root', '--input', '--public-key-file', '--phone-hmac-key-file', '--phone-hmac-key-id'].includes(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`);
      args[argument.slice(2)] = value;
      index += 1;
    } else throw new Error(`Unknown argument: ${argument}`);
  }
  return args;
}

function normalizedRealPath(path) {
  const real = realpathSync(path);
  return process.platform === 'win32' ? real.toLowerCase() : real;
}

function isPathInside(parent, child) {
  const fromParent = relative(parent, child);
  return fromParent === '' || (!isAbsolute(fromParent) && fromParent !== '..' && !fromParent.startsWith(`..${sep}`));
}

function readExternalRegularFile(path, label, { binary = true } = {}) {
  const real = normalizedRealPath(resolve(path));
  const repository = process.platform === 'win32' ? REPOSITORY_ROOT.toLowerCase() : REPOSITORY_ROOT;
  if (isPathInside(repository, real)) throw new Error(`${label} must be stored outside the repository.`);
  const metadata = statSync(real);
  if (!metadata.isFile()) throw new Error(`${label} must identify a regular file.`);
  return readFileSync(real, binary ? undefined : 'utf8');
}

function readPhoneHmacKey(path) {
  const key = readExternalRegularFile(path, 'Production phone HMAC key');
  if (key.length < MINIMUM_PRODUCTION_PHONE_HMAC_KEY_BYTES || key.length > MAXIMUM_PRODUCTION_PHONE_HMAC_KEY_BYTES) {
    throw new Error(`Production phone HMAC key must contain ${MINIMUM_PRODUCTION_PHONE_HMAC_KEY_BYTES}-${MAXIMUM_PRODUCTION_PHONE_HMAC_KEY_BYTES} raw bytes.`);
  }
  return key;
}

try {
  const args = parseArguments(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }
  for (const key of ['root', 'input', 'public-key-file', 'phone-hmac-key-file', 'phone-hmac-key-id']) {
    if (!args[key]) throw new Error(`--${key} is required.`);
  }
  const bundle = loadSolarExitBundle(resolve(args.root));
  const envelope = JSON.parse(readFileSync(resolve(args.input), 'utf8'));
  const publicKey = createPublicKey(readExternalRegularFile(args['public-key-file'], 'Direct-import public key', { binary: false }));
  const phoneHmacKey = readPhoneHmacKey(args['phone-hmac-key-file']);
  try {
    const batch = buildVerifiedDirectImportShadowBatch(envelope, bundle.directImport, publicKey);
    const report = evaluateSolarExitShadowBatch(batch, bundle.eligibility, {
      mode: 'production',
      phoneHmacKey,
      phoneHmacKeyId: args['phone-hmac-key-id'],
    });
    process.stdout.write(`${JSON.stringify(report, null, args.compact ? 0 : 2)}\n`);
    if (report.batch_status === 'blocked_unresolved_policy') process.exitCode = 2;
  } finally {
    phoneHmacKey.fill(0);
  }
} catch (error) {
  process.stderr.write(`Signed direct-import shadow evaluation failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
