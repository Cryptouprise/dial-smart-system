
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RetellAgentRequest {
  action: 'create' | 'get' | 'list' | 'update' | 'delete';
  agentName?: string;
  agentId?: string;
  voiceId?: string;
  llmId?: string;
  llmWebsocketUrl?: string;
  responseEngineType?: 'retell-llm' | 'custom-llm';
  language?: string;
  webhookUrl?: string;
  voiceTemperature?: number;
  voiceSpeed?: number;
  enableBackchannel?: boolean;
  boostedKeywords?: string[];
  ambientSound?: string;
  responsiveness?: number;
  interruptionSensitivity?: number;
  enableVoicemailDetection?: boolean;
  voicemailMessage?: string;
  optOutSensitiveDataStorage?: boolean;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: RetellAgentRequest = await req.json();
    const { action, agentName, agentId, voiceId, llmId, llmWebsocketUrl, responseEngineType,
      language, webhookUrl, voiceTemperature, voiceSpeed, enableBackchannel, boostedKeywords,
      ambientSound, responsiveness, interruptionSensitivity, enableVoicemailDetection,
      voicemailMessage, optOutSensitiveDataStorage } = request;

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
        if (!llmId && !llmWebsocketUrl) {
          throw new Error('Either LLM ID or LLM WebSocket URL is required for creation');
        }
        
        const createPayload: any = {
          agent_name: agentName,
          voice_id: voiceId || '11labs-Adrian',
        };

        // Set response engine
        if (responseEngineType === 'custom-llm' && llmWebsocketUrl) {
          createPayload.response_engine = {
            type: 'custom-llm',
            llm_websocket_url: llmWebsocketUrl
          };
        } else {
          createPayload.response_engine = {
            type: 'retell-llm',
            llm_id: llmId
          };
        }

        // Add optional parameters
        if (language) createPayload.language = language;
        if (webhookUrl) createPayload.webhook_url = webhookUrl;
        if (voiceTemperature !== undefined) createPayload.voice_temperature = voiceTemperature;
        if (voiceSpeed !== undefined) createPayload.voice_speed = voiceSpeed;
        if (enableBackchannel !== undefined) createPayload.enable_backchannel = enableBackchannel;
        if (ambientSound) createPayload.ambient_sound = ambientSound;
        if (responsiveness !== undefined) createPayload.responsiveness = responsiveness;
        if (interruptionSensitivity !== undefined) createPayload.interruption_sensitivity = interruptionSensitivity;
        if (enableVoicemailDetection !== undefined) createPayload.enable_voicemail_detection = enableVoicemailDetection;
        if (optOutSensitiveDataStorage !== undefined) createPayload.opt_out_sensitive_data_storage = optOutSensitiveDataStorage;
        
        console.log('[Retell Agent] Creating agent with payload:', JSON.stringify(createPayload));
        
        response = await fetch(`${baseUrl}/create-agent`, {
          method: 'POST',
          headers,
          body: JSON.stringify(createPayload),
        });
        break;

      case 'get':
        if (!agentId) {
          throw new Error('Agent ID is required for get');
        }
        
        console.log(`[Retell Agent] Getting agent: ${agentId}`);
        response = await fetch(`${baseUrl}/get-agent/${agentId}`, {
          method: 'GET',
          headers,
        });
        break;

      case 'list':
        console.log('[Retell Agent] Listing all agents');
        response = await fetch(`${baseUrl}/list-agents`, {
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
        if (language) updateData.language = language;
        if (webhookUrl) updateData.webhook_url = webhookUrl;
        if (voiceTemperature !== undefined) updateData.voice_temperature = voiceTemperature;
        if (voiceSpeed !== undefined) updateData.voice_speed = voiceSpeed;
        if (enableBackchannel !== undefined) updateData.enable_backchannel = enableBackchannel;
        if (boostedKeywords) updateData.boosted_keywords = boostedKeywords;
        if (ambientSound) updateData.ambient_sound = ambientSound;
        if (responsiveness !== undefined) updateData.responsiveness = responsiveness;
        if (interruptionSensitivity !== undefined) updateData.interruption_sensitivity = interruptionSensitivity;
        if (enableVoicemailDetection !== undefined) updateData.enable_voicemail_detection = enableVoicemailDetection;
        if (voicemailMessage) updateData.voicemail_message = voicemailMessage;
        if (optOutSensitiveDataStorage !== undefined) updateData.opt_out_sensitive_data_storage = optOutSensitiveDataStorage;
        
        if (llmId || llmWebsocketUrl) {
          if (responseEngineType === 'custom-llm' && llmWebsocketUrl) {
            updateData.response_engine = {
              type: 'custom-llm',
              llm_websocket_url: llmWebsocketUrl
            };
          } else if (llmId) {
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
        
        console.log(`[Retell Agent] Deleting agent: ${agentId}`);
        response = await fetch(`${baseUrl}/delete-agent/${agentId}`, {
          method: 'DELETE',
          headers,
        });
        break;

      default:
        throw new Error(`Unsupported action: ${action}`);
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
