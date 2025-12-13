import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BusinessVerificationRequest {
  action: 'create_profile' | 'list_profiles' | 'submit_verification' | 'submit_branded' | 'list_verifications' | 'list_branded';
  profileData?: {
    business_name: string;
    business_registration_number: string;
    business_address: string;
    city: string;
    state: string;
    zip_code: string;
    country?: string;
    contact_phone: string;
    website_url: string;
  };
  verificationData?: {
    business_profile_id: string;
    phone_number: string;
  };
  brandedData?: {
    business_profile_id: string;
    phone_number: string;
    display_name_short: string;
    display_name_long: string;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get user from authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing required environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }
    
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the JWT token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      console.error('[retell-business-verification] Auth error:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { action, profileData, verificationData, brandedData }: BusinessVerificationRequest = await req.json();
    console.log(`[retell-business-verification] Processing action: ${action} for user: ${user.id}`);

    let result;

    switch (action) {
      case 'create_profile':
        if (!profileData) throw new Error('Profile data is required');
        
        // Insert business profile
        const { data: profile, error: profileError } = await supabaseClient
          .from('retell_business_profiles')
          .insert({
            user_id: user.id,
            ...profileData,
            status: 'draft'
          })
          .select()
          .maybeSingle();

        if (profileError) throw profileError;
        result = profile;
        break;

      case 'list_profiles':
        const { data: profiles, error: profilesError } = await supabaseClient
          .from('retell_business_profiles')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (profilesError) throw profilesError;
        result = profiles;
        break;

      case 'submit_verification':
        if (!verificationData) throw new Error('Verification data is required');
        
        // Insert verification application
        const { data: verification, error: verificationError } = await supabaseClient
          .from('retell_verified_numbers')
          .insert({
            user_id: user.id,
            ...verificationData,
            status: 'pending',
            submitted_at: new Date().toISOString()
          })
          .select()
          .maybeSingle();

        if (verificationError) throw verificationError;

        // Update profile status to submitted
        await supabaseClient
          .from('retell_business_profiles')
          .update({ status: 'submitted', submitted_at: new Date().toISOString() })
          .eq('id', verificationData.business_profile_id);

        result = verification;
        break;

      case 'submit_branded':
        if (!brandedData) throw new Error('Branded call data is required');
        
        // Insert branded call application
        const { data: branded, error: brandedError } = await supabaseClient
          .from('retell_branded_calls')
          .insert({
            user_id: user.id,
            ...brandedData,
            status: 'pending',
            submitted_at: new Date().toISOString()
          })
          .select()
          .maybeSingle();

        if (brandedError) throw brandedError;
        result = branded;
        break;

      case 'list_verifications':
        const { data: verifications, error: verificationsError } = await supabaseClient
          .from('retell_verified_numbers')
          .select('*, business_profile:retell_business_profiles(*)')
          .eq('user_id', user.id)
          .order('submitted_at', { ascending: false });

        if (verificationsError) throw verificationsError;
        result = verifications;
        break;

      case 'list_branded':
        const { data: brandedCalls, error: brandedCallsError } = await supabaseClient
          .from('retell_branded_calls')
          .select('*, business_profile:retell_business_profiles(*)')
          .eq('user_id', user.id)
          .order('submitted_at', { ascending: false });

        if (brandedCallsError) throw brandedCallsError;
        result = brandedCalls;
        break;

      default:
        throw new Error(`Unsupported action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[retell-business-verification] Error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});