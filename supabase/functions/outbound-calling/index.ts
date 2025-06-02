
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
  apiKey?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
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
      retellCallId,
      apiKey 
    }: OutboundCallRequest = await req.json();

    if (!apiKey) {
      throw new Error('Retell AI API key is required');
    }

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

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

        if (callLogError) throw callLogError;

        // Create outbound call via Retell AI
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
          throw new Error(`Retell AI API error: ${response.status} - ${errorData}`);
        }

        const callData = await response.json();

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
    console.error('Error in outbound-calling function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
