#!/usr/bin/env node

import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const PRIVATE_KEY_FILENAME = 'elite-solar-direct-import-ed25519-private.pem';
const PUBLIC_KEY_FILENAME = 'elite-solar-direct-import-ed25519-public.pem';
const PHONE_HMAC_KEY_FILENAME = 'elite-solar-shadow-phone-hmac-v1.bin';

function usage() {
  return [
    'Usage:',
    '  node scripts/provision-solar-exit-direct-import-keys.mjs --destination <new-external-directory> --signing-key-id <id> --signer-principal-id <id> [--phone-hmac-key-id <id>]',
    '',
    'Creates a new Ed25519 key pair and a 32-byte phone-HMAC key outside this repository.',
    'It does not contact a provider, CRM, database, or lead; it prints no private key material.',
  ].join('\n');
}

function parseArguments(argv) {
  const args = {};
  const allowed = new Set(['--destination', '--signing-key-id', '--signer-principal-id', '--phone-hmac-key-id']);
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

function validIdentifier(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{3,127}$/.test(value)) {
    throw new Error(`${label} must be 4-128 letters, digits, dots, underscores, colons, or hyphens and start with a letter or digit.`);
  }
  return value;
}

function writePrivateFile(path, value) {
  writeFileSync(path, value, { encoding: Buffer.isBuffer(value) ? undefined : 'utf8', mode: 0o600, flag: 'wx' });
  // Windows ACLs remain the operator's responsibility, but this preserves the
  // restrictive POSIX mode where the platform supports it.
  try { chmodSync(path, 0o600); } catch { /* Best effort only on platforms without POSIX modes. */ }
}

try {
  const args = parseArguments(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }
  for (const required of ['destination', 'signing-key-id', 'signer-principal-id']) {
    if (!args[required]) throw new Error(`--${required} is required.`);
  }
  const signingKeyId = validIdentifier(args['signing-key-id'], '--signing-key-id');
  const signerPrincipalId = validIdentifier(args['signer-principal-id'], '--signer-principal-id');
  const phoneHmacKeyId = validIdentifier(args['phone-hmac-key-id'] || 'elite-solar-shadow-phone-v1', '--phone-hmac-key-id');

  const destination = resolve(args.destination);
  if (existsSync(destination)) throw new Error('--destination must be a new directory. Refusing to add secrets to an existing location.');
  const parent = resolve(destination, '..');
  if (!existsSync(parent) || !statSync(parent).isDirectory()) throw new Error('--destination parent directory must already exist.');
  const parentReal = normalizedPath(realpathSync(parent));
  const prospectiveDestination = normalizedPath(resolve(parentReal, basename(destination)));
  const repository = normalizedPath(REPOSITORY_ROOT);
  if (isPathInside(repository, prospectiveDestination, { allowSame: true })) {
    throw new Error('--destination must be outside the repository.');
  }

  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
  const phoneHmacKey = randomBytes(32);
  const publicKeySpkiSha256 = createHash('sha256')
    .update(publicKey.export({ type: 'spki', format: 'der' }))
    .digest('hex');

  mkdirSync(destination, { recursive: false, mode: 0o700 });
  try {
    writePrivateFile(resolve(destination, PRIVATE_KEY_FILENAME), privatePem);
    writeFileSync(resolve(destination, PUBLIC_KEY_FILENAME), publicPem, { encoding: 'utf8', mode: 0o644, flag: 'wx' });
    writePrivateFile(resolve(destination, PHONE_HMAC_KEY_FILENAME), phoneHmacKey);
  } finally {
    phoneHmacKey.fill(0);
  }

  process.stdout.write(`${JSON.stringify({
    schema_version: '1.0.0',
    operation: 'provision_direct_import_keys_only',
    destination,
    signing: {
      algorithm: 'ed25519',
      signing_key_id: signingKeyId,
      signer_principal_id: signerPrincipalId,
      public_key_spki_sha256: publicKeySpkiSha256,
      signature_required: true,
      maximum_signature_window_hours: 24,
    },
    phone_hmac_key_id: phoneHmacKeyId,
    public_key_file: resolve(destination, PUBLIC_KEY_FILENAME),
    private_key_file_created: true,
    phone_hmac_key_file_created: true,
    private_key_printed: false,
    phone_hmac_key_printed: false,
    provider_write_performed: false,
    crm_or_database_write_performed: false,
    contact_created: false,
    next_step: 'Copy only the signing object into the isolated release candidate direct-import-mapping.json. Keep the private key and phone-HMAC file outside the repository and browser.',
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Solar Exit direct-import key provisioning failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
