/**
 * Workflow Executor Edge Function
 * 
 * Executes workflow steps for leads including:
 * - Actual call placement via outbound-calling
 * - SMS sending via sms-messaging
 * - AI SMS via ai-sms-processor
 * - Wait delays
 * 
 * This is the engine that makes workflows actually DO things.
 */

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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Supabase configuration missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, userId, leadId, workflowId, campaignId } = await req.json();

    if (action === 'start_workflow') {
      // Start a lead on a workflow
      const { data: workflow, error: workflowError } = await supabase
        .from('campaign_workflows')
        .select('*, workflow_steps(*)')
        .eq('id', workflowId)
        .maybeSingle();

      if (workflowError || !workflow) {
        throw new Error('Workflow not found');
      }

      const steps = workflow.workflow_steps.sort((a: any, b: any) => a.step_number - b.step_number);
      const firstStep = steps[0];

      if (!firstStep) {
        throw new Error('Workflow has no steps');
      }

      // ============= PRE-START VALIDATION =============
      const validationErrors: string[] = [];
      
      // Get lead data for validation
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('phone_number, do_not_call')
        .eq('id', leadId)
        .maybeSingle();
      
      if (leadError || !lead) {
        validationErrors.push('Lead not found');
      } else {
        // Check DNC list
        if (lead.do_not_call) {
          validationErrors.push('Lead is on Do Not Call list');
        }
        
        // Validate phone number exists
        if (!lead.phone_number) {
          validationErrors.push('Lead has no phone number');
        }
      }
      
      // Get campaign info if provided
      let campaign: any = null;
      if (campaignId) {
        const { data: campaignData } = await supabase
          .from('campaigns')
          .select('agent_id, sms_from_number')
          .eq('id', campaignId)
          .maybeSingle();
        campaign = campaignData;
      }

      // Validate each step type
      for (const step of steps) {
        const config = step.step_config || {};
        
        // Validate WAIT steps have timing
        if (step.step_type === 'wait') {
          const hasDelay = (config.delay_minutes && config.delay_minutes > 0) ||
                          (config.delay_hours && config.delay_hours > 0) ||
                          (config.delay_days && config.delay_days > 0) ||
                          config.time_of_day;
          if (!hasDelay) {
            validationErrors.push(`Step ${step.step_number} (wait): No delay configured`);
          }
        }

        // Validate CALL steps have agent
        if (step.step_type === 'call') {
          if (!campaign?.agent_id && !config.agent_id) {
            validationErrors.push(`Step ${step.step_number} (call): No AI agent configured. ${!campaignId ? 'Campaign ID is required for call steps, or configure agent_id in step config.' : 'Configure agent_id in campaign or step.'}`);
          }
          // Warn if no campaign (calls might fail due to missing phone numbers)
          if (!campaignId) {
            console.warn(`[Workflow] Warning: Step ${step.step_number} (call) has no campaign - may fail if no phone numbers available`);
          }
        }

        // Validate SMS steps have content
        if (step.step_type === 'sms') {
          if (!config.sms_content && !config.content && !config.message) {
            validationErrors.push(`Step ${step.step_number} (sms): No message content`);
          }
        }

        // Validate AI SMS steps
        if (step.step_type === 'ai_sms') {
          if (!config.ai_prompt) {
            console.log(`[Workflow] Warning: Step ${step.step_number} (ai_sms) has no prompt - will use defaults`);
          }
        }
      }

      // If there are validation errors, return them and don't start
      if (validationErrors.length > 0) {
        console.error('[Workflow] Validation failed:', validationErrors);
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Workflow validation failed',
          validationErrors,
          message: `Cannot start workflow: ${validationErrors.join('; ')}`
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // ============= END VALIDATION =============

      // Calculate when the first action should occur
      const nextActionAt = calculateNextActionTime(firstStep);

      // Create progress record
      const { data: progress, error: progressError } = await supabase
        .from('lead_workflow_progress')
        .insert({
          user_id: userId,
          lead_id: leadId,
          workflow_id: workflowId,
          campaign_id: campaignId,
          current_step_id: firstStep.id,
          status: 'active',
          next_action_at: nextActionAt,
          started_at: new Date().toISOString(),
        })
        .select()
        .maybeSingle();

      if (progressError) throw progressError;
      if (!progress) throw new Error('Failed to create workflow progress');

      console.log(`[Workflow] Started workflow ${workflowId} for lead ${leadId}`);

      return new Response(JSON.stringify({ success: true, progress }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'execute_pending') {
      // Find and execute all pending workflow steps
      const now = new Date().toISOString();
      
      const { data: pendingProgress, error: pendingError } = await supabase
        .from('lead_workflow_progress')
        .select(`
          *,
          leads(*),
          campaign_workflows(*),
          workflow_steps!lead_workflow_progress_current_step_id_fkey(*)
        `)
        .eq('status', 'active')
        .lte('next_action_at', now)
        .limit(100);

      if (pendingError) throw pendingError;

      console.log(`[Workflow] Found ${pendingProgress?.length || 0} pending steps to execute`);

      const results = [];
      
      for (const progress of pendingProgress || []) {
        try {
          // Check if lead is engaged or sequence is paused
          const { data: nudgeStatus } = await supabase
            .from('lead_nudge_tracking')
            .select('is_engaged, sequence_paused')
            .eq('lead_id', progress.lead_id)
            .maybeSingle();

          if (nudgeStatus?.sequence_paused) {
            console.log(`[Workflow] Skipping lead ${progress.lead_id} - sequence paused`);
            continue;
          }

          const result = await executeStep(supabase, progress);
          results.push({ leadId: progress.lead_id, success: true, result });
        } catch (stepError: any) {
          console.error('[Workflow] Error executing step for lead:', progress.lead_id, stepError);
          results.push({ leadId: progress.lead_id, success: false, error: stepError.message });
        }
      }

      return new Response(JSON.stringify({ processed: results.length, results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'remove_from_workflow') {
      // Remove a lead from a workflow (or all workflows)
      const query = supabase
        .from('lead_workflow_progress')
        .update({
          status: 'removed',
          removal_reason: 'disposition_trigger',
          updated_at: new Date().toISOString(),
        })
        .eq('lead_id', leadId)
        .eq('status', 'active');

      if (workflowId) {
        query.eq('workflow_id', workflowId);
      }

      const { error } = await query;
      if (error) throw error;

      console.log(`[Workflow] Removed lead ${leadId} from workflows`);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'pause_workflow') {
      await supabase
        .from('lead_workflow_progress')
        .update({ status: 'paused', updated_at: new Date().toISOString() })
        .eq('lead_id', leadId)
        .eq('workflow_id', workflowId);

      // Also update nudge tracking
      await supabase
        .from('lead_nudge_tracking')
        .update({ sequence_paused: true, pause_reason: 'manual_pause' })
        .eq('lead_id', leadId);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'resume_workflow') {
      await supabase
        .from('lead_workflow_progress')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('lead_id', leadId)
        .eq('workflow_id', workflowId);

      // Also update nudge tracking
      await supabase
        .from('lead_nudge_tracking')
        .update({ sequence_paused: false, pause_reason: null })
        .eq('lead_id', leadId);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error('Unknown action');
  } catch (error) {
    console.error('[Workflow] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function calculateNextActionTime(step: any): string {
  const config = step.step_config || {};
  const now = new Date();

  if (step.step_type === 'wait') {
    const delayMs = 
      (config.delay_minutes || 0) * 60 * 1000 +
      (config.delay_hours || 0) * 60 * 60 * 1000 +
      (config.delay_days || 0) * 24 * 60 * 60 * 1000;
    
    let nextTime = new Date(now.getTime() + delayMs);

    // If time_of_day is specified, adjust to that time
    if (config.time_of_day) {
      const [hours, minutes] = config.time_of_day.split(':').map(Number);
      nextTime.setHours(hours, minutes, 0, 0);
      if (nextTime <= now) {
        nextTime.setDate(nextTime.getDate() + 1);
      }
    }

    return nextTime.toISOString();
  }

  // For immediate actions (call, sms), execute now
  return now.toISOString();
}

async function executeStep(supabase: any, progress: any) {
  const step = progress.workflow_steps;
  const lead = progress.leads;
  const campaign = progress.campaign_workflows;
  const config = step?.step_config || {};

  // Guard: if the campaign's workflow was turned off/changed, pause this progress so it stops sending SMS.
  if (progress.campaign_id) {
    const { data: campaignRow, error: campaignRowError } = await supabase
      .from('campaigns')
      .select('status, workflow_id')
      .eq('id', progress.campaign_id)
      .maybeSingle();

    if (campaignRowError) {
      console.error('[Workflow] Campaign lookup error:', campaignRowError);
    } else {
      const workflowDisabledOrChanged =
        !campaignRow ||
        campaignRow.status !== 'active' ||
        !campaignRow.workflow_id ||
        campaignRow.workflow_id !== progress.workflow_id;

      if (workflowDisabledOrChanged) {
        console.log(`[Workflow] Pausing workflow progress ${progress.id} - campaign workflow disabled/changed`);
        await supabase
          .from('lead_workflow_progress')
          .update({ status: 'paused', updated_at: new Date().toISOString() })
          .eq('id', progress.id);

        return { success: true, action: 'paused_due_to_campaign_workflow_change' };
      }
    }
  }

  console.log(`[Workflow] Executing step ${step?.step_type} for lead ${lead?.id}`);

  // Update last action timestamp
  await supabase
    .from('lead_workflow_progress')
    .update({ last_action_at: new Date().toISOString() })
    .eq('id', progress.id);

  let stepResult: any = { success: true };

  // Validate step exists and has a valid type
  if (!step || !step.step_type) {
    console.warn(`[Workflow] Skipping invalid step - missing step data or step_type for lead ${lead?.id}`);
    stepResult = { success: false, error: 'Invalid step configuration', action: 'skipped' };
    // Still move to next step to avoid getting stuck
    await moveToNextStep(supabase, progress, step);
    return stepResult;
  }

  switch (step.step_type) {
    case 'call':
      stepResult = await executeCallStep(supabase, lead, progress, config);
      break;

    case 'sms':
      stepResult = await executeSmsStep(supabase, lead, progress, config);
      break;

    case 'ai_sms':
    case 'ai_auto_reply':  // Handle both naming conventions
      stepResult = await executeAiSmsStep(supabase, lead, progress, config);
      break;

    case 'wait':
      // Wait step completed, just move to next
      stepResult = { success: true, action: 'wait_completed' };
      break;

    case 'email':
      // Email step - placeholder for future implementation
      console.log(`[Workflow] Email step not yet implemented for lead ${lead?.id}`);
      stepResult = { success: true, action: 'email_skipped' };
      break;

    case 'webhook':
      stepResult = await executeWebhookStep(supabase, lead, progress, config);
      break;

    case 'condition':
    case 'branch':
      // Condition/branching steps - evaluate and continue
      console.log(`[Workflow] Condition step for lead ${lead?.id} - evaluating...`);
      stepResult = { success: true, action: 'condition_evaluated' };
      break;

    case 'tag':
    case 'update_status':
      // Tag or status update step
      if (config.new_status) {
        await supabase
          .from('leads')
          .update({ status: config.new_status, updated_at: new Date().toISOString() })
          .eq('id', lead.id);
      }
      if (config.tags && Array.isArray(config.tags)) {
        const currentTags = lead.tags || [];
        const newTags = [...new Set([...currentTags, ...config.tags])];
        await supabase
          .from('leads')
          .update({ tags: newTags, updated_at: new Date().toISOString() })
          .eq('id', lead.id);
      }
      stepResult = { success: true, action: 'lead_updated' };
      break;

    case 'end':
    case 'stop':
      // Explicit end step - mark workflow as completed
      await supabase
        .from('lead_workflow_progress')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', progress.id);
      console.log(`[Workflow] Explicit end for lead ${lead?.id}`);
      return { success: true, action: 'workflow_ended' };

    default:
      console.warn(`[Workflow] Unhandled step type "${step.step_type}" for lead ${lead?.id} - skipping`);
      stepResult = { success: true, action: 'step_skipped', reason: `Unknown step type: ${step.step_type}` };
  }

  // Update nudge tracking
  const { data: existingNudge } = await supabase
    .from('lead_nudge_tracking')
    .select('nudge_count')
    .eq('lead_id', lead.id)
    .maybeSingle();

  await supabase
    .from('lead_nudge_tracking')
    .upsert({
      lead_id: lead.id,
      user_id: progress.user_id,
      last_ai_contact_at: new Date().toISOString(),
      nudge_count: (existingNudge?.nudge_count || 0) + 1,
    }, {
      onConflict: 'lead_id',
    });

  // Move to next step
  await moveToNextStep(supabase, progress, step);

  return { stepType: step?.step_type, completed: true, ...stepResult };
}

async function executeCallStep(supabase: any, lead: any, progress: any, config: any) {
  console.log(`[Workflow] Initiating call to ${lead?.phone_number}`);

  try {
    const maxAttempts = config.max_attempts || 1;
    
    // Check recent call history for this lead to avoid duplicate calls
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recentCalls } = await supabase
      .from('call_logs')
      .select('id, status, outcome, duration_seconds, created_at')
      .eq('lead_id', lead.id)
      .gte('created_at', fiveMinutesAgo)
      .order('created_at', { ascending: false });

    // Check if there's an active/recent call that hasn't completed
    const pendingCall = recentCalls?.find((c: any) => 
      c.status === 'ringing' || c.status === 'in-progress' || c.status === 'initiated'
    );
    
    if (pendingCall) {
      console.log(`[Workflow] Skipping - call already in progress for lead ${lead.id}`);
      return { success: true, action: 'call_already_in_progress', callId: pendingCall.id };
    }

    // Check if lead was already successfully connected
    const successfulCall = recentCalls?.find((c: any) => 
      c.outcome === 'connected' || 
      c.outcome === 'answered' || 
      c.outcome === 'appointment_set' ||
      c.outcome === 'callback_scheduled' ||
      (c.status === 'completed' && c.duration_seconds > 30)
    );

    if (successfulCall) {
      console.log(`[Workflow] Skipping - lead ${lead.id} already had successful call`);
      return { success: true, action: 'already_connected', skipRemaining: true };
    }

    // Count failed attempts in this workflow run
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const { data: todaysCalls } = await supabase
      .from('call_logs')
      .select('id, outcome, status')
      .eq('lead_id', lead.id)
      .eq('campaign_id', progress.campaign_id)
      .gte('created_at', todayStart.toISOString());

    const failedAttempts = todaysCalls?.filter((c: any) => 
      c.outcome === 'no_answer' || 
      c.outcome === 'voicemail' || 
      c.outcome === 'busy' ||
      c.status === 'failed' ||
      c.status === 'no-answer'
    ).length || 0;

    if (failedAttempts >= maxAttempts) {
      console.log(`[Workflow] Max attempts (${maxAttempts}) reached for lead ${lead.id}, skipping call`);
      return { success: true, action: 'max_attempts_reached', attempts: failedAttempts };
    }

    // Get a caller ID from campaign phone pool - MUST BE RETELL IMPORTED
    const callerId = await selectCallerIdForCampaign(supabase, progress.campaign_id, progress.user_id, true, 'voice');

    if (!callerId) {
      console.error('[Workflow] No Retell-imported caller ID available for campaign - CANNOT MAKE CALL');
      return { 
        success: false, 
        error: 'No Retell-imported phone number available. Import a phone number to Retell first.',
        action: 'call_blocked_no_retell_phone'
      };
    }

    // Get the campaign's agent ID
    const { data: campaignData } = await supabase
      .from('campaigns')
      .select('agent_id')
      .eq('id', progress.campaign_id)
      .maybeSingle();

    const agentId = config.agent_id || campaignData?.agent_id;

    if (!agentId) {
      console.error('[Workflow] No agent ID configured');
      return { success: false, error: 'No agent ID configured' };
    }

    // Call the outbound-calling function
    const response = await supabase.functions.invoke('outbound-calling', {
      body: {
        action: 'create_call',
        campaignId: progress.campaign_id,
        leadId: lead.id,
        phoneNumber: lead.phone_number,
        callerId: callerId,
        agentId: agentId,
        userId: progress.user_id,
      },
    });

    if (response.error) {
      console.error('[Workflow] Call creation failed:', response.error);
      return { success: false, error: response.error.message };
    }

    console.log('[Workflow] Call initiated:', response.data);
    return { success: true, callId: response.data?.retell_call_id, action: 'call_initiated', attempt: failedAttempts + 1 };

  } catch (error: any) {
    console.error('[Workflow] Call step error:', error);
    return { success: false, error: error.message };
  }
}

async function executeSmsStep(supabase: any, lead: any, progress: any, config: any) {
  const rawTemplate = config.sms_content || config.content || config.message || '';
  const messageBody = replaceTemplateVariables(rawTemplate, lead);

  console.log(`[Workflow] Sending SMS to ${lead?.phone_number} with template:`, rawTemplate);

  try {
    // SMS DEDUPLICATION: Check if an SMS was sent to this phone in the last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const normalizedPhone = lead.phone_number?.replace(/\D/g, '').slice(-10) || '';
    
    const { data: recentSms } = await supabase
      .from('sms_messages')
      .select('id, created_at, to_number')
      .eq('user_id', progress.user_id)
      .gte('created_at', fiveMinutesAgo)
      .eq('direction', 'outbound');
    
    // Check if any recent SMS was sent to a matching phone number
    const duplicateSms = recentSms?.find((sms: any) => {
      const smsPhone = sms.to_number?.replace(/\D/g, '').slice(-10) || '';
      return smsPhone === normalizedPhone;
    });
    
    if (duplicateSms) {
      console.log(`[Workflow] Skipping SMS - message already sent to ${normalizedPhone} at ${duplicateSms.created_at}`);
      return { success: true, action: 'sms_skipped_duplicate', reason: 'SMS sent to this number in last 5 minutes' };
    }

    // Get sender number from campaign phone pool (prefer stationary)
    const fromNumber = await selectCallerIdForCampaign(supabase, progress.campaign_id, progress.user_id, true, 'sms');

    if (!fromNumber) {
      console.error('[Workflow] No SMS number available');
      return { success: false, error: 'No SMS number available' };
    }

    // Call the sms-messaging function
    const response = await supabase.functions.invoke('sms-messaging', {
      body: {
        action: 'send_sms',
        to: lead.phone_number,
        from: fromNumber,
        body: messageBody,
        lead_id: lead.id,
        user_id: progress.user_id,
      },
    });

    if (response.error) {
      console.error('[Workflow] SMS send failed:', response.error);
      return { success: false, error: response.error.message };
    }

    console.log('[Workflow] SMS sent:', response.data);
    return { success: true, messageId: response.data?.message_id, action: 'sms_sent' };

  } catch (error: any) {
    console.error('[Workflow] SMS step error:', error);
    return { success: false, error: error.message };
  }
}

async function executeAiSmsStep(supabase: any, lead: any, progress: any, config: any) {
  console.log(`[Workflow] Sending AI SMS to ${lead?.phone_number}`);

  try {
    // AI SMS DEDUPLICATION: Check if an SMS was sent to this phone in the last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const normalizedPhone = lead.phone_number?.replace(/\D/g, '').slice(-10) || '';
    
    const { data: recentSms } = await supabase
      .from('sms_messages')
      .select('id, created_at, to_number')
      .eq('user_id', progress.user_id)
      .gte('created_at', fiveMinutesAgo)
      .eq('direction', 'outbound');
    
    // Check if any recent SMS was sent to a matching phone number
    const duplicateSms = recentSms?.find((sms: any) => {
      const smsPhone = sms.to_number?.replace(/\D/g, '').slice(-10) || '';
      return smsPhone === normalizedPhone;
    });
    
    if (duplicateSms) {
      console.log(`[Workflow] Skipping AI SMS - message already sent to ${normalizedPhone} at ${duplicateSms.created_at}`);
      return { success: true, action: 'ai_sms_skipped_duplicate', reason: 'SMS sent to this number in last 5 minutes' };
    }

    // Get sender number from campaign phone pool
    const fromNumber = await selectCallerIdForCampaign(supabase, progress.campaign_id, progress.user_id, true, 'sms');

    if (!fromNumber) {
      console.error('[Workflow] No SMS number available for AI SMS');
      return { success: false, error: 'No SMS number available' };
    }

    // Call the ai-sms-processor function with service role key for internal auth
    // Using direct fetch to pass the service role key properly
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    const response = await fetch(`${supabaseUrl}/functions/v1/ai-sms-processor`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'generate_and_send',
        leadId: lead.id,
        userId: progress.user_id,
        fromNumber: fromNumber,
        context: config.context || 'follow_up',
        prompt: config.ai_prompt || config.sms_content || config.prompt || null,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Workflow] AI SMS failed:', response.status, errorText);
      return { success: false, error: `AI SMS failed: ${response.status}` };
    }

    const data = await response.json();
    console.log('[Workflow] AI SMS sent:', data);
    return { success: true, action: 'ai_sms_sent' };

  } catch (error: any) {
    console.error('[Workflow] AI SMS step error:', error);
    return { success: false, error: error.message };
  }
}

async function executeWebhookStep(supabase: any, lead: any, progress: any, config: any) {
  console.log(`[Workflow] Executing webhook for lead ${lead?.id}`);

  if (!config.webhook_url) {
    return { success: false, error: 'No webhook URL configured' };
  }

  try {
    const payload = {
      event: 'workflow_step',
      lead: {
        id: lead.id,
        phone_number: lead.phone_number,
        first_name: lead.first_name,
        last_name: lead.last_name,
        email: lead.email,
        status: lead.status,
      },
      workflow_id: progress.workflow_id,
      campaign_id: progress.campaign_id,
      step_config: config,
      timestamp: new Date().toISOString(),
    };

    const response = await fetch(config.webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.headers || {}),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return { success: false, error: `Webhook returned ${response.status}` };
    }

    return { success: true, action: 'webhook_sent' };
  } catch (error: any) {
    console.error('[Workflow] Webhook error:', error);
    return { success: false, error: error.message };
  }
}

async function selectCallerIdForCampaign(
  supabase: any,
  campaignId: string | null,
  userId: string,
  preferStationary: boolean = false,
  type: 'voice' | 'sms' = 'voice'
): Promise<string | null> {
  try {
    // For SMS, first check if campaign has a specific sms_from_number configured
    if (campaignId && type === 'sms') {
      const { data: campaign } = await supabase
        .from('campaigns')
        .select('sms_from_number')
        .eq('id', campaignId)
        .maybeSingle();

      if (campaign?.sms_from_number) {
        console.log('[Workflow] Using campaign sms_from_number:', campaign.sms_from_number);
        return campaign.sms_from_number;
      }
    }

    // Then try to get from campaign phone pool
    if (campaignId) {
      const roleFilter = type === 'sms' ? ['sms_only', 'outbound'] : ['outbound', 'caller_id_only'];
      
      let query = supabase
        .from('campaign_phone_pools')
        .select(`
          phone_number_id,
          is_primary,
          priority,
          phone_numbers(number, is_stationary, purpose, status, retell_phone_id)
        `)
        .eq('campaign_id', campaignId)
        .in('role', roleFilter)
        .order('is_primary', { ascending: false })
        .order('priority', { ascending: false });

      const { data: poolNumbers } = await query;

      if (poolNumbers && poolNumbers.length > 0) {
        // Filter for active numbers
        let activeNumbers = poolNumbers.filter(
          (p: any) => p.phone_numbers?.status === 'active'
        );

        // FOR VOICE CALLS: Must have retell_phone_id (imported to Retell)
        if (type === 'voice') {
          activeNumbers = activeNumbers.filter(
            (p: any) => p.phone_numbers?.retell_phone_id
          );
          console.log(`[Workflow] Found ${activeNumbers.length} Retell-imported numbers in campaign pool`);
        }

        if (activeNumbers.length > 0) {
          // If preferring stationary, try to find one
          if (preferStationary) {
            const stationary = activeNumbers.find((p: any) => p.phone_numbers?.is_stationary);
            if (stationary) {
              return stationary.phone_numbers.number;
            }
          }

          // Return the highest priority active number
          return activeNumbers[0].phone_numbers.number;
        }
      }
    }

    // Fallback: get any active number for this user
    const purposeFilter = type === 'sms' 
      ? ['sms_only', 'general_rotation'] 
      : ['retell_agent', 'follow_up_dedicated', 'general_rotation'];

    // Build query - for voice, require retell_phone_id
    let fallbackQuery = supabase
      .from('phone_numbers')
      .select('number, retell_phone_id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .eq('is_spam', false)
      .in('purpose', purposeFilter);

    // For voice calls, must be imported to Retell
    if (type === 'voice') {
      fallbackQuery = fallbackQuery.not('retell_phone_id', 'is', null);
    }

    const { data: userNumbers } = await fallbackQuery.limit(1);

    if (userNumbers && userNumbers.length > 0) {
      console.log(`[Workflow] Using fallback number: ${userNumbers[0].number} (retell: ${!!userNumbers[0].retell_phone_id})`);
      return userNumbers[0].number;
    }

    // Last resort for voice: any number with retell_phone_id
    if (type === 'voice') {
      const { data: anyRetellNumber } = await supabase
        .from('phone_numbers')
        .select('number')
        .eq('user_id', userId)
        .eq('status', 'active')
        .not('retell_phone_id', 'is', null)
        .limit(1);

      if (anyRetellNumber?.[0]?.number) {
        console.log(`[Workflow] Using last resort Retell number: ${anyRetellNumber[0].number}`);
        return anyRetellNumber[0].number;
      }
      
      console.error('[Workflow] NO RETELL-IMPORTED PHONE NUMBERS AVAILABLE FOR CALLS');
      return null;
    }

    // Last resort for SMS: any active number
    const { data: anyNumber } = await supabase
      .from('phone_numbers')
      .select('number')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(1);

    return anyNumber?.[0]?.number || null;

  } catch (error) {
    console.error('[Workflow] Error selecting caller ID:', error);
    return null;
  }
}

function replaceTemplateVariables(template: string, lead: any): string {
  return template
    .replace(/\{\{first_name\}\}/gi, lead.first_name || '')
    .replace(/\{\{last_name\}\}/gi, lead.last_name || '')
    .replace(/\{\{name\}\}/gi, `${lead.first_name || ''} ${lead.last_name || ''}`.trim())
    .replace(/\{\{company\}\}/gi, lead.company || '')
    .replace(/\{\{email\}\}/gi, lead.email || '')
    .replace(/\{\{phone\}\}/gi, lead.phone_number || '');
}

async function moveToNextStep(supabase: any, progress: any, currentStep: any) {
  // Get all steps in order
  const { data: allSteps } = await supabase
    .from('workflow_steps')
    .select('*')
    .eq('workflow_id', progress.workflow_id)
    .order('step_number', { ascending: true });

  const currentIndex = allSteps?.findIndex((s: any) => s.id === currentStep?.id) ?? -1;
  const nextStep = allSteps?.[currentIndex + 1];

  if (nextStep) {
    const nextActionAt = calculateNextActionTime(nextStep);
    await supabase
      .from('lead_workflow_progress')
      .update({
        current_step_id: nextStep.id,
        next_action_at: nextActionAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', progress.id);

    console.log(`[Workflow] Moved to step ${nextStep.step_number} for lead ${progress.lead_id}`);
  } else {
    // Workflow complete
    await supabase
      .from('lead_workflow_progress')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', progress.id);

    console.log(`[Workflow] Workflow completed for lead ${progress.lead_id}`);
  }
}
