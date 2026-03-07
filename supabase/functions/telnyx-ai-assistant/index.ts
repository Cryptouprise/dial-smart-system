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

// Normalize model IDs for Telnyx API — proprietary models need provider prefix
function normalizeTelnyxModelId(modelId: string): string {
  if (!modelId) return modelId;
  // Already prefixed — pass through
  if (modelId.includes('/')) return modelId;
  // OpenAI models
  const openaiPatterns = ['gpt-', 'o1-', 'o3-', 'o4-', 'chatgpt-'];
  if (openaiPatterns.some(p => modelId.toLowerCase().startsWith(p))) {
    return `openai/${modelId}`;
  }
  // Anthropic models
  const anthropicPatterns = ['claude-'];
  if (anthropicPatterns.some(p => modelId.toLowerCase().startsWith(p))) {
    return `anthropic/${modelId}`;
  }
  // Meta models
  if (modelId.toLowerCase().startsWith('llama-') || modelId.toLowerCase().startsWith('meta-llama')) {
    return `meta-llama/${modelId}`;
  }
  // Default: return as-is (Telnyx-native models like mistralai/*, etc.)
  return modelId;
}

function normalizeVoiceProvider(rawProvider?: string, voiceId?: string): string {
  const provider = String(rawProvider || '').trim();
  const source = `${provider} ${voiceId || ''}`.toLowerCase();

  if (source.includes('elevenlabs') || source.includes('eleven_labs') || source.includes('eleven labs') || source.includes('11labs')) return 'ElevenLabs';
  if (source.includes('kokoro')) return 'KokoroTTS';
  if (source.includes('polly') || source.includes('aws')) return 'AWS Polly';
  if (source.includes('azure')) return 'Azure';
  if (source.includes('minimax')) return 'MiniMax';
  if (source.includes('resemble')) return 'ResembleAI';
  if (source.includes('naturalhd')) return 'Telnyx NaturalHD';
  if (source.includes('telnyx') && source.includes('natural')) return 'Telnyx Natural';
  if (source.includes('telnyx')) return 'Telnyx';

  return provider || 'Unknown';
}

function humanizeVoiceId(voiceId?: string): string {
  if (!voiceId) return 'Unknown';
  const tail = String(voiceId).split(/[./]/).pop() || String(voiceId);
  return tail.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

// Telnyx API helper
async function telnyxFetch(
  path: string,
  apiKey: string,
  method: string = 'GET',
  body?: unknown
): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  // Sanitize API key - remove any whitespace, newlines, or non-ASCII characters
  const cleanKey = String(apiKey || '').trim().replace(/[^\x20-\x7E]/g, '');
  if (!cleanKey) {
    return { ok: false, status: 0, data: null, error: 'API key is empty or invalid after sanitization' };
  }

  const url = `${TELNYX_API_BASE}${path}`;
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${cleanKey}`,
    'Content-Type': 'application/json',
  };
  const options: RequestInit = { method, headers };
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

// Build the calendar booking webhook tool config
function buildCalendarTool(supabaseUrl: string, serviceRoleKey: string, userId: string): any {
  return {
    type: 'webhook',
    webhook: {
      name: 'book_appointment',
      description: 'Check calendar availability and book appointments. Use action "get_available_slots" to check availability first, then "book_appointment" to book. Always provide the user_id.',
      url: `${supabaseUrl}/functions/v1/calendar-integration`,
      method: 'POST',
      headers: [
        { name: 'Authorization', value: `Bearer ${serviceRoleKey}` },
        { name: 'Content-Type', value: 'application/json' },
      ],
      body_parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['get_available_slots', 'book_appointment'], description: 'Action to perform' },
          user_id: { type: 'string', description: `The user ID for calendar lookup. Always use: ${userId}` },
          date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
          time: { type: 'string', description: 'Time in HH:MM format (24h)' },
          duration_minutes: { type: 'number', description: 'Appointment duration in minutes, default 30' },
          attendee_name: { type: 'string', description: 'Name of the person being booked' },
          attendee_email: { type: 'string', description: 'Email of the person being booked' },
          attendee_phone: { type: 'string', description: 'Phone number of the person being booked' },
          notes: { type: 'string', description: 'Appointment notes' },
        },
        required: ['action', 'user_id'],
      },
    },
  };
}

// Ensure calendar tools are present in a tools array
function ensureCalendarTools(tools: any[], supabaseUrl: string, serviceRoleKey: string, userId: string): any[] {
  const hasCalendar = tools.some((t: any) => t.name === 'book_appointment' || t.name === 'check_availability' || t.webhook?.name === 'book_appointment' || t.webhook?.name === 'check_availability');
  if (!hasCalendar) {
    tools.push(buildCalendarTool(supabaseUrl, serviceRoleKey, userId));
  }
  return tools;
}

// Build Telnyx tool config from our simplified format
function buildToolConfig(tool: any): any {
  switch (tool.type) {
    case 'webhook': {
      const webhookHeaders = Array.isArray(tool.headers) ? tool.headers :
        (tool.headers && typeof tool.headers === 'object') ?
          Object.entries(tool.headers).map(([k, v]) => ({ name: k, value: v })) : [];
      return {
        type: 'webhook',
        webhook: {
          name: tool.name,
          description: tool.description || '',
          url: tool.url,
          method: tool.method || 'POST',
          headers: webhookHeaders,
          path_parameters: tool.path_parameters,
          query_parameters: tool.query_parameters,
          body_parameters: tool.body_parameters,
        },
      };
    }
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

    const rawApiKey = Deno.env.get('TELNYX_API_KEY');
    // Sanitize: trim whitespace and remove non-ASCII/invisible characters
    const apiKey = rawApiKey?.trim().replace(/[^\x20-\x7E]/g, '') || null;
    
    // Debug: log key metadata (NOT the key itself) to diagnose malformed key errors
    console.log(`[Telnyx AI Assistant] API Key debug: raw_length=${rawApiKey?.length ?? 'null'}, clean_length=${apiKey?.length ?? 'null'}, starts_with=${apiKey?.substring(0, 4) ?? 'null'}, ends_with=${apiKey?.substring((apiKey?.length ?? 0) - 4) ?? 'null'}`);
    
    if (!apiKey && !['list_assistants', 'health_check', 'list_voices', 'list_models'].includes(action)) {
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
          call_direction,
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
          model: normalizeTelnyxModelId(model || 'Qwen/Qwen3-235B-A22B'),
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
          telnyxPayload.fallback_model = normalizeTelnyxModelId(fallback_model);
        }
        if (insight_group_id) {
          telnyxPayload.insight_settings = { insight_group_id };
        }

        // Build tools - ALWAYS include calendar tool
        const userTools = (tools && Array.isArray(tools)) ? tools.map(buildToolConfig) : [];
        telnyxPayload.tools = ensureCalendarTools(userTools, supabaseUrl, serviceRoleKey, userId);

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
            call_direction: call_direction || 'outbound',
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
        // Accumulate metadata changes properly — spread from existing, then merge all updates
        const metadataUpdate: any = { ...(existing.metadata || {}) };

        for (const [key, value] of Object.entries(updateFields)) {
          switch (key) {
            case 'name':
            case 'description':
            case 'model':
            case 'instructions':
            case 'greeting':
            case 'fallback_model':
              telnyxUpdate[key] = value;
              dbUpdate[key] = value;
              break;
            case 'voice':
              telnyxUpdate.voice_settings = { ...(telnyxUpdate.voice_settings || {}), voice: value };
              dbUpdate.voice = value;
              break;
            case 'voice_speed':
              telnyxUpdate.voice_settings = { ...(telnyxUpdate.voice_settings || {}), speed: value };
              metadataUpdate.voice_speed = value;
              break;
            case 'voice_provider':
              telnyxUpdate.voice_settings = { ...(telnyxUpdate.voice_settings || {}), provider: value };
              metadataUpdate.voice_provider = value;
              break;
            case 'voice_model':
              telnyxUpdate.voice_settings = { ...(telnyxUpdate.voice_settings || {}), model: value };
              metadataUpdate.voice_model = value;
              break;
            case 'transcription_model':
              telnyxUpdate.transcription = { model: value };
              dbUpdate.transcription_model = value;
              break;
            case 'end_of_turn_threshold':
              telnyxUpdate.transcription = { ...(telnyxUpdate.transcription || {}), end_of_turn_threshold: value };
              metadataUpdate.end_of_turn_threshold = value;
              break;
            case 'end_of_turn_timeout_ms':
              telnyxUpdate.transcription = { ...(telnyxUpdate.transcription || {}), end_of_turn_timeout_ms: value };
              metadataUpdate.end_of_turn_timeout_ms = value;
              break;
            case 'eager_end_of_turn_threshold':
              telnyxUpdate.transcription = { ...(telnyxUpdate.transcription || {}), eager_end_of_turn_threshold: value };
              metadataUpdate.eager_end_of_turn_threshold = value;
              break;
            case 'noise_suppression':
              telnyxUpdate.noise_suppression = value;
              metadataUpdate.noise_suppression = value;
              break;
            case 'background_audio':
              telnyxUpdate.background_audio = value;
              metadataUpdate.background_audio = value;
              break;
            case 'speaking_plan':
              telnyxUpdate.speaking_plan = value;
              metadataUpdate.speaking_plan = value;
              break;
            case 'tools': {
              const mappedTools = (value as any[]).map(buildToolConfig);
              telnyxUpdate.tools = ensureCalendarTools(mappedTools, supabaseUrl, serviceRoleKey, userId);
              dbUpdate.tools = value;
              break;
            }
            case 'status':
              dbUpdate.status = value;
              break;
            case 'dynamic_variables':
              telnyxUpdate.dynamic_variables = value;
              dbUpdate.dynamic_variables = value;
              break;
            case 'max_call_duration_seconds':
              telnyxUpdate.telephony_settings = { ...(telnyxUpdate.telephony_settings || {}), max_call_duration_seconds: value };
              metadataUpdate.max_call_duration_seconds = value;
              break;
            case 'user_idle_timeout_seconds':
              telnyxUpdate.telephony_settings = { ...(telnyxUpdate.telephony_settings || {}), user_idle_timeout_seconds: value };
              metadataUpdate.user_idle_timeout_seconds = value;
              break;
            case 'amd_settings':
              telnyxUpdate.amd_settings = value;
              metadataUpdate.amd_settings = value;
              break;
            case 'recording_settings':
              telnyxUpdate.recording_settings = value;
              metadataUpdate.recording_settings = value;
              break;
            case 'greeting_mode':
              telnyxUpdate.greeting_mode = value;
              metadataUpdate.greeting_mode = value;
              break;
            case 'enabled_features':
              telnyxUpdate.enabled_features = value;
              dbUpdate.enabled_features = value;
              break;
            case 'call_direction':
              dbUpdate.call_direction = value;
              break;
            case 'temperature':
              telnyxUpdate.temperature = value;
              metadataUpdate.temperature = value;
              break;
            case 'max_tokens':
              telnyxUpdate.max_tokens = value;
              metadataUpdate.max_tokens = value;
              break;
            case 'interrupt_sensitivity':
              telnyxUpdate.interrupt_sensitivity = value;
              metadataUpdate.interrupt_sensitivity = value;
              break;
            case 'silence_timeout_ms':
              telnyxUpdate.silence_timeout_ms = value;
              metadataUpdate.silence_timeout_ms = value;
              break;
            case 'llm_api_key_ref':
              telnyxUpdate.llm_api_key_ref = value;
              metadataUpdate.llm_api_key_ref = value;
              break;
            case 'voice_api_key_ref':
              telnyxUpdate.voice_settings = { ...(telnyxUpdate.voice_settings || {}), api_key_ref: value };
              metadataUpdate.voice_api_key_ref = value;
              break;
            case 'messaging': {
              const msgVal = value as any;
              if (msgVal?.enabled !== undefined) {
                metadataUpdate.messaging = msgVal;
              }
              break;
            }
            case 'widget': {
              const widVal = value as any;
              if (widVal?.enabled !== undefined) {
                metadataUpdate.widget = widVal;
              }
              break;
            }
          }
        }

        // Apply accumulated metadata updates to dbUpdate
        dbUpdate.metadata = metadataUpdate;

        // Normalize model ID for Telnyx API (e.g. "gpt-4.1" → "openai/gpt-4.1")
        if (telnyxUpdate.model) {
          telnyxUpdate.model = normalizeTelnyxModelId(telnyxUpdate.model);
        }
        if (telnyxUpdate.fallback_model) {
          telnyxUpdate.fallback_model = normalizeTelnyxModelId(telnyxUpdate.fallback_model);
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

        // Resolve assigned phone number IDs to actual phone numbers
        const allPhoneIds = (assistants || []).flatMap((a: any) => a.assigned_phone_number_ids || []).filter(Boolean);
        let phoneMap: Record<string, string> = {};
        if (allPhoneIds.length > 0) {
          const { data: phones } = await supabaseAdmin
            .from('phone_numbers')
            .select('id, number')
            .in('id', allPhoneIds);
          if (phones) {
            for (const p of phones) {
              phoneMap[p.id] = p.number;
            }
          }
        }

        const enriched = (assistants || []).map((a: any) => ({
          ...a,
          assigned_phone_numbers: (a.assigned_phone_number_ids || [])
            .map((id: string) => phoneMap[id])
            .filter(Boolean),
        }));

        result = { assistants: enriched };
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
      // SYNC ASSISTANTS (Telnyx → local DB) + phone number mapping
      // ================================================================
      case 'sync_assistants': {
        const listRes = await telnyxFetch('/ai/assistants?page[size]=250', apiKey!);
        if (!listRes.ok) throw new Error(`Telnyx API error: ${listRes.error}`);

        const telnyxAssistants = listRes.data.data || [];
        let synced = 0;
        const texmlToPhones: Record<string, string[]> = {};

        // Build TeXML app ID → local phone_numbers.id map from active Telnyx numbers
        try {
          const { data: localPhones } = await supabaseAdmin
            .from('phone_numbers')
            .select('id, number')
            .eq('user_id', userId);

          if (localPhones) {
            const phoneListRes = await telnyxFetch('/phone_numbers?page[size]=250&filter[status]=active', apiKey!);
            if (phoneListRes.ok) {
              const telnyxPhones = phoneListRes.data.data || [];
              for (const tp of telnyxPhones) {
                const e164 = tp.phone_number; // Telnyx returns E.164
                const localMatch = localPhones.find((lp: any) => lp.number === e164);
                if (localMatch) {
                  const connId = tp.connection_id;
                  if (connId) {
                    if (!texmlToPhones[connId]) texmlToPhones[connId] = [];
                    texmlToPhones[connId].push(localMatch.id); // Store LOCAL id
                  }
                }
              }
            }
          }
        } catch (e) {
          console.warn('⚠️ Could not fetch phone numbers for sync:', e);
        }

        for (const ta of telnyxAssistants) {
          const telnyxId = ta.assistant_id || ta.id;

          // Pull full assistant payload so sync reflects exact portal config (model/voice/tools/etc)
          let fullAssistant = ta;
          if (telnyxId) {
            const detailRes = await telnyxFetch(`/ai/assistants/${telnyxId}`, apiKey!);
            if (detailRes.ok && detailRes.data?.data) {
              fullAssistant = detailRes.data.data;
            }
          }

          const texmlAppId = fullAssistant.telephony_settings?.default_texml_app_id || ta.telephony_settings?.default_texml_app_id;

          // Find phone numbers assigned to this assistant's TeXML app
          const assignedPhoneIds = texmlAppId ? (texmlToPhones[texmlAppId] || []) : [];
          const resolvedModel = fullAssistant.model || ta.model || 'Qwen/Qwen3-235B-A22B';
          const resolvedVoice = fullAssistant.voice_settings?.voice || ta.voice_settings?.voice || 'Telnyx.NaturalHD.Ava';
          const resolvedInstructions = fullAssistant.instructions || ta.instructions || '';
          const resolvedGreeting = fullAssistant.greeting || ta.greeting || null;
          const resolvedTools = fullAssistant.tools || ta.tools || [];

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
                name: fullAssistant.name || ta.name,
                model: resolvedModel,
                instructions: resolvedInstructions,
                greeting: resolvedGreeting,
                voice: resolvedVoice,
                tools: resolvedTools,
                telnyx_texml_app_id: texmlAppId || undefined,
                telnyx_messaging_profile_id: fullAssistant.messaging_settings?.default_messaging_profile_id || ta.messaging_settings?.default_messaging_profile_id || undefined,
                assigned_phone_number_ids: assignedPhoneIds.length > 0 ? assignedPhoneIds : undefined,
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
                telnyx_texml_app_id: texmlAppId,
                telnyx_messaging_profile_id: fullAssistant.messaging_settings?.default_messaging_profile_id || ta.messaging_settings?.default_messaging_profile_id,
                name: fullAssistant.name || ta.name || 'Imported Assistant',
                model: resolvedModel,
                instructions: resolvedInstructions,
                greeting: resolvedGreeting,
                voice: resolvedVoice,
                tools: resolvedTools,
                status: 'active',
                assigned_phone_number_ids: assignedPhoneIds,
                metadata: { imported_from: 'telnyx_sync', telnyx_response: fullAssistant },
              });
          }
          // Push calendar tools to this assistant on Telnyx if missing
          const currentTools = resolvedTools;
           const hasCalendar = currentTools.some((t: any) => t.name === 'book_appointment' || t.webhook?.name === 'book_appointment');
          if (!hasCalendar) {
            const updatedTools = ensureCalendarTools([...currentTools], supabaseUrl, serviceRoleKey, userId);
            const toolPushRes = await telnyxFetch(
              `/ai/assistants/${telnyxId}`, apiKey!, 'POST',
              { tools: updatedTools }
            );
            if (toolPushRes.ok) {
              console.log(`[Sync] ✅ Pushed calendar tool to ${fullAssistant.name || ta.name}`);
            } else {
              console.warn(`[Sync] ⚠️ Failed to push calendar tool to ${fullAssistant.name || ta.name}: ${toolPushRes.error}`);
            }
          }
          synced++;
        }

        result = { synced, total_on_telnyx: telnyxAssistants.length };
        break;
      }

      // ================================================================
      // PROVISION CALENDAR TOOLS (push to all existing assistants)
      // ================================================================
      case 'provision_calendar_tools': {
        const { data: assistants } = await supabaseAdmin
          .from('telnyx_assistants')
          .select('id, name, telnyx_assistant_id, tools')
          .eq('user_id', userId)
          .eq('status', 'active');

        let provisioned = 0;
        const results: any[] = [];

        for (const asst of (assistants || [])) {
          if (!asst.telnyx_assistant_id) continue;

          // Get current tools from Telnyx
          const getRes = await telnyxFetch(`/ai/assistants/${asst.telnyx_assistant_id}`, apiKey!);
          if (!getRes.ok) {
            results.push({ name: asst.name, status: 'error', error: getRes.error });
            continue;
          }

          const currentTools = getRes.data.data?.tools || [];
          const hasCalendar = currentTools.some((t: any) => t.name === 'book_appointment' || t.webhook?.name === 'book_appointment');

          if (hasCalendar) {
            results.push({ name: asst.name, status: 'already_has_tools' });
            continue;
          }

          const updatedTools = ensureCalendarTools([...currentTools], supabaseUrl, serviceRoleKey, userId);
          const pushRes = await telnyxFetch(
            `/ai/assistants/${asst.telnyx_assistant_id}`, apiKey!, 'POST',
            { tools: updatedTools }
          );

          if (pushRes.ok) {
            provisioned++;
            results.push({ name: asst.name, status: 'provisioned' });
            // Update local DB
            await supabaseAdmin
              .from('telnyx_assistants')
              .update({ tools: updatedTools, updated_at: new Date().toISOString() })
              .eq('id', asst.id);
          } else {
            results.push({ name: asst.name, status: 'error', error: pushRes.error });
          }
        }

        result = { provisioned, total: assistants?.length || 0, details: results };
        break;
      }

      // ================================================================
      // PUSH CALENDAR TOOL (single assistant)
      // ================================================================
      case 'push_calendar_tool': {
        const { assistant_id } = params;
        if (!assistant_id) throw new Error('assistant_id is required');

        const { data: asst } = await supabaseAdmin
          .from('telnyx_assistants')
          .select('id, name, telnyx_assistant_id, tools')
          .eq('id', assistant_id)
          .eq('user_id', userId)
          .maybeSingle();

        if (!asst) throw new Error('Assistant not found');
        if (!asst.telnyx_assistant_id) throw new Error('Assistant has no Telnyx ID — sync first');

        // Fetch current tools from Telnyx API (source of truth)
        const getRes = await telnyxFetch(`/ai/assistants/${asst.telnyx_assistant_id}`, apiKey!);
        if (!getRes.ok) throw new Error(`Failed to fetch from Telnyx: ${getRes.error}`);

        const currentTools = getRes.data.data?.tools || [];
        const hasCalendar = currentTools.some((t: any) => t.name === 'book_appointment' || t.webhook?.name === 'book_appointment');

        if (hasCalendar) {
          await supabaseAdmin
            .from('telnyx_assistants')
            .update({ tools: currentTools, updated_at: new Date().toISOString() })
            .eq('id', asst.id);
          result = { status: 'already_present', assistant: asst.name };
          break;
        }

        const updatedTools = ensureCalendarTools([...currentTools], supabaseUrl, serviceRoleKey, userId);
        const pushRes = await telnyxFetch(
          `/ai/assistants/${asst.telnyx_assistant_id}`, apiKey!, 'POST',
          { tools: updatedTools }
        );

        if (!pushRes.ok) throw new Error(`Push failed: ${pushRes.error}`);

        await supabaseAdmin
          .from('telnyx_assistants')
          .update({ tools: updatedTools, updated_at: new Date().toISOString() })
          .eq('id', asst.id);

        result = { status: 'provisioned', assistant: asst.name, tools_count: updatedTools.length };
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
        // Fetch live models from Telnyx API + include OpenAI/Anthropic aliases used in portal configs
        let telnyxModels: any[] = [];

        if (apiKey) {
          const modelsRes = await telnyxFetch('/ai/models', apiKey);
          if (modelsRes.ok) {
            telnyxModels = (modelsRes.data?.data || []).map((m: any) => {
              const modelId = m.id || '';
              const provider = m.owned_by || modelId.split('/')[0] || 'Unknown';
              const nameBase = modelId.split('/').pop() || modelId;
              return {
                id: modelId,
                name: nameBase.replace(/[-_]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
                provider,
                cost: 'Included with Telnyx',
                recommended: /qwen3|llama-3\.1-70b/i.test(modelId),
              };
            });
          } else {
            console.warn('Failed to fetch Telnyx model list:', modelsRes.error);
          }
        }

        // Include both prefixed and unprefixed IDs to match what users configure in portal/custom LLM flows
        const aliasModels = [
          { id: 'openai/gpt-4.1', name: 'GPT-4.1', provider: 'OpenAI', cost: 'Requires API key' },
          { id: 'gpt-4.1', name: 'GPT-4.1 (Legacy ID)', provider: 'OpenAI', cost: 'Requires API key' },
          { id: 'openai/gpt-4.1-mini', name: 'GPT-4.1 Mini', provider: 'OpenAI', cost: 'Requires API key' },
          { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini (Legacy ID)', provider: 'OpenAI', cost: 'Requires API key' },
          { id: 'openai/gpt-4.1-nano', name: 'GPT-4.1 Nano', provider: 'OpenAI', cost: 'Requires API key' },
          { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano (Legacy ID)', provider: 'OpenAI', cost: 'Requires API key' },
          { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'OpenAI', cost: 'Requires API key' },
          { id: 'gpt-4o', name: 'GPT-4o (Legacy ID)', provider: 'OpenAI', cost: 'Requires API key' },
          { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI', cost: 'Requires API key' },
          { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Legacy ID)', provider: 'OpenAI', cost: 'Requires API key' },
          { id: 'openai/o4-mini', name: 'o4-mini', provider: 'OpenAI', cost: 'Requires API key' },
          { id: 'o4-mini', name: 'o4-mini (Legacy ID)', provider: 'OpenAI', cost: 'Requires API key' },
          { id: 'anthropic/claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'Anthropic', cost: 'Requires API key' },
          { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4 (Legacy ID)', provider: 'Anthropic', cost: 'Requires API key' },
          { id: 'anthropic/claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet', provider: 'Anthropic', cost: 'Requires API key' },
          { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet (Legacy ID)', provider: 'Anthropic', cost: 'Requires API key' },
          { id: 'anthropic/claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'Anthropic', cost: 'Requires API key' },
          { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet (Legacy ID)', provider: 'Anthropic', cost: 'Requires API key' },
        ];

        const seen = new Set<string>();
        const combined = [...telnyxModels, ...aliasModels].filter((m: any) => {
          const key = (m.id || '').toLowerCase();
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        result = { models: combined };
        break;
      }

      // ================================================================
      // LIST VOICES
      // ================================================================
      case 'list_voices': {
        // Try fetching live voices from Telnyx API (includes ElevenLabs, etc.)
        let liveVoices: any[] = [];
        const voiceEndpoints = [
          '/ai/voices',
          '/ai/assistants/voices',
          '/voice/tts/voices',
          '/ai/tts/voices',
        ];

        if (apiKey) {
          for (const endpoint of voiceEndpoints) {
            const voicesRes = await telnyxFetch(endpoint, apiKey!);
            if (!voicesRes.ok) {
              console.warn('[Telnyx AI Assistant] Live voices fetch failed:', endpoint, voicesRes.status);
              continue;
            }

            const items = voicesRes.data?.data || voicesRes.data?.voices || voicesRes.data || [];
            if (!Array.isArray(items) || items.length === 0) continue;

            liveVoices = items.map((v: any) => {
              const id = v.id || v.voice_id || v.name;
              const provider = normalizeVoiceProvider(v.provider || v.tts_provider, id);
              return {
                id,
                name: v.display_name || v.name || humanizeVoiceId(id),
                provider,
                tier: v.tier || (provider === 'ElevenLabs' || provider === 'Telnyx NaturalHD' ? 'premium' : 'standard'),
                gender: v.gender || 'unknown',
              };
            }).filter((v: any) => !!v.id);

            if (liveVoices.length > 0) {
              console.log('[Telnyx AI Assistant] Loaded live voices from', endpoint, 'count=', liveVoices.length);
              break;
            }
          }
        }

        // Fallback from local assistants (ensures existing/older agent voices still appear)
        const { data: localRows } = await supabaseAdmin
          .from('telnyx_assistants')
          .select('voice, metadata')
          .eq('user_id', userId)
          .not('voice', 'is', null);

        const localVoices = Array.from(new Map(
          (localRows || [])
            .filter((r: any) => !!r.voice)
            .map((r: any) => {
              const provider = normalizeVoiceProvider(
                r?.metadata?.voice_provider || r?.metadata?.telnyx_response?.voice_settings?.provider,
                r.voice
              );
              return [
                String(r.voice).toLowerCase(),
                {
                  id: r.voice,
                  name: humanizeVoiceId(r.voice),
                  provider,
                  tier: provider === 'ElevenLabs' || provider === 'Telnyx NaturalHD' ? 'premium' : 'custom',
                  gender: 'unknown',
                },
              ];
            })
        ).values());

        // Static fallback list
        const staticVoices = [
          // Telnyx NaturalHD (Premium, $0.000012/char)
          { id: 'Telnyx.NaturalHD.Ava', name: 'Ava', provider: 'Telnyx NaturalHD', tier: 'premium', gender: 'female' },
          { id: 'Telnyx.NaturalHD.astra', name: 'Astra', provider: 'Telnyx NaturalHD', tier: 'premium', gender: 'female' },
          { id: 'Telnyx.NaturalHD.Estelle', name: 'Estelle (Estrella)', provider: 'Telnyx NaturalHD', tier: 'premium', gender: 'female' },
          { id: 'Telnyx.NaturalHD.andersen_johan', name: 'Johan', provider: 'Telnyx NaturalHD', tier: 'premium', gender: 'male' },
          { id: 'Telnyx.NaturalHD.Celeste', name: 'Celeste', provider: 'Telnyx NaturalHD', tier: 'premium', gender: 'female' },
          { id: 'Telnyx.NaturalHD.Luna', name: 'Luna', provider: 'Telnyx NaturalHD', tier: 'premium', gender: 'female' },
          { id: 'Telnyx.NaturalHD.Valentina', name: 'Valentina', provider: 'Telnyx NaturalHD', tier: 'premium', gender: 'female' },
          { id: 'Telnyx.NaturalHD.Aurora', name: 'Aurora', provider: 'Telnyx NaturalHD', tier: 'premium', gender: 'female' },
          { id: 'Telnyx.NaturalHD.Marcus', name: 'Marcus', provider: 'Telnyx NaturalHD', tier: 'premium', gender: 'male' },
          { id: 'Telnyx.NaturalHD.Atlas', name: 'Atlas', provider: 'Telnyx NaturalHD', tier: 'premium', gender: 'male' },
          // Telnyx Natural (Enhanced)
          { id: 'Telnyx.Natural.abbie', name: 'Abbie', provider: 'Telnyx Natural', tier: 'enhanced', gender: 'female' },
          { id: 'Telnyx.Natural.amanda', name: 'Amanda', provider: 'Telnyx Natural', tier: 'enhanced', gender: 'female' },
          { id: 'Telnyx.Natural.chloe', name: 'Chloe', provider: 'Telnyx Natural', tier: 'enhanced', gender: 'female' },
          { id: 'Telnyx.Natural.diana', name: 'Diana', provider: 'Telnyx Natural', tier: 'enhanced', gender: 'female' },
          { id: 'Telnyx.Natural.james', name: 'James', provider: 'Telnyx Natural', tier: 'enhanced', gender: 'male' },
          { id: 'Telnyx.Natural.oliver', name: 'Oliver', provider: 'Telnyx Natural', tier: 'enhanced', gender: 'male' },
          // KokoroTTS — American Female
          { id: 'Telnyx.KokoroTTS.af_alloy', name: 'Alloy', provider: 'KokoroTTS', tier: 'basic', gender: 'female' },
          { id: 'Telnyx.KokoroTTS.af_aoede', name: 'Aoede', provider: 'KokoroTTS', tier: 'basic', gender: 'female' },
          { id: 'Telnyx.KokoroTTS.af_bella', name: 'Bella', provider: 'KokoroTTS', tier: 'basic', gender: 'female' },
          { id: 'Telnyx.KokoroTTS.af_heart', name: 'Heart', provider: 'KokoroTTS', tier: 'basic', gender: 'female' },
          { id: 'Telnyx.KokoroTTS.af_jessica', name: 'Jessica', provider: 'KokoroTTS', tier: 'basic', gender: 'female' },
          { id: 'Telnyx.KokoroTTS.af_kore', name: 'Kore', provider: 'KokoroTTS', tier: 'basic', gender: 'female' },
          { id: 'Telnyx.KokoroTTS.af_nicole', name: 'Nicole', provider: 'KokoroTTS', tier: 'basic', gender: 'female' },
          { id: 'Telnyx.KokoroTTS.af_nova', name: 'Nova', provider: 'KokoroTTS', tier: 'basic', gender: 'female' },
          { id: 'Telnyx.KokoroTTS.af_river', name: 'River', provider: 'KokoroTTS', tier: 'basic', gender: 'female' },
          { id: 'Telnyx.KokoroTTS.af_sarah', name: 'Sarah', provider: 'KokoroTTS', tier: 'basic', gender: 'female' },
          { id: 'Telnyx.KokoroTTS.af_sky', name: 'Sky', provider: 'KokoroTTS', tier: 'basic', gender: 'female' },
          // KokoroTTS — American Male
          { id: 'Telnyx.KokoroTTS.am_adam', name: 'Adam', provider: 'KokoroTTS', tier: 'basic', gender: 'male' },
          { id: 'Telnyx.KokoroTTS.am_echo', name: 'Echo', provider: 'KokoroTTS', tier: 'basic', gender: 'male' },
          { id: 'Telnyx.KokoroTTS.am_eric', name: 'Eric', provider: 'KokoroTTS', tier: 'basic', gender: 'male' },
          { id: 'Telnyx.KokoroTTS.am_fenrir', name: 'Fenrir', provider: 'KokoroTTS', tier: 'basic', gender: 'male' },
          { id: 'Telnyx.KokoroTTS.am_liam', name: 'Liam', provider: 'KokoroTTS', tier: 'basic', gender: 'male' },
          { id: 'Telnyx.KokoroTTS.am_michael', name: 'Michael', provider: 'KokoroTTS', tier: 'basic', gender: 'male' },
          { id: 'Telnyx.KokoroTTS.am_onyx', name: 'Onyx', provider: 'KokoroTTS', tier: 'basic', gender: 'male' },
          { id: 'Telnyx.KokoroTTS.am_puck', name: 'Puck', provider: 'KokoroTTS', tier: 'basic', gender: 'male' },
          // KokoroTTS — British
          { id: 'Telnyx.KokoroTTS.bf_alice', name: 'Alice (British)', provider: 'KokoroTTS', tier: 'basic', gender: 'female' },
          { id: 'Telnyx.KokoroTTS.bf_emma', name: 'Emma (British)', provider: 'KokoroTTS', tier: 'basic', gender: 'female' },
          { id: 'Telnyx.KokoroTTS.bm_george', name: 'George (British)', provider: 'KokoroTTS', tier: 'basic', gender: 'male' },
          { id: 'Telnyx.KokoroTTS.bm_daniel', name: 'Daniel (British)', provider: 'KokoroTTS', tier: 'basic', gender: 'male' },
          // AWS Polly Neural
          { id: 'AWS.Polly.Joanna-Neural', name: 'Joanna', provider: 'AWS Polly', tier: 'neural', gender: 'female' },
          { id: 'AWS.Polly.Matthew-Neural', name: 'Matthew', provider: 'AWS Polly', tier: 'neural', gender: 'male' },
          { id: 'AWS.Polly.Salli-Neural', name: 'Salli', provider: 'AWS Polly', tier: 'neural', gender: 'female' },
          { id: 'AWS.Polly.Joey-Neural', name: 'Joey', provider: 'AWS Polly', tier: 'neural', gender: 'male' },
          { id: 'AWS.Polly.Kendra-Neural', name: 'Kendra', provider: 'AWS Polly', tier: 'neural', gender: 'female' },
          // Azure Neural
          { id: 'Azure.en-US-JennyNeural', name: 'Jenny', provider: 'Azure', tier: 'neural', gender: 'female' },
          { id: 'Azure.en-US-GuyNeural', name: 'Guy', provider: 'Azure', tier: 'neural', gender: 'male' },
          { id: 'Azure.en-US-AriaNeural', name: 'Aria', provider: 'Azure', tier: 'neural', gender: 'female' },
          { id: 'Azure.en-US-DavisNeural', name: 'Davis', provider: 'Azure', tier: 'neural', gender: 'male' },
          // ── ElevenLabs Premade Voices (Top Sales / Conversational) ──
          // Female — Conversational / Sales
          { id: 'ElevenLabs.21m00Tcm4TlvDq8ikWAM', name: 'Rachel', provider: 'ElevenLabs', tier: 'premium', gender: 'female' },
          { id: 'ElevenLabs.EXAVITQu4vr4xnSDxMaL', name: 'Sarah', provider: 'ElevenLabs', tier: 'premium', gender: 'female' },
          { id: 'ElevenLabs.LcfcDJNUP1GQjkzn1xUU', name: 'Emily', provider: 'ElevenLabs', tier: 'premium', gender: 'female' },
          { id: 'ElevenLabs.oWAxZDx7w5VEj9dCyTzz', name: 'Grace', provider: 'ElevenLabs', tier: 'premium', gender: 'female' },
          { id: 'ElevenLabs.XB0fDUnXU5powFXDhCwa', name: 'Charlotte', provider: 'ElevenLabs', tier: 'premium', gender: 'female' },
          { id: 'ElevenLabs.Xb7hH8MSUJpSbSDYk0k2', name: 'Alice', provider: 'ElevenLabs', tier: 'premium', gender: 'female' },
          { id: 'ElevenLabs.jsCqWAovK2LkecY7zXl4', name: 'Freya', provider: 'ElevenLabs', tier: 'premium', gender: 'female' },
          { id: 'ElevenLabs.ThT5KcBeYPX3keUQqHPh', name: 'Dorothy', provider: 'ElevenLabs', tier: 'premium', gender: 'female' },
          { id: 'ElevenLabs.AZnzlk1XvdvUeBnXmlld', name: 'Domi', provider: 'ElevenLabs', tier: 'premium', gender: 'female' },
          { id: 'ElevenLabs.MF3mGyEYCl7XYWbV9V6O', name: 'Elli', provider: 'ElevenLabs', tier: 'premium', gender: 'female' },
          { id: 'ElevenLabs.jBpfuIE2acCO8z3wKNLl', name: 'Lily', provider: 'ElevenLabs', tier: 'premium', gender: 'female' },
          { id: 'ElevenLabs.z9fAnlkpzviPz146aGWa', name: 'Glinda', provider: 'ElevenLabs', tier: 'premium', gender: 'female' },
          { id: 'ElevenLabs.XrExE9yKIg1WjnnlVkGX', name: 'Matilda', provider: 'ElevenLabs', tier: 'premium', gender: 'female' },
          { id: 'ElevenLabs.pFZP5JQG7iQjIQuC4Bku', name: 'Lily (British)', provider: 'ElevenLabs', tier: 'premium', gender: 'female' },
          // Male — Conversational / Sales
          { id: 'ElevenLabs.JBFqnCBsd6RMkjVDRZzb', name: 'George', provider: 'ElevenLabs', tier: 'premium', gender: 'male' },
          { id: 'ElevenLabs.pNInz6obpgDQGcFmaJgB', name: 'Adam', provider: 'ElevenLabs', tier: 'premium', gender: 'male' },
          { id: 'ElevenLabs.nPczCjzI2devNBz1zQrb', name: 'Brian', provider: 'ElevenLabs', tier: 'premium', gender: 'male' },
          { id: 'ElevenLabs.onwK4e9ZLuTAKqWW03F9', name: 'Daniel', provider: 'ElevenLabs', tier: 'premium', gender: 'male' },
          { id: 'ElevenLabs.29vD33N1CtxCmqQRPOHJ', name: 'Drew', provider: 'ElevenLabs', tier: 'premium', gender: 'male' },
          { id: 'ElevenLabs.SOYHLrjzK2X1ezoPC6cr', name: 'Dave', provider: 'ElevenLabs', tier: 'premium', gender: 'male' },
          { id: 'ElevenLabs.N2lVS1w4EtoT3dr4eOWO', name: 'Callum', provider: 'ElevenLabs', tier: 'premium', gender: 'male' },
          { id: 'ElevenLabs.IKne3meq5aSn9XLyUdCD', name: 'Charlie', provider: 'ElevenLabs', tier: 'premium', gender: 'male' },
          { id: 'ElevenLabs.pqHfZKP75CvOlQylNhV4', name: 'Bill', provider: 'ElevenLabs', tier: 'premium', gender: 'male' },
          { id: 'ElevenLabs.VR6AewLTigWG4xSOukaG', name: 'Arnold', provider: 'ElevenLabs', tier: 'premium', gender: 'male' },
          { id: 'ElevenLabs.TxGEqnHWrfWFTfGW9XjX', name: 'Josh', provider: 'ElevenLabs', tier: 'premium', gender: 'male' },
          { id: 'ElevenLabs.TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', provider: 'ElevenLabs', tier: 'premium', gender: 'male' },
          { id: 'ElevenLabs.iP95p4xoKVk53GoZ742B', name: 'Chris', provider: 'ElevenLabs', tier: 'premium', gender: 'male' },
          { id: 'ElevenLabs.ErXwobaYiN019PkySvjV', name: 'Antoni', provider: 'ElevenLabs', tier: 'premium', gender: 'male' },
          // Eryn — Hyper Real / Natural Conversational
          { id: 'ElevenLabs.dMyQqiVXTU80dDl2eNK8', name: 'Eryn (Natural Conversational)', provider: 'ElevenLabs', tier: 'premium', gender: 'female' },
          { id: 'ElevenLabs.dj3G1R1ilKoFKhBnWOzG', name: 'Eryn (Southern Casual)', provider: 'ElevenLabs', tier: 'premium', gender: 'female' },
        ];

        // Merge: live voices, then locally-known voices, then static fallback (dedup by id)
        const seenIds = new Set<string>();
        const merged: any[] = [];
        for (const source of [liveVoices, localVoices, staticVoices]) {
          for (const voice of source) {
            const id = String(voice?.id || '').trim();
            if (!id) continue;
            const key = id.toLowerCase();
            if (seenIds.has(key)) continue;
            seenIds.add(key);
            merged.push(voice);
          }
        }

        result = { voices: merged };
        break;
      }

      // ================================================================
      // PREVIEW VOICE — Generate a short TTS sample via Telnyx API
      // ================================================================
      case 'preview_voice': {
        const { voice_id, text } = params;
        if (!voice_id || !text) throw new Error('voice_id and text required');

        const sampleText = (text as string).slice(0, 200);

        try {
          const ttsResp = await fetch('https://api.telnyx.com/v2/ai/generate', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              text: sampleText,
              voice: voice_id,
              output_format: 'mp3',
            }),
          });

          if (ttsResp.ok) {
            const audioBuffer = await ttsResp.arrayBuffer();
            const uint8 = new Uint8Array(audioBuffer);
            // Manual base64 encoding for Deno
            let binary = '';
            for (let i = 0; i < uint8.length; i++) {
              binary += String.fromCharCode(uint8[i]);
            }
            const base64 = btoa(binary);
            result = { audio_base64: base64 };
          } else {
            const errText = await ttsResp.text();
            console.warn('[Telnyx AI Assistant] TTS preview failed:', ttsResp.status, errText);
            // Fallback: just confirm voice is valid
            result = { preview_unavailable: true, message: 'Voice set successfully. Preview via live test call.', voice_id };
          }
        } catch (ttsErr: any) {
          console.warn('[Telnyx AI Assistant] TTS preview error:', ttsErr.message);
          result = { preview_unavailable: true, message: 'Preview unavailable. Voice ID saved — test with a live call.' };
        }
        break;
      }

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

        // Get the phone number from local DB
        const { data: phoneNumber } = await supabaseAdmin
          .from('phone_numbers')
          .select('id, number')
          .eq('id', phone_number_id)
          .single();

        if (!phoneNumber) throw new Error('Phone number not found in local database. Sync your numbers first.');

        // Check if this number is already assigned to ANOTHER assistant
        const { data: conflictingAssistants } = await supabaseAdmin
          .from('telnyx_assistants')
          .select('id, name, assigned_phone_number_ids')
          .eq('user_id', userId)
          .eq('status', 'active')
          .neq('id', assistant_id)
          .contains('assigned_phone_number_ids', [phone_number_id]);

        if (conflictingAssistants && conflictingAssistants.length > 0) {
          const conflictNames = conflictingAssistants.map((a: any) => a.name).join(', ');
          throw new Error(`This number is already assigned to: ${conflictNames}. Unassign it first to avoid routing conflicts.`);
        }

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

        result = { assigned: true, phone_number: phoneNumber.number };
        break;
      }

      // ================================================================
      // UNASSIGN NUMBER
      // ================================================================
      case 'unassign_number': {
        const { assistant_id: unassignAstId, phone_number_id: unassignPhId } = params;
        if (!unassignAstId || !unassignPhId) throw new Error('assistant_id and phone_number_id required');

        const { data: unassignAst } = await supabaseAdmin
          .from('telnyx_assistants')
          .select('assigned_phone_number_ids')
          .eq('id', unassignAstId)
          .eq('user_id', userId)
          .single();

        if (!unassignAst) throw new Error('Assistant not found');

        const updatedIds = (unassignAst.assigned_phone_number_ids || []).filter((pid: string) => pid !== unassignPhId);

        await supabaseAdmin
          .from('telnyx_assistants')
          .update({
            assigned_phone_number_ids: updatedIds,
            updated_at: new Date().toISOString(),
          })
          .eq('id', unassignAstId);

        result = { unassigned: true };
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

      // ================================================================
      // TEST CALL - Have the assistant call a phone number
      // ================================================================
      case 'test_call': {
        const { assistant_id, to_number, from_number, dynamic_variables: dynVars } = params;
        if (!assistant_id) throw new Error('assistant_id is required');
        if (!to_number) throw new Error('to_number is required — enter the phone number to call');

        // Get assistant from DB
        const { data: testAssistant } = await supabaseAdmin
          .from('telnyx_assistants')
          .select('*')
          .eq('id', assistant_id)
          .eq('user_id', userId)
          .single();

        if (!testAssistant) throw new Error('Assistant not found');
        if (!testAssistant.telnyx_assistant_id) throw new Error('Assistant not synced to Telnyx yet');

        // ── Pre-call diagnostic: fetch full assistant config from Telnyx ──
        const diagRes = await telnyxFetch(`/ai/assistants/${testAssistant.telnyx_assistant_id}`, apiKey!);
        if (!diagRes.ok) throw new Error('Could not retrieve assistant details from Telnyx for pre-call check');
        const assistantConfig = diagRes.data?.data || diagRes.data;

        const diagnosticWarnings: string[] = [];

        // Check voice / TTS
        const voiceSettings = assistantConfig?.voice_settings || assistantConfig?.voice;
        if (!voiceSettings?.voice) {
          diagnosticWarnings.push('❌ No TTS voice configured — the caller will not hear the AI speak. Go to Voice tab and select a voice.');
        }

        // Check transcription / STT
        const transcription = assistantConfig?.transcription;
        if (!transcription?.provider && !transcription?.model) {
          diagnosticWarnings.push('❌ No STT/transcription configured — the AI cannot hear the caller. Enable transcription in Voice or Advanced settings.');
        }

        // Check telephony / TeXML app
        const telephonySettings = assistantConfig?.telephony_settings;
        const texmlId = telephonySettings?.default_texml_app_id || testAssistant.telnyx_texml_app_id;
        if (!texmlId) {
          throw new Error('No TeXML app found for this assistant. Ensure telephony is enabled in the Telnyx portal.');
        }

        // Check model
        if (!assistantConfig?.model) {
          diagnosticWarnings.push('⚠️ No LLM model set — the AI may not respond intelligently. Set a model in Advanced settings.');
        }

        // Check instructions
        if (!assistantConfig?.instructions || assistantConfig.instructions.length < 20) {
          diagnosticWarnings.push('⚠️ Instructions are very short or empty — the AI may not know what to say.');
        }

        // Update local DB with latest TeXML app ID if needed
        if (texmlId && texmlId !== testAssistant.telnyx_texml_app_id) {
          await supabaseAdmin.from('telnyx_assistants').update({ telnyx_texml_app_id: texmlId }).eq('id', assistant_id);
        }

        const finalTexmlId = texmlId;

        // If there are critical warnings (no voice or no STT), block the call
        const criticalIssues = diagnosticWarnings.filter(w => w.startsWith('❌'));
        if (criticalIssues.length > 0) {
          result = {
            success: false,
            diagnostic: true,
            warnings: diagnosticWarnings,
            critical_issues: criticalIssues,
            message: `Pre-call check FAILED — ${criticalIssues.length} critical issue(s) found that will cause no audio:\n\n${criticalIssues.join('\n')}\n\nFix these in the Telnyx portal or Voice tab before calling.`,
            assistant_config_snapshot: {
              voice: voiceSettings?.voice || null,
              transcription_provider: transcription?.provider || null,
              transcription_model: transcription?.model || null,
              model: assistantConfig?.model || null,
              texml_app_id: texmlId,
              has_instructions: !!(assistantConfig?.instructions && assistantConfig.instructions.length > 20),
            },
          };
          break;
        }

        console.log(`[Telnyx AI] Pre-call diagnostic passed (${diagnosticWarnings.length} warning(s)): ${diagnosticWarnings.join('; ') || 'all clear'}`);

        // Determine From number
        let callerNumber = from_number;
        if (!callerNumber) {
          // Try to get a Telnyx number from phone_numbers table
          const { data: phoneNum } = await supabaseAdmin
            .from('phone_numbers')
            .select('number')
            .eq('user_id', userId)
            .eq('provider', 'telnyx')
            .eq('status', 'active')
            .limit(1)
            .maybeSingle();
          callerNumber = phoneNum?.number;
        }
        if (!callerNumber) {
          throw new Error('No from_number provided and no active Telnyx numbers found. Purchase a Telnyx number first or provide a from_number.');
        }

        // Clean phone numbers to E.164
        const cleanTo = to_number.replace(/\D/g, '');
        const cleanFrom = callerNumber.replace(/\D/g, '');
        const formattedTo = cleanTo.startsWith('1') ? `+${cleanTo}` : `+1${cleanTo}`;
        const formattedFrom = cleanFrom.startsWith('1') ? `+${cleanFrom}` : `+1${cleanFrom}`;

        // ── Auto-lookup lead data from DB by the "to" phone number ──
        let leadVars: Record<string, string> = {};
        const phoneDigits = cleanTo.slice(-10);
        if (phoneDigits.length === 10) {
          const normalizedTo = cleanTo.startsWith('1') ? `+${cleanTo}` : `+1${cleanTo}`;
          const { data: leadRecord } = await supabaseAdmin
            .from('leads')
            .select('id, first_name, last_name, email, phone_number, company, lead_source, notes, tags, custom_fields, preferred_contact_time, timezone, address, city, state, zip_code, next_callback_at')
            .eq('user_id', userId)
            .or(`phone_number.eq.${normalizedTo},phone_number.eq.${cleanTo},phone_number.ilike.%${phoneDigits}%`)
            .limit(1)
            .maybeSingle();

          if (leadRecord) {
            const firstName = String(leadRecord.first_name || '');
            const lastName = String(leadRecord.last_name || '');
            const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'there';
            const tz = leadRecord.timezone || 'America/New_York';
            const currentTime = new Date().toLocaleString('en-US', {
              timeZone: tz, weekday: 'long', year: 'numeric', month: 'long',
              day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
            });

            leadVars = {
              current_time: currentTime,
              current_time_iso: new Date().toISOString(),
              current_timezone: tz,
              current_date_ymd: new Date().toLocaleDateString('en-CA', { timeZone: tz }),
              current_day_of_week: new Date().toLocaleDateString('en-US', { timeZone: tz, weekday: 'long' }),
              first_name: firstName,
              last_name: lastName,
              full_name: fullName,
              name: fullName,
              email: String(leadRecord.email || ''),
              phone: String(leadRecord.phone_number || normalizedTo),
              phone_number: String(leadRecord.phone_number || normalizedTo),
              company: String(leadRecord.company || ''),
              lead_source: String(leadRecord.lead_source || ''),
              notes: String(leadRecord.notes || ''),
              tags: Array.isArray(leadRecord.tags) ? (leadRecord.tags as string[]).join(', ') : '',
              preferred_contact_time: String(leadRecord.preferred_contact_time || ''),
              timezone: tz,
              address: String(leadRecord.address || ''),
              city: String(leadRecord.city || ''),
              state: String(leadRecord.state || ''),
              zip_code: String(leadRecord.zip_code || ''),
              full_address: [leadRecord.address, leadRecord.city, leadRecord.state, leadRecord.zip_code].filter(Boolean).join(', '),
              lead_id: leadRecord.id,
              user_id: userId,
            };

            // Include custom fields
            if (leadRecord.custom_fields && typeof leadRecord.custom_fields === 'object') {
              for (const [key, val] of Object.entries(leadRecord.custom_fields as Record<string, unknown>)) {
                leadVars[`custom_${key}`] = String(val ?? '');
              }
            }

            console.log(`[Telnyx AI] Test call: Found lead "${fullName}" (${leadRecord.id}) — injecting ${Object.keys(leadVars).length} variables`);
          } else {
            console.log(`[Telnyx AI] Test call: No lead found for ${formattedTo} — using manual variables only`);
          }
        }

        // Merge: lead DB data first, then manual overrides on top (manual wins)
        const mergedVars = { ...leadVars, ...(dynVars && typeof dynVars === 'object' ? dynVars : {}) };

        // Make the outbound AI call via TeXML
        const callPayload: any = {
          From: formattedFrom,
          To: formattedTo,
          AIAssistantId: testAssistant.telnyx_assistant_id,
        };

        // Include merged dynamic variables
        if (Object.keys(mergedVars).length > 0) {
          callPayload.AIAssistantDynamicVariables = mergedVars;
        }

        console.log(`[Telnyx AI] Test call: ${formattedFrom} → ${formattedTo} via TeXML ${finalTexmlId}`);

        const callRes = await telnyxFetch(
          `/texml/ai_calls/${finalTexmlId}`,
          apiKey!, 'POST', callPayload
        );

        if (!callRes.ok) {
          throw new Error(`Test call failed: ${callRes.error || JSON.stringify(callRes.data)}`);
        }

        const callData = callRes.data?.data || callRes.data;
        const hasLeadData = Object.keys(leadVars).length > 0;
        result = {
          success: true,
          call_sid: callData?.call_sid || callData?.sid,
          call_control_id: callData?.call_control_id,
          from: formattedFrom,
          to: formattedTo,
          assistant: testAssistant.name,
          lead_found: hasLeadData,
          variables_injected: Object.keys(mergedVars).length,
          message: hasLeadData
            ? `Test call initiated! Found lead "${mergedVars.full_name || mergedVars.first_name}" — injecting ${Object.keys(mergedVars).length} variables. Your phone should ring shortly.`
            : `Test call initiated! No lead found for ${formattedTo} — using manual variables only. Your phone should ring shortly.`,
          warnings: diagnosticWarnings.length > 0 ? diagnosticWarnings : undefined,
          assistant_config_snapshot: {
            voice: voiceSettings?.voice || null,
            transcription_provider: transcription?.provider || null,
            model: assistantConfig?.model || null,
          },
        };
        break;
      }

      // ================================================================
      // LIST AVAILABLE DYNAMIC VARIABLES (system + custom reference)
      // ================================================================
      case 'list_variables': {
        result = {
          system_variables: [
            { name: '{{telnyx_current_time}}', description: 'Current date and time in UTC', example: 'Monday, February 24 2025 04:04:15 PM UTC' },
            { name: '{{telnyx_conversation_channel}}', description: 'Channel type: phone_call, web_call, or sms_chat', example: 'phone_call' },
            { name: '{{telnyx_agent_target}}', description: 'Phone number or SIP URI of the agent', example: '+13128675309' },
            { name: '{{telnyx_end_user_target}}', description: 'Phone number or identifier of the person being called', example: '+15551234567' },
            { name: '{{telnyx_end_user_target_verified}}', description: 'Whether the end user number is verified (inbound only)', example: 'true' },
            { name: '{{call_control_id}}', description: 'Unique identifier for the call', example: 'v3:abc123...' },
          ],
          custom_variables: [
            { name: '{{first_name}}', description: 'Lead first name — injected via API call or dynamic vars webhook' },
            { name: '{{last_name}}', description: 'Lead last name' },
            { name: '{{full_name}}', description: 'Lead full name' },
            { name: '{{company}}', description: 'Company or business name' },
            { name: '{{lead_source}}', description: 'Where the lead came from' },
            { name: '{{current_time}}', description: 'Current time (from webhook)' },
            { name: '{{address}}', description: 'Lead address' },
            { name: '{{email}}', description: 'Lead email' },
            { name: '{{phone}}', description: 'Lead phone number' },
            { name: '{{utility_provider}}', description: 'Utility provider name' },
            { name: '{{appointment_time}}', description: 'Scheduled appointment time' },
            { name: '{{callback_reason}}', description: 'Why we are calling back' },
          ],
          how_it_works: {
            priority_order: [
              '1. AIAssistantDynamicVariables in outbound API call (highest priority)',
              '2. dynamic_variables_webhook_url — POST at conversation start, must respond in <1 second',
              '3. Default values set in assistant configuration (lowest priority)',
            ],
            webhook_url: `${supabaseUrl}/functions/v1/telnyx-dynamic-vars`,
            webhook_note: 'The dynamic vars webhook auto-loads lead data from your database using the phone number. No manual setup needed.',
          },
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
