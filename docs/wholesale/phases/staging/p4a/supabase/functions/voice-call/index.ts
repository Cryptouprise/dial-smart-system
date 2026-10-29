/**
 * voice-call: validate + log a browser-phone call for the caller's company.
 *
 * POST {organization_id, provider, lead_id?, to, from}
 *  -> 200 {call_log_id, provider_call_id: null, extra}
 *       telnyx: extra = {client_state, caller_number, destination_number}  (browser dials via TelnyxRTC)
 *       twilio: extra = {params: {call_log_id, organization_id}}           (browser passes to device.connect)
 *  -> 400 CALLER_ID_NOT_OWNED | LEAD_NOT_OWNED | DNC_BLOCKED | INVALID_*  (structured, never silent)
 *  -> 401 / 403 / 429 / 500
 *
 * Teammates share a company: every lookup is scoped by organization_id, never
 * by the caller's user_id. A company-owned caller ID is any active
 * phone_numbers row with that organization_id and provider.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { checkRateLimit, corsHeaders, RateLimitError } from '../_shared/utils.ts';
import { authorizeOrganizationContext } from '../_shared/tenant-context.ts';
import {
  getProvider,
  isE164,
  isVoiceProvider,
  normalizePhoneVariants,
  providerCallIdColumn,
  type StartOutboundResult,
} from '../_shared/voice-provider.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

    // One generous per-user limit (house rule): 120/min, surfaced as 429.
    checkRateLimit(`voice-call:${user.id}`, 120, 60000);

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return fail('INVALID_JSON', 'Request body must be JSON');
    }

    const providerName = body?.provider;
    if (!isVoiceProvider(providerName)) return fail('INVALID_PROVIDER', 'provider must be telnyx or twilio');

    let organizationId: string;
    try {
      organizationId = await authorizeOrganizationContext(supabaseAdmin, user.id, body?.organization_id);
    } catch (error) {
      return fail('ORG_FORBIDDEN', (error as Error).message, 403);
    }

    const leadIdRaw = typeof body?.lead_id === 'string' ? body.lead_id.trim() : '';
    if (leadIdRaw && !UUID_PATTERN.test(leadIdRaw)) return fail('INVALID_LEAD_ID', 'lead_id must be a UUID');
    const leadId = leadIdRaw ? leadIdRaw.toLowerCase() : null;

    const toRaw = typeof body?.to === 'string' ? body.to.trim() : '';
    const fromRaw = typeof body?.from === 'string' ? body.from.trim() : '';
    if (!toRaw || !fromRaw) return fail('INVALID_INPUT', 'to and from are required');

    const toVariants = normalizePhoneVariants(toRaw);
    const to = toVariants[0] || '';
    if (!isE164(to)) return fail('INVALID_TO', 'to is not a valid E.164 phone number');

    // Caller ID must be an ACTIVE phone_numbers row owned by this company for
    // this provider. Scoped by organization_id (teammates share numbers).
    const fromVariants = normalizePhoneVariants(fromRaw);
    if (fromVariants.length === 0) return fail('INVALID_FROM', 'from is not a phone number');
    const { data: ownedCaller, error: callerError } = await supabaseAdmin
      .from('phone_numbers')
      .select('id, number, organization_id, status, provider')
      .eq('organization_id', organizationId)
      .eq('provider', providerName)
      .in('number', fromVariants)
      .limit(1)
      .maybeSingle();
    if (callerError) throw new Error(`Caller ID lookup failed: ${callerError.message}`);
    if (!ownedCaller || ownedCaller.status !== 'active') {
      return fail('CALLER_ID_NOT_OWNED', 'from is not an active phone number owned by this company for this provider');
    }
    const canonicalFrom = String(ownedCaller.number || '').trim();
    if (!isE164(canonicalFrom)) throw new Error('Owned caller ID is not stored in canonical E.164 format');

    // Lead (if provided) must belong to this company. Scoped by organization_id.
    if (leadId) {
      const { data: ownedLead, error: leadError } = await supabaseAdmin
        .from('leads')
        .select('id, organization_id, do_not_call')
        .eq('id', leadId)
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (leadError) throw new Error(`Lead lookup failed: ${leadError.message}`);
      if (!ownedLead) return fail('LEAD_NOT_OWNED', 'lead does not belong to this company');
      if (ownedLead.do_not_call === true) return fail('DNC_BLOCKED', 'lead is marked do-not-call');
    }

    // DNC check, scoped by organization_id (column added by 20261029142121_phase1_org_scope.sql).
    // ASSUMPTION: dnc_list has no phone_number_normalized column live (LIVE-SCHEMA:8),
    // so phone_number is matched against the E.164 / 1XXX / XXX variants.
    const { data: dncRows, error: dncError } = await supabaseAdmin
      .from('dnc_list')
      .select('id')
      .eq('organization_id', organizationId)
      .in('phone_number', toVariants)
      .limit(1);
    if (dncError) throw new Error(`DNC lookup failed: ${dncError.message}`);
    if (dncRows && dncRows.length > 0) return fail('DNC_BLOCKED', 'phone is on the do-not-call list');

    // Insert the call_logs row. Only live columns (LIVE-SCHEMA:6) are written:
    // caller_id is the from-number column. organization_id is set explicitly.
    const nowIso = new Date().toISOString();
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
        started_at: nowIso,
      })
      .select('id')
      .maybeSingle();
    if (callLogError) throw new Error(`call_logs insert failed: ${callLogError.message}`);
    if (!callLog?.id) throw new Error('call_logs insert returned no data');

    const provider = getProvider(providerName);
    let started: StartOutboundResult;
    try {
      started = await provider.startOutbound({
        organizationId,
        userId: user.id,
        callLogId: callLog.id,
        leadId,
        to,
        from: canonicalFrom,
        supabaseAdmin,
      });
    } catch (startError) {
      // Never leave an orphan 'initiated' row if the provider step fails.
      await supabaseAdmin
        .from('call_logs')
        .update({ status: 'failed', ended_at: new Date().toISOString(), notes: `voice-call: ${(startError as Error).message}`.slice(0, 1000) })
        .eq('id', callLog.id)
        .eq('organization_id', organizationId);
      throw startError;
    }

    // Both providers return null here (browser completes the leg; the id is
    // bound later by register_provider_call or the TwiML function). Kept for
    // a future server-originated path.
    if (started.provider_call_id) {
      const { error: updErr } = await supabaseAdmin
        .from('call_logs')
        .update({ [providerCallIdColumn(providerName)]: started.provider_call_id })
        .eq('id', callLog.id)
        .eq('organization_id', organizationId);
      if (updErr) throw new Error(`call_logs provider id update failed: ${updErr.message}`);
    }

    return json({
      success: true,
      call_log_id: callLog.id,
      provider: providerName,
      provider_call_id: started.provider_call_id,
      to,
      from: canonicalFrom,
      extra: started.extra || {},
    });
  } catch (error) {
    if (error instanceof RateLimitError) return fail('RATE_LIMITED', (error as Error).message, 429);
    console.error('[voice-call] Error:', error);
    return fail('INTERNAL', (error as Error).message, 500);
  }
});
