import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ErrorRecord {
  id: string;
  timestamp: Date;
  type: 'ui' | 'api' | 'runtime' | 'network' | 'configuration';
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  status: 'pending' | 'analyzing' | 'suggested' | 'fixing' | 'fixed' | 'failed' | 'needs_manual';
  suggestion?: string;
  autoFixAttempted?: boolean;
  retryCount: number;
  actualChange?: boolean;
  fixDetails?: Record<string, unknown>;
  manualSteps?: string; // New: Clear steps for manual resolution
  retryable?: boolean; // New: Whether this error can be retried
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

// Patterns to ignore (Supabase auth errors, React warnings, Guardian's own errors, etc.)
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
  // CRITICAL: Prevent Guardian from capturing its own errors
  '[🛡️ Guardian]',
  '[AI Error Handler]',
  'Error in Guardian tab',
  'AIErrorPanel',
  'GuardianStatusWidget',
  'useAIErrorHandler',
  'ai-error-analyzer',
  // Prevent catching React setState warnings from Guardian UI
  'Cannot update a component',
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
  
  // NEW: In-flight lock to prevent concurrent processing of same error
  const inFlightRef = useRef<Set<string>>(new Set());
  
  // NEW: Retry timers to prevent stacking multiple timeouts
  const retryTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    localStorage.setItem('ai-error-settings', JSON.stringify(settings));
  }, [settings]);

  const updateSettings = useCallback((newSettings: Partial<AIErrorSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  }, []);

  const shouldIgnoreError = useCallback((message: string): boolean => {
    return IGNORED_ERROR_PATTERNS.some(pattern => message.includes(pattern));
  }, []);

  // NEW: Normalize error keys by stripping volatile parts (timestamps, query params)
  const normalizeErrorKey = useCallback((type: string, message: string): string => {
    // Remove timestamps, query params like ?t=123, and line numbers that change
    const normalized = message
      .replace(/\?t=\d+/g, '') // Remove Vite HMR timestamps
      .replace(/:\d+:\d+/g, '') // Remove line:column numbers
      .replace(/\d{13,}/g, '') // Remove epoch timestamps
      .substring(0, 100);
    return `${type}:${normalized}`;
  }, []);

  const captureError = useCallback(async (
    error: Error | string,
    type: ErrorRecord['type'] = 'runtime',
    context?: Record<string, unknown>
  ) => {
    if (!settings.enabled) return null;

    const errorMessage = error instanceof Error ? error.message : error;
    const errorStack = error instanceof Error ? error.stack : undefined;

    // Skip ignored patterns (including Guardian's own errors)
    if (shouldIgnoreError(errorMessage)) {
      return null;
    }

    // NEW: Use normalized error key for better deduplication
    const errorKey = normalizeErrorKey(type, errorMessage);
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
      retryable: true, // Default to retryable until backend says otherwise
    };

    setErrors(prev => [record, ...prev].slice(0, 50));

    // Log to console (not database to prevent loops)
    if (settings.logErrors) {
      console.log('[🛡️ Guardian] Captured:', type, errorMessage.substring(0, 100));
    }

    // Show toast when auto-fix activates
    if (settings.autoFixMode) {
      toast({
        title: "🛡️ Guardian detected an issue",
        description: "Investigating and attempting to fix...",
      });
      await analyzeAndFix(record.id);
    }

    return record.id;
  }, [settings, shouldIgnoreError, normalizeErrorKey, toast]);

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
      console.error('[🛡️ Guardian] Error analysis failed:', err);
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

      // NEW: Check retryable flag from backend
      const isRetryable = data?.retryable !== false;

      if (data?.success) {
        setErrors(prev => prev.map(e => 
          e.id === errorId ? { 
            ...e, 
            status: 'fixed', 
            autoFixAttempted: true,
            actualChange: data.actualChange || false,
            fixDetails: data.details,
            retryable: isRetryable
          } : e
        ));

        toast({
          title: data.actualChange ? "🛡️ Guardian fixed the issue" : "🛡️ Guardian analyzed the issue",
          description: data.message || "The error has been processed",
        });

        return true;
      } else {
        // NEW: Check if this is a non-retryable situation
        if (!isRetryable) {
          // Don't retry - mark as needs_manual
          setErrors(prev => prev.map(e => 
            e.id === errorId ? { 
              ...e, 
              status: 'needs_manual', 
              autoFixAttempted: true,
              retryable: false,
              manualSteps: data.details || data.message
            } : e
          ));

          toast({
            title: "🛡️ Manual action required",
            description: "Guardian has provided steps for you to follow",
          });

          return false;
        }

        throw new Error(data?.message || 'Fix execution failed');
      }
    } catch (err) {
      console.error('[🛡️ Guardian] Fix execution failed:', err);
      
      // NEW: Use functional update to get accurate retry count
      setErrors(prev => {
        return prev.map(e => {
          if (e.id !== errorId) return e;
          
          const nextRetryCount = e.retryCount + 1;
          const shouldRetry = nextRetryCount < settings.maxRetries && e.retryable !== false;
          
          if (shouldRetry) {
            // Schedule retry with exponential backoff (but only if not already scheduled)
            if (!retryTimersRef.current.has(errorId)) {
              const backoffMs = Math.pow(2, nextRetryCount) * 1000;
              const timer = setTimeout(() => {
                retryTimersRef.current.delete(errorId);
                analyzeAndFix(errorId);
              }, backoffMs);
              retryTimersRef.current.set(errorId, timer);
            }
            
            return { 
              ...e, 
              retryCount: nextRetryCount, 
              status: 'pending' as const 
            };
          } else {
            // Max retries reached or non-retryable
            return { 
              ...e, 
              status: 'failed' as const, 
              autoFixAttempted: true 
            };
          }
        });
      });

      // Show toast only once on final failure
      const currentError = errors.find(e => e.id === errorId);
      if (currentError && currentError.retryCount >= settings.maxRetries - 1) {
        toast({
          title: "🛡️ Guardian needs help",
          description: `Auto-fix failed after ${settings.maxRetries} attempts. Manual intervention may be required.`,
          variant: "destructive",
        });
      }

      return false;
    }
  }, [errors, settings.maxRetries, toast]);

  const analyzeAndFix = useCallback(async (errorId: string) => {
    // NEW: Prevent concurrent processing of same error
    if (inFlightRef.current.has(errorId)) {
      console.log('[🛡️ Guardian] Already processing error:', errorId);
      return;
    }

    inFlightRef.current.add(errorId);
    setIsProcessing(true);
    
    try {
      const suggestion = await analyzeError(errorId);
      if (suggestion && settings.autoFixMode) {
        await executeFixFromSuggestion(errorId);
      }
    } finally {
      inFlightRef.current.delete(errorId);
      setIsProcessing(false);
    }
  }, [analyzeError, executeFixFromSuggestion, settings.autoFixMode]);

  const clearError = useCallback((errorId: string) => {
    // Clear any pending retry timer
    const timer = retryTimersRef.current.get(errorId);
    if (timer) {
      clearTimeout(timer);
      retryTimersRef.current.delete(errorId);
    }
    setErrors(prev => prev.filter(e => e.id !== errorId));
  }, []);

  const clearAllErrors = useCallback(() => {
    // Clear all pending retry timers
    retryTimersRef.current.forEach(timer => clearTimeout(timer));
    retryTimersRef.current.clear();
    inFlightRef.current.clear();
    setErrors([]);
  }, []);

  const retryError = useCallback(async (errorId: string) => {
    const error = errors.find(e => e.id === errorId);
    if (!error) return;

    // Clear any existing timer
    const timer = retryTimersRef.current.get(errorId);
    if (timer) {
      clearTimeout(timer);
      retryTimersRef.current.delete(errorId);
    }

    setErrors(prev => prev.map(e => 
      e.id === errorId ? { ...e, status: 'pending', retryCount: 0, retryable: true } : e
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
    const message = event.reason?.message || 'Unhandled Promise Rejection';
    // Skip Guardian-related errors
    if (message.includes('Guardian') || message.includes('ai-error') || message.includes('AIError')) {
      return;
    }
    captureError(message, 'runtime', { reason: event.reason });
  };

  const handleError = (event: ErrorEvent) => {
    const message = event.error?.message || event.message || '';
    // Skip Guardian-related errors
    if (message.includes('Guardian') || message.includes('ai-error') || message.includes('AIError')) {
      return;
    }
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

  // Console error interception with BETTER handling
  const originalConsoleError = console.error;
  console.error = (...args) => {
    originalConsoleError.apply(console, args);
    
    // NEW: Build message properly - handle Error objects specially
    const messageParts: string[] = [];
    for (const arg of args) {
      if (arg instanceof Error) {
        messageParts.push(`${arg.message} ${arg.stack || ''}`);
      } else if (typeof arg === 'object' && arg !== null) {
        try {
          messageParts.push(JSON.stringify(arg));
        } catch {
          messageParts.push('[Object]');
        }
      } else {
        messageParts.push(String(arg));
      }
    }
    const message = messageParts.join(' ');
    
    // Don't capture our own logs OR Guardian-related errors OR known noise
    const shouldIgnore = [
      '[🛡️ Guardian]',
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
      // CRITICAL: Guardian tab and component errors
      'Error in Guardian tab',
      'Error in AI Errors tab',
      'AIErrorPanel',
      'GuardianStatusWidget',
      'useAIErrorHandler',
      'ai-error-analyzer',
      'TabErrorBoundary',
      // React setState warnings (often benign in dev)
      'Cannot update a component',
      'Cannot update during an existing state transition',
    ].some(pattern => message.includes(pattern));
    
    if (!shouldIgnore && message.length > 0) {
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
