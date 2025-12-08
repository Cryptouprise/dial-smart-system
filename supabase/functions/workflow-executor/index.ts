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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, userId, leadId, workflowId, campaignId } = await req.json();

    if (action === 'start_workflow') {
      // Start a lead on a workflow
      const { data: workflow, error: workflowError } = await supabase
        .from('campaign_workflows')
        .select('*, workflow_steps(*)')
        .eq('id', workflowId)
        .single();

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
        .single();

      if (progressError) throw progressError;

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

      const results = [];
      
      for (const progress of pendingProgress || []) {
        try {
          const result = await executeStep(supabase, progress);
          results.push({ leadId: progress.lead_id, success: true, result });
        } catch (stepError) {
          console.error('Error executing step for lead:', progress.lead_id, stepError);
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

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error('Unknown action');
  } catch (error) {
    console.error('Error in workflow-executor:', error);
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
  const config = step?.step_config || {};

  console.log(`Executing step ${step?.step_type} for lead ${lead?.id}`);

  // Update last action timestamp
  await supabase
    .from('lead_workflow_progress')
    .update({ last_action_at: new Date().toISOString() })
    .eq('id', progress.id);

  switch (step?.step_type) {
    case 'call':
      // Trigger a call via the outbound-calling function
      console.log(`Would initiate call to ${lead?.phone_number}`);
      // In production, call the outbound-calling edge function
      break;

    case 'sms':
      // Send SMS via the sms-messaging function
      console.log(`Would send SMS to ${lead?.phone_number}: ${config.content}`);
      // In production, call the sms-messaging edge function
      break;

    case 'ai_sms':
      // Generate and send AI SMS
      console.log(`Would send AI SMS to ${lead?.phone_number}`);
      // In production, call the ai-sms-processor edge function
      break;

    case 'wait':
      // Wait step completed, just move to next
      break;
  }

  // Move to next step
  const { data: allSteps } = await supabase
    .from('workflow_steps')
    .select('*')
    .eq('workflow_id', progress.workflow_id)
    .order('step_number', { ascending: true });

  const currentIndex = allSteps?.findIndex((s: any) => s.id === step?.id) ?? -1;
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
  }

  return { stepType: step?.step_type, completed: true };
}
