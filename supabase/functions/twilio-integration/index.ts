import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TwilioImportRequest {
  action: 'list_numbers' | 'import_number' | 'sync_all' | 'check_a2p_status' | 'add_number_to_campaign' | 'configure_sms_webhook' | 'configure_selected_webhooks' | 'clear_selected_webhooks' | 'set_custom_webhook' | 'configure_voice_webhook' | 'create_sip_trunk' | 'list_sip_trunks' | 'delete_sip_trunk' | 'update_sip_trunk' | 'list_trunk_phone_numbers' | 'add_phone_to_trunk' | 'remove_phone_from_trunk';
  phoneNumberSid?: string;
  phoneNumber?: string;
  phoneNumbers?: string[]; // For configuring selected numbers
  messagingServiceSid?: string;
  webhookUrl?: string; // For setting custom webhook URL
  voiceWebhookUrl?: string; // For setting voice/inbound webhook URL
  // SIP Trunk provisioning
  trunkName?: string;
  trunkSid?: string;
  trunkSettings?: {
    recording?: 'do-not-record' | 'record-from-ringing' | 'record-from-answer' | 'record-from-ringing-dual' | 'record-from-answer-dual';
    secure?: boolean;
    cnamLookupEnabled?: boolean;
    disasterRecoveryUrl?: string;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'Supabase configuration missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const supabaseClient = createClient(supabaseUrl, serviceRoleKey);
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }
    
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabaseClient.auth.getUser(token);
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

    const requestBody: TwilioImportRequest = await req.json();
    const { action, phoneNumberSid, phoneNumber, phoneNumbers, messagingServiceSid, webhookUrl, voiceWebhookUrl, trunkSid, trunkName, trunkSettings } = requestBody;
    console.log('📥 Request action:', action, { phoneNumber, phoneNumbersCount: phoneNumbers?.length || 0, phoneNumberSid, messagingServiceSid, webhookUrl, trunkSid });

    // Helper function to encode credentials safely (handles UTF-8)
    const encodeCredentials = (accountSid: string, authToken: string): string => {
      const credentials = `${accountSid}:${authToken}`;
      return btoa(credentials);
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
        } catch (parseError) {
          console.error('Failed to parse Retell error response:', parseError);
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
        .maybeSingle();

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
          failed.push({ number: twilioNum.phone_number, error: (error as Error).message });
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

    // Add phone number to messaging service/campaign
    if (action === 'add_number_to_campaign' && phoneNumber && messagingServiceSid) {
      console.log('📲 Adding phone number to messaging service:', phoneNumber, messagingServiceSid);
      
      // First get the phone number SID from Twilio
      const numbersResponse = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(phoneNumber)}`,
        {
          headers: {
            'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken)
          }
        }
      );

      if (!numbersResponse.ok) {
        const errorText = await numbersResponse.text();
        console.error('❌ Failed to find phone number:', errorText);
        return new Response(JSON.stringify({ error: 'Phone number not found in your Twilio account' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const numbersData = await numbersResponse.json();
      const twilioNumber = numbersData.incoming_phone_numbers?.[0];
      
      if (!twilioNumber) {
        return new Response(JSON.stringify({ error: 'Phone number not found in your Twilio account' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Add phone number to messaging service
      const addResponse = await fetch(
        `https://messaging.twilio.com/v1/Services/${messagingServiceSid}/PhoneNumbers`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: `PhoneNumberSid=${twilioNumber.sid}`
        }
      );

      if (!addResponse.ok) {
        const errorText = await addResponse.text();
        console.error('❌ Failed to add number to messaging service:', errorText);
        
        // Parse error for better messaging
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.message?.includes('already exists')) {
            return new Response(JSON.stringify({ 
              error: 'This phone number is already in this messaging service',
              already_exists: true
            }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          return new Response(JSON.stringify({ error: errorJson.message || 'Failed to add number to campaign' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } catch (parseError) {
          console.error('Failed to parse campaign error response:', parseError);
          return new Response(JSON.stringify({ error: 'Failed to add number to campaign' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      const result = await addResponse.json();
      console.log('✅ Phone number added to messaging service:', result);
      
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Phone number added to A2P campaign',
        data: result
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Configure SMS webhook for phone number
    if (action === 'configure_sms_webhook') {
      console.log('🔧 Configuring SMS webhook for all numbers...');
      
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const webhookUrl = `${supabaseUrl}/functions/v1/twilio-sms-webhook`;
      
      console.log('📍 Webhook URL:', webhookUrl);
      
      // Get all phone numbers
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
        return new Response(JSON.stringify({ error: 'Failed to fetch phone numbers' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const numbersData = await numbersResponse.json();
      const numbers = numbersData.incoming_phone_numbers || [];
      
      const configured: string[] = [];
      const failed: { number: string; error: string }[] = [];

      for (const num of numbers) {
        if (!num.capabilities?.sms) {
          console.log('⏭️ Skipping non-SMS number:', num.phone_number);
          continue;
        }

        console.log('📲 Configuring webhook for:', num.phone_number);
        
        // Update the phone number's SMS webhook
        const updateResponse = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers/${num.sid}.json`,
          {
            method: 'POST',
            headers: {
              'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `SmsUrl=${encodeURIComponent(webhookUrl)}&SmsMethod=POST`
          }
        );

        if (!updateResponse.ok) {
          const errorText = await updateResponse.text();
          console.error('❌ Failed to configure:', num.phone_number, errorText);
          failed.push({ number: num.phone_number, error: 'Failed to update webhook' });
        } else {
          console.log('✅ Configured:', num.phone_number);
          configured.push(num.phone_number);
        }
      }

      console.log('🎉 Webhook configuration complete - Configured:', configured.length, 'Failed:', failed.length);
      
      return new Response(JSON.stringify({ 
        success: true,
        webhook_url: webhookUrl,
        configured_count: configured.length,
        failed_count: failed.length,
        configured,
        failed
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Configure webhooks for SELECTED numbers only
    if (action === 'configure_selected_webhooks' && phoneNumbers && phoneNumbers.length > 0) {
      console.log('🔧 Configuring SMS webhook for selected numbers:', phoneNumbers.length);
      
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const webhookUrl = `${supabaseUrl}/functions/v1/twilio-sms-webhook`;
      
      console.log('📍 Webhook URL:', webhookUrl);
      
      // Get all phone numbers to find their SIDs
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
        return new Response(JSON.stringify({ error: 'Failed to fetch phone numbers' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const numbersData = await numbersResponse.json();
      const allNumbers = numbersData.incoming_phone_numbers || [];
      
      // Create a map of phone number to SID
      const numberToSid = new Map<string, string>();
      allNumbers.forEach((num: any) => {
        numberToSid.set(num.phone_number, num.sid);
      });
      
      const configured: string[] = [];
      const failed: { number: string; error: string }[] = [];

      for (const targetNumber of phoneNumbers) {
        const sid = numberToSid.get(targetNumber);
        
        if (!sid) {
          console.log('❌ Number not found in Twilio:', targetNumber);
          failed.push({ number: targetNumber, error: 'Number not found in Twilio account' });
          continue;
        }

        console.log('📲 Configuring webhook for:', targetNumber);
        
        // Update the phone number's SMS webhook
        const updateResponse = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers/${sid}.json`,
          {
            method: 'POST',
            headers: {
              'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `SmsUrl=${encodeURIComponent(webhookUrl)}&SmsMethod=POST`
          }
        );

        if (!updateResponse.ok) {
          const errorText = await updateResponse.text();
          console.error('❌ Failed to configure:', targetNumber, errorText);
          failed.push({ number: targetNumber, error: 'Failed to update webhook' });
        } else {
          console.log('✅ Configured:', targetNumber);
          configured.push(targetNumber);
        }
      }

      console.log('🎉 Selected webhook configuration complete - Configured:', configured.length, 'Failed:', failed.length);
      
      return new Response(JSON.stringify({ 
        success: true,
        webhook_url: webhookUrl,
        configured_count: configured.length,
        failed_count: failed.length,
        configured,
        failed
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Clear webhooks for SELECTED numbers (remove SMS URL)
    if (action === 'clear_selected_webhooks' && phoneNumbers && phoneNumbers.length > 0) {
      console.log('🧹 Clearing SMS webhooks for selected numbers:', phoneNumbers.length);
      
      // Get all phone numbers to find their SIDs
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
        return new Response(JSON.stringify({ error: 'Failed to fetch phone numbers' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const numbersData = await numbersResponse.json();
      const allNumbers = numbersData.incoming_phone_numbers || [];
      
      // Create a map of phone number to SID
      const numberToSid = new Map<string, string>();
      allNumbers.forEach((num: any) => {
        numberToSid.set(num.phone_number, num.sid);
      });
      
      const configured: string[] = [];
      const failed: { number: string; error: string }[] = [];

      for (const targetNumber of phoneNumbers) {
        const sid = numberToSid.get(targetNumber);
        
        if (!sid) {
          console.log('❌ Number not found in Twilio:', targetNumber);
          failed.push({ number: targetNumber, error: 'Number not found in Twilio account' });
          continue;
        }

        console.log('🧹 Clearing webhook for:', targetNumber);
        
        // Clear the phone number's SMS webhook (set to empty string)
        const updateResponse = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers/${sid}.json`,
          {
            method: 'POST',
            headers: {
              'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'SmsUrl=&SmsMethod=POST' // Empty SmsUrl clears the webhook
          }
        );

        if (!updateResponse.ok) {
          const errorText = await updateResponse.text();
          console.error('❌ Failed to clear webhook:', targetNumber, errorText);
          failed.push({ number: targetNumber, error: 'Failed to clear webhook' });
        } else {
          console.log('✅ Cleared webhook:', targetNumber);
          configured.push(targetNumber);
        }
      }

      console.log('🎉 Webhook clearing complete - Cleared:', configured.length, 'Failed:', failed.length);
      
      return new Response(JSON.stringify({ 
        success: true,
        configured_count: configured.length,
        failed_count: failed.length,
        configured,
        failed
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Set a CUSTOM webhook URL for selected numbers (e.g., GHL URL)
    if (action === 'set_custom_webhook' && phoneNumbers && phoneNumbers.length > 0 && webhookUrl) {
      console.log('🔧 Setting custom webhook for selected numbers:', phoneNumbers.length);
      console.log('📍 Custom webhook URL:', webhookUrl);
      
      // Get all phone numbers to find their SIDs
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
        return new Response(JSON.stringify({ error: 'Failed to fetch phone numbers' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const numbersData = await numbersResponse.json();
      const allNumbers = numbersData.incoming_phone_numbers || [];
      
      // Create a map of phone number to SID
      const numberToSid = new Map<string, string>();
      allNumbers.forEach((num: any) => {
        numberToSid.set(num.phone_number, num.sid);
      });
      
      const configured: string[] = [];
      const failed: { number: string; error: string }[] = [];

      for (const targetNumber of phoneNumbers) {
        const sid = numberToSid.get(targetNumber);
        
        if (!sid) {
          console.log('❌ Number not found in Twilio:', targetNumber);
          failed.push({ number: targetNumber, error: 'Number not found in Twilio account' });
          continue;
        }

        console.log('📲 Setting custom webhook for:', targetNumber, '->', webhookUrl);
        
        // Update the phone number's SMS webhook to the custom URL
        const updateResponse = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers/${sid}.json`,
          {
            method: 'POST',
            headers: {
              'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `SmsUrl=${encodeURIComponent(webhookUrl)}&SmsMethod=POST`
          }
        );

        if (!updateResponse.ok) {
          const errorText = await updateResponse.text();
          console.error('❌ Failed to set webhook:', targetNumber, errorText);
          failed.push({ number: targetNumber, error: 'Failed to update webhook' });
        } else {
          console.log('✅ Custom webhook set:', targetNumber);
          configured.push(targetNumber);
        }
      }

      console.log('🎉 Custom webhook configuration complete - Configured:', configured.length, 'Failed:', failed.length);
      
      return new Response(JSON.stringify({ 
        success: true,
        webhook_url: webhookUrl,
        configured_count: configured.length,
        failed_count: failed.length,
        configured,
        failed
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Configure VOICE webhook for inbound calls
    if (action === 'configure_voice_webhook') {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const voiceUrl = voiceWebhookUrl || `${supabaseUrl}/functions/v1/twilio-inbound-handler`;
      
      console.log('📞 Configuring voice webhook for inbound calls');
      console.log('📍 Voice webhook URL:', voiceUrl);
      
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
        return new Response(JSON.stringify({ error: 'Failed to fetch phone numbers' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const numbersData = await numbersResponse.json();
      const allNumbers = numbersData.incoming_phone_numbers || [];
      
      // If specific numbers provided, filter to those; otherwise configure ALL
      const numbersToConfig = phoneNumbers && phoneNumbers.length > 0 
        ? allNumbers.filter((num: any) => phoneNumbers.includes(num.phone_number))
        : allNumbers;
      
      console.log(`📲 Configuring ${numbersToConfig.length} numbers for inbound calls`);
      
      const configured: string[] = [];
      const failed: { number: string; error: string }[] = [];

      for (const num of numbersToConfig) {
        console.log('📲 Setting voice webhook for:', num.phone_number, '->', voiceUrl);
        
        // Update the phone number's Voice webhook
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
          console.error('❌ Failed to set voice webhook:', num.phone_number, errorText);
          failed.push({ number: num.phone_number, error: 'Failed to update voice webhook' });
        } else {
          console.log('✅ Voice webhook set:', num.phone_number);
          configured.push(num.phone_number);
        }
      }

      console.log('🎉 Voice webhook configuration complete - Configured:', configured.length, 'Failed:', failed.length);
      
      return new Response(JSON.stringify({ 
        success: true,
        voice_webhook_url: voiceUrl,
        configured_count: configured.length,
        failed_count: failed.length,
        configured,
        failed
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ============= SIP TRUNK MANAGEMENT =============
    
    // Create a new Twilio Elastic SIP Trunk
    if (action === 'create_sip_trunk') {
      const requestBody = await req.json().catch(() => ({}));
      const { trunkName, trunkSettings } = requestBody || {};
      const name = trunkName || `Auto-Trunk-${Date.now()}`;
      
      console.log('🔧 Creating Twilio Elastic SIP Trunk:', name, 'with settings:', trunkSettings);
      
      // Build trunk parameters with user settings
      const trunkParams: Record<string, string> = {
        FriendlyName: name,
        DisasterRecoveryUrl: trunkSettings?.disasterRecoveryUrl || '',
        DisasterRecoveryMethod: 'POST',
        Recording: trunkSettings?.recording || 'do-not-record',
        Secure: trunkSettings?.secure ? 'true' : 'false',
        CnamLookupEnabled: trunkSettings?.cnamLookupEnabled ? 'true' : 'false'
      };
      
      // Step 1: Create the trunk
      const createTrunkResponse = await fetch(
        `https://trunking.twilio.com/v1/Trunks`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams(trunkParams).toString()
        }
      );

      if (!createTrunkResponse.ok) {
        const errorText = await createTrunkResponse.text();
        console.error('❌ Failed to create trunk:', errorText);
        return new Response(JSON.stringify({ 
          error: 'Failed to create SIP trunk', 
          details: errorText 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const trunk = await createTrunkResponse.json();
      console.log('✅ Trunk created:', trunk.sid);

      // Step 2: Create an IP Access Control List for the trunk
      // This is REQUIRED for SIP trunk termination to work - without it, calls get 403 Forbidden
      console.log('🔧 Creating IP ACL for trunk authentication...');

      let aclSid: string | null = null;
      try {
        const createAclResponse = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/SIP/IpAccessControlLists.json`,
          {
            method: 'POST',
            headers: {
              'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
              FriendlyName: `${name}-ACL`
            }).toString()
          }
        );

        if (createAclResponse.ok) {
          const aclData = await createAclResponse.json();
          aclSid = aclData.sid;
          console.log('✅ IP ACL created:', aclSid);

          // Step 3: Add Twilio's signaling server IPs to the ACL
          // These are the IP ranges that Twilio uses for SIP signaling
          const twilioSignalingIPs = [
            { ip: '54.172.60.0', cidr: 30, name: 'Twilio-US-East-1' },
            { ip: '54.244.51.0', cidr: 30, name: 'Twilio-US-West-2' },
            { ip: '54.171.127.192', cidr: 30, name: 'Twilio-EU-West-1' },
            { ip: '35.156.191.128', cidr: 30, name: 'Twilio-EU-Central-1' },
            { ip: '54.65.63.192', cidr: 30, name: 'Twilio-AP-NE-1' },
            { ip: '54.169.127.128', cidr: 30, name: 'Twilio-AP-SE-1' },
            { ip: '54.252.254.64', cidr: 30, name: 'Twilio-AP-SE-2' },
            { ip: '177.71.206.192', cidr: 30, name: 'Twilio-SA-East-1' }
          ];

          for (const ipInfo of twilioSignalingIPs) {
            await fetch(
              `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/SIP/IpAccessControlLists/${aclSid}/IpAddresses.json`,
              {
                method: 'POST',
                headers: {
                  'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
                  'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                  FriendlyName: ipInfo.name,
                  IpAddress: ipInfo.ip,
                  CidrPrefixLength: ipInfo.cidr.toString()
                }).toString()
              }
            );
          }
          console.log('✅ Added Twilio signaling IPs to ACL');

          // Step 4: Associate the IP ACL with the trunk
          const assocResponse = await fetch(
            `https://trunking.twilio.com/v1/Trunks/${trunk.sid}/IpAccessControlLists`,
            {
              method: 'POST',
              headers: {
                'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
                'Content-Type': 'application/x-www-form-urlencoded'
              },
              body: new URLSearchParams({
                IpAccessControlListSid: aclSid
              }).toString()
            }
          );

          if (assocResponse.ok) {
            console.log('✅ IP ACL associated with trunk');
          } else {
            console.warn('⚠️ Failed to associate IP ACL with trunk:', await assocResponse.text());
          }
        } else {
          console.warn('⚠️ Failed to create IP ACL:', await createAclResponse.text());
        }
      } catch (aclError) {
        console.warn('⚠️ Error setting up IP ACL (trunk still created):', aclError);
      }

      // The termination URI is the key - it's what you use to route calls through this trunk
      const terminationUri = `${trunk.sid.toLowerCase()}.pstn.twilio.com`;

      console.log('🎉 SIP Trunk fully provisioned:', {
        sid: trunk.sid,
        name: trunk.friendly_name,
        termination_uri: terminationUri,
        ip_acl_sid: aclSid,
        settings: trunkSettings
      });

      return new Response(JSON.stringify({
        success: true,
        trunk: {
          sid: trunk.sid,
          friendly_name: trunk.friendly_name,
          domain_name: trunk.domain_name,
          termination_uri: terminationUri,
          secure: trunk.secure,
          recording: trunk.recording,
          cnam_lookup_enabled: trunk.cnam_lookup_enabled,
          date_created: trunk.date_created,
          ip_acl_configured: !!aclSid
        },
        message: 'SIP trunk created and configured successfully. Use the termination URI for outbound calls.'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Update SIP trunk settings
    if (action === 'update_sip_trunk') {
      // trunkSid, trunkSettings, trunkName already extracted from requestBody at top
      if (!trunkSid) {
        return new Response(JSON.stringify({ error: 'trunkSid is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log('📝 Updating Twilio SIP Trunk:', trunkSid, 'with settings:', trunkSettings);
      
      const updateParams: Record<string, string> = {};
      if (trunkName) updateParams.FriendlyName = trunkName;
      if (trunkSettings?.recording) updateParams.Recording = trunkSettings.recording;
      if (trunkSettings?.secure !== undefined) updateParams.Secure = trunkSettings.secure ? 'true' : 'false';
      if (trunkSettings?.cnamLookupEnabled !== undefined) updateParams.CnamLookupEnabled = trunkSettings.cnamLookupEnabled ? 'true' : 'false';
      if (trunkSettings?.disasterRecoveryUrl !== undefined) updateParams.DisasterRecoveryUrl = trunkSettings.disasterRecoveryUrl;

      const updateResponse = await fetch(
        `https://trunking.twilio.com/v1/Trunks/${trunkSid}`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams(updateParams).toString()
        }
      );

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        console.error('❌ Failed to update trunk:', errorText);
        return new Response(JSON.stringify({ 
          error: 'Failed to update SIP trunk', 
          details: errorText 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const trunk = await updateResponse.json();
      console.log('✅ Trunk updated:', trunk.sid);

      return new Response(JSON.stringify({ 
        success: true,
        trunk: {
          sid: trunk.sid,
          friendly_name: trunk.friendly_name,
          secure: trunk.secure,
          recording: trunk.recording,
          cnam_lookup_enabled: trunk.cnam_lookup_enabled
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // List phone numbers associated with a trunk
    if (action === 'list_trunk_phone_numbers') {
      // trunkSid already extracted from requestBody at top
      if (!trunkSid) {
        return new Response(JSON.stringify({ error: 'trunkSid is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log('📋 Listing phone numbers for trunk:', trunkSid);

      const listResponse = await fetch(
        `https://trunking.twilio.com/v1/Trunks/${trunkSid}/PhoneNumbers?PageSize=100`,
        {
          headers: {
            'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken)
          }
        }
      );

      if (!listResponse.ok) {
        const errorText = await listResponse.text();
        console.error('❌ Failed to list trunk phone numbers:', errorText);
        return new Response(JSON.stringify({ 
          error: 'Failed to list trunk phone numbers', 
          details: errorText 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const data = await listResponse.json();
      const phoneNumbers = data.phone_numbers?.map((num: any) => ({
        sid: num.sid,
        phone_number: num.phone_number,
        friendly_name: num.friendly_name,
        trunk_sid: num.trunk_sid
      })) || [];

      console.log('✅ Found', phoneNumbers.length, 'phone numbers on trunk');
      return new Response(JSON.stringify({ phone_numbers: phoneNumbers }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Add phone number to trunk
    if (action === 'add_phone_to_trunk') {
      // trunkSid, phoneNumberSid already extracted from requestBody at top
      if (!trunkSid || !phoneNumberSid) {
        return new Response(JSON.stringify({ error: 'trunkSid and phoneNumberSid are required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log('📲 Adding phone number to trunk:', phoneNumberSid, '->', trunkSid);

      const addResponse = await fetch(
        `https://trunking.twilio.com/v1/Trunks/${trunkSid}/PhoneNumbers`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: `PhoneNumberSid=${phoneNumberSid}`
        }
      );

      if (!addResponse.ok) {
        const errorText = await addResponse.text();
        console.error('❌ Failed to add phone to trunk:', errorText);
        
        // Check for "already exists" error
        if (errorText.includes('already associated') || errorText.includes('already exists')) {
          return new Response(JSON.stringify({ 
            error: 'Phone number is already associated with a SIP trunk',
            already_exists: true
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        return new Response(JSON.stringify({ 
          error: 'Failed to add phone number to trunk', 
          details: errorText 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const result = await addResponse.json();
      console.log('✅ Phone number added to trunk:', result.phone_number);

      return new Response(JSON.stringify({ 
        success: true,
        phone_number: {
          sid: result.sid,
          phone_number: result.phone_number,
          trunk_sid: result.trunk_sid
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Remove phone number from trunk
    if (action === 'remove_phone_from_trunk') {
      // trunkSid, phoneNumberSid already extracted from requestBody at top
      if (!trunkSid || !phoneNumberSid) {
        return new Response(JSON.stringify({ error: 'trunkSid and phoneNumberSid are required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log('🗑️ Removing phone number from trunk:', phoneNumberSid, '<-', trunkSid);

      const removeResponse = await fetch(
        `https://trunking.twilio.com/v1/Trunks/${trunkSid}/PhoneNumbers/${phoneNumberSid}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken)
          }
        }
      );

      if (!removeResponse.ok && removeResponse.status !== 204) {
        const errorText = await removeResponse.text();
        console.error('❌ Failed to remove phone from trunk:', errorText);
        return new Response(JSON.stringify({ 
          error: 'Failed to remove phone number from trunk', 
          details: errorText 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log('✅ Phone number removed from trunk');
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // List existing SIP trunks
    if (action === 'list_sip_trunks') {
      console.log('📋 Listing Twilio SIP Trunks...');
      
      const listResponse = await fetch(
        `https://trunking.twilio.com/v1/Trunks?PageSize=50`,
        {
          headers: {
            'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken)
          }
        }
      );

      if (!listResponse.ok) {
        const errorText = await listResponse.text();
        console.error('❌ Failed to list trunks:', errorText);
        return new Response(JSON.stringify({ 
          error: 'Failed to list SIP trunks', 
          details: errorText 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const data = await listResponse.json();
      const trunks = data.trunks?.map((trunk: any) => ({
        sid: trunk.sid,
        friendly_name: trunk.friendly_name,
        domain_name: trunk.domain_name,
        termination_uri: `${trunk.sid.toLowerCase()}.pstn.twilio.com`,
        secure: trunk.secure,
        recording: trunk.recording,
        date_created: trunk.date_created,
        date_updated: trunk.date_updated
      })) || [];

      console.log('✅ Found', trunks.length, 'SIP trunks');
      return new Response(JSON.stringify({ trunks }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Delete a SIP trunk
    if (action === 'delete_sip_trunk') {
      const requestData = await req.json().catch(() => ({}));
      const trunkSid = requestData.trunkSid;
      
      if (!trunkSid) {
        return new Response(JSON.stringify({ error: 'trunkSid is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log('🗑️ Deleting Twilio SIP Trunk:', trunkSid);
      
      const deleteResponse = await fetch(
        `https://trunking.twilio.com/v1/Trunks/${trunkSid}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken)
          }
        }
      );

      if (!deleteResponse.ok && deleteResponse.status !== 204) {
        const errorText = await deleteResponse.text();
        console.error('❌ Failed to delete trunk:', errorText);
        return new Response(JSON.stringify({ 
          error: 'Failed to delete SIP trunk', 
          details: errorText 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log('✅ SIP trunk deleted:', trunkSid);
      return new Response(JSON.stringify({ 
        success: true,
        message: 'SIP trunk deleted successfully'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response('Invalid action', { status: 400, headers: corsHeaders });

  } catch (error) {
    console.error('Function error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
