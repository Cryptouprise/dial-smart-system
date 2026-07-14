import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(JSON.stringify({
    success: false,
    disabled: true,
    error_code: 'CONTROL_PLANE_NOT_CERTIFIED',
    error: 'Voice-webhook control-plane changes are disabled until tenant ownership and operator authorization are certified.',
  }), {
    status: 503,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

  try {
    const { keepNumber } = await req.json();
    
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');

    if (!twilioAccountSid || !twilioAuthToken) {
      return new Response(JSON.stringify({ error: 'Twilio credentials not configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('🧹 Clearing voice webhooks from all numbers except:', keepNumber);

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
    console.log(`📲 Found ${allNumbers.length} Twilio numbers`);

    const cleared: string[] = [];
    const skipped: string[] = [];
    const failed: { number: string; error: string }[] = [];

    // Normalize the keepNumber for comparison
    const normalizedKeepNumber = keepNumber?.replace(/\D/g, '');

    for (const num of allNumbers) {
      const normalizedNum = num.phone_number.replace(/\D/g, '');
      
      // Skip the number we want to keep
      if (normalizedNum === normalizedKeepNumber || normalizedNum.endsWith(normalizedKeepNumber)) {
        console.log('⏭️ Skipping (keeping):', num.phone_number);
        skipped.push(num.phone_number);
        continue;
      }

      console.log('🧹 Clearing voice webhook for:', num.phone_number);
      
      // Clear the VoiceUrl by setting it to empty
      const updateResponse = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers/${num.sid}.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: `VoiceUrl=`
        }
      );

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        console.error('❌ Failed:', num.phone_number, errorText);
        failed.push({ number: num.phone_number, error: errorText });
      } else {
        console.log('✅ Cleared:', num.phone_number);
        cleared.push(num.phone_number);
      }
    }

    console.log('🎉 Done - Cleared:', cleared.length, 'Skipped:', skipped.length, 'Failed:', failed.length);
    
    return new Response(JSON.stringify({ 
      success: true,
      message: `Cleared voice webhooks from ${cleared.length} numbers, kept ${skipped.length}`,
      cleared_count: cleared.length,
      skipped_count: skipped.length,
      failed_count: failed.length,
      cleared,
      skipped,
      failed
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

