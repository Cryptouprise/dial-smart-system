import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SipTrunkingRequest {
  action: 'create_trunk' | 'list_trunks' | 'delete_trunk' | 'add_origination_uri' | 'add_phone_number' | 
          'list_phone_numbers' | 'configure_trunk' | 'get_trunk_details';
  trunkSid?: string;
  friendlyName?: string;
  domainName?: string;
  disasterRecoveryUrl?: string;
  disasterRecoveryMethod?: string;
  recording?: { mode?: string; trim?: string };
  secure?: boolean;
  cnamLookupEnabled?: boolean;
  
  // Origination URIs
  originationUri?: string;
  priority?: number;
  weight?: number;
  enabled?: boolean;
  sipAddress?: string;
  
  // Phone numbers
  phoneNumberSid?: string;
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

    const request: SipTrunkingRequest = await req.json();
    const { action } = request;

    console.log('📥 SIP Trunking action:', action);

    // Create a new SIP trunk
    if (action === 'create_trunk') {
      const { friendlyName, domainName, disasterRecoveryUrl, disasterRecoveryMethod, 
              recording, secure, cnamLookupEnabled } = request;
      
      if (!friendlyName) {
        return new Response(JSON.stringify({ error: 'Friendly name required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log(`📞 Creating SIP trunk: ${friendlyName}`);

      const createUrl = `https://trunking.twilio.com/v1/Trunks`;
      
      const formData = new URLSearchParams({
        FriendlyName: friendlyName,
      });

      if (domainName) formData.append('DomainName', domainName);
      if (disasterRecoveryUrl) formData.append('DisasterRecoveryUrl', disasterRecoveryUrl);
      if (disasterRecoveryMethod) formData.append('DisasterRecoveryMethod', disasterRecoveryMethod);
      if (recording?.mode) formData.append('Recording.Mode', recording.mode);
      if (recording?.trim) formData.append('Recording.Trim', recording.trim);
      if (secure !== undefined) formData.append('Secure', secure.toString());
      if (cnamLookupEnabled !== undefined) formData.append('CnamLookupEnabled', cnamLookupEnabled.toString());

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
        console.error('❌ SIP trunk creation failed:', response.status, errorText);
        throw new Error(`Failed to create SIP trunk: ${response.status} - ${errorText}`);
      }

      const trunk = await response.json();
      console.log('✅ SIP trunk created:', trunk);

      // Save to database
      const { data: dbTrunk, error: dbError } = await supabaseClient
        .from('sip_trunks')
        .insert({
          user_id: user.id,
          trunk_sid: trunk.sid,
          friendly_name: trunk.friendly_name,
          domain_name: trunk.domain_name,
          secure: trunk.secure,
          cnam_lookup_enabled: trunk.cnam_lookup_enabled,
          disaster_recovery_url: trunk.disaster_recovery_url,
          recording_mode: trunk.recording?.mode,
          status: 'active'
        })
        .select()
        .single();

      if (dbError) {
        console.error('❌ Database error:', dbError);
        // Don't fail the request, trunk is still created
      }

      return new Response(JSON.stringify({ 
        success: true,
        trunk,
        dbRecord: dbTrunk
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // List all SIP trunks
    if (action === 'list_trunks') {
      console.log('📋 Listing SIP trunks');

      const listUrl = `https://trunking.twilio.com/v1/Trunks`;
      
      const response = await fetch(listUrl, {
        headers: {
          'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken)
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Failed to list trunks:', response.status, errorText);
        throw new Error(`Failed to list SIP trunks: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log(`✅ Found ${data.trunks?.length || 0} SIP trunks`);

      return new Response(JSON.stringify({ 
        trunks: data.trunks || [],
        count: data.trunks?.length || 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get trunk details
    if (action === 'get_trunk_details') {
      const { trunkSid } = request;
      
      if (!trunkSid) {
        return new Response(JSON.stringify({ error: 'Trunk SID required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log(`📋 Getting trunk details for: ${trunkSid}`);

      const detailsUrl = `https://trunking.twilio.com/v1/Trunks/${trunkSid}`;
      
      const response = await fetch(detailsUrl, {
        headers: {
          'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken)
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Failed to get trunk details:', response.status, errorText);
        throw new Error(`Failed to get trunk details: ${response.status} - ${errorText}`);
      }

      const trunk = await response.json();
      console.log('✅ Trunk details retrieved');

      // Also get origination URIs and phone numbers
      const [originationResponse, phoneNumbersResponse] = await Promise.all([
        fetch(`https://trunking.twilio.com/v1/Trunks/${trunkSid}/OriginationUrls`, {
          headers: { 'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken) }
        }),
        fetch(`https://trunking.twilio.com/v1/Trunks/${trunkSid}/PhoneNumbers`, {
          headers: { 'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken) }
        })
      ]);

      const originationData = originationResponse.ok ? await originationResponse.json() : { origination_urls: [] };
      const phoneNumbersData = phoneNumbersResponse.ok ? await phoneNumbersResponse.json() : { phone_numbers: [] };

      return new Response(JSON.stringify({ 
        trunk,
        originationUrls: originationData.origination_urls || [],
        phoneNumbers: phoneNumbersData.phone_numbers || []
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Delete a SIP trunk
    if (action === 'delete_trunk') {
      const { trunkSid } = request;
      
      if (!trunkSid) {
        return new Response(JSON.stringify({ error: 'Trunk SID required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log(`🗑️ Deleting SIP trunk: ${trunkSid}`);

      const deleteUrl = `https://trunking.twilio.com/v1/Trunks/${trunkSid}`;
      
      const response = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken)
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Failed to delete trunk:', response.status, errorText);
        throw new Error(`Failed to delete SIP trunk: ${response.status} - ${errorText}`);
      }

      console.log('✅ SIP trunk deleted');

      // Update database
      await supabaseClient
        .from('sip_trunks')
        .update({ status: 'deleted' })
        .eq('trunk_sid', trunkSid);

      return new Response(JSON.stringify({ 
        success: true,
        message: 'SIP trunk deleted successfully'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Add origination URI to a trunk
    if (action === 'add_origination_uri') {
      const { trunkSid, originationUri, priority = 1, weight = 1, enabled = true, friendlyName, sipAddress } = request;
      
      if (!trunkSid || !sipAddress) {
        return new Response(JSON.stringify({ error: 'Trunk SID and SIP address required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log(`➕ Adding origination URI to trunk: ${trunkSid}`);

      const addUrl = `https://trunking.twilio.com/v1/Trunks/${trunkSid}/OriginationUrls`;
      
      const formData = new URLSearchParams({
        SipUrl: sipAddress,
        Priority: priority.toString(),
        Weight: weight.toString(),
        Enabled: enabled.toString()
      });

      if (friendlyName) formData.append('FriendlyName', friendlyName);

      const response = await fetch(addUrl, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData.toString()
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Failed to add origination URI:', response.status, errorText);
        throw new Error(`Failed to add origination URI: ${response.status} - ${errorText}`);
      }

      const originationUrl = await response.json();
      console.log('✅ Origination URI added');

      return new Response(JSON.stringify({ 
        success: true,
        originationUrl
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Add phone number to a trunk
    if (action === 'add_phone_number') {
      const { trunkSid, phoneNumberSid } = request;
      
      if (!trunkSid || !phoneNumberSid) {
        return new Response(JSON.stringify({ error: 'Trunk SID and Phone Number SID required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log(`➕ Adding phone number to trunk: ${trunkSid}`);

      const addUrl = `https://trunking.twilio.com/v1/Trunks/${trunkSid}/PhoneNumbers`;
      
      const formData = new URLSearchParams({
        PhoneNumberSid: phoneNumberSid
      });

      const response = await fetch(addUrl, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData.toString()
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Failed to add phone number:', response.status, errorText);
        throw new Error(`Failed to add phone number: ${response.status} - ${errorText}`);
      }

      const phoneNumber = await response.json();
      console.log('✅ Phone number added to trunk');

      return new Response(JSON.stringify({ 
        success: true,
        phoneNumber
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // List phone numbers on a trunk
    if (action === 'list_phone_numbers') {
      const { trunkSid } = request;
      
      if (!trunkSid) {
        return new Response(JSON.stringify({ error: 'Trunk SID required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log(`📋 Listing phone numbers for trunk: ${trunkSid}`);

      const listUrl = `https://trunking.twilio.com/v1/Trunks/${trunkSid}/PhoneNumbers`;
      
      const response = await fetch(listUrl, {
        headers: {
          'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken)
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Failed to list phone numbers:', response.status, errorText);
        throw new Error(`Failed to list phone numbers: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log(`✅ Found ${data.phone_numbers?.length || 0} phone numbers`);

      return new Response(JSON.stringify({ 
        phoneNumbers: data.phone_numbers || [],
        count: data.phone_numbers?.length || 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Configure/update a trunk
    if (action === 'configure_trunk') {
      const { trunkSid, friendlyName, domainName, disasterRecoveryUrl, disasterRecoveryMethod,
              recording, secure, cnamLookupEnabled } = request;
      
      if (!trunkSid) {
        return new Response(JSON.stringify({ error: 'Trunk SID required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log(`⚙️ Configuring trunk: ${trunkSid}`);

      const updateUrl = `https://trunking.twilio.com/v1/Trunks/${trunkSid}`;
      
      const formData = new URLSearchParams();
      if (friendlyName) formData.append('FriendlyName', friendlyName);
      if (domainName) formData.append('DomainName', domainName);
      if (disasterRecoveryUrl) formData.append('DisasterRecoveryUrl', disasterRecoveryUrl);
      if (disasterRecoveryMethod) formData.append('DisasterRecoveryMethod', disasterRecoveryMethod);
      if (recording?.mode) formData.append('Recording.Mode', recording.mode);
      if (recording?.trim) formData.append('Recording.Trim', recording.trim);
      if (secure !== undefined) formData.append('Secure', secure.toString());
      if (cnamLookupEnabled !== undefined) formData.append('CnamLookupEnabled', cnamLookupEnabled.toString());

      if (formData.toString() === '') {
        return new Response(JSON.stringify({ error: 'No configuration provided' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const response = await fetch(updateUrl, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData.toString()
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Configuration failed:', response.status, errorText);
        throw new Error(`Failed to configure trunk: ${response.status} - ${errorText}`);
      }

      const trunk = await response.json();
      console.log('✅ Trunk configured');

      // Update database
      await supabaseClient
        .from('sip_trunks')
        .update({
          friendly_name: trunk.friendly_name,
          domain_name: trunk.domain_name,
          secure: trunk.secure,
          cnam_lookup_enabled: trunk.cnam_lookup_enabled
        })
        .eq('trunk_sid', trunkSid);

      return new Response(JSON.stringify({ 
        success: true,
        trunk
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
