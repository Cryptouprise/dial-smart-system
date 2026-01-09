/**
 * Sentry Configuration for Production Monitoring
 * 
 * This module sets up error tracking and performance monitoring for the Dial Smart System.
 * It captures errors, tracks performance, and provides insights into production issues.
 */

import * as Sentry from '@sentry/react';

/**
 * Initialize Sentry for error tracking and performance monitoring
 * 
 * Environment Variables Required:
 * - VITE_SENTRY_DSN: Your Sentry project DSN
 * - VITE_ENVIRONMENT: Environment name (production, staging, development)
 * - VITE_APP_VERSION: Application version for release tracking
 */
export const initSentry = () => {
  const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
  const environment = import.meta.env.VITE_ENVIRONMENT || 'development';
  const release = import.meta.env.VITE_APP_VERSION || 'unknown';

  // Only initialize Sentry if DSN is provided
  if (!sentryDsn) {
    console.log('[Sentry] DSN not configured - monitoring disabled');
    return;
  }

  Sentry.init({
    dsn: sentryDsn,
    environment,
    release: `dial-smart-system@${release}`,

    // Performance Monitoring
    integrations: [
      // Browser tracing for performance monitoring
      Sentry.browserTracingIntegration(),
      // Replay sessions for debugging
      Sentry.replayIntegration({
        maskAllText: true, // Mask sensitive data
        blockAllMedia: true, // Block media for privacy
      }),
      // Breadcrumbs for user actions
      Sentry.breadcrumbsIntegration({
        console: true, // Capture console logs
        dom: true, // Capture DOM events
        fetch: true, // Capture fetch requests
        history: true, // Capture navigation
        xhr: true, // Capture XHR requests
      }),
    ],

    // Performance Monitoring Configuration
    tracesSampleRate: environment === 'production' ? 0.1 : 1.0, // 10% in prod, 100% in dev
    tracePropagationTargets: ['localhost', /^https:\/\/[^/]*\.supabase\.co/],

    // Session Replay Configuration
    replaysSessionSampleRate: environment === 'production' ? 0.1 : 1.0, // 10% of sessions
    replaysOnErrorSampleRate: 1.0, // 100% of sessions with errors

    // Error Filtering
    beforeSend(event, hint) {
      // Filter out non-critical errors
      const error = hint.originalException;
      
      if (error instanceof Error) {
        // Ignore network errors that are expected
        if (error.message.includes('Failed to fetch') && error.message.includes('aborted')) {
          return null;
        }
        
        // Ignore cancelled requests
        if (error.message.includes('AbortError')) {
          return null;
        }
      }

      return event;
    },

    // Additional Configuration
    ignoreErrors: [
      // Browser extensions
      'top.GLOBALS',
      'chrome-extension://',
      'moz-extension://',
      // Network errors
      'NetworkError',
      'Network request failed',
      // Common non-critical errors
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
    ],
  });

  console.log(`[Sentry] Initialized for ${environment} environment`);
};

/**
 * Set user context for error tracking
 */
export const setSentryUser = (user: { id: string; email?: string; username?: string }) => {
  Sentry.setUser({
    id: user.id,
    email: user.email,
    username: user.username,
  });
};

/**
 * Clear user context (on logout)
 */
export const clearSentryUser = () => {
  Sentry.setUser(null);
};

/**
 * Add custom context to errors
 */
export const setSentryContext = (context: string, data: Record<string, any>) => {
  Sentry.setContext(context, data);
};

/**
 * Capture a custom error
 */
export const captureError = (error: Error, context?: Record<string, any>) => {
  if (context) {
    Sentry.withScope((scope) => {
      Object.entries(context).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
};

/**
 * Capture a custom message
 */
export const captureMessage = (message: string, level: 'info' | 'warning' | 'error' = 'info') => {
  Sentry.captureMessage(message, level);
};

/**
 * Add breadcrumb for debugging
 */
export const addBreadcrumb = (message: string, data?: Record<string, any>) => {
  Sentry.addBreadcrumb({
    message,
    data,
    level: 'info',
    timestamp: Date.now(),
  });
};

/**
 * Export Sentry for direct access when needed
 */
export { Sentry };
