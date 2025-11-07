
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
    console.log('[Outbound Calling] Auth header present:', !!authHeader);
    console.log('[Outbound Calling] Auth header value (first 20 chars):', authHeader?.substring(0, 20));
    
    if (!authHeader) {
      console.error('[Outbound Calling] Missing Authorization header');
      throw new Error('Missing Authorization header. Please ensure you are logged in.');
    }

    if (!authHeader.startsWith('Bearer ')) {
      console.error('[Outbound Calling] Invalid Authorization header format');
      throw new Error('Invalid Authorization header format. Expected "Bearer <token>"');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    
    console.log('[Outbound Calling] Supabase URL configured:', !!supabaseUrl);
    console.log('[Outbound Calling] Supabase Anon Key configured:', !!supabaseAnonKey);

    const supabaseClient = createClient(
      supabaseUrl ?? '',
      supabaseAnonKey ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

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
      throw new Error('RETELL_AI_API_KEY is not configured');
    }

    console.log(`[Outbound Calling] Processing ${action} request`);

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    
    if (authError) {
      console.error('[Outbound Calling] Auth error details:', JSON.stringify(authError));
      throw new Error(`Authentication failed: ${authError.message || 'Unable to verify user'}`);
    }
    
    if (!user) {
      console.error('[Outbound Calling] No user found in token');
      throw new Error('User not authenticated. Please log in again.');
    }

    console.log('[Outbound Calling] ✓ Authenticated user:', user.id);

    const baseUrl = 'https://api.retellai.com/v2';
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    let response;
    let result: any = {};

    switch (action) {
      case 'create_call':
        if (!phoneNumber || !callerId || !agentId) {
          throw new Error('Phone number, caller ID, and agent ID are required');
        }

        console.log('[Outbound Calling] Creating call log for user:', user.id);

        // Create call log entry first
        const { data: callLog, error: callLogError } = await supabaseClient
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
          throw callLogError;
        }

        console.log('[Outbound Calling] Call log created:', callLog.id);

        // Create outbound call via Retell AI
        console.log('[Outbound Calling] Initiating Retell AI call:', {
          from: callerId,
          to: phoneNumber,
          agent: agentId
        });

        response = await fetch(`${baseUrl}/call`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            from_number: callerId,
            to_number: phoneNumber,
            agent_id: agentId,
            metadata: {
              campaign_id: campaignId,
              lead_id: leadId,
              call_log_id: callLog.id
            }
          }),
        });

        if (!response.ok) {
          const errorData = await response.text();
          console.error('[Outbound Calling] Retell API error:', errorData);
          
          // Update call log to failed
          await supabaseClient
            .from('call_logs')
            .update({ status: 'failed' })
            .eq('id', callLog.id);
            
          throw new Error(`Retell AI API error: ${response.status} - ${errorData}`);
        }

        const callData = await response.json();
        console.log('[Outbound Calling] Retell AI call created:', callData.call_id);

        // Update call log with Retell call ID
        await supabaseClient
          .from('call_logs')
          .update({ 
            retell_call_id: callData.call_id,
            status: 'ringing'
          })
          .eq('id', callLog.id);

        result = { 
          call_id: callData.call_id, 
          call_log_id: callLog.id,
          status: 'created' 
        };
        break;

      case 'get_call_status':
        if (!retellCallId) {
          throw new Error('Retell call ID is required');
        }

        response = await fetch(`${baseUrl}/call/${retellCallId}`, {
          method: 'GET',
          headers,
        });

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(`Retell AI API error: ${response.status} - ${errorData}`);
        }

        result = await response.json();
        break;

      case 'end_call':
        if (!retellCallId) {
          throw new Error('Retell call ID is required');
        }

        response = await fetch(`${baseUrl}/call/${retellCallId}`, {
          method: 'DELETE',
          headers,
        });

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(`Retell AI API error: ${response.status} - ${errorData}`);
        }

        result = { success: true };
        break;

      default:
        throw new Error(`Unsupported action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Outbound Calling] Error:', error);
    console.error('[Outbound Calling] Error stack:', error.stack);
    return new Response(JSON.stringify({ 
      error: error.message,
      details: 'Check edge function logs for more information'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
