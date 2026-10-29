/**
 * twilio-voice-status: Twilio call-status + recording-status callback.
 *
 * Signature-validated (403 on failure), otherwise always 200.
 * call_logs.provider_call_id stores the PARENT (browser) CallSid. <Dial><Number
 * statusCallback> events carry the CHILD CallSid plus ParentCallSid, recording
 * callbacks carry the parent CallSid, and the TwiML App's own status callback
 * (configure it in the Twilio console to this URL) carries the parent CallSid.
 * Lookup therefore matches provider_call_id against both ids.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { validateTwilioWebhook } from '../_shared/twilio.ts';
import { getProvider } from '../_shared/voice-provider.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-twilio-signature',
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const rawBody = await req.text();
  if (!(await validateTwilioWebhook(req, rawBody))) {
    return json({ error: 'Invalid Twilio signature' }, 403);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase configuration missing');
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const events = getProvider('twilio').parseWebhookBody(rawBody);

    for (const event of events) {
      try {
        const ids = [event.provider_call_id, event.parent_provider_call_id].filter(
          (v): v is string => typeof v === 'string' && /^CA[0-9a-f]{32}$/i.test(v),
        );
        if (ids.length === 0) continue;

        const { data: callLog, error: lookupError } = await supabaseAdmin
          .from('call_logs')
          .select('id, organization_id, status, answered_at')
          .eq('provider', 'twilio')
          .in('provider_call_id', ids)
          .limit(1)
          .maybeSingle();
        if (lookupError) throw new Error(`call_logs lookup failed: ${lookupError.message}`);
        if (!callLog?.id) {
          console.warn('[twilio-voice-status] no call_logs row for', event.type, ids.join(','));
          continue;
        }

        const ended = ['completed', 'failed'].includes(String(callLog.status || ''));
        // deno-lint-ignore no-explicit-any
        const p = event.payload as any;
        const update: Record<string, unknown> = {};

        if (event.type === 'ringing') {
          if (!ended && callLog.status === 'initiated') update.status = 'ringing';
        } else if (event.type === 'answered') {
          if (!ended) {
            update.status = 'in_progress';
            update.answered_at = event.at;
          }
        } else if (event.type === 'hangup') {
          const callStatus = String(p?.CallStatus || '').toLowerCase();
          // Parent 'completed' after child completion is a no-op; child outcomes win.
          if (!ended || callStatus !== 'completed') {
            update.status = callStatus === 'failed' ? 'failed' : 'completed';
            update.ended_at = event.at;
            update.outcome = callStatus;
            const duration = Number(p?.CallDuration);
            if (Number.isFinite(duration) && duration >= 0) update.duration_seconds = Math.round(duration);
          }
        } else if (event.type === 'recording_saved') {
          const url = typeof p?.RecordingUrl === 'string' ? p.RecordingUrl : '';
          // Twilio RecordingUrl requires account auth to fetch; the .mp3 form is stored as-is.
          if (url) update.recording_url = url.endsWith('.mp3') || url.endsWith('.wav') ? url : `${url}.mp3`;
        }

        if (Object.keys(update).length === 0) continue;
        const { error: updateError } = await supabaseAdmin
          .from('call_logs')
          .update(update)
          .eq('id', callLog.id)
          .eq('organization_id', callLog.organization_id);
        if (updateError) console.error('[twilio-voice-status] update failed:', updateError);
      } catch (eventError) {
        console.error('[twilio-voice-status] event failed:', event.type, (eventError as Error).message);
      }
    }

    return json({ received: true, events: events.length });
  } catch (error) {
    console.error('[twilio-voice-status] Error:', error);
    return json({ received: true, error: (error as Error).message });
  }
});
