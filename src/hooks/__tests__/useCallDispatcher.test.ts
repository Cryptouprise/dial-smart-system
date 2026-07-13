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

vi.mock('@/contexts/OrganizationContext', () => ({
  useCurrentOrganizationId: () => '11111111-1111-4111-8111-111111111111',
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
    it('fails closed without invoking the call-dispatcher edge function', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: { success: true, dispatched: 3, remaining: 10 },
        error: null,
      } as any);

      const { result } = renderHook(() => useCallDispatcher());

      let res: any;
      await act(async () => {
        res = await result.current.dispatchCalls();
      });

      expect(supabase.functions.invoke).not.toHaveBeenCalled();
      expect(res).toBeNull();
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Call dispatch is launch-locked',
          variant: 'destructive',
        })
      );
    });

    it('explains the browser dispatch launch lock', async () => {
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
          title: 'Call dispatch is launch-locked',
          description: expect.stringMatching(/no calls were started/i),
        })
      );
    });

    it('fails closed before evaluating provider queue state', async () => {
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
          title: 'Call dispatch is launch-locked',
        })
      );
      expect(supabase.functions.invoke).not.toHaveBeenCalled();
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

    it('does not touch the provider even when a provider failure is preconfigured', async () => {
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
          title: 'Call dispatch is launch-locked',
          variant: 'destructive',
        })
      );
      expect(supabase.functions.invoke).not.toHaveBeenCalled();
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
      expect(supabase.functions.invoke).not.toHaveBeenCalled();
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Auto-dispatch is launch-locked',
          variant: 'destructive',
        })
      );

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

  describe('Server-controlled maintenance actions', () => {
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
        body: {
          action: 'cleanup_stuck_calls',
          organizationId: '11111111-1111-4111-8111-111111111111',
        },
      });

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Cleanup Complete' })
      );
    });
  });

  describe('Launch-locked queue controls', () => {
    it('forceRequeueLeads fails closed without touching the database or dispatcher', async () => {
      const { result } = renderHook(() => useCallDispatcher());

      await act(async () => {
        await result.current.forceRequeueLeads('camp-xyz');
      });

      expect(supabase.from).not.toHaveBeenCalled();
      expect(supabase.functions.invoke).not.toHaveBeenCalled();
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Force re-queue is launch-locked',
          variant: 'destructive',
        })
      );
    });

    it('forceDispatchLead fails closed without invoking the dispatcher', async () => {
      const { result } = renderHook(() => useCallDispatcher());

      let response: unknown;
      await act(async () => {
        response = await result.current.forceDispatchLead('lead-abc', 'camp-xyz');
      });

      expect(response).toBeNull();
      expect(supabase.functions.invoke).not.toHaveBeenCalled();
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Force dispatch is launch-locked',
          variant: 'destructive',
        })
      );
    });

    it('resetSchedule fails closed without touching the database or dispatcher', async () => {
      const { result } = renderHook(() => useCallDispatcher());

      let response: unknown;
      await act(async () => {
        response = await result.current.resetSchedule('camp-xyz');
      });

      expect(response).toBeNull();
      expect(supabase.from).not.toHaveBeenCalled();
      expect(supabase.functions.invoke).not.toHaveBeenCalled();
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Schedule reset is launch-locked',
          variant: 'destructive',
        })
      );
    });
  });

  describe('Error Handling', () => {
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

  });
});
