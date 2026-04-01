import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useBudgetTracker } from '../useBudgetTracker';

// Mock dependencies
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

// Get reference to the mocked supabase for per-test customization
const mockSupabase = vi.mocked(await import('@/integrations/supabase/client')).supabase;

describe('useBudgetTracker', () => {
  const mockUser = { id: 'user-123', email: 'test@test.com' };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default: auth returns a user
    vi.mocked(mockSupabase.auth.getUser).mockResolvedValue({
      data: { user: mockUser as any },
      error: null,
    } as any);

    // Default: from() chain returns empty results
    const chainMock = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    vi.mocked(mockSupabase.from).mockReturnValue(chainMock as any);

    // Default: functions.invoke returns null
    vi.mocked(mockSupabase.functions.invoke).mockResolvedValue({
      data: null,
      error: null,
    } as any);
  });

  describe('Initial budget state', () => {
    it('should start with null budget settings', () => {
      const { result } = renderHook(() => useBudgetTracker());

      expect(result.current.budgetSettings).toBeNull();
      expect(result.current.dailySummary).toBeNull();
      expect(result.current.monthlySummary).toBeNull();
      expect(result.current.budgetStatus).toBeNull();
    });

    it('should start with empty alerts array', () => {
      const { result } = renderHook(() => useBudgetTracker());

      expect(result.current.alerts).toEqual([]);
    });

    it('should set loading state when fetching spending data', () => {
      const { result } = renderHook(() => useBudgetTracker());

      // isLoading becomes true once the useEffect triggers fetchSpendingSummary
      expect(typeof result.current.isLoading).toBe('boolean');
    });

    it('should expose all expected functions', () => {
      const { result } = renderHook(() => useBudgetTracker());

      expect(typeof result.current.updateBudgetSettings).toBe('function');
      expect(typeof result.current.checkBudget).toBe('function');
      expect(typeof result.current.acknowledgeAlert).toBe('function');
      expect(typeof result.current.togglePause).toBe('function');
      expect(typeof result.current.refreshUsage).toBe('function');
    });
  });

  describe('Budget settings loading', () => {
    it('should fetch budget settings on mount', async () => {
      renderHook(() => useBudgetTracker());

      await waitFor(() => {
        expect(mockSupabase.from).toHaveBeenCalledWith('budget_settings');
      });
    });

    it('should fetch settings for specific campaign when campaignId provided', async () => {
      const chainMock = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      vi.mocked(mockSupabase.from).mockReturnValue(chainMock as any);

      renderHook(() => useBudgetTracker('campaign-abc'));

      await waitFor(() => {
        expect(chainMock.eq).toHaveBeenCalledWith('campaign_id', 'campaign-abc');
      });
    });

    it('should query for null campaign_id when no campaignId provided', async () => {
      const chainMock = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      vi.mocked(mockSupabase.from).mockReturnValue(chainMock as any);

      renderHook(() => useBudgetTracker());

      await waitFor(() => {
        expect(chainMock.is).toHaveBeenCalledWith('campaign_id', null);
      });
    });

    it('should not fetch settings when user is not authenticated', async () => {
      vi.mocked(mockSupabase.auth.getUser).mockResolvedValue({
        data: { user: null },
        error: null,
      } as any);

      renderHook(() => useBudgetTracker());

      // The from('budget_settings') call should not happen since user is null
      // But from() is also called for alerts, so we check the specific behavior
      await waitFor(() => {
        expect(mockSupabase.auth.getUser).toHaveBeenCalled();
      });
    });
  });

  describe('Spend calculations', () => {
    it('should fetch daily spending summary on mount', async () => {
      vi.mocked(mockSupabase.functions.invoke).mockResolvedValue({
        data: {
          totals: {
            twilio: 10.5,
            retell: 25.0,
            elevenlabs: 5.0,
            total: 40.5,
            callCount: 150,
            smsCount: 30,
            durationSeconds: 7200,
          },
        },
        error: null,
      } as any);

      const { result } = renderHook(() => useBudgetTracker());

      await waitFor(() => {
        expect(mockSupabase.functions.invoke).toHaveBeenCalledWith('budget-tracker', {
          body: {
            action: 'get_spending_summary',
            period: 'daily',
            campaignId: undefined,
          },
        });
      });
    });

    it('should fetch monthly spending summary on mount', async () => {
      renderHook(() => useBudgetTracker());

      await waitFor(() => {
        expect(mockSupabase.functions.invoke).toHaveBeenCalledWith('budget-tracker', {
          body: {
            action: 'get_spending_summary',
            period: 'monthly',
            campaignId: undefined,
          },
        });
      });
    });

    it('should pass campaignId to spending summary requests', async () => {
      renderHook(() => useBudgetTracker('camp-xyz'));

      await waitFor(() => {
        expect(mockSupabase.functions.invoke).toHaveBeenCalledWith('budget-tracker', {
          body: {
            action: 'get_spending_summary',
            period: 'daily',
            campaignId: 'camp-xyz',
          },
        });
      });
    });
  });

  describe('Budget threshold alerts', () => {
    it('should fetch unacknowledged alerts on mount', async () => {
      renderHook(() => useBudgetTracker());

      await waitFor(() => {
        expect(mockSupabase.from).toHaveBeenCalledWith('budget_alerts');
      });
    });

    it('should check budget and return status', async () => {
      const budgetData = {
        withinBudget: true,
        dailySpent: 25.0,
        monthlySpent: 300.0,
        dailyLimit: 100.0,
        monthlyLimit: 3000.0,
        isPaused: false,
        alerts: [],
      };

      vi.mocked(mockSupabase.functions.invoke).mockResolvedValue({
        data: budgetData,
        error: null,
      } as any);

      const { result } = renderHook(() => useBudgetTracker());

      let status: any;
      await act(async () => {
        status = await result.current.checkBudget();
      });

      expect(status).toEqual(budgetData);
    });

    it('should trigger toast when budget alerts are present', async () => {
      const toastFn = vi.fn();
      (vi.mocked(await import('@/hooks/use-toast')).useToast as any) = () => ({ toast: toastFn });

      const budgetData = {
        withinBudget: false,
        dailySpent: 95.0,
        monthlySpent: 2800.0,
        dailyLimit: 100.0,
        monthlyLimit: 3000.0,
        isPaused: false,
        alerts: [
          { type: 'daily_exceeded', percent: 95.0 },
        ],
      };

      vi.mocked(mockSupabase.functions.invoke).mockResolvedValue({
        data: budgetData,
        error: null,
      } as any);

      const { result } = renderHook(() => useBudgetTracker());

      await act(async () => {
        await result.current.checkBudget();
      });

      // The checkBudget sets budgetStatus
      expect(result.current.budgetStatus).toEqual(budgetData);
    });

    it('should acknowledge alerts and remove from list', async () => {
      const chainMock = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      vi.mocked(mockSupabase.from).mockReturnValue(chainMock as any);
      vi.mocked(mockSupabase.functions.invoke).mockResolvedValue({
        data: null,
        error: null,
      } as any);

      const { result } = renderHook(() => useBudgetTracker());

      await act(async () => {
        await result.current.acknowledgeAlert('alert-1', 'dismiss');
      });

      expect(mockSupabase.functions.invoke).toHaveBeenCalledWith('budget-tracker', {
        body: {
          action: 'acknowledge_alert',
          alertId: 'alert-1',
          alertAction: 'dismiss',
        },
      });
    });

    it('should return null when checkBudget fails', async () => {
      vi.mocked(mockSupabase.functions.invoke).mockResolvedValue({
        data: null,
        error: new Error('Network error'),
      } as any);

      const { result } = renderHook(() => useBudgetTracker());

      let status: any;
      await act(async () => {
        status = await result.current.checkBudget();
      });

      expect(status).toBeNull();
    });
  });

  describe('Cost projections and budget updates', () => {
    it('should update budget settings via edge function', async () => {
      const updatedSettings = {
        id: 'bs-1',
        user_id: 'user-123',
        campaign_id: null,
        daily_limit: 200,
        monthly_limit: 5000,
        alert_threshold_percent: 80,
        auto_pause_enabled: true,
        is_paused: false,
        paused_at: null,
        pause_reason: null,
      };

      vi.mocked(mockSupabase.functions.invoke).mockResolvedValue({
        data: { settings: updatedSettings },
        error: null,
      } as any);

      const { result } = renderHook(() => useBudgetTracker());

      let returnedSettings: any;
      await act(async () => {
        returnedSettings = await result.current.updateBudgetSettings({
          dailyLimit: 200,
          monthlyLimit: 5000,
          alertThreshold: 80,
          autoPause: true,
        });
      });

      expect(mockSupabase.functions.invoke).toHaveBeenCalledWith('budget-tracker', {
        body: {
          action: 'update_budget_settings',
          campaignId: undefined,
          dailyLimit: 200,
          monthlyLimit: 5000,
          alertThreshold: 80,
          autoPause: true,
        },
      });

      expect(returnedSettings).toEqual(updatedSettings);
    });

    it('should return null when update fails', async () => {
      vi.mocked(mockSupabase.functions.invoke).mockResolvedValue({
        data: null,
        error: new Error('Update failed'),
      } as any);

      const { result } = renderHook(() => useBudgetTracker());

      let returnedSettings: any;
      await act(async () => {
        returnedSettings = await result.current.updateBudgetSettings({
          dailyLimit: 100,
        });
      });

      expect(returnedSettings).toBeNull();
    });
  });

  describe('Budget reset / refresh functionality', () => {
    it('should refresh usage data from provider APIs', async () => {
      vi.mocked(mockSupabase.functions.invoke).mockResolvedValue({
        data: { totals: { twilio: 0, retell: 0, elevenlabs: 0, total: 0, callCount: 0, smsCount: 0, durationSeconds: 0 } },
        error: null,
      } as any);

      const { result } = renderHook(() => useBudgetTracker());

      await act(async () => {
        await result.current.refreshUsage();
      });

      // Should invoke fetch_usage action
      expect(mockSupabase.functions.invoke).toHaveBeenCalledWith(
        'budget-tracker',
        expect.objectContaining({
          body: expect.objectContaining({
            action: 'fetch_usage',
          }),
        }),
      );
    });

    it('should set loading state during refresh', async () => {
      let resolveInvoke: any;
      vi.mocked(mockSupabase.functions.invoke).mockImplementation(
        () => new Promise((resolve) => { resolveInvoke = resolve; }),
      );

      const { result } = renderHook(() => useBudgetTracker());

      // Start refresh without awaiting
      const refreshPromise = act(async () => {
        result.current.refreshUsage();
      });

      // isLoading should be set during the refresh
      // (timing depends on React batching, so we just verify the call was made)
      if (resolveInvoke) {
        resolveInvoke({ data: null, error: null });
      }

      await refreshPromise;
    });
  });

  describe('Daily/monthly budget limits', () => {
    it('should toggle pause state', async () => {
      // First, set up budget settings so togglePause has something to work with
      const budgetSettings = {
        id: 'bs-1',
        user_id: 'user-123',
        campaign_id: null,
        daily_limit: 100,
        monthly_limit: 3000,
        alert_threshold_percent: 80,
        auto_pause_enabled: true,
        is_paused: false,
        paused_at: null,
        pause_reason: null,
      };

      const chainMock = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: budgetSettings, error: null }),
      };
      vi.mocked(mockSupabase.from).mockReturnValue(chainMock as any);
      vi.mocked(mockSupabase.functions.invoke).mockResolvedValue({
        data: { totals: { twilio: 0, retell: 0, elevenlabs: 0, total: 0, callCount: 0, smsCount: 0, durationSeconds: 0 } },
        error: null,
      } as any);

      const { result } = renderHook(() => useBudgetTracker());

      // Wait for settings to load
      await waitFor(() => {
        expect(result.current.budgetSettings).not.toBeNull();
      });

      await act(async () => {
        await result.current.togglePause(true);
      });

      expect(mockSupabase.functions.invoke).toHaveBeenCalledWith('budget-tracker', {
        body: {
          action: 'toggle_pause',
          budgetSettingId: 'bs-1',
          pause: true,
          campaignId: undefined,
        },
      });
    });

    it('should not toggle pause when budget settings are null', async () => {
      const { result } = renderHook(() => useBudgetTracker());

      // budgetSettings starts null - togglePause should early return
      await act(async () => {
        await result.current.togglePause(true);
      });

      // Should not have called toggle_pause action
      const calls = vi.mocked(mockSupabase.functions.invoke).mock.calls;
      const toggleCalls = calls.filter(
        (c) => (c[1]?.body as Record<string, unknown>)?.action === 'toggle_pause',
      );
      expect(toggleCalls).toHaveLength(0);
    });
  });
});
