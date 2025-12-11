import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * Twilio Inbound Call Handler - Minimal test version
 */

serve(async (req) => {
  const url = new URL(req.url);
  console.log(`[Inbound] ${req.method} ${url.pathname}`);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    });
  }

  // Parse Twilio form data
  const body = await req.text();
  const params = new URLSearchParams(body);
  const digits = params.get('Digits') || '';
  const action = url.searchParams.get('action') || 'greeting';
  
  console.log(`[Inbound] Action: ${action}, Digits: "${digits}"`);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const dtmfUrl = `${supabaseUrl}/functions/v1/twilio-inbound-handler?action=dtmf`;

  let twiml: string;

  if (action === 'dtmf') {
    // Handle DTMF response
    let message = 'Invalid option. Goodbye.';
    if (digits === '1') message = 'Connecting you now.';
    else if (digits === '2') message = 'We will call you back. Goodbye.';
    else if (digits === '3') message = 'You have been removed from our list. Goodbye.';
    
    twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">${message}</Say><Hangup/></Response>`;
  } else {
    // Initial greeting with Gather
    twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="dtmf" numDigits="1" action="${dtmfUrl}" method="POST" timeout="10"><Say voice="alice">Thank you for calling back. Press 1 to speak with an agent. Press 2 to request a callback. Press 3 to be removed from our list.</Say></Gather><Say voice="alice">We did not receive a response. Goodbye.</Say><Hangup/></Response>`;
  }

  console.log('[Inbound] Returning TwiML:', twiml.substring(0, 100));
  
  return new Response(twiml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  });
});
