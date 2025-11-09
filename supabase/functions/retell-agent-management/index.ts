
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
  llmId?: string;
  language?: string;
  interruptionSensitivity?: number;
  ambientSound?: string;
  backchannelFrequency?: number;
  backchannelWords?: string[];
  reminderTriggerMs?: number;
  reminderMaxCount?: number;
  enableTranscriptionFormatting?: boolean;
  normalizeForSpeech?: boolean;
  responsiveness?: number;
  boostedKeywords?: string[];
  pronunciationDictionary?: Record<string, string>;
  customVariables?: Array<{ key: string; value: string; description: string }>;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestData: RetellAgentRequest = await req.json();
    const { 
      action, 
      agentName, 
      agentId, 
      voiceId, 
      llmId,
      language,
      interruptionSensitivity,
      ambientSound,
      backchannelFrequency,
      backchannelWords,
      reminderTriggerMs,
      reminderMaxCount,
      enableTranscriptionFormatting,
      normalizeForSpeech,
      responsiveness,
      boostedKeywords,
      pronunciationDictionary,
      customVariables
    } = requestData;

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
        
        const createPayload: any = {
          agent_name: agentName,
          voice_id: voiceId || '11labs-Adrian',
          response_engine: {
            type: 'retell-llm',
            llm_id: llmId
          }
        };

        // Add optional advanced features
        if (language) createPayload.language = language;
        if (interruptionSensitivity !== undefined) createPayload.interruption_sensitivity = interruptionSensitivity;
        if (ambientSound && ambientSound !== 'off') createPayload.ambient_sound = ambientSound;
        if (backchannelFrequency !== undefined) createPayload.backchannel_frequency = backchannelFrequency;
        if (backchannelWords && backchannelWords.length > 0) createPayload.backchannel_words = backchannelWords;
        if (reminderTriggerMs !== undefined) createPayload.reminder_trigger_ms = reminderTriggerMs;
        if (reminderMaxCount !== undefined) createPayload.reminder_max_count = reminderMaxCount;
        if (enableTranscriptionFormatting !== undefined) createPayload.enable_transcription_formatting = enableTranscriptionFormatting;
        if (normalizeForSpeech !== undefined) createPayload.normalize_for_speech = normalizeForSpeech;
        if (responsiveness !== undefined) createPayload.responsiveness = responsiveness;
        if (boostedKeywords && boostedKeywords.length > 0) createPayload.boosted_keywords = boostedKeywords;
        if (pronunciationDictionary && Object.keys(pronunciationDictionary).length > 0) {
          createPayload.pronunciation_dictionary = pronunciationDictionary;
        }

        // Store custom variables in metadata if supported
        if (customVariables && customVariables.length > 0) {
          createPayload.metadata = { custom_variables: customVariables };
        }
        
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

      case 'update':
        if (!agentId) {
          throw new Error('Agent ID is required for update');
        }
        
        const updateData: any = {};
        if (agentName) updateData.agent_name = agentName;
        if (voiceId) updateData.voice_id = voiceId;
        if (llmId) {
          updateData.response_engine = {
            type: 'retell-llm',
            llm_id: llmId
          };
        }

        // Add optional advanced features for update
        if (language) updateData.language = language;
        if (interruptionSensitivity !== undefined) updateData.interruption_sensitivity = interruptionSensitivity;
        if (ambientSound) updateData.ambient_sound = ambientSound;
        if (backchannelFrequency !== undefined) updateData.backchannel_frequency = backchannelFrequency;
        if (backchannelWords && backchannelWords.length > 0) updateData.backchannel_words = backchannelWords;
        if (reminderTriggerMs !== undefined) updateData.reminder_trigger_ms = reminderTriggerMs;
        if (reminderMaxCount !== undefined) updateData.reminder_max_count = reminderMaxCount;
        if (enableTranscriptionFormatting !== undefined) updateData.enable_transcription_formatting = enableTranscriptionFormatting;
        if (normalizeForSpeech !== undefined) updateData.normalize_for_speech = normalizeForSpeech;
        if (responsiveness !== undefined) updateData.responsiveness = responsiveness;
        if (boostedKeywords && boostedKeywords.length > 0) updateData.boosted_keywords = boostedKeywords;
        if (pronunciationDictionary && Object.keys(pronunciationDictionary).length > 0) {
          updateData.pronunciation_dictionary = pronunciationDictionary;
        }

        // Update custom variables in metadata if supported
        if (customVariables && customVariables.length > 0) {
          updateData.metadata = { custom_variables: customVariables };
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
