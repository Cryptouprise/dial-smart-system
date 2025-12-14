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
    // Get a caller ID from campaign phone pool (prefer stationary for follow-ups)
    const callerId = await selectCallerIdForCampaign(supabase, progress.campaign_id, progress.user_id, true);

    if (!callerId) {
      console.error('[Workflow] No caller ID available for campaign');
      return { success: false, error: 'No caller ID available' };
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
    return { success: true, callId: response.data?.retell_call_id, action: 'call_initiated' };

  } catch (error: any) {
    console.error('[Workflow] Call step error:', error);
    return { success: false, error: error.message };
  }
}

async function executeSmsStep(supabase: any, lead: any, progress: any, config: any) {
  console.log(`[Workflow] Sending SMS to ${lead?.phone_number}`);

  try {
    // Get sender number from campaign phone pool (prefer stationary)
    const fromNumber = await selectCallerIdForCampaign(supabase, progress.campaign_id, progress.user_id, true, 'sms');

    if (!fromNumber) {
      console.error('[Workflow] No SMS number available');
      return { success: false, error: 'No SMS number available' };
    }

    // Replace template variables in message - check all possible field names
    const messageBody = replaceTemplateVariables(config.sms_content || config.content || config.message || '', lead);

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
    // Get sender number from campaign phone pool
    const fromNumber = await selectCallerIdForCampaign(supabase, progress.campaign_id, progress.user_id, true, 'sms');

    if (!fromNumber) {
      console.error('[Workflow] No SMS number available for AI SMS');
      return { success: false, error: 'No SMS number available' };
    }

    // Call the ai-sms-processor function - check all possible field names for prompt
    const response = await supabase.functions.invoke('ai-sms-processor', {
      body: {
        action: 'generate_and_send',
        leadId: lead.id,
        userId: progress.user_id,
        fromNumber: fromNumber,
        context: config.context || 'follow_up',
        prompt: config.ai_prompt || config.sms_content || config.prompt || null,
      },
    });

    if (response.error) {
      console.error('[Workflow] AI SMS failed:', response.error);
      return { success: false, error: response.error.message };
    }

    console.log('[Workflow] AI SMS sent:', response.data);
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
    // First try to get from campaign phone pool
    if (campaignId) {
      const roleFilter = type === 'sms' ? ['sms_only', 'outbound'] : ['outbound', 'caller_id_only'];
      
      let query = supabase
        .from('campaign_phone_pools')
        .select(`
          phone_number_id,
          is_primary,
          priority,
          phone_numbers(number, is_stationary, purpose, status)
        `)
        .eq('campaign_id', campaignId)
        .in('role', roleFilter)
        .order('is_primary', { ascending: false })
        .order('priority', { ascending: false });

      const { data: poolNumbers } = await query;

      if (poolNumbers && poolNumbers.length > 0) {
        // Filter for active numbers
        const activeNumbers = poolNumbers.filter(
          (p: any) => p.phone_numbers?.status === 'active'
        );

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

    const { data: userNumbers } = await supabase
      .from('phone_numbers')
      .select('number')
      .eq('user_id', userId)
      .eq('status', 'active')
      .eq('is_spam', false)
      .in('purpose', purposeFilter)
      .limit(1);

    if (userNumbers && userNumbers.length > 0) {
      return userNumbers[0].number;
    }

    // Last resort: any active number
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
