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
    const RETELL_API_KEY = Deno.env.get('RETELL_AI_API_KEY');
    if (!RETELL_API_KEY) {
      return new Response(JSON.stringify({ error: 'RETELL_AI_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body = await req.json();
    const { agent_id, action } = body;

    const WEBHOOK_URL = `${Deno.env.get('SUPABASE_URL')}/functions/v1/retell-call-webhook`;

    if (action === 'update_webhook') {
      // First GET the agent to see current config
      const getResp = await fetch(`https://api.retellai.com/v2/get-agent/${agent_id}`, {
        headers: { 'Authorization': `Bearer ${RETELL_API_KEY}` }
      });
      const currentAgent = await getResp.json();
      console.log('Current agent webhook_url:', currentAgent.webhook_url);
      console.log('Current agent post_call_analysis_data:', currentAgent.post_call_analysis_data);

      // Update the agent with webhook URL
      const updateResp = await fetch(`https://api.retellai.com/v2/update-agent/${agent_id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${RETELL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          webhook_url: WEBHOOK_URL,
          post_call_analysis_data: [
            { type: "transcript", name: "transcript" },
            { type: "custom_analysis_data", name: "call_analysis" }
          ]
        })
      });

      const updateResult = await updateResp.json();
      console.log('Update result status:', updateResp.status);
      console.log('New webhook_url:', updateResult.webhook_url);

      return new Response(JSON.stringify({
        success: updateResp.ok,
        previous_webhook: currentAgent.webhook_url || '(not set)',
        new_webhook: updateResult.webhook_url,
        agent_name: updateResult.agent_name,
        agent_id: updateResult.agent_id
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'make_test_call') {
      const { to_number, from_number } = body;
      
      const callResp = await fetch('https://api.retellai.com/v2/create-phone-call', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RETELL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from_number: from_number,
          to_number: to_number,
          override_agent_id: agent_id
        })
      });

      const callResult = await callResp.json();
      console.log('Call result:', JSON.stringify(callResult));

      return new Response(JSON.stringify({
        success: callResp.ok,
        call_id: callResult.call_id,
        status: callResult.call_status,
        error: callResult.error_message || null
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'check_agent') {
      const getResp = await fetch(`https://api.retellai.com/v2/get-agent/${agent_id}`, {
        headers: { 'Authorization': `Bearer ${RETELL_API_KEY}` }
      });
      const agent = await getResp.json();
      return new Response(JSON.stringify({
        agent_id: agent.agent_id,
        agent_name: agent.agent_name,
        webhook_url: agent.webhook_url,
        voice_id: agent.voice_id,
        llm_websocket_url: agent.llm_websocket_url,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
