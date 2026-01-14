import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Twilio AMD (Answering Machine Detection) Webhook Handler
 * 
 * This edge function receives async AMD callbacks from Twilio and handles them:
 * - If voicemail/machine detected: Update queue status to 'voicemail', optionally leave a message or hang up
 * - If human detected: Let the call continue normally
 * 
 * Twilio AMD AnsweredBy values:
 * - 'human': A human answered
 * - 'machine_start': Machine/VM detected at start of greeting
 * - 'machine_end_beep': VM detected and beep heard (end of greeting)
 * - 'machine_end_silence': VM detected, greeting ended with silence
 * - 'machine_end_other': VM detected, greeting ended other way
 * - 'fax': Fax machine detected
 * - 'unknown': Detection inconclusive
 */

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse Twilio webhook data (form-urlencoded)
    const formData = await req.formData();
    const callSid = formData.get('CallSid') as string;
    const answeredBy = formData.get('AnsweredBy') as string;
    const machineDetectionDuration = formData.get('MachineDetectionDuration') as string;
    
    // Get queue item ID and broadcast ID from URL params
    const url = new URL(req.url);
    const queueItemId = url.searchParams.get('queue_item_id');
    const broadcastId = url.searchParams.get('broadcast_id');

    console.log(`[AMD Webhook] CallSid: ${callSid}, AnsweredBy: ${answeredBy}, Duration: ${machineDetectionDuration}ms`);
    console.log(`[AMD Webhook] Queue Item: ${queueItemId}, Broadcast: ${broadcastId}`);

    // Determine if this is a machine/voicemail
    const isMachine = [
      'machine_start',
      'machine_end_beep',
      'machine_end_silence',
      'machine_end_other',
      'fax'
    ].includes(answeredBy);

    if (isMachine) {
      console.log(`[AMD Webhook] Machine detected (${answeredBy}), processing voicemail action`);

      // Update queue item status to 'voicemail' and update broadcast stats
      if (queueItemId) {
        // First fetch the queue item to get broadcast info
        const { data: queueItem, error: fetchError } = await supabase
          .from('broadcast_queue')
          .select('*, voice_broadcasts(*)')
          .eq('id', queueItemId)
          .maybeSingle();

        if (fetchError) {
          console.error('[AMD Webhook] Failed to fetch queue item:', fetchError);
        }

        const { error: updateError } = await supabase
          .from('broadcast_queue')
          .update({
            status: 'voicemail',
            amd_result: answeredBy,
            updated_at: new Date().toISOString()
          })
          .eq('id', queueItemId);

        if (updateError) {
          console.error('[AMD Webhook] Failed to update queue item:', updateError);
        } else {
          console.log(`[AMD Webhook] Queue item ${queueItemId} marked as voicemail`);

          // Update broadcast calls_made count (voicemail counts as a completed call attempt)
          if (queueItem?.voice_broadcasts) {
            const broadcast = queueItem.voice_broadcasts;
            await supabase
              .from('voice_broadcasts')
              .update({
                calls_made: (broadcast.calls_made || 0) + 1
              })
              .eq('id', broadcast.id);
            console.log(`[AMD Webhook] Updated broadcast calls_made for voicemail`);
          }
        }
      }

      // Fetch broadcast settings to determine voicemail action
      let voicemailAction = 'hangup';
      let voicemailAudioUrl = '';
      
      if (broadcastId) {
        const { data: broadcast } = await supabase
          .from('voice_broadcasts')
          .select('voicemail_action, voicemail_audio_url, audio_url')
          .eq('id', broadcastId)
          .maybeSingle();
        
        if (broadcast) {
          voicemailAction = broadcast.voicemail_action || 'hangup';
          voicemailAudioUrl = broadcast.voicemail_audio_url || broadcast.audio_url || '';
          console.log(`[AMD Webhook] Broadcast ${broadcastId} voicemail_action: ${voicemailAction}`);
        }
      }

      // If configured to leave voicemail message, play audio then hang up
      if (voicemailAction === 'leave_message' && voicemailAudioUrl) {
        console.log(`[AMD Webhook] Leaving voicemail message: ${voicemailAudioUrl}`);
        const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${voicemailAudioUrl}</Play>
  <Hangup/>
</Response>`;

        return new Response(twimlResponse, {
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/xml' 
          },
        });
      }

      // Default: just hang up
      console.log(`[AMD Webhook] Hanging up (voicemail_action: ${voicemailAction})`);
      const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup/>
</Response>`;

      return new Response(twimlResponse, {
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/xml' 
        },
      });
    } else {
      // Human detected or unknown - mark as answered and update stats
      console.log(`[AMD Webhook] Human detected (${answeredBy}), marking as answered`);

      // Update queue item to mark as 'answered' (human answered)
      if (queueItemId) {
        const { data: queueItem, error: fetchError } = await supabase
          .from('broadcast_queue')
          .select('*, voice_broadcasts(*)')
          .eq('id', queueItemId)
          .maybeSingle();

        if (fetchError) {
          console.error('[AMD Webhook] Failed to fetch queue item:', fetchError);
        }

        const { error: updateError } = await supabase
          .from('broadcast_queue')
          .update({
            status: 'answered',
            amd_result: answeredBy,
            updated_at: new Date().toISOString()
          })
          .eq('id', queueItemId);

        if (updateError) {
          console.error('[AMD Webhook] Failed to update queue item:', updateError);
        } else {
          console.log(`[AMD Webhook] Queue item ${queueItemId} marked as answered (human)`);

          // Update broadcast stats
          if (queueItem?.voice_broadcasts) {
            const broadcast = queueItem.voice_broadcasts;
            await supabase
              .from('voice_broadcasts')
              .update({
                calls_answered: (broadcast.calls_answered || 0) + 1
              })
              .eq('id', broadcast.id);
            console.log(`[AMD Webhook] Updated broadcast calls_answered`);
          }

          // Update lead status to contacted
          if (queueItem?.lead_id) {
            await supabase
              .from('leads')
              .update({
                status: 'contacted',
                last_contacted_at: new Date().toISOString()
              })
              .eq('id', queueItem.lead_id);
            console.log(`[AMD Webhook] Lead ${queueItem.lead_id} marked as contacted`);
          }
        }
      }

      // Return empty response - call continues with original TwiML
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }
  } catch (error) {
    console.error('[AMD Webhook] Error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});