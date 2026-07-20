import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { buildEmailProviderReadinessBrief } from './lib/email-provider-readiness-brief.mjs';

test('aggregates redacted successful provider probes without granting authority', async () => {
  const calls = [];
  const brief = await buildEmailProviderReadinessBrief({
    instantly: { apiKey: 'instantly-read-key' },
    mailgun: { apiKey: 'mailgun-read-key', domain: 'mail.example.test' },
    inspectInstantly: async (input) => {
      calls.push(['instantly', input]);
      return { kind: 'instantly_email_readiness_v1', reachable: true, provider_action: 'none' };
    },
    inspectMailgun: async (input) => {
      calls.push(['mailgun', input]);
      return { kind: 'mailgun_email_readiness_v1', reachable: true, provider_action: 'none' };
    },
  });

  assert.equal(brief.status, 'readiness_observed');
  assert.equal(brief.providers[0].status, 'readiness_observed');
  assert.equal(brief.providers[1].status, 'readiness_observed');
  assert.equal(brief.provider_action, 'none');
  assert.equal(brief.authority.provider_write_authorized, false);
  assert.equal(brief.side_effect_invariants.provider_read_probe_calls, 2);
  assert.deepEqual(calls.map(([provider]) => provider), ['instantly', 'mailgun']);
});

test('does not call a provider when its required configuration is absent', async () => {
  let instantlyCalls = 0;
  let mailgunCalls = 0;
  const brief = await buildEmailProviderReadinessBrief({
    instantly: {},
    mailgun: {},
    inspectInstantly: async () => { instantlyCalls += 1; },
    inspectMailgun: async () => { mailgunCalls += 1; },
  });

  assert.equal(brief.status, 'configuration_required');
  assert.deepEqual(brief.providers[0].required_environment, ['INSTANTLY_API_KEY']);
  assert.deepEqual(brief.providers[1].required_environment, ['MAILGUN_API_KEY', 'MAILGUN_DOMAIN']);
  assert.equal(brief.side_effect_invariants.provider_read_probe_calls, 0);
  assert.equal(instantlyCalls, 0);
  assert.equal(mailgunCalls, 0);
});

test('redacts unexpected probe errors and holds the aggregate brief', async () => {
  const brief = await buildEmailProviderReadinessBrief({
    instantly: { apiKey: 'instantly-read-key' },
    mailgun: {},
    inspectInstantly: async () => {
      const error = new Error('do not emit provider body or account details');
      error.code = 'INSTANTLY_READ_REJECTED';
      throw error;
    },
    inspectMailgun: async () => ({ unreachable: true }),
  });

  assert.equal(brief.status, 'readiness_blocked');
  assert.equal(brief.providers[0].error_code, 'INSTANTLY_READ_REJECTED');
  assert.equal(JSON.stringify(brief).includes('do not emit provider body'), false);
  assert.equal(brief.authority.contact_authorized, false);
});

test('CLI emits a zero-probe configuration brief without credentials and rejects flags', () => {
  const success = spawnSync(process.execPath, ['scripts/build-email-provider-readiness-brief.mjs'], {
    encoding: 'utf8',
    env: {},
  });
  assert.equal(success.status, 0, success.stderr);
  const brief = JSON.parse(success.stdout);
  assert.equal(brief.status, 'configuration_required');
  assert.equal(brief.side_effect_invariants.provider_read_probe_calls, 0);
  assert.equal(brief.provider_action, 'none');

  const failure = spawnSync(process.execPath, ['scripts/build-email-provider-readiness-brief.mjs', '--send'], {
    encoding: 'utf8',
    env: {},
  });
  assert.equal(failure.status, 1);
  assert.match(failure.stderr, /EMAIL_PROVIDER_READINESS_BRIEF_FAILED/);
});
