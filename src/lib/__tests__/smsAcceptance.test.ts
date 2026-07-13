import { describe, expect, it } from 'vitest';

import { assertAcceptedSmsEnvelope } from '../smsAcceptance';

describe('assertAcceptedSmsEnvelope', () => {
  it('accepts an explicit provider acceptance envelope', () => {
    expect(() => assertAcceptedSmsEnvelope({
      success: true,
      sent: true,
      provider: 'twilio',
      provider_message_id: 'SM123',
    })).not.toThrow();
  });

  it.each([
    { success: true },
    { success: true, sent: false, provider: 'twilio', provider_message_id: 'SM123' },
    { success: true, sent: true, provider: 'twilio' },
    { success: true, sent: true, skipped: true, provider: 'twilio', provider_message_id: 'SM123' },
    { success: true, sent: true, provider: 'unknown', provider_message_id: 'SM123' },
  ])('rejects incomplete or non-accepted responses', (response) => {
    expect(() => assertAcceptedSmsEnvelope(response)).toThrow();
  });
});
