/**
 * Telnyx Knowledge Base / RAG Management
 *
 * Manages knowledge bases for AI assistants:
 *   - Upload documents to Telnyx Cloud Storage
 *   - Embed documents for vector search
 *   - Embed URLs (website crawling)
 *   - Check embedding status
 *   - Similarity search
 *   - Connect knowledge base to assistant
 *
 * Actions:
 *   create_kb          - Create a knowledge base (storage bucket + embedding config)
 *   embed_documents    - Trigger embedding of documents in a bucket
 *   embed_url          - Embed website content (crawls 5 levels deep)
 *   check_embed_status - Check status of async embedding task
 *   similarity_search  - Search the knowledge base
 *   connect_assistant  - Connect KB to an assistant via retrieval tool
 *   list_kbs           - List user's knowledge bases
 *   delete_kb          - Delete a knowledge base
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TELNYX_API_BASE = 'https://api.telnyx.com/v2';

async function telnyxFetch(
  path: string, apiKey: string, method: string = 'GET', body?: unknown
): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  const url = `${TELNYX_API_BASE}${path}`;
  const options: RequestInit = {
    method,
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  };
  if (body && method !== 'GET') options.body = JSON.stringify(body);

  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) return { ok: false, status: res.status, data, error: data?.errors?.[0]?.detail || text };
  return { ok: true, status: res.status, data };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Authentication failed' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = user.id;

    const { action, ...params } = await req.json();
    const apiKey = Deno.env.get('TELNYX_API_KEY')?.trim().replace(/[^\x20-\x7E]/g, '') || null;
    if (!apiKey) throw new Error('TELNYX_API_KEY not configured');

    let result: any = {};

    switch (action) {
      // ================================================================
      // CREATE KNOWLEDGE BASE
      // ================================================================
      case 'create_kb': {
        const {
          name, description, bucket_name,
          embedding_model, chunk_size, chunk_overlap,
        } = params;

        if (!name) throw new Error('name is required');

        // Generate a unique bucket name if not provided
        const finalBucketName = bucket_name || `kb-${userId.substring(0, 8)}-${Date.now()}`;

        // Create storage bucket on Telnyx
        const bucketRes = await telnyxFetch('/storage/buckets', apiKey, 'POST', {
          name: finalBucketName,
        });

        // Bucket may already exist (409), that's fine
        if (!bucketRes.ok && bucketRes.status !== 409) {
          console.warn('[Telnyx KB] Bucket creation warning:', bucketRes.error);
          // Continue anyway — bucket might exist from a previous attempt
        }

        // Save locally
        const { data: kb, error: dbError } = await supabaseAdmin
          .from('telnyx_knowledge_bases')
          .insert({
            user_id: userId,
            name,
            description: description || null,
            bucket_name: finalBucketName,
            embedding_model: embedding_model || 'thenlper/gte-large',
            document_chunk_size: chunk_size || 1024,
            document_chunk_overlap: chunk_overlap || 512,
            status: 'pending',
          })
          .select()
          .single();

        if (dbError) throw dbError;

        result = { knowledge_base: kb, bucket_name: finalBucketName };
        break;
      }

      // ================================================================
      // EMBED DOCUMENTS (from storage bucket)
      // ================================================================
      case 'embed_documents': {
        const { kb_id } = params;
        if (!kb_id) throw new Error('kb_id required');

        const { data: kb } = await supabaseAdmin
          .from('telnyx_knowledge_bases')
          .select('*')
          .eq('id', kb_id)
          .eq('user_id', userId)
          .single();

        if (!kb) throw new Error('Knowledge base not found');

        // Trigger embedding
        const embedRes = await telnyxFetch('/ai/embeddings', apiKey, 'POST', {
          bucket_name: kb.bucket_name,
          embedding_model: kb.embedding_model,
          document_chunk_size: kb.document_chunk_size,
          document_chunk_overlap_size: kb.document_chunk_overlap,
        });

        if (!embedRes.ok) throw new Error(`Embedding error: ${embedRes.error}`);

        const taskId = embedRes.data.data?.task_id || embedRes.data.task_id;

        // Update status
        await supabaseAdmin
          .from('telnyx_knowledge_bases')
          .update({
            status: 'embedding',
            last_embed_task_id: taskId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', kb_id);

        result = { task_id: taskId, status: 'embedding' };
        break;
      }

      // ================================================================
      // EMBED URL (website crawling)
      // ================================================================
      case 'embed_url': {
        const { kb_id, url: targetUrl } = params;
        if (!kb_id || !targetUrl) throw new Error('kb_id and url are required');

        const { data: kb } = await supabaseAdmin
          .from('telnyx_knowledge_bases')
          .select('*')
          .eq('id', kb_id)
          .eq('user_id', userId)
          .single();

        if (!kb) throw new Error('Knowledge base not found');

        // Embed URL content (crawls 5 levels deep)
        const embedRes = await telnyxFetch('/ai/embeddings/url', apiKey, 'POST', {
          url: targetUrl,
          bucket_name: kb.bucket_name,
          embedding_model: kb.embedding_model,
          document_chunk_size: kb.document_chunk_size,
          document_chunk_overlap_size: kb.document_chunk_overlap,
        });

        if (!embedRes.ok) throw new Error(`URL embedding error: ${embedRes.error}`);

        const taskId = embedRes.data.data?.task_id || embedRes.data.task_id;

        await supabaseAdmin
          .from('telnyx_knowledge_bases')
          .update({
            status: 'embedding',
            last_embed_task_id: taskId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', kb_id);

        result = { task_id: taskId, status: 'embedding', url: targetUrl };
        break;
      }

      // ================================================================
      // CHECK EMBEDDING STATUS
      // ================================================================
      case 'check_embed_status': {
        const { kb_id, task_id } = params;

        let checkTaskId = task_id;
        if (kb_id && !checkTaskId) {
          const { data: kb } = await supabaseAdmin
            .from('telnyx_knowledge_bases')
            .select('last_embed_task_id')
            .eq('id', kb_id)
            .eq('user_id', userId)
            .single();
          checkTaskId = kb?.last_embed_task_id;
        }

        if (!checkTaskId) throw new Error('No task_id found');

        const statusRes = await telnyxFetch(`/ai/embeddings/${checkTaskId}`, apiKey);
        const status = statusRes.data?.data?.status || statusRes.data?.status || 'unknown';

        // Update local KB status if complete
        if (kb_id && (status === 'completed' || status === 'ready')) {
          await supabaseAdmin
            .from('telnyx_knowledge_bases')
            .update({ status: 'ready', updated_at: new Date().toISOString() })
            .eq('id', kb_id);
        }

        result = { task_id: checkTaskId, status, data: statusRes.data };
        break;
      }

      // ================================================================
      // SIMILARITY SEARCH
      // ================================================================
      case 'similarity_search': {
        const { kb_id, query, limit: searchLimit } = params;
        if (!kb_id || !query) throw new Error('kb_id and query are required');

        const { data: kb } = await supabaseAdmin
          .from('telnyx_knowledge_bases')
          .select('bucket_name, embedding_model')
          .eq('id', kb_id)
          .eq('user_id', userId)
          .single();

        if (!kb) throw new Error('Knowledge base not found');

        const searchRes = await telnyxFetch('/ai/embeddings/similarity-search', apiKey, 'POST', {
          bucket_name: kb.bucket_name,
          embedding_model: kb.embedding_model,
          query,
          num_docs: searchLimit || 5,
        });

        if (!searchRes.ok) throw new Error(`Search error: ${searchRes.error}`);

        result = { results: searchRes.data.data || searchRes.data };
        break;
      }

      // ================================================================
      // CONNECT KB TO ASSISTANT (adds retrieval tool)
      // ================================================================
      case 'connect_assistant': {
        const { kb_id, assistant_id } = params;
        if (!kb_id || !assistant_id) throw new Error('kb_id and assistant_id are required');

        const { data: kb } = await supabaseAdmin
          .from('telnyx_knowledge_bases')
          .select('*')
          .eq('id', kb_id)
          .eq('user_id', userId)
          .single();

        if (!kb) throw new Error('Knowledge base not found');

        // Get assistant's current tools
        const { data: assistant } = await supabaseAdmin
          .from('telnyx_assistants')
          .select('id, tools, telnyx_assistant_id')
          .eq('id', assistant_id)
          .eq('user_id', userId)
          .single();

        if (!assistant) throw new Error('Assistant not found');

        // Add retrieval tool if not already present
        const currentTools = assistant.tools || [];
        const hasRetrieval = currentTools.some((t: any) => t.type === 'retrieval' && t.bucket_name === kb.bucket_name);

        if (!hasRetrieval) {
          const newTools = [
            ...currentTools,
            {
              type: 'retrieval',
              name: `search_${kb.name.toLowerCase().replace(/\s+/g, '_')}`,
              description: `Search the ${kb.name} knowledge base for relevant information`,
              bucket_name: kb.bucket_name,
            },
          ];

          // Update assistant on Telnyx
          if (assistant.telnyx_assistant_id) {
            await telnyxFetch(
              `/ai/assistants/${assistant.telnyx_assistant_id}`,
              apiKey, 'POST',
              { tools: newTools.map((t: any) => t) }
            );
          }

          // Update local
          await supabaseAdmin
            .from('telnyx_assistants')
            .update({ tools: newTools, updated_at: new Date().toISOString() })
            .eq('id', assistant_id);
        }

        // Track connection
        const existingIds = kb.assistant_ids || [];
        if (!existingIds.includes(assistant_id)) {
          await supabaseAdmin
            .from('telnyx_knowledge_bases')
            .update({
              assistant_ids: [...existingIds, assistant_id],
              updated_at: new Date().toISOString(),
            })
            .eq('id', kb_id);
        }

        result = { connected: true };
        break;
      }

      // ================================================================
      // LIST KNOWLEDGE BASES
      // ================================================================
      case 'list_kbs': {
        const { data: kbs } = await supabaseAdmin
          .from('telnyx_knowledge_bases')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        result = { knowledge_bases: kbs || [] };
        break;
      }

      // ================================================================
      // DELETE KNOWLEDGE BASE
      // ================================================================
      case 'delete_kb': {
        const { kb_id } = params;
        if (!kb_id) throw new Error('kb_id required');

        await supabaseAdmin
          .from('telnyx_knowledge_bases')
          .delete()
          .eq('id', kb_id)
          .eq('user_id', userId);

        result = { deleted: true };
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[Telnyx Knowledge Base] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
