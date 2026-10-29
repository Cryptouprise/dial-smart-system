/**
 * voice-call-action: in-call controls + provider-id registration.
 *
 * POST {call_log_id, action, digits?, to?, provider_call_id?}
 *   action in hold|unhold|mute|unmute|dtmf|hangup|transfer|register_provider_call
 *  -> 200 {success:true, warnings?: string[]}
 *  -> 400 / 401 / 404 CALL_NOT_FOUND / 409 PROVIDER_CALL_ID_CONFLICT / 500
 *
 * Membership is checked via the call_logs row's organization_id (any teammate
 * of the company may control the call). Writes use the service-role client and
 * always filter by organization_id.
 *
 * register_provider_call: for Telnyx the browser leg is the FIRST leg, so the
 * browser reports `call.telnyxIDs.telnyxCallControlId` here; the server binds
 * it to call_logs.telnyx_call_control_id and starts recording + transcription.
 * For Twilio the browser reports call.parameters.CallSid on 'accept' as a
 * belt-and-braces bind (twilio-voice-twiml already wrote provider_call_id).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { corsHeaders } from '../_shared/utils.ts';
import {
  getProvider,
  isVoiceAction,
  isVoiceProvider,
  providerCallIdColumn,
} from '../_shared/voice-provider.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDER_CALL_ID_PATTERN = /^[A-Za-z0-9:_\-+=/.]{8,256}$/;

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function fail(code: string, message: string, status = 400): Response {
  return json({ success: false, error_code: code, error: message }, status);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') return fail('METHOD_NOT_ALLOWED', 'POST only', 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return fail('UNAUTHENTICATED', 'Missing authorization. Please log in and try again.', 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase configuration missing');

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return json({
        success: false,
        error_code: 'UNAUTHENTICATED',
        error: 'Authentication failed',
        details: authError?.message || 'Invalid or expired session',
      }, 401);
    }

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return fail('INVALID_JSON', 'Request body must be JSON');
    }

    const callLogId = typeof body?.call_log_id === 'string' ? body.call_log_id.trim().toLowerCase() : '';
    const action = typeof body?.action === 'string' ? body.action : '';
    if (!UUID_PATTERN.test(callLogId)) return fail('INVALID_INPUT', 'call_log_id must be a UUID');
    if (action !== 'register_provider_call' && !isVoiceAction(action)) {
      return fail('INVALID_ACTION', 'action must be one of hold, unhold, mute, unmute, dtmf, hangup, transfer, register_provider_call');
    }

    const { data: callLog, error: callLogError } = await supabaseAdmin
      .from('call_logs')
      .select('id, user_id, organization_id, provider, status, telnyx_call_control_id, provider_call_id')
      .eq('id', callLogId)
      .maybeSingle();
    if (callLogError) throw new Error(`call_logs lookup failed: ${callLogError.message}`);
    if (!callLog) return fail('CALL_NOT_FOUND', 'call not found', 404);

    // Membership check via the row's organization_id (teammates may control it).
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('organization_users')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('organization_id', callLog.organization_id)
      .maybeSingle();
    if (membershipError) throw new Error(`Membership lookup failed: ${membershipError.message}`);
    if (!membership) return fail('CALL_NOT_FOUND', 'call not found', 404);

    if (!isVoiceProvider(callLog.provider)) {
      return fail('NOT_BROWSER_CALL', 'call provider is not a browser-phone provider');
    }
    const providerName = callLog.provider;
    const column = providerCallIdColumn(providerName);
    const existingProviderCallId: string | null = (callLog[column] as string | null) || null;
    const provider = getProvider(providerName);

    if (action === 'register_provider_call') {
      const providerCallId = typeof body?.provider_call_id === 'string' ? body.provider_call_id.trim() : '';
      if (!PROVIDER_CALL_ID_PATTERN.test(providerCallId)) {
        return fail('INVALID_INPUT', 'provider_call_id is required for register_provider_call');
      }
      if (['completed', 'failed'].includes(String(callLog.status))) {
        return fail('CALL_ENDED', 'provider id cannot be registered on an ended call', 409);
      }
      // Idempotent: the same id may be re-sent; a different id on a bound row is refused.
      if (existingProviderCallId && existingProviderCallId !== providerCallId) {
        return fail('PROVIDER_CALL_ID_CONFLICT', 'call is already bound to a different provider call id', 409);
      }
      const warnings: string[] = [];
      if (!existingProviderCallId) {
        const { error: updErr } = await supabaseAdmin
          .from('call_logs')
          .update({ [column]: providerCallId })
          .eq('id', callLog.id)
          .eq('organization_id', callLog.organization_id)
          .is(column, null);
        if (updErr) throw new Error(`call_logs provider id update failed: ${updErr.message}`);

        if (provider.onProviderCallRegistered) {
          try {
            warnings.push(...await provider.onProviderCallRegistered({
              organizationId: callLog.organization_id,
              userId: user.id,
              callLogId: callLog.id,
              providerCallId,
              supabaseAdmin,
            }));
          } catch (error) {
            warnings.push(`onProviderCallRegistered failed: ${(error as Error).message}`);
          }
        }
      }
      if (warnings.length > 0) console.warn('[voice-call-action] register warnings:', warnings);
      return json({ success: true, provider: providerName, provider_call_id: providerCallId, warnings });
    }

    await provider.action(
      {
        organizationId: callLog.organization_id,
        userId: user.id,
        callLogId: callLog.id,
        providerCallId: existingProviderCallId,
        supabaseAdmin,
      },
      {
        call_id: callLog.id,
        action,
        digits: typeof body?.digits === 'string' ? body.digits : undefined,
        to: typeof body?.to === 'string' ? body.to.trim() : undefined,
      },
    );

    // Server-side hangup also closes the row if no webhook ever arrives.
    if (action === 'hangup' && !['completed', 'failed'].includes(String(callLog.status))) {
      await supabaseAdmin
        .from('call_logs')
        .update({ status: 'completed', ended_at: new Date().toISOString() })
        .eq('id', callLog.id)
        .eq('organization_id', callLog.organization_id)
        .not('status', 'in', '("completed","failed")');
    }

    return json({ success: true, action });
  } catch (error) {
    console.error('[voice-call-action] Error:', error);
    return fail('INTERNAL', (error as Error).message, 500);
  }
});
