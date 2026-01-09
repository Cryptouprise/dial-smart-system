import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCampaignWorkflows } from '../useCampaignWorkflows';

vi.mock('@/integrations/supabase/client');

describe('useCampaignWorkflows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize workflow system', () => {
    const { result } = renderHook(() => useCampaignWorkflows('campaign-123'));
    
    expect(result.current).toBeDefined();
    expect(result.current.workflows).toBeDefined();
  });

  it('should create new workflow', async () => {
    const { result } = renderHook(() => useCampaignWorkflows('campaign-123'));
    
    const workflowData = {
      name: 'Follow-up Sequence',
      trigger: 'no_answer',
      actions: [
        { type: 'wait', duration: 3600 },
        { type: 'call', priority: 'high' },
      ],
    };
    
    await act(async () => {
      await result.current.createWorkflow(workflowData);
    });
    
    expect(result.current.error).toBeNull();
  });

  it('should execute workflow callback', async () => {
    const { result } = renderHook(() => useCampaignWorkflows('campaign-123'));
    
    const callbackData = {
      leadId: 'lead-123',
      disposition: 'no_answer',
      callId: 'call-456',
    };
    
    await act(async () => {
      await result.current.handleCallback(callbackData);
    });
    
    expect(result.current.lastCallback).toBeDefined();
  });

  it('should handle follow-up scheduling', async () => {
    const { result } = renderHook(() => useCampaignWorkflows('campaign-123'));
    
    const followUp = {
      leadId: 'lead-123',
      delay: 86400, // 24 hours
      type: 'call',
    };
    
    await act(async () => {
      await result.current.scheduleFollowUp(followUp);
    });
    
    expect(result.current.scheduledFollowUps).toContain(followUp.leadId);
  });

  it('should validate workflow configuration', () => {
    const { result } = renderHook(() => useCampaignWorkflows('campaign-123'));
    
    const validWorkflow = {
      trigger: 'no_answer',
      actions: [{ type: 'wait', duration: 3600 }],
    };
    
    const isValid = result.current.validateWorkflow(validWorkflow);
    
    expect(isValid).toBe(true);
  });

  it('should track workflow execution', async () => {
    const { result } = renderHook(() => useCampaignWorkflows('campaign-123'));
    
    const stats = result.current.getWorkflowStats('workflow-123');
    
    expect(stats).toBeDefined();
    expect(stats.executionCount).toBeDefined();
    expect(stats.successRate).toBeDefined();
  });

  it('should handle workflow branching logic', async () => {
    const { result } = renderHook(() => useCampaignWorkflows('campaign-123'));
    
    const branchingWorkflow = {
      name: 'Smart Follow-up',
      trigger: 'call_completed',
      branches: [
        { condition: 'interested', actions: ['schedule_demo'] },
        { condition: 'not_interested', actions: ['nurture_sequence'] },
      ],
    };
    
    await act(async () => {
      await result.current.createWorkflow(branchingWorkflow);
    });
    
    expect(result.current.error).toBeNull();
  });

  it('should cancel pending workflows', async () => {
    const { result } = renderHook(() => useCampaignWorkflows('campaign-123'));
    
    await act(async () => {
      await result.current.cancelWorkflow('workflow-123', 'lead-456');
    });
    
    expect(result.current.cancelledCount).toBeGreaterThan(0);
  });
});
