/**
 * Centralized error handling utilities
 * Provides consistent error handling, logging, and user notifications
 */

import { toast } from '@/components/ui/use-toast';

export interface ErrorContext {
  component?: string;
  action?: string;
  metadata?: Record<string, any>;
}

/**
 * Log error to console with context
 */
export const logError = (error: unknown, context?: ErrorContext): void => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  console.error('[Error]', {
    message: errorMessage,
    stack: errorStack,
    context,
    timestamp: new Date().toISOString(),
  });

  // TODO: Send to external error tracking service (Sentry, LogRocket, etc.)
  // Example: Sentry.captureException(error, { contexts: { custom: context } });
};

/**
 * Show user-friendly error toast notification
 */
export const showErrorToast = (
  title: string = 'Something went wrong',
  description?: string
): void => {
  toast({
    title,
    description: description || 'Please try again or contact support if the issue persists.',
    variant: 'destructive',
  });
};

/**
 * Handle async errors with automatic logging and user notification
 */
export const handleAsyncError = async <T>(
  promise: Promise<T>,
  context?: ErrorContext,
  userMessage?: string
): Promise<T | null> => {
  try {
    return await promise;
  } catch (error) {
    logError(error, context);
    showErrorToast(
      userMessage || 'Operation failed',
      error instanceof Error ? error.message : undefined
    );
    return null;
  }
};

/**
 * Wrapper for async functions with error handling
 */
export const withErrorHandling = <TArgs extends any[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  context?: ErrorContext,
  userMessage?: string
) => {
  return async (...args: TArgs): Promise<TReturn | null> => {
    return handleAsyncError(fn(...args), context, userMessage);
  };
};

/**
 * Safe JSON parse with error handling
 */
export const safeJsonParse = <T = any>(
  json: string,
  defaultValue: T
): T => {
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    logError(error, { action: 'JSON parse', metadata: { json } });
    return defaultValue;
  }
};

/**
 * Safe localStorage operations
 */
export const safeLocalStorage = {
  getItem: (key: string, defaultValue: string = ''): string => {
    try {
      return localStorage.getItem(key) || defaultValue;
    } catch (error) {
      logError(error, { action: 'localStorage.getItem', metadata: { key } });
      return defaultValue;
    }
  },

  setItem: (key: string, value: string): boolean => {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      logError(error, { action: 'localStorage.setItem', metadata: { key } });
      return false;
    }
  },

  removeItem: (key: string): boolean => {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      logError(error, { action: 'localStorage.removeItem', metadata: { key } });
      return false;
    }
  },
};

/**
 * Retry failed async operations with exponential backoff
 */
export const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    onRetry?: (attempt: number, error: unknown) => void;
  } = {}
): Promise<T> => {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    onRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
        const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);
        onRetry?.(attempt + 1, error);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
};

/**
 * Create an error boundary compatible error handler
 */
export const createErrorHandler = (context?: ErrorContext) => {
  return (error: Error, errorInfo: React.ErrorInfo) => {
    logError(error, {
      ...context,
      metadata: {
        ...context?.metadata,
        componentStack: errorInfo.componentStack,
      },
    });
  };
};
