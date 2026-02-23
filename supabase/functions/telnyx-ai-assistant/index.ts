/**
 * Telnyx AI Assistant Management
 *
 * Full CRUD for Telnyx AI Assistants with tool configuration,
 * voice settings, memory, insights, and phone number assignment.
 *
 * Actions:
 *   create_assistant   - Create new AI assistant on Telnyx + local DB
 *   update_assistant   - Update assistant config (Telnyx uses POST, not PATCH)
 *   delete_assistant   - Delete from Telnyx + local DB
 *   list_assistants    - List user's assistants from local DB
 *   get_assistant      - Get single assistant detail from Telnyx API
 *   sync_assistants    - Sync Telnyx → local DB
 *   clone_assistant    - Clone an existing assistant
 *   import_from_retell - Import existing Retell agents into Telnyx
 *   list_models        - List available LLM models
 *   list_voices        - List available TTS voices
 *   assign_number      - Assign phone number to assistant's TeXML app
 *   health_check       - Verify Telnyx API connectivity
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TELNYX_API_BASE = 'https://api.telnyx.com/v2';

// Telnyx API helper
async function telnyxFetch(
  path: string,
  apiKey: string,
  method: string = 'GET',
  body?: unknown
): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  const url = `${TELNYX_API_BASE}${path}`;
  const options: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  };
  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(url, options);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!res.ok) {
      return { ok: false, status: res.status, data, error: data?.errors?.[0]?.detail || text };
    }
    return { ok: true, status: res.status, data };
  } catch (err: any) {
    return { ok: false, status: 0, data: null, error: err.message };
  }
}

// Build Telnyx tool config from our simplified format
function buildToolConfig(tool: any): any {
  switch (tool.type) {
    case 'webhook':
      return {
        type: 'webhook',
        name: tool.name,
        description: tool.description || '',
        url: tool.url,
        method: tool.method || 'POST',
        headers: tool.headers || {},
        path_parameters: tool.path_parameters,
        query_parameters: tool.query_parameters,
        body_parameters: tool.body_parameters,
      };
    case 'transfer':
      return {
        type: 'transfer',
        name: tool.name,
        description: tool.description || '',
        destinations: tool.destinations || [],
      };
    case 'handoff':
      return {
        type: 'handoff',
        name: tool.name,
        description: tool.description || '',
        assistant_id: tool.assistant_id,
        voice_mode: tool.voice_mode || 'unified',
      };
    case 'hangup':
      return { type: 'hangup', name: tool.name, description: tool.description || '' };
    case 'dtmf':
      return { type: 'dtmf', name: tool.name, description: tool.description || '' };
    case 'send_message':
      return { type: 'send_message', name: tool.name, description: tool.description || '' };
    case 'skip_turn':
      return { type: 'skip_turn', name: tool.name, description: tool.description || '' };
    case 'retrieval':
      return { type: 'retrieval', name: tool.name, description: tool.description || '' };
    case 'sip_refer':
      return { type: 'sip_refer', name: tool.name, description: tool.description || '', sip_uri: tool.sip_uri };
    case 'mcp_server':
      return { type: 'mcp_server', name: tool.name, description: tool.description || '', url: tool.url };
    default:
      return tool;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Auth - support both JWT and service role
    const authHeader = req.headers.get('Authorization');
    const bodyText = await req.text();
    const bodyJson = JSON.parse(bodyText);

    let userId: string;

    const token = authHeader?.replace('Bearer ', '') || '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    
    if (bodyJson.user_id && (!authHeader || token === serviceRoleKey || token === anonKey)) {
      // Internal/service call with user_id
      userId = bodyJson.user_id;
      console.log('✅ Internal auth - user_id:', userId);
    } else if (authHeader) {
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Authentication failed' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      userId = user.id;
    } else {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { action, ...params } = bodyJson;
    console.log(`[Telnyx AI Assistant] ${action} for user ${userId}`);

    const apiKey = Deno.env.get('TELNYX_API_KEY');
    if (!apiKey && action !== 'list_assistants' && action !== 'health_check') {
      return new Response(JSON.stringify({ error: 'TELNYX_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let result: any = {};

    switch (action) {
      // ================================================================
      // CREATE ASSISTANT
      // ================================================================
      case 'create_assistant': {
        const {
          name, description, model, instructions, greeting,
          voice, transcription_model, tools, enabled_features,
          dynamic_variables, insight_group_id, data_retention,
          fallback_model, llm_api_key_ref, voice_api_key_ref,
        } = params;

        if (!name || !instructions) {
          throw new Error('name and instructions are required');
        }

        // Build webhook URL for dynamic variables
        const dynamicVarsUrl = `${supabaseUrl}/functions/v1/telnyx-dynamic-vars`;

        // Build Telnyx API payload
        const telnyxPayload: any = {
          name,
          description: description || '',
          model: model || 'Qwen/Qwen3-235B-A22B',
          instructions,
          greeting: greeting || undefined,
          voice_settings: {
            voice: voice || 'Telnyx.NaturalHD.Ava',
          },
          transcription: {
            model: transcription_model || 'telnyx_deepgram_nova3',
          },
          enabled_features: enabled_features || ['telephony'],
          dynamic_variables_webhook_url: dynamicVarsUrl,
          dynamic_variables: dynamic_variables || {},
          privacy_settings: {
            data_retention: data_retention !== false,
          },
        };

        if (voice_api_key_ref) {
          telnyxPayload.voice_settings.api_key_ref = voice_api_key_ref;
        }
        if (llm_api_key_ref) {
          telnyxPayload.llm_api_key_ref = llm_api_key_ref;
        }
        if (fallback_model) {
          telnyxPayload.fallback_model = fallback_model;
        }
        if (insight_group_id) {
          telnyxPayload.insight_settings = { insight_group_id };
        }

        // Build tools
        if (tools && Array.isArray(tools) && tools.length > 0) {
          telnyxPayload.tools = tools.map(buildToolConfig);

          // Auto-add calendar booking tool if not present
          const hasCalendar = tools.some((t: any) => t.name === 'book_appointment' || t.name === 'check_availability');
          if (!hasCalendar) {
            telnyxPayload.tools.push({
              type: 'webhook',
              name: 'book_appointment',
              description: 'Check calendar availability and book appointments. Use action "get_available_slots" to check availability and "book_appointment" to book.',
              url: `${supabaseUrl}/functions/v1/calendar-integration`,
              method: 'POST',
              headers: {
                'Authorization': `Bearer {{#integration_secret}}supabase-service-key{{/integration_secret}}`,
                'Content-Type': 'application/json',
              },
              body_parameters: {
                type: 'object',
                properties: {
                  action: { type: 'string', enum: ['get_available_slots', 'book_appointment'], description: 'Action to perform' },
                  user_id: { type: 'string', description: 'The user ID for calendar lookup' },
                  date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
                  time: { type: 'string', description: 'Time in HH:MM format (24h)' },
                  duration_minutes: { type: 'number', description: 'Appointment duration in minutes' },
                  attendee_name: { type: 'string', description: 'Name of the person being booked' },
                  attendee_email: { type: 'string', description: 'Email of the person being booked' },
                  attendee_phone: { type: 'string', description: 'Phone number of the person being booked' },
                  notes: { type: 'string', description: 'Appointment notes' },
                },
                required: ['action'],
              },
            });
          }
        }

        // Create on Telnyx
        const createRes = await telnyxFetch('/ai/assistants', apiKey!, 'POST', telnyxPayload);
        if (!createRes.ok) {
          throw new Error(`Telnyx API error: ${createRes.error}`);
        }

        const telnyxAssistant = createRes.data.data;

        // Get organization
        const { data: orgUser } = await supabaseAdmin
          .from('organization_users')
          .select('organization_id')
          .eq('user_id', userId)
          .limit(1)
          .maybeSingle();

        // Save to local DB
        const { data: localAssistant, error: dbError } = await supabaseAdmin
          .from('telnyx_assistants')
          .insert({
            user_id: userId,
            organization_id: orgUser?.organization_id || null,
            telnyx_assistant_id: telnyxAssistant.assistant_id || telnyxAssistant.id,
            telnyx_texml_app_id: telnyxAssistant.telephony_settings?.default_texml_app_id,
            telnyx_messaging_profile_id: telnyxAssistant.messaging_settings?.default_messaging_profile_id,
            name,
            description: description || null,
            model: model || 'Qwen/Qwen3-235B-A22B',
            instructions,
            greeting: greeting || null,
            voice: voice || 'Telnyx.NaturalHD.Ava',
            transcription_model: transcription_model || 'telnyx_deepgram_nova3',
            tools: tools || [],
            enabled_features: enabled_features || ['telephony'],
            dynamic_variables_webhook_url: dynamicVarsUrl,
            dynamic_variables: dynamic_variables || {},
            data_retention: data_retention !== false,
            insight_group_id: insight_group_id || null,
            status: 'active',
            metadata: { telnyx_response: telnyxAssistant },
          })
          .select()
          .single();

        if (dbError) throw dbError;

        // Update telnyx_settings with webhook URLs
        await supabaseAdmin
          .from('telnyx_settings')
          .upsert({
            user_id: userId,
            api_key_configured: true,
            webhook_url: `${supabaseUrl}/functions/v1/telnyx-webhook`,
            dynamic_vars_webhook_url: dynamicVarsUrl,
          }, { onConflict: 'user_id' });

        result = { assistant: localAssistant, telnyx: telnyxAssistant };
        break;
      }

      // ================================================================
      // UPDATE ASSISTANT (Telnyx uses POST, not PATCH)
      // ================================================================
      case 'update_assistant': {
        const { assistant_id, ...updateFields } = params;
        if (!assistant_id) throw new Error('assistant_id is required');

        // Get local record
        const { data: existing } = await supabaseAdmin
          .from('telnyx_assistants')
          .select('*')
          .eq('id', assistant_id)
          .eq('user_id', userId)
          .single();

        if (!existing) throw new Error('Assistant not found');

        // Build Telnyx update payload (only changed fields)
        const telnyxUpdate: any = {};
        const dbUpdate: any = { updated_at: new Date().toISOString() };

        for (const [key, value] of Object.entries(updateFields)) {
          switch (key) {
            case 'name':
            case 'description':
            case 'model':
            case 'instructions':
            case 'greeting':
              telnyxUpdate[key] = value;
              dbUpdate[key] = value;
              break;
            case 'voice':
              telnyxUpdate.voice_settings = { voice: value };
              dbUpdate.voice = value;
              break;
            case 'transcription_model':
              telnyxUpdate.transcription = { model: value };
              dbUpdate.transcription_model = value;
              break;
            case 'tools':
              telnyxUpdate.tools = (value as any[]).map(buildToolConfig);
              dbUpdate.tools = value;
              break;
            case 'status':
              dbUpdate.status = value;
              break;
            case 'dynamic_variables':
              telnyxUpdate.dynamic_variables = value;
              dbUpdate.dynamic_variables = value;
              break;
          }
        }

        // Update Telnyx if there are API changes
        if (Object.keys(telnyxUpdate).length > 0 && existing.telnyx_assistant_id) {
          const updateRes = await telnyxFetch(
            `/ai/assistants/${existing.telnyx_assistant_id}`,
            apiKey!, 'POST', telnyxUpdate
          );
          if (!updateRes.ok) {
            console.error('[Telnyx AI] Update failed:', updateRes.error);
            throw new Error(`Telnyx API error: ${updateRes.error}`);
          }
        }

        // Update local DB
        const { data: updated, error: updateError } = await supabaseAdmin
          .from('telnyx_assistants')
          .update(dbUpdate)
          .eq('id', assistant_id)
          .eq('user_id', userId)
          .select()
          .single();

        if (updateError) throw updateError;
        result = { assistant: updated };
        break;
      }

      // ================================================================
      // DELETE ASSISTANT
      // ================================================================
      case 'delete_assistant': {
        const { assistant_id } = params;
        if (!assistant_id) throw new Error('assistant_id is required');

        const { data: existing } = await supabaseAdmin
          .from('telnyx_assistants')
          .select('telnyx_assistant_id')
          .eq('id', assistant_id)
          .eq('user_id', userId)
          .single();

        if (!existing) throw new Error('Assistant not found');

        // Delete from Telnyx
        if (existing.telnyx_assistant_id) {
          const deleteRes = await telnyxFetch(
            `/ai/assistants/${existing.telnyx_assistant_id}`,
            apiKey!, 'DELETE'
          );
          if (!deleteRes.ok && deleteRes.status !== 404) {
            console.error('[Telnyx AI] Delete failed:', deleteRes.error);
          }
        }

        // Delete from local DB
        await supabaseAdmin
          .from('telnyx_assistants')
          .delete()
          .eq('id', assistant_id)
          .eq('user_id', userId);

        result = { deleted: true };
        break;
      }

      // ================================================================
      // LIST ASSISTANTS (local DB)
      // ================================================================
      case 'list_assistants': {
        const { data: assistants, error } = await supabaseAdmin
          .from('telnyx_assistants')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        result = { assistants: assistants || [] };
        break;
      }

      // ================================================================
      // GET SINGLE ASSISTANT (from Telnyx API for fresh data)
      // ================================================================
      case 'get_assistant': {
        const { assistant_id } = params;
        if (!assistant_id) throw new Error('assistant_id is required');

        const { data: local } = await supabaseAdmin
          .from('telnyx_assistants')
          .select('*')
          .eq('id', assistant_id)
          .eq('user_id', userId)
          .single();

        if (!local) throw new Error('Assistant not found');

        let telnyxData = null;
        if (local.telnyx_assistant_id && apiKey) {
          const getRes = await telnyxFetch(`/ai/assistants/${local.telnyx_assistant_id}`, apiKey!);
          if (getRes.ok) {
            telnyxData = getRes.data.data;
          }
        }

        result = { assistant: local, telnyx: telnyxData };
        break;
      }

      // ================================================================
      // SYNC ASSISTANTS (Telnyx → local DB)
      // ================================================================
      case 'sync_assistants': {
        const listRes = await telnyxFetch('/ai/assistants', apiKey!);
        if (!listRes.ok) throw new Error(`Telnyx API error: ${listRes.error}`);

        const telnyxAssistants = listRes.data.data || [];
        let synced = 0;

        for (const ta of telnyxAssistants) {
          const telnyxId = ta.assistant_id || ta.id;

          // Check if already exists locally
          const { data: existing } = await supabaseAdmin
            .from('telnyx_assistants')
            .select('id')
            .eq('telnyx_assistant_id', telnyxId)
            .maybeSingle();

          if (existing) {
            // Update local record
            await supabaseAdmin
              .from('telnyx_assistants')
              .update({
                name: ta.name,
                model: ta.model,
                instructions: ta.instructions,
                greeting: ta.greeting,
                voice: ta.voice_settings?.voice,
                tools: ta.tools || [],
                updated_at: new Date().toISOString(),
              })
              .eq('id', existing.id);
          } else {
            // Create local record
            await supabaseAdmin
              .from('telnyx_assistants')
              .insert({
                user_id: userId,
                telnyx_assistant_id: telnyxId,
                telnyx_texml_app_id: ta.telephony_settings?.default_texml_app_id,
                telnyx_messaging_profile_id: ta.messaging_settings?.default_messaging_profile_id,
                name: ta.name || 'Imported Assistant',
                model: ta.model || 'Qwen/Qwen3-235B-A22B',
                instructions: ta.instructions || '',
                greeting: ta.greeting,
                voice: ta.voice_settings?.voice || 'Telnyx.NaturalHD.Ava',
                tools: ta.tools || [],
                status: 'active',
                metadata: { imported_from: 'telnyx_sync', telnyx_response: ta },
              });
          }
          synced++;
        }

        result = { synced, total_on_telnyx: telnyxAssistants.length };
        break;
      }

      // ================================================================
      // CLONE ASSISTANT
      // ================================================================
      case 'clone_assistant': {
        const { assistant_id } = params;
        if (!assistant_id) throw new Error('assistant_id is required');

        const { data: existing } = await supabaseAdmin
          .from('telnyx_assistants')
          .select('*')
          .eq('id', assistant_id)
          .eq('user_id', userId)
          .single();

        if (!existing || !existing.telnyx_assistant_id) throw new Error('Assistant not found');

        const cloneRes = await telnyxFetch(
          `/ai/assistants/${existing.telnyx_assistant_id}/clone`,
          apiKey!, 'POST'
        );
        if (!cloneRes.ok) throw new Error(`Clone failed: ${cloneRes.error}`);

        const cloned = cloneRes.data.data;
        const clonedId = cloned.assistant_id || cloned.id;

        // Save clone locally
        const { data: localClone } = await supabaseAdmin
          .from('telnyx_assistants')
          .insert({
            user_id: userId,
            organization_id: existing.organization_id,
            telnyx_assistant_id: clonedId,
            telnyx_texml_app_id: cloned.telephony_settings?.default_texml_app_id,
            name: `${existing.name} (Copy)`,
            description: existing.description,
            model: existing.model,
            instructions: existing.instructions,
            greeting: existing.greeting,
            voice: existing.voice,
            transcription_model: existing.transcription_model,
            tools: existing.tools,
            enabled_features: existing.enabled_features,
            dynamic_variables: existing.dynamic_variables,
            status: 'draft',
            metadata: { cloned_from: existing.id },
          })
          .select()
          .single();

        result = { assistant: localClone, telnyx: cloned };
        break;
      }

      // ================================================================
      // IMPORT FROM RETELL
      // ================================================================
      case 'import_from_retell': {
        const { retell_api_key } = params;
        if (!retell_api_key) throw new Error('retell_api_key is required');

        // Use Telnyx import endpoint
        const importRes = await telnyxFetch('/ai/assistants/import', apiKey!, 'POST', {
          provider: 'retell',
          api_key_ref: retell_api_key,
        });

        if (!importRes.ok) {
          // If direct import fails, do manual migration
          console.log('[Telnyx AI] Auto-import failed, attempting manual migration...');

          // Fetch agents from Retell
          const retellRes = await fetch('https://api.retellai.com/list-agents', {
            headers: { 'Authorization': `Bearer ${retell_api_key}` },
          });

          if (!retellRes.ok) throw new Error('Failed to fetch Retell agents');
          const retellAgents = await retellRes.json();
          let imported = 0;

          for (const agent of retellAgents) {
            // Create equivalent Telnyx assistant
            const telnyxPayload = {
              name: agent.agent_name || 'Imported from Retell',
              model: 'Qwen/Qwen3-235B-A22B',  // Default since Retell model may not exist on Telnyx
              instructions: agent.general_prompt || agent.llm_websocket_url || '',
              greeting: agent.begin_message || undefined,
              voice_settings: { voice: 'Telnyx.NaturalHD.Ava' },
              transcription: { model: 'telnyx_deepgram_nova3' },
              enabled_features: ['telephony'],
              dynamic_variables_webhook_url: `${supabaseUrl}/functions/v1/telnyx-dynamic-vars`,
            };

            const createRes = await telnyxFetch('/ai/assistants', apiKey!, 'POST', telnyxPayload);
            if (createRes.ok) {
              const ta = createRes.data.data;
              await supabaseAdmin.from('telnyx_assistants').insert({
                user_id: userId,
                telnyx_assistant_id: ta.assistant_id || ta.id,
                telnyx_texml_app_id: ta.telephony_settings?.default_texml_app_id,
                name: telnyxPayload.name,
                model: telnyxPayload.model,
                instructions: telnyxPayload.instructions,
                greeting: telnyxPayload.greeting,
                voice: 'Telnyx.NaturalHD.Ava',
                status: 'active',
                metadata: { imported_from: 'retell', retell_agent_id: agent.agent_id },
              });
              imported++;
            }
          }

          result = { imported, method: 'manual', retell_agents_found: retellAgents.length };
          break;
        }

        result = { imported: importRes.data, method: 'auto' };
        break;
      }

      // ================================================================
      // LIST MODELS
      // ================================================================
      case 'list_models': {
        // Return known Telnyx-supported models
        result = {
          models: [
            { id: 'Qwen/Qwen3-235B-A22B', name: 'Qwen 3 235B', provider: 'Qwen', recommended: true, cost: 'Free on Telnyx' },
            { id: 'meta-llama/Meta-Llama-3.1-70B-Instruct', name: 'Llama 3.1 70B', provider: 'Meta', cost: 'Free on Telnyx' },
            { id: 'meta-llama/Meta-Llama-3.1-8B-Instruct', name: 'Llama 3.1 8B', provider: 'Meta', cost: 'Free on Telnyx' },
            { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI', cost: 'Requires API key' },
            { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI', cost: 'Requires API key' },
            { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet', provider: 'Anthropic', cost: 'Requires API key' },
          ],
        };
        break;
      }

      // ================================================================
      // LIST VOICES
      // ================================================================
      case 'list_voices': {
        result = {
          voices: [
            // Telnyx NaturalHD (Premium, $0.000012/char)
            { id: 'Telnyx.NaturalHD.Ava', name: 'Ava', provider: 'Telnyx NaturalHD', tier: 'premium', gender: 'female' },
            { id: 'Telnyx.NaturalHD.andersen_johan', name: 'Johan', provider: 'Telnyx NaturalHD', tier: 'premium', gender: 'male' },
            // Telnyx Natural (Enhanced, $0.000003/char)
            { id: 'Telnyx.Natural.abbie', name: 'Abbie', provider: 'Telnyx Natural', tier: 'enhanced', gender: 'female' },
            // KokoroTTS (Basic, $0.000003/char)
            { id: 'Telnyx.KokoroTTS.af_heart', name: 'Heart', provider: 'KokoroTTS', tier: 'basic', gender: 'female' },
            // AWS Polly Neural
            { id: 'AWS.Polly.Joanna-Neural', name: 'Joanna', provider: 'AWS Polly', tier: 'neural', gender: 'female' },
            { id: 'AWS.Polly.Matthew-Neural', name: 'Matthew', provider: 'AWS Polly', tier: 'neural', gender: 'male' },
            // Azure Neural
            { id: 'Azure.en-US-JennyNeural', name: 'Jenny', provider: 'Azure', tier: 'neural', gender: 'female' },
            { id: 'Azure.en-US-GuyNeural', name: 'Guy', provider: 'Azure', tier: 'neural', gender: 'male' },
          ],
        };
        break;
      }

      // ================================================================
      // ASSIGN PHONE NUMBER to assistant's TeXML app
      // ================================================================
      case 'assign_number': {
        const { assistant_id, phone_number_id } = params;
        if (!assistant_id || !phone_number_id) throw new Error('assistant_id and phone_number_id required');

        const { data: assistant } = await supabaseAdmin
          .from('telnyx_assistants')
          .select('telnyx_texml_app_id, assigned_phone_number_ids')
          .eq('id', assistant_id)
          .eq('user_id', userId)
          .single();

        if (!assistant?.telnyx_texml_app_id) throw new Error('Assistant has no TeXML app');

        // Get the Telnyx phone number ID
        const { data: phoneNumber } = await supabaseAdmin
          .from('phone_numbers')
          .select('id, phone_number')
          .eq('id', phone_number_id)
          .single();

        if (!phoneNumber) throw new Error('Phone number not found');

        // Update phone number on Telnyx to use this TeXML app
        const updateRes = await telnyxFetch(
          `/phone_numbers/${phone_number_id}`,
          apiKey!, 'PATCH',
          { connection_id: assistant.telnyx_texml_app_id }
        );

        // Update local tracking
        const existingIds = assistant.assigned_phone_number_ids || [];
        if (!existingIds.includes(phone_number_id)) {
          await supabaseAdmin
            .from('telnyx_assistants')
            .update({
              assigned_phone_number_ids: [...existingIds, phone_number_id],
              updated_at: new Date().toISOString(),
            })
            .eq('id', assistant_id);
        }

        result = { assigned: true, phone_number: phoneNumber.phone_number };
        break;
      }

      // ================================================================
      // HEALTH CHECK
      // ================================================================
      case 'health_check': {
        const hasKey = !!apiKey;
        let apiHealthy = false;

        if (hasKey) {
          const healthRes = await telnyxFetch('/ai/assistants?page[size]=1', apiKey!);
          apiHealthy = healthRes.ok;
        }

        result = {
          healthy: true,
          telnyx_configured: hasKey,
          telnyx_api_reachable: apiHealthy,
          webhook_url: `${supabaseUrl}/functions/v1/telnyx-webhook`,
          dynamic_vars_url: `${supabaseUrl}/functions/v1/telnyx-dynamic-vars`,
          timestamp: new Date().toISOString(),
        };
        break;
      }

      // ================================================================
      // PURCHASE NUMBER
      // ================================================================
      case 'purchase_number': {
        const { area_code, quantity = 1 } = params as any;
        if (!area_code) throw new Error('area_code is required');

        // Search available numbers
        const searchRes = await telnyxFetch(
          `/available_phone_numbers?filter[national_destination_code]=${area_code}&filter[country_code]=US&filter[limit]=${quantity}&filter[features][]=voice`,
          apiKey!
        );
        if (!searchRes.ok || !searchRes.data?.data?.length) {
          throw new Error(`No numbers available in area code ${area_code}`);
        }

        const numbersToOrder = searchRes.data.data.slice(0, quantity).map((n: any) => ({
          phone_number: n.phone_number,
        }));

        // Place order
        const orderRes = await telnyxFetch('/number_orders', apiKey!, 'POST', {
          phone_numbers: numbersToOrder,
        });
        if (!orderRes.ok) {
          throw new Error(`Number order failed: ${orderRes.error}`);
        }

        const orderId = orderRes.data?.data?.id;
        console.log(`[Telnyx] Number order ${orderId} placed, polling...`);

        // Poll for completion (up to 30s)
        let orderComplete = false;
        let orderData = orderRes.data?.data;
        for (let i = 0; i < 10; i++) {
          await new Promise(r => setTimeout(r, 3000));
          const statusRes = await telnyxFetch(`/number_orders/${orderId}`, apiKey!);
          if (statusRes.ok) {
            orderData = statusRes.data?.data;
            if (orderData?.status === 'success') { orderComplete = true; break; }
          }
        }

        // Save to phone_numbers table
        const purchasedNumbers: string[] = [];
        for (const pn of numbersToOrder) {
          const { error: insertErr } = await supabaseAdmin
            .from('phone_numbers')
            .insert({
              number: pn.phone_number,
              phone_number: pn.phone_number,
              provider: 'telnyx',
              status: 'active',
              daily_calls: 0,
              user_id: userId,
              allowed_uses: ['voice_ai'],
              rotation_enabled: false,
            });
          if (insertErr) console.error('DB insert error:', insertErr);
          purchasedNumbers.push(pn.phone_number);
        }

        result = {
          success: true,
          order_id: orderId,
          order_complete: orderComplete,
          numbers: purchasedNumbers,
          message: `Purchased ${purchasedNumbers.length} number(s) in area code ${area_code}`,
        };
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[Telnyx AI Assistant] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
