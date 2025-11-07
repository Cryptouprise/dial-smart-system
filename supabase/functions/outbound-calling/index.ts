import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OutboundCallRequest {
  action: 'create_call' | 'get_call_status' | 'end_call';
  campaignId?: string;
  leadId?: string;
  phoneNumber?: string;
  callerId?: string;
  agentId?: string;
  retellCallId?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    console.log('[Outbound Calling] Request received');
    console.log('[Outbound Calling] Auth header present:', !!authHeader);

    if (!authHeader) {
      console.error('[Outbound Calling] Missing Authorization header');
      return new Response(
        JSON.stringify({
          error: 'Missing authorization. Please log in and try again.',
          details: 'Authorization header not found'
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Create client with service role for backend operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    console.log('[Outbound Calling] Supabase URL configured:', !!supabaseUrl);
    console.log('[Outbound Calling] Service role key configured:', !!serviceRoleKey);

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Supabase configuration missing' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Use service role client for all operations
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Extract JWT token from Authorization header
    const token = authHeader.replace('Bearer ', '');

    // Verify the JWT token directly
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    console.log('[Outbound Calling] Auth verification:', {
      hasUser: !!user,
      userId: user?.id,
      error: authError?.message
    });

    if (authError || !user) {
      console.error('[Outbound Calling] Auth failed:', authError?.message || 'No user');
      return new Response(
        JSON.stringify({
          error: 'Authentication failed: Auth session missing!',
          details: authError?.message || 'Invalid or expired session. Please refresh and try again.'
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('[Outbound Calling] ✓ User verified:', user.id);

    const {
      action,
      campaignId,
      leadId,
      phoneNumber,
      callerId,
      agentId,
      retellCallId
    }: OutboundCallRequest = await req.json();

    const apiKey = Deno.env.get('RETELL_AI_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'RETELL_AI_API_KEY is not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[Outbound Calling] Processing ${action} request for user:`, user.id);

    const baseUrl = 'https://api.retellai.com/v2';
    const retellHeaders = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    // Robust POST helper that tries common endpoint variants and returns detailed diagnostics on failure
    async function postToRetellCandidate(pathCandidates: string[], bodyObj: any) {
      let lastErr: any = null;
      for (const candidate of pathCandidates) {
        const fullPath = candidate.replace(/^\/+/,''); // normalize
        const url = `${baseUrl}/${fullPath}`;
        try {
          const resp = await fetch(url, {
            method: 'POST',
            headers: retellHeaders,
            body: JSON.stringify(bodyObj),
          });

          if (!resp.ok) {
            const text = await resp.text();
            lastErr = { url, status: resp.status, body: text };
            // try next candidate
            continue;
          }

          // if content-type is JSON parse it, else return raw text under jsonRaw
          const contentType = resp.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const json = await resp.json();
            return { ok: true, json };
          } else {
            const text = await resp.text();
            return { ok: true, json: { raw: text } };
          }
        } catch (e) {
          lastErr = { url, error: String(e) };
          continue;
        }
      }
      return { ok: false, error: lastErr };
    }

    // Generic GET/DELETE helper with candidate paths
    async function fetchRetellWithCandidates(method: 'GET' | 'DELETE', pathCandidates: string[]) {
      let lastErr: any = null;
      for (const candidate of pathCandidates) {
        const fullPath = candidate.replace(/^\/+/,'');
        const url = `${baseUrl}/${fullPath}`;
        try {
          const resp = await fetch(url, { method, headers: retellHeaders });
          if (!resp.ok) {
            const text = await resp.text();
            lastErr = { url, status: resp.status, body: text };
            continue;
          }
          const contentType = resp.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const json = await resp.json();
            return { ok: true, json };
          } else {
            const text = await resp.text();
            return { ok: true, json: { raw: text } };
          }
        } catch (e) {
          lastErr = { url, error: String(e) };
          continue;
        }
      }
      return { ok: false, error: lastErr };
    }

    // Prepare candidate paths we will try for the call endpoints
    const createCallCandidates = ['/calls', '/call', '/calls/create', '/v2/calls', '/v2/call'];
    const callStatusCandidates = (id: string) => [`/calls/${id}`, `/call/${id}`, `/v2/calls/${id}`, `/v2/call/${id}`];

    switch (action) {
      case 'create_call':
        if (!phoneNumber || !callerId || !agentId) {
          return new Response(JSON.stringify({ error: 'Phone number, caller ID, and agent ID are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        console.log('[Outbound Calling] Creating call log for user:', user.id);

        const { data: callLog, error: callLogError } = await supabaseAdmin
          .from('call_logs')
          .insert({
            user_id: user.id,
            campaign_id: campaignId,
            lead_id: leadId,
            phone_number: phoneNumber,
            caller_id: callerId,
            status: 'queued'
          })
          .select()
          .single();

        if (callLogError) {
          console.error('[Outbound Calling] Call log error:', callLogError);
          return new Response(JSON.stringify({ error: 'Failed to create call log', details: callLogError.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        console.log('[Outbound Calling] Call log created:', callLog.id);

        const callBody = {
          from_number: callerId,
          to_number: phoneNumber,
          agent_id: agentId,
          metadata: {
            campaign_id: campaignId,
            lead_id: leadId,
            call_log_id: callLog.id
          }
        };

        // Try creating the call with candidate endpoints
        const createResp = await postToRetellCandidate(createCallCandidates, callBody);
        if (!createResp.ok) {
          console.error('[Outbound Calling] Retell create error:', createResp.error);
          // mark as failed
          await supabaseAdmin.from('call_logs').update({ status: 'failed' }).eq('id', callLog.id);
          return new Response(JSON.stringify({ error: 'Retell AI create call failed', details: createResp.error }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const callData = createResp.json;
        console.log('[Outbound Calling] Retell AI call created:', callData.call_id || callData.id || callData.raw);

        // Update call log with Retell call id (if present)
        const retellCallIdResolved = callData.call_id || callData.id || (callData.raw ? undefined : undefined);
        if (retellCallIdResolved) {
          await supabaseAdmin
            .from('call_logs')
            .update({
              retell_call_id: retellCallIdResolved,
              status: 'ringing'
            })
            .eq('id', callLog.id);
        } else {
          // If Retell returned a raw body but no id, set status to 'initiated'
          await supabaseAdmin
            .from('call_logs')
            .update({ status: 'initiated' })
            .eq('id', callLog.id);
        }

        return new Response(JSON.stringify({
          call_id: retellCallIdResolved || null,
          call_log_id: callLog.id,
          status: 'created',
          retell_response: callData
        }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      case 'get_call_status':
        if (!retellCallId) {
          return new Response(JSON.stringify({ error: 'Retell call ID is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const statusResp = await fetchRetellWithCandidates('GET', callStatusCandidates(retellCallId));
        if (!statusResp.ok) {
          console.error('[Outbound Calling] Retell status error:', statusResp.error);
          return new Response(JSON.stringify({ error: 'Failed to fetch call status', details: statusResp.error }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        return new Response(JSON.stringify(statusResp.json), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      case 'end_call':
        if (!retellCallId) {
          return new Response(JSON.stringify({ error: 'Retell call ID is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const endResp = await fetchRetellWithCandidates('DELETE', callStatusCandidates(retellCallId));
        if (!endResp.ok) {
          console.error('[Outbound Calling] Retell end call error:', endResp.error);
          return new Response(JSON.stringify({ error: 'Failed to end call', details: endResp.error }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      default:
        return new Response(JSON.stringify({ error: `Unsupported action: ${action}` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

  } catch (error: any) {
    console.error('[Outbound Calling] Error:', error);
    console.error('[Outbound Calling] Error stack:', error?.stack || 'no stack');
    return new Response(JSON.stringify({
      error: error?.message || String(error),
      details: 'Check edge function logs for more information'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});