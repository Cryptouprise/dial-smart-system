import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { AIErrorProvider, useAIErrors } from '../AIErrorContext';

// Mock supabase - the error handler writes to guardian_alerts table
const mockInsert = vi.fn().mockReturnValue({
  then: (resolve: any) => Promise.resolve({ data: null, error: null }).then(resolve),
});
const mockFrom = vi.fn().mockReturnValue({
  select: vi.fn().mockReturnThis(),
  insert: mockInsert,
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  single: vi.fn(() => Promise.resolve({ data: null, error: null })),
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
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
  });

  // ── Provider Renders Children ──────────────────────────────────────

  describe('Provider', () => {
    it('renders children and provides context', () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });
      expect(result.current).toBeDefined();
      expect(result.current.errors).toBeDefined();
    });
  });

  // ── Throws Outside Provider ────────────────────────────────────────

  describe('useAIErrors outside provider', () => {
    it('throws descriptive error when used outside AIErrorProvider', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => {
        renderHook(() => useAIErrors());
      }).toThrow('useAIErrors must be used within an AIErrorProvider');
      spy.mockRestore();
    });
  });

  // ── Initial State ──────────────────────────────────────────────────

  describe('Initial state', () => {
    it('errors array is empty', () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });
      expect(result.current.errors).toEqual([]);
    });

    it('isProcessing is false', () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });
      expect(result.current.isProcessing).toBe(false);
    });

    it('settings have correct defaults', () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });
      expect(result.current.settings).toEqual({
        enabled: true,
        autoFixMode: true,
        maxRetries: 3,
        logErrors: true,
      });
    });
  });

  // ── captureError ───────────────────────────────────────────────────

  describe('captureError', () => {
    it('adds error to errors array from Error object', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      await act(async () => {
        await result.current.captureError(new Error('Test failure'), 'runtime');
      });

      expect(result.current.errors.length).toBe(1);
      const captured = result.current.errors[0];
      expect(captured.message).toBe('Test failure');
      expect(captured.type).toBe('runtime');
      expect(captured.status).toBe('pending');
      consoleSpy.mockRestore();
    });

    it('adds error to errors array from string', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      await act(async () => {
        await result.current.captureError('Something broke', 'api');
      });

      expect(result.current.errors.length).toBe(1);
      expect(result.current.errors[0].message).toBe('Something broke');
      expect(result.current.errors[0].type).toBe('api');
      consoleSpy.mockRestore();
    });

    it('captured error includes id, timestamp, and message', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      await act(async () => {
        await result.current.captureError('Details test', 'ui');
      });

      const captured = result.current.errors[0];
      expect(captured.id).toBeTruthy();
      expect(typeof captured.id).toBe('string');
      expect(captured.timestamp).toBeInstanceOf(Date);
      expect(captured.message).toBe('Details test');
      expect(captured.type).toBe('ui');
      consoleSpy.mockRestore();
    });

    it('includes context metadata when provided', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      await act(async () => {
        await result.current.captureError('ctx error', 'ui', { component: 'Dashboard', page: '/home' });
      });

      const captured = result.current.errors[0];
      expect(captured.context).toEqual({ component: 'Dashboard', page: '/home' });
      consoleSpy.mockRestore();
    });

    it('includes stack trace from Error objects', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const { result } = renderHook(() => useAIErrors(), { wrapper });
      const err = new Error('With stack');

      await act(async () => {
        await result.current.captureError(err, 'runtime');
      });

      const captured = result.current.errors[0];
      expect(captured.stack).toBeTruthy();
      expect(captured.stack).toContain('With stack');
      consoleSpy.mockRestore();
    });

    it('returns error id on success', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      let errorId: string | null = null;
      await act(async () => {
        errorId = await result.current.captureError('Return id test', 'runtime');
      });

      expect(errorId).toBeTruthy();
      expect(typeof errorId).toBe('string');
      expect(result.current.errors[0].id).toBe(errorId);
      consoleSpy.mockRestore();
    });
  });

  // ── Multiple Errors ────────────────────────────────────────────────

  describe('Multiple errors', () => {
    it('captures two different errors into array', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      await act(async () => {
        await result.current.captureError('Error Alpha', 'runtime');
      });

      await act(async () => {
        await result.current.captureError('Error Beta', 'api');
      });

      expect(result.current.errors.length).toBe(2);
      const messages = result.current.errors.map(e => e.message);
      expect(messages).toContain('Error Alpha');
      expect(messages).toContain('Error Beta');
      consoleSpy.mockRestore();
    });

    it('deduplicates identical errors within 30s window', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      await act(async () => {
        await result.current.captureError('Duplicate error', 'runtime');
      });

      await act(async () => {
        await result.current.captureError('Duplicate error', 'runtime');
      });

      // Second identical error should be deduplicated
      expect(result.current.errors.length).toBe(1);
      consoleSpy.mockRestore();
    });
  });

  // ── clearError (dismiss specific) ──────────────────────────────────

  describe('clearError', () => {
    it('removes specific error by id', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      await act(async () => {
        await result.current.captureError('Error to dismiss', 'runtime');
      });

      const errorId = result.current.errors[0].id;
      expect(errorId).toBeTruthy();

      act(() => {
        result.current.clearError(errorId);
      });

      expect(result.current.errors.find(e => e.id === errorId)).toBeUndefined();
      expect(result.current.errors.length).toBe(0);
      consoleSpy.mockRestore();
    });

    it('leaves other errors intact when removing one', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      await act(async () => {
        await result.current.captureError('Keep me', 'runtime');
      });
      await act(async () => {
        await result.current.captureError('Remove me', 'api');
      });

      const removeId = result.current.errors.find(e => e.message === 'Remove me')!.id;

      act(() => {
        result.current.clearError(removeId);
      });

      expect(result.current.errors.length).toBe(1);
      expect(result.current.errors[0].message).toBe('Keep me');
      consoleSpy.mockRestore();
    });
  });

  // ── clearAllErrors ─────────────────────────────────────────────────

  describe('clearAllErrors', () => {
    it('removes all errors from array', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      await act(async () => {
        await result.current.captureError('Error 1', 'runtime');
      });
      await act(async () => {
        await result.current.captureError('Error 2', 'api');
      });

      expect(result.current.errors.length).toBeGreaterThanOrEqual(1);

      act(() => {
        result.current.clearAllErrors();
      });

      expect(result.current.errors).toHaveLength(0);
      consoleSpy.mockRestore();
    });
  });

  // ── Ignored Patterns ───────────────────────────────────────────────

  describe('Ignored error patterns', () => {
    it('ignores errors matching "Failed to fetch"', async () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      await act(async () => {
        await result.current.captureError('Failed to fetch resource', 'network');
      });

      expect(result.current.errors).toHaveLength(0);
    });

    it('ignores errors matching "ResizeObserver loop"', async () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      await act(async () => {
        await result.current.captureError('ResizeObserver loop completed', 'runtime');
      });

      expect(result.current.errors).toHaveLength(0);
    });
  });

  // ── Disabled Capture ───────────────────────────────────────────────

  describe('Disabled capture', () => {
    it('returns null and does not add error when settings.enabled is false', async () => {
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
  });

  // ── Settings ───────────────────────────────────────────────────────

  describe('updateSettings', () => {
    it('merges partial updates into existing settings', () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      act(() => {
        result.current.updateSettings({ maxRetries: 5 });
      });

      expect(result.current.settings.maxRetries).toBe(5);
      expect(result.current.settings.enabled).toBe(true);
      expect(result.current.settings.autoFixMode).toBe(true);
      expect(result.current.settings.logErrors).toBe(true);
    });

    it('persists settings to localStorage', () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      act(() => {
        result.current.updateSettings({ maxRetries: 7, logErrors: false });
      });

      const stored = JSON.parse(localStorage.getItem('ai-error-settings')!);
      expect(stored.maxRetries).toBe(7);
      expect(stored.logErrors).toBe(false);
    });

    it('reads initial settings from localStorage', () => {
      const custom = { enabled: false, autoFixMode: false, maxRetries: 1, logErrors: false };
      localStorage.setItem('ai-error-settings', JSON.stringify(custom));

      const { result } = renderHook(() => useAIErrors(), { wrapper });
      expect(result.current.settings).toEqual(custom);
    });
  });

  // ── Error Record Structure ─────────────────────────────────────────

  describe('Error record structure', () => {
    it('error record has retryCount initialized to 0', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      await act(async () => {
        await result.current.captureError('Structure test', 'runtime');
      });

      expect(result.current.errors[0].retryCount).toBe(0);
      consoleSpy.mockRestore();
    });

    it('error record has retryable defaulting to true', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      await act(async () => {
        await result.current.captureError('Retryable test', 'api');
      });

      expect(result.current.errors[0].retryable).toBe(true);
      consoleSpy.mockRestore();
    });

    it('newest errors are first in the array', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      await act(async () => {
        await result.current.captureError('First error', 'runtime');
      });
      await act(async () => {
        await result.current.captureError('Second error', 'api');
      });

      // Errors are prepended (newest first)
      expect(result.current.errors[0].message).toBe('Second error');
      expect(result.current.errors[1].message).toBe('First error');
      consoleSpy.mockRestore();
    });
  });
});
