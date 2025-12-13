
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting scheduled spam check...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing required environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Call the spam detection function for all numbers
    const { data, error } = await supabase.functions.invoke('spam-detection', {
      body: { checkAll: true }
    });

    if (error) throw error;

    console.log('Scheduled spam check completed:', data);

    // Also check for numbers that should be released from quarantine
    const today = new Date().toISOString().split('T')[0];
    const { data: releasedNumbers, error: releaseError } = await supabase
      .from('phone_numbers')
      .update({
        status: 'active',
        quarantine_until: null,
        is_spam: false
      })
      .eq('status', 'quarantined')
      .lte('quarantine_until', today)
      .select();

    if (releaseError) {
      console.error('Error releasing quarantined numbers:', releaseError);
    } else {
      console.log(`Released ${releasedNumbers?.length || 0} numbers from quarantine`);
    }

    return new Response(JSON.stringify({
      success: true,
      spamCheckResults: data,
      releasedFromQuarantine: releasedNumbers?.length || 0,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Scheduled spam check failed:', error);
    return new Response(JSON.stringify({ 
      error: (error as Error).message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
