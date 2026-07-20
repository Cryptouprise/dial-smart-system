import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const SCRIPT = 'scripts/provision-solar-exit-direct-import-keys.mjs';

test('direct-import key provisioner creates external non-secret binding output only', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'solar-direct-import-keys-'));
  const destination = join(sandbox, 'keys');
  try {
    const result = spawnSync(process.execPath, [
      SCRIPT,
      '--destination', destination,
      '--signing-key-id', 'elite-solar-test-key-v1',
      '--signer-principal-id', 'elite-solar-test-principal',
      '--phone-hmac-key-id', 'elite-solar-test-hmac-v1',
    ], { cwd: process.cwd(), encoding: 'utf8' });

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.operation, 'provision_direct_import_keys_only');
    assert.equal(output.signing.algorithm, 'ed25519');
    assert.match(output.signing.public_key_spki_sha256, /^[a-f0-9]{64}$/);
    assert.equal(output.private_key_printed, false);
    assert.equal(output.phone_hmac_key_printed, false);
    assert.equal(output.provider_write_performed, false);
    assert.equal(output.crm_or_database_write_performed, false);
    assert.equal(output.contact_created, false);
    assert.equal(result.stdout.includes('BEGIN PRIVATE KEY'), false);
    assert.equal(existsSync(join(destination, 'elite-solar-direct-import-ed25519-private.pem')), true);
    assert.equal(existsSync(join(destination, 'elite-solar-direct-import-ed25519-public.pem')), true);
    assert.equal(readFileSync(join(destination, 'elite-solar-shadow-phone-hmac-v1.bin')).length, 32);
    assert.match(readFileSync(join(destination, 'elite-solar-direct-import-ed25519-public.pem'), 'utf8'), /BEGIN PUBLIC KEY/);
    assert.ok(statSync(join(destination, 'elite-solar-direct-import-ed25519-private.pem')).isFile());
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test('direct-import key provisioner refuses a repository destination and existing directories', () => {
  const repositoryDestination = join(process.cwd(), 'temporary-direct-import-keys');
  const sandbox = mkdtempSync(join(tmpdir(), 'solar-direct-import-existing-'));
  try {
    const repositoryResult = spawnSync(process.execPath, [
      SCRIPT,
      '--destination', repositoryDestination,
      '--signing-key-id', 'elite-solar-test-key-v1',
      '--signer-principal-id', 'elite-solar-test-principal',
    ], { cwd: process.cwd(), encoding: 'utf8' });
    assert.notEqual(repositoryResult.status, 0);
    assert.match(repositoryResult.stderr, /outside the repository/i);

    const existingResult = spawnSync(process.execPath, [
      SCRIPT,
      '--destination', sandbox,
      '--signing-key-id', 'elite-solar-test-key-v1',
      '--signer-principal-id', 'elite-solar-test-principal',
    ], { cwd: process.cwd(), encoding: 'utf8' });
    assert.notEqual(existingResult.status, 0);
    assert.match(existingResult.stderr, /new directory/i);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
