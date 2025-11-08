import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OutboundCallRequest {
  to: string;
  from: string;
  url?: string;
  twiml?: string;
  statusCallback?: string;
}

/**
 * Twilio Outbound Call Function
 * 
 * Creates outbound calls directly through Twilio API.
 * Requires Basic Auth with Twilio credentials.
 * Accepts application/x-www-form-urlencoded or application/json.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[Twilio Outbound Call] Request received:', req.method);

    // Get Twilio credentials from environment
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');

    if (!twilioAccountSid || !twilioAuthToken) {
      console.error('[Twilio Outbound Call] Missing Twilio credentials');
      return new Response(
        JSON.stringify({ 
          error: 'Twilio credentials not configured',
          details: 'TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set in environment'
        }), 
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Verify authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[Twilio Outbound Call] Missing Authorization header');
      return new Response(
        JSON.stringify({ 
          error: 'Unauthorized',
          details: 'Authorization header required'
        }), 
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Create Supabase client for auth verification
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase configuration missing');
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const token = authHeader.replace('Bearer ', '');
    
    // Verify the JWT token
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      console.error('[Twilio Outbound Call] Auth failed:', authError?.message);
      return new Response(
        JSON.stringify({ 
          error: 'Unauthorized',
          details: authError?.message || 'Invalid or expired session'
        }), 
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('[Twilio Outbound Call] User authenticated:', user.id);

    // Parse request body
    const contentType = req.headers.get('content-type') || '';
    let callParams: OutboundCallRequest;

    if (contentType.includes('application/json')) {
      callParams = await req.json();
      console.log('[Twilio Outbound Call] Received JSON body');
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.text();
      const params = new URLSearchParams(formData);
      callParams = {
        to: params.get('to') || params.get('To') || '',
        from: params.get('from') || params.get('From') || '',
        url: params.get('url') || params.get('Url') || undefined,
        twiml: params.get('twiml') || params.get('Twiml') || undefined,
        statusCallback: params.get('statusCallback') || params.get('StatusCallback') || undefined,
      };
      console.log('[Twilio Outbound Call] Received form data');
    } else {
      return new Response(
        JSON.stringify({ 
          error: 'Unsupported content type',
          details: 'Expected application/json or application/x-www-form-urlencoded'
        }), 
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Validate required parameters
    if (!callParams.to || !callParams.from) {
      console.error('[Twilio Outbound Call] Missing required parameters');
      return new Response(
        JSON.stringify({ 
          error: 'Missing required parameters',
          details: 'to and from phone numbers are required'
        }), 
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!callParams.url && !callParams.twiml) {
      console.error('[Twilio Outbound Call] Missing url or twiml');
      return new Response(
        JSON.stringify({ 
          error: 'Missing required parameters',
          details: 'Either url or twiml is required'
        }), 
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('[Twilio Outbound Call] Creating call:', {
      to: callParams.to.replace(/\d(?=\d{4})/g, '*'), // Mask phone number in logs
      from: callParams.from.replace(/\d(?=\d{4})/g, '*'),
      hasUrl: !!callParams.url,
      hasTwiml: !!callParams.twiml
    });

    // Create form data for Twilio
    const twilioParams = new URLSearchParams({
      To: callParams.to,
      From: callParams.from,
    });

    if (callParams.url) {
      twilioParams.append('Url', callParams.url);
      twilioParams.append('Method', 'POST');
    }

    if (callParams.twiml) {
      twilioParams.append('Twiml', callParams.twiml);
    }

    if (callParams.statusCallback) {
      twilioParams.append('StatusCallback', callParams.statusCallback);
      twilioParams.append('StatusCallbackMethod', 'POST');
    }

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
      console.error('[Twilio Outbound Call] Twilio API error:', twilioResponse.status, responseText.substring(0, 200));
      return new Response(
        JSON.stringify({ 
          error: 'Twilio API error',
          details: `Status ${twilioResponse.status}: ${responseText.substring(0, 200)}`,
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

    console.log('[Twilio Outbound Call] Call created successfully:', responseData.sid || 'unknown');

    // Log call to database
    try {
      const { error: logError } = await supabaseAdmin
        .from('call_logs')
        .insert({
          user_id: user.id,
          phone_number: callParams.to,
          caller_id: callParams.from,
          status: 'initiated',
          twilio_call_sid: responseData.sid,
        });

      if (logError) {
        console.error('[Twilio Outbound Call] Failed to log call:', logError);
        // Don't fail the request if logging fails
      }
    } catch (logError) {
      console.error('[Twilio Outbound Call] Exception logging call:', logError);
    }

    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Twilio Outbound Call] Error:', error);
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
