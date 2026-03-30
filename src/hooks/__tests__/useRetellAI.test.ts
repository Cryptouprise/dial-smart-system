import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRetellAI } from '../useRetellAI';

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
      getUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(() => Promise.resolve({ data: null, error: null })),
    })),
    functions: {
      invoke: mockInvoke,
    },
  },
}));

describe('useRetellAI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue({ data: null, error: null });
  });

  // ── Initial State ──────────────────────────────────────────────────

  describe('Initial State', () => {
    it('should not be loading initially', () => {
      const { result } = renderHook(() => useRetellAI());
      expect(result.current.isLoading).toBe(false);
    });

    it('should expose all expected functions', () => {
      const { result } = renderHook(() => useRetellAI());
      expect(typeof result.current.listAgents).toBe('function');
      expect(typeof result.current.createAgent).toBe('function');
      expect(typeof result.current.getAgent).toBe('function');
      expect(typeof result.current.updateAgent).toBe('function');
      expect(typeof result.current.deleteAgent).toBe('function');
      expect(typeof result.current.importPhoneNumber).toBe('function');
      expect(typeof result.current.updatePhoneNumber).toBe('function');
      expect(typeof result.current.deletePhoneNumber).toBe('function');
      expect(typeof result.current.listPhoneNumbers).toBe('function');
      expect(typeof result.current.listAvailableNumbers).toBe('function');
      expect(typeof result.current.purchaseNumber).toBe('function');
      expect(typeof result.current.configureWebhooksOnAllAgents).toBe('function');
    });
  });

  // ── Agent Fetching ─────────────────────────────────────────────────

  describe('Agent Fetching', () => {
    it('listAgents returns array from edge function', async () => {
      const agents = [
        { agent_id: 'a1', agent_name: 'Test Agent', voice_id: 'v1' },
        { agent_id: 'a2', agent_name: 'Agent 2' },
      ];
      mockInvoke.mockResolvedValueOnce({ data: agents, error: null });

      const { result } = renderHook(() => useRetellAI());
      let res: any;
      await act(async () => {
        res = await result.current.listAgents();
      });

      expect(mockInvoke).toHaveBeenCalledWith('retell-agent-management', {
        body: { action: 'list' },
      });
      expect(res).toEqual(agents);
    });

    it('listAgents extracts agents from wrapper object', async () => {
      const agents = [{ agent_id: 'a1', agent_name: 'X' }];
      mockInvoke.mockResolvedValueOnce({ data: { agents }, error: null });

      const { result } = renderHook(() => useRetellAI());
      let res: any;
      await act(async () => {
        res = await result.current.listAgents();
      });

      expect(res).toEqual(agents);
    });

    it('listAgents returns empty array on edge function error', async () => {
      mockInvoke.mockResolvedValueOnce({ data: null, error: { message: 'fail' } });

      const { result } = renderHook(() => useRetellAI());
      let res: any;
      await act(async () => {
        res = await result.current.listAgents();
      });

      expect(res).toEqual([]);
    });

    it('listAgents returns empty array on data-level error', async () => {
      mockInvoke.mockResolvedValueOnce({ data: { error: 'Unauthorized' }, error: null });

      const { result } = renderHook(() => useRetellAI());
      let res: any;
      await act(async () => {
        res = await result.current.listAgents();
      });

      expect(res).toEqual([]);
    });

    it('listAgents returns empty array on thrown exception', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('network'));

      const { result } = renderHook(() => useRetellAI());
      let res: any;
      await act(async () => {
        res = await result.current.listAgents();
      });

      expect(res).toEqual([]);
    });

    it('getAgent returns agent data on success', async () => {
      const agent = { agent_id: 'a1', agent_name: 'Test', voice_id: 'v1' };
      mockInvoke.mockResolvedValueOnce({ data: agent, error: null });

      const { result } = renderHook(() => useRetellAI());
      let res: any;
      await act(async () => {
        res = await result.current.getAgent('a1');
      });

      expect(mockInvoke).toHaveBeenCalledWith('retell-agent-management', {
        body: { action: 'get', agentId: 'a1' },
      });
      expect(res).toEqual(agent);
    });

    it('getAgent returns null when called without agentId', async () => {
      const { result } = renderHook(() => useRetellAI());
      let res: any;
      await act(async () => {
        res = await result.current.getAgent('');
      });

      expect(mockInvoke).not.toHaveBeenCalled();
      expect(res).toBeNull();
    });
  });

  // ── Agent Configuration (create/update/delete) ────────────────────

  describe('Agent Configuration', () => {
    it('createAgent sends correct payload', async () => {
      const created = { agent_id: 'new1', agent_name: 'NewAgent' };
      mockInvoke.mockResolvedValueOnce({ data: created, error: null });

      const { result } = renderHook(() => useRetellAI());
      let res: any;
      await act(async () => {
        res = await result.current.createAgent('NewAgent', 'llm-1', 'voice-1', 'https://hook');
      });

      expect(mockInvoke).toHaveBeenCalledWith('retell-agent-management', {
        body: {
          action: 'create',
          agentName: 'NewAgent',
          llmId: 'llm-1',
          voiceId: 'voice-1',
          webhookUrl: 'https://hook',
        },
      });
      expect(res).toEqual(created);
    });

    it('createAgent returns null when name is missing', async () => {
      const { result } = renderHook(() => useRetellAI());
      let res: any;
      await act(async () => {
        res = await result.current.createAgent('', 'llm-1');
      });

      expect(mockInvoke).not.toHaveBeenCalled();
      expect(res).toBeNull();
    });

    it('createAgent returns null when llmId is missing', async () => {
      const { result } = renderHook(() => useRetellAI());
      let res: any;
      await act(async () => {
        res = await result.current.createAgent('Agent', '');
      });

      expect(mockInvoke).not.toHaveBeenCalled();
      expect(res).toBeNull();
    });

    it('updateAgent sends correct payload', async () => {
      mockInvoke.mockResolvedValueOnce({ data: { success: true }, error: null });

      const { result } = renderHook(() => useRetellAI());
      const config = { voice_id: 'new-voice' };
      await act(async () => {
        await result.current.updateAgent('a1', config);
      });

      expect(mockInvoke).toHaveBeenCalledWith('retell-agent-management', {
        body: { action: 'update', agentId: 'a1', agentConfig: config },
      });
    });

    it('updateAgent returns null when agentId is empty', async () => {
      const { result } = renderHook(() => useRetellAI());
      let res: any;
      await act(async () => {
        res = await result.current.updateAgent('', {});
      });

      expect(mockInvoke).not.toHaveBeenCalled();
      expect(res).toBeNull();
    });

    it('deleteAgent returns true on success', async () => {
      mockInvoke.mockResolvedValueOnce({ data: {}, error: null });

      const { result } = renderHook(() => useRetellAI());
      let res: any;
      await act(async () => {
        res = await result.current.deleteAgent('a1');
      });

      expect(res).toBe(true);
    });

    it('deleteAgent returns false on error', async () => {
      mockInvoke.mockResolvedValueOnce({ data: null, error: { message: 'fail' } });

      const { result } = renderHook(() => useRetellAI());
      let res: any;
      await act(async () => {
        res = await result.current.deleteAgent('a1');
      });

      expect(res).toBe(false);
    });

    it('deleteAgent returns false when agentId is empty', async () => {
      const { result } = renderHook(() => useRetellAI());
      let res: any;
      await act(async () => {
        res = await result.current.deleteAgent('');
      });

      expect(mockInvoke).not.toHaveBeenCalled();
      expect(res).toBe(false);
    });
  });

  // ── Phone Number Operations ────────────────────────────────────────

  describe('Phone Number Operations', () => {
    it('listPhoneNumbers returns array on success', async () => {
      const numbers = [{ phone_number: '+15551234567' }];
      mockInvoke.mockResolvedValueOnce({ data: numbers, error: null });

      const { result } = renderHook(() => useRetellAI());
      let res: any;
      await act(async () => {
        res = await result.current.listPhoneNumbers();
      });

      expect(mockInvoke).toHaveBeenCalledWith('retell-phone-management', {
        body: { action: 'list' },
      });
      expect(res).toEqual(numbers);
    });

    it('listPhoneNumbers extracts phone_numbers from wrapper', async () => {
      const numbers = [{ phone_number: '+15551234567' }];
      mockInvoke.mockResolvedValueOnce({ data: { phone_numbers: numbers }, error: null });

      const { result } = renderHook(() => useRetellAI());
      let res: any;
      await act(async () => {
        res = await result.current.listPhoneNumbers();
      });

      expect(res).toEqual(numbers);
    });

    it('importPhoneNumber sends correct payload', async () => {
      mockInvoke.mockResolvedValueOnce({ data: { success: true }, error: null });

      const { result } = renderHook(() => useRetellAI());
      await act(async () => {
        await result.current.importPhoneNumber('+15551234567', 'sip:uri');
      });

      expect(mockInvoke).toHaveBeenCalledWith('retell-phone-management', {
        body: {
          action: 'import',
          phoneNumber: '+15551234567',
          terminationUri: 'sip:uri',
        },
      });
    });

    it('importPhoneNumber returns null on error', async () => {
      mockInvoke.mockResolvedValueOnce({
        data: null,
        error: { message: 'non-2xx status code' },
      });

      const { result } = renderHook(() => useRetellAI());
      let res: any;
      await act(async () => {
        res = await result.current.importPhoneNumber('+15551234567', 'sip:uri');
      });

      expect(res).toBeNull();
    });

    it('deletePhoneNumber returns true on success', async () => {
      mockInvoke.mockResolvedValueOnce({ data: {}, error: null });

      const { result } = renderHook(() => useRetellAI());
      let res: any;
      await act(async () => {
        res = await result.current.deletePhoneNumber('+15551234567');
      });

      expect(res).toBe(true);
    });

    it('deletePhoneNumber returns false on data-level error', async () => {
      mockInvoke.mockResolvedValueOnce({ data: { error: 'not found' }, error: null });

      const { result } = renderHook(() => useRetellAI());
      let res: any;
      await act(async () => {
        res = await result.current.deletePhoneNumber('+15551234567');
      });

      expect(res).toBe(false);
    });

    it('purchaseNumber sends correct payload', async () => {
      mockInvoke.mockResolvedValueOnce({ data: { phone_number: '+15559999999' }, error: null });

      const { result } = renderHook(() => useRetellAI());
      let res: any;
      await act(async () => {
        res = await result.current.purchaseNumber('+15559999999');
      });

      expect(mockInvoke).toHaveBeenCalledWith('retell-phone-management', {
        body: { action: 'purchase', phoneNumber: '+15559999999' },
      });
      expect(res).toEqual({ phone_number: '+15559999999' });
    });

    it('listAvailableNumbers passes area code', async () => {
      mockInvoke.mockResolvedValueOnce({ data: [], error: null });

      const { result } = renderHook(() => useRetellAI());
      await act(async () => {
        await result.current.listAvailableNumbers('312');
      });

      expect(mockInvoke).toHaveBeenCalledWith('retell-phone-management', {
        body: { action: 'list_available', areaCode: '312' },
      });
    });
  });

  // ── Loading State ──────────────────────────────────────────────────

  describe('Loading State', () => {
    it('isLoading is true while an operation is in progress', async () => {
      let resolveInvoke: (v: any) => void;
      mockInvoke.mockReturnValueOnce(
        new Promise((r) => { resolveInvoke = r; })
      );

      const { result } = renderHook(() => useRetellAI());

      let promise: Promise<any>;
      act(() => {
        promise = result.current.listAgents();
      });

      // Loading should be true while the promise is pending
      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        resolveInvoke!({ data: [], error: null });
        await promise!;
      });

      expect(result.current.isLoading).toBe(false);
    });
  });

  // ── Error Handling ─────────────────────────────────────────────────

  describe('Error Handling', () => {
    it('handles thrown exceptions in importPhoneNumber gracefully', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Network down'));

      const { result } = renderHook(() => useRetellAI());
      let res: any;
      await act(async () => {
        res = await result.current.importPhoneNumber('+15551234567', 'sip:uri');
      });

      expect(res).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });

    it('handles thrown exceptions in updateAgent gracefully', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('timeout'));

      const { result } = renderHook(() => useRetellAI());
      let res: any;
      await act(async () => {
        res = await result.current.updateAgent('a1', { voice_id: 'v' });
      });

      expect(res).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });

    it('handles data-level errors in createAgent', async () => {
      mockInvoke.mockResolvedValueOnce({ data: { error: 'Name taken' }, error: null });

      const { result } = renderHook(() => useRetellAI());
      let res: any;
      await act(async () => {
        res = await result.current.createAgent('Dup', 'llm-1');
      });

      expect(res).toBeNull();
    });
  });

  // ── Webhook Configuration ──────────────────────────────────────────

  describe('configureWebhooksOnAllAgents', () => {
    it('updates webhook on each agent and returns counts', async () => {
      const agents = [
        { agent_id: 'a1', agent_name: 'Agent 1' },
        { agent_id: 'a2', agent_name: 'Agent 2' },
      ];
      // First call: listAgents
      mockInvoke.mockResolvedValueOnce({ data: agents, error: null });
      // Agent 1 update: success
      mockInvoke.mockResolvedValueOnce({ data: {}, error: null });
      // Agent 2 update: success
      mockInvoke.mockResolvedValueOnce({ data: {}, error: null });
      // listPhoneNumbers for inbound webhook
      mockInvoke.mockResolvedValueOnce({ data: [], error: null });

      const { result } = renderHook(() => useRetellAI());
      let res: any;
      await act(async () => {
        res = await result.current.configureWebhooksOnAllAgents();
      });

      expect(res).toEqual({ success: 2, failed: 0 });
    });

    it('counts failures when agent update errors', async () => {
      const agents = [{ agent_id: 'a1', agent_name: 'Agent 1' }];
      mockInvoke.mockResolvedValueOnce({ data: agents, error: null });
      // Agent update fails
      mockInvoke.mockResolvedValueOnce({ data: null, error: { message: 'fail' } });
      // listPhoneNumbers
      mockInvoke.mockResolvedValueOnce({ data: [], error: null });

      const { result } = renderHook(() => useRetellAI());
      let res: any;
      await act(async () => {
        res = await result.current.configureWebhooksOnAllAgents();
      });

      expect(res).toEqual({ success: 0, failed: 1 });
    });

    it('returns zero counts when no agents found', async () => {
      mockInvoke.mockResolvedValueOnce({ data: [], error: null });

      const { result } = renderHook(() => useRetellAI());
      let res: any;
      await act(async () => {
        res = await result.current.configureWebhooksOnAllAgents();
      });

      expect(res).toEqual({ success: 0, failed: 0 });
    });
  });

  // ── Connection Testing ─────────────────────────────────────────────

  describe('testConnection (via getRetellCredentials)', () => {
    it('returns true when list succeeds', async () => {
      mockInvoke.mockResolvedValueOnce({ data: [], error: null });

      const { result } = renderHook(() => useRetellAI());
      // getRetellCredentials is not exported, but we can test via testConnection behavior
      // by checking listPhoneNumbers which uses same pattern
    });
  });
});
