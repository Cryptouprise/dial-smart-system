import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Inbound call handler for Twilio
// This handles when someone calls back one of your phone numbers

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper to normalize phone numbers for database lookup
function normalizePhoneNumber(phone: string): string[] {
  const cleaned = phone.replace(/\D/g, '');
  // Return multiple formats to try matching
  return [
    phone,                          // Original: +19496702566
    `+${cleaned}`,                  // With +: +19496702566
    cleaned,                        // Raw digits: 19496702566
    cleaned.slice(-10),             // Last 10: 9496702566
    `+1${cleaned.slice(-10)}`,      // US format: +19496702566
  ];
}

// Generate simple TwiML response
function generateTwiML(content: string): Response {
  console.log('Returning TwiML:', content.substring(0, 200) + '...');
  return new Response(content, {
    status: 200,
    headers: { 
      'Content-Type': 'text/xml',
      ...corsHeaders 
    },
  });
}

serve(async (req) => {
  const url = new URL(req.url);
  console.log(`[Inbound] Method: ${req.method}, Path: ${url.pathname}, Search: ${url.search}`);
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse form data from Twilio (always URL-encoded)
    let from = '';
    let to = '';
    let callSid = '';
    let digits = '';
    let callStatus = '';
    
    const contentType = req.headers.get('content-type') || '';
    console.log('[Inbound] Content-Type:', contentType);
    
    // Twilio sends application/x-www-form-urlencoded
    const body = await req.text();
    console.log('[Inbound] Raw body length:', body.length);
    
    const params = new URLSearchParams(body);
    from = params.get('From') || '';
    to = params.get('To') || '';
    callSid = params.get('CallSid') || '';
    digits = params.get('Digits') || '';
    callStatus = params.get('CallStatus') || '';
    
    console.log(`[Inbound] From: ${from}, To: ${to}, CallSid: ${callSid}, Digits: ${digits}, Status: ${callStatus}`);

    // Get the action from URL params (for DTMF gathering)
    const action = url.searchParams.get('action') || 'greeting';
    const transferNumber = url.searchParams.get('transfer') || '';
    
    console.log(`[Inbound] Action: ${action}, Transfer: ${transferNumber}`);

    // Try to find the phone number in our database with multiple format attempts
    let phoneNumber = null;
    const numberFormats = normalizePhoneNumber(to);
    
    for (const format of numberFormats) {
      const { data } = await supabase
        .from('phone_numbers')
        .select('*')
        .eq('number', format)
        .maybeSingle();
      
      if (data) {
        phoneNumber = data;
        console.log(`[Inbound] Phone found with format: ${format}, ID: ${data.id}`);
        break;
      }
    }
    
    if (!phoneNumber) {
      console.log('[Inbound] Phone number not found in database, using default greeting');
    }

    // Handle DTMF response
    if (action === 'dtmf') {
      console.log(`[Inbound] DTMF received: "${digits}"`);
      
      // Log the interaction asynchronously
      if (phoneNumber?.user_id) {
        supabase.from('call_logs').insert({
          user_id: phoneNumber.user_id,
          phone_number: from,
          caller_id: to,
          status: 'answered',
          outcome: 'answered',
          notes: `Inbound IVR - Pressed ${digits || 'nothing'}`
        }).then(() => console.log('[Inbound] DTMF logged'))
          .catch(e => console.error('[Inbound] Failed to log DTMF:', e.message));
      }

      if (!digits) {
        // No input received - timeout
        return generateTwiML(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>We did not receive your input. Goodbye.</Say><Hangup/></Response>`);
      }

      switch (digits) {
        case '1':
          if (transferNumber) {
            return generateTwiML(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>Connecting you to an agent now. Please hold.</Say><Dial timeout="30"><Number>${transferNumber}</Number></Dial><Say>We could not connect you. Please try again later.</Say><Hangup/></Response>`);
          }
          return generateTwiML(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>Thank you for your interest. Someone will contact you shortly. Goodbye.</Say><Hangup/></Response>`);
        
        case '2':
          return generateTwiML(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>We will call you back at a more convenient time. Goodbye.</Say><Hangup/></Response>`);
        
        case '3':
          // Add to DNC list
          if (phoneNumber?.user_id) {
            await supabase.from('dnc_list').upsert({
              user_id: phoneNumber.user_id,
              phone_number: from,
              reason: 'Requested via inbound IVR',
              added_at: new Date().toISOString()
            }, { onConflict: 'user_id,phone_number' });
            console.log('[Inbound] Added to DNC list:', from);
          }
          return generateTwiML(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>You have been removed from our calling list. Goodbye.</Say><Hangup/></Response>`);
        
        default:
          return generateTwiML(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>Invalid option. Goodbye.</Say><Hangup/></Response>`);
      }
    }

    // Build the webhook URL for DTMF handling
    const dtmfWebhookUrl = `${supabaseUrl}/functions/v1/twilio-inbound-handler?action=dtmf&transfer=${encodeURIComponent(transferNumber)}`;
    console.log('[Inbound] DTMF callback URL:', dtmfWebhookUrl);

    // Log the inbound call asynchronously
    if (phoneNumber?.user_id) {
      supabase.from('call_logs').insert({
        user_id: phoneNumber.user_id,
        phone_number: from,
        caller_id: to,
        status: 'initiated',
        outcome: 'answered',
        notes: 'Inbound call - IVR greeting played'
      }).then(() => console.log('[Inbound] Call logged successfully'))
        .catch(e => console.error('[Inbound] Failed to log call:', e.message));
    }

    // Return IVR greeting with Gather
    // Using default Twilio voice (not Polly which requires extra setup)
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="dtmf" numDigits="1" action="${dtmfWebhookUrl}" method="POST" timeout="10"><Say>Thank you for calling back. Press 1 to speak with an agent. Press 2 to request a callback at a different time. Press 3 to be removed from our calling list.</Say></Gather><Say>We did not receive a response. Goodbye.</Say><Hangup/></Response>`;

    console.log('[Inbound] Returning IVR greeting');
    return generateTwiML(twiml);

  } catch (error: any) {
    console.error('[Inbound] Error:', error.message, error.stack);
    // Return a graceful error message - must still return valid TwiML
    return generateTwiML(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>We are sorry, we are experiencing technical difficulties. Please try again later.</Say><Hangup/></Response>`);
  }
});
