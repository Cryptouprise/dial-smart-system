/**
 * Logging Utilities
 * 
 * Provides structured logging with different severity levels
 * and integrates with monitoring systems.
 */

import { captureMessage, addBreadcrumb } from './sentry';

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

interface LogContext {
  [key: string]: any;
}

/**
 * Logger class for structured logging
 */
class Logger {
  private context: LogContext = {};

  /**
   * Set persistent context for all logs
   */
  setContext(context: LogContext) {
    this.context = { ...this.context, ...context };
  }

  /**
   * Clear context
   */
  clearContext() {
    this.context = {};
  }

  /**
   * Format log message with context
   */
  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const fullContext = { ...this.context, ...context };
    const contextStr = Object.keys(fullContext).length > 0 ? JSON.stringify(fullContext) : '';
    
    return `[${timestamp}] [${level.toUpperCase()}] ${message} ${contextStr}`;
  }

  /**
   * Log debug message
   */
  debug(message: string, context?: LogContext) {
    if (import.meta.env.DEV) {
      console.debug(this.formatMessage(LogLevel.DEBUG, message, context));
    }
    
    addBreadcrumb(message, { level: 'debug', ...context });
  }

  /**
   * Log info message
   */
  info(message: string, context?: LogContext) {
    console.info(this.formatMessage(LogLevel.INFO, message, context));
    addBreadcrumb(message, { level: 'info', ...context });
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: LogContext) {
    console.warn(this.formatMessage(LogLevel.WARN, message, context));
    addBreadcrumb(message, { level: 'warning', ...context });
    
    // Send warnings to Sentry in production
    if (import.meta.env.PROD) {
      captureMessage(message, 'warning');
    }
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error, context?: LogContext) {
    console.error(this.formatMessage(LogLevel.ERROR, message, context), error);
    addBreadcrumb(message, { level: 'error', error: error?.message, ...context });
    
    // Always send errors to Sentry
    if (error) {
      captureMessage(`${message}: ${error.message}`, 'error');
    } else {
      captureMessage(message, 'error');
    }
  }

  /**
   * Log user action for debugging
   */
  logUserAction(action: string, details?: LogContext) {
    this.info(`User Action: ${action}`, details);
  }

  /**
   * Log API call
   */
  logAPICall(method: string, endpoint: string, status: number, duration?: number) {
    const context: LogContext = {
      method,
      endpoint,
      status,
      duration: duration ? `${duration}ms` : undefined,
    };

    if (status >= 400) {
      this.warn(`API Error: ${method} ${endpoint}`, context);
    } else {
      this.debug(`API Call: ${method} ${endpoint}`, context);
    }
  }

  /**
   * Log database query
   */
  logDBQuery(table: string, operation: string, duration?: number) {
    this.debug(`DB Query: ${operation} on ${table}`, {
      table,
      operation,
      duration: duration ? `${duration}ms` : undefined,
    });
  }

  /**
   * Log authentication event
   */
  logAuth(event: 'login' | 'logout' | 'signup' | 'failed', userId?: string) {
    this.info(`Auth Event: ${event}`, { event, userId });
  }

  /**
   * Log navigation event
   */
  logNavigation(from: string, to: string) {
    this.debug(`Navigation: ${from} -> ${to}`, { from, to });
  }

  /**
   * Log feature usage
   */
  logFeatureUsage(feature: string, action: string) {
    this.info(`Feature Usage: ${feature} - ${action}`, { feature, action });
  }
}

// Export singleton instance
export const logger = new Logger();

/**
 * Create a logger with specific context
 */
export const createLogger = (context: LogContext): Logger => {
  const contextLogger = new Logger();
  contextLogger.setContext(context);
  return contextLogger;
};
