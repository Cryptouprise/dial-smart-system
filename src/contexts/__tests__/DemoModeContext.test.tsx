import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { DemoModeProvider, useDemoMode } from '../DemoModeContext';

function wrapper({ children }: { children: React.ReactNode }) {
  return <DemoModeProvider>{children}</DemoModeProvider>;
}

describe('DemoModeContext', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to false when no localStorage value', () => {
    const { result } = renderHook(() => useDemoMode(), { wrapper });
    expect(result.current.isDemoMode).toBe(false);
  });

  it('reads initial value from localStorage', () => {
    localStorage.setItem('ai-dial-boss-demo-mode', 'true');
    const { result } = renderHook(() => useDemoMode(), { wrapper });
    expect(result.current.isDemoMode).toBe(true);
  });

  it('toggleDemoMode flips the value', () => {
    const { result } = renderHook(() => useDemoMode(), { wrapper });
    expect(result.current.isDemoMode).toBe(false);

    act(() => {
      result.current.toggleDemoMode();
    });
    expect(result.current.isDemoMode).toBe(true);

    act(() => {
      result.current.toggleDemoMode();
    });
    expect(result.current.isDemoMode).toBe(false);
  });

  it('setDemoMode sets an explicit value', () => {
    const { result } = renderHook(() => useDemoMode(), { wrapper });

    act(() => {
      result.current.setDemoMode(true);
    });
    expect(result.current.isDemoMode).toBe(true);

    act(() => {
      result.current.setDemoMode(false);
    });
    expect(result.current.isDemoMode).toBe(false);
  });

  it('persists value to localStorage on change', () => {
    const { result } = renderHook(() => useDemoMode(), { wrapper });

    act(() => {
      result.current.setDemoMode(true);
    });
    expect(localStorage.getItem('ai-dial-boss-demo-mode')).toBe('true');

    act(() => {
      result.current.setDemoMode(false);
    });
    expect(localStorage.getItem('ai-dial-boss-demo-mode')).toBe('false');
  });

  it('throws when used outside provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      renderHook(() => useDemoMode());
    }).toThrow('useDemoMode must be used within a DemoModeProvider');
    spy.mockRestore();
  });
});
