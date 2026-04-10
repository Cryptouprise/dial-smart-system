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
      const getResp = await fetch(`https://api.retellai.com/get-agent/${agent_id}`, {
        headers: { 'Authorization': `Bearer ${RETELL_API_KEY}` }
      });
      const getRespText = await getResp.text();
      console.log('GET agent status:', getResp.status, 'body:', getRespText.substring(0, 500));
      let currentAgent: any = {};
      try { currentAgent = JSON.parse(getRespText); } catch(e) { console.error('Failed to parse GET response'); }

      // Update the agent with webhook URL
      const updateResp = await fetch(`https://api.retellai.com/update-agent/${agent_id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${RETELL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          webhook_url: WEBHOOK_URL
        })
      });

      const updateText = await updateResp.text();
      console.log('Update result status:', updateResp.status, 'body:', updateText.substring(0, 500));
      let updateResult: any = {};
      try { updateResult = JSON.parse(updateText); } catch(e) { console.error('Failed to parse update response'); }

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

      const callText = await callResp.text();
      console.log('Call result status:', callResp.status, 'body:', callText.substring(0, 500));
      let callResult: any = {};
      try { callResult = JSON.parse(callText); } catch(e) { return new Response(JSON.stringify({ success: false, error: callText.substring(0, 200) }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }

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
      const getResp = await fetch(`https://api.retellai.com/get-agent/${agent_id}`, {
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
