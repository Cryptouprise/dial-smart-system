import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sessionId, phoneNumber, campaignType } = await req.json();

    if (!sessionId || !phoneNumber) {
      return new Response(
        JSON.stringify({ success: false, error: 'Session ID and phone number are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const retellApiKey = Deno.env.get('RETELL_AI_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!retellApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Retell AI not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get client IP for rate limiting
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                     req.headers.get('cf-connecting-ip') || 
                     'unknown';

    // Rate limit check: 3 calls per IP per day
    const today = new Date().toISOString().split('T')[0];
    const { count: callCount } = await supabase
      .from('demo_call_logs')
      .select('id', { count: 'exact', head: true })
      .eq('ip_address', clientIp)
      .gte('created_at', `${today}T00:00:00Z`);

    if ((callCount || 0) >= 3) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Demo limit reached for today. Sign up for unlimited access!',
          limitReached: true,
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get demo agent config
    const { data: config, error: configError } = await supabase
      .from('demo_agent_config')
      .select('*')
      .eq('is_active', true)
      .single();

    if (configError || !config) {
      console.error('Demo agent config error:', configError);
      return new Response(
        JSON.stringify({ success: false, error: 'Demo agent not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (config.retell_agent_id === 'PENDING_SETUP') {
      return new Response(
        JSON.stringify({ success: false, error: 'Demo agent pending setup. Please configure in Retell dashboard.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get session data
    const { data: session, error: sessionError } = await supabase
      .from('demo_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return new Response(
        JSON.stringify({ success: false, error: 'Session not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const businessInfo = session.scraped_data || {};
    const effectiveCampaignType = campaignType || session.campaign_type || 'database_reactivation';

    // Format phone number to E.164
    let formattedPhone = phoneNumber.replace(/\D/g, '');
    if (formattedPhone.length === 10) {
      formattedPhone = `+1${formattedPhone}`;
    } else if (!formattedPhone.startsWith('+')) {
      formattedPhone = `+${formattedPhone}`;
    }

    // Build personalized prompt
    const personalizedPrompt = config.base_prompt
      .replace(/\{\{business_name\}\}/g, businessInfo.business_name || 'your company')
      .replace(/\{\{products_services\}\}/g, businessInfo.products_services || 'products and services')
      .replace(/\{\{campaign_type\}\}/g, effectiveCampaignType);

    console.log('🎯 Demo call for:', businessInfo.business_name, 'Campaign:', effectiveCampaignType);

    // Update the LLM with personalized prompt (if LLM ID is configured)
    if (config.retell_llm_id && config.retell_llm_id !== 'PENDING_SETUP') {
      try {
        const llmUpdateResponse = await fetch(`https://api.retellai.com/update-retell-llm/${config.retell_llm_id}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${retellApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            general_prompt: personalizedPrompt,
          }),
        });

        if (!llmUpdateResponse.ok) {
          console.warn('LLM update warning:', await llmUpdateResponse.text());
        } else {
          console.log('✅ LLM prompt updated');
        }
      } catch (e) {
        console.warn('LLM update failed:', e);
      }
    }

    // Make the call via Retell
    const callResponse = await fetch('https://api.retellai.com/v2/create-phone-call', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${retellApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from_number: config.demo_phone_number,
        to_number: formattedPhone,
        agent_id: config.retell_agent_id,
        metadata: {
          demo_session_id: sessionId,
          campaign_type: effectiveCampaignType,
          business_name: businessInfo.business_name,
        },
      }),
    });

    const callData = await callResponse.json();

    if (!callResponse.ok) {
      console.error('Retell call error:', callData);
      return new Response(
        JSON.stringify({ success: false, error: callData.message || 'Failed to initiate call' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('📞 Call initiated:', callData.call_id);

    // Log the call
    await supabase.from('demo_call_logs').insert({
      session_id: sessionId,
      phone_number: formattedPhone,
      ip_address: clientIp,
      retell_call_id: callData.call_id,
      status: 'initiated',
    });

    // Update session
    await supabase
      .from('demo_sessions')
      .update({
        prospect_phone: formattedPhone,
        campaign_type: effectiveCampaignType,
        call_initiated: true,
        retell_call_id: callData.call_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    return new Response(
      JSON.stringify({
        success: true,
        callId: callData.call_id,
        message: 'Call initiated! You should receive a call shortly.',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in demo-call:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
