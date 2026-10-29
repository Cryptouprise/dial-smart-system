/**
 * voice-call-events: Telnyx Call Control webhook for browser-phone calls.
 *
 * Signature: Ed25519 over `${telnyx-timestamp}|${rawBody}` with the Telnyx
 * public key in WEBHOOK_SECRET_TELNYX (same env + pattern as telnyx-webhook).
 *   missing key -> 503, bad/missing signature or stale timestamp -> 401,
 *   otherwise ALWAYS 200 (per-event failures are logged, never re-thrown).
 *
 * Row matching (house rule: provider id columns), in order:
 *   1. call_logs.telnyx_call_control_id = payload.call_control_id
 *   2. client_state (base64 JSON from newCall) -> call_logs.id            [VERIFY: TelnyxRTC forwards clientState]
 *   3. most recent provider='telnyx' row still initiated/ringing whose
 *      phone_number matches payload.to within 5 minutes                 [early events before register_provider_call]
 * A match via 2 or 3 binds telnyx_call_control_id so later events hit path 1.
 *
 * Writes use the service-role client and always filter by organization_id;
 * transcript lines go through append_call_live_transcript (atomic seq).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { getProvider, normalizePhoneVariants, type NormalizedEvent } from '../_shared/voice-provider.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, telnyx-signature-ed25519, telnyx-timestamp',
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CallLogRow = { id: string; organization_id: string; user_id: string; status: string | null; answered_at: string | null };

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function verifyTelnyxSignature(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
  publicKeyBase64: string,
): Promise<boolean> {
  if (!signature || !timestamp) return false;
  // Replay protection: reject timestamps more than 5 minutes off.
  const eventTime = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(eventTime) || Math.abs(now - eventTime) > 300) return false;
  try {
    const signedPayload = `${timestamp}|${rawBody}`;
    const publicKeyBytes = Uint8Array.from(atob(publicKeyBase64), (c) => c.charCodeAt(0));
    const signatureBytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey('raw', publicKeyBytes, { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify('Ed25519', cryptoKey, signatureBytes, new TextEncoder().encode(signedPayload));
  } catch {
    return false;
  }
}

function callLogIdFromClientState(payload: Record<string, unknown>): string | null {
  const raw = payload?.client_state;
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const decoded = JSON.parse(atob(raw));
    const id = decoded?.call_log_id;
    return typeof id === 'string' && UUID_PATTERN.test(id) ? id.toLowerCase() : null;
  } catch {
    return null;
  }
}

// deno-lint-ignore no-explicit-any
async function resolveCallLog(supabaseAdmin: any, event: NormalizedEvent): Promise<CallLogRow | null> {
  const select = 'id, organization_id, user_id, status, answered_at';

  const { data: byProviderId, error: lookupError } = await supabaseAdmin
    .from('call_logs')
    .select(select)
    .eq('telnyx_call_control_id', event.provider_call_id)
    .eq('provider', 'telnyx')
    .maybeSingle();
  if (lookupError) throw new Error(`call_logs lookup failed: ${lookupError.message}`);
  if (byProviderId) return byProviderId as CallLogRow;

  let candidate: CallLogRow | null = null;

  const fallbackId = callLogIdFromClientState(event.payload);
  if (fallbackId) {
    const { data, error } = await supabaseAdmin
      .from('call_logs')
      .select(select)
      .eq('id', fallbackId)
      .eq('provider', 'telnyx')
      .maybeSingle();
    if (error) throw new Error(`client_state fallback lookup failed: ${error.message}`);
    candidate = (data as CallLogRow | null) || null;
  }

  if (!candidate) {
    const toVariants = normalizePhoneVariants(String(event.payload?.to || ''));
    if (toVariants.length > 0) {
      const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data, error } = await supabaseAdmin
        .from('call_logs')
        .select(select)
        .eq('provider', 'telnyx')
        .is('telnyx_call_control_id', null)
        .in('status', ['initiated', 'ringing'])
        .in('phone_number', toVariants)
        .gte('started_at', since)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`destination fallback lookup failed: ${error.message}`);
      candidate = (data as CallLogRow | null) || null;
    }
  }

  if (!candidate) return null;

  // Bind the provider id now so later events match directly (only if unbound).
  const { error: bindError } = await supabaseAdmin
    .from('call_logs')
    .update({ telnyx_call_control_id: event.provider_call_id })
    .eq('id', candidate.id)
    .eq('organization_id', candidate.organization_id)
    .is('telnyx_call_control_id', null);
  if (bindError) console.error('[voice-call-events] bind provider id failed:', bindError);
  return candidate;
}

function secondsBetween(startIso: unknown, endIso: unknown): number | null {
  const start = Date.parse(String(startIso || ''));
  const end = Date.parse(String(endIso || ''));
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return Math.round((end - start) / 1000);
}

// deno-lint-ignore no-explicit-any
async function applyEvent(supabaseAdmin: any, callLog: CallLogRow, event: NormalizedEvent): Promise<void> {
  const update: Record<string, unknown> = {};
  const ended = ['completed', 'failed'].includes(String(callLog.status || ''));
  // deno-lint-ignore no-explicit-any
  const p = event.payload as any;

  switch (event.type) {
    case 'initiated':
      return;
    case 'ringing':
      if (!ended && callLog.status === 'initiated') update.status = 'ringing';
      break;
    case 'answered':
      if (!ended) {
        update.status = 'in_progress';
        update.answered_at = event.at;
      }
      break;
    case 'hangup': {
      update.status = 'completed';
      update.ended_at = event.at;
      const cause = typeof p?.hangup_cause === 'string' ? p.hangup_cause : null;
      if (cause) update.outcome = cause;
      // VERIFY: call.hangup payload start_time/end_time; falls back to answered_at.
      const duration = secondsBetween(p?.start_time, p?.end_time)
        ?? secondsBetween(callLog.answered_at, event.at)
        ?? 0;
      update.duration_seconds = duration;
      break;
    }
    case 'recording_saved': {
      // VERIFY: call.recording.saved payload shape.
      const url = p?.recording_urls?.mp3 || p?.public_recording_urls?.mp3 || p?.recording_urls?.wav || null;
      if (typeof url === 'string' && url) update.recording_url = url;
      break;
    }
    case 'amd': {
      const result = String(p?.result || '').toLowerCase();
      update.amd_result = result === 'machine' ? 'machine' : result === 'human' ? 'human' : 'unknown';
      break;
    }
    case 'transcript': {
      if (!event.transcript) return;
      const { error } = await supabaseAdmin.rpc('append_call_live_transcript', {
        p_call_log_id: callLog.id,
        p_organization_id: callLog.organization_id,
        p_speaker: event.transcript.speaker,
        p_text: event.transcript.text,
        p_is_final: event.transcript.is_final,
        p_at: event.at,
      });
      if (error) console.error('[voice-call-events] transcript append failed:', error);
      return;
    }
  }

  if (Object.keys(update).length === 0) return;
  const { error } = await supabaseAdmin
    .from('call_logs')
    .update(update)
    .eq('id', callLog.id)
    .eq('organization_id', callLog.organization_id);
  if (error) console.error('[voice-call-events] call_logs update failed:', error);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const publicKey = Deno.env.get('WEBHOOK_SECRET_TELNYX');
  const rawBody = await req.text();
  const signature = req.headers.get('telnyx-signature-ed25519');
  const timestamp = req.headers.get('telnyx-timestamp');

  if (!publicKey) {
    console.error('[voice-call-events] WEBHOOK_SECRET_TELNYX is not configured; rejecting webhook');
    return json({ error: 'Telnyx webhook signature verification is not configured' }, 503);
  }
  const valid = await verifyTelnyxSignature(rawBody, signature, timestamp, publicKey);
  if (!valid) {
    console.error('[voice-call-events] Invalid webhook signature');
    return json({ error: 'Invalid webhook signature' }, 401);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase configuration missing');
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const events = getProvider('telnyx').parseWebhookBody(rawBody);
    for (const event of events) {
      try {
        const callLog = await resolveCallLog(supabaseAdmin, event);
        if (!callLog) {
          console.warn('[voice-call-events] no call_logs row for', event.type, event.provider_call_id);
          continue;
        }
        await applyEvent(supabaseAdmin, callLog, event);
      } catch (eventError) {
        console.error('[voice-call-events] event failed:', event.type, (eventError as Error).message);
      }
    }
    return json({ received: true, events: events.length });
  } catch (error) {
    console.error('[voice-call-events] Error:', error);
    // Signature was valid: 200 so Telnyx does not retry a payload we cannot process.
    return json({ received: true, error: (error as Error).message });
  }
});
