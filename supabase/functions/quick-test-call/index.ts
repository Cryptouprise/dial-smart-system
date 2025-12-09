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

  const url = new URL(req.url);
  const action = url.searchParams.get('action');

  // Handle Twilio webhooks (DTMF responses)
  if (action === 'dtmf') {
    try {
      const formData = await req.formData();
      const digits = formData.get('Digits')?.toString() || '';
      const callSid = formData.get('CallSid')?.toString() || '';
      const from = formData.get('From')?.toString() || '';
      const to = formData.get('To')?.toString() || '';
      
      console.log(`DTMF received: ${digits} for call ${callSid}`);
      console.log(`From: ${from}, To: ${to}`);

      // Get transfer number from the CallUrl or default
      const transferNumber = url.searchParams.get('transfer') || '';

      let twimlResponse = '';
      
      switch (digits) {
        case '1':
          // Transfer to agent/AI number
          if (transferNumber) {
            console.log(`Transferring call to ${transferNumber}`);
            twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Great! Connecting you now. Please hold.</Say>
  <Dial callerId="${to}" timeout="30">
    <Number>${transferNumber}</Number>
  </Dial>
  <Say voice="Polly.Joanna">Sorry, we couldn't connect you. Please try again later.</Say>
  <Hangup/>
</Response>`;
          } else {
            twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Thank you for your interest! A representative will call you back shortly.</Say>
  <Hangup/>
</Response>`;
          }
          break;
          
        case '2':
          // Schedule callback
          console.log(`Callback requested for ${from}`);
          twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Perfect! We've scheduled a callback for you. You'll hear from us within 24 hours. Goodbye!</Say>
  <Hangup/>
</Response>`;
          break;
          
        case '3':
          // Opt out / DNC
          console.log(`Opt-out requested for ${from}`);
          twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">We've removed you from our call list. You will not receive any more calls from us. Goodbye!</Say>
  <Hangup/>
</Response>`;
          break;
          
        default:
          // Invalid option
          twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Sorry, I didn't understand that. Goodbye!</Say>
  <Hangup/>
</Response>`;
      }

      return new Response(twimlResponse, {
        headers: { 'Content-Type': 'text/xml' },
      });
      
    } catch (error: any) {
      console.error('DTMF handling error:', error);
      const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">An error occurred. Goodbye!</Say>
  <Hangup/>
</Response>`;
      return new Response(errorTwiml, {
        headers: { 'Content-Type': 'text/xml' },
      });
    }
  }

  // Handle status callbacks
  if (action === 'status') {
    try {
      const formData = await req.formData();
      const callSid = formData.get('CallSid')?.toString() || '';
      const callStatus = formData.get('CallStatus')?.toString() || '';
      const callDuration = formData.get('CallDuration')?.toString() || '0';
      
      console.log(`Call ${callSid} status: ${callStatus}, duration: ${callDuration}s`);
      
      return new Response('OK', { status: 200 });
    } catch (error) {
      console.error('Status webhook error:', error);
      return new Response('OK', { status: 200 });
    }
  }

  // Main call initiation
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
      throw new Error('Twilio credentials not configured. Please add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { toNumber, fromNumber, message, transferNumber } = await req.json();

    if (!toNumber || !fromNumber || !message) {
      throw new Error('Missing required fields: toNumber, fromNumber, message');
    }

    // Format numbers
    const formattedTo = toNumber.replace(/\D/g, '');
    const formattedToE164 = formattedTo.startsWith('1') ? `+${formattedTo}` : `+1${formattedTo}`;
    
    // Format transfer number if provided
    let formattedTransfer = '';
    if (transferNumber) {
      const cleanTransfer = transferNumber.replace(/\D/g, '');
      formattedTransfer = cleanTransfer.startsWith('1') ? `+${cleanTransfer}` : `+1${cleanTransfer}`;
    }

    console.log(`Making test call from ${fromNumber} to ${formattedToE164}`);
    console.log(`Transfer number: ${formattedTransfer || 'Not configured'}`);
    console.log(`Message: ${message}`);

    // Build the DTMF action URL with transfer number
    const dtmfActionUrl = `${supabaseUrl}/functions/v1/quick-test-call?action=dtmf${formattedTransfer ? `&transfer=${encodeURIComponent(formattedTransfer)}` : ''}`;

    // Create TwiML for the call with DTMF gathering
    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf" numDigits="1" action="${dtmfActionUrl}" method="POST" timeout="15">
    <Say voice="Polly.Joanna">${message}</Say>
    <Say voice="Polly.Joanna">Press 1 to speak with someone now. Press 2 to schedule a callback. Press 3 to opt out of future calls.</Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive a response. Goodbye!</Say>
  <Hangup/>
</Response>`;

    // Make the Twilio API call
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Calls.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: formattedToE164,
          From: fromNumber,
          Twiml: twimlResponse,
          StatusCallback: `${supabaseUrl}/functions/v1/quick-test-call?action=status`,
          StatusCallbackEvent: 'initiated ringing answered completed',
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Twilio API error:', errorText);
      throw new Error(`Twilio error: ${errorText}`);
    }

    const result = await response.json();
    console.log('Call initiated:', result.sid);

    // Log the test call (use 'queued' status which is allowed by constraint)
    await supabase.from('call_logs').insert({
      user_id: user.id,
      phone_number: formattedToE164,
      caller_id: fromNumber,
      status: 'queued',
      notes: `Test broadcast: ${message}${formattedTransfer ? ` | Transfer: ${formattedTransfer}` : ''}`,
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        callSid: result.sid,
        to: formattedToE164,
        from: fromNumber,
        transferNumber: formattedTransfer || null,
        message: 'Test call initiated! You should receive a call shortly.',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Quick test call error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
