import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TwilioManagementRequest {
  action: 'buy_number' | 'release_number' | 'search_numbers' | 'configure_number' | 'bulk_buy' | 'bulk_release';
  areaCode?: string;
  contains?: string;
  quantity?: number;
  phoneNumberSid?: string;
  phoneNumber?: string;
  phoneNumbers?: string[];
  voiceUrl?: string;
  smsUrl?: string;
  friendlyName?: string;
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

    const request: TwilioManagementRequest = await req.json();
    const { action } = request;

    console.log('📥 Request action:', action);

    // Search for available numbers
    if (action === 'search_numbers') {
      const { areaCode, contains } = request;
      
      if (!areaCode) {
        return new Response(JSON.stringify({ error: 'Area code required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log(`🔍 Searching for numbers in area code ${areaCode}`);
      
      let searchUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/AvailablePhoneNumbers/US/Local.json?AreaCode=${areaCode}&Limit=50`;
      
      if (contains) {
        searchUrl += `&Contains=${contains}`;
      }

      const response = await fetch(searchUrl, {
        headers: {
          'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken)
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Twilio search error:', response.status, errorText);
        throw new Error(`Failed to search numbers: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log(`✅ Found ${data.available_phone_numbers?.length || 0} available numbers`);

      return new Response(JSON.stringify({ 
        available_numbers: data.available_phone_numbers || [],
        count: data.available_phone_numbers?.length || 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Buy a single number directly from Twilio
    if (action === 'buy_number') {
      const { phoneNumber, voiceUrl, smsUrl, friendlyName } = request;
      
      if (!phoneNumber) {
        return new Response(JSON.stringify({ error: 'Phone number required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log(`💰 Purchasing number: ${phoneNumber}`);

      const purchaseUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers.json`;
      
      const formData = new URLSearchParams({
        PhoneNumber: phoneNumber,
      });

      if (voiceUrl) formData.append('VoiceUrl', voiceUrl);
      if (smsUrl) formData.append('SmsUrl', smsUrl);
      if (friendlyName) formData.append('FriendlyName', friendlyName);

      const response = await fetch(purchaseUrl, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData.toString()
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Purchase failed:', response.status, errorText);
        throw new Error(`Failed to purchase number: ${response.status} - ${errorText}`);
      }

      const purchasedNumber = await response.json();
      console.log('✅ Number purchased:', purchasedNumber);

      // Save to database
      const areaCode = phoneNumber.replace(/\D/g, '').slice(1, 4);
      const { data: dbNumber, error: dbError } = await supabaseClient
        .from('phone_numbers')
        .insert({
          user_id: user.id,
          number: phoneNumber,
          area_code: areaCode,
          status: 'active',
          daily_calls: 0,
          twilio_sid: purchasedNumber.sid,
          provider: 'twilio'
        })
        .select()
        .single();

      if (dbError) {
        console.error('❌ Database error:', dbError);
        // Don't fail the request, number is still purchased
      }

      return new Response(JSON.stringify({ 
        success: true,
        number: purchasedNumber,
        dbRecord: dbNumber
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Bulk purchase numbers
    if (action === 'bulk_buy') {
      const { areaCode, quantity = 1 } = request;
      
      if (!areaCode) {
        return new Response(JSON.stringify({ error: 'Area code required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log(`💰 Bulk purchasing ${quantity} numbers in area code ${areaCode}`);

      // First search for available numbers
      const searchUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/AvailablePhoneNumbers/US/Local.json?AreaCode=${areaCode}&Limit=${quantity}`;
      
      const searchResponse = await fetch(searchUrl, {
        headers: {
          'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken)
        }
      });

      if (!searchResponse.ok) {
        throw new Error('Failed to search for available numbers');
      }

      const searchData = await searchResponse.json();
      const availableNumbers = searchData.available_phone_numbers || [];

      if (availableNumbers.length === 0) {
        return new Response(JSON.stringify({ 
          error: 'No available numbers in this area code',
          purchased: 0
        }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const purchased = [];
      const failed = [];

      // Purchase each number
      for (const availableNum of availableNumbers.slice(0, quantity)) {
        try {
          const purchaseUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers.json`;
          
          const formData = new URLSearchParams({
            PhoneNumber: availableNum.phone_number,
          });

          const purchaseResponse = await fetch(purchaseUrl, {
            method: 'POST',
            headers: {
              'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData.toString()
          });

          if (!purchaseResponse.ok) {
            failed.push({ number: availableNum.phone_number, error: 'Purchase failed' });
            continue;
          }

          const purchasedNumber = await purchaseResponse.json();

          // Save to database
          const { error: dbError } = await supabaseClient
            .from('phone_numbers')
            .insert({
              user_id: user.id,
              number: availableNum.phone_number,
              area_code: areaCode,
              status: 'active',
              daily_calls: 0,
              twilio_sid: purchasedNumber.sid,
              provider: 'twilio'
            });

          if (dbError) {
            console.error('❌ DB error for', availableNum.phone_number, ':', dbError);
          }

          purchased.push(availableNum.phone_number);
          console.log('✅ Purchased:', availableNum.phone_number);

        } catch (error) {
          console.error('❌ Failed to purchase', availableNum.phone_number, ':', error);
          failed.push({ number: availableNum.phone_number, error: error.message });
        }
      }

      return new Response(JSON.stringify({
        success: true,
        purchased_count: purchased.length,
        failed_count: failed.length,
        purchased,
        failed
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Release/delete a number
    if (action === 'release_number') {
      const { phoneNumberSid, phoneNumber } = request;
      
      let sid = phoneNumberSid;

      // If we have phone number but not SID, look it up
      if (!sid && phoneNumber) {
        const listUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(phoneNumber)}`;
        
        const listResponse = await fetch(listUrl, {
          headers: {
            'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken)
          }
        });

        if (listResponse.ok) {
          const listData = await listResponse.json();
          if (listData.incoming_phone_numbers && listData.incoming_phone_numbers.length > 0) {
            sid = listData.incoming_phone_numbers[0].sid;
          }
        }
      }

      if (!sid) {
        return new Response(JSON.stringify({ error: 'Phone number SID required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log(`🗑️ Releasing number with SID: ${sid}`);

      const releaseUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers/${sid}.json`;
      
      const response = await fetch(releaseUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken)
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Release failed:', response.status, errorText);
        throw new Error(`Failed to release number: ${response.status} - ${errorText}`);
      }

      console.log('✅ Number released from Twilio');

      // Update database to mark as released
      if (phoneNumber) {
        const { error: dbError } = await supabaseClient
          .from('phone_numbers')
          .update({ status: 'released' })
          .eq('number', phoneNumber);

        if (dbError) {
          console.error('❌ Database update error:', dbError);
        }
      }

      return new Response(JSON.stringify({ 
        success: true,
        message: 'Number released successfully'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Bulk release numbers
    if (action === 'bulk_release') {
      const { phoneNumbers = [] } = request;
      
      if (phoneNumbers.length === 0) {
        return new Response(JSON.stringify({ error: 'No phone numbers provided' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log(`🗑️ Bulk releasing ${phoneNumbers.length} numbers`);

      const released = [];
      const failed = [];

      for (const phoneNumber of phoneNumbers) {
        try {
          // Get SID for the number
          const listUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(phoneNumber)}`;
          
          const listResponse = await fetch(listUrl, {
            headers: {
              'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken)
            }
          });

          if (!listResponse.ok) {
            failed.push({ number: phoneNumber, error: 'Number not found' });
            continue;
          }

          const listData = await listResponse.json();
          if (!listData.incoming_phone_numbers || listData.incoming_phone_numbers.length === 0) {
            failed.push({ number: phoneNumber, error: 'Number not found in account' });
            continue;
          }

          const sid = listData.incoming_phone_numbers[0].sid;

          // Release the number
          const releaseUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers/${sid}.json`;
          
          const releaseResponse = await fetch(releaseUrl, {
            method: 'DELETE',
            headers: {
              'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken)
            }
          });

          if (!releaseResponse.ok) {
            failed.push({ number: phoneNumber, error: 'Release failed' });
            continue;
          }

          // Update database
          await supabaseClient
            .from('phone_numbers')
            .update({ status: 'released' })
            .eq('number', phoneNumber);

          released.push(phoneNumber);
          console.log('✅ Released:', phoneNumber);

        } catch (error) {
          console.error('❌ Failed to release', phoneNumber, ':', error);
          failed.push({ number: phoneNumber, error: error.message });
        }
      }

      return new Response(JSON.stringify({
        success: true,
        released_count: released.length,
        failed_count: failed.length,
        released,
        failed
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Configure a number (update webhooks, friendly name, etc)
    if (action === 'configure_number') {
      const { phoneNumberSid, phoneNumber, voiceUrl, smsUrl, friendlyName } = request;
      
      let sid = phoneNumberSid;

      if (!sid && phoneNumber) {
        const listUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(phoneNumber)}`;
        
        const listResponse = await fetch(listUrl, {
          headers: {
            'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken)
          }
        });

        if (listResponse.ok) {
          const listData = await listResponse.json();
          if (listData.incoming_phone_numbers && listData.incoming_phone_numbers.length > 0) {
            sid = listData.incoming_phone_numbers[0].sid;
          }
        }
      }

      if (!sid) {
        return new Response(JSON.stringify({ error: 'Phone number SID required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log(`⚙️ Configuring number: ${sid}`);

      const updateUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers/${sid}.json`;
      
      const formData = new URLSearchParams();
      if (voiceUrl) formData.append('VoiceUrl', voiceUrl);
      if (smsUrl) formData.append('SmsUrl', smsUrl);
      if (friendlyName) formData.append('FriendlyName', friendlyName);

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
        throw new Error(`Failed to configure number: ${response.status} - ${errorText}`);
      }

      const updatedNumber = await response.json();
      console.log('✅ Number configured');

      return new Response(JSON.stringify({ 
        success: true,
        number: updatedNumber
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
