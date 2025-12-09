import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ErrorRecord {
  id: string;
  timestamp: Date;
  type: 'ui' | 'api' | 'runtime' | 'network';
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  status: 'pending' | 'analyzing' | 'suggested' | 'fixing' | 'fixed' | 'failed';
  suggestion?: string;
  autoFixAttempted?: boolean;
  retryCount: number;
}

export interface AIErrorSettings {
  enabled: boolean;
  autoFixMode: boolean; // true = auto-fix, false = suggest-only
  maxRetries: number;
  logErrors: boolean;
}

const DEFAULT_SETTINGS: AIErrorSettings = {
  enabled: true,
  autoFixMode: false,
  maxRetries: 3,
  logErrors: true,
};

export const useAIErrorHandler = () => {
  const [errors, setErrors] = useState<ErrorRecord[]>([]);
  const [settings, setSettings] = useState<AIErrorSettings>(() => {
    const stored = localStorage.getItem('ai-error-settings');
    return stored ? JSON.parse(stored) : DEFAULT_SETTINGS;
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem('ai-error-settings', JSON.stringify(settings));
  }, [settings]);

  const updateSettings = useCallback((newSettings: Partial<AIErrorSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  }, []);

  const captureError = useCallback(async (
    error: Error | string,
    type: ErrorRecord['type'] = 'runtime',
    context?: Record<string, unknown>
  ) => {
    if (!settings.enabled) return null;

    const errorMessage = error instanceof Error ? error.message : error;
    const errorStack = error instanceof Error ? error.stack : undefined;

    const record: ErrorRecord = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      type,
      message: errorMessage,
      stack: errorStack,
      context,
      status: 'pending',
      retryCount: 0,
    };

    setErrors(prev => [record, ...prev].slice(0, 50)); // Keep last 50 errors

    // Log to database if enabled
    if (settings.logErrors) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // Log to agent_decisions table instead of system_health_logs
          await supabase.from('agent_decisions').insert({
            user_id: user.id,
            decision_type: 'error_captured',
            reasoning: `Captured ${type} error: ${errorMessage.substring(0, 200)}`,
            action_taken: 'Error logged for analysis',
            outcome: JSON.stringify({
              stack: errorStack?.substring(0, 500),
              context,
              error_id: record.id,
            }),
            success: false,
          });
        }
      } catch (logError) {
        console.error('Failed to log error:', logError);
      }
    }

    // Auto-analyze if enabled
    if (settings.autoFixMode) {
      await analyzeAndFix(record.id);
    }

    return record.id;
  }, [settings]);

  const analyzeError = useCallback(async (errorId: string): Promise<string | null> => {
    const error = errors.find(e => e.id === errorId);
    if (!error) return null;

    setErrors(prev => prev.map(e => 
      e.id === errorId ? { ...e, status: 'analyzing' } : e
    ));

    try {
      const { data, error: fnError } = await supabase.functions.invoke('ai-error-analyzer', {
        body: {
          error: {
            type: error.type,
            message: error.message,
            stack: error.stack,
            context: error.context,
          },
          action: 'analyze',
        },
      });

      if (fnError) throw fnError;

      const suggestion = data?.suggestion || 'Unable to generate suggestion';

      setErrors(prev => prev.map(e => 
        e.id === errorId ? { ...e, status: 'suggested', suggestion } : e
      ));

      return suggestion;
    } catch (err) {
      console.error('Error analysis failed:', err);
      setErrors(prev => prev.map(e => 
        e.id === errorId ? { ...e, status: 'failed' } : e
      ));
      return null;
    }
  }, [errors]);

  const executeFixFromSuggestion = useCallback(async (errorId: string): Promise<boolean> => {
    const error = errors.find(e => e.id === errorId);
    if (!error || !error.suggestion) return false;

    setErrors(prev => prev.map(e => 
      e.id === errorId ? { ...e, status: 'fixing' } : e
    ));

    try {
      const { data, error: fnError } = await supabase.functions.invoke('ai-error-analyzer', {
        body: {
          error: {
            type: error.type,
            message: error.message,
            stack: error.stack,
            context: error.context,
          },
          suggestion: error.suggestion,
          action: 'execute',
        },
      });

      if (fnError) throw fnError;

      if (data?.success) {
        setErrors(prev => prev.map(e => 
          e.id === errorId ? { ...e, status: 'fixed', autoFixAttempted: true } : e
        ));

        toast({
          title: "Auto-Fix Applied",
          description: data.message || "The error has been addressed",
        });

        return true;
      } else {
        throw new Error(data?.message || 'Fix execution failed');
      }
    } catch (err) {
      console.error('Fix execution failed:', err);
      
      const currentError = errors.find(e => e.id === errorId);
      if (currentError && currentError.retryCount < settings.maxRetries) {
        setErrors(prev => prev.map(e => 
          e.id === errorId ? { ...e, retryCount: e.retryCount + 1, status: 'pending' } : e
        ));
        
        // Retry with exponential backoff
        setTimeout(() => analyzeAndFix(errorId), Math.pow(2, currentError.retryCount) * 1000);
      } else {
        setErrors(prev => prev.map(e => 
          e.id === errorId ? { ...e, status: 'failed', autoFixAttempted: true } : e
        ));

        toast({
          title: "Auto-Fix Failed",
          description: "Manual intervention may be required",
          variant: "destructive",
        });
      }

      return false;
    }
  }, [errors, settings.maxRetries, toast]);

  const analyzeAndFix = useCallback(async (errorId: string) => {
    setIsProcessing(true);
    try {
      const suggestion = await analyzeError(errorId);
      if (suggestion && settings.autoFixMode) {
        await executeFixFromSuggestion(errorId);
      }
    } finally {
      setIsProcessing(false);
    }
  }, [analyzeError, executeFixFromSuggestion, settings.autoFixMode]);

  const clearError = useCallback((errorId: string) => {
    setErrors(prev => prev.filter(e => e.id !== errorId));
  }, []);

  const clearAllErrors = useCallback(() => {
    setErrors([]);
  }, []);

  const retryError = useCallback(async (errorId: string) => {
    const error = errors.find(e => e.id === errorId);
    if (!error) return;

    setErrors(prev => prev.map(e => 
      e.id === errorId ? { ...e, status: 'pending', retryCount: 0 } : e
    ));

    await analyzeAndFix(errorId);
  }, [errors, analyzeAndFix]);

  return {
    errors,
    settings,
    updateSettings,
    captureError,
    analyzeError,
    executeFixFromSuggestion,
    analyzeAndFix,
    clearError,
    clearAllErrors,
    retryError,
    isProcessing,
  };
};

// Global error capture for unhandled errors
export const setupGlobalErrorHandlers = (captureError: ReturnType<typeof useAIErrorHandler>['captureError']) => {
  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    captureError(
      event.reason?.message || 'Unhandled Promise Rejection',
      'runtime',
      { reason: event.reason }
    );
  });

  // Global errors
  window.addEventListener('error', (event) => {
    captureError(
      event.error || event.message,
      'runtime',
      { 
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      }
    );
  });

  // Console error interception
  const originalConsoleError = console.error;
  console.error = (...args) => {
    originalConsoleError.apply(console, args);
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');
    
    // Don't capture our own logs
    if (!message.includes('[AI Error Handler]')) {
      captureError(message, 'runtime', { source: 'console.error' });
    }
  };

  return () => {
    console.error = originalConsoleError;
  };
};
