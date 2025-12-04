import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TwilioImportRequest {
  action: 'list_numbers' | 'import_number' | 'sync_all' | 'check_a2p_status';
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
        termination_uri: `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Calls.json`,
        termination_uri_auth: {
          username: twilioAccountSid,
          password: twilioAuthToken
        }
      };
      console.log('📤 Sending to Retell AI:', JSON.stringify(retellPayload, null, 2));

      const retellResponse = await fetch('https://api.retellai.com/import-phone-number', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${retellApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(retellPayload)
      });

      let retellNumber: any = null;
      let alreadyExistsInRetell = false;

      if (!retellResponse.ok) {
        const errorText = await retellResponse.text();
        console.error('❌ Retell import response:', retellResponse.status, errorText);
        
        // Check if the error is "Phone number already exists"
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.message?.toLowerCase().includes('already exists')) {
            console.log('ℹ️ Number already exists in Retell AI, will check local database');
            alreadyExistsInRetell = true;
            
            // Try to get the existing number from Retell
            const getResponse = await fetch(`https://api.retellai.com/get-phone-number/${encodeURIComponent(phoneNumber)}`, {
              headers: {
                'Authorization': `Bearer ${retellApiKey}`,
              }
            });
            
            if (getResponse.ok) {
              retellNumber = await getResponse.json();
              console.log('✅ Found existing Retell number:', retellNumber.phone_number_id);
            }
          } else {
            // Other error - return it
            return new Response(JSON.stringify({ 
              error: 'Failed to import to Retell AI', 
              details: errorJson.message || errorText,
              status: retellResponse.status 
            }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        } catch {
          return new Response(JSON.stringify({ 
            error: 'Failed to import to Retell AI', 
            details: errorText,
            status: retellResponse.status 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      } else {
        retellNumber = await retellResponse.json();
        console.log('✅ Retell AI import successful:', retellNumber);
      }

      // Check if number already exists in our database
      const { data: existingNumber } = await supabaseClient
        .from('phone_numbers')
        .select('*')
        .eq('number', phoneNumber)
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingNumber) {
        console.log('ℹ️ Number already exists in database:', existingNumber.id);
        return new Response(JSON.stringify({ 
          success: true, 
          message: 'Number already imported',
          number: existingNumber,
          retell_data: retellNumber,
          already_existed: true
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Add to our database
      const areaCode = phoneNumber.replace(/\D/g, '').slice(1, 4);
      console.log('💾 Saving to database:', { phoneNumber, areaCode, retell_phone_id: retellNumber?.phone_number_id });
      
      const { data: dbNumber, error: dbError } = await supabaseClient
        .from('phone_numbers')
        .insert({
          user_id: user.id,
          number: phoneNumber,
          area_code: areaCode,
          status: 'active',
          daily_calls: 0,
          retell_phone_id: retellNumber?.phone_number_id || null
        })
        .select()
        .single();

      if (dbError) {
        console.error('❌ Database insert error:', dbError);
        return new Response(JSON.stringify({ 
          error: 'Failed to save number to database', 
          details: dbError.message 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log('✅ Number imported successfully:', dbNumber.id);
      return new Response(JSON.stringify({ 
        success: true, 
        number: dbNumber,
        retell_data: retellNumber,
        already_existed_in_retell: alreadyExistsInRetell
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
            termination_uri: `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Calls.json`,
            termination_uri_auth: {
              username: twilioAccountSid,
              password: twilioAuthToken
            }
          };

          const retellResponse = await fetch('https://api.retellai.com/import-phone-number', {
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

    // Check A2P 10DLC registration status
    if (action === 'check_a2p_status') {
      console.log('🔍 Checking A2P 10DLC registration status...');
      
      const results: any = {
        phone_numbers: [],
        messaging_services: [],
        brand_registrations: [],
        campaigns: [],
        summary: {
          total_numbers: 0,
          registered_numbers: 0,
          pending_numbers: 0,
          unregistered_numbers: 0,
        }
      };

      // Fetch all phone numbers with their messaging service bindings
      console.log('📞 Fetching phone numbers...');
      const numbersResponse = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers.json?PageSize=100`,
        {
          headers: {
            'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken)
          }
        }
      );

      if (numbersResponse.ok) {
        const numbersData = await numbersResponse.json();
        results.phone_numbers = numbersData.incoming_phone_numbers?.map((num: any) => ({
          phone_number: num.phone_number,
          sid: num.sid,
          friendly_name: num.friendly_name,
          capabilities: num.capabilities,
          status: num.status,
          sms_url: num.sms_url,
          voice_url: num.voice_url,
        })) || [];
        results.summary.total_numbers = results.phone_numbers.length;
      }

      // Fetch Messaging Services
      console.log('📨 Fetching messaging services...');
      const msResponse = await fetch(
        `https://messaging.twilio.com/v1/Services?PageSize=50`,
        {
          headers: {
            'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken)
          }
        }
      );

      if (msResponse.ok) {
        const msData = await msResponse.json();
        
        for (const service of msData.services || []) {
          // Get phone numbers associated with this messaging service
          const msNumbersResponse = await fetch(
            `https://messaging.twilio.com/v1/Services/${service.sid}/PhoneNumbers?PageSize=100`,
            {
              headers: {
                'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken)
              }
            }
          );

          let associatedNumbers: string[] = [];
          if (msNumbersResponse.ok) {
            const msNumbersData = await msNumbersResponse.json();
            associatedNumbers = msNumbersData.phone_numbers?.map((n: any) => n.phone_number) || [];
          }

          results.messaging_services.push({
            sid: service.sid,
            friendly_name: service.friendly_name,
            use_case: service.usecase,
            status: service.status,
            us_app_to_person_registered: service.us_app_to_person_registered,
            associated_phone_numbers: associatedNumbers,
          });

          // Mark these numbers as registered
          for (const phoneNum of associatedNumbers) {
            const numIndex = results.phone_numbers.findIndex((n: any) => n.phone_number === phoneNum);
            if (numIndex >= 0) {
              results.phone_numbers[numIndex].a2p_registered = service.us_app_to_person_registered;
              results.phone_numbers[numIndex].messaging_service_sid = service.sid;
              results.phone_numbers[numIndex].messaging_service_name = service.friendly_name;
            }
          }
        }
      }

      // Fetch Brand Registrations (A2P Trust Hub)
      console.log('🏢 Fetching brand registrations...');
      const brandResponse = await fetch(
        `https://messaging.twilio.com/v1/a2p/BrandRegistrations?PageSize=50`,
        {
          headers: {
            'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken)
          }
        }
      );

      if (brandResponse.ok) {
        const brandData = await brandResponse.json();
        results.brand_registrations = brandData.data?.map((brand: any) => ({
          sid: brand.sid,
          status: brand.status,
          brand_type: brand.brand_type,
          a2p_trust_bundle_sid: brand.a2p_trust_bundle_sid,
          failure_reason: brand.failure_reason,
          date_created: brand.date_created,
          date_updated: brand.date_updated,
        })) || [];
      }

      // Fetch Campaigns
      console.log('📋 Fetching A2P campaigns...');
      for (const service of results.messaging_services) {
        const campaignsResponse = await fetch(
          `https://messaging.twilio.com/v1/Services/${service.sid}/UsAppToPerson?PageSize=50`,
          {
            headers: {
              'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken)
            }
          }
        );

        if (campaignsResponse.ok) {
          const campaignsData = await campaignsResponse.json();
          const serviceCampaigns = campaignsData.us_app_to_person_usecases?.map((campaign: any) => ({
            sid: campaign.sid,
            messaging_service_sid: service.sid,
            messaging_service_name: service.friendly_name,
            brand_registration_sid: campaign.brand_registration_sid,
            use_case: campaign.us_app_to_person_usecase,
            description: campaign.description,
            status: campaign.campaign_status,
            date_created: campaign.date_created,
          })) || [];
          results.campaigns.push(...serviceCampaigns);
        }
      }

      // Calculate summary
      results.summary.registered_numbers = results.phone_numbers.filter((n: any) => n.a2p_registered === true).length;
      results.summary.pending_numbers = results.phone_numbers.filter((n: any) => 
        n.messaging_service_sid && n.a2p_registered !== true
      ).length;
      results.summary.unregistered_numbers = results.phone_numbers.filter((n: any) => 
        !n.messaging_service_sid
      ).length;

      console.log('✅ A2P status check complete:', results.summary);
      return new Response(JSON.stringify(results), {
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
