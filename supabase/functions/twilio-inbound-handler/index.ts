import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Inbound call handler for Twilio
// This handles when someone calls back one of your phone numbers

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  const url = new URL(req.url);
  console.log(`Inbound Handler - Method: ${req.method}, URL: ${req.url}`);
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse form data from Twilio
    let from = '';
    let to = '';
    let callSid = '';
    let digits = '';
    
    const contentType = req.headers.get('content-type') || '';
    console.log('Content-Type:', contentType);
    
    if (contentType.includes('form')) {
      const formData = await req.formData();
      from = formData.get('From')?.toString() || '';
      to = formData.get('To')?.toString() || '';
      callSid = formData.get('CallSid')?.toString() || '';
      digits = formData.get('Digits')?.toString() || '';
      console.log(`Inbound call - From: ${from}, To: ${to}, CallSid: ${callSid}, Digits: ${digits}`);
    } else {
      const body = await req.text();
      console.log('Raw body:', body);
      // Try to parse URL-encoded data
      const params = new URLSearchParams(body);
      from = params.get('From') || '';
      to = params.get('To') || '';
      callSid = params.get('CallSid') || '';
      digits = params.get('Digits') || '';
    }

    // Get the action from URL params (for DTMF gathering)
    const action = url.searchParams.get('action') || 'greeting';
    const transferNumber = url.searchParams.get('transfer') || '';
    const agentId = url.searchParams.get('agent') || '';

    // Try to find the phone number in our database to get its configuration
    const { data: phoneNumber } = await supabase
      .from('phone_numbers')
      .select('*')
      .eq('number', to)
      .single();

    console.log(`Phone number found: ${phoneNumber?.id || 'not found'}, Action: ${action}`);

    // If this is a DTMF response
    if (action === 'dtmf' && digits) {
      console.log(`DTMF received: ${digits}`);
      
      // Log the interaction (don't await to avoid blocking)
      supabase.from('call_logs').insert({
        user_id: phoneNumber?.user_id,
        phone_number: from,
        caller_id: to,
        status: 'answered',
        outcome: 'answered', // Use valid outcome, store details in notes
        notes: `Inbound call - Caller pressed ${digits}`
      }).catch(e => console.error('Failed to log DTMF:', e.message));

      // Handle DTMF responses
      let twiml = '';
      switch (digits) {
        case '1':
          if (transferNumber) {
            twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">Connecting you to an agent now.</Say>
  <Dial timeout="30">
    <Number>${transferNumber}</Number>
  </Dial>
  <Say voice="Polly.Amy">We could not connect you. Please try again later.</Say>
  <Hangup/>
</Response>`;
          } else {
            twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">Thank you for your interest. Someone will contact you shortly.</Say>
  <Hangup/>
</Response>`;
          }
          break;
        case '2':
          twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">We will call you back at a more convenient time. Goodbye.</Say>
  <Hangup/>
</Response>`;
          break;
        case '3':
          // Add to DNC list
          if (phoneNumber?.user_id) {
            await supabase.from('dnc_list').upsert({
              user_id: phoneNumber.user_id,
              phone_number: from,
              reason: 'Requested via inbound IVR',
              added_at: new Date().toISOString()
            }, { onConflict: 'user_id,phone_number' });
          }
          twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">You have been removed from our calling list. Goodbye.</Say>
  <Hangup/>
</Response>`;
          break;
        default:
          twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">Invalid option. Goodbye.</Say>
  <Hangup/>
</Response>`;
      }

      return new Response(twiml, {
        status: 200,
        headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      });
    }

    // If we have a Retell agent configured, connect to it
    if (agentId || phoneNumber?.retell_phone_id) {
      const retellApiKey = Deno.env.get('RETELL_AI_API_KEY');
      if (retellApiKey) {
        console.log('Connecting inbound call to Retell AI agent');
        
        // For Retell, we need to forward the call to Retell's infrastructure
        // This requires a different approach - returning TwiML that dials Retell
        // Note: Retell handles this differently, typically through their webhook
        
        // Log the inbound call (don't await to avoid blocking)
        supabase.from('call_logs').insert({
          user_id: phoneNumber?.user_id,
          phone_number: from,
          caller_id: to,
          status: 'initiated',
          outcome: 'answered',
          notes: 'Inbound call routed to Retell AI'
        }).catch(e => console.error('Failed to log Retell call:', e.message));
      }
    }

    // Build the webhook URL for DTMF handling
    const dtmfWebhookUrl = `${supabaseUrl}/functions/v1/twilio-inbound-handler?action=dtmf&transfer=${encodeURIComponent(transferNumber)}`;

    // Default greeting with IVR options
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf" numDigits="1" action="${dtmfWebhookUrl}" method="POST" timeout="10">
    <Say voice="Polly.Amy">
      Thank you for calling back. 
      Press 1 to speak with an agent.
      Press 2 to request a callback at a different time.
      Press 3 to be removed from our calling list.
    </Say>
  </Gather>
  <Say voice="Polly.Amy">We didn't receive a response. Goodbye.</Say>
  <Hangup/>
</Response>`;

    // Log the inbound call (don't await to avoid blocking)
    if (phoneNumber?.user_id) {
      supabase.from('call_logs').insert({
        user_id: phoneNumber.user_id,
        phone_number: from,
        caller_id: to,
        status: 'initiated',
        outcome: 'answered', // Use valid outcome value
        notes: 'Inbound call received'
      }).then(() => console.log('Call logged successfully'))
        .catch(e => console.error('Failed to log call:', e.message));
    }

    console.log('Returning inbound greeting TwiML');
    return new Response(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    });

  } catch (error: any) {
    console.error('Inbound handler error:', error.message, error.stack);
    // Return a graceful error message
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">We're sorry, we're experiencing technical difficulties. Please try again later.</Say>
  <Hangup/>
</Response>`, {
      status: 200,
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    });
  }
});
