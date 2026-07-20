import { createHmac } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{7,255}$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[A-Za-z]{2,63}$/;
const NO_AUTHORITY = Object.freeze({
  contact_authorized: false,
  launch_authorized: false,
  queue_mutation_authorized: false,
  crm_write_authorized: false,
  provider_write_authorized: false,
  spend_authorized: false,
});
const INSTANTLY = Object.freeze({
  email_sent: ['email_sent', false, false, false],
  email_opened: ['email_opened', false, false, false],
  link_clicked: ['link_clicked', false, false, false],
  reply_received: ['reply_received', true, false, true],
  auto_reply_received: ['auto_reply_received', true, false, true],
  email_bounced: ['permanent_bounce', true, true, true],
  lead_unsubscribed: ['unsubscribe', true, true, true],
  account_error: ['provider_error', true, false, true],
  campaign_completed: ['campaign_completed', true, false, true],
  lead_neutral: ['lead_neutral', false, false, false],
  lead_interested: ['lead_interested', true, false, true],
  lead_not_interested: ['lead_not_interested', true, true, true],
  lead_meeting_booked: ['meeting_booked', true, false, true],
  lead_meeting_completed: ['meeting_completed', true, false, true],
  lead_closed: ['lead_closed', true, true, true],
  lead_out_of_office: ['out_of_office', true, false, true],
  lead_wrong_person: ['wrong_person', true, true, true],
});
const MAILGUN = Object.freeze({
  accepted: ['email_accepted', false, false, false],
  delivered: ['email_delivered', false, false, false],
  opened: ['email_opened', false, false, false],
  clicked: ['link_clicked', false, false, false],
  unsubscribed: ['unsubscribe', true, true, true],
  complained: ['spam_complaint', true, true, true],
});

export class EmailProviderEventReceiptError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'EmailProviderEventReceiptError';
    this.code = code;
  }
}

function plainObject(value, path) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new EmailProviderEventReceiptError('OBJECT_REQUIRED', `${path} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new EmailProviderEventReceiptError('OBJECT_REQUIRED', `${path} must be a plain object`);
  }
  return value;
}

function exact(value, path, allowed) {
  const record = plainObject(value, path);
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) throw new EmailProviderEventReceiptError('UNKNOWN_FIELD', `${path}.${key} is not allowed`);
  }
  for (const key of allowed) {
    if (!Object.hasOwn(record, key)) throw new EmailProviderEventReceiptError('REQUIRED_FIELD', `${path}.${key} is required`);
  }
  return record;
}

function text(value, path, min, max) {
  if (typeof value !== 'string' || value !== value.trim() || value.length < min || value.length > max) {
    throw new EmailProviderEventReceiptError('TEXT_INVALID', `${path} must be a trimmed ${min}-${max} character string`);
  }
  if (/[\x00-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/.test(value)) {
    throw new EmailProviderEventReceiptError('TEXT_UNSAFE', `${path} contains unsafe formatting characters`);
  }
  return value;
}

function uuid(value, path) {
  const candidate = text(value, path, 36, 36);
  if (!UUID.test(candidate)) throw new EmailProviderEventReceiptError('UUID_INVALID', `${path} must be a canonical lowercase UUID`);
  return candidate;
}

function reference(value, path) {
  const candidate = text(value, path, 8, 256);
  if (!REFERENCE.test(candidate)) throw new EmailProviderEventReceiptError('REFERENCE_INVALID', `${path} must be a safe provider reference`);
  return candidate;
}

function optionalEmail(value, path) {
  if (value === undefined || value === null || value === '[REDACTED]') return null;
  const candidate = text(value, path, 3, 320).toLowerCase();
  if (!EMAIL.test(candidate)) throw new EmailProviderEventReceiptError('EMAIL_INVALID', `${path} must be a valid email address or absent`);
  return candidate;
}

function iso(value, path) {
  const candidate = text(value, path, 20, 40);
  const parsed = Date.parse(candidate);
  if (Number.isNaN(parsed)) throw new EmailProviderEventReceiptError('TIMESTAMP_INVALID', `${path} must be ISO-8601`);
  return new Date(parsed).toISOString();
}

function unix(value, path) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 4_102_444_800) {
    throw new EmailProviderEventReceiptError('TIMESTAMP_INVALID', `${path} must be a plausible Unix timestamp`);
  }
  return new Date(Math.round(value * 1_000)).toISOString();
}

function key(value) {
  if (!(value instanceof Uint8Array) || value.byteLength < 32 || value.byteLength > 4096) {
    throw new EmailProviderEventReceiptError('HMAC_KEY_INVALID', 'identifier_hmac_key must be 32-4096 bytes');
  }
  return value;
}

function hmac(secret, material) {
  return `hmac-sha256:${createHmac('sha256', Buffer.from(secret)).update(material, 'utf8').digest('hex')}`;
}

function normalizeInstantly(payload, binding) {
  const record = plainObject(payload, '$.payload');
  const workspace = uuid(record.workspace, '$.payload.workspace');
  const providerCampaign = uuid(record.campaign_id, '$.payload.campaign_id');
  if (workspace !== binding.workspace_id || providerCampaign !== binding.campaign_id) {
    throw new EmailProviderEventReceiptError('PROVIDER_BINDING_MISMATCH', 'Instantly payload does not match the configured workspace/campaign binding');
  }
  const eventType = text(record.event_type, '$.payload.event_type', 3, 80);
  const event = INSTANTLY[eventType];
  if (!event) throw new EmailProviderEventReceiptError('EVENT_TYPE_UNSUPPORTED', 'Instantly custom or unsupported event types are held for adapter review');
  const occurredAt = iso(record.timestamp, '$.payload.timestamp');
  const recipient = optionalEmail(record.lead_email, '$.payload.lead_email');
  const emailId = record.email_id === undefined ? '' : text(record.email_id, '$.payload.email_id', 1, 256);
  return { event, occurredAt, recipient, material: `instantly|${workspace}|${providerCampaign}|${eventType}|${occurredAt}|${emailId}|${recipient ?? 'none'}` };
}

function normalizeMailgun(payload, binding) {
  const record = plainObject(payload, '$.payload');
  const account = plainObject(record.account, '$.payload.account');
  const domain = plainObject(record.domain, '$.payload.domain');
  const accountId = reference(account.id, '$.payload.account.id');
  const domainName = text(domain.name, '$.payload.domain.name', 4, 253).toLowerCase();
  if (accountId !== binding.account_id || domainName !== binding.domain) {
    throw new EmailProviderEventReceiptError('PROVIDER_BINDING_MISMATCH', 'Mailgun payload does not match the configured account/domain binding');
  }
  const eventType = text(record.event, '$.payload.event', 3, 32);
  let event = MAILGUN[eventType];
  if (eventType === 'failed') {
    // Mailgun's current webhook payload puts failure severity at the event
    // root. Accept the older nested shape only for offline historical review;
    // neither shape is trusted until a server-side webhook signature verifies.
    const legacyStatus = record['delivery-status'] === undefined
      ? null
      : plainObject(record['delivery-status'], '$.payload.delivery-status');
    const severity = text(
      record.severity === undefined ? legacyStatus?.severity : record.severity,
      record.severity === undefined ? '$.payload.delivery-status.severity' : '$.payload.severity',
      7,
      9,
    );
    if (severity === 'permanent') event = ['permanent_bounce', true, true, true];
    if (severity === 'temporary') event = ['temporary_delivery_failure', true, false, true];
  }
  if (!event) throw new EmailProviderEventReceiptError('EVENT_TYPE_UNSUPPORTED', 'Mailgun event type is unsupported or missing its required severity');
  const eventId = reference(record.id, '$.payload.id');
  return {
    event,
    occurredAt: unix(record.timestamp, '$.payload.timestamp'),
    recipient: optionalEmail(record.recipient, '$.payload.recipient'),
    material: `mailgun|${accountId}|${domainName}|${eventType}|${eventId}`,
  };
}

/**
 * Converts a previously authenticated provider event into a bounded non-PII
 * receipt. It does no I/O, does not verify provider signatures, and cannot
 * create campaigns, send messages, or mutate suppressions. A future
 * server-side adapter must verify the provider signature/header first.
 */
export function normalizeEmailProviderEventReceipt(input) {
  const root = exact(input, '$', [
    'provider', 'organization_id', 'campaign_id', 'provider_account_reference',
    'provider_binding', 'payload', 'identifier_hmac_key', 'received_at',
  ]);
  const provider = text(root.provider, '$.provider', 7, 16);
  if (provider !== 'instantly' && provider !== 'mailgun') {
    throw new EmailProviderEventReceiptError('PROVIDER_UNSUPPORTED', '$.provider must be instantly or mailgun');
  }
  const organizationId = uuid(root.organization_id, '$.organization_id');
  const campaignId = uuid(root.campaign_id, '$.campaign_id');
  const providerAccountReference = reference(root.provider_account_reference, '$.provider_account_reference');
  const hmacKey = key(root.identifier_hmac_key);
  const receivedAt = iso(root.received_at, '$.received_at');
  let normalized;
  if (provider === 'instantly') {
    const binding = exact(root.provider_binding, '$.provider_binding', ['workspace_id', 'campaign_id']);
    normalized = normalizeInstantly(root.payload, {
      workspace_id: uuid(binding.workspace_id, '$.provider_binding.workspace_id'),
      campaign_id: uuid(binding.campaign_id, '$.provider_binding.campaign_id'),
    });
  } else {
    const binding = exact(root.provider_binding, '$.provider_binding', ['account_id', 'domain']);
    normalized = normalizeMailgun(root.payload, {
      account_id: reference(binding.account_id, '$.provider_binding.account_id'),
      domain: text(binding.domain, '$.provider_binding.domain', 4, 253).toLowerCase(),
    });
  }
  const [eventKind, attention, suppression, review] = normalized.event;
  const correlationUnavailable = normalized.recipient === null;
  return Object.freeze({
    kind: 'elite_email_provider_event_receipt_v1',
    provider,
    organization_id: organizationId,
    campaign_id: campaignId,
    provider_account_reference: providerAccountReference,
    event_kind: eventKind,
    occurred_at: normalized.occurredAt,
    received_at: receivedAt,
    receipt_fingerprint: hmac(hmacKey, `receipt|${organizationId}|${campaignId}|${normalized.material}`),
    recipient_fingerprint: correlationUnavailable ? null : hmac(hmacKey, `recipient|${organizationId}|${normalized.recipient}`),
    suppression_review_required: suppression,
    human_review_required: review || correlationUnavailable,
    operator_attention_required: attention || correlationUnavailable,
    correlation_status: correlationUnavailable ? 'recipient_redacted_or_absent' : 'recipient_hmac_bound',
    provider_action: 'none',
    authority: NO_AUTHORITY,
    side_effect_invariants: Object.freeze({ database_reads: 0, database_writes: 0, network_requests: 0, provider_calls: 0, external_messages: 0 }),
  });
}
