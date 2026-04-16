import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============= US STATE → TIMEZONE MAPPING =============
// Used for per-lead calling hours enforcement based on the lead's state
const STATE_TIMEZONE_MAP: Record<string, string> = {
  // Eastern
  CT: 'America/New_York', DE: 'America/New_York', FL: 'America/New_York',
  GA: 'America/New_York', IN: 'America/Indiana/Indianapolis', KY: 'America/New_York',
  ME: 'America/New_York', MD: 'America/New_York', MA: 'America/New_York',
  MI: 'America/New_York', NH: 'America/New_York', NJ: 'America/New_York',
  NY: 'America/New_York', NC: 'America/New_York', OH: 'America/New_York',
  PA: 'America/New_York', RI: 'America/New_York', SC: 'America/New_York',
  VT: 'America/New_York', VA: 'America/New_York', WV: 'America/New_York',
  DC: 'America/New_York',
  // Central
  AL: 'America/Chicago', AR: 'America/Chicago', IL: 'America/Chicago',
  IA: 'America/Chicago', KS: 'America/Chicago', LA: 'America/Chicago',
  MN: 'America/Chicago', MS: 'America/Chicago', MO: 'America/Chicago',
  NE: 'America/Chicago', ND: 'America/Chicago', OK: 'America/Chicago',
  SD: 'America/Chicago', TN: 'America/Chicago', TX: 'America/Chicago',
  WI: 'America/Chicago',
  // Mountain
  AZ: 'America/Phoenix', CO: 'America/Denver', ID: 'America/Boise',
  MT: 'America/Denver', NM: 'America/Denver', UT: 'America/Denver',
  WY: 'America/Denver',
  // Pacific
  CA: 'America/Los_Angeles', NV: 'America/Los_Angeles',
  OR: 'America/Los_Angeles', WA: 'America/Los_Angeles',
  // Non-contiguous
  AK: 'America/Anchorage', HI: 'Pacific/Honolulu',
  // Territories
  PR: 'America/Puerto_Rico', VI: 'America/Virgin', GU: 'Pacific/Guam',
  AS: 'Pacific/Pago_Pago', MP: 'Pacific/Guam',
};

/**
 * Resolve timezone for a lead based on their state field.
 * Returns null if state is missing or unrecognized.
 */
function getLeadTimezone(state: string | null | undefined): string | null {
  if (!state) return null;
  const normalized = state.trim().toUpperCase();
  // Handle full state names by checking first two chars (works for abbreviations)
  // Also try the raw value in case it's already an abbreviation
  return STATE_TIMEZONE_MAP[normalized] || null;
}

/**
 * Check if it's currently within calling hours for a specific timezone.
 * Returns { allowed: boolean, reason: string }
 */
function isWithinCallingHours(
  tz: string,
  startHour: string,
  endHour: string,
): { allowed: boolean; reason: string } {
  try {
    const nowInTz = new Date().toLocaleString('en-US', { timeZone: tz });
    const tzDate = new Date(nowInTz);
    const currentMinutes = tzDate.getHours() * 60 + tzDate.getMinutes();

    const [startH, startM] = startHour.split(':').map(Number);
    const [endH, endM] = endHour.split(':').map(Number);
    const startMin = startH * 60 + (startM || 0);
    const endMin = endH * 60 + (endM || 0);

    if (currentMinutes < startMin || currentMinutes >= endMin) {
      return {
        allowed: false,
        reason: `Outside ${startHour}-${endHour} in ${tz} (currently ${tzDate.getHours()}:${String(tzDate.getMinutes()).padStart(2, '0')})`,
      };
    }
    return { allowed: true, reason: '' };
  } catch {
    // If timezone is invalid, allow the call (don't block on bad data)
    return { allowed: true, reason: '' };
  }
}

async function cleanupStuckCallsAndQueues(supabase: any, userId: string) {
  console.log('[Dispatcher Cleanup] Cleaning up stuck calls for user:', userId);

  // Mark old "ringing" / "initiated" calls as "no_answer" if older than 2 minutes (reduced from 5)
  // Retell calls typically connect or fail within 30-60 seconds
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  // Quick cleanup for ringing/initiated (2 min threshold)
  const { data: stuckRingingCalls, error: ringingCleanupError } = await supabase
    .from('call_logs')
    .update({
      status: 'no_answer',
      ended_at: new Date().toISOString(),
      notes: 'Auto-cleaned: stuck in ringing state (2 min timeout)',
    })
    .eq('user_id', userId)
    .in('status', ['initiated', 'ringing'])
    .lt('created_at', twoMinutesAgo)
    .select();

  if (ringingCleanupError) {
    console.error('[Dispatcher Cleanup] Ringing call cleanup error:', ringingCleanupError);
  }

  // Slower cleanup for in_progress (5 min threshold - these are actual conversations)
  const { data: stuckInProgressCalls, error: inProgressCleanupError } = await supabase
    .from('call_logs')
    .update({
      status: 'no_answer',
      ended_at: new Date().toISOString(),
      notes: 'Auto-cleaned: stuck in_progress state',
    })
    .eq('user_id', userId)
    .eq('status', 'in_progress')
    .lt('created_at', fiveMinutesAgo)
    .select();

  if (inProgressCleanupError) {
    console.error('[Dispatcher Cleanup] In-progress call cleanup error:', inProgressCleanupError);
  }

  const cleanedRingingCount = (stuckRingingCalls?.length || 0) + (stuckInProgressCalls?.length || 0);

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
  let maxedOutCount = 0;
  if (userCampaignIds.length > 0) {
    // First, mark any stuck 'calling' items that have exceeded max_attempts as FAILED (not pending!)
    const { data: maxedOutQueues, error: maxedOutError } = await supabase
      .from('dialing_queues')
      .select('id, attempts, max_attempts')
      .in('campaign_id', userCampaignIds)
      .eq('status', 'calling')
      .lt('updated_at', twoMinutesAgo);

    if (!maxedOutError && maxedOutQueues) {
      for (const q of maxedOutQueues) {
        const maxAttempts = q.max_attempts || 3;
        if ((q.attempts || 0) >= maxAttempts) {
          await supabase
            .from('dialing_queues')
            .update({ status: 'failed', updated_at: new Date().toISOString(), notes: `Max attempts (${maxAttempts}) reached` })
            .eq('id', q.id);
          maxedOutCount++;
        } else {
          // Only reset to pending if under max_attempts
          await supabase
            .from('dialing_queues')
            .update({ status: 'pending', scheduled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('id', q.id);
          resetQueueCount++;
        }
      }
    }
  }

  if (cleanedCount > 0 || resetQueueCount > 0 || maxedOutCount > 0) {
    console.log(`[Dispatcher Cleanup] Cleaned ${cleanedCount} stuck calls; reset ${resetQueueCount} stuck queue entries; marked ${maxedOutCount} as max-attempts-reached`);
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

    // ============= FETCH SYSTEM SETTINGS FIRST (before health_check) =============
    const { data: systemSettings, error: settingsError } = await supabase
      .from('system_settings')
      .select('max_concurrent_calls, calls_per_minute, retell_max_concurrent, enable_adaptive_pacing')
      .eq('user_id', user.id)
      .maybeSingle();

    if (settingsError) {
      console.warn('[Dispatcher] Settings fetch error (continuing with defaults):', settingsError.message);
    }

    // Defaults match ai-error-analyzer defaults for consistency
    const retellConcurrency = systemSettings?.retell_max_concurrent || 10;
    const callsPerMinute = systemSettings?.calls_per_minute || 30; // Changed from 40 to match ai-error-analyzer
    const maxConcurrent = systemSettings?.max_concurrent_calls || 10;
    const adaptivePacing = systemSettings?.enable_adaptive_pacing !== false;

    // Handle health_check action for system verification
    if (action === 'health_check' || action === 'status_check') {
      console.log('[Dispatcher] Health check requested');
      return new Response(
        JSON.stringify({
          success: true,
          healthy: true,
          timestamp: new Date().toISOString(),
          function: 'call-dispatcher',
          capabilities: ['dispatch', 'cleanup_stuck_calls', 'health_check'],
          settingsConfigured: !!systemSettings,
          currentSettings: {
            callsPerMinute,
            maxConcurrent,
            retellConcurrent: retellConcurrency,
            adaptivePacing
          }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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

    // Handle force_dispatch action - immediately call a specific lead
    if (action === 'force_dispatch') {
      const { leadId, campaignId } = requestBody;
      
      if (!leadId || !campaignId) {
        return new Response(
          JSON.stringify({ error: 'leadId and campaignId are required for force_dispatch' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log(`[Dispatcher] Force dispatch requested for lead ${leadId} in campaign ${campaignId}`);
      const nowIso = new Date().toISOString();
      
      // 1. End any stuck ringing/initiated calls for this lead
      const { data: clearedCalls } = await supabase
        .from('call_logs')
        .update({ 
          status: 'no_answer', 
          ended_at: nowIso,
          notes: 'Cleared for force dispatch'
        })
        .eq('lead_id', leadId)
        .in('status', ['ringing', 'initiated', 'queued'])
        .select('id');
      
      console.log(`[Dispatcher] Cleared ${clearedCalls?.length || 0} stuck calls for lead ${leadId}`);
      
      // 2. Check if lead already has a queue entry
      const { data: existingEntry } = await supabase
        .from('dialing_queues')
        .select('id')
        .eq('lead_id', leadId)
        .eq('campaign_id', campaignId)
        .maybeSingle();
      
      if (existingEntry) {
        // Update existing entry to dispatch immediately
        await supabase
          .from('dialing_queues')
          .update({ 
            scheduled_at: nowIso, 
            status: 'pending',
            attempts: 0,
            updated_at: nowIso
          })
          .eq('id', existingEntry.id);
        
        console.log(`[Dispatcher] Reset queue entry ${existingEntry.id} for immediate dispatch`);
      } else {
        // Get lead phone number
        const { data: lead } = await supabase
          .from('leads')
          .select('phone_number')
          .eq('id', leadId)
          .maybeSingle();
        
        if (!lead) {
          return new Response(
            JSON.stringify({ error: 'Lead not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Create new queue entry with highest priority
        await supabase.from('dialing_queues').insert({
          campaign_id: campaignId,
          lead_id: leadId,
          phone_number: lead.phone_number,
          status: 'pending',
          scheduled_at: nowIso,
          priority: 100, // Highest priority for force dispatch
          max_attempts: 3,
          attempts: 0,
        });
        
        console.log(`[Dispatcher] Created new queue entry for force dispatch of lead ${leadId}`);
      }
      
      return new Response(
        JSON.stringify({
          success: true,
          message: `Lead ${leadId} queued for immediate dispatch`,
          clearedCalls: clearedCalls?.length || 0,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Call Dispatcher running for user:', user.id);

    console.log(`[Dispatcher] Settings: ${retellConcurrency} Retell concurrent, ${callsPerMinute} calls/min, adaptive: ${adaptivePacing}`);

    // ============= CALLING HOURS ENFORCEMENT (TIMEZONE-AWARE) =============
    // Check active campaigns to determine calling hours & timezone
    // Hard cutoff: 7:30 PM ET as requested, default window 9:00 AM - 7:30 PM campaign tz
    {
      const { data: callingHoursCampaigns } = await supabase
        .from('campaigns')
        .select('id, name, calling_hours_start, calling_hours_end, timezone')
        .eq('user_id', user.id)
        .eq('status', 'active');

      if (callingHoursCampaigns && callingHoursCampaigns.length > 0) {
        let outsideHours = true;
        let reasonMsg = '';

        for (const camp of callingHoursCampaigns) {
          const tz = camp.timezone || 'America/New_York';
          const startHour = camp.calling_hours_start || '09:00';
          const endHour = camp.calling_hours_end || '19:30'; // Default 7:30 PM

          // Get current time in campaign timezone
          const nowInTz = new Date().toLocaleString('en-US', { timeZone: tz });
          const tzDate = new Date(nowInTz);
          const currentHour = tzDate.getHours();
          const currentMinute = tzDate.getMinutes();
          const currentTimeMinutes = currentHour * 60 + currentMinute;

          // Parse start/end as HH:MM
          const [startH, startM] = startHour.split(':').map(Number);
          const [endH, endM] = endHour.split(':').map(Number);
          const startMinutes = startH * 60 + (startM || 0);
          const endMinutes = endH * 60 + (endM || 0);

          // Hard cutoff: 7:30 PM ET regardless of campaign setting
          const etNow = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
          const etDate = new Date(etNow);
          const etMinutes = etDate.getHours() * 60 + etDate.getMinutes();
          const hardCutoffMinutes = 19 * 60 + 30; // 7:30 PM ET

          if (etMinutes >= hardCutoffMinutes) {
            reasonMsg = `Hard cutoff: past 7:30 PM ET (currently ${etDate.getHours()}:${String(etDate.getMinutes()).padStart(2, '0')} ET)`;
            outsideHours = true;
            break;
          }

          if (currentTimeMinutes >= startMinutes && currentTimeMinutes < endMinutes) {
            outsideHours = false; // At least one campaign is within hours
          } else {
            reasonMsg = `Outside calling hours for "${camp.name}" (${startHour}-${endHour} ${tz}, currently ${currentHour}:${String(currentMinute).padStart(2, '0')})`;
          }
        }

        if (outsideHours) {
          console.log(`[Dispatcher] CALLING HOURS BLOCK: ${reasonMsg}`);
          return new Response(
            JSON.stringify({
              success: true,
              dispatched: 0,
              status: 'outside_calling_hours',
              message: reasonMsg,
              remaining: 0,
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('[Dispatcher] Calling hours check: WITHIN allowed window');
      }
    }

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
          .select('id, status, scheduled_at, attempts, max_attempts')
          .eq('campaign_id', campaignLead.campaign_id)
          .eq('lead_id', lead.id)
          .limit(1)
          .maybeSingle();

        if (existingQueueEntry) {
          // Reset existing entry to pending for callback
          if (existingQueueEntry.status === 'completed' || existingQueueEntry.status === 'failed') {
            // Bug fix 2026-04-15: respect max_attempts. Without this check the
            // callback reset loop re-queued the same lead indefinitely.
            const attempts = (existingQueueEntry as any).attempts ?? 0;
            const maxAttempts = (existingQueueEntry as any).max_attempts ?? 3;
            if (attempts >= maxAttempts) {
              await supabase
                .from('leads')
                .update({ next_callback_at: null })
                .eq('id', lead.id);
              console.log(`[Dispatcher] Max attempts (${attempts}/${maxAttempts}) reached for lead ${lead.id} — clearing callback, not resetting queue`);
              continue;
            }
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
            // Bug fix 2026-04-15: clear next_callback_at after honoring the
            // callback so this lead doesn't stay past-due and loop back.
            await supabase
              .from('leads')
              .update({ next_callback_at: null })
              .eq('id', lead.id);
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
      .select('id, name, agent_id, max_attempts, workflow_id, provider, telnyx_assistant_id, metadata')
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

    // Check existing queue entries — include ALL statuses to prevent upsert from recycling
    // completed/failed entries back to pending (root cause of re-calling bug)
    const { data: existingQueue } = await supabase
      .from('dialing_queues')
      .select('lead_id, status')
      .in('campaign_id', campaignIds);

    const existingLeadIds = new Set((existingQueue || []).map(q => q.lead_id));

    // Check existing workflow progress entries
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: existingWorkflowProgress } = await supabase
      .from('lead_workflow_progress')
      .select('lead_id, status, workflow_id, leads!lead_workflow_progress_lead_id_fkey(phone_number)')
      .in('workflow_id', workflowIds.length > 0 ? workflowIds : ['no-workflows'])
      .gte('created_at', oneDayAgo);

    // Only block leads that are currently in non-terminal workflow states
    const terminalWorkflowStatuses = new Set(['completed', 'failed', 'cancelled', 'removed']);
    const blockingWorkflowProgress = (existingWorkflowProgress || []).filter((progress: any) => {
      const status = String(progress?.status || '').toLowerCase();
      return status ? !terminalWorkflowStatuses.has(status) : true;
    });

    const existingWorkflowLeadIds = new Set(blockingWorkflowProgress.map((p: any) => p.lead_id));

    // Build a set of phone numbers that are currently in active workflow progress
    const existingWorkflowPhones = new Set<string>();
    for (const p of blockingWorkflowProgress) {
      const phone = (p as any).leads?.phone_number;
      if (phone) {
        const normalized = phone.replace(/\D/g, '').slice(-10);
        existingWorkflowPhones.add(normalized);
      }
    }
    console.log(`[Dispatcher] Leads currently in active workflows (last 24h): ${existingWorkflowLeadIds.size}, unique phones: ${existingWorkflowPhones.size}`);

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
    
    // Build set of leads that had successful/connected calls (recent - 5 min window)
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

    // ============= TERMINAL DISPOSITION CHECK (FULL CAMPAIGN HISTORY) =============
    // Never re-call leads that already reached a terminal successful outcome in this campaign
    const terminalOutcomes = ['appointment_set', 'appointment_booked', 'transferred', 'interested', 'converted', 'sold', 'booked'];
    const terminalDispositions = ['appointment_booked', 'transferred', 'interested', 'converted', 'sold'];
    
    const { data: terminalCallLogs } = await supabase
      .from('call_logs')
      .select('lead_id, outcome, auto_disposition')
      .in('campaign_id', campaignIds)
      .or(
        terminalOutcomes.map(o => `outcome.eq.${o}`).join(',') + ',' +
        terminalDispositions.map(d => `auto_disposition.eq.${d}`).join(',')
      );

    const terminallyContactedLeadIds = new Set(
      (terminalCallLogs || []).map((cl: any) => cl.lead_id)
    );

    console.log(`[Dispatcher] Recently called leads: ${recentlyCalledLeadIds.size}, Successfully contacted: ${successfullyContactedLeadIds.size}, Terminal dispositions (full history): ${terminallyContactedLeadIds.size}`);

    // Get leads from campaign_leads that need to be queued - include callback fields for filtering
    const { data: campaignLeads, error: leadsError } = await supabase
      .from('campaign_leads')
      .select(`
        campaign_id,
        lead_id,
        leads (
          id,
          phone_number,
          status,
          do_not_call,
          next_callback_at
        )
      `)
      .in('campaign_id', campaignIds);

    if (leadsError) throw leadsError;

    // Filter leads that need to be added to queue
    const nowTime = new Date();
    let leadsToQueue = (campaignLeads || []).filter(cl => {
      const lead = cl.leads as any;
      if (!lead || !lead.phone_number) return false;
      if (lead.do_not_call) return false;
      if (existingLeadIds.has(cl.lead_id)) return false;
      if (existingWorkflowLeadIds.has(cl.lead_id)) return false;
      
      // CRITICAL: Protect callback leads from being called early
      if (lead.status === 'callback') {
        console.log(`[Dispatcher] Skipping lead ${cl.lead_id} - status is 'callback'`);
        return false;
      }
      
      // Also check if next_callback_at is in the future
      if (lead.next_callback_at) {
        const callbackTime = new Date(lead.next_callback_at);
        if (callbackTime > nowTime) {
          console.log(`[Dispatcher] Skipping lead ${cl.lead_id} - has future callback at ${lead.next_callback_at}`);
          return false;
        }
      }
      
      // Check by normalized phone number
      const normalizedPhone = lead.phone_number.replace(/\D/g, '').slice(-10);
      if (existingWorkflowPhones.has(normalizedPhone)) {
        console.log(`[Dispatcher] Skipping lead ${cl.lead_id} - phone ${normalizedPhone} already in workflow`);
        return false;
      }
      
      if (recentlyCalledLeadIds.has(cl.lead_id)) return false;
      if (successfullyContactedLeadIds.has(cl.lead_id)) return false;
      // TERMINAL DISPOSITION CHECK: Never re-queue leads with successful outcomes in full campaign history
      if (terminallyContactedLeadIds.has(cl.lead_id)) {
        console.log(`[Dispatcher] Skipping lead ${cl.lead_id} - terminal disposition reached (full campaign history)`);
        return false;
      }
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

      // Add to dialing queue for call-first or no-workflow campaigns.
      // CRITICAL: Use INSERT (not upsert) to prevent recycling completed/failed entries.
      // The existingLeadIds filter above already excludes leads with ANY queue entry.
      const queuePayload = {
        campaign_id: campaign.id,
        lead_id: cl.lead_id,
        phone_number: lead.phone_number,
        status: 'pending',
        scheduled_at: nowIso,
        priority: 1,
        max_attempts: campaign.max_attempts || 3,
        attempts: 0,
        updated_at: nowIso,
      };

      const { error: queueError } = await supabase
        .from('dialing_queues')
        .insert(queuePayload);

      if (!queueError) {
        dialingQueued++;
        console.log(`[Dispatcher] Queue inserted for lead ${cl.lead_id}`);
      } else if (queueError.code === '23505') {
        // Unique constraint violation = lead already has a queue entry (race condition safety)
        console.log(`[Dispatcher] Lead ${cl.lead_id} already in queue (constraint), skipping`);
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

    // Reset stale daily_calls counters (from previous days) before selecting
    await supabase.rpc('reset_stale_daily_calls', { target_user_id: user.id });

    let availableNumbers: any[] = [];
    let retellAvailableNumbers: any[] = [];
    let telnyxAvailableNumbers: any[] = [];

    // Check if any active campaign uses each provider type
    const hasTelnyxCampaign = activeCampaigns.some((c: any) => c.provider === 'telnyx' || c.provider === 'both');
    const hasRetellCampaign = activeCampaigns.some((c: any) => !c.provider || c.provider === 'retell' || c.provider === 'both');
    const hasAssistableCampaign = activeCampaigns.some((c: any) => c.provider === 'assistable');

    if (hasRetellCampaign) {
      // Retell campaigns use numbers imported into Retell.
      // Prefer rotation-enabled numbers; if none are enabled, fallback to all active Retell numbers
      // so testing and small campaigns are never blocked by rotation toggles.
      const { data: retellNumbers, error: retellError } = await supabase
        .from('phone_numbers')
        .select('id, number, provider, retell_phone_id, daily_calls, is_spam, quarantine_until, rotation_enabled, max_daily_calls')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .not('retell_phone_id', 'is', null);

      if (retellError) {
        console.error('[Dispatcher] Error fetching Retell phone numbers:', retellError);
      } else {
        const maxDailyDefault = 100;
        const retellWithinLimits = (retellNumbers || []).filter((n: any) => {
          const maxCalls = n.max_daily_calls || maxDailyDefault;
          const currentCalls = n.daily_calls || 0;
          return currentCalls < maxCalls;
        });

        const rotationEnabledRetell = retellWithinLimits.filter((n: any) => n.rotation_enabled === true);
        retellAvailableNumbers = rotationEnabledRetell.length > 0 ? rotationEnabledRetell : retellWithinLimits;

        if (rotationEnabledRetell.length === 0 && retellWithinLimits.length > 0) {
          console.warn('[Dispatcher] No rotation-enabled Retell numbers found; using all active Retell numbers as fallback');
        }

        console.log(`[Dispatcher] ${retellAvailableNumbers.length}/${retellNumbers?.length || 0} Retell numbers available`);
      }
    }

    if (hasTelnyxCampaign) {
      // Telnyx campaigns should only use Telnyx-owned numbers.
      // Prefer rotation-enabled numbers; if none are enabled, fallback to all active Telnyx numbers
      // so manual testing is never blocked by rotation toggles.
      const { data: telnyxNumbers, error: telnyxError } = await supabase
        .from('phone_numbers')
        .select('id, number, provider, retell_phone_id, daily_calls, is_spam, quarantine_until, rotation_enabled, max_daily_calls')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .eq('provider', 'telnyx');

      if (telnyxError) {
        console.error('[Dispatcher] Error fetching Telnyx phone numbers:', telnyxError);
      } else {
        const maxDailyDefault = 100;
        const telnyxWithinLimits = (telnyxNumbers || []).filter((n: any) => {
          const maxCalls = n.max_daily_calls || maxDailyDefault;
          const currentCalls = n.daily_calls || 0;
          return currentCalls < maxCalls;
        });

        const rotationEnabledTelnyx = telnyxWithinLimits.filter((n: any) => n.rotation_enabled === true);
        telnyxAvailableNumbers = rotationEnabledTelnyx.length > 0 ? rotationEnabledTelnyx : telnyxWithinLimits;

        if (rotationEnabledTelnyx.length === 0 && telnyxWithinLimits.length > 0) {
          console.warn('[Dispatcher] No rotation-enabled Telnyx numbers found; using active Telnyx numbers for manual continuity');
        }

        console.log(`[Dispatcher] ${telnyxAvailableNumbers.length}/${telnyxNumbers?.length || 0} Telnyx numbers available`);
      }
    }

    availableNumbers = [...retellAvailableNumbers];
    const existingIds = new Set(availableNumbers.map((n: any) => n.id));
    for (const n of telnyxAvailableNumbers) {
      if (!existingIds.has(n.id)) {
        availableNumbers.push(n);
        existingIds.add(n.id);
      }
    }

    console.log(`[Dispatcher] Query result: Found ${availableNumbers.length} numbers for dispatch`);

    // ============= CAMPAIGN-SCOPED PHONE POOLS =============
    // If a campaign has explicit numbers in campaign_phone_pools, those are the ONLY
    // numbers eligible for that campaign. Empty pool = use global pool (backward compatible).
    const campaignIds = activeCampaigns.map((c: any) => c.id);
    const campaignPoolMap: Record<string, Set<string>> = {};
    if (campaignIds.length > 0) {
      const { data: poolRows, error: poolErr } = await supabase
        .from('campaign_phone_pools')
        .select('campaign_id, phone_number_id')
        .in('campaign_id', campaignIds);
      if (poolErr) {
        console.error('[Dispatcher] Error fetching campaign_phone_pools:', poolErr);
      } else {
        for (const row of poolRows || []) {
          if (!row.campaign_id || !row.phone_number_id) continue;
          if (!campaignPoolMap[row.campaign_id]) campaignPoolMap[row.campaign_id] = new Set();
          campaignPoolMap[row.campaign_id].add(row.phone_number_id);
        }
        const scopedCount = Object.keys(campaignPoolMap).length;
        if (scopedCount > 0) {
          console.log(`[Dispatcher] ${scopedCount} campaign(s) have explicit phone pools assigned`);
        }
      }
    }

    // If still empty for Retell campaigns, try Retell sync fallback
    if (availableNumbers.length === 0 && hasRetellCampaign) {
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
      
      try {
        console.log('[Dispatcher] No local Retell numbers found, attempting Retell sync...');
        const syncResponse = await supabase.functions.invoke('retell-phone-management', {
          body: { action: 'sync', userId: user.id },
          headers: {
            Authorization: `Bearer ${supabaseKey}`,
            apikey: supabaseKey,
          },
        });
        
        if (syncResponse.data?.synced > 0) {
          console.log(`[Dispatcher] Synced ${syncResponse.data.synced} numbers from Retell`);
          
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
      console.error('[Dispatcher] CRITICAL: No phone numbers available - campaign cannot proceed');

      // Log this critical error so it's visible in monitoring
      await supabase.from('edge_function_errors').insert({
        function_name: 'call-dispatcher',
        error_type: 'no_numbers_available',
        error_message: 'No phone numbers available for calling. All numbers may have hit daily limits or been quarantined.',
        user_id: user.id,
        context: {
          workflowEnrolled,
          dialingQueued,
          suggestion: 'Check phone_numbers table - ensure rotation_enabled=true, is_spam=false, daily_calls < max_daily_calls'
        }
      });

      return new Response(
        JSON.stringify({
          success: false,
          status: 'no_numbers_available',
          error: 'No phone numbers available for calling. All numbers may have hit daily limits, been quarantined, or need Retell import.',
          dispatched: 0,
          workflowEnrolled,
          dialingQueued,
          callbacks: { queued: callbacksQueued, enrolled: callbacksEnrolledInWorkflow, resumed: callbacksResumed },
          action_required: 'Check phone number status in settings or wait for daily reset'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`[Dispatcher] Found ${availableNumbers.length} phone numbers for rotation`);
    
    // Track usage for rotation within this batch
    const numberUsageInBatch: Record<string, number> = {};

    // ============= CONCURRENCY-AWARE BATCH SIZING =============
    // Count active calls (initiated, ringing, or in_progress) to check capacity
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    const { count: activeCallCount, error: activeCallError } = await supabase
      .from('call_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .in('status', ['initiated', 'ringing', 'in_progress', 'queued'])
      .gte('created_at', fiveMinAgo);

    if (activeCallError) {
      console.error('[Dispatcher] Error counting active calls:', activeCallError);
    }

    const activeCount = activeCallCount || 0;

    // Calculate available capacity
    // With ~10% pickup rate, we can safely have 10x concurrency in dials
    const pickupRate = 0.10;
    const maxDialsInFlight = Math.floor(retellConcurrency / pickupRate); // 10 / 0.1 = 100

    const availableSlots = maxDialsInFlight - activeCount;
    
    // Calculate batch size based on calls_per_minute
    // For 40 calls/min with 6-10 second intervals between batches, we need ~7-10 calls per batch
    const batchInterval = 6; // seconds between dispatcher runs
    const targetBatchSize = Math.ceil((callsPerMinute / 60) * batchInterval);
    
    // Use the smaller of: available slots, target batch, or 15 max per invocation
    const batchSize = Math.max(1, Math.min(availableSlots, targetBatchSize, 15));

    const utilizationPct = maxDialsInFlight > 0 ? Math.round((activeCount / maxDialsInFlight) * 100) : 0;
    console.log(`[Dispatcher] Concurrency: ${activeCount}/${maxDialsInFlight} active (${utilizationPct}%), batch size: ${batchSize}`);

    // If at capacity, return early and let scheduler retry
    if (availableSlots <= 0) {
      console.log(`[Dispatcher] At capacity (${activeCount}/${maxDialsInFlight}), waiting for calls to complete`);
      return new Response(
        JSON.stringify({
          success: true,
          dispatched: 0,
          status: 'at_capacity',
          message: `${activeCount} calls in flight, max is ${maxDialsInFlight}. Need more Retell concurrency or wait for calls to complete.`,
          activeCallCount: activeCount,
          maxDialsInFlight,
          retellConcurrency,
          workflowEnrolled,
          dialingQueued,
          callbacks: { queued: callbacksQueued, enrolled: callbacksEnrolledInWorkflow, resumed: callbacksResumed }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Now process the dialing queue with DYNAMIC batch size
    // ALL user-initiated calls bypass scheduling. If you clicked a button, you want calls NOW.
    // Only internal/cron calls (isInternalCall=true) respect scheduled_at.
    const manualDispatchNow = !isInternalCall;

    if (manualDispatchNow) {
      console.log('[Dispatcher] Manual dispatch — bypassing scheduled_at gate');
    }

    // ============= ATOMIC CLAIM (race condition fix) =============
    // For internal/cron calls: use claim_pending_dispatches RPC which atomically
    // sets status='calling' + increments attempts using FOR UPDATE SKIP LOCKED.
    // This prevents multiple concurrent dispatcher invocations from claiming the same rows.
    // For manual dispatch: use the old SELECT path since we need to bypass scheduled_at.
    let eligibleCalls: any[] = [];

    if (!manualDispatchNow) {
      // ATOMIC CLAIM PATH — prevents race condition
      const { data: claimed, error: claimError } = await supabase
        .rpc('claim_pending_dispatches', {
          p_campaign_ids: campaignIds,
          p_limit: batchSize,
        });

      if (claimError) throw claimError;

      // Filter out items that have exceeded max_attempts (defense in depth)
      const validClaimed = (claimed || []).filter((q: any) => {
        // attempts was already incremented by the RPC, so check against max
        const attempts = q.attempts || 0;
        const maxAttempts = q.max_attempts || 3;
        if (attempts > maxAttempts) {
          console.warn(`[Dispatcher] Skipping queue ${q.id} - attempts ${attempts} > max ${maxAttempts}, marking failed`);
          supabase.from('dialing_queues').update({ status: 'failed', updated_at: nowIso, notes: `Max attempts (${maxAttempts}) reached` }).eq('id', q.id);
          return false;
        }
        return true;
      });

      // Hydrate leads + campaigns for claimed rows (RPC only returns dialing_queues columns)
      if (validClaimed.length > 0) {
        const leadIds = [...new Set(validClaimed.map((q: any) => q.lead_id).filter(Boolean))];
        const claimedCampaignIds = [...new Set(validClaimed.map((q: any) => q.campaign_id).filter(Boolean))];

        const [leadsResult, campaignsResult] = await Promise.all([
          leadIds.length > 0
            ? supabase.from('leads').select('id, phone_number, first_name, last_name, ghl_contact_id, state').in('id', leadIds)
            : { data: [] },
          claimedCampaignIds.length > 0
            ? supabase.from('campaigns').select('id, agent_id, name, retry_delay_minutes, provider, telnyx_assistant_id, metadata, timezone, calling_hours_start, calling_hours_end').in('id', claimedCampaignIds)
            : { data: [] },
        ]);

        const leadsMap = new Map((leadsResult.data || []).map((l: any) => [l.id, l]));
        const campaignsMap = new Map((campaignsResult.data || []).map((c: any) => [c.id, c]));

        eligibleCalls = validClaimed.map((q: any) => ({
          ...q,
          leads: leadsMap.get(q.lead_id) || null,
          campaigns: campaignsMap.get(q.campaign_id) || null,
        }));
      }

      console.log(`[Dispatcher] ATOMIC CLAIM: claimed ${claimed?.length || 0}, eligible ${eligibleCalls.length}`);
    } else {
      // MANUAL DISPATCH PATH — bypasses scheduled_at, uses old SELECT
      const { data: queuedCalls, error: queueError } = await supabase
        .from('dialing_queues')
        .select(`
          *,
          leads (id, phone_number, first_name, last_name, ghl_contact_id, state),
          campaigns (id, agent_id, name, retry_delay_minutes, provider, telnyx_assistant_id, metadata, timezone, calling_hours_start, calling_hours_end)
        `)
        .in('campaign_id', campaignIds)
        .eq('status', 'pending')
        .order('priority', { ascending: false })
        .order('scheduled_at', { ascending: true })
        .limit(batchSize);

      if (queueError) throw queueError;

      // Filter out items that have exceeded max_attempts
      eligibleCalls = (queuedCalls || []).filter((q: any) => {
        const attempts = q.attempts || 0;
        const maxAttempts = q.max_attempts || 3;
        if (attempts >= maxAttempts) {
          console.warn(`[Dispatcher] Skipping queue ${q.id} - attempts ${attempts} >= max ${maxAttempts}, marking failed`);
          supabase.from('dialing_queues').update({ status: 'failed', updated_at: nowIso, notes: `Max attempts (${maxAttempts}) reached` }).eq('id', q.id);
          return false;
        }
        return true;
      });

      // For manual dispatch, mark as calling now (atomic claim already did this for internal)
      for (const q of eligibleCalls) {
        await supabase.from('dialing_queues')
          .update({ status: 'calling', attempts: (q.attempts || 0) + 1, updated_at: nowIso })
          .eq('id', q.id);
      }
    }

    // ============= PER-LEAD TIMEZONE FILTERING =============
    // Check each lead's state and skip if their local time is outside calling hours.
    // This prevents calling someone in CA at 6 AM just because it's 9 AM ET.
    {
      const beforeCount = eligibleCalls.length;
      let skippedForTimezone = 0;
      const timezoneFilteredCalls: any[] = [];

      for (const q of eligibleCalls) {
        const lead = q.leads;
        const campaign = q.campaigns;
        const leadState = lead?.state;
        const leadTz = getLeadTimezone(leadState);
        const campaignTz = campaign?.timezone || 'America/New_York';
        const startHour = campaign?.calling_hours_start || '09:00';
        const endHour = campaign?.calling_hours_end || '19:30';

        // Use lead's state timezone if available, otherwise fall back to campaign timezone
        const effectiveTz = leadTz || campaignTz;

        const { allowed, reason } = isWithinCallingHours(effectiveTz, startHour, endHour);

        if (!allowed) {
          skippedForTimezone++;
          console.log(`[Dispatcher] Skipping lead ${q.lead_id} — ${reason} (state: ${leadState || 'unknown'})`);
          // Release the claim back to pending so they get picked up later
          supabase.from('dialing_queues')
            .update({
              status: 'pending',
              attempts: Math.max(0, (q.attempts || 1) - 1), // undo the attempt increment from claim
              updated_at: new Date().toISOString(),
              notes: `Timezone skip: ${reason}`,
            })
            .eq('id', q.id)
            .then(() => {});
          continue;
        }

        timezoneFilteredCalls.push(q);
      }

      eligibleCalls = timezoneFilteredCalls;

      if (skippedForTimezone > 0) {
        console.log(`[Dispatcher] Timezone filter: ${skippedForTimezone}/${beforeCount} leads skipped (outside their local calling hours)`);
      }
    }

    console.log(`[Dispatcher] Processing ${eligibleCalls.length} eligible calls`);

    // ============= DIAGNOSTICS FOR ZERO DISPATCHED =============
    // If no queued calls are eligible NOW, check if there are any scheduled for later
    let diagnostics: any = null;
    if (eligibleCalls.length === 0) {
      const { data: pendingCalls, count: pendingTotal } = await supabase
        .from('dialing_queues')
        .select('id, scheduled_at, lead_id, status', { count: 'exact' })
        .in('campaign_id', campaignIds)
        .eq('status', 'pending')
        .order('scheduled_at', { ascending: true })
        .limit(5);

      const pendingEligibleNow = 0; // We already know none are eligible
      const pendingScheduledFuture = pendingTotal || 0;
      const earliestScheduledAt = pendingCalls?.[0]?.scheduled_at || null;
      
      let waitMessage = 'No pending calls in queue.';
      if (pendingScheduledFuture > 0 && earliestScheduledAt) {
        const earliestTime = new Date(earliestScheduledAt);
        const minutesUntil = Math.max(0, Math.round((earliestTime.getTime() - Date.now()) / 60000));
        waitMessage = `${pendingScheduledFuture} calls pending but scheduled for later. Next eligible at ${earliestScheduledAt} (in ${minutesUntil}m).`;
      }
      
      diagnostics = {
        pending_total: pendingTotal || 0,
        pending_eligible_now: 0,
        pending_scheduled_future: pendingScheduledFuture,
        earliest_scheduled_at: earliestScheduledAt,
        server_now_iso: nowIso,
        message: waitMessage,
      };
      
      console.log(`[Dispatcher] Diagnostics: ${JSON.stringify(diagnostics)}`);
    }

    let dispatched = 0;
    const dispatchResults: any[] = [];

    for (const queueItem of eligibleCalls) {
      try {
        const lead = queueItem.leads as any;
        const campaign = queueItem.campaigns as any;
        let campaignProvider = campaign?.provider || 'retell';
        const isBothMode = campaignProvider === 'both';
        const isAssistable = campaignProvider === 'assistable';
        
        // For "both" mode: alternate between retell and telnyx using attempt count
        // With fallback: if the chosen provider has no agent configured, use the other
        if (isBothMode) {
          const attemptNum = (queueItem.attempts || 0);
          const preferredProvider = attemptNum % 2 === 0 ? 'retell' : 'telnyx';
          const hasRetellAgent = !!campaign?.agent_id;
          const hasTelnyxAgent = !!campaign?.telnyx_assistant_id;
          
          if (preferredProvider === 'retell' && !hasRetellAgent && hasTelnyxAgent) {
            campaignProvider = 'telnyx';
            console.log(`[Dispatcher] Both mode fallback: no Retell agent, using Telnyx`);
          } else if (preferredProvider === 'telnyx' && !hasTelnyxAgent && hasRetellAgent) {
            campaignProvider = 'retell';
            console.log(`[Dispatcher] Both mode fallback: no Telnyx agent, using Retell`);
          } else {
            campaignProvider = preferredProvider;
          }
          console.log(`[Dispatcher] Both mode: attempt ${attemptNum} → using ${campaignProvider}`);
        }
        
        const isTelnyx = campaignProvider === 'telnyx';
        
        // CRITICAL DEDUP: Check if this lead was already answered/completed recently
        const toPhone = lead?.phone_number || queueItem.phone_number;
        const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const { data: recentAnswered } = await supabase
          .from('call_logs')
          .select('id, status, duration_seconds')
          .eq('phone_number', toPhone)
          .eq('user_id', user.id)
          .in('status', ['completed', 'answered', 'in_progress'])
          .gte('created_at', thirtyMinAgo)
          .limit(1);
        
        if (recentAnswered && recentAnswered.length > 0) {
          console.log(`[Dispatcher] DEDUP: Skipping lead ${queueItem.lead_id} — phone ${toPhone} was answered recently (call ${recentAnswered[0].id})`);
          await supabase
            .from('dialing_queues')
            .update({ status: 'completed', updated_at: nowIso, notes: 'Lead already answered recently - dedup' })
            .eq('id', queueItem.id);
          continue;
        }
        
        // ── ASSISTABLE DISPATCH PATH ──────────────────────────────────
        if (isAssistable) {
          const meta = campaign?.metadata || {};
          const assistableAgentId = meta.assistable_agent_id;
          const assistableNumberPoolId = meta.assistable_number_pool_id;

          if (!assistableAgentId) {
            console.error(`[Dispatcher] Assistable campaign ${queueItem.campaign_id} has no assistable_agent_id in metadata`);
            await supabase.from('dialing_queues')
              .update({ status: 'failed', updated_at: nowIso, notes: 'No Assistable agent_id configured in campaign metadata' })
              .eq('id', queueItem.id);
            continue;
          }

          // status='calling' + attempts already set by atomic claim (or manual dispatch pre-loop)

          // Invoke assistable-make-call
          // Use GHL contact_id from lead if available; fall back to phone number
          const ghlContactId = lead?.ghl_contact_id || toPhone;
          const assistableLocationId = meta.assistable_location_id || 'boXe5LQTgfuXIRfrFTja';
          
          if (!lead?.ghl_contact_id) {
            console.warn(`[Dispatcher] Lead ${queueItem.lead_id} has no ghl_contact_id — using phone number as fallback`);
          }
          
          const assistableBody: any = {
            assistant_id: assistableAgentId,
            location_id: assistableLocationId,
            contact_id: ghlContactId,
            lead_id: queueItem.lead_id,
            campaign_id: queueItem.campaign_id,
            user_id: user.id,
          };
          if (assistableNumberPoolId) {
            assistableBody.number_pool_id = assistableNumberPoolId;
          }

          const assistableResp = await supabase.functions.invoke('assistable-make-call', {
            body: assistableBody,
            headers: { Authorization: `Bearer ${supabaseKey}`, apikey: supabaseKey },
          });

          if (assistableResp.error || (assistableResp.data as any)?.error) {
            const errMsg = (assistableResp.data as any)?.error || assistableResp.error?.message || 'Assistable call failed';
            throw new Error(errMsg);
          }

          dispatched++;
          dispatchResults.push({ leadId: queueItem.lead_id, success: true, callId: (assistableResp.data as any)?.call_id, provider: 'assistable' });
          console.log(`[Dispatcher] Assistable call initiated for lead ${queueItem.lead_id}`);

          // Handle max attempts
          const currentAttempts = (queueItem.attempts || 0) + 1;
          if (currentAttempts >= (queueItem.max_attempts || 3)) {
            await supabase.from('dialing_queues')
              .update({ status: 'completed', updated_at: nowIso, notes: `Completed after ${currentAttempts} attempts` })
              .eq('id', queueItem.id);
          }
          continue;
        }

        // ── RETELL / TELNYX DISPATCH PATH ─────────────────────────────
        // Validate agent configuration based on provider
        const hasAgent = isTelnyx ? !!campaign?.telnyx_assistant_id : !!campaign?.agent_id;
        if (!hasAgent) {
          // For "both" mode, check if the OTHER provider has an agent instead of failing
          if (isBothMode) {
            const altProvider = isTelnyx ? 'retell' : 'telnyx';
            const altHasAgent = altProvider === 'telnyx' ? !!campaign?.telnyx_assistant_id : !!campaign?.agent_id;
            if (altHasAgent) {
              console.log(`[Dispatcher] Both mode: ${campaignProvider} has no agent, falling back to ${altProvider}`);
              // Swap provider for this call
              // We'll just skip and let the next attempt use the other provider
            }
          }
          const providerLabel = isTelnyx ? 'Telnyx' : 'Retell';
          console.error(`[Dispatcher] CRITICAL: Campaign ${queueItem.campaign_id} has no ${providerLabel} agent - cannot make calls`);

          await supabase.from('edge_function_errors').insert({
            function_name: 'call-dispatcher',
            error_type: 'campaign_config_error',
            error_message: `Campaign "${campaign?.name || queueItem.campaign_id}" has no ${providerLabel} agent configured`,
            user_id: user.id,
            context: {
              campaign_id: queueItem.campaign_id,
              campaign_name: campaign?.name,
              lead_id: queueItem.lead_id,
              provider: campaignProvider,
              action_required: `Configure a ${providerLabel} agent for this campaign in campaign settings`
            }
          });

          await supabase
            .from('dialing_queues')
            .update({
              status: 'failed',
              updated_at: nowIso,
              notes: `Campaign has no ${providerLabel} agent configured`
            })
            .eq('id', queueItem.id);
          continue;
        }
        
        // ============= NUMBER ROTATION LOGIC =============
        // TRUE ROUND-ROBIN: Pick the number with the lowest total usage (daily_calls + batch).
        // Local presence is a minor tiebreaker only — even distribution ALWAYS wins.
        const toAreaCode = toPhone?.replace(/\D/g, '').slice(1, 4);
        
        const numberPool = isTelnyx ? telnyxAvailableNumbers : retellAvailableNumbers;

        // NJ-area / local-area set: numbers whose area code shares the destination's state.
        // Same-state area codes for common contiguous regions (NJ + NYC metro overflow).
        const STATE_AREA_CODES: Record<string, string[]> = {
          // New Jersey + NYC metro (people accept these as "local" for NJ leads)
          '201': ['201','551','609','640','732','848','856','862','908','973','917','646','212','347','718','929'],
          '551': ['201','551','609','640','732','848','856','862','908','973'],
          '609': ['201','551','609','640','732','848','856','862','908','973'],
          '640': ['201','551','609','640','732','848','856','862','908','973'],
          '732': ['201','551','609','640','732','848','856','862','908','973'],
          '848': ['201','551','609','640','732','848','856','862','908','973'],
          '856': ['201','551','609','640','732','848','856','862','908','973'],
          '862': ['201','551','609','640','732','848','856','862','908','973'],
          '908': ['201','551','609','640','732','848','856','862','908','973'],
          '973': ['201','551','609','640','732','848','856','862','908','973'],
        };
        const sameStateCodes = STATE_AREA_CODES[toAreaCode || ''] || [toAreaCode || ''];

        const scoredNumbers = numberPool
          .filter((n: any) => {
            if (n.quarantine_until && new Date(n.quarantine_until) > new Date()) return false;
            if (n.is_spam) return false;
            return true;
          })
          .map((n: any) => {
            const totalUsage = (n.daily_calls || 0) + (numberUsageInBatch[n.id] || 0);
            const numAreaCode = n.number.replace(/\D/g, '').slice(1, 4);
            const exactLocalMatch = numAreaCode === toAreaCode;
            const sameStateMatch = sameStateCodes.includes(numAreaCode);
            return { number: n, totalUsage, exactLocalMatch, sameStateMatch };
          });

        // Prefer: exact area-code match → same-state match → lowest usage.
        // This makes local presence a HARD preference, not a 0.1 tiebreaker.
        const exactMatches = scoredNumbers.filter(s => s.exactLocalMatch);
        const stateMatches = scoredNumbers.filter(s => s.sameStateMatch);
        const pool = exactMatches.length > 0 ? exactMatches
                   : stateMatches.length > 0 ? stateMatches
                   : scoredNumbers;

        pool.sort((a, b) => a.totalUsage - b.totalUsage);
        const sortedScoredNumbers = pool.length > 0 ? pool : scoredNumbers;
        scoredNumbers.length = 0;
        scoredNumbers.push(...sortedScoredNumbers);
        
        if (scoredNumbers.length === 0) {
          const providerLabel = isTelnyx ? 'Telnyx' : 'Retell';
          console.error(`[Dispatcher] No valid ${providerLabel} phone numbers available after filtering`);
          await supabase
            .from('dialing_queues')
            .update({
              status: 'failed',
              updated_at: nowIso,
              notes: `No valid ${providerLabel} numbers available for this campaign`
            })
            .eq('id', queueItem.id);
          continue;
        }
        
        const selectedNumber = scoredNumbers[0].number;
        const callerId = selectedNumber.number;
        
        // Track usage in this batch
        numberUsageInBatch[selectedNumber.id] = (numberUsageInBatch[selectedNumber.id] || 0) + 1;
        
        console.log(`[Dispatcher] ROUND-ROBIN selected: ${callerId} (usage: ${scoredNumbers[0].totalUsage}, pool: ${scoredNumbers.length} numbers)`);
        
        // status='calling' + attempts already set by atomic claim (or manual dispatch pre-loop)

        // Initiate the call with ALL required parameters (provider-aware)
        const callBody: any = {
          action: 'create_call',
          leadId: queueItem.lead_id,
          campaignId: queueItem.campaign_id,
          userId: user.id,
          phoneNumber: toPhone,
          callerId: callerId,
          agentId: campaign.agent_id,
          provider: campaignProvider,
        };
        if (isTelnyx && campaign.telnyx_assistant_id) {
          callBody.telnyxAssistantId = campaign.telnyx_assistant_id;
        }
        const callResponse = await supabase.functions.invoke('outbound-calling', {
          body: callBody,
          headers: {
            Authorization: `Bearer ${supabaseKey}`,
            apikey: supabaseKey,
          },
        });

        if (callResponse.error) {
          let detailedMessage = callResponse.error.message || 'Call failed';
          try {
            const errorPayload = await callResponse.error.context?.json?.();
            if (errorPayload?.error) detailedMessage = errorPayload.error;
            else if (errorPayload?.message) detailedMessage = errorPayload.message;
          } catch {
            // keep fallback message
          }
          throw new Error(detailedMessage);
        }

        if ((callResponse.data as any)?.error) {
          throw new Error((callResponse.data as any).error);
        }

        dispatched++;
        dispatchResults.push({
          leadId: queueItem.lead_id,
          success: true,
          callId: callResponse.data?.call_id,
          callerId: callerId,
        });

        console.log(`[Dispatcher] Call initiated for lead ${queueItem.lead_id} from ${callerId}`);

        // CRITICAL: Mark queue item as 'calling' (successfully dispatched)
        // The retell-call-webhook will update to 'completed' or schedule retry
        // But if webhook never fires, cleanup will handle it with max_attempts check
        const currentAttempts = (queueItem.attempts || 0) + 1;
        const maxAttempts = queueItem.max_attempts || 3;
        
        // If this was the last allowed attempt, mark as completed immediately
        // (webhook can still update disposition, but no more retries)
        if (currentAttempts >= maxAttempts) {
          console.log(`[Dispatcher] Lead ${queueItem.lead_id} reached max attempts (${currentAttempts}/${maxAttempts}) - marking queue completed`);
          await supabase
            .from('dialing_queues')
            .update({ status: 'completed', updated_at: nowIso, notes: `Completed after ${currentAttempts} attempts` })
            .eq('id', queueItem.id);
        }

        // Update daily_calls on the phone number (with auto-reset if date changed)
        // CRITICAL: parameter name must match the SQL function signature (target_phone_id)
        await supabase.rpc('increment_daily_calls_with_reset', { target_phone_id: selectedNumber.id });

      } catch (callError: any) {
        console.error(`[Dispatcher] Call error for ${queueItem.lead_id}:`, callError);
        
        // Check if this is a rate limit error from Retell
        const errorMsg = callError.message || '';
        if (errorMsg.includes('RATE_LIMIT') || 
            errorMsg.includes('429') || 
            errorMsg.includes('concurrency') ||
            errorMsg.includes('rate limit')) {
          console.warn('[Dispatcher] Rate limit hit - backing off 10 seconds');
          
          // Keep lead in queue for retry soon
          await supabase
            .from('dialing_queues')
            .update({ 
              status: 'pending', 
              scheduled_at: new Date(Date.now() + 10 * 1000).toISOString(), // 10 second delay
              updated_at: nowIso 
            })
            .eq('id', queueItem.id);
          
          dispatchResults.push({
            leadId: queueItem.lead_id,
            success: false,
            error: 'Rate limit - will retry',
            rateLimited: true,
          });
          
          // Break out of loop - stop trying to dial more this batch
          break;
        }
        
        // Check if should retry for other errors
        const attempts = (queueItem.attempts || 0) + 1;
        const maxAttempts = queueItem.max_attempts || 3;
        
        if (attempts < maxAttempts) {
          // Use campaign's retry_delay_minutes, clamped to 1-60 minutes (default 5)
          const campaign = queueItem.campaigns as any;
          const rawRetryDelay = campaign?.retry_delay_minutes ?? 5;
          const clampedRetryDelay = Math.max(1, Math.min(60, rawRetryDelay));
          const retryDelayMs = clampedRetryDelay * 60 * 1000;
          
          console.log(`[Dispatcher] Retry in ${clampedRetryDelay} minutes for lead ${queueItem.lead_id} (campaign setting: ${rawRetryDelay})`);
          
          await supabase
            .from('dialing_queues')
            .update({ 
              status: 'pending', 
              scheduled_at: new Date(Date.now() + retryDelayMs).toISOString(),
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

    // ============= SELF-SCHEDULING FOR CONTINUOUS DIALING =============
    // Check if there are more pending leads and schedule next batch
    const { count: remainingCount } = await supabase
      .from('dialing_queues')
      .select('*', { count: 'exact', head: true })
      .in('campaign_id', campaignIds)
      .eq('status', 'pending');

    const remaining = remainingCount || 0;

    // Calculate delay based on calls_per_minute target
    // For 40 calls/min with batch of 7, invoke every ~10 seconds
    const delaySeconds = batchSize > 0 
      ? Math.max(5, Math.floor((batchSize / callsPerMinute) * 60))
      : 10;

    console.log(`[Dispatcher] Dispatched ${dispatched}, ${remaining} leads remaining`);

    // Self-schedule if there are more leads and we're actively dialing
    let selfScheduled = false;
    if (remaining > 0 && dispatched > 0 && !isInternalCall) {
      // Only self-schedule from user-initiated calls to avoid infinite loops
      // The automation-scheduler will handle the continuous scheduling
      console.log(`[Dispatcher] ${remaining} pending, next batch will be scheduled by automation-scheduler`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        dispatched,
        workflowEnrolled,
        dialingQueued,
        remaining,
        batchSize,
        activeCallCount: activeCount,
        maxDialsInFlight,
        utilizationPercent: utilizationPct,
        nextBatchDelaySeconds: delaySeconds,
        // Diagnostics for when 0 dispatched
        diagnostics: diagnostics || null,
        // usedSettings for verification
        usedSettings: {
          callsPerMinute,
          maxConcurrent: maxDialsInFlight,
          retellConcurrent: retellConcurrency,
          adaptivePacing,
          source: systemSettings ? 'configured' : 'defaults'
        },
        targetBatchSize: batchSize,
        availableSlots: maxDialsInFlight - activeCount,
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
