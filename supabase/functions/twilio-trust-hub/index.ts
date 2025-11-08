import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TrustHubRequest {
  action: 'list_brands' | 'list_campaigns' | 'list_messaging_services' | 'assign_number_to_service' | 'get_number_assignments';
  phoneNumberSid?: string;
  messagingServiceSid?: string;
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

    if (!twilioAccountSid || !twilioAuthToken) {
      return new Response(JSON.stringify({ error: 'Twilio credentials not configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { action, phoneNumberSid, messagingServiceSid }: TrustHubRequest = await req.json();
    console.log('[Trust Hub] Processing action:', action);

    const encodeCredentials = (accountSid: string, authToken: string): string => {
      const credentials = `${accountSid}:${authToken}`;
      const encoder = new TextEncoder();
      const data = encoder.encode(credentials);
      return base64Encode(data);
    };

    const authHeader = 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken);

    let result: any = {};

    switch (action) {
      case 'list_brands': {
        console.log('[Trust Hub] Fetching A2P 10DLC brands...');
        
        // Fetch Brand Registrations from Twilio
        const brandsUrl = `https://messaging.twilio.com/v1/Services/Brands`;
        const brandsResponse = await fetch(brandsUrl, {
          headers: { 'Authorization': authHeader }
        });

        if (!brandsResponse.ok) {
          const errorText = await brandsResponse.text();
          console.error('[Trust Hub] Brands API error:', errorText);
          throw new Error(`Failed to fetch brands: ${brandsResponse.status}`);
        }

        const brandsData = await brandsResponse.json();
        console.log('[Trust Hub] Found', brandsData.brands?.length || 0, 'brands');

        result = { brands: brandsData.brands || [] };
        break;
      }

      case 'list_campaigns': {
        console.log('[Trust Hub] Fetching A2P campaigns...');
        
        // Fetch Campaigns (use cases) from Twilio
        const campaignsUrl = `https://messaging.twilio.com/v1/Services/UsAppToPerson`;
        const campaignsResponse = await fetch(campaignsUrl, {
          headers: { 'Authorization': authHeader }
        });

        if (!campaignsResponse.ok) {
          const errorText = await campaignsResponse.text();
          console.error('[Trust Hub] Campaigns API error:', errorText);
          throw new Error(`Failed to fetch campaigns: ${campaignsResponse.status}`);
        }

        const campaignsData = await campaignsResponse.json();
        console.log('[Trust Hub] Found', campaignsData.us_app_to_person?.length || 0, 'campaigns');

        result = { campaigns: campaignsData.us_app_to_person || [] };
        break;
      }

      case 'list_messaging_services': {
        console.log('[Trust Hub] Fetching messaging services...');
        
        const servicesUrl = `https://messaging.twilio.com/v1/Services`;
        const servicesResponse = await fetch(servicesUrl, {
          headers: { 'Authorization': authHeader }
        });

        if (!servicesResponse.ok) {
          const errorText = await servicesResponse.text();
          console.error('[Trust Hub] Services API error:', errorText);
          throw new Error(`Failed to fetch services: ${servicesResponse.status}`);
        }

        const servicesData = await servicesResponse.json();
        console.log('[Trust Hub] Found', servicesData.services?.length || 0, 'messaging services');

        // For each service, get the assigned phone numbers
        const servicesWithNumbers = await Promise.all(
          (servicesData.services || []).map(async (service: any) => {
            const numbersUrl = `https://messaging.twilio.com/v1/Services/${service.sid}/PhoneNumbers`;
            const numbersResponse = await fetch(numbersUrl, {
              headers: { 'Authorization': authHeader }
            });
            
            if (numbersResponse.ok) {
              const numbersData = await numbersResponse.json();
              return {
                ...service,
                phone_numbers: numbersData.phone_numbers || []
              };
            }
            
            return { ...service, phone_numbers: [] };
          })
        );

        result = { messaging_services: servicesWithNumbers };
        break;
      }

      case 'assign_number_to_service': {
        if (!phoneNumberSid || !messagingServiceSid) {
          throw new Error('phoneNumberSid and messagingServiceSid are required');
        }

        console.log('[Trust Hub] Assigning', phoneNumberSid, 'to service', messagingServiceSid);
        
        const assignUrl = `https://messaging.twilio.com/v1/Services/${messagingServiceSid}/PhoneNumbers`;
        const assignResponse = await fetch(assignUrl, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: `PhoneNumberSid=${phoneNumberSid}`
        });

        if (!assignResponse.ok) {
          const errorText = await assignResponse.text();
          console.error('[Trust Hub] Assignment error:', errorText);
          throw new Error(`Failed to assign number: ${assignResponse.status} - ${errorText}`);
        }

        const assignData = await assignResponse.json();
        console.log('[Trust Hub] Successfully assigned number');

        result = { success: true, assignment: assignData };
        break;
      }

      case 'get_number_assignments': {
        console.log('[Trust Hub] Getting assignments for all numbers...');
        
        // Get all phone numbers
        const numbersUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers.json`;
        const numbersResponse = await fetch(numbersUrl, {
          headers: { 'Authorization': authHeader }
        });

        if (!numbersResponse.ok) {
          throw new Error('Failed to fetch phone numbers');
        }

        const numbersData = await numbersResponse.json();
        
        // For each number, check if it's in any messaging service
        const servicesUrl = `https://messaging.twilio.com/v1/Services`;
        const servicesResponse = await fetch(servicesUrl, {
          headers: { 'Authorization': authHeader }
        });

        const servicesData = servicesResponse.ok ? await servicesResponse.json() : { services: [] };
        
        const numberAssignments = await Promise.all(
          (numbersData.incoming_phone_numbers || []).map(async (number: any) => {
            // Check each messaging service for this number
            for (const service of servicesData.services || []) {
              const serviceNumbersUrl = `https://messaging.twilio.com/v1/Services/${service.sid}/PhoneNumbers`;
              const serviceNumbersResponse = await fetch(serviceNumbersUrl, {
                headers: { 'Authorization': authHeader }
              });
              
              if (serviceNumbersResponse.ok) {
                const serviceNumbersData = await serviceNumbersResponse.json();
                const isAssigned = serviceNumbersData.phone_numbers?.some((pn: any) => 
                  pn.phone_number === number.phone_number
                );
                
                if (isAssigned) {
                  return {
                    phone_number: number.phone_number,
                    phone_number_sid: number.sid,
                    messaging_service_sid: service.sid,
                    messaging_service_name: service.friendly_name,
                    has_brand: !!service.usecase_sid
                  };
                }
              }
            }
            
            return {
              phone_number: number.phone_number,
              phone_number_sid: number.sid,
              messaging_service_sid: null,
              messaging_service_name: null,
              has_brand: false
            };
          })
        );

        result = { assignments: numberAssignments };
        break;
      }

      default:
        throw new Error(`Unsupported action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[Trust Hub] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
