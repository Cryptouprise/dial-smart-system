import { useState, useCallback, useRef, useEffect } from 'react';
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
  persistConversation?: boolean; // New option to enable/disable persistence
}

export const useAIBrain = (options?: UseAIBrainOptions) => {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const sessionIdRef = useRef(crypto.randomUUID());
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const persistConversation = options?.persistConversation ?? true; // Default to true

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

  // Load conversation from database on mount
  useEffect(() => {
    if (!persistConversation) return;

    const loadConversation = async () => {
      try {
        // Try to load the most recent conversation for this session
        const { data: conversation } = await supabase
          .from('ai_conversations')
          .select('id')
          .eq('session_id', sessionIdRef.current)
          .eq('archived', false)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (conversation) {
          setConversationId(conversation.id);
          
          // Load messages
          const { data: messagesData } = await supabase
            .from('ai_conversation_messages')
            .select('*')
            .eq('conversation_id', conversation.id)
            .order('created_at', { ascending: true });

          if (messagesData) {
            const loadedMessages: AIMessage[] = messagesData.map(msg => ({
              id: msg.id,
              role: msg.role as 'user' | 'assistant',
              content: msg.content,
              timestamp: new Date(msg.created_at),
              toolResults: msg.tool_results || []
            }));
            setMessages(loadedMessages);
          }
        }
      } catch (error) {
        console.error('Failed to load conversation:', error);
      }
    };

    loadConversation();
  }, [persistConversation]);

  // Save message to database
  const saveMessageToDb = useCallback(async (message: AIMessage, role: 'user' | 'assistant') => {
    if (!persistConversation) return;

    try {
      // Create conversation if it doesn't exist
      if (!conversationId) {
        const { data: user } = await supabase.auth.getUser();
        if (!user.user) return;

        const { data: newConversation } = await supabase
          .from('ai_conversations')
          .insert({
            user_id: user.user.id,
            session_id: sessionIdRef.current,
            title: messages.length === 0 ? message.content.slice(0, 50) : null
          })
          .select()
          .single();

        if (newConversation) {
          setConversationId(newConversation.id);
          
          // Save the message
          await supabase
            .from('ai_conversation_messages')
            .insert({
              conversation_id: newConversation.id,
              role,
              content: message.content,
              tool_results: message.toolResults || [],
              metadata: {}
            });
        }
      } else {
        // Save to existing conversation
        await supabase
          .from('ai_conversation_messages')
          .insert({
            conversation_id: conversationId,
            role,
            content: message.content,
            tool_results: message.toolResults || [],
            metadata: {}
          });
      }
    } catch (error) {
      console.error('Failed to save message:', error);
    }
  }, [conversationId, persistConversation, messages.length]);

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

    // Save user message to database
    await saveMessageToDb(userMsg, 'user');

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

      // Save assistant message to database
      await saveMessageToDb(assistantMsg, 'assistant');

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
      const errorMsg: AIMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `I encountered an error: ${errorMessage}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
      
      // Save error message to database
      await saveMessageToDb(errorMsg, 'assistant');
    } finally {
      setIsLoading(false);
      setIsTyping(false);
    }
  }, [isLoading, messages, location, parseNavigationLinks, toast, saveMessageToDb]);

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
  const clearMessages = useCallback(async () => {
    // Archive current conversation if it exists
    if (persistConversation && conversationId) {
      try {
        await supabase
          .from('ai_conversations')
          .update({ archived: true })
          .eq('id', conversationId);
      } catch (error) {
        console.error('Failed to archive conversation:', error);
      }
    }
    
    setMessages([]);
    setConversationId(null);
    sessionIdRef.current = crypto.randomUUID();
    
    toast({
      title: 'Chat cleared',
      description: 'Previous conversation has been archived'
    });
  }, [conversationId, persistConversation, toast]);

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

  // Load archived conversations
  const loadArchivedConversations = useCallback(async () => {
    try {
      const { data: conversations } = await supabase
        .from('ai_conversations')
        .select('id, title, created_at, updated_at')
        .eq('archived', true)
        .order('updated_at', { ascending: false })
        .limit(50);

      return conversations || [];
    } catch (error) {
      console.error('Failed to load archived conversations:', error);
      return [];
    }
  }, []);

  // Load a specific conversation
  const loadConversation = useCallback(async (convId: string) => {
    try {
      const { data: messagesData } = await supabase
        .from('ai_conversation_messages')
        .select('*')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true });

      if (messagesData) {
        const loadedMessages: AIMessage[] = messagesData.map(msg => ({
          id: msg.id,
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
          timestamp: new Date(msg.created_at),
          toolResults: msg.tool_results || []
        }));
        setMessages(loadedMessages);
        setConversationId(convId);
        
        // Unarchive this conversation
        await supabase
          .from('ai_conversations')
          .update({ archived: false })
          .eq('id', convId);
        
        toast({
          title: 'Conversation loaded',
          description: 'Continue where you left off'
        });
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
      toast({
        title: 'Error',
        description: 'Failed to load conversation',
        variant: 'destructive'
      });
    }
  }, [toast]);

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
    sessionId: sessionIdRef.current,
    conversationId,
    loadArchivedConversations,
    loadConversation
  };
};
