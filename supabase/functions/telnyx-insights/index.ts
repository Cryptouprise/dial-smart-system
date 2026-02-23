/**
 * Telnyx Post-Call Insights Management
 *
 * Manages insight templates and insight groups that auto-analyze calls.
 *
 * Actions:
 *   create_template   - Create an insight template
 *   list_templates     - List user's insight templates
 *   delete_template    - Delete an insight template
 *   create_group       - Create an insight group
 *   assign_to_assistant - Assign insight group to assistant
 *   get_insights       - Get insights for a call/conversation
 *   list_insights      - List recent insights
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
    const apiKey = Deno.env.get('TELNYX_API_KEY');
    let result: any = {};

    switch (action) {
      // ================================================================
      // CREATE INSIGHT TEMPLATE
      // ================================================================
      case 'create_template': {
        const { name, instructions, json_schema, group_id } = params;
        if (!name || !instructions) throw new Error('name and instructions are required');

        // Save locally
        const { data: template, error } = await supabaseAdmin
          .from('telnyx_insight_templates')
          .insert({
            user_id: userId,
            name,
            instructions,
            json_schema: json_schema || null,
            telnyx_group_id: group_id || null,
          })
          .select()
          .single();

        if (error) throw error;
        result = { template };
        break;
      }

      // ================================================================
      // LIST TEMPLATES
      // ================================================================
      case 'list_templates': {
        const { data: templates } = await supabaseAdmin
          .from('telnyx_insight_templates')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        result = { templates: templates || [] };
        break;
      }

      // ================================================================
      // DELETE TEMPLATE
      // ================================================================
      case 'delete_template': {
        const { template_id } = params;
        if (!template_id) throw new Error('template_id required');

        await supabaseAdmin
          .from('telnyx_insight_templates')
          .delete()
          .eq('id', template_id)
          .eq('user_id', userId);

        result = { deleted: true };
        break;
      }

      // ================================================================
      // CREATE DEFAULT INSIGHT TEMPLATES
      // ================================================================
      case 'create_defaults': {
        const defaults = [
          {
            name: 'call_disposition',
            instructions: 'Classify this call\'s outcome. Determine the most appropriate disposition based on the conversation.',
            json_schema: {
              type: 'object',
              properties: {
                disposition: {
                  type: 'string',
                  enum: ['appointment_set', 'callback_requested', 'interested', 'not_interested', 'voicemail', 'wrong_number', 'dnc', 'no_answer', 'hung_up'],
                },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
                next_action: { type: 'string' },
                callback_time: { type: 'string', description: 'ISO 8601 datetime if callback requested' },
              },
              required: ['disposition', 'confidence'],
            },
          },
          {
            name: 'conversation_summary',
            instructions: 'Summarize this conversation in 2-3 sentences. Include: what was discussed, any commitments made, and the caller\'s overall sentiment.',
          },
          {
            name: 'lead_intent',
            instructions: 'Extract buying signals and intent from this conversation.',
            json_schema: {
              type: 'object',
              properties: {
                interest_level: { type: 'string', enum: ['hot', 'warm', 'cold', 'none'] },
                timeline: { type: 'string', description: 'When they want to make a decision' },
                budget_mentioned: { type: 'boolean' },
                decision_maker: { type: 'boolean' },
                objections: { type: 'array', items: { type: 'string' } },
                buying_signals: { type: 'array', items: { type: 'string' } },
              },
            },
          },
          {
            name: 'appointment_details',
            instructions: 'If an appointment was set, extract the details. If no appointment was set, return null for all fields.',
            json_schema: {
              type: 'object',
              properties: {
                appointment_set: { type: 'boolean' },
                date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
                time: { type: 'string', description: 'Time in HH:MM format' },
                timezone: { type: 'string' },
                type: { type: 'string', description: 'Type of appointment' },
                notes: { type: 'string' },
              },
            },
          },
        ];

        const inserted = [];
        for (const d of defaults) {
          const { data, error } = await supabaseAdmin
            .from('telnyx_insight_templates')
            .insert({ user_id: userId, ...d })
            .select()
            .single();
          if (!error && data) inserted.push(data);
        }

        result = { created: inserted.length, templates: inserted };
        break;
      }

      // ================================================================
      // GET INSIGHTS FOR A CALL
      // ================================================================
      case 'get_insights': {
        const { call_log_id, conversation_id } = params;

        let query = supabaseAdmin
          .from('telnyx_conversation_insights')
          .select('*')
          .eq('user_id', userId);

        if (call_log_id) query = query.eq('call_log_id', call_log_id);
        if (conversation_id) query = query.eq('telnyx_conversation_id', conversation_id);

        const { data: insights } = await query.order('created_at', { ascending: false }).limit(10);
        result = { insights: insights || [] };
        break;
      }

      // ================================================================
      // LIST RECENT INSIGHTS
      // ================================================================
      case 'list_insights': {
        const { limit: queryLimit } = params;

        const { data: insights } = await supabaseAdmin
          .from('telnyx_conversation_insights')
          .select('*, call_logs(phone_number, caller_id, duration_seconds)')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(queryLimit || 20);

        result = { insights: insights || [] };
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[Telnyx Insights] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
