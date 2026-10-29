/**
 * twilio-voice-transcription: Twilio Real-Time Transcription statusCallbackUrl.
 *
 * Signature-validated (403 on failure), otherwise always 200.
 * Verified payload: TranscriptionEvent=transcription-content carries
 * TranscriptionData (JSON string, "transcript"), Track, Final, SequenceId,
 * CallSid (the PARENT call the <Start><Transcription> ran on). Started/stopped/
 * error events are acknowledged and logged only.
 * Lines are appended through append_call_live_transcript (atomic seq, RLS-safe).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { validateTwilioWebhook } from '../_shared/twilio.ts';
import { formParams } from '../_shared/twilio-signature.ts';
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
    const params = formParams(rawBody);
    const transcriptionEvent = (params.TranscriptionEvent || '').toLowerCase();
    if (transcriptionEvent === 'transcription-error') {
      console.error('[twilio-voice-transcription] transcription-error', params.CallSid, params.TranscriptionErrorCode, params.TranscriptionError);
      return json({ received: true });
    }
    if (transcriptionEvent && transcriptionEvent !== 'transcription-content') {
      return json({ received: true, event: transcriptionEvent });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase configuration missing');
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const events = getProvider('twilio').parseWebhookBody(rawBody);
    let appended = 0;

    for (const event of events) {
      if (event.type !== 'transcript' || !event.transcript) continue;
      try {
        if (!/^CA[0-9a-f]{32}$/i.test(event.provider_call_id)) continue;
        const { data: callLog, error: lookupError } = await supabaseAdmin
          .from('call_logs')
          .select('id, organization_id')
          .eq('provider', 'twilio')
          .eq('provider_call_id', event.provider_call_id)
          .maybeSingle();
        if (lookupError) throw new Error(`call_logs lookup failed: ${lookupError.message}`);
        if (!callLog?.id) {
          console.warn('[twilio-voice-transcription] no call_logs row for CallSid', event.provider_call_id);
          continue;
        }

        const { error: rpcError } = await supabaseAdmin.rpc('append_call_live_transcript', {
          p_call_log_id: callLog.id,
          p_organization_id: callLog.organization_id,
          p_speaker: event.transcript.speaker,
          p_text: event.transcript.text,
          p_is_final: event.transcript.is_final,
          p_at: event.at,
        });
        if (rpcError) throw new Error(`append_call_live_transcript failed: ${rpcError.message}`);
        appended += 1;
      } catch (eventError) {
        console.error('[twilio-voice-transcription] event failed:', (eventError as Error).message);
      }
    }

    return json({ received: true, appended });
  } catch (error) {
    console.error('[twilio-voice-transcription] Error:', error);
    return json({ received: true, error: (error as Error).message });
  }
});
