import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Call Dispatcher running for user:', user.id);

    // Get user's active campaigns
    const { data: activeCampaigns, error: campaignError } = await supabase
      .from('campaigns')
      .select('id, name, agent_id, max_attempts')
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (campaignError) throw campaignError;

    if (!activeCampaigns || activeCampaigns.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No active campaigns', dispatched: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const campaignIds = activeCampaigns.map(c => c.id);
    console.log('Active campaigns:', campaignIds);

    // Check existing queue entries
    const { data: existingQueue } = await supabase
      .from('dialing_queues')
      .select('lead_id')
      .in('campaign_id', campaignIds)
      .in('status', ['pending', 'calling']);

    const existingLeadIds = new Set((existingQueue || []).map(q => q.lead_id));

    // Get leads from campaign_leads that need to be queued
    const { data: campaignLeads, error: leadsError } = await supabase
      .from('campaign_leads')
      .select(`
        campaign_id,
        lead_id,
        leads (
          id,
          phone_number,
          status,
          do_not_call
        )
      `)
      .in('campaign_id', campaignIds);

    if (leadsError) throw leadsError;

    // Filter leads that need to be added to queue
    const leadsToQueue = (campaignLeads || []).filter(cl => {
      const lead = cl.leads as any;
      if (!lead || !lead.phone_number) return false;
      if (lead.do_not_call) return false;
      if (existingLeadIds.has(cl.lead_id)) return false;
      // Only queue leads with status 'new' or 'contacted'
      if (!['new', 'contacted', 'callback'].includes(lead.status)) return false;
      return true;
    });

    console.log(`Found ${leadsToQueue.length} leads to add to queue`);

    // Add leads to dialing queue
    if (leadsToQueue.length > 0) {
      const campaign = activeCampaigns[0]; // Use first campaign for defaults
      const queueEntries = leadsToQueue.map(cl => {
        const lead = cl.leads as any;
        return {
          campaign_id: cl.campaign_id,
          lead_id: cl.lead_id,
          phone_number: lead.phone_number,
          status: 'pending',
          priority: 1,
          max_attempts: campaign.max_attempts || 3,
          attempts: 0,
          scheduled_at: new Date().toISOString()
        };
      });

      const { error: queueError } = await supabase
        .from('dialing_queues')
        .insert(queueEntries);

      if (queueError) {
        console.error('Error adding to queue:', queueError);
      } else {
        console.log(`Added ${queueEntries.length} leads to dialing queue`);
      }
    }

    // Now get pending calls from queue
    const { data: pendingCalls, error: queueError } = await supabase
      .from('dialing_queues')
      .select(`
        *,
        campaigns (
          id,
          name,
          status,
          calls_per_minute,
          agent_id,
          user_id
        ),
        leads (
          id,
          first_name,
          last_name,
          phone_number
        )
      `)
      .in('campaign_id', campaignIds)
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .order('scheduled_at', { ascending: true })
      .limit(10);

    if (queueError) throw queueError;

    const userCalls = pendingCalls || [];

    if (userCalls.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: 'No pending calls to dispatch - all leads may have been contacted or are ineligible',
          dispatched: 0,
          queued: leadsToQueue.length
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${userCalls.length} pending calls to dispatch`);

    // Get available phone numbers from pool
    const { data: availableNumbers, error: numbersError } = await supabase
      .from('phone_numbers')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .is('quarantine_until', null);

    if (numbersError) throw numbersError;

    if (!availableNumbers || availableNumbers.length === 0) {
      console.log('No available numbers in pool');
      return new Response(
        JSON.stringify({ 
          error: 'No available phone numbers in pool. Please add active phone numbers first.',
          dispatched: 0 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${availableNumbers.length} available numbers in pool`);

    // Get Retell AI key from environment
    const retellApiKey = Deno.env.get('RETELL_AI_API_KEY');

    if (!retellApiKey) {
      return new Response(
        JSON.stringify({ error: 'RETELL_AI_API_KEY not configured in Supabase secrets' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let dispatchedCount = 0;
    const dispatchResults: any[] = [];
    const numberPool = [...availableNumbers];

    // Process each pending call
    for (const call of userCalls.slice(0, 5)) {
      try {
        const lead = call.leads as any;
        const campaign = call.campaigns as any;
        
        if (!lead?.phone_number || !campaign?.agent_id) {
          console.log('Skipping call - missing lead phone or agent:', call.id);
          continue;
        }

        // Select best number
        const selectedNumber = selectBestNumber(numberPool, lead.phone_number);

        if (!selectedNumber) {
          console.log('No suitable number found for call:', call.id);
          continue;
        }

        console.log(`Selected number ${selectedNumber.number} for call to ${lead.phone_number}`);

        // Mark queue entry as calling
        await supabase
          .from('dialing_queues')
          .update({ status: 'calling', updated_at: new Date().toISOString() })
          .eq('id', call.id);

        // Initiate the call via outbound-calling function with service role auth
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        
        const callResponse = await fetch(`${supabaseUrl}/functions/v1/outbound-calling`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            action: 'create_call',
            userId: user.id,
            campaignId: call.campaign_id,
            leadId: call.lead_id,
            phoneNumber: lead.phone_number,
            callerId: selectedNumber.number,
            agentId: campaign.agent_id,
          })
        });

        const callData = await callResponse.json();

        if (!callResponse.ok || callData.error) {
          console.error('Call creation failed:', callData.error || `HTTP ${callResponse.status}`);
          
          await supabase
            .from('dialing_queues')
            .update({ 
              status: 'failed',
              attempts: call.attempts + 1,
              updated_at: new Date().toISOString()
            })
            .eq('id', call.id);
          
          continue;
        }

        console.log('Call created successfully:', callData);

        // Update number usage statistics
        await supabase
          .from('phone_numbers')
          .update({
            daily_calls: selectedNumber.daily_calls + 1,
            last_used: new Date().toISOString()
          })
          .eq('id', selectedNumber.id);

        // Mark queue entry as completed
        await supabase
          .from('dialing_queues')
          .update({ 
            status: 'completed',
            attempts: call.attempts + 1,
            updated_at: new Date().toISOString()
          })
          .eq('id', call.id);

        dispatchedCount++;
        dispatchResults.push({
          queue_id: call.id,
          lead: `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Unknown',
          phone: lead.phone_number,
          number_used: selectedNumber.number,
          call_id: callResponse.data?.call_id
        });

        console.log(`Successfully dispatched call ${call.id}`);

        // Remove number from pool to prevent reuse in this batch
        const idx = numberPool.findIndex(n => n.id === selectedNumber.id);
        if (idx !== -1) numberPool.splice(idx, 1);

      } catch (err: unknown) {
        const error = err as Error;
        console.error('Error dispatching call:', call.id, error.message);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        dispatched: dispatchedCount,
        results: dispatchResults,
        message: dispatchedCount > 0 
          ? `Successfully dispatched ${dispatchedCount} calls` 
          : 'No calls dispatched - check logs for details'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: unknown) {
    const error = err as Error;
    console.error('Error in call-dispatcher:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function selectBestNumber(availableNumbers: any[], targetPhone: string): any | null {
  if (availableNumbers.length === 0) return null;

  // Extract area code from target phone
  const targetAreaCode = targetPhone.replace(/\D/g, '').slice(-10, -7);

  // Score each number
  const scored = availableNumbers.map(n => {
    let score = 100;
    
    // Prefer matching area code
    if (n.area_code === targetAreaCode) {
      score += 20;
    }
    
    // Penalize high daily usage
    score -= Math.min(n.daily_calls * 2, 50);
    
    // Penalize recently used numbers
    if (n.last_used) {
      const minutesSinceUse = (Date.now() - new Date(n.last_used).getTime()) / 60000;
      if (minutesSinceUse < 5) score -= 30;
      else if (minutesSinceUse < 30) score -= 10;
    }
    
    // Penalize spam-flagged numbers
    if (n.is_spam) score -= 50;
    
    return { number: n, score };
  });

  // Sort by score descending and return best
  scored.sort((a, b) => b.score - a.score);
  
  console.log(`Best number: ${scored[0].number.number} (score: ${scored[0].score})`);
  return scored[0].number;
}
