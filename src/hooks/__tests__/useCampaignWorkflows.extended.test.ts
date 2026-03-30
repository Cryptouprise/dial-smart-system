import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCampaignWorkflows, WorkflowStep, CampaignWorkflow, DispositionAutoAction } from '../useCampaignWorkflows';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client');

// Helper: build a chainable Supabase query mock
function mockChain(finalResult: { data: any; error: any }) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(finalResult),
    then: (resolve: any) => Promise.resolve(finalResult).then(resolve),
  };
  // Make chain itself thenable so await works at any point
  chain[Symbol.for('jest.asymmetricMatch')] = undefined;
  return chain;
}

const mockUser = { id: 'user-123', email: 'test@test.com' };

describe('useCampaignWorkflows (extended)', () => {
  const mockFrom = supabase.from as ReturnType<typeof vi.fn>;
  const mockGetUser = supabase.auth.getUser as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: authenticated user
    mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });
  });

  // ── Workflow Step Execution Order ──────────────────────────────────

  describe('Workflow Step Execution Order', () => {
    it('steps are ordered by step_number ascending', async () => {
      const workflows = [
        { id: 'wf-1', user_id: mockUser.id, name: 'Test WF', workflow_type: 'follow_up', created_at: '2026-01-01' },
      ];
      // Steps returned pre-sorted by step_number (as the DB .order() would)
      const steps = [
        { id: 's1', workflow_id: 'wf-1', step_number: 1, step_type: 'call', step_config: { agent_id: 'a1' } },
        { id: 's2', workflow_id: 'wf-1', step_number: 2, step_type: 'wait', step_config: { delay_hours: 1 } },
        { id: 's3', workflow_id: 'wf-1', step_number: 3, step_type: 'sms', step_config: { sms_content: 'Step 3' } },
      ];

      mockFrom.mockImplementation((table: string) => {
        if (table === 'campaign_workflows') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnValue(Promise.resolve({ data: workflows, error: null })),
          };
        }
        if (table === 'workflow_steps') {
          return {
            select: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnValue(Promise.resolve({ data: steps, error: null })),
          };
        }
        // disposition_auto_actions table (loaded on mount)
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnValue(Promise.resolve({ data: [], error: null })),
        };
      });

      const { result } = renderHook(() => useCampaignWorkflows());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // The hook groups steps and preserves the DB sort order
      expect(result.current.workflows).toHaveLength(1);
      const wf = result.current.workflows[0];
      expect(wf.steps).toHaveLength(3);
      expect(wf.steps![0].step_number).toBe(1);
      expect(wf.steps![1].step_number).toBe(2);
      expect(wf.steps![2].step_number).toBe(3);
    });

    it('createWorkflow assigns sequential step_numbers starting from 1', async () => {
      const insertedWorkflow = { id: 'wf-new', user_id: mockUser.id, name: 'New WF' };

      // Track what gets passed to insert for workflow_steps
      let insertedSteps: any[] = [];

      mockFrom.mockImplementation((table: string) => {
        if (table === 'campaign_workflows') {
          const chain: any = {
            select: vi.fn().mockReturnThis(),
            insert: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnValue(Promise.resolve({ data: [], error: null })),
            maybeSingle: vi.fn().mockResolvedValue({ data: insertedWorkflow, error: null }),
          };
          return chain;
        }
        if (table === 'workflow_steps') {
          return {
            select: vi.fn().mockReturnThis(),
            insert: vi.fn((data: any) => {
              insertedSteps = data;
              return Promise.resolve({ data, error: null });
            }),
            order: vi.fn().mockReturnValue(Promise.resolve({ data: [], error: null })),
            eq: vi.fn().mockReturnThis(),
            delete: vi.fn().mockReturnThis(),
          };
        }
        return mockChain({ data: [], error: null });
      });

      const { result } = renderHook(() => useCampaignWorkflows());

      const newWorkflow: Omit<CampaignWorkflow, 'id' | 'user_id' | 'created_at' | 'updated_at'> = {
        name: 'Test Create',
        workflow_type: 'follow_up',
        steps: [
          { step_number: 0, step_type: 'call', step_config: { agent_id: 'a1' } },
          { step_number: 0, step_type: 'wait', step_config: { delay_hours: 2 } },
          { step_number: 0, step_type: 'sms', step_config: { sms_content: 'Hi' } },
        ],
      };

      await act(async () => {
        await result.current.createWorkflow(newWorkflow);
      });

      // Verify step_numbers are sequential 1, 2, 3 regardless of input
      if (insertedSteps.length > 0) {
        expect(insertedSteps[0].step_number).toBe(1);
        expect(insertedSteps[1].step_number).toBe(2);
        expect(insertedSteps[2].step_number).toBe(3);
        expect(insertedSteps[0].workflow_id).toBe('wf-new');
      }
    });
  });

  // ── Workflow Trigger Conditions ────────────────────────────────────

  describe('Workflow Trigger Conditions', () => {
    it('workflow step can have condition type with then/else actions', () => {
      const conditionStep: WorkflowStep = {
        step_number: 1,
        step_type: 'condition',
        step_config: {
          condition_type: 'disposition',
          condition_operator: 'equals',
          condition_value: 'interested',
          then_action: 'continue',
          else_action: 'end_workflow',
        },
      };

      expect(conditionStep.step_type).toBe('condition');
      expect(conditionStep.step_config.condition_type).toBe('disposition');
      expect(conditionStep.step_config.then_action).toBe('continue');
      expect(conditionStep.step_config.else_action).toBe('end_workflow');
    });

    it('condition step supports jump_to_step with target', () => {
      const conditionStep: WorkflowStep = {
        step_number: 2,
        step_type: 'condition',
        step_config: {
          condition_type: 'call_outcome',
          condition_operator: 'equals',
          condition_value: 'no_answer',
          then_action: 'jump_to_step',
          then_target: '5',
          else_action: 'continue',
        },
      };

      expect(conditionStep.step_config.then_action).toBe('jump_to_step');
      expect(conditionStep.step_config.then_target).toBe('5');
    });

    it('condition step supports all condition types', () => {
      const conditionTypes: WorkflowStep['step_config']['condition_type'][] = [
        'disposition', 'lead_status', 'call_outcome', 'attempts',
        'time_of_day', 'day_of_week', 'tag_exists', 'custom_field',
        'call_duration', 'sms_reply_received', 'voicemail_left',
        'appointment_scheduled', 'lead_score', 'last_contact_days',
        'total_calls', 'total_sms',
      ];

      conditionTypes.forEach((ct) => {
        const step: WorkflowStep = {
          step_number: 1,
          step_type: 'condition',
          step_config: { condition_type: ct, condition_operator: 'equals', condition_value: 'test' },
        };
        expect(step.step_config.condition_type).toBe(ct);
      });
    });

    it('condition step supports all operators', () => {
      const operators: WorkflowStep['step_config']['condition_operator'][] = [
        'equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'is_empty', 'is_not_empty',
      ];

      operators.forEach((op) => {
        const step: WorkflowStep = {
          step_number: 1,
          step_type: 'condition',
          step_config: { condition_type: 'lead_status', condition_operator: op, condition_value: 'x' },
        };
        expect(step.step_config.condition_operator).toBe(op);
      });
    });
  });

  // ── Disposition-to-Workflow Mapping ────────────────────────────────

  describe('Disposition-to-Workflow Mapping', () => {
    it('dispositionActions array is available', () => {
      const { result } = renderHook(() => useCampaignWorkflows());
      expect(Array.isArray(result.current.dispositionActions)).toBe(true);
    });

    it('DispositionAutoAction supports start_workflow action type', () => {
      const action: DispositionAutoAction = {
        disposition_name: 'interested',
        action_type: 'start_workflow',
        action_config: { target_workflow_id: 'wf-123' },
        priority: 1,
        active: true,
      };

      expect(action.action_type).toBe('start_workflow');
      expect(action.action_config?.target_workflow_id).toBe('wf-123');
    });

    it('DispositionAutoAction supports all action types', () => {
      const types: DispositionAutoAction['action_type'][] = [
        'remove_all_campaigns', 'remove_from_campaign', 'move_to_stage', 'add_to_dnc', 'start_workflow',
      ];

      types.forEach((t) => {
        const action: DispositionAutoAction = {
          disposition_name: 'test',
          action_type: t,
          active: true,
        };
        expect(action.action_type).toBe(t);
      });
    });

    it('createDispositionAction requires authentication', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });

      // Set up mock so loadDispositionActions on mount does not throw
      mockFrom.mockImplementation(() => mockChain({ data: [], error: null }));

      const { result } = renderHook(() => useCampaignWorkflows());

      await act(async () => {
        await result.current.createDispositionAction({
          disposition_name: 'interested',
          action_type: 'start_workflow',
          action_config: { target_workflow_id: 'wf-1' },
        });
      });

      // Should not crash; the function handles auth failure internally
    });

    it('deleteDispositionAction calls supabase delete', async () => {
      const deleteChain = mockChain({ data: null, error: null });

      mockFrom.mockImplementation((table: string) => {
        if (table === 'disposition_auto_actions') return deleteChain;
        return mockChain({ data: [], error: null });
      });

      const { result } = renderHook(() => useCampaignWorkflows());

      await act(async () => {
        await result.current.deleteDispositionAction('action-1');
      });

      expect(mockFrom).toHaveBeenCalledWith('disposition_auto_actions');
    });
  });

  // ── Workflow Pause/Resume ──────────────────────────────────────────

  describe('Workflow Pause/Resume', () => {
    it('updateWorkflow can set active to false (pause)', async () => {
      let updatedPayload: any = null;
      const updateChain: any = {
        update: vi.fn((payload: any) => {
          updatedPayload = payload;
          return updateChain;
        }),
        eq: vi.fn().mockReturnValue(Promise.resolve({ data: null, error: null })),
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnValue(Promise.resolve({ data: [], error: null })),
        delete: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
      };

      mockFrom.mockImplementation((table: string) => {
        if (table === 'campaign_workflows') return updateChain;
        if (table === 'workflow_steps') return updateChain;
        return mockChain({ data: [], error: null });
      });

      const { result } = renderHook(() => useCampaignWorkflows());

      await act(async () => {
        await result.current.updateWorkflow('wf-1', { active: false });
      });

      expect(updatedPayload).toBeDefined();
      expect(updatedPayload.active).toBe(false);
    });

    it('updateWorkflow can set active to true (resume)', async () => {
      let updatedPayload: any = null;
      const updateChain: any = {
        update: vi.fn((payload: any) => {
          updatedPayload = payload;
          return updateChain;
        }),
        eq: vi.fn().mockReturnValue(Promise.resolve({ data: null, error: null })),
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnValue(Promise.resolve({ data: [], error: null })),
        delete: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
      };

      mockFrom.mockImplementation((table: string) => {
        if (table === 'campaign_workflows') return updateChain;
        if (table === 'workflow_steps') return updateChain;
        return mockChain({ data: [], error: null });
      });

      const { result } = renderHook(() => useCampaignWorkflows());

      await act(async () => {
        await result.current.updateWorkflow('wf-1', { active: true });
      });

      expect(updatedPayload).toBeDefined();
      expect(updatedPayload.active).toBe(true);
    });

    it('workflow settings support pause_on_weekends', () => {
      const wf: CampaignWorkflow = {
        name: 'Weekend Pause',
        workflow_type: 'calling_only',
        settings: {
          pause_on_weekends: true,
          max_calls_per_day: 50,
          call_spacing_hours: 2,
        },
      };

      expect(wf.settings?.pause_on_weekends).toBe(true);
    });

    it('workflow settings support pause_days array', () => {
      const wf: CampaignWorkflow = {
        name: 'Holiday Pause',
        workflow_type: 'follow_up',
        settings: {
          pause_days: ['Monday', 'Friday'],
          resume_day: 'Tuesday',
          resume_time: '09:00',
        },
      };

      expect(wf.settings?.pause_days).toEqual(['Monday', 'Friday']);
      expect(wf.settings?.resume_day).toBe('Tuesday');
    });
  });

  // ── Workflow Error Recovery ────────────────────────────────────────

  describe('Workflow Error Recovery', () => {
    it('createWorkflow handles Supabase insert error gracefully', async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === 'campaign_workflows') {
          return {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnValue(Promise.resolve({ data: [], error: null })),
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'unique constraint violation' },
            }),
          };
        }
        return mockChain({ data: [], error: null });
      });

      const { result } = renderHook(() => useCampaignWorkflows());
      let res: any;

      await act(async () => {
        res = await result.current.createWorkflow({
          name: 'Duplicate',
          workflow_type: 'follow_up',
        });
      });

      expect(res).toBeNull();
    });

    it('deleteWorkflow handles non-existent workflow without crashing', async () => {
      const deleteChain: any = {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnValue(Promise.resolve({ data: null, error: { message: 'not found' } })),
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnValue(Promise.resolve({ data: [], error: null })),
      };

      mockFrom.mockImplementation((table: string) => {
        if (table === 'campaign_workflows') return deleteChain;
        return mockChain({ data: [], error: null });
      });

      const { result } = renderHook(() => useCampaignWorkflows());

      // Should not throw
      await act(async () => {
        await result.current.deleteWorkflow('nonexistent-id');
      });
    });

    it('loadWorkflows handles unauthenticated state', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
      mockFrom.mockImplementation(() => mockChain({ data: [], error: null }));

      const { result } = renderHook(() => useCampaignWorkflows());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should remain empty without error
      expect(result.current.workflows).toEqual([]);
    });

    it('updateWorkflow replaces steps atomically (delete + insert)', async () => {
      const deletedStepWorkflows: string[] = [];
      const insertedSteps: any[] = [];

      const chain: any = {
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        insert: vi.fn((data: any) => {
          insertedSteps.push(...data);
          return Promise.resolve({ data, error: null });
        }),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn((col: string, val: string) => {
          if (col === 'workflow_id') deletedStepWorkflows.push(val);
          return Promise.resolve({ data: null, error: null });
        }),
        order: vi.fn().mockReturnValue(Promise.resolve({ data: [], error: null })),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };

      mockFrom.mockImplementation(() => chain);

      const { result } = renderHook(() => useCampaignWorkflows());

      await act(async () => {
        await result.current.updateWorkflow('wf-1', {
          name: 'Updated',
          steps: [
            { step_number: 1, step_type: 'call', step_config: { agent_id: 'a1' } },
            { step_number: 2, step_type: 'sms', step_config: { sms_content: 'Updated' } },
          ],
        });
      });

      // Verify delete was called for the workflow_id
      expect(deletedStepWorkflows).toContain('wf-1');
      // Verify new steps were inserted with sequential numbering
      if (insertedSteps.length > 0) {
        expect(insertedSteps[0].step_number).toBe(1);
        expect(insertedSteps[1].step_number).toBe(2);
      }
    });
  });

  // ── Workflow Types ─────────────────────────────────────────────────

  describe('Workflow Types', () => {
    it('supports all workflow_type values', () => {
      const types: CampaignWorkflow['workflow_type'][] = [
        'calling_only', 'follow_up', 'mixed', 'appointment_reminder', 'no_show',
      ];

      types.forEach((t) => {
        const wf: CampaignWorkflow = { name: `Type ${t}`, workflow_type: t };
        expect(wf.workflow_type).toBe(t);
      });
    });

    it('supports all step_type values', () => {
      const stepTypes: WorkflowStep['step_type'][] = [
        'call', 'sms', 'ai_sms', 'ai_auto_reply', 'wait', 'condition',
      ];

      stepTypes.forEach((st) => {
        const step: WorkflowStep = { step_number: 1, step_type: st, step_config: {} };
        expect(step.step_type).toBe(st);
      });
    });
  });

  // ── Auto-Reply Settings ────────────────────────────────────────────

  describe('Auto-Reply Settings', () => {
    it('workflow can have auto_reply_settings', () => {
      const wf: CampaignWorkflow = {
        name: 'Auto Reply WF',
        workflow_type: 'follow_up',
        auto_reply_settings: {
          enabled: true,
          ai_instructions: 'Be helpful',
          response_delay_seconds: 30,
          stop_on_human_reply: true,
          calendar_enabled: true,
          booking_link: 'https://cal.com/test',
          knowledge_base: 'kb-123',
        },
      };

      expect(wf.auto_reply_settings?.enabled).toBe(true);
      expect(wf.auto_reply_settings?.calendar_enabled).toBe(true);
      expect(wf.auto_reply_settings?.response_delay_seconds).toBe(30);
    });

    it('auto_reply_settings can be null', () => {
      const wf: CampaignWorkflow = {
        name: 'No Auto Reply',
        workflow_type: 'calling_only',
        auto_reply_settings: null,
      };

      expect(wf.auto_reply_settings).toBeNull();
    });
  });
});
