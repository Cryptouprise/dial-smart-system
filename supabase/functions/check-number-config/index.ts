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

    console.log('🔍 Checking config for number:', phoneNumber);

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
    
    console.log(`📲 Found ${allNumbers.length} Twilio numbers`);
    
    // Find the specific number
    const normalizedSearch = phoneNumber?.replace(/\D/g, '');
    const foundNumber = allNumbers.find((num: any) => {
      const normalizedNum = num.phone_number.replace(/\D/g, '');
      return normalizedNum === normalizedSearch || normalizedNum.endsWith(normalizedSearch);
    });

    if (!foundNumber) {
      console.log('❌ Number not found in Twilio account');
      console.log('Available numbers:', allNumbers.map((n: any) => n.phone_number).join(', '));
      return new Response(JSON.stringify({ 
        error: 'Number not found in Twilio account',
        searched_for: phoneNumber,
        available_numbers: allNumbers.map((n: any) => n.phone_number)
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('✅ Found number:', foundNumber.phone_number);
    console.log('📞 Voice URL:', foundNumber.voice_url || '(empty)');
    console.log('📞 Voice Method:', foundNumber.voice_method || '(empty)');
    console.log('📞 Voice Fallback URL:', foundNumber.voice_fallback_url || '(empty)');
    console.log('📱 SMS URL:', foundNumber.sms_url || '(empty)');
    console.log('🆔 SID:', foundNumber.sid);

    return new Response(JSON.stringify({ 
      success: true,
      number: foundNumber.phone_number,
      sid: foundNumber.sid,
      voice_url: foundNumber.voice_url || null,
      voice_method: foundNumber.voice_method || null,
      voice_fallback_url: foundNumber.voice_fallback_url || null,
      voice_application_sid: foundNumber.voice_application_sid || null,
      voice_caller_id_lookup: foundNumber.voice_caller_id_lookup || null,
      trunk_sid: foundNumber.trunk_sid || null,
      sms_url: foundNumber.sms_url || null,
      sms_method: foundNumber.sms_method || null,
      sms_application_sid: foundNumber.sms_application_sid || null,
      status_callback: foundNumber.status_callback || null,
      status_callback_method: foundNumber.status_callback_method || null,
      friendly_name: foundNumber.friendly_name || null,
      capabilities: foundNumber.capabilities || null,
      emergency_status: foundNumber.emergency_status || null,
      emergency_address_sid: foundNumber.emergency_address_sid || null,
      bundle_sid: foundNumber.bundle_sid || null,
      origin: foundNumber.origin || null,
      // Include ALL fields to debug
      all_fields: foundNumber
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
