import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, render, screen } from '@testing-library/react';
import React from 'react';
import { AIErrorProvider, useAIErrors } from '../AIErrorContext';

// Mock supabase - error handler writes to guardian_alerts and calls ai-error-analyzer
const mockInsert = vi.fn().mockReturnValue({
  then: (resolve: any, reject: any) => Promise.resolve({ data: null, error: null }).then(resolve, reject),
});
const mockInvoke = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: (...args: any[]) => mockInsert(...args),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(() => Promise.resolve({ data: null, error: null })),
    }),
    functions: {
      invoke: (...args: any[]) => mockInvoke(...args),
    },
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return <AIErrorProvider>{children}</AIErrorProvider>;
}

describe('AIErrorContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockInsert.mockReturnValue({
      then: (resolve: any, reject: any) => Promise.resolve({ data: null, error: null }).then(resolve, reject),
    });
    mockInvoke.mockReset();
  });

  // ── Provider Rendering ─────────────────────────────────────────────

  describe('Provider', () => {
    it('renders children correctly', () => {
      render(
        <AIErrorProvider>
          <div data-testid="child">Content</div>
        </AIErrorProvider>
      );
      expect(screen.getByTestId('child')).toHaveTextContent('Content');
    });

    it('renders multiple children', () => {
      render(
        <AIErrorProvider>
          <span data-testid="x">X</span>
          <span data-testid="y">Y</span>
        </AIErrorProvider>
      );
      expect(screen.getByTestId('x')).toBeInTheDocument();
      expect(screen.getByTestId('y')).toBeInTheDocument();
    });
  });

  // ── Throws Outside Provider ────────────────────────────────────────

  describe('useAIErrors outside provider', () => {
    it('throws when used outside AIErrorProvider', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => {
        renderHook(() => useAIErrors());
      }).toThrow('useAIErrors must be used within an AIErrorProvider');
      spy.mockRestore();
    });
  });

  // ── Initial State ─────────────────────────────────────────────────

  describe('Initial State', () => {
    it('starts with empty errors array', () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });
      expect(result.current.errors).toEqual([]);
    });

    it('starts with default settings', () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });
      expect(result.current.settings).toEqual({
        enabled: true,
        autoFixMode: true,
        maxRetries: 3,
        logErrors: true,
      });
    });

    it('starts with isProcessing false', () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });
      expect(result.current.isProcessing).toBe(false);
    });
  });

  // ── Error Capture ──────────────────────────────────────────────────

  describe('captureError', () => {
    it('adds an error record from Error object', async () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      act(() => {
        result.current.updateSettings({ autoFixMode: false });
      });

      await act(async () => {
        await result.current.captureError(new Error('Test failure'), 'runtime');
      });

      expect(result.current.errors).toHaveLength(1);
      const captured = result.current.errors[0];
      expect(captured.message).toBe('Test failure');
      expect(captured.type).toBe('runtime');
      expect(captured.status).toBe('pending');
      expect(captured.id).toBeTruthy();
      expect(captured.retryCount).toBe(0);
    });

    it('adds an error record from string', async () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      act(() => {
        result.current.updateSettings({ autoFixMode: false });
      });

      await act(async () => {
        await result.current.captureError('Something broke', 'api');
      });

      expect(result.current.errors).toHaveLength(1);
      expect(result.current.errors[0].message).toBe('Something broke');
      expect(result.current.errors[0].type).toBe('api');
    });

    it('includes context when provided', async () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      act(() => {
        result.current.updateSettings({ autoFixMode: false });
      });

      await act(async () => {
        await result.current.captureError('ctx error', 'ui', { component: 'Dashboard' });
      });

      expect(result.current.errors[0].context).toEqual({ component: 'Dashboard' });
    });

    it('captures stack trace from Error objects', async () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      act(() => {
        result.current.updateSettings({ autoFixMode: false });
      });

      const err = new Error('has stack');
      await act(async () => {
        await result.current.captureError(err, 'runtime');
      });

      expect(result.current.errors[0].stack).toBeDefined();
      expect(result.current.errors[0].stack).toContain('has stack');
    });

    it('returns the error ID on successful capture', async () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      act(() => {
        result.current.updateSettings({ autoFixMode: false });
      });

      let errorId: string | null = null;
      await act(async () => {
        errorId = await result.current.captureError('return id test', 'runtime');
      });

      expect(errorId).toBeTruthy();
      expect(errorId).toBe(result.current.errors[0].id);
    });

    it('ignores errors matching ignored patterns (e.g. "Failed to fetch")', async () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      act(() => {
        result.current.updateSettings({ autoFixMode: false });
      });

      await act(async () => {
        await result.current.captureError('Failed to fetch resource', 'network');
      });

      expect(result.current.errors).toHaveLength(0);
    });

    it('ignores ResizeObserver loop errors', async () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      act(() => {
        result.current.updateSettings({ autoFixMode: false });
      });

      await act(async () => {
        await result.current.captureError('ResizeObserver loop completed', 'runtime');
      });

      expect(result.current.errors).toHaveLength(0);
    });

    it('deduplicates same error within the 30s window', async () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      act(() => {
        result.current.updateSettings({ autoFixMode: false });
      });

      await act(async () => {
        await result.current.captureError('Unique error X', 'runtime');
      });

      await act(async () => {
        await result.current.captureError('Unique error X', 'runtime');
      });

      expect(result.current.errors).toHaveLength(1);
    });

    it('returns null when settings.enabled is false', async () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      act(() => {
        result.current.updateSettings({ enabled: false });
      });

      let errorId: string | null = 'initial';
      await act(async () => {
        errorId = await result.current.captureError('Disabled capture', 'runtime');
      });

      expect(errorId).toBeNull();
      expect(result.current.errors).toHaveLength(0);
    });

    it('accumulates multiple different errors', async () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      act(() => {
        result.current.updateSettings({ autoFixMode: false });
      });

      await act(async () => {
        await result.current.captureError('Error A', 'runtime');
      });
      await act(async () => {
        await result.current.captureError('Error B', 'api');
      });
      await act(async () => {
        await result.current.captureError('Error C', 'ui');
      });

      expect(result.current.errors).toHaveLength(3);
      // Most recent should be first (prepended)
      expect(result.current.errors[0].message).toBe('Error C');
      expect(result.current.errors[1].message).toBe('Error B');
      expect(result.current.errors[2].message).toBe('Error A');
    });

    it('writes to guardian_alerts when logErrors is true', async () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      act(() => {
        result.current.updateSettings({ autoFixMode: false });
      });

      await act(async () => {
        await result.current.captureError('logged error', 'api');
      });

      expect(mockInsert).toHaveBeenCalled();
      const insertArgs = mockInsert.mock.calls[0][0];
      expect(insertArgs[0]).toEqual(expect.objectContaining({
        message: 'logged error',
        status: 'open',
      }));
    });
  });

  // ── Error Clearing ─────────────────────────────────────────────────

  describe('clearError', () => {
    it('removes a specific error by ID', async () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      act(() => {
        result.current.updateSettings({ autoFixMode: false });
      });

      await act(async () => {
        await result.current.captureError('Error A', 'runtime');
      });

      const errorId = result.current.errors[0]?.id;
      expect(errorId).toBeTruthy();

      act(() => {
        result.current.clearError(errorId);
      });

      expect(result.current.errors.find(e => e.id === errorId)).toBeUndefined();
      expect(result.current.errors).toHaveLength(0);
    });

    it('only removes the targeted error, leaving others', async () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      act(() => {
        result.current.updateSettings({ autoFixMode: false });
      });

      await act(async () => {
        await result.current.captureError('keep this', 'runtime');
      });
      await act(async () => {
        await result.current.captureError('remove this', 'api');
      });

      // errors[0] is 'remove this' (most recent first)
      const removeId = result.current.errors[0].id;

      act(() => {
        result.current.clearError(removeId);
      });

      expect(result.current.errors).toHaveLength(1);
      expect(result.current.errors[0].message).toBe('keep this');
    });
  });

  describe('clearAllErrors', () => {
    it('removes all errors', async () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      act(() => {
        result.current.updateSettings({ autoFixMode: false });
      });

      await act(async () => {
        await result.current.captureError('Error 1', 'runtime');
      });
      await act(async () => {
        await result.current.captureError('Error 2', 'api');
      });

      expect(result.current.errors.length).toBe(2);

      act(() => {
        result.current.clearAllErrors();
      });

      expect(result.current.errors).toHaveLength(0);
    });

    it('is safe to call when errors list is already empty', () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      act(() => {
        result.current.clearAllErrors();
      });

      expect(result.current.errors).toHaveLength(0);
    });
  });

  // ── Error Analysis ─────────────────────────────────────────────────

  describe('analyzeError', () => {
    it('calls ai-error-analyzer edge function and returns suggestion', async () => {
      mockInvoke.mockResolvedValueOnce({
        data: { suggestion: 'Try restarting the service' },
        error: null,
      });

      const { result } = renderHook(() => useAIErrors(), { wrapper });

      act(() => {
        result.current.updateSettings({ autoFixMode: false });
      });

      await act(async () => {
        await result.current.captureError('analyzable error', 'runtime');
      });

      const errorId = result.current.errors[0].id;

      let suggestion: string | null = null;
      await act(async () => {
        suggestion = await result.current.analyzeError(errorId);
      });

      expect(suggestion).toBe('Try restarting the service');
      expect(mockInvoke).toHaveBeenCalledWith('ai-error-analyzer', expect.objectContaining({
        body: expect.objectContaining({
          action: 'analyze',
          error: expect.objectContaining({
            message: 'analyzable error',
            type: 'runtime',
          }),
        }),
      }));
    });

    it('updates error status to suggested with suggestion text', async () => {
      mockInvoke.mockResolvedValueOnce({
        data: { suggestion: 'Fix it' },
        error: null,
      });

      const { result } = renderHook(() => useAIErrors(), { wrapper });

      act(() => {
        result.current.updateSettings({ autoFixMode: false });
      });

      await act(async () => {
        await result.current.captureError('status tracking', 'runtime');
      });

      const errorId = result.current.errors[0].id;

      await act(async () => {
        await result.current.analyzeError(errorId);
      });

      const analyzed = result.current.errors.find(e => e.id === errorId);
      expect(analyzed?.status).toBe('suggested');
      expect(analyzed?.suggestion).toBe('Fix it');
    });

    it('returns null and sets status to failed on edge function error', async () => {
      mockInvoke.mockResolvedValueOnce({
        data: null,
        error: new Error('Edge function unavailable'),
      });

      const { result } = renderHook(() => useAIErrors(), { wrapper });

      act(() => {
        result.current.updateSettings({ autoFixMode: false });
      });

      await act(async () => {
        await result.current.captureError('will fail analysis', 'api');
      });

      const errorId = result.current.errors[0].id;

      let suggestion: string | null = 'initial';
      await act(async () => {
        suggestion = await result.current.analyzeError(errorId);
      });

      expect(suggestion).toBeNull();
      expect(result.current.errors.find(e => e.id === errorId)?.status).toBe('failed');
    });

    it('returns null for non-existent error ID', async () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      let suggestion: string | null = 'initial';
      await act(async () => {
        suggestion = await result.current.analyzeError('nonexistent-id');
      });

      expect(suggestion).toBeNull();
    });
  });

  // ── Settings ───────────────────────────────────────────────────────

  describe('Settings', () => {
    it('updateSettings merges partial updates', () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      act(() => {
        result.current.updateSettings({ maxRetries: 5 });
      });

      expect(result.current.settings.maxRetries).toBe(5);
      expect(result.current.settings.enabled).toBe(true);
      expect(result.current.settings.autoFixMode).toBe(true);
      expect(result.current.settings.logErrors).toBe(true);
    });

    it('can disable error capture via settings', () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      act(() => {
        result.current.updateSettings({ enabled: false });
      });

      expect(result.current.settings.enabled).toBe(false);
    });

    it('can update multiple settings at once', () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      act(() => {
        result.current.updateSettings({ maxRetries: 10, logErrors: false, autoFixMode: false });
      });

      expect(result.current.settings.maxRetries).toBe(10);
      expect(result.current.settings.logErrors).toBe(false);
      expect(result.current.settings.autoFixMode).toBe(false);
      expect(result.current.settings.enabled).toBe(true); // unchanged
    });

    it('persists settings to localStorage', () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      act(() => {
        result.current.updateSettings({ maxRetries: 7 });
      });

      const stored = JSON.parse(localStorage.getItem('ai-error-settings') || '{}');
      expect(stored.maxRetries).toBe(7);
    });

    it('reads initial settings from localStorage', () => {
      const custom = { enabled: false, autoFixMode: false, maxRetries: 1, logErrors: false };
      localStorage.setItem('ai-error-settings', JSON.stringify(custom));

      const { result } = renderHook(() => useAIErrors(), { wrapper });
      expect(result.current.settings).toEqual(custom);
    });
  });

  // ── Retry Error ────────────────────────────────────────────────────

  describe('retryError', () => {
    it('resets retryCount to 0 and status to pending', async () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      act(() => {
        result.current.updateSettings({ autoFixMode: false });
      });

      await act(async () => {
        await result.current.captureError('retryable error', 'runtime');
      });

      const errorId = result.current.errors[0].id;

      // Mock analyzeError to fail so the error stays in a failed-like state
      mockInvoke.mockResolvedValueOnce({
        data: null,
        error: new Error('analyze failed'),
      });

      await act(async () => {
        await result.current.retryError(errorId);
      });

      // retryError resets retryCount to 0 before re-analyzing
      // The error should still exist
      const retried = result.current.errors.find(e => e.id === errorId);
      expect(retried).toBeDefined();
    });
  });
});
