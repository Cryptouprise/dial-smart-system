import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get('action');

  console.log(`Request received - Method: ${req.method}, Action: ${action || 'none'}`);

  // Handle DTMF webhooks from Twilio
  if (action === 'dtmf') {
    console.log('Processing DTMF webhook...');
    try {
      const formData = await req.formData();
      const digits = formData.get('Digits')?.toString() || '';
      const callSid = formData.get('CallSid')?.toString() || '';
      const from = formData.get('From')?.toString() || '';
      const to = formData.get('To')?.toString() || '';
      const transferNumber = url.searchParams.get('transfer') || '';
      
      console.log(`DTMF received: digits=${digits}, callSid=${callSid}, from=${from}, to=${to}, transfer=${transferNumber}`);

      let twimlResponse = '';
      
      if (digits === '1') {
        if (transferNumber) {
          console.log(`Transferring call to ${transferNumber}`);
          twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Great! Connecting you now. Please hold.</Say>
  <Dial callerId="${to}" timeout="30">
    <Number>${transferNumber}</Number>
  </Dial>
  <Say>Sorry, we could not connect you. Please try again later.</Say>
  <Hangup/>
</Response>`;
        } else {
          twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Thank you for your interest! A representative will call you back shortly.</Say>
  <Hangup/>
</Response>`;
        }
      } else if (digits === '2') {
        console.log(`Callback requested for ${from}`);
        twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Perfect! We have scheduled a callback for you. You will hear from us within 24 hours. Goodbye!</Say>
  <Hangup/>
</Response>`;
      } else if (digits === '3') {
        console.log(`Opt-out requested for ${from}`);
        twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We have removed you from our call list. You will not receive any more calls from us. Goodbye!</Say>
  <Hangup/>
</Response>`;
      } else {
        twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Sorry, I did not understand that. Goodbye!</Say>
  <Hangup/>
</Response>`;
      }

      console.log('Returning DTMF TwiML response');
      return new Response(twimlResponse, {
        status: 200,
        headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      });
      
    } catch (error: any) {
      console.error('DTMF processing error:', error.message);
      return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>An error occurred. Goodbye!</Say>
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
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

    console.log(`Initiating call: from=${fromNumber}, to=${formattedTo}`);

    // Simple TwiML - just play the message
    const inlineTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>${message}</Say>
  <Hangup/>
</Response>`;

    console.log('Using simple inline TwiML');

    // Make Twilio call with inline TwiML using the 'Twiml' parameter
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
          Twiml: inlineTwiml,  // Use Twiml parameter for inline TwiML
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