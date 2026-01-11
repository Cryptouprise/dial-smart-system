import { supabase } from '@/integrations/supabase/client';

export interface EdgeFunctionErrorReport {
  functionName: string;
  error: Error | string;
  context?: Record<string, unknown>;
  requestBody?: Record<string, unknown>;
  responseStatus?: number;
}

export interface DatabaseErrorReport {
  tableName: string;
  operation: 'select' | 'insert' | 'update' | 'delete' | 'rpc';
  error: string;
  query?: string;
}

export interface ProviderErrorReport {
  provider: 'twilio' | 'telnyx' | 'retell';
  error: Error | string;
  endpoint?: string;
  context?: Record<string, unknown>;
}

/**
 * Report edge function errors to Guardian via ai-error-analyzer
 * This allows backend errors to surface in the Guardian dashboard
 */
export async function reportEdgeFunctionError(
  report: EdgeFunctionErrorReport
): Promise<boolean> {
  try {
    const errorMessage = typeof report.error === 'string' 
      ? report.error 
      : report.error.message;
    
    const errorStack = report.error instanceof Error 
      ? report.error.stack 
      : undefined;

    const { error } = await supabase.functions.invoke('ai-error-analyzer', {
      body: {
        action: 'log_backend_error',
        error: {
          type: 'edge_function',
          message: errorMessage,
          stack: errorStack,
          source: 'edge_function',
          functionName: report.functionName,
          context: {
            ...report.context,
            requestBody: sanitizeRequestBody(report.requestBody),
            responseStatus: report.responseStatus,
          },
        },
      },
    });

    if (error) {
      // Don't throw - just log. We don't want Guardian reporting to crash the app
      console.warn('[Guardian Reporter] Failed to report edge function error:', error);
      return false;
    }

    console.log('[Guardian Reporter] Edge function error reported:', report.functionName);
    return true;
  } catch (err) {
    // Silent fail - Guardian shouldn't cause additional errors
    console.warn('[Guardian Reporter] Error reporting edge function error:', err);
    return false;
  }
}

/**
 * Report database query errors to Guardian
 */
export async function reportDatabaseError(
  report: DatabaseErrorReport
): Promise<boolean> {
  try {
    const { error } = await supabase.functions.invoke('ai-error-analyzer', {
      body: {
        action: 'log_backend_error',
        error: {
          type: 'database',
          message: `DB Error [${report.tableName}:${report.operation}]: ${report.error}`,
          source: 'client',
          context: {
            table: report.tableName,
            operation: report.operation,
            query: report.query?.substring(0, 500),
          },
        },
      },
    });

    if (error) {
      console.warn('[Guardian Reporter] Failed to report database error:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.warn('[Guardian Reporter] Error reporting database error:', err);
    return false;
  }
}

/**
 * Report telephony provider errors to Guardian
 */
export async function reportProviderError(
  report: ProviderErrorReport
): Promise<boolean> {
  try {
    const errorMessage = typeof report.error === 'string' 
      ? report.error 
      : report.error.message;

    const { error } = await supabase.functions.invoke('ai-error-analyzer', {
      body: {
        action: 'log_backend_error',
        error: {
          type: 'provider',
          message: `${report.provider.toUpperCase()} Error: ${errorMessage}`,
          source: 'edge_function',
          context: {
            provider: report.provider,
            endpoint: report.endpoint,
            ...report.context,
          },
        },
      },
    });

    if (error) {
      console.warn('[Guardian Reporter] Failed to report provider error:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.warn('[Guardian Reporter] Error reporting provider error:', err);
    return false;
  }
}

/**
 * Sanitize request body to remove sensitive data before reporting
 */
function sanitizeRequestBody(body?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!body) return undefined;

  const sensitiveKeys = [
    'password', 'token', 'secret', 'key', 'auth', 'credential',
    'api_key', 'apiKey', 'access_token', 'refresh_token',
  ];

  const sanitized = { ...body };

  for (const key of Object.keys(sanitized)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(s => lowerKey.includes(s))) {
      sanitized[key] = '[REDACTED]';
    }
  }

  return sanitized;
}

/**
 * Create a wrapped fetch that reports errors to Guardian
 * This can be used to wrap the global fetch for automatic error tracking
 */
export function createGuardianFetchWrapper(
  originalFetch: typeof fetch
): typeof fetch {
  return async function guardianFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    
    try {
      const response = await originalFetch(input, init);

      // Report server errors (500+) but don't block the response
      if (!response.ok && response.status >= 500) {
        // Fire and forget - don't await
        reportEdgeFunctionError({
          functionName: extractFunctionName(url),
          error: `HTTP ${response.status}: ${response.statusText}`,
          context: { url },
          responseStatus: response.status,
        }).catch(() => {}); // Swallow any errors
      }

      return response;
    } catch (error) {
      // Network failure - report to Guardian
      reportEdgeFunctionError({
        functionName: extractFunctionName(url),
        error: error instanceof Error ? error : String(error),
        context: { 
          url,
          errorType: 'network_failure',
        },
      }).catch(() => {}); // Swallow any errors

      throw error; // Re-throw so the original caller gets the error
    }
  };
}

/**
 * Extract function name from URL for edge function calls
 */
function extractFunctionName(url: string): string {
  // Match Supabase edge function URLs
  const match = url.match(/\/functions\/v1\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  
  // For other URLs, use the last path segment
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    return pathParts[pathParts.length - 1] || 'unknown';
  } catch {
    return 'unknown';
  }
}
