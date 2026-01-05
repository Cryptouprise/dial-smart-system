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

  const cleanedCount = stuckCalls?.length || 0;

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
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for special actions in request body
    let requestBody = {};
    try {
      requestBody = await req.json();
    } catch (parseError) {
      // No body or invalid JSON - expected for GET requests
      if (req.method !== 'GET') {
        console.warn('Request body parse failed for', req.method, 'request:', parseError);
      }
    }

    const action = (requestBody as any).action;

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

    // Automatic cleanup (so you don't need to press the "unstuck" button)
    try {
      await cleanupStuckCallsAndQueues(supabase, user.id);
    } catch (cleanupError) {
      console.warn('[Dispatcher Cleanup] Auto-cleanup failed (continuing):', cleanupError);
    }

    // Get user's active campaigns with their workflows
    const { data: activeCampaigns, error: campaignError } = await supabase
      .from('campaigns')
      .select('id, name, agent_id, max_attempts, workflow_id')
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

    // Check existing workflow progress entries - include ALL statuses including completed
    // to prevent re-enrollment of leads that already went through a workflow
    // CRITICAL FIX: Also check by PHONE NUMBER to prevent duplicate leads with same phone
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: existingWorkflowProgress } = await supabase
      .from('lead_workflow_progress')
      .select('lead_id, status, workflow_id, leads!lead_workflow_progress_lead_id_fkey(phone_number)')
      .in('workflow_id', workflowIds.length > 0 ? workflowIds : ['no-workflows'])
      .gte('created_at', oneDayAgo); // Check last 24 hours regardless of status

    const existingWorkflowLeadIds = new Set((existingWorkflowProgress || []).map(p => p.lead_id));
    
    // Build a set of phone numbers that have been enrolled in workflows (normalized)
    const existingWorkflowPhones = new Set<string>();
    for (const p of existingWorkflowProgress || []) {
      const phone = (p as any).leads?.phone_number;
      if (phone) {
        // Normalize phone: remove +1 prefix and any non-digits
        const normalized = phone.replace(/\D/g, '').slice(-10);
        existingWorkflowPhones.add(normalized);
      }
    }
    console.log(`[Dispatcher] Leads already in workflows (last 24h): ${existingWorkflowLeadIds.size}, unique phones: ${existingWorkflowPhones.size}`);

    // **CRITICAL FIX**: Check for RECENT call_logs to prevent re-calling leads
    // Reduced from 30 minutes to 5 minutes to allow faster re-testing
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recentCallLogs } = await supabase
      .from('call_logs')
      .select('lead_id, status, outcome')
      .in('campaign_id', campaignIds)
      .gte('created_at', fiveMinutesAgo);

    // Build set of leads that were called recently (any status except failed)
    const recentlyCalledLeadIds = new Set(
      (recentCallLogs || [])
        .filter((cl: any) => cl.status !== 'failed')
        .map((cl: any) => cl.lead_id)
    );
    
    // Build set of leads that had successful/connected calls (should NOT be called again)
    const successfullyContactedLeadIds = new Set(
      (recentCallLogs || [])
        .filter((cl: any) => 
          cl.outcome === 'connected' || 
          cl.outcome === 'answered' || 
          cl.outcome === 'appointment_set' ||
          cl.outcome === 'callback_scheduled' ||
          cl.outcome === 'interested' ||
          cl.status === 'completed'
        )
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
      
      // CRITICAL FIX: Also check by normalized phone number to catch duplicate lead records
      const normalizedPhone = lead.phone_number.replace(/\D/g, '').slice(-10);
      if (existingWorkflowPhones.has(normalizedPhone)) {
        console.log(`[Dispatcher] Skipping lead ${cl.lead_id} - phone ${normalizedPhone} already enrolled in workflow`);
        return false;
      }
      
      // **NEW**: Skip leads that were called recently
      if (recentlyCalledLeadIds.has(cl.lead_id)) return false;
      // **NEW**: Skip leads that were successfully contacted
      if (successfullyContactedLeadIds.has(cl.lead_id)) return false;
      // Only queue leads with eligible statuses (including retry-eligible statuses)
      if (!['new', 'contacted', 'callback', 'no_answer', 'voicemail', 'failed'].includes(lead.status)) return false;
      return true;
    });

    console.log(`Found ${leadsToQueue.length} leads to add to queue (raw campaign leads: ${(campaignLeads || []).length})`);

    // REMOVED: The fallback that was adding leads even when they should be skipped

    // Separate leads by workflow type - SMS-first vs Call-first
    const smsFirstLeads: any[] = [];
    const callFirstLeads: any[] = [];

    for (const cl of leadsToQueue) {
      const campaign = activeCampaigns.find(c => c.id === cl.campaign_id);
      const firstStep = campaign?.workflow_id ? workflowFirstSteps[campaign.workflow_id] : null;
      
      if (firstStep && (firstStep.step_type === 'sms' || firstStep.step_type === 'ai_sms')) {
        smsFirstLeads.push({ ...cl, campaign, firstStep });
      } else {
        callFirstLeads.push({ ...cl, campaign });
      }
    }

    console.log(`SMS-first leads: ${smsFirstLeads.length}, Call-first leads: ${callFirstLeads.length}`);

    // Process SMS-first leads via workflow-executor
    for (const leadData of smsFirstLeads) {
      const campaign = leadData.campaign;
      const firstStep = leadData.firstStep;
      
      console.log(`[Workflow] Starting SMS workflow for lead ${leadData.lead_id} in campaign ${campaign.id}`);
      
      // Create workflow progress entry
      const { data: progressEntry, error: progressError } = await supabase
        .from('lead_workflow_progress')
        .insert({
          lead_id: leadData.lead_id,
          workflow_id: campaign.workflow_id,
          campaign_id: campaign.id,
          user_id: user.id,
          current_step_id: firstStep.id,
          status: 'active',
          started_at: new Date().toISOString(),
          next_action_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (progressError) {
        console.error('[Workflow] Failed to create progress entry:', progressError);
        continue;
      }

      // Invoke workflow-executor to execute the first step
      const { error: execError } = await supabase.functions.invoke('workflow-executor', {
        body: {
          action: 'execute_pending',
          userId: user.id,
        },
      });

      if (execError) {
        console.error('[Workflow] Failed to invoke workflow-executor:', execError);
      } else {
        console.log(`[Workflow] Started workflow for lead ${leadData.lead_id}`);
      }
    }

    // Add call-first leads to dialing queue AND enroll in workflow for subsequent steps
    if (callFirstLeads.length > 0) {
      const queueEntries: any[] = [];
      
      for (const cl of callFirstLeads) {
        const lead = cl.leads as any;
        const campaign = activeCampaigns.find(c => c.id === cl.campaign_id);
        
        queueEntries.push({
          campaign_id: cl.campaign_id,
          lead_id: cl.lead_id,
          phone_number: lead.phone_number,
          status: 'pending',
          priority: 1,
          max_attempts: campaign?.max_attempts || 3,
          attempts: 0,
          scheduled_at: new Date().toISOString()
        });

        // **FIX**: Also enroll in workflow if campaign has one, so SMS step fires after call
        if (campaign?.workflow_id) {
          const firstStep = workflowFirstSteps[campaign.workflow_id];
          if (firstStep) {
            // Get the second step (SMS) which should fire after call
            const { data: allSteps } = await supabase
              .from('workflow_steps')
              .select('id, step_number, step_type, step_config')
              .eq('workflow_id', campaign.workflow_id)
              .order('step_number', { ascending: true });

            if (!allSteps || allSteps.length === 0) {
              console.warn(`[Dispatcher] No workflow steps found for workflow ${campaign.workflow_id}`);
              continue;
            }

            const firstStepInWorkflow = allSteps.find((s: any) => s.id === firstStep.id) || allSteps[0];
            const nextStep = allSteps.find((s: any) => s.step_number > firstStepInWorkflow.step_number) || firstStepInWorkflow;
            const targetStep = nextStep;
            const nextActionAt = calculateNextActionTime(targetStep);

            const { error: progressError } = await supabase
              .from('lead_workflow_progress')
              .insert({
                lead_id: cl.lead_id,
                workflow_id: campaign.workflow_id,
                campaign_id: campaign.id,
                user_id: user.id,
                current_step_id: targetStep.id,
                status: 'active',
                started_at: new Date().toISOString(),
                last_action_at: new Date().toISOString(),
                next_action_at: nextActionAt,
              });

            if (progressError) {
              console.error(`[Dispatcher] Failed to create workflow progress for lead ${cl.lead_id}:`, progressError);
            } else {
              console.log(`[Dispatcher] Enrolled lead ${cl.lead_id} in workflow ${campaign.workflow_id}, SMS scheduled in 2 min`);
            }
          }
        }
      }

      if (queueEntries.length > 0) {
        const { error: queueError } = await supabase
          .from('dialing_queues')
          .insert(queueEntries);

        if (queueError) {
          console.error('Error adding to queue:', queueError);
        } else {
          console.log(`Added ${queueEntries.length} leads to dialing queue`);
        }
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
      .lte('scheduled_at', new Date().toISOString())
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

    // Get available phone numbers - PRIORITIZE numbers with retell_phone_id
    const { data: availableNumbers, error: numbersError } = await supabase
      .from('phone_numbers')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .is('quarantine_until', null)
      .order('retell_phone_id', { ascending: false, nullsFirst: false }); // Prioritize numbers WITH retell_phone_id

    if (numbersError) throw numbersError;

    // Filter to only include numbers registered with Retell (have retell_phone_id)
    const retellNumbers = (availableNumbers || []).filter(n => n.retell_phone_id);
    
    // If no Retell-registered numbers, use all available but warn
    const numbersToUse = retellNumbers.length > 0 ? retellNumbers : availableNumbers;
    const usingUnregisteredNumbers = retellNumbers.length === 0 && (availableNumbers?.length || 0) > 0;

    if (!numbersToUse || numbersToUse.length === 0) {
      console.log('No available numbers in pool');
      return new Response(
        JSON.stringify({ 
          error: 'No available phone numbers in pool. Please add active phone numbers first.',
          dispatched: 0 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (usingUnregisteredNumbers) {
      console.warn('WARNING: No numbers with retell_phone_id found. Using unregistered numbers - calls may fail!');
    }

    console.log(`Found ${numbersToUse.length} available numbers (${retellNumbers.length} registered with Retell)`);

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
    const numberPool = [...numbersToUse];

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
        const callResponse = await fetch(`${supabaseUrl}/functions/v1/outbound-calling`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
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
          
          const newAttempts = (call.attempts || 0) + 1;
          const maxAttempts = call.max_attempts || 3;
          
          if (newAttempts < maxAttempts) {
            // Re-queue for retry with 30 minute delay
            await supabase
              .from('dialing_queues')
              .update({ 
                status: 'pending',
                attempts: newAttempts,
                scheduled_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
                updated_at: new Date().toISOString()
              })
              .eq('id', call.id);
            console.log(`[Dispatcher] Call failed, scheduled retry ${newAttempts}/${maxAttempts} in 30 minutes`);
          } else {
            // Max attempts reached - mark as failed
            await supabase
              .from('dialing_queues')
              .update({ 
                status: 'failed',
                attempts: newAttempts,
                updated_at: new Date().toISOString()
              })
              .eq('id', call.id);
            console.log(`[Dispatcher] Call failed, max attempts (${maxAttempts}) reached`);
          }
          
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

        // Update queue entry - keep as calling until webhook closes the loop
        const newAttempts = (call.attempts || 0) + 1;
        await supabase
          .from('dialing_queues')
          .update({
            status: 'calling',
            attempts: newAttempts,
            updated_at: new Date().toISOString(),
          })
          .eq('id', call.id);

        dispatchedCount++;
        dispatchResults.push({
          queue_id: call.id,
          lead: `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Unknown',
          phone: lead.phone_number,
          number_used: selectedNumber.number,
          call_id: callData?.call_id
        });

        console.log(`Successfully dispatched call ${call.id}`);

        // Remove number from pool to prevent reuse in this batch
        const idx = numberPool.findIndex(n => n.id === selectedNumber.id);
        if (idx !== -1) numberPool.splice(idx, 1);

      } catch (err: unknown) {
        const error = err as any;
        console.error('Error dispatching call:', call.id, error?.message || error);

        // CRITICAL: If the fetch/json parsing fails, the queue entry would otherwise remain stuck in "calling".
        try {
          const newAttempts = (call.attempts || 0) + 1;
          const maxAttempts = call.max_attempts || 3;
          const shouldRetry = newAttempts < maxAttempts;

          const update: Record<string, any> = {
            status: shouldRetry ? 'pending' : 'failed',
            attempts: newAttempts,
            updated_at: new Date().toISOString(),
          };

          if (shouldRetry) {
            update.scheduled_at = new Date(Date.now() + 30 * 60 * 1000).toISOString();
          }

          await supabase
            .from('dialing_queues')
            .update(update)
            .eq('id', call.id);

          console.log(
            `[Dispatcher] Queue entry recovered after dispatch error: ${call.id} -> ${update.status} (${newAttempts}/${maxAttempts})`
          );
        } catch (queueFixError) {
          console.error('[Dispatcher] Failed to recover queue entry after dispatch error:', call.id, queueFixError);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        dispatched: dispatchedCount,
        results: dispatchResults,
        warning: usingUnregisteredNumbers ? 'Using phone numbers not registered with Retell - some calls may fail' : undefined,
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

function calculateNextActionTime(step: any): string {
  const config = step?.step_config || {};
  const now = new Date();

  if (step.step_type === 'wait') {
    const delayMs =
      (config.delay_minutes || 0) * 60 * 1000 +
      (config.delay_hours || 0) * 60 * 60 * 1000 +
      (config.delay_days || 0) * 24 * 60 * 60 * 1000;

    let nextTime = new Date(now.getTime() + delayMs);

    if (config.time_of_day) {
      const [hours, minutes] = String(config.time_of_day).split(':').map(Number);
      if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
        nextTime.setHours(hours, minutes, 0, 0);
        if (nextTime <= now) {
          nextTime.setDate(nextTime.getDate() + 1);
        }
      }
    }

    return nextTime.toISOString();
  }

  return now.toISOString();
}

function selectBestNumber(availableNumbers: any[], targetPhone: string): any | null {
  if (availableNumbers.length === 0) return null;

  // Extract area code from target phone
  const targetAreaCode = targetPhone.replace(/\D/g, '').slice(-10, -7);

  // Score each number
  const scored = availableNumbers.map(n => {
    let score = 100;
    
    // HEAVILY prefer numbers registered with Retell
    if (n.retell_phone_id) {
      score += 100;
    }
    
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
  
  console.log(`Best number: ${scored[0].number.number} (score: ${scored[0].score}, retell_id: ${scored[0].number.retell_phone_id || 'none'})`);
  return scored[0].number;
}