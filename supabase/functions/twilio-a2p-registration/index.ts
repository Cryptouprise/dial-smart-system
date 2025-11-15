import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface A2PRegistrationRequest {
  action: 'create_business_profile' | 'submit_business_profile' | 'register_brand' | 'create_campaign' | 
          'list_business_profiles' | 'list_brands' | 'list_campaigns' | 'get_brand_status' | 
          'assign_number_to_campaign';
  
  // Business Profile (Trust Hub)
  friendlyName?: string;
  email?: string;
  policyType?: string;
  statusCallback?: string;
  businessType?: string;
  businessName?: string;
  businessWebsite?: string;
  businessAddress?: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  businessContactFirstName?: string;
  businessContactLastName?: string;
  businessContactEmail?: string;
  businessContactPhone?: string;
  businessIdentity?: {
    businessTaxId?: string; // EIN
    businessIndustry?: string;
    businessRegistrationNumber?: string;
  };
  
  // Brand Registration
  brandSid?: string;
  brandType?: string; // STANDARD or SOLE_PROPRIETOR
  displayName?: string;
  companyName?: string;
  ein?: string;
  einIssuingCountry?: string;
  phone?: string;
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  vertical?: string; // Industry vertical
  stockExchange?: string;
  stockTicker?: string;
  website?: string;
  
  // Campaign Registration
  campaignSid?: string;
  brandSid?: string;
  messagingServiceSid?: string;
  usecase?: string; // e.g., 'MARKETING', 'ACCOUNT_NOTIFICATION', etc.
  usecaseDescription?: string;
  messageFlow?: string;
  optInMessage?: string;
  optInKeywords?: string[];
  optOutMessage?: string;
  optOutKeywords?: string[];
  helpMessage?: string;
  helpKeywords?: string[];
  messageSamples?: string[];
  
  // Assignment
  phoneNumberSid?: string;
  
  // General
  profileSid?: string;
  customerProfileSid?: string;
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

    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');

    if (!twilioAccountSid || !twilioAuthToken) {
      console.log('❌ Twilio credentials not configured');
      return new Response(JSON.stringify({ error: 'Twilio credentials not configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const encodeCredentials = (accountSid: string, authToken: string): string => {
      const credentials = `${accountSid}:${authToken}`;
      const encoder = new TextEncoder();
      const data = encoder.encode(credentials);
      return base64Encode(data);
    };

    const request: A2PRegistrationRequest = await req.json();
    const { action } = request;

    console.log('📥 A2P Registration action:', action);

    // Create Business Profile (Trust Hub)
    if (action === 'create_business_profile') {
      const { friendlyName, email, policyType = 'secondary_customer_profile', statusCallback,
              businessType, businessName, businessWebsite, businessAddress,
              businessContactFirstName, businessContactLastName, businessContactEmail, businessContactPhone,
              businessIdentity } = request;
      
      if (!friendlyName || !email) {
        return new Response(JSON.stringify({ error: 'Friendly name and email required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log(`📋 Creating business profile: ${friendlyName}`);

      // Step 1: Create the Trust Product (Customer Profile)
      const createUrl = `https://trusthub.twilio.com/v1/CustomerProfiles`;
      
      const formData = new URLSearchParams({
        FriendlyName: friendlyName,
        Email: email,
        PolicySid: 'RNb0d4771c2c98518d663e30513bfbf96b' // Secondary Customer Profile policy
      });

      if (statusCallback) formData.append('StatusCallback', statusCallback);

      const response = await fetch(createUrl, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData.toString()
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Profile creation failed:', response.status, errorText);
        throw new Error(`Failed to create business profile: ${response.status} - ${errorText}`);
      }

      const profile = await response.json();
      console.log('✅ Business profile created:', profile);

      // Step 2: Create and attach End User (business information)
      if (businessName && businessType) {
        const endUserUrl = `https://trusthub.twilio.com/v1/EndUsers`;
        const endUserData = new URLSearchParams({
          FriendlyName: businessName,
          Type: 'customer_profile_business_information',
          'Attributes.business_name': businessName,
          'Attributes.business_type': businessType
        });

        if (businessWebsite) endUserData.append('Attributes.business_website', businessWebsite);
        if (businessIdentity?.businessTaxId) endUserData.append('Attributes.business_tax_id', businessIdentity.businessTaxId);
        if (businessIdentity?.businessIndustry) endUserData.append('Attributes.business_industry', businessIdentity.businessIndustry);
        if (businessIdentity?.businessRegistrationNumber) endUserData.append('Attributes.business_registration_number', businessIdentity.businessRegistrationNumber);

        const endUserResponse = await fetch(endUserUrl, {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: endUserData.toString()
        });

        if (endUserResponse.ok) {
          const endUser = await endUserResponse.json();
          
          // Attach End User to Customer Profile
          const attachUrl = `https://trusthub.twilio.com/v1/CustomerProfiles/${profile.sid}/CustomerProfilesEntityAssignments`;
          await fetch(attachUrl, {
            method: 'POST',
            headers: {
              'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
              ObjectSid: endUser.sid
            })
          });
          
          console.log('✅ Business information attached');
        }
      }

      // Step 3: Create and attach Address
      if (businessAddress) {
        const addressUrl = `https://trusthub.twilio.com/v1/Addresses`;
        const addressData = new URLSearchParams({
          CustomerName: businessName || friendlyName,
          Street: businessAddress.street,
          City: businessAddress.city,
          Region: businessAddress.state,
          PostalCode: businessAddress.postalCode,
          IsoCountry: businessAddress.country
        });

        const addressResponse = await fetch(addressUrl, {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: addressData.toString()
        });

        if (addressResponse.ok) {
          const address = await addressResponse.json();
          
          // Attach Address to Customer Profile
          const attachUrl = `https://trusthub.twilio.com/v1/CustomerProfiles/${profile.sid}/CustomerProfilesEntityAssignments`;
          await fetch(attachUrl, {
            method: 'POST',
            headers: {
              'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
              ObjectSid: address.sid
            })
          });
          
          console.log('✅ Business address attached');
        }
      }

      // Save to database
      const { data: dbProfile, error: dbError } = await supabaseClient
        .from('a2p_profiles')
        .insert({
          user_id: user.id,
          profile_sid: profile.sid,
          friendly_name: profile.friendly_name,
          email: profile.email,
          status: profile.status,
          business_name: businessName,
          profile_type: 'business'
        })
        .select()
        .single();

      if (dbError) {
        console.error('❌ Database error:', dbError);
      }

      return new Response(JSON.stringify({ 
        success: true,
        profile,
        dbRecord: dbProfile,
        message: 'Business profile created. Next step: Submit for verification using submit_business_profile action.'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Submit Business Profile for verification
    if (action === 'submit_business_profile') {
      const { customerProfileSid } = request;
      
      if (!customerProfileSid) {
        return new Response(JSON.stringify({ error: 'Customer Profile SID required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log(`📤 Submitting business profile for verification: ${customerProfileSid}`);

      const submitUrl = `https://trusthub.twilio.com/v1/CustomerProfiles/${customerProfileSid}/CustomerProfilesEvaluations`;
      
      const response = await fetch(submitUrl, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          PolicySid: 'RNb0d4771c2c98518d663e30513bfbf96b'
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Submission failed:', response.status, errorText);
        throw new Error(`Failed to submit for verification: ${response.status} - ${errorText}`);
      }

      const evaluation = await response.json();
      console.log('✅ Business profile submitted for verification');

      // Update database
      await supabaseClient
        .from('a2p_profiles')
        .update({ status: 'pending-review' })
        .eq('profile_sid', customerProfileSid);

      return new Response(JSON.stringify({ 
        success: true,
        evaluation,
        message: 'Business profile submitted for Twilio verification. Typically takes 24-48 hours.'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Register Brand for A2P 10DLC
    if (action === 'register_brand') {
      const { customerProfileSid, displayName, companyName, ein, phone, street, city, state, 
              postalCode, country = 'US', vertical, website, brandType = 'STANDARD' } = request;
      
      if (!customerProfileSid || !displayName || !companyName) {
        return new Response(JSON.stringify({ error: 'Customer Profile SID, display name, and company name required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log(`📝 Registering A2P brand: ${displayName}`);

      const registerUrl = `https://messaging.twilio.com/v1/a2p/BrandRegistrations`;
      
      const formData = new URLSearchParams({
        CustomerProfileBundleSid: customerProfileSid,
        A2PProfileBundleSid: customerProfileSid, // Use same profile
        BrandType: brandType,
        'Mock': 'false' // Set to 'true' for testing without charges
      });

      const response = await fetch(registerUrl, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData.toString()
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Brand registration failed:', response.status, errorText);
        throw new Error(`Failed to register brand: ${response.status} - ${errorText}`);
      }

      const brand = await response.json();
      console.log('✅ Brand registered:', brand);

      // Save to database
      const { data: dbBrand, error: dbError } = await supabaseClient
        .from('a2p_brands')
        .insert({
          user_id: user.id,
          brand_sid: brand.sid,
          profile_sid: customerProfileSid,
          display_name: displayName,
          company_name: companyName,
          status: brand.status,
          brand_type: brandType
        })
        .select()
        .single();

      if (dbError) {
        console.error('❌ Database error:', dbError);
      }

      return new Response(JSON.stringify({ 
        success: true,
        brand,
        dbRecord: dbBrand,
        message: 'Brand registered for A2P 10DLC. Registration fee: $4 one-time. Next step: Create a campaign.'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Create A2P Campaign
    if (action === 'create_campaign') {
      const { brandSid, usecase = 'MIXED', usecaseDescription, messageFlow, 
              optInMessage, optInKeywords = ['START', 'YES', 'SUBSCRIBE'],
              optOutMessage, optOutKeywords = ['STOP', 'END', 'QUIT', 'UNSUBSCRIBE'],
              helpMessage, helpKeywords = ['HELP', 'INFO'],
              messageSamples = [] } = request;
      
      if (!brandSid || !usecaseDescription) {
        return new Response(JSON.stringify({ error: 'Brand SID and usecase description required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log(`📝 Creating A2P campaign for brand: ${brandSid}`);

      // First, create a messaging service if not provided
      const messagingServiceUrl = `https://messaging.twilio.com/v1/Services`;
      const serviceData = new URLSearchParams({
        FriendlyName: `A2P Campaign Service - ${Date.now()}`
      });

      const serviceResponse = await fetch(messagingServiceUrl, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: serviceData.toString()
      });

      if (!serviceResponse.ok) {
        const errorText = await serviceResponse.text();
        throw new Error(`Failed to create messaging service: ${errorText}`);
      }

      const messagingService = await serviceResponse.json();
      console.log('✅ Messaging service created:', messagingService.sid);

      // Create the campaign
      const campaignUrl = `https://messaging.twilio.com/v1/a2p/BrandRegistrations/${brandSid}/SmsOtp`;
      
      const formData = new URLSearchParams({
        MessagingServiceSid: messagingService.sid,
        'Mock': 'false' // Set to 'true' for testing
      });

      const response = await fetch(campaignUrl, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData.toString()
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Campaign creation failed:', response.status, errorText);
        throw new Error(`Failed to create campaign: ${response.status} - ${errorText}`);
      }

      const campaign = await response.json();
      console.log('✅ Campaign created:', campaign);

      // Save to database
      const { data: dbCampaign, error: dbError } = await supabaseClient
        .from('a2p_campaigns')
        .insert({
          user_id: user.id,
          campaign_sid: campaign.sid,
          brand_sid: brandSid,
          messaging_service_sid: messagingService.sid,
          usecase: usecase,
          usecase_description: usecaseDescription,
          status: campaign.campaign_status || 'pending'
        })
        .select()
        .single();

      if (dbError) {
        console.error('❌ Database error:', dbError);
      }

      return new Response(JSON.stringify({ 
        success: true,
        campaign,
        messagingService,
        dbRecord: dbCampaign,
        message: 'Campaign created. Monthly fee: varies by carrier. Now assign phone numbers to this campaign.'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // List Business Profiles
    if (action === 'list_business_profiles') {
      console.log('📋 Listing business profiles');

      const listUrl = `https://trusthub.twilio.com/v1/CustomerProfiles`;
      
      const response = await fetch(listUrl, {
        headers: {
          'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken)
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to list profiles: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log(`✅ Found ${data.results?.length || 0} business profiles`);

      return new Response(JSON.stringify({ 
        profiles: data.results || [],
        count: data.results?.length || 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // List Brands
    if (action === 'list_brands') {
      console.log('📋 Listing A2P brands');

      const listUrl = `https://messaging.twilio.com/v1/a2p/BrandRegistrations`;
      
      const response = await fetch(listUrl, {
        headers: {
          'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken)
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to list brands: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log(`✅ Found ${data.data?.length || 0} brands`);

      return new Response(JSON.stringify({ 
        brands: data.data || [],
        count: data.data?.length || 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get Brand Status
    if (action === 'get_brand_status') {
      const { brandSid } = request;
      
      if (!brandSid) {
        return new Response(JSON.stringify({ error: 'Brand SID required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log(`📋 Getting brand status: ${brandSid}`);

      const statusUrl = `https://messaging.twilio.com/v1/a2p/BrandRegistrations/${brandSid}`;
      
      const response = await fetch(statusUrl, {
        headers: {
          'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken)
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get brand status: ${response.status} - ${errorText}`);
      }

      const brand = await response.json();
      console.log('✅ Brand status retrieved');

      return new Response(JSON.stringify({ 
        brand,
        status: brand.status,
        identityStatus: brand.identity_status,
        message: getStatusMessage(brand.status)
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Assign Phone Number to Campaign
    if (action === 'assign_number_to_campaign') {
      const { phoneNumberSid, messagingServiceSid } = request;
      
      if (!phoneNumberSid || !messagingServiceSid) {
        return new Response(JSON.stringify({ error: 'Phone Number SID and Messaging Service SID required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log(`➕ Assigning phone number to messaging service: ${messagingServiceSid}`);

      const assignUrl = `https://messaging.twilio.com/v1/Services/${messagingServiceSid}/PhoneNumbers`;
      
      const formData = new URLSearchParams({
        PhoneNumberSid: phoneNumberSid
      });

      const response = await fetch(assignUrl, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData.toString()
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Assignment failed:', response.status, errorText);
        throw new Error(`Failed to assign number: ${response.status} - ${errorText}`);
      }

      const assignment = await response.json();
      console.log('✅ Phone number assigned to campaign');

      return new Response(JSON.stringify({ 
        success: true,
        assignment,
        message: 'Phone number assigned to A2P campaign successfully'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), { 
      status: 400, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Function error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

function getStatusMessage(status: string): string {
  switch (status) {
    case 'PENDING':
      return 'Brand registration is being processed. Usually takes 1-2 business days.';
    case 'APPROVED':
    case 'VERIFIED':
      return '✅ Brand is approved and ready to create campaigns!';
    case 'FAILED':
    case 'REJECTED':
      return '❌ Brand registration was rejected. Please review requirements and resubmit.';
    case 'IN_REVIEW':
      return '⏳ Brand is under review by The Campaign Registry (TCR).';
    default:
      return `Current status: ${status}`;
  }
}
