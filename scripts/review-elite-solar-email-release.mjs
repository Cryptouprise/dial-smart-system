#!/usr/bin/env node
import { createPublicKey } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EliteSolarEmailReleaseReviewError,
  reviewEliteSolarEmailRelease,
} from './lib/elite-solar-email-release-review.mjs';

const REPOSITORY_ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));

function usage() {
  return 'Usage: node scripts/review-elite-solar-email-release.mjs --draft <external-draft.json> --handoff <external-handoff.json> --release <external-release.json> --hmac-key-file <external-key.bin> [--source-proof <external-proof.json> --source-public-key-file <external-ed25519-public.pem>]';
}

function normalizedPath(path) {
  return process.platform === 'win32' ? path.toLowerCase() : path;
}

function inside(parent, child, allowSame = false) {
  const difference = relative(parent, child);
  if (difference === '') return allowSame;
  return !isAbsolute(difference) && difference !== '..' && !difference.startsWith(`..${sep}`);
}

function externalFile(path, label) {
  const file = normalizedPath(realpathSync(resolve(path)));
  if (inside(normalizedPath(REPOSITORY_ROOT), file, true) || !statSync(file).isFile()) {
    throw new Error(`${label} must be a regular file outside the repository.`);
  }
  return file;
}

function parseArguments(argv) {
  const values = {};
  const required = new Set(['--draft', '--handoff', '--release', '--hmac-key-file']);
  const optional = new Set(['--source-proof', '--source-public-key-file']);
  const options = new Set([...required, ...optional]);
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (!options.has(option) || values[option]) throw new Error(usage());
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(usage());
    values[option] = value;
    index += 1;
  }
  if ([...required].some((option) => !values[option]) || Boolean(values['--source-proof']) !== Boolean(values['--source-public-key-file'])) throw new Error(usage());
  return values;
}

try {
  const args = parseArguments(process.argv.slice(2));
  const draft = externalFile(args['--draft'], 'Draft');
  const handoff = externalFile(args['--handoff'], 'Handoff proposal');
  const release = externalFile(args['--release'], 'Execution release');
  const hmacKey = externalFile(args['--hmac-key-file'], 'HMAC key');
  const sourceProof = args['--source-proof'] ? externalFile(args['--source-proof'], 'Source proof') : null;
  const sourcePublicKey = args['--source-public-key-file'] ? externalFile(args['--source-public-key-file'], 'Source public key') : null;
  const result = reviewEliteSolarEmailRelease({
    draftInput: JSON.parse(readFileSync(draft, 'utf8')),
    handoffProposal: JSON.parse(readFileSync(handoff, 'utf8')),
    executionRelease: JSON.parse(readFileSync(release, 'utf8')),
    executionHmacKey: readFileSync(hmacKey),
    ...(sourceProof ? {
      sourceAttestation: JSON.parse(readFileSync(sourceProof, 'utf8')),
      sourceAttestationPublicKey: createPublicKey(readFileSync(sourcePublicKey)),
    } : {}),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  const code = error instanceof EliteSolarEmailReleaseReviewError
    ? error.code
    : 'ELITE_SOLAR_EMAIL_RELEASE_REVIEW_FAILED';
  process.stderr.write(`${JSON.stringify({ ok: false, error_code: code })}\n`);
  process.exitCode = 1;
}
