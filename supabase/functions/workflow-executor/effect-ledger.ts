export const WORKFLOW_EXTERNAL_EFFECT_TYPES = [
  'call',
  'sms',
  'ai_sms',
  'assistable_call',
  'webhook',
] as const;

export type WorkflowExternalEffectType = typeof WORKFLOW_EXTERNAL_EFFECT_TYPES[number];
export type WorkflowEffectResolutionDecision = 'confirmed_accepted' | 'confirmed_not_accepted';

export type WorkflowEffectIdentity = {
  progressId: string;
  workflowId: string;
  stepId: string;
  leadId: string;
  campaignId: string | null;
  loopIteration: number;
  executionGeneration: string;
  effectType: WorkflowExternalEffectType;
};

export function buildWorkflowEffectIdentity(
  progress: Record<string, unknown>,
  effectType: WorkflowExternalEffectType,
): WorkflowEffectIdentity {
  const progressId = String(progress.id || '');
  const workflowId = String(progress.workflow_id || '');
  const stepId = String(progress.current_step_id || '');
  const leadId = String(progress.lead_id || '');
  const executionGeneration = String(progress.external_effect_generation || '');
  if (!progressId || !workflowId || !stepId || !leadId || !executionGeneration) {
    throw new Error('Workflow effect identity is missing a bound progress, workflow, step, lead, or persisted generation');
  }

  const rawLoopIteration = Number(progress.loop_count || 0);
  if (!Number.isInteger(rawLoopIteration) || rawLoopIteration < 0) {
    throw new Error('Workflow effect loop iteration must be a non-negative integer');
  }

  return {
    progressId,
    workflowId,
    stepId,
    leadId,
    campaignId: progress.campaign_id ? String(progress.campaign_id) : null,
    loopIteration: rawLoopIteration,
    executionGeneration,
    effectType,
  };
}

export function manualReconciliationResult(
  effectId: string,
  effectType: WorkflowExternalEffectType,
  status: string,
  reason: string,
) {
  return {
    success: false,
    completed: false,
    action: `${effectType}_manual_reconciliation_required`,
    error: reason,
    effect_id: effectId,
    effect_status: status,
    manual_reconciliation_required: true,
    recovery: 'Verify the provider outcome, then use the service-only resolve_external_effect action with confirmed_accepted or confirmed_not_accepted and audit notes. Ordinary resume is blocked.',
  };
}

export function validateWorkflowEffectResolution(
  decision: unknown,
  notes: unknown,
): { decision: WorkflowEffectResolutionDecision; notes: string } {
  if (decision !== 'confirmed_accepted' && decision !== 'confirmed_not_accepted') {
    throw new Error('Resolution decision must be confirmed_accepted or confirmed_not_accepted');
  }
  if (typeof notes !== 'string' || !notes.trim()) {
    throw new Error('Resolution notes are required');
  }
  return { decision, notes: notes.trim() };
}

export function unrelatedLeadCallDeferral(
  kind: 'pending' | 'recent_contact',
  callId: string,
) {
  return {
    success: false,
    action: kind === 'pending'
      ? 'call_deferred_unrelated_pending_call'
      : 'call_deferred_unrelated_recent_contact',
    error: kind === 'pending'
      ? 'An unrelated lead-level call is pending; this workflow effect was not initiated or satisfied'
      : 'A generic recent call cannot satisfy this workflow effect generation',
    callId,
  };
}
