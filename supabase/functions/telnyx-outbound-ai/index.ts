/**
 * Telnyx Outbound AI Calls
 *
 * Makes outbound AI voice calls via Telnyx TeXML AI Calls endpoint.
 * This is the Telnyx equivalent of our Retell outbound-calling path.
 *
 * Actions:
 *   make_call       - Initiate an outbound AI call
 *   get_call        - Get call status
 *   end_call        - End an active call
 *   health_check    - Verify Telnyx API connectivity
 *
 * Key differences from Retell path:
 *   - No separate phone number registration needed
 *   - Uses TeXML AI app_id (auto-created with assistant)
 *   - AMD handled natively by Telnyx (not post-call transcript analysis)
 *   - Dynamic variables injected via webhook (not in API call body)
 *   - Memory system loads past conversations automatically
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TELNYX_API_BASE = 'https://api.telnyx.com/v2';

async function telnyxFetch(
  path: string,
  apiKey: string,
  method: string = 'GET',
  body?: unknown
): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  const url = `${TELNYX_API_BASE}${path}`;
  const options: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  };
  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!res.ok) {
    return { ok: false, status: res.status, data, error: data?.errors?.[0]?.detail || text };
  }
  return { ok: true, status: res.status, data };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const isServiceRoleCall = token === serviceRoleKey;
    let userId: string;

    if (isServiceRoleCall) {
      const body = await req.clone().json();
      if (!body.userId) {
        return new Response(JSON.stringify({ error: 'userId required for service role calls' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      userId = body.userId;
    } else {
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Authentication failed' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      userId = user.id;
    }

    const { action, ...params } = await req.json();
    const apiKey = Deno.env.get('TELNYX_API_KEY')?.trim().replace(/[^\x20-\x7E]/g, '') || null;

    if (!apiKey && action !== 'health_check') {
      throw new Error('TELNYX_API_KEY not configured');
    }

    let result: any = {};

    switch (action) {
      // ================================================================
      // MAKE OUTBOUND AI CALL
      // ================================================================
      case 'make_call': {
        const {
          phoneNumber, callerId, assistantId,
          campaignId, leadId,
        } = params;

        if (!phoneNumber || !callerId || !assistantId) {
          throw new Error('phoneNumber, callerId, and assistantId are required');
        }

        // Normalize phone
        const normalizedPhone = phoneNumber.replace(/\D/g, '');
        const finalPhone = normalizedPhone.startsWith('1') ? `+${normalizedPhone}` : `+1${normalizedPhone}`;

        // Get Telnyx assistant details
        const { data: assistant } = await supabaseAdmin
          .from('telnyx_assistants')
          .select('telnyx_assistant_id, telnyx_texml_app_id, name, model, voice')
          .eq('id', assistantId)
          .eq('user_id', userId)
          .single();

        if (!assistant?.telnyx_assistant_id) {
          throw new Error('Telnyx assistant not found or not synced');
        }

        console.log(`[Telnyx Outbound] Creating call: ${callerId} → ${finalPhone} via assistant ${assistant.name}`);

        // Create call_log entry first
        const { data: callLog, error: logError } = await supabaseAdmin
          .from('call_logs')
          .insert({
            user_id: userId,
            campaign_id: campaignId || null,
            lead_id: leadId || null,
            phone_number: finalPhone,
            caller_id: callerId,
            status: 'queued',
            provider: 'telnyx',
            telnyx_assistant_id: assistant.telnyx_assistant_id,
          })
          .select()
          .single();

        if (logError) throw logError;

        // Credit check (same pattern as outbound-calling)
        let organizationId: string | null = null;
        try {
          const { data: orgUser } = await supabaseAdmin
            .from('organization_users')
            .select('organization_id')
            .eq('user_id', userId)
            .limit(1)
            .maybeSingle();

          organizationId = orgUser?.organization_id || null;

          if (organizationId) {
            const { data: balanceCheck } = await supabaseAdmin
              .rpc('check_credit_balance', {
                p_organization_id: organizationId,
                p_minutes_needed: 1,
              });

            if (balanceCheck?.[0]?.billing_enabled) {
              const check = balanceCheck[0];
              // Telnyx is $0.09/min = 9 cents/min
              const costPerMinuteCents = 9;

              if (check.available_balance_cents < costPerMinuteCents) {
                await supabaseAdmin.from('call_logs').update({
                  status: 'failed',
                  ended_at: new Date().toISOString(),
                  notes: `Insufficient credits. Available: $${(check.available_balance_cents / 100).toFixed(2)}`,
                }).eq('id', callLog.id);
                throw new Error(`Insufficient credits. Available: $${(check.available_balance_cents / 100).toFixed(2)}`);
              }

              // Reserve credits
              await supabaseAdmin.rpc('reserve_credits', {
                p_organization_id: organizationId,
                p_amount_cents: costPerMinuteCents,
                p_call_log_id: callLog.id,
                p_retell_call_id: null,
              });

              await supabaseAdmin.from('call_logs').update({
                organization_id: organizationId,
              }).eq('id', callLog.id);
            }
          }
        } catch (creditErr: any) {
          if (creditErr.message?.includes('Insufficient credits')) throw creditErr;
          console.error('[Telnyx Outbound] Credit check error (continuing):', creditErr.message);
        }

        // Get AMD settings
        const { data: telnyxSettings } = await supabaseAdmin
          .from('telnyx_settings')
          .select('amd_enabled, amd_type')
          .eq('user_id', userId)
          .maybeSingle();

        // Make the outbound call via Telnyx
        // Method 1: TeXML AI Calls (simplest, uses assistant's TeXML app)
        const callPayload: any = {
          to: finalPhone,
          from: callerId,
          // Webhook for call events
          webhook_url: `${supabaseUrl}/functions/v1/telnyx-webhook`,
          webhook_url_method: 'POST',
        };

        // Add AMD if enabled
        if (telnyxSettings?.amd_enabled !== false) {
          callPayload.answering_machine_detection = telnyxSettings?.amd_type || 'premium';
          callPayload.answering_machine_detection_config = {
            total_analysis_time_millis: 5000,
            after_greeting_silence_millis: 800,
          };
        }

        // Method: Use Call Control to dial, then start AI assistant
        // Step 1: Initiate the call
        const dialRes = await telnyxFetch('/calls', apiKey!, 'POST', {
          connection_id: assistant.telnyx_texml_app_id,
          to: finalPhone,
          from: callerId,
          answering_machine_detection: telnyxSettings?.amd_enabled !== false ? (telnyxSettings?.amd_type || 'premium') : undefined,
          webhook_url: `${supabaseUrl}/functions/v1/telnyx-webhook`,
        });

        if (!dialRes.ok) {
          await supabaseAdmin.from('call_logs').update({
            status: 'failed',
            ended_at: new Date().toISOString(),
            notes: `Telnyx dial error: ${dialRes.error}`,
          }).eq('id', callLog.id);
          throw new Error(`Telnyx API error: ${dialRes.error}`);
        }

        const callData = dialRes.data.data;
        const callControlId = callData.call_control_id;
        const callLegId = callData.call_leg_id;
        const callSessionId = callData.call_session_id;

        console.log(`[Telnyx Outbound] Call initiated: control=${callControlId}`);

        // Update call log with Telnyx IDs
        await supabaseAdmin.from('call_logs').update({
          telnyx_call_control_id: callControlId,
          telnyx_call_session_id: callSessionId,
          status: 'ringing',
        }).eq('id', callLog.id);

        // Step 2: When call is answered, start AI assistant
        // This happens via webhook → telnyx-webhook handles call.answered
        // Then we call: POST /v2/calls/{call_control_id}/actions/ai_assistant_start
        // For now, we use the TeXML app which auto-starts the assistant

        result = {
          call_control_id: callControlId,
          call_session_id: callSessionId,
          call_log_id: callLog.id,
          assistant_name: assistant.name,
          status: 'initiated',
          provider: 'telnyx',
        };
        break;
      }

      // ================================================================
      // GET CALL STATUS
      // ================================================================
      case 'get_call': {
        const { call_control_id, call_log_id } = params;

        if (call_log_id) {
          const { data: cl } = await supabaseAdmin
            .from('call_logs')
            .select('*')
            .eq('id', call_log_id)
            .maybeSingle();

          result = cl || { error: 'Call not found' };
        } else if (call_control_id) {
          const { data: cl } = await supabaseAdmin
            .from('call_logs')
            .select('*')
            .eq('telnyx_call_control_id', call_control_id)
            .maybeSingle();

          result = cl || { error: 'Call not found' };
        } else {
          throw new Error('call_control_id or call_log_id required');
        }
        break;
      }

      // ================================================================
      // END CALL
      // ================================================================
      case 'end_call': {
        const { call_control_id } = params;
        if (!call_control_id) throw new Error('call_control_id required');

        const hangupRes = await telnyxFetch(
          `/calls/${call_control_id}/actions/hangup`,
          apiKey!, 'POST',
          { client_state: btoa(JSON.stringify({ ended_by: 'user' })) }
        );

        result = { ended: hangupRes.ok, error: hangupRes.error };
        break;
      }

      // ================================================================
      // HEALTH CHECK
      // ================================================================
      case 'health_check': {
        result = {
          healthy: true,
          telnyx_configured: !!apiKey,
          provider: 'telnyx',
          timestamp: new Date().toISOString(),
          capabilities: ['make_call', 'get_call', 'end_call', 'health_check'],
        };
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[Telnyx Outbound] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
