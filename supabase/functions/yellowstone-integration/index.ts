
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface YellowstoneConfig {
  apiKey: string;
  webhookUrl?: string;
  autoSyncEnabled: boolean;
  syncIntervalMinutes: number;
}

// Simple validation function instead of Zod schema
function validateConfig(body: any): { success: boolean; data?: YellowstoneConfig; error?: { issues: { message: string }[] } } {
  const errors: string[] = [];
  if (!body.apiKey || typeof body.apiKey !== 'string') errors.push('apiKey is required');
  if (body.autoSyncEnabled === undefined) errors.push('autoSyncEnabled is required');
  if (!body.syncIntervalMinutes || typeof body.syncIntervalMinutes !== 'number') errors.push('syncIntervalMinutes is required');
  
  if (errors.length > 0) {
    return { success: false, error: { issues: errors.map(msg => ({ message: msg })) } };
  }
  return { success: true, data: body as YellowstoneConfig };
}

async function syncWithYellowstone(apiKey: string, supabaseClient: any, userId: string) {
  console.log('Starting Yellowstone sync...');
  
  try {
    // Mock Yellowstone API call (replace with real API)
    const mockNumbers = [
      { number: '+1 (720) 555-9001', status: 'active', daily_calls: 5 },
      { number: '+1 (720) 555-9002', status: 'active', daily_calls: 12 },
      { number: '+1 (720) 555-9003', status: 'quarantined', daily_calls: 55 }
    ];

    // Update local phone numbers based on Yellowstone data
    for (const yellowstoneNumber of mockNumbers) {
      const { data: existingNumber } = await supabaseClient
        .from('phone_numbers')
        .select('*')
        .eq('number', yellowstoneNumber.number)
        .single();

      if (existingNumber) {
        // Update existing number
        await supabaseClient
          .from('phone_numbers')
          .update({
            status: yellowstoneNumber.status,
            daily_calls: yellowstoneNumber.daily_calls,
            updated_at: new Date().toISOString()
          })
          .eq('number', yellowstoneNumber.number);
      } else {
        // Insert new number
        await supabaseClient
          .from('phone_numbers')
          .insert({
            number: yellowstoneNumber.number,
            area_code: yellowstoneNumber.number.substring(4, 7),
            status: yellowstoneNumber.status,
            daily_calls: yellowstoneNumber.daily_calls
          });
      }
    }

    // Update sync timestamp
    await supabaseClient
      .from('yellowstone_settings')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('user_id', userId);

    console.log(`Yellowstone sync completed. Processed ${mockNumbers.length} numbers.`);
    
    return {
      success: true,
      numbersProcessed: mockNumbers.length,
      syncedAt: new Date().toISOString()
    };

  } catch (error) {
    console.error('Yellowstone sync error:', error);
    throw error;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    if (req.method === 'POST') {
      const body = await req.json();
      
      if (body.action === 'configure') {
        // Validate input
        const validationResult = validateConfig(body);
        if (!validationResult.success) {
          return new Response(
            JSON.stringify({ 
              error: 'Invalid configuration data',
              details: validationResult.error?.issues.map((i: any) => i.message)
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { apiKey, webhookUrl, autoSyncEnabled, syncIntervalMinutes } = validationResult.data;

        // Encrypt API key (basic encryption - use proper encryption in production)
        const encryptedApiKey = btoa(apiKey); // Simple base64 encoding

        // Save or update settings
        const { data: existingSettings } = await supabaseClient
          .from('yellowstone_settings')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (existingSettings) {
          await supabaseClient
            .from('yellowstone_settings')
            .update({
              api_key_encrypted: encryptedApiKey,
              webhook_url: webhookUrl,
              auto_sync_enabled: autoSyncEnabled,
              sync_interval_minutes: syncIntervalMinutes
            })
            .eq('user_id', user.id);
        } else {
          await supabaseClient
            .from('yellowstone_settings')
            .insert({
              user_id: user.id,
              api_key_encrypted: encryptedApiKey,
              webhook_url: webhookUrl,
              auto_sync_enabled: autoSyncEnabled,
              sync_interval_minutes: syncIntervalMinutes
            });
        }

        return new Response(JSON.stringify({
          success: true,
          message: 'Yellowstone configuration saved'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (body.action === 'sync') {
        // Get user's Yellowstone settings
        const { data: settings, error: settingsError } = await supabaseClient
          .from('yellowstone_settings')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (settingsError || !settings) {
          return new Response(JSON.stringify({ error: 'Yellowstone not configured' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Decrypt API key
        const apiKey = atob(settings.api_key_encrypted);
        
        const syncResult = await syncWithYellowstone(apiKey, supabaseClient, user.id);

        return new Response(JSON.stringify(syncResult), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    if (req.method === 'GET') {
      // Get Yellowstone settings and status
      const { data: settings, error } = await supabaseClient
        .from('yellowstone_settings')
        .select('webhook_url, auto_sync_enabled, sync_interval_minutes, last_sync_at')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') { // Not found error is OK
        console.error('Settings fetch error:', error);
        return new Response(JSON.stringify({ error: 'Failed to fetch settings' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({
        configured: !!settings,
        settings: settings || {},
        status: settings?.auto_sync_enabled ? 'active' : 'inactive'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  } catch (error) {
    console.error('Function error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
