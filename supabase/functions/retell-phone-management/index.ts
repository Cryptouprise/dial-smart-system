
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RetellPhoneNumberRequest {
  action: 'import' | 'get' | 'list' | 'update' | 'delete' | 'register';
  phoneNumber?: string;
  terminationUri?: string;
  agentId?: string;
  inboundAgentId?: string;
  outboundAgentId?: string;
  nickname?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, phoneNumber, terminationUri, agentId, inboundAgentId, outboundAgentId, nickname }: RetellPhoneNumberRequest = await req.json();

    const apiKey = Deno.env.get('RETELL_AI_API_KEY');
    if (!apiKey) {
      throw new Error('RETELL_AI_API_KEY is not configured');
    }

    console.log(`Processing ${action} request for Retell AI phone number`);

    const baseUrl = 'https://api.retellai.com';
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    let response;

    switch (action) {
      case 'import':
        if (!phoneNumber || !terminationUri) {
          throw new Error('Phone number and termination URI are required for import');
        }
        
        const importPayload: any = {
          from_number: phoneNumber,
          termination_uri: terminationUri,
        };
        if (inboundAgentId) importPayload.inbound_agent_id = inboundAgentId;
        if (outboundAgentId) importPayload.outbound_agent_id = outboundAgentId;
        if (nickname) importPayload.nickname = nickname;
        
        response = await fetch(`${baseUrl}/import-phone-number`, {
          method: 'POST',
          headers,
          body: JSON.stringify(importPayload),
        });
        break;

      case 'get':
        if (!phoneNumber) {
          throw new Error('Phone number is required for get');
        }
        
        response = await fetch(`${baseUrl}/get-phone-number/${encodeURIComponent(phoneNumber)}`, {
          method: 'GET',
          headers,
        });
        break;

      case 'list':
        response = await fetch(`${baseUrl}/list-phone-numbers`, {
          method: 'GET',
          headers,
        });
        break;

      case 'update':
        if (!phoneNumber) {
          throw new Error('Phone number is required for update');
        }
        
        const updateData: any = {};
        if (agentId) {
          updateData.inbound_agent_id = agentId;
          updateData.outbound_agent_id = agentId;
        }
        if (inboundAgentId) updateData.inbound_agent_id = inboundAgentId;
        if (outboundAgentId) updateData.outbound_agent_id = outboundAgentId;
        if (nickname) updateData.nickname = nickname;
        
        response = await fetch(`${baseUrl}/update-phone-number/${encodeURIComponent(phoneNumber)}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(updateData),
        });
        break;

      case 'delete':
        if (!phoneNumber) {
          throw new Error('Phone number is required for delete');
        }
        
        response = await fetch(`${baseUrl}/delete-phone-number/${encodeURIComponent(phoneNumber)}`, {
          method: 'DELETE',
          headers,
        });
        break;

      case 'register':
        if (!phoneNumber || !agentId) {
          throw new Error('Phone number and agent ID are required for register');
        }
        
        response = await fetch(`${baseUrl}/register-phone-number`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            phone_number: phoneNumber,
            agent_id: agentId,
          }),
        });
        break;

      default:
        throw new Error(`Unsupported action: ${action}`);
    }

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Retell AI API error: ${response.status} - ${errorData}`);
    }

    const data = action === 'delete' ? { success: true } : await response.json();

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in retell-phone-management function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
