import { useState, useCallback, useEffect, useRef } from 'react';
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
  autoFixMode: boolean;
  maxRetries: number;
  logErrors: boolean;
}

const DEFAULT_SETTINGS: AIErrorSettings = {
  enabled: true,
  autoFixMode: true,
  maxRetries: 3,
  logErrors: true,
};

// Patterns to ignore (Supabase auth errors, React warnings, etc.)
const IGNORED_ERROR_PATTERNS = [
  'Failed to fetch',
  '_getUser',
  '_useSession',
  'SupabaseAuthClient',
  'AuthApiError',
  'AuthSessionMissingError',
  'TypeError: Load failed',
  'NetworkError',
  'net::ERR_',
  // React warnings that aren't actionable
  'Invalid prop',
  'data-lov-id',
  'React.Fragment',
  'validateDOMNesting',
  // Common non-critical warnings
  'ResizeObserver loop',
  'Non-passive event listener',
];

export const useAIErrorHandler = () => {
  const [errors, setErrors] = useState<ErrorRecord[]>([]);
  const [settings, setSettings] = useState<AIErrorSettings>(() => {
    const stored = localStorage.getItem('ai-error-settings');
    return stored ? JSON.parse(stored) : DEFAULT_SETTINGS;
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();
  
  // Deduplication: track recent errors to prevent loops (30 second window)
  const recentErrorsRef = useRef<Map<string, number>>(new Map());
  const DEDUPE_WINDOW_MS = 30000;

  useEffect(() => {
    localStorage.setItem('ai-error-settings', JSON.stringify(settings));
  }, [settings]);

  const updateSettings = useCallback((newSettings: Partial<AIErrorSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  }, []);

  const shouldIgnoreError = useCallback((message: string): boolean => {
    return IGNORED_ERROR_PATTERNS.some(pattern => message.includes(pattern));
  }, []);

  const captureError = useCallback(async (
    error: Error | string,
    type: ErrorRecord['type'] = 'runtime',
    context?: Record<string, unknown>
  ) => {
    if (!settings.enabled) return null;

    const errorMessage = error instanceof Error ? error.message : error;
    const errorStack = error instanceof Error ? error.stack : undefined;

    // Skip ignored patterns (Supabase auth, network errors, React warnings)
    if (shouldIgnoreError(errorMessage)) {
      return null;
    }

    // Deduplication: skip if we've seen this error recently (within 30 seconds)
    const errorKey = `${type}:${errorMessage.substring(0, 100)}`;
    const now = Date.now();
    const lastSeen = recentErrorsRef.current.get(errorKey);
    
    if (lastSeen && (now - lastSeen) < DEDUPE_WINDOW_MS) {
      return null;
    }
    
    // Record this error with current timestamp
    recentErrorsRef.current.set(errorKey, now);
    
    // Clean up old entries periodically
    if (recentErrorsRef.current.size > 100) {
      const cutoff = now - DEDUPE_WINDOW_MS;
      for (const [key, timestamp] of recentErrorsRef.current.entries()) {
        if (timestamp < cutoff) {
          recentErrorsRef.current.delete(key);
        }
      }
    }

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

    setErrors(prev => [record, ...prev].slice(0, 50));

    // Log to database if enabled AND online (skip auth call to prevent loop)
    if (settings.logErrors && navigator.onLine) {
      try {
        // Don't call supabase.auth.getUser() - it causes the loop!
        // Just log locally for now
        console.log('[AI Error Handler] Captured:', type, errorMessage.substring(0, 100));
      } catch (logError) {
        // Silently fail - don't log errors about logging errors
      }
    }

    // Auto-analyze if enabled
    if (settings.autoFixMode) {
      await analyzeAndFix(record.id);
    }

    return record.id;
  }, [settings, shouldIgnoreError]);

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
  // Handler functions - need references for cleanup
  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    captureError(
      event.reason?.message || 'Unhandled Promise Rejection',
      'runtime',
      { reason: event.reason }
    );
  };

  const handleError = (event: ErrorEvent) => {
    captureError(
      event.error || event.message,
      'runtime',
      { 
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      }
    );
  };

  // Add listeners
  window.addEventListener('unhandledrejection', handleUnhandledRejection);
  window.addEventListener('error', handleError);

  // Console error interception
  const originalConsoleError = console.error;
  console.error = (...args) => {
    originalConsoleError.apply(console, args);
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');
    
    // Don't capture our own logs OR Supabase auth/network errors OR React warnings
    const shouldIgnore = [
      '[AI Error Handler]',
      'Failed to fetch',
      '_getUser',
      '_useSession',
      'SupabaseAuthClient',
      'AuthApiError',
      'AuthSessionMissingError',
      'TypeError: Load failed',
      'NetworkError',
      'net::ERR_',
      // React warnings
      'Invalid prop',
      'data-lov-id',
      'React.Fragment',
      'validateDOMNesting',
      'ResizeObserver loop',
      'Non-passive event listener',
    ].some(pattern => message.includes(pattern));
    
    if (!shouldIgnore) {
      captureError(message, 'runtime', { source: 'console.error' });
    }
  };

  // Return cleanup function that removes ALL listeners
  return () => {
    window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    window.removeEventListener('error', handleError);
    console.error = originalConsoleError;
  };
};
