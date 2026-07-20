import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useRetellAI } from '../useRetellAI';

const { mockInvoke, mockToast } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockToast: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: mockInvoke },
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/lib/launchSafety', () => ({
  browserProviderAdministrationAllowed: () => false,
  PROVIDER_ADMIN_LAUNCH_LOCK_MESSAGE: 'Provider administration is launch-locked.',
}));

describe('useRetellAI provider boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes the legacy Retell functions without exposing provider authority', () => {
    const { result } = renderHook(() => useRetellAI());

    expect(typeof result.current.createAgent).toBe('function');
    expect(typeof result.current.purchaseNumber).toBe('function');
    expect(typeof result.current.configureWebhooksOnAllAgents).toBe('function');
    expect(result.current.isLoading).toBe(false);
  });

  it('fails closed before every Retell phone, agent, and webhook mutation', async () => {
    const { result } = renderHook(() => useRetellAI());

    await act(async () => {
      expect(await result.current.importPhoneNumber('+15551234567', 'sip:blocked')).toBeNull();
      expect(await result.current.updatePhoneNumber('+15551234567', 'agent-1')).toBeNull();
      expect(await result.current.deletePhoneNumber('+15551234567')).toBe(false);
      expect(await result.current.purchaseNumber('+15551234567')).toBeNull();
      expect(await result.current.createAgent('Elite draft', 'llm-1')).toBeNull();
      expect(await result.current.updateAgent('agent-1', { voice_id: 'voice-1' })).toBeNull();
      expect(await result.current.deleteAgent('agent-1')).toBe(false);
      expect(await result.current.configureWebhooksOnAllAgents()).toEqual({ success: 0, failed: 0 });
    });

    expect(mockInvoke).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
  });

  it('does not disclose Retell resource inventory or run a connection check from the browser', async () => {
    const { result } = renderHook(() => useRetellAI());

    await act(async () => {
      expect(await result.current.listPhoneNumbers()).toEqual([]);
      expect(await result.current.listAvailableNumbers('312')).toEqual([]);
      expect(await result.current.listAgents()).toEqual([]);
      expect(await result.current.getAgent('agent-1')).toBeNull();
    });

    expect(mockInvoke).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });
});
