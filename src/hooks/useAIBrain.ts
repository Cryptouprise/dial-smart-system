import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNavigate, useLocation } from 'react-router-dom';

// Constants
const MAX_TITLE_LENGTH = 50;
const DEFAULT_PERSIST_CONVERSATION = true;

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
  persistConversation?: boolean;
}

// Tool to Manager mapping for visual indicator
const TOOL_TO_MANAGER: Record<string, string> = {
  'get_agent_script': 'Agent Manager',
  'update_agent_script': 'Agent Manager',
  'suggest_script_improvements': 'Agent Manager',
  'list_retell_agents': 'Agent Manager',
  'get_agent_history': 'Agent Manager',
  'add_agent_note': 'Agent Manager',
  'get_prompt_snippets': 'Script Manager',
  'check_agent_snippets': 'Script Manager',
  'add_snippet_to_agent': 'Script Manager',
  'purchase_retell_numbers': 'Number Pool Manager',
  'list_phone_numbers': 'Number Pool Manager',
  'search_available_numbers': 'Number Pool Manager',
  'assign_numbers_to_agent': 'Number Pool Manager',
  'toggle_number_rotation': 'Number Pool Manager',
  'delete_phone_numbers': 'Number Pool Manager',
  'list_leads': 'Lead Manager',
  'update_lead': 'Lead Manager',
  'delete_lead': 'Lead Manager',
  'search_leads_advanced': 'Lead Manager',
  'tag_leads': 'Lead Manager',
  'create_campaign': 'Campaign Manager',
  'update_campaign': 'Campaign Manager',
  'pause_campaign': 'Campaign Manager',
  'resume_campaign': 'Campaign Manager',
  'get_campaign_stats': 'Campaign Manager',
  'book_appointment': 'Calendar Manager',
  'check_calendar_availability': 'Calendar Manager',
  'list_appointments': 'Calendar Manager',
  'cancel_appointment': 'Calendar Manager',
  'create_workflow': 'Workflow Manager',
  'list_workflows': 'Workflow Manager',
  'send_sms_blast': 'SMS Manager',
  'create_voice_broadcast': 'Broadcast Manager',
  'get_autonomous_status': 'Autonomous Agent',
  'get_learning_insights': 'Learning Engine',
};

export interface ToolStatus {
  isExecuting: boolean;
  managerName: string | null;
  toolName: string | null;
}

export const useAIBrain = (options?: UseAIBrainOptions) => {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [toolStatus, setToolStatus] = useState<ToolStatus>({ isExecuting: false, managerName: null, toolName: null });
  const sessionIdRef = useRef(crypto.randomUUID());
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const persistConversation = options?.persistConversation ?? DEFAULT_PERSIST_CONVERSATION;

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

  // Load conversation from database on mount - DISABLED until tables are created
  useEffect(() => {
    // Database persistence disabled - tables don't exist yet
    // Will work with in-memory state only
  }, [persistConversation]);

  // Save message to database - DISABLED until tables are created
  const saveMessageToDb = useCallback(async (message: AIMessage, role: 'user' | 'assistant') => {
    // Database persistence disabled - tables don't exist yet
    // Messages are kept in memory only
  }, [conversationId, persistConversation]);

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

      // Show "Contacting..." indicator while waiting
      setToolStatus({ isExecuting: true, managerName: 'AI Brain', toolName: 'processing' });

      const { data, error } = await supabase.functions.invoke('ai-brain', {
        body: {
          message: userMessage,
          sessionId: sessionIdRef.current,
          currentRoute: location.pathname + location.search,
          conversationHistory,
          action: 'chat'
        }
      });

      // Update tool status based on tools executed
      if (data?.toolResults?.length > 0) {
        const toolName = data.toolResults[0]?.tool || 'unknown';
        const manager = TOOL_TO_MANAGER[toolName] || 'System';
        setToolStatus({ isExecuting: true, managerName: manager, toolName });
      }

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
      setToolStatus({ isExecuting: false, managerName: null, toolName: null });
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
    // Database persistence disabled - clear memory only
    setMessages([]);
    setConversationId(null);
    sessionIdRef.current = crypto.randomUUID();
    
    toast({
      title: 'Chat cleared',
      description: 'Conversation has been cleared'
    });
  }, [toast]);

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

  // Load archived conversations - DISABLED until tables are created
  const loadArchivedConversations = useCallback(async () => {
    // Database persistence disabled - return empty array
    return [];
  }, []);

  // Load a specific conversation - DISABLED until tables are created
  const loadConversation = useCallback(async (convId: string) => {
    // Database persistence disabled
    toast({
      title: 'Feature unavailable',
      description: 'Conversation history is not available yet',
      variant: 'destructive'
    });
  }, [toast]);

  // Quick actions
  const quickActions = {
    status: () => sendMessage('/status'),
    help: (topic?: string) => sendMessage(topic ? `/help ${topic}` : '/help'),
    createWorkflow: (description: string) => sendMessage(`Create a workflow: ${description}`),
    createCampaign: (name: string) => sendMessage(`Create a campaign called "${name}"`),
    sendSmsBlast: (message: string) => sendMessage(`Send SMS blast: ${message}`),
    listLeads: () => sendMessage('List my leads'),
    diagnose: (issue: string) => sendMessage(`Diagnose: ${issue}`),
    // Autonomous Agent quick actions
    systemStatus: () => sendMessage("What's going on with the system today?"),
    goalProgress: () => sendMessage("Show me today's autonomous goal progress"),
    aiInsights: () => sendMessage("What has the AI learned from recent calls?"),
    leadPriorities: () => sendMessage("Show me the top priority leads right now"),
    toggleAutonomous: (enabled: boolean) => sendMessage(`${enabled ? 'Enable' : 'Disable'} autonomous mode`)
  };

  return {
    messages,
    isLoading,
    isTyping,
    toolStatus,
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
