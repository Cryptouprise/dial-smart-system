import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
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
      console.log('❌ Unauthorized - no user found');
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    console.log('✅ User authenticated:', user.id);

    // Get credentials from environment variables
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const retellApiKey = Deno.env.get('RETELL_AI_API_KEY');

    if (!twilioAccountSid || !twilioAuthToken) {
      console.log('❌ Twilio credentials not configured in secrets');
      return new Response(JSON.stringify({ error: 'Twilio credentials not configured. Please add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to Supabase secrets.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('✅ Credentials loaded - Twilio:', !!twilioAccountSid, 'Retell:', !!retellApiKey);

    const { action, phoneNumberSid, phoneNumber }: TwilioImportRequest = await req.json();
    console.log('📥 Request action:', action, { phoneNumber, phoneNumberSid });

    // Helper function to encode credentials safely (handles UTF-8)
    const encodeCredentials = (accountSid: string, authToken: string): string => {
      const credentials = `${accountSid}:${authToken}`;
      const encoder = new TextEncoder();
      const data = encoder.encode(credentials);
      return base64Encode(data);
    };

    // List all Twilio numbers
    if (action === 'list_numbers') {
      console.log('📞 Fetching Twilio numbers...');
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers.json`,
        {
          headers: {
            'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken)
          }
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Twilio API error:', response.status, errorText);
        throw new Error(`Failed to fetch Twilio numbers: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('✅ Fetched', data.incoming_phone_numbers?.length || 0, 'Twilio numbers');
      return new Response(JSON.stringify({ numbers: data.incoming_phone_numbers }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Import single number
    if (action === 'import_number' && phoneNumber) {
      console.log('📲 Importing number:', phoneNumber);
      
      if (!retellApiKey) {
        console.log('❌ Retell AI credentials not configured');
        return new Response(JSON.stringify({ error: 'Retell AI credentials not configured. Please add them in Settings > API Keys.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Import to Retell AI first
      const retellPayload = {
        phone_number: phoneNumber,
        termination_uri: `https://${twilioAccountSid}:${twilioAuthToken}@api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Calls.json`
      };
      console.log('📤 Sending to Retell AI:', JSON.stringify(retellPayload, null, 2));

      const retellResponse = await fetch('https://api.retellai.com/v2/import-phone-number', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${retellApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(retellPayload)
      });

      if (!retellResponse.ok) {
        const errorText = await retellResponse.text();
        console.error('❌ Retell import failed:', retellResponse.status, errorText);
        return new Response(JSON.stringify({ 
          error: 'Failed to import to Retell AI', 
          details: errorText,
          status: retellResponse.status 
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const retellNumber = await retellResponse.json();
      console.log('✅ Retell AI import successful:', retellNumber);

      // Add to our database
      const areaCode = phoneNumber.replace(/\D/g, '').slice(1, 4);
      console.log('💾 Saving to database:', { phoneNumber, areaCode, retell_phone_id: retellNumber.phone_number_id });
      
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
        console.error('❌ Database insert error:', dbError);
        return new Response(JSON.stringify({ 
          error: 'Failed to save number to database', 
          details: dbError.message 
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log('✅ Number imported successfully:', dbNumber.id);
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
      console.log('🔄 Starting sync of all Twilio numbers...');
      
      if (!retellApiKey) {
        console.log('❌ Retell AI credentials required for sync');
        return new Response(JSON.stringify({ error: 'Retell AI credentials not configured. Please add them in Settings > API Keys.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers.json`,
        {
          headers: {
            'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken)
          }
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Twilio API error:', response.status, errorText);
        throw new Error(`Failed to fetch Twilio numbers: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const twilioNumbers = data.incoming_phone_numbers || [];
      console.log('📞 Found', twilioNumbers.length, 'Twilio numbers to sync');

      const imported = [];
      const failed = [];

      for (const twilioNum of twilioNumbers) {
        try {
          console.log('📲 Importing:', twilioNum.phone_number);
          
          // Import to Retell AI
          const retellPayload = {
            phone_number: twilioNum.phone_number,
            termination_uri: `https://${twilioAccountSid}:${twilioAuthToken}@api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Calls.json`
          };

          const retellResponse = await fetch('https://api.retellai.com/v2/import-phone-number', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${retellApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(retellPayload)
          });

          if (!retellResponse.ok) {
            const errorText = await retellResponse.text();
            console.error('❌ Retell import failed for', twilioNum.phone_number, ':', errorText);
            failed.push({ number: twilioNum.phone_number, error: 'Retell import failed' });
            continue;
          }

          const retellNumber = await retellResponse.json();

          // Save to database
          const areaCode = twilioNum.phone_number.replace(/\D/g, '').slice(1, 4);
          const { error: dbError } = await supabaseClient
            .from('phone_numbers')
            .insert({
              user_id: user.id,
              number: twilioNum.phone_number,
              area_code: areaCode,
              status: 'active',
              daily_calls: 0,
              retell_phone_id: retellNumber.phone_number_id
            });

          if (dbError) {
            console.error('❌ Database error for', twilioNum.phone_number, ':', dbError);
            failed.push({ number: twilioNum.phone_number, error: 'Database save failed' });
            continue;
          }

          console.log('✅ Successfully imported:', twilioNum.phone_number);
          imported.push(twilioNum.phone_number);

        } catch (error) {
          console.error('❌ Failed to import:', twilioNum.phone_number, error);
          failed.push({ number: twilioNum.phone_number, error: error.message });
        }
      }

      console.log('🎉 Sync complete - Imported:', imported.length, 'Failed:', failed.length);
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
