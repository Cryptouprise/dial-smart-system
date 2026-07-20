import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const migration = readFileSync(resolve('supabase/migrations/20260720150000_elite_email_release_preparation.sql'), 'utf8');
const migrationCode = migration.replace(/^--.*$/gm, '');

test('Elite email preparation stores no PII and is service-only, exact-bound, and one-way', () => {
  assert.match(migration, /^\s*BEGIN;\s*/);
  assert.match(migration, /\sCOMMIT;\s*$/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.elite_email_release_preparation_attestations/);
  assert.match(migration, /release_id uuid NOT NULL UNIQUE/);
  assert.match(migration, /recipient_manifest_sha256 text NOT NULL/);
  assert.match(migration, /suppression_snapshot_sha256 text NOT NULL/);
  assert.doesNotMatch(migrationCode, /email_address|recipient_email|message_body|provider_key|mailbox/i);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.prepare_elite_email_execution_release/);
  assert.match(migration, /FOR UPDATE;/);
  assert.match(migration, /evaluate_contact_stop\([\s\S]*?'email'/);
  assert.match(migration, /EMAIL_PREPARATION_RELEASE_EVIDENCE_MISMATCH/);
  assert.match(migration, /EMAIL_RELEASE_PREPARED_NO_PROVIDER_ACTION/);
  assert.match(migration, /SET status = 'prepared', prepared_at = now\(\)/);
  assert.match(migration, /AS attestation\s+WHERE attestation\.release_id = v_release\.id/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.prepare_elite_email_execution_release[\s\S]*?TO service_role;/);
  assert.doesNotMatch(migration, /GRANT EXECUTE ON FUNCTION public\.prepare_elite_email_execution_release[^;]*TO authenticated;/);
});

test('preparation cannot claim, send, import, or make a provider request', () => {
  const preparation = migration.match(/CREATE OR REPLACE FUNCTION public\.prepare_elite_email_execution_release[\s\S]*?\n\$\$;/)?.[0] || '';
  assert.ok(preparation);
  assert.doesNotMatch(preparation, /\bclaimed\b/i);
  assert.doesNotMatch(preparation, /provider_accepted/i);
  assert.doesNotMatch(preparation, /\bINSERT\s+INTO\s+public\.leads\b/i);
  assert.doesNotMatch(preparation, /http|webhook|fetch|mailgun|instantly/i);
});
