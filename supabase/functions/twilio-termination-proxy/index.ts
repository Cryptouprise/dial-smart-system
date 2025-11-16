import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Twilio Termination Proxy
 * 
 * This function acts as a proxy between Retell AI and Twilio.
 * It receives call termination requests from Retell AI and forwards them to Twilio.
 * This is used when importing Twilio numbers to Retell AI.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[Twilio Termination Proxy] Request received:', req.method);

    // Get Twilio credentials from environment
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');

    if (!twilioAccountSid || !twilioAuthToken) {
      console.error('[Twilio Termination Proxy] ❌ Twilio credentials not configured');
      return new Response(JSON.stringify({ 
        error: 'Twilio credentials not configured' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('[Twilio Termination Proxy] ✅ Credentials loaded');

    // Parse the request body (from Retell AI)
    const requestBody = await req.text();
    console.log('[Twilio Termination Proxy] Request body length:', requestBody.length);

    // Helper function to encode credentials
    const encodeCredentials = (accountSid: string, authToken: string): string => {
      const credentials = `${accountSid}:${authToken}`;
      const encoder = new TextEncoder();
      const data = encoder.encode(credentials);
      return base64Encode(data);
    };

    // Forward the request to Twilio
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Calls.json`;
    console.log('[Twilio Termination Proxy] Forwarding to Twilio');

    const twilioResponse = await fetch(twilioUrl, {
      method: req.method,
      headers: {
        'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: requestBody
    });

    console.log('[Twilio Termination Proxy] Twilio response status:', twilioResponse.status);

    // Forward the response back to Retell AI
    const responseBody = await twilioResponse.text();
    const responseHeaders = {
      ...corsHeaders,
      'Content-Type': twilioResponse.headers.get('Content-Type') || 'application/json'
    };

    return new Response(responseBody, {
      status: twilioResponse.status,
      headers: responseHeaders
    });

  } catch (error) {
    console.error('[Twilio Termination Proxy] Error:', error.message);
    return new Response(JSON.stringify({ 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
