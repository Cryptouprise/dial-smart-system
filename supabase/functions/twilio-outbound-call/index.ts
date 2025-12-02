import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OutboundCallRequest {
  phoneNumber: string;
  callerId: string;
  twimlUrl?: string;
  campaignId?: string;
  leadId?: string;
}

/**
 * Twilio Outbound Call Function
 * 
 * This function creates outbound calls directly through Twilio API.
 * It can be used as an alternative to Retell AI for simpler call scenarios.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[Twilio Outbound Call] Request received');

    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[Twilio Outbound Call] Missing Authorization header');
      return new Response(JSON.stringify({ 
        error: 'Missing authorization' 
      }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase configuration missing');
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      console.error('[Twilio Outbound Call] Auth failed');
      return new Response(JSON.stringify({ 
        error: 'Authentication failed' 
      }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    console.log('[Twilio Outbound Call] ✅ User authenticated:', user.id);

    // Get Twilio credentials
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');

    if (!twilioAccountSid || !twilioAuthToken) {
      console.error('[Twilio Outbound Call] ❌ Twilio credentials not configured');
      return new Response(JSON.stringify({ 
        error: 'Twilio credentials not configured' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('[Twilio Outbound Call] ✅ Twilio credentials loaded');

    // Parse request body
    const { 
      phoneNumber, 
      callerId, 
      twimlUrl, 
      campaignId, 
      leadId 
    }: OutboundCallRequest = await req.json();

    if (!phoneNumber || !callerId) {
      throw new Error('phoneNumber and callerId are required');
    }

    console.log('[Twilio Outbound Call] Creating call:', { 
      to: phoneNumber, 
      from: callerId 
    });

    // Create call log in database
    const { data: callLog, error: callLogError } = await supabaseAdmin
      .from('call_logs')
      .insert({
        user_id: user.id,
        campaign_id: campaignId,
        lead_id: leadId,
        phone_number: phoneNumber,
        caller_id: callerId,
        status: 'queued'
      })
      .select()
      .single();

    if (callLogError) {
      console.error('[Twilio Outbound Call] Call log error:', callLogError);
      throw callLogError;
    }

    console.log('[Twilio Outbound Call] Call log created:', callLog.id);

    // Helper function to encode credentials
    const encodeCredentials = (accountSid: string, authToken: string): string => {
      const credentials = `${accountSid}:${authToken}`;
      const encoder = new TextEncoder();
      const data = encoder.encode(credentials);
      return base64Encode(data);
    };

    // Prepare Twilio API call
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Calls.json`;
    
    const formData = new URLSearchParams();
    formData.append('To', phoneNumber);
    formData.append('From', callerId);
    
    if (twimlUrl) {
      formData.append('Url', twimlUrl);
    } else {
      // Default TwiML if no URL provided
      const defaultTwiml = '<?xml version="1.0" encoding="UTF-8"?><Response><Say>This is a test call from your dialing system.</Say></Response>';
      formData.append('Twiml', defaultTwiml);
    }

    console.log('[Twilio Outbound Call] Making Twilio API call');

    // Make the call via Twilio API
    const twilioResponse = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString()
    });

    if (!twilioResponse.ok) {
      const errorText = await twilioResponse.text();
      console.error('[Twilio Outbound Call] Twilio API error:', twilioResponse.status, errorText);
      
      // Update call log to failed
      await supabaseAdmin
        .from('call_logs')
        .update({ status: 'failed' })
        .eq('id', callLog.id);
      
      throw new Error(`Twilio API error: ${twilioResponse.status} - ${errorText}`);
    }

    const callData = await twilioResponse.json();
    console.log('[Twilio Outbound Call] ✅ Call created:', callData.sid);

    // Update call log with Twilio call SID
    await supabaseAdmin
      .from('call_logs')
      .update({ 
        retell_call_id: callData.sid,
        status: 'ringing'
      })
      .eq('id', callLog.id);

    return new Response(JSON.stringify({ 
      success: true,
      call_sid: callData.sid,
      call_log_id: callLog.id,
      status: callData.status
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[Twilio Outbound Call] Error:', error.message);
    return new Response(JSON.stringify({ 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
