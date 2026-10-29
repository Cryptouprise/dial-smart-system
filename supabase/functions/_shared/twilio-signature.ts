/**
 * Twilio webhook signature validation.
 *
 * Twilio signs every webhook with HMAC-SHA1 over:
 *   full_url + concat(sorted by name: param_name + param_value for each POST param)
 * using TWILIO_AUTH_TOKEN as the key, base64-encoded, sent as X-Twilio-Signature.
 * (Doc: "Validating Signatures from Twilio", twilio.com/docs/usage/webhooks/webhooks-security)
 *
 * This project did not validate it anywhere before; this module is the single
 * implementation used by every twilio-voice-* function.
 */

import { constantTimeEqualBytes } from './stripe-signature.ts';

function base64Decode(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

export async function verifyTwilioSignature(input: {
  url: string;
  params: Record<string, string>;
  signature: string;
  authToken: string;
}): Promise<boolean> {
  if (!input.url || !input.signature || !input.authToken) return false;

  const sortedKeys = Object.keys(input.params).sort();
  let data = input.url;
  for (const key of sortedKeys) {
    data += key + input.params[key];
  }

  try {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(input.authToken),
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign'],
    );
    const expected = new Uint8Array(
      await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data)),
    );
    const supplied = base64Decode(input.signature.trim());
    if (!supplied) return false;
    return constantTimeEqualBytes(expected, supplied);
  } catch {
    return false;
  }
}

/** Parse an application/x-www-form-urlencoded body into the flat map Twilio signs. */
export function formParams(rawBody: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(rawBody).entries()) params[k] = v;
  return params;
}
