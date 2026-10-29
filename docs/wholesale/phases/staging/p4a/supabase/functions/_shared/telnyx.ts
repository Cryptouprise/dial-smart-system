/**
 * Telnyx browser-phone provider.
 *
 * ASSUMPTION (brief line 15, house rule): the browser WebRTC leg is the FIRST
 * leg. The browser dials `to` via @telnyx/webrtc `client.newCall({destinationNumber,
 * callerNumber, clientState})`. `voice-call` only validates, logs and returns
 * the newCall options. Once the SDK exposes `call.telnyxIDs.telnyxCallControlId`
 * the browser POSTs it to `voice-call-action` action `register_provider_call`,
 * which writes `call_logs.telnyx_call_control_id` and then calls
 * `onProviderCallRegistered` here to start recording + real-time transcription
 * on that leg via Call Control.
 *
 * Verified (team lead, 2026-10-29): transcription_start =
 *   POST /v2/calls/{call_control_id}/actions/transcription_start
 *   {"transcription_engine":"Google","transcription_engine_config":{"transcription_engine":"Google","language":"en","interim_results":true}}
 *   and transcript webhooks arrive as `call.transcription` events.
 *
 * VERIFY: `call.transcription` payload field names (assumed
 *   transcription_data.{transcript,is_final,confidence,transcription_track}) and
 *   whether transcription_track 'inbound' on the browser (A) leg is the rep.
 *   Doc: Telnyx API reference "Transcription start" + "Call Control webhooks".
 * VERIFY: record_start body ({format:'mp3', channels:'dual'}) and the
 *   `call.recording.saved` payload (recording_urls.mp3 / public_recording_urls).
 *   Doc: Telnyx API reference "Recording start".
 * VERIFY: Call Control commands are accepted on a leg that originated from a
 *   WebRTC credential connection; the SIP connection's webhook_event_url must
 *   point at voice-call-events. Doc: Telnyx "Credential connections".
 * VERIFY: Call Control has no per-call `hold` command (only conference hold).
 *   Hold/unhold are therefore client-side (TelnyxRTC call.hold()/unhold());
 *   the server treats them as no-ops. Doc: Telnyx "Call commands".
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

async function telnyxFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(`${TELNYX_API_BASE}${path}`, {
      ...init,
      headers: {
        'Authorization': `Bearer ${telnyxApiKey()}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function telnyxCommand(callControlId: string, command: string, body: Record<string, unknown> = {}): Promise<void> {
  const res = await telnyxFetch(`/calls/${encodeURIComponent(callControlId)}/actions/${command}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Telnyx ${command} failed (${res.status}): ${text.slice(0, 500)}`);
  }
}

/**
 * Ensure a telephony credential exists for this (user, provider) pair. The
 * credential id is stored in `voice_credentials` (unique on user_id, provider).
 * Lookup is scoped to the company so a credential is never reused across orgs.
 */
async function ensureTelephonyCredential(ctx: MintTokenContext): Promise<string> {
  const { data: existing, error: lookupError } = await ctx.supabaseAdmin
    .from('voice_credentials')
    .select('provider_credential_id, organization_id')
    .eq('user_id', ctx.userId)
    .eq('provider', 'telnyx')
    .maybeSingle();
  if (lookupError) throw new Error(`voice_credentials lookup failed: ${lookupError.message}`);
  if (existing?.provider_credential_id) {
    if (existing.organization_id !== ctx.organizationId) {
      throw new Error('voice credential belongs to a different organization');
    }
    return existing.provider_credential_id as string;
  }

  const createRes = await telnyxFetch('/telephony_credentials', {
    method: 'POST',
    body: JSON.stringify({
      connection_id: telnyxSipConnectionId(),
      name: `dialsmart-${ctx.userId}`,
    }),
  });
  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`Telnyx telephony_credentials create failed (${createRes.status}): ${text.slice(0, 500)}`);
  }
  const created = await createRes.json();
  const credentialId = created?.data?.id;
  if (typeof credentialId !== 'string' || !credentialId) {
    throw new Error('Telnyx telephony_credentials create returned no id');
  }

  const { error: insertError } = await ctx.supabaseAdmin
    .from('voice_credentials')
    .insert({
      organization_id: ctx.organizationId,
      user_id: ctx.userId,
      provider: 'telnyx',
      provider_credential_id: credentialId,
    });
  if (insertError) {
    // Unique (user_id, provider) race: another request created it first. Re-read.
    if (insertError.code === '23505') {
      const { data: raced } = await ctx.supabaseAdmin
        .from('voice_credentials')
        .select('provider_credential_id')
        .eq('user_id', ctx.userId)
        .eq('provider', 'telnyx')
        .maybeSingle();
      if (raced?.provider_credential_id) return raced.provider_credential_id as string;
    }
    throw new Error(`voice_credentials insert failed: ${insertError.message}`);
  }
  return credentialId;
}

function speakerFromTrack(track: unknown): TranscriptSpeaker {
  // VERIFY: on the browser (A) leg, 'inbound' = audio Telnyx receives from the
  // browser = rep; 'outbound' = audio sent to the browser = contact.
  const t = String(track || '').toLowerCase();
  if (t === 'inbound') return 'rep';
  if (t === 'outbound') return 'contact';
  return 'unknown';
}

function parseTelnyxBody(raw: string): NormalizedEvent[] {
  // deno-lint-ignore no-explicit-any
  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return [];
  }
  const eventType = payload?.data?.event_type as string | undefined;
  const p = (payload?.data?.payload || {}) as Record<string, unknown>;
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
      // VERIFY: payload shape; parsed defensively.
      // deno-lint-ignore no-explicit-any
      const td = ((p as any).transcription_data || (p as any).transcript || {}) as Record<string, unknown>;
      const text = String(td.transcript ?? td.text ?? '').trim();
      if (!text) return [];
      const isFinal = td.is_final !== false;
      return [{
        ...base,
        type: 'transcript',
        transcript: { speaker: speakerFromTrack(td.transcription_track ?? td.track), text, is_final: isFinal },
      }];
    }
    default:
      return [];
  }
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
      throw new Error(`Telnyx token mint failed (${res.status}): ${text.slice(0, 500)}`);
    }
    // The token endpoint returns the JWT as a plain-text body (VERIFY: some
    // API versions wrap it as {data:{token}}). Accept both.
    const bodyText = await res.text();
    let token = '';
    let expiresAt: string | undefined;
    try {
      const parsed = JSON.parse(bodyText);
      token = String(parsed?.data?.token ?? parsed?.token ?? '');
      expiresAt = parsed?.data?.expires_at ?? parsed?.expires_at;
    } catch {
      token = bodyText.trim();
    }
    if (!token) throw new Error('Telnyx token mint returned no token');
    return {
      token,
      expires_at: expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      extra: { credential_id: credentialId },
    };
  },

  // deno-lint-ignore require-await
  async startOutbound(ctx: StartOutboundContext): Promise<StartOutboundResult> {
    // Browser is the first leg: no server-side POST /v2/calls. Return the
    // newCall() options; client_state lets voice-call-events match early
    // events before register_provider_call lands (VERIFY: TelnyxRTC newCall
    // `clientState` option is forwarded as Call Control client_state).
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
    // Client-side primitives (TelnyxRTC): mute/unmute (muteAudio/unmuteAudio),
    // hold/unhold (call.hold/unhold), dtmf (call.dtmf). The server records
    // them as no-ops so the UI contract is uniform and nothing is sent twice.
    if (input.action === 'mute' || input.action === 'unmute' || input.action === 'hold' || input.action === 'unhold') {
      return;
    }
    if (!ctx.providerCallId) {
      throw new Error('Telnyx call has no call_control_id yet (register_provider_call not received)');
    }
    switch (input.action) {
      case 'dtmf':
        if (!input.digits || !/^[0-9A-Da-d#*wW]{1,32}$/.test(input.digits)) throw new Error('dtmf requires 1-32 digits');
        await telnyxCommand(ctx.providerCallId, 'send_dtmf', { digits: input.digits });
        return;
      case 'hangup':
        try {
          await telnyxCommand(ctx.providerCallId, 'hangup', {});
        } catch (error) {
          // Already hung up by the browser leg: Telnyx answers 4xx. Treat as done.
          const message = (error as Error).message;
          if (/\(4\d\d\)/.test(message)) return;
          throw error;
        }
        return;
      case 'transfer':
        // VERIFY: transfer on the browser (A) leg re-bridges the REP to `to`,
        // not the contact. Kept per brief; the UI does not expose it yet.
        if (!input.to || !/^\+[1-9]\d{7,14}$/.test(input.to)) throw new Error('transfer requires an E.164 to');
        await telnyxCommand(ctx.providerCallId, 'transfer', { to: input.to });
        return;
      default:
        throw new Error(`Unsupported Telnyx action: ${input.action}`);
    }
  },

  async parseWebhook(req: Request): Promise<NormalizedEvent[]> {
    return parseTelnyxBody(await req.text());
  },

  parseWebhookBody(rawBody: string): NormalizedEvent[] {
    return parseTelnyxBody(rawBody);
  },

  async onProviderCallRegistered(ctx: ActionContext): Promise<string[]> {
    const warnings: string[] = [];
    if (!ctx.providerCallId) return ['no call_control_id to start recording/transcription on'];
    try {
      // VERIFY: record_start body.
      await telnyxCommand(ctx.providerCallId, 'record_start', { format: 'mp3', channels: 'dual' });
    } catch (error) {
      warnings.push(`record_start failed: ${(error as Error).message}`);
    }
    try {
      await telnyxCommand(ctx.providerCallId, 'transcription_start', {
        transcription_engine: 'Google',
        transcription_engine_config: {
          transcription_engine: 'Google',
          language: 'en',
          interim_results: true,
        },
      });
    } catch (error) {
      warnings.push(`transcription_start failed: ${(error as Error).message}`);
    }
    return warnings;
  },
};
