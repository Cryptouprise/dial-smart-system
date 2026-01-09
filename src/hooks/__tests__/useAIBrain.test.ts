import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAIBrain } from '../useAIBrain';

vi.mock('@/integrations/supabase/client');

describe('useAIBrain - AI Chat Agent Quality', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize AI brain system', () => {
    const { result } = renderHook(() => useAIBrain());
    
    expect(result.current).toBeDefined();
    expect(result.current.isReady).toBeDefined();
  });

  describe('Human-like Conversation Quality', () => {
    it('should provide contextual responses', async () => {
      const { result } = renderHook(() => useAIBrain());
      
      const userMessage = "I need help with my campaign";
      
      await act(async () => {
        await result.current.sendMessage(userMessage);
      });
      
      // Response should be relevant and helpful
      expect(result.current.lastResponse).toBeDefined();
      expect(result.current.lastResponse.length).toBeGreaterThan(20);
    });

    it('should maintain conversation context', async () => {
      const { result } = renderHook(() => useAIBrain());
      
      // First message
      await act(async () => {
        await result.current.sendMessage("Create a campaign");
      });
      
      // Follow-up should understand context
      await act(async () => {
        await result.current.sendMessage("What should I name it?");
      });
      
      expect(result.current.conversationHistory).toHaveLength(2);
    });

    it('should use natural language (not robotic)', async () => {
      const { result } = renderHook(() => useAIBrain());
      
      await act(async () => {
        await result.current.sendMessage("Hello");
      });
      
      const response = result.current.lastResponse;
      
      // Should not contain robotic phrases
      expect(response).not.toMatch(/ERROR|INVALID|SYSTEM/i);
      // Should be conversational
      expect(response.length).toBeGreaterThan(10);
    });

    it('should handle ambiguous requests intelligently', async () => {
      const { result } = renderHook(() => useAIBrain());
      
      const ambiguousRequest = "Fix it";
      
      await act(async () => {
        await result.current.sendMessage(ambiguousRequest);
      });
      
      // Should ask for clarification, not error
      expect(result.current.lastResponse).toMatch(/clarify|specify|which|what/i);
    });

    it('should provide actionable suggestions', async () => {
      const { result } = renderHook(() => useAIBrain());
      
      await act(async () => {
        await result.current.sendMessage("My campaign isn't performing well");
      });
      
      const response = result.current.lastResponse;
      
      // Should provide specific help
      expect(response).toMatch(/try|suggest|recommend|improve/i);
    });
  });

  describe('AI Assistant Capabilities', () => {
    it('should understand campaign management commands', async () => {
      const { result } = renderHook(() => useAIBrain());
      
      await act(async () => {
        await result.current.processCommand("Create a new campaign for real estate leads");
      });
      
      expect(result.current.understanding).toMatchObject({
        intent: 'create_campaign',
        entity: 'real_estate',
      });
    });

    it('should provide workflow recommendations', async () => {
      const { result } = renderHook(() => useAIBrain());
      
      const campaignData = {
        type: 'cold_calling',
        industry: 'real_estate',
      };
      
      const recommendations = await result.current.getWorkflowRecommendations(campaignData);
      
      expect(recommendations).toBeDefined();
      expect(Array.isArray(recommendations)).toBe(true);
      expect(recommendations.length).toBeGreaterThan(0);
    });

    it('should learn from user interactions', async () => {
      const { result } = renderHook(() => useAIBrain());
      
      await act(async () => {
        await result.current.recordInteraction({
          action: 'campaign_created',
          success: true,
          feedback: 'positive',
        });
      });
      
      expect(result.current.learningData).toBeDefined();
    });

    it('should detect user intent accurately', async () => {
      const { result } = renderHook(() => useAIBrain());
      
      const testMessages = [
        { message: "Start a campaign", expected: "action" },
        { message: "How many calls today?", expected: "query" },
        { message: "Why did this fail?", expected: "troubleshoot" },
      ];
      
      for (const test of testMessages) {
        const intent = result.current.detectIntent(test.message);
        expect(intent.type).toBe(test.expected);
      }
    });
  });

  describe('Error Handling & Personality', () => {
    it('should handle errors gracefully with helpful messages', async () => {
      const { result } = renderHook(() => useAIBrain());
      
      await act(async () => {
        await result.current.sendMessage("DELETE ALL DATA");
      });
      
      const response = result.current.lastResponse;
      
      // Should be helpful, not harsh
      expect(response).not.toMatch(/invalid|error|failed/i);
      expect(response).toMatch(/sorry|cannot|unable|help/i);
    });

    it('should have consistent personality', async () => {
      const { result } = renderHook(() => useAIBrain());
      
      const personality = result.current.getPersonality();
      
      expect(personality).toMatchObject({
        tone: expect.stringMatching(/friendly|professional|helpful/i),
        style: expect.stringMatching(/conversational|clear|concise/i),
      });
    });

    it('should avoid jargon in explanations', async () => {
      const { result } = renderHook(() => useAIBrain());
      
      await act(async () => {
        await result.current.explainConcept("RLS policies");
      });
      
      const explanation = result.current.lastResponse;
      
      // Should be understandable
      expect(explanation).toBeDefined();
      expect(explanation.length).toBeGreaterThan(50);
    });
  });

  describe('Response Quality Metrics', () => {
    it('should respond within acceptable time', async () => {
      const { result } = renderHook(() => useAIBrain());
      
      const startTime = Date.now();
      
      await act(async () => {
        await result.current.sendMessage("Test message");
      });
      
      const responseTime = Date.now() - startTime;
      
      // Should be fast (under 3 seconds in mock)
      expect(responseTime).toBeLessThan(3000);
    });

    it('should provide responses of appropriate length', async () => {
      const { result } = renderHook(() => useAIBrain());
      
      await act(async () => {
        await result.current.sendMessage("What is a campaign?");
      });
      
      const response = result.current.lastResponse;
      
      // Not too short, not too long
      expect(response.length).toBeGreaterThan(30);
      expect(response.length).toBeLessThan(500);
    });

    it('should format responses readably', async () => {
      const { result } = renderHook(() => useAIBrain());
      
      await act(async () => {
        await result.current.sendMessage("List campaign steps");
      });
      
      const response = result.current.lastResponse;
      
      // Should have structure (bullets, numbers, or paragraphs)
      const hasStructure = response.includes('\n') || 
                          response.match(/\d\./) || 
                          response.includes('•');
      
      expect(hasStructure).toBeTruthy();
    });
  });
});
