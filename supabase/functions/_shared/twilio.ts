/**
 * Twilio browser-phone provider.
 *
 * Token = AccessToken with VoiceGrant, built by hand with HMAC-SHA256 (no npm
 * import). Verified shape (team lead, 2026-10-29):
 *   header  {alg:'HS256', typ:'JWT', cty:'twilio-fpa;v=1'}
 *   payload {jti, iss: API_KEY_SID, sub: ACCOUNT_SID, exp,
 *            grants:{identity, voice:{outgoing:{application_sid}, incoming:{allow:false}}}}
 *   signed with API_KEY_SECRET.
 *
 * The browser SDK then calls device.connect({params}); Twilio POSTs the params
 * to our `twilio-voice-twiml` function (the TwiML App voice URL), which loads
 * the call_logs row the browser named and returns
 *   <Start><Transcription statusCallbackUrl=... track="both_tracks"/></Start>
 *   <Dial callerId=... record="record-from-answer-dual" recordingStatusCallback=...>
 *     <Number statusCallback=...>to</Number>
 *   </Dial>
 * Twilio real-time transcription is GA (verified: TwiML <Transcription>; the
 * statusCallbackUrl receives TranscriptionEvent in {transcription-started,
 * transcription-content, transcription-stopped, transcription-error}; content
 * events carry TranscriptionData (JSON string with "transcript" + "confidence"),
 * Track (inbound_track|outbound_track), Final, SequenceId, CallSid).
 *
 * VERIFY: on the parent (browser/client) call, inbound_track = audio Twilio
 *   receives from the caller (the rep); outbound_track = the contact.
 *   Doc: "TwiML Voice: <Transcription>" attribute `track`.
 */

import type {
  ActionContext,
  ActionInput,
  BrowserPhoneProvider,
  MintTokenContext,
  MintTokenResult,
  NormalizedEvent,
  StartOutboundContext,
  StartOutboundResult,
  TranscriptSpeaker,
} from './voice-provider.ts';
import { publicFunctionsBaseUrl } from './voice-provider.ts';
import { formParams, verifyTwilioSignature } from './twilio-signature.ts';

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';

function requireEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlEncodeString(value: string): string {
  return base64UrlEncode(new TextEncoder().encode(value));
}

async function hmacSha256(key: string, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message)));
}

export function twilioIdentityForUser(userId: string): string {
  return `user_${userId}`;
}

/** Inverse of twilioIdentityForUser; accepts the `client:` prefix Twilio adds to From. */
export function userIdFromTwilioIdentity(value: string | null | undefined): string | null {
  if (!value) return null;
  const stripped = value.replace(/^client:/i, '');
  const match = /^user_([0-9a-f-]{36})$/i.exec(stripped);
  return match ? match[1].toLowerCase() : null;
}

async function buildAccessToken(identity: string): Promise<{ token: string; expires_at: string }> {
  const apiKeySid = requireEnv('TWILIO_API_KEY_SID');
  const apiKeySecret = requireEnv('TWILIO_API_KEY_SECRET');
  const accountSid = requireEnv('TWILIO_ACCOUNT_SID');
  const twimlAppSid = requireEnv('TWILIO_TWIML_APP_SID');

  const nowSeconds = Math.floor(Date.now() / 1000);
  const ttlSeconds = 3600;
  const exp = nowSeconds + ttlSeconds;

  const header = { alg: 'HS256', typ: 'JWT', cty: 'twilio-fpa;v=1' };
  const payload = {
    jti: `${apiKeySid}-${nowSeconds}-${crypto.randomUUID()}`,
    iss: apiKeySid,
    sub: accountSid,
    iat: nowSeconds,
    exp,
    grants: {
      identity,
      voice: {
        outgoing: { application_sid: twimlAppSid },
        incoming: { allow: false },
      },
    },
  };

  const signingInput = `${base64UrlEncodeString(JSON.stringify(header))}.${base64UrlEncodeString(JSON.stringify(payload))}`;
  const signature = base64UrlEncode(await hmacSha256(apiKeySecret, signingInput));
  return {
    token: `${signingInput}.${signature}`,
    expires_at: new Date(exp * 1000).toISOString(),
  };
}

function twilioAuthHeader(): string {
  const accountSid = requireEnv('TWILIO_ACCOUNT_SID');
  const authToken = requireEnv('TWILIO_AUTH_TOKEN');
  return `Basic ${btoa(`${accountSid}:${authToken}`)}`;
}

async function twilioFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(`${TWILIO_API_BASE}${path}`, {
      ...init,
      headers: {
        'Authorization': twilioAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(init.headers || {}),
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function speakerFromTrack(track: unknown): TranscriptSpeaker {
  const t = String(track || '').toLowerCase();
  if (t === 'inbound_track') return 'rep';
  if (t === 'outbound_track') return 'contact';
  return 'unknown';
}

function parseTwilioBody(raw: string): NormalizedEvent[] {
  const params = formParams(raw);
  const callSid = params.CallSid;
  if (!callSid) return [];
  const parentSid = params.ParentCallSid || null;
  const at = params.Timestamp ? new Date(params.Timestamp).toISOString() : new Date().toISOString();
  const payload: Record<string, unknown> = { ...params };

  const base = {
    provider: 'twilio' as const,
    provider_call_id: callSid,
    parent_provider_call_id: parentSid,
    at: Number.isNaN(Date.parse(at)) ? new Date().toISOString() : at,
    payload,
  };

  // Real-time transcription statusCallback (verified field names).
  const transcriptionEvent = (params.TranscriptionEvent || '').toLowerCase();
  if (transcriptionEvent) {
    if (transcriptionEvent !== 'transcription-content') return [];
    let text = '';
    try {
      const data = JSON.parse(params.TranscriptionData || '{}');
      text = String(data?.transcript ?? '').trim();
    } catch {
      text = '';
    }
    if (!text) return [];
    const isFinal = (params.Final || 'true').toLowerCase() === 'true';
    return [{
      ...base,
      type: 'transcript',
      transcript: { speaker: speakerFromTrack(params.Track), text, is_final: isFinal },
    }];
  }

  // Recording status callback: RecordingStatus=completed + RecordingUrl.
  if (params.RecordingSid) {
    if ((params.RecordingStatus || '').toLowerCase() === 'completed' && params.RecordingUrl) {
      return [{ ...base, type: 'recording_saved' }];
    }
    return [];
  }

  // Call status callback.
  const callStatus = (params.CallStatus || '').toLowerCase();
  switch (callStatus) {
    case 'queued':
    case 'initiated':
      return [{ ...base, type: 'initiated' }];
    case 'ringing':
      return [{ ...base, type: 'ringing' }];
    case 'in-progress':
      return [{ ...base, type: 'answered' }];
    case 'completed':
    case 'busy':
    case 'failed':
    case 'no-answer':
    case 'canceled':
      return [{ ...base, type: 'hangup' }];
    default:
      return [];
  }
}

export const twilioProvider: BrowserPhoneProvider = {
  name: 'twilio',

  async mintToken(ctx: MintTokenContext): Promise<MintTokenResult> {
    const identity = twilioIdentityForUser(ctx.userId);
    const { token, expires_at } = await buildAccessToken(identity);
    return { token, expires_at, extra: { identity } };
  },

  // deno-lint-ignore require-await
  async startOutbound(ctx: StartOutboundContext): Promise<StartOutboundResult> {
    // The browser calls device.connect({params}); Twilio forwards them as POST
    // params to twilio-voice-twiml. Names avoid Twilio's reserved To/From/
    // CallSid. The TwiML function re-reads to/from from the call_logs row and
    // never dials from these params alone.
    return {
      provider_call_id: null,
      extra: {
        params: {
          call_log_id: ctx.callLogId,
          organization_id: ctx.organizationId,
        },
      },
    };
  },

  async action(ctx: ActionContext, input: ActionInput): Promise<void> {
    // Client-side primitives (Voice SDK Call): mute(bool), sendDigits(), and
    // hold = mute (no hold primitive on the browser leg). Server no-ops.
    if (['mute', 'unmute', 'hold', 'unhold', 'dtmf'].includes(input.action)) return;

    if (!ctx.providerCallId) {
      throw new Error('Twilio call has no CallSid yet');
    }
    const accountSid = requireEnv('TWILIO_ACCOUNT_SID');
    const callSid = encodeURIComponent(ctx.providerCallId);

    if (input.action === 'hangup') {
      // Completing the parent (browser) call tears down the <Dial> child too.
      const res = await twilioFetch(`/Accounts/${accountSid}/Calls/${callSid}.json`, {
        method: 'POST',
        body: new URLSearchParams({ Status: 'completed' }).toString(),
      });
      if (!res.ok && res.status !== 404) {
        const text = await res.text();
        throw new Error(`Twilio hangup failed (${res.status}): ${text.slice(0, 500)}`);
      }
      return;
    }

    // transfer: redirecting the PARENT call would re-bridge the rep, not the
    // contact; the child CallSid is not stored. Fail closed.
    throw new Error(`Twilio action ${input.action} is not supported on the browser leg`);
  },

  async parseWebhook(req: Request): Promise<NormalizedEvent[]> {
    return parseTwilioBody(await req.text());
  },

  parseWebhookBody(rawBody: string): NormalizedEvent[] {
    return parseTwilioBody(rawBody);
  },
};

/**
 * Validate X-Twilio-Signature on a Twilio webhook. Returns false on any error.
 *
 * The URL Twilio signed is the PUBLIC function URL. Behind Supabase's proxy
 * `req.url` can be the internal URL, so the public URL is rebuilt from
 * PUBLIC_FUNCTIONS_BASE_URL (or SUPABASE_URL/functions/v1) + the function name
 * (last path segment) + the original query string, if any.
 */
export async function validateTwilioWebhook(req: Request, rawBody: string): Promise<boolean> {
  const signature = req.headers.get('X-Twilio-Signature');
  if (!signature) return false;
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')?.trim();
  if (!authToken) return false;

  let url: string;
  try {
    const incoming = new URL(req.url);
    const functionName = incoming.pathname.split('/').filter(Boolean).pop() || '';
    if (!functionName) return false;
    url = `${publicFunctionsBaseUrl()}/${functionName}${incoming.search}`;
  } catch {
    return false;
  }

  return await verifyTwilioSignature({
    url,
    params: req.method === 'POST' ? formParams(rawBody) : {},
    signature,
    authToken,
  });
}
