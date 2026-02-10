import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Lady Jarvis Master Prompt - The badass, empathetic AI sales specialist
const LADY_JARVIS_PROMPT = `# WHO YOU ARE

You are Lady Jarvis, an AI sales specialist. You're a badass who's also deeply empathetic - you use psychology to guide conversations naturally. You make people feel like they're winning, even when you're leading.

# YOUR PERSONALITY

- You're warm but direct. No corporate fluff.
- You ask ONE question at a time. Never overwhelm.
- You celebrate small wins: "That's perfect!" "Love it!" "I totally get that."
- You use rapport-building phrases naturally
- You know when to push and when to walk away gracefully
- You ONLY push qualified people - if they're not a fit, you exit gracefully

# QUALIFICATION RULES

Before pushing toward booking/next steps, confirm:
1. They have a genuine need (don't push someone who doesn't need it)
2. They have the authority to make decisions
3. The timing makes sense for them

If ANY of these are missing, gracefully exit:
"Sounds like the timing isn't quite right - no pressure at all. Keep my number and reach out whenever you're ready. Take care!"

# CONVERSATION STYLE

- Keep responses SHORT. 1-2 sentences max.
- Ask one question, wait for answer, then respond.
- Match their energy level.
- If they seem rushed, be efficient. If they're chatty, be warm.
- Always end with a clear next step or graceful exit.

# CAMPAIGN CONTEXT

You're demonstrating what AI calling can do for {{business_name}} which offers {{products_services}}.

Campaign Type: {{campaign_type}}

CAMPAIGN-SPECIFIC BEHAVIOR:

**For database_reactivation:**
Opening: "Hey! This is Lady Jarvis calling on behalf of {{business_name}}. I noticed you checked us out a while back but we never connected. Quick question - is that still something you're looking for, or has that ship sailed?"
- If interested: "Perfect! What held you back last time?" → Listen → Address → Offer booking
- If not interested: "No worries at all! Mind sharing what you ended up going with?" → Graceful exit
- If bad timing: "I totally get it. When would make more sense?" → Set callback or exit

**For speed_to_lead:**
Opening: "Hey! This is Lady Jarvis from {{business_name}} - I saw you just checked us out online. Wanted to catch you while you're in research mode. What specific problem are you trying to solve?"
- Listen to their problem
- Reflect back: "So basically you need X because of Y, right?"
- If qualified: "I can definitely help. Want me to get you on a quick call with someone who can walk you through options?"

**For appointment_setter:**
Opening: "Hi! This is Lady Jarvis with {{business_name}}. I help people get time with our team. Quick question - what's the main thing you're hoping to accomplish?"
- Qualify: need, timeline, authority
- If qualified: "Perfect - I can get you 15 minutes with our specialist. What works better, morning or afternoon?"
- If not ready: "No rush. Want me to send some info first and follow up next week?"

**For reminder:**
Opening: "Hey! This is Lady Jarvis from {{business_name}}. Quick reminder - you've got an appointment coming up. You still good for that?"
- If confirmed: "Perfect! Anything you want me to pass along before your call?"
- If reschedule: "No problem! What works better?" 
- If cancel: "Got it. Mind if I ask what changed?"

**For cross_sell:**
Opening: "Hey! This is Lady Jarvis from {{business_name}}. Thanks for being a customer! Quick question - how's everything going with what you have?"
- Start with appreciation
- If happy: "Love it! Based on what you're using, you might like [product X]. Want me to tell you about it?"
- If issues: "Oh no, let's fix that first. What's going on?"

# DEMO WRAP-UP

After 30-45 seconds, wrap up with:
"This is just a quick demo of Lady Jarvis in action. Pretty impressive, right? The full platform lets you make thousands of these calls on autopilot. Was there anything specific you'd want her to do differently?"

End gracefully. This is about showing capability.

# VOICE GUIDELINES

- Sound confident but never aggressive
- Pause naturally between thoughts
- Use "mmhmm" and "got it" acknowledgments
- Laugh naturally if they make a joke
- Never sound robotic or scripted`;

const LADY_JARVIS_DEMO_PHONE = '+14752429282';
const DEFAULT_WEBHOOK_URL = 'https://emonjusymdripmkvtttc.supabase.co/functions/v1/retell-call-webhook';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const retellApiKey = Deno.env.get('RETELL_AI_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!retellApiKey) {
      throw new Error('RETELL_AI_API_KEY is not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const retellHeaders = {
      'Authorization': `Bearer ${retellApiKey}`,
      'Content-Type': 'application/json',
    };

    console.log('🚀 Starting Lady Jarvis setup...');

    // Step 1: Create the LLM with Lady Jarvis prompt
    console.log('📝 Creating Lady Jarvis LLM...');
    
    const llmResponse = await fetch('https://api.retellai.com/create-retell-llm', {
      method: 'POST',
      headers: retellHeaders,
      body: JSON.stringify({
        general_prompt: LADY_JARVIS_PROMPT,
        model: 'gpt-4o',
        begin_message: "Hey there! This is Lady Jarvis. How's it going?",
      }),
    });

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      console.error('Failed to create LLM:', errorText);
      throw new Error(`Failed to create LLM: ${errorText}`);
    }

    const llmData = await llmResponse.json();
    const llmId = llmData.llm_id;
    console.log('✅ LLM created:', llmId);

    // Step 2: Create the Agent linked to the LLM
    // Using 11labs-Myra - a warm female voice from Retell's voice library
    console.log('🤖 Creating Lady Jarvis Agent...');
    
    const agentResponse = await fetch('https://api.retellai.com/create-agent', {
      method: 'POST',
      headers: retellHeaders,
      body: JSON.stringify({
        agent_name: 'Lady Jarvis Demo',
        voice_id: '11labs-Myra', // Warm female voice
        response_engine: {
          type: 'retell-llm',
          llm_id: llmId,
        },
        webhook_url: DEFAULT_WEBHOOK_URL,
        begin_message_delay_ms: 1500,
      }),
    });

    if (!agentResponse.ok) {
      const errorText = await agentResponse.text();
      console.error('Failed to create agent:', errorText);
      throw new Error(`Failed to create agent: ${errorText}`);
    }

    const agentData = await agentResponse.json();
    const agentId = agentData.agent_id;
    console.log('✅ Agent created:', agentId);

    // Step 3: Link agent to phone number in Retell
    console.log('🔗 Linking Lady Jarvis to phone number in Retell...');

    const phoneUpdateResponse = await fetch(
      `https://api.retellai.com/update-phone-number/${encodeURIComponent(LADY_JARVIS_DEMO_PHONE)}`,
      {
        method: 'PATCH',
        headers: retellHeaders,
        body: JSON.stringify({
          outbound_agent_id: agentId,
          inbound_agent_id: agentId,
          nickname: 'Lady Jarvis Demo Line',
        }),
      }
    );

    if (!phoneUpdateResponse.ok) {
      const errorText = await phoneUpdateResponse.text();
      console.error('Failed to link agent to phone:', errorText);
      console.warn('⚠️ Agent created but phone link failed - may need manual assignment in Retell dashboard');
    } else {
      console.log('✅ Lady Jarvis linked to phone number for outbound calls');
    }

    // Step 4: Update demo_agent_config with the new IDs
    console.log('💾 Updating demo_agent_config...');

    // First check if config exists
    const { data: existingConfig } = await supabase
      .from('demo_agent_config')
      .select('id')
      .limit(1)
      .maybeSingle();

    const configData = {
      retell_agent_id: agentId,
      retell_llm_id: llmId,
      demo_phone_number: LADY_JARVIS_DEMO_PHONE,
      base_prompt: LADY_JARVIS_PROMPT,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    if (existingConfig) {
      // Update existing
      const { error: updateError } = await supabase
        .from('demo_agent_config')
        .update(configData)
        .eq('id', existingConfig.id);

      if (updateError) {
        console.error('Failed to update demo_agent_config:', updateError);
        throw updateError;
      }
    } else {
      // Insert new
      const { error: insertError } = await supabase
        .from('demo_agent_config')
        .insert(configData);

      if (insertError) {
        console.error('Failed to insert demo_agent_config:', insertError);
        throw insertError;
      }
    }
    console.log('✅ demo_agent_config updated');

    // Step 5: Update phone_numbers friendly_name
    console.log('📱 Updating phone number friendly name...');
    
    const { error: phoneUpdateError } = await supabase
      .from('phone_numbers')
      .update({
        friendly_name: 'Lady Jarvis Demo Line',
        updated_at: new Date().toISOString(),
      })
      .eq('number', LADY_JARVIS_DEMO_PHONE);

    if (phoneUpdateError) {
      console.warn('Could not update phone friendly name:', phoneUpdateError);
    } else {
      console.log('✅ Phone number updated');
    }

    console.log('🎉 Lady Jarvis setup complete!');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Lady Jarvis has been created and configured!',
        details: {
          llm_id: llmId,
          agent_id: agentId,
          phone_number: LADY_JARVIS_DEMO_PHONE,
          agent_name: 'Lady Jarvis Demo',
          voice: '11labs-Sarah',
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in setup-lady-jarvis:', error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
