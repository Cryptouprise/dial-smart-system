
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RetellAgentRequest {
  action: 'create' | 'list' | 'update' | 'delete';
  agentName?: string;
  agentId?: string;
  voiceId?: string;
  llmWebsocketUrl?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, agentName, agentId, voiceId, llmWebsocketUrl }: RetellAgentRequest = await req.json();

    const apiKey = Deno.env.get('RETELL_AI_API_KEY');
    if (!apiKey) {
      throw new Error('RETELL_AI_API_KEY is not configured');
    }

    console.log(`Processing ${action} request for Retell AI agent`);

    const baseUrl = 'https://api.retellai.com/v2';
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    let response;

    switch (action) {
      case 'create':
        if (!agentName) {
          throw new Error('Agent name is required for creation');
        }
        
        response = await fetch(`${baseUrl}/agent`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            agent_name: agentName,
            voice_id: voiceId || '11labs-Adrian',
            llm_websocket_url: llmWebsocketUrl || 'wss://your-llm-websocket-url.com/llm-websocket'
          }),
        });
        break;

      case 'list':
        response = await fetch(`${baseUrl}/agent`, {
          method: 'GET',
          headers,
        });
        break;

      case 'update':
        if (!agentId) {
          throw new Error('Agent ID is required for update');
        }
        
        const updateData: any = {};
        if (agentName) updateData.agent_name = agentName;
        if (voiceId) updateData.voice_id = voiceId;
        if (llmWebsocketUrl) updateData.llm_websocket_url = llmWebsocketUrl;
        
        response = await fetch(`${baseUrl}/agent/${agentId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(updateData),
        });
        break;

      case 'delete':
        if (!agentId) {
          throw new Error('Agent ID is required for delete');
        }
        
        response = await fetch(`${baseUrl}/agent/${agentId}`, {
          method: 'DELETE',
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
    console.error('Error in retell-agent-management function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
