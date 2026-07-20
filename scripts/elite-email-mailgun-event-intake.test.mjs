import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const migration = readFileSync(resolve('supabase/migrations/20260720130000_elite_email_mailgun_event_intake.sql'), 'utf8');
const handler = readFileSync(resolve('supabase/functions/elite-email-mailgun-events/handler.ts'), 'utf8');
const index = readFileSync(resolve('supabase/functions/elite-email-mailgun-events/index.ts'), 'utf8');

test('Mailgun event intake is an isolated service-only, replay-resistant release receipt boundary', () => {
  assert.match(migration, /^\s*BEGIN;\s*/);
  assert.match(migration, /\sCOMMIT;\s*$/);
  assert.match(migration, /provider_token_fingerprint text/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS elite_email_provider_event_receipts_provider_token_key/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.record_elite_email_mailgun_event_receipt/);
  assert.match(migration, /v_release\.provider <> 'mailgun'/);
  assert.match(migration, /v_release\.provider_account_reference <> p_provider_account_reference/);
  assert.match(migration, /v_release\.sender_domain <> lower\(p_sender_domain\)/);
  assert.match(migration, /ON CONFLICT DO NOTHING/);
  assert.match(migration, /EMAIL_EVENT_DUPLICATE_OR_REPLAY/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.record_elite_email_mailgun_event_receipt[\s\S]*?TO service_role;/);
  assert.doesNotMatch(migration, /GRANT EXECUTE ON FUNCTION public\.record_elite_email_mailgun_event_receipt[^;]*TO authenticated;/);
});

test('Mailgun event handler verifies HMAC and cannot contact providers or mutate recipient/suppression data', () => {
  assert.match(handler, /parseBoundedJsonObject/);
  assert.match(handler, /crypto\.subtle\.sign\(\s*"HMAC"/);
  assert.match(handler, /\$\{timestamp\}\$\{token\}/);
  assert.match(handler, /providerTokenFingerprint/);
  assert.match(handler, /ELITE_EMAIL_MAILGUN_EVENTS_ENABLED/);
  assert.match(handler, /not send, import, mutate suppressions/);
  assert.doesNotMatch(handler, /fetch\s*\(/);
  assert.doesNotMatch(handler, /INSERT\s+INTO\s+public\.leads/i);
  assert.doesNotMatch(index, /\.from\(/);
  assert.match(index, /record_elite_email_mailgun_event_receipt/);
});
