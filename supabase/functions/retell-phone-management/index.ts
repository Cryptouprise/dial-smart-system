
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RetellPhoneNumberRequest {
  action: 'import' | 'update' | 'delete' | 'list';
  apiKey: string;
  phoneNumber?: string;
  terminationUri?: string;
  agentId?: string;
  nickname?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, apiKey, phoneNumber, terminationUri, agentId, nickname }: RetellPhoneNumberRequest = await req.json();

    if (!apiKey) {
      throw new Error('Retell AI API key is required');
    }

    const baseUrl = 'https://api.retellai.com/v2';
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
        
        response = await fetch(`${baseUrl}/phone-number/import`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            phone_number: phoneNumber,
            termination_uri: terminationUri,
          }),
        });
        break;

      case 'update':
        if (!phoneNumber) {
          throw new Error('Phone number is required for update');
        }
        
        const updateData: any = {};
        if (agentId) updateData.inbound_agent_id = agentId;
        if (nickname) updateData.nickname = nickname;
        
        response = await fetch(`${baseUrl}/phone-number/${encodeURIComponent(phoneNumber)}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(updateData),
        });
        break;

      case 'delete':
        if (!phoneNumber) {
          throw new Error('Phone number is required for delete');
        }
        
        response = await fetch(`${baseUrl}/phone-number/${encodeURIComponent(phoneNumber)}`, {
          method: 'DELETE',
          headers,
        });
        break;

      case 'list':
        response = await fetch(`${baseUrl}/phone-number`, {
          method: 'GET',
          headers,
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
