import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useConcurrencyManager } from '../useConcurrencyManager';

// Mock dependencies
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({
    user: { id: 'user-123', email: 'test@test.com' },
    userId: 'user-123',
    session: {},
    isLoading: false,
    isAuthenticated: true,
  }),
}));

const mockSupabase = vi.mocked(await import('@/integrations/supabase/client')).supabase;

describe('useConcurrencyManager', () => {
  let chainMock: any;

  beforeEach(() => {
    vi.clearAllMocks();

    chainMock = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    vi.mocked(mockSupabase.from).mockReturnValue(chainMock as any);

    // Mock realtime channel
    const channelMock = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn(),
    };
    (mockSupabase as any).channel = vi.fn().mockReturnValue(channelMock);

    vi.mocked(mockSupabase.functions.invoke).mockResolvedValue({
      data: null,
      error: null,
    } as any);
  });

  describe('Initial state', () => {
    it('should start with empty active calls', () => {
      const { result } = renderHook(() => useConcurrencyManager());

      expect(result.current.activeCalls).toEqual([]);
    });

    it('should start with empty active transfers', () => {
      const { result } = renderHook(() => useConcurrencyManager());

      expect(result.current.activeTransfers).toEqual([]);
    });

    it('should have default concurrency limit of 10', () => {
      const { result } = renderHook(() => useConcurrencyManager());

      expect(result.current.concurrencyLimit).toBe(10);
    });

    it('should not be in loading state initially', () => {
      const { result } = renderHook(() => useConcurrencyManager());

      expect(result.current.isLoading).toBe(false);
    });

    it('should expose all expected functions', () => {
      const { result } = renderHook(() => useConcurrencyManager());

      expect(typeof result.current.loadActiveCalls).toBe('function');
      expect(typeof result.current.loadActiveTransfers).toBe('function');
      expect(typeof result.current.getConcurrencySettings).toBe('function');
      expect(typeof result.current.updateConcurrencySettings).toBe('function');
      expect(typeof result.current.canMakeCall).toBe('function');
      expect(typeof result.current.canTransferToPlatform).toBe('function');
      expect(typeof result.current.getPlatformCapacity).toBe('function');
      expect(typeof result.current.getAllPlatformCapacities).toBe('function');
      expect(typeof result.current.calculateDialingRate).toBe('function');
      expect(typeof result.current.cleanupStuckCalls).toBe('function');
      expect(typeof result.current.cleanupStuckTransfers).toBe('function');
    });
  });

  describe('Concurrent call limit tracking', () => {
    it('should load active calls from database', async () => {
      const mockCalls = [
        { id: 'call-1', phone_number: '+15551234567', status: 'in_progress', created_at: new Date().toISOString(), retell_call_id: 'r-1' },
        { id: 'call-2', phone_number: '+15559876543', status: 'ringing', created_at: new Date().toISOString(), retell_call_id: 'r-2' },
      ];

      chainMock.order.mockResolvedValue({ data: mockCalls, error: null });

      const { result } = renderHook(() => useConcurrencyManager());

      let calls: any;
      await act(async () => {
        calls = await result.current.loadActiveCalls();
      });

      expect(calls).toHaveLength(2);
      expect(calls[0].id).toBe('call-1');
      expect(calls[0].phone_number).toBe('+15551234567');
      expect(calls[0].status).toBe('in_progress');
    });

    it('should only query recent calls (last 5 minutes)', async () => {
      chainMock.order.mockResolvedValue({ data: [], error: null });

      const { result } = renderHook(() => useConcurrencyManager());

      await act(async () => {
        await result.current.loadActiveCalls();
      });

      expect(mockSupabase.from).toHaveBeenCalledWith('call_logs');
      // The chain includes .gte('created_at', <5min ago timestamp>)
      expect(chainMock.gte).toHaveBeenCalledWith('created_at', expect.any(String));
    });

    it('should filter by active statuses only', async () => {
      chainMock.order.mockResolvedValue({ data: [], error: null });

      const { result } = renderHook(() => useConcurrencyManager());

      await act(async () => {
        await result.current.loadActiveCalls();
      });

      expect(chainMock.in).toHaveBeenCalledWith('status', ['initiated', 'ringing', 'in_progress']);
    });

    it('should return empty array on error', async () => {
      chainMock.order.mockResolvedValue({ data: null, error: new Error('DB error') });

      const { result } = renderHook(() => useConcurrencyManager());

      let calls: any;
      await act(async () => {
        calls = await result.current.loadActiveCalls();
      });

      expect(calls).toEqual([]);
    });
  });

  describe('Capacity calculations', () => {
    it('should calculate platform capacity for retell', async () => {
      // Mock settings query
      chainMock.maybeSingle.mockResolvedValue({
        data: {
          max_concurrent_calls: 50,
          calls_per_minute: 60,
          max_calls_per_agent: 5,
          enable_adaptive_pacing: true,
          retell_max_concurrent: 25,
          assistable_max_concurrent: 200,
          transfer_queue_enabled: true,
        },
        error: null,
      });

      // Mock active transfers (2 retell transfers active)
      chainMock.order.mockResolvedValue({
        data: [
          { id: 't-1', platform: 'retell', call_sid: 'cs-1', retell_call_id: 'rc-1', lead_id: 'l-1', transfer_number: '+1555', started_at: new Date().toISOString(), status: 'active' },
          { id: 't-2', platform: 'retell', call_sid: 'cs-2', retell_call_id: 'rc-2', lead_id: 'l-2', transfer_number: '+1556', started_at: new Date().toISOString(), status: 'active' },
        ],
        error: null,
      });

      const { result } = renderHook(() => useConcurrencyManager());

      let capacity: any;
      await act(async () => {
        capacity = await result.current.getPlatformCapacity('retell');
      });

      expect(capacity.max).toBe(25);
      expect(capacity.active).toBe(2);
      expect(capacity.available).toBe(23);
      expect(capacity.utilizationRate).toBe(8); // 2/25 = 8%
    });

    it('should calculate platform capacity for assistable', async () => {
      chainMock.maybeSingle.mockResolvedValue({
        data: {
          retell_max_concurrent: 25,
          assistable_max_concurrent: 200,
        },
        error: null,
      });

      // No active transfers
      chainMock.order.mockResolvedValue({ data: [], error: null });

      const { result } = renderHook(() => useConcurrencyManager());

      let capacity: any;
      await act(async () => {
        capacity = await result.current.getPlatformCapacity('assistable');
      });

      expect(capacity.max).toBe(200);
      expect(capacity.active).toBe(0);
      expect(capacity.available).toBe(200);
      expect(capacity.utilizationRate).toBe(0);
    });

    it('should get all platform capacities at once', async () => {
      chainMock.maybeSingle.mockResolvedValue({
        data: {
          retell_max_concurrent: 25,
          assistable_max_concurrent: 200,
        },
        error: null,
      });
      chainMock.order.mockResolvedValue({ data: [], error: null });

      const { result } = renderHook(() => useConcurrencyManager());

      let capacities: any;
      await act(async () => {
        capacities = await result.current.getAllPlatformCapacities();
      });

      expect(capacities).toHaveProperty('retell');
      expect(capacities).toHaveProperty('assistable');
      expect(capacities.retell.max).toBe(25);
      expect(capacities.assistable.max).toBe(200);
    });

    it('should clamp available to zero when over capacity', async () => {
      chainMock.maybeSingle.mockResolvedValue({
        data: { retell_max_concurrent: 2, assistable_max_concurrent: 200 },
        error: null,
      });

      // 5 active retell transfers but max is 2
      const transfers = Array.from({ length: 5 }, (_, i) => ({
        id: `t-${i}`, platform: 'retell', call_sid: `cs-${i}`, retell_call_id: `rc-${i}`,
        lead_id: `l-${i}`, transfer_number: `+155${i}`, started_at: new Date().toISOString(), status: 'active',
      }));
      chainMock.order.mockResolvedValue({ data: transfers, error: null });

      const { result } = renderHook(() => useConcurrencyManager());

      let capacity: any;
      await act(async () => {
        capacity = await result.current.getPlatformCapacity('retell');
      });

      expect(capacity.available).toBe(0);
      expect(capacity.active).toBe(5);
    });
  });

  describe('Max concurrent calls enforcement', () => {
    it('should allow calls when under limit', async () => {
      // Settings: max 50 concurrent
      chainMock.maybeSingle.mockResolvedValue({
        data: { max_concurrent_calls: 50 },
        error: null,
      });

      // Only 3 active calls
      chainMock.order.mockResolvedValue({
        data: [
          { id: 'c-1', phone_number: '+1', status: 'in_progress', created_at: new Date().toISOString(), retell_call_id: null },
          { id: 'c-2', phone_number: '+2', status: 'ringing', created_at: new Date().toISOString(), retell_call_id: null },
          { id: 'c-3', phone_number: '+3', status: 'initiated', created_at: new Date().toISOString(), retell_call_id: null },
        ],
        error: null,
      });

      const { result } = renderHook(() => useConcurrencyManager());

      let canCall: boolean = false;
      await act(async () => {
        canCall = await result.current.canMakeCall();
      });

      expect(canCall).toBe(true);
    });

    it('should block calls when at limit', async () => {
      chainMock.maybeSingle.mockResolvedValue({
        data: { max_concurrent_calls: 2 },
        error: null,
      });

      chainMock.order.mockResolvedValue({
        data: [
          { id: 'c-1', phone_number: '+1', status: 'in_progress', created_at: new Date().toISOString(), retell_call_id: null },
          { id: 'c-2', phone_number: '+2', status: 'ringing', created_at: new Date().toISOString(), retell_call_id: null },
        ],
        error: null,
      });

      const { result } = renderHook(() => useConcurrencyManager());

      let canCall: boolean = true;
      await act(async () => {
        canCall = await result.current.canMakeCall();
      });

      expect(canCall).toBe(false);
    });

    it('should check platform transfer capacity', async () => {
      chainMock.maybeSingle.mockResolvedValue({
        data: { retell_max_concurrent: 1, assistable_max_concurrent: 200 },
        error: null,
      });

      // 1 active retell transfer = at limit
      chainMock.order.mockResolvedValue({
        data: [
          { id: 't-1', platform: 'retell', call_sid: 'cs-1', retell_call_id: 'rc-1', lead_id: 'l-1', transfer_number: '+1', started_at: new Date().toISOString(), status: 'active' },
        ],
        error: null,
      });

      const { result } = renderHook(() => useConcurrencyManager());

      let canTransfer: boolean = true;
      await act(async () => {
        canTransfer = await result.current.canTransferToPlatform('retell');
      });

      expect(canTransfer).toBe(false);
    });
  });

  describe('Platform capacity settings', () => {
    it('should load concurrency settings from database', async () => {
      const dbSettings = {
        max_concurrent_calls: 100,
        calls_per_minute: 120,
        max_calls_per_agent: 10,
        enable_adaptive_pacing: false,
        retell_max_concurrent: 50,
        assistable_max_concurrent: 500,
        transfer_queue_enabled: false,
      };
      chainMock.maybeSingle.mockResolvedValue({ data: dbSettings, error: null });

      const { result } = renderHook(() => useConcurrencyManager());

      let settings: any;
      await act(async () => {
        settings = await result.current.getConcurrencySettings();
      });

      expect(settings.maxConcurrentCalls).toBe(100);
      expect(settings.callsPerMinute).toBe(120);
      expect(settings.maxCallsPerAgent).toBe(10);
      expect(settings.enableAdaptivePacing).toBe(false);
      expect(settings.retellMaxConcurrent).toBe(50);
      expect(settings.assistableMaxConcurrent).toBe(500);
      expect(settings.transferQueueEnabled).toBe(false);
    });

    it('should return defaults when no settings exist', async () => {
      chainMock.maybeSingle.mockResolvedValue({ data: null, error: null });

      const { result } = renderHook(() => useConcurrencyManager());

      let settings: any;
      await act(async () => {
        settings = await result.current.getConcurrencySettings();
      });

      expect(settings.maxConcurrentCalls).toBe(50);
      expect(settings.callsPerMinute).toBe(60);
      expect(settings.maxCallsPerAgent).toBe(5);
      expect(settings.enableAdaptivePacing).toBe(true);
      expect(settings.retellMaxConcurrent).toBe(25);
      expect(settings.assistableMaxConcurrent).toBe(200);
      expect(settings.transferQueueEnabled).toBe(true);
    });

    it('should return defaults on database error', async () => {
      chainMock.maybeSingle.mockResolvedValue({ data: null, error: new Error('Connection failed') });

      const { result } = renderHook(() => useConcurrencyManager());

      let settings: any;
      await act(async () => {
        settings = await result.current.getConcurrencySettings();
      });

      expect(settings.maxConcurrentCalls).toBe(50);
      expect(settings.retellMaxConcurrent).toBe(25);
    });

    it('should cache settings after first load', async () => {
      chainMock.maybeSingle.mockResolvedValue({
        data: { max_concurrent_calls: 75, retell_max_concurrent: 30 },
        error: null,
      });

      const { result } = renderHook(() => useConcurrencyManager());

      await act(async () => {
        await result.current.getConcurrencySettings();
      });

      // Reset mock to verify it's not called again
      vi.mocked(mockSupabase.from).mockClear();

      await act(async () => {
        const cached = await result.current.getConcurrencySettings();
        expect(cached.maxConcurrentCalls).toBe(75);
      });

      // from('system_settings') should not have been called again
      const systemSettingsCalls = vi.mocked(mockSupabase.from).mock.calls.filter(
        (c) => c[0] === ('system_settings' as any),
      );
      expect(systemSettingsCalls).toHaveLength(0);
    });

    it('should update concurrency settings', async () => {
      chainMock.maybeSingle.mockResolvedValue({ data: null, error: null });

      const { result } = renderHook(() => useConcurrencyManager());

      let success: boolean = false;
      await act(async () => {
        success = await result.current.updateConcurrencySettings({
          maxConcurrentCalls: 100,
          callsPerMinute: 80,
        });
      });

      expect(success).toBe(true);
      expect(mockSupabase.from).toHaveBeenCalledWith('system_settings');
    });

    it('should invalidate cache on settings update', async () => {
      // Load initial settings into cache
      chainMock.maybeSingle.mockResolvedValue({
        data: { max_concurrent_calls: 50 },
        error: null,
      });

      const { result } = renderHook(() => useConcurrencyManager());

      await act(async () => {
        await result.current.getConcurrencySettings();
      });

      // Update settings (invalidates cache)
      await act(async () => {
        await result.current.updateConcurrencySettings({ maxConcurrentCalls: 100 });
      });

      // Next getConcurrencySettings should hit DB again (cache invalidated)
      vi.mocked(mockSupabase.from).mockClear();
      chainMock.maybeSingle.mockResolvedValue({
        data: { max_concurrent_calls: 100 },
        error: null,
      });
      vi.mocked(mockSupabase.from).mockReturnValue(chainMock as any);

      await act(async () => {
        const fresh = await result.current.getConcurrencySettings();
        expect(fresh.maxConcurrentCalls).toBe(100);
      });
    });
  });

  describe('Dialing rate calculation', () => {
    it('should recommend increased rate at low utilization', async () => {
      chainMock.maybeSingle.mockResolvedValue({
        data: { max_concurrent_calls: 50, calls_per_minute: 30 },
        error: null,
      });

      // 5 active calls out of 50 = 10% utilization
      chainMock.order.mockResolvedValue({
        data: Array.from({ length: 5 }, (_, i) => ({
          id: `c-${i}`, phone_number: `+1555000000${i}`, status: 'in_progress',
          created_at: new Date().toISOString(), retell_call_id: null,
        })),
        error: null,
      });

      const { result } = renderHook(() => useConcurrencyManager());

      let rate: any;
      await act(async () => {
        rate = await result.current.calculateDialingRate();
      });

      expect(rate.currentConcurrency).toBe(5);
      expect(rate.maxConcurrency).toBe(50);
      expect(rate.utilizationRate).toBe(10);
      // At <50% utilization, recommended rate should be higher (1.5x, capped at 50)
      expect(rate.recommendedRate).toBe(Math.round(Math.min(30 * 1.5, 50)));
      expect(rate.availableSlots).toBe(45);
    });

    it('should recommend decreased rate at high utilization', async () => {
      chainMock.maybeSingle.mockResolvedValue({
        data: { max_concurrent_calls: 10, calls_per_minute: 40 },
        error: null,
      });

      // 10 active calls out of 10 = 100% utilization
      chainMock.order.mockResolvedValue({
        data: Array.from({ length: 10 }, (_, i) => ({
          id: `c-${i}`, phone_number: `+1${i}`, status: 'in_progress',
          created_at: new Date().toISOString(), retell_call_id: null,
        })),
        error: null,
      });

      const { result } = renderHook(() => useConcurrencyManager());

      let rate: any;
      await act(async () => {
        rate = await result.current.calculateDialingRate();
      });

      expect(rate.utilizationRate).toBe(100);
      // At >90% utilization, rate should decrease (0.7x, min 10)
      expect(rate.recommendedRate).toBe(Math.round(Math.max(40 * 0.7, 10)));
    });

    it('should keep rate stable at moderate utilization', async () => {
      chainMock.maybeSingle.mockResolvedValue({
        data: { max_concurrent_calls: 50, calls_per_minute: 30 },
        error: null,
      });

      // 30 active calls out of 50 = 60% utilization (between 50% and 90%)
      chainMock.order.mockResolvedValue({
        data: Array.from({ length: 30 }, (_, i) => ({
          id: `c-${i}`, phone_number: `+1${i}`, status: 'in_progress',
          created_at: new Date().toISOString(), retell_call_id: null,
        })),
        error: null,
      });

      const { result } = renderHook(() => useConcurrencyManager());

      let rate: any;
      await act(async () => {
        rate = await result.current.calculateDialingRate();
      });

      expect(rate.utilizationRate).toBe(60);
      expect(rate.recommendedRate).toBe(30); // unchanged
    });
  });

  describe('Cleanup operations', () => {
    it('should clean up stuck calls via edge function', async () => {
      vi.mocked(mockSupabase.functions.invoke).mockResolvedValue({
        data: { cleaned: 3, message: 'Cleaned up 3 stuck calls' },
        error: null,
      } as any);
      chainMock.order.mockResolvedValue({ data: [], error: null });

      const { result } = renderHook(() => useConcurrencyManager());

      let cleanupResult: any;
      await act(async () => {
        cleanupResult = await result.current.cleanupStuckCalls();
      });

      expect(mockSupabase.functions.invoke).toHaveBeenCalledWith('call-dispatcher', {
        body: { action: 'cleanup_stuck_calls' },
      });
      expect(cleanupResult.cleaned).toBe(3);
    });

    it('should clean up stuck transfers older than 30 minutes', async () => {
      const stuckTransfers = [
        { id: 't-old', status: 'completed', ended_at: expect.any(String) },
      ];
      const selectMock = vi.fn().mockResolvedValue({ data: stuckTransfers, error: null });
      chainMock.lt.mockReturnValue({ select: selectMock });
      chainMock.order.mockResolvedValue({ data: [], error: null });

      const { result } = renderHook(() => useConcurrencyManager());

      await act(async () => {
        await result.current.cleanupStuckTransfers();
      });

      expect(mockSupabase.from).toHaveBeenCalledWith('active_ai_transfers');
    });

    it('should return null on cleanup error', async () => {
      vi.mocked(mockSupabase.functions.invoke).mockResolvedValue({
        data: null,
        error: new Error('Cleanup failed'),
      } as any);

      const { result } = renderHook(() => useConcurrencyManager());

      let cleanupResult: any;
      await act(async () => {
        cleanupResult = await result.current.cleanupStuckCalls();
      });

      expect(cleanupResult).toBeNull();
    });
  });

  describe('Real-time subscriptions', () => {
    it('should subscribe to call_logs changes on mount', () => {
      renderHook(() => useConcurrencyManager());

      expect((mockSupabase as any).channel).toHaveBeenCalledWith('call_logs_changes');
    });

    it('should subscribe to active_ai_transfers changes on mount', () => {
      renderHook(() => useConcurrencyManager());

      expect((mockSupabase as any).channel).toHaveBeenCalledWith('active_ai_transfers_changes');
    });
  });
});
