import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

// Simple public endpoint to configure all Twilio numbers for inbound calls
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');

    if (!twilioAccountSid || !twilioAuthToken) {
      return new Response(JSON.stringify({ error: 'Twilio credentials not configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const voiceUrl = `${supabaseUrl}/functions/v1/twilio-inbound-handler`;
    console.log('📞 Setting up inbound calls for ALL Twilio numbers');
    console.log('📍 Voice webhook URL:', voiceUrl);

    // Encode credentials
    const encodeCredentials = (accountSid: string, authToken: string): string => {
      const credentials = `${accountSid}:${authToken}`;
      return btoa(credentials);
    };

    // Get all phone numbers from Twilio
    const numbersResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers.json?PageSize=100`,
      {
        headers: {
          'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken)
        }
      }
    );

    if (!numbersResponse.ok) {
      const errorText = await numbersResponse.text();
      console.error('❌ Failed to fetch phone numbers:', errorText);
      return new Response(JSON.stringify({ error: 'Failed to fetch phone numbers', details: errorText }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const numbersData = await numbersResponse.json();
    const allNumbers = numbersData.incoming_phone_numbers || [];
    console.log(`📲 Found ${allNumbers.length} Twilio numbers to configure`);

    const configured: string[] = [];
    const failed: { number: string; error: string }[] = [];

    for (const num of allNumbers) {
      console.log('📲 Setting voice webhook for:', num.phone_number);
      
      const updateResponse = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers/${num.sid}.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: `VoiceUrl=${encodeURIComponent(voiceUrl)}&VoiceMethod=POST`
        }
      );

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        console.error('❌ Failed:', num.phone_number, errorText);
        failed.push({ number: num.phone_number, error: errorText });
      } else {
        console.log('✅ Configured:', num.phone_number);
        configured.push(num.phone_number);
      }
    }

    console.log('🎉 Setup complete - Configured:', configured.length, 'Failed:', failed.length);
    
    return new Response(JSON.stringify({ 
      success: true,
      message: `Configured ${configured.length} numbers for inbound calls`,
      voice_webhook_url: voiceUrl,
      configured_count: configured.length,
      failed_count: failed.length,
      configured,
      failed
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Setup error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
