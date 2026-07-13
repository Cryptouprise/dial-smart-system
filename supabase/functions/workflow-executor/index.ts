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
import {
  assertSuccessfulFunctionResult,
  buildAiSmsRequest,
  buildOutboundCallRequest,
  buildSmsRequest,
} from '../_shared/action-contracts.ts';
import {
  buildWorkflowEffectIdentity,
  manualReconciliationResult,
  unrelatedLeadCallDeferral,
  validateWorkflowEffectResolution,
  type WorkflowExternalEffectType,
} from './effect-ledger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function assertDbSuccess(response: { error?: { message?: string } | null }, operation: string) {
  if (response.error) throw new Error(`${operation}: ${response.error.message || 'database operation failed'}`);
}

function assertInvokeSuccess(functionName: string, response: { data?: unknown; error?: { message?: string } | null }) {
  if (response.error) throw new Error(`${functionName} failed: ${response.error.message || 'invoke failed'}`);
  assertSuccessfulFunctionResult(functionName, true, response.data);
}

type WorkflowEffectClaim = {
  effectId: string;
  claimed: boolean;
  status: string;
  effectType: WorkflowExternalEffectType;
};

function providerReference(value: any): string | null {
  const candidate = value?.call_id || value?.callId || value?.message_id ||
    value?.messageId || value?.provider_call_id || value?.provider_message_id || value?.id;
  return candidate == null ? null : String(candidate);
}

function responseMetadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { result: value ?? null };
}

async function claimWorkflowExternalEffect(
  supabase: any,
  progress: any,
  effectType: WorkflowExternalEffectType,
): Promise<WorkflowEffectClaim> {
  const identity = buildWorkflowEffectIdentity(progress, effectType);
  const claimResult = await supabase.rpc('claim_workflow_external_effect', {
    p_user_id: progress.user_id,
    p_workflow_progress_id: identity.progressId,
    p_workflow_id: identity.workflowId,
    p_workflow_step_id: identity.stepId,
    p_lead_id: identity.leadId,
    p_campaign_id: identity.campaignId,
    p_loop_iteration: identity.loopIteration,
    p_execution_generation: identity.executionGeneration,
    p_effect_type: identity.effectType,
  });
  assertDbSuccess(claimResult, `claim ${effectType} workflow effect`);
  const row = Array.isArray(claimResult.data) ? claimResult.data[0] : claimResult.data;
  if (!row?.effect_id || typeof row.claimed !== 'boolean' || !row.effect_status) {
    throw new Error(`claim ${effectType} workflow effect returned an invalid result`);
  }
  return {
    effectId: String(row.effect_id),
    claimed: row.claimed,
    status: String(row.effect_status),
    effectType,
  };
}

async function findWorkflowExternalEffect(
  supabase: any,
  progress: any,
  effectType: WorkflowExternalEffectType,
): Promise<WorkflowEffectClaim | null> {
  const identity = buildWorkflowEffectIdentity(progress, effectType);
  const existingResult = await supabase.from('workflow_external_effects')
    .select('id, status')
    .eq('workflow_progress_id', identity.progressId)
    .eq('workflow_step_id', identity.stepId)
    .eq('loop_iteration', identity.loopIteration)
    .eq('execution_generation', identity.executionGeneration)
    .eq('effect_type', effectType)
    .maybeSingle();
  assertDbSuccess(existingResult, `load existing ${effectType} workflow effect`);
  if (!existingResult.data) return null;
  return {
    effectId: String(existingResult.data.id),
    claimed: false,
    status: String(existingResult.data.status),
    effectType,
  };
}

async function transitionWorkflowExternalEffect(
  supabase: any,
  claim: WorkflowEffectClaim,
  targetStatus: 'accepted' | 'completed' | 'reconciliation_required',
  options: {
    result?: unknown;
    providerReference?: string | null;
    failureReason?: string | null;
  } = {},
) {
  const transitionResult = await supabase.rpc('transition_workflow_external_effect', {
    p_effect_id: claim.effectId,
    p_target_status: targetStatus,
    p_provider_reference: options.providerReference || null,
    p_response_metadata: options.result === undefined ? null : responseMetadata(options.result),
    p_failure_reason: options.failureReason || null,
  });
  assertDbSuccess(transitionResult, `mark ${claim.effectType} workflow effect ${targetStatus}`);
  if (transitionResult.data !== true) {
    throw new Error(`Workflow effect ${claim.effectId} refused transition to ${targetStatus}`);
  }
  claim.status = targetStatus;
}

async function reconcileAmbiguousWorkflowEffect(
  supabase: any,
  claim: WorkflowEffectClaim,
  reason: string,
  result?: unknown,
) {
  try {
    await transitionWorkflowExternalEffect(supabase, claim, 'reconciliation_required', {
      result,
      providerReference: providerReference(result),
      failureReason: reason,
    });
  } catch (transitionError: any) {
    // A processing or accepted row is itself fail-closed. Never hide the fact
    // that recording the more specific reconciliation state also failed.
    console.error(`[Workflow] Could not mark effect ${claim.effectId} for reconciliation:`, transitionError);
    reason = `${reason}; ledger transition also failed: ${transitionError.message}`;
  }
  return manualReconciliationResult(claim.effectId, claim.effectType, claim.status, reason);
}

function duplicateEffectResult(claim: WorkflowEffectClaim) {
  return manualReconciliationResult(
    claim.effectId,
    claim.effectType,
    claim.status,
    `External effect already has durable status "${claim.status}". It was not initiated again.`,
  );
}

async function resolveWorkflowNumber(
  supabase: any,
  progress: any,
  requestedNumber?: string | null,
  provider?: string | null,
): Promise<string> {
  if (requestedNumber) {
    const requestedResult = await supabase.from('phone_numbers')
      .select('number, provider, status')
      .eq('number', requestedNumber)
      .eq('user_id', progress.user_id)
      .eq('status', 'active')
      .maybeSingle();
    assertDbSuccess(requestedResult, 'validate workflow number');
    if (!requestedResult.data) throw new Error('workflow number is inactive or not owned by workflow user');
    if (provider && requestedResult.data.provider && requestedResult.data.provider !== provider) {
      throw new Error(`workflow number provider does not match ${provider}`);
    }
    return requestedResult.data.number;
  }

  if (!progress.campaign_id) throw new Error('campaign_id is required to resolve a workflow number');
  const poolResult = await supabase.from('campaign_phone_pools')
    .select('priority, is_primary, phone_numbers!inner(number, provider, status)')
    .eq('campaign_id', progress.campaign_id)
    .eq('user_id', progress.user_id)
    .eq('role', 'outbound')
    .order('is_primary', { ascending: false })
    .order('priority', { ascending: true });
  assertDbSuccess(poolResult, 'resolve workflow campaign number');
  const candidates = (poolResult.data || [])
    .map((row: any) => row.phone_numbers)
    .filter((number: any) => number?.status === 'active');
  const selected = candidates.find((number: any) => !provider || !number.provider || number.provider === provider);
  if (!selected?.number) throw new Error(`No active ${provider || ''} outbound number in campaign pool`.trim());
  return selected.number;
}

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

    const requestBody = await req.json();
    const {
      action,
      userId: requestedUserId,
      leadId,
      workflowId,
      campaignId,
      effectId,
      decision,
      resolvedByUserId,
      resolutionNotes,
    } = requestBody;
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.slice('Bearer '.length);
    const isServiceCall = token === supabaseServiceKey;
    let authenticatedUserId: string | null = null;
    if (!isServiceCall) {
      const authResult = await supabase.auth.getUser(token);
      if (authResult.error || !authResult.data.user) {
        return new Response(JSON.stringify({ success: false, error: 'Authentication failed' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      authenticatedUserId = authResult.data.user.id;
      if (requestedUserId && requestedUserId !== authenticatedUserId) {
        return new Response(JSON.stringify({ success: false, error: 'userId does not match authenticated user' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }
    const userId = isServiceCall ? (requestedUserId || null) : authenticatedUserId;
    if (!userId && !['health_check', 'execute_pending'].includes(action)) {
      return new Response(JSON.stringify({ success: false, error: 'userId is required for internal workflow actions' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle health_check action for system verification
    if (action === 'health_check') {
      console.log('[Workflow Executor] Health check requested');
      return new Response(JSON.stringify({
        success: true,
        healthy: true,
        timestamp: new Date().toISOString(),
        function: 'workflow-executor',
        capabilities: ['start_workflow', 'execute_pending', 'remove_from_workflow', 'pause_workflow', 'resume_workflow', 'resolve_external_effect'],
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'resolve_external_effect') {
      if (!isServiceCall) {
        return new Response(JSON.stringify({ success: false, error: 'External effect resolution requires a service-role caller' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!userId || !effectId || !resolvedByUserId) {
        return new Response(JSON.stringify({
          success: false,
          error: 'userId, effectId, and resolvedByUserId are required',
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      let validatedResolution;
      try {
        validatedResolution = validateWorkflowEffectResolution(decision, resolutionNotes);
      } catch (validationError: any) {
        return new Response(JSON.stringify({ success: false, error: validationError.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const resolutionResult = await supabase.rpc('resolve_workflow_external_effect', {
        p_effect_id: effectId,
        p_decision: validatedResolution.decision,
        p_expected_user_id: userId,
        p_resolved_by: resolvedByUserId,
        p_resolution_notes: validatedResolution.notes,
      });
      assertDbSuccess(resolutionResult, 'resolve workflow external effect');
      const resolution = Array.isArray(resolutionResult.data) ? resolutionResult.data[0] : resolutionResult.data;
      if (!resolution?.effect_id) throw new Error('External effect resolution returned no result');
      return new Response(JSON.stringify({ success: true, resolution }), {
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
        .eq('user_id', userId)
        .in('status', ['active', 'paused'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (checkError) {
        throw new Error(`Failed to check existing workflow enrollment: ${checkError.message}`);
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
      const { data: leadData, error: leadDataError } = await supabase
        .from('leads')
        .select('phone_number')
        .eq('id', leadId)
        .eq('user_id', userId)
        .maybeSingle();
      if (leadDataError) throw new Error(`Failed to validate workflow lead: ${leadDataError.message}`);
      if (!leadData) throw new Error('Workflow lead not found or not owned by user');
      
      if (leadData?.phone_number) {
        const normalizedPhone = leadData.phone_number.replace(/\D/g, '').slice(-10);
        
        // Check if any lead with this phone number is already in workflow
        const { data: phoneMatch, error: phoneMatchError } = await supabase
          .from('lead_workflow_progress')
          .select('id, lead_id, status, leads!inner(phone_number)')
          .eq('workflow_id', workflowId)
          .eq('user_id', userId)
          .in('status', ['active', 'paused'])
          .limit(10);
        if (phoneMatchError) throw new Error(`Failed to check duplicate workflow phone: ${phoneMatchError.message}`);
        
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
        .eq('user_id', userId)
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
        .eq('user_id', userId)
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
        const { data: campaignData, error: campaignError } = await supabase
          .from('campaigns')
          .select('agent_id, sms_from_number')
          .eq('id', campaignId)
          .eq('user_id', userId)
          .maybeSingle();
        if (campaignError) throw new Error(`Failed to validate workflow campaign: ${campaignError.message}`);
        if (!campaignData) validationErrors.push('Campaign not found or not owned by user');
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
          if (!campaignId) {
            validationErrors.push(`Step ${step.step_number} (call): Campaign ID is required for ownership, provider, and caller-number resolution.`);
          }
          if (!campaign?.agent_id && !config.agent_id) {
            validationErrors.push(`Step ${step.step_number} (call): No AI agent configured. ${!campaignId ? 'Campaign ID is required for call steps, or configure agent_id in step config.' : 'Configure agent_id in campaign or step.'}`);
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
          external_effect_generation: crypto.randomUUID(),
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
      
      let pendingQuery = supabase
        .from('lead_workflow_progress')
        .select(`
          *,
          leads(*),
          campaign_workflows(*),
          workflow_steps!lead_workflow_progress_current_step_id_fkey(*)
        `)
        .eq('status', 'active')
        .lte('next_action_at', now);
      if (userId) pendingQuery = pendingQuery.eq('user_id', userId);
      const { data: pendingProgress, error: pendingError } = await pendingQuery.limit(100);

      if (pendingError) throw pendingError;

      console.log(`[Workflow] Found ${pendingProgress?.length || 0} pending steps to execute`);

      const BATCH_SIZE = 10;
      const startTime = Date.now();
      const results: Array<{ leadId: string; success: boolean; result?: any; error?: string; skipped?: boolean }> = [];
      const allPending = pendingProgress || [];

      for (let i = 0; i < allPending.length; i += BATCH_SIZE) {
        // Safety timeout: stop if approaching Deno function limit
        if (Date.now() - startTime > 25000) {
          console.warn(`[Workflow] Approaching timeout, processed ${results.length}/${allPending.length} leads`);
          break;
        }

        const batch = allPending.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (progress) => {
            try {
              // Progress rows are user-writable through RLS, so their foreign
              // keys are not an authorization boundary. Re-bind every joined
              // resource to the same owner/workflow before using service-role
              // privileges or executing an external side effect.
              if (!progress.leads || progress.leads.user_id !== progress.user_id) {
                throw new Error('Workflow progress lead is missing or belongs to another user');
              }
              if (!progress.campaign_workflows || progress.campaign_workflows.user_id !== progress.user_id) {
                throw new Error('Workflow progress definition is missing or belongs to another user');
              }
              if (progress.campaign_workflows.id !== progress.workflow_id) {
                throw new Error('Workflow progress definition does not match workflow_id');
              }
              if (!progress.workflow_steps || progress.workflow_steps.workflow_id !== progress.workflow_id) {
                throw new Error('Workflow progress step does not belong to the selected workflow');
              }
              if (progress.workflow_steps.id !== progress.current_step_id) {
                throw new Error('Workflow progress step does not match current_step_id');
              }

              if (progress.campaign_id) {
                const campaignOwnership = await supabase.from('campaigns')
                  .select('id, workflow_id')
                  .eq('id', progress.campaign_id)
                  .eq('user_id', progress.user_id)
                  .maybeSingle();
                assertDbSuccess(campaignOwnership, 'validate pending workflow campaign ownership');
                if (!campaignOwnership.data || campaignOwnership.data.workflow_id !== progress.workflow_id) {
                  throw new Error('Workflow progress campaign is missing, foreign, or bound to another workflow');
                }
              }

              // Check if lead is engaged or sequence is paused
              const nudgeResult = await supabase
                .from('lead_nudge_tracking')
                .select('is_engaged, sequence_paused')
                .eq('lead_id', progress.lead_id)
                .maybeSingle();
              assertDbSuccess(nudgeResult, 'load workflow nudge status');
              const nudgeStatus = nudgeResult.data;

              if (nudgeStatus?.sequence_paused) {
                console.log(`[Workflow] Skipping lead ${progress.lead_id} - sequence paused`);
                return { leadId: progress.lead_id, success: true, skipped: true };
              }

              // Compare-and-set lease: overlapping scheduler invocations may
              // select the same due row, but only one may execute its external
              // action. A crashed worker releases naturally when the lease is due.
              const leaseResult = await supabase.from('lead_workflow_progress')
                .update({
                  next_action_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
                  updated_at: new Date().toISOString(),
                })
                .eq('id', progress.id)
                .eq('user_id', progress.user_id)
                .eq('status', 'active')
                .eq('current_step_id', progress.current_step_id)
                .eq('next_action_at', progress.next_action_at)
                .select('id')
                .maybeSingle();
              assertDbSuccess(leaseResult, 'claim pending workflow step');
              if (!leaseResult.data) {
                return {
                  leadId: progress.lead_id,
                  success: true,
                  skipped: true,
                  result: { action: 'already_claimed' },
                };
              }

              const result = await executeStep(supabase, progress);
              return {
                leadId: progress.lead_id,
                success: result?.success === true,
                result,
                ...(result?.success === false ? { error: result.error || 'Workflow step failed' } : {}),
              };
            } catch (err: any) {
              console.error(`[Workflow] Error processing progress ${progress.id}:`, err.message);
              return { leadId: progress.lead_id, success: false, error: err.message };
            }
          })
        );
        results.push(...batchResults);
      }

      const succeeded = results.filter(result => result.success && !result.skipped).length;
      const failed = results.filter(result => !result.success).length;
      const skipped = results.filter(result => result.skipped).length;
      return new Response(JSON.stringify({
        success: failed === 0,
        processed: results.length,
        total: allPending.length,
        succeeded,
        failed,
        skipped,
        results,
      }), {
        status: failed > 0 ? 207 : 200,
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
        .eq('user_id', userId)
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
      const pauseResult = await supabase
        .from('lead_workflow_progress')
        .update({ status: 'paused', updated_at: new Date().toISOString() })
        .eq('lead_id', leadId)
        .eq('user_id', userId)
        .eq('workflow_id', workflowId);
      assertDbSuccess(pauseResult, 'pause workflow');

      // Also update nudge tracking
      const pauseNudgeResult = await supabase
        .from('lead_nudge_tracking')
        .update({ sequence_paused: true, pause_reason: 'manual_pause' })
        .eq('lead_id', leadId)
        .eq('user_id', userId);
      assertDbSuccess(pauseNudgeResult, 'pause workflow nudge tracking');

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'resume_workflow') {
      const pausedProgressResult = await supabase
        .from('lead_workflow_progress')
        .select('id, current_step_id, external_effect_generation')
        .eq('lead_id', leadId)
        .eq('user_id', userId)
        .eq('workflow_id', workflowId)
        .eq('status', 'paused')
        .maybeSingle();
      assertDbSuccess(pausedProgressResult, 'load paused workflow before resume');
      if (!pausedProgressResult.data) {
        return new Response(JSON.stringify({ success: false, error: 'Paused workflow progress not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!pausedProgressResult.data.current_step_id || !pausedProgressResult.data.external_effect_generation) {
        return new Response(JSON.stringify({ success: false, error: 'Paused workflow has no resumable step generation' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const unresolvedResult = await supabase.from('workflow_external_effects')
        .select('id, status, effect_type')
        .eq('workflow_progress_id', pausedProgressResult.data.id)
        .eq('workflow_step_id', pausedProgressResult.data.current_step_id)
        .eq('execution_generation', pausedProgressResult.data.external_effect_generation)
        .is('resolution_decision', null)
        .in('status', ['processing', 'accepted', 'completed', 'reconciliation_required'])
        .limit(1)
        .maybeSingle();
      assertDbSuccess(unresolvedResult, 'check unresolved workflow effect before resume');
      if (unresolvedResult.data) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Workflow has an unresolved external effect; use resolve_external_effect before resuming',
          effect: unresolvedResult.data,
        }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const resumeResult = await supabase
        .from('lead_workflow_progress')
        .update({ 
          status: 'active', 
          next_action_at: new Date().toISOString(), // Resume immediately
          updated_at: new Date().toISOString() 
        })
        .eq('lead_id', leadId)
        .eq('user_id', userId)
        .eq('workflow_id', workflowId)
        .eq('status', 'paused')
        .eq('external_effect_generation', pausedProgressResult.data.external_effect_generation)
        .select('id')
        .maybeSingle();
      assertDbSuccess(resumeResult, 'resume workflow');
      if (!resumeResult.data) {
        return new Response(JSON.stringify({ success: false, error: 'Workflow changed while resume was being validated' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Also update nudge tracking
      const resumeNudgeResult = await supabase
        .from('lead_nudge_tracking')
        .update({ sequence_paused: false, pause_reason: null })
        .eq('lead_id', leadId)
        .eq('user_id', userId);
      assertDbSuccess(resumeNudgeResult, 'resume workflow nudge tracking');

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
    
    const nextTime = new Date(now.getTime() + delayMs);

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

// ============= BRANCH / CONDITION HELPERS =============

function resolveFieldValue(context: Record<string, any>, field: string): any {
  // Support dot notation for nested fields (e.g. "custom_fields.budget")
  const parts = field.split('.');
  let value: any = context;
  for (const part of parts) {
    if (value == null) return undefined;
    value = value[part];
  }
  return value;
}

function evaluateCondition(fieldValue: any, operator: string, value: any): boolean {
  switch (operator) {
    case 'equals':
    case 'eq':
      return String(fieldValue) === String(value);

    case 'not_equals':
    case 'neq':
      return String(fieldValue) !== String(value);

    case 'greater_than':
    case 'gt': {
      const numField = Number(fieldValue);
      const numValue = Number(value);
      if (isNaN(numField) || isNaN(numValue)) {
        console.warn(`[Workflow] Non-numeric comparison: ${fieldValue} > ${value}`);
        return false;
      }
      return numField > numValue;
    }

    case 'less_than':
    case 'lt': {
      const numField = Number(fieldValue);
      const numValue = Number(value);
      if (isNaN(numField) || isNaN(numValue)) {
        console.warn(`[Workflow] Non-numeric comparison: ${fieldValue} < ${value}`);
        return false;
      }
      return numField < numValue;
    }

    case 'greater_than_or_equal':
    case 'gte': {
      const numField = Number(fieldValue);
      const numValue = Number(value);
      if (isNaN(numField) || isNaN(numValue)) {
        console.warn(`[Workflow] Non-numeric comparison: ${fieldValue} >= ${value}`);
        return false;
      }
      return numField >= numValue;
    }

    case 'less_than_or_equal':
    case 'lte': {
      const numField = Number(fieldValue);
      const numValue = Number(value);
      if (isNaN(numField) || isNaN(numValue)) {
        console.warn(`[Workflow] Non-numeric comparison: ${fieldValue} <= ${value}`);
        return false;
      }
      return numField <= numValue;
    }

    case 'contains':
      return String(fieldValue || '').toLowerCase().includes(String(value).toLowerCase());

    case 'not_contains':
      return !String(fieldValue || '').toLowerCase().includes(String(value).toLowerCase());

    case 'in': {
      const arr = Array.isArray(value) ? value : String(value).split(',').map((s: string) => s.trim());
      return arr.map(String).includes(String(fieldValue));
    }

    case 'not_in': {
      const arr2 = Array.isArray(value) ? value : String(value).split(',').map((s: string) => s.trim());
      return !arr2.map(String).includes(String(fieldValue));
    }

    case 'exists':
      return fieldValue != null && fieldValue !== '' && fieldValue !== false;

    case 'not_exists':
      return fieldValue == null || fieldValue === '' || fieldValue === false;

    case 'between': {
      // Support both array [min, max] and comma-separated string "min,max"
      let rangeValues: any[];
      if (Array.isArray(value)) {
        rangeValues = value;
      } else if (typeof value === 'string' && value.includes(',')) {
        rangeValues = value.split(',').map((v: string) => v.trim());
      } else {
        console.warn(`[Workflow] Invalid between value (expected array or "min,max"): ${value}`);
        return false;
      }
      const [min, max] = rangeValues;
      const num = Number(fieldValue);
      const numMin = Number(min);
      const numMax = Number(max);
      if (isNaN(num) || isNaN(numMin) || isNaN(numMax)) {
        console.warn(`[Workflow] Non-numeric between comparison: ${fieldValue} between ${min} and ${max}`);
        return false;
      }
      return num >= numMin && num <= numMax;
    }

    default:
      console.warn(`[Workflow] Unknown condition operator: ${operator}`);
      return false;
  }
}

async function getLeadContext(supabase: any, lead: any, progress: any): Promise<Record<string, any>> {
  const context: Record<string, any> = { ...(lead || {}) };

  // Spread custom_fields to top-level for easy dot-notation access
  if (lead?.custom_fields && typeof lead.custom_fields === 'object') {
    context.custom_fields = lead.custom_fields;
  }

  // Single batched fetch: 3 parallel queries instead of 5 sequential ones
  let callResult: any = { data: null }, smsResult: any = { data: [] }, journeyResult: any = { data: null };
  try {
    [callResult, smsResult, journeyResult] = await Promise.all([
    supabase
      .from('call_logs')
      .select('outcome, disposition, duration_seconds, sentiment_score, created_at')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('sms_messages')
      .select('id, direction, body, created_at')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false })
      .limit(3),
    supabase
      .from('lead_journey_state')
      .select('current_stage, interest_level, engagement_score, sentiment_trend, total_calls, sms_sent, last_touch_at')
      .eq('lead_id', lead.id)
      .maybeSingle()
    ]);
  } catch (e: any) {
    console.warn(`[Workflow] getLeadContext queries failed for lead ${lead?.id}: ${e.message}`);
    // Continue with defaults — context enrichment is non-critical
  }

  // Process last call data
  const lastCall = callResult.data;
  if (lastCall) {
    context.last_outcome = lastCall.outcome;
    context.disposition = lastCall.disposition;
    context.last_call_duration = lastCall.duration_seconds;
    context.sentiment_score = lastCall.sentiment_score;
    context.last_call_at = lastCall.created_at;
  }

  // Derive counts and SMS context from the single sms query
  const smsMessages = smsResult.data || [];
  const callCount = journeyResult.data?.total_calls || (lastCall ? 1 : 0);
  const smsCount = journeyResult.data?.sms_sent || smsMessages.length;
  context.call_count = callCount;
  context.sms_count = smsCount;
  context.total_touches = callCount + smsCount;

  // Days since last touch - derived from already-fetched data
  const lastTouchDates: string[] = [];
  if (lastCall?.created_at) lastTouchDates.push(lastCall.created_at);
  if (smsMessages.length > 0 && smsMessages[0]?.created_at) {
    lastTouchDates.push(smsMessages[0].created_at);
  }

  if (lastTouchDates.length > 0) {
    const mostRecent = new Date(lastTouchDates.sort().reverse()[0]);
    context.days_since_touch = Math.floor((Date.now() - mostRecent.getTime()) / (1000 * 60 * 60 * 24));
  } else {
    context.days_since_touch = 9999;
  }

  // Last inbound SMS content - derived from already-fetched SMS data
  const lastInboundSms = smsMessages.find((m: any) => m.direction === 'inbound');
  context.sms_reply_contains = lastInboundSms?.body || '';

  // Journey state
  const journeyState = journeyResult.data;
  if (journeyState) {
    context.journey_stage = journeyState.current_stage;
    context.interest_level = journeyState.interest_level;
    context.engagement_score = journeyState.engagement_score;
    context.sentiment_trend = journeyState.sentiment_trend;
  }

  // Tags as a flat value for 'contains' checks
  context.tags = lead?.tags || [];

  return context;
}

async function evaluateBranchConditions(
  supabase: any, lead: any, progress: any, conditions: any[]
): Promise<boolean> {
  if (!conditions || conditions.length === 0) return true;

  // Get enriched lead context
  const context = await getLeadContext(supabase, lead, progress);

  // ALL conditions must be true (AND logic)
  for (const condition of conditions) {
    const { field, operator, value } = condition;
    const fieldValue = resolveFieldValue(context, field);

    if (!evaluateCondition(fieldValue, operator, value)) {
      return false;
    }
  }
  return true;
}

async function jumpToStep(supabase: any, progress: any, currentStep: any, targetStepNumber: number) {
  // Validate input
  if (targetStepNumber == null || targetStepNumber < 1 || !Number.isInteger(targetStepNumber)) {
    throw new Error(`Invalid workflow branch target: ${targetStepNumber}`);
  }

  const { data: targetStep, error: jumpError } = await supabase
    .from('workflow_steps')
    .select('id, step_type, step_config')
    .eq('workflow_id', currentStep.workflow_id || progress.workflow_id)
    .eq('step_number', targetStepNumber)
    .maybeSingle();
  if (jumpError) throw new Error(`Load workflow branch target: ${jumpError.message}`);

  if (targetStep) {
    const nextActionAt = calculateNextActionTime(targetStep);
    const jumpResult = await supabase
      .from('lead_workflow_progress')
      .update({
        current_step_id: targetStep.id,
        next_action_at: nextActionAt,
        external_effect_generation: crypto.randomUUID(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', progress.id);
    assertDbSuccess(jumpResult, 'update workflow branch target');

    console.log(`[Workflow] Jumped to step ${targetStepNumber} (id: ${targetStep.id}) for progress ${progress.id}`);
  } else {
    throw new Error(`Workflow branch target step ${targetStepNumber} not found in workflow ${currentStep.workflow_id || progress.workflow_id}`);
  }
}

async function pauseForWorkflowEffectReconciliation(
  supabase: any,
  progress: any,
  result: any,
) {
  const previousMetadata = progress.metadata && typeof progress.metadata === 'object' ? progress.metadata : {};
  const pauseResult = await supabase.from('lead_workflow_progress').update({
    status: 'paused',
    next_action_at: null,
    metadata: {
      ...previousMetadata,
      manual_reconciliation_required: true,
      reconciliation_effect_id: result.effect_id || null,
      reconciliation_effect_status: result.effect_status || null,
      reconciliation_step_id: progress.current_step_id,
      reconciliation_reason: result.error || 'Ambiguous external workflow effect',
      reconciliation_required_at: new Date().toISOString(),
      recovery: result.recovery,
    },
    updated_at: new Date().toISOString(),
  })
    .eq('id', progress.id)
    .eq('user_id', progress.user_id);
  assertDbSuccess(pauseResult, 'pause workflow for external effect reconciliation');
}

// ============= END BRANCH / CONDITION HELPERS =============

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
      .eq('user_id', progress.user_id)
      .maybeSingle();

    if (campaignRowError) {
      throw new Error(`Campaign lookup failed: ${campaignRowError.message}`);
    } else {
      const workflowDisabledOrChanged =
        !campaignRow ||
        campaignRow.status !== 'active' ||
        !campaignRow.workflow_id ||
        campaignRow.workflow_id !== progress.workflow_id;

      if (workflowDisabledOrChanged) {
        console.log(`[Workflow] Pausing workflow progress ${progress.id} - campaign workflow disabled/changed`);
        const pauseResult = await supabase
          .from('lead_workflow_progress')
          .update({ status: 'paused', updated_at: new Date().toISOString() })
          .eq('id', progress.id);
        assertDbSuccess(pauseResult, 'pause changed campaign workflow');

        return { success: true, action: 'paused_due_to_campaign_workflow_change' };
      }
    }
  }

  console.log(`[Workflow] Executing step ${step?.step_type} for lead ${lead?.id}`);

  // Update last action timestamp
  const actionTimestampResult = await supabase
    .from('lead_workflow_progress')
    .update({ last_action_at: new Date().toISOString() })
    .eq('id', progress.id);
  assertDbSuccess(actionTimestampResult, 'record workflow action attempt');

  let stepResult: any = { success: true };

  // Validate step exists and has a valid type
  if (!step || !step.step_type) {
    console.error(`[Workflow] Invalid step - missing step data or step_type for lead ${lead?.id}`);
    return { success: false, completed: false, error: 'Invalid step configuration', action: 'invalid_step' };
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
      stepResult = { success: false, action: 'email_not_implemented', error: 'Email workflow steps are not implemented' };
      break;

    case 'webhook':
      stepResult = await executeWebhookStep(supabase, lead, progress, config);
      break;

    case 'assistable_call':
      stepResult = await executeAssistableCallStep(supabase, lead, progress, config);
      break;

    case 'condition':
    case 'branch': {
      const conditions = step.branch_conditions || config.conditions || [];
      const evaluationResult = await evaluateBranchConditions(supabase, lead, progress, conditions);
      const targetStep = evaluationResult ? (step.true_branch_step || config.true_branch_step) : (step.false_branch_step || config.false_branch_step);

      console.log(`[Workflow] Branch for lead ${lead.id}: conditions=${JSON.stringify(conditions)}, result=${evaluationResult}, jumping to step ${targetStep || 'next'}`);

      if (targetStep) {
        // Update nudge tracking before jumping (matches post-switch behavior)
        try {
          const branchNudgeResult = await supabase.from('lead_nudge_tracking').upsert({
            lead_id: lead.id,
            user_id: progress.user_id,
            last_ai_contact_at: new Date().toISOString(),
            nudge_count: (progress.nudge_count || 0) + 1,
          }, { onConflict: 'lead_id' });
          if (branchNudgeResult.error) console.warn('[Workflow] Branch nudge tracking failed:', branchNudgeResult.error.message);
        } catch (e) { /* nudge tracking is non-critical */ }

        await jumpToStep(supabase, progress, step, targetStep);
        return { success: true, action: 'branch_taken', branch: evaluationResult ? 'true' : 'false', target_step: targetStep };
      }
      // No target specified, fall through to next step
      stepResult = { success: true, action: 'condition_evaluated', result: evaluationResult };
      break;
    }

    case 'tag':
    case 'update_status':
      if (config.new_status) {
        const statusResult = await supabase
          .from('leads')
          .update({ status: config.new_status, updated_at: new Date().toISOString() })
          .eq('id', lead.id)
          .eq('user_id', progress.user_id);
        assertDbSuccess(statusResult, 'update workflow lead status');
      }
      if (config.tags && Array.isArray(config.tags)) {
        const currentTags = lead.tags || [];
        const newTags = [...new Set([...currentTags, ...config.tags])];
        const tagResult = await supabase
          .from('leads')
          .update({ tags: newTags, updated_at: new Date().toISOString() })
          .eq('id', lead.id)
          .eq('user_id', progress.user_id);
        assertDbSuccess(tagResult, 'update workflow lead tags');
      }
      stepResult = { success: true, action: 'lead_updated' };
      break;

    case 'end':
    case 'stop': {
      const endResult = await supabase
        .from('lead_workflow_progress')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', progress.id);
      assertDbSuccess(endResult, 'complete explicit workflow end');
      console.log(`[Workflow] Explicit end for lead ${lead?.id}`);
      return { success: true, action: 'workflow_ended' };
    }

    default:
      console.error(`[Workflow] Unhandled step type "${step.step_type}" for lead ${lead?.id}`);
      stepResult = { success: false, action: 'unknown_step', error: `Unknown step type: ${step.step_type}` };
  }

  if (stepResult?.success !== true) {
    if (stepResult?.manual_reconciliation_required === true) {
      await pauseForWorkflowEffectReconciliation(supabase, progress, stepResult);
      return { stepType: step.step_type, completed: false, ...stepResult };
    }

    const previousMetadata = progress.metadata && typeof progress.metadata === 'object' ? progress.metadata : {};
    const failureCount = Number(previousMetadata.step_failure_count || 0) + 1;
    const retryMinutes = Math.max(1, Number(config.failure_retry_minutes || 5));
    const failureResult = await supabase.from('lead_workflow_progress').update({
      metadata: {
        ...previousMetadata,
        step_failure_count: failureCount,
        last_step_error: stepResult?.error || 'Unknown workflow step failure',
        last_failed_step_id: progress.current_step_id,
        last_failed_at: new Date().toISOString(),
      },
      next_action_at: new Date(Date.now() + retryMinutes * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', progress.id);
    assertDbSuccess(failureResult, 'record workflow step failure');
    return { stepType: step.step_type, completed: false, ...stepResult };
  }

  const effectClaim = stepResult?._effectClaim as WorkflowEffectClaim | undefined;
  if (stepResult && '_effectClaim' in stepResult) delete stepResult._effectClaim;

  try {
    // Update nudge tracking
    const existingNudgeResult = await supabase
      .from('lead_nudge_tracking')
      .select('nudge_count')
      .eq('lead_id', lead.id)
      .maybeSingle();
    assertDbSuccess(existingNudgeResult, 'load workflow nudge tracking');
    const existingNudge = existingNudgeResult.data;

    const nudgeUpsertResult = await supabase
      .from('lead_nudge_tracking')
      .upsert({
        lead_id: lead.id,
        user_id: progress.user_id,
        last_ai_contact_at: new Date().toISOString(),
        nudge_count: (existingNudge?.nudge_count || 0) + 1,
      }, {
        onConflict: 'lead_id',
      });
    assertDbSuccess(nudgeUpsertResult, 'update workflow nudge tracking');

    // Seal the effect before moving progress. If the worker crashes after this
    // transition, the unchanged step/generation finds the completed ledger and
    // pauses for audited resolution instead of initiating again or running the
    // next external step.
    if (effectClaim) {
      await transitionWorkflowExternalEffect(supabase, effectClaim, 'completed', {
        result: stepResult.data || stepResult,
        providerReference: providerReference(stepResult.data || stepResult),
      });
      stepResult.effect_status = effectClaim.status;
    }

    await moveToNextStep(supabase, progress, step);
  } catch (postEffectError: any) {
    if (!effectClaim) throw postEffectError;
    const reconciliation = await reconcileAmbiguousWorkflowEffect(
      supabase,
      effectClaim,
      `Provider accepted the effect, but workflow finalization failed: ${postEffectError.message}`,
      stepResult.data || stepResult,
    );
    await pauseForWorkflowEffectReconciliation(supabase, progress, reconciliation);
    return { ...reconciliation, stepType: step.step_type };
  }

  return { stepType: step?.step_type, completed: true, ...stepResult };
}

async function executeCallStep(supabase: any, lead: any, progress: any, config: any) {
  console.log(`[Workflow] Initiating call to ${lead?.phone_number} (step: ${progress.current_step_id})`);

  let effectClaim: WorkflowEffectClaim | null = null;
  try {
    const skipIfContacted = config.skip_if_contacted === true; // Optional: skip if ANY step already reached lead

    // A prior durable effect for this exact persisted generation is the only
    // authoritative evidence about this step. Never let a generic lead-level
    // call log satisfy and advance a workflow effect.
    const existingEffect = await findWorkflowExternalEffect(supabase, progress, 'call');
    if (existingEffect) return duplicateEffectResult(existingEffect);
    
    // Check recent call history for this lead to avoid duplicate calls
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const recentCallResult = await supabase
      .from('call_logs')
      .select('id, status, outcome, duration_seconds, created_at, campaign_id')
      .eq('lead_id', lead.id)
      .gte('created_at', fiveMinutesAgo)
      .order('created_at', { ascending: false });
    assertDbSuccess(recentCallResult, 'load recent workflow calls');
    const recentCalls = recentCallResult.data;

    // Check if there's an active/recent call that hasn't completed
    const pendingCall = recentCalls?.find((c: any) => 
      ['queued', 'ringing', 'initiated', 'in_progress'].includes(c.status)
    );

    if (pendingCall) {
      console.log(`[Workflow] Lead ${lead.id} has an unrelated pending call ${pendingCall.id}; deferring without advancing`);
      return unrelatedLeadCallDeferral('pending', pendingCall.id);
    }

    // FIXED: Only skip if skip_if_contacted is true AND a successful call exists
    // By default, multi-step workflows should continue calling regardless of previous outcomes
    if (skipIfContacted) {
      const recentSuccess = recentCalls?.find((c: any) => 
        c.outcome && ['connected', 'answered', 'appointment_set', 'callback_requested'].includes(c.outcome)
      );

      if (recentSuccess) {
        console.log(`[Workflow] Lead ${lead.id} was recently contacted by unrelated call ${recentSuccess.id}; deferring without advancing`);
        return unrelatedLeadCallDeferral('recent_contact', recentSuccess.id);
      }
    } else {
      console.log(`[Workflow] Multi-step workflow - proceeding with call regardless of previous contact status`);
    }

    if (!progress.campaign_id) throw new Error('Workflow call step requires campaign_id');
    const campaignResult = await supabase.from('campaigns')
      .select('id, status, user_id, agent_id, provider, telnyx_assistant_id')
      .eq('id', progress.campaign_id)
      .eq('user_id', progress.user_id)
      .eq('status', 'active')
      .maybeSingle();
    assertDbSuccess(campaignResult, 'load workflow call campaign');
    if (!campaignResult.data) throw new Error('Active workflow campaign not found or not owned by workflow user');
    const campaign = campaignResult.data;
    let provider = config.provider || campaign.provider || 'retell';
    if (provider === 'both') provider = campaign.agent_id ? 'retell' : 'telnyx';
    if (!['retell', 'telnyx'].includes(provider)) {
      throw new Error(`Call step does not support provider ${provider}; use the provider-specific workflow step`);
    }
    const callerId = await resolveWorkflowNumber(
      supabase,
      progress,
      config.caller_id || config.from_number,
      provider,
    );

    effectClaim = await claimWorkflowExternalEffect(supabase, progress, 'call');
    if (!effectClaim.claimed) return duplicateEffectResult(effectClaim);

    // Trigger outbound call using the exact service contract.
    const callResponse = await supabase.functions.invoke('outbound-calling', {
      body: buildOutboundCallRequest({
        leadId: lead.id,
        campaignId: progress.campaign_id,
        userId: progress.user_id,
        phoneNumber: lead.phone_number,
        callerId,
        provider,
        agentId: config.agent_id || campaign.agent_id,
        telnyxAssistantId: config.telnyx_assistant_id || campaign.telnyx_assistant_id,
        idempotencyKey: `workflow-effect:${effectClaim.effectId}`,
      }),
    });

    assertInvokeSuccess('outbound-calling', callResponse);
    await transitionWorkflowExternalEffect(supabase, effectClaim, 'accepted', {
      result: callResponse.data,
      providerReference: providerReference(callResponse.data),
    });

    console.log(`[Workflow] Call initiated for lead ${lead.id}:`, callResponse.data);
    return {
      success: true,
      action: 'call_initiated',
      data: callResponse.data,
      effect_id: effectClaim.effectId,
      effect_status: effectClaim.status,
      _effectClaim: effectClaim,
    };

  } catch (error: any) {
    console.error(`[Workflow] Call step error for lead ${lead.id}:`, error);
    if (effectClaim?.claimed) {
      return await reconcileAmbiguousWorkflowEffect(supabase, effectClaim, error.message);
    }
    return { success: false, action: 'call_failed', error: error.message };
  }
}

async function executeSmsStep(supabase: any, lead: any, progress: any, config: any) {
  console.log(`[Workflow] Sending SMS to ${lead?.phone_number}`);

  let effectClaim: WorkflowEffectClaim | null = null;
  try {
    const message = config.sms_content || config.content || config.message;
    if (!message) {
      throw new Error('No SMS content configured');
    }

    let campaignSmsNumber: string | null = null;
    if (progress.campaign_id) {
      const campaignResult = await supabase.from('campaigns')
        .select('sms_from_number')
        .eq('id', progress.campaign_id)
        .eq('user_id', progress.user_id)
        .maybeSingle();
      assertDbSuccess(campaignResult, 'load workflow SMS campaign');
      campaignSmsNumber = campaignResult.data?.sms_from_number || null;
    }
    const fromNumber = await resolveWorkflowNumber(
      supabase,
      progress,
      config.from_number || campaignSmsNumber,
    );

    // Replace dynamic variables in message
    const personalizedMessage = replaceDynamicVariables(message, lead);

    effectClaim = await claimWorkflowExternalEffect(supabase, progress, 'sms');
    if (!effectClaim.claimed) return duplicateEffectResult(effectClaim);

    // Send via sms-messaging function
    const smsResponse = await supabase.functions.invoke('sms-messaging', {
      body: {
        ...buildSmsRequest({
          userId: progress.user_id,
          leadId: lead.id,
          to: lead.phone_number,
          from: fromNumber,
          body: personalizedMessage,
          campaignId: progress.campaign_id,
          idempotencyKey: `workflow-effect:${effectClaim.effectId}`,
        }),
      },
    });

    assertInvokeSuccess('sms-messaging', smsResponse);
    await transitionWorkflowExternalEffect(supabase, effectClaim, 'accepted', {
      result: smsResponse.data,
      providerReference: providerReference(smsResponse.data),
    });

    console.log(`[Workflow] SMS sent to lead ${lead.id}`);
    return {
      success: true,
      action: 'sms_sent',
      data: smsResponse.data,
      effect_id: effectClaim.effectId,
      effect_status: effectClaim.status,
      _effectClaim: effectClaim,
    };

  } catch (error: any) {
    console.error(`[Workflow] SMS step error for lead ${lead.id}:`, error);
    if (effectClaim?.claimed) {
      return await reconcileAmbiguousWorkflowEffect(supabase, effectClaim, error.message);
    }
    return { success: false, action: 'sms_failed', error: error.message };
  }
}

async function executeAiSmsStep(supabase: any, lead: any, progress: any, config: any) {
  console.log(`[Workflow] Sending AI SMS to ${lead?.phone_number}`);

  let effectClaim: WorkflowEffectClaim | null = null;
  try {
    let campaignSmsNumber: string | null = null;
    if (progress.campaign_id) {
      const campaignResult = await supabase.from('campaigns')
        .select('sms_from_number')
        .eq('id', progress.campaign_id)
        .eq('user_id', progress.user_id)
        .maybeSingle();
      assertDbSuccess(campaignResult, 'load workflow AI SMS campaign');
      campaignSmsNumber = campaignResult.data?.sms_from_number || null;
    }
    const fromNumber = await resolveWorkflowNumber(
      supabase,
      progress,
      config.from_number || campaignSmsNumber,
    );

    effectClaim = await claimWorkflowExternalEffect(supabase, progress, 'ai_sms');
    if (!effectClaim.claimed) return duplicateEffectResult(effectClaim);

    // Call AI SMS processor
    const aiResponse = await supabase.functions.invoke('ai-sms-processor', {
      body: {
        ...buildAiSmsRequest({
          leadId: lead.id,
          userId: progress.user_id,
          fromNumber,
          toNumber: lead.phone_number,
          prompt: config.ai_prompt || 'Send a friendly follow-up message',
          idempotencyKey: `workflow-effect:${effectClaim.effectId}`,
          context: {
            workflowStep: progress.current_step_id,
            campaignId: progress.campaign_id,
          },
        }),
      },
    });

    assertInvokeSuccess('ai-sms-processor', aiResponse);
    await transitionWorkflowExternalEffect(supabase, effectClaim, 'accepted', {
      result: aiResponse.data,
      providerReference: providerReference(aiResponse.data),
    });

    console.log(`[Workflow] AI SMS sent to lead ${lead.id}`);
    return {
      success: true,
      action: 'ai_sms_sent',
      data: aiResponse.data,
      effect_id: effectClaim.effectId,
      effect_status: effectClaim.status,
      _effectClaim: effectClaim,
    };

  } catch (error: any) {
    console.error(`[Workflow] AI SMS step error for lead ${lead.id}:`, error);
    if (effectClaim?.claimed) {
      return await reconcileAmbiguousWorkflowEffect(supabase, effectClaim, error.message);
    }
    return { success: false, action: 'ai_sms_failed', error: error.message };
  }
}

async function executeAssistableCallStep(supabase: any, lead: any, progress: any, config: any) {
  console.log(`[Workflow] Executing Assistable call for lead ${lead?.id}`);

  let effectClaim: WorkflowEffectClaim | null = null;
  try {
    const assistantId = config.assistable_assistant_id || config.assistant_id;
    const locationId = config.assistable_location_id || config.location_id;
    
    if (!assistantId || !locationId) {
      throw new Error('Assistable assistant_id and location_id are required');
    }

    // Get GHL contact_id from lead
    const contactId = lead.ghl_contact_id || lead.custom_fields?.ghl_contact_id || lead.custom_fields?.contact_id;
    if (!contactId) {
      console.warn(`[Workflow] Lead ${lead.id} has no GHL contact_id — cannot place Assistable call`);
      return { success: false, action: 'assistable_call_skipped', error: 'No GHL contact_id on lead' };
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase configuration missing for Assistable call');
    }

    effectClaim = await claimWorkflowExternalEffect(supabase, progress, 'assistable_call');
    if (!effectClaim.claimed) return duplicateEffectResult(effectClaim);

    // Call our assistable-make-call edge function
    const response = await fetch(`${supabaseUrl}/functions/v1/assistable-make-call`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: lead.user_id || progress.user_id,
        assistant_id: assistantId,
        location_id: locationId,
        contact_id: contactId,
        number_pool_id: config.number_pool_id || null,
        lead_id: lead.id,
        campaign_id: progress.campaign_id || null,
      }),
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Assistable call did not return success');
    }

    await transitionWorkflowExternalEffect(supabase, effectClaim, 'accepted', {
      result,
      providerReference: providerReference(result),
    });

    console.log(`[Workflow] Assistable call placed for lead ${lead.id}: call_id=${result.call_id}`);
    return {
      success: true,
      action: 'assistable_call_placed',
      call_id: result.call_id,
      data: result,
      effect_id: effectClaim.effectId,
      effect_status: effectClaim.status,
      _effectClaim: effectClaim,
    };

  } catch (error: any) {
    console.error(`[Workflow] Assistable call step error for lead ${lead?.id}:`, error);
    if (effectClaim?.claimed) {
      return await reconcileAmbiguousWorkflowEffect(supabase, effectClaim, error.message);
    }
    return { success: false, action: 'assistable_call_failed', error: error.message };
  }
}

async function executeWebhookStep(supabase: any, lead: any, progress: any, config: any) {
  console.log(`[Workflow] Executing webhook for lead ${lead?.id}`);

  // Preserve fail-closed handling for any durable effect created before this
  // launch gate was introduced. It must be reconciled explicitly and must not
  // be obscured by the generic certification failure below.
  const existingEffect = await findWorkflowExternalEffect(supabase, progress, 'webhook');
  if (existingEffect) return duplicateEffectResult(existingEffect);

  // Tenant-configured callbacks can currently target arbitrary network
  // destinations and attach custom headers. Keep this egress path disabled
  // until it has a certified destination policy and redirect/DNS controls.
  // No effect is claimed because no physical request is attempted; the normal
  // workflow failure path records the error and schedules the configured retry.
  const certificationError = 'Workflow webhook egress is disabled until its outbound network policy is certified.';
  console.warn(`[Workflow] ${certificationError} Progress ${progress?.id || 'unknown'} was not sent.`);
  return {
    success: false,
    disabled: true,
    action: 'webhook_egress_not_certified',
    error_code: 'WORKFLOW_WEBHOOK_EGRESS_NOT_CERTIFIED',
    error: certificationError,
  };
}

async function moveToNextStep(supabase: any, progress: any, currentStep: any) {
  if (!currentStep) {
    // No current step, mark as completed
    const completeMissingResult = await supabase
      .from('lead_workflow_progress')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', progress.id);
    assertDbSuccess(completeMissingResult, 'complete workflow without current step');
    return;
  }

  // ============= LOOP SUPPORT =============
  // Fetch full step record with loop fields if not already present
  const loopBackTo = currentStep.loop_back_to_step ?? currentStep.step_config?.loop_back_to_step;
  const maxLoopCount = currentStep.max_loop_count ?? currentStep.step_config?.max_loop_count ?? 0;

  if (loopBackTo != null) {
    // Prevent self-loops (step looping to itself)
    if (loopBackTo === (currentStep.step_number || 0)) {
      console.warn(`[Workflow] Self-loop detected at step ${loopBackTo}, resetting loop count and moving to next step`);
      // Reset loop count on self-loop fallthrough so it doesn't carry over
      const resetSelfLoopResult = await supabase
        .from('lead_workflow_progress')
        .update({ loop_count: 0, updated_at: new Date().toISOString() })
        .eq('id', progress.id);
      assertDbSuccess(resetSelfLoopResult, 'reset workflow self-loop');
      // Fall through to normal next-step behavior
    } else {
    const currentLoopCount = progress.loop_count || 0;
    // max_loop_count = -1 means perpetual loop; 0 means no loop; >0 means limited loop
    const shouldLoop = maxLoopCount === -1 || (maxLoopCount > 0 && currentLoopCount < maxLoopCount);

    if (shouldLoop) {
      console.log(`[Workflow] Loop: iteration ${currentLoopCount + 1}/${maxLoopCount === -1 ? '∞' : maxLoopCount}, jumping back to step ${loopBackTo} for progress ${progress.id}`);

      // Find the target loop step
      const loopStepResult = await supabase
        .from('workflow_steps')
        .select('id, step_type, step_config')
        .eq('workflow_id', currentStep.workflow_id || progress.workflow_id)
        .eq('step_number', loopBackTo)
        .maybeSingle();
      assertDbSuccess(loopStepResult, 'load workflow loop target');
      const loopStep = loopStepResult.data;

      if (loopStep) {
        const nextActionAt = calculateNextActionTime(loopStep);
        const loopUpdateResult = await supabase
          .from('lead_workflow_progress')
          .update({
            current_step_id: loopStep.id,
            next_action_at: nextActionAt,
            loop_count: currentLoopCount + 1,
            external_effect_generation: crypto.randomUUID(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', progress.id);
        assertDbSuccess(loopUpdateResult, 'move workflow to loop target');
        return;
      }
      // If loop target doesn't exist, fall through to normal next-step logic
      console.warn(`[Workflow] Loop target step ${loopBackTo} not found, proceeding linearly`);
    } else if (maxLoopCount > 0) {
      console.log(`[Workflow] Loop limit reached (${currentLoopCount}/${maxLoopCount}), proceeding to next step`);
      // Reset loop count when loop completes
      const resetLoopResult = await supabase
        .from('lead_workflow_progress')
        .update({ loop_count: 0, updated_at: new Date().toISOString() })
        .eq('id', progress.id);
      assertDbSuccess(resetLoopResult, 'reset completed workflow loop');
    }
    } // end else (non-self-loop)
  }
  // ============= END LOOP SUPPORT =============

  // Get the next step
  const nextStepResult = await supabase
    .from('workflow_steps')
    .select('id, step_type, step_config')
    .eq('workflow_id', currentStep.workflow_id || progress.workflow_id)
    .eq('step_number', (currentStep.step_number || 0) + 1)
    .maybeSingle();
  assertDbSuccess(nextStepResult, 'load next workflow step');
  const nextStep = nextStepResult.data;

  if (nextStep) {
    const nextActionAt = calculateNextActionTime(nextStep);

    const moveResult = await supabase
      .from('lead_workflow_progress')
      .update({
        current_step_id: nextStep.id,
        next_action_at: nextActionAt,
        external_effect_generation: crypto.randomUUID(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', progress.id);
    assertDbSuccess(moveResult, 'move workflow to next step');

    console.log(`[Workflow] Moved to step ${nextStep.id} for progress ${progress.id}`);
  } else {
    // No more steps, complete the workflow
    const completeResult = await supabase
      .from('lead_workflow_progress')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', progress.id);
    assertDbSuccess(completeResult, 'complete workflow');

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
