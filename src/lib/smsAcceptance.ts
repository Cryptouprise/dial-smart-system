export type AcceptedSmsEnvelope = {
  success: true;
  sent: true;
  provider: 'twilio' | 'telnyx';
  provider_message_id: string;
  message_id?: string | null;
};

/**
 * A UI send is successful only after the transport boundary proves that its
 * provider accepted the message. Generic `success: true` responses are not
 * sufficient because they may describe a skipped or reconciliation state.
 */
export function assertAcceptedSmsEnvelope(value: unknown): asserts value is AcceptedSmsEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('SMS transport returned an invalid response');
  }

  const response = value as Record<string, unknown>;
  if (
    response.success !== true
    || response.sent !== true
    || response.skipped === true
    || response.error
    || (response.provider !== 'twilio' && response.provider !== 'telnyx')
    || typeof response.provider_message_id !== 'string'
    || !response.provider_message_id
  ) {
    throw new Error(
      typeof response.error === 'string'
        ? response.error
        : 'SMS provider acceptance could not be confirmed',
    );
  }
}
