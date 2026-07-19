import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { loadSolarExitBundle, validateSolarExitBundleData } from './lib/solar-exit-bundle.mjs';

const SCRIPT = 'scripts/create-solar-exit-installation-candidate.mjs';

test('installation-candidate builder preserves the immutable source and creates a launch-disabled copy', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'solar-exit-installation-candidate-'));
  const candidate = join(sandbox, 'candidate');
  const sourceBefore = loadSolarExitBundle();
  try {
    const result = spawnSync(process.execPath, [
      SCRIPT,
      '--destination', candidate,
      '--release-id', 'elite-solar-installation-fixture-01',
      '--created-at', '2026-07-19T12:00:00.000Z',
    ], { cwd: process.cwd(), encoding: 'utf8' });

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.operation, 'create_installation_candidate_only');
    assert.equal(output.provider_write_performed, false);
    assert.equal(output.crm_or_database_write_performed, false);
    assert.equal(output.contact_created, false);
    assert.equal(existsSync(candidate), true);

    const built = loadSolarExitBundle(candidate);
    assert.equal(built.manifest.environment, 'installation_candidate');
    assert.equal(built.manifest.bundle_status, 'installation_pending');
    assert.equal(built.manifest.production_launch_allowed, false);
    assert.equal(built.eligibility.consent.synthetic_offline_override.enabled, false);
    assert.deepEqual(built.manifest.release_provenance.source_parent, {
      bundle_id: sourceBefore.manifest.bundle_id,
      bundle_version: sourceBefore.manifest.bundle_version,
      sha256: sourceBefore.manifest.release_provenance.canonical_source_sha256,
    });
    assert.equal(built.manifest.release_provenance.release_candidate_id, 'elite-solar-installation-fixture-01');
    assert.equal(validateSolarExitBundleData(built, { mode: 'installation' }).valid, true);

    const sourceAfter = loadSolarExitBundle();
    assert.equal(sourceAfter.manifest.environment, 'offline_only');
    assert.equal(sourceAfter.eligibility.consent.synthetic_offline_override.enabled, true);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test('installation-candidate builder refuses an existing destination', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'solar-exit-installation-existing-'));
  try {
    const result = spawnSync(process.execPath, [
      SCRIPT,
      '--destination', sandbox,
      '--release-id', 'elite-solar-installation-fixture-02',
    ], { cwd: process.cwd(), encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must not already exist/i);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
