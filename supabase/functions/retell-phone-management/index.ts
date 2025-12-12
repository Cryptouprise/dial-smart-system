
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RetellPhoneNumberRequest {
  action: 'import' | 'update' | 'delete' | 'list' | 'list_available' | 'purchase';
  phoneNumber?: string;
  terminationUri?: string;
  agentId?: string;
  nickname?: string;
  areaCode?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, phoneNumber, terminationUri, agentId, nickname, areaCode }: RetellPhoneNumberRequest = await req.json();

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
        
        response = await fetch(`${baseUrl}/import-phone-number`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            from_number: phoneNumber,
            termination_uri: terminationUri,
          }),
        });
        break;

      case 'update':
        if (!phoneNumber) {
          throw new Error('Phone number is required for update');
        }
        
        const updateData: any = {};
        if (agentId) {
          updateData.inbound_agent_id = agentId;
          updateData.outbound_agent_id = agentId; // Required for outbound calls
        }
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

      case 'list':
        response = await fetch(`${baseUrl}/list-phone-numbers`, {
          method: 'GET',
          headers,
        });
        break;

      case 'list_available':
        // List available phone numbers for purchase from Retell AI
        const searchParams = new URLSearchParams();
        if (areaCode) searchParams.append('area_code', areaCode);
        
        response = await fetch(`${baseUrl}/list-available-phone-numbers?${searchParams}`, {
          method: 'GET',
          headers,
        });
        break;

      case 'purchase':
        // Purchase a phone number from Retell AI
        if (!phoneNumber) {
          throw new Error('Phone number is required for purchase');
        }
        
        response = await fetch(`${baseUrl}/purchase-phone-number`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            phone_number: phoneNumber,
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
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
