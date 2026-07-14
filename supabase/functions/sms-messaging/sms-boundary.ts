export type SmsProvider = 'twilio' | 'telnyx';

export type SmsPhoneRecord = {
  id?: string;
  number?: string | null;
  provider?: string | null;
  status?: string | null;
  capabilities?: unknown;
  allowed_uses?: unknown;
};

/** Convert a dialable NANP/international number to a stable E.164-style value. */
export function canonicalSmsPhone(value: string): string {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  throw new Error('SMS phone number must contain 8 to 15 digits');
}

export function sameSmsPhone(left: string, right: string): boolean {
  try {
    return canonicalSmsPhone(left) === canonicalSmsPhone(right);
  } catch {
    return false;
  }
}

/** Values used for indexed lookups against legacy phone columns. */
export function smsPhoneLookupVariants(value: string): string[] {
  const canonical = canonicalSmsPhone(value);
  const digits = canonical.slice(1);
  const last10 = digits.slice(-10);
  return [...new Set([
    canonical,
    digits,
    last10,
    last10.length === 10 ? `1${last10}` : '',
    last10.length === 10 ? `+1${last10}` : '',
  ].filter(Boolean))];
}

export function requireSmsIdempotencyKey(value: unknown): string {
  const key = typeof value === 'string' ? value.trim() : '';
  if (key.length < 8 || key.length > 512) {
    throw new Error('A stable idempotency_key between 8 and 512 characters is required');
  }
  return key;
}

/**
 * SMS delivery is certified only for a user with exactly one organization
 * membership. Resource tables in the current certified schema are user-owned;
 * choosing an arbitrary membership for a multi-org user would cross tenants.
 */
export function resolveSmsOrganization(input: {
  memberships: Array<{ organization_id?: string | null }>;
  requestedOrganizationId?: string | null;
}): string {
  const memberships = [...new Set(
    input.memberships.map((row) => row.organization_id).filter((value): value is string => Boolean(value)),
  )];
  if (memberships.length !== 1) {
    throw new Error(memberships.length === 0
      ? 'No organization membership is available for SMS sending'
      : 'SMS sending is disabled for multi-organization users until tenant resources are certified');
  }
  if (input.requestedOrganizationId && input.requestedOrganizationId !== memberships[0]) {
    throw new Error('SMS tenant context does not match the authenticated user membership');
  }
  return memberships[0];
}

export function selectOwnedSmsNumber(
  records: SmsPhoneRecord[],
  requestedNumber: string,
): SmsPhoneRecord & { provider: SmsProvider } {
  const matches = records.filter((record) =>
    String(record.status || '').toLowerCase() === 'active'
    && Boolean(record.number)
    && sameSmsPhone(record.number!, requestedNumber)
  );
  if (matches.length !== 1) {
    throw new Error(matches.length === 0
      ? 'From number is not an active number owned by the authenticated user'
      : 'From number ownership is ambiguous for the authenticated user');
  }

  const selected = matches[0];
  const provider = String(selected.provider || '').toLowerCase();
  if (provider !== 'twilio' && provider !== 'telnyx') {
    throw new Error('From number does not have a certified SMS provider');
  }

  const capabilities = selected.capabilities;
  if (capabilities && typeof capabilities === 'object' && !Array.isArray(capabilities)) {
    const smsCapability = (capabilities as Record<string, unknown>).sms;
    if (smsCapability === false) throw new Error('From number is not SMS capable');
  }

  if (Array.isArray(selected.allowed_uses) && selected.allowed_uses.length > 0) {
    const allowed = selected.allowed_uses.map((value) => String(value).toLowerCase());
    if (!allowed.includes('sms')) throw new Error('From number is not approved for SMS use');
  }

  return { ...selected, provider } as SmsPhoneRecord & { provider: SmsProvider };
}

export function assertAcceptedSmsEnvelope(value: unknown): asserts value is {
  success: true;
  sent: true;
  provider: SmsProvider;
  provider_message_id: string;
  message_id?: string | null;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('sms-messaging returned a non-object response');
  }
  const body = value as Record<string, unknown>;
  if (body.success !== true || body.sent !== true || body.skipped === true || body.error) {
    throw new Error(`sms-messaging did not accept the message: ${String(body.error || body.message || 'unknown error')}`);
  }
  if ((body.provider !== 'twilio' && body.provider !== 'telnyx') || !body.provider_message_id) {
    throw new Error('sms-messaging returned an incomplete provider acceptance envelope');
  }
}

export type SmsClaimDisposition = 'send' | 'accepted_replay' | 'reconcile' | 'rejected';

export function smsClaimDisposition(claim: {
  claimed: boolean;
  current_status?: string | null;
  existing_provider_message_id?: string | null;
}): SmsClaimDisposition {
  if (claim.claimed) return 'send';
  if (claim.current_status === 'accepted' && claim.existing_provider_message_id) return 'accepted_replay';
  if (claim.current_status === 'claimed' || claim.current_status === 'acceptance_unknown') return 'reconcile';
  return 'rejected';
}
