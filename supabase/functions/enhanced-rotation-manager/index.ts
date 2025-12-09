
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RotationSettings {
  enabled: boolean;
  rotation_interval_hours: number;
  high_volume_threshold: number;
  auto_import_enabled: boolean;
  auto_remove_quarantined: boolean;
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

      if (body.action === 'save_settings') {
        const settings: RotationSettings = body.settings;
        
        // Validate settings
        if (settings.rotation_interval_hours && (settings.rotation_interval_hours < 1 || settings.rotation_interval_hours > 168)) {
          return new Response(JSON.stringify({ error: 'rotation_interval_hours must be between 1 and 168' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        if (settings.high_volume_threshold && (settings.high_volume_threshold < 1 || settings.high_volume_threshold > 1000)) {
          return new Response(JSON.stringify({ error: 'high_volume_threshold must be between 1 and 1000' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Save or update rotation settings
        const { data: existingSettings } = await supabaseClient
          .from('rotation_settings')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (existingSettings) {
          await supabaseClient
            .from('rotation_settings')
            .update(settings)
            .eq('user_id', user.id);
        } else {
          await supabaseClient
            .from('rotation_settings')
            .insert({
              user_id: user.id,
              ...settings
            });
        }

        return new Response(JSON.stringify({
          success: true,
          message: 'Rotation settings saved'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (body.action === 'execute_rotation') {
        console.log('Executing manual rotation...');

        // Get user's rotation settings
        const { data: settings } = await supabaseClient
          .from('rotation_settings')
          .select('*')
          .eq('user_id', user.id)
          .single();

        // If no settings exist, use defaults
        const effectiveSettings = settings || {
          enabled: true,
          rotation_interval_hours: 24,
          high_volume_threshold: 50,
          auto_import_enabled: true,
          auto_remove_quarantined: true
        };

        // Get high volume numbers
        const { data: highVolumeNumbers } = await supabaseClient
          .from('phone_numbers')
          .select('*')
          .gte('daily_calls', effectiveSettings.high_volume_threshold)
          .eq('status', 'active');

        let rotatedCount = 0;
        const rotationEvents = [];

        if (highVolumeNumbers && highVolumeNumbers.length > 0) {
          // Get replacement numbers
          const { data: replacementNumbers } = await supabaseClient
            .from('phone_numbers')
            .select('*')
            .lt('daily_calls', 10)
            .eq('status', 'active')
            .limit(highVolumeNumbers.length);

          // Perform rotation
          for (let i = 0; i < Math.min(highVolumeNumbers.length, replacementNumbers?.length || 0); i++) {
            const oldNumber = highVolumeNumbers[i];
            const newNumber = replacementNumbers![i];

            // Mark old number as rotated
            await supabaseClient
              .from('phone_numbers')
              .update({ status: 'rotated', updated_at: new Date().toISOString() })
              .eq('id', oldNumber.id);

            rotatedCount++;

            // Log rotation event
            rotationEvents.push({
              user_id: user.id,
              action_type: 'rotate',
              phone_number: oldNumber.number,
              reason: `High volume rotation: ${oldNumber.daily_calls} calls`,
              metadata: {
                old_number: oldNumber.number,
                new_number: newNumber.number,
                old_daily_calls: oldNumber.daily_calls,
                trigger: 'manual'
              }
            });
          }

          // Insert rotation events
          if (rotationEvents.length > 0) {
            await supabaseClient
              .from('rotation_history')
              .insert(rotationEvents);
          }
        }

        console.log(`Manual rotation completed. Rotated ${rotatedCount} numbers.`);

        return new Response(JSON.stringify({
          success: true,
          rotated_count: rotatedCount,
          message: `Successfully rotated ${rotatedCount} high-volume numbers`
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    if (req.method === 'GET') {
      const url = new URL(req.url);
      const action = url.searchParams.get('action');

      if (action === 'settings') {
        // Get rotation settings
        const { data: settings, error } = await supabaseClient
          .from('rotation_settings')
          .select('*')
          .eq('user_id', user.id)
          .single();

        // If no settings exist yet, return defaults instead of error
        if (error && error.code === 'PGRST116') {
          console.log('No settings found for user, returning defaults');
          return new Response(JSON.stringify({
            settings: {
              enabled: true,
              rotation_interval_hours: 24,
              high_volume_threshold: 50,
              auto_import_enabled: true,
              auto_remove_quarantined: true
            }
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        if (error) {
          console.error('Settings fetch error:', error);
          return new Response(JSON.stringify({ error: 'Failed to fetch settings' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({
          settings: settings || {
            enabled: true,
            rotation_interval_hours: 24,
            high_volume_threshold: 50,
            auto_import_enabled: true,
            auto_remove_quarantined: true
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (action === 'history') {
        // Get rotation history
        const { data: history, error } = await supabaseClient
          .from('rotation_history')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) {
          console.error('History fetch error:', error);
          return new Response(JSON.stringify({ error: 'Failed to fetch history' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({ history: history || [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  } catch (error) {
    console.error('Function error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
