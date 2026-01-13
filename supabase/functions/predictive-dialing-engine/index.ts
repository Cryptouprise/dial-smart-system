import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DialingRequestSchema = z.object({
  campaignId: z.string().uuid('Invalid campaign ID format'),
  action: z.enum(['start', 'stop', 'status'])
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ error: 'Supabase configuration missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - missing authorization header' }),
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

    if (req.method === 'GET') {
      console.log('Fetching active dialing queues for user:', user.id);

      const { data: queues, error: queuesError } = await supabase
        .from('dialing_queues')
        .select(`
          *,
          campaigns (
            id,
            name,
            status,
            calls_per_minute
          ),
          leads (
            id,
            first_name,
            last_name,
            phone_number,
            status
          )
        `)
        .in('status', ['pending', 'calling'])
        .order('priority', { ascending: false })
        .order('scheduled_at', { ascending: true });

      if (queuesError) throw queuesError;

      const { data: userCampaigns } = await supabase
        .from('campaigns')
        .select('id')
        .eq('user_id', user.id);

      const userCampaignIds = userCampaigns?.map(c => c.id) || [];
      const userQueues = queues?.filter(q => userCampaignIds.includes(q.campaign_id)) || [];

      return new Response(
        JSON.stringify({ queues: userQueues }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    
    // Validate input
    const validationResult = DialingRequestSchema.safeParse(body);
    if (!validationResult.success) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid request data',
          details: validationResult.error.issues.map(i => i.message)
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { campaignId, action } = validationResult.data;

    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (campaignError || !campaign) {
      return new Response(
        JSON.stringify({ error: 'Campaign not found or unauthorized' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    switch (action) {
      case 'start': {
        console.log(`Starting dialing for campaign ${campaignId}`);

        const { data: campaignLeads, error: leadsError } = await supabase
          .from('campaign_leads')
          .select(`
            lead_id,
            leads (
              id,
              phone_number,
              status,
              first_name,
              last_name
            )
          `)
          .eq('campaign_id', campaignId);

        if (leadsError) throw leadsError;

        const callableLeads = campaignLeads?.filter((cl: any) =>
          cl.leads && ['new', 'contacted', 'qualified'].includes(cl.leads.status)
        ) || [];

        const callableLeadIds = callableLeads
          .map((cl: any) => cl.leads?.id)
          .filter((id: any) => id != null);

        // Reset failed/completed/paused queue entries for callable leads so they can be re-dialed
        // This handles the UNIQUE constraint on (campaign_id, lead_id)
        if (callableLeadIds.length > 0) {
          const { data: resetEntries, error: resetError } = await supabase
            .from('dialing_queues')
            .update({
              status: 'pending',
              attempts: 0,
              scheduled_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('campaign_id', campaignId)
            .in('lead_id', callableLeadIds)
            .in('status', ['failed', 'completed', 'paused'])
            .select('lead_id');

          if (resetError) {
            console.error('[Dialing] Error resetting queue entries:', resetError);
          } else if (resetEntries && resetEntries.length > 0) {
            console.log(`[Dialing] Reset ${resetEntries.length} previously failed/completed queue entries`);
          }
        }

        // Check which leads are already in queue (pending or calling - actively being processed)
        const { data: existingQueue } = await supabase
          .from('dialing_queues')
          .select('lead_id')
          .eq('campaign_id', campaignId)
          .in('status', ['pending', 'calling']);

        const existingLeadIds = new Set(existingQueue?.map(q => q.lead_id) || []);

        // Only create new entries for leads not already in the queue
        const queueEntries = callableLeads
          .filter((cl: any) => !existingLeadIds.has(cl.leads?.id))
          .map((cl: any) => ({
            campaign_id: campaignId,
            lead_id: cl.leads?.id,
            phone_number: cl.leads?.phone_number,
            priority: 1,
            scheduled_at: new Date().toISOString(),
            status: 'pending',
            attempts: 0,
            max_attempts: campaign.max_attempts || 3,
          }));

        if (queueEntries.length > 0) {
          const { error: insertError } = await supabase
            .from('dialing_queues')
            .insert(queueEntries);

          if (insertError) throw insertError;
        }

        const { error: updateError } = await supabase
          .from('campaigns')
          .update({ status: 'active', updated_at: new Date().toISOString() })
          .eq('id', campaignId);

        if (updateError) throw updateError;

        // === AUTO-ENROLL LEADS IN WORKFLOW IF CAMPAIGN HAS ONE ===
        if (campaign.workflow_id) {
          console.log(`[Dialing] Campaign has workflow ${campaign.workflow_id}, auto-enrolling ${callableLeads.length} leads`);
          
          let enrolledCount = 0;
          for (const cl of callableLeads) {
            const leadsData = cl.leads as any;
            const leadId = Array.isArray(leadsData) ? leadsData[0]?.id : leadsData?.id;
            if (!leadId) continue;

            // Check if lead is already in this workflow
            const { data: existingProgress } = await supabase
              .from('lead_workflow_progress')
              .select('id')
              .eq('lead_id', leadId)
              .eq('workflow_id', campaign.workflow_id)
              .in('status', ['active', 'paused'])
              .maybeSingle();

            if (!existingProgress) {
              // Enroll lead in workflow
              const { error: workflowError } = await supabase.functions.invoke('workflow-executor', {
                body: {
                  action: 'start_workflow',
                  userId: user.id,
                  leadId: leadId,
                  workflowId: campaign.workflow_id,
                  campaignId: campaignId,
                }
              });

              if (!workflowError) {
                enrolledCount++;
              } else {
                console.error(`[Dialing] Failed to enroll lead ${leadId} in workflow:`, workflowError);
              }
            }
          }
          
          console.log(`[Dialing] Enrolled ${enrolledCount} leads in workflow ${campaign.workflow_id}`);
        }

        return new Response(
          JSON.stringify({ 
            success: true,
            campaign_id: campaignId,
            leads_queued: queueEntries.length,
            workflow_id: campaign.workflow_id || null,
            message: `Campaign started with ${queueEntries.length} leads queued${campaign.workflow_id ? ' and enrolled in workflow' : ''}`
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'stop': {
        console.log(`Stopping dialing for campaign ${campaignId}`);

        const { error: updateCampaignError } = await supabase
          .from('campaigns')
          .update({ status: 'paused', updated_at: new Date().toISOString() })
          .eq('id', campaignId);

        if (updateCampaignError) throw updateCampaignError;

        const { error: updateQueueError } = await supabase
          .from('dialing_queues')
          .update({ status: 'paused' })
          .eq('campaign_id', campaignId)
          .eq('status', 'pending');

        if (updateQueueError) throw updateQueueError;

        return new Response(
          JSON.stringify({ 
            success: true,
            campaign_id: campaignId,
            message: 'Campaign paused successfully'
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'status': {
        console.log(`Getting status for campaign ${campaignId}`);

        const { data: queueStats, error: statsError } = await supabase
          .from('dialing_queues')
          .select('status')
          .eq('campaign_id', campaignId);

        if (statsError) throw statsError;

        const stats = {
          total: queueStats?.length || 0,
          pending: queueStats?.filter(q => q.status === 'pending').length || 0,
          calling: queueStats?.filter(q => q.status === 'calling').length || 0,
          completed: queueStats?.filter(q => q.status === 'completed').length || 0,
          failed: queueStats?.filter(q => q.status === 'failed').length || 0,
          paused: queueStats?.filter(q => q.status === 'paused').length || 0,
        };

        return new Response(
          JSON.stringify({ 
            campaign_id: campaignId,
            campaign_status: campaign.status,
            queue_stats: stats
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

  } catch (error) {
    console.error('Error in predictive-dialing-engine:', error);
    return new Response(
      JSON.stringify({ 
        error: 'An error occurred processing your dialing request',
        code: 'DIALING_ERROR'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});