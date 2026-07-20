import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const migration = readFileSync(resolve('supabase/migrations/20260720140000_elite_email_release_registration.sql'), 'utf8');
const handler = readFileSync(resolve('supabase/functions/elite-email-release-registration/handler.ts'), 'utf8');
const index = readFileSync(resolve('supabase/functions/elite-email-release-registration/index.ts'), 'utf8');

test('Elite email release registration is service-only, immutable, pending-only, and cannot create execution authority', () => {
  assert.match(migration, /^\s*BEGIN;\s*/);
  assert.match(migration, /\sCOMMIT;\s*$/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.register_elite_email_execution_release/);
  assert.match(migration, /INSERT INTO public\.elite_email_execution_releases/);
  assert.match(migration, /ON CONFLICT DO NOTHING/);
  assert.match(migration, /EMAIL_RELEASE_REGISTERED_PENDING_ADAPTER_VERIFICATION/);
  assert.match(migration, /EMAIL_RELEASE_ALREADY_REGISTERED/);
  assert.doesNotMatch(migration, /\bUPDATE\s+public\.elite_email_execution_releases\b/i);
  assert.doesNotMatch(migration, /\bINSERT\s+INTO\s+public\.leads\b/i);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.register_elite_email_execution_release[\s\S]*?TO service_role;/);
  assert.doesNotMatch(migration, /GRANT EXECUTE ON FUNCTION public\.register_elite_email_execution_release[^;]*TO authenticated;/);
});

test('release registration verifies a bounded HMAC artifact without a provider, browser database, or generic egress path', () => {
  assert.match(handler, /ELITE_EMAIL_RELEASE_REGISTRATION_ENABLED/);
  assert.match(handler, /ELITE_EMAIL_RELEASE_REGISTRATION_SIGNING_HMAC_KEY/);
  assert.match(handler, /canonicalJson\(body\)/);
  assert.match(handler, /pending adapter verification/);
  assert.match(handler, /cannot prepare, claim, send, import, or invoke a provider/);
  assert.doesNotMatch(handler, /fetch\s*\(/);
  assert.doesNotMatch(handler, /\.from\(/);
  assert.match(index, /register_elite_email_execution_release/);
  assert.doesNotMatch(index, /\.from\(/);
});
