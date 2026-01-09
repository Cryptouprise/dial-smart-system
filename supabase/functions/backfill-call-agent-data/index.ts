import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const retellApiKey = Deno.env.get('RETELL_AI_API_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing required Supabase environment variables');
    }
    
    if (!retellApiKey) {
      throw new Error('Missing RETELL_AI_API_KEY');
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Handle both JWT and service role auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    let userId: string | null = null;

    // Check if service role call
    if (token === supabaseServiceKey) {
      const body = await req.json();
      if (!body.user_id) {
        throw new Error('user_id required for service role calls');
      }
      userId = body.user_id;
      console.log('✅ Service role auth - user_id:', userId);
    } else {
      // Regular user call with JWT
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        throw new Error('Invalid authentication token');
      }
      userId = user.id;
      console.log('✅ JWT auth - user_id:', userId);
    }

    // Parse request body for options
    let requestBody: any = {};
    try {
      const bodyText = await req.text();
      if (bodyText) {
        requestBody = JSON.parse(bodyText);
      }
    } catch {
      // Ignore parse errors, use defaults
    }

    const limit = requestBody.limit || 25;
    const since = requestBody.since || null;

    console.log(`Starting agent data backfill for user ${userId}, limit: ${limit}`);

    // Find call_logs with missing agent_id but having retell_call_id
    let query = supabase
      .from('call_logs')
      .select('id, retell_call_id, phone_number')
      .eq('user_id', userId)
      .is('agent_id', null)
      .not('retell_call_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (since) {
      query = query.gte('created_at', since);
    }

    const { data: callsToBackfill, error: fetchError } = await query;

    if (fetchError) {
      console.error('Error fetching calls to backfill:', fetchError);
      throw new Error('Failed to fetch calls for backfill');
    }

    if (!callsToBackfill || callsToBackfill.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No calls need agent data backfill',
        processed: 0,
        updated: 0,
        skipped: 0,
        errors: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Found ${callsToBackfill.length} calls to backfill`);

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    // Process each call
    for (const call of callsToBackfill) {
      try {
        // Fetch call details from Retell API
        const retellResponse = await fetch(`https://api.retellai.com/v2/get-call/${call.retell_call_id}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${retellApiKey}`,
            'Content-Type': 'application/json'
          }
        });

        if (!retellResponse.ok) {
          if (retellResponse.status === 404) {
            console.log(`Call ${call.retell_call_id} not found in Retell, skipping`);
            skipped++;
            continue;
          }
          throw new Error(`Retell API error: ${retellResponse.status}`);
        }

        const retellCall = await retellResponse.json();
        
        if (!retellCall.agent_id) {
          console.log(`No agent_id in Retell call ${call.retell_call_id}, skipping`);
          skipped++;
          continue;
        }

        // Update call_logs with agent_id
        const { error: updateError } = await supabase
          .from('call_logs')
          .update({ 
            agent_id: retellCall.agent_id
          })
          .eq('id', call.id);

        if (updateError) {
          console.error(`Error updating call ${call.id}:`, updateError);
          errors++;
          continue;
        }

        console.log(`Updated call ${call.id} with agent_id ${retellCall.agent_id}`);
        updated++;

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (err) {
        console.error(`Error processing call ${call.id}:`, err);
        errors++;
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Backfill complete`,
      processed: callsToBackfill.length,
      updated,
      skipped,
      errors
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error('Backfill error:', error);
    return new Response(JSON.stringify({ 
      error: (error as Error).message || 'Unknown error occurred'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
