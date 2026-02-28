/**
 * Telnyx Dynamic Variables Webhook
 *
 * Called by Telnyx at the START of every AI conversation.
 * Returns:
 *   - dynamic_variables: Lead data, callback context, current time
 *   - memory: Which past conversations to load (PostgREST-style query)
 *   - conversation.metadata: Tags for the current conversation
 *
 * This endpoint must respond within 1 second or Telnyx proceeds without memory.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const payload = await req.json();
    const eventData = payload.data || payload;
    const eventPayload = eventData.payload || eventData;

    console.log('[Telnyx DynVars] Initialization webhook received');

    // Extract key fields from the initialization event
    const channel = eventPayload.telnyx_conversation_channel || 'phone_call';
    const agentNumber = eventPayload.telnyx_agent_target || '';      // Our number
    const endUserNumber = eventPayload.telnyx_end_user_target || ''; // Lead's number
    const verified = eventPayload.telnyx_end_user_target_verified || false;
    const conversationId = eventPayload.telnyx_conversation_id || '';

    console.log(`[Telnyx DynVars] Channel: ${channel}, Agent: ${agentNumber}, EndUser: ${endUserNumber}`);

    // Default response structure
    const response: any = {
      dynamic_variables: {
        current_time: new Date().toLocaleString('en-US', {
          timeZone: 'America/New_York',
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
        }),
        current_time_iso: new Date().toISOString(),
        current_date_ymd: new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
        current_day_of_week: new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long' }),
      },
      memory: {},
      conversation: {
        metadata: {},
      },
    };

    // Normalize the phone number for lookup
    const phoneDigits = endUserNumber.replace(/\D/g, '');
    if (!phoneDigits || phoneDigits.length < 10) {
      console.log('[Telnyx DynVars] No valid phone number, returning defaults');
      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const normalizedPhone = phoneDigits.startsWith('1') ? `+${phoneDigits}` : `+1${phoneDigits}`;

    // Look up the assistant to find the user_id
    let userId: string | null = null;

    // Try to find user by the agent number (our Telnyx number)
    const agentDigits = agentNumber.replace(/\D/g, '');
    const normalizedAgent = agentDigits.startsWith('1') ? `+${agentDigits}` : agentDigits.length >= 10 ? `+1${agentDigits}` : agentNumber;
    const { data: phoneRecord } = await supabaseAdmin
      .from('phone_numbers')
      .select('user_id')
      .or(`number.eq.${agentNumber},number.eq.${normalizedAgent},phone_number.eq.${agentNumber},phone_number.eq.${normalizedAgent}`)
      .limit(1)
      .maybeSingle();

    if (phoneRecord) {
      userId = phoneRecord.user_id;
    }

    // If no user found from phone, try from recent call_logs
    if (!userId) {
      const { data: recentCall } = await supabaseAdmin
        .from('call_logs')
        .select('user_id')
        .or(`phone_number.eq.${normalizedPhone},phone_number.ilike.%${phoneDigits.slice(-10)}%`)
        .eq('provider', 'telnyx')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentCall) userId = recentCall.user_id;
    }

    // Look up lead by phone number
    let lead: any = null;
    if (userId) {
      const { data: foundLead } = await supabaseAdmin
        .from('leads')
        .select('id, first_name, last_name, email, phone_number, company, lead_source, notes, tags, custom_fields, preferred_contact_time, timezone, address, city, state, zip_code, next_callback_at')
        .eq('user_id', userId)
        .or(`phone_number.eq.${normalizedPhone},phone_number.eq.${phoneDigits},phone_number.ilike.%${phoneDigits.slice(-10)}%`)
        .limit(1)
        .maybeSingle();

      lead = foundLead;
    }

    if (lead) {
      const firstName = String(lead.first_name || '');
      const lastName = String(lead.last_name || '');
      const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'there';
      const tz = lead.timezone || 'America/New_York';

      // Recalculate time in lead's timezone
      const currentTime = new Date().toLocaleString('en-US', {
        timeZone: tz, weekday: 'long', year: 'numeric', month: 'long',
        day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
      });

      response.dynamic_variables = {
        // Time
        current_time: currentTime,
        current_time_iso: new Date().toISOString(),
        current_timezone: tz,
        current_date_ymd: new Date().toLocaleDateString('en-CA', { timeZone: tz }),
        current_day_of_week: new Date().toLocaleDateString('en-US', { timeZone: tz, weekday: 'long' }),

        // Lead data
        first_name: firstName,
        last_name: lastName,
        full_name: fullName,
        name: fullName,
        email: String(lead.email || ''),
        phone: String(lead.phone_number || normalizedPhone),
        phone_number: String(lead.phone_number || normalizedPhone),
        company: String(lead.company || ''),
        lead_source: String(lead.lead_source || ''),
        notes: String(lead.notes || ''),
        tags: Array.isArray(lead.tags) ? lead.tags.join(', ') : '',
        preferred_contact_time: String(lead.preferred_contact_time || ''),
        timezone: tz,

        // Address
        address: String(lead.address || ''),
        city: String(lead.city || ''),
        state: String(lead.state || ''),
        zip_code: String(lead.zip_code || ''),
        full_address: [lead.address, lead.city, lead.state, lead.zip_code].filter(Boolean).join(', '),

        // System
        lead_id: lead.id,
        user_id: userId || '',
        caller_verified: String(verified),
      };

      // Check if this is a callback
      const isCallback = lead.next_callback_at &&
        new Date(lead.next_callback_at) <= new Date(Date.now() + 5 * 60 * 1000);

      if (isCallback) {
        response.dynamic_variables.is_callback = 'true';
        response.dynamic_variables.callback_context =
          'This is a callback — the customer previously requested we call them back.';

        // Get last call notes for context
        const { data: lastCall } = await supabaseAdmin
          .from('call_logs')
          .select('notes, ended_at, outcome')
          .eq('lead_id', lead.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastCall) {
          response.dynamic_variables.last_call_date = lastCall.ended_at
            ? new Date(lastCall.ended_at).toLocaleString('en-US', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' })
            : 'recently';
          const summary = String(lastCall.notes || '');
          response.dynamic_variables.previous_conversation = summary.length > 500 ? summary.substring(0, 500) + '...' : summary;
          response.dynamic_variables.previous_outcome = lastCall.outcome || '';
        }
      } else {
        response.dynamic_variables.is_callback = 'false';
      }

      // Include custom fields
      if (lead.custom_fields && typeof lead.custom_fields === 'object') {
        for (const [key, val] of Object.entries(lead.custom_fields as Record<string, unknown>)) {
          const k = String(key).trim();
          if (!k) continue;
          response.dynamic_variables[k] = val === null || val === undefined ? '' : String(val);
        }
      }

      // Set conversation metadata for future memory queries
      response.conversation.metadata = {
        lead_id: lead.id,
        user_id: userId,
        lead_name: fullName,
        phone_number: normalizedPhone,
      };

      // Enable memory: load last 5 conversations with this phone number
      response.memory = {
        conversation_query: `metadata->telnyx_end_user_target=eq.${endUserNumber}&limit=5&order=last_message_at.desc`,
      };

      // If insights are configured, load recent insights too
      // (Uses insight_query to selectively recall specific insight results)

    } else {
      console.log('[Telnyx DynVars] No lead found for', normalizedPhone);
      response.dynamic_variables.phone_number = normalizedPhone;
      response.dynamic_variables.is_callback = 'false';

      // Still tag conversation for future reference
      response.conversation.metadata = {
        phone_number: normalizedPhone,
        lead_status: 'unknown',
      };

      // Still enable memory even without a lead
      response.memory = {
        conversation_query: `metadata->telnyx_end_user_target=eq.${endUserNumber}&limit=3&order=last_message_at.desc`,
      };
    }

    const elapsed = Date.now() - startTime;
    console.log(`[Telnyx DynVars] Responding in ${elapsed}ms with ${Object.keys(response.dynamic_variables).length} variables`);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[Telnyx DynVars] Error:', error);
    // Must still return a valid response — Telnyx will proceed without personalization
    return new Response(JSON.stringify({
      dynamic_variables: {
        current_time: new Date().toISOString(),
        error_context: 'Personalization temporarily unavailable',
      },
      memory: {},
      conversation: { metadata: {} },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
