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

    const { toNumber, fromNumber, message } = await req.json();

    if (!toNumber || !fromNumber || !message) {
      throw new Error('Missing required fields: toNumber, fromNumber, message');
    }

    // Format numbers
    const formattedTo = toNumber.replace(/\D/g, '');
    const formattedToE164 = formattedTo.startsWith('1') ? `+${formattedTo}` : `+1${formattedTo}`;

    console.log(`Making test call from ${fromNumber} to ${formattedToE164}`);
    console.log(`Message: ${message}`);

    // Create TwiML for the call with DTMF gathering
    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf" numDigits="1" action="${supabaseUrl}/functions/v1/quick-test-call?action=dtmf" method="POST" timeout="15">
    <Say voice="Polly.Joanna">${message}</Say>
    <Say voice="Polly.Joanna">Press 1 if you are interested. Press 2 to schedule a callback. Press 3 to opt out.</Say>
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

    // Log the test call
    await supabase.from('call_logs').insert({
      user_id: user.id,
      phone_number: formattedToE164,
      caller_id: fromNumber,
      status: 'initiated',
      notes: `Test broadcast: ${message}`,
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        callSid: result.sid,
        to: formattedToE164,
        from: fromNumber,
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
