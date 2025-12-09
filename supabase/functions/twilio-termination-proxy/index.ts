import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Twilio Termination Proxy
 * 
 * This function acts as a proxy for Retell AI to terminate calls via Twilio.
 * Retell AI sends outbound call requests to this endpoint, which then forwards
 * them to Twilio's API with proper authentication.
 * 
 * This is required because Retell AI needs to make outbound calls through Twilio,
 * and this proxy handles the authentication and translation between the two services.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[Twilio Termination Proxy] Request received:', req.method, req.url);

    // Get Twilio credentials from environment
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');

    if (!twilioAccountSid || !twilioAuthToken) {
      console.error('[Twilio Termination Proxy] Missing Twilio credentials');
      return new Response(
        JSON.stringify({ 
          error: 'Twilio credentials not configured',
          details: 'TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set'
        }), 
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Parse the incoming request body (form-urlencoded from Retell AI)
    const contentType = req.headers.get('content-type') || '';
    let body;

    if (contentType.includes('application/json')) {
      body = await req.json();
      console.log('[Twilio Termination Proxy] Received JSON body:', body);
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.text();
      console.log('[Twilio Termination Proxy] Received form data:', formData);
      
      // Convert form data to object
      body = {};
      const params = new URLSearchParams(formData);
      for (const [key, value] of params.entries()) {
        body[key] = value;
      }
    } else {
      // Try to parse as JSON anyway
      const text = await req.text();
      try {
        body = JSON.parse(text);
      } catch {
        console.error('[Twilio Termination Proxy] Unsupported content type:', contentType);
        return new Response(
          JSON.stringify({ 
            error: 'Unsupported content type',
            details: `Expected application/json or application/x-www-form-urlencoded, got ${contentType}`
          }), 
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // Extract call parameters
    const { To, From, Url, Method = 'POST', StatusCallback, StatusCallbackMethod = 'POST' } = body;

    if (!To || !From) {
      console.error('[Twilio Termination Proxy] Missing required parameters:', { To, From });
      return new Response(
        JSON.stringify({ 
          error: 'Missing required parameters',
          details: 'To and From phone numbers are required'
        }), 
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('[Twilio Termination Proxy] Creating call:', {
      to: To,
      from: From,
      hasUrl: !!Url
    });

    // Create form data for Twilio
    const twilioParams = new URLSearchParams({
      To,
      From,
      ...(Url && { Url, Method }),
      ...(StatusCallback && { StatusCallback, StatusCallbackMethod }),
    });

    // Make request to Twilio
    const credentials = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Calls.json`;
    
    const twilioResponse = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: twilioParams.toString(),
    });

    const responseText = await twilioResponse.text();
    
    if (!twilioResponse.ok) {
      console.error('[Twilio Termination Proxy] Twilio API error:', twilioResponse.status, responseText);
      return new Response(
        JSON.stringify({ 
          error: 'Twilio API error',
          details: responseText,
          status: twilioResponse.status
        }), 
        {
          status: twilioResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    console.log('[Twilio Termination Proxy] Call created successfully:', responseData.sid);

    // Return the Twilio response
    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Twilio Termination Proxy] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: 'Check edge function logs for more information'
      }), 
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
