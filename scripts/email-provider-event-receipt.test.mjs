import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EmailProviderEventReceiptError,
  normalizeEmailProviderEventReceipt,
} from './lib/email-provider-event-receipt.mjs';

const IDS = Object.freeze({
  organization: '123e4567-e89b-42d3-a456-426614174000',
  campaign: '223e4567-e89b-42d3-a456-426614174000',
  workspace: '323e4567-e89b-42d3-a456-426614174000',
  providerCampaign: '423e4567-e89b-42d3-a456-426614174000',
});
const KEY = new Uint8Array(32).fill(7);

function instantlyInput(overrides = {}) {
  return {
    provider: 'instantly',
    organization_id: IDS.organization,
    campaign_id: IDS.campaign,
    provider_account_reference: 'instantly-elite-account-v1',
    provider_binding: { workspace_id: IDS.workspace, campaign_id: IDS.providerCampaign },
    payload: {
      timestamp: '2026-07-20T14:00:00.000Z',
      event_type: 'reply_received',
      workspace: IDS.workspace,
      campaign_id: IDS.providerCampaign,
      campaign_name: 'Elite Solar Recovery',
      lead_email: 'person@example.test',
      email_id: 'reply-00000001',
      reply_text: 'Please call me tomorrow.',
    },
    identifier_hmac_key: KEY,
    received_at: '2026-07-20T14:01:00.000Z',
    ...overrides,
  };
}

function mailgunInput(overrides = {}) {
  return {
    provider: 'mailgun',
    organization_id: IDS.organization,
    campaign_id: IDS.campaign,
    provider_account_reference: 'mailgun-elite-account-v1',
    provider_binding: { account_id: '1234567890303a4bd1f33898', domain: 'mail.example.test' },
    payload: {
      account: { id: '1234567890303a4bd1f33898' },
      domain: { name: 'mail.example.test' },
      event: 'failed',
      id: 'mailgun-event-0001',
      timestamp: 1784556000,
      recipient: 'person@example.test',
      'delivery-status': { severity: 'permanent' },
      message: { headers: { subject: 'Never expose this' } },
    },
    identifier_hmac_key: KEY,
    received_at: '2026-07-20T14:01:00.000Z',
    ...overrides,
  };
}

test('normalizes an Instantly reply into a redacted, review-only receipt', () => {
  const receipt = normalizeEmailProviderEventReceipt(instantlyInput());

  assert.equal(receipt.event_kind, 'reply_received');
  assert.equal(receipt.human_review_required, true);
  assert.equal(receipt.suppression_review_required, false);
  assert.match(receipt.recipient_fingerprint, /^hmac-sha256:[a-f0-9]{64}$/);
  assert.match(receipt.receipt_fingerprint, /^hmac-sha256:[a-f0-9]{64}$/);
  assert.equal(receipt.authority.provider_write_authorized, false);
  const serialized = JSON.stringify(receipt);
  assert.equal(serialized.includes('person@example.test'), false);
  assert.equal(serialized.includes('Please call me tomorrow.'), false);
});

test('maps unsubscribe and permanent Mailgun failure to mandatory suppression review without performing it', () => {
  const unsubscribe = normalizeEmailProviderEventReceipt(instantlyInput({
    payload: { ...instantlyInput().payload, event_type: 'lead_unsubscribed' },
  }));
  const bounce = normalizeEmailProviderEventReceipt(mailgunInput());

  assert.equal(unsubscribe.event_kind, 'unsubscribe');
  assert.equal(unsubscribe.suppression_review_required, true);
  assert.equal(bounce.event_kind, 'permanent_bounce');
  assert.equal(bounce.suppression_review_required, true);
  assert.equal(bounce.authority.crm_write_authorized, false);
  assert.equal(bounce.side_effect_invariants.database_writes, 0);
});

test('holds Mailgun redacted-recipient events for human correlation instead of manufacturing a recipient match', () => {
  const receipt = normalizeEmailProviderEventReceipt(mailgunInput({
    payload: { ...mailgunInput().payload, recipient: '[REDACTED]' },
  }));

  assert.equal(receipt.recipient_fingerprint, null);
  assert.equal(receipt.correlation_status, 'recipient_redacted_or_absent');
  assert.equal(receipt.human_review_required, true);
  assert.equal(receipt.operator_attention_required, true);
});

test('fails closed for custom events, mismatched bindings, malformed failure severity, and weak identifier keys', () => {
  assert.throws(
    () => normalizeEmailProviderEventReceipt(instantlyInput({
      payload: { ...instantlyInput().payload, event_type: 'custom_label' },
    })),
    (error) => error instanceof EmailProviderEventReceiptError && error.code === 'EVENT_TYPE_UNSUPPORTED',
  );
  assert.throws(
    () => normalizeEmailProviderEventReceipt(instantlyInput({
      payload: { ...instantlyInput().payload, workspace: IDS.providerCampaign },
    })),
    (error) => error instanceof EmailProviderEventReceiptError && error.code === 'PROVIDER_BINDING_MISMATCH',
  );
  assert.throws(
    () => normalizeEmailProviderEventReceipt(mailgunInput({
      payload: { ...mailgunInput().payload, 'delivery-status': { severity: 'unknown' } },
    })),
    (error) => error instanceof EmailProviderEventReceiptError && error.code === 'EVENT_TYPE_UNSUPPORTED',
  );
  assert.throws(
    () => normalizeEmailProviderEventReceipt(instantlyInput({ identifier_hmac_key: new Uint8Array(3) })),
    (error) => error instanceof EmailProviderEventReceiptError && error.code === 'HMAC_KEY_INVALID',
  );
});
