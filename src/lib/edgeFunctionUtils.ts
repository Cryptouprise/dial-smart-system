import { FunctionsHttpError, SupabaseClient } from '@supabase/supabase-js';

/**
 * Extract a user-friendly error message from edge function errors
 * This handles the common case where Supabase wraps the actual error in a generic message
 */
export async function extractEdgeFunctionError(error: unknown): Promise<string> {
  // If it's a FunctionsHttpError, try to get the actual error from the response
  if (error instanceof FunctionsHttpError) {
    try {
      const errorData = await error.context?.json?.();
      if (errorData?.error) {
        return errorData.error;
      }
      if (errorData?.message) {
        return errorData.message;
      }
    } catch (parseError) {
      // If we can't parse the response, fall through - this is expected for some error types
      console.error('Unable to parse edge function error response:', parseError);
    }
  }
  
  // Check for common error patterns
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message: string }).message;
    // Skip generic Supabase error messages
    if (message.includes('non-2xx status code')) {
      return 'Request failed. Please check your configuration and try again.';
    }
    return message;
  }
  
  return 'An unexpected error occurred. Please try again.';
}

/**
 * Safely invoke an edge function with proper error handling
 * Returns { data, error } where error is a user-friendly string or null
 */
export async function safeEdgeFunctionInvoke<T = unknown>(
  supabase: SupabaseClient,
  functionName: string,
  body: Record<string, unknown>
): Promise<{ data: T | null; error: string | null }> {
  try {
    const { data, error } = await supabase.functions.invoke(functionName, { body });
    
    if (error) {
      const errorMessage = await extractEdgeFunctionError(error);
      return { data: null, error: errorMessage };
    }
    
    // Check if the response itself indicates an error
    if (data && typeof data === 'object' && 'error' in data) {
      return { data: null, error: String(data.error) };
    }
    
    return { data: data as T, error: null };
  } catch (err: unknown) {
    const errorMessage = await extractEdgeFunctionError(err);
    return { data: null, error: errorMessage };
  }
}

/**
 * Validate that required parameters are present before making an API call
 */
export function validateRequiredParams(
  params: Record<string, unknown>,
  required: string[]
): string | null {
  for (const param of required) {
    if (!params[param]) {
      return `Missing required parameter: ${param.replace(/_/g, ' ')}`;
    }
  }
  return null;
}
