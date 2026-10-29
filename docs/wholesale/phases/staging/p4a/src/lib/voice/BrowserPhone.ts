/**
 * Provider-agnostic browser phone client (Telnyx WebRTC or Twilio Voice SDK).
 *
 * Flow for both providers:
 *   connect(provider, token, organizationId, supabaseAccessToken)
 *   call({lead_id, to, from})  -> POST voice-call (validates caller ID, lead,
 *                                 DNC; inserts call_logs) -> browser places the leg
 *   hold/unhold/mute/dtmf      -> local SDK primitives (server is told only
 *                                 where it must act: hangup, transfer)
 *   hangup                     -> local + POST voice-call-action hangup
 *   onState / onTranscript     -> state machine + Realtime on call_live_transcripts
 *
 * ASSUMPTION (brief line 15): for Telnyx the browser leg is the FIRST leg. The
 * browser dials via TelnyxRTC `client.newCall({destinationNumber, callerNumber,
 * clientState})`; once the SDK exposes `call.telnyxIDs.telnyxCallControlId`
 * (verified accessor: telnyxCallControlId / telnyxSessionId / telnyxLegId) it is
 * POSTed to voice-call-action `register_provider_call`, which starts recording
 * and transcription server-side via Call Control.
 * For Twilio, `device.connect({params})` hits the TwiML App URL
 * (twilio-voice-twiml), which dials from the call_logs row and binds the CallSid;
 * on 'accept' the browser also reports call.parameters.CallSid (idempotent).
 *
 * VERIFY: @telnyx/webrtc and @twilio/voice-sdk versions (package.json lines).
 * VERIFY: TelnyxRTC newCall `clientState` option name (used only as a webhook
 *   matching fallback; register_provider_call is the primary binding).
 * VERIFY: TelnyxRTC notification shape {type:'callUpdate', call:{state, telnyxIDs}}.
 */

import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { TelnyxRTC } from '@telnyx/webrtc';
import { Call as TwilioCall, Device } from '@twilio/voice-sdk';

export type VoiceProvider = 'telnyx' | 'twilio';

export type PhoneState =
  | 'disconnected'
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

export interface VoiceCallError extends Error {
  error_code?: string;
  status?: number;
}

type StateCallback = (state: PhoneState, detail?: unknown) => void;
type TranscriptCallback = (line: TranscriptLine) => void;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCall = any;

export class BrowserPhone {
  private provider: VoiceProvider | null = null;
  private supabaseAccessToken: string | null = null;
  private organizationId: string | null = null;
  private supabase: SupabaseClient | null = null;
  private telnyxClient: TelnyxRTC | null = null;
  private telnyxCall: AnyCall = null;
  private twilioDevice: Device | null = null;
  private twilioCall: TwilioCall | null = null;
  private currentCallLogId: string | null = null;
  private registeredProviderCallId: string | null = null;
  private realtimeChannel: RealtimeChannel | null = null;
  private muted = false;
  private state: PhoneState = 'disconnected';
  private stateCallbacks = new Set<StateCallback>();
  private transcriptCallbacks = new Set<TranscriptCallback>();

  constructor(private readonly supabaseUrl: string, private readonly supabaseAnonKey: string) {}

  getState(): PhoneState {
    return this.state;
  }

  getCallLogId(): string | null {
    return this.currentCallLogId;
  }

  async connect(
    provider: VoiceProvider,
    providerToken: string,
    organizationId: string,
    supabaseAccessToken: string,
  ): Promise<void> {
    await this.disconnect();
    this.provider = provider;
    this.organizationId = organizationId;
    this.supabaseAccessToken = supabaseAccessToken;
    // Realtime must carry the user's JWT so the "Company members can view live
    // transcripts" RLS policy applies to the subscription.
    this.supabase = createClient(this.supabaseUrl, this.supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${supabaseAccessToken}` } },
    });
    this.supabase.realtime.setAuth(supabaseAccessToken);
    this.emitState('connecting');

    if (provider === 'telnyx') {
      const client = new TelnyxRTC({ login_token: providerToken });
      this.telnyxClient = client;
      client.on('telnyx.ready', () => this.emitState('idle'));
      client.on('telnyx.error', (error: unknown) => this.emitState('error', error));
      client.on('telnyx.socket.close', () => this.emitState('disconnected'));
      client.on('telnyx.notification', (notification: AnyCall) => this.handleTelnyxNotification(notification));
      await client.connect();
      return;
    }

    const device = new Device(providerToken, { logLevel: 'warn' });
    this.twilioDevice = device;
    device.on('registered', () => this.emitState('idle'));
    device.on('unregistered', () => this.emitState('disconnected'));
    device.on('error', (error: unknown) => this.emitState('error', error));
    device.on('incoming', (call: TwilioCall) => { call.reject(); }); // incoming.allow=false; defensive
    await device.register();
  }

  async disconnect(): Promise<void> {
    this.unsubscribeTranscripts();
    try { this.telnyxCall?.hangup?.(); } catch { /* ignore */ }
    try { this.twilioCall?.disconnect(); } catch { /* ignore */ }
    try { this.telnyxClient?.disconnect(); } catch { /* ignore */ }
    try { this.twilioDevice?.destroy(); } catch { /* ignore */ }
    this.telnyxCall = null;
    this.twilioCall = null;
    this.telnyxClient = null;
    this.twilioDevice = null;
    this.currentCallLogId = null;
    this.registeredProviderCallId = null;
    this.muted = false;
    if (this.provider) this.emitState('disconnected');
  }

  async call(opts: CallOptions): Promise<CallResult> {
    if (!this.provider || !this.organizationId) throw new Error('BrowserPhone.connect() must be called first');
    if (this.currentCallLogId) throw new Error('A call is already in progress');
    this.emitState('connecting');

    const body = await this.postJson('voice-call', {
      organization_id: this.organizationId,
      provider: this.provider,
      lead_id: opts.lead_id,
      to: opts.to,
      from: opts.from,
    });

    const callLogId = String(body.call_log_id || '');
    if (!UUID_PATTERN.test(callLogId)) throw new Error('voice-call returned no call_log_id');
    this.currentCallLogId = callLogId;
    this.registeredProviderCallId = null;
    this.muted = false;
    this.subscribeTranscripts(callLogId);

    try {
      if (this.provider === 'telnyx') {
        const extra = (body.extra || {}) as Record<string, string>;
        if (!this.telnyxClient) throw new Error('Telnyx client is not connected');
        const telnyxCall = this.telnyxClient.newCall({
          destinationNumber: extra.destination_number || body.to || opts.to,
          callerNumber: extra.caller_number || body.from || opts.from,
          // VERIFY option name; forwarded as Call Control client_state.
          clientState: extra.client_state,
        } as AnyCall);
        this.telnyxCall = telnyxCall;
        this.emitState('ringing');
        await this.registerTelnyxIdsIfPresent(telnyxCall);
        return { call_log_id: callLogId, provider_call_id: this.registeredProviderCallId };
      }

      if (!this.twilioDevice) throw new Error('Twilio device is not registered');
      const params = ((body.extra && (body.extra as Record<string, unknown>).params) || {}) as Record<string, string>;
      const twilioCall = await this.twilioDevice.connect({ params });
      this.twilioCall = twilioCall;
      twilioCall.on('ringing', () => this.emitState('ringing'));
      twilioCall.on('accept', () => {
        this.emitState('answered');
        const sid = twilioCall.parameters?.CallSid;
        if (sid) void this.registerProviderCall(sid);
      });
      twilioCall.on('disconnect', () => this.onCallEnded());
      twilioCall.on('cancel', () => this.onCallEnded());
      twilioCall.on('error', (error: unknown) => this.emitState('error', error));
      this.emitState('ringing');
      return { call_log_id: callLogId, provider_call_id: null };
    } catch (error) {
      // The row exists but the browser leg never started: tell the server.
      await this.postAction('hangup').catch(() => undefined);
      this.onCallEnded();
      throw error;
    }
  }

  async hold(): Promise<void> {
    if (this.provider === 'telnyx') {
      await this.telnyxCall?.hold?.();
    } else {
      // Twilio Voice SDK has no hold primitive on the browser leg; mute is the closest.
      this.twilioCall?.mute(true);
    }
    this.emitState('held');
  }

  async unhold(): Promise<void> {
    if (this.provider === 'telnyx') {
      await this.telnyxCall?.unhold?.();
    } else {
      this.twilioCall?.mute(this.muted);
    }
    this.emitState('answered');
  }

  mute(muted: boolean): void {
    this.muted = muted;
    if (this.provider === 'telnyx') {
      if (muted) this.telnyxCall?.muteAudio?.();
      else this.telnyxCall?.unmuteAudio?.();
    } else {
      this.twilioCall?.mute(muted);
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  dtmf(digits: string): void {
    if (!/^[0-9A-Da-d#*]{1,32}$/.test(digits)) throw new Error('dtmf: 1-32 of 0-9 A-D # *');
    if (this.provider === 'telnyx') {
      this.telnyxCall?.dtmf?.(digits);
    } else {
      this.twilioCall?.sendDigits(digits);
    }
  }

  async hangup(): Promise<void> {
    if (this.provider === 'telnyx') {
      try { this.telnyxCall?.hangup?.(); } catch { /* ignore */ }
    } else {
      try { this.twilioCall?.disconnect(); } catch { /* ignore */ }
    }
    // Server-side hangup is idempotent and closes the row even if no webhook arrives.
    await this.postAction('hangup').catch((error) => console.warn('[BrowserPhone] server hangup failed:', error));
    this.onCallEnded();
  }

  async transfer(to: string): Promise<void> {
    await this.postAction('transfer', { to });
  }

  onState(cb: StateCallback): () => void {
    this.stateCallbacks.add(cb);
    return () => this.stateCallbacks.delete(cb);
  }

  onTranscript(cb: TranscriptCallback): () => void {
    this.transcriptCallbacks.add(cb);
    return () => this.transcriptCallbacks.delete(cb);
  }

  // ---------------------------------------------------------------------------

  private handleTelnyxNotification(notification: AnyCall): void {
    if (!notification || notification.type !== 'callUpdate') return;
    const call = notification.call;
    if (!call) return;
    if (this.telnyxCall && call.id && this.telnyxCall.id && call.id !== this.telnyxCall.id) return;
    this.telnyxCall = call;
    void this.registerTelnyxIdsIfPresent(call);
    switch (call.state) {
      case 'trying':
      case 'requesting':
      case 'early':
      case 'ringing':
        if (this.state !== 'ringing') this.emitState('ringing');
        break;
      case 'active':
        if (this.state !== 'held') this.emitState('answered');
        break;
      case 'held':
        this.emitState('held');
        break;
      case 'hangup':
      case 'destroy':
      case 'purge':
        this.onCallEnded();
        break;
      default:
        break;
    }
  }

  private async registerTelnyxIdsIfPresent(call: AnyCall): Promise<void> {
    const controlId: string | undefined = call?.telnyxIDs?.telnyxCallControlId;
    if (controlId) await this.registerProviderCall(controlId);
  }

  private async registerProviderCall(providerCallId: string): Promise<void> {
    if (!this.currentCallLogId || !providerCallId) return;
    if (this.registeredProviderCallId === providerCallId) return;
    this.registeredProviderCallId = providerCallId;
    try {
      const res = await this.postAction('register_provider_call', { provider_call_id: providerCallId });
      const warnings = Array.isArray(res?.warnings) ? res.warnings : [];
      if (warnings.length > 0) console.warn('[BrowserPhone] register_provider_call warnings:', warnings);
    } catch (error) {
      this.registeredProviderCallId = null;
      console.error('[BrowserPhone] register_provider_call failed:', error);
    }
  }

  private onCallEnded(): void {
    if (this.state === 'ended' && !this.currentCallLogId) return;
    this.telnyxCall = null;
    this.twilioCall = null;
    this.currentCallLogId = null;
    this.registeredProviderCallId = null;
    this.muted = false;
    this.unsubscribeTranscripts();
    this.emitState('ended');
    this.emitState('idle');
  }

  private async postJson(fn: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.supabaseUrl}/functions/v1/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.supabaseAccessToken}`,
        'apikey': this.supabaseAnonKey,
      },
      body: JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || body.success === false) {
      const error: VoiceCallError = new Error(String(body.error || `${fn} failed (${res.status})`));
      error.error_code = typeof body.error_code === 'string' ? body.error_code : undefined;
      error.status = res.status;
      throw error;
    }
    return body;
  }

  private async postAction(action: string, extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    if (!this.currentCallLogId) return {};
    return await this.postJson('voice-call-action', { call_log_id: this.currentCallLogId, action, ...extra });
  }

  private subscribeTranscripts(callLogId: string): void {
    if (!this.supabase) return;
    if (!UUID_PATTERN.test(callLogId)) {
      console.error('[BrowserPhone] refusing to subscribe with non-UUID call_log_id', callLogId);
      return;
    }
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
        (payload: { new?: Record<string, unknown> }) => {
          const row = payload?.new;
          if (!row) return;
          const line: TranscriptLine = {
            seq: Number(row.seq),
            speaker: (row.speaker as TranscriptLine['speaker']) || 'unknown',
            text: String(row.text || ''),
            is_final: Boolean(row.is_final),
            at: String(row.at || new Date().toISOString()),
          };
          for (const cb of this.transcriptCallbacks) cb(line);
        },
      )
      .subscribe((status: string) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[BrowserPhone] realtime transcript subscription failed:', status);
        }
      });
  }

  private unsubscribeTranscripts(): void {
    if (this.realtimeChannel && this.supabase) {
      void this.supabase.removeChannel(this.realtimeChannel);
    }
    this.realtimeChannel = null;
  }

  private emitState(state: PhoneState, detail?: unknown): void {
    this.state = state;
    for (const cb of this.stateCallbacks) {
      try { cb(state, detail); } catch (error) { console.error('[BrowserPhone] state callback threw:', error); }
    }
  }
}
