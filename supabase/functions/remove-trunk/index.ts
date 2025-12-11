import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phoneNumber } = await req.json();
    
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');

    if (!twilioAccountSid || !twilioAuthToken) {
      return new Response(JSON.stringify({ error: 'Twilio credentials not configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const encodeCredentials = (accountSid: string, authToken: string): string => {
      const credentials = `${accountSid}:${authToken}`;
      const encoder = new TextEncoder();
      return base64Encode(encoder.encode(credentials));
    };

    console.log('🔍 Finding number:', phoneNumber);

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
      return new Response(JSON.stringify({ error: 'Failed to fetch phone numbers', details: errorText }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const numbersData = await numbersResponse.json();
    const allNumbers = numbersData.incoming_phone_numbers || [];
    
    // Find the specific number
    const normalizedSearch = phoneNumber?.replace(/\D/g, '');
    const foundNumber = allNumbers.find((num: any) => {
      const normalizedNum = num.phone_number.replace(/\D/g, '');
      return normalizedNum === normalizedSearch || normalizedNum.endsWith(normalizedSearch);
    });

    if (!foundNumber) {
      return new Response(JSON.stringify({ error: 'Number not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('✅ Found number:', foundNumber.phone_number);
    console.log('🔗 Current trunk_sid:', foundNumber.trunk_sid || '(none)');

    // Remove the trunk and set our voice URL
    const voiceUrl = `${supabaseUrl}/functions/v1/twilio-inbound-handler`;
    
    console.log('🔧 Removing trunk and setting voice URL to:', voiceUrl);

    const updateResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers/${foundNumber.sid}.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        // Setting TrunkSid to empty string removes the trunk association
        body: `TrunkSid=&VoiceUrl=${encodeURIComponent(voiceUrl)}&VoiceMethod=POST`
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error('❌ Failed to update number:', errorText);
      return new Response(JSON.stringify({ error: 'Failed to update number', details: errorText }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const updatedNumber = await updateResponse.json();
    console.log('✅ Number updated successfully');
    console.log('📞 New voice_url:', updatedNumber.voice_url);
    console.log('🔗 New trunk_sid:', updatedNumber.trunk_sid || '(removed)');

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Trunk removed and voice webhook configured',
      number: updatedNumber.phone_number,
      previous_trunk_sid: foundNumber.trunk_sid,
      new_trunk_sid: updatedNumber.trunk_sid || null,
      voice_url: updatedNumber.voice_url
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
