#!/usr/bin/env node
import { createPrivateKey } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildEliteEmailSourceAttestation,
  EliteEmailSourceAttestationError,
} from './lib/elite-email-source-attestation.mjs';

const REPOSITORY_ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const TEMPLATE = Object.freeze({
  version: 'elite.solar.email.source-snapshot.v1',
  organization_id: 'replace-organization-uuid',
  campaign_id: 'replace-campaign-uuid',
  source_system: 'replace-approved-source-system',
  source_release_reference: 'replace-source-release-reference',
  evidence_as_of: '__CURRENT_UTC__',
  issued_at: '__CURRENT_UTC__',
  expires_at: '__UTC_WITHIN_24_HOURS__',
  records: [{
    recipient_email: 'replace-with-permissioned-recipient@example.com',
    source_contact_reference: 'replace-source-contact-reference',
    email_permission_status: 'explicit_opt_in',
    email_permission_evidence_reference: 'replace-permission-evidence-reference',
    suppression: {
      global_suppressed: false,
      tenant_suppressed: false,
      campaign_suppressed: false,
      provider_suppressed: false,
      unsubscribed: false,
      spam_complaint: false,
      permanent_bounce: false,
    },
  }],
});

function parseArguments(argv) {
  const args = {};
  const options = new Set(['--source', '--recipient-hmac-key-file', '--signing-private-key-file', '--signing-key-id', '--signer-reference', '--output', '--template']);
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (!options.has(option)) throw new Error(`Unsupported option: ${option}`);
    if (option === '--template') {
      args.template = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${option} requires a value.`);
    args[option.slice(2)] = value;
    index += 1;
  }
  if (args.template) {
    if (Object.keys(args).length !== 1) throw new Error('--template cannot be combined with other options.');
  } else if (!args.source || !args['recipient-hmac-key-file'] || !args['signing-private-key-file'] || !args['signing-key-id'] || !args['signer-reference'] || !args.output) {
    throw new Error('--source, --recipient-hmac-key-file, --signing-private-key-file, --signing-key-id, --signer-reference, and --output are required.');
  }
  return args;
}

function normalizedPath(path) { return process.platform === 'win32' ? path.toLowerCase() : path; }
function inside(parent, child, allowSame = false) {
  const difference = relative(parent, child);
  if (difference === '') return allowSame;
  return !isAbsolute(difference) && difference !== '..' && !difference.startsWith(`..${sep}`);
}
function externalFile(path, label) {
  const file = normalizedPath(realpathSync(resolve(path)));
  if (inside(normalizedPath(REPOSITORY_ROOT), file, true)) throw new Error(`${label} must be outside the repository.`);
  if (!statSync(file).isFile()) throw new Error(`${label} must be a regular file.`);
  return file;
}
function externalOutput(path) {
  const output = resolve(path);
  if (existsSync(output)) throw new Error('--output must not already exist.');
  const parent = resolve(output, '..');
  if (!existsSync(parent) || !statSync(parent).isDirectory()) throw new Error('--output parent directory must already exist.');
  const prospective = normalizedPath(resolve(realpathSync(parent), output.split(/[\\/]/).pop()));
  if (inside(normalizedPath(REPOSITORY_ROOT), prospective, true)) throw new Error('--output must be outside the repository.');
  return output;
}

try {
  const args = parseArguments(process.argv.slice(2));
  if (args.template) {
    process.stdout.write(`${JSON.stringify(TEMPLATE, null, 2)}\n`);
    process.exit(0);
  }
  const sourcePath = externalFile(args.source, 'Source snapshot');
  const hmacKeyPath = externalFile(args['recipient-hmac-key-file'], 'Recipient HMAC key file');
  const signingKeyPath = externalFile(args['signing-private-key-file'], 'Signing private key file');
  const outputPath = externalOutput(args.output);
  const hmacKey = readFileSync(hmacKeyPath);
  const signingKeyMaterial = readFileSync(signingKeyPath);
  try {
    const attestation = buildEliteEmailSourceAttestation({
      sourceSnapshot: JSON.parse(readFileSync(sourcePath, 'utf8')),
      recipientHmacKey: hmacKey,
      signingKey: createPrivateKey(signingKeyMaterial),
      signingKeyId: args['signing-key-id'],
      signerPrincipalReference: args['signer-reference'],
    });
    writeFileSync(outputPath, `${JSON.stringify(attestation, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    process.stdout.write(`${JSON.stringify({
      operation: 'signed_elite_email_source_suppression_attestation_only',
      output_created: true,
      recipient_data_included: false,
      provider_action: 'none',
      provider_write_performed: false,
      external_messages_sent: 0,
      next_step: 'Register the matching reviewed no-send release, then select this no-PII proof in Elite Launch Control. Preparation remains separate from any claim or provider operation.',
    }, null, 2)}\n`);
  } finally {
    hmacKey.fill(0);
    signingKeyMaterial.fill(0);
  }
} catch (error) {
  const code = error instanceof EliteEmailSourceAttestationError ? error.code : 'ELITE_EMAIL_SOURCE_ATTESTATION_FAILED';
  process.stderr.write(`${JSON.stringify({ ok: false, error_code: code })}\n`);
  process.exitCode = 1;
}
