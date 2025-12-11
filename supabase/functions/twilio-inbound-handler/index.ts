import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Twilio Inbound Call Handler
 * Testing with Twilio's own hosted audio first, then ElevenLabs
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizePhoneNumber(phone: string): string[] {
  const cleaned = phone.replace(/\D/g, '');
  return [phone, `+${cleaned}`, cleaned, cleaned.slice(-10), `+1${cleaned.slice(-10)}`];
}

serve(async (req) => {
  const url = new URL(req.url);
  console.log(`[Inbound] ${req.method} ${url.pathname}${url.search}`);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse Twilio form data
    const body = await req.text();
    const params = new URLSearchParams(body);
    
    const from = params.get('From') || '';
    const to = params.get('To') || '';
    const callSid = params.get('CallSid') || '';
    const digits = params.get('Digits') || '';
    const callStatus = params.get('CallStatus') || '';
    
    console.log(`[Inbound] From: ${from}, To: ${to}, Digits: "${digits}", Status: ${callStatus}`);

    const action = url.searchParams.get('action') || 'greeting';
    const transferNumber = url.searchParams.get('transfer') || '';
    
    console.log(`[Inbound] Action: ${action}`);

    // Find phone number
    let phoneNumber = null;
    for (const format of normalizePhoneNumber(to)) {
      const { data } = await supabase
        .from('phone_numbers')
        .select('*')
        .eq('number', format)
        .maybeSingle();
      if (data) {
        phoneNumber = data;
        console.log(`[Inbound] Phone found: ${data.id}`);
        break;
      }
    }

    // Handle DTMF
    if (action === 'dtmf') {
      console.log(`[Inbound] DTMF received: "${digits}"`);
      
      if (phoneNumber?.user_id) {
        supabase.from('call_logs').insert({
          user_id: phoneNumber.user_id,
          phone_number: from,
          caller_id: to,
          status: 'answered',
          outcome: 'answered',
          notes: `IVR: ${digits || 'timeout'}`
        }).then(({ error }) => {
          if (error) console.error('[Inbound] Log error:', error.message);
        });
      }

      let responseTwiml = '';
      switch (digits) {
        case '1':
          responseTwiml = '<Say voice="alice">Connecting you now.</Say><Hangup/>';
          break;
        case '2':
          responseTwiml = '<Say voice="alice">We will call you back. Goodbye.</Say><Hangup/>';
          break;
        case '3':
          if (phoneNumber?.user_id) {
            await supabase.from('dnc_list').upsert({
              user_id: phoneNumber.user_id,
              phone_number: from,
              reason: 'IVR opt-out',
              added_at: new Date().toISOString()
            }, { onConflict: 'user_id,phone_number' });
          }
          responseTwiml = '<Say voice="alice">You have been removed. Goodbye.</Say><Hangup/>';
          break;
        default:
          responseTwiml = '<Say voice="alice">Invalid option. Goodbye.</Say><Hangup/>';
      }
      
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
${responseTwiml}
</Response>`;
      
      console.log('[Inbound] DTMF response TwiML');
      return new Response(twiml, {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    // Log call
    if (phoneNumber?.user_id) {
      supabase.from('call_logs').insert({
        user_id: phoneNumber.user_id,
        phone_number: from,
        caller_id: to,
        status: 'initiated',
        outcome: 'answered',
        notes: 'Inbound IVR'
      }).then(({ error }) => {
        if (error) console.error('[Inbound] Log error:', error.message);
      });
    }

    const dtmfUrl = `${supabaseUrl}/functions/v1/twilio-inbound-handler?action=dtmf&transfer=${encodeURIComponent(transferNumber)}`;

    // Use Twilio's built-in voice with proper TwiML formatting
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf" numDigits="1" action="${dtmfUrl}" method="POST" timeout="10">
    <Say voice="alice">Thank you for calling back. Press 1 to speak with an agent. Press 2 to request a callback. Press 3 to be removed from our list.</Say>
  </Gather>
  <Say voice="alice">We did not receive a response. Goodbye.</Say>
  <Hangup/>
</Response>`;

    console.log('[Inbound] Returning IVR TwiML with alice voice');
    console.log('[Inbound] TwiML length:', twiml.length);
    
    return new Response(twiml, {
      status: 200,
      headers: { 
        'Content-Type': 'text/xml',
        'Cache-Control': 'no-cache',
      },
    });

  } catch (error: any) {
    console.error('[Inbound] Error:', error.message, error.stack);
    
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Sorry, technical difficulties. Please try again.</Say>
  <Hangup/>
</Response>`;
    
    return new Response(errorTwiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  }
});
