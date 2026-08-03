import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function isQuickTestCallCertified(): boolean {
  const raw = Deno.env.get('QUICK_TEST_CALL_CERTIFIED');
  if (raw == null) return true;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

function normalizePhoneNumber(value: string): string {
  const digitsOnly = value.replace(/\D/g, '');
  if (!digitsOnly) return '';
  if (digitsOnly.length === 10) return `+1${digitsOnly}`;
  if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) return `+${digitsOnly}`;
  return `+${digitsOnly}`;
}

function parseBool(raw: string | null | undefined, fallback = false): boolean {
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  if (!isQuickTestCallCertified()) {
    return new Response(JSON.stringify({
      success: false,
      disabled: true,
      error_code: 'TWILIO_TEST_CALL_EGRESS_NOT_CERTIFIED',
      error: 'Twilio test calls are disabled until they use the canonical provider boundary.',
    }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Supabase configuration missing' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token || token === serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Quick test calls require a user JWT' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const toNumber = normalizePhoneNumber(String(body.toNumber || body.to || ''));
    const fromNumber = normalizePhoneNumber(String(body.fromNumber || ''));
    let organizationId = typeof body.organizationId === 'string' ? body.organizationId.trim() : '';
    let campaignId = typeof body.campaignId === 'string' ? body.campaignId.trim() : '';
    let leadId = typeof body.leadId === 'string' ? body.leadId.trim() : '';
    let agentId = typeof body.agentId === 'string' ? body.agentId.trim() : '';

    if (!toNumber || !fromNumber) {
      return new Response(JSON.stringify({ error: 'toNumber and fromNumber are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!organizationId) {
      const { data: callerNumber, error: callerLookupError } = await supabase
        .from('phone_numbers')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .in('number', [fromNumber, `+${fromNumber.replace(/^\+/, '')}`, fromNumber.replace(/^\+/, '')])
        .eq('provider', 'retell')
        .not('retell_phone_id', 'is', null)
        .limit(1)
        .maybeSingle();

      if (callerLookupError) {
        return new Response(JSON.stringify({ error: `Caller number lookup failed: ${callerLookupError.message}` }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!callerNumber?.organization_id) {
        return new Response(JSON.stringify({
          error: 'Could not resolve organization from fromNumber. Include organizationId explicitly.',
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      organizationId = callerNumber.organization_id;
    }

    if (!campaignId) {
      const { data: activeCampaign, error: campaignLookupError } = await supabase
        .from('campaigns')
        .select('id, agent_id, provider')
        .eq('user_id', user.id)
        .eq('organization_id', organizationId)
        .eq('status', 'active')
        .in('provider', ['retell', 'both'])
        .limit(1)
        .maybeSingle();

      if (campaignLookupError) {
        return new Response(JSON.stringify({ error: `Campaign lookup failed: ${campaignLookupError.message}` }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!activeCampaign) {
        return new Response(JSON.stringify({
          error: 'No active Retell campaign found for this company. Create one campaign or pass campaignId explicitly.',
        }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      campaignId = activeCampaign.id;
      if (!agentId) {
        agentId = activeCampaign.agent_id || '';
      }
    }

    if (!leadId) {
      const { data: existingLead, error: leadLookupError } = await supabase
        .from('leads')
        .select('id')
        .eq('user_id', user.id)
        .eq('organization_id', organizationId)
        .eq('phone_number', toNumber)
        .maybeSingle();
      if (leadLookupError) {
        return new Response(JSON.stringify({ error: `Lead lookup failed: ${leadLookupError.message}` }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (existingLead?.id) {
        leadId = existingLead.id;
      } else {
        const leadInsert = await supabase
          .from('leads')
          .insert({
            user_id: user.id,
            organization_id: organizationId,
            phone_number: toNumber,
            first_name: 'Quick',
            last_name: 'Test',
            status: 'new',
            source: 'quick_test',
            tags: ['quick-test'],
            notes: 'Created for quick test call',
          })
          .select('id')
          .single();
        if (leadInsert.error) {
          return new Response(JSON.stringify({ error: `Failed to create test lead: ${leadInsert.error.message}` }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        leadId = leadInsert.data?.id || '';
      }
    }

    if (!leadId) {
      return new Response(JSON.stringify({ error: 'Could not resolve a test lead.' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error: campaignLeadError } = await supabase
      .from('campaign_leads')
      .upsert({
        campaign_id: campaignId,
        lead_id: leadId,
        added_by: user.id,
      }, { onConflict: 'campaign_id,lead_id' });
    if (campaignLeadError) {
      return new Response(JSON.stringify({ error: `Failed to enroll lead in campaign: ${campaignLeadError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!agentId) {
      const { data: defaultAgent, error: defaultAgentError } = await supabase
        .from('retell_agents')
        .select('retell_agent_id')
        .eq('user_id', user.id)
        .eq('organization_id', organizationId)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
      if (defaultAgentError) {
        return new Response(JSON.stringify({ error: `Failed to resolve an active Retell agent: ${defaultAgentError.message}` }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!defaultAgent?.retell_agent_id) {
        return new Response(JSON.stringify({ error: 'No active Retell agent is configured for this company.' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      agentId = defaultAgent.retell_agent_id;
    }

    const outboundResponse = await fetch(`${supabaseUrl}/functions/v1/outbound-calling`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'create_call',
        organizationId,
        campaignId,
        leadId,
        phoneNumber: toNumber,
        callerId: fromNumber,
        agentId,
        isTestCall: true,
        idempotencyKey: `quick-call:${user.id}:${crypto.randomUUID()}`,
      }),
    });

    const outboundText = await outboundResponse.text();
    if (!outboundResponse.ok) {
      return new Response(JSON.stringify({
        success: false,
        error: `Outbound calling failed (${outboundResponse.status})`,
        details: outboundText,
      }), {
        status: outboundResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let outboundData: any = null;
    try {
      outboundData = JSON.parse(outboundText);
    } catch (error: any) {
      return new Response(JSON.stringify({
        success: false,
        error: 'outbound-calling returned invalid JSON',
        details: error?.message || String(error),
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!outboundData?.success && !outboundData?.call_id) {
      return new Response(JSON.stringify({
        success: false,
        error: 'outbound-calling did not return a call identifier',
        details: outboundData,
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      to: toNumber,
      from: fromNumber,
      callSid: outboundData.call_id || outboundData?.provider_call_id,
      call_id: outboundData.call_id || outboundData?.provider_call_id,
      call_log_id: outboundData.call_log_id,
      organizationId,
      campaignId,
      leadId,
      attempt_recorded: parseBool(String(outboundData.attempt_recorded), false),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[quick-test-call] Error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

