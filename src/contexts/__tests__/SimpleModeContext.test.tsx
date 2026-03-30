import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { SimpleModeProvider, useSimpleModeContext, SIMPLE_MODE_TABS } from '../SimpleModeContext';

function wrapper({ children }: { children: React.ReactNode }) {
  return <SimpleModeProvider>{children}</SimpleModeProvider>;
}

describe('SimpleModeContext', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to simple mode (true) for first-time users', () => {
    const { result } = renderHook(() => useSimpleModeContext(), { wrapper });
    expect(result.current.isSimpleMode).toBe(true);
  });

  it('reads saved preference from localStorage', () => {
    localStorage.setItem('smart-dialer-simple-mode', 'false');
    const { result } = renderHook(() => useSimpleModeContext(), { wrapper });
    expect(result.current.isSimpleMode).toBe(false);
  });

  it('toggleMode flips the value', () => {
    const { result } = renderHook(() => useSimpleModeContext(), { wrapper });
    expect(result.current.isSimpleMode).toBe(true);

    act(() => {
      result.current.toggleMode();
    });
    expect(result.current.isSimpleMode).toBe(false);

    act(() => {
      result.current.toggleMode();
    });
    expect(result.current.isSimpleMode).toBe(true);
  });

  it('setSimpleMode sets explicit value', () => {
    const { result } = renderHook(() => useSimpleModeContext(), { wrapper });

    act(() => {
      result.current.setSimpleMode(false);
    });
    expect(result.current.isSimpleMode).toBe(false);

    act(() => {
      result.current.setSimpleMode(true);
    });
    expect(result.current.isSimpleMode).toBe(true);
  });

  it('persists to localStorage on change', () => {
    const { result } = renderHook(() => useSimpleModeContext(), { wrapper });

    act(() => {
      result.current.setSimpleMode(false);
    });
    expect(localStorage.getItem('smart-dialer-simple-mode')).toBe('false');
  });

  it('notifies listeners on toggleMode', () => {
    const listener = vi.fn();
    const { result } = renderHook(() => useSimpleModeContext(), { wrapper });

    act(() => {
      result.current.onModeChange(listener);
    });

    act(() => {
      result.current.toggleMode();
    });
    expect(listener).toHaveBeenCalledWith(false); // was true, toggled to false
  });

  it('notifies listeners on setSimpleMode', () => {
    const listener = vi.fn();
    const { result } = renderHook(() => useSimpleModeContext(), { wrapper });

    act(() => {
      result.current.onModeChange(listener);
    });

    act(() => {
      result.current.setSimpleMode(false);
    });
    expect(listener).toHaveBeenCalledWith(false);
  });

  it('unsubscribes listener via returned cleanup function', () => {
    const listener = vi.fn();
    const { result } = renderHook(() => useSimpleModeContext(), { wrapper });

    let unsub: () => void;
    act(() => {
      unsub = result.current.onModeChange(listener);
    });

    // Unsubscribe
    act(() => {
      unsub();
    });

    act(() => {
      result.current.toggleMode();
    });

    // Listener should NOT have been called after unsubscribe
    expect(listener).not.toHaveBeenCalled();
  });

  it('supports multiple listeners', () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    const { result } = renderHook(() => useSimpleModeContext(), { wrapper });

    act(() => {
      result.current.onModeChange(listener1);
      result.current.onModeChange(listener2);
    });

    act(() => {
      result.current.toggleMode();
    });

    expect(listener1).toHaveBeenCalledWith(false);
    expect(listener2).toHaveBeenCalledWith(false);
  });

  it('exports SIMPLE_MODE_TABS with expected tabs', () => {
    expect(SIMPLE_MODE_TABS).toContain('overview');
    expect(SIMPLE_MODE_TABS).toContain('broadcast');
    expect(SIMPLE_MODE_TABS).toContain('predictive');
    expect(SIMPLE_MODE_TABS).toContain('sms');
    expect(SIMPLE_MODE_TABS).toContain('campaign-results');
    expect(SIMPLE_MODE_TABS).toHaveLength(5);
  });

  it('throws when used outside provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      renderHook(() => useSimpleModeContext());
    }).toThrow('useSimpleModeContext must be used within a SimpleModeProvider');
    spy.mockRestore();
  });
});
