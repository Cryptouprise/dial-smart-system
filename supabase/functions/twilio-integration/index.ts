import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TwilioImportRequest {
  action: 'list_numbers' | 'import_number' | 'sync_all';
  phoneNumberSid?: string;
  phoneNumber?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const retellApiKey = Deno.env.get('RETELL_AI_API_KEY');

    if (!twilioAccountSid || !twilioAuthToken) {
      return new Response(JSON.stringify({ error: 'Twilio credentials not configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { action, phoneNumberSid, phoneNumber }: TwilioImportRequest = await req.json();

    // Helper function to encode credentials safely (handles UTF-8)
    const encodeCredentials = (accountSid: string, authToken: string): string => {
      const credentials = `${accountSid}:${authToken}`;
      const encoder = new TextEncoder();
      const data = encoder.encode(credentials);
      const base64 = btoa(String.fromCharCode(...Array.from(data)));
      return base64;
    };

    // List all Twilio numbers
    if (action === 'list_numbers') {
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers.json`,
        {
          headers: {
            'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken)
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch Twilio numbers');
      }

      const data = await response.json();
      return new Response(JSON.stringify({ numbers: data.incoming_phone_numbers }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Import single number
    if (action === 'import_number' && phoneNumber) {
      if (!retellApiKey) {
        return new Response(JSON.stringify({ error: 'Retell AI credentials not configured' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Import to Retell AI first
      const retellResponse = await fetch('https://api.retellai.com/import-phone-number', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${retellApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phone_number: phoneNumber,
          termination_uri: `https://${twilioAccountSid}:${twilioAuthToken}@api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Calls.json`
        })
      });

      if (!retellResponse.ok) {
        const errorText = await retellResponse.text();
        console.error('Retell import failed:', errorText);
        return new Response(JSON.stringify({ error: 'Failed to import to Retell AI' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const retellNumber = await retellResponse.json();

      // Add to our database
      const areaCode = phoneNumber.replace(/\D/g, '').slice(1, 4);
      const { data: dbNumber, error: dbError } = await supabaseClient
        .from('phone_numbers')
        .insert({
          user_id: user.id,
          number: phoneNumber,
          area_code: areaCode,
          status: 'active',
          daily_calls: 0,
          retell_phone_id: retellNumber.phone_number_id
        })
        .select()
        .single();

      if (dbError) {
        console.error('Database insert error:', dbError);
        return new Response(JSON.stringify({ error: 'Failed to save number to database' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ 
        success: true, 
        number: dbNumber,
        retell_data: retellNumber 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Sync all Twilio numbers
    if (action === 'sync_all') {
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers.json`,
        {
          headers: {
            'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken)
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch Twilio numbers');
      }

      const data = await response.json();
      const imported = [];
      const failed = [];

      for (const twilioNum of data.incoming_phone_numbers) {
        try {
          const importResult = await fetch(req.url, {
            method: 'POST',
            headers: req.headers,
            body: JSON.stringify({
              action: 'import_number',
              phoneNumber: twilioNum.phone_number
            })
          });

          if (importResult.ok) {
            imported.push(twilioNum.phone_number);
          } else {
            failed.push(twilioNum.phone_number);
          }
        } catch (error) {
          console.error('Failed to import:', twilioNum.phone_number, error);
          failed.push(twilioNum.phone_number);
        }
      }

      return new Response(JSON.stringify({ 
        success: true,
        imported_count: imported.length,
        failed_count: failed.length,
        imported,
        failed
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response('Invalid action', { status: 400, headers: corsHeaders });

  } catch (error) {
    console.error('Function error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
