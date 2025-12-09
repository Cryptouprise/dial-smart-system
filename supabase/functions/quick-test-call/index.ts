import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Escape XML special characters
const escapeXml = (str: string) => {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

  console.log(`Request received - Method: ${req.method}, Action: ${action || 'none'}, Full URL: ${req.url}`);

  // Handle TwiML request - Twilio fetches this to get call instructions
  if (action === 'twiml') {
    try {
      console.log('Twilio requesting TwiML...');
      const messageParam = url.searchParams.get('message') || 'Hello, this is a test call.';
      const transferNumber = url.searchParams.get('transfer') || '';
      
      let message = messageParam;
      try {
        message = decodeURIComponent(messageParam);
      } catch (e) {
        console.log('Message decode note:', e);
      }
      
      const safeMessage = escapeXml(message);
      
      // Build DTMF action URL - put action last to avoid encoding issues
      const dtmfUrl = transferNumber 
        ? `${supabaseUrl}/functions/v1/quick-test-call?transfer=${encodeURIComponent(transferNumber)}&action=dtmf`
        : `${supabaseUrl}/functions/v1/quick-test-call?action=dtmf`;
      
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf" numDigits="1" action="${dtmfUrl}" method="POST" timeout="10">
    <Say>${safeMessage}</Say>
    <Pause length="1"/>
    <Say>Press 1 to speak with someone now. Press 2 to schedule a callback. Press 3 to opt out.</Say>
  </Gather>
  <Say>We did not receive a response. Goodbye.</Say>
  <Hangup/>
</Response>`;

      console.log('Returning TwiML with DTMF, action URL:', dtmfUrl);
      return new Response(twiml, {
        status: 200,
        headers: { 
          'Content-Type': 'text/xml; charset=utf-8',
          'Cache-Control': 'no-cache'
        },
      });
    } catch (error: any) {
      console.error('TwiML generation error:', error.message);
      return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Sorry, there was an error.</Say>
  <Hangup/>
</Response>`, {
        status: 200,
        headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      });
    }
  }

  // Handle DTMF webhooks from Twilio (when user presses a key)
  if (action === 'dtmf') {
    console.log('Processing DTMF webhook...');
    try {
      const formData = await req.formData();
      const digits = formData.get('Digits')?.toString() || '';
      const callSid = formData.get('CallSid')?.toString() || '';
      const from = formData.get('From')?.toString() || '';
      const to = formData.get('To')?.toString() || '';
      const transferNumber = url.searchParams.get('transfer') || '';
      
      console.log(`DTMF received: digits=${digits}, callSid=${callSid}, transfer=${transferNumber}`);

      let twiml = '';
      
      if (digits === '1') {
        if (transferNumber) {
          console.log(`Transferring call to ${transferNumber}`);
          twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Connecting you now. Please hold.</Say>
  <Dial callerId="${to}" timeout="30">
    <Number>${transferNumber}</Number>
  </Dial>
  <Say>Sorry, we could not connect you. Goodbye.</Say>
  <Hangup/>
</Response>`;
        } else {
          twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Thank you for your interest. A representative will call you back shortly. Goodbye.</Say>
  <Hangup/>
</Response>`;
        }
      } else if (digits === '2') {
        console.log(`Callback requested for ${from}`);
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We have scheduled a callback for you. You will hear from us soon. Goodbye.</Say>
  <Hangup/>
</Response>`;
      } else if (digits === '3') {
        console.log(`Opt-out requested for ${from}`);
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>You have been removed from our call list. Goodbye.</Say>
  <Hangup/>
</Response>`;
      } else {
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Invalid selection. Goodbye.</Say>
  <Hangup/>
</Response>`;
      }

      return new Response(twiml, {
        status: 200,
        headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      });
      
    } catch (error: any) {
      console.error('DTMF processing error:', error.message);
      return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>An error occurred. Goodbye.</Say>
  <Hangup/>
</Response>`, {
        status: 200,
        headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      });
    }
  }

  // Main call initiation (POST from frontend)
  console.log('Processing call initiation...');
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');

    if (!twilioAccountSid || !twilioAuthToken) {
      throw new Error('Twilio credentials not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { toNumber, fromNumber, message, transferNumber } = await req.json();

    if (!toNumber || !fromNumber || !message) {
      throw new Error('Missing required fields: toNumber, fromNumber, message');
    }

    // Format phone numbers
    const cleanTo = toNumber.replace(/\D/g, '');
    const formattedTo = cleanTo.startsWith('1') ? `+${cleanTo}` : `+1${cleanTo}`;
    
    let formattedTransfer = '';
    if (transferNumber) {
      const cleanTransfer = transferNumber.replace(/\D/g, '');
      formattedTransfer = cleanTransfer.startsWith('1') ? `+${cleanTransfer}` : `+1${cleanTransfer}`;
    }

    console.log(`Initiating call: from=${fromNumber}, to=${formattedTo}, transfer=${formattedTransfer || 'none'}`);

    // Build TwiML URL that Twilio will fetch
    const twimlUrl = `${supabaseUrl}/functions/v1/quick-test-call?action=twiml&message=${encodeURIComponent(message)}${formattedTransfer ? `&transfer=${encodeURIComponent(formattedTransfer)}` : ''}`;
    
    console.log('TwiML URL:', twimlUrl);

    // Make Twilio call
    const twilioResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Calls.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: formattedTo,
          From: fromNumber,
          Url: twimlUrl,
          Method: 'GET',
        }),
      }
    );

    if (!twilioResponse.ok) {
      const errorText = await twilioResponse.text();
      console.error('Twilio API error:', errorText);
      throw new Error(`Twilio error: ${errorText}`);
    }

    const result = await twilioResponse.json();
    console.log('Call initiated successfully:', result.sid);

    // Log call (non-blocking)
    supabase.from('call_logs').insert({
      user_id: user.id,
      phone_number: formattedTo,
      caller_id: fromNumber,
      status: 'queued',
      notes: `Test broadcast | Transfer: ${formattedTransfer || 'none'}`,
    }).then(() => console.log('Call logged')).catch(e => console.log('Log error (ignored):', e.message));

    return new Response(
      JSON.stringify({ 
        success: true, 
        callSid: result.sid,
        to: formattedTo,
        from: fromNumber,
        transferNumber: formattedTransfer || null,
        message: 'Test call initiated!',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Call initiation error:', error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
