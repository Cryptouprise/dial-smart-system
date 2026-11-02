/**
 * Provider-agnostic browser phone contract.
 *
 * Both Telnyx (WebRTC via @telnyx/webrtc) and Twilio (Voice SDK via
 * @twilio/voice-sdk) are wrapped behind one interface so the UI and the edge
 * functions never branch on provider except through `getProvider()`.
 * All provider-specific HTTP lives in telnyx.ts / twilio.ts.
 *
 * Provider-call-id storage (house rule):
 *   telnyx -> call_logs.telnyx_call_control_id
 *   twilio -> call_logs.provider_call_id   (added by 20261029160000_browser_phone.sql)
 * Use `providerCallIdColumn(provider)` everywhere instead of a literal.
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

export type TranscriptSpeaker = 'rep' | 'contact' | 'unknown';

export interface NormalizedTranscript {
  speaker: TranscriptSpeaker;
  text: string;
  is_final: boolean;
}

export interface NormalizedEvent {
  provider: VoiceProvider;
  /** Telnyx call_control_id, or Twilio CallSid of the leg the event is about. */
  provider_call_id: string;
  /**
   * Twilio only: the parent (browser) CallSid when the event is about a child
   * <Dial> leg. call_logs.provider_call_id stores the PARENT CallSid, so
   * webhook lookups try both ids.
   */
  parent_provider_call_id?: string | null;
  type: NormalizedEventType;
  at: string;
  payload: Record<string, unknown>;
  transcript?: NormalizedTranscript;
}

// deno-lint-ignore no-explicit-any
export type SupabaseAdminClient = any;

export interface MintTokenContext {
  organizationId: string;
  userId: string;
  supabaseAdmin: SupabaseAdminClient;
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
  supabaseAdmin: SupabaseAdminClient;
}

export interface StartOutboundResult {
  /** Set only when the provider created the call server-side. Null for both providers in this build. */
  provider_call_id: string | null;
  /** Extra fields the browser needs to complete the leg (Telnyx newCall options / Twilio connect params). */
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

export const VOICE_ACTIONS: ReadonlySet<string> = new Set<VoiceAction>([
  'hold', 'unhold', 'mute', 'unmute', 'dtmf', 'hangup', 'transfer',
]);

export function isVoiceAction(value: unknown): value is VoiceAction {
  return typeof value === 'string' && VOICE_ACTIONS.has(value);
}

export interface ActionContext {
  organizationId: string;
  userId: string;
  callLogId: string;
  providerCallId: string | null;
  supabaseAdmin: SupabaseAdminClient;
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
  /** Reads the request body and normalizes it. Signature verification is the caller's job. */
  parseWebhook(req: Request): Promise<NormalizedEvent[]>;
  /** Same as parseWebhook but for a body the caller already read (needed after signature checks). */
  parseWebhookBody(rawBody: string): NormalizedEvent[];
  /**
   * Called by voice-call-action `register_provider_call` once the browser has
   * reported the provider call id. Telnyx uses it to start recording and
   * real-time transcription on the browser-originated leg. Returns warnings
   * (non-fatal) so the UI can surface them.
   */
  onProviderCallRegistered?(ctx: ActionContext): Promise<string[]>;
}

export function isVoiceProvider(value: unknown): value is VoiceProvider {
  return value === 'telnyx' || value === 'twilio';
}

/** The call_logs column that stores the provider's call id for this provider. */
export function providerCallIdColumn(provider: VoiceProvider): 'telnyx_call_control_id' | 'provider_call_id' {
  return provider === 'telnyx' ? 'telnyx_call_control_id' : 'provider_call_id';
}

/**
 * Public base URL that providers call back and that Twilio signs.
 * Re-exported for compatibility; the implementation now lives in the leaf
 * module ./public-url.ts so twilio.ts can use it without importing this file
 * (that import was a cycle - see the note on providerRegistry() below).
 */
export { publicFunctionsBaseUrl } from './public-url.ts';

/** E.164 and the common stored variants (+1XXXXXXXXXX, 1XXXXXXXXXX, XXXXXXXXXX). */
export function normalizePhoneVariants(phone: string): string[] {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return [];
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  const e164 = digits.length === 10 ? `+1${digits}` : `+${digits}`;
  return Array.from(new Set([e164, e164.slice(1), national]));
}

export function isE164(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

import { telnyxProvider } from './telnyx.ts';
import { twilioProvider } from './twilio.ts';

/**
 * Resolved lazily, on first use - never at module scope.
 *
 * HISTORY (2026-11-02): this used to be a module-scope `const REGISTRY = {...}`.
 * twilio.ts imports this module and this module imports twilio.ts, so the two
 * form a cycle. When an entry file imported twilio.ts first, this module was
 * evaluated while twilio.ts was still initialising, and reading `twilioProvider`
 * here threw `ReferenceError: Cannot access 'twilioProvider' before initialization`
 * (temporal dead zone) at boot. Supabase surfaced that as a 500 WORKER_ERROR on
 * every request, including OPTIONS. Building the map inside the function defers
 * the read until the cycle has fully settled, so import order no longer matters.
 * Do not hoist this back to module scope.
 */
function providerRegistry(): Record<VoiceProvider, BrowserPhoneProvider> {
  return { telnyx: telnyxProvider, twilio: twilioProvider };
}

export function getProvider(name: string): BrowserPhoneProvider {
  if (!isVoiceProvider(name)) {
    throw new Error(`Unsupported voice provider: ${name}`);
  }
  return providerRegistry()[name];
}
