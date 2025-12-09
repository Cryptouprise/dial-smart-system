import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CredentialsCheckResponse {
  retell_configured: boolean;
  twilio_configured: boolean;
  message: string;
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

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    
    if (authError || !user) {
      console.error('[Retell Credentials Check] Auth failed:', authError?.message);
      return new Response(
        JSON.stringify({ 
          error: 'Unauthorized',
          details: authError?.message || 'Authentication required'
        }), 
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('[Retell Credentials Check] User authenticated:', user.id);

    // Check if Retell AI API key is configured
    const retellApiKey = Deno.env.get('RETELL_AI_API_KEY');
    const retellConfigured = !!retellApiKey && retellApiKey.length > 0;

    // Check if Twilio credentials are configured
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioConfigured = !!twilioAccountSid && !!twilioAuthToken;

    console.log('[Retell Credentials Check] Configuration status:', {
      retell: retellConfigured,
      twilio: twilioConfigured
    });

    // Validate Retell API key by making a test request if configured
    let retellValid = false;
    if (retellConfigured) {
      try {
        const testResponse = await fetch('https://api.retellai.com/v2/list-agents', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${retellApiKey}`,
          },
        });
        
        retellValid = testResponse.ok;
        console.log('[Retell Credentials Check] Retell API validation:', retellValid);
      } catch (error) {
        console.error('[Retell Credentials Check] Retell API validation failed:', error);
        retellValid = false;
      }
    }

    // Validate Twilio credentials by making a test request if configured
    let twilioValid = false;
    if (twilioConfigured) {
      try {
        const credentials = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
        const testResponse = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}.json`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Basic ${credentials}`,
            },
          }
        );
        
        twilioValid = testResponse.ok;
        console.log('[Retell Credentials Check] Twilio API validation:', twilioValid);
      } catch (error) {
        console.error('[Retell Credentials Check] Twilio API validation failed:', error);
        twilioValid = false;
      }
    }

    const response: CredentialsCheckResponse = {
      retell_configured: retellValid,
      twilio_configured: twilioValid,
      message: retellValid && twilioValid 
        ? 'All credentials are configured and valid'
        : 'Some credentials are missing or invalid'
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Retell Credentials Check] Error:', error);
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
