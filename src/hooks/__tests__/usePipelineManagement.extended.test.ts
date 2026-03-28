/**
 * Extended Pipeline Management Hook Tests
 *
 * Extends the basic existence tests in usePipelineManagement.test.ts with
 * behavioral tests covering:
 * - Moving leads between pipeline stages
 * - Disposition-to-stage mapping via the pipeline-management edge function
 * - Pipeline board data loading (dispositions, boards, positions)
 * - Drag-and-drop stage transition (moveLeadToPipeline)
 * - Error handling and loading states
 * - Default disposition initialization
 * - Concurrent data fetching
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePipelineManagement } from '../usePipelineManagement';

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

// We use vi.hoisted so the mock fn is available at mock-factory time
const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => {
  const chainableMock = () => {
    const chain: any = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.insert = vi.fn().mockReturnValue(chain);
    chain.update = vi.fn().mockReturnValue(chain);
    chain.delete = vi.fn().mockReturnValue(chain);
    chain.upsert = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.neq = vi.fn().mockReturnValue(chain);
    chain.order = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    chain.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
    chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    return chain;
  };

  return {
    supabase: {
      auth: {
        getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
        getUser: vi.fn(() =>
          Promise.resolve({
            data: { user: { id: 'test-user-id', email: 'test@example.com' } },
            error: null,
          }),
        ),
        onAuthStateChange: vi.fn(() => ({
          data: { subscription: { unsubscribe: vi.fn() } },
        })),
      },
      from: vi.fn(() => chainableMock()),
      functions: {
        invoke: mockInvoke,
      },
    },
  };
});

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

vi.mock('@/lib/toastDedup', () => ({
  debouncedErrorToast: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Make mockInvoke return different data depending on the action. */
function setupMockInvoke(overrides: Record<string, any> = {}) {
  mockInvoke.mockImplementation((_fn: string, opts: any) => {
    const action = opts?.body?.action;

    // Default responses by action
    const defaults: Record<string, any> = {
      check_dispositions_exist: { data: true },
      get_dispositions: {
        data: [
          { id: 'd1', name: 'Interested', pipeline_stage: 'hot_leads', color: '#10B981', description: '', auto_actions: [] },
          { id: 'd2', name: 'Not Interested', pipeline_stage: 'cold_leads', color: '#EF4444', description: '', auto_actions: [] },
          { id: 'd3', name: 'Appointment Booked', pipeline_stage: 'appointments', color: '#8B5CF6', description: '', auto_actions: [] },
          { id: 'd4', name: 'Callback Requested', pipeline_stage: 'callbacks', color: '#F59E0B', description: '', auto_actions: [] },
          { id: 'd5', name: 'Voicemail', pipeline_stage: 'follow_up', color: '#3B82F6', description: '', auto_actions: [] },
          { id: 'd6', name: 'Do Not Call', pipeline_stage: 'dnc_list', color: '#DC2626', description: '', auto_actions: [] },
          { id: 'd7', name: 'Wrong Number', pipeline_stage: 'invalid_leads', color: '#6B7280', description: '', auto_actions: [] },
        ],
      },
      get_pipeline_boards: {
        data: [
          { id: 'b1', name: 'Hot Leads', description: '', disposition_id: 'd1', position: 0, settings: {} },
          { id: 'b2', name: 'Cold Leads', description: '', disposition_id: 'd2', position: 1, settings: {} },
          { id: 'b3', name: 'Appointments', description: '', disposition_id: 'd3', position: 2, settings: {} },
          { id: 'b4', name: 'Callbacks', description: '', disposition_id: 'd4', position: 3, settings: {} },
          { id: 'b5', name: 'Follow Up', description: '', disposition_id: 'd5', position: 4, settings: {} },
          { id: 'b6', name: 'DNC', description: '', disposition_id: 'd6', position: 5, settings: {} },
        ],
      },
      get_lead_positions: {
        data: [
          { id: 'lp1', lead_id: 'lead-1', pipeline_board_id: 'b1', position: 0, moved_at: '2026-03-28T10:00:00Z', moved_by_user: false, notes: '' },
          { id: 'lp2', lead_id: 'lead-2', pipeline_board_id: 'b2', position: 1, moved_at: '2026-03-28T09:00:00Z', moved_by_user: true, notes: 'Manual move' },
          { id: 'lp3', lead_id: 'lead-3', pipeline_board_id: 'b3', position: 0, moved_at: '2026-03-28T08:00:00Z', moved_by_user: false, notes: 'Auto-moved by disposition' },
        ],
      },
      move_lead_to_pipeline: { success: true },
      create_disposition: { data: { id: 'd-new', name: 'Custom' } },
      create_pipeline_board: { data: { id: 'b-new', name: 'Custom Board' } },
      insert_default_dispositions: { success: true },
    };

    const merged = { ...defaults, ...overrides };
    const response = merged[action];
    if (response === undefined) {
      return Promise.resolve({ data: null, error: null });
    }
    if (response instanceof Error) {
      return Promise.resolve({ data: null, error: response });
    }
    return Promise.resolve({ data: response, error: null });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePipelineManagement - Extended Behavioral Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMockInvoke();
  });

  // -----------------------------------------------------------------------
  // Data loading
  // -----------------------------------------------------------------------

  describe('Pipeline board data loading', () => {
    it('should load dispositions on mount', async () => {
      const { result } = renderHook(() => usePipelineManagement());

      await waitFor(() => {
        expect(result.current.loadingStates.initializing).toBe(false);
      });

      // get_dispositions should have been called
      expect(mockInvoke).toHaveBeenCalledWith('pipeline-management', {
        body: { action: 'get_dispositions' },
      });
    });

    it('should load pipeline boards on mount', async () => {
      const { result } = renderHook(() => usePipelineManagement());

      await waitFor(() => {
        expect(result.current.loadingStates.initializing).toBe(false);
      });

      expect(mockInvoke).toHaveBeenCalledWith('pipeline-management', {
        body: { action: 'get_pipeline_boards' },
      });
    });

    it('should load lead positions on mount', async () => {
      const { result } = renderHook(() => usePipelineManagement());

      await waitFor(() => {
        expect(result.current.loadingStates.initializing).toBe(false);
      });

      expect(mockInvoke).toHaveBeenCalledWith('pipeline-management', {
        body: { action: 'get_lead_positions' },
      });
    });

    it('should populate dispositions array after load', async () => {
      const { result } = renderHook(() => usePipelineManagement());

      await waitFor(() => {
        expect(result.current.dispositions.length).toBeGreaterThan(0);
      });

      expect(result.current.dispositions).toHaveLength(7);
      expect(result.current.dispositions[0].name).toBe('Interested');
    });

    it('should populate pipelineBoards array after load', async () => {
      const { result } = renderHook(() => usePipelineManagement());

      await waitFor(() => {
        expect(result.current.pipelineBoards.length).toBeGreaterThan(0);
      });

      expect(result.current.pipelineBoards).toHaveLength(6);
      expect(result.current.pipelineBoards[0].name).toBe('Hot Leads');
    });

    it('should populate leadPositions array after load', async () => {
      const { result } = renderHook(() => usePipelineManagement());

      await waitFor(() => {
        expect(result.current.leadPositions.length).toBeGreaterThan(0);
      });

      expect(result.current.leadPositions).toHaveLength(3);
      expect(result.current.leadPositions[0].lead_id).toBe('lead-1');
    });

    it('should check for existing dispositions before inserting defaults', async () => {
      const { result } = renderHook(() => usePipelineManagement());

      await waitFor(() => {
        expect(result.current.loadingStates.initializing).toBe(false);
      });

      expect(mockInvoke).toHaveBeenCalledWith('pipeline-management', {
        body: { action: 'check_dispositions_exist' },
      });
    });

    it('should insert default dispositions when none exist', async () => {
      setupMockInvoke({
        check_dispositions_exist: { data: false },
      });

      const { result } = renderHook(() => usePipelineManagement());

      await waitFor(() => {
        expect(result.current.loadingStates.initializing).toBe(false);
      });

      expect(mockInvoke).toHaveBeenCalledWith(
        'pipeline-management',
        expect.objectContaining({
          body: expect.objectContaining({
            action: 'insert_default_dispositions',
          }),
        }),
      );
    });

    it('should NOT insert defaults when dispositions already exist', async () => {
      // Default mock returns check_dispositions_exist: { data: true }
      const { result } = renderHook(() => usePipelineManagement());

      await waitFor(() => {
        expect(result.current.loadingStates.initializing).toBe(false);
      });

      const insertCalls = mockInvoke.mock.calls.filter(
        (call: any[]) => call[1]?.body?.action === 'insert_default_dispositions',
      );
      expect(insertCalls).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Moving leads between pipeline stages (drag-and-drop)
  // -----------------------------------------------------------------------

  describe('Moving leads between pipeline stages', () => {
    it('should call move_lead_to_pipeline with correct parameters', async () => {
      const { result } = renderHook(() => usePipelineManagement());

      await waitFor(() => {
        expect(result.current.loadingStates.initializing).toBe(false);
      });

      await act(async () => {
        await result.current.moveLeadToPipeline('lead-1', 'b3', 'Moved via drag');
      });

      expect(mockInvoke).toHaveBeenCalledWith('pipeline-management', {
        body: {
          action: 'move_lead_to_pipeline',
          lead_id: 'lead-1',
          pipeline_board_id: 'b3',
          position: 0,
          moved_by_user: true,
          notes: 'Moved via drag',
        },
      });
    });

    it('should default notes to empty string when not provided', async () => {
      const { result } = renderHook(() => usePipelineManagement());

      await waitFor(() => {
        expect(result.current.loadingStates.initializing).toBe(false);
      });

      await act(async () => {
        await result.current.moveLeadToPipeline('lead-1', 'b2');
      });

      expect(mockInvoke).toHaveBeenCalledWith('pipeline-management', {
        body: expect.objectContaining({
          notes: '',
        }),
      });
    });

    it('should set moved_by_user to true for manual moves', async () => {
      const { result } = renderHook(() => usePipelineManagement());

      await waitFor(() => {
        expect(result.current.loadingStates.initializing).toBe(false);
      });

      await act(async () => {
        await result.current.moveLeadToPipeline('lead-2', 'b1');
      });

      expect(mockInvoke).toHaveBeenCalledWith('pipeline-management', {
        body: expect.objectContaining({
          moved_by_user: true,
        }),
      });
    });

    it('should refresh lead positions after successful move', async () => {
      const { result } = renderHook(() => usePipelineManagement());

      await waitFor(() => {
        expect(result.current.loadingStates.initializing).toBe(false);
      });

      // Clear mocks to count only post-move calls
      mockInvoke.mockClear();
      setupMockInvoke();

      await act(async () => {
        await result.current.moveLeadToPipeline('lead-1', 'b4');
      });

      // After move, get_lead_positions should be called again
      const positionCalls = mockInvoke.mock.calls.filter(
        (call: any[]) => call[1]?.body?.action === 'get_lead_positions',
      );
      expect(positionCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('should throw on move failure', async () => {
      setupMockInvoke({
        move_lead_to_pipeline: new Error('Pipeline board not found'),
      });

      const { result } = renderHook(() => usePipelineManagement());

      await waitFor(() => {
        expect(result.current.loadingStates.initializing).toBe(false);
      });

      await expect(
        act(async () => {
          await result.current.moveLeadToPipeline('lead-1', 'nonexistent');
        }),
      ).rejects.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // Disposition-to-stage mapping
  // -----------------------------------------------------------------------

  describe('Disposition-to-stage mapping', () => {
    it('default dispositions should cover standard pipeline stages', async () => {
      const { result } = renderHook(() => usePipelineManagement());

      await waitFor(() => {
        expect(result.current.dispositions.length).toBeGreaterThan(0);
      });

      const stageNames = result.current.dispositions.map((d) => d.pipeline_stage);
      expect(stageNames).toContain('hot_leads');
      expect(stageNames).toContain('cold_leads');
      expect(stageNames).toContain('appointments');
      expect(stageNames).toContain('callbacks');
      expect(stageNames).toContain('follow_up');
      expect(stageNames).toContain('dnc_list');
      expect(stageNames).toContain('invalid_leads');
    });

    it('each disposition should have a name and color', async () => {
      const { result } = renderHook(() => usePipelineManagement());

      await waitFor(() => {
        expect(result.current.dispositions.length).toBeGreaterThan(0);
      });

      for (const d of result.current.dispositions) {
        expect(d.name).toBeTruthy();
        expect(d.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Creating dispositions and boards
  // -----------------------------------------------------------------------

  describe('Creating dispositions', () => {
    it('should call create_disposition then refresh', async () => {
      const { result } = renderHook(() => usePipelineManagement());

      await waitFor(() => {
        expect(result.current.loadingStates.initializing).toBe(false);
      });

      mockInvoke.mockClear();
      setupMockInvoke();

      await act(async () => {
        await result.current.createDisposition({
          name: 'Custom Disposition',
          description: 'Test desc',
          color: '#AABBCC',
          pipeline_stage: 'custom_stage',
          auto_actions: [],
        });
      });

      expect(mockInvoke).toHaveBeenCalledWith('pipeline-management', {
        body: {
          action: 'create_disposition',
          disposition_data: {
            name: 'Custom Disposition',
            description: 'Test desc',
            color: '#AABBCC',
            pipeline_stage: 'custom_stage',
            auto_actions: [],
          },
        },
      });

      // Should also refresh dispositions list
      const getCalls = mockInvoke.mock.calls.filter(
        (call: any[]) => call[1]?.body?.action === 'get_dispositions',
      );
      expect(getCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Creating pipeline boards', () => {
    it('should call create_pipeline_board then refresh', async () => {
      const { result } = renderHook(() => usePipelineManagement());

      await waitFor(() => {
        expect(result.current.loadingStates.initializing).toBe(false);
      });

      mockInvoke.mockClear();
      setupMockInvoke();

      await act(async () => {
        await result.current.createPipelineBoard({
          name: 'New Stage',
          description: 'Auto-created',
          disposition_id: 'd1',
          position: 10,
          settings: {},
        });
      });

      expect(mockInvoke).toHaveBeenCalledWith('pipeline-management', {
        body: {
          action: 'create_pipeline_board',
          board_data: {
            name: 'New Stage',
            description: 'Auto-created',
            disposition_id: 'd1',
            position: 10,
            settings: {},
          },
        },
      });
    });
  });

  // -----------------------------------------------------------------------
  // Loading states
  // -----------------------------------------------------------------------

  describe('Loading states', () => {
    it('should start with initializing=true', () => {
      const { result } = renderHook(() => usePipelineManagement());
      expect(result.current.loadingStates.initializing).toBe(true);
    });

    it('isLoading should be true while initializing', () => {
      const { result } = renderHook(() => usePipelineManagement());
      expect(result.current.isLoading).toBe(true);
    });

    it('should set initializing=false after data loads', async () => {
      const { result } = renderHook(() => usePipelineManagement());

      await waitFor(() => {
        expect(result.current.loadingStates.initializing).toBe(false);
      });
    });
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  describe('Error handling', () => {
    it('should handle disposition fetch failure gracefully', async () => {
      setupMockInvoke({
        get_dispositions: new Error('Network error'),
      });

      const { result } = renderHook(() => usePipelineManagement());

      await waitFor(() => {
        expect(result.current.loadingStates.initializing).toBe(false);
      });

      // Should still have empty arrays, not crash
      expect(result.current.dispositions).toEqual([]);
    });

    it('should handle pipeline boards fetch failure gracefully', async () => {
      setupMockInvoke({
        get_pipeline_boards: new Error('Server error'),
      });

      const { result } = renderHook(() => usePipelineManagement());

      await waitFor(() => {
        expect(result.current.loadingStates.initializing).toBe(false);
      });

      expect(result.current.pipelineBoards).toEqual([]);
    });

    it('should handle lead positions fetch failure gracefully', async () => {
      setupMockInvoke({
        get_lead_positions: new Error('Timeout'),
      });

      const { result } = renderHook(() => usePipelineManagement());

      await waitFor(() => {
        expect(result.current.loadingStates.initializing).toBe(false);
      });

      expect(result.current.leadPositions).toEqual([]);
    });

    it('should handle initialization failure without crashing', async () => {
      setupMockInvoke({
        check_dispositions_exist: new Error('Auth error'),
      });

      const { result } = renderHook(() => usePipelineManagement());

      // Should not throw, just degrade gracefully
      await waitFor(() => {
        expect(result.current.loadingStates.initializing).toBe(false);
      });
    });
  });

  // -----------------------------------------------------------------------
  // Refetch
  // -----------------------------------------------------------------------

  describe('Refetch', () => {
    it('should re-run full initialization when refetch is called', async () => {
      const { result } = renderHook(() => usePipelineManagement());

      await waitFor(() => {
        expect(result.current.loadingStates.initializing).toBe(false);
      });

      mockInvoke.mockClear();
      setupMockInvoke();

      await act(async () => {
        await result.current.refetch();
      });

      // Should call check_dispositions_exist + get_dispositions + get_pipeline_boards + get_lead_positions
      const actions = mockInvoke.mock.calls.map((c: any[]) => c[1]?.body?.action);
      expect(actions).toContain('check_dispositions_exist');
      expect(actions).toContain('get_dispositions');
      expect(actions).toContain('get_pipeline_boards');
      expect(actions).toContain('get_lead_positions');
    });
  });

  // -----------------------------------------------------------------------
  // Concurrent fetching
  // -----------------------------------------------------------------------

  describe('Concurrent data fetching', () => {
    it('should fetch dispositions, boards, and positions in parallel after init', async () => {
      // The hook uses Promise.all for the three fetches after initializeDefaultDispositions
      const callOrder: string[] = [];
      mockInvoke.mockImplementation((_fn: string, opts: any) => {
        const action = opts?.body?.action;
        callOrder.push(action);

        const defaults: Record<string, any> = {
          check_dispositions_exist: { data: true },
          get_dispositions: { data: [] },
          get_pipeline_boards: { data: [] },
          get_lead_positions: { data: [] },
        };

        return Promise.resolve({ data: defaults[action] ?? null, error: null });
      });

      const { result } = renderHook(() => usePipelineManagement());

      await waitFor(() => {
        expect(result.current.loadingStates.initializing).toBe(false);
      });

      // check_dispositions_exist should come first
      expect(callOrder[0]).toBe('check_dispositions_exist');

      // The three fetches should all appear (order among them is non-deterministic due to Promise.all)
      const fetchActions = callOrder.slice(1);
      expect(fetchActions).toContain('get_dispositions');
      expect(fetchActions).toContain('get_pipeline_boards');
      expect(fetchActions).toContain('get_lead_positions');
    });
  });
});
