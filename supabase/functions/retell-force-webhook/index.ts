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
    const authHeader = req.headers.get('Authorization');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!authHeader || !supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ success: false, error: 'Authenticated user context is required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token || token === serviceRoleKey) {
      return new Response(JSON.stringify({ success: false, error: 'This maintenance endpoint requires a user JWT' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid or expired session' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const RETELL_API_KEY = Deno.env.get('RETELL_AI_API_KEY');
    if (!RETELL_API_KEY) {
      return new Response(JSON.stringify({ error: 'RETELL_AI_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body = await req.json();
    const { agent_id, action } = body;
    if (!agent_id || typeof agent_id !== 'string') {
      return new Response(JSON.stringify({ success: false, error: 'agent_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: ownedAgent, error: agentLookupError } = await supabase
      .from('retell_agents')
      .select('retell_agent_id, user_id, status')
      .eq('retell_agent_id', agent_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (agentLookupError) throw new Error(`Agent ownership lookup failed: ${agentLookupError.message}`);
    if (!ownedAgent || (ownedAgent.status && ownedAgent.status !== 'active')) {
      return new Response(JSON.stringify({ success: false, error: 'Agent is not owned by the authenticated user' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const WEBHOOK_URL = `${supabaseUrl}/functions/v1/retell-call-webhook`;

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
      const { to_number, from_number, idempotency_key } = body;
      if (!to_number || !from_number || typeof idempotency_key !== 'string' || idempotency_key.length < 8) {
        return new Response(JSON.stringify({ success: false, error: 'to_number, from_number, and idempotency_key are required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Route every physical call through the canonical boundary. It rechecks
      // caller/agent ownership, certified tenant context, destination policy,
      // DNC, global stops, billing, attempt accounting, and ambiguous creates.
      const callResp = await fetch(`${supabaseUrl}/functions/v1/outbound-calling`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'create_call',
          provider: 'retell',
          phoneNumber: to_number,
          callerId: from_number,
          agentId: agent_id,
          isTestCall: true,
          idempotencyKey: idempotency_key,
        })
      });

      const callText = await callResp.text();
      console.log('Canonical test-call result status:', callResp.status, 'body:', callText.substring(0, 500));
      let callResult: any = {};
      try {
        callResult = JSON.parse(callText);
      } catch {
        return new Response(JSON.stringify({ success: false, error: 'outbound-calling returned invalid JSON' }), {
          status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        ...callResult,
        success: callResp.ok && callResult.success === true,
      }), {
        status: callResp.status,
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
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
