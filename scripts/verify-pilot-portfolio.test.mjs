import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  loadPilotPortfolio,
  summarizePilotPortfolio,
  validatePilotPortfolio,
} from './lib/pilot-portfolio.mjs';

test('the four-company pilot portfolio is a valid no-contact plan', () => {
  const portfolio = loadPilotPortfolio();
  const report = validatePilotPortfolio(portfolio);
  assert.equal(report.valid, true, JSON.stringify(report.issues, null, 2));

  const summary = summarizePilotPortfolio(portfolio);
  assert.equal(summary.operation, 'pilot_portfolio_read_only_summary');
  assert.equal(summary.authority.contact_authorized, false);
  assert.equal(summary.authority.launch_authorized, false);
  assert.equal(summary.authority.provider_write_authorized, false);
  assert.deepEqual(summary.side_effect_invariants, {
    database_reads: 0,
    database_writes: 0,
    network_requests: 0,
    provider_calls: 0,
    external_messages: 0,
  });
  assert.deepEqual(summary.pilots.map((pilot) => pilot.id), [
    'elite_solar_recovery', 'omega_accounting', 'noble_gold', 'infinite_ai',
  ]);
});

test('the portfolio fails closed when tenant separation or launch locks are weakened', () => {
  const portfolio = structuredClone(loadPilotPortfolio());
  portfolio.manifest.production_launch_allowed = true;
  portfolio.manifest.global_invariants.shared_provider_credentials_forbidden = false;
  portfolio.manifest.pilots[1].organization_id = portfolio.manifest.pilots[0].organization_id;
  portfolio.manifest.pilots[2].campaign_bundle = '../solar-exit';
  portfolio.manifest.pilots[3].launch_path = ['owned_phone_20'];

  const codes = new Set(validatePilotPortfolio(portfolio).issues.map((entry) => entry.code));
  for (const code of ['LAUNCH_LOCK', 'INVARIANT_VALUE', 'TENANT_COLLISION', 'UNDEFINED_PILOT_BUNDLE', 'UNDEFINED_PILOT_PATH']) {
    assert.ok(codes.has(code), `expected ${code}`);
  }
});

test('the CLI emits an inspectable summary and rejects malformed input', () => {
  const summary = spawnSync(process.execPath, ['scripts/verify-pilot-portfolio.mjs', '--summary'], {
    encoding: 'utf8',
  });
  assert.equal(summary.status, 0, summary.stderr);
  const parsed = JSON.parse(summary.stdout);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.authority.spend_authorized, false);

  const sandbox = mkdtempSync(join(tmpdir(), 'pilot-portfolio-'));
  try {
    cpSync('campaigns/pilot-portfolio', sandbox, { recursive: true });
    const path = join(sandbox, 'manifest.json');
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    manifest.pilots.pop();
    writeFileSync(path, JSON.stringify(manifest), 'utf8');
    const invalid = spawnSync(process.execPath, ['scripts/verify-pilot-portfolio.mjs', '--root', sandbox, '--summary'], { encoding: 'utf8' });
    assert.equal(invalid.status, 1);
    assert.match(invalid.stdout, /"PILOT_COUNT"/);
    assert.match(invalid.stdout, /"valid": false/);

    const duplicateRoot = spawnSync(process.execPath, ['scripts/verify-pilot-portfolio.mjs', '--root', sandbox, '--root', sandbox], { encoding: 'utf8' });
    assert.equal(duplicateRoot.status, 1);
    assert.match(duplicateRoot.stderr, /may only be provided once/);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
