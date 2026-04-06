/**
 * Assistable Make Call Edge Function
 * 
 * Wraps the Assistable.ai GHL-Safe Make Call API:
 * POST https://api.assistable.ai/v2/ghl/make-call
 * 
 * Designed for use by workflow-executor (assistable_call step type)
 * and direct invocation from the frontend/AI brain.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ASSISTABLE_API_URL = 'https://api.assistable.ai/v2/ghl/make-call';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const assistableApiKey = Deno.env.get('ASSISTABLE_API_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Supabase configuration missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!assistableApiKey) {
      return new Response(
        JSON.stringify({ error: 'ASSISTABLE_API_KEY not configured. Add it in Supabase Edge Function secrets.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth: support both JWT and service-role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    let userId: string | null = null;
    const body = await req.json();

    if (token === supabaseServiceKey) {
      if (!body.user_id) {
        return new Response(
          JSON.stringify({ error: 'user_id required for service role calls' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      userId = body.user_id;
    } else {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        return new Response(
          JSON.stringify({ error: 'Invalid authentication token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      userId = user.id;
    }

    const { action } = body;

    // Health check
    if (action === 'health_check') {
      return new Response(JSON.stringify({
        success: true,
        healthy: true,
        function: 'assistable-make-call',
        timestamp: new Date().toISOString(),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Make Call ──────────────────────────────────────────────────────
    const { assistant_id, location_id, contact_id, number_pool_id, lead_id, campaign_id } = body;

    if (!assistant_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: assistant_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!location_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: location_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!contact_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: contact_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Assistable] Making call: assistant=${assistant_id}, location=${location_id}, contact=${contact_id}`);

    // Build request body
    const callBody: Record<string, string> = {
      assistant_id,
      location_id,
      contact_id,
    };
    if (number_pool_id) {
      callBody.number_pool_id = number_pool_id;
    }

    // Call Assistable API
    const response = await fetch(ASSISTABLE_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${assistableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(callBody),
    });

    const result = await response.json();

    // Assistable returns 200 even on failure — check `success` field
    if (!result.success) {
      const errorMsg = result.error_message || result.message || 'Assistable call failed';
      console.error(`[Assistable] Call failed: ${errorMsg} (code: ${result.error_code})`);
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMsg, 
          error_code: result.error_code,
          returned_an_error: result.returned_an_error,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const callId = result.call_id;
    console.log(`[Assistable] Call initiated successfully: call_id=${callId}`);

    // Log to call_logs for tracking
    if (lead_id) {
      try {
        await supabase.from('call_logs').insert({
          user_id: userId,
          lead_id,
          campaign_id: campaign_id || null,
          phone_number: contact_id, // GHL contact_id as identifier
          caller_id: 'assistable',
          status: 'initiated',
          provider: 'assistable',
          notes: `Assistable call_id: ${callId}, assistant: ${assistant_id}`,
        });
      } catch (logErr) {
        console.error('[Assistable] Failed to log call:', logErr);
        // Non-blocking — don't fail the call because of logging
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        call_id: callId,
        assistant_id,
        contact_id,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[Assistable] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
