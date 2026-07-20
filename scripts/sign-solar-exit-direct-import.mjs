#!/usr/bin/env node

import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson } from './lib/solar-exit-shadow-evaluator.mjs';
import { loadSolarExitBundle } from './lib/solar-exit-bundle.mjs';
import { buildVerifiedDirectImportShadowBatch } from './lib/signed-direct-import.mjs';

const REPOSITORY_ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));

function usage() {
  return [
    'Usage:',
    '  node scripts/sign-solar-exit-direct-import.mjs --root <resolved-candidate> --input <external-unsigned-import.json> --private-key-file <external-ed25519-private-key.pem> --output <new-external-signed-import.json>',
    '',
    'Signs one production-shaped direct import locally. It never calls a provider, CRM, database, or lead.',
    'Input, private key, and output must all remain outside this repository. No contact data is printed.',
  ].join('\n');
}

function parseArguments(argv) {
  const args = {};
  const allowed = new Set(['--root', '--input', '--private-key-file', '--output']);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      args.help = true;
      continue;
    }
    if (!allowed.has(argument)) throw new Error(`Unsupported option: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`);
    args[argument.slice(2)] = value;
    index += 1;
  }
  return args;
}

function normalizedPath(path) {
  return process.platform === 'win32' ? path.toLowerCase() : path;
}

function isPathInside(parent, child, { allowSame = false } = {}) {
  const fromParent = relative(parent, child);
  if (fromParent === '') return allowSame;
  return !isAbsolute(fromParent) && fromParent !== '..' && !fromParent.startsWith(`..${sep}`);
}

function externalRegularFile(path, label) {
  const real = normalizedPath(realpathSync(resolve(path)));
  const repository = normalizedPath(REPOSITORY_ROOT);
  if (isPathInside(repository, real, { allowSame: true })) throw new Error(`${label} must be outside the repository.`);
  if (!statSync(real).isFile()) throw new Error(`${label} must be a regular file.`);
  return real;
}

function externalNewOutput(path) {
  const output = resolve(path);
  if (existsSync(output)) throw new Error('--output must not already exist. Refusing to overwrite a signed import.');
  const parent = resolve(output, '..');
  if (!existsSync(parent) || !statSync(parent).isDirectory()) throw new Error('--output parent directory must already exist.');
  const parentReal = normalizedPath(realpathSync(parent));
  const prospective = normalizedPath(resolve(parentReal, output.split(/[\\/]/).pop()));
  if (isPathInside(normalizedPath(REPOSITORY_ROOT), prospective, { allowSame: true })) {
    throw new Error('--output must be outside the repository.');
  }
  return output;
}

function publicKeyFingerprint(publicKey) {
  return createHash('sha256')
    .update(publicKey.export({ type: 'spki', format: 'der' }))
    .digest('hex');
}

try {
  const args = parseArguments(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }
  for (const required of ['root', 'input', 'private-key-file', 'output']) {
    if (!args[required]) throw new Error(`--${required} is required.`);
  }

  const bundle = loadSolarExitBundle(resolve(args.root));
  const inputPath = externalRegularFile(args.input, 'Unsigned direct-import input');
  const privateKeyPath = externalRegularFile(args['private-key-file'], 'Direct-import private key');
  const outputPath = externalNewOutput(args.output);
  const imported = JSON.parse(readFileSync(inputPath, 'utf8'));
  const privateKey = createPrivateKey(readFileSync(privateKeyPath, 'utf8'));
  if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('Direct-import private key must be Ed25519.');
  const publicKey = createPublicKey(privateKey);
  const signing = bundle.directImport?.signing;
  if (!signing || signing.algorithm !== 'ed25519' || signing.signature_required !== true) {
    throw new Error('Resolved candidate does not permit Ed25519 direct-import signing.');
  }
  if (publicKeyFingerprint(publicKey) !== String(signing.public_key_spki_sha256 || '').toLowerCase()) {
    throw new Error('Direct-import private key does not match the candidate-pinned public-key fingerprint.');
  }

  const envelope = {
    schema_version: '1.0.0',
    import: imported,
    signature: {
      algorithm: 'ed25519',
      key_id: signing.signing_key_id,
      signer_principal_id: signing.signer_principal_id,
      signature_base64: sign(
        null,
        Buffer.from(canonicalJson({ schema_version: '1.0.0', import: imported }), 'utf8'),
        privateKey,
      ).toString('base64'),
    },
  };
  const batch = buildVerifiedDirectImportShadowBatch(envelope, bundle.directImport, publicKey);
  writeFileSync(outputPath, `${JSON.stringify(envelope, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });

  process.stdout.write(`${JSON.stringify({
    schema_version: '1.0.0',
    operation: 'sign_direct_import_only',
    signed_record_count: batch.records.length,
    signature_algorithm: 'ed25519',
    output_created: true,
    provider_write_performed: false,
    crm_or_database_write_performed: false,
    contact_created: false,
    contact_data_printed: false,
    next_step: 'Run campaign:solar-exit:direct-import-shadow with the same resolved candidate, public key, and external phone-HMAC key.',
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Solar Exit direct-import signing failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
