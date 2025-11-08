
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { extractAreaCode } from '../_shared/phone-parser.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OutboundCallRequest {
  action: 'create_call' | 'get_call_status' | 'end_call';
  campaignId?: string;
  leadId?: string;
  phoneNumber?: string;
  callerId?: string;
  agentId?: string;
  retellCallId?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    console.log('[Outbound Calling] Request received');
    console.log('[Outbound Calling] Auth header present:', !!authHeader);
    
    if (!authHeader) {
      console.error('[Outbound Calling] Missing Authorization header');
      return new Response(
        JSON.stringify({ 
          error: 'Missing authorization. Please log in and try again.',
          details: 'Authorization header not found'
        }), 
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Create client with service role for backend operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    console.log('[Outbound Calling] Supabase URL configured:', !!supabaseUrl);
    console.log('[Outbound Calling] Service role key configured:', !!serviceRoleKey);

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase configuration missing');
    }

    // Use service role client for all operations
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Extract JWT token from Authorization header
    const token = authHeader.replace('Bearer ', '');
    
    // Verify the JWT token directly
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    console.log('[Outbound Calling] Auth verification:', { 
      hasUser: !!user, 
      userId: user?.id,
      error: authError?.message 
    });
    
    if (authError || !user) {
      console.error('[Outbound Calling] Auth failed:', authError?.message || 'No user');
      return new Response(
        JSON.stringify({ 
          error: 'Authentication failed: Auth session missing!',
          details: authError?.message || 'Invalid or expired session. Please refresh and try again.'
        }), 
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('[Outbound Calling] ✓ User verified:', user.id);

    
    const { 
      action, 
      campaignId, 
      leadId, 
      phoneNumber, 
      callerId, 
      agentId, 
      retellCallId
    }: OutboundCallRequest = await req.json();

    const apiKey = Deno.env.get('RETELL_AI_API_KEY');
    if (!apiKey) {
      throw new Error('RETELL_AI_API_KEY is not configured');
    }

    console.log(`[Outbound Calling] Processing ${action} request for user:`, user.id);


    const baseUrl = 'https://api.retellai.com/v2';
    const retellHeaders = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    let response;
    let result: any = {};

    switch (action) {
      case 'create_call':
        if (!phoneNumber || !callerId || !agentId) {
          throw new Error('Phone number, caller ID, and agent ID are required');
        }

        console.log('[Outbound Calling] Creating call log for user:', user.id);

        // Fetch lead details for personalization
        let leadData = null;
        if (leadId) {
          const { data: lead, error: leadError } = await supabaseAdmin
            .from('leads')
            .select('first_name, last_name, email, company, phone_number, status, priority, notes')
            .eq('id', leadId)
            .single();
          
          if (!leadError && lead) {
            leadData = lead;
            console.log('[Outbound Calling] Lead data retrieved:', {
              name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
              company: lead.company
            });
          }
        }

        // Use admin client for database operations
        const { data: callLog, error: callLogError } = await supabaseAdmin
          .from('call_logs')
          .insert({
            user_id: user.id,
            campaign_id: campaignId,
            lead_id: leadId,
            phone_number: phoneNumber,
            caller_id: callerId,
            status: 'queued'
          })
          .select()
          .single();

        if (callLogError) {
          console.error('[Outbound Calling] Call log error:', callLogError);
          throw callLogError;
        }

        console.log('[Outbound Calling] Call log created:', callLog.id);

        // Create outbound call via Retell AI
        console.log('[Outbound Calling] Initiating Retell AI call:', {
          from: callerId,
          to: phoneNumber,
          agent: agentId
        });

        response = await fetch(`${baseUrl}/create-phone-call`, {
          method: 'POST',
          headers: retellHeaders,
          body: JSON.stringify({
            from_number: callerId,
            to_number: phoneNumber,
            override_agent_id: agentId,
            // metadata is for internal tracking only
            metadata: {
              campaign_id: campaignId,
              lead_id: leadId,
              call_log_id: callLog.id,
            },
            // dynamic_variables makes data accessible in agent prompt using {{variable_name}}
            ...(leadData && {
              dynamic_variables: {
                first_name: leadData.first_name || '',
                last_name: leadData.last_name || '',
                full_name: `${leadData.first_name || ''} ${leadData.last_name || ''}`.trim() || 'there',
                contact_name: `${leadData.first_name || ''} ${leadData.last_name || ''}`.trim() || 'there',
                email: leadData.email || '',
                company: leadData.company || '',
                status: leadData.status || '',
                priority: leadData.priority?.toString() || '',
                notes: leadData.notes || '',
              }
            })
          }),
        });

        if (!response.ok) {
          const errorData = await response.text();
          console.error('[Outbound Calling] Retell API error:', errorData);
          
          // Update call log to failed using admin client
          await supabaseAdmin
            .from('call_logs')
            .update({ status: 'failed' })
            .eq('id', callLog.id);
            
          throw new Error(`Retell AI API error: ${response.status} - ${errorData}`);
        }

        const callData = await response.json();
        console.log('[Outbound Calling] Retell AI call created:', callData.call_id);

        // Update call log with Retell call ID using admin client
        await supabaseAdmin
          .from('call_logs')
          .update({ 
            retell_call_id: callData.call_id,
            status: 'ringing'
          })
          .eq('id', callLog.id);

        result = { 
          call_id: callData.call_id, 
          call_log_id: callLog.id,
          status: 'created' 
        };
        break;

      case 'get_call_status':
        if (!retellCallId) {
          throw new Error('Retell call ID is required');
        }

        response = await fetch(`${baseUrl}/get-call/${retellCallId}`, {
          method: 'GET',
          headers: retellHeaders,
        });

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(`Retell AI API error: ${response.status} - ${errorData}`);
        }

        result = await response.json();
        break;

      case 'end_call':
        if (!retellCallId) {
          throw new Error('Retell call ID is required');
        }

        response = await fetch(`${baseUrl}/stop-call/${retellCallId}`, {
          method: 'POST',
          headers: retellHeaders,
        });

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(`Retell AI API error: ${response.status} - ${errorData}`);
        }

        result = { success: true };
        break;

      default:
        throw new Error(`Unsupported action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Outbound Calling] Error:', error);
    console.error('[Outbound Calling] Error stack:', error.stack);
    return new Response(JSON.stringify({ 
      error: error.message,
      details: 'Check edge function logs for more information'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
