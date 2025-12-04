
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RetellAgentRequest {
  action: 'create' | 'list' | 'update' | 'delete' | 'get' | 'preview_voice';
  agentName?: string;
  agentId?: string;
  voiceId?: string;
  llmId?: string;
  agentConfig?: any;
  text?: string; // For voice preview
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, agentName, agentId, voiceId, llmId, agentConfig, text }: RetellAgentRequest = await req.json();

    const apiKey = Deno.env.get('RETELL_AI_API_KEY');
    if (!apiKey) {
      throw new Error('RETELL_AI_API_KEY is not configured');
    }

    console.log(`[Retell Agent] Processing ${action} request`);

    const baseUrl = 'https://api.retellai.com';
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
        if (!llmId) {
          throw new Error('LLM ID is required for creation');
        }
        
        const createPayload = {
          agent_name: agentName,
          voice_id: voiceId || '11labs-Adrian',
          response_engine: {
            type: 'retell-llm',
            llm_id: llmId
          }
        };
        
        console.log('[Retell Agent] Creating agent with payload:', JSON.stringify(createPayload));
        
        response = await fetch(`${baseUrl}/create-agent`, {
          method: 'POST',
          headers,
          body: JSON.stringify(createPayload),
        });
        break;

      case 'list':
        response = await fetch(`${baseUrl}/list-agents`, {
          method: 'GET',
          headers,
        });
        break;

      case 'get':
        if (!agentId) {
          throw new Error('Agent ID is required for get');
        }
        
        response = await fetch(`${baseUrl}/get-agent/${agentId}`, {
          method: 'GET',
          headers,
        });
        break;

      case 'update':
        if (!agentId) {
          throw new Error('Agent ID is required for update');
        }
        
        // Use agentConfig if provided (full update), otherwise use individual fields
        const updateData: any = agentConfig || {};
        
        // If no agentConfig provided, build from individual fields
        if (!agentConfig) {
          if (agentName) updateData.agent_name = agentName;
          if (voiceId) updateData.voice_id = voiceId;
          if (llmId) {
            updateData.response_engine = {
              type: 'retell-llm',
              llm_id: llmId
            };
          }
        }
        
        console.log(`[Retell Agent] Updating agent ${agentId} with:`, JSON.stringify(updateData));
        
        response = await fetch(`${baseUrl}/update-agent/${agentId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(updateData),
        });
        break;

      case 'delete':
        if (!agentId) {
          throw new Error('Agent ID is required for delete');
        }
        
        response = await fetch(`${baseUrl}/delete-agent/${agentId}`, {
          method: 'DELETE',
          headers,
        });
        break;

      case 'preview_voice':
        if (!voiceId) {
          throw new Error('Voice ID is required for preview');
        }
        
        const previewText = text || 'Hello! This is a preview of how I sound. I can help you with various tasks and have natural conversations.';
        
        // Retell doesn't have a direct voice preview API, so we return voice info
        // The frontend should use pre-recorded samples or ElevenLabs directly
        return new Response(JSON.stringify({ 
          success: true,
          voiceId: voiceId,
          message: 'Voice preview requested. Use the voice samples in the UI for preview.',
          sampleText: previewText
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      default:
        throw new Error(`Unsupported action: ${action}`);
    }
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Retell Agent] API error - Status: ${response.status}, Body: ${errorText}`);
      throw new Error(`Retell AI API error: ${response.status} - ${errorText}`);
    }

    const data = action === 'delete' ? { success: true } : await response.json();
    console.log(`[Retell Agent] Success - Response:`, JSON.stringify(data));

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Retell Agent] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
