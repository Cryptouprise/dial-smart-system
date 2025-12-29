import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * DTMF Handler for Twilio Voice Broadcast Webhooks
 * 
 * ⚠️ THIS WEBHOOK IS ALWAYS REQUIRED - Even for internal agent transfers!
 * 
 * PURPOSE:
 * This webhook is called by Twilio when a recipient presses a digit (DTMF) during
 * a voice broadcast call. It is ESSENTIAL for the following reasons:
 * 
 * 1. CALL CONTROL: Returns TwiML instructions to Twilio (e.g., transfer call, play message)
 * 2. TRACKING: Updates broadcast_queue status (transferred, callback, dnc, completed)
 * 3. ANALYTICS: Updates broadcast statistics (transfers_completed, callbacks_scheduled, etc.)
 * 4. BUSINESS LOGIC: Handles DNC requests, callback scheduling, lead updates
 * 
 * WHEN IT'S CALLED:
 * - Recipient listens to voice broadcast audio
 * - Recipient presses a digit (1, 2, 3, etc.)
 * - Twilio automatically calls this webhook with the digit pressed
 * - This webhook returns TwiML to tell Twilio what to do next
 * 
 * INTERNAL VS EXTERNAL TRANSFERS:
 * - Internal transfer (to your agent): This webhook is REQUIRED
 * - External transfer (to any number): This webhook is REQUIRED
 * - The destination number doesn't matter - the webhook is always needed!
 * 
 * WITHOUT THIS WEBHOOK:
 * ❌ Transfers will NOT work (no TwiML instructions returned to Twilio)
 * ❌ Statistics will NOT update (no tracking of responses)
 * ❌ Calls will fail with "An error occurred"
 * 
 * See: VOICE_BROADCAST_TRANSFER_GUIDE.md for detailed explanation
 */

serve(async (req) => {
  const url = new URL(req.url);
  const transferNumber = url.searchParams.get('transfer') || '';
  const queueItemId = url.searchParams.get('queue_item_id') || '';
  const broadcastId = url.searchParams.get('broadcast_id') || '';
  
  console.log(`DTMF Handler - Method: ${req.method}, URL: ${req.url}`);
  console.log(`Params - transfer: ${transferNumber}, queue_item_id: ${queueItemId}, broadcast_id: ${broadcastId}`);
  
  // Initialize Supabase client
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing required environment variables');
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Configuration error. Goodbye.</Say>
  <Hangup/>
</Response>`, {
      status: 200,
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    });
  }
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  try {
    let digits = '';
    let from = '';
    let to = '';
    let callSid = '';
    
    // Twilio sends application/x-www-form-urlencoded
    const contentType = req.headers.get('content-type') || '';
    console.log('Content-Type:', contentType);
    
    if (contentType.includes('form')) {
      const formData = await req.formData();
      digits = formData.get('Digits')?.toString() || '';
      from = formData.get('From')?.toString() || '';
      to = formData.get('To')?.toString() || '';
      callSid = formData.get('CallSid')?.toString() || '';
      console.log(`Form data - Digits: ${digits}, From: ${from}, To: ${to}, CallSid: ${callSid}`);
    } else {
      // Try to parse as text and extract digits
      const body = await req.text();
      console.log('Raw body:', body);
      const match = body.match(/Digits=(\d+)/);
      if (match) digits = match[1];
    }
    
    console.log(`DTMF received: digits=${digits}, transfer=${transferNumber}`);

    let twiml = '';
    let queueStatus = 'completed';
    let dtmfPressed = digits;
    
    // Handle digit "1" - Transfer to agent
    // IMPORTANT: This works for BOTH internal and external transfers!
    // - Internal: transferNumber is one of YOUR agent phone numbers
    // - External: transferNumber is any other phone number
    // The transfer process is identical - we return TwiML with <Dial> instructions
    if (digits === '1') {
      // Check if we have a transfer number in URL params
      if (transferNumber && transferNumber.trim() !== '') {
        console.log(`Transferring call to ${transferNumber} (could be internal or external - doesn't matter!)`);
        queueStatus = 'transferred';
        // Return TwiML to Twilio with transfer instructions
        // Twilio will then dial the transfer number and bridge the calls
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Connecting you now.</Say>
  <Dial timeout="30">
    <Number>${transferNumber}</Number>
  </Dial>
  <Say>We could not connect you. Goodbye.</Say>
  <Hangup/>
</Response>`;
      } else {
        // No transfer number configured - mark as answered/interested
        console.log('No transfer number configured, marking as answered');
        queueStatus = 'answered';
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Thank you for your interest. A representative will contact you shortly. Goodbye.</Say>
  <Hangup/>
</Response>`;
      }
    } else if (digits === '2') {
      queueStatus = 'callback';
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We will call you back soon. Goodbye.</Say>
  <Hangup/>
</Response>`;
    } else if (digits === '3') {
      queueStatus = 'dnc';
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>You have been removed from our list. Goodbye.</Say>
  <Hangup/>
</Response>`;
    } else {
      queueStatus = 'completed';
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Goodbye.</Say>
  <Hangup/>
</Response>`;
    }

    // Update broadcast queue item status
    if (queueItemId) {
      console.log(`Updating queue item ${queueItemId} with status: ${queueStatus}, dtmf: ${dtmfPressed}`);
      
      const { error: updateError } = await supabase
        .from('broadcast_queue')
        .update({ 
          status: queueStatus,
          dtmf_pressed: dtmfPressed,
          updated_at: new Date().toISOString()
        })
        .eq('id', queueItemId);
      
      if (updateError) {
        console.error('Error updating queue item:', updateError);
      } else {
        console.log('Queue item updated successfully');
      }
      
      // Update broadcast stats
      if (broadcastId) {
        console.log(`Updating broadcast ${broadcastId} stats`);
        
        // Get current broadcast
        const { data: broadcast, error: broadcastError } = await supabase
          .from('voice_broadcasts')
          .select('calls_answered, transfers_completed, callbacks_scheduled, dnc_requests')
          .eq('id', broadcastId)
          .maybeSingle();
        
        if (!broadcastError && broadcast) {
          const updates: Record<string, number> = {};
          
          // Any DTMF press means the call was answered
          if (queueStatus === 'answered' || queueStatus === 'transferred' || queueStatus === 'callback' || queueStatus === 'dnc') {
            updates.calls_answered = (broadcast.calls_answered || 0) + 1;
          }
          if (queueStatus === 'transferred') {
            updates.transfers_completed = (broadcast.transfers_completed || 0) + 1;
          }
          if (queueStatus === 'callback') {
            updates.callbacks_scheduled = (broadcast.callbacks_scheduled || 0) + 1;
          }
          if (queueStatus === 'dnc') {
            updates.dnc_requests = (broadcast.dnc_requests || 0) + 1;
          }
          
          console.log('Updating broadcast with:', updates);
          
          if (Object.keys(updates).length > 0) {
            const { error: updateBroadcastError } = await supabase
              .from('voice_broadcasts')
              .update(updates)
              .eq('id', broadcastId);
              
            if (updateBroadcastError) {
              console.error('Error updating broadcast stats:', updateBroadcastError);
            } else {
              console.log('Broadcast stats updated successfully');
            }
          }
        }
      }
      
      // Handle DNC - add to DNC list
      if (queueStatus === 'dnc' && to) {
        const { data: queueItem } = await supabase
          .from('broadcast_queue')
          .select('lead_id, broadcast:voice_broadcasts(user_id)')
          .eq('id', queueItemId)
          .maybeSingle();
        
        const broadcastData = queueItem?.broadcast as any;
        const broadcast = Array.isArray(broadcastData) ? broadcastData[0] : broadcastData;
        if (broadcast?.user_id && queueItem) {
          // Add to DNC list
          await supabase
            .from('dnc_list')
            .upsert({
              user_id: broadcast.user_id,
              phone_number: to.replace(/\D/g, ''),
              reason: 'Opted out via voice broadcast DTMF',
              added_at: new Date().toISOString()
            }, { onConflict: 'user_id,phone_number' });
          
          // Update lead if exists
          if (queueItem.lead_id) {
            await supabase
              .from('leads')
              .update({ do_not_call: true, status: 'dnc' })
              .eq('id', queueItem.lead_id);
          }
        }
      }
      
      // Handle callback scheduling
      if (queueStatus === 'callback') {
        const { data: queueItem } = await supabase
          .from('broadcast_queue')
          .select('lead_id, broadcast:voice_broadcasts(user_id)')
          .eq('id', queueItemId)
          .maybeSingle();
        
        if (queueItem?.lead_id) {
          // Schedule callback for next business day at 10 AM
          const nextCallback = new Date();
          nextCallback.setDate(nextCallback.getDate() + 1);
          nextCallback.setHours(10, 0, 0, 0);
          
          await supabase
            .from('leads')
            .update({ 
              next_callback_at: nextCallback.toISOString(),
              status: 'callback'
            })
            .eq('id', queueItem.lead_id);
          
          // Also update the queue item with callback time
          await supabase
            .from('broadcast_queue')
            .update({ callback_scheduled_at: nextCallback.toISOString() })
            .eq('id', queueItemId);
        }
      }
    }

    console.log('Returning TwiML response');
    return new Response(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    });
    
  } catch (error: any) {
    console.error('DTMF handler error:', error.message, error.stack);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>An error occurred. Goodbye.</Say>
  <Hangup/>
</Response>`, {
      status: 200,
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    });
  }
});
