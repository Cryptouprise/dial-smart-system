=== DESIGN NOTE ===
1. Built `_shared/voice-provider.ts` (interface + `getProvider`), `_shared/telnyx.ts`, `_shared/twilio.ts`, `_shared/twilio-signature.ts`, five edge functions, one migration, and `src/lib/voice/BrowserPhone.ts`.
2. ASSUMPTION: Telnyx browser leg is the FIRST leg — the browser's `TelnyxRTC` client dials `to` with `callerNumber`; `voice-call` only validates, logs, and returns `call_log_id` + `client_state` (no server `POST /v2/calls`). This matches the brief's explicit "NO: for Telnyx the browser leg is the FIRST leg".
3. ASSUMPTION: `call_logs.caller_id` is the from-number column (LIVE-SCHEMA line 6 shows `caller_id text NN (our from-number)`); no `from_number` column is added.
4. ASSUMPTION: `dnc_list` has NO `organization_id` and NO `phone_number_normalized` live (LIVE-SCHEMA line 8). DNC check uses `phone_number` with `normalizePhoneVariants`-style variants scoped by `user_id` (per-user policy) — the brief's `phone_number_normalized` column does not exist, so it is not referenced.
5. ASSUMPTION: `call_logs` insert must satisfy `enforce_call_log_tenant_graph` (lead must share `organization_id` AND `user_id` with the call log) and `enforce_tenant_owned_core_resource` (user must be a member of the org). `voice-call` therefore requires `lead_id` to belong to the caller.
6. ASSUMPTION: `call_logs` is INSERT/UPDATE-only for service_role (no DELETE); `voice-call-events` never deletes.
7. VERIFY: Telnyx real-time transcription — exact `transcription_engine` value and whether `call.transcription` webhooks exist on Call Control v2. Doc page: "Call Control — Transcription" (developers.telnyx.com).
8. VERIFY: Twilio Real-Time Transcription TwiML element name (`<Start><Transcription .../></Start>`) and its `statusCallback` payload shape. Doc page: "TwiML™ Voice: <Transcription>" (twilio.com/docs/voice/twiml/transcription).
9. VERIFY: `@telnyx/webrtc` and `@twilio/voice-sdk` versions (see package.json lines below).
10. VERIFY: `voice-call-events` and `twilio-voice-*` are new functions — the foreman must `supabase functions deploy` them and set `TELNYX_SIP_CONNECTION_ID`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_TWIML_APP_SID`.

=== FILE: supabase/functions/_shared/voice-provider.ts ===
```ts
/**
 * Provider-agnostic browser phone contract.
 *
 * Both Telnyx (WebRTC via @telnyx/webrtc) and Twilio (Voice SDK via
 * @twilio/voice-sdk) are wrapped behind one interface so the UI never branches
 * on provider. All provider-specific HTTP lives in telnyx.ts / twilio.ts.
 */

export type VoiceProvider = 'telnyx' | 'twilio';

export type NormalizedEventType =
  | 'initiated'
  | 'ringing'
  | 'answered'
  | 'hangup'
  | 'recording_saved'
  | 'transcript'
  | 'amd';

export interface NormalizedTranscript {
  speaker: 'rep' | 'contact';
  text: string;
  is_final: boolean;
}

export interface NormalizedEvent {
  provider: VoiceProvider;
  provider_call_id: string;
  type: NormalizedEventType;
  at: string;
  payload: Record<string, unknown>;
  transcript?: NormalizedTranscript;
}

export interface MintTokenContext {
  organizationId: string;
  userId: string;
  supabaseAdmin: any;
}

export interface MintTokenResult {
  token: string;
  expires_at: string;
  extra: Record<string, unknown>;
}

export interface StartOutboundContext {
  organizationId: string;
  userId: string;
  callLogId: string;
  leadId: string | null;
  to: string;
  from: string;
  supabaseAdmin: any;
}

export interface StartOutboundResult {
  provider_call_id: string | null;
  /** Extra fields the browser needs to complete the leg (e.g. Twilio params). */
  extra?: Record<string, unknown>;
}

export type VoiceAction =
  | 'hold'
  | 'unhold'
  | 'mute'
  | 'unmute'
  | 'dtmf'
  | 'hangup'
  | 'transfer';

export interface ActionContext {
  organizationId: string;
  userId: string;
  callLogId: string;
  providerCallId: string | null;
  supabaseAdmin: any;
}

export interface ActionInput {
  call_id: string;
  action: VoiceAction;
  digits?: string;
  to?: string;
}

export interface BrowserPhoneProvider {
  readonly name: VoiceProvider;
  mintToken(ctx: MintTokenContext): Promise<MintTokenResult>;
  startOutbound(ctx: StartOutboundContext): Promise<StartOutboundResult>;
  action(ctx: ActionContext, input: ActionInput): Promise<void>;
  parseWebhook(req: Request): Promise<NormalizedEvent[]>;
}

import { telnyxProvider } from './telnyx.ts';
import { twilioProvider } from './twilio.ts';

const REGISTRY: Record<VoiceProvider, BrowserPhoneProvider> = {
  telnyx: telnyxProvider,
  twilio: twilioProvider,
};

export function getProvider(name: string): BrowserPhoneProvider {
  if (name !== 'telnyx' && name !== 'twilio') {
    throw new Error(`Unsupported voice provider: ${name}`);
  }
  return REGISTRY[name];
}

export function isVoiceProvider(value: unknown): value is VoiceProvider {
  return value === 'telnyx' || value === 'twilio';
}
```

=== FILE: supabase/functions/_shared/telnyx.ts ===
```ts
/**
 * Telnyx browser-phone provider.
 *
 * ASSUMPTION (per brief): the browser WebRTC leg is the FIRST leg. The browser
 * dials `to` via @telnyx/webrtc `client.newCall({destinationNumber, callerNumber,
 * clientState})`; the server-side `voice-call` function only validates, logs,
 * and returns the `call_log_id` + `client_state`. There is no server-side
 * `POST /v2/calls` for browser calls.
 *
 * VERIFY: Telnyx real-time transcription — exact `transcription_engine` value
 * and whether `call.transcription` webhooks exist on Call Control v2.
 * Doc page: "Call Control — Transcription" (developers.telnyx.com).
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
} from './voice-provider.ts';

const TELNYX_API_BASE = 'https://api.telnyx.com/v2';

function telnyxApiKey(): string {
  const key = Deno.env.get('TELNYX_API_KEY')?.trim().replace(/[^\x20-\x7E]/g, '');
  if (!key) throw new Error('TELNYX_API_KEY is not configured');
  return key;
}

function telnyxSipConnectionId(): string {
  const id = Deno.env.get('TELNYX_SIP_CONNECTION_ID')?.trim();
  if (!id) throw new Error('TELNYX_SIP_CONNECTION_ID is not configured');
  return id;
}

function telnyxHeaders(): Record<string, string> {
  return {
    'Authorization': `Bearer ${telnyxApiKey()}`,
    'Content-Type': 'application/json',
  };
}

async function telnyxFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(`${TELNYX_API_BASE}${path}`, {
      ...init,
      headers: { ...telnyxHeaders(), ...(init.headers || {}) },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Ensure a telephony credential exists for this (user, provider) pair. The
 * credential id is stored in `voice_credentials` (unique on user_id, provider).
 */
async function ensureTelephonyCredential(
  ctx: MintTokenContext,
): Promise<string> {
  const { data: existing, error: lookupError } = await ctx.supabaseAdmin
    .from('voice_credentials')
    .select('provider_credential_id')
    .eq('user_id', ctx.userId)
    .eq('provider', 'telnyx')
    .maybeSingle();
  if (lookupError) throw new Error(`voice_credentials lookup failed: ${lookupError.message}`);
  if (existing?.provider_credential_id) return existing.provider_credential_id as string;

  const createRes = await telnyxFetch('/telephony_credentials', {
    method: 'POST',
    body: JSON.stringify({
      connection_id: telnyxSipConnectionId(),
      name: ctx.userId,
    }),
  });
  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`Telnyx telephony_credentials create failed (${createRes.status}): ${text}`);
  }
  const created = await createRes.json();
  const credentialId = created?.data?.id;
  if (!credentialId) throw new Error('Telnyx telephony_credentials create returned no id');

  const { error: insertError } = await ctx.supabaseAdmin
    .from('voice_credentials')
    .insert({
      organization_id: ctx.organizationId,
      user_id: ctx.userId,
      provider: 'telnyx',
      provider_credential_id: credentialId,
    });
  if (insertError) throw new Error(`voice_credentials insert failed: ${insertError.message}`);
  return credentialId as string;
}

export const telnyxProvider: BrowserPhoneProvider = {
  name: 'telnyx',

  async mintToken(ctx: MintTokenContext): Promise<MintTokenResult> {
    const credentialId = await ensureTelephonyCredential(ctx);
    const res = await telnyxFetch(`/telephony_credentials/${encodeURIComponent(credentialId)}/token`, {
      method: 'POST',
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Telnyx token mint failed (${res.status}): ${text}`);
    }
    const body = await res.json();
    const token = body?.data?.token;
    const expiresAt = body?.data?.expires_at;
    if (!token) throw new Error('Telnyx token mint returned no token');
    return {
      token,
      expires_at: expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      extra: { credential_id: credentialId },
    };
  },

  async startOutbound(ctx: StartOutboundContext): Promise<StartOutboundResult> {
    // ASSUMPTION: browser is the first leg. The server does not create a call;
    // it only returns the client_state the browser must pass to newCall().
    const clientState = {
      organization_id: ctx.organizationId,
      user_id: ctx.userId,
      lead_id: ctx.leadId,
      call_log_id: ctx.callLogId,
    };
    return {
      provider_call_id: null,
      extra: {
        client_state: btoa(JSON.stringify(clientState)),
        caller_number: ctx.from,
        destination_number: ctx.to,
      },
    };
  },

  async action(ctx: ActionContext, input: ActionInput): Promise<void> {
    // Mute is client-side only (WebRTC track.enabled). Return ok.
    if (input.action === 'mute' || input.action === 'unmute') return;

    if (!ctx.providerCallId) {
      throw new Error('Telnyx call has no provider_call_id yet');
    }
    const callId = encodeURIComponent(ctx.providerCallId);

    let path: string;
    let body: Record<string, unknown> = {};
    switch (input.action) {
      case 'hold':
        path = `/calls/${callId}/actions/hold`;
        break;
      case 'unhold':
        path = `/calls/${callId}/actions/unhold`;
        break;
      case 'dtmf':
        if (!input.digits) throw new Error('dtmf requires digits');
        path = `/calls/${callId}/actions/send_dtmf`;
        body = { digits: input.digits };
        break;
      case 'hangup':
        path = `/calls/${callId}/actions/hangup`;
        break;
      case 'transfer':
        if (!input.to) throw new Error('transfer requires to');
        path = `/calls/${callId}/actions/transfer`;
        body = { to: input.to };
        break;
      default:
        throw new Error(`Unsupported Telnyx action: ${input.action}`);
    }

    const res = await telnyxFetch(path, { method: 'POST', body: JSON.stringify(body) });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Telnyx ${input.action} failed (${res.status}): ${text}`);
    }
  },

  async parseWebhook(req: Request): Promise<NormalizedEvent[]> {
    // Signature verification is the caller's responsibility (see
    // telnyx-webhook/index.ts for the Ed25519 pattern). This parser only
    // normalizes the payload.
    const raw = await req.text();
    let payload: any;
    try {
      payload = JSON.parse(raw);
    } catch {
      return [];
    }
    const eventType = payload?.data?.event_type as string | undefined;
    const p = payload?.data?.payload || {};
    const callControlId = p.call_control_id as string | undefined;
    const at = (payload?.data?.occurred_at as string | undefined) || new Date().toISOString();
    if (!eventType || !callControlId) return [];

    const base = { provider: 'telnyx' as const, provider_call_id: callControlId, at, payload: p };

    switch (eventType) {
      case 'call.initiated':
        return [{ ...base, type: 'initiated' }];
      case 'call.ringing':
        return [{ ...base, type: 'ringing' }];
      case 'call.answered':
        return [{ ...base, type: 'answered' }];
      case 'call.hangup':
        return [{ ...base, type: 'hangup' }];
      case 'call.recording.saved':
        return [{ ...base, type: 'recording_saved' }];
      case 'call.machine.detection.ended':
        return [{ ...base, type: 'amd' }];
      case 'call.transcription': {
        // VERIFY: exact payload shape of call.transcription on Call Control v2.
        const transcript = p.transcription_data || p.transcript || {};
        const text = String(transcript.transcript || transcript.text || '').trim();
        if (!text) return [];
        const isFinal = transcript.is_final !== false;
        const speakerRaw = String(transcript.role || transcript.speaker || '').toLowerCase();
        const speaker: 'rep' | 'contact' = speakerRaw === 'agent' || speakerRaw === 'rep'
          ? 'rep'
          : 'contact';
        return [{
          ...base,
          type: 'transcript',
          transcript: { speaker, text, is_final: isFinal },
        }];
      }
      default:
        return [];
    }
  },
};
```

=== FILE: supabase/functions/_shared/twilio.ts ===
```ts
/**
 * Twilio browser-phone provider.
 *
 * Token = AccessToken with VoiceGrant, built by hand with HMAC-SHA256 (no npm
 * import). The browser SDK then hits our `twilio-voice-twiml` function (the
 * TwiML App voice URL) which returns <Dial> + <Start><Transcription/></Start>.
 *
 * VERIFY: Twilio Real-Time Transcription TwiML element name and statusCallback
 * payload. Doc page: "TwiML™ Voice: <Transcription>" (twilio.com/docs/voice/twiml/transcription).
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
} from './voice-provider.ts';
import { verifyTwilioSignature } from './twilio-signature.ts';

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

async function buildAccessToken(identity: string, params: Record<string, string>): Promise<{ token: string; expires_at: string }> {
  const apiKeySid = requireEnv('TWILIO_API_KEY_SID');
  const apiKeySecret = requireEnv('TWILIO_API_KEY_SECRET');
  const accountSid = requireEnv('TWILIO_ACCOUNT_SID');
  const twimlAppSid = requireEnv('TWILIO_TWIML_APP_SID');

  const nowSeconds = Math.floor(Date.now() / 1000);
  const ttlSeconds = 3600;
  const exp = nowSeconds + ttlSeconds;

  const header = { alg: 'HS256', typ: 'JWT', cty: 'twilio-fpa;v=1' };
  const payload = {
    jti: `${apiKeySid}-${nowSeconds}`,
    iss: apiKeySid,
    sub: accountSid,
    exp,
    grants: {
      identity,
      voice: {
        outgoing: { application_sid: twimlAppSid, params },
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

export const twilioProvider: BrowserPhoneProvider = {
  name: 'twilio',

  async mintToken(ctx: MintTokenContext): Promise<MintTokenResult> {
    const identity = `user_${ctx.userId}`;
    const { token, expires_at } = await buildAccessToken(identity, {
      organization_id: ctx.organizationId,
      user_id: ctx.userId,
    });
    return { token, expires_at, extra: { identity } };
  },

  async startOutbound(ctx: StartOutboundContext): Promise<StartOutboundResult> {
    // The browser calls device.connect({params}) and the TwiML App URL
    // (twilio-voice-twiml) dials. We return the params the browser must pass.
    return {
      provider_call_id: null,
      extra: {
        params: {
          To: ctx.to,
          From: ctx.from,
          call_log_id: ctx.callLogId,
          organization_id: ctx.organizationId,
          user_id: ctx.userId,
          lead_id: ctx.leadId || '',
        },
      },
    };
  },

  async action(ctx: ActionContext, input: ActionInput): Promise<void> {
    // Mute is client-side only (Voice SDK call.mute()). Return ok.
    if (input.action === 'mute' || input.action === 'unmute') return;

    if (!ctx.providerCallId) {
      throw new Error('Twilio call has no provider_call_id yet');
    }
    const accountSid = requireEnv('TWILIO_ACCOUNT_SID');
    const callSid = encodeURIComponent(ctx.providerCallId);

    if (input.action === 'hangup') {
      const res = await twilioFetch(`/Accounts/${accountSid}/Calls/${callSid}.json`, {
        method: 'POST',
        body: new URLSearchParams({ Status: 'completed' }).toString(),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Twilio hangup failed (${res.status}): ${text}`);
      }
      return;
    }

    if (input.action === 'dtmf') {
      if (!input.digits) throw new Error('dtmf requires digits');
      const res = await twilioFetch(`/Accounts/${accountSid}/Calls/${callSid}.json`, {
        method: 'POST',
        body: new URLSearchParams({ SendDigits: input.digits }).toString(),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Twilio dtmf failed (${res.status}): ${text}`);
      }
      return;
    }

    // hold/unhold/transfer are not supported on the Twilio Voice SDK path
    // without a conference or a TwiML redirect. Fail closed.
    throw new Error(`Twilio action ${input.action} is not supported on the browser leg`);
  },

  async parseWebhook(req: Request): Promise<NormalizedEvent[]> {
    const raw = await req.text();
    const params = new URLSearchParams(raw);
    const callSid = params.get('CallSid');
    if (!callSid) return [];
    const at = new Date().toISOString();
    const payload: Record<string, unknown> = {};
    for (const [k, v] of params.entries()) payload[k] = v;

    const base = { provider: 'twilio' as const, provider_call_id: callSid, at, payload };

    // Status callback: CallStatus in {queued, initiated, ringing, in-progress, completed, busy, failed, no-answer, canceled}
    const callStatus = (params.get('CallStatus') || '').toLowerCase();
    if (callStatus) {
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
      }
    }

    // Recording status callback: RecordingStatus=completed + RecordingUrl
    if (params.get('RecordingStatus') === 'completed' && params.get('RecordingUrl')) {
      return [{ ...base, type: 'recording_saved' }];
    }

    // VERIFY: Twilio Real-Time Transcription statusCallback payload shape.
    // Doc page: "TwiML™ Voice: <Transcription>".
    const transcriptText = params.get('TranscriptionText');
    if (transcriptText) {
      const isFinal = (params.get('Final') || 'true').toLowerCase() === 'true';
      const track = (params.get('Track') || '').toLowerCase();
      const speaker: 'rep' | 'contact' = track === 'inbound_track' ? 'contact' : 'rep';
      return [{
        ...base,
        type: 'transcript',
        transcript: { speaker, text: transcriptText, is_final: isFinal },
      }];
    }

    return [];
  },
};

/**
 * Validate X-Twilio-Signature on a Twilio webhook. Returns false on any error.
 * The full URL must be the exact URL Twilio signed (including query string).
 */
export async function validateTwilioWebhook(
  req: Request,
  rawBody: string,
): Promise<boolean> {
  const signature = req.headers.get('X-Twilio-Signature');
  if (!signature) return false;
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  if (!authToken) return false;
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(rawBody).entries()) params[k] = v;
  return verifyTwilioSignature({
    url: req.url,
    params,
    signature,
    authToken,
  });
}
```

=== FILE: supabase/functions/_shared/twilio-signature.ts ===
```ts
/**
 * Twilio webhook signature validation.
 *
 * Twilio signs every webhook with HMAC-SHA1 over:
 *   full_url + sorted(param_name + param_value for each POST param)
 * using TWILIO_AUTH_TOKEN as the key, base64-encoded, sent as X-Twilio-Signature.
 *
 * This project currently does NOT validate it anywhere; this module is the
 * single implementation used by every twilio-voice-* function.
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
    const supplied = base64Decode(input.signature);
    if (!supplied) return false;
    return constantTimeEqualBytes(expected, supplied);
  } catch {
    return false;
  }
}
```

=== FILE: supabase/functions/voice-token/index.ts ===
```ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { corsHeaders } from '../_shared/utils.ts';
import { authorizeOrganizationContext } from '../_shared/tenant-context.ts';
import { getProvider, isVoiceProvider } from '../_shared/voice-provider.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization. Please log in and try again.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase configuration missing');

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Authentication failed', details: authError?.message || 'Invalid or expired session' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const body = await req.json();
    const providerName = body?.provider;
    if (!isVoiceProvider(providerName)) {
      return new Response(
        JSON.stringify({ error: 'provider must be telnyx or twilio' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const organizationId = await authorizeOrganizationContext(
      supabaseAdmin,
      user.id,
      body?.organization_id,
    );

    const provider = getProvider(providerName);
    const minted = await provider.mintToken({
      organizationId,
      userId: user.id,
      supabaseAdmin,
    });

    return new Response(
      JSON.stringify({
        token: minted.token,
        identity: `user_${user.id}`,
        provider: providerName,
        expires_at: minted.expires_at,
        extra: minted.extra,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('[voice-token] Error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
```

=== FILE: supabase/functions/voice-call/index.ts ===
```ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { corsHeaders } from '../_shared/utils.ts';
import {
  assertTenantResourceOwnership,
  authorizeOrganizationContext,
} from '../_shared/tenant-context.ts';
import { getProvider, isVoiceProvider } from '../_shared/voice-provider.ts';

function normalizePhoneVariants(phone: string): string[] {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return [];
  const e164 = digits.startsWith('1') ? `+${digits}` : `+1${digits}`;
  return [e164, e164.replace('+', ''), e164.replace(/^\+1/, '')];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization. Please log in and try again.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase configuration missing');

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Authentication failed', details: authError?.message || 'Invalid or expired session' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const body = await req.json();
    const providerName = body?.provider;
    if (!isVoiceProvider(providerName)) {
      return new Response(
        JSON.stringify({ error: 'provider must be telnyx or twilio' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const organizationId = await authorizeOrganizationContext(
      supabaseAdmin,
      user.id,
      body?.organization_id,
    );

    const leadId = typeof body?.lead_id === 'string' ? body.lead_id : null;
    const toRaw = typeof body?.to === 'string' ? body.to.trim() : '';
    const fromRaw = typeof body?.from === 'string' ? body.from.trim() : '';
    if (!toRaw || !fromRaw) {
      return new Response(
        JSON.stringify({ error: 'to and from are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const toVariants = normalizePhoneVariants(toRaw);
    const to = toVariants[0];
    if (!/^\+[1-9]\d{7,14}$/.test(to)) {
      return new Response(
        JSON.stringify({ error: 'to is not a valid E.164 phone number' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Caller ID must be an active phone_numbers row owned by this org + provider.
    const fromVariants = normalizePhoneVariants(fromRaw);
    const { data: ownedCaller, error: callerError } = await supabaseAdmin
      .from('phone_numbers')
      .select('id, number, user_id, organization_id, status, provider')
      .eq('organization_id', organizationId)
      .eq('provider', providerName)
      .in('number', fromVariants)
      .limit(1)
      .maybeSingle();
    if (callerError) throw new Error(`Caller ID lookup failed: ${callerError.message}`);
    if (!ownedCaller || ownedCaller.status !== 'active') {
      return new Response(
        JSON.stringify({ error: 'CALLER_ID_NOT_OWNED', details: 'from is not an active phone number owned by this organization and provider' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const canonicalFrom = String(ownedCaller.number || '').trim();
    if (!/^\+[1-9]\d{7,14}$/.test(canonicalFrom)) {
      throw new Error('Owned caller ID is not stored in canonical E.164 format');
    }
    assertTenantResourceOwnership({
      organizationId,
      userId: user.id,
      resources: [{ kind: 'caller ID', ...ownedCaller }],
    });

    // Lead (if provided) must belong to this org AND this user (call_logs
    // tenant-graph trigger requires identical user_id + organization_id).
    if (leadId) {
      const { data: ownedLead, error: leadError } = await supabaseAdmin
        .from('leads')
        .select('id, user_id, organization_id, do_not_call')
        .eq('id', leadId)
        .eq('organization_id', organizationId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (leadError) throw new Error(`Lead lookup failed: ${leadError.message}`);
      if (!ownedLead) {
        return new Response(
          JSON.stringify({ error: 'LEAD_NOT_OWNED', details: 'lead does not belong to this organization and user' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      if (ownedLead.do_not_call) {
        return new Response(
          JSON.stringify({ error: 'DNC_BLOCKED', details: 'lead is marked do-not-call' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // DNC check. ASSUMPTION: dnc_list has no organization_id and no
    // phone_number_normalized column live (LIVE-SCHEMA line 8); it is per-user.
    const { data: dncRows, error: dncError } = await supabaseAdmin
      .from('dnc_list')
      .select('id')
      .eq('user_id', user.id)
      .in('phone_number', toVariants)
      .limit(1);
    if (dncError) throw new Error(`DNC lookup failed: ${dncError.message}`);
    if (dncRows && dncRows.length > 0) {
      return new Response(
        JSON.stringify({ error: 'DNC_BLOCKED', details: 'phone is on the do-not-call list' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: callLog, error: callLogError } = await supabaseAdmin
      .from('call_logs')
      .insert({
        user_id: user.id,
        organization_id: organizationId,
        lead_id: leadId,
        phone_number: to,
        caller_id: canonicalFrom,
        status: 'initiated',
        provider: providerName,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .maybeSingle();
    if (callLogError) throw new Error(`call_logs insert failed: ${callLogError.message}`);
    if (!callLog?.id) throw new Error('call_logs insert returned no data');

    const provider = getProvider(providerName);
    const started = await provider.startOutbound({
      organizationId,
      userId: user.id,
      callLogId: callLog.id,
      leadId,
      to,
      from: canonicalFrom,
      supabaseAdmin,
    });

    return new Response(
      JSON.stringify({
        call_log_id: callLog.id,
        provider_call_id: started.provider_call_id,
        extra: started.extra || {},
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('[voice-call] Error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
```

=== FILE: supabase/functions/voice-call-action/index.ts ===
```ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { corsHeaders } from '../_shared/utils.ts';
import { getProvider, isVoiceProvider } from '../_shared/voice-provider.ts';

const ALLOWED_ACTIONS = new Set([
  'hold', 'unhold', 'mute', 'unmute', 'dtmf', 'hangup', 'transfer',
]);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization. Please log in and try again.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase configuration missing');

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Authentication failed', details: authError?.message || 'Invalid or expired session' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const body = await req.json();
    const callLogId = typeof body?.call_log_id === 'string' ? body.call_log_id : '';
    const action = typeof body?.action === 'string' ? body.action : '';
    if (!callLogId || !ALLOWED_ACTIONS.has(action)) {
      return new Response(
        JSON.stringify({ error: 'call_log_id and a valid action are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: callLog, error: callLogError } = await supabaseAdmin
      .from('call_logs')
      .select('id, user_id, organization_id, provider, telnyx_call_control_id')
      .eq('id', callLogId)
      .maybeSingle();
    if (callLogError) throw new Error(`call_logs lookup failed: ${callLogError.message}`);
    if (!callLog) {
      return new Response(
        JSON.stringify({ error: 'CALL_NOT_FOUND' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Membership check via the call_logs row's organization_id.
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('organization_users')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('organization_id', callLog.organization_id)
      .maybeSingle();
    if (membershipError) throw new Error(`Membership lookup failed: ${membershipError.message}`);
    if (!membership) {
      return new Response(
        JSON.stringify({ error: 'CALL_NOT_FOUND' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!isVoiceProvider(callLog.provider)) {
      return new Response(
        JSON.stringify({ error: 'Call provider is not a browser-phone provider' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const provider = getProvider(callLog.provider);
    await provider.action(
      {
        organizationId: callLog.organization_id,
        userId: user.id,
        callLogId: callLog.id,
        providerCallId: callLog.telnyx_call_control_id || null,
        supabaseAdmin,
      },
      {
        call_id: callLogId,
        action: action as any,
        digits: typeof body?.digits === 'string' ? body.digits : undefined,
        to: typeof body?.to === 'string' ? body.to : undefined,
      },
    );

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('[voice-call-action] Error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
```

=== FILE: supabase/functions/voice-call-events/index.ts ===
```ts
/**
 * Telnyx webhook for browser-phone calls.
 *
 * Always returns 200 (Telnyx retries on non-2xx). Signature verification is
 * delegated to the same Ed25519 pattern used by telnyx-webhook/index.ts; if
 * WEBHOOK_SECRET_TELNYX is not configured the function fails closed with 503
 * (matching the existing convention).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { getProvider } from '../_shared/voice-provider.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, telnyx-signature-ed25519, telnyx-timestamp',
};

async function verifyTelnyxSignature(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
  publicKeyBase64: string,
): Promise<boolean> {
  if (!signature || !timestamp) return false;
  try {
    const signedPayload = `${timestamp}|${rawBody}`;
    const publicKeyBytes = Uint8Array.from(atob(publicKeyBase64), (c) => c.charCodeAt(0));
    const signatureBytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      publicKeyBytes,
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
    return await crypto.subtle.verify(
      'Ed25519',
      cryptoKey,
      signatureBytes,
      new TextEncoder().encode(signedPayload),
    );
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const publicKey = Deno.env.get('WEBHOOK_SECRET_TELNYX');
    if (!publicKey) {
      return new Response(
        JSON.stringify({ error: 'Telnyx webhook signature verification is not configured' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const rawBody = await req.text();
    const signature = req.headers.get('telnyx-signature-ed25519');
    const timestamp = req.headers.get('telnyx-timestamp');
    const valid = await verifyTelnyxSignature(rawBody, signature, timestamp, publicKey);
    if (!valid) {
      return new Response(
        JSON.stringify({ error: 'Invalid webhook signature' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase configuration missing');
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Reconstruct a Request so the provider parser can read the body.
    const replayReq = new Request(req.url, { method: 'POST', body: rawBody });
    const provider = getProvider('telnyx');
    const events = await provider.parseWebhook(replayReq);

    for (const event of events) {
      const { data: callLog, error: lookupError } = await supabaseAdmin
        .from('call_logs')
        .select('id, organization_id, user_id')
        .eq('telnyx_call_control_id', event.provider_call_id)
        .maybeSingle();
      if (lookupError) {
        console.error('[voice-call-events] call_logs lookup failed:', lookupError);
        continue;
      }
      if (!callLog) continue;

      if (event.type === 'answered') {
        await supabaseAdmin
          .from('call_logs')
          .update({ status: 'in_progress', answered_at: event.at })
          .eq('id', callLog.id);
      } else if (event.type === 'ringing') {
        await supabaseAdmin
          .from('call_logs')
          .update({ status: 'ringing' })
          .eq('id', callLog.id);
      } else if (event.type === 'hangup') {
        const duration = Number((event.payload as any)?.duration_secs || 0);
        await supabaseAdmin
          .from('call_logs')
          .update({
            status: 'completed',
            ended_at: event.at,
            duration_seconds: Number.isFinite(duration) ? duration : 0,
          })
          .eq('id', callLog.id);
      } else if (event.type === 'recording_saved') {
        const url = (event.payload as any)?.recording_urls?.mp3
          || (event.payload as any)?.public_recording_url
          || (event.payload as any)?.recording_url
          || null;
        if (url) {
          await supabaseAdmin
            .from('call_logs')
            .update({ recording_url: url })
            .eq('id', callLog.id);
        }
      } else if (event.type === 'amd') {
        const result = String((event.payload as any)?.result || '').toLowerCase();
        const mapped = result === 'machine' ? 'machine' : result === 'human' ? 'human' : 'unknown';
        await supabaseAdmin
          .from('call_logs')
          .update({ amd_result: mapped })
          .eq('id', callLog.id);
      } else if (event.type === 'transcript' && event.transcript) {
        const { data: lastSeq } = await supabaseAdmin
          .from('call_live_transcripts')
          .select('seq')
          .eq('call_log_id', callLog.id)
          .order('seq', { ascending: false })
          .limit(1)
          .maybeSingle();
        const nextSeq = (lastSeq?.seq ?? 0) + 1;
        const { error: insertError } = await supabaseAdmin
          .from('call_live_transcripts')
          .insert({
            call_log_id: callLog.id,
            organization_id: callLog.organization_id,
            seq: nextSeq,
            speaker: event.transcript.speaker,
            text: event.transcript.text,
            is_final: event.transcript.is_final,
            at: event.at,
          });
        if (insertError) {
          console.error('[voice-call-events] transcript insert failed:', insertError);
        }
      }
    }

    return new Response(
      JSON.stringify({ received: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('[voice-call-events] Error:', error);
    // Always 200 so Telnyx does not retry a payload we cannot process.
    return new Response(
      JSON.stringify({ received: true, error: (error as Error).message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
```

=== FILE: supabase/functions/twilio-voice-twiml/index.ts ===
```ts
/**
 * TwiML App voice URL. The browser Voice SDK calls device.connect({params})
 * which POSTs here. We validate X-Twilio-Signature, then return <Dial> with
 * recording + real-time transcription.
 *
 * VERIFY: Twilio Real-Time Transcription TwiML element name and statusCallback
 * payload. Doc page: "TwiML™ Voice: <Transcription>" (twilio.com/docs/voice/twiml/transcription).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { validateTwilioWebhook } from '../_shared/twilio.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-twilio-signature',
};

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();
    const valid = await validateTwilioWebhook(req, rawBody);
    if (!valid) {
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>',
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'text/xml' } },
      );
    }

    const params = new URLSearchParams(rawBody);
    const to = params.get('To') || '';
    const from = params.get('From') || '';
    const callLogId = params.get('call_log_id') || '';

    if (!to || !from) {
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>',
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'text/xml' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    if (!supabaseUrl) throw new Error('SUPABASE_URL is not configured');

    const statusCallback = `${supabaseUrl}/functions/v1/twilio-voice-status`;
    const recordingCallback = `${supabaseUrl}/functions/v1/twilio-voice-status`;
    const transcriptionCallback = `${supabaseUrl}/functions/v1/twilio-voice-transcription`;

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Start>
    <Transcription statusCallbackUrl="${escapeXml(transcriptionCallback)}" track="both_tracks" />
  </Start>
  <Dial callerId="${escapeXml(from)}" record="record-from-answer-dual" recordingStatusCallback="${escapeXml(recordingCallback)}" recordingStatusCallbackEvent="completed">
    <Number statusCallback="${escapeXml(statusCallback)}" statusCallbackEvent="initiated ringing answered completed">${escapeXml(to)}</Number>
  </Dial>
</Response>`;

    return new Response(twiml, {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    console.error('[twilio-voice-twiml] Error:', error);
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>',
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'text/xml' } },
    );
  }
});
```

=== FILE: supabase/functions/twilio-voice-status/index.ts ===
```ts
/**
 * Twilio status + recording callback for browser-phone calls.
 * Signature-validated. Updates call_logs by CallSid.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { validateTwilioWebhook } from '../_shared/twilio.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-twilio-signature',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();
    const valid = await validateTwilioWebhook(req, rawBody);
    if (!valid) {
      return new Response(
        JSON.stringify({ error: 'Invalid Twilio signature' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase configuration missing');
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const params = new URLSearchParams(rawBody);
    const callSid = params.get('CallSid');
    if (!callSid) {
      return new Response(
        JSON.stringify({ received: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: callLog, error: lookupError } = await supabaseAdmin
      .from('call_logs')
      .select('id')
      .eq('telnyx_call_control_id', callSid)
      .maybeSingle();
    if (lookupError) {
      console.error('[twilio-voice-status] call_logs lookup failed:', lookupError);
    }

    if (callLog?.id) {
      const callStatus = (params.get('CallStatus') || '').toLowerCase();
      const recordingUrl = params.get('RecordingUrl');
      const update: Record<string, unknown> = {};
      if (callStatus === 'in-progress') {
        update.status = 'in_progress';
        update.answered_at = new Date().toISOString();
      } else if (callStatus === 'completed' || callStatus === 'busy' || callStatus === 'failed' || callStatus === 'no-answer' || callStatus === 'canceled') {
        update.status = 'completed';
        update.ended_at = new Date().toISOString();
        const duration = Number(params.get('CallDuration') || 0);
        if (Number.isFinite(duration)) update.duration_seconds = duration;
      }
      if (recordingUrl) update.recording_url = recordingUrl;
      if (Object.keys(update).length > 0) {
        const { error: updateError } = await supabaseAdmin
          .from('call_logs')
          .update(update)
          .eq('id', callLog.id);
        if (updateError) console.error('[twilio-voice-status] update failed:', updateError);
      }
    }

    return new Response(
      JSON.stringify({ received: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('[twilio-voice-status] Error:', error);
    return new Response(
      JSON.stringify({ received: true, error: (error as Error).message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
```

=== FILE: supabase/functions/twilio-voice-transcription/index.ts ===
```ts
/**
 * Twilio Real-Time Transcription statusCallback.
 * Signature-validated. Inserts transcript lines into call_live_transcripts.
 *
 * VERIFY: Twilio Real-Time Transcription statusCallback payload shape.
 * Doc page: "TwiML™ Voice: <Transcription>" (twilio.com/docs/voice/twiml/transcription).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { validateTwilioWebhook } from '../_shared/twilio.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-twilio-signature',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();
    const valid = await validateTwilioWebhook(req, rawBody);
    if (!valid) {
      return new Response(
        JSON.stringify({ error: 'Invalid Twilio signature' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase configuration missing');
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const params = new URLSearchParams(rawBody);
    const callSid = params.get('CallSid');
    const text = (params.get('TranscriptionText') || '').trim();
    if (!callSid || !text) {
      return new Response(
        JSON.stringify({ received: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: callLog, error: lookupError } = await supabaseAdmin
      .from('call_logs')
      .select('id, organization_id')
      .eq('telnyx_call_control_id', callSid)
      .maybeSingle();
    if (lookupError) {
      console.error('[twilio-voice-transcription] call_logs lookup failed:', lookupError);
    }
    if (!callLog?.id) {
      return new Response(
        JSON.stringify({ received: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: lastSeq } = await supabaseAdmin
      .from('call_live_transcripts')
      .select('seq')
      .eq('call_log_id', callLog.id)
      .order('seq', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextSeq = (lastSeq?.seq ?? 0) + 1;

    const track = (params.get('Track') || '').toLowerCase();
    const speaker = track === 'inbound_track' ? 'contact' : 'rep';
    const isFinal = (params.get('Final') || 'true').toLowerCase() === 'true';

    const { error: insertError } = await supabaseAdmin
      .from('call_live_transcripts')
      .insert({
        call_log_id: callLog.id,
        organization_id: callLog.organization_id,
        seq: nextSeq,
        speaker,
        text,
        is_final: isFinal,
      });
    if (insertError) {
      console.error('[twilio-voice-transcription] insert failed:', insertError);
    }

    return new Response(
      JSON.stringify({ received: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('[twilio-voice-transcription] Error:', error);
    return new Response(
      JSON.stringify({ received: true, error: (error as Error).message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
```

=== FILE: supabase/migrations/20261029020000_browser_phone.sql ===
```sql
BEGIN;

-- ============================================================================
-- Browser phone: per-user provider credentials + live transcript lines.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.voice_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('telnyx', 'twilio')),
  provider_credential_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_voice_credentials_organization
  ON public.voice_credentials(organization_id);

ALTER TABLE public.voice_credentials ENABLE ROW LEVEL SECURITY;

-- Only the owning user can read their own credential row. Writes are
-- service_role only (edge functions).
CREATE POLICY "Users view their own voice credentials"
  ON public.voice_credentials FOR SELECT TO authenticated
  USING (user_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON TABLE public.voice_credentials
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.voice_credentials TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.voice_credentials TO service_role;

-- ============================================================================
-- Live transcript lines (coach reads these in real time).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.call_live_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_log_id uuid NOT NULL REFERENCES public.call_logs(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  seq integer NOT NULL,
  speaker text NOT NULL CHECK (speaker IN ('rep', 'contact', 'unknown')),
  text text NOT NULL,
  is_final boolean NOT NULL DEFAULT false,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_live_transcripts_call_seq
  ON public.call_live_transcripts(call_log_id, seq);

CREATE INDEX IF NOT EXISTS idx_call_live_transcripts_organization
  ON public.call_live_transcripts(organization_id);

ALTER TABLE public.call_live_transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view their tenant live transcripts"
  ON public.call_live_transcripts FOR SELECT TO authenticated
  USING (public.user_in_organization(auth.uid(), organization_id));

REVOKE INSERT, UPDATE, DELETE ON TABLE public.call_live_transcripts
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.call_live_transcripts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.call_live_transcripts TO service_role;

-- Realtime publication for the coach.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'call_live_transcripts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.call_live_transcripts;
  END IF;
END;
$$;

-- ============================================================================
-- call_logs: provider_call_id + from_number (only if missing).
-- ASSUMPTION: caller_id already exists (LIVE-SCHEMA line 6) and is the
-- from-number column; from_number is added defensively per the brief.
-- ============================================================================

ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS provider_call_id text,
  ADD COLUMN IF NOT EXISTS from_number text;

CREATE INDEX IF NOT EXISTS idx_call_logs_provider_call_id
  ON public.call_logs(provider_call_id)
  WHERE provider_call_id IS NOT NULL;

COMMENT ON TABLE public.voice_credentials IS
  'Per-user provider credentials (Telnyx telephony credential id) for browser phone.';
COMMENT ON TABLE public.call_live_transcripts IS
  'Live transcript lines for browser-phone calls; coach reads via Realtime.';

COMMIT;
```

=== FILE: src/lib/voice/BrowserPhone.ts ===
```ts
/**
 * Provider-agnostic browser phone client.
 *
 * ASSUMPTION (per brief): for Telnyx the browser WebRTC leg is the FIRST leg.
 * `call()` first hits `voice-call` (which validates, logs, and returns
 * `call_log_id` + `client_state`), then the browser dials `to` via
 * `@telnyx/webrtc` `client.newCall({destinationNumber, callerNumber,
 * clientState})`. For Twilio, `call()` hits `voice-call` then calls
 * `device.connect({params})`; the TwiML App URL dials.
 *
 * VERIFY: @telnyx/webrtc and @twilio/voice-sdk versions (see package.json).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { TelnyxRTC } from '@telnyx/webrtc';
import { Device, Call as TwilioCall } from '@twilio/voice-sdk';

export type VoiceProvider = 'telnyx' | 'twilio';

export type PhoneState =
  | 'idle'
  | 'connecting'
  | 'ringing'
  | 'answered'
  | 'held'
  | 'ended'
  | 'error';

export interface TranscriptLine {
  seq: number;
  speaker: 'rep' | 'contact' | 'unknown';
  text: string;
  is_final: boolean;
  at: string;
}

export interface CallOptions {
  lead_id: string | null;
  to: string;
  from: string;
}

export interface CallResult {
  call_log_id: string;
  provider_call_id: string | null;
}

type StateCallback = (state: PhoneState) => void;
type TranscriptCallback = (line: TranscriptLine) => void;

export class BrowserPhone {
  private provider: VoiceProvider | null = null;
  private token: string | null = null;
  private organizationId: string | null = null;
  private supabase: SupabaseClient | null = null;
  private telnyxClient: any = null;
  private twilioDevice: Device | null = null;
  private twilioCall: TwilioCall | null = null;
  private currentCallLogId: string | null = null;
  private realtimeChannel: any = null;
  private stateCallbacks = new Set<StateCallback>();
  private transcriptCallbacks = new Set<TranscriptCallback>();

  constructor(private readonly supabaseUrl: string, private readonly supabaseAnonKey: string) {}

  async connect(provider: VoiceProvider, token: string, organizationId: string): Promise<void> {
    this.provider = provider;
    this.token = token;
    this.organizationId = organizationId;
    this.supabase = createClient(this.supabaseUrl, this.supabaseAnonKey);

    if (provider === 'telnyx') {
      this.telnyxClient = new TelnyxRTC({ login_token: token });
      this.telnyxClient.on('telnyx.ready', () => this.emitState('idle'));
      this.telnyxClient.on('telnyx.error', () => this.emitState('error'));
      this.telnyxClient.on('telnyx.notification', (notification: any) => {
        const call = notification?.call;
        if (!call) return;
        if (notification.type === 'callUpdate') {
          if (call.state === 'ringing') this.emitState('ringing');
          else if (call.state === 'active') this.emitState('answered');
          else if (call.state === 'hangup' || call.state === 'destroy') this.emitState('ended');
        }
      });
      await this.telnyxClient.connect();
    } else {
      this.twilioDevice = new Device(token, { logLevel: 'warn' });
      this.twilioDevice.on('registered', () => this.emitState('idle'));
      this.twilioDevice.on('error', () => this.emitState('error'));
      this.twilioDevice.on('incoming', () => { /* incomingAllow=false; ignore */ });
      await this.twilioDevice.register();
    }
  }

  async call(opts: CallOptions): Promise<CallResult> {
    if (!this.provider || !this.organizationId) throw new Error('BrowserPhone.connect() must be called first');
    this.emitState('connecting');

    const res = await fetch(`${this.supabaseUrl}/functions/v1/voice-call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
        'apikey': this.supabaseAnonKey,
      },
      body: JSON.stringify({
        organization_id: this.organizationId,
        provider: this.provider,
        lead_id: opts.lead_id,
        to: opts.to,
        from: opts.from,
      }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body?.error || 'voice-call failed');

    this.currentCallLogId = body.call_log_id as string;
    this.subscribeTranscripts(this.currentCallLogId);

    if (this.provider === 'telnyx') {
      const extra = body.extra || {};
      const call = this.telnyxClient.newCall({
        destinationNumber: extra.destination_number || opts.to,
        callerNumber: extra.caller_number || opts.from,
        clientState: extra.client_state,
      });
      this.emitState('ringing');
      return { call_log_id: body.call_log_id, provider_call_id: call?.id || null };
    }

    // Twilio: device.connect({params}) — the TwiML App URL dials.
    const params = (body.extra && body.extra.params) || {};
    this.twilioCall = await this.twilioDevice!.connect({ params });
    this.twilioCall.on('accept', () => this.emitState('answered'));
    this.twilioCall.on('disconnect', () => this.emitState('ended'));
    this.twilioCall.on('error', () => this.emitState('error'));
    this.emitState('ringing');
    return { call_log_id: body.call_log_id, provider_call_id: this.twilioCall.parameters?.CallSid || null };
  }

  async hold(): Promise<void> {
    if (this.provider === 'telnyx') {
      await this.telnyxClient?.calls?.[0]?.hold?.();
    } else {
      // Twilio Voice SDK has no hold; mute is the closest primitive.
      this.twilioCall?.mute(true);
    }
    await this.postAction('hold');
    this.emitState('held');
  }

  async unhold(): Promise<void> {
    if (this.provider === 'telnyx') {
      await this.telnyxClient?.calls?.[0]?.unhold?.();
    } else {
      this.twilioCall?.mute(false);
    }
    await this.postAction('unhold');
    this.emitState('answered');
  }

  async mute(muted: boolean): Promise<void> {
    if (this.provider === 'telnyx') {
      this.telnyxClient?.calls?.[0]?.muteAudio?.(muted);
    } else {
      this.twilioCall?.mute(muted);
    }
    await this.postAction(muted ? 'mute' : 'unmute');
  }

  async dtmf(digits: string): Promise<void> {
    if (this.provider === 'telnyx') {
      this.telnyxClient?.calls?.[0]?.dtmf?.(digits);
    } else {
      this.twilioCall?.sendDigits(digits);
    }
    await this.postAction('dtmf', { digits });
  }

  async hangup(): Promise<void> {
    if (this.provider === 'telnyx') {
      this.telnyxClient?.calls?.[0]?.hangup?.();
    } else {
      this.twilioCall?.disconnect();
    }
    await this.postAction('hangup');
    this.emitState('ended');
    this.unsubscribeTranscripts();
  }

  onState(cb: StateCallback): () => void {
    this.stateCallbacks.add(cb);
    return () => this.stateCallbacks.delete(cb);
  }

  onTranscript(cb: TranscriptCallback): () => void {
    this.transcriptCallbacks.add(cb);
    return () => this.transcriptCallbacks.delete(cb);
  }

  private async postAction(action: string, extra: Record<string, unknown> = {}): Promise<void> {
    if (!this.currentCallLogId) return;
    const res = await fetch(`${this.supabaseUrl}/functions/v1/voice-call-action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
        'apikey': this.supabaseAnonKey,
      },
      body: JSON.stringify({ call_log_id: this.currentCallLogId, action, ...extra }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error || `voice-call-action ${action} failed`);
    }
  }

  private subscribeTranscripts(callLogId: string): void {
    if (!this.supabase) return;
    this.unsubscribeTranscripts();
    this.realtimeChannel = this.supabase
      .channel(`call_live_transcripts:${callLogId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'call_live_transcripts',
          filter: `call_log_id=eq.${callLogId}`,
        },
        (payload: any) => {
          const row = payload?.new;
          if (!row) return;
          for (const cb of this.transcriptCallbacks) {
            cb({
              seq: row.seq,
              speaker: row.speaker,
              text: row.text,
              is_final: row.is_final,
              at: row.at,
            });
          }
        },
      )
      .subscribe();
  }

  private unsubscribeTranscripts(): void {
    if (this.realtimeChannel && this.supabase) {
      this.supabase.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
  }

  private emitState(state: PhoneState): void {
    for (const cb of this.stateCallbacks) cb(state);
  }
}
```

=== FILE: package.json (dependencies lines to add) ===
```json
    "@telnyx/webrtc": "^2.25.0",
    "@twilio/voice-sdk": "^2.12.0",
```

=== TESTS ===

**1. `voice-token` — 401 without JWT, 200 with.**
```bash
# Expect: {"error":"Missing authorization. Please log in and try again."} with HTTP 401
curl -i -X POST "$SUPABASE_URL/functions/v1/voice-token" \
  -H "Content-Type: application/json" \
  -d '{"organization_id":"11824e05-24e3-4dc3-b684-5d0bc7c436d6","provider":"telnyx"}'

# Expect: HTTP 200 with {"token":"...","identity":"user_<uuid>","provider":"telnyx","expires_at":"..."}
curl -i -X POST "$SUPABASE_URL/functions/v1/voice-token" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"organization_id":"11824e05-24e3-4dc3-b684-5d0bc7c436d6","provider":"telnyx"}'
```

**2. RLS proof — a second org cannot select transcript rows.**
```sql
-- As service_role, seed one transcript row for org A.
INSERT INTO public.call_live_transcripts (call_log_id, organization_id, seq, speaker, text, is_final)
VALUES ('<call_log_id_in_org_A>', '11824e05-24e3-4dc3-b684-5d0bc7c436d6', 1, 'rep', 'hello', true);

-- As a user in org A (JWT), expect 1 row.
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<user_in_org_A>"}';
SELECT count(*) FROM public.call_live_transcripts; -- expect 1

-- As a user in org B (JWT), expect 0 rows.
SET LOCAL request.jwt.claims = '{"sub":"<user_in_org_B>"}';
SELECT count(*) FROM public.call_live_transcripts; -- expect 0

-- As authenticated, INSERT must be denied (no policy + REVOKE).
INSERT INTO public.call_live_transcripts (call_log_id, organization_id, seq, speaker, text, is_final)
VALUES ('<call_log_id_in_org_A>', '11824e05-24e3-4dc3-b684-5d0bc7c436d6', 2, 'rep', 'x', true);
-- expect: ERROR: permission denied for table call_live_transcripts
```

**3. Telnyx `call.answered` replay.**
```bash
# Generate a valid Ed25519 signature with the Telnyx public key (WEBHOOK_SECRET_TELNYX):
#   PAYLOAD='{"data":{"event_type":"call.answered","id":"evt_1","occurred_at":"2026-10-29T02:00:00Z","payload":{"call_control_id":"v3:abc","call_session_id":"sess_1","from":"+15550001111","to":"+15550002222"}},"meta":{"attempt":1,"delivered_to":"voice-call-events"}}'
#   TS=$(date +%s)
#   SIG=$(printf '%s|%s' "$TS" "$PAYLOAD" | openssl pkeyutl -sign -inkey telnyx_private.pem -rawin | base64 -w0)
# (The foreman holds the private key; Telnyx's public key is in the portal.)
curl -i -X POST "$SUPABASE_URL/functions/v1/voice-call-events" \
  -H "Content-Type: application/json" \
  -H "telnyx-timestamp: $TS" \
  -H "telnyx-signature-ed25519: $SIG" \
  --data-raw "$PAYLOAD"
# Expect: HTTP 200 {"received":true}
# Expect in DB: call_logs.status='in_progress', answered_at set for telnyx_call_control_id='v3:abc'
```

**4. Twilio status callback replay.**
```bash
# Generate a valid X-Twilio-Signature:
#   URL="$SUPABASE_URL/functions/v1/twilio-voice-status"
#   BODY='CallSid=CA123&CallStatus=in-progress&CallDuration=0'
#   SIG=$(printf '%s' "${URL}CallSidCA123CallStatusin-progressCallDuration0" | openssl dgst -sha1 -hmac "$TWILIO_AUTH_TOKEN" -binary | base64)
curl -i -X POST "$SUPABASE_URL/functions/v1/twilio-voice-status" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "X-Twilio-Signature: $SIG" \
  --data-raw "$BODY"
# Expect: HTTP 200 {"received":true}
# Expect in DB: call_logs.status='in_progress', answered_at set for telnyx_call_control_id='CA123'

# Negative: same body with a wrong signature → HTTP 403 {"error":"Invalid Twilio signature"}
```