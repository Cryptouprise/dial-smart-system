import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ConversationRequest {
  action: 'create' | 'get' | 'list' | 'update' | 'delete';
  conversationId?: string;
  agentId?: string;
  metadata?: Record<string, any>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: ConversationRequest = await req.json();
    const { action } = request;

    const apiKey = Deno.env.get('RETELL_AI_API_KEY');
    if (!apiKey) {
      throw new Error('RETELL_AI_API_KEY is not configured');
    }

    console.log(`[Retell Conversation] Processing ${action} request`);

    const baseUrl = 'https://api.retellai.com';
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    let response;

    switch (action) {
      case 'create': {
        if (!request.agentId) {
          throw new Error('Agent ID is required for conversation creation');
        }

        const payload: any = {
          agent_id: request.agentId,
        };
        if (request.metadata) payload.metadata = request.metadata;

        response = await fetch(`${baseUrl}/create-conversation`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });
        break;
      }

      case 'get': {
        if (!request.conversationId) {
          throw new Error('Conversation ID is required');
        }

        response = await fetch(`${baseUrl}/get-conversation/${request.conversationId}`, {
          method: 'GET',
          headers,
        });
        break;
      }

      case 'list': {
        let url = `${baseUrl}/list-conversations`;
        if (request.agentId) {
          url += `?agent_id=${encodeURIComponent(request.agentId)}`;
        }

        response = await fetch(url, {
          method: 'GET',
          headers,
        });
        break;
      }

      case 'update': {
        if (!request.conversationId) {
          throw new Error('Conversation ID is required for update');
        }

        const updateData: any = {};
        if (request.metadata) updateData.metadata = request.metadata;

        response = await fetch(`${baseUrl}/update-conversation/${request.conversationId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(updateData),
        });
        break;
      }

      case 'delete': {
        if (!request.conversationId) {
          throw new Error('Conversation ID is required for delete');
        }

        response = await fetch(`${baseUrl}/delete-conversation/${request.conversationId}`, {
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
      console.error(`[Retell Conversation] API error - Status: ${response.status}, Body: ${errorText}`);
      throw new Error(`Retell AI API error: ${response.status} - ${errorText}`);
    }

    const data = action === 'delete' ? { success: true } : await response.json();
    console.log(`[Retell Conversation] Success`);

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Retell Conversation] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
