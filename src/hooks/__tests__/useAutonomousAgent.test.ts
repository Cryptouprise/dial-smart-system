import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAutonomousAgent, AutonomousSettings, AutonomyLevel } from '../useAutonomousAgent';
import { supabase } from '@/integrations/supabase/client';
import { getSolarTestSettingsPreset } from '@/lib/autonomousSettingsPresets';

// The global setup.ts already mocks @/integrations/supabase/client and provides
// a default chain of select().eq().maybeSingle() → { data: null, error: null }.
// We override specific behaviors per test via vi.mocked helpers.

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// ---------- helpers ----------

const FAKE_USER_ID = 'user-uuid-123';

/** Simulate an authenticated user for supabase.auth.getUser() */
function mockAuthUser(userId = FAKE_USER_ID) {
  vi.mocked(supabase.auth.getUser).mockResolvedValue({
    data: { user: { id: userId } as any },
    error: null,
  } as any);
}

/** Simulate no authenticated user */
function mockNoUser() {
  vi.mocked(supabase.auth.getUser).mockResolvedValue({
    data: { user: null },
    error: null,
  } as any);
}

/**
 * Build a chainable mock for supabase.from() that resolves the terminal call
 * (maybeSingle, single, select with head, etc.) with the given data/error.
 *
 * The chain itself is thenable so that `const { error } = await supabase.from().upsert()`
 * works correctly.
 */
function mockFromChain(resolveWith: { data: any; error: any; count?: number }) {
  const chain: Record<string, any> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.upsert = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.lte = vi.fn().mockReturnValue(chain);
  chain.not = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolveWith);
  chain.single = vi.fn().mockResolvedValue(resolveWith);
  // Make the chain itself thenable so `await chain` resolves to resolveWith.
  // This is needed for patterns like `const { error } = await supabase.from().upsert()`.
  chain.then = vi.fn((resolve: any, reject?: any) =>
    Promise.resolve(resolveWith).then(resolve, reject),
  );
  return chain;
}

// ---------- tests ----------

describe('useAutonomousAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToast.mockReset();
    // Default: no user, empty DB responses
    mockNoUser();
    vi.mocked(supabase.from).mockReturnValue(mockFromChain({ data: null, error: null }) as any);
  });

  // ----- Initialization -----

  describe('initialization', () => {
    it('should return default settings when no user is logged in', async () => {
      const { result } = renderHook(() => useAutonomousAgent());

      // Wait for the initial useEffect (loadSettings + loadDecisionHistory) to settle
      await waitFor(() => {
        expect(result.current.settings).toBeDefined();
      });

      expect(result.current.settings.enabled).toBe(false);
      expect(result.current.settings.autonomy_level).toBe('suggestions_only');
      expect(result.current.settings.daily_goal_calls).toBe(100);
      expect(result.current.settings.daily_goal_appointments).toBe(5);
      expect(result.current.settings.daily_goal_conversations).toBe(20);
      expect(result.current.settings.max_daily_autonomous_actions).toBe(50);
    });

    it('should return default settings when DB returns null row', async () => {
      mockAuthUser();
      vi.mocked(supabase.from).mockReturnValue(
        mockFromChain({ data: null, error: null }) as any,
      );

      const { result } = renderHook(() => useAutonomousAgent());

      await waitFor(() => {
        expect(result.current.settings.enabled).toBe(false);
      });

      // Defaults should still be in place
      expect(result.current.settings.require_approval_for_high_priority).toBe(true);
      expect(result.current.settings.decision_tracking_enabled).toBe(true);
      expect(result.current.settings.learning_enabled).toBe(true);
    });

    it('should load settings from DB when user is authenticated', async () => {
      mockAuthUser();

      const savedSettings = {
        enabled: true,
        auto_execute_recommendations: true,
        auto_approve_script_changes: false,
        require_approval_for_high_priority: false,
        max_daily_autonomous_actions: 200,
        decision_tracking_enabled: true,
        autonomy_level: 'full_auto',
        daily_goal_appointments: 10,
        daily_goal_calls: 500,
        daily_goal_conversations: 50,
        learning_enabled: true,
        auto_optimize_campaigns: true,
        auto_prioritize_leads: true,
        manage_lead_journeys: true,
        enable_script_ab_testing: true,
        auto_optimize_calling_times: true,
        auto_adjust_pacing: true,
        enable_daily_planning: true,
        enable_strategic_insights: true,
        auto_create_rules_from_insights: true,
      };

      vi.mocked(supabase.from).mockReturnValue(
        mockFromChain({ data: savedSettings, error: null }) as any,
      );

      const { result } = renderHook(() => useAutonomousAgent());

      await waitFor(() => {
        expect(result.current.settings.enabled).toBe(true);
      });

      expect(result.current.settings.autonomy_level).toBe('full_auto');
      expect(result.current.settings.daily_goal_calls).toBe(500);
      expect(result.current.settings.daily_goal_appointments).toBe(10);
      expect(result.current.settings.max_daily_autonomous_actions).toBe(200);
      expect(result.current.settings.manage_lead_journeys).toBe(true);
      expect(result.current.settings.enable_daily_planning).toBe(true);
      expect(result.current.settings.enable_strategic_insights).toBe(true);
      expect(result.current.settings.auto_create_rules_from_insights).toBe(true);
    });

    it('should initialise isExecuting as false', () => {
      const { result } = renderHook(() => useAutonomousAgent());
      expect(result.current.isExecuting).toBe(false);
    });

    it('should initialise decisions as an empty array', () => {
      const { result } = renderHook(() => useAutonomousAgent());
      expect(result.current.decisions).toEqual([]);
    });
  });

  // ----- Settings Update -----

  describe('updateSettings', () => {
    it('should update settings and show success toast', async () => {
      mockAuthUser();
      const chain = mockFromChain({ data: null, error: null });
      vi.mocked(supabase.from).mockReturnValue(chain as any);

      const { result } = renderHook(() => useAutonomousAgent());
      await waitFor(() => expect(result.current.settings).toBeDefined());

      let success: boolean | undefined;
      await act(async () => {
        success = await result.current.updateSettings({ enabled: true });
      });

      expect(success).toBe(true);
      expect(chain.upsert).toHaveBeenCalled();
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Settings Updated',
          description: expect.stringContaining('Enabled'),
        }),
      );
    });

    it('should return false and show error toast when no user', async () => {
      mockNoUser();

      const { result } = renderHook(() => useAutonomousAgent());
      await waitFor(() => expect(result.current.settings).toBeDefined());

      let success: boolean | undefined;
      await act(async () => {
        success = await result.current.updateSettings({ enabled: true });
      });

      expect(success).toBe(false);
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Error',
          variant: 'destructive',
        }),
      );
    });

    it('should return false and show error toast on DB error', async () => {
      mockAuthUser();
      // First call (loadSettings on mount) succeeds with empty data
      const loadChain = mockFromChain({ data: null, error: null });
      vi.mocked(supabase.from).mockReturnValue(loadChain as any);

      const { result } = renderHook(() => useAutonomousAgent());
      await waitFor(() => expect(result.current.settings).toBeDefined());

      // Now switch to error chain for the updateSettings upsert
      const errorChain = mockFromChain({ data: null, error: { message: 'DB fail' } });
      vi.mocked(supabase.from).mockReturnValue(errorChain as any);

      let success: boolean | undefined;
      await act(async () => {
        success = await result.current.updateSettings({ enabled: true });
      });

      expect(success).toBe(false);
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Error',
          description: 'Failed to update settings',
          variant: 'destructive',
        }),
      );
    });

    it('should merge partial settings with existing ones', async () => {
      mockAuthUser();
      const chain = mockFromChain({ data: null, error: null });
      vi.mocked(supabase.from).mockReturnValue(chain as any);

      const { result } = renderHook(() => useAutonomousAgent());
      await waitFor(() => expect(result.current.settings).toBeDefined());

      await act(async () => {
        await result.current.updateSettings({ daily_goal_calls: 999 });
      });

      // The upsert call should include the merged settings
      expect(chain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          daily_goal_calls: 999,
          // Other defaults should be preserved
          daily_goal_appointments: 5,
        }),
        expect.anything(),
      );
    });
  });

  // ----- Autonomy Level Handling -----

  describe('autonomy level handling', () => {
    it.each<AutonomyLevel>(['full_auto', 'approval_required', 'suggestions_only'])(
      'should accept "%s" as a valid autonomy level',
      async (level) => {
        mockAuthUser();
        const chain = mockFromChain({ data: null, error: null });
        vi.mocked(supabase.from).mockReturnValue(chain as any);

        const { result } = renderHook(() => useAutonomousAgent());
        await waitFor(() => expect(result.current.settings).toBeDefined());

        await act(async () => {
          await result.current.updateSettings({ autonomy_level: level });
        });

        expect(chain.upsert).toHaveBeenCalledWith(
          expect.objectContaining({ autonomy_level: level }),
          expect.anything(),
        );
      },
    );

    it('should default to suggestions_only if DB returns undefined autonomy_level', async () => {
      mockAuthUser();
      vi.mocked(supabase.from).mockReturnValue(
        mockFromChain({
          data: { enabled: true, autonomy_level: undefined },
          error: null,
        }) as any,
      );

      const { result } = renderHook(() => useAutonomousAgent());

      await waitFor(() => {
        expect(result.current.settings.enabled).toBe(true);
      });

      expect(result.current.settings.autonomy_level).toBe('suggestions_only');
    });
  });

  // ----- Goal Tracking -----

  describe('goal tracking', () => {
    it('should expose daily call targets from settings', async () => {
      mockAuthUser();
      vi.mocked(supabase.from).mockReturnValue(
        mockFromChain({
          data: {
            daily_goal_calls: 300,
            daily_goal_appointments: 15,
            daily_goal_conversations: 40,
          },
          error: null,
        }) as any,
      );

      const { result } = renderHook(() => useAutonomousAgent());

      await waitFor(() => {
        expect(result.current.settings.daily_goal_calls).toBe(300);
      });

      expect(result.current.settings.daily_goal_appointments).toBe(15);
      expect(result.current.settings.daily_goal_conversations).toBe(40);
    });

    it('should allow updating goal targets', async () => {
      mockAuthUser();
      const chain = mockFromChain({ data: null, error: null });
      vi.mocked(supabase.from).mockReturnValue(chain as any);

      const { result } = renderHook(() => useAutonomousAgent());
      await waitFor(() => expect(result.current.settings).toBeDefined());

      await act(async () => {
        await result.current.updateSettings({
          daily_goal_calls: 2000,
          daily_goal_appointments: 20,
        });
      });

      expect(chain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          daily_goal_calls: 2000,
          daily_goal_appointments: 20,
        }),
        expect.anything(),
      );
    });
  });

  // ----- Engine Toggle -----

  describe('engine toggle', () => {
    it('should enable the engine via updateSettings', async () => {
      mockAuthUser();
      const chain = mockFromChain({ data: null, error: null });
      vi.mocked(supabase.from).mockReturnValue(chain as any);

      const { result } = renderHook(() => useAutonomousAgent());
      await waitFor(() => expect(result.current.settings).toBeDefined());

      await act(async () => {
        const ok = await result.current.updateSettings({ enabled: true });
        expect(ok).toBe(true);
      });

      expect(result.current.settings.enabled).toBe(true);
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: expect.stringContaining('Enabled'),
        }),
      );
    });

    it('should disable the engine via updateSettings', async () => {
      mockAuthUser();
      // Start with enabled=true from DB
      const loadChain = mockFromChain({
        data: { enabled: true },
        error: null,
      });
      vi.mocked(supabase.from).mockReturnValue(loadChain as any);

      const { result } = renderHook(() => useAutonomousAgent());
      await waitFor(() => expect(result.current.settings.enabled).toBe(true));

      // Now switch to a chain that allows upsert
      const saveChain = mockFromChain({ data: null, error: null });
      vi.mocked(supabase.from).mockReturnValue(saveChain as any);

      await act(async () => {
        const ok = await result.current.updateSettings({ enabled: false });
        expect(ok).toBe(true);
      });

      expect(result.current.settings.enabled).toBe(false);
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: expect.stringContaining('Disabled'),
        }),
      );
    });

    it('should block autonomous execution when engine is disabled', async () => {
      mockAuthUser();
      vi.mocked(supabase.from).mockReturnValue(
        mockFromChain({ data: { enabled: false }, error: null }) as any,
      );

      const { result } = renderHook(() => useAutonomousAgent());
      await waitFor(() => expect(result.current.settings.enabled).toBe(false));

      let executed: boolean | undefined;
      await act(async () => {
        executed = await result.current.executeRecommendation({
          recommendation: {
            nextBestAction: { type: 'call', message: 'test' },
            reasoning: ['test reasoning'],
          },
          leadId: 'lead-1',
          leadName: 'Test Lead',
          isAutonomous: true,
        });
      });

      expect(executed).toBe(false);
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Autonomous Mode Disabled',
        }),
      );
    });
  });

  // ----- Settings Preset Application -----

  describe('settings preset application', () => {
    it('should apply the solar test preset through updateSettings', async () => {
      mockAuthUser();
      const chain = mockFromChain({ data: null, error: null });
      vi.mocked(supabase.from).mockReturnValue(chain as any);

      const { result } = renderHook(() => useAutonomousAgent());
      await waitFor(() => expect(result.current.settings).toBeDefined());

      const preset = getSolarTestSettingsPreset();

      await act(async () => {
        const ok = await result.current.updateSettings(preset);
        expect(ok).toBe(true);
      });

      // Verify the upsert was called with preset values merged in
      expect(chain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: true,
          autonomy_level: 'full_auto',
          daily_goal_calls: 2000,
          max_daily_autonomous_actions: 2000,
          manage_lead_journeys: true,
          enable_script_ab_testing: true,
          auto_optimize_calling_times: true,
          auto_adjust_pacing: true,
          enable_daily_planning: true,
          enable_strategic_insights: true,
          auto_create_rules_from_insights: true,
        }),
        expect.anything(),
      );
    });

    it('should preserve non-preset settings when applying a preset', async () => {
      mockAuthUser();
      // Start with custom decision_tracking_enabled = false
      vi.mocked(supabase.from).mockReturnValue(
        mockFromChain({
          data: { decision_tracking_enabled: false, daily_goal_conversations: 99 },
          error: null,
        }) as any,
      );

      const { result } = renderHook(() => useAutonomousAgent());
      await waitFor(() => {
        expect(result.current.settings.daily_goal_conversations).toBe(99);
      });

      const saveChain = mockFromChain({ data: null, error: null });
      vi.mocked(supabase.from).mockReturnValue(saveChain as any);

      const preset = getSolarTestSettingsPreset();
      await act(async () => {
        await result.current.updateSettings(preset);
      });

      // Preset does not touch daily_goal_conversations, so it should remain 99
      expect(saveChain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          daily_goal_conversations: 99,
        }),
        expect.anything(),
      );
    });
  });

  // ----- Decision Logging -----

  describe('logDecision', () => {
    it('should not log when decision tracking is disabled', async () => {
      mockAuthUser();
      vi.mocked(supabase.from).mockReturnValue(
        mockFromChain({
          data: { decision_tracking_enabled: false },
          error: null,
        }) as any,
      );

      const { result } = renderHook(() => useAutonomousAgent());
      await waitFor(() => {
        expect(result.current.settings.decision_tracking_enabled).toBe(false);
      });

      const decision = await result.current.logDecision({
        lead_id: 'lead-1',
        lead_name: 'Test',
        decision_type: 'call',
        reasoning: 'test',
        action_taken: 'called',
      });

      expect(decision).toBeNull();
    });
  });

  // ----- Return Shape -----

  describe('return shape', () => {
    it('should expose all expected functions and state', () => {
      const { result } = renderHook(() => useAutonomousAgent());

      expect(result.current).toEqual(
        expect.objectContaining({
          isExecuting: expect.any(Boolean),
          settings: expect.any(Object),
          decisions: expect.any(Array),
          scriptSuggestions: expect.any(Array),
          loadSettings: expect.any(Function),
          updateSettings: expect.any(Function),
          logDecision: expect.any(Function),
          executeRecommendation: expect.any(Function),
          loadDecisionHistory: expect.any(Function),
          analyzeScriptPerformance: expect.any(Function),
          generateScriptSuggestions: expect.any(Function),
          applyScriptSuggestion: expect.any(Function),
          loadScriptSuggestions: expect.any(Function),
        }),
      );
    });
  });
});
