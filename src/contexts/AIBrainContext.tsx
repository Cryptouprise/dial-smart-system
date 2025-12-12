import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { useAIBrain, AIMessage } from '@/hooks/useAIBrain';

interface AIBrainContextType {
  // Chat state
  messages: AIMessage[];
  isLoading: boolean;
  isTyping: boolean;
  isOpen: boolean;
  
  // Actions
  sendMessage: (message: string) => Promise<void>;
  submitFeedback: (responseId: string, rating: 'up' | 'down', messageContent: string, responseContent: string) => Promise<void>;
  clearMessages: () => void;
  retryLastMessage: () => Promise<void>;
  handleNavigation: (route: string) => void;
  
  // UI controls
  openChat: () => void;
  closeChat: () => void;
  toggleChat: () => void;
  
  // Quick actions
  quickActions: {
    status: () => void;
    help: (topic?: string) => void;
    createWorkflow: (description: string) => void;
    createCampaign: (name: string) => void;
    sendSmsBlast: (message: string) => void;
    listLeads: () => void;
    diagnose: (issue: string) => void;
  };
  
  // Session
  sessionId: string;
}

const AIBrainContext = createContext<AIBrainContextType | null>(null);

export const useAIBrainContext = () => {
  const context = useContext(AIBrainContext);
  if (!context) {
    throw new Error('useAIBrainContext must be used within AIBrainProvider');
  }
  return context;
};

interface AIBrainProviderProps {
  children: ReactNode;
}

export const AIBrainProvider: React.FC<AIBrainProviderProps> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  const handleNavigation = useCallback((route: string) => {
    // Navigate without closing chat
    window.history.pushState({}, '', route);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, []);

  const brain = useAIBrain({ onNavigate: handleNavigation });

  const openChat = useCallback(() => setIsOpen(true), []);
  const closeChat = useCallback(() => setIsOpen(false), []);
  const toggleChat = useCallback(() => setIsOpen(prev => !prev), []);

  const value: AIBrainContextType = {
    ...brain,
    isOpen,
    openChat,
    closeChat,
    toggleChat
  };

  return (
    <AIBrainContext.Provider value={value}>
      {children}
    </AIBrainContext.Provider>
  );
};

export default AIBrainContext;
