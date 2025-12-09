import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const retellKey = Deno.env.get('RETELL_AI_API_KEY');
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { action, broadcastId } = await req.json();

    console.log(`Voice broadcast engine action: ${action} for broadcast ${broadcastId}`);

    // Verify broadcast ownership
    const { data: broadcast, error: broadcastError } = await supabase
      .from('voice_broadcasts')
      .select('*')
      .eq('id', broadcastId)
      .eq('user_id', user.id)
      .single();

    if (broadcastError || !broadcast) {
      throw new Error('Broadcast not found or access denied');
    }

    switch (action) {
      case 'start': {
        if (!broadcast.audio_url) {
          throw new Error('No audio generated for this broadcast. Please generate audio first.');
        }

        // Check if there are pending calls
        const { count: pendingCount } = await supabase
          .from('broadcast_queue')
          .select('*', { count: 'exact', head: true })
          .eq('broadcast_id', broadcastId)
          .eq('status', 'pending');

        if (!pendingCount || pendingCount === 0) {
          throw new Error('No pending calls in the queue. Add leads first.');
        }

        // Update broadcast status
        await supabase
          .from('voice_broadcasts')
          .update({ status: 'active' })
          .eq('id', broadcastId);

        // Get available phone numbers
        const { data: phoneNumbers } = await supabase
          .from('phone_numbers')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .eq('is_spam', false);

        if (!phoneNumbers || phoneNumbers.length === 0) {
          throw new Error('No active phone numbers available');
        }

        // Start dispatching calls (in batches based on calls_per_minute)
        const batchSize = Math.min(broadcast.calls_per_minute || 50, pendingCount);
        
        const { data: queueItems, error: queueError } = await supabase
          .from('broadcast_queue')
          .select('*')
          .eq('broadcast_id', broadcastId)
          .eq('status', 'pending')
          .order('scheduled_at', { ascending: true })
          .limit(batchSize);

        if (queueError) throw queueError;

        let dispatched = 0;
        const errors: string[] = [];

        for (const item of queueItems || []) {
          try {
            // Select a phone number (round-robin or least used)
            const callerNumber = phoneNumbers[dispatched % phoneNumbers.length];

            // Update queue item to 'calling'
            await supabase
              .from('broadcast_queue')
              .update({ 
                status: 'calling',
                attempts: item.attempts + 1,
              })
              .eq('id', item.id);

            // Make the call using Retell or Twilio
            if (retellKey) {
              // Use Retell for AI-powered calls
              const callResponse = await fetch('https://api.retellai.com/v2/create-phone-call', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${retellKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  from_number: callerNumber.number,
                  to_number: item.phone_number,
                  override_agent_id: null, // Use broadcast-specific agent if configured
                  metadata: {
                    broadcast_id: broadcastId,
                    queue_item_id: item.id,
                    ivr_mode: broadcast.ivr_mode,
                    dtmf_actions: broadcast.dtmf_actions,
                  },
                }),
              });

              if (!callResponse.ok) {
                const errorText = await callResponse.text();
                throw new Error(`Retell API error: ${errorText}`);
              }

              dispatched++;
            } else {
              // Fallback: Mark as dispatched but note that Retell is not configured
              console.log(`Would dispatch call to ${item.phone_number} from ${callerNumber.number}`);
              dispatched++;
            }

            // Update broadcast stats
            await supabase
              .from('voice_broadcasts')
              .update({ calls_made: broadcast.calls_made + 1 })
              .eq('id', broadcastId);

          } catch (callError: any) {
            console.error(`Error dispatching call to ${item.phone_number}:`, callError);
            errors.push(`${item.phone_number}: ${callError.message}`);
            
            // Mark as failed
            await supabase
              .from('broadcast_queue')
              .update({ status: 'failed' })
              .eq('id', item.id);
          }
        }

        console.log(`Broadcast ${broadcastId} started: ${dispatched} calls dispatched`);

        return new Response(
          JSON.stringify({ 
            success: true, 
            status: 'active',
            dispatched,
            pending: pendingCount - dispatched,
            errors: errors.length > 0 ? errors : undefined,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'stop': {
        // Update broadcast status
        await supabase
          .from('voice_broadcasts')
          .update({ status: 'paused' })
          .eq('id', broadcastId);

        // Pause any 'calling' items back to 'pending'
        await supabase
          .from('broadcast_queue')
          .update({ status: 'pending' })
          .eq('broadcast_id', broadcastId)
          .eq('status', 'calling');

        console.log(`Broadcast ${broadcastId} stopped`);

        return new Response(
          JSON.stringify({ success: true, status: 'paused' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'stats': {
        const { data: queueStats } = await supabase
          .from('broadcast_queue')
          .select('status, dtmf_pressed, call_duration_seconds')
          .eq('broadcast_id', broadcastId);

        const stats = {
          total: queueStats?.length || 0,
          pending: 0,
          calling: 0,
          answered: 0,
          completed: 0,
          failed: 0,
          transferred: 0,
          callback: 0,
          dnc: 0,
          avgDuration: 0,
          dtmfBreakdown: {} as Record<string, number>,
        };

        let totalDuration = 0;
        let durationCount = 0;

        for (const item of queueStats || []) {
          stats[item.status as keyof typeof stats]++;
          
          if (item.call_duration_seconds) {
            totalDuration += item.call_duration_seconds;
            durationCount++;
          }

          if (item.dtmf_pressed) {
            stats.dtmfBreakdown[item.dtmf_pressed] = 
              (stats.dtmfBreakdown[item.dtmf_pressed] || 0) + 1;
          }
        }

        stats.avgDuration = durationCount > 0 ? Math.round(totalDuration / durationCount) : 0;

        return new Response(
          JSON.stringify({ success: true, ...stats }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'handle_dtmf': {
        // This would be called by the webhook when a user presses a digit
        const { queueItemId, digit } = await req.json();

        const dtmfActions = broadcast.dtmf_actions as any[];
        const action = dtmfActions.find(a => a.digit === digit);

        if (!action) {
          return new Response(
            JSON.stringify({ success: false, message: 'Invalid digit' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        let newStatus = 'completed';
        let callbackAt = null;

        switch (action.action) {
          case 'transfer':
            newStatus = 'transferred';
            await supabase
              .from('voice_broadcasts')
              .update({ transfers_completed: broadcast.transfers_completed + 1 })
              .eq('id', broadcastId);
            break;

          case 'callback':
            newStatus = 'callback';
            callbackAt = new Date(Date.now() + (action.delay_hours || 24) * 60 * 60 * 1000).toISOString();
            await supabase
              .from('voice_broadcasts')
              .update({ callbacks_scheduled: broadcast.callbacks_scheduled + 1 })
              .eq('id', broadcastId);
            break;

          case 'dnc':
            newStatus = 'dnc';
            // Add to DNC list
            const { data: queueItem } = await supabase
              .from('broadcast_queue')
              .select('phone_number, lead_id')
              .eq('id', queueItemId)
              .single();

            if (queueItem) {
              await supabase
                .from('dnc_list')
                .upsert({
                  user_id: user.id,
                  phone_number: queueItem.phone_number,
                  reason: 'Opted out via voice broadcast IVR',
                });

              // Update lead if exists
              if (queueItem.lead_id) {
                await supabase
                  .from('leads')
                  .update({ do_not_call: true })
                  .eq('id', queueItem.lead_id);
              }
            }

            await supabase
              .from('voice_broadcasts')
              .update({ dnc_requests: broadcast.dnc_requests + 1 })
              .eq('id', broadcastId);
            break;

          case 'replay':
            // Don't change status, the call will replay the message
            return new Response(
              JSON.stringify({ success: true, action: 'replay' }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        await supabase
          .from('broadcast_queue')
          .update({ 
            status: newStatus,
            dtmf_pressed: digit,
            callback_scheduled_at: callbackAt,
          })
          .eq('id', queueItemId);

        return new Response(
          JSON.stringify({ success: true, action: action.action, status: newStatus }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

  } catch (error: any) {
    console.error('Voice broadcast engine error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
