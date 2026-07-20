import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const migrationPath = resolve('supabase/migrations/20260720120000_elite_email_execution_ledger.sql');
const migration = readFileSync(migrationPath, 'utf8');
const compact = migration.replace(/\s+/g, ' ').trim();

test('Elite email execution ledger is a single default-deny transaction with immutable release and receipt records', () => {
  assert.match(migration, /^\s*BEGIN;\s*/);
  assert.match(migration, /\sCOMMIT;\s*$/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.elite_email_execution_releases/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.elite_email_provider_event_receipts/);
  assert.match(migration, /status text NOT NULL DEFAULT 'pending_adapter_provisioning'/);
  assert.match(migration, /ELITE_EMAIL_EXECUTION_RELEASE_INITIAL_STATE_INVALID/);
  assert.match(migration, /ELITE_EMAIL_EXECUTION_RELEASE_STATUS_TRANSITION_INVALID/);
  assert.match(migration, /ELITE_EMAIL_PROVIDER_EVENT_RECEIPT_IMMUTABLE/);
  assert.match(migration, /UNIQUE \(organization_id, idempotency_key\)/);
  assert.match(migration, /UNIQUE \(provider, receipt_fingerprint\)/);
  assert.match(migration, /recipient_count integer NOT NULL CHECK \(recipient_count BETWEEN 1 AND 25\)/);
});

test('Elite email release claim is tenant-bound, atomic, and service-role-only', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.claim_elite_email_execution_release/);
  assert.match(migration, /WHERE id = p_release_id\s+FOR UPDATE;/);
  assert.match(migration, /v_release\.organization_id <> p_organization_id/);
  assert.match(migration, /v_release\.campaign_id <> p_campaign_id/);
  assert.match(migration, /v_release\.release_fingerprint <> p_release_fingerprint/);
  assert.match(migration, /v_release\.idempotency_key <> p_idempotency_key/);
  assert.match(migration, /IF v_release\.status = 'claimed'/);
  assert.match(migration, /IF v_release\.status <> 'prepared'/);
  assert.match(migration, /SET status = 'claimed', claimed_at = now\(\)/);
  assert.match(migration, /EMAIL_RELEASE_CLAIM_RACE_LOST/);
  assert.match(migration, /FROM public\.evaluate_contact_stop\(/);
  assert.match(migration, /'email'/);
  assert.match(migration, /EMAIL_RELEASE_STOP_CONTROL_ACTIVE/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.claim_elite_email_execution_release[\s\S]*?TO service_role;/);
  assert.doesNotMatch(compact, /GRANT EXECUTE ON FUNCTION public\.claim_elite_email_execution_release[^;]*TO authenticated;/);
});

test('Elite email ledger has no raw-recipient, raw-message, mailbox, or credential storage surface', () => {
  const forbiddenColumn = /^\s*(?:recipient_email|recipient_address|email_address|raw_payload|provider_payload|message_body|html_body|text_body|api_key|provider_key|mailbox)\s+/im;
  assert.doesNotMatch(migration, forbiddenColumn);
  assert.doesNotMatch(migration, /\bINSERT\s+INTO\s+public\.leads\b/i);
  assert.doesNotMatch(migration, /\bUPDATE\s+public\.leads\b/i);
  assert.match(migration, /recipient_fingerprint text CHECK/);
  assert.match(migration, /receipt_fingerprint text NOT NULL CHECK/);
  assert.match(migration, /Raw recipient addresses and provider payloads are forbidden/);
});

test('only tenant members can obtain a summary, while tables remain inaccessible to browser roles', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.get_elite_email_execution_release_status/);
  assert.match(migration, /membership\.user_id = auth\.uid\(\)/);
  assert.match(migration, /final_adapter_evaluation_required boolean/);
  assert.match(migration, /ALTER TABLE public\.elite_email_execution_releases ENABLE ROW LEVEL SECURITY;/);
  assert.match(migration, /ALTER TABLE public\.elite_email_provider_event_receipts ENABLE ROW LEVEL SECURITY;/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.elite_email_execution_releases FROM PUBLIC, anon, authenticated;/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.elite_email_provider_event_receipts FROM PUBLIC, anon, authenticated;/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.get_elite_email_execution_release_status\(uuid\) TO authenticated, service_role;/);
});

test('the shared stop-control vocabulary includes email before an email release can be claimed', () => {
  assert.match(migration, /DROP CONSTRAINT IF EXISTS contact_stop_controls_channel_check;/);
  assert.match(migration, /CHECK \(channel IN \('all', 'voice', 'sms', 'email'\)\)/);
});
