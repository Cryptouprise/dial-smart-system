import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CallManagementRequest {
  action: 'create-phone-call' | 'create-web-call' | 'get-call' | 'list-calls' | 'update-call' | 'delete-call';
  // Phone call params
  from_number?: string;
  to_number?: string;
  agent_id?: string;
  override_agent_id?: string;
  retell_llm_dynamic_variables?: Record<string, any>;
  metadata?: Record<string, any>;
  drop_call_if_machine_detected?: boolean;
  max_call_duration_ms?: number;
  // Get/Update/Delete params
  callId?: string;
  // List params
  limit?: number;
  sort_order?: 'ascending' | 'descending';
  filter_criteria?: Record<string, any>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: CallManagementRequest = await req.json();
    const { action } = request;

    const apiKey = Deno.env.get('RETELL_AI_API_KEY');
    if (!apiKey) {
      throw new Error('RETELL_AI_API_KEY is not configured');
    }

    console.log(`[Retell Call Management] Processing ${action} request`);

    const baseUrl = 'https://api.retellai.com';
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    let response;

    switch (action) {
      case 'create-phone-call': {
        const payload: any = {
          from_number: request.from_number,
          to_number: request.to_number,
        };
        
        if (request.agent_id) payload.agent_id = request.agent_id;
        if (request.override_agent_id) payload.override_agent_id = request.override_agent_id;
        if (request.retell_llm_dynamic_variables) payload.retell_llm_dynamic_variables = request.retell_llm_dynamic_variables;
        if (request.metadata) payload.metadata = request.metadata;
        if (request.drop_call_if_machine_detected !== undefined) payload.drop_call_if_machine_detected = request.drop_call_if_machine_detected;
        if (request.max_call_duration_ms) payload.max_call_duration_ms = request.max_call_duration_ms;

        console.log('[Retell Call] Creating phone call:', JSON.stringify(payload));
        
        response = await fetch(`${baseUrl}/v2/create-phone-call`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });
        break;
      }

      case 'create-web-call': {
        const payload: any = {
          agent_id: request.agent_id,
        };
        
        if (request.metadata) payload.metadata = request.metadata;
        if (request.retell_llm_dynamic_variables) payload.retell_llm_dynamic_variables = request.retell_llm_dynamic_variables;

        console.log('[Retell Call] Creating web call:', JSON.stringify(payload));
        
        response = await fetch(`${baseUrl}/v2/create-web-call`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });
        break;
      }

      case 'get-call': {
        if (!request.callId) {
          throw new Error('Call ID is required');
        }

        console.log(`[Retell Call] Getting call: ${request.callId}`);
        
        response = await fetch(`${baseUrl}/v2/get-call/${request.callId}`, {
          method: 'GET',
          headers,
        });
        break;
      }

      case 'list-calls': {
        let url = `${baseUrl}/v2/list-calls`;
        const params = new URLSearchParams();
        
        if (request.limit) params.append('limit', request.limit.toString());
        if (request.sort_order) params.append('sort_order', request.sort_order);
        if (request.filter_criteria) {
          params.append('filter_criteria', JSON.stringify(request.filter_criteria));
        }

        const queryString = params.toString();
        if (queryString) url += `?${queryString}`;

        console.log('[Retell Call] Listing calls');
        
        response = await fetch(url, {
          method: 'GET',
          headers,
        });
        break;
      }

      case 'update-call': {
        if (!request.callId) {
          throw new Error('Call ID is required for update');
        }

        const updateData: any = {};
        if (request.metadata) updateData.metadata = request.metadata;

        console.log(`[Retell Call] Updating call ${request.callId}`);
        
        response = await fetch(`${baseUrl}/v2/update-call/${request.callId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(updateData),
        });
        break;
      }

      case 'delete-call': {
        if (!request.callId) {
          throw new Error('Call ID is required for delete');
        }

        console.log(`[Retell Call] Deleting call: ${request.callId}`);
        
        response = await fetch(`${baseUrl}/v2/delete-call/${request.callId}`, {
          method: 'DELETE',
          headers,
        });
        break;
      }

      default:
        throw new Error(`Unsupported action: ${action}`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Retell Call] API error - Status: ${response.status}, Body: ${errorText}`);
      throw new Error(`Retell AI API error: ${response.status} - ${errorText}`);
    }

    const data = action === 'delete-call' ? { success: true } : await response.json();
    console.log(`[Retell Call] Success - Response:`, JSON.stringify(data));

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Retell Call] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
