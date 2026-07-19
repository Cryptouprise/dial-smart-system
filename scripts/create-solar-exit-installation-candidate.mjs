#!/usr/bin/env node

import { cpSync, existsSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';

import { computeCanonicalSourceDigest, DEFAULT_SOLAR_EXIT_BUNDLE_ROOT, loadSolarExitBundle } from './lib/solar-exit-bundle.mjs';

function option(name, fallback) {
  const exact = process.argv.find((argument) => argument.startsWith(`--${name}=`));
  if (exact) return exact.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/create-solar-exit-installation-candidate.mjs --destination <new-directory> --release-id <immutable-id> [--created-at <ISO-8601>]',
    '',
    'Creates an isolated, launch-disabled installation candidate from the immutable Elite Solar source package.',
    'It never calls a provider, touches a CRM/database, resolves credentials, or creates a release.',
  ].join('\n');
}

function normalizedRealPath(path) {
  const normalized = realpathSync(path);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function isPathInside(parent, child, { allowSame = false } = {}) {
  const pathFromParent = relative(parent, child);
  if (pathFromParent === '') return allowSame;
  return !isAbsolute(pathFromParent) && pathFromParent !== '..' && !pathFromParent.startsWith(`..${sep}`);
}

function validReleaseId(value) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{7,127}$/i.test(value);
}

function validCreatedAt(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) && Date.parse(value) <= Date.now() + 300000;
}

try {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }

  const destinationInput = option('destination', undefined);
  const releaseId = option('release-id', undefined);
  const createdAt = option('created-at', new Date().toISOString());
  const permitted = new Set(['--destination', '--release-id', '--created-at']);
  for (let index = 2; index < process.argv.length; index += 1) {
    const argument = process.argv[index];
    if (argument.startsWith('--') && ![...permitted].some((name) => argument === name || argument.startsWith(`${name}=`))) {
      throw new Error(`Unsupported option: ${argument}`);
    }
    if (permitted.has(argument)) index += 1;
  }

  if (!destinationInput || !releaseId) throw new Error('--destination and --release-id are required.');
  if (!validReleaseId(releaseId)) throw new Error('--release-id must be 8-128 letters, digits, or hyphens and start with a letter or digit.');
  if (!validCreatedAt(createdAt)) throw new Error('--created-at must be a current or past ISO-8601 timestamp.');

  const sourceRoot = normalizedRealPath(DEFAULT_SOLAR_EXIT_BUNDLE_ROOT);
  const destination = resolve(destinationInput);
  if (existsSync(destination)) throw new Error('--destination must not already exist. Refusing to alter an existing directory.');
  const destinationParent = resolve(destination, '..');
  if (!existsSync(destinationParent) || !statSync(destinationParent).isDirectory()) {
    throw new Error('--destination parent directory must already exist.');
  }
  const destinationParentReal = normalizedRealPath(destinationParent);
  const destinationProspective = resolve(destinationParentReal, basename(destination));
  if (isPathInside(sourceRoot, destinationProspective, { allowSame: true })) {
    throw new Error('--destination must be outside the immutable canonical source directory.');
  }

  const sourceBundle = loadSolarExitBundle(sourceRoot);
  const canonicalSourceSha256 = computeCanonicalSourceDigest(sourceBundle);
  if (canonicalSourceSha256 !== sourceBundle.manifest.release_provenance?.canonical_source_sha256) {
    throw new Error('Canonical Solar Exit source digest does not match its pinned provenance. Refusing to create a candidate.');
  }

  cpSync(sourceRoot, destination, { recursive: true, errorOnExist: true, force: false });
  const manifestPath = resolve(destination, 'manifest.json');
  const eligibilityPath = resolve(destination, sourceBundle.manifest.artifacts.eligibility_policy);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const eligibility = JSON.parse(readFileSync(eligibilityPath, 'utf8'));

  manifest.environment = 'installation_candidate';
  manifest.bundle_status = 'installation_pending';
  manifest.production_launch_allowed = false;
  manifest.release_provenance = {
    ...manifest.release_provenance,
    canonical_source_sha256: canonicalSourceSha256,
    source_parent: {
      bundle_id: sourceBundle.manifest.bundle_id,
      bundle_version: sourceBundle.manifest.bundle_version,
      sha256: canonicalSourceSha256,
    },
    release_candidate_id: releaseId,
    created_at: new Date(createdAt).toISOString(),
  };
  if (!eligibility?.consent?.synthetic_offline_override) {
    throw new Error('Canonical eligibility policy lacks the synthetic offline override lock.');
  }
  eligibility.consent.synthetic_offline_override.enabled = false;

  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'w' });
  writeFileSync(eligibilityPath, `${JSON.stringify(eligibility, null, 2)}\n`, { encoding: 'utf8', flag: 'w' });

  process.stdout.write(`${JSON.stringify({
    operation: 'create_installation_candidate_only',
    candidate_root: destination,
    candidate_id: releaseId,
    canonical_source_sha256: canonicalSourceSha256,
    production_launch_allowed: false,
    synthetic_offline_override_enabled: false,
    provider_write_performed: false,
    crm_or_database_write_performed: false,
    contact_created: false,
    next_command: `npm run campaign:solar-exit:installation-plan -- --root ${JSON.stringify(destination)}`,
  }, null, 2)}\n`);
} catch (error) {
  console.error(`Solar Exit installation candidate was not created: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
