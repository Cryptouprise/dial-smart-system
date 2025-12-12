import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNavigate, useLocation } from 'react-router-dom';

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolResults?: any[];
  isStreaming?: boolean;
}

interface NavigationLink {
  text: string;
  route: string;
}

interface UseAIBrainOptions {
  onNavigate?: (route: string) => void;
}

export const useAIBrain = (options?: UseAIBrainOptions) => {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const sessionIdRef = useRef(crypto.randomUUID());
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  // Parse navigation links from content: [[Display Text|/route]]
  const parseNavigationLinks = useCallback((content: string): { cleanContent: string; links: NavigationLink[] } => {
    const linkPattern = /\[\[([^\]|]+)\|([^\]]+)\]\]/g;
    const links: NavigationLink[] = [];
    
    const cleanContent = content.replace(linkPattern, (match, text, route) => {
      links.push({ text, route });
      return `[${text}](nav:${route})`;
    });

    return { cleanContent, links };
  }, []);

  // Handle navigation while keeping chat open
  const handleNavigation = useCallback((route: string) => {
    if (options?.onNavigate) {
      options.onNavigate(route);
    } else {
      navigate(route);
    }
  }, [navigate, options]);

  // Send message to AI Brain
  const sendMessage = useCallback(async (userMessage: string): Promise<void> => {
    if (!userMessage.trim() || isLoading) return;

    const userMsg: AIMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);
    setIsTyping(true);

    try {
      // Build conversation history for context
      const conversationHistory = messages.slice(-10).map(m => ({
        role: m.role,
        content: m.content
      }));

      const { data, error } = await supabase.functions.invoke('ai-brain', {
        body: {
          message: userMessage,
          sessionId: sessionIdRef.current,
          currentRoute: location.pathname + location.search,
          conversationHistory,
          action: 'chat'
        }
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      const { cleanContent, links } = parseNavigationLinks(data.content || '');

      const assistantMsg: AIMessage = {
        id: data.responseId || crypto.randomUUID(),
        role: 'assistant',
        content: cleanContent,
        timestamp: new Date(),
        toolResults: data.toolResults
      };

      setMessages(prev => [...prev, assistantMsg]);

      // Show toast for successful actions
      if (data.toolResults?.some((r: any) => r.success)) {
        const successResult = data.toolResults.find((r: any) => r.success && r.result?.message);
        if (successResult) {
          toast({
            title: 'Action completed',
            description: successResult.result.message
          });
        }
      }

    } catch (error: any) {
      console.error('AI Brain error:', error);
      
      let errorMessage = 'Something went wrong. Please try again.';
      if (error.message?.includes('Rate limit')) {
        errorMessage = 'Too many requests. Please wait a moment.';
      } else if (error.message?.includes('credits')) {
        errorMessage = 'AI credits exhausted. Please add more credits.';
      }

      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      });

      // Add error message to chat
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `I encountered an error: ${errorMessage}`,
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
      setIsTyping(false);
    }
  }, [isLoading, messages, location, parseNavigationLinks, toast]);

  // Submit feedback on a response
  const submitFeedback = useCallback(async (
    responseId: string, 
    rating: 'up' | 'down',
    messageContent: string,
    responseContent: string
  ) => {
    try {
      await supabase.functions.invoke('ai-brain', {
        body: {
          action: 'feedback',
          responseId,
          rating,
          messageContent,
          responseContent
        }
      });

      toast({
        title: rating === 'up' ? 'Thanks!' : 'Feedback noted',
        description: rating === 'up' 
          ? 'Glad I could help!' 
          : 'I\'ll try to do better next time.'
      });
    } catch (error) {
      console.error('Feedback error:', error);
    }
  }, [toast]);

  // Clear conversation
  const clearMessages = useCallback(() => {
    setMessages([]);
    sessionIdRef.current = crypto.randomUUID();
  }, []);

  // Retry last message
  const retryLastMessage = useCallback(async () => {
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    if (lastUserMessage) {
      // Remove last assistant message if it exists
      setMessages(prev => {
        // Find last assistant message index (ES5 compatible)
        let lastAssistantIndex = -1;
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i].role === 'assistant') {
            lastAssistantIndex = i;
            break;
          }
        }
        if (lastAssistantIndex > -1) {
          return prev.slice(0, lastAssistantIndex);
        }
        return prev;
      });
      // Retry
      await sendMessage(lastUserMessage.content);
    }
  }, [messages, sendMessage]);

  // Quick actions
  const quickActions = {
    status: () => sendMessage('/status'),
    help: (topic?: string) => sendMessage(topic ? `/help ${topic}` : '/help'),
    createWorkflow: (description: string) => sendMessage(`Create a workflow: ${description}`),
    createCampaign: (name: string) => sendMessage(`Create a campaign called "${name}"`),
    sendSmsBlast: (message: string) => sendMessage(`Send SMS blast: ${message}`),
    listLeads: () => sendMessage('List my leads'),
    diagnose: (issue: string) => sendMessage(`Diagnose: ${issue}`)
  };

  return {
    messages,
    isLoading,
    isTyping,
    sendMessage,
    submitFeedback,
    clearMessages,
    retryLastMessage,
    handleNavigation,
    quickActions,
    sessionId: sessionIdRef.current
  };
};
