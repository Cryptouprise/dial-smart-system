import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { buildEliteSolarMorningBrief } from './lib/elite-solar-morning-brief.mjs';
import { loadSolarExitBundle } from './lib/solar-exit-bundle.mjs';

test('Elite Solar morning brief is a deterministic zero-contact release handoff', () => {
  const brief = buildEliteSolarMorningBrief();

  assert.equal(brief.kind, 'elite_solar_morning_brief_v1');
  assert.equal(brief.status, 'offline_bundle_ready');
  assert.equal(brief.offline_validation.valid, true);
  assert.equal(brief.offline_validation.dispositions, 23);
  assert.equal(brief.offline_validation.conversation_contracts, 27);
  assert.equal(brief.production_release.launch_authorized, false);
  assert.equal(brief.production_release.blocker_count, 22);
  assert.equal(brief.production_release.unresolved_placeholder_count, 25);
  assert.deepEqual(brief.release_ladder, [
    'signed_source_shadow_25',
    'owned_phone_20',
    'human_approved_canary_5',
    'human_approved_canary_20',
    'human_approved_canary_50',
  ]);
  assert.deepEqual(brief.authority, {
    contact_authorized: false,
    launch_authorized: false,
    queue_mutation_authorized: false,
    crm_write_authorized: false,
    provider_write_authorized: false,
    spend_authorized: false,
  });
  assert.deepEqual(brief.side_effect_invariants, {
    database_reads: 0,
    database_writes: 0,
    network_requests: 0,
    provider_calls: 0,
    external_messages: 0,
  });
});

test('Elite Solar morning brief reflects a structurally invalid bundle without manufacturing authority', () => {
  const bundle = structuredClone(loadSolarExitBundle());
  bundle.manifest.campaign.status = 'active';
  const brief = buildEliteSolarMorningBrief(bundle);

  assert.equal(brief.status, 'offline_bundle_invalid');
  assert.equal(brief.offline_validation.valid, false);
  assert.equal(brief.production_release.launch_authorized, false);
  assert.equal(brief.authority.contact_authorized, false);
});

test('the morning brief CLI emits the same read-only handoff and rejects unknown flags', () => {
  const success = spawnSync(process.execPath, ['scripts/build-elite-solar-morning-brief.mjs'], { encoding: 'utf8' });
  assert.equal(success.status, 0, success.stderr);
  const brief = JSON.parse(success.stdout);
  assert.equal(brief.status, 'offline_bundle_ready');
  assert.equal(brief.email_lane.provider_action, 'none');

  const failure = spawnSync(process.execPath, ['scripts/build-elite-solar-morning-brief.mjs', '--unexpected'], { encoding: 'utf8' });
  assert.equal(failure.status, 1);
  assert.match(failure.stderr, /ELITE_SOLAR_MORNING_BRIEF_FAILED/);
});
