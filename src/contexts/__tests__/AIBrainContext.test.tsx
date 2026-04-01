import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, render, screen } from '@testing-library/react';
import React from 'react';
import { AIBrainProvider, useAIBrainContext } from '../AIBrainContext';

// Mock supabase - sendMessage calls supabase.functions.invoke('ai-brain', ...)
const mockInvoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...args: any[]) => mockInvoke(...args) },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnValue({ then: (r: any) => Promise.resolve({ data: null, error: null }).then(r) }),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(() => Promise.resolve({ data: null, error: null })),
    }),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/', search: '', hash: '', state: null, key: 'default' }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return <AIBrainProvider>{children}</AIBrainProvider>;
}

describe('AIBrainContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockReset();
  });

  // ── Provider Rendering ─────────────────────────────────────────────

  describe('Provider', () => {
    it('renders children correctly', () => {
      render(
        <AIBrainProvider>
          <div data-testid="child">Hello</div>
        </AIBrainProvider>
      );
      expect(screen.getByTestId('child')).toHaveTextContent('Hello');
    });

    it('renders multiple children', () => {
      render(
        <AIBrainProvider>
          <span data-testid="a">A</span>
          <span data-testid="b">B</span>
        </AIBrainProvider>
      );
      expect(screen.getByTestId('a')).toBeInTheDocument();
      expect(screen.getByTestId('b')).toBeInTheDocument();
    });
  });

  // ── Throws Outside Provider ────────────────────────────────────────

  describe('useAIBrainContext outside provider', () => {
    it('throws when used outside AIBrainProvider', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => {
        renderHook(() => useAIBrainContext());
      }).toThrow('useAIBrainContext must be used within AIBrainProvider');
      spy.mockRestore();
    });
  });

  // ── Initial State ─────────────────────────────────────────────────

  describe('Initial State', () => {
    it('starts with empty messages array', () => {
      const { result } = renderHook(() => useAIBrainContext(), { wrapper });
      expect(result.current.messages).toEqual([]);
    });

    it('starts with isLoading false', () => {
      const { result } = renderHook(() => useAIBrainContext(), { wrapper });
      expect(result.current.isLoading).toBe(false);
    });

    it('starts with isTyping false', () => {
      const { result } = renderHook(() => useAIBrainContext(), { wrapper });
      expect(result.current.isTyping).toBe(false);
    });

    it('starts with isOpen false', () => {
      const { result } = renderHook(() => useAIBrainContext(), { wrapper });
      expect(result.current.isOpen).toBe(false);
    });

    it('starts with null conversationId', () => {
      const { result } = renderHook(() => useAIBrainContext(), { wrapper });
      expect(result.current.conversationId).toBeNull();
    });

    it('starts with idle toolStatus', () => {
      const { result } = renderHook(() => useAIBrainContext(), { wrapper });
      expect(result.current.toolStatus).toEqual({
        isExecuting: false,
        managerName: null,
        toolName: null,
      });
    });

    it('generates a non-empty sessionId', () => {
      const { result } = renderHook(() => useAIBrainContext(), { wrapper });
      expect(result.current.sessionId).toBeTruthy();
      expect(result.current.sessionId.length).toBeGreaterThan(0);
    });
  });

  // ── Chat Open/Close ────────────────────────────────────────────────

  describe('Chat UI Controls', () => {
    it('openChat sets isOpen to true', () => {
      const { result } = renderHook(() => useAIBrainContext(), { wrapper });
      expect(result.current.isOpen).toBe(false);

      act(() => {
        result.current.openChat();
      });

      expect(result.current.isOpen).toBe(true);
    });

    it('closeChat sets isOpen to false after opening', () => {
      const { result } = renderHook(() => useAIBrainContext(), { wrapper });

      act(() => {
        result.current.openChat();
      });
      expect(result.current.isOpen).toBe(true);

      act(() => {
        result.current.closeChat();
      });
      expect(result.current.isOpen).toBe(false);
    });

    it('toggleChat flips isOpen back and forth', () => {
      const { result } = renderHook(() => useAIBrainContext(), { wrapper });

      act(() => {
        result.current.toggleChat();
      });
      expect(result.current.isOpen).toBe(true);

      act(() => {
        result.current.toggleChat();
      });
      expect(result.current.isOpen).toBe(false);
    });

    it('multiple openChat calls keep isOpen true', () => {
      const { result } = renderHook(() => useAIBrainContext(), { wrapper });

      act(() => {
        result.current.openChat();
        result.current.openChat();
      });

      expect(result.current.isOpen).toBe(true);
    });
  });

  // ── Message Sending ────────────────────────────────────────────────

  describe('Message Sending', () => {
    it('sendMessage adds user message to messages array', async () => {
      mockInvoke.mockResolvedValueOnce({
        data: { content: 'AI response', responseId: 'resp-1' },
        error: null,
      });

      const { result } = renderHook(() => useAIBrainContext(), { wrapper });

      await act(async () => {
        await result.current.sendMessage('Hello AI');
      });

      const userMsg = result.current.messages.find(m => m.role === 'user');
      expect(userMsg).toBeDefined();
      expect(userMsg!.content).toBe('Hello AI');
    });

    it('sendMessage adds assistant response to messages array', async () => {
      mockInvoke.mockResolvedValueOnce({
        data: { content: 'Hello human!', responseId: 'resp-2' },
        error: null,
      });

      const { result } = renderHook(() => useAIBrainContext(), { wrapper });

      await act(async () => {
        await result.current.sendMessage('Hi');
      });

      const assistantMsg = result.current.messages.find(m => m.role === 'assistant');
      expect(assistantMsg).toBeDefined();
      expect(assistantMsg!.content).toBe('Hello human!');
    });

    it('sendMessage calls supabase ai-brain function with correct params', async () => {
      mockInvoke.mockResolvedValueOnce({
        data: { content: 'response', responseId: 'r1' },
        error: null,
      });

      const { result } = renderHook(() => useAIBrainContext(), { wrapper });

      await act(async () => {
        await result.current.sendMessage('Test message');
      });

      expect(mockInvoke).toHaveBeenCalledWith('ai-brain', expect.objectContaining({
        body: expect.objectContaining({
          message: 'Test message',
          action: 'chat',
        }),
      }));
    });

    it('sendMessage ignores empty string', async () => {
      const { result } = renderHook(() => useAIBrainContext(), { wrapper });

      await act(async () => {
        await result.current.sendMessage('');
      });

      expect(result.current.messages).toHaveLength(0);
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('sendMessage ignores whitespace-only string', async () => {
      const { result } = renderHook(() => useAIBrainContext(), { wrapper });

      await act(async () => {
        await result.current.sendMessage('   ');
      });

      expect(result.current.messages).toHaveLength(0);
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('sendMessage produces two messages (user + assistant) on success', async () => {
      mockInvoke.mockResolvedValueOnce({
        data: { content: 'Got it!', responseId: 'resp-3' },
        error: null,
      });

      const { result } = renderHook(() => useAIBrainContext(), { wrapper });

      await act(async () => {
        await result.current.sendMessage('Do something');
      });

      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[0].role).toBe('user');
      expect(result.current.messages[1].role).toBe('assistant');
    });

    it('sets isLoading false after sendMessage completes', async () => {
      mockInvoke.mockResolvedValueOnce({
        data: { content: 'done', responseId: 'r' },
        error: null,
      });

      const { result } = renderHook(() => useAIBrainContext(), { wrapper });

      await act(async () => {
        await result.current.sendMessage('test');
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.isTyping).toBe(false);
    });
  });

  // ── Error Handling ─────────────────────────────────────────────────

  describe('Error Handling on sendMessage', () => {
    it('adds error message to chat when supabase returns an error', async () => {
      mockInvoke.mockResolvedValueOnce({
        data: null,
        error: new Error('Server error'),
      });

      const { result } = renderHook(() => useAIBrainContext(), { wrapper });

      await act(async () => {
        await result.current.sendMessage('break things');
      });

      // Should have user message + error assistant message
      expect(result.current.messages).toHaveLength(2);
      const errorMsg = result.current.messages[1];
      expect(errorMsg.role).toBe('assistant');
      expect(errorMsg.content).toContain('error');
    });

    it('adds error message when data.error is set', async () => {
      mockInvoke.mockResolvedValueOnce({
        data: { error: 'Something went wrong internally' },
        error: null,
      });

      const { result } = renderHook(() => useAIBrainContext(), { wrapper });

      await act(async () => {
        await result.current.sendMessage('trigger error');
      });

      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[1].role).toBe('assistant');
      expect(result.current.messages[1].content).toContain('error');
    });

    it('resets isLoading and isTyping after error', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Network failure'));

      const { result } = renderHook(() => useAIBrainContext(), { wrapper });

      await act(async () => {
        await result.current.sendMessage('fail');
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.isTyping).toBe(false);
    });

    it('resets toolStatus after error', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('timeout'));

      const { result } = renderHook(() => useAIBrainContext(), { wrapper });

      await act(async () => {
        await result.current.sendMessage('test');
      });

      expect(result.current.toolStatus).toEqual({
        isExecuting: false,
        managerName: null,
        toolName: null,
      });
    });
  });

  // ── Conversation State ─────────────────────────────────────────────

  describe('Conversation State', () => {
    it('clearMessages resets messages to empty after messages were added', async () => {
      mockInvoke.mockResolvedValueOnce({
        data: { content: 'response', responseId: 'r' },
        error: null,
      });

      const { result } = renderHook(() => useAIBrainContext(), { wrapper });

      await act(async () => {
        await result.current.sendMessage('hello');
      });
      expect(result.current.messages.length).toBeGreaterThan(0);

      await act(async () => {
        await result.current.clearMessages();
      });

      expect(result.current.messages).toHaveLength(0);
    });

    it('clearMessages resets conversationId to null', async () => {
      const { result } = renderHook(() => useAIBrainContext(), { wrapper });

      await act(async () => {
        await result.current.clearMessages();
      });

      expect(result.current.conversationId).toBeNull();
    });

    it('loadArchivedConversations returns empty array', async () => {
      const { result } = renderHook(() => useAIBrainContext(), { wrapper });

      let archives: any;
      await act(async () => {
        archives = await result.current.loadArchivedConversations();
      });

      expect(archives).toEqual([]);
    });
  });

  // ── Quick Actions ──────────────────────────────────────────────────

  describe('Quick Actions', () => {
    it('quickActions.status sends /status message', async () => {
      mockInvoke.mockResolvedValueOnce({
        data: { content: 'status ok', responseId: 'r' },
        error: null,
      });

      const { result } = renderHook(() => useAIBrainContext(), { wrapper });

      await act(async () => {
        await result.current.quickActions.status();
      });

      expect(mockInvoke).toHaveBeenCalledWith('ai-brain', expect.objectContaining({
        body: expect.objectContaining({ message: '/status' }),
      }));
    });

    it('quickActions.help sends /help message', async () => {
      mockInvoke.mockResolvedValueOnce({
        data: { content: 'help info', responseId: 'r' },
        error: null,
      });

      const { result } = renderHook(() => useAIBrainContext(), { wrapper });

      await act(async () => {
        await result.current.quickActions.help();
      });

      expect(mockInvoke).toHaveBeenCalledWith('ai-brain', expect.objectContaining({
        body: expect.objectContaining({ message: '/help' }),
      }));
    });

    it('quickActions.help with topic sends /help <topic>', async () => {
      mockInvoke.mockResolvedValueOnce({
        data: { content: 'topic info', responseId: 'r' },
        error: null,
      });

      const { result } = renderHook(() => useAIBrainContext(), { wrapper });

      await act(async () => {
        await result.current.quickActions.help('workflows');
      });

      expect(mockInvoke).toHaveBeenCalledWith('ai-brain', expect.objectContaining({
        body: expect.objectContaining({ message: '/help workflows' }),
      }));
    });

    it('quickActions.listLeads sends list leads message', async () => {
      mockInvoke.mockResolvedValueOnce({
        data: { content: 'leads list', responseId: 'r' },
        error: null,
      });

      const { result } = renderHook(() => useAIBrainContext(), { wrapper });

      await act(async () => {
        await result.current.quickActions.listLeads();
      });

      expect(mockInvoke).toHaveBeenCalledWith('ai-brain', expect.objectContaining({
        body: expect.objectContaining({ message: 'List my leads' }),
      }));
    });
  });

  // ── Retry Last Message ─────────────────────────────────────────────

  describe('retryLastMessage', () => {
    it('re-sends the last user message', async () => {
      // First message succeeds
      mockInvoke.mockResolvedValueOnce({
        data: { content: 'first response', responseId: 'r1' },
        error: null,
      });
      // Retry also succeeds
      mockInvoke.mockResolvedValueOnce({
        data: { content: 'retry response', responseId: 'r2' },
        error: null,
      });

      const { result } = renderHook(() => useAIBrainContext(), { wrapper });

      await act(async () => {
        await result.current.sendMessage('retry me');
      });

      expect(result.current.messages).toHaveLength(2);

      await act(async () => {
        await result.current.retryLastMessage();
      });

      // Should have called ai-brain twice: original + retry
      expect(mockInvoke).toHaveBeenCalledTimes(2);
      // Both calls with same message
      expect(mockInvoke).toHaveBeenNthCalledWith(1, 'ai-brain', expect.objectContaining({
        body: expect.objectContaining({ message: 'retry me' }),
      }));
      expect(mockInvoke).toHaveBeenNthCalledWith(2, 'ai-brain', expect.objectContaining({
        body: expect.objectContaining({ message: 'retry me' }),
      }));
    });

    it('does nothing when no messages exist', async () => {
      const { result } = renderHook(() => useAIBrainContext(), { wrapper });

      await act(async () => {
        await result.current.retryLastMessage();
      });

      expect(mockInvoke).not.toHaveBeenCalled();
      expect(result.current.messages).toHaveLength(0);
    });
  });
});
