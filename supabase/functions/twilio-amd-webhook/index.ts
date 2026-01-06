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
 * - If voicemail/machine detected: Update queue status to 'voicemail', optionally hang up
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
      console.log(`[AMD Webhook] Machine detected (${answeredBy}), updating queue item and hanging up`);
      
      // Update queue item status to 'voicemail'
      if (queueItemId) {
        const { error: updateError } = await supabase
          .from('broadcast_queue')
          .update({ 
            status: 'voicemail',
            updated_at: new Date().toISOString()
          })
          .eq('id', queueItemId);
        
        if (updateError) {
          console.error('[AMD Webhook] Failed to update queue item:', updateError);
        } else {
          console.log(`[AMD Webhook] Queue item ${queueItemId} marked as voicemail`);
        }
      }

      // Update broadcast voicemail count if we have broadcastId
      if (broadcastId) {
        // Get current broadcast stats
        const { data: broadcast } = await supabase
          .from('voice_broadcasts')
          .select('calls_made')
          .eq('id', broadcastId)
          .single();
        
        if (broadcast) {
          // Note: We could add a voicemails_detected column to track this
          console.log(`[AMD Webhook] Broadcast ${broadcastId} voicemail detected`);
        }
      }

      // Return TwiML to hang up the call
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
      // Human detected or unknown - let the call continue
      console.log(`[AMD Webhook] Human detected (${answeredBy}), allowing call to continue`);
      
      // Update queue item to mark as 'in_progress' (human answered)
      if (queueItemId) {
        const { error: updateError } = await supabase
          .from('broadcast_queue')
          .update({ 
            status: 'in_progress',
            updated_at: new Date().toISOString()
          })
          .eq('id', queueItemId);
        
        if (updateError) {
          console.error('[AMD Webhook] Failed to update queue item:', updateError);
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
