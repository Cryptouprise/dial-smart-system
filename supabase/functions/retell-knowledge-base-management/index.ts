import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface KnowledgeBaseRequest {
  action: 'create' | 'get' | 'list' | 'update' | 'delete';
  knowledgeBaseId?: string;
  knowledgeBaseName?: string;
  enableAutoRefresh?: boolean;
  refreshFrequency?: 'daily' | 'weekly' | 'monthly';
  texts?: Array<{ text_title: string; text_content: string }>;
  files?: Array<{ file_name: string; file_url: string }>;
  urls?: Array<{ url: string; enable_auto_crawl?: boolean }>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: KnowledgeBaseRequest = await req.json();
    const { action } = request;

    const apiKey = Deno.env.get('RETELL_AI_API_KEY');
    if (!apiKey) {
      throw new Error('RETELL_AI_API_KEY is not configured');
    }

    console.log(`[Retell Knowledge Base] Processing ${action} request`);

    const baseUrl = 'https://api.retellai.com';
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    let response;

    switch (action) {
      case 'create': {
        if (!request.knowledgeBaseName) {
          throw new Error('Knowledge base name is required');
        }

        const payload: any = {
          knowledge_base_name: request.knowledgeBaseName,
        };
        
        if (request.enableAutoRefresh !== undefined) payload.enable_auto_refresh = request.enableAutoRefresh;
        if (request.refreshFrequency) payload.refresh_frequency = request.refreshFrequency;
        if (request.texts) payload.texts = request.texts;
        if (request.files) payload.files = request.files;
        if (request.urls) payload.urls = request.urls;

        response = await fetch(`${baseUrl}/create-knowledge-base`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });
        break;
      }

      case 'get': {
        if (!request.knowledgeBaseId) {
          throw new Error('Knowledge base ID is required');
        }

        response = await fetch(`${baseUrl}/get-knowledge-base/${request.knowledgeBaseId}`, {
          method: 'GET',
          headers,
        });
        break;
      }

      case 'list': {
        response = await fetch(`${baseUrl}/list-knowledge-bases`, {
          method: 'GET',
          headers,
        });
        break;
      }

      case 'update': {
        if (!request.knowledgeBaseId) {
          throw new Error('Knowledge base ID is required for update');
        }

        const updateData: any = {};
        if (request.knowledgeBaseName) updateData.knowledge_base_name = request.knowledgeBaseName;
        if (request.enableAutoRefresh !== undefined) updateData.enable_auto_refresh = request.enableAutoRefresh;
        if (request.refreshFrequency) updateData.refresh_frequency = request.refreshFrequency;
        if (request.texts) updateData.texts = request.texts;
        if (request.files) updateData.files = request.files;
        if (request.urls) updateData.urls = request.urls;

        response = await fetch(`${baseUrl}/update-knowledge-base/${request.knowledgeBaseId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(updateData),
        });
        break;
      }

      case 'delete': {
        if (!request.knowledgeBaseId) {
          throw new Error('Knowledge base ID is required for delete');
        }

        response = await fetch(`${baseUrl}/delete-knowledge-base/${request.knowledgeBaseId}`, {
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
      console.error(`[Retell Knowledge Base] API error - Status: ${response.status}, Body: ${errorText}`);
      throw new Error(`Retell AI API error: ${response.status} - ${errorText}`);
    }

    const data = action === 'delete' ? { success: true } : await response.json();
    console.log(`[Retell Knowledge Base] Success`);

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Retell Knowledge Base] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
