/**
 * Telnyx Scheduled Events (Callbacks)
 *
 * Manages scheduled callbacks and follow-up calls/SMS via Telnyx API.
 *
 * Actions:
 *   schedule_call    - Schedule a future outbound AI call
 *   schedule_sms     - Schedule a future SMS message
 *   list_events      - List scheduled events
 *   cancel_event     - Cancel a scheduled event
 *   get_event        - Get a single event
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
    const isServiceRoleCall = token === serviceRoleKey;
    let userId: string;

    if (isServiceRoleCall) {
      const body = await req.clone().json();
      userId = body.userId;
      if (!userId) throw new Error('userId required for service role calls');
    } else {
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Authentication failed' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      userId = user.id;
    }

    const { action, ...params } = await req.json();
    const apiKey = Deno.env.get('TELNYX_API_KEY')?.trim().replace(/[^\x20-\x7E]/g, '') || null;
    if (!apiKey) throw new Error('TELNYX_API_KEY not configured');

    let result: any = {};

    switch (action) {
      // ================================================================
      // SCHEDULE CALL
      // ================================================================
      case 'schedule_call': {
        const {
          assistant_id, from_number, to_number, scheduled_at,
          lead_id, campaign_id, metadata,
        } = params;

        if (!assistant_id || !from_number || !to_number || !scheduled_at) {
          throw new Error('assistant_id, from_number, to_number, and scheduled_at are required');
        }

        // Get Telnyx assistant ID
        const { data: assistant } = await supabaseAdmin
          .from('telnyx_assistants')
          .select('telnyx_assistant_id')
          .eq('id', assistant_id)
          .eq('user_id', userId)
          .single();

        if (!assistant?.telnyx_assistant_id) throw new Error('Telnyx assistant not found');

        // Create scheduled event on Telnyx
        const eventRes = await telnyxFetch(
          `/ai/assistants/${assistant.telnyx_assistant_id}/scheduled_events`,
          apiKey, 'POST',
          {
            telnyx_conversation_channel: 'phone_call',
            telnyx_agent_target: from_number,
            telnyx_end_user_target: to_number,
            scheduled_at_fixed_datetime: scheduled_at,
            conversation_metadata: {
              user_id: userId,
              lead_id: lead_id || null,
              campaign_id: campaign_id || null,
              ...metadata,
            },
          }
        );

        if (!eventRes.ok) throw new Error(`Telnyx API error: ${eventRes.error}`);

        const telnyxEvent = eventRes.data.data;

        // Save locally
        const { data: localEvent, error: dbError } = await supabaseAdmin
          .from('telnyx_scheduled_events')
          .insert({
            user_id: userId,
            telnyx_event_id: telnyxEvent.id,
            telnyx_assistant_id: assistant.telnyx_assistant_id,
            channel: 'phone_call',
            from_number,
            to_number,
            scheduled_at,
            lead_id: lead_id || null,
            campaign_id: campaign_id || null,
            conversation_metadata: metadata || {},
            status: 'scheduled',
          })
          .select()
          .single();

        if (dbError) throw dbError;

        result = { event: localEvent, telnyx_event: telnyxEvent };
        break;
      }

      // ================================================================
      // SCHEDULE SMS
      // ================================================================
      case 'schedule_sms': {
        const {
          assistant_id, from_number, to_number, scheduled_at,
          text_message, lead_id, campaign_id,
        } = params;

        if (!assistant_id || !from_number || !to_number || !scheduled_at || !text_message) {
          throw new Error('assistant_id, from_number, to_number, scheduled_at, and text_message are required');
        }

        const { data: assistant } = await supabaseAdmin
          .from('telnyx_assistants')
          .select('telnyx_assistant_id')
          .eq('id', assistant_id)
          .eq('user_id', userId)
          .single();

        if (!assistant?.telnyx_assistant_id) throw new Error('Telnyx assistant not found');

        const eventRes = await telnyxFetch(
          `/ai/assistants/${assistant.telnyx_assistant_id}/scheduled_events`,
          apiKey, 'POST',
          {
            telnyx_conversation_channel: 'sms_chat',
            telnyx_agent_target: from_number,
            telnyx_end_user_target: to_number,
            scheduled_at_fixed_datetime: scheduled_at,
            text: text_message,
            conversation_metadata: {
              user_id: userId,
              lead_id: lead_id || null,
              campaign_id: campaign_id || null,
            },
          }
        );

        if (!eventRes.ok) throw new Error(`Telnyx API error: ${eventRes.error}`);

        const telnyxEvent = eventRes.data.data;

        const { data: localEvent } = await supabaseAdmin
          .from('telnyx_scheduled_events')
          .insert({
            user_id: userId,
            telnyx_event_id: telnyxEvent.id,
            telnyx_assistant_id: assistant.telnyx_assistant_id,
            channel: 'sms_chat',
            from_number,
            to_number,
            scheduled_at,
            text_message,
            lead_id: lead_id || null,
            campaign_id: campaign_id || null,
            status: 'scheduled',
          })
          .select()
          .single();

        result = { event: localEvent, telnyx_event: telnyxEvent };
        break;
      }

      // ================================================================
      // LIST EVENTS
      // ================================================================
      case 'list_events': {
        const { assistant_id, status: filterStatus } = params;

        let query = supabaseAdmin
          .from('telnyx_scheduled_events')
          .select('*')
          .eq('user_id', userId)
          .order('scheduled_at', { ascending: true });

        if (filterStatus) query = query.eq('status', filterStatus);

        const { data: events } = await query.limit(50);
        result = { events: events || [] };
        break;
      }

      // ================================================================
      // CANCEL EVENT
      // ================================================================
      case 'cancel_event': {
        const { event_id } = params;
        if (!event_id) throw new Error('event_id required');

        const { data: event } = await supabaseAdmin
          .from('telnyx_scheduled_events')
          .select('telnyx_event_id, telnyx_assistant_id')
          .eq('id', event_id)
          .eq('user_id', userId)
          .single();

        if (!event) throw new Error('Event not found');

        // Cancel on Telnyx
        if (event.telnyx_event_id && event.telnyx_assistant_id) {
          await telnyxFetch(
            `/ai/assistants/${event.telnyx_assistant_id}/scheduled_events/${event.telnyx_event_id}`,
            apiKey, 'DELETE'
          );
        }

        // Update local
        await supabaseAdmin
          .from('telnyx_scheduled_events')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('id', event_id);

        result = { cancelled: true };
        break;
      }

      // ================================================================
      // GET SINGLE EVENT
      // ================================================================
      case 'get_event': {
        const { event_id } = params;
        if (!event_id) throw new Error('event_id required');

        const { data: event } = await supabaseAdmin
          .from('telnyx_scheduled_events')
          .select('*')
          .eq('id', event_id)
          .eq('user_id', userId)
          .single();

        result = { event };
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[Telnyx Scheduled Events] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
