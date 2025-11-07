import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RetellLLMRequest {
  action: 'create' | 'list' | 'get' | 'update' | 'delete';
  llmId?: string;
  generalPrompt?: string;
  beginMessage?: string;
  model?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, llmId, generalPrompt, beginMessage, model }: RetellLLMRequest = await req.json();

    const apiKey = Deno.env.get('RETELL_AI_API_KEY');
    if (!apiKey) {
      throw new Error('RETELL_AI_API_KEY is not configured');
    }

    console.log(`[Retell LLM] Processing ${action} request`);

    const baseUrl = 'https://api.retellai.com/v2';
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    let response;

    switch (action) {
      case 'create':
        if (!generalPrompt || !beginMessage) {
          throw new Error('generalPrompt and beginMessage are required for creation');
        }
        
        const createPayload = {
          general_prompt: generalPrompt,
          begin_message: beginMessage,
          model: model || 'gpt-4o'
        };
        
        console.log('[Retell LLM] Creating LLM with payload:', JSON.stringify(createPayload));
        
        response = await fetch(`${baseUrl}/retell-llm`, {
          method: 'POST',
          headers,
          body: JSON.stringify(createPayload),
        });
        break;

      case 'list':
        console.log('[Retell LLM] Listing all LLMs');
        response = await fetch(`${baseUrl}/retell-llm`, {
          method: 'GET',
          headers,
        });
        break;

      case 'get':
        if (!llmId) {
          throw new Error('LLM ID is required for get');
        }
        
        console.log(`[Retell LLM] Getting LLM: ${llmId}`);
        response = await fetch(`${baseUrl}/retell-llm/${llmId}`, {
          method: 'GET',
          headers,
        });
        break;

      case 'update':
        if (!llmId) {
          throw new Error('LLM ID is required for update');
        }
        
        const updateData: any = {};
        if (generalPrompt) updateData.general_prompt = generalPrompt;
        if (beginMessage) updateData.begin_message = beginMessage;
        if (model) updateData.model = model;
        
        console.log(`[Retell LLM] Updating LLM ${llmId} with:`, JSON.stringify(updateData));
        
        response = await fetch(`${baseUrl}/retell-llm/${llmId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(updateData),
        });
        break;

      case 'delete':
        if (!llmId) {
          throw new Error('LLM ID is required for delete');
        }
        
        console.log(`[Retell LLM] Deleting LLM: ${llmId}`);
        response = await fetch(`${baseUrl}/retell-llm/${llmId}`, {
          method: 'DELETE',
          headers,
        });
        break;

      default:
        throw new Error(`Unsupported action: ${action}`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Retell LLM] API error - Status: ${response.status}, Body: ${errorText}`);
      throw new Error(`Retell AI API error: ${response.status} - ${errorText}`);
    }

    const data = action === 'delete' ? { success: true } : await response.json();
    console.log(`[Retell LLM] Success - Response:`, JSON.stringify(data));

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Retell LLM] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
