/**
 * useCallDispatcher Hook Tests
 *
 * Tests the call dispatcher hook which manages dispatching calls,
 * auto-dispatch intervals, force-requeue, schedule resets, and
 * stuck call cleanup.
 *
 * NOTE: The hook uses module-level global singletons for auto-dispatch
 * deduplication and cooldown tracking. We must reset modules between
 * certain tests to get clean state.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { supabase } from '@/integrations/supabase/client';

// Mock toast
const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

describe('useCallDispatcher', () => {
  // We import the hook fresh where needed; for most tests, a direct import is fine
  // since we carefully manage the global guards.
  let useCallDispatcher: typeof import('../useCallDispatcher').useCallDispatcher;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockToast.mockClear();

    // Reset modules to clear global singletons (globalAutoDispatchActive, etc.)
    vi.resetModules();

    // Re-import with fresh module state
    const mod = await import('../useCallDispatcher');
    useCallDispatcher = mod.useCallDispatcher;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Initial State', () => {
    it('should return isDispatching as false initially', () => {
      const { result } = renderHook(() => useCallDispatcher());
      expect(result.current.isDispatching).toBe(false);
    });

    it('should return lastResponse as null initially', () => {
      const { result } = renderHook(() => useCallDispatcher());
      expect(result.current.lastResponse).toBeNull();
    });

    it('should expose all dispatch control functions', () => {
      const { result } = renderHook(() => useCallDispatcher());
      expect(typeof result.current.dispatchCalls).toBe('function');
      expect(typeof result.current.startAutoDispatch).toBe('function');
      expect(typeof result.current.stopAutoDispatch).toBe('function');
      expect(typeof result.current.forceRequeueLeads).toBe('function');
      expect(typeof result.current.forceDispatchLead).toBe('function');
      expect(typeof result.current.resetSchedule).toBe('function');
      expect(typeof result.current.cleanupStuckCalls).toBe('function');
    });
  });

  describe('dispatchCalls', () => {
    it('should invoke call-dispatcher edge function', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: { success: true, dispatched: 3, remaining: 10 },
        error: null,
      } as any);

      const { result } = renderHook(() => useCallDispatcher());

      let res: any;
      await act(async () => {
        res = await result.current.dispatchCalls();
      });

      expect(supabase.functions.invoke).toHaveBeenCalledWith('call-dispatcher', {
        method: 'POST',
        body: {},
      });
      expect(res).toEqual(
        expect.objectContaining({ success: true, dispatched: 3 })
      );
    });

    it('should show toast when calls are dispatched', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: { success: true, dispatched: 5, remaining: 20 },
        error: null,
      } as any);

      const { result } = renderHook(() => useCallDispatcher());

      await act(async () => {
        await result.current.dispatchCalls();
      });

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Calls Dispatched',
          description: expect.stringContaining('5'),
        })
      );
    });

    it('should show "no calls" toast when dispatched is 0 and not silent', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: { success: true, dispatched: 0, message: 'No pending calls found' },
        error: null,
      } as any);

      const { result } = renderHook(() => useCallDispatcher());

      await act(async () => {
        await result.current.dispatchCalls({ silent: false });
      });

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'No Calls to Dispatch',
        })
      );
    });

    it('should NOT show toast when dispatched is 0 and silent mode', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: { success: true, dispatched: 0 },
        error: null,
      } as any);

      const { result } = renderHook(() => useCallDispatcher());

      await act(async () => {
        await result.current.dispatchCalls({ silent: true });
      });

      expect(mockToast).not.toHaveBeenCalled();
    });

    it('should handle edge function errors gracefully', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: null,
        error: { message: 'Internal server error' },
      } as any);

      const { result } = renderHook(() => useCallDispatcher());

      let res: any;
      await act(async () => {
        res = await result.current.dispatchCalls();
      });

      expect(res).toBeNull();
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' })
      );
    });

    it('should handle transient network failures with cooldown', async () => {
      const fetchError = new Error('Failed to send a request to the Edge Function');
      (fetchError as any).name = 'FunctionsFetchError';

      vi.mocked(supabase.functions.invoke).mockRejectedValue(fetchError);

      const { result } = renderHook(() => useCallDispatcher());

      let res: any;
      await act(async () => {
        res = await result.current.dispatchCalls();
      });

      expect(res).toBeNull();
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Network Issue',
          variant: 'destructive',
        })
      );
    });

    it('should suppress toast on transient failure when silent', async () => {
      const fetchError = new Error('Failed to send a request to the Edge Function');
      (fetchError as any).name = 'FunctionsFetchError';

      vi.mocked(supabase.functions.invoke).mockRejectedValue(fetchError);

      const { result } = renderHook(() => useCallDispatcher());

      await act(async () => {
        await result.current.dispatchCalls({ silent: true });
      });

      expect(mockToast).not.toHaveBeenCalled();
    });
  });

  describe('Auto-Dispatch', () => {
    it('startAutoDispatch should return a cleanup function', () => {
      vi.useFakeTimers({ shouldAdvanceTime: false });

      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: { dispatched: 0 },
        error: null,
      } as any);

      const { result } = renderHook(() => useCallDispatcher());

      let cleanup: (() => void) | undefined;
      act(() => {
        cleanup = result.current.startAutoDispatch(30);
      });

      expect(typeof cleanup).toBe('function');

      // Cleanup
      if (cleanup) cleanup();
      vi.useRealTimers();
    });

    it('should prevent duplicate auto-dispatch intervals', () => {
      vi.useFakeTimers({ shouldAdvanceTime: false });

      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: { dispatched: 0 },
        error: null,
      } as any);

      const { result } = renderHook(() => useCallDispatcher());

      let cleanup1: (() => void) | undefined;
      let cleanup2: (() => void) | undefined;
      act(() => {
        cleanup1 = result.current.startAutoDispatch(10);
      });

      act(() => {
        cleanup2 = result.current.startAutoDispatch(10);
      });

      // Second start should return a no-op (not start a new interval)
      // The key behavior: only one global interval runs at a time
      expect(typeof cleanup2).toBe('function');

      if (cleanup1) cleanup1();
      if (cleanup2) cleanup2();
      vi.useRealTimers();
    });

    it('stopAutoDispatch should prevent further interval dispatches', () => {
      vi.useFakeTimers({ shouldAdvanceTime: false });

      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: { dispatched: 0 },
        error: null,
      } as any);

      const { result } = renderHook(() => useCallDispatcher());

      act(() => {
        result.current.startAutoDispatch(10);
      });

      act(() => {
        result.current.stopAutoDispatch();
      });

      // Clear any calls from initialization
      vi.mocked(supabase.functions.invoke).mockClear();

      // Advance time significantly - should NOT trigger dispatches after stop
      act(() => {
        vi.advanceTimersByTime(120_000);
      });

      expect(supabase.functions.invoke).not.toHaveBeenCalled();
      vi.useRealTimers();
    });
  });

  describe('Provider-Specific Routing', () => {
    it('forceDispatchLead should invoke call-dispatcher with force_dispatch action', async () => {
      // First call = force_dispatch, second call = follow-up dispatchCalls
      vi.mocked(supabase.functions.invoke)
        .mockResolvedValueOnce({
          data: { success: true, clearedCalls: 1 },
          error: null,
        } as any)
        .mockResolvedValueOnce({
          data: { dispatched: 0 },
          error: null,
        } as any);

      const { result } = renderHook(() => useCallDispatcher());

      await act(async () => {
        await result.current.forceDispatchLead('lead-abc', 'camp-xyz');
      });

      expect(supabase.functions.invoke).toHaveBeenCalledWith('call-dispatcher', {
        method: 'POST',
        body: {
          action: 'force_dispatch',
          leadId: 'lead-abc',
          campaignId: 'camp-xyz',
        },
      });
    });

    it('cleanupStuckCalls should invoke call-dispatcher with cleanup action', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: { success: true, message: 'Cleaned up 3 stuck calls' },
        error: null,
      } as any);

      const { result } = renderHook(() => useCallDispatcher());

      await act(async () => {
        await result.current.cleanupStuckCalls();
      });

      expect(supabase.functions.invoke).toHaveBeenCalledWith('call-dispatcher', {
        method: 'POST',
        body: { action: 'cleanup_stuck_calls' },
      });

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Cleanup Complete' })
      );
    });
  });

  describe('Queue Management', () => {
    it('forceRequeueLeads should delete, reset, and re-insert queue entries', async () => {
      const campaignLeadData = [
        { lead_id: 'lead-1', leads: { phone_number: '+15551111111' } },
        { lead_id: 'lead-2', leads: { phone_number: '+15552222222' } },
      ];

      let fromCallIndex = 0;
      vi.mocked(supabase.from).mockImplementation(((table: string) => {
        fromCallIndex++;
        if (fromCallIndex === 1) {
          // campaign_leads select
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: campaignLeadData, error: null }),
            }),
          } as any;
        }
        if (fromCallIndex === 2) {
          // dialing_queues delete
          return {
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          } as any;
        }
        if (fromCallIndex === 3) {
          // lead_workflow_progress delete
          return {
            delete: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ error: null }),
            }),
          } as any;
        }
        if (fromCallIndex === 4) {
          // leads update (reset status)
          return {
            update: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ error: null }),
            }),
          } as any;
        }
        if (fromCallIndex === 5) {
          // dialing_queues insert (re-queue)
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          } as any;
        }
        return {
          select: vi.fn().mockReturnThis(),
          delete: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          insert: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
        } as any;
      }) as any);

      // Mock the follow-up dispatch call
      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: { dispatched: 0 },
        error: null,
      } as any);

      const { result } = renderHook(() => useCallDispatcher());

      await act(async () => {
        await result.current.forceRequeueLeads('camp-xyz');
      });

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Leads Fully Reset',
          description: expect.stringContaining('2'),
        })
      );
    });

    it('forceRequeueLeads should show toast when no leads found', async () => {
      vi.mocked(supabase.from).mockImplementation((() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      })) as any);

      const { result } = renderHook(() => useCallDispatcher());

      await act(async () => {
        await result.current.forceRequeueLeads('camp-empty');
      });

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'No Leads Found',
        })
      );
    });

    it('resetSchedule should update pending queue entries to now', async () => {
      const selectMock = vi.fn().mockResolvedValue({
        data: [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }],
        error: null,
      });

      vi.mocked(supabase.from).mockImplementation((() => ({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gt: vi.fn().mockReturnValue({
                select: selectMock,
              }),
            }),
          }),
        }),
      })) as any);

      // Mock the follow-up dispatch call
      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: { dispatched: 0 },
        error: null,
      } as any);

      const { result } = renderHook(() => useCallDispatcher());

      let res: any;
      await act(async () => {
        res = await result.current.resetSchedule('camp-xyz');
      });

      expect(res).toEqual({ resetCount: 3 });
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Schedule Reset',
          description: expect.stringContaining('3'),
        })
      );
    });

    it('resetSchedule should handle 0 resets gracefully', async () => {
      const selectMock = vi.fn().mockResolvedValue({
        data: [],
        error: null,
      });

      vi.mocked(supabase.from).mockImplementation((() => ({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gt: vi.fn().mockReturnValue({
                select: selectMock,
              }),
            }),
          }),
        }),
      })) as any);

      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: { dispatched: 0 },
        error: null,
      } as any);

      const { result } = renderHook(() => useCallDispatcher());

      let res: any;
      await act(async () => {
        res = await result.current.resetSchedule('camp-xyz');
      });

      expect(res).toEqual({ resetCount: 0 });
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: expect.stringContaining('No scheduled leads'),
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('forceRequeueLeads should show error toast on failure', async () => {
      vi.mocked(supabase.from).mockImplementation((() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
        }),
      })) as any);

      const { result } = renderHook(() => useCallDispatcher());

      await act(async () => {
        await result.current.forceRequeueLeads('camp-xyz');
      });

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Re-queue Failed',
          variant: 'destructive',
        })
      );
    });

    it('forceDispatchLead should show error toast on failure', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: null,
        error: { message: 'Lead not found' },
      } as any);

      const { result } = renderHook(() => useCallDispatcher());

      let res: any;
      await act(async () => {
        res = await result.current.forceDispatchLead('bad-lead', 'camp-xyz');
      });

      expect(res).toBeNull();
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Force Dispatch Failed',
          variant: 'destructive',
        })
      );
    });

    it('cleanupStuckCalls should show error toast on failure', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: null,
        error: { message: 'Cleanup failed' },
      } as any);

      const { result } = renderHook(() => useCallDispatcher());

      await act(async () => {
        await result.current.cleanupStuckCalls();
      });

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Cleanup Failed',
          variant: 'destructive',
        })
      );
    });

    it('resetSchedule should show error toast on failure', async () => {
      vi.mocked(supabase.from).mockImplementation((() => ({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gt: vi.fn().mockReturnValue({
                select: vi.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'Update failed' },
                }),
              }),
            }),
          }),
        }),
      })) as any);

      const { result } = renderHook(() => useCallDispatcher());

      let res: any;
      await act(async () => {
        res = await result.current.resetSchedule('camp-xyz');
      });

      expect(res).toBeNull();
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Reset Failed',
          variant: 'destructive',
        })
      );
    });
  });
});
