import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { AIBrainProvider, useAIBrainContext } from '../AIBrainContext';

vi.mock('@/integrations/supabase/client');

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/', search: '', hash: '', state: null, key: 'default' }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return <AIBrainProvider>{children}</AIBrainProvider>;
}

describe('AIBrainContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Provider Rendering ─────────────────────────────────────────────

  describe('Provider', () => {
    it('renders children without crashing', () => {
      const { result } = renderHook(() => useAIBrainContext(), { wrapper });
      expect(result.current).toBeDefined();
    });
  });

  // ── Context Interface ──────────────────────────────────────────────

  describe('Context Interface', () => {
    it('provides messages array', () => {
      const { result } = renderHook(() => useAIBrainContext(), { wrapper });
      expect(Array.isArray(result.current.messages)).toBe(true);
    });

    it('provides isLoading boolean', () => {
      const { result } = renderHook(() => useAIBrainContext(), { wrapper });
      expect(typeof result.current.isLoading).toBe('boolean');
      expect(result.current.isLoading).toBe(false);
    });

    it('provides isTyping boolean', () => {
      const { result } = renderHook(() => useAIBrainContext(), { wrapper });
      expect(typeof result.current.isTyping).toBe('boolean');
      expect(result.current.isTyping).toBe(false);
    });

    it('provides isOpen boolean (initially false)', () => {
      const { result } = renderHook(() => useAIBrainContext(), { wrapper });
      expect(result.current.isOpen).toBe(false);
    });

    it('provides conversationId (initially null)', () => {
      const { result } = renderHook(() => useAIBrainContext(), { wrapper });
      expect(result.current.conversationId).toBeNull();
    });

    it('provides toolStatus object', () => {
      const { result } = renderHook(() => useAIBrainContext(), { wrapper });
      expect(result.current.toolStatus).toEqual({
        isExecuting: false,
        managerName: null,
        toolName: null,
      });
    });

    it('provides sessionId string', () => {
      const { result } = renderHook(() => useAIBrainContext(), { wrapper });
      expect(typeof result.current.sessionId).toBe('string');
      expect(result.current.sessionId.length).toBeGreaterThan(0);
    });

    it('provides all action functions', () => {
      const { result } = renderHook(() => useAIBrainContext(), { wrapper });
      expect(typeof result.current.sendMessage).toBe('function');
      expect(typeof result.current.submitFeedback).toBe('function');
      expect(typeof result.current.clearMessages).toBe('function');
      expect(typeof result.current.retryLastMessage).toBe('function');
      expect(typeof result.current.handleNavigation).toBe('function');
      expect(typeof result.current.loadArchivedConversations).toBe('function');
      expect(typeof result.current.loadConversation).toBe('function');
    });

    it('provides UI control functions', () => {
      const { result } = renderHook(() => useAIBrainContext(), { wrapper });
      expect(typeof result.current.openChat).toBe('function');
      expect(typeof result.current.closeChat).toBe('function');
      expect(typeof result.current.toggleChat).toBe('function');
    });

    it('provides quick actions', () => {
      const { result } = renderHook(() => useAIBrainContext(), { wrapper });
      expect(typeof result.current.quickActions.status).toBe('function');
      expect(typeof result.current.quickActions.help).toBe('function');
      expect(typeof result.current.quickActions.createWorkflow).toBe('function');
      expect(typeof result.current.quickActions.createCampaign).toBe('function');
      expect(typeof result.current.quickActions.sendSmsBlast).toBe('function');
      expect(typeof result.current.quickActions.listLeads).toBe('function');
      expect(typeof result.current.quickActions.diagnose).toBe('function');
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

    it('closeChat sets isOpen to false', () => {
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

    it('toggleChat flips isOpen', () => {
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
  });

  // ── Message Sending ────────────────────────────────────────────────

  describe('Message Sending', () => {
    it('sendMessage does not throw on empty string', async () => {
      const { result } = renderHook(() => useAIBrainContext(), { wrapper });

      await act(async () => {
        await result.current.sendMessage('');
      });

      // Empty message should be ignored, messages stays empty
      expect(result.current.messages).toHaveLength(0);
    });

    it('sendMessage does not throw on whitespace-only string', async () => {
      const { result } = renderHook(() => useAIBrainContext(), { wrapper });

      await act(async () => {
        await result.current.sendMessage('   ');
      });

      expect(result.current.messages).toHaveLength(0);
    });
  });

  // ── Conversation State ─────────────────────────────────────────────

  describe('Conversation State', () => {
    it('clearMessages resets messages to empty', async () => {
      const { result } = renderHook(() => useAIBrainContext(), { wrapper });

      await act(async () => {
        await result.current.clearMessages();
      });

      expect(result.current.messages).toHaveLength(0);
      expect(result.current.conversationId).toBeNull();
    });

    it('loadArchivedConversations returns empty array (persistence disabled)', async () => {
      const { result } = renderHook(() => useAIBrainContext(), { wrapper });

      let archives: any;
      await act(async () => {
        archives = await result.current.loadArchivedConversations();
      });

      expect(archives).toEqual([]);
    });
  });
});
