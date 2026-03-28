import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { AIErrorProvider, useAIErrors } from '../AIErrorContext';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client');

// The error handler internally calls supabase.from('guardian_alerts').insert(...).then(...)
// We need .from() to return a chain where .insert() returns a thenable.
const mockFrom = supabase.from as ReturnType<typeof vi.fn>;

function wrapper({ children }: { children: React.ReactNode }) {
  return <AIErrorProvider>{children}</AIErrorProvider>;
}

describe('AIErrorContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Provide a chain where .insert() returns a thenable (used by guardian_alerts logging)
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnValue({
        then: (resolve: any, reject: any) => Promise.resolve({ data: null, error: null }).then(resolve, reject),
      }),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(() => Promise.resolve({ data: null, error: null })),
    });
  });

  // ── Provider Rendering ─────────────────────────────────────────────

  describe('Provider', () => {
    it('renders children without crashing', () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });
      expect(result.current).toBeDefined();
    });
  });

  // ── Context Interface ──────────────────────────────────────────────

  describe('Context Interface', () => {
    it('provides errors array (initially empty)', () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });
      expect(Array.isArray(result.current.errors)).toBe(true);
      expect(result.current.errors).toHaveLength(0);
    });

    it('provides settings object with defaults', () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });
      expect(result.current.settings).toEqual({
        enabled: true,
        autoFixMode: true,
        maxRetries: 3,
        logErrors: true,
      });
    });

    it('provides isProcessing boolean', () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });
      expect(typeof result.current.isProcessing).toBe('boolean');
      expect(result.current.isProcessing).toBe(false);
    });

    it('provides all action functions', () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });
      expect(typeof result.current.captureError).toBe('function');
      expect(typeof result.current.analyzeError).toBe('function');
      expect(typeof result.current.executeFixFromSuggestion).toBe('function');
      expect(typeof result.current.clearError).toBe('function');
      expect(typeof result.current.clearAllErrors).toBe('function');
      expect(typeof result.current.retryError).toBe('function');
      expect(typeof result.current.updateSettings).toBe('function');
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

  // ── Error Capture ──────────────────────────────────────────────────

  describe('Error Capture', () => {
    it('captureError adds an error record from Error object', async () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      await act(async () => {
        await result.current.captureError(new Error('Test failure'), 'runtime');
      });

      expect(result.current.errors.length).toBeGreaterThanOrEqual(1);
      const captured = result.current.errors[0];
      expect(captured.message).toBe('Test failure');
      expect(captured.type).toBe('runtime');
      expect(captured.status).toBe('pending');
      expect(captured.id).toBeTruthy();
    });

    it('captureError adds an error record from string', async () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      await act(async () => {
        await result.current.captureError('Something broke', 'api');
      });

      expect(result.current.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.current.errors[0].message).toBe('Something broke');
      expect(result.current.errors[0].type).toBe('api');
    });

    it('captureError includes context when provided', async () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      await act(async () => {
        await result.current.captureError('ctx error', 'ui', { component: 'Dashboard' });
      });

      const captured = result.current.errors[0];
      expect(captured.context).toEqual({ component: 'Dashboard' });
    });

    it('captureError ignores errors matching ignored patterns', async () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      await act(async () => {
        await result.current.captureError('Failed to fetch resource', 'network');
      });

      // "Failed to fetch" is in the ignored patterns list
      expect(result.current.errors).toHaveLength(0);
    });

    it('captureError deduplicates same error within window', async () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      await act(async () => {
        await result.current.captureError('Unique error X', 'runtime');
      });

      await act(async () => {
        await result.current.captureError('Unique error X', 'runtime');
      });

      // Second identical error within dedupe window should be ignored
      expect(result.current.errors).toHaveLength(1);
    });

    it('captureError returns null when settings.enabled is false', async () => {
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

  // ── Error Clearing ─────────────────────────────────────────────────

  describe('Error Clearing', () => {
    it('clearError removes a specific error by ID', async () => {
      const { result } = renderHook(() => useAIErrors(), { wrapper });

      await act(async () => {
        await result.current.captureError('Error A', 'runtime');
      });

      const errorId = result.current.errors[0]?.id;
      expect(errorId).toBeTruthy();

      act(() => {
        result.current.clearError(errorId);
      });

      expect(result.current.errors.find((e) => e.id === errorId)).toBeUndefined();
    });

    it('clearAllErrors removes all errors', async () => {
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
      // Other settings should remain at defaults
      expect(result.current.settings.enabled).toBe(true);
      expect(result.current.settings.autoFixMode).toBe(true);
    });

    it('reads initial settings from localStorage', () => {
      const custom = { enabled: false, autoFixMode: false, maxRetries: 1, logErrors: false };
      localStorage.setItem('ai-error-settings', JSON.stringify(custom));

      const { result } = renderHook(() => useAIErrors(), { wrapper });
      expect(result.current.settings).toEqual(custom);
    });
  });
});
