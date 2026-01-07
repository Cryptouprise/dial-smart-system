import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function cleanupStuckCallsAndQueues(supabase: any, userId: string) {
  console.log('[Dispatcher Cleanup] Cleaning up stuck calls for user:', userId);

  // Mark old "ringing" / "initiated" / "in_progress" calls as "no_answer" if older than 5 minutes
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { data: stuckCalls, error: cleanupError } = await supabase
    .from('call_logs')
    .update({
      status: 'no_answer',
      ended_at: new Date().toISOString(),
      notes: 'Auto-cleaned: stuck in ringing state',
    })
    .eq('user_id', userId)
    .in('status', ['initiated', 'ringing', 'in_progress'])
    .lt('created_at', fiveMinutesAgo)
    .select();

  if (cleanupError) {
    console.error('[Dispatcher Cleanup] Call log cleanup error:', cleanupError);
    throw cleanupError;
  }

  const cleanedRingingCount = stuckCalls?.length || 0;

  // Cleanup stuck queued calls
  const queuedCutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: stuckQueuedCalls, error: queuedCleanupError } = await supabase
    .from('call_logs')
    .update({
      status: 'failed',
      ended_at: new Date().toISOString(),
      notes: 'Auto-cleaned: queued without Retell call id',
    })
    .eq('user_id', userId)
    .eq('status', 'queued')
    .is('retell_call_id', null)
    .lt('created_at', queuedCutoff)
    .select('id');

  if (queuedCleanupError) {
    console.error('[Dispatcher Cleanup] Queued call cleanup error:', queuedCleanupError);
  }

  const cleanedQueuedCount = stuckQueuedCalls?.length || 0;
  const cleanedCount = cleanedRingingCount + cleanedQueuedCount;

  // Reset dialing queue entries that got stuck in 'calling'
  const { data: userCampaigns, error: userCampaignsError } = await supabase
    .from('campaigns')
    .select('id')
    .eq('user_id', userId);

  if (userCampaignsError) {
    console.error('[Dispatcher Cleanup] Failed to load user campaigns for queue reset:', userCampaignsError);
  }

  const userCampaignIds = (userCampaigns || []).map((c: any) => c.id);

  let resetQueueCount = 0;
  if (userCampaignIds.length > 0) {
    const { data: resetQueues, error: resetError } = await supabase
      .from('dialing_queues')
      .update({
        status: 'pending',
        scheduled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in('campaign_id', userCampaignIds)
      .eq('status', 'calling')
      .lt('updated_at', fiveMinutesAgo)
      .select('id');

    if (resetError) {
      console.error('[Dispatcher Cleanup] Queue reset error:', resetError);
    } else {
      resetQueueCount = resetQueues?.length || 0;
    }
  }

  if (cleanedCount > 0 || resetQueueCount > 0) {
    console.log(`[Dispatcher Cleanup] Cleaned ${cleanedCount} stuck calls; reset ${resetQueueCount} stuck queue entries`);
  }

  return { cleanedCount, resetQueueCount };
}

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
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');

    // Check for special actions in request body
    let requestBody: Record<string, any> = {};
    try {
      requestBody = await req.json();
    } catch (parseError) {
      if (req.method !== 'GET') {
        console.warn('Request body parse failed for', req.method, 'request:', parseError);
      }
    }

    const action = requestBody.action;

    // Allow internal scheduler to run dispatcher for a specific user.
    const internalUserId = typeof requestBody.userId === 'string' ? requestBody.userId : null;
    const isInternalCall = requestBody.internal === true && internalUserId && token === supabaseKey;

    let user: { id: string } | null = null;

    if (isInternalCall) {
      user = { id: internalUserId };
      console.log('[Dispatcher] Internal scheduler call for user:', internalUserId);
    } else {
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);

      if (authError || !authUser) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      user = { id: authUser.id };
    }

    // Handle cleanup action
    if (action === 'cleanup_stuck_calls') {
      const { cleanedCount, resetQueueCount } = await cleanupStuckCallsAndQueues(supabase, user.id);
      return new Response(
        JSON.stringify({
          success: true,
          cleaned: cleanedCount,
          resetQueue: resetQueueCount,
          message: `Cleaned up ${cleanedCount} stuck calls and reset ${resetQueueCount} stuck queue entries`,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Call Dispatcher running for user:', user.id);

    // Automatic cleanup
    try {
      await cleanupStuckCallsAndQueues(supabase, user.id);
    } catch (cleanupError) {
      console.warn('[Dispatcher Cleanup] Auto-cleanup failed (continuing):', cleanupError);
    }

    // ============= CALLBACK HANDLING WITH WORKFLOW RESUME =============
    console.log('[Dispatcher] Checking for past-due callbacks...');
    const nowIso = new Date().toISOString();
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();

    const { data: pastDueCallbacks } = await supabase
      .from('leads')
      .select('id, phone_number')
      .eq('user_id', user.id)
      .eq('do_not_call', false)
      .lte('next_callback_at', nowIso)
      .not('next_callback_at', 'is', null)
      .limit(20);

    let callbacksQueued = 0;
    let callbacksEnrolledInWorkflow = 0;
    let callbacksResumed = 0;

    if (pastDueCallbacks && pastDueCallbacks.length > 0) {
      console.log(`[Dispatcher] Found ${pastDueCallbacks.length} past-due callbacks to evaluate`);

      for (const lead of pastDueCallbacks) {
        // ============= CHECK FOR PAUSED WORKFLOW TO RESUME =============
        const { data: pausedWorkflow } = await supabase
          .from('lead_workflow_progress')
          .select('id, current_step_id, workflow_id, campaign_id')
          .eq('lead_id', lead.id)
          .eq('status', 'paused')
          .eq('removal_reason', 'Callback scheduled')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (pausedWorkflow) {
          console.log(`[Dispatcher] Resuming paused workflow for callback lead ${lead.id}`);
          
          // Resume the workflow at current step
          await supabase
            .from('lead_workflow_progress')
            .update({ 
              status: 'active', 
              next_action_at: nowIso,
              removal_reason: null,
              updated_at: nowIso
            })
            .eq('id', pausedWorkflow.id);
          
          // Clear callback time
          await supabase
            .from('leads')
            .update({ next_callback_at: null })
            .eq('id', lead.id);
          
          callbacksResumed++;
          console.log(`[Dispatcher] Resumed workflow ${pausedWorkflow.id} for lead ${lead.id}`);
          continue;
        }

        // Find an ACTIVE campaign for this lead with workflow info
        const { data: campaignLead } = await supabase
          .from('campaign_leads')
          .select('campaign_id, campaigns!inner(status, workflow_id)')
          .eq('lead_id', lead.id)
          .eq('campaigns.status', 'active')
          .limit(1)
          .maybeSingle();

        if (!campaignLead) continue;

        const workflowId = (campaignLead.campaigns as any)?.workflow_id;

        // Check if workflow first step is SMS
        let firstStepIsSms = false;
        if (workflowId) {
          const { data: firstStep } = await supabase
            .from('workflow_steps')
            .select('step_type')
            .eq('workflow_id', workflowId)
            .eq('step_number', 1)
            .maybeSingle();
          
          firstStepIsSms = firstStep?.step_type === 'sms' || firstStep?.step_type === 'ai_sms';
        }

        // Check existing workflow enrollment (active or paused)
        const { data: existingWorkflow } = await supabase
          .from('lead_workflow_progress')
          .select('id, status')
          .eq('lead_id', lead.id)
          .eq('workflow_id', workflowId)
          .in('status', ['active', 'paused'])
          .limit(1)
          .maybeSingle();

        if (existingWorkflow) {
          console.log(`[Dispatcher] Lead ${lead.id} already in workflow (${existingWorkflow.status}), skipping`);
          // Clear the callback since they're already in workflow
          await supabase
            .from('leads')
            .update({ next_callback_at: null })
            .eq('id', lead.id);
          continue;
        }

        // If first step is SMS, enroll in workflow instead of dialing queue
        if (firstStepIsSms && workflowId) {
          console.log(`[Dispatcher] Callback for lead ${lead.id} - workflow first step is SMS, enrolling in workflow`);
          
          const { data: firstStepData } = await supabase
            .from('workflow_steps')
            .select('id')
            .eq('workflow_id', workflowId)
            .eq('step_number', 1)
            .maybeSingle();

          if (firstStepData) {
            const { error: progressError } = await supabase
              .from('lead_workflow_progress')
              .insert({
                lead_id: lead.id,
                workflow_id: workflowId,
                campaign_id: campaignLead.campaign_id,
                user_id: user.id,
                current_step_id: firstStepData.id,
                status: 'active',
                started_at: nowIso,
                next_action_at: nowIso,
              });

            if (!progressError) {
              callbacksEnrolledInWorkflow++;
              console.log(`[Dispatcher] Enrolled callback lead ${lead.id} in SMS workflow`);
              
              // Clear callback time
              await supabase
                .from('leads')
                .update({ next_callback_at: null })
                .eq('id', lead.id);

              // Trigger workflow-executor to send SMS
              await supabase.functions.invoke('workflow-executor', {
                body: { action: 'execute_pending', userId: user.id },
              });
            }
          }
          continue;
        }

        // For call-first workflows, add to dialing queue
        const { data: existingQueueEntry } = await supabase
          .from('dialing_queues')
          .select('id, status, scheduled_at')
          .eq('campaign_id', campaignLead.campaign_id)
          .eq('lead_id', lead.id)
          .limit(1)
          .maybeSingle();

        if (existingQueueEntry) {
          // Reset existing entry to pending for callback
          if (existingQueueEntry.status === 'completed' || existingQueueEntry.status === 'failed') {
            await supabase
              .from('dialing_queues')
              .update({
                status: 'pending',
                scheduled_at: nowIso,
                priority: 10,
                attempts: 0,
                updated_at: nowIso,
              })
              .eq('id', existingQueueEntry.id);
            callbacksQueued++;
          }
          continue;
        }

        // Check for recent call attempts
        const { data: recentAttempt } = await supabase
          .from('call_logs')
          .select('id, status')
          .eq('campaign_id', campaignLead.campaign_id)
          .eq('lead_id', lead.id)
          .gte('created_at', twoMinutesAgo)
          .in('status', ['queued', 'ringing', 'initiated', 'in_progress'])
          .limit(1)
          .maybeSingle();

        if (recentAttempt) continue;

        const { error: insertError } = await supabase.from('dialing_queues').insert({
          campaign_id: campaignLead.campaign_id,
          lead_id: lead.id,
          phone_number: lead.phone_number,
          status: 'pending',
          scheduled_at: nowIso,
          priority: 10, // Highest priority for callbacks
          max_attempts: 3,
          attempts: 0,
        });

        if (!insertError) {
          callbacksQueued++;
          console.log(`[Dispatcher] Queued past-due callback for lead ${lead.id}`);
          
          // Clear callback time after queuing
          await supabase
            .from('leads')
            .update({ next_callback_at: null })
            .eq('id', lead.id);
        } else {
          console.error(`[Dispatcher] Failed to queue callback for lead ${lead.id}:`, insertError);
        }
      }
    }

    console.log(`[Dispatcher] Callbacks: ${callbacksQueued} queued, ${callbacksEnrolledInWorkflow} enrolled in workflow, ${callbacksResumed} resumed`);

    const { data: activeCampaigns, error: campaignError } = await supabase
      .from('campaigns')
      .select('id, name, agent_id, max_attempts, workflow_id')
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (campaignError) throw campaignError;

    if (!activeCampaigns || activeCampaigns.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: 'No active campaigns', 
          dispatched: 0,
          callbacks: { queued: callbacksQueued, enrolled: callbacksEnrolledInWorkflow, resumed: callbacksResumed }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const campaignIds = activeCampaigns.map(c => c.id);
    console.log('Active campaigns:', campaignIds);

    // Get workflow first steps for campaigns with workflows
    const workflowIds = activeCampaigns.filter(c => c.workflow_id).map(c => c.workflow_id);
    let workflowFirstSteps: Record<string, any> = {};
    
    if (workflowIds.length > 0) {
      const { data: workflowSteps } = await supabase
        .from('workflow_steps')
        .select('workflow_id, step_type, step_number, step_config')
        .in('workflow_id', workflowIds)
        .eq('step_number', 1);
      
      if (workflowSteps) {
        for (const step of workflowSteps) {
          workflowFirstSteps[step.workflow_id] = step;
        }
      }
      console.log('Workflow first steps:', Object.keys(workflowFirstSteps).length, 'workflows checked');
    }

    // Check existing queue entries
    const { data: existingQueue } = await supabase
      .from('dialing_queues')
      .select('lead_id')
      .in('campaign_id', campaignIds)
      .in('status', ['pending', 'calling']);

    const existingLeadIds = new Set((existingQueue || []).map(q => q.lead_id));

    // Check existing workflow progress entries
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: existingWorkflowProgress } = await supabase
      .from('lead_workflow_progress')
      .select('lead_id, status, workflow_id, leads!lead_workflow_progress_lead_id_fkey(phone_number)')
      .in('workflow_id', workflowIds.length > 0 ? workflowIds : ['no-workflows'])
      .gte('created_at', oneDayAgo);

    const existingWorkflowLeadIds = new Set((existingWorkflowProgress || []).map(p => p.lead_id));
    
    // Build a set of phone numbers that have been enrolled in workflows
    const existingWorkflowPhones = new Set<string>();
    for (const p of existingWorkflowProgress || []) {
      const phone = (p as any).leads?.phone_number;
      if (phone) {
        const normalized = phone.replace(/\D/g, '').slice(-10);
        existingWorkflowPhones.add(normalized);
      }
    }
    console.log(`[Dispatcher] Leads already in workflows (last 24h): ${existingWorkflowLeadIds.size}, unique phones: ${existingWorkflowPhones.size}`);

    // Check for RECENT call_logs to prevent re-calling leads
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recentCallLogs } = await supabase
      .from('call_logs')
      .select('lead_id, status, outcome')
      .in('campaign_id', campaignIds)
      .gte('created_at', fiveMinutesAgo);

    // Build set of leads that were called recently
    const recentlyCalledLeadIds = new Set(
      (recentCallLogs || [])
        .filter((cl: any) => cl.status !== 'failed')
        .map((cl: any) => cl.lead_id)
    );
    
    // Build set of leads that had successful/connected calls
    const successfullyContactedLeadIds = new Set(
      (recentCallLogs || [])
        .filter((cl: any) => {
          if (cl.outcome === 'callback_requested' || cl.outcome === 'callback' || cl.outcome === 'callback_scheduled') {
            return false;
          }
          return cl.outcome === 'connected' || 
                 cl.outcome === 'answered' || 
                 cl.outcome === 'appointment_set' ||
                 cl.outcome === 'interested';
        })
        .map((cl: any) => cl.lead_id)
    );

    console.log(`[Dispatcher] Recently called leads: ${recentlyCalledLeadIds.size}, Successfully contacted: ${successfullyContactedLeadIds.size}`);

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
    let leadsToQueue = (campaignLeads || []).filter(cl => {
      const lead = cl.leads as any;
      if (!lead || !lead.phone_number) return false;
      if (lead.do_not_call) return false;
      if (existingLeadIds.has(cl.lead_id)) return false;
      if (existingWorkflowLeadIds.has(cl.lead_id)) return false;
      
      // Check by normalized phone number
      const normalizedPhone = lead.phone_number.replace(/\D/g, '').slice(-10);
      if (existingWorkflowPhones.has(normalizedPhone)) {
        console.log(`[Dispatcher] Skipping lead ${cl.lead_id} - phone ${normalizedPhone} already in workflow`);
        return false;
      }
      
      if (recentlyCalledLeadIds.has(cl.lead_id)) return false;
      if (successfullyContactedLeadIds.has(cl.lead_id)) return false;
      return true;
    });

    console.log(`[Dispatcher] ${leadsToQueue.length} leads eligible for queuing after filters`);

    // Process leads - either enroll in workflow or add to dialing queue
    let workflowEnrolled = 0;
    let dialingQueued = 0;

    for (const cl of leadsToQueue) {
      const lead = cl.leads as any;
      const campaign = activeCampaigns.find(c => c.id === cl.campaign_id);
      
      if (!campaign) continue;

      // Check if campaign has a workflow with SMS first step
      if (campaign.workflow_id && workflowFirstSteps[campaign.workflow_id]) {
        const firstStep = workflowFirstSteps[campaign.workflow_id];
        const isSmsFirst = firstStep.step_type === 'sms' || firstStep.step_type === 'ai_sms';

        if (isSmsFirst) {
          // Enroll in workflow
          const { error: workflowError } = await supabase
            .from('lead_workflow_progress')
            .insert({
              lead_id: cl.lead_id,
              workflow_id: campaign.workflow_id,
              campaign_id: campaign.id,
              user_id: user.id,
              current_step_id: firstStep.id || null,
              status: 'active',
              started_at: nowIso,
              next_action_at: nowIso,
            });

          if (!workflowError) {
            workflowEnrolled++;
          } else {
            console.error(`[Dispatcher] Workflow enrollment error for ${cl.lead_id}:`, workflowError);
          }
          continue;
        }
      }

      // Add to dialing queue for call-first or no-workflow campaigns
      const { error: queueError } = await supabase
        .from('dialing_queues')
        .insert({
          campaign_id: campaign.id,
          lead_id: cl.lead_id,
          phone_number: lead.phone_number,
          status: 'pending',
          scheduled_at: nowIso,
          priority: 1,
          max_attempts: campaign.max_attempts || 3,
          attempts: 0,
        });

      if (!queueError) {
        dialingQueued++;
      } else {
        console.error(`[Dispatcher] Queue insert error for ${cl.lead_id}:`, queueError);
      }
    }

    console.log(`[Dispatcher] Enrolled ${workflowEnrolled} in workflows, queued ${dialingQueued} for dialing`);

    // Execute workflow steps if any were enrolled
    if (workflowEnrolled > 0) {
      await supabase.functions.invoke('workflow-executor', {
        body: { action: 'execute_pending', userId: user.id },
      });
    }

    // ============= FETCH AVAILABLE PHONE NUMBERS WITH ROTATION =============
    console.log('[Dispatcher] Loading available phone numbers for rotation...');
    
    let availableNumbers: any[] = [];
    
    // First query: Get all phone numbers with Retell IDs and rotation enabled
    const { data: retellNumbers, error: retellError } = await supabase
      .from('phone_numbers')
      .select('id, number, retell_phone_id, daily_calls, is_spam, quarantine_until, rotation_enabled, max_daily_calls')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .eq('rotation_enabled', true)
      .not('retell_phone_id', 'is', null);
    
    if (retellError) {
      console.error('[Dispatcher] Error fetching phone numbers:', retellError);
    } else {
      // Apply max_daily_calls hard cap - filter out numbers that hit their limit
      const maxDailyDefault = 100;
      const filteredNumbers = (retellNumbers || []).filter(n => {
        const maxCalls = n.max_daily_calls || maxDailyDefault;
        const currentCalls = n.daily_calls || 0;
        return currentCalls < maxCalls;
      });
      availableNumbers = filteredNumbers;
      console.log(`[Dispatcher] ${availableNumbers.length}/${retellNumbers?.length || 0} numbers available (within daily limits)`);
    }
    
    console.log(`[Dispatcher] Query result: Found ${availableNumbers.length} numbers with Retell IDs`);
    
    // DEBUG: If empty, check what numbers exist for this user
    if (availableNumbers.length === 0) {
      const { data: allUserNumbers } = await supabase
        .from('phone_numbers')
        .select('id, number, retell_phone_id, status, user_id')
        .eq('user_id', user.id);
      
      console.log(`[Dispatcher] DEBUG - All user phone numbers (${allUserNumbers?.length || 0}):`, 
        JSON.stringify(allUserNumbers?.map(n => ({ 
          number: n.number, 
          retell_phone_id: n.retell_phone_id, 
          status: n.status 
        })) || []));
      
      // Fallback: Try to sync from Retell if no numbers have Retell IDs
      try {
        console.log('[Dispatcher] No local Retell numbers found, attempting Retell sync...');
        const syncResponse = await supabase.functions.invoke('retell-phone-management', {
          body: { action: 'sync', userId: user.id }
        });
        
        if (syncResponse.data?.synced > 0) {
          console.log(`[Dispatcher] Synced ${syncResponse.data.synced} numbers from Retell`);
          
          // Re-query after sync
          const { data: syncedNumbers } = await supabase
            .from('phone_numbers')
            .select('id, number, retell_phone_id, daily_calls, is_spam, quarantine_until')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .not('retell_phone_id', 'is', null);
          
          if (syncedNumbers?.length) {
            availableNumbers = syncedNumbers;
            console.log(`[Dispatcher] After sync: ${availableNumbers.length} numbers available`);
          }
        }
      } catch (syncError) {
        console.error('[Dispatcher] Retell sync failed:', syncError);
      }
    }
    
    if (availableNumbers.length === 0) {
      console.error('[Dispatcher] ERROR: No phone numbers with Retell IDs available for calling after all attempts');
      return new Response(
        JSON.stringify({ 
          error: 'No phone numbers available for calling. Import numbers to Retell first.',
          dispatched: 0,
          workflowEnrolled,
          dialingQueued,
          callbacks: { queued: callbacksQueued, enrolled: callbacksEnrolledInWorkflow, resumed: callbacksResumed }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`[Dispatcher] Found ${availableNumbers.length} phone numbers for rotation`);
    
    // Track usage for rotation within this batch
    const numberUsageInBatch: Record<string, number> = {};

    // Now process the dialing queue
    const { data: queuedCalls, error: queueError } = await supabase
      .from('dialing_queues')
      .select(`
        *,
        leads (id, phone_number, first_name, last_name),
        campaigns (id, agent_id, name)
      `)
      .in('campaign_id', campaignIds)
      .eq('status', 'pending')
      .lte('scheduled_at', nowIso)
      .order('priority', { ascending: false })
      .order('scheduled_at', { ascending: true })
      .limit(5);

    if (queueError) throw queueError;

    console.log(`[Dispatcher] Processing ${queuedCalls?.length || 0} queued calls`);

    let dispatched = 0;
    const dispatchResults: any[] = [];

    for (const queueItem of queuedCalls || []) {
      try {
        const lead = queueItem.leads as any;
        const campaign = queueItem.campaigns as any;
        
        if (!campaign?.agent_id) {
          console.error(`[Dispatcher] Campaign ${queueItem.campaign_id} has no agent_id`);
          await supabase
            .from('dialing_queues')
            .update({ status: 'failed', updated_at: nowIso })
            .eq('id', queueItem.id);
          continue;
        }
        
        // ============= NUMBER ROTATION LOGIC =============
        // Select best caller ID based on rotation, spam status, and local presence
        const toPhone = lead?.phone_number || queueItem.phone_number;
        const toAreaCode = toPhone?.replace(/\D/g, '').slice(1, 4);
        
        // Score each number
        const scoredNumbers = availableNumbers
          .filter(n => {
            // Skip quarantined numbers
            if (n.quarantine_until && new Date(n.quarantine_until) > new Date()) return false;
            // Skip spam-flagged numbers
            if (n.is_spam) return false;
            return true;
          })
          .map(n => {
            let score = 100;
            const numAreaCode = n.number.replace(/\D/g, '').slice(1, 4);
            
            // Local presence bonus (+50 points)
            if (numAreaCode === toAreaCode) score += 50;
            
            // Penalize high daily usage (-1 per call)
            score -= (n.daily_calls || 0);
            
            // Penalize usage in this batch (-20 per call)
            score -= (numberUsageInBatch[n.id] || 0) * 20;
            
            return { number: n, score };
          });
        
        // Sort by score descending
        scoredNumbers.sort((a, b) => b.score - a.score);
        
        if (scoredNumbers.length === 0) {
          console.error(`[Dispatcher] No valid phone numbers available after filtering`);
          await supabase
            .from('dialing_queues')
            .update({ status: 'failed', updated_at: nowIso })
            .eq('id', queueItem.id);
          continue;
        }
        
        const selectedNumber = scoredNumbers[0].number;
        const callerId = selectedNumber.number;
        
        // Track usage in this batch
        numberUsageInBatch[selectedNumber.id] = (numberUsageInBatch[selectedNumber.id] || 0) + 1;
        
        console.log(`[Dispatcher] Selected caller ID: ${callerId} for lead ${queueItem.lead_id} (score: ${scoredNumbers[0].score})`);
        
        // Mark as calling
        await supabase
          .from('dialing_queues')
          .update({ 
            status: 'calling', 
            attempts: (queueItem.attempts || 0) + 1,
            updated_at: nowIso 
          })
          .eq('id', queueItem.id);

        // Initiate the call with ALL required parameters
        const callResponse = await supabase.functions.invoke('outbound-calling', {
          body: {
            action: 'create_call',
            leadId: queueItem.lead_id,
            campaignId: queueItem.campaign_id,
            userId: user.id,
            phoneNumber: toPhone,
            callerId: callerId,
            agentId: campaign.agent_id,
          },
        });

        if (callResponse.error) {
          throw new Error(callResponse.error.message || 'Call failed');
        }

        dispatched++;
        dispatchResults.push({
          leadId: queueItem.lead_id,
          success: true,
          callId: callResponse.data?.call_id,
          callerId: callerId,
        });

        console.log(`[Dispatcher] Call initiated for lead ${queueItem.lead_id} from ${callerId}`);
        
        // Update daily_calls on the phone number
        await supabase
          .from('phone_numbers')
          .update({ daily_calls: (selectedNumber.daily_calls || 0) + 1 })
          .eq('id', selectedNumber.id);

      } catch (callError: any) {
        console.error(`[Dispatcher] Call error for ${queueItem.lead_id}:`, callError);
        
        // Check if should retry
        const attempts = (queueItem.attempts || 0) + 1;
        const maxAttempts = queueItem.max_attempts || 3;
        
        if (attempts < maxAttempts) {
          await supabase
            .from('dialing_queues')
            .update({ 
              status: 'pending', 
              scheduled_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
              updated_at: nowIso 
            })
            .eq('id', queueItem.id);
        } else {
          await supabase
            .from('dialing_queues')
            .update({ status: 'failed', updated_at: nowIso })
            .eq('id', queueItem.id);
        }

        dispatchResults.push({
          leadId: queueItem.lead_id,
          success: false,
          error: callError.message,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        dispatched,
        workflowEnrolled,
        dialingQueued,
        callbacks: { 
          queued: callbacksQueued, 
          enrolled: callbacksEnrolledInWorkflow, 
          resumed: callbacksResumed 
        },
        results: dispatchResults,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[Dispatcher] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
