/**
 * twilio-voice-twiml: the TwiML App voice URL.
 *
 * The browser Voice SDK calls device.connect({params:{call_log_id, organization_id}});
 * Twilio POSTs those params plus CallSid/From (client:user_<uuid>) here with an
 * X-Twilio-Signature. We:
 *   1. validate the signature (403 <Reject/> otherwise),
 *   2. load the call_logs row by call_log_id + organization_id (service role),
 *      require provider='twilio', status not ended, and the From identity to be
 *      the row's user OR a member of the row's company,
 *      - fallback when params were not forwarded: the most recent
 *        provider='twilio' row still 'initiated' for that identity within 60s
 *        (VERIFY: Voice SDK forwards connect params to the TwiML App URL,
 *         doc "Twilio Voice SDK: Device.connect"),
 *   3. write call_logs.provider_call_id = CallSid (house rule column),
 *   4. return TwiML that dials the ROW's phone_number from the ROW's caller_id
 *      with dual-channel recording + real-time transcription.
 * The dial target never comes from request params, so DNC/caller-ID checks
 * done by voice-call cannot be bypassed.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { userIdFromTwilioIdentity, validateTwilioWebhook } from '../_shared/twilio.ts';
import { formParams } from '../_shared/twilio-signature.ts';
import { isE164, publicFunctionsBaseUrl } from '../_shared/voice-provider.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-twilio-signature',
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function twiml(body: string, status = 200): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'text/xml', 'Cache-Control': 'no-store' },
  });
}

function rejectTwiml(reason: string, status = 200): Response {
  console.error('[twilio-voice-twiml] rejecting call:', reason);
  return twiml('<Say>This call could not be placed.</Say><Hangup/>', status);
}

type CallLogRow = { id: string; organization_id: string; user_id: string; status: string; phone_number: string; caller_id: string; provider_call_id: string | null };

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();
    if (!(await validateTwilioWebhook(req, rawBody))) {
      return twiml('<Reject/>', 403);
    }

    const params = formParams(rawBody);
    const callSid = params.CallSid || '';
    const identityUserId = userIdFromTwilioIdentity(params.From || params.Caller);
    const callLogId = (params.call_log_id || '').trim().toLowerCase();
    const organizationId = (params.organization_id || '').trim().toLowerCase();

    if (!/^CA[0-9a-f]{32}$/i.test(callSid)) return rejectTwiml('missing CallSid');
    if (!identityUserId) return rejectTwiml(`unexpected From identity ${params.From || ''}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase configuration missing');
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const select = 'id, organization_id, user_id, status, phone_number, caller_id, provider_call_id';
    let row: CallLogRow | null = null;

    if (UUID_PATTERN.test(callLogId) && UUID_PATTERN.test(organizationId)) {
      const { data, error } = await supabaseAdmin
        .from('call_logs')
        .select(select)
        .eq('id', callLogId)
        .eq('organization_id', organizationId)
        .eq('provider', 'twilio')
        .maybeSingle();
      if (error) throw new Error(`call_logs lookup failed: ${error.message}`);
      row = (data as CallLogRow | null) || null;
    }

    if (!row) {
      // Params not forwarded: bind to this identity's most recent initiated Twilio row.
      const since = new Date(Date.now() - 60 * 1000).toISOString();
      const { data, error } = await supabaseAdmin
        .from('call_logs')
        .select(select)
        .eq('user_id', identityUserId)
        .eq('provider', 'twilio')
        .eq('status', 'initiated')
        .is('provider_call_id', null)
        .gte('started_at', since)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`call_logs fallback lookup failed: ${error.message}`);
      row = (data as CallLogRow | null) || null;
    }

    if (!row) return rejectTwiml(`no call_logs row for CallSid ${callSid}`);
    if (['completed', 'failed'].includes(row.status)) return rejectTwiml(`call ${row.id} already ended`);
    if (row.provider_call_id && row.provider_call_id !== callSid) {
      return rejectTwiml(`call ${row.id} already bound to ${row.provider_call_id}`);
    }
    if (!isE164(row.phone_number) || !isE164(row.caller_id)) return rejectTwiml(`call ${row.id} has non-E.164 numbers`);

    // The connecting identity must be the row's user or a teammate in the row's company.
    if (row.user_id !== identityUserId) {
      const { data: membership, error } = await supabaseAdmin
        .from('organization_users')
        .select('organization_id')
        .eq('user_id', identityUserId)
        .eq('organization_id', row.organization_id)
        .maybeSingle();
      if (error) throw new Error(`membership lookup failed: ${error.message}`);
      if (!membership) return rejectTwiml(`identity ${identityUserId} is not a member of ${row.organization_id}`);
    }

    if (!row.provider_call_id) {
      const { error: updErr } = await supabaseAdmin
        .from('call_logs')
        .update({ provider_call_id: callSid, status: 'ringing' })
        .eq('id', row.id)
        .eq('organization_id', row.organization_id)
        .is('provider_call_id', null);
      if (updErr) console.error('[twilio-voice-twiml] provider id update failed:', updErr);
    }

    const base = publicFunctionsBaseUrl();
    const statusCallback = `${base}/twilio-voice-status`;
    const transcriptionCallback = `${base}/twilio-voice-transcription`;

    const body = [
      '<Start>',
      `<Transcription statusCallbackUrl="${escapeXml(transcriptionCallback)}" track="both_tracks" partialResults="true" />`,
      '</Start>',
      `<Dial callerId="${escapeXml(row.caller_id)}" record="record-from-answer-dual" recordingStatusCallback="${escapeXml(statusCallback)}" recordingStatusCallbackEvent="completed" answerOnBridge="true">`,
      `<Number statusCallback="${escapeXml(statusCallback)}" statusCallbackEvent="initiated ringing answered completed">${escapeXml(row.phone_number)}</Number>`,
      '</Dial>',
    ].join('');

    return twiml(body);
  } catch (error) {
    console.error('[twilio-voice-twiml] Error:', error);
    return twiml('<Say>This call could not be placed.</Say><Hangup/>', 200);
  }
});
