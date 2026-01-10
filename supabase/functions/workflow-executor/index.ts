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

    // Handle health_check action for system verification
    if (action === 'health_check') {
      console.log('[Workflow Executor] Health check requested');
      return new Response(JSON.stringify({
        success: true,
        healthy: true,
        timestamp: new Date().toISOString(),
        function: 'workflow-executor',
        capabilities: ['start_workflow', 'execute_pending', 'remove_from_workflow', 'pause_workflow', 'resume_workflow'],
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'start_workflow') {
      // ============= DUPLICATE CHECK - PREVENT MULTIPLE ENROLLMENTS =============
      console.log(`[Workflow] Checking for existing enrollment: lead=${leadId}, workflow=${workflowId}, campaign=${campaignId}`);
      
      // Check for existing active/paused workflow for this lead+workflow+campaign combo
      const { data: existingProgress, error: checkError } = await supabase
        .from('lead_workflow_progress')
        .select('id, status, current_step_id, created_at')
        .eq('lead_id', leadId)
        .eq('workflow_id', workflowId)
        .in('status', ['active', 'paused'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (checkError) {
        console.error('[Workflow] Error checking existing progress:', checkError);
      }
      
      if (existingProgress) {
        console.log(`[Workflow] Lead ${leadId} already has ${existingProgress.status} progress (id: ${existingProgress.id}), skipping enrollment`);
        return new Response(JSON.stringify({ 
          success: true, 
          action: 'already_enrolled',
          progressId: existingProgress.id,
          status: existingProgress.status,
          message: `Lead already enrolled in workflow (${existingProgress.status})`
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Also check by phone number to prevent duplicate leads with same phone
      const { data: leadData } = await supabase
        .from('leads')
        .select('phone_number')
        .eq('id', leadId)
        .maybeSingle();
      
      if (leadData?.phone_number) {
        const normalizedPhone = leadData.phone_number.replace(/\D/g, '').slice(-10);
        
        // Check if any lead with this phone number is already in workflow
        const { data: phoneMatch } = await supabase
          .from('lead_workflow_progress')
          .select('id, lead_id, status, leads!inner(phone_number)')
          .eq('workflow_id', workflowId)
          .in('status', ['active', 'paused'])
          .limit(10);
        
        const duplicateByPhone = phoneMatch?.find((p: any) => {
          const pPhone = p.leads?.phone_number?.replace(/\D/g, '').slice(-10);
          return pPhone === normalizedPhone && p.lead_id !== leadId;
        });
        
        if (duplicateByPhone) {
          console.log(`[Workflow] Phone ${normalizedPhone} already in workflow via lead ${duplicateByPhone.lead_id}, skipping`);
          return new Response(JSON.stringify({ 
            success: true, 
            action: 'duplicate_phone_enrolled',
            existingLeadId: duplicateByPhone.lead_id,
            message: 'Another lead with this phone number is already in the workflow'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
      // ============= END DUPLICATE CHECK =============

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
          // Warn if no campaign
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
        .update({ 
          status: 'active', 
          next_action_at: new Date().toISOString(), // Resume immediately
          updated_at: new Date().toISOString() 
        })
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

  // Guard: if the campaign's workflow was turned off/changed, pause this progress
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
    case 'ai_auto_reply':
      stepResult = await executeAiSmsStep(supabase, lead, progress, config);
      break;

    case 'wait':
      stepResult = { success: true, action: 'wait_completed' };
      break;

    case 'email':
      console.log(`[Workflow] Email step not yet implemented for lead ${lead?.id}`);
      stepResult = { success: true, action: 'email_skipped' };
      break;

    case 'webhook':
      stepResult = await executeWebhookStep(supabase, lead, progress, config);
      break;

    case 'condition':
    case 'branch':
      console.log(`[Workflow] Condition step for lead ${lead?.id} - evaluating...`);
      stepResult = { success: true, action: 'condition_evaluated' };
      break;

    case 'tag':
    case 'update_status':
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
  console.log(`[Workflow] Initiating call to ${lead?.phone_number} (step: ${progress.current_step_id})`);

  try {
    const maxAttempts = config.max_attempts || 1;
    const skipIfContacted = config.skip_if_contacted === true; // Optional: skip if ANY step already reached lead
    
    // Check recent call history for this lead to avoid duplicate calls
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recentCalls } = await supabase
      .from('call_logs')
      .select('id, status, outcome, duration_seconds, created_at, campaign_id')
      .eq('lead_id', lead.id)
      .gte('created_at', fiveMinutesAgo)
      .order('created_at', { ascending: false });

    // Check if there's an active/recent call that hasn't completed
    const pendingCall = recentCalls?.find((c: any) => 
      ['queued', 'ringing', 'initiated', 'in_progress'].includes(c.status)
    );

    if (pendingCall) {
      console.log(`[Workflow] Lead ${lead.id} has pending call ${pendingCall.id}, skipping duplicate`);
      return { success: true, action: 'call_already_pending', callId: pendingCall.id };
    }

    // FIXED: Only skip if skip_if_contacted is true AND a successful call exists
    // By default, multi-step workflows should continue calling regardless of previous outcomes
    if (skipIfContacted) {
      const recentSuccess = recentCalls?.find((c: any) => 
        c.outcome && ['connected', 'answered', 'appointment_set', 'callback_requested'].includes(c.outcome)
      );

      if (recentSuccess) {
        console.log(`[Workflow] Lead ${lead.id} was recently contacted successfully and skip_if_contacted=true, skipping`);
        return { success: true, action: 'recently_contacted', callId: recentSuccess.id };
      }
    } else {
      console.log(`[Workflow] Multi-step workflow - proceeding with call regardless of previous contact status`);
    }

    // Trigger outbound call
    const callResponse = await supabase.functions.invoke('outbound-calling', {
      body: {
        leadId: lead.id,
        campaignId: progress.campaign_id,
        userId: progress.user_id,
        workflowStepId: progress.current_step_id,
      },
    });

    if (callResponse.error) {
      throw new Error(callResponse.error.message || 'Call initiation failed');
    }

    console.log(`[Workflow] Call initiated for lead ${lead.id}:`, callResponse.data);
    return { success: true, action: 'call_initiated', data: callResponse.data };

  } catch (error: any) {
    console.error(`[Workflow] Call step error for lead ${lead.id}:`, error);
    return { success: false, action: 'call_failed', error: error.message };
  }
}

async function executeSmsStep(supabase: any, lead: any, progress: any, config: any) {
  console.log(`[Workflow] Sending SMS to ${lead?.phone_number}`);

  try {
    const message = config.sms_content || config.content || config.message;
    if (!message) {
      throw new Error('No SMS content configured');
    }

    // Get from number
    let fromNumber = config.from_number;
    if (!fromNumber) {
      // Try to get from campaign phone pool
      if (progress.campaign_id) {
        const { data: poolNumber } = await supabase
          .from('campaign_phone_pools')
          .select('phone_numbers(number)')
          .eq('campaign_id', progress.campaign_id)
          .eq('role', 'outbound')
          .limit(1)
          .maybeSingle();
        
        fromNumber = poolNumber?.phone_numbers?.number;
      }
      
      // Fall back to user's first active number
      if (!fromNumber) {
        const { data: userNumber } = await supabase
          .from('phone_numbers')
          .select('number')
          .eq('user_id', progress.user_id)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle();
        
        fromNumber = userNumber?.number;
      }
    }

    if (!fromNumber) {
      throw new Error('No from number available for SMS');
    }

    // Replace dynamic variables in message
    const personalizedMessage = replaceDynamicVariables(message, lead);

    // Send via sms-messaging function
    const smsResponse = await supabase.functions.invoke('sms-messaging', {
      body: {
        action: 'send_sms',
        to: lead.phone_number,
        from: fromNumber,
        body: personalizedMessage,
        lead_id: lead.id,
        workflow_step_id: progress.current_step_id,
      },
    });

    if (smsResponse.error) {
      throw new Error(smsResponse.error.message || 'SMS sending failed');
    }

    console.log(`[Workflow] SMS sent to lead ${lead.id}`);
    return { success: true, action: 'sms_sent', data: smsResponse.data };

  } catch (error: any) {
    console.error(`[Workflow] SMS step error for lead ${lead.id}:`, error);
    return { success: false, action: 'sms_failed', error: error.message };
  }
}

async function executeAiSmsStep(supabase: any, lead: any, progress: any, config: any) {
  console.log(`[Workflow] Sending AI SMS to ${lead?.phone_number}`);

  try {
    // Get from number
    let fromNumber = config.from_number;
    if (!fromNumber) {
      if (progress.campaign_id) {
        const { data: poolNumber } = await supabase
          .from('campaign_phone_pools')
          .select('phone_numbers(number)')
          .eq('campaign_id', progress.campaign_id)
          .eq('role', 'outbound')
          .limit(1)
          .maybeSingle();
        
        fromNumber = poolNumber?.phone_numbers?.number;
      }
      
      if (!fromNumber) {
        const { data: userNumber } = await supabase
          .from('phone_numbers')
          .select('number')
          .eq('user_id', progress.user_id)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle();
        
        fromNumber = userNumber?.number;
      }
    }

    if (!fromNumber) {
      throw new Error('No from number available for AI SMS');
    }

    // Call AI SMS processor
    const aiResponse = await supabase.functions.invoke('ai-sms-processor', {
      body: {
        action: 'generate_and_send',
        leadId: lead.id,
        userId: progress.user_id,
        fromNumber,
        toNumber: lead.phone_number,
        prompt: config.ai_prompt || 'Send a friendly follow-up message',
        context: {
          workflowStep: progress.current_step_id,
          campaignId: progress.campaign_id,
        },
      },
    });

    if (aiResponse.error) {
      throw new Error(aiResponse.error.message || 'AI SMS failed');
    }

    console.log(`[Workflow] AI SMS sent to lead ${lead.id}`);
    return { success: true, action: 'ai_sms_sent', data: aiResponse.data };

  } catch (error: any) {
    console.error(`[Workflow] AI SMS step error for lead ${lead.id}:`, error);
    return { success: false, action: 'ai_sms_failed', error: error.message };
  }
}

async function executeWebhookStep(supabase: any, lead: any, progress: any, config: any) {
  console.log(`[Workflow] Executing webhook for lead ${lead?.id}`);

  try {
    const webhookUrl = config.webhook_url || config.url;
    if (!webhookUrl) {
      throw new Error('No webhook URL configured');
    }

    const payload = {
      lead_id: lead.id,
      lead_name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
      lead_phone: lead.phone_number,
      lead_email: lead.email,
      lead_status: lead.status,
      workflow_id: progress.workflow_id,
      campaign_id: progress.campaign_id,
      step_id: progress.current_step_id,
      timestamp: new Date().toISOString(),
      custom_data: config.custom_data || {},
    };

    const response = await fetch(webhookUrl, {
      method: config.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.headers || {}),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Webhook returned ${response.status}`);
    }

    console.log(`[Workflow] Webhook executed for lead ${lead.id}`);
    return { success: true, action: 'webhook_sent', status: response.status };

  } catch (error: any) {
    console.error(`[Workflow] Webhook step error for lead ${lead.id}:`, error);
    return { success: false, action: 'webhook_failed', error: error.message };
  }
}

async function moveToNextStep(supabase: any, progress: any, currentStep: any) {
  if (!currentStep) {
    // No current step, mark as completed
    await supabase
      .from('lead_workflow_progress')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', progress.id);
    return;
  }

  // Get the next step
  const { data: nextStep } = await supabase
    .from('workflow_steps')
    .select('id, step_type, step_config')
    .eq('workflow_id', currentStep.workflow_id || progress.workflow_id)
    .eq('step_number', (currentStep.step_number || 0) + 1)
    .maybeSingle();

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
    
    console.log(`[Workflow] Moved to step ${nextStep.id} for progress ${progress.id}`);
  } else {
    // No more steps, complete the workflow
    await supabase
      .from('lead_workflow_progress')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', progress.id);
    
    console.log(`[Workflow] Completed workflow for progress ${progress.id}`);
  }
}

function replaceDynamicVariables(template: string, lead: any): string {
  if (!template) return '';
  
  const variables: Record<string, string> = {
    '{{first_name}}': lead?.first_name || '',
    '{{last_name}}': lead?.last_name || '',
    '{{full_name}}': `${lead?.first_name || ''} ${lead?.last_name || ''}`.trim() || 'there',
    '{{phone}}': lead?.phone_number || '',
    '{{email}}': lead?.email || '',
    '{{company}}': lead?.company || '',
    '{{city}}': lead?.city || '',
    '{{state}}': lead?.state || '',
  };

  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(key, 'gi'), value);
  }
  
  return result;
}
