import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const DEMO_PROMPT_VERSION = 'CALL_BOSS_DYNAMIC_DEMO_V2';
const IP_DAILY_LIMIT = 5;
const PHONE_DAILY_LIMIT = 3;

const ALLOWED_CAMPAIGNS = new Set([
  'database_reactivation',
  'speed_to_lead',
  'appointment_setter',
  'cross_sell',
  'reminder',
  'legal_after_hours',
]);

const DYNAMIC_DEMO_PROMPT = `# ${DEMO_PROMPT_VERSION}

# WHO YOU ARE
You are Lady Jarvis, a warm, sharp, natural-sounding AI voice specialist demonstrating what AI calling can do for {{business_name}}.

You are speaking using BUSINESS-SPECIFIC context supplied for this individual call. Never assume an industry that is not supported by the supplied business context. In particular, NEVER introduce solar, roofing, legal, medical, financial, or any other industry unless the business context actually indicates it.

# BUSINESS CONTEXT FOR THIS CALL
Business: {{business_name}}
Products / services: {{products_services}}
Target audience: {{target_audience}}
Value propositions: {{value_props}}
Campaign type: {{campaign_type}}
Prospect/caller name: {{prospect_name}}

BUSINESS KNOWLEDGE BASE:
{{knowledge_base}}

Use the knowledge base to answer questions about the company. Do not invent facts. If the answer is not present, say the team can follow up with the exact detail.

# CONVERSATION STYLE
- Warm, concise, confident, conversational.
- One question at a time.
- Keep most responses to 1-2 short sentences.
- Match the person's energy.
- Do not sound scripted or robotic.
- Never claim information that is not in the supplied business context.
- This is a short demo, so show capability quickly and wrap naturally after roughly 45-75 seconds unless the person is actively engaged.

# CAMPAIGN BEHAVIOR

## database_reactivation
You are reconnecting with someone who previously showed interest but did not convert.
- Confirm whether the original need still exists.
- Learn what held them back.
- If there is genuine interest, move toward an appropriate next step or appointment.
- If they are not interested, exit gracefully without pressure.

## speed_to_lead
You are responding immediately to a newly generated inbound lead.
- Ask what prompted their inquiry.
- Clarify the problem or goal.
- Reflect it back briefly.
- If appropriate, move toward an appointment or clear next step.

## appointment_setter
Your goal is to qualify lightly and book the next conversation.
- Understand need, timing, and whether this person is an appropriate decision-maker.
- Do not over-qualify.
- If appropriate, offer a meeting or callback.

## cross_sell
You are speaking with an existing customer.
- Start from their existing relationship.
- Ask how things are going.
- Only introduce an additional relevant product/service when the supplied business context supports it.
- If there is a service issue, prioritize helping with that rather than selling.

## reminder
You are confirming an existing appointment.
- Confirm they are still able to attend.
- Handle simple reschedule/cancel intent conversationally.
- Ask whether there is anything the team should know before the appointment.

## legal_after_hours
You are acting as the AFTER-HOURS INBOUND RECEPTIONIST AND INTAKE SPECIALIST for {{business_name}}. Even though the demo technology may place an outbound call to let the prospect experience the interaction, behave exactly as if THEY called the law firm after hours.

Your responsibilities:
1. Welcome the caller using the firm's name.
2. Determine whether they are a new potential client, an existing client, or another caller.
3. For a potential new client, conversationally collect useful intake details as relevant: name, callback number, email, matter/case type, state/location, brief summary, important incident/event date, upcoming deadline or court date, relevant opposing-party names for conflict checking when appropriate, urgency, and preferred follow-up time.
4. Ask one question at a time. Do not interrogate.
5. Use the firm's website-derived knowledge to answer basic questions about practice areas, locations, hours, attorneys/team, and services when present.
6. Identify urgent matters and explain that the information will be flagged for prompt review according to the firm's process.

LEGAL GUARDRAILS:
- You are not an attorney and must not give legal advice.
- Never promise the firm will accept a case.
- Never guarantee results or outcomes.
- Never claim an attorney-client relationship has been formed.
- Do not tell a caller to miss a filing, hearing, limitation period, or deadline.
- If someone describes immediate physical danger or a life-threatening emergency, tell them to contact appropriate emergency services rather than pretending an attorney is immediately available.
- Explain naturally that you are collecting information for the legal team to review and follow up.

# DEMO WRAP-UP
For non-legal campaigns, after demonstrating the selected workflow, briefly explain that this was a live personalized AI demo and ask what they would want the AI to handle in their business.

For legal_after_hours, stay in the receptionist role through the interaction. Near the end, confirm the key intake details you captured and say the firm's team would review the information and follow up. Do not switch into a sales pitch for Call Boss during the legal intake roleplay.`;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizePhone(raw: string): string | null {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return null;
}

function safeString(value: unknown, fallback = '', max = 12000): string {
  const result = typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value);
  return (result || fallback).slice(0, max);
}

function buildBeginMessage(campaignType: string, businessName: string, prospectName: string) {
  const firstName = prospectName.trim().split(/\s+/)[0] || 'there';
  switch (campaignType) {
    case 'legal_after_hours':
      return `Thank you for calling ${businessName}. This is Lady Jarvis with our after-hours intake team. How can I help you tonight?`;
    case 'speed_to_lead':
      return `Hey ${firstName}, this is Lady Jarvis with ${businessName}. I saw you just reached out and wanted to catch you while it's fresh. What are you hoping we can help with?`;
    case 'appointment_setter':
      return `Hi ${firstName}, this is Lady Jarvis with ${businessName}. I help people get connected with the right person on our team. What are you hoping to accomplish?`;
    case 'cross_sell':
      return `Hey ${firstName}, this is Lady Jarvis with ${businessName}. Thanks for being a customer. I wanted to check in — how is everything going so far?`;
    case 'reminder':
      return `Hey ${firstName}, this is Lady Jarvis with ${businessName}. I'm calling with a quick appointment reminder. Are you still good for your upcoming appointment?`;
    case 'database_reactivation':
    default:
      return `Hey ${firstName}, this is Lady Jarvis calling on behalf of ${businessName}. You'd checked us out before and I wanted to see if this is still something you're interested in.`;
  }
}

function configLooksLikeDedicatedDemo(config: any) {
  const prompt = String(config?.base_prompt || '');
  return Boolean(
    config?.retell_agent_id &&
    config?.retell_agent_id !== 'PENDING_SETUP' &&
    config?.retell_llm_id &&
    config?.retell_llm_id !== 'PENDING_SETUP' &&
    config?.demo_phone_number &&
    /lady jarvis/i.test(prompt) &&
    prompt.includes('{{business_name}}') &&
    !/solar\s+(sales|lead|appointment|homeowner|panel|installation|installer)/i.test(prompt)
  );
}

async function ensureGenericDynamicPrompt(retellApiKey: string, llmId: string) {
  const headers = {
    Authorization: `Bearer ${retellApiKey}`,
    'Content-Type': 'application/json',
  };

  let alreadyCorrect = false;
  try {
    const getResponse = await fetch(`https://api.retellai.com/get-retell-llm/${llmId}`, { headers });
    if (getResponse.ok) {
      const current = await getResponse.json();
      alreadyCorrect = String(current?.general_prompt || '').includes(DEMO_PROMPT_VERSION) &&
        current?.begin_message === '{{demo_begin_message}}';
    }
  } catch (error) {
    console.warn('demo-call: unable to verify current Retell LLM prompt', (error as Error).message);
  }

  if (alreadyCorrect) return;

  const updateResponse = await fetch(`https://api.retellai.com/update-retell-llm/${llmId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      general_prompt: DYNAMIC_DEMO_PROMPT,
      begin_message: '{{demo_begin_message}}',
      start_speaker: 'agent',
    }),
  });

  if (!updateResponse.ok) {
    const detail = await updateResponse.text();
    throw new Error(`Unable to restore dedicated demo LLM: ${detail.slice(0, 300)}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed' }, 405);

  try {
    const body = await req.json();
    const {
      sessionId,
      phoneNumber,
      campaignType,
      prospectName = '',
      prospectEmail = '',
      consent,
    } = body || {};

    if (consent !== true) {
      return jsonResponse({ success: false, error: 'Explicit consent is required before a demo call can be placed.' }, 400);
    }

    if (!sessionId || !phoneNumber) {
      return jsonResponse({ success: false, error: 'Session ID and phone number are required.' }, 400);
    }

    const formattedPhone = normalizePhone(phoneNumber);
    if (!formattedPhone) {
      return jsonResponse({ success: false, error: 'Please enter a valid phone number.' }, 400);
    }

    const retellApiKey = Deno.env.get('RETELL_AI_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!retellApiKey || !supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ success: false, error: 'Demo calling is not configured.' }, 503);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('cf-connecting-ip') ||
      'unknown';
    const today = new Date().toISOString().slice(0, 10);
    const startOfDay = `${today}T00:00:00Z`;

    const [{ count: ipCount }, { count: phoneCount }] = await Promise.all([
      supabase
        .from('demo_call_logs')
        .select('id', { count: 'exact', head: true })
        .eq('ip_address', clientIp)
        .gte('created_at', startOfDay),
      supabase
        .from('demo_call_logs')
        .select('id', { count: 'exact', head: true })
        .eq('phone_number', formattedPhone)
        .gte('created_at', startOfDay),
    ]);

    if ((ipCount || 0) >= IP_DAILY_LIMIT || (phoneCount || 0) >= PHONE_DAILY_LIMIT) {
      return jsonResponse({
        success: false,
        limitReached: true,
        error: 'Demo call limit reached for today. Contact us for another personalized demo.',
      }, 429);
    }

    const { data: session, error: sessionError } = await supabase
      .from('demo_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return jsonResponse({ success: false, error: 'Demo session not found. Please analyze the website again.' }, 404);
    }

    if (session.call_initiated) {
      return jsonResponse({ success: false, error: 'This demo session has already placed its call. Start a new demo to call again.' }, 409);
    }

    const effectiveCampaignType = ALLOWED_CAMPAIGNS.has(campaignType)
      ? campaignType
      : ALLOWED_CAMPAIGNS.has(session.campaign_type)
        ? session.campaign_type
        : 'database_reactivation';

    const businessInfo = session.scraped_data || {};
    const businessName = safeString(businessInfo.business_name, '', 180).trim();
    if (!businessName) {
      return jsonResponse({ success: false, error: 'We could not identify the business from this demo session. Please rescan the website.' }, 422);
    }

    const { data: config, error: configError } = await supabase
      .from('demo_agent_config')
      .select('*')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (configError || !config || !configLooksLikeDedicatedDemo(config)) {
      console.error('demo-call: dedicated demo agent configuration is missing or unsafe', {
        sessionId,
        hasConfig: Boolean(config),
        configError: configError?.message,
      });
      return jsonResponse({
        success: false,
        error_code: 'DEMO_AGENT_CONFIG_INVALID',
        error: 'We could not safely personalize your demo call. Please try again shortly.',
      }, 503);
    }

    const agentId = config.retell_agent_id as string;
    const llmId = config.retell_llm_id as string;
    const fromNumber = normalizePhone(config.demo_phone_number as string);
    if (!fromNumber) {
      return jsonResponse({ success: false, error: 'The dedicated demo phone number is not configured correctly.' }, 503);
    }

    // The former implementation personalized one shared LLM in-place before each call.
    // Restore the shared LLM to one generic dynamic-variable template instead. The
    // business/campaign context below is injected per call, preventing cross-session leakage.
    await ensureGenericDynamicPrompt(retellApiKey, llmId);

    if (!String(config.base_prompt || '').includes(DEMO_PROMPT_VERSION)) {
      await supabase
        .from('demo_agent_config')
        .update({ base_prompt: DYNAMIC_DEMO_PROMPT, updated_at: new Date().toISOString() })
        .eq('id', config.id);
    }

    const dynamicVariables: Record<string, string> = {
      business_name: businessName,
      products_services: safeString(businessInfo.products_services, 'the company\'s products and services', 2500),
      target_audience: safeString(businessInfo.target_audience, 'prospective customers', 1500),
      value_props: safeString(businessInfo.value_props, '[]', 3000),
      knowledge_base: safeString(businessInfo.knowledge_base, 'No additional website knowledge was available.', 12000),
      campaign_type: effectiveCampaignType,
      prospect_name: safeString(prospectName, '', 180),
      prospect_email: safeString(prospectEmail, '', 320),
      demo_begin_message: buildBeginMessage(effectiveCampaignType, businessName, safeString(prospectName, '', 180)),
    };

    console.log('demo-call: dispatching personalized demo', {
      sessionId,
      businessName,
      campaignType: effectiveCampaignType,
      agentId,
      llmId,
      dynamicVariablesAttached: true,
      provider: 'retell',
    });

    const callResponse = await fetch('https://api.retellai.com/v2/create-phone-call', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${retellApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from_number: fromNumber,
        to_number: formattedPhone,
        // Retell v2 uses override_agent_id for a one-call agent override. Using agent_id
        // here can fall through to the agent bound to the phone number (the source of
        // the prior solar-agent behavior when this demo number was reused elsewhere).
        override_agent_id: agentId,
        retell_llm_dynamic_variables: dynamicVariables,
        metadata: {
          demo_session_id: sessionId,
          campaign_type: effectiveCampaignType,
          business_name: businessName,
          demo_prompt_version: DEMO_PROMPT_VERSION,
        },
      }),
    });

    const callData = await callResponse.json().catch(() => ({}));
    if (!callResponse.ok || !callData?.call_id) {
      console.error('demo-call: Retell rejected call', {
        status: callResponse.status,
        sessionId,
        campaignType: effectiveCampaignType,
        message: callData?.message || callData?.error,
      });
      return jsonResponse({ success: false, error: callData?.message || 'Failed to initiate the personalized demo call.' }, 400);
    }

    await supabase.from('demo_call_logs').insert({
      session_id: sessionId,
      phone_number: formattedPhone,
      ip_address: clientIp,
      retell_call_id: callData.call_id,
      status: 'initiated',
    });

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

    // Keep the demo follow-up useful, but do not turn the legal receptionist roleplay
    // into an outbound sales sequence.
    try {
      const smsMessage = effectiveCampaignType === 'legal_after_hours'
        ? `That was your Call Boss after-hours legal intake demo for ${businessName}. The live version can answer, capture intake details, and flag urgent calls 24/7.`
        : `That was your personalized Lady Jarvis demo for ${businessName}. The live system can run this workflow automatically at scale.`;

      await fetch(`${supabaseUrl}/functions/v1/sms-messaging`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'send_sms',
          to: formattedPhone,
          from: fromNumber,
          message: smsMessage,
        }),
      });
    } catch (smsError) {
      console.warn('demo-call: follow-up SMS failed', (smsError as Error).message);
    }

    return jsonResponse({
      success: true,
      callId: callData.call_id,
      agentId,
      campaignType: effectiveCampaignType,
      message: 'Personalized demo call initiated.',
    });
  } catch (error) {
    console.error('demo-call: unexpected error', (error as Error).message);
    return jsonResponse({ success: false, error: 'Unable to start the demo call right now. Please try again.' }, 500);
  }
});
