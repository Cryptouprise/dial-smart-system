import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Check for Retell AI API key
    const retellApiKey = Deno.env.get('RETELL_AI_API_KEY');
    
    if (!retellApiKey) {
      console.log('[Retell Credentials Check] ❌ RETELL_AI_API_KEY not configured');
      return new Response(JSON.stringify({ 
        configured: false,
        message: 'RETELL_AI_API_KEY is not configured in Supabase secrets'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('[Retell Credentials Check] ✅ RETELL_AI_API_KEY is configured');

    // Test the API key by making a simple API call
    const response = await fetch('https://api.retellai.com/v2/list-agents', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${retellApiKey}`,
      }
    });

    if (!response.ok) {
      console.log('[Retell Credentials Check] ⚠️ API key validation failed:', response.status);
      return new Response(JSON.stringify({ 
        configured: true,
        valid: false,
        message: 'RETELL_AI_API_KEY is configured but may be invalid',
        status: response.status
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('[Retell Credentials Check] ✅ API key is valid');

    return new Response(JSON.stringify({ 
      configured: true,
      valid: true,
      message: 'RETELL_AI_API_KEY is configured and valid'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[Retell Credentials Check] Error:', error.message);
    return new Response(JSON.stringify({ 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
