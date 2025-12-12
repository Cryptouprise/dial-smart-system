import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SpamLookupRequest {
  phoneNumberId?: string;
  phoneNumber?: string;
  checkAll?: boolean;
  includeSTIRSHAKEN?: boolean;
  checkRegistrationStatus?: boolean;
  checkNumberProfile?: boolean;
  listApprovedProfiles?: boolean;
  transferToProfile?: boolean;
  customerProfileSid?: string;
  syncTelnyxNumbers?: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    
    if (authHeader) {
      const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
      if (!error && user) {
        userId = user.id;
      }
    }

    const { 
      phoneNumberId, 
      phoneNumber, 
      checkAll, 
      includeSTIRSHAKEN, 
      checkRegistrationStatus,
      checkNumberProfile,
      listApprovedProfiles,
      transferToProfile,
      customerProfileSid,
      syncTelnyxNumbers
    }: SpamLookupRequest = await req.json();

    // Sync numbers from Telnyx
    if (syncTelnyxNumbers) {
      return await syncNumbersFromTelnyx(supabase, userId);
    }

    // Check Twilio registration status
    if (checkRegistrationStatus) {
      return await checkTwilioRegistration();
    }

    // Check which profile a number is assigned to
    if (checkNumberProfile && phoneNumber) {
      return await checkPhoneNumberProfile(phoneNumber);
    }

    // List all approved Trust Products
    if (listApprovedProfiles) {
      return await listApprovedTrustProducts();
    }

    // Transfer number to approved profile
    if (transferToProfile && phoneNumber && customerProfileSid) {
      return await transferNumberToProfile(phoneNumber, customerProfileSid);
    }

    if (checkAll) {
      return await checkAllNumbers(supabase, includeSTIRSHAKEN);
    } else if (phoneNumber || phoneNumberId) {
      return await checkSingleNumber(supabase, phoneNumber, phoneNumberId, includeSTIRSHAKEN);
    }

    throw new Error('Invalid request parameters');

  } catch (error: unknown) {
    console.error('Enhanced spam lookup error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function checkAllNumbers(supabase: any, includeSTIRSHAKEN = false) {
  const { data: numbers, error } = await supabase
    .from('phone_numbers')
    .select('*')
    .eq('status', 'active');

  if (error) throw error;

  const results = [];
  for (const number of numbers || []) {
    const result = await performEnhancedLookup(number, supabase, includeSTIRSHAKEN);
    results.push(result);
  }

  return new Response(JSON.stringify({
    message: `Analyzed ${results.length} numbers with enhanced lookup`,
    highRisk: results.filter(r => r.riskLevel === 'high' || r.riskLevel === 'critical').length,
    results
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function checkSingleNumber(supabase: any, phoneNumber?: string, phoneNumberId?: string, includeSTIRSHAKEN = false) {
  let number;
  
  if (phoneNumberId) {
    const { data, error } = await supabase
      .from('phone_numbers')
      .select('*')
      .eq('id', phoneNumberId)
      .single();
    if (error) throw error;
    number = data;
  } else if (phoneNumber) {
    const { data, error } = await supabase
      .from('phone_numbers')
      .select('*')
      .eq('number', phoneNumber)
      .maybeSingle();
    if (error) throw error;
    number = data;
  }

  if (!number) throw new Error('Phone number not found');

  const result = await performEnhancedLookup(number, supabase, includeSTIRSHAKEN);
  
  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function performEnhancedLookup(number: any, supabase: any, includeSTIRSHAKEN = false) {
  console.log(`🔍 Enhanced lookup for ${number.number}`);
  
  let spamScore = 0;
  const reasons = [];
  const lookupData: any = {
    carrierLookup: null,
    stirShaken: null,
    externalSpamScore: 0
  };

  // 1. Perform Twilio Lookup API call for carrier/line type info
  const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');

  if (twilioAccountSid && twilioAuthToken) {
    console.log('📞 Performing Twilio Lookup API call...');
    try {
      const carrierInfo = await getTwilioCarrierInfo(
        number.number, 
        twilioAccountSid, 
        twilioAuthToken
      );
      
      lookupData.carrierLookup = carrierInfo;

      // Update database with carrier info
      await supabase
        .from('phone_numbers')
        .update({
          line_type: carrierInfo.lineType,
          carrier_name: carrierInfo.carrier,
          caller_name: carrierInfo.callerName,
          is_voip: carrierInfo.lineType?.toLowerCase().includes('voip') || false,
          last_lookup_at: new Date().toISOString()
        })
        .eq('id', number.id);

      // VoIP numbers are higher risk
      if (carrierInfo.lineType?.toLowerCase().includes('voip')) {
        spamScore += 15;
        reasons.push('VoIP line (higher spam risk)');
      }

      // Non-fixed VoIP is very high risk
      if (carrierInfo.lineType?.toLowerCase().includes('non-fixed')) {
        spamScore += 25;
        reasons.push('Non-fixed VoIP (very high spam risk)');
      }

      console.log(`✅ Carrier lookup: ${carrierInfo.carrier} | Type: ${carrierInfo.lineType}`);
    } catch (error: unknown) {
      console.error('❌ Twilio Lookup failed:', (error as Error).message);
      reasons.push('Carrier lookup unavailable');
    }
  } else {
    console.log('⚠️ Twilio credentials not configured for carrier lookup');
  }

  // 2. STIR/SHAKEN Attestation Check (if enabled)
  if (includeSTIRSHAKEN) {
    console.log('🔐 Checking STIR/SHAKEN attestation...');
    const attestation = await getSTIRSHAKENAttestation(number.number, twilioAccountSid, twilioAuthToken);
    lookupData.stirShaken = attestation;

    // Update attestation in database
    await supabase
      .from('phone_numbers')
      .update({
        stir_shaken_attestation: attestation.level
      })
      .eq('id', number.id);

    // Score based on attestation level
    switch (attestation.level) {
      case 'A': // Full attestation - best
        reasons.push('✅ Full STIR/SHAKEN attestation (A)');
        break;
      case 'B': // Partial attestation
        spamScore += 10;
        reasons.push('⚠️ Partial STIR/SHAKEN attestation (B)');
        break;
      case 'C': // Gateway attestation
        spamScore += 20;
        reasons.push('⚠️ Gateway STIR/SHAKEN attestation (C)');
        break;
      case 'not_verified':
        spamScore += 30;
        reasons.push('❌ No STIR/SHAKEN attestation');
        break;
    }
    console.log(`🔐 STIR/SHAKEN Level: ${attestation.level}`);
  }

  // 3. Internal behavior analysis (existing logic)
  const behaviorScore = await analyzeBehaviorPattern(number, supabase);
  spamScore += behaviorScore.score;
  if (behaviorScore.reasons.length > 0) {
    reasons.push(...behaviorScore.reasons);
  }

  // 4. Call volume check
  if (number.daily_calls >= 50) {
    spamScore += 50;
    reasons.push(`Critical call volume: ${number.daily_calls} calls/day`);
  } else if (number.daily_calls > 45) {
    spamScore += 30;
    reasons.push(`High call volume: ${number.daily_calls} calls/day`);
  }

  // 5. Determine risk level and action
  const riskLevel = spamScore >= 75 ? 'critical' : spamScore >= 50 ? 'high' : spamScore >= 25 ? 'medium' : 'low';
  const shouldQuarantine = spamScore >= 50;

  if (shouldQuarantine && number.status === 'active') {
    const quarantineDate = new Date();
    quarantineDate.setDate(quarantineDate.getDate() + 30);
    
    await supabase
      .from('phone_numbers')
      .update({
        status: 'quarantined',
        quarantine_until: quarantineDate.toISOString().split('T')[0],
        is_spam: true,
        external_spam_score: spamScore
      })
      .eq('id', number.id);

    console.log(`🚨 Quarantined ${number.number} (score: ${spamScore})`);
  }

  return {
    numberId: number.id,
    number: number.number,
    spamScore,
    riskLevel,
    reasons,
    lookupData,
    quarantined: shouldQuarantine,
    recommendation: getRecommendation(riskLevel, reasons)
  };
}

async function getTwilioCarrierInfo(phoneNumber: string, accountSid: string, authToken: string) {
  const cleanNumber = phoneNumber.replace(/\D/g, '');
  const e164Number = cleanNumber.startsWith('1') ? `+${cleanNumber}` : `+1${cleanNumber}`;
  
  // Twilio Lookup v2 API - includes line type and caller name
  const lookupUrl = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(e164Number)}?Fields=line_type_intelligence,caller_name`;
  
  const credentials = `${accountSid}:${authToken}`;
  const base64Creds = btoa(credentials);
  
  const response = await fetch(lookupUrl, {
    headers: {
      'Authorization': `Basic ${base64Creds}`
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Twilio Lookup failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  return {
    carrier: data.carrier?.name || 'Unknown',
    lineType: data.line_type_intelligence?.type || 'Unknown',
    mobileCountryCode: data.carrier?.mobile_country_code || null,
    mobileNetworkCode: data.carrier?.mobile_network_code || null,
    callerName: data.caller_name?.caller_name || null,
    callerType: data.caller_name?.caller_type || null
  };
}

async function getSTIRSHAKENAttestation(phoneNumber: string, accountSid?: string, authToken?: string) {
  if (!accountSid || !authToken) {
    return {
      level: 'not_verified' as 'A' | 'B' | 'C' | 'not_verified',
      checked: false,
      note: 'Twilio credentials required to check STIR/SHAKEN attestation',
      registrationRequired: true
    };
  }

  try {
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    const e164Number = cleanNumber.startsWith('1') ? `+${cleanNumber}` : `+1${cleanNumber}`;
    
    // Check recent calls FROM this number to see attestation history
    const callsUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json?From=${encodeURIComponent(e164Number)}&PageSize=50`;
    
    const credentials = `${accountSid}:${authToken}`;
    const base64Creds = btoa(credentials);
    
    const response = await fetch(callsUrl, {
      headers: {
        'Authorization': `Basic ${base64Creds}`
      }
    });

    if (!response.ok) {
      throw new Error(`Twilio API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Analyze calls for StirVerstat (STIR/SHAKEN attestation)
    const callsWithAttestation = data.calls?.filter((call: any) => call.answered_by !== 'machine_start');
    
    if (!callsWithAttestation || callsWithAttestation.length === 0) {
      return {
        level: 'not_verified' as 'A' | 'B' | 'C' | 'not_verified',
        checked: true,
        note: 'No call history found. Make outbound calls to verify STIR/SHAKEN attestation. Register with Twilio A2P 10DLC for best attestation.',
        registrationRequired: true,
        callCount: 0
      };
    }

    // Check the most recent attestation levels
    let bestAttestation: 'A' | 'B' | 'C' | 'not_verified' = 'not_verified';
    let attestationCounts = { A: 0, B: 0, C: 0, failed: 0, none: 0 };

    return {
      level: bestAttestation,
      checked: true,
      note: `Found ${callsWithAttestation.length} calls. STIR/SHAKEN attestation requires: 1) Twilio A2P 10DLC registration, 2) CNAM registration. Check individual call logs for StirVerstat values.`,
      registrationRequired: true,
      callCount: callsWithAttestation.length,
      attestationCounts
    };

  } catch (error: unknown) {
    console.error('STIR/SHAKEN check error:', error);
    return {
      level: 'not_verified' as 'A' | 'B' | 'C' | 'not_verified',
      checked: false,
      note: `Error checking attestation: ${(error as Error).message}. Ensure Twilio A2P 10DLC and CNAM registration completed.`,
      registrationRequired: true
    };
  }
}

async function analyzeBehaviorPattern(number: any, supabase: any) {
  const { data: recentCalls } = await supabase
    .from('call_logs')
    .select('created_at, duration_seconds, status, outcome')
    .eq('caller_id', number.number)
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false });

  let score = 0;
  const reasons = [];

  if (!recentCalls || recentCalls.length < 5) {
    return { score: 0, reasons: [] };
  }

  // High failure rate
  const failedCalls = recentCalls.filter((c: any) => c.status === 'failed' || c.status === 'no-answer').length;
  const failureRate = failedCalls / recentCalls.length;
  if (failureRate > 0.7) {
    score += 20;
    reasons.push(`High failure rate: ${Math.round(failureRate * 100)}%`);
  }

  // Short duration calls (robocalling indicator)
  const shortCalls = recentCalls.filter((c: any) => c.duration_seconds && c.duration_seconds < 10).length;
  if (shortCalls / recentCalls.length > 0.8) {
    score += 25;
    reasons.push('Predominantly short calls (< 10s)');
  }

  // Rapid dialing pattern
  if (recentCalls.length > 20) {
    const intervals = [];
    for (let i = 1; i < Math.min(recentCalls.length, 10); i++) {
      const current = new Date(recentCalls[i-1].created_at).getTime();
      const previous = new Date(recentCalls[i].created_at).getTime();
      intervals.push(Math.abs(current - previous) / 1000);
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    if (avgInterval < 30) {
      score += 25;
      reasons.push(`Rapid dialing: ${Math.round(avgInterval)}s between calls`);
    }
  }

  return { score, reasons };
}

async function checkTwilioRegistration() {
  const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');

  if (!twilioAccountSid || !twilioAuthToken) {
    return new Response(JSON.stringify({
      error: 'Twilio credentials not configured',
      registered: false
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const credentials = `${twilioAccountSid}:${twilioAuthToken}`;
  const base64Creds = btoa(credentials);

  try {
    // Check A2P 10DLC registration - check for trust products (business profile)
    const trustProductsUrl = `https://trusthub.twilio.com/v1/TrustProducts`;
    const trustResponse = await fetch(trustProductsUrl, {
      headers: {
        'Authorization': `Basic ${base64Creds}`
      }
    });

    const trustData = await trustResponse.json();
    const hasTrustProduct = trustData.trust_products && trustData.trust_products.length > 0;
    const trustProducts = trustData.trust_products || [];

    // Check for messaging services (campaign registration)
    const messagingUrl = `https://messaging.twilio.com/v1/Services`;
    const messagingResponse = await fetch(messagingUrl, {
      headers: {
        'Authorization': `Basic ${base64Creds}`
      }
    });

    const messagingData = await messagingResponse.json();
    const hasMessagingService = messagingData.services && messagingData.services.length > 0;

    // Check for A2P brand registration
    const brandsUrl = `https://messaging.twilio.com/v1/a2p/BrandRegistrations`;
    const brandsResponse = await fetch(brandsUrl, {
      headers: {
        'Authorization': `Basic ${base64Creds}`
      }
    });

    const brandsData = await brandsResponse.json();
    const brands = brandsData.data || [];
    const activeBrands = brands.filter((b: any) => b.status === 'APPROVED' || b.status === 'VERIFIED');

    return new Response(JSON.stringify({
      registered: hasTrustProduct && activeBrands.length > 0,
      details: {
        trustProducts: {
          count: trustProducts.length,
          verified: trustProducts.filter((tp: any) => tp.status === 'twilio-approved').length,
          products: trustProducts.map((tp: any) => ({
            sid: tp.sid,
            friendlyName: tp.friendly_name,
            status: tp.status,
            dateCreated: tp.date_created
          }))
        },
        brands: {
          count: brands.length,
          approved: activeBrands.length,
          brands: brands.map((b: any) => ({
            sid: b.sid,
            status: b.status,
            identityStatus: b.identity_status
          }))
        },
        messagingServices: {
          count: messagingData.services?.length || 0
        }
      },
      recommendation: getRegistrationRecommendation(hasTrustProduct, activeBrands.length, trustProducts)
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error('Registration check error:', error);
    return new Response(JSON.stringify({
      error: (error as Error).message,
      registered: false,
      details: null
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

function getRegistrationRecommendation(hasTrustProduct: boolean, approvedBrands: number, trustProducts: any[]) {
  if (!hasTrustProduct) {
    return '❌ No business profile found. You need to register with Twilio Trust Hub and create a business profile.';
  }

  const verifiedTrustProducts = trustProducts.filter((tp: any) => tp.status === 'twilio-approved').length;
  
  if (verifiedTrustProducts === 0) {
    return '⚠️ Business profile pending approval. Submit for verification in Twilio Trust Hub.';
  }

  if (approvedBrands === 0) {
    return '⚠️ No approved A2P brand registration. Register your brand for A2P 10DLC messaging.';
  }

  return `✅ Fully registered! You have ${verifiedTrustProducts} verified business profile(s) and ${approvedBrands} approved brand(s). STIR/SHAKEN attestation will be applied to your outbound calls.`;
}

async function checkPhoneNumberProfile(phoneNumber: string) {
  const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');

  if (!twilioAccountSid || !twilioAuthToken) {
    return new Response(JSON.stringify({ error: 'Twilio credentials not configured' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const credentials = `${twilioAccountSid}:${twilioAuthToken}`;
  const base64Creds = btoa(credentials);

  try {
    // Get phone number SID
    const numbersUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(phoneNumber)}`;
    const numbersResponse = await fetch(numbersUrl, {
      headers: { 'Authorization': `Basic ${base64Creds}` }
    });
    const numbersData = await numbersResponse.json();
    
    if (!numbersData.incoming_phone_numbers || numbersData.incoming_phone_numbers.length === 0) {
      // Return 200 with notFound flag instead of 404 - this is expected for numbers not in Twilio
      return new Response(JSON.stringify({ 
        phoneNumber,
        found: false,
        notInTwilio: true,
        message: 'Phone number exists locally but is not in Twilio account'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const phoneSid = numbersData.incoming_phone_numbers[0].sid;

    // Check Customer Profile assignments for this number
    const assignmentsUrl = `https://trusthub.twilio.com/v1/CustomerProfiles`;
    const assignmentsResponse = await fetch(assignmentsUrl, {
      headers: { 'Authorization': `Basic ${base64Creds}` }
    });
    
    const profilesData = await assignmentsResponse.json();
    
    // For each profile, check if this number is assigned
    let currentProfile = null;
    if (profilesData.results && profilesData.results.length > 0) {
      for (const profile of profilesData.results) {
        const endpointsUrl = `https://trusthub.twilio.com/v1/CustomerProfiles/${profile.sid}/ChannelEndpointAssignments?ChannelEndpointSid=${phoneSid}`;
        const endpointsResponse = await fetch(endpointsUrl, {
          headers: { 'Authorization': `Basic ${base64Creds}` }
        });
        const endpointsData = await endpointsResponse.json();
        
        if (endpointsData.results && endpointsData.results.length > 0) {
          currentProfile = {
            sid: profile.sid,
            friendlyName: profile.friendly_name,
            status: profile.status,
            isApproved: profile.status === 'twilio-approved'
          };
          break;
        }
      }
    }

    return new Response(JSON.stringify({
      phoneNumber,
      phoneSid,
      currentProfile,
      hasProfile: !!currentProfile
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error('Error checking number profile:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function listApprovedTrustProducts() {
  const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');

  if (!twilioAccountSid || !twilioAuthToken) {
    return new Response(JSON.stringify({ error: 'Twilio credentials not configured' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const credentials = `${twilioAccountSid}:${twilioAuthToken}`;
  const base64Creds = btoa(credentials);

  try {
    // Get Trust Products (for SHAKEN business profiles) - these support phone number assignments
    const trustProductsUrl = `https://trusthub.twilio.com/v1/TrustProducts`;
    const trustResponse = await fetch(trustProductsUrl, {
      headers: { 'Authorization': `Basic ${base64Creds}` }
    });

    const trustData = await trustResponse.json();
    const trustProducts = (trustData.results || trustData.trust_products || [])
      .filter((tp: any) => tp.status === 'twilio-approved')
      .map((tp: any) => ({
        sid: tp.sid,
        friendlyName: tp.friendly_name,
        status: tp.status,
        dateCreated: tp.date_created,
        policySid: tp.policy_sid,
        type: 'trust_product',
        supportsPhoneAssignment: true // Trust Products support phone assignments
      }));

    // Get Customer Profiles - note: these are for A2P messaging, not STIR/SHAKEN voice
    const customerProfilesUrl = `https://trusthub.twilio.com/v1/CustomerProfiles`;
    const customerResponse = await fetch(customerProfilesUrl, {
      headers: { 'Authorization': `Basic ${base64Creds}` }
    });

    const customerData = await customerResponse.json();
    const customerProfiles = (customerData.results || [])
      .filter((cp: any) => cp.status === 'twilio-approved')
      .map((cp: any) => ({
        sid: cp.sid,
        friendlyName: cp.friendly_name,
        status: cp.status,
        dateCreated: cp.date_created,
        policySid: cp.policy_sid,
        type: 'customer_profile',
        supportsPhoneAssignment: false // Customer Profiles don't support direct phone assignments for STIR/SHAKEN
      }));

    // Only return profiles that support phone number assignment for STIR/SHAKEN
    const eligibleProfiles = trustProducts.filter((tp: any) => tp.supportsPhoneAssignment);

    return new Response(JSON.stringify({
      approvedProfiles: eligibleProfiles, // Only eligible profiles
      trustProducts: trustProducts,
      customerProfiles: customerProfiles,
      count: eligibleProfiles.length,
      hasVoiceIntegrity: trustProducts.some((tp: any) => 
        tp.friendlyName?.toLowerCase().includes('voice') || 
        tp.friendlyName?.toLowerCase().includes('shaken')
      ),
      note: 'Only Trust Products with SHAKEN Business Profile support phone number assignments for STIR/SHAKEN. Customer Profiles are for A2P messaging.'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error('Error listing approved profiles:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function transferNumberToProfile(phoneNumber: string, profileSid: string) {
  const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');

  if (!twilioAccountSid || !twilioAuthToken) {
    return new Response(JSON.stringify({ error: 'Twilio credentials not configured' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const credentials = `${twilioAccountSid}:${twilioAuthToken}`;
  const base64Creds = btoa(credentials);

  try {
    // Determine profile type based on SID prefix
    // BU = Trust Product (Business Profile)
    // Customer Profiles also start with BU but are accessed via different endpoint
    // We need to try TrustProducts first, then CustomerProfiles
    
    // Get phone number SID from Twilio
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    const e164Number = cleanNumber.startsWith('1') ? `+${cleanNumber}` : `+1${cleanNumber}`;
    
    const numbersUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(e164Number)}`;
    const numbersResponse = await fetch(numbersUrl, {
      headers: { 'Authorization': `Basic ${base64Creds}` }
    });
    const numbersData = await numbersResponse.json();
    
    if (!numbersData.incoming_phone_numbers || numbersData.incoming_phone_numbers.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'Phone number not found in Twilio account. Only Twilio numbers can be assigned to STIR/SHAKEN profiles.',
        notInTwilio: true 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const phoneSid = numbersData.incoming_phone_numbers[0].sid;

    // Try TrustProducts endpoint first
    let trustProductUrl = `https://trusthub.twilio.com/v1/TrustProducts/${profileSid}`;
    let profileResponse = await fetch(trustProductUrl, {
      headers: { 'Authorization': `Basic ${base64Creds}` }
    });
    
    let isTrustProduct = profileResponse.ok;
    let profile: any = null;
    
    if (isTrustProduct) {
      profile = await profileResponse.json();
      console.log('Found Trust Product:', JSON.stringify(profile));
    } else {
      // Try CustomerProfiles endpoint
      const customerProfileUrl = `https://trusthub.twilio.com/v1/CustomerProfiles/${profileSid}`;
      profileResponse = await fetch(customerProfileUrl, {
        headers: { 'Authorization': `Basic ${base64Creds}` }
      });
      
      if (profileResponse.ok) {
        profile = await profileResponse.json();
        console.log('Found Customer Profile:', JSON.stringify(profile));
        
        // Customer Profiles don't support direct phone number assignments for STIR/SHAKEN
        return new Response(JSON.stringify({ 
          error: 'Customer Profiles cannot be used for STIR/SHAKEN phone number registration. You need a SHAKEN Business Profile (Trust Product).',
          details: 'Customer Profiles are for A2P 10DLC messaging registration, not voice STIR/SHAKEN.',
          needsVoiceIntegrity: true,
          helpUrl: 'https://www.twilio.com/docs/voice/trusted-calling-with-shakenstir'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } else {
        return new Response(JSON.stringify({ 
          error: 'Profile not found. Please ensure your SHAKEN Business Profile exists and is approved.',
          details: `Profile SID: ${profileSid}`
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Check if status is approved
    if (profile.status !== 'twilio-approved') {
      return new Response(JSON.stringify({ 
        error: `Trust Product is not approved (status: ${profile.status}). Please complete verification in Twilio Trust Hub first.`,
        status: profile.status,
        needsApproval: true
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Try to create Channel Endpoint Assignment for Trust Product
    const assignmentUrl = `https://trusthub.twilio.com/v1/TrustProducts/${profileSid}/ChannelEndpointAssignments`;
    const assignmentResponse = await fetch(assignmentUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${base64Creds}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        'ChannelEndpointType': 'phone-number',
        'ChannelEndpointSid': phoneSid
      })
    });

    const assignmentData = await assignmentResponse.json();
    console.log('Assignment response:', JSON.stringify(assignmentData));

    if (!assignmentResponse.ok) {
      const errorMessage = assignmentData.message || assignmentData.error_message || 'Unknown error';
      
      if (errorMessage.includes('not eligible') || errorMessage.includes('ChannelEndpointAssignment')) {
        return new Response(JSON.stringify({ 
          error: 'This Trust Product type does not support phone number assignments. For STIR/SHAKEN, you need a SHAKEN Business Profile specifically designed for voice caller ID.',
          details: errorMessage,
          needsVoiceIntegrity: true,
          helpUrl: 'https://www.twilio.com/docs/voice/trusted-calling-with-shakenstir'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Handle incomplete Trust Hub setup error
      if (errorMessage.includes('required supporting Trust products') || errorMessage.includes('Customer profile')) {
        return new Response(JSON.stringify({ 
          error: 'Your SHAKEN Business Profile is not fully configured. In Twilio Trust Hub, ensure all required supporting entities (Customer Profile, Business Info, Authorized Representative) are linked to your SHAKEN Business Profile.',
          details: errorMessage,
          incompleteSetup: true,
          helpUrl: 'https://www.twilio.com/docs/trust-hub/trusthub-and-branded-calls',
          steps: [
            '1. Go to Twilio Console → Trust Hub',
            '2. Open your SHAKEN Business Profile',
            '3. Ensure Customer Profile is linked',
            '4. Ensure Business Information is complete',
            '5. Ensure Authorized Representative is assigned',
            '6. Submit for review if not already approved'
          ]
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      throw new Error(errorMessage);
    }

    console.log(`✅ Number ${phoneNumber} assigned to Trust Product ${profileSid}`);

    return new Response(JSON.stringify({
      success: true,
      message: 'Number successfully assigned to STIR/SHAKEN profile',
      assignment: {
        sid: assignmentData.sid,
        profileSid: profileSid,
        phoneSid: phoneSid
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error('Error transferring number to profile:', error);
    return new Response(JSON.stringify({ 
      error: (error as Error).message,
      suggestion: 'For STIR/SHAKEN attestation, ensure you have completed Twilio Trust Hub registration and have an approved SHAKEN Business Profile.'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function syncNumbersFromTelnyx(supabase: any, userId: string | null) {
  const telnyxApiKey = Deno.env.get('TELNYX_API_KEY');
  
  if (!telnyxApiKey) {
    return new Response(JSON.stringify({ 
      error: 'TELNYX_API_KEY_NOT_CONFIGURED',
      message: 'Telnyx API key not configured' 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  if (!userId) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    // Fetch numbers from Telnyx API
    const response = await fetch('https://api.telnyx.com/v2/phone_numbers', {
      headers: {
        'Authorization': `Bearer ${telnyxApiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Telnyx API error: ${response.status}`);
    }

    const data = await response.json();
    const telnyxNumbers = data.data || [];
    let imported = 0;

    for (const num of telnyxNumbers) {
      const phoneNumber = num.phone_number;
      const areaCode = phoneNumber.slice(2, 5); // Extract area code from +1XXXNNNNNNN

      // Check if number already exists
      const { data: existing } = await supabase
        .from('phone_numbers')
        .select('id')
        .eq('number', phoneNumber)
        .eq('user_id', userId)
        .single();

      if (!existing) {
        // Insert new number
        const { error: insertError } = await supabase
          .from('phone_numbers')
          .insert({
            number: phoneNumber,
            area_code: areaCode,
            user_id: userId,
            status: num.status === 'active' ? 'active' : 'inactive',
            carrier_name: 'Telnyx',
            line_type: num.phone_number_type || 'unknown'
          });

        if (!insertError) {
          imported++;
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      imported,
      total: telnyxNumbers.length,
      message: `Synced ${imported} new numbers from Telnyx`
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error('Error syncing Telnyx numbers:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

function getRecommendation(riskLevel: string, reasons: string[]) {
  const hasSTIRSHAKEN = reasons.some(r => r.includes('STIR/SHAKEN'));
  
  switch (riskLevel) {
    case 'critical':
      return '🚨 CRITICAL: Immediate quarantine required. Multiple spam indicators detected.';
    case 'high':
      return '⚠️ HIGH RISK: Quarantine recommended. Consider rotating this number.';
    case 'medium':
      return '⚠️ MEDIUM RISK: Monitor closely. Increase call throttling.';
    case 'low':
      if (!hasSTIRSHAKEN) {
        return '✅ LOW RISK: Consider enabling STIR/SHAKEN attestation for better reputation.';
      }
      return '✅ LOW RISK: Continue normal operations.';
    default:
      return 'No action required.';
  }
}
