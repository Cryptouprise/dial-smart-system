import React, { createContext, useContext, useEffect, ReactNode } from 'react';
import { useAIErrorHandler, setupGlobalErrorHandlers, ErrorRecord, AIErrorSettings } from '@/hooks/useAIErrorHandler';

interface AIErrorContextType {
  errors: ErrorRecord[];
  settings: AIErrorSettings;
  updateSettings: (settings: Partial<AIErrorSettings>) => void;
  captureError: (error: Error | string, type?: ErrorRecord['type'], context?: Record<string, unknown>) => Promise<string | null>;
  analyzeError: (errorId: string) => Promise<string | null>;
  executeFixFromSuggestion: (errorId: string) => Promise<boolean>;
  clearError: (errorId: string) => void;
  clearAllErrors: () => void;
  retryError: (errorId: string) => Promise<void>;
  isProcessing: boolean;
}

const AIErrorContext = createContext<AIErrorContextType | null>(null);

export const useAIErrors = () => {
  const context = useContext(AIErrorContext);
  if (!context) {
    throw new Error('useAIErrors must be used within an AIErrorProvider');
  }
  return context;
};

interface AIErrorProviderProps {
  children: ReactNode;
}

export const AIErrorProvider: React.FC<AIErrorProviderProps> = ({ children }) => {
  const errorHandler = useAIErrorHandler();

  // Setup global error handlers on mount
  useEffect(() => {
    const cleanup = setupGlobalErrorHandlers(errorHandler.captureError);
    return cleanup;
  }, [errorHandler.captureError]);

  return (
    <AIErrorContext.Provider value={errorHandler}>
      {children}
    </AIErrorContext.Provider>
  );
};
