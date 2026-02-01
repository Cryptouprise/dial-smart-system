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

    // Get demo agent config - uses existing platform agents/numbers
    const { data: config, error: configError } = await supabase
      .from('demo_agent_config')
      .select('*')
      .eq('is_active', true)
      .maybeSingle();

    // If no demo config, try to use first available Retell agent + phone number
    let agentId = config?.retell_agent_id;
    let fromNumber = config?.demo_phone_number;
    let llmId = config?.retell_llm_id;
    let basePrompt = config?.base_prompt;

    if (!agentId || agentId === 'PENDING_SETUP') {
      // Fetch first active Retell phone number from platform
      // Note: column is 'number' not 'phone_number'
      const { data: phoneNum } = await supabase
        .from('phone_numbers')
        .select('number, retell_phone_id')
        .eq('status', 'active')
        .not('retell_phone_id', 'is', null)
        .limit(1)
        .maybeSingle();

      if (!phoneNum?.retell_phone_id) {
        console.log('⚠️ No Retell phone number found in phone_numbers table');
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Demo not available yet. Our AI calling system is being configured. Please try again later or contact us for a personalized demo.',
            setupRequired: true 
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Use the configured demo agent if available, otherwise this requires setup
      fromNumber = phoneNum.number;
      console.log('📱 Using Retell phone:', fromNumber);
    }

    if (!fromNumber) {
      return new Response(
        JSON.stringify({ success: false, error: 'No outbound phone number configured for demos' }),
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
    
    // Handle US numbers: strip leading 1 if present and normalize to +1
    if (formattedPhone.length === 11 && formattedPhone.startsWith('1')) {
      // User entered 1XXXXXXXXXX - strip the 1 and add +1
      formattedPhone = `+1${formattedPhone.substring(1)}`;
    } else if (formattedPhone.length === 10) {
      // Standard 10-digit US number
      formattedPhone = `+1${formattedPhone}`;
    } else if (formattedPhone.length > 11) {
      // International number - just add + if not present
      formattedPhone = `+${formattedPhone}`;
    } else {
      // Invalid length
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Invalid phone number. Please enter a 10-digit US number (e.g., 214-555-1234) or include the country code for international.` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build personalized prompt (only if config has base_prompt)
    let personalizedPrompt = '';
    if (config?.base_prompt) {
      personalizedPrompt = config.base_prompt
        .replace(/\{\{business_name\}\}/g, businessInfo.business_name || 'your company')
        .replace(/\{\{products_services\}\}/g, businessInfo.products_services || 'products and services')
        .replace(/\{\{campaign_type\}\}/g, effectiveCampaignType);
    }

    console.log('🎯 Demo call for:', businessInfo.business_name, 'Campaign:', effectiveCampaignType);

    // Update the LLM with personalized prompt (only if demo config has LLM ID)
    if (llmId && llmId !== 'PENDING_SETUP' && personalizedPrompt) {
      try {
        const llmUpdateResponse = await fetch(`https://api.retellai.com/update-retell-llm/${llmId}`, {
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
          console.log('✅ LLM prompt updated with personalization');
        }
      } catch (e) {
        console.warn('LLM update failed:', e);
      }
    }

    // Make the call via Retell using platform agent
    const callResponse = await fetch('https://api.retellai.com/v2/create-phone-call', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${retellApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from_number: fromNumber,
        to_number: formattedPhone,
        agent_id: agentId,
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

    // Send SMS confirmation tailored to campaign type
    try {
      const campaignMessages: Record<string, string> = {
        database_reactivation: `Hey! This is Lady Jarvis from ${businessInfo.business_name || 'Call Boss'} 💜 Great chatting with you! We help businesses re-engage old leads and turn them into revenue. Reply DEMO for the full platform tour!`,
        speed_to_lead: `⚡ That was fast, right? Lady Jarvis here from ${businessInfo.business_name || 'Call Boss'}! Our AI responds to new leads in under 60 seconds, 24/7. Want to see how? Reply SHOW ME!`,
        appointment_setter: `📅 Great call! Lady Jarvis from ${businessInfo.business_name || 'Call Boss'} here. I book appointments while you focus on closing. Reply BOOK to see our calendar integration!`,
        lead_qualification: `✅ Thanks for chatting! Lady Jarvis from ${businessInfo.business_name || 'Call Boss'}. I qualify leads so your team only talks to hot prospects. Reply QUALIFY to see how!`,
        customer_service: `💬 Hope that helped! Lady Jarvis from ${businessInfo.business_name || 'Call Boss'} here. I handle customer calls 24/7 so you never miss a beat. Reply SUPPORT to learn more!`,
      };
      
      const smsMessage = campaignMessages[effectiveCampaignType] || 
        `Hey! Lady Jarvis from ${businessInfo.business_name || 'Call Boss'} 💜 Thanks for the demo! Reply FULL to see the complete platform.`;
      
      // Use Supabase function invoke to send SMS
      const smsResponse = await fetch(`${supabaseUrl}/functions/v1/sms-messaging`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'send_sms',
          to: formattedPhone,
          from: fromNumber,
          message: smsMessage,
        }),
      });

      if (smsResponse.ok) {
        console.log('📱 Demo SMS sent for campaign type:', effectiveCampaignType);
      } else {
        console.warn('SMS send warning:', await smsResponse.text());
      }
    } catch (smsErr) {
      console.warn('Demo SMS failed:', smsErr);
    }

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
